import type { Document, Task, TaskHistory } from './types';
import { pendingDedupKey } from './task-dedup';

/**
 * The deterministic doc title format the server emits is
 * "Vendor — Mon Year" (e.g. "Spectrum — Mar 2026") or sometimes
 * "Vendor — task_title" when no service date was readable. Pull the
 * vendor + period halves out and normalize for case/punctuation drift
 * so "Spectrum — Mar 2026" and "spectrum — March 2026" land in the
 * same cluster.
 */
function parseDocTitle(title: string): { vendorSlug: string; periodSlug: string } | null {
  const lower = (title || '').toLowerCase().trim();
  const parts = lower.split(/\s+[—–-]\s+/);
  if (parts.length < 2) return null;
  const vendorSlug = parts[0].replace(/[^a-z0-9]+/g, '');
  const periodSlug = parts.slice(1).join(' ').replace(/[^a-z0-9]+/g, '');
  if (!vendorSlug || !periodSlug) return null;
  return { vendorSlug, periodSlug };
}

export interface DocumentCluster {
  /** Stable key shared across docs in the cluster. */
  key: string;
  vendorLabel: string;
  periodLabel: string;
  docs: Document[];
}

/**
 * Find groups of documents that look like duplicates of one another —
 * same vendor + same service month/year. Returns clusters with 2+
 * docs only; single-doc groups are dropped.
 */
export function findDocumentDuplicateClusters(docs: Document[]): DocumentCluster[] {
  const groups = new Map<string, { docs: Document[]; vendorLabel: string; periodLabel: string }>();
  for (const d of docs) {
    const cat = (d.category || '').trim();
    if (cat === 'Manual' || cat === 'Builder Doc') continue;
    const parsed = parseDocTitle(d.title || '');
    if (!parsed) continue;
    const key = `${parsed.vendorSlug}|${parsed.periodSlug}`;
    const labels = (() => {
      const lower = (d.title || '').trim();
      const parts = lower.split(/\s+[—–-]\s+/);
      return {
        vendorLabel: (parts[0] || '').trim(),
        periodLabel: parts.slice(1).join(' — ').trim(),
      };
    })();
    const existing = groups.get(key);
    if (existing) {
      existing.docs.push(d);
    } else {
      groups.set(key, {
        docs: [d],
        vendorLabel: labels.vendorLabel,
        periodLabel: labels.periodLabel,
      });
    }
  }
  const clusters: DocumentCluster[] = [];
  for (const [key, group] of groups.entries()) {
    if (group.docs.length < 2) continue;
    // Newest first so the user sees the most recent upload at the top
    // of each cluster (which is usually the one to keep).
    group.docs.sort((a, b) => (b.uploaded_at || '').localeCompare(a.uploaded_at || ''));
    clusters.push({
      key,
      vendorLabel: group.vendorLabel,
      periodLabel: group.periodLabel,
      docs: group.docs,
    });
  }
  // Most-duplicated first.
  clusters.sort((a, b) => b.docs.length - a.docs.length);
  return clusters;
}

export interface CompletedTaskCluster {
  key: string;
  label: string;
  tasks: Task[];
}

/**
 * Cluster completed recurring tasks that look like duplicates: same
 * vendor (dedup key) AND same due_date month + year. The day-of-month
 * can drift across uploads (service date vs. due date) but the same
 * (vendor, month) collision is the duplicate signal we want.
 */
export function findCompletedTaskDuplicateClusters(
  tasks: Task[],
): CompletedTaskCluster[] {
  const groups = new Map<string, { tasks: Task[]; label: string }>();
  for (const t of tasks) {
    if (t.status !== 'completed') continue;
    if (!t.recurrence || t.recurrence === 'one_time') continue;
    const dueOrCompleted = t.due_date || (t.completed_at || '').slice(0, 10);
    if (!dueOrCompleted) continue;
    const ym = dueOrCompleted.slice(0, 7); // YYYY-MM
    const key = `${pendingDedupKey(t.title, t.recurrence)}|${ym}`;
    const existing = groups.get(key);
    if (existing) {
      existing.tasks.push(t);
    } else {
      groups.set(key, { tasks: [t], label: t.title });
    }
  }
  const out: CompletedTaskCluster[] = [];
  for (const [key, g] of groups.entries()) {
    if (g.tasks.length < 2) continue;
    g.tasks.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
    out.push({ key, label: g.label, tasks: g.tasks });
  }
  out.sort((a, b) => b.tasks.length - a.tasks.length);
  return out;
}

/**
 * Returns the first existing document whose parsed (vendor, period)
 * matches the candidate's title. Used by the upload flow to ask the
 * user before creating a duplicate task.
 */
export function findExistingDocMatch(
  docs: Document[],
  candidateTitle: string,
  excludeId?: string,
): Document | null {
  const parsed = parseDocTitle(candidateTitle);
  if (!parsed) return null;
  const target = `${parsed.vendorSlug}|${parsed.periodSlug}`;
  for (const d of docs) {
    if (excludeId && d.id === excludeId) continue;
    const cat = (d.category || '').trim();
    if (cat === 'Manual' || cat === 'Builder Doc') continue;
    const p = parseDocTitle(d.title || '');
    if (!p) continue;
    if (`${p.vendorSlug}|${p.periodSlug}` === target) return d;
  }
  return null;
}

/** Avoid TS unused-import errors when consumers tree-shake this. */
export type { TaskHistory };
