'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import { useAppInit } from '@/hooks/useAppInit';
import PageHeader from '@/components/layout/PageHeader';
import { RECURRENCE_LABELS, CATEGORY_ICONS } from '@/lib/constants';
import { Recurrence, Priority, Task } from '@/lib/types';
import { Trash2, FileText, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

function AddTaskForm() {
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const router = useRouter();
  const supabase = createClient();
  const { home, user, categories, tasks, appliances, documents, members } = useStore();
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
        setAssignedTo((task as any).assigned_to || '');
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

  const handleSave = async () => {
    if (!title.trim() || !home) return;
    setSaving(true);

    const completedAtIso = isCompleted && completedOn ? `${completedOn}T12:00:00Z` : null;

    const payload: any = {
      home_id: home.id,
      title: title.trim(),
      category_id: categoryId || null,
      due_date: dueDate || null,
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
          // Update existing history rows for this task; insert one if none.
          const { data: existingHist } = await supabase
            .from('task_history')
            .select('id')
            .eq('task_id', editId)
            .limit(1);
          if (existingHist && existingHist.length > 0) {
            await supabase
              .from('task_history')
              .update({ completed_at: completedAtIso })
              .eq('task_id', editId);
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
          // If unchecking completed, remove the history row(s).
          await supabase.from('task_history').delete().eq('task_id', editId);
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
        }
        toast.success(isCompleted ? 'Logged completed task' : 'Task created');
      }
      await loadData();
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editId) return;
    if (!confirm('Delete this task?')) return;

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
        title={editId ? 'Edit Task' : 'New Task'}
        back
        rightAction={
          editId ? (
            <button onClick={handleDelete} className="text-status-red p-1">
              <Trash2 size={20} />
            </button>
          ) : null
        }
      />

      <div className="px-4 py-4 space-y-4">
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

        {/* Title */}
        <div>
          <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1.5 block">Task Name *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Change HVAC filter"
            className="ios-input"
            autoFocus={!editId}
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1.5 block">Category</label>
          <div className="flex flex-wrap gap-2">
            {activeCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryId(categoryId === cat.id ? '' : cat.id)}
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
            <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1.5 block">Completed On</label>
            <input
              type="date"
              value={completedOn}
              onChange={(e) => setCompletedOn(e.target.value)}
              className="ios-input"
            />
          </div>
        ) : (
          <div>
            <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1.5 block">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="ios-input"
            />
          </div>
        )}

        {/* Recurrence */}
        <div>
          <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1.5 block">Recurrence</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(RECURRENCE_LABELS) as [Recurrence, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setRecurrence(key)}
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
              {appliances.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
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

        {/* Save */}
        <button onClick={handleSave} disabled={saving || !title.trim()} className="ios-button">
          {saving ? 'Saving...' : editId ? 'Update Task' : 'Create Task'}
        </button>
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
