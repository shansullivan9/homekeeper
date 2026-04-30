'use client';
import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import { TaskHistory } from '@/lib/types';
import PageHeader from '@/components/layout/PageHeader';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, Search, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/constants';
import { confirm } from '@/lib/confirm';

export default function HistoryPage() {
  const { history, tasks, categories, setHistory, setTasks } = useStore();
  const supabase = createClient();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'cost-desc' | 'category'>('recent');

  // Some history rows were written before category_name was being saved
  // properly, so fall back to the linked task's category if available.
  const categoryFor = (h: TaskHistory): string | null => {
    if (h.category_name) return h.category_name;
    if (!h.task_id) return null;
    const linkedTask = tasks.find((t) => t.id === h.task_id);
    if (!linkedTask?.category_id) return null;
    return categories.find((c) => c.id === linkedTask.category_id)?.name || null;
  };

  const handleUndo = async (h: TaskHistory) => {
    // If this history entry is for a recurring task, completing it
    // already auto-scheduled the next pending occurrence. Reviving
    // would leave two identical pending tasks. Detect and ask before
    // proceeding.
    const futureSibling = h.task_id
      ? null
      : tasks.find(
          (t) =>
            t.status === 'pending' &&
            !t.is_suggestion &&
            t.title.trim().toLowerCase() === h.title.trim().toLowerCase()
        );
    const ok = futureSibling
      ? await confirm({
          title: `"${h.title}" already has an upcoming occurrence`,
          message: 'Delete this history entry instead?',
          confirmLabel: 'Delete Entry',
          destructive: true,
        })
      : await confirm({
          title: `Mark "${h.title}" as not completed?`,
          message: 'It will go back to your task list.',
          confirmLabel: 'Mark Pending',
        });
    if (!ok) return;
    if (futureSibling) {
      return handleDelete(h);
    }
    setBusyId(h.id);
    try {
      let revivedTask: any = null;

      if (h.task_id) {
        // Underlying task still exists — flip it back to pending.
        const { data, error } = await supabase
          .from('tasks')
          .update({
            status: 'pending',
            completed_at: null,
            completed_by: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', h.task_id)
          .select()
          .single();
        if (error) throw error;
        revivedTask = data;
      } else {
        // Original task was deleted; recreate one so the user has
        // something to act on. We preserve as much as we can — title,
        // notes, cost, duration, and the category if the history row
        // remembered the name.
        const matchedCategory = h.category_name
          ? categories.find((c) => c.name === h.category_name) || null
          : null;
        const { data, error } = await supabase
          .from('tasks')
          .insert({
            home_id: h.home_id,
            title: h.title,
            notes: h.notes,
            category_id: matchedCategory?.id || null,
            estimated_cost: h.cost,
            estimated_minutes: h.duration_minutes,
            recurrence: 'one_time',
            priority: 'medium',
            status: 'pending',
          })
          .select()
          .single();
        if (error) throw error;
        revivedTask = data;
        toast('Recreated as a one-time task — original recurrence was lost', { icon: 'ℹ️' });
      }

      const { error: hErr } = await supabase
        .from('task_history')
        .delete()
        .eq('id', h.id);
      if (hErr) throw hErr;

      setHistory(history.filter((x) => x.id !== h.id));
      if (h.task_id) {
        setTasks(
          tasks.map((t) =>
            t.id === h.task_id
              ? { ...t, status: 'pending' as const, completed_at: null, completed_by: null }
              : t
          )
        );
      } else if (revivedTask) {
        setTasks([revivedTask, ...tasks]);
      }
      toast.success('Marked as not completed');
    } catch (err: any) {
      toast.error(err.message || 'Could not undo');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (h: TaskHistory) => {
    const ok = await confirm({
      title: `Delete history entry for "${h.title}"?`,
      message: 'The task itself will also be removed.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(h.id);
    try {
      const { error: hErr } = await supabase
        .from('task_history')
        .delete()
        .eq('id', h.id);
      if (hErr) throw hErr;
      if (h.task_id) {
        await supabase.from('tasks').delete().eq('id', h.task_id);
      }
      setHistory(history.filter((x) => x.id !== h.id));
      if (h.task_id) {
        setTasks(tasks.filter((t) => t.id !== h.task_id));
      }
      toast.success('Deleted');
    } catch (err: any) {
      toast.error(err.message || 'Could not delete');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const base = !search.trim()
      ? history
      : history.filter((h) => {
          const q = search.toLowerCase();
          return (
            h.title.toLowerCase().includes(q) ||
            h.category_name?.toLowerCase().includes(q) ||
            h.completed_by_name?.toLowerCase().includes(q) ||
            h.notes?.toLowerCase().includes(q)
          );
        });
    // Apply the selected sort. Fall through to "recent" for unknown
    // values so a stale URL/state never lands on an empty list.
    const sorted = [...base];
    if (sortBy === 'oldest') {
      sorted.sort(
        (a, b) => parseISO(a.completed_at).getTime() - parseISO(b.completed_at).getTime()
      );
    } else if (sortBy === 'cost-desc') {
      sorted.sort((a, b) => (b.cost || 0) - (a.cost || 0));
    } else if (sortBy === 'category') {
      sorted.sort((a, b) => {
        const ca = (a.category_name || '~').toLowerCase();
        const cb = (b.category_name || '~').toLowerCase();
        if (ca !== cb) return ca.localeCompare(cb);
        return parseISO(b.completed_at).getTime() - parseISO(a.completed_at).getTime();
      });
    } else {
      // recent
      sorted.sort(
        (a, b) => parseISO(b.completed_at).getTime() - parseISO(a.completed_at).getTime()
      );
    }
    return sorted;
  }, [history, search, sortBy]);

  // Month grouping only makes sense for the chronological sorts.
  const grouped = useMemo(() => {
    if (sortBy !== 'recent' && sortBy !== 'oldest') {
      return { '': filtered };
    }
    const groups: Record<string, typeof history> = {};
    filtered.forEach((h) => {
      const key = format(parseISO(h.completed_at), 'MMMM yyyy');
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    });
    return groups;
  }, [filtered, sortBy]);

  return (
    <div>
      <PageHeader
        title="Task History"
        subtitle={
          history.length === 0
            ? 'Nothing logged yet'
            : `${history.length} completed task${history.length === 1 ? '' : 's'}`
        }
      />

      <div className="px-4 pt-3 pb-2 md:max-w-md space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search history..."
            className="ios-input pl-9"
          />
        </div>
        {/* Sort chips — chronology by default, with cost/category for
            quick auditing. Skipping when there's nothing to sort. */}
        {history.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">
            {([
              { key: 'recent', label: 'Recent' },
              { key: 'oldest', label: 'Oldest' },
              { key: 'cost-desc', label: 'Cost' },
              { key: 'category', label: 'Category' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`px-3 py-1.5 rounded-full text-caption font-semibold whitespace-nowrap transition-all active:scale-95 ${
                  sortBy === key
                    ? 'bg-brand-500 text-white shadow-card'
                    : 'bg-white text-ink-secondary shadow-card md:hover:bg-gray-50 active:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {Object.entries(grouped).map(([month, items]) => (
        <div key={month || 'all'}>
          {month && <p className="section-header">{month}</p>}
          <div className="mx-4 ios-card overflow-hidden">
            {items.map((h) => (
              <div key={h.id} className="ios-list-item">
                <button
                  onClick={() => h.task_id && router.push(`/add-task?edit=${h.task_id}`)}
                  disabled={!h.task_id}
                  className="flex items-start gap-3 flex-1 min-w-0 text-left disabled:cursor-default"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <CheckCircle2 size={18} className="text-status-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium truncate">{h.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-ink-secondary">
                        {format(parseISO(h.completed_at), 'MMM d, h:mm a')}
                      </span>
                      {h.cost && (
                        <span className="text-xs font-semibold text-emerald-600">{formatCurrency(h.cost)}</span>
                      )}
                      {categoryFor(h) && (
                        <span className="text-[10px] text-ink-tertiary bg-gray-50 px-2 py-0.5 rounded-full">
                          {categoryFor(h)}
                        </span>
                      )}
                    </div>
                    {h.notes && (
                      <p className="text-xs text-ink-tertiary mt-1 line-clamp-2">{h.notes}</p>
                    )}
                    {h.photos && h.photos.length > 0 && (
                      <div className="flex gap-1.5 mt-2">
                        {h.photos.slice(0, 4).map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="w-12 h-12 rounded-md overflow-hidden bg-gray-100 flex-shrink-0"
                          >
                            <img
                              src={url}
                              alt=""
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
                <div className="flex items-center gap-3 flex-shrink-0 pl-2">
                  <button
                    onClick={() => handleUndo(h)}
                    disabled={busyId === h.id}
                    title={h.task_id ? 'Mark as not completed' : 'Mark as not completed (recreates the task)'}
                    aria-label="Mark as not completed"
                    className="w-9 h-9 rounded-full border-2 border-ink-tertiary text-ink-secondary flex items-center justify-center active:bg-gray-100 disabled:opacity-50 transition-all"
                  >
                    <RotateCcw size={15} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => handleDelete(h)}
                    disabled={busyId === h.id}
                    title="Delete entry"
                    aria-label="Delete history entry"
                    className="w-9 h-9 rounded-full border-2 border-status-red text-status-red flex items-center justify-center active:bg-status-red active:text-white disabled:opacity-50 transition-all"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-16 px-8">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-ink-secondary text-sm">
            {search ? 'No matching history found' : 'No completed tasks yet'}
          </p>
          {!search && (
            <p className="text-ink-tertiary text-xs mt-1">
              Completing a task moves it here so you keep a maintenance log.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
