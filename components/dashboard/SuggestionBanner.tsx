'use client';
import { useMemo } from 'react';
import { Task } from '@/lib/types';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import { Sparkles, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SuggestionBanner() {
  const { tasks, removeTask, updateTask } = useStore();
  const supabase = createClient();

  const suggestions = useMemo(() => {
    const realTitles = new Set(
      tasks
        .filter((t) => !t.is_suggestion && t.status !== 'skipped')
        .map((t) => t.title.trim().toLowerCase())
    );
    return tasks.filter(
      (t) =>
        t.is_suggestion &&
        t.status === 'pending' &&
        !realTitles.has(t.title.trim().toLowerCase())
    );
  }, [tasks]);

  if (suggestions.length === 0) return null;

  const acceptSuggestion = async (task: Task) => {
    const { data, error } = await supabase
      .from('tasks')
      .update({ is_suggestion: false })
      .eq('id', task.id)
      .select('*, categories(*)')
      .single();
    if (error) {
      toast.error('Failed');
    } else {
      updateTask(data);
      toast.success('Task added to your list');
    }
  };

  const dismissSuggestion = async (task: Task) => {
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (!error) removeTask(task.id);
  };

  return (
    <div className="mx-4 mb-4 animate-slide-up">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles size={14} className="text-amber-500" />
        <span className="text-xs font-semibold text-ink-secondary uppercase tracking-wide">
          Suggested Tasks ({suggestions.length})
        </span>
      </div>
      <div className="ios-card overflow-hidden divide-y divide-gray-50">
        {suggestions.slice(0, 3).map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{s.title}</p>
              <p className="text-xs text-ink-tertiary truncate">{s.description}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => acceptSuggestion(s)}
                className="w-8 h-8 rounded-full bg-status-green/10 flex items-center justify-center text-status-green active:bg-status-green active:text-white transition-colors"
              >
                <Check size={16} strokeWidth={2.5} />
              </button>
              <button
                onClick={() => dismissSuggestion(s)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-ink-tertiary active:bg-red-50 active:text-red-500 transition-colors"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
