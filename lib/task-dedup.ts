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
