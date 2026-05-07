// One-off cleanup script: re-runs Gemini invoice extraction over
// every document in a home that's linked to a completed task, then
// rewrites the document title (and the linked task / task_history
// title) to the new deterministic format:
//
//   document.title  →  "Vendor — MMM yyyy"
//   task.title      →  "Vendor — Service descriptor"
//
// Run once after deploying the title-format change to clean up
// inconsistent titles from earlier uploads.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=...        \
//   SUPABASE_SERVICE_ROLE_KEY=...       \
//   GEMINI_API_KEY=...                  \
//   HOME_ID=<your-home-uuid>            \
//   node scripts/retitle-invoices.mjs
//
// HOME_ID is the uuid of the row in `homes` you want to clean.
// SUPABASE_SERVICE_ROLE_KEY (Supabase → Settings → API → service_role)
// is required to bypass RLS.
//
// Add --dry-run to see proposed changes without writing.

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const {
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  GEMINI_API_KEY: GEMINI_KEY,
  HOME_ID,
} = process.env;

const DRY_RUN = process.argv.includes('--dry-run');

const missing = Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  GEMINI_API_KEY: GEMINI_KEY,
  HOME_ID,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

const SUPPORTED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    is_invoice: { type: SchemaType.BOOLEAN, description: 'True if this is an invoice/receipt for home work.' },
    task_title: { type: SchemaType.STRING, description: 'Short generic 1-3 word service descriptor (e.g. "Internet Bill", "Pest Treatment"). No month, year, or vendor name.' },
    vendor: { type: SchemaType.STRING, description: 'Company / contractor name.' },
    completed_date: { type: SchemaType.STRING, description: 'Service or invoice date as YYYY-MM-DD.' },
    cost: { type: SchemaType.NUMBER, description: 'Total amount (number, no currency symbol).' },
    recurrence: { type: SchemaType.STRING, description: 'one_time | weekly | bi_monthly | monthly | quarterly | bi_annual | yearly. Utility statements are monthly. Quarterly pest plans are quarterly.' },
  },
  required: ['is_invoice', 'task_title', 'vendor', 'completed_date', 'cost', 'recurrence'],
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const PROMPT = `You are extracting fields from an invoice or receipt for home services.
Return strict JSON matching the schema. Use empty strings for unknown fields, 0 for unknown amounts.
Set is_invoice=false if the document is not an invoice/receipt for home work.
The completed_date must be YYYY-MM-DD; if only a month/year is shown, use the 1st of that month.

Determinism rules:
- task_title is a generic 1-3 word service descriptor. NO month, year, or vendor name. Reuse the same phrasing for repeat services.
- For utility statements (internet/cable, electric, gas, water, sewer, trash) recurrence is "monthly".
- For quarterly pest plans recurrence is "quarterly"; "every 6 months" plans are "bi_annual".`;

async function extract(doc) {
  if (!SUPPORTED_MIME.has(doc.mime_type)) {
    return { skip: 'unsupported mime type' };
  }
  const { data: file, error: dlErr } = await supabase.storage
    .from('documents')
    .download(doc.file_path);
  if (dlErr || !file) return { skip: `download failed: ${dlErr?.message}` };
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > 18 * 1024 * 1024) return { skip: 'file > 18MB' };

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: SCHEMA,
      temperature: 0,
    },
  });
  const res = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { text: PROMPT },
          { inlineData: { mimeType: doc.mime_type, data: buf.toString('base64') } },
        ],
      },
    ],
  });
  const parsed = JSON.parse(res.response.text());
  if (!parsed.is_invoice) return { skip: 'not an invoice' };
  return { parsed };
}

function formatTitles({ vendor, task_title, completed_date }) {
  const v = (vendor || '').trim();
  const t = (task_title || '').trim();
  let docTitle = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(completed_date)) {
    const [y, m] = completed_date.split('-');
    const idx = parseInt(m, 10) - 1;
    const dateLabel = idx >= 0 && idx < 12 ? `${MONTHS[idx]} ${y}` : '';
    if (v && dateLabel) docTitle = `${v} — ${dateLabel}`;
    else if (t && dateLabel) docTitle = `${t} — ${dateLabel}`;
    else if (v) docTitle = v;
    else if (t) docTitle = t;
  } else {
    if (v && t) docTitle = `${v} — ${t}`;
    else docTitle = v || t || '';
  }
  const taskTitle = v && t ? `${v} — ${t}` : t || v || 'Service';
  return { docTitle, taskTitle };
}

async function main() {
  // Find every completed task in this home that points back at a
  // document via source_document_id — those are the invoices.
  const { data: tasks, error: tasksErr } = await supabase
    .from('tasks')
    .select('id, title, source_document_id, completed_at')
    .eq('home_id', HOME_ID)
    .eq('status', 'completed')
    .not('source_document_id', 'is', null);
  if (tasksErr) throw tasksErr;
  if (!tasks?.length) {
    console.log('No invoice-linked completed tasks found in this home.');
    return;
  }

  const docIds = Array.from(new Set(tasks.map((t) => t.source_document_id)));
  const { data: docs, error: docsErr } = await supabase
    .from('documents')
    .select('id, title, file_path, file_name, mime_type')
    .in('id', docIds);
  if (docsErr) throw docsErr;

  console.log(
    `${DRY_RUN ? '[dry-run] ' : ''}Found ${docs.length} invoice document(s) across ${tasks.length} completed task(s).`
  );

  let updated = 0;
  let skipped = 0;
  for (const doc of docs) {
    process.stdout.write(`• ${doc.title.padEnd(40, ' ').slice(0, 40)}  →  `);
    let result;
    try {
      result = await extract(doc);
    } catch (err) {
      console.log(`error: ${err.message}`);
      skipped++;
      continue;
    }
    if (result.skip) {
      console.log(`skip (${result.skip})`);
      skipped++;
      continue;
    }
    const { docTitle, taskTitle } = formatTitles(result.parsed);
    if (!docTitle) {
      console.log('skip (no vendor/title)');
      skipped++;
      continue;
    }
    console.log(`"${docTitle}"`);

    if (DRY_RUN) {
      updated++;
      continue;
    }

    const now = new Date().toISOString();
    const { error: docUpdErr } = await supabase
      .from('documents')
      .update({ title: docTitle, updated_at: now })
      .eq('id', doc.id);
    if (docUpdErr) {
      console.log(`  ! document update failed: ${docUpdErr.message}`);
      skipped++;
      continue;
    }

    const linked = tasks.filter((t) => t.source_document_id === doc.id);
    for (const t of linked) {
      await supabase
        .from('tasks')
        .update({ title: taskTitle, updated_at: now })
        .eq('id', t.id);
      await supabase
        .from('task_history')
        .update({ title: taskTitle })
        .eq('task_id', t.id);
    }
    updated++;
  }

  console.log(
    `\n${DRY_RUN ? '[dry-run] ' : ''}Done. ${updated} retitled, ${skipped} skipped.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
