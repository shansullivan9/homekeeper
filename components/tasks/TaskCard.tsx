'use client';
import { Task } from '@/lib/types';
import { getTaskUrgency, urgencyColor, CATEGORY_ICONS, RECURRENCE_LABELS } from '@/lib/constants';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';
import { Check, ChevronRight, RotateCcw, UserPlus, User } from 'lucide-react';
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
  const { user, members } = useStore();
  const router = useRouter();
  const supabase = createClient();
  const urgency = getTaskUrgency(task.due_date);
  const color = sectionColor || urgencyColor(urgency);
  const catIcon = task.categories?.icon ? (CATEGORY_ICONS[task.categories.icon] || '🔧') : '📋';

  const assignee = (task as any).assigned_to
    ? members.find((m: any) => m.user_id === (task as any).assigned_to)
    : null;
  const isMine = (task as any).assigned_to === user?.id;
  const isClaimed = !!(task as any).assigned_to;

  const formatDueDate = (date: string) => {
    const d = parseISO(date);
    if (isToday(d)) return 'Today';
    if (isTomorrow(d)) return 'Tomorrow';
    if (isPast(d)) return `Overdue · ${format(d, 'MMM d')}`;
    return format(d, 'MMM d');
  };

  const handleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) return;

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

  const assigneeLabel = assignee
    ? (assignee as any).display_name || (assignee as any).email?.split('@')[0] || 'Someone'
    : null;

  return (
    <button
      onClick={() => router.push(`/add-task?edit=${task.id}`)}
      className="w-full text-left ios-list-item group"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="flex-shrink-0 mt-0.5">
          <div className="urgency-dot" style={{ backgroundColor: color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{catIcon}</span>
            <p className={`font-medium text-[15px] truncate ${task.status === 'completed' ? 'line-through text-ink-tertiary' : ''}`}>
              {task.title}
            </p>
          </div>
          {compact && task.status === 'completed' && task.completed_at && (
            <p className="text-xs text-ink-tertiary mt-0.5">
              Completed {format(parseISO(task.completed_at), 'MMM d')}
            </p>
          )}
          {!compact && (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {task.due_date && (
                <span className="text-xs" style={{ color }}>
                  {formatDueDate(task.due_date)}
                </span>
              )}
              {task.recurrence !== 'one_time' && (
                <span className="flex items-center gap-0.5 text-xs text-ink-tertiary">
                  <RotateCcw size={10} />
                  {RECURRENCE_LABELS[task.recurrence]}
                </span>
              )}
              {task.estimated_cost && (
                <span className="text-xs text-ink-tertiary">${task.estimated_cost}</span>
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

      <div className="flex items-center gap-2 flex-shrink-0">
        {task.status !== 'completed' && !compact && (
          <button
            onClick={handleClaim}
            title={isMine ? 'Unclaim' : isClaimed ? 'Take over' : 'Claim'}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              isMine
                ? 'bg-brand-50 text-brand-600 border-2 border-brand-500'
                : 'border-2 border-gray-200 text-ink-tertiary active:bg-gray-100'
            }`}
          >
            <UserPlus size={14} strokeWidth={2.5} />
          </button>
        )}
        {task.status !== 'completed' && (
          <button
            onClick={handleComplete}
            title="Mark complete"
            className="w-8 h-8 rounded-full border-2 border-gray-200 flex items-center justify-center active:bg-status-green active:border-status-green active:text-white transition-all"
          >
            <Check size={14} strokeWidth={3} />
          </button>
        )}
        <ChevronRight size={16} className="text-ink-tertiary" />
      </div>
    </button>
  );
}
