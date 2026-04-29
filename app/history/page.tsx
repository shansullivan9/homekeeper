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

export default function HistoryPage() {
  const { history, tasks, categories, setHistory, setTasks } = useStore();
  const supabase = createClient();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

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
    const promptMsg = futureSibling
      ? `"${h.title}" already has an upcoming occurrence. Just delete this history entry instead?`
      : `Mark "${h.title}" as not completed? It will go back to your task list.`;
    if (!confirm(promptMsg)) return;
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
    if (
      !confirm(
        `Delete this history entry for "${h.title}"? The task itself will also be removed.`
      )
    )
      return;
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
    if (!search.trim()) return history;
    const q = search.toLowerCase();
    return history.filter(
      (h) =>
        h.title.toLowerCase().includes(q) ||
        h.category_name?.toLowerCase().includes(q) ||
        h.completed_by_name?.toLowerCase().includes(q) ||
        h.notes?.toLowerCase().includes(q)
    );
  }, [history, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof history> = {};
    filtered.forEach((h) => {
      const key = format(parseISO(h.completed_at), 'MMMM yyyy');
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    });
    return groups;
  }, [filtered]);

  return (
    <div>
      <PageHeader title="Task History" subtitle={`${history.length} completed tasks`} />

      <div className="px-4 pt-3 pb-2 md:max-w-md">
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
      </div>

      {Object.entries(grouped).map(([month, items]) => (
        <div key={month}>
          <p className="section-header">{month}</p>
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
                  </div>
                </button>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleUndo(h)}
                    disabled={busyId === h.id}
                    title={h.task_id ? 'Mark as not completed' : 'Mark as not completed (recreates the task)'}
                    className="w-8 h-8 rounded-full border-2 border-ink-tertiary text-ink-secondary flex items-center justify-center active:bg-gray-100 disabled:opacity-50 transition-all"
                  >
                    <RotateCcw size={14} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => handleDelete(h)}
                    disabled={busyId === h.id}
                    title="Delete entry"
                    className="w-8 h-8 rounded-full border-2 border-status-red text-status-red flex items-center justify-center active:bg-status-red active:text-white disabled:opacity-50 transition-all"
                  >
                    <Trash2 size={14} />
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
