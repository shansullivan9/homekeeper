import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Inbound-email webhook. Cloudflare Email Workers (or any provider —
// Postmark, Mailgun, etc.) POST a parsed email payload here; we
// drop the attachments into the right home's Documents bucket so they
// flow through the existing "Process invoices" pipeline.
//
// Auth model: shared secret in the Authorization header. Set
// INBOX_WEBHOOK_SECRET in Vercel env and use the same value when
// configuring the Cloudflare Worker. Anyone hitting this endpoint
// without the right token gets 401 — important because the inbox
// addresses themselves are guessable enough that we can't rely on
// secrecy of the URL alone.
//
// Service role: this endpoint runs unauthenticated (the email sender
// has no Supabase session), so we use the service-role key to bypass
// RLS for the home lookup + document insert. The work is scoped to
// the home_id we resolve from the address slug, so a leaked secret
// can't write to homes other than the ones with provisioned inboxes.

interface InboundAttachment {
  filename: string;
  contentType: string;
  // Base64-encoded file content. Cloudflare's Email Worker streams
  // the raw email; the worker script (cloudflare/email-worker.js)
  // parses out attachments with postal-mime and base64-encodes them
  // before POSTing.
  content: string;
}

interface InboundEmail {
  to: string;       // e.g. "bills-a3f9k2b8@inbox.homekeeper.online"
  from?: string;
  subject?: string;
  attachments?: InboundAttachment[];
}

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function safeUuid(): string {
  // Avoid pulling in `crypto.randomUUID()` polyfills — Node 18+ on
  // Vercel has the global. Fall back to a manual v4 if it's missing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const arr = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(arr);
  else for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
  arr[6] = (arr[6] & 0x0f) | 0x40;
  arr[8] = (arr[8] & 0x3f) | 0x80;
  const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

function parseSlugFromAddress(to: string): string | null {
  // "bills-a3f9k2b8@inbox.homekeeper.online" → "bills-a3f9k2b8"
  // Postmark / Mailgun / CF Workers all give us the recipient
  // somewhere in the To: header — sometimes wrapped in display name
  // ("Inbox <bills-x@inbox…>"). Pull out the first email address and
  // take its local part.
  const match = to.match(/[^\s<>"]+@[^\s<>"]+/);
  if (!match) return null;
  const local = match[0].split('@')[0].trim().toLowerCase();
  // Strip any +tag suffix so "bills-x+spam@inbox..." still resolves.
  return local.split('+')[0] || null;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'attachment';
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.INBOX_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: 'Server is missing INBOX_WEBHOOK_SECRET' },
      { status: 500 }
    );
  }

  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: InboundEmail;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const slug = parseSlugFromAddress(body.to || '');
  if (!slug) {
    return NextResponse.json(
      { error: 'Could not parse recipient address slug' },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: inbox, error: lookupErr } = await supabase
    .from('home_inboxes')
    .select('home_id')
    .eq('address_slug', slug)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json(
      { error: 'Failed to look up inbox' },
      { status: 500 }
    );
  }
  if (!inbox) {
    // Don't 404 — return 200 so the upstream provider doesn't
    // retry forever. Log it and silently drop.
    // eslint-disable-next-line no-console
    console.warn('[inbox] no matching inbox for slug', slug);
    return NextResponse.json({ ok: true, ignored: true });
  }

  const homeId: string = (inbox as any).home_id;
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  const accepted: { documentId: string; filename: string }[] = [];
  const skipped: { filename: string; reason: string }[] = [];

  for (const att of attachments) {
    const filename = sanitizeFilename(att.filename || 'attachment');
    const mime = (att.contentType || '').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      skipped.push({ filename, reason: `unsupported mime ${mime || 'unknown'}` });
      continue;
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(att.content || '', 'base64');
    } catch {
      skipped.push({ filename, reason: 'invalid base64' });
      continue;
    }
    if (buffer.byteLength === 0) {
      skipped.push({ filename, reason: 'empty body' });
      continue;
    }
    if (buffer.byteLength > 18 * 1024 * 1024) {
      skipped.push({ filename, reason: 'file too large (>18MB)' });
      continue;
    }

    const path = `${homeId}/${safeUuid()}-${filename}`;
    const { error: upErr } = await supabase.storage
      .from('documents')
      .upload(path, buffer, { contentType: mime, upsert: false });
    if (upErr) {
      skipped.push({ filename, reason: `storage: ${upErr.message}` });
      continue;
    }

    const docTitle = (body.subject || filename).slice(0, 200);
    const { data: doc, error: insErr } = await supabase
      .from('documents')
      .insert({
        home_id: homeId,
        title: docTitle,
        category: 'Invoice',
        file_path: path,
        file_name: filename,
        mime_type: mime,
        file_size: buffer.byteLength,
        // Tag the source so the user can tell which docs landed via
        // forwarding vs. manual upload — handy for debugging.
        notes: `Auto-imported from email: ${body.from || 'unknown'}`,
        uploaded_by: null,
      })
      .select('id')
      .single();
    if (insErr || !doc) {
      // Roll back the storage upload so we don't strand a file with
      // no DB row pointing at it.
      await supabase.storage.from('documents').remove([path]);
      skipped.push({ filename, reason: `db: ${insErr?.message || 'insert failed'}` });
      continue;
    }
    accepted.push({ documentId: (doc as any).id, filename });
  }

  return NextResponse.json({
    ok: true,
    home_id: homeId,
    accepted,
    skipped,
  });
}
