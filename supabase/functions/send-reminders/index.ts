// HomeKeeper — hourly reminder dispatcher.
//
// Schedule via Supabase Cron to fire EVERY HOUR at minute 0:
//   '0 * * * *'
//
// This function reads each user's timezone + reminder_hour_local
// from notification_preferences and only sends them push when the
// current hour in THEIR local zone matches their preferred hour.
// So whether they're in NC, Tokyo, or London, they get reminders
// at "noon their time" (or whatever they set).

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import webpush from 'npm:web-push@3.6.7';

interface ReminderPref {
  user_id: string;
  push_subscription: any;
  remind_days_before: number;
  remind_on_due: boolean;
  remind_when_overdue: boolean;
  timezone: string;
  reminder_hour_local: number;
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

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// What hour is it right now in this IANA timezone? Returns 0–23 or
// null if the tz string is invalid.
const currentHourIn = (tz: string): number | null => {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === 'hour');
    if (!hourPart) return null;
    let h = parseInt(hourPart.value, 10);
    if (h === 24) h = 0;
    return Number.isFinite(h) ? h : null;
  } catch {
    return null;
  }
};

// What's "today" (YYYY-MM-DD) in this IANA timezone? Used so the
// "due today" bucket matches the user's wall calendar, not UTC.
const todayInTz = (tz: string): string => {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return fmt.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

const addDaysIso = (iso: string, n: number): string => {
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
    console.error('webpush error:', (err as Error).message);
  }
};

Deno.serve(async () => {
  const { data: prefsRows, error: prefsErr } = await sb
    .from('notification_preferences')
    .select('user_id, push_subscription, remind_days_before, remind_on_due, remind_when_overdue, timezone, reminder_hour_local');
  if (prefsErr) {
    return new Response('prefs query failed: ' + prefsErr.message, { status: 500 });
  }
  const prefs = (prefsRows || []).filter((p: any) => p.push_subscription) as ReminderPref[];
  if (prefs.length === 0) {
    return new Response('no subscribers', { status: 200 });
  }

  let sent = 0;
  let matched = 0;
  for (const p of prefs) {
    const tz = p.timezone || 'America/New_York';
    const hour = currentHourIn(tz);
    const want = typeof p.reminder_hour_local === 'number' ? p.reminder_hour_local : 12;
    if (hour === null || hour !== want) continue;
    matched += 1;

    const { data: memberships } = await sb
      .from('home_members')
      .select('home_id')
      .eq('user_id', p.user_id);
    const homeIds = (memberships || []).map((m: any) => m.home_id);
    if (homeIds.length === 0) continue;

    const t = todayInTz(tz);
    const latest = addDaysIso(t, Math.max(p.remind_days_before || 0, 0));
    const { data: tasks } = await sb
      .from('tasks')
      .select('id, title, due_date, status, is_suggestion, home_id, assigned_to')
      .in('home_id', homeIds)
      .eq('status', 'pending')
      .eq('is_suggestion', false)
      .gte('due_date', '1970-01-01')
      .lte('due_date', latest);

    const eligible = (tasks || []) as TaskRow[];
    if (eligible.length === 0) continue;

    const dueToday: TaskRow[] = [];
    const upcoming: TaskRow[] = [];
    const overdue: TaskRow[] = [];
    for (const task of eligible) {
      if (task.assigned_to && task.assigned_to !== p.user_id) continue;
      if (task.due_date === t) dueToday.push(task);
      else if (task.due_date < t) overdue.push(task);
      else upcoming.push(task);
    }

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
      const more = b.tasks.length > 3 ? ' +' + (b.tasks.length - 3) + ' more' : '';
      await sendPush(p.push_subscription, {
        title: 'HomeKeeper - ' + b.title,
        body: lead + more,
        url: '/dashboard',
        tag: 'hk-' + b.tag,
      });
      sent += 1;
    }
  }

  return new Response(
    JSON.stringify({ sent, matched_users: matched, total_subscribers: prefs.length }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
});
