import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
    is_invoice: {
      type: SchemaType.BOOLEAN,
      description: 'True if the document is an invoice, receipt, work order, or service paperwork showing work done on a home (e.g. termite inspection, HVAC service, plumbing repair, lawn care, etc.).',
    },
    document_title: {
      type: SchemaType.STRING,
      description: 'A clean, human-readable title for this document, e.g. "Modern Mechanical — Termite Inspection (Apr 2026)". Empty string if unsure.',
    },
    task_title: {
      type: SchemaType.STRING,
      description: 'A short title describing the work done, e.g. "Termite Inspection", "HVAC Tune-up", "Gutter Cleaning". Empty string if unclear.',
    },
    vendor: {
      type: SchemaType.STRING,
      description: 'Company / contractor name, e.g. "Modern Mechanical". Empty string if unknown.',
    },
    completed_date: {
      type: SchemaType.STRING,
      description: 'Date the work was completed in YYYY-MM-DD format. Use the service date if listed, otherwise the invoice/issue date. Empty string if no date is present.',
    },
    cost: {
      type: SchemaType.NUMBER,
      description: 'Total amount paid or owed in dollars (number, no currency symbol). 0 if no amount is shown.',
    },
    category_hint: {
      type: SchemaType.STRING,
      description: 'Best-matching task category from this exact list: Interior, Exterior, HVAC, Plumbing, Electrical, Yard, Appliances, Cleaning, Pest Control, HOA / Bills, Projects. Empty string if none clearly fit.',
    },
    recurrence: {
      type: SchemaType.STRING,
      description: 'How often this service recurs. One of: one_time, weekly, monthly, quarterly, yearly. Use yearly for things that are typically annual (termite inspection, HVAC tune-up, chimney sweep, roof inspection). Use one_time for one-off repairs or installations. Default to one_time when uncertain.',
    },
    notes: {
      type: SchemaType.STRING,
      description: 'Optional 1-sentence summary of what was done. Empty string if nothing notable.',
    },
  },
  required: [
    'is_invoice',
    'document_title',
    'task_title',
    'vendor',
    'completed_date',
    'cost',
    'category_hint',
    'recurrence',
    'notes',
  ],
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Server is missing GEMINI_API_KEY' },
      { status: 500 }
    );
  }

  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: { documentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const documentId = body.documentId;
  if (!documentId) {
    return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('id, home_id, title, file_path, file_name, mime_type')
    .eq('id', documentId)
    .maybeSingle();

  if (docErr || !doc) {
    return NextResponse.json(
      { error: 'Document not found or access denied' },
      { status: 404 }
    );
  }

  const mime = (doc as any).mime_type as string | null;
  if (!mime || !SUPPORTED_MIME.has(mime)) {
    return NextResponse.json(
      { error: 'This file type cannot be analyzed. Upload a PDF or image.' },
      { status: 415 }
    );
  }

  const { data: file, error: dlErr } = await supabase.storage
    .from('documents')
    .download((doc as any).file_path);
  if (dlErr || !file) {
    return NextResponse.json(
      { error: 'Could not read the uploaded file' },
      { status: 500 }
    );
  }

  const arrayBuf = await file.arrayBuffer();
  const sizeMb = arrayBuf.byteLength / (1024 * 1024);
  if (sizeMb > 18) {
    return NextResponse.json(
      { error: 'File is too large to analyze (limit 18 MB).' },
      { status: 413 }
    );
  }
  const base64 = Buffer.from(arrayBuf).toString('base64');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: SCHEMA as any,
      temperature: 0.1,
    },
  });

  const prompt = `You are extracting fields from an invoice or receipt for home services or repairs.
Return strict JSON matching the schema. Use empty strings for unknown text fields and 0 for unknown amounts.
Set is_invoice=false if the document is not an invoice or receipt for home work.
The completed_date must be YYYY-MM-DD; if only a month/year is shown, use the 1st of that month.
Never invent vendors or amounts.`;

  let result;
  try {
    result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mime, data: base64 } },
          ],
        },
      ],
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Model call failed' },
      { status: 502 }
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(result.response.text());
  } catch {
    return NextResponse.json(
      { error: 'Model returned invalid JSON' },
      { status: 502 }
    );
  }

  if (!parsed.is_invoice) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'not_an_invoice',
        message: "This file doesn't look like an invoice or receipt.",
      },
      { status: 200 }
    );
  }

  const cleanStr = (v: unknown) =>
    typeof v === 'string' && v.trim() ? v.trim() : '';
  const cleanNum = (v: unknown) =>
    typeof v === 'number' && isFinite(v) && v > 0 ? v : null;
  const cleanDate = (v: unknown) => {
    const s = cleanStr(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  };

  const allowedRecurrence = new Set([
    'one_time',
    'weekly',
    'monthly',
    'quarterly',
    'yearly',
  ]);
  const rawRec = cleanStr(parsed.recurrence).toLowerCase();
  const recurrence = allowedRecurrence.has(rawRec) ? rawRec : 'one_time';

  return NextResponse.json({
    ok: true,
    document_title: cleanStr(parsed.document_title),
    invoice: {
      task_title: cleanStr(parsed.task_title),
      vendor: cleanStr(parsed.vendor),
      completed_date: cleanDate(parsed.completed_date),
      cost: cleanNum(parsed.cost),
      category_hint: cleanStr(parsed.category_hint),
      recurrence,
      notes: cleanStr(parsed.notes),
    },
    sourceDocumentId: (doc as any).id,
  });
}
