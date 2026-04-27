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
    is_appliance_manual: {
      type: SchemaType.BOOLEAN,
      description: 'True only if this document is an owner/installation/service manual for a household appliance, system, or piece of equipment.',
    },
    document_title: {
      type: SchemaType.STRING,
      description: 'A clean, human-readable title for this document, e.g. "Whirlpool WRX735SDHZ Refrigerator Owner\'s Manual" or "Trane XR16 Heat Pump Installation Guide". Avoid file extensions and SKU codes alone. Keep under ~80 characters. Empty string if unsure.',
    },
    name: {
      type: SchemaType.STRING,
      description: 'Short product name to use as the appliance title, e.g. "Whirlpool Refrigerator" or "Trane XR16 Heat Pump". Empty string if unknown.',
    },
    manufacturer: {
      type: SchemaType.STRING,
      description: 'Brand / manufacturer name, e.g. "Whirlpool". Empty string if unknown.',
    },
    model_number: {
      type: SchemaType.STRING,
      description: 'Model number exactly as printed. Empty string if unknown.',
    },
    serial_number: {
      type: SchemaType.STRING,
      description: 'Serial number exactly as printed in the document — including on warranty registration pages, rating-plate photos, sticker images, install paperwork, or hand-written entries. Empty string only if no serial number appears anywhere in the document. Do not invent or guess.',
    },
    category: {
      type: SchemaType.STRING,
      description: 'Short category, e.g. "Refrigerator", "Dishwasher", "HVAC", "Water Heater", "Washer", "Dryer", "Microwave". Empty string if unsure.',
    },
    notes: {
      type: SchemaType.STRING,
      description: 'Optional short note (1 sentence) about anything notable, e.g. capacity, fuel type. Empty string if nothing notable.',
    },
  },
  required: [
    'is_appliance_manual',
    'document_title',
    'name',
    'manufacturer',
    'model_number',
    'serial_number',
    'category',
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
      {
        error:
          'This file type cannot be analyzed. Upload a PDF or image of the manual.',
      },
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

  const prompt = `You are extracting appliance details from a household appliance manual or appliance paperwork.
Return strict JSON matching the schema. Use empty strings for unknown text fields.
Set is_appliance_manual=false if the document is not actually an appliance manual or related paperwork.
Look carefully for the serial number anywhere in the document — warranty registration pages, rating-plate photos, install records, stickers, packing slips, hand-written entries. If a serial number is present, return it exactly. If you cannot find one, return an empty string. Never invent or guess.`;

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

  if (!parsed.is_appliance_manual) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'not_a_manual',
        message:
          "This file doesn't look like an appliance manual. You can still add an appliance manually.",
      },
      { status: 200 }
    );
  }

  const clean = (v: unknown) =>
    typeof v === 'string' && v.trim() ? v.trim() : '';

  return NextResponse.json({
    ok: true,
    document_title: clean(parsed.document_title),
    appliance: {
      name: clean(parsed.name) || (doc as any).title || (doc as any).file_name,
      manufacturer: clean(parsed.manufacturer),
      model_number: clean(parsed.model_number),
      serial_number: clean(parsed.serial_number),
      category: clean(parsed.category),
      notes: clean(parsed.notes),
    },
    sourceDocumentId: (doc as any).id,
    sourceDocumentTitle: (doc as any).title,
  });
}
