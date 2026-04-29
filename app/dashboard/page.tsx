'use client';
import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { isBefore, startOfDay, endOfDay, addDays, endOfMonth, subDays } from 'date-fns';
import TaskCard from '@/components/tasks/TaskCard';
import SuggestionBanner from '@/components/dashboard/SuggestionBanner';
import PageHeader from '@/components/layout/PageHeader';
import { useRouter } from 'next/navigation';
import { useAppInit } from '@/hooks/useAppInit';
import { Home as HomeIcon, Users, ChevronRight, Package, Clock3, Banknote, FileText } from 'lucide-react';

type ClaimFilter = 'all' | 'unclaimed' | 'mine' | 'theirs';

export default function DashboardPage() {
  const { tasks, home, user, members, history, appliances, documents } = useStore();
  const { loadData } = useAppInit();
  const router = useRouter();
  const [claimFilter, setClaimFilter] = useState<ClaimFilter>('all');

  const activeTasks = useMemo(() => {
    return tasks.filter((t) => t.status !== 'completed' && t.status !== 'skipped' && !t.is_suggestion);
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (claimFilter === 'all') return activeTasks;
    if (claimFilter === 'unclaimed') return activeTasks.filter((t: any) => !t.assigned_to);
    if (claimFilter === 'mine') return activeTasks.filter((t: any) => t.assigned_to === user?.id);
    if (claimFilter === 'theirs') return activeTasks.filter((t: any) => t.assigned_to && t.assigned_to !== user?.id);
    return activeTasks;
  }, [activeTasks, claimFilter, user]);

  const now = startOfDay(new Date());
  // "Due This Week" covers today through 6 days from now (a real
  // 7-day window). Using addDays(now, 7) for the cutoff with isBefore
  // would actually include day 8, since endOfDay(now+7) sits inside
  // the start of day 8.
  const weekEnd = endOfDay(addDays(now, 6));
  const monthEnd = endOfDay(endOfMonth(now));

  const sixWeeksOut = useMemo(() => endOfDay(addDays(now, 42)), [now]);

  // Single-pass bucketing so each task lands in exactly one section even when
  // the cutoffs overlap (e.g. weekEnd extending past monthEnd at end of month).
  const buckets = useMemo(() => {
    const overdue: typeof filteredTasks = [];
    const dueThisWeek: typeof filteredTasks = [];
    const dueThisMonth: typeof filteredTasks = [];
    const upcoming: typeof filteredTasks = [];
    const later: typeof filteredTasks = [];

    for (const t of filteredTasks) {
      if (!t.due_date) {
        later.push(t);
        continue;
      }
      const d = new Date(t.due_date + 'T00:00:00');
      if (isBefore(d, now)) overdue.push(t);
      else if (isBefore(d, weekEnd)) dueThisWeek.push(t);
      else if (isBefore(d, monthEnd)) dueThisMonth.push(t);
      else if (isBefore(d, sixWeeksOut)) upcoming.push(t);
      else later.push(t);
    }
    return { overdue, dueThisWeek, dueThisMonth, upcoming, later };
  }, [filteredTasks, now, weekEnd, monthEnd, sixWeeksOut]);

  const overdue = buckets.overdue;
  const dueThisWeek = buckets.dueThisWeek;
  const dueThisMonth = buckets.dueThisMonth;
  const upcoming = buckets.upcoming;
  const later = buckets.later;

  const recentlyCompletedCutoff = useMemo(() => subDays(now, 30), [now]);
  const recentlyCompleted = useMemo(() =>
    tasks
      .filter((t) => {
        if (t.status !== 'completed' || !t.completed_at) return false;
        if (new Date(t.completed_at) < recentlyCompletedCutoff) return false;
        // Match the claim filter so "Yours" shows only tasks you
        // completed, "Theirs" shows partner-completed, etc.
        if (claimFilter === 'mine')
          return (t as any).completed_by === user?.id;
        if (claimFilter === 'theirs')
          return (t as any).completed_by && (t as any).completed_by !== user?.id;
        if (claimFilter === 'unclaimed') return !(t as any).completed_by;
        return true;
      })
      .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime())
      .slice(0, 5),
    [tasks, recentlyCompletedCutoff, claimFilter, user]
  );

  const currentYear = now.getFullYear();
  const historyThisYear = useMemo(
    () => history.filter((h) => new Date(h.completed_at).getFullYear() === currentYear),
    [history, currentYear]
  );
  const completedThisYear = historyThisYear.length;
  const spentThisYear = useMemo(
    () => historyThisYear.reduce((sum, h) => sum + (h.cost || 0), 0),
    [historyThisYear]
  );

  const unclaimedCount = useMemo(() => activeTasks.filter((t: any) => !t.assigned_to).length, [activeTasks]);
  const mineCount = useMemo(() => activeTasks.filter((t: any) => t.assigned_to === user?.id).length, [activeTasks, user]);
  const theirsCount = useMemo(() => activeTasks.filter((t: any) => t.assigned_to && t.assigned_to !== user?.id).length, [activeTasks, user]);

  const partnerLabel = (() => {
    if (members.length <= 1) return 'Theirs';
    const partner = members.find((m: any) => m.user_id !== user?.id);
    const partnerName =
      (partner as any)?.display_name ||
      (partner as any)?.email?.split('@')[0];
    return partnerName ? `${partnerName}'s` : 'Theirs';
  })();
  const showFilters = members.length > 1 || mineCount > 0 || theirsCount > 0;

  const FilterChip = ({ value, label, count }: { value: ClaimFilter; label: string; count: number }) => (
    <button
      onClick={() => setClaimFilter(value)}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
        claimFilter === value
          ? 'bg-brand-500 text-white'
          : 'bg-gray-100 text-ink-secondary active:bg-gray-200'
      }`}
    >
      {label} {count > 0 && <span className="opacity-75">· {count}</span>}
    </button>
  );

  // True when there are zero tasks in any visible bucket. We use this
  // to show a friendly hero on a brand-new household instead of five
  // "None" cards stacked on top of each other.
  const everythingEmpty =
    overdue.length === 0 &&
    dueThisWeek.length === 0 &&
    dueThisMonth.length === 0 &&
    upcoming.length === 0 &&
    later.length === 0;

  const emptyState = (
    <div className="mx-4 mt-6 mb-6 ios-card p-6 text-center">
      <div className="text-5xl mb-3">🎉</div>
      <p className="text-lg font-semibold text-ink-primary">
        {claimFilter === 'all' ? 'All caught up!' : 'Nothing in this view'}
      </p>
      <p className="text-sm text-ink-secondary mt-1 mb-4">
        {claimFilter === 'all'
          ? activeTasks.length === 0
            ? 'No tasks yet. Add one or complete your home profile to get suggestions tailored to your house.'
            : 'You have no pending tasks. Nice work.'
          : 'Try switching filters to see other tasks.'}
      </p>
      {claimFilter === 'all' && activeTasks.length === 0 && (
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={() => router.push('/add-task')}
            className="px-4 py-2.5 rounded-ios bg-brand-500 text-white text-sm font-semibold active:bg-brand-600 md:hover:bg-brand-600 transition-colors"
          >
            Add a task
          </button>
          <button
            onClick={() => router.push('/home-profile')}
            className="px-4 py-2.5 rounded-ios bg-brand-50 text-brand-600 text-sm font-semibold active:bg-brand-100 md:hover:bg-brand-100 transition-colors"
          >
            Complete home profile
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title={home?.name || 'HomeKeeper'}
        subtitle={
          claimFilter === 'all'
            ? `${activeTasks.length} active tasks`
            : `${filteredTasks.length} of ${activeTasks.length} active`
        }
        rightAction={
          <button onClick={() => router.push('/settings')} className="text-brand-500 text-sm font-semibold">
            <Users size={22} />
          </button>
        }
      />

      <div className="pb-4">
        {/* Quick Stats — only on the unfiltered view */}
        {claimFilter === 'all' && (
          <div className="grid grid-cols-3 gap-3 px-4 pt-4 pb-2">
            <button onClick={() => router.push('/history')} className="tap-card p-3 md:p-4 text-center">
              <div className="text-2xl md:text-3xl font-bold text-brand-600">{completedThisYear}</div>
              <div className="text-[10px] md:text-xs text-ink-secondary font-medium mt-0.5 leading-tight">
                Tasks Completed<br /><span className="text-ink-tertiary">{currentYear}</span>
              </div>
            </button>
            <button onClick={() => router.push('/settings')} className="tap-card p-3 md:p-4 text-center">
              <div className="text-2xl md:text-3xl font-bold text-purple-600">{members.length}</div>
              <div className="text-[10px] md:text-xs text-ink-secondary font-medium mt-0.5 leading-tight">
                HomeKeeper<br /><span className="text-ink-tertiary">{members.length === 1 ? 'Member' : 'Members'}</span>
              </div>
            </button>
            <button onClick={() => router.push('/expenses')} className="tap-card p-3 md:p-4 text-center">
              <div className="text-2xl md:text-3xl font-bold text-emerald-600">
                {spentThisYear >= 10000
                  ? `$${(spentThisYear / 1000).toFixed(1)}k`
                  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(spentThisYear)}
              </div>
              <div className="text-[10px] md:text-xs text-ink-secondary font-medium mt-0.5 leading-tight">
                Spent<br /><span className="text-ink-tertiary">{currentYear}</span>
              </div>
            </button>
          </div>
        )}

        {/* Suggestions */}
        <SuggestionBanner />

        {/* Claim filter chips */}
        {showFilters && (
          <div className="px-4 pt-2 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
            <FilterChip value="all" label="All" count={activeTasks.length} />
            <FilterChip value="unclaimed" label="Unclaimed" count={unclaimedCount} />
            <FilterChip value="mine" label="Yours" count={mineCount} />
            {theirsCount > 0 && <FilterChip value="theirs" label={partnerLabel} count={theirsCount} />}
          </div>
        )}

        {/* Quick Links — only on the unfiltered view */}
        {claimFilter === 'all' && (
          <div className="mx-4 mb-4">
            <div className="ios-card overflow-hidden">
              {[
                { label: 'Appliances & Systems', icon: Package, href: '/appliances', color: 'text-purple-500', count: appliances.length },
                { label: 'Documents', icon: FileText, href: '/documents', color: 'text-sky-500', count: documents.length },
                { label: 'Expenses', icon: Banknote, href: '/expenses', color: 'text-emerald-500', count: null as number | null },
                { label: 'Home Profile', icon: HomeIcon, href: '/home-profile', color: 'text-brand-500', count: null as number | null },
                { label: 'Home Timeline', icon: Clock3, href: '/timeline', color: 'text-amber-500', count: null as number | null },
              ].map(({ label, icon: Icon, href, color, count }) => (
                <button key={href} onClick={() => router.push(href)} className="ios-list-item w-full">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center ${color}`}>
                      <Icon size={18} />
                    </div>
                    <span className="text-[15px] font-medium">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {count !== null && count > 0 && (
                      <span className="text-xs text-ink-tertiary tabular-nums">{count}</span>
                    )}
                    <ChevronRight size={16} className="text-ink-tertiary" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {everythingEmpty && emptyState}

        {/* Task buckets — single column on mobile, two columns on desktop.
            When everything is empty we show the hero above instead. */}
        <div className={`md:grid md:grid-cols-2 md:gap-x-4 md:px-0 ${everythingEmpty ? 'hidden' : ''}`}>
          {/* Overdue */}
          <div>
            <p className="section-header">
              <span className="inline-block w-2 h-2 rounded-full bg-status-red mr-1.5" />
              Overdue ({overdue.length})
            </p>
            <div className="mx-4 ios-card overflow-hidden">
              {overdue.length > 0 ? (
                overdue.map((t) => (
                  <TaskCard key={t.id} task={t} onComplete={loadData} sectionColor="#FF3B30" />
                ))
              ) : (
                <div className="px-4 py-3.5 text-sm text-ink-tertiary">None</div>
              )}
            </div>
          </div>

          {/* Due This Week */}
          <div>
            <p className="section-header">
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: '#FF9F0A' }} />
              Due This Week ({dueThisWeek.length})
            </p>
            <div className="mx-4 ios-card overflow-hidden">
              {dueThisWeek.length > 0 ? (
                dueThisWeek.map((t) => (
                  <TaskCard key={t.id} task={t} onComplete={loadData} sectionColor="#FF9F0A" />
                ))
              ) : (
                <div className="px-4 py-3.5 text-sm text-ink-tertiary">None</div>
              )}
            </div>
          </div>

          {/* Due This Month */}
          <div>
            <p className="section-header">
              <span className="inline-block w-2 h-2 rounded-full bg-status-green mr-1.5" />
              Due This Month ({dueThisMonth.length})
            </p>
            <div className="mx-4 ios-card overflow-hidden">
              {dueThisMonth.length > 0 ? (
                dueThisMonth.map((t) => (
                  <TaskCard key={t.id} task={t} onComplete={loadData} sectionColor="#34C759" />
                ))
              ) : (
                <div className="px-4 py-3.5 text-sm text-ink-tertiary">None</div>
              )}
            </div>
          </div>

          {/* Upcoming */}
          <div>
            <p className="section-header">
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: '#4B9CD3' }} />
              Upcoming ({upcoming.length})
            </p>
            <div className="mx-4 ios-card overflow-hidden">
              {upcoming.length > 0 ? (
                upcoming.map((t) => (
                  <TaskCard key={t.id} task={t} onComplete={loadData} sectionColor="#4B9CD3" />
                ))
              ) : (
                <div className="px-4 py-3.5 text-sm text-ink-tertiary">None</div>
              )}
            </div>
          </div>

          {/* Later */}
          <div>
            <p className="section-header">
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: '#592A8A' }} />
              Later ({later.length})
            </p>
            <div className="mx-4 ios-card overflow-hidden">
              {later.length > 0 ? (
                later.map((t) => (
                  <TaskCard key={t.id} task={t} onComplete={loadData} sectionColor="#592A8A" />
                ))
              ) : (
                <div className="px-4 py-3.5 text-sm text-ink-tertiary">None</div>
              )}
            </div>
          </div>
        </div>

        {/* Recently Completed — outside the conditional bucket grid so
            it stays visible even when active buckets are empty. */}
        {recentlyCompleted.length > 0 && (
          <div>
            <p className="section-header">
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: '#8E8E93' }} />
              Recently Completed ({recentlyCompleted.length})
            </p>
            <div className="mx-4 ios-card overflow-hidden">
              {recentlyCompleted.map((t) => (
                <TaskCard key={t.id} task={t} compact sectionColor="#8E8E93" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
