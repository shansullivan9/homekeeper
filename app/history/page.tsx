'use client';
import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import PageHeader from '@/components/layout/PageHeader';
import { format, parseISO, isThisMonth, isThisYear } from 'date-fns';
import { CheckCircle2, Search } from 'lucide-react';

export default function HistoryPage() {
  const { history } = useStore();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return history;
    const q = search.toLowerCase();
    return history.filter(
      (h) =>
        h.title.toLowerCase().includes(q) ||
        h.category_name?.toLowerCase().includes(q) ||
        h.completed_by_name?.toLowerCase().includes(q)
    );
  }, [history, search]);

  // Group by month
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
      <PageHeader title="History" subtitle={`${history.length} completed tasks`} />

      {/* Search */}
      <div className="px-4 pt-3 pb-2">
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

      {/* History List */}
      {Object.entries(grouped).map(([month, items]) => (
        <div key={month}>
          <p className="section-header">{month}</p>
          <div className="mx-4 ios-card overflow-hidden">
            {items.map((h) => (
              <div key={h.id} className="ios-list-item">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0 mt-0.5">
                    <CheckCircle2 size={18} className="text-status-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium truncate">{h.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-ink-secondary">
                        {format(parseISO(h.completed_at), 'MMM d, h:mm a')}
                      </span>
                      {h.completed_by_name && (
                        <span className="text-xs text-ink-tertiary">by {h.completed_by_name}</span>
                      )}
                    </div>
                    {h.notes && (
                      <p className="text-xs text-ink-tertiary mt-1 line-clamp-2">{h.notes}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  {h.cost && (
                    <span className="text-xs font-semibold text-emerald-600">${h.cost}</span>
                  )}
                  {h.category_name && (
                    <span className="text-[10px] text-ink-tertiary bg-gray-50 px-2 py-0.5 rounded-full">{h.category_name}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-ink-secondary text-sm">
            {search ? 'No matching history found' : 'No completed tasks yet'}
          </p>
        </div>
      )}
    </div>
  );
}
