// HomeKeeper — weekly email digest.
//
// Sends a once-a-week recap email per household:
//   - Tasks completed this week (count + cost)
//   - Tasks due in the next 7 days
//   - YTD totals
//
// Schedule with Supabase Cron (UI: Database → Cron Jobs), e.g.
// every Monday at 8am:
//
//   select cron.schedule(
//     'homekeeper-weekly-digest',
//     '0 8 * * 1',
//     $$ select net.http_post(
//          url := 'https://YOUR_PROJECT.functions.supabase.co/weekly-digest',
//          headers := jsonb_build_object('Authorization',
//                       'Bearer ' || current_setting('app.settings.cron_secret'))
//        ); $$
//   );
//
// Env required (Supabase → Edge Functions → Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — auto / set
//   RESEND_API_KEY                            — from resend.com
//   DIGEST_FROM_EMAIL                         — e.g. HomeKeeper <reports@yourdomain.com>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM = Deno.env.get('DIGEST_FROM_EMAIL') || 'HomeKeeper <noreply@example.com>';

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const fmtCurrency = (n: number) =>
  n % 1 === 0
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const daysAhead = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const sendEmail = async (to: string, subject: string, html: string) => {
  if (!RESEND_API_KEY) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
  } catch (err) {
    console.error('resend error:', (err as Error).message);
  }
};

const renderDigest = (homeName: string, completed: any[], upcoming: any[], totalCost: number, ytdCost: number, ytdCount: number) => {
  const li = (rows: any[]) =>
    rows.map((r) => `<li style="margin:4px 0;">${r.title}${r.cost ? ` — <strong>${fmtCurrency(r.cost)}</strong>` : ''}</li>`).join('');
  const upcomingLi = (rows: any[]) =>
    rows
      .map(
        (r) =>
          `<li style="margin:4px 0;">${r.title} <span style="color:#6E6E73;">(${r.due_date})</span></li>`
      )
      .join('');
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1C1C1E;max-width:560px;margin:0 auto;padding:24px;">
    <h1 style="font-size:22px;margin:0 0 4px;">${homeName} — weekly recap</h1>
    <p style="color:#6E6E73;margin:0 0 24px;font-size:13px;">${new Date().toDateString()}</p>

    <h2 style="font-size:16px;margin:24px 0 8px;">Done this week (${completed.length})</h2>
    ${completed.length ? `<ul style="padding-left:20px;margin:0;">${li(completed)}</ul>` : '<p style="color:#6E6E73;font-size:14px;">Nothing logged this week.</p>'}
    ${completed.length ? `<p style="color:#6E6E73;font-size:13px;">Spent this week: <strong>${fmtCurrency(totalCost)}</strong></p>` : ''}

    <h2 style="font-size:16px;margin:24px 0 8px;">Coming up (${upcoming.length})</h2>
    ${upcoming.length ? `<ul style="padding-left:20px;margin:0;">${upcomingLi(upcoming)}</ul>` : '<p style="color:#6E6E73;font-size:14px;">Nothing due in the next 7 days.</p>'}

    <hr style="border:none;border-top:1px solid #E5E5EA;margin:24px 0;" />

    <p style="color:#6E6E73;font-size:13px;margin:0;">Year to date: <strong>${ytdCount}</strong> task${ytdCount === 1 ? '' : 's'}, <strong>${fmtCurrency(ytdCost)}</strong> spent.</p>
    <p style="color:#AEAEB2;font-size:11px;margin-top:24px;">You're getting this because weekly digests are on for HomeKeeper.</p>
  </div>`;
};

Deno.serve(async () => {
  // For each home, build a digest and send to every member with an
  // email on file. We don't currently honor a per-user opt-out for
  // email — easy follow-up via notification_preferences if you want.
  const { data: homes, error: homesErr } = await sb.from('homes').select('id, name');
  if (homesErr) return new Response(homesErr.message, { status: 500 });

  let emails = 0;
  const since = daysAgo(7);
  const horizon = daysAhead(7);
  const yearStart = `${new Date().getUTCFullYear()}-01-01`;
  const t = today();

  for (const home of homes || []) {
    // Members + their emails
    const { data: members } = await sb
      .from('home_members')
      .select('user_id')
      .eq('home_id', (home as any).id);
    const userIds = (members || []).map((m: any) => m.user_id);
    if (userIds.length === 0) continue;
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, email')
      .in('id', userIds);
    const recipients = (profiles || []).map((p: any) => p.email).filter(Boolean);
    if (recipients.length === 0) continue;

    // Last 7 days history
    const { data: completed } = await sb
      .from('task_history')
      .select('title, cost, completed_at')
      .eq('home_id', (home as any).id)
      .gte('completed_at', since);
    const completedRows = completed || [];
    const totalCost = completedRows.reduce((s: number, r: any) => s + (r.cost || 0), 0);

    // Next 7 days upcoming
    const { data: upcoming } = await sb
      .from('tasks')
      .select('title, due_date')
      .eq('home_id', (home as any).id)
      .eq('status', 'pending')
      .eq('is_suggestion', false)
      .gte('due_date', t)
      .lte('due_date', horizon)
      .order('due_date', { ascending: true });

    // YTD
    const { data: ytdRows } = await sb
      .from('task_history')
      .select('cost')
      .eq('home_id', (home as any).id)
      .gte('completed_at', yearStart);
    const ytdCount = (ytdRows || []).length;
    const ytdCost = (ytdRows || []).reduce((s: number, r: any) => s + (r.cost || 0), 0);

    if (completedRows.length === 0 && (upcoming || []).length === 0) continue;

    const html = renderDigest(
      (home as any).name || 'My Home',
      completedRows,
      upcoming || [],
      totalCost,
      ytdCost,
      ytdCount
    );

    for (const to of recipients) {
      await sendEmail(to, `${(home as any).name || 'HomeKeeper'} — weekly recap`, html);
      emails += 1;
    }
  }

  return new Response(JSON.stringify({ emails }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
