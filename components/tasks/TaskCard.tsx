'use client';
import { Task } from '@/lib/types';
import { getTaskUrgency, urgencyColor, sectionColorForTask, CATEGORY_ICONS, RECURRENCE_LABELS, formatCurrency, emojiForTaskTitle } from '@/lib/constants';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';
import { Check, ChevronRight, RotateCcw, UserPlus, User, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

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

  const handleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) return;
    if (!confirm(`Mark "${task.title}" as completed?`)) return;

    const { error } = await supabase.rpc('complete_task', {
      p_task_id: task.id,
      p_user_id: user.id,
      p_notes: null,
      p_cost: task.estimated_cost,
      p_duration: task.estimated_minutes,
    });

    if (error) {
      toast.error('Failed to complete task');
    } else {
      toast.success('Task completed!');
      onComplete?.();
    }
  };

  const handleClaim = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) return;
    const claimMsg = isMine
      ? `Unclaim "${task.title}"?`
      : isClaimed
      ? `Take over "${task.title}" from ${assigneeLabel || 'the current owner'}?`
      : `Claim "${task.title}"?`;
    if (!confirm(claimMsg)) return;

    const { data, error } = await supabase.rpc('toggle_task_claim', {
      p_task_id: task.id,
      p_user_id: user.id,
    });

    if (error || (data && (data as any).error)) {
      toast.error('Failed to update task');
    } else {
      const nowAssigned = (data as any)?.assigned_to;
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
    if (!confirm(`Mark "${task.title}" as not completed?`)) return;
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
    await supabase.from('task_history').delete().eq('task_id', task.id);
    toast.success('Marked as not completed');
    onComplete?.();
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm(`Delete "${task.title}"?`)) return;
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
            title="Mark as not completed"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-status-green border-2 border-status-green text-white flex items-center justify-center active:opacity-80 transition-all"
          >
            <Check size={13} strokeWidth={3} />
          </button>
        ) : (
          <button
            onClick={handleComplete}
            title="Mark complete"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-status-green text-status-green flex items-center justify-center active:bg-status-green active:text-white transition-all"
          >
            <Check size={13} strokeWidth={3} />
          </button>
        )}
        <button
          onClick={handleDelete}
          title="Delete task"
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-status-red text-status-red flex items-center justify-center active:bg-status-red active:text-white transition-all"
        >
          <Trash2 size={13} />
        </button>
        <ChevronRight size={16} className="text-ink-tertiary hidden sm:block" />
      </div>
    </button>
  );
}
