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
    is_builder_doc: {
      type: SchemaType.BOOLEAN,
      description: 'True if this looks like builder/closing/construction paperwork that describes the house: spec sheets, floor plans, HVAC/plumbing/roofing scopes, warranty packages, closing disclosures with property data, etc. False otherwise.',
    },
    year_built: { type: SchemaType.NUMBER, description: 'Year of construction. 0 if unknown.' },
    square_footage: { type: SchemaType.NUMBER, description: 'Total heated/conditioned square footage. 0 if unknown.' },
    floors: { type: SchemaType.NUMBER, description: 'Number of stories above ground. 0 if unknown.' },
    roof_type: {
      type: SchemaType.STRING,
      description: "Exact one of: 'asphalt_shingle', 'metal', 'tile', 'slate', 'flat'. Empty string if unknown.",
    },
    roof_installed_year: { type: SchemaType.NUMBER, description: 'Year roof was installed. For new builds use year_built. 0 if unknown.' },
    exterior_type: {
      type: SchemaType.STRING,
      description: "Exact one of: 'vinyl', 'brick', 'stucco', 'wood', 'stone', 'fiber_cement'. Empty string if unknown.",
    },
    hvac_type: {
      type: SchemaType.STRING,
      description: "Exact one of: 'central_air', 'heat_pump', 'window_units', 'mini_split', 'radiant'. Empty string if unknown.",
    },
    hvac_units: { type: SchemaType.NUMBER, description: 'Number of HVAC units / zones. 0 if unknown.' },
    hvac_installed_year: { type: SchemaType.NUMBER, description: 'Year HVAC was installed. For new builds use year_built. 0 if unknown.' },
    water_heater_type: {
      type: SchemaType.STRING,
      description: "Exact one of: 'tank', 'tankless', 'heat_pump', 'solar'. Empty string if unknown.",
    },
    water_heater_installed_year: { type: SchemaType.NUMBER, description: 'Year water heater was installed. For new builds use year_built. 0 if unknown.' },
    plumbing_type: {
      type: SchemaType.STRING,
      description: "Exact one of: 'copper', 'pex', 'pvc', 'galvanized', 'mixed'. Empty string if unknown.",
    },
    dryer_type: {
      type: SchemaType.STRING,
      description: "Exact one of: 'electric', 'gas', 'none'. Empty string if unknown.",
    },
    has_irrigation: { type: SchemaType.STRING, description: "'yes', 'no', or 'unknown'." },
    has_septic: { type: SchemaType.STRING, description: "'yes', 'no', or 'unknown'." },
    has_well_water: { type: SchemaType.STRING, description: "'yes', 'no', or 'unknown'." },
    has_deck: { type: SchemaType.STRING, description: "'yes', 'no', or 'unknown'." },
    has_pool: { type: SchemaType.STRING, description: "'yes', 'no', or 'unknown'." },
    has_garage: { type: SchemaType.STRING, description: "'yes', 'no', or 'unknown'." },
    has_fireplace: { type: SchemaType.STRING, description: "'yes', 'no', or 'unknown'." },
    has_basement: { type: SchemaType.STRING, description: "'yes', 'no', or 'unknown'." },
    has_attic: { type: SchemaType.STRING, description: "'yes', 'no', or 'unknown'." },
    has_crawlspace: { type: SchemaType.STRING, description: "'yes', 'no', or 'unknown'." },
    has_hoa: { type: SchemaType.STRING, description: "'yes', 'no', or 'unknown'." },
  },
  required: [
    'is_builder_doc',
    'year_built',
    'square_footage',
    'floors',
    'roof_type',
    'roof_installed_year',
    'exterior_type',
    'hvac_type',
    'hvac_units',
    'hvac_installed_year',
    'water_heater_type',
    'water_heater_installed_year',
    'plumbing_type',
    'dryer_type',
    'has_irrigation',
    'has_septic',
    'has_well_water',
    'has_deck',
    'has_pool',
    'has_garage',
    'has_fireplace',
    'has_basement',
    'has_attic',
    'has_crawlspace',
    'has_hoa',
  ],
};

const ROOF_TYPES = new Set(['asphalt_shingle', 'metal', 'tile', 'slate', 'flat']);
const EXTERIOR_TYPES = new Set(['vinyl', 'brick', 'stucco', 'wood', 'stone', 'fiber_cement']);
const HVAC_TYPES = new Set(['central_air', 'heat_pump', 'window_units', 'mini_split', 'radiant']);
const WATER_HEATER_TYPES = new Set(['tank', 'tankless', 'heat_pump', 'solar']);
const PLUMBING_TYPES = new Set(['copper', 'pex', 'pvc', 'galvanized', 'mixed']);
const DRYER_TYPES = new Set(['electric', 'gas', 'none']);

const cleanEnum = (raw: unknown, allowed: Set<string>) => {
  if (typeof raw !== 'string') return '';
  const v = raw.trim().toLowerCase();
  return allowed.has(v) ? v : '';
};

const cleanNum = (raw: unknown) => {
  if (typeof raw !== 'number' || !isFinite(raw) || raw <= 0) return 0;
  return Math.round(raw);
};

const cleanBool = (raw: unknown): boolean | null => {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (v === 'yes' || v === 'true') return true;
  if (v === 'no' || v === 'false') return false;
  return null;
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

  const prompt = `You are extracting house facts from builder, closing, or construction paperwork to populate a homeowner profile.
Return strict JSON matching the schema. For unknown text fields use empty string. For unknown numbers use 0. For unknown booleans use 'unknown'.
Only include facts that are actually stated or implied by the document. Do not guess.
For a brand-new build, treat year_built as the year roof, HVAC, and water heater were installed unless the document says otherwise.`;

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

  if (!parsed.is_builder_doc) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'not_a_builder_doc',
        message: "This file doesn't look like builder paperwork.",
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    profile: {
      year_built: cleanNum(parsed.year_built),
      square_footage: cleanNum(parsed.square_footage),
      floors: cleanNum(parsed.floors),
      roof_type: cleanEnum(parsed.roof_type, ROOF_TYPES),
      roof_installed_year: cleanNum(parsed.roof_installed_year),
      exterior_type: cleanEnum(parsed.exterior_type, EXTERIOR_TYPES),
      hvac_type: cleanEnum(parsed.hvac_type, HVAC_TYPES),
      hvac_units: cleanNum(parsed.hvac_units),
      hvac_installed_year: cleanNum(parsed.hvac_installed_year),
      water_heater_type: cleanEnum(parsed.water_heater_type, WATER_HEATER_TYPES),
      water_heater_installed_year: cleanNum(parsed.water_heater_installed_year),
      plumbing_type: cleanEnum(parsed.plumbing_type, PLUMBING_TYPES),
      dryer_type: cleanEnum(parsed.dryer_type, DRYER_TYPES),
      has_irrigation: cleanBool(parsed.has_irrigation),
      has_septic: cleanBool(parsed.has_septic),
      has_well_water: cleanBool(parsed.has_well_water),
      has_deck: cleanBool(parsed.has_deck),
      has_pool: cleanBool(parsed.has_pool),
      has_garage: cleanBool(parsed.has_garage),
      has_fireplace: cleanBool(parsed.has_fireplace),
      has_basement: cleanBool(parsed.has_basement),
      has_attic: cleanBool(parsed.has_attic),
      has_crawlspace: cleanBool(parsed.has_crawlspace),
      has_hoa: cleanBool(parsed.has_hoa),
    },
    sourceDocumentId: (doc as any).id,
  });
}
