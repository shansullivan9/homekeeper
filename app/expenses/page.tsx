'use client';
import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import PageHeader from '@/components/layout/PageHeader';
import { formatCurrency, CATEGORY_ICONS } from '@/lib/constants';
import { TaskHistory } from '@/lib/types';
import { parseISO, getYear } from 'date-fns';
import { X, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ExpensesPage() {
  const { history, setHistory, tasks, setTasks, categories } = useStore();
  const supabase = createClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [editing, setEditing] = useState<TaskHistory | null>(null);
  const [saving, setSaving] = useState(false);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_default || !c.home_id),
    [categories]
  );

  const setCategory = async (categoryName: string | null) => {
    if (!editing) return;
    setSaving(true);
    try {
      const matched = categoryName
        ? categories.find((c) => c.name === categoryName) || null
        : null;

      const { error: hErr } = await supabase
        .from('task_history')
        .update({ category_name: categoryName })
        .eq('id', editing.id);
      if (hErr) throw hErr;

      if (editing.task_id) {
        await supabase
          .from('tasks')
          .update({
            category_id: matched?.id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editing.task_id);
      }

      setHistory(
        history.map((h) =>
          h.id === editing.id ? { ...h, category_name: categoryName } : h
        )
      );
      if (editing.task_id) {
        setTasks(
          tasks.map((t) =>
            t.id === editing.task_id ? { ...t, category_id: matched?.id || null } : t
          )
        );
      }
      toast.success('Category updated');
      setEditing(null);
    } catch (err: any) {
      toast.error(err.message || 'Could not update');
    } finally {
      setSaving(false);
    }
  };

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
        <div className="flex gap-2 px-4 mb-4 overflow-x-auto no-scrollbar smooth-scroll">
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

        {/* Total */}
        <div className="mx-4 ios-card p-5 md:p-7 text-center mb-4">
          <p className="text-xs text-ink-secondary uppercase tracking-wide font-semibold mb-1">Total Spent in {year}</p>
          <p className="text-3xl md:text-4xl font-bold text-ink-primary">{formatCurrency(yearData.total)}</p>
          <p className="text-xs text-ink-tertiary mt-1">{yearData.items.length} expenses logged</p>
        </div>

        <div className="md:grid md:grid-cols-2 md:gap-6">
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
                <button
                  key={h.id}
                  onClick={() => setEditing(h)}
                  className="ios-list-item w-full text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{h.title}</p>
                    <p className="text-xs text-ink-tertiary">
                      {new Date(h.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' · '}
                      {h.category_name || (
                        <span className="text-brand-500">Tap to categorize</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-semibold text-emerald-600">{formatCurrency(h.cost || 0)}</span>
                    <ChevronRight size={14} className="text-ink-tertiary" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => !saving && setEditing(null)}>
          <div
            className="bg-white rounded-ios-lg w-full max-w-md p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="min-w-0">
                <p className="text-xs text-ink-tertiary uppercase tracking-wide font-semibold">Set category</p>
                <p className="text-[15px] font-medium truncate">{editing.title}</p>
              </div>
              <button
                onClick={() => setEditing(null)}
                disabled={saving}
                className="p-1 text-ink-tertiary"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCategory(null)}
                disabled={saving}
                className={`px-3 py-2 rounded-ios text-sm font-medium transition-colors ${
                  !editing.category_name
                    ? 'bg-brand-500 text-white'
                    : 'bg-surface-secondary text-ink-secondary active:bg-surface-tertiary'
                }`}
              >
                Uncategorized
              </button>
              {activeCategories.map((cat) => {
                const selected = editing.category_name === cat.name;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.name)}
                    disabled={saving}
                    className={`px-3 py-2 rounded-ios text-sm font-medium transition-colors ${
                      selected
                        ? 'bg-brand-500 text-white'
                        : 'bg-surface-secondary text-ink-secondary active:bg-surface-tertiary'
                    }`}
                  >
                    {CATEGORY_ICONS[cat.icon] || '🔧'} {cat.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
