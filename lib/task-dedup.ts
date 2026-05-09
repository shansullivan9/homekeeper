import { addDays, addMonths, addYears, format, parseISO } from 'date-fns';
import type { Task } from './types';

/**
 * Stable key for collapsing duplicate "next pending" recurring tasks
 * created from invoice / bill uploads. The display title is
 * "Vendor — task_title" (e.g. "Spectrum — Internet Bill"), but the AI
 * sometimes drifts on either side of the em dash across uploads of the
 * same vendor — "ROCKET" vs "Rocket", "Mortgage Statement" vs
 * "Mortgage Payment", "Spectrum" vs "Spectrum Internet". Anchoring
 * dedup on the vendor portion (text before the em dash) plus
 * recurrence catches every drift while still keeping legitimately
 * different recurring tasks (e.g. yearly HVAC vs quarterly HVAC) apart.
 *
 * Falls back to the full title when no separator is present so a
 * single-word title still produces a stable key.
 */
export function pendingDedupKey(
  title: string | null | undefined,
  recurrence: string | null | undefined,
): string {
  const lower = (title || '').toLowerCase();
  const vendor = lower.split(/\s+[—–-]\s+/)[0] || lower;
  const slug = vendor.replace(/[^a-z0-9]+/g, '');
  return `${slug}|${recurrence || 'one_time'}`;
}

/**
 * Find an existing pending recurring task that should be UPDATED
 * (rather than duplicated) when a new bill from the same vendor lands.
 * Skips suggestions, completed tasks, and one-off tasks.
 */
export function findExistingPendingMatch(
  tasks: Task[],
  title: string,
  recurrence: string,
): Task | null {
  if (recurrence === 'one_time') return null;
  const target = pendingDedupKey(title, recurrence);
  for (const t of tasks) {
    if (t.status !== 'pending') continue;
    if (t.is_suggestion) continue;
    if (!t.recurrence || t.recurrence === 'one_time') continue;
    if (pendingDedupKey(t.title, t.recurrence) === target) return t;
  }
  return null;
}

/**
 * Group pending recurring tasks by dedup key and return the IDs that
 * should be deleted to leave one survivor per group. The survivor is
 * the row with the latest due_date (ties broken by updated_at, then
 * created_at) so future reminders still fire on the freshest schedule.
 */
export function pickPendingDuplicatesToDelete(tasks: Task[]): string[] {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.status !== 'pending') continue;
    if (t.is_suggestion) continue;
    if (!t.recurrence || t.recurrence === 'one_time') continue;
    const key = pendingDedupKey(t.title, t.recurrence);
    if (!key.split('|')[0]) continue;
    const list = groups.get(key) || [];
    list.push(t);
    groups.set(key, list);
  }
  const toDelete: string[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => {
      const aD = a.due_date || '';
      const bD = b.due_date || '';
      if (aD !== bD) return bD.localeCompare(aD);
      const aU = (a as any).updated_at || a.created_at || '';
      const bU = (b as any).updated_at || b.created_at || '';
      return bU.localeCompare(aU);
    });
    for (let i = 1; i < list.length; i++) toDelete.push(list[i].id);
  }
  return toDelete;
}

function advanceOnce(fromIso: string, recurrence: string): string | null {
  const d = parseISO(fromIso);
  switch (recurrence) {
    case 'weekly':     return format(addDays(d, 7), 'yyyy-MM-dd');
    case 'bi_monthly': return format(addMonths(d, 2), 'yyyy-MM-dd');
    case 'monthly':    return format(addMonths(d, 1), 'yyyy-MM-dd');
    case 'quarterly':  return format(addMonths(d, 3), 'yyyy-MM-dd');
    case 'bi_annual':  return format(addMonths(d, 6), 'yyyy-MM-dd');
    case 'yearly':     return format(addYears(d, 1), 'yyyy-MM-dd');
    default:           return null;
  }
}

/**
 * Walk forward from anchor by `recurrence` increments, returning every
 * cycle date up to and including the first one >= today. Used to backfill
 * pending rows for cycles that came and went while the chain was broken
 * (e.g. user trash-canned the April Spectrum pending → April never got
 * logged → respawn should produce both an Apr-cycle and a May-cycle row,
 * not just jump to May).
 */
function generateCycleDates(anchorIso: string, recurrence: string): string[] {
  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const out: string[] = [];
  let cursor = anchorIso;
  for (let i = 0; i < 24; i++) {
    const next = advanceOnce(cursor, recurrence);
    if (!next) break;
    out.push(next);
    cursor = next;
    if (next >= todayIso) break;
  }
  return out;
}

function daysApart(a: string, b: string): number {
  const aMs = parseISO(a).getTime();
  const bMs = parseISO(b).getTime();
  return Math.abs((aMs - bMs) / 86400000);
}

export interface RespawnSeed {
  home_id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  recurrence: string;
  due_date: string;
  estimated_cost: number | null;
  created_by: string | null;
  assigned_to: string | null;
  source_completed_id: string;
}

/**
 * For every (vendor, recurrence) group that has at least one COMPLETED
 * recurring task but NO pending task, derive what the next pending task
 * should look like from the most recent completion. Used to self-heal
 * when the user accidentally trash-can'd a recurring pending and the
 * series stopped firing.
 *
 * Only considers completions within the last `windowDays` so a
 * forgotten one-off-then-cancelled bill from years ago doesn't suddenly
 * resurrect itself.
 */
export function pickRecurringTasksToRespawn(
  tasks: Task[],
  windowDays = 400,
): RespawnSeed[] {
  const cutoff = format(
    new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000),
    'yyyy-MM-dd',
  );

  // Collect by dedup key.
  const completedByKey = new Map<string, Task[]>();
  const hasPendingKey = new Set<string>();
  for (const t of tasks) {
    if (!t.recurrence || t.recurrence === 'one_time') continue;
    const key = pendingDedupKey(t.title, t.recurrence);
    if (!key.split('|')[0]) continue;
    if (t.status === 'pending' && !t.is_suggestion) {
      hasPendingKey.add(key);
    } else if (t.status === 'completed') {
      const list = completedByKey.get(key) || [];
      list.push(t);
      completedByKey.set(key, list);
    }
  }

  const seeds: RespawnSeed[] = [];
  for (const [key, list] of completedByKey.entries()) {
    if (hasPendingKey.has(key)) continue;
    // Pick the most recent completion as the source of truth for the
    // schedule: that's the bill the user most recently "saw".
    list.sort((a, b) => {
      const aT = a.completed_at || a.due_date || '';
      const bT = b.completed_at || b.due_date || '';
      return bT.localeCompare(aT);
    });
    const latest = list[0];
    const completedIso = (latest.completed_at || '').slice(0, 10);
    if (!completedIso || completedIso < cutoff) continue;
    // Use the last-known due_date as the day-of-month anchor when
    // possible (e.g. the bill was due on the 10th); fall back to
    // completion date.
    const anchor = latest.due_date || completedIso;
    const cycleDates = generateCycleDates(anchor, latest.recurrence);
    if (cycleDates.length === 0) continue;
    // Existing completions covered by their due_date (or completed_at)
    // — used to skip cycles that already have a logged completion so we
    // don't double-count a cycle the user already paid via upload.
    const completedAnchors = list
      .map((t) => (t.due_date || (t.completed_at || '').slice(0, 10)))
      .filter(Boolean) as string[];
    const halfWindow = halfCycleDays(latest.recurrence);
    for (const cycleDate of cycleDates) {
      const alreadyLogged = completedAnchors.some(
        (d) => daysApart(d, cycleDate) <= halfWindow,
      );
      if (alreadyLogged) continue;
      seeds.push({
        home_id: latest.home_id,
        category_id: latest.category_id,
        title: latest.title,
        description: latest.description,
        recurrence: latest.recurrence,
        due_date: cycleDate,
        estimated_cost: latest.estimated_cost,
        created_by: latest.created_by,
        // Carry the most recent claimer forward so a chore that's
        // historically been "Shan's" stays Shan's after the chain
        // self-heals. Mirrors what complete_task does on the
        // green-check path.
        assigned_to: (latest as any).assigned_to ?? null,
        source_completed_id: latest.id,
      });
    }
  }
  return seeds;
}

function halfCycleDays(recurrence: string): number {
  switch (recurrence) {
    case 'weekly':     return 3;
    case 'bi_monthly': return 28;
    case 'monthly':    return 14;
    case 'quarterly':  return 40;
    case 'bi_annual':  return 80;
    case 'yearly':     return 150;
    default:           return 14;
  }
}
