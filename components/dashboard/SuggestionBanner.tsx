'use client';
import { useMemo, useState } from 'react';
import { Task } from '@/lib/types';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import { Sparkles, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { confirm } from '@/lib/confirm';

export default function SuggestionBanner() {
  const {
    tasks,
    home,
    user,
    dismissedSuggestions,
    setDismissedSuggestions,
    removeTask,
    updateTask,
  } = useStore();
  const supabase = createClient();
  const [expanded, setExpanded] = useState(false);

  const suggestions = useMemo(() => {
    // Stop-words that don't carry meaning when comparing task titles
    // ("Annual HVAC Service" should match "Bi-Annual HVAC Service" via
    // "hvac"+"service", not be defeated by both having "annual").
    const STOP = new Set([
      'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your',
      'have', 'will', 'check', 'inspect', 'service', 'maintenance',
      'replace', 'change', 'clean', 'test', 'annual', 'monthly',
      'yearly', 'quarterly', 'every',
    ]);
    const keywords = (title: string): Set<string> => {
      const out = new Set<string>();
      for (const w of title.toLowerCase().split(/\W+/)) {
        if (w.length >= 4 && !STOP.has(w)) out.add(w);
      }
      return out;
    };
    const overlaps = (a: Set<string>, b: Set<string>) => {
      for (const w of a) if (b.has(w)) return true;
      return false;
    };

    const realTasks = tasks.filter(
      (t) => !t.is_suggestion && t.status !== 'skipped'
    );
    const realTitles = new Set(
      realTasks.map((t) => t.title.trim().toLowerCase())
    );

    const dismissedSet = new Set(dismissedSuggestions);

    return tasks.filter((t) => {
      if (!t.is_suggestion || t.status !== 'pending') return false;
      // Persistently dismissed → never show again, even though
      // generate_suggestions re-inserts it on every profile save.
      if (dismissedSet.has(t.title.trim().toLowerCase())) return false;
      // Exact title match → already covered.
      if (realTitles.has(t.title.trim().toLowerCase())) return false;
      // Same-category keyword overlap → user already has a task for this
      // (e.g. "Replace Air Filters" makes "Change HVAC Filter" redundant
      // because both are HVAC-category and share "filter").
      const sKw = keywords(t.title);
      if (sKw.size === 0) return true;
      const dup = realTasks.some(
        (other) =>
          (!t.category_id || other.category_id === t.category_id) &&
          overlaps(sKw, keywords(other.title))
      );
      return !dup;
    });
  }, [tasks, dismissedSuggestions]);

  if (suggestions.length === 0) return null;

  const acceptSuggestion = async (task: Task) => {
    // Defensive: a suggestion with recurrence='custom' must have
    // recurrence_days. The generator always sets it, but if a future
    // path ever produced a custom suggestion without one, accepting
    // it would crash complete_task() down the line. Default to a
    // safe yearly cadence in that edge case.
    const patch: Record<string, any> = { is_suggestion: false };
    if (
      task.recurrence === 'custom' &&
      (task.recurrence_days == null || task.recurrence_days <= 0)
    ) {
      patch.recurrence = 'yearly';
      patch.recurrence_days = null;
    }
    const { data, error } = await supabase
      .from('tasks')
      .update(patch as any)
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
    const ok = await confirm({
      title: `Dismiss "${task.title}"?`,
      message: "We won't suggest this again.",
      confirmLabel: 'Dismiss',
    });
    if (!ok) return;
    if (!home) return;

    // Record the dismissal so generate_suggestions() re-creating the
    // row next time a profile is saved doesn't bring it back.
    const titleKey = task.title.trim().toLowerCase();
    const { error: dErr } = await supabase
      .from('suggestion_dismissals')
      .upsert(
        {
          home_id: home.id,
          title: task.title.trim(),
          dismissed_by: user?.id || null,
        } as any,
        { onConflict: 'home_id,title' } as any
      );
    if (dErr) {
      toast.error('Could not dismiss');
      return;
    }
    if (!dismissedSuggestions.includes(titleKey)) {
      setDismissedSuggestions([...dismissedSuggestions, titleKey]);
    }

    // Drop the actual row so the banner doesn't render it until the
    // next regeneration anyway.
    await supabase.from('tasks').delete().eq('id', task.id);
    removeTask(task.id);
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
        {(expanded ? suggestions : suggestions.slice(0, 3)).map((s) => (
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
        {suggestions.length > 3 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full px-4 py-2.5 text-xs font-semibold text-brand-600 active:bg-gray-50 md:hover:bg-gray-50 transition-colors"
          >
            {expanded
              ? 'Show fewer'
              : `Show ${suggestions.length - 3} more`}
          </button>
        )}
      </div>
    </div>
  );
}
