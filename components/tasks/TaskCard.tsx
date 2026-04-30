'use client';
import { useEffect, useState } from 'react';
import { Task } from '@/lib/types';
import { getTaskUrgency, urgencyColor, sectionColorForTask, CATEGORY_ICONS, RECURRENCE_LABELS, formatCurrency, emojiForTaskTitle } from '@/lib/constants';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';
import { Check, ChevronRight, RotateCcw, UserPlus, User, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { confirm } from '@/lib/confirm';

interface TaskCardProps {
  task: Task;
  compact?: boolean;
  onComplete?: () => void;
  sectionColor?: string;
}

export default function TaskCard({ task, compact, onComplete, sectionColor }: TaskCardProps) {
  const { user, members, categories } = useStore();
  const router = useRouter();
  const supabase = createClient();
  const urgency = getTaskUrgency(task.due_date);
  const isDone = task.status === 'completed';
  // Use the unified section bucket → color map so a task's accent dot
  // matches its dashboard section everywhere (calendar, recently
  // completed, edit screens, etc.). Caller can still override.
  const color = sectionColor || sectionColorForTask(task.due_date, task.status);
  // Pick the most specific emoji we can:
  // 1. Match keywords in the task title (so "Pest Control" → 🐜, "Clean
  //    Gutters" → 🍁, "Pressure Wash House" → 🚰).
  // 2. Fall back to the task's category icon (HVAC → 🌡️, Plumbing → 💧).
  // 3. Final fallback is the clipboard 📋.
  const taskCategory =
    task.categories ||
    (task.category_id ? categories.find((c) => c.id === task.category_id) : null);
  const titleEmoji = emojiForTaskTitle(task.title);
  const catIcon =
    titleEmoji
      ? titleEmoji
      : taskCategory?.icon
      ? (CATEGORY_ICONS[taskCategory.icon] || '🔧')
      : '📋';

  const assignee = (task as any).assigned_to
    ? members.find((m: any) => m.user_id === (task as any).assigned_to)
    : null;
  const isMine = (task as any).assigned_to === user?.id;
  const isClaimed = !!(task as any).assigned_to;

  const formatDueDate = (date: string) => {
    const d = parseISO(date);
    if (isToday(d)) return 'Today';
    if (isTomorrow(d)) return 'Tomorrow';
    const fmt = d.getFullYear() === new Date().getFullYear() ? 'MMM d' : 'MMM d, yyyy';
    if (isPast(d)) return `Overdue · ${format(d, fmt)}`;
    return format(d, fmt);
  };

  // Inline "Log completion" sheet — replaces the bare confirm()
  // dialog so users can override the actual cost / notes / minutes
  // before logging. Useful when the estimate was wrong (DIY for free,
  // pro charged more, etc.). Default values come from the task itself
  // so one-tap completion is still possible: just hit Complete.
  const [showCompleteSheet, setShowCompleteSheet] = useState(false);
  const [completeCost, setCompleteCost] = useState('');
  const [completeMinutes, setCompleteMinutes] = useState('');
  const [completeNotes, setCompleteNotes] = useState('');
  const [completePhotos, setCompletePhotos] = useState<File[]>([]);
  const [completing, setCompleting] = useState(false);

  // Esc closes the complete sheet (matches the backdrop tap behavior).
  useEffect(() => {
    if (!showCompleteSheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !completing) setShowCompleteSheet(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCompleteSheet, completing]);

  const openCompleteSheet = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) return;
    setCompleteCost(task.estimated_cost != null ? String(task.estimated_cost) : '');
    setCompleteMinutes(task.estimated_minutes != null ? String(task.estimated_minutes) : '');
    setCompleteNotes('');
    setCompletePhotos([]);
    setShowCompleteSheet(true);
  };

  const uploadCompletionPhotos = async (homeId: string): Promise<string[]> => {
    if (completePhotos.length === 0) return [];
    const urls: string[] = [];
    for (const f of completePhotos) {
      const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${homeId}/${task.id}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from('photos').upload(path, f, {
        contentType: f.type || 'image/jpeg',
        upsert: false,
      });
      if (error) {
        toast.error(`Photo ${f.name}: ${error.message}`);
        continue;
      }
      const { data } = supabase.storage.from('photos').getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    }
    return urls;
  };

  const submitComplete = async () => {
    if (!user) return;
    setCompleting(true);
    const cost = completeCost.trim() === '' ? null : parseFloat(completeCost);
    const minutes = completeMinutes.trim() === '' ? null : parseInt(completeMinutes, 10);

    // Upload any photos first so we can write their URLs onto the
    // history row right after complete_task creates it.
    const photoUrls = await uploadCompletionPhotos(task.home_id);

    const { data, error } = await supabase.rpc('complete_task', {
      p_task_id: task.id,
      p_user_id: user.id,
      p_notes: completeNotes.trim() || null,
      p_cost: cost != null && !isNaN(cost) ? cost : null,
      p_duration: minutes != null && !isNaN(minutes) ? minutes : null,
    });
    if (error) {
      setCompleting(false);
      toast.error('Failed to complete task');
      return;
    }
    // Patch the freshly-created history row with the photo URLs.
    const historyId = (data as any)?.history_id;
    if (historyId && photoUrls.length > 0) {
      await supabase
        .from('task_history')
        .update({ photos: photoUrls } as any)
        .eq('id', historyId);
    }

    const store = useStore.getState();
    const completedAt = new Date().toISOString();
    store.setTasks(
      store.tasks.map((t) =>
        t.id === task.id
          ? ({ ...t, status: 'completed', completed_at: completedAt, completed_by: user.id } as any)
          : t
      )
    );
    setCompleting(false);
    setShowCompleteSheet(false);

    // Toast with an inline Undo so a misclick is one tap to recover —
    // no second confirm dialog, no trip back through Task History.
    const undo = async () => {
      // Best-effort revert: flip the task back to pending and remove
      // the just-created history row. We don't surface errors here
      // because the user already has a "wrong" state from their POV.
      await supabase
        .from('tasks')
        .update({
          status: 'pending',
          completed_at: null,
          completed_by: null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', task.id);
      if (historyId) {
        await supabase.from('task_history').delete().eq('id', historyId);
      }
      const s = useStore.getState();
      s.setTasks(
        s.tasks.map((t) =>
          t.id === task.id
            ? ({ ...t, status: 'pending', completed_at: null, completed_by: null } as any)
            : t
        )
      );
      onComplete?.();
    };

    toast.success(
      (tt) => (
        <span className="flex items-center gap-3">
          <span>Task completed</span>
          <button
            onClick={() => {
              toast.dismiss(tt.id);
              undo();
              toast('Undone', { icon: '↩️' });
            }}
            className="text-brand-600 font-semibold text-caption hover:text-brand-700"
          >
            Undo
          </button>
        </span>
      ),
      { duration: 5000 }
    );
    onComplete?.();
  };

  const handleClaim = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) return;
    // Claiming is reversible with a single tap — no confirm needed.
    // For "take over from someone else", prompt because that's a more
    // significant change.
    if (isClaimed && !isMine) {
      const ok = await confirm({
        title: `Take over "${task.title}"?`,
        message: `It's currently with ${assigneeLabel || 'the current owner'}.`,
        confirmLabel: 'Take Over',
      });
      if (!ok) return;
    }

    const { data, error } = await supabase.rpc('toggle_task_claim', {
      p_task_id: task.id,
      p_user_id: user.id,
    });

    if (error || (data && (data as any).error)) {
      toast.error('Failed to update task');
    } else {
      const nowAssigned = (data as any)?.assigned_to ?? null;
      // Patch the store immediately so the chip / icon updates without
      // waiting for a full refetch.
      const store = useStore.getState();
      store.setTasks(
        store.tasks.map((t) =>
          t.id === task.id ? ({ ...t, assigned_to: nowAssigned } as any) : t
        )
      );
      toast.success(
        nowAssigned === user.id ? "You've got it" :
        nowAssigned === null ? 'Unclaimed' :
        'Claimed by someone else'
      );
      onComplete?.();
    }
  };

  const handleUncomplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const ok = await confirm({
      title: `Mark "${task.title}" as not completed?`,
      message: 'It will go back to your task list.',
      confirmLabel: 'Mark Pending',
    });
    if (!ok) return;
    const { error: tErr } = await supabase
      .from('tasks')
      .update({
        status: 'pending',
        completed_at: null,
        completed_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id);
    if (tErr) {
      toast.error('Failed to undo');
      return;
    }
    // Only delete the most recent history row for this task — older
    // recurring completions need to stay in the log.
    const { data: latestHist } = await supabase
      .from('task_history')
      .select('id')
      .eq('task_id', task.id)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestHist) {
      await supabase.from('task_history').delete().eq('id', (latestHist as any).id);
    }
    toast.success('Marked as not completed');
    onComplete?.();
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const ok = await confirm({
      title: `Delete "${task.title}"?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) {
      toast.error('Failed to delete');
      return;
    }
    // Drop matching history rows from local state. The DB cascade does the
    // server side; this just keeps the UI snappy without waiting for refetch.
    const store = useStore.getState();
    store.setTasks(store.tasks.filter((t) => t.id !== task.id));
    store.setHistory(store.history.filter((h) => h.task_id !== task.id));
    toast.success('Task deleted');
    onComplete?.();
  };

  const assigneeLabel = assignee
    ? (assignee as any).display_name || (assignee as any).email?.split('@')[0] || 'Someone'
    : null;

  return (
    <>
    <button
      onClick={() => router.push(`/add-task?edit=${task.id}`)}
      className="w-full text-left ios-list-item group"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex-shrink-0">
          <div className="urgency-dot" style={{ backgroundColor: color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{catIcon}</span>
            <p className={`font-medium text-[15px] truncate ${task.status === 'completed' ? 'strike-middle text-ink-tertiary' : ''}`}>
              {task.title}
            </p>
          </div>
          {compact && task.status === 'completed' && task.completed_at && (
            <p className="text-xs text-ink-tertiary mt-0.5">
              Completed {format(
                parseISO(task.completed_at),
                parseISO(task.completed_at).getFullYear() === new Date().getFullYear()
                  ? 'MMM d'
                  : 'MMM d, yyyy'
              )}
            </p>
          )}
          {!compact && (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {isDone && task.completed_at ? (
                <span className="text-xs text-ink-tertiary">
                  Completed {format(
                    parseISO(task.completed_at),
                    parseISO(task.completed_at).getFullYear() === new Date().getFullYear()
                      ? 'MMM d'
                      : 'MMM d, yyyy'
                  )}
                </span>
              ) : task.due_date ? (
                <span className="text-xs" style={{ color }}>
                  {formatDueDate(task.due_date)}
                </span>
              ) : null}
              {task.recurrence !== 'one_time' && (
                <span className="flex items-center gap-0.5 text-xs text-ink-tertiary">
                  <RotateCcw size={10} />
                  {RECURRENCE_LABELS[task.recurrence]}
                </span>
              )}
              {task.estimated_cost && (
                <span className="text-xs text-ink-tertiary">{formatCurrency(task.estimated_cost)}</span>
              )}
              {isClaimed && (
                <span className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full ${isMine ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-ink-secondary'}`}>
                  <User size={10} />
                  {isMine ? 'You' : assigneeLabel}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {!isDone && (
          <button
            onClick={handleClaim}
            aria-label={isMine ? `Unclaim ${task.title}` : isClaimed ? `Take over ${task.title}` : `Claim ${task.title}`}
            title={isMine ? 'Unclaim' : isClaimed ? 'Take over' : 'Claim'}
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center border-2 transition-all ${
              isMine
                ? 'bg-brand-500 border-brand-500 text-white'
                : 'border-brand-500 text-brand-500 active:bg-brand-50'
            }`}
          >
            <UserPlus size={13} strokeWidth={2.5} />
          </button>
        )}
        {isDone ? (
          <button
            onClick={handleUncomplete}
            aria-label={`Mark ${task.title} as not completed`}
            title="Mark as not completed"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-status-green border-2 border-status-green text-white flex items-center justify-center active:opacity-80 transition-all"
          >
            <Check size={13} strokeWidth={3} />
          </button>
        ) : (
          <button
            onClick={openCompleteSheet}
            aria-label={`Mark ${task.title} complete`}
            title="Mark complete"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-status-green text-status-green flex items-center justify-center active:bg-status-green active:text-white transition-all"
          >
            <Check size={13} strokeWidth={3} />
          </button>
        )}
        <button
          onClick={handleDelete}
          aria-label={`Delete ${task.title}`}
          title="Delete task"
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-status-red text-status-red flex items-center justify-center active:bg-status-red active:text-white transition-all"
        >
          <Trash2 size={13} />
        </button>
        <ChevronRight size={16} className="text-ink-tertiary hidden sm:block" />
      </div>
    </button>

    {/* Complete-task sheet — opens when the user taps the green check
        on a pending task. Pre-fills with the task's estimates so a
        single tap of "Complete" still works for the common case. */}
    {showCompleteSheet && (
      <div
        className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4 animate-fade-in"
        onClick={() => !completing && setShowCompleteSheet(false)}
      >
        <div
          className="bg-white rounded-ios-lg w-full max-w-md shadow-xl animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[15px] font-semibold truncate">Log: {task.title}</p>
            <button
              onClick={() => setShowCompleteSheet(false)}
              disabled={completing}
              className="p-1 text-ink-tertiary"
            >
              <X size={20} />
            </button>
          </div>
          <div className="px-4 py-3 space-y-3">
            <p className="text-[12px] text-ink-secondary">
              Override the cost or time if it differs from the estimate. Leave
              blank to skip.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">
                  Actual Cost ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={completeCost}
                  onChange={(e) => setCompleteCost(e.target.value)}
                  placeholder="0.00"
                  className="ios-input"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">
                  Actual Time (min)
                </label>
                <input
                  type="number"
                  min="0"
                  value={completeMinutes}
                  onChange={(e) => setCompleteMinutes(e.target.value)}
                  placeholder="30"
                  className="ios-input"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">
                Notes (optional)
              </label>
              <textarea
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                rows={2}
                placeholder="Vendor, observations, follow-ups…"
                className="ios-input resize-none"
              />
            </div>
            {/* Photos — optional. Stored in the public 'photos' bucket
                with the URLs written to task_history.photos. */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1 block">
                Photos (optional)
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setCompletePhotos(Array.from(e.target.files || []))}
                className="text-xs"
              />
              {completePhotos.length > 0 && (
                <p className="text-[11px] text-ink-tertiary mt-1">
                  {completePhotos.length} photo{completePhotos.length === 1 ? '' : 's'} ready to upload.
                </p>
              )}
            </div>
          </div>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
            <button
              onClick={() => setShowCompleteSheet(false)}
              disabled={completing}
              className="flex-1 py-2.5 rounded-ios bg-white border border-gray-200 text-sm font-semibold text-ink-secondary md:hover:bg-gray-50 active:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={submitComplete}
              disabled={completing}
              className="flex-1 py-2.5 rounded-ios bg-status-green text-white text-sm font-semibold active:opacity-80 md:hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {completing ? 'Logging…' : 'Complete'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
