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

const ALLOWED_CATEGORIES = [
  'Insurance',
  'Deed / Title',
  'Mortgage',
  'Warranty',
  'Invoice',
  'Receipt',
  'Manual',
  'Builder Doc',
  'Inspection',
  'Tax',
  'Permit',
  'Utilities',
  'Other',
];

const SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    category: {
      type: SchemaType.STRING,
      description:
        "Best-fit category. Must be EXACTLY one of: Insurance, Deed / Title, Mortgage, Warranty, Invoice, Receipt, Manual, Builder Doc, Inspection, Tax, Permit, Utilities, Other. Builder Doc covers blueprints, spec sheets, cabinet/tile/flooring drawings, options selections, structural plans, builder warranty packages, etc.",
    },
    title: {
      type: SchemaType.STRING,
      description:
        "Clean, human-readable title for this document, max 80 characters. Avoid extensions and SKU codes alone.",
    },
    searchable_text: {
      type: SchemaType.STRING,
      description:
        "300-1500 characters of plain-text key content from this document for full-text search. Include vendor/company names, dates, amounts, addresses, model numbers, party names, important terms, room or area names, materials, brand names, anything a user might search for. Just space-separated words and short phrases — no markdown, no narrative, no headings.",
    },
  },
  required: ['category', 'title', 'searchable_text'],
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
      { error: 'This file type cannot be analyzed.' },
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

  const prompt = `Classify this homeowner document and produce searchable content.
Pick the single best category from the allowed list. Generate a clean human title.
Return concise space-separated key terms in searchable_text — vendor names, model numbers, dates, addresses, amounts, materials, anything a user would search for.`;

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

  const cleanStr = (v: unknown) =>
    typeof v === 'string' && v.trim() ? v.trim() : '';
  const rawCategory = cleanStr(parsed.category);
  const category = ALLOWED_CATEGORIES.includes(rawCategory) ? rawCategory : 'Other';

  return NextResponse.json({
    ok: true,
    category,
    title: cleanStr(parsed.title),
    searchable_text: cleanStr(parsed.searchable_text),
    sourceDocumentId: (doc as any).id,
  });
}
