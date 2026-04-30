'use client';
import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import PageHeader from '@/components/layout/PageHeader';
import { formatCurrency } from '@/lib/constants';
import { format, parseISO, getYear } from 'date-fns';
import { Printer } from 'lucide-react';

// Annual home maintenance summary — printable / PDF-able via the
// browser's native print dialog (window.print() with print: styles
// below). Pulls from task_history for the chosen year and groups by
// month + category so the user can keep a record (or hand it to a
// buyer when selling).
export default function ReportsPage() {
  const { home, history } = useStore();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    for (const h of history) {
      try {
        set.add(getYear(parseISO(h.completed_at)));
      } catch {
        /* skip bad dates */
      }
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [history, currentYear]);

  const yearItems = useMemo(
    () =>
      history
        .filter((h) => getYear(parseISO(h.completed_at)) === year)
        .sort(
          (a, b) => parseISO(a.completed_at).getTime() - parseISO(b.completed_at).getTime()
        ),
    [history, year]
  );

  const total = yearItems.reduce((sum, h) => sum + (h.cost || 0), 0);
  const byCategory = (() => {
    const out: Record<string, { count: number; cost: number }> = {};
    for (const h of yearItems) {
      const key = h.category_name || 'Uncategorized';
      if (!out[key]) out[key] = { count: 0, cost: 0 };
      out[key].count += 1;
      out[key].cost += h.cost || 0;
    }
    return Object.entries(out)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.cost - a.cost);
  })();

  const byMonth = (() => {
    const groups: Record<string, typeof yearItems> = {};
    for (const h of yearItems) {
      const key = format(parseISO(h.completed_at), 'MMMM');
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    }
    return Object.entries(groups);
  })();

  const allPhotos = yearItems.flatMap((h) => h.photos || []);

  return (
    <div className="md:max-w-3xl md:mx-auto print:max-w-full">
      <PageHeader
        title="Annual Report"
        subtitle={home?.name || ''}
        back
        rightAction={
          <button
            onClick={() => window.print()}
            aria-label="Print or save as PDF"
            title="Print or save as PDF"
            className="text-brand-500 p-1 print:hidden"
          >
            <Printer size={20} />
          </button>
        }
      />

      <div className="px-4 py-4 print:px-0 print:py-2 space-y-5">
        {/* Year selector — hidden on print so the printed page has a
            single clean header. */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar print:hidden">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-4 py-2 rounded-ios text-sm font-semibold whitespace-nowrap transition-colors ${
                year === y
                  ? 'bg-brand-500 text-white'
                  : 'bg-white text-ink-secondary shadow-card md:hover:bg-gray-50'
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Cover */}
        <div className="ios-card p-6 text-center print:shadow-none print:border print:border-gray-200">
          <p className="text-xs uppercase tracking-wider text-ink-secondary font-semibold mb-1">
            Home Maintenance Report
          </p>
          <h2 className="text-3xl font-bold mb-1">{year}</h2>
          <p className="text-sm text-ink-secondary">{home?.name || 'My Home'}</p>
          {yearItems.length > 0 ? (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <p className="text-2xl font-bold text-brand-600">{yearItems.length}</p>
                <p className="text-[11px] text-ink-secondary uppercase tracking-wide font-medium">
                  Tasks done
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(total)}</p>
                <p className="text-[11px] text-ink-secondary uppercase tracking-wide font-medium">
                  Spent
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-600">{byCategory.length}</p>
                <p className="text-[11px] text-ink-secondary uppercase tracking-wide font-medium">
                  Categories
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs text-ink-tertiary">
              Complete tasks during {year} to see them summarized here.
            </p>
          )}
        </div>

        {/* By category */}
        {byCategory.length > 0 && (
          <div>
            <p className="section-header">By Category</p>
            <div className="mx-0 ios-card overflow-hidden print:shadow-none print:border print:border-gray-200">
              {byCategory.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0"
                >
                  <div>
                    <p className="text-[15px] font-medium">{c.name}</p>
                    <p className="text-xs text-ink-tertiary">
                      {c.count} task{c.count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">{formatCurrency(c.cost)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Month-by-month log */}
        {byMonth.length > 0 ? (
          <div>
            <p className="section-header">Activity Log</p>
            {byMonth.map(([month, items]) => (
              <div key={month} className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary px-4 mb-1">
                  {month}
                </p>
                <div className="mx-0 ios-card overflow-hidden print:shadow-none print:border print:border-gray-200">
                  {items.map((h) => (
                    <div
                      key={h.id}
                      className="px-4 py-3 border-b border-gray-50 last:border-b-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium">{h.title}</p>
                          <p className="text-xs text-ink-tertiary">
                            {format(parseISO(h.completed_at), 'MMM d')}
                            {h.category_name ? ` · ${h.category_name}` : ''}
                            {h.completed_by_name ? ` · by ${h.completed_by_name}` : ''}
                          </p>
                          {h.notes && (
                            <p className="text-xs text-ink-secondary mt-0.5">{h.notes}</p>
                          )}
                        </div>
                        {h.cost != null && (
                          <p className="text-sm font-semibold text-emerald-600">
                            {formatCurrency(h.cost)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-ink-tertiary text-sm">
            No completed tasks for {year}.
          </div>
        )}

        {/* Photo wall */}
        {allPhotos.length > 0 && (
          <div>
            <p className="section-header">Photos ({allPhotos.length})</p>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mx-0">
              {allPhotos.map((url, i) => (
                <a
                  key={`${url}-${i}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square rounded-ios overflow-hidden bg-gray-100 print:rounded-none"
                >
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-ink-tertiary text-center pt-4 print:pt-2">
          Generated by HomeKeeper · {format(new Date(), 'MMM d, yyyy')}
        </p>
      </div>
    </div>
  );
}
