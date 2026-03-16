'use client';
import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import PageHeader from '@/components/layout/PageHeader';
import { formatCurrency } from '@/lib/constants';
import { parseISO, getYear } from 'date-fns';

export default function ExpensesPage() {
  const { history } = useStore();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const years = useMemo(() => {
    const s = new Set<number>();
    history.forEach((h) => { if (h.cost) s.add(getYear(parseISO(h.completed_at))); });
    if (s.size === 0) s.add(currentYear);
    return Array.from(s).sort((a, b) => b - a);
  }, [history, currentYear]);

  const yearData = useMemo(() => {
    const items = history.filter((h) => h.cost && getYear(parseISO(h.completed_at)) === year);
    const total = items.reduce((sum, h) => sum + (h.cost || 0), 0);

    const byCategory: Record<string, { total: number; count: number }> = {};
    items.forEach((h) => {
      const cat = h.category_name || 'Uncategorized';
      if (!byCategory[cat]) byCategory[cat] = { total: 0, count: 0 };
      byCategory[cat].total += h.cost || 0;
      byCategory[cat].count += 1;
    });

    const sorted = Object.entries(byCategory)
      .map(([name, data]) => ({ name, ...data, pct: total > 0 ? (data.total / total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);

    return { total, items, byCategory: sorted };
  }, [history, year]);

  const barColors = ['#007AFF', '#34C759', '#FF9F0A', '#AF52DE', '#FF3B30', '#5AC8FA', '#FF6482', '#FFCC00', '#30D158'];

  return (
    <div>
      <PageHeader title="Expenses" subtitle={`${year} summary`} back />

      <div className="py-4">
        {/* Year Selector */}
        <div className="flex gap-2 px-4 mb-4 overflow-x-auto smooth-scroll">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-4 py-2 rounded-ios text-sm font-semibold whitespace-nowrap transition-colors ${
                year === y ? 'bg-brand-500 text-white' : 'bg-white text-ink-secondary shadow-card'
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Total */}
        <div className="mx-4 ios-card p-5 text-center mb-4">
          <p className="text-xs text-ink-secondary uppercase tracking-wide font-semibold mb-1">Total Spent in {year}</p>
          <p className="text-3xl font-bold text-ink-primary">{formatCurrency(yearData.total)}</p>
          <p className="text-xs text-ink-tertiary mt-1">{yearData.items.length} expenses logged</p>
        </div>

        {/* By Category */}
        {yearData.byCategory.length > 0 ? (
          <div>
            <p className="section-header">By Category</p>
            <div className="mx-4 ios-card overflow-hidden">
              {yearData.byCategory.map((cat, i) => (
                <div key={cat.name} className="px-4 py-3.5 border-b border-gray-50 last:border-b-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: barColors[i % barColors.length] }} />
                      <span className="text-sm font-medium">{cat.name}</span>
                      <span className="text-xs text-ink-tertiary">({cat.count})</span>
                    </div>
                    <span className="text-sm font-semibold">{formatCurrency(cat.total)}</span>
                  </div>
                  {/* Bar */}
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${cat.pct}%`, backgroundColor: barColors[i % barColors.length] }}
                    />
                  </div>
                  <p className="text-[10px] text-ink-tertiary mt-1 text-right">{cat.pct.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">💰</div>
            <p className="text-ink-secondary text-sm">No expenses recorded for {year}</p>
            <p className="text-xs text-ink-tertiary mt-1">Costs are logged when you complete tasks</p>
          </div>
        )}

        {/* Recent Expenses List */}
        {yearData.items.length > 0 && (
          <div>
            <p className="section-header">All {year} Expenses</p>
            <div className="mx-4 ios-card overflow-hidden">
              {yearData.items.map((h) => (
                <div key={h.id} className="ios-list-item">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{h.title}</p>
                    <p className="text-xs text-ink-tertiary">
                      {new Date(h.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {h.category_name && ` · ${h.category_name}`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600">{formatCurrency(h.cost || 0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
