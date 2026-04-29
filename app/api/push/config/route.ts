import { NextResponse } from 'next/server';

// Returns the VAPID public key at runtime so the client doesn't have
// to depend on it being inlined at build time. We accept either name
// — NEXT_PUBLIC_VAPID_PUBLIC_KEY (legacy) or VAPID_PUBLIC_KEY — so
// whichever the user set on Vercel just works.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const key =
    process.env.VAPID_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    '';
  return NextResponse.json({ vapidPublicKey: key });
}
