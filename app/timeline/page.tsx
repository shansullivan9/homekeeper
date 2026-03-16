'use client';
import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import PageHeader from '@/components/layout/PageHeader';
import { TimelineEvent } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { Plus, X, Download, Wrench, RefreshCw, Hammer, PaintBucket, ShoppingBag, MoreHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';

const EVENT_TYPES = [
  { value: 'maintenance', label: 'Maintenance', icon: Wrench, color: '#007AFF' },
  { value: 'replacement', label: 'Replacement', icon: RefreshCw, color: '#FF9F0A' },
  { value: 'repair', label: 'Repair', icon: Hammer, color: '#FF3B30' },
  { value: 'renovation', label: 'Renovation', icon: PaintBucket, color: '#AF52DE' },
  { value: 'purchase', label: 'Purchase', icon: ShoppingBag, color: '#34C759' },
  { value: 'other', label: 'Other', icon: MoreHorizontal, color: '#8E8E93' },
];

export default function TimelinePage() {
  const { home, user } = useStore();
  const supabase = createClient();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('maintenance');
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');

  useEffect(() => {
    if (!home) return;
    const load = async () => {
      const { data } = await supabase
        .from('timeline_events')
        .select('*')
        .eq('home_id', home.id)
        .order('event_date', { ascending: false });
      if (data) setEvents(data);
      setLoading(false);
    };
    load();
  }, [home]);

  const handleAdd = async () => {
    if (!title.trim() || !home) return;
    const { data, error } = await supabase
      .from('timeline_events')
      .insert({
        home_id: home.id,
        event_type: eventType,
        title: title.trim(),
        description: description || null,
        event_date: eventDate,
        cost: cost ? parseFloat(cost) : null,
        created_by: user?.id,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add event');
    } else {
      setEvents([data, ...events]);
      setTitle(''); setDescription(''); setCost('');
      setShowForm(false);
      toast.success('Event added');
    }
  };

  const exportTimeline = () => {
    const csv = [
      'Date,Type,Title,Description,Cost',
      ...events.map((e) =>
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

  // Group events by year
  const grouped: Record<string, TimelineEvent[]> = {};
  events.forEach((e) => {
    const yr = parseISO(e.event_date).getFullYear().toString();
    if (!grouped[yr]) grouped[yr] = [];
    grouped[yr].push(e);
  });

  return (
    <div>
      <PageHeader
        title="House Timeline"
        subtitle={`${events.length} events`}
        back
        rightAction={
          <div className="flex items-center gap-2">
            {events.length > 0 && (
              <button onClick={exportTimeline} className="text-brand-500 p-1"><Download size={20} /></button>
            )}
            <button onClick={() => setShowForm(true)} className="text-brand-500"><Plus size={24} /></button>
          </div>
        }
      />

      {/* Add Form */}
      {showForm && (
        <div className="mx-4 mt-4 ios-card p-4 space-y-3 animate-slide-up">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">Add Event</span>
            <button onClick={() => setShowForm(false)}><X size={18} className="text-ink-tertiary" /></button>
          </div>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title *" className="ios-input" autoFocus />
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setEventType(t.value)}
                className={`px-3 py-1.5 rounded-ios text-xs font-medium transition-colors ${
                  eventType === t.value ? 'text-white' : 'bg-surface-secondary text-ink-secondary'
                }`}
                style={eventType === t.value ? { backgroundColor: t.color } : {}}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="ios-input" />
            <input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Cost ($)" className="ios-input" />
          </div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description..." rows={2} className="ios-input resize-none" />
          <button onClick={handleAdd} disabled={!title.trim()} className="ios-button">Add to Timeline</button>
        </div>
      )}

      {/* Timeline */}
      <div className="py-4">
        {loading ? (
          <div className="text-center py-16 text-ink-tertiary text-sm">Loading...</div>
        ) : events.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📅</div>
            <p className="text-ink-secondary text-sm">No timeline events yet</p>
            <p className="text-xs text-ink-tertiary mt-1">Events are auto-logged when tasks are completed</p>
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
                      <div className="ios-card p-3.5">
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
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-ink-secondary">{format(parseISO(ev.event_date), 'MMM d')}</p>
                            {ev.cost && <p className="text-xs font-semibold text-emerald-600">${ev.cost}</p>}
                          </div>
                        </div>
                      </div>
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
