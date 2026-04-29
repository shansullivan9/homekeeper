// HomeKeeper — daily reminder dispatcher.
//
// Schedule this with Supabase Cron (UI: Database → Cron Jobs) to
// invoke once per day, e.g. at 09:00 in your project's timezone.
//
//   select cron.schedule(
//     'homekeeper-daily-reminders',
//     '0 9 * * *',
//     $$ select net.http_post(
//          url := 'https://YOUR_PROJECT.functions.supabase.co/send-reminders',
//          headers := jsonb_build_object('Authorization',
//                       'Bearer ' || current_setting('app.settings.cron_secret'))
//        ); $$
//   );
//
// Env required (Supabase → Edge Functions → Secrets):
//   SUPABASE_URL                     — auto-set
//   SUPABASE_SERVICE_ROLE_KEY        — set manually
//   VAPID_PUBLIC_KEY                 — same value as NEXT_PUBLIC_VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY                — server-only
//   VAPID_SUBJECT                    — e.g. mailto:you@example.com

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import webpush from 'https://esm.sh/web-push@3.6.7';

interface ReminderPref {
  user_id: string;
  push_subscription: any;
  remind_days_before: number;
  remind_on_due: boolean;
  remind_when_overdue: boolean;
}

interface TaskRow {
  id: string;
  title: string;
  due_date: string;
  status: string;
  is_suggestion: boolean;
  home_id: string;
  assigned_to: string | null;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:noreply@example.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const today = (): string => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

const sendPush = async (subscription: any, payload: PushPayload) => {
  if (!subscription || !VAPID_PUBLIC || !VAPID_PRIVATE) return;
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    // 410 Gone → endpoint dead. Silently swallow; could clear it from
    // notification_preferences in a future revision.
    console.error('webpush error:', (err as Error).message);
  }
};

Deno.serve(async () => {
  // Pull every prefs row that has a subscription saved.
  const { data: prefsRows, error: prefsErr } = await sb
    .from('notification_preferences')
    .select('user_id, push_subscription, remind_days_before, remind_on_due, remind_when_overdue');
  if (prefsErr) {
    return new Response(`prefs query failed: ${prefsErr.message}`, { status: 500 });
  }
  const prefs = (prefsRows || []).filter((p: any) => p.push_subscription) as ReminderPref[];
  if (prefs.length === 0) {
    return new Response('no subscribers', { status: 200 });
  }

  // For each user, find tasks that match their reminder rules. We
  // narrow tasks to homes the user belongs to.
  let sent = 0;
  for (const p of prefs) {
    const { data: memberships } = await sb
      .from('home_members')
      .select('home_id')
      .eq('user_id', p.user_id);
    const homeIds = (memberships || []).map((m: any) => m.home_id);
    if (homeIds.length === 0) continue;

    // Pull the user's pending tasks across all their homes for the
    // relevant date window: today, today+lead, and any past-due.
    const earliest = '1970-01-01';
    const latest = addDays(today(), Math.max(p.remind_days_before || 0, 0));
    const { data: tasks } = await sb
      .from('tasks')
      .select('id, title, due_date, status, is_suggestion, home_id, assigned_to')
      .in('home_id', homeIds)
      .eq('status', 'pending')
      .eq('is_suggestion', false)
      .gte('due_date', earliest)
      .lte('due_date', latest);

    const eligible = (tasks || []) as TaskRow[];
    if (eligible.length === 0) continue;

    // Bucket the tasks
    const dueToday: TaskRow[] = [];
    const upcoming: TaskRow[] = [];
    const overdue: TaskRow[] = [];
    const t = today();
    for (const task of eligible) {
      // Prefer to remind only the assigned user; if unassigned, fall
      // through to all members of the home.
      if (task.assigned_to && task.assigned_to !== p.user_id) continue;
      if (task.due_date === t) dueToday.push(task);
      else if (task.due_date < t) overdue.push(task);
      else upcoming.push(task);
    }

    // Apply the user's toggles
    const buckets: { tag: string; title: string; tasks: TaskRow[] }[] = [];
    if (p.remind_on_due && dueToday.length > 0) {
      buckets.push({ tag: 'due-today', title: 'Due today', tasks: dueToday });
    }
    if (p.remind_when_overdue && overdue.length > 0) {
      buckets.push({ tag: 'overdue', title: 'Overdue tasks', tasks: overdue });
    }
    if ((p.remind_days_before || 0) > 0 && upcoming.length > 0) {
      buckets.push({ tag: 'upcoming', title: 'Coming up', tasks: upcoming });
    }

    for (const b of buckets) {
      const lead = b.tasks.slice(0, 3).map((t) => t.title).join(', ');
      const more = b.tasks.length > 3 ? ` +${b.tasks.length - 3} more` : '';
      await sendPush(p.push_subscription, {
        title: `HomeKeeper · ${b.title}`,
        body: `${lead}${more}`,
        url: '/dashboard',
        tag: `hk-${b.tag}`,
      });
      sent += 1;
    }
  }

  return new Response(JSON.stringify({ sent, users: prefs.length }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
