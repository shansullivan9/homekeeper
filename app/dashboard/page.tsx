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
  const { tasks, home, user, members, history } = useStore();
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
  const weekEnd = endOfDay(addDays(now, 7));
  const monthEnd = endOfDay(endOfMonth(now));

  const overdue = useMemo(() =>
    filteredTasks.filter((t) => t.due_date && isBefore(new Date(t.due_date + 'T00:00:00'), now)),
    [filteredTasks, now]
  );

  const dueThisWeek = useMemo(() =>
    filteredTasks.filter((t) => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date + 'T00:00:00');
      return !isBefore(d, now) && isBefore(d, weekEnd);
    }),
    [filteredTasks, now, weekEnd]
  );

  const dueThisMonth = useMemo(() =>
    filteredTasks.filter((t) => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date + 'T00:00:00');
      return !isBefore(d, weekEnd) && isBefore(d, monthEnd);
    }),
    [filteredTasks, weekEnd, monthEnd]
  );

  const sixWeeksOut = useMemo(() => endOfDay(addDays(now, 42)), [now]);
  const upcoming = useMemo(() => {
    return filteredTasks.filter((t) => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date + 'T00:00:00');
      return !isBefore(d, monthEnd) && isBefore(d, sixWeeksOut);
    });
  }, [filteredTasks, monthEnd, sixWeeksOut]);

  const later = useMemo(() => {
    return filteredTasks.filter((t) => {
      if (!t.due_date) return true;
      const d = new Date(t.due_date + 'T00:00:00');
      return !isBefore(d, sixWeeksOut);
    });
  }, [filteredTasks, sixWeeksOut]);

  const recentlyCompletedCutoff = useMemo(() => subDays(now, 30), [now]);
  const recentlyCompleted = useMemo(() =>
    tasks
      .filter((t) => {
        if (t.status !== 'completed' || !t.completed_at) return false;
        return new Date(t.completed_at) >= recentlyCompletedCutoff;
      })
      .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime())
      .slice(0, 5),
    [tasks, recentlyCompletedCutoff]
  );

  const totalSpending = useMemo(() =>
    history.reduce((sum, h) => sum + (h.cost || 0), 0),
    [history]
  );

  const unclaimedCount = useMemo(() => activeTasks.filter((t: any) => !t.assigned_to).length, [activeTasks]);
  const mineCount = useMemo(() => activeTasks.filter((t: any) => t.assigned_to === user?.id).length, [activeTasks, user]);
  const theirsCount = useMemo(() => activeTasks.filter((t: any) => t.assigned_to && t.assigned_to !== user?.id).length, [activeTasks, user]);

  const partnerLabel = members.length > 1 ? 'Theirs' : 'Theirs';
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

  const emptyState = (
    <div className="mx-4 mt-8 text-center">
      <div className="text-4xl mb-3">🎉</div>
      <p className="text-lg font-semibold text-ink-primary">All caught up!</p>
      <p className="text-sm text-ink-secondary mt-1">
        {claimFilter === 'all'
          ? 'No pending tasks. Tap + to add one.'
          : 'Nothing in this view.'}
      </p>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={home?.name || 'HomeKeeper'}
        subtitle={`${activeTasks.length} active tasks`}
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
            <button onClick={() => router.push('/history')} className="ios-card p-3 text-center active:shadow-card-hover transition-shadow">
              <div className="text-2xl font-bold text-brand-600">{history.length}</div>
              <div className="text-[10px] text-ink-secondary font-medium mt-0.5">Completed</div>
            </button>
            <button onClick={() => router.push('/settings')} className="ios-card p-3 text-center active:shadow-card-hover transition-shadow">
              <div className="text-2xl font-bold text-purple-600">{members.length}</div>
              <div className="text-[10px] text-ink-secondary font-medium mt-0.5">Members</div>
            </button>
            <button onClick={() => router.push('/expenses')} className="ios-card p-3 text-center active:shadow-card-hover transition-shadow">
              <div className="text-2xl font-bold text-emerald-600">
                ${totalSpending >= 1000 ? `${(totalSpending / 1000).toFixed(1)}k` : totalSpending.toFixed(0)}
              </div>
              <div className="text-[10px] text-ink-secondary font-medium mt-0.5">Spent</div>
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
                { label: 'Appliances & Systems', icon: Package, href: '/appliances', color: 'text-purple-500' },
                { label: 'Documents', icon: FileText, href: '/documents', color: 'text-sky-500' },
                { label: 'Expense Summary', icon: Banknote, href: '/expenses', color: 'text-emerald-500' },
                { label: 'Home Profile', icon: HomeIcon, href: '/home-profile', color: 'text-brand-500' },
                { label: 'Home Timeline', icon: Clock3, href: '/timeline', color: 'text-amber-500' },
              ].map(({ label, icon: Icon, href, color }) => (
                <button key={href} onClick={() => router.push(href)} className="ios-list-item w-full">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center ${color}`}>
                      <Icon size={18} />
                    </div>
                    <span className="text-[15px] font-medium">{label}</span>
                  </div>
                  <ChevronRight size={16} className="text-ink-tertiary" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No-tasks empty state — shows above any other sections */}
        {filteredTasks.length === 0 && emptyState}

        {/* Overdue */}
        {overdue.length > 0 && (
          <div>
            <p className="section-header">
              <span className="inline-block w-2 h-2 rounded-full bg-status-red mr-1.5 -mb-px" />
              Overdue ({overdue.length})
            </p>
            <div className="mx-4 ios-card overflow-hidden">
              {overdue.map((t) => (
                <TaskCard key={t.id} task={t} onComplete={loadData} sectionColor="#FF3B30" />
              ))}
            </div>
          </div>
        )}

        {/* Due This Week */}
        {dueThisWeek.length > 0 && (
          <div>
            <p className="section-header">
              <span className="inline-block w-2 h-2 rounded-full bg-status-yellow mr-1.5 -mb-px" />
              Due This Week ({dueThisWeek.length})
            </p>
            <div className="mx-4 ios-card overflow-hidden">
              {dueThisWeek.map((t) => (
                <TaskCard key={t.id} task={t} onComplete={loadData} sectionColor="#FF9F0A" />
              ))}
            </div>
          </div>
        )}

        {/* Due This Month */}
        {dueThisMonth.length > 0 && (
          <div>
            <p className="section-header">
              <span className="inline-block w-2 h-2 rounded-full bg-status-green mr-1.5 -mb-px" />
              Due This Month ({dueThisMonth.length})
            </p>
            <div className="mx-4 ios-card overflow-hidden">
              {dueThisMonth.map((t) => (
                <TaskCard key={t.id} task={t} onComplete={loadData} sectionColor="#34C759" />
              ))}
            </div>
          </div>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <div>
            <p className="section-header">
              <span className="inline-block w-2 h-2 rounded-full mr-1.5 -mb-px" style={{ backgroundColor: '#36ADF6' }} />
              Upcoming ({upcoming.length})
            </p>
            <div className="mx-4 ios-card overflow-hidden">
              {upcoming.map((t) => (
                <TaskCard key={t.id} task={t} onComplete={loadData} sectionColor="#36ADF6" />
              ))}
            </div>
          </div>
        )}

        {/* Later (no date, or beyond 6 weeks) */}
        {later.length > 0 && (
          <div>
            <p className="section-header">
              <span className="inline-block w-2 h-2 rounded-full mr-1.5 -mb-px" style={{ backgroundColor: '#5856D6' }} />
              Later ({later.length})
            </p>
            <div className="mx-4 ios-card overflow-hidden">
              {later.map((t) => (
                <TaskCard key={t.id} task={t} onComplete={loadData} sectionColor="#5856D6" />
              ))}
            </div>
          </div>
        )}

        {/* Recently Completed — only on the unfiltered view */}
        {claimFilter === 'all' && recentlyCompleted.length > 0 && (
          <div>
            <p className="section-header">
              <span className="inline-block w-2 h-2 rounded-full mr-1.5 -mb-px" style={{ backgroundColor: '#8E8E93' }} />
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
