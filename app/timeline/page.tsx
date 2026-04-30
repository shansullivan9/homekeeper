'use client';
import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import PageHeader from '@/components/layout/PageHeader';
import { TimelineEvent } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { Plus, X, Download, Wrench, RefreshCw, Hammer, PaintBucket, ShoppingBag, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/constants';
import { confirm } from '@/lib/confirm';

const EVENT_TYPES = [
  { value: 'maintenance', label: 'Maintenance', icon: Wrench, color: '#007AFF' },
  { value: 'replacement', label: 'Replacement', icon: RefreshCw, color: '#FF9F0A' },
  { value: 'repair', label: 'Repair', icon: Hammer, color: '#FF3B30' },
  { value: 'renovation', label: 'Renovation', icon: PaintBucket, color: '#AF52DE' },
  { value: 'purchase', label: 'Purchase', icon: ShoppingBag, color: '#34C759' },
  { value: 'other', label: 'Other', icon: MoreHorizontal, color: '#8E8E93' },
];

const blankForm = () => ({
  title: '',
  eventType: 'maintenance',
  eventDate: format(new Date(), 'yyyy-MM-dd'),
  description: '',
  cost: '',
});

export default function TimelinePage() {
  const { home, user } = useStore();
  const supabase = createClient();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blankForm());

  const update = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!home) return;
    const load = async () => {
      const { data } = await supabase
        .from('timeline_events')
        .select('*')
        .eq('home_id', home.id)
        .order('event_date', { ascending: true });
      if (data) setEvents(data);
      setLoading(false);
    };
    load();
  }, [home]);

  // Auto-completed tasks get logged as maintenance events with a
  // related_task_id. Those belong on the Task History page, not here,
  // so we filter them out of the timeline view.
  const visibleEvents = events.filter((e) => !e.related_task_id);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(blankForm());
  };

  const startNew = () => {
    setEditingId(null);
    setForm(blankForm());
    setShowForm(true);
  };

  const startEdit = (ev: TimelineEvent) => {
    setEditingId(ev.id);
    setForm({
      title: ev.title,
      eventType: ev.event_type,
      eventDate: ev.event_date,
      description: ev.description || '',
      cost: ev.cost?.toString() || '',
    });
    setShowForm(true);
  };

  const sortAsc = (list: TimelineEvent[]) =>
    [...list].sort((a, b) => a.event_date.localeCompare(b.event_date));

  const handleSave = async () => {
    if (!form.title.trim() || !home) return;
    const payload = {
      home_id: home.id,
      event_type: form.eventType,
      title: form.title.trim(),
      description: form.description || null,
      event_date: form.eventDate,
      cost: form.cost ? parseFloat(form.cost) : null,
      created_by: user?.id,
    };

    if (editingId) {
      const { data, error } = await supabase
        .from('timeline_events')
        .update(payload as any)
        .eq('id', editingId)
        .select()
        .single();
      if (error) {
        toast.error('Failed to save event');
      } else {
        setEvents(sortAsc(events.map((e) => (e.id === editingId ? data : e))));
        closeForm();
        toast.success('Event updated');
      }
    } else {
      const { data, error } = await supabase
        .from('timeline_events')
        .insert(payload as any)
        .select()
        .single();
      if (error) {
        toast.error('Failed to add event');
      } else {
        setEvents(sortAsc([...events, data]));
        closeForm();
        toast.success('Event added');
      }
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    const ok = await confirm({
      title: 'Delete this event?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase
      .from('timeline_events')
      .delete()
      .eq('id', editingId);
    if (error) {
      toast.error('Failed to delete');
    } else {
      setEvents(events.filter((e) => e.id !== editingId));
      closeForm();
      toast.success('Deleted');
    }
  };

  const exportTimeline = () => {
    const csv = [
      'Date,Type,Title,Description,Cost',
      ...visibleEvents.map((e) =>
        `"${e.event_date}","${e.event_type}","${e.title}","${e.description || ''}","${e.cost || ''}"`
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `home-timeline-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Timeline exported');
  };

  const grouped: Record<string, TimelineEvent[]> = {};
  visibleEvents.forEach((e) => {
    const yr = parseISO(e.event_date).getFullYear().toString();
    if (!grouped[yr]) grouped[yr] = [];
    grouped[yr].push(e);
  });

  return (
    <div>
      <PageHeader
        title="Home Timeline"
        subtitle={`${visibleEvents.length} event${visibleEvents.length === 1 ? '' : 's'}`}
        back
        rightAction={
          <div className="flex items-center gap-2">
            {visibleEvents.length > 0 && (
              <button onClick={exportTimeline} className="text-brand-500 p-1"><Download size={20} /></button>
            )}
            <button onClick={startNew} className="text-brand-500"><Plus size={24} /></button>
          </div>
        }
      />

      {/* Add / Edit Form */}
      {showForm && (
        <div className="mx-4 mt-4 ios-card p-4 space-y-3 animate-slide-up">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">{editingId ? 'Edit Event' : 'Add Event'}</span>
            <button onClick={closeForm}><X size={18} className="text-ink-tertiary" /></button>
          </div>
          <input
            type="text"
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="Event title *"
            className="ios-input"
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => update('eventType', t.value)}
                className={`px-3 py-1.5 rounded-ios text-xs font-medium transition-colors ${
                  form.eventType === t.value ? 'text-white' : 'bg-surface-secondary text-ink-secondary'
                }`}
                style={form.eventType === t.value ? { backgroundColor: t.color } : {}}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={form.eventDate}
              onChange={(e) => update('eventDate', e.target.value)}
              className="ios-input"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.cost}
              onChange={(e) => update('cost', e.target.value)}
              placeholder="Cost ($)"
              className="ios-input"
            />
          </div>
          <textarea
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Description..."
            rows={2}
            className="ios-input resize-none"
          />
          <button onClick={handleSave} disabled={!form.title.trim()} className="ios-button">
            {editingId ? 'Save Changes' : 'Add to Timeline'}
          </button>
          <button
            onClick={closeForm}
            className="w-full py-3 text-ink-secondary font-medium text-sm md:hover:text-ink-primary transition-colors"
          >
            Cancel
          </button>
          {editingId && (
            <button onClick={handleDelete} className="w-full py-3 text-status-red font-semibold text-sm">
              Delete Event
            </button>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="py-4">
        {loading ? (
          <div className="text-center py-16 text-ink-tertiary text-sm">Loading...</div>
        ) : visibleEvents.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📅</div>
            <p className="text-ink-secondary text-sm">No timeline events yet</p>
            <p className="text-xs text-ink-tertiary mt-1">Tap + to log a milestone (purchase, renovation, repair…)</p>
          </div>
        ) : (
          Object.entries(grouped).map(([yr, items]) => (
            <div key={yr}>
              <p className="section-header">{yr}</p>
              <div className="mx-4 relative">
                {/* Vertical line */}
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200" />

                {items.map((ev, i) => {
                  const config = EVENT_TYPES.find((t) => t.value === ev.event_type) || EVENT_TYPES[5];
                  const Icon = config.icon;
                  return (
                    <div key={ev.id} className="relative pl-10 pb-5 last:pb-0 animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                      {/* Dot */}
                      <div
                        className="absolute left-[9px] top-1 w-3 h-3 rounded-full border-2 border-white"
                        style={{ backgroundColor: config.color }}
                      />
                      <button
                        onClick={() => startEdit(ev)}
                        className="ios-card p-3.5 w-full text-left active:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <Icon size={13} style={{ color: config.color }} />
                              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: config.color }}>
                                {config.label}
                              </span>
                            </div>
                            <p className="text-sm font-semibold">{ev.title}</p>
                            {ev.description && <p className="text-xs text-ink-secondary mt-0.5">{ev.description}</p>}
                          </div>
                          <div className="text-right flex-shrink-0 flex flex-col items-end gap-0.5">
                            <p className="text-xs text-ink-secondary">{format(parseISO(ev.event_date), 'MMM d')}</p>
                            {ev.cost != null && <p className="text-xs font-semibold text-emerald-600">{formatCurrency(ev.cost)}</p>}
                            <Pencil size={12} className="text-ink-tertiary mt-0.5" />
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
