'use client';
import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import { useAppInit } from '@/hooks/useAppInit';
import PageHeader from '@/components/layout/PageHeader';
import { RECURRENCE_LABELS, CATEGORY_ICONS, categoryFromTitle, recurrenceFromTitle } from '@/lib/constants';
import { Recurrence, Priority, Task } from '@/lib/types';
import { Trash2, FileText, ChevronRight, Calendar as CalendarIcon, ChevronLeft } from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday,
  parseISO,
} from 'date-fns';
import toast from 'react-hot-toast';
import { confirm } from '@/lib/confirm';

function InlineCalendar({
  value,
  onChange,
  maxDate,
}: {
  value: string;
  onChange: (next: string) => void;
  maxDate?: string;
}) {
  const initial = value ? parseISO(value) : new Date();
  const [month, setMonth] = useState(initial);

  const days = useMemo(() => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    return eachDayOfInterval({
      start: startOfWeek(monthStart),
      end: endOfWeek(monthEnd),
    });
  }, [month]);

  const selected = value ? parseISO(value) : null;
  const max = maxDate ? parseISO(maxDate) : null;
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="ios-card mt-2 p-3">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setMonth(subMonths(month, 1))}
          className="p-1.5 text-ink-secondary active:text-brand-500"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold">{format(month, 'MMMM yyyy')}</span>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          className="p-1.5 text-ink-secondary active:text-brand-500"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {dayLabels.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-ink-tertiary py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const inMonth = isSameMonth(day, month);
          const isSelected = selected && isSameDay(day, selected);
          const today = isToday(day);
          const disabled = max ? day > max : false;
          return (
            <button
              key={dateStr}
              type="button"
              disabled={disabled}
              onClick={() => onChange(dateStr)}
              className={`relative flex items-center justify-center py-2 rounded-lg text-sm transition-colors ${
                isSelected
                  ? 'bg-brand-500 text-white font-semibold'
                  : today
                  ? 'bg-brand-50 text-brand-600 font-semibold'
                  : 'active:bg-gray-100'
              } ${!inMonth ? 'opacity-30' : ''} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AddTaskForm() {
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const router = useRouter();
  const supabase = createClient();
  const { home, user, categories, tasks, appliances, documents, members, history } = useStore();
  const { loadData } = useAppInit();

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [completedOn, setCompletedOn] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [sourceDocumentId, setSourceDocumentId] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<Recurrence>('one_time');
  const [recurrenceDays, setRecurrenceDays] = useState('');
  const [notes, setNotes] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [applianceId, setApplianceId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(true);
  const [dirty, setDirty] = useState(false);

  // Track whether the user has manually picked the category or
  // recurrence. Until they do, we auto-fill those fields from the
  // task title — but the moment they touch them, we stop overriding
  // their choice. Saves a couple of taps per task for power users.
  const [userTouchedCategory, setUserTouchedCategory] = useState(false);
  const [userTouchedRecurrence, setUserTouchedRecurrence] = useState(false);
  const [userTouchedDueDate, setUserTouchedDueDate] = useState(false);
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);

  // Pool of past titles — both pending tasks and completed history
  // rows — for the title autocomplete. Deduped (case-insensitive)
  // with the longer/more specific casing winning when there's a tie.
  const titleSuggestions = useMemo(() => {
    if (editId) return [] as string[];
    const seen = new Map<string, string>();
    const consider = (raw: string | null | undefined) => {
      if (!raw) return;
      const trimmed = raw.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      const prev = seen.get(key);
      if (!prev || prev.length < trimmed.length) seen.set(key, trimmed);
    };
    for (const t of tasks) consider(t.title);
    for (const h of history) consider(h.title);
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [tasks, history, editId]);

  // What we actually render under the input — filter to titles
  // containing the current draft (case-insensitive), exclude exact
  // match, cap at 5 to keep the dropdown calm.
  const filteredSuggestions = useMemo(() => {
    const q = title.trim().toLowerCase();
    if (q.length < 2) return [];
    return titleSuggestions
      .filter((s) => {
        const sl = s.toLowerCase();
        return sl !== q && sl.includes(q);
      })
      .slice(0, 5);
  }, [titleSuggestions, title]);

  useEffect(() => {
    setEditMode(!editId);
  }, [editId]);

  // Anything the user typed counts as "dirty" — used by the back
  // button to warn before silently discarding their work.
  useEffect(() => {
    if (!editMode && editId) {
      // In view mode for an existing task; nothing to save.
      setDirty(false);
      return;
    }
    const hasContent =
      title.trim() !== '' ||
      notes.trim() !== '' ||
      estimatedMinutes !== '' ||
      estimatedCost !== '' ||
      categoryId !== '' ||
      assignedTo !== '' ||
      applianceId !== '' ||
      dueDate !== '' ||
      completedOn !== '' ||
      isCompleted ||
      recurrence !== 'one_time' ||
      priority !== 'medium';
    setDirty(hasContent);
  }, [title, notes, estimatedMinutes, estimatedCost, categoryId, assignedTo, applianceId, dueDate, completedOn, isCompleted, recurrence, priority, editMode, editId]);

  const confirmBack = async () => {
    if (!dirty) {
      router.back();
      return;
    }
    const ok = await confirm({
      title: 'Discard changes?',
      message: "Anything you typed will be lost.",
      confirmLabel: 'Discard',
      destructive: true,
    });
    if (ok) {
      router.back();
    }
  };

  // Calendar's empty-day "+ Add task on Jun 14" button stashes the
  // chosen date in sessionStorage. Pick it up on mount so the form
  // opens with that date pre-selected.
  useEffect(() => {
    if (editId || typeof window === 'undefined') return;
    const prefilled = sessionStorage.getItem('homekeeper.prefilledDueDate');
    if (prefilled) {
      setDueDate(prefilled);
      sessionStorage.removeItem('homekeeper.prefilledDueDate');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // Auto-detect category + recurrence from title keywords. Stops the
  // moment the user manually overrides either field, and never runs
  // when editing an existing task (we trust whatever they saved).
  useEffect(() => {
    if (editId) return;
    if (!userTouchedCategory) {
      const guess = categoryFromTitle(title, categories);
      if (guess && guess !== categoryId) setCategoryId(guess);
    }
    if (!userTouchedRecurrence) {
      const guess = recurrenceFromTitle(title);
      if (guess && guess !== recurrence) setRecurrence(guess);
    }
    // categories list is stable; intentionally not in deps to avoid
    // re-running on unrelated store updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, userTouchedCategory, userTouchedRecurrence, editId]);

  // Smart default due date based on recurrence. When the user picks
  // a recurring cadence and hasn't already chosen a date, we suggest
  // one full cycle from today — a "Yearly" task lands in 12 months,
  // a "Quarterly" task in 3, etc. Saves a step for the very common
  // case of "schedule the next one of these".
  useEffect(() => {
    if (editId || isCompleted) return;
    if (userTouchedDueDate || dueDate) return;
    const offset: Record<string, number> = {
      weekly: 7,
      bi_monthly: 60,
      monthly: 30,
      quarterly: 91,
      bi_annual: 182,
      yearly: 365,
    };
    const days = offset[recurrence];
    if (!days) return;
    const target = new Date();
    target.setDate(target.getDate() + days);
    setDueDate(target.toISOString().slice(0, 10));
    // Mark untouched so further recurrence changes can keep updating
    // it. (touched flag flips only when the user clicks a date chip
    // or the calendar.)
  }, [recurrence, editId, isCompleted, userTouchedDueDate, dueDate]);

  // Load existing task for editing
  useEffect(() => {
    if (editId) {
      const task = tasks.find((t) => t.id === editId);
      if (task) {
        setTitle(task.title);
        setCategoryId(task.category_id || '');
        setDueDate(task.due_date || '');
        setRecurrence(task.recurrence);
        setRecurrenceDays(task.recurrence_days?.toString() || '');
        setNotes(task.notes || '');
        setEstimatedMinutes(task.estimated_minutes?.toString() || '');
        setEstimatedCost(task.estimated_cost?.toString() || '');
        setPriority(task.priority);
        setApplianceId(task.appliance_id || '');
        // For completed tasks that were never claimed, default the Owner
        // display to whoever completed it so it doesn't say 'Unassigned'.
        const effectiveOwner =
          (task as any).assigned_to ||
          (task.status === 'completed' ? task.completed_by : null) ||
          '';
        setAssignedTo(effectiveOwner);
        setSourceDocumentId(task.source_document_id || null);
        const done = task.status === 'completed';
        setIsCompleted(done);
        setCompletedOn(done && task.completed_at ? task.completed_at.slice(0, 10) : '');
      }
    }
  }, [editId, tasks]);

  const linkedSource = sourceDocumentId
    ? documents.find((d) => d.id === sourceDocumentId) || null
    : null;

  const openSource = async () => {
    if (!linkedSource) return;
    const popup = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(linkedSource.file_path, 60 * 5);
      if (error || !data) throw new Error('Could not open source document');
      if (popup && !popup.closed) {
        popup.location.href = data.signedUrl;
      } else {
        window.location.href = data.signedUrl;
      }
    } catch (err: any) {
      if (popup && !popup.closed) popup.close();
      toast.error(err?.message || 'Could not open source document');
    }
  };

  const nextDueFromCompleted = (completedDate: string, rec: Recurrence): string | null => {
    if (rec === 'one_time' || !completedDate) return null;
    const base = new Date(completedDate + 'T00:00:00');
    const addMonths = (d: Date, m: number) => {
      const out = new Date(d);
      out.setMonth(out.getMonth() + m);
      return out;
    };
    let next: Date;
    switch (rec) {
      case 'weekly': next = new Date(base.getTime() + 7 * 86400000); break;
      case 'bi_monthly': next = addMonths(base, 2); break;
      case 'monthly': next = addMonths(base, 1); break;
      case 'quarterly': next = addMonths(base, 3); break;
      case 'bi_annual': next = addMonths(base, 6); break;
      case 'yearly': next = addMonths(base, 12); break;
      case 'custom': {
        const days = recurrenceDays ? parseInt(recurrenceDays) : 0;
        if (!days) return null;
        next = new Date(base.getTime() + days * 86400000);
        break;
      }
      default: return null;
    }
    return next.toISOString().slice(0, 10);
  };

  const handleSave = async (opts: { addAnother?: boolean } = {}) => {
    if (!title.trim() || !home) return;
    setSaving(true);

    const completedAtIso = isCompleted && completedOn ? `${completedOn}T12:00:00Z` : null;

    const payload: any = {
      home_id: home.id,
      title: title.trim(),
      category_id: categoryId || null,
      // When the user is logging an "already done" task, the dueDate
      // state is unused — clear it so the saved record doesn't carry a
      // stale future date. The next occurrence (for recurring tasks)
      // is inserted separately with its own due_date below.
      due_date: isCompleted ? null : (dueDate || null),
      recurrence,
      recurrence_days: recurrence === 'custom' && recurrenceDays ? parseInt(recurrenceDays) : null,
      notes: notes || null,
      estimated_minutes: estimatedMinutes ? parseInt(estimatedMinutes) : null,
      estimated_cost: estimatedCost ? parseFloat(estimatedCost) : null,
      priority,
      appliance_id: applianceId || null,
      assigned_to: assignedTo || null,
      created_by: user?.id,
    };

    if (isCompleted) {
      payload.status = 'completed';
      payload.completed_at = completedAtIso || new Date().toISOString();
      payload.completed_by = user?.id;
    } else {
      payload.status = 'pending';
      payload.completed_at = null;
      payload.completed_by = null;
    }

    try {
      if (editId) {
        const { error } = await supabase.from('tasks').update(payload as any).eq('id', editId);
        if (error) throw error;

        if (isCompleted && completedAtIso) {
          // Update only the most recent history row's completed_at, so
          // older completions of a recurring task aren't all rewritten
          // to the new date.
          const { data: latestHist } = await supabase
            .from('task_history')
            .select('id')
            .eq('task_id', editId)
            .order('completed_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latestHist) {
            await supabase
              .from('task_history')
              .update({ completed_at: completedAtIso })
              .eq('id', (latestHist as any).id);
          } else {
            await supabase.from('task_history').insert({
              task_id: editId,
              home_id: home.id,
              title: title.trim(),
              category_name:
                categories.find((c) => c.id === categoryId)?.name || null,
              completed_by: user?.id || null,
              completed_by_name: user?.display_name || null,
              completed_at: completedAtIso,
              cost: estimatedCost ? parseFloat(estimatedCost) : null,
            });
          }
        } else if (!isCompleted) {
          // Unchecking completed: only remove the most recent history
          // row, preserving older recurring completions.
          const { data: latest } = await supabase
            .from('task_history')
            .select('id')
            .eq('task_id', editId)
            .order('completed_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latest) {
            await supabase.from('task_history').delete().eq('id', (latest as any).id);
          }
        }

        toast.success('Task updated');
      } else {
        const { data: inserted, error } = await supabase
          .from('tasks')
          .insert(payload as any)
          .select()
          .single();
        if (error) throw error;
        if (isCompleted && inserted) {
          await supabase.from('task_history').insert({
            task_id: (inserted as any).id,
            home_id: home.id,
            title: title.trim(),
            category_name:
              categories.find((c) => c.id === categoryId)?.name || null,
            completed_by: user?.id || null,
            completed_by_name: user?.display_name || null,
            completed_at: completedAtIso || new Date().toISOString(),
            cost: estimatedCost ? parseFloat(estimatedCost) : null,
          });

          // Recurring task logged as already-done: create the next
          // occurrence so it shows up in Future / Upcoming. Without
          // this, the user just sees a one-off completed row and the
          // recurrence is effectively dropped.
          if (recurrence !== 'one_time') {
            const baseDate = completedOn || new Date().toISOString().slice(0, 10);
            const nextDue = nextDueFromCompleted(baseDate, recurrence);
            if (nextDue) {
              // Don't double-insert if a pending sibling with the same
              // title is already scheduled. If one exists with an
              // earlier due_date (or none), bump it forward; otherwise
              // leave it alone.
              const normalized = title.trim().toLowerCase();
              const { data: existingRows } = await supabase
                .from('tasks')
                .select('id, due_date')
                .eq('home_id', home.id)
                .eq('status', 'pending')
                .ilike('title', title.trim());
              const sibling = (existingRows || []).find(
                (r: any) => (r.title || '').trim().toLowerCase() === normalized
              ) || (existingRows && existingRows[0]);
              if (sibling) {
                if (!(sibling as any).due_date || (sibling as any).due_date < nextDue) {
                  await supabase
                    .from('tasks')
                    .update({ due_date: nextDue, updated_at: new Date().toISOString() })
                    .eq('id', (sibling as any).id);
                }
              } else {
                await supabase.from('tasks').insert({
                  home_id: home.id,
                  title: title.trim(),
                  category_id: categoryId || null,
                  due_date: nextDue,
                  recurrence,
                  recurrence_days: recurrence === 'custom' && recurrenceDays
                    ? parseInt(recurrenceDays) : null,
                  notes: notes || null,
                  estimated_minutes: estimatedMinutes ? parseInt(estimatedMinutes) : null,
                  estimated_cost: estimatedCost ? parseFloat(estimatedCost) : null,
                  priority,
                  appliance_id: applianceId || null,
                  assigned_to: assignedTo || null,
                  created_by: user?.id,
                  status: 'pending',
                } as any);
              }
            }
          }
        }
        toast.success(isCompleted ? 'Logged completed task' : 'Task created');
        await loadData();
        if (opts.addAnother) {
          // Power-user batch entry — clear the form and refocus the
          // title input instead of routing away.
          setTitle('');
          setNotes('');
          setEstimatedMinutes('');
          setEstimatedCost('');
          setApplianceId('');
          setSourceDocumentId(null);
          setIsCompleted(false);
          setCompletedOn('');
          setUserTouchedCategory(false);
          setUserTouchedRecurrence(false);
          setUserTouchedDueDate(false);
          setRecurrence('one_time');
          setPriority('medium');
          // Keep the due date so a string of related tasks stay aligned.
          if (typeof window !== 'undefined') {
            const titleInput = document.querySelector<HTMLInputElement>(
              'input[type="text"][maxlength="120"]'
            );
            titleInput?.focus();
          }
          setSaving(false);
          return;
        }
        // For a freshly created task, drop the user back on the
        // dashboard so they see the new row in context. For edits we
        // already returned earlier (edit mode flips to view in place).
        router.push('/dashboard');
        return;
      }
      await loadData();
      setEditMode(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editId) return;
    const ok = await confirm({
      title: 'Delete this task?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    const { error } = await supabase.from('tasks').delete().eq('id', editId);
    if (error) {
      toast.error('Failed to delete');
    } else {
      toast.success('Task deleted');
      loadData();
      router.push('/dashboard');
    }
  };

  const activeCategories = categories.filter((c) => c.is_default || c.home_id === home?.id);

  return (
    <div>
      <PageHeader
        title={editId ? 'Task' : 'New Task'}
        back
        onBack={confirmBack}
        rightAction={
          editId ? (
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  if (editMode) await handleSave();
                  else setEditMode(true);
                }}
                disabled={saving}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 ${
                  editMode
                    ? 'bg-brand-500 text-white active:bg-brand-600'
                    : 'bg-brand-50 text-brand-600 active:bg-brand-100 border border-brand-200'
                }`}
              >
                {editMode ? (saving ? 'Saving…' : 'Save') : '✏️ Edit'}
              </button>
              <button onClick={handleDelete} className="text-status-red p-1" title="Delete task">
                <Trash2 size={20} />
              </button>
            </div>
          ) : null
        }
      />

      <div className="px-4 py-4 space-y-4 md:max-w-2xl md:mx-auto">
        {linkedSource && (
          <button
            onClick={openSource}
            className="ios-card flex items-center gap-3 p-3 active:bg-gray-50 w-full text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-500 flex items-center justify-center flex-shrink-0">
              <FileText size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ink-secondary">Source document</p>
              <p className="text-[14px] font-medium truncate">{linkedSource.title}</p>
            </div>
            <ChevronRight size={16} className="text-ink-tertiary" />
          </button>
        )}

        <fieldset
          disabled={!!editId && !editMode}
          className="m-0 p-0 border-0 min-w-0 space-y-4 disabled:opacity-100"
        >

        {/* Title — the form's hero input. Promoted with larger
            type, semibold weight, and a brighter focus ring so it
            reads as the primary field instead of one input among many. */}
        <div className="relative">
          <label className="text-micro font-semibold text-ink-secondary uppercase tracking-wider mb-2 block">
            Task Name *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setShowTitleSuggestions(true);
            }}
            onFocus={() => setShowTitleSuggestions(true)}
            // Delay the close so a click on a suggestion still
            // registers before blur tears the dropdown down.
            onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 120)}
            placeholder="e.g. Change HVAC filter"
            className="w-full px-4 py-3.5 bg-white rounded-ios text-title font-semibold text-ink-primary
                       placeholder:text-ink-tertiary placeholder:font-normal
                       outline-none transition-shadow shadow-card
                       focus:ring-2 focus:ring-brand-400/60 focus:shadow-card-hover"
            maxLength={120}
            autoFocus={!editId}
          />
          {/* Title autocomplete — past task titles you've used. Saves
              repeated typing for recurring chores or near-duplicates. */}
          {showTitleSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-ios shadow-elevated border border-gray-100 overflow-hidden z-20 animate-slide-down">
              {filteredSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  // Use mousedown so the suggestion fires before the
                  // input's blur handler closes the dropdown.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setTitle(s);
                    setShowTitleSuggestions(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-body text-ink-primary border-b border-gray-50 last:border-b-0 active:bg-gray-50 md:hover:bg-gray-50 transition-colors truncate"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Category */}
        <div>
          <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1.5 block">Category</label>
          <div className="flex flex-wrap gap-2">
            {activeCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setUserTouchedCategory(true);
                  setCategoryId(categoryId === cat.id ? '' : cat.id);
                }}
                className={`px-3 py-2 rounded-ios text-sm font-medium transition-colors ${
                  categoryId === cat.id
                    ? 'bg-brand-500 text-white'
                    : 'bg-surface-secondary text-ink-secondary active:bg-surface-tertiary'
                }`}
              >
                {CATEGORY_ICONS[cat.icon] || '🔧'} {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setIsCompleted((v) => !v)}
            className="ios-list-item w-full bg-white rounded-ios shadow-card"
          >
            <span className="text-[15px]">Already done?</span>
            <div className={`w-12 h-7 rounded-full transition-colors relative ${isCompleted ? 'bg-status-green' : 'bg-gray-200'}`}>
              <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${isCompleted ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </button>
        </div>

        {isCompleted ? (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide">
                Completed On
              </label>
              <span className="text-[15px] font-medium">
                {completedOn
                  ? format(parseISO(completedOn), 'MMM d, yyyy')
                  : <span className="text-ink-tertiary">Pick a date</span>}
              </span>
            </div>
            <InlineCalendar
              value={completedOn}
              onChange={setCompletedOn}
              maxDate={new Date().toISOString().slice(0, 10)}
            />
            {completedOn && (
              <button
                type="button"
                onClick={() => setCompletedOn('')}
                className="mt-2 text-xs text-ink-secondary md:hover:text-brand-500 active:text-brand-500 transition-colors"
              >
                Clear date
              </button>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide">
                Due Date
              </label>
              <span className="text-[15px] font-medium">
                {dueDate
                  ? format(parseISO(dueDate), 'MMM d, yyyy')
                  : <span className="text-ink-tertiary">No date</span>}
              </span>
            </div>
            {/* Quick-pick shortcuts that cover the common cases so the
                user doesn't have to scrub the calendar for "today" or
                "next month". */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[
                { label: 'Today', daysFromNow: 0 },
                { label: 'Tomorrow', daysFromNow: 1 },
                { label: 'Next week', daysFromNow: 7 },
                { label: 'Next month', daysFromNow: 30 },
              ].map(({ label, daysFromNow }) => {
                const target = new Date();
                target.setDate(target.getDate() + daysFromNow);
                const targetStr = target.toISOString().slice(0, 10);
                const active = dueDate === targetStr;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setUserTouchedDueDate(true);
                      setDueDate(targetStr);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-brand-500 text-white'
                        : 'bg-surface-secondary text-ink-secondary md:hover:bg-surface-tertiary active:bg-surface-tertiary'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <InlineCalendar
              value={dueDate}
              onChange={(d: string) => {
                setUserTouchedDueDate(true);
                setDueDate(d);
              }}
            />
            {dueDate && (
              <button
                type="button"
                onClick={() => {
                  setUserTouchedDueDate(true);
                  setDueDate('');
                }}
                className="mt-2 text-xs text-ink-secondary md:hover:text-brand-500 active:text-brand-500 transition-colors"
              >
                Clear date
              </button>
            )}
          </div>
        )}

        {/* Recurrence */}
        <div>
          <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1.5 block">Recurrence</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(RECURRENCE_LABELS) as [Recurrence, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setUserTouchedRecurrence(true);
                  setRecurrence(key);
                }}
                className={`px-3 py-2.5 rounded-ios text-sm font-medium transition-colors ${
                  recurrence === key
                    ? 'bg-brand-500 text-white'
                    : 'bg-surface-secondary text-ink-secondary active:bg-surface-tertiary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {recurrence === 'custom' && (
            <input
              type="number"
              value={recurrenceDays}
              onChange={(e) => setRecurrenceDays(e.target.value)}
              placeholder="Number of days between occurrences"
              className="ios-input mt-2"
            />
          )}
        </div>

        {/* Priority */}
        <div>
          <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1.5 block">Priority</label>
          <div className="grid grid-cols-3 gap-2">
            {(['low', 'medium', 'high'] as Priority[]).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`px-3 py-2.5 rounded-ios text-sm font-medium capitalize transition-colors ${
                  priority === p
                    ? p === 'high' ? 'bg-status-red text-white'
                    : p === 'medium' ? 'bg-status-yellow text-white'
                    : 'bg-status-green text-white'
                    : 'bg-surface-secondary text-ink-secondary'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Cost & Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1.5 block">Est. Time (min)</label>
            <input
              type="number"
              min="0"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              placeholder="30"
              className="ios-input"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1.5 block">Est. Cost ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
              placeholder="25.00"
              className="ios-input"
            />
          </div>
        </div>

        {/* Owner */}
        <div>
          <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1.5 block">Owner</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setAssignedTo('')}
              className={`px-3 py-2 rounded-ios text-sm font-medium transition-colors ${
                !assignedTo
                  ? 'bg-brand-500 text-white'
                  : 'bg-surface-secondary text-ink-secondary active:bg-surface-tertiary'
              }`}
            >
              Unassigned
            </button>
            {members.map((m: any) => {
              const isMe = m.user_id === user?.id;
              const label = isMe
                ? 'You'
                : m.display_name || m.email?.split('@')[0] || 'Member';
              const selected = assignedTo === m.user_id;
              return (
                <button
                  key={m.user_id}
                  onClick={() => setAssignedTo(m.user_id)}
                  className={`px-3 py-2 rounded-ios text-sm font-medium transition-colors ${
                    selected
                      ? 'bg-brand-500 text-white'
                      : 'bg-surface-secondary text-ink-secondary active:bg-surface-tertiary'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Linked Appliance */}
        {appliances.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1.5 block">Linked Appliance</label>
            <select
              value={applianceId}
              onChange={(e) => setApplianceId(e.target.value)}
              className="ios-input"
            >
              <option value="">None</option>
              {[...appliances]
                .sort((a, b) =>
                  (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
            </select>
            {applianceId && editId && !editMode && (
              <button
                type="button"
                onClick={() => router.push(`/appliances?edit=${applianceId}`)}
                className="text-xs text-brand-500 mt-1.5 md:hover:underline"
              >
                Open this appliance →
              </button>
            )}
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1.5 block">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional details..."
            rows={3}
            className="ios-input resize-none"
          />
        </div>

        </fieldset>

        {/* Save — primary plus an optional "and add another" for batch entry. */}
        {(!editId || editMode) && (
          <div className="space-y-2">
            <button
              onClick={() => handleSave()}
              disabled={
                saving ||
                !title.trim() ||
                (recurrence === 'custom' && (!recurrenceDays || parseInt(recurrenceDays) <= 0))
              }
              className="ios-button"
            >
              {saving ? 'Saving...' : editId ? 'Update Task' : 'Create Task'}
            </button>
            {!editId && (
              <button
                type="button"
                onClick={() => handleSave({ addAnother: true })}
                disabled={
                  saving ||
                  !title.trim() ||
                  (recurrence === 'custom' && (!recurrenceDays || parseInt(recurrenceDays) <= 0))
                }
                className="w-full py-3 rounded-ios bg-brand-50 text-brand-600 text-body font-semibold active:bg-brand-100 active:scale-[0.98] md:hover:bg-brand-100 transition-all disabled:opacity-50"
              >
                Save & Add Another
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AddTaskPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><span className="text-ink-tertiary text-sm">Loading...</span></div>}>
      <AddTaskForm />
    </Suspense>
  );
}
