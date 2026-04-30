'use client';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { format, isBefore, startOfDay, endOfDay, addDays, endOfMonth, subDays } from 'date-fns';
import TaskCard from '@/components/tasks/TaskCard';
import SuggestionBanner from '@/components/dashboard/SuggestionBanner';
import PageHeader from '@/components/layout/PageHeader';
import { useRouter } from 'next/navigation';
import { useAppInit } from '@/hooks/useAppInit';
import { Home as HomeIcon, Users, ChevronRight, ChevronUp, ChevronDown, Package, Clock3, Banknote, FileText, BarChart3 } from 'lucide-react';

type ClaimFilter = 'all' | 'unclaimed' | 'mine' | 'theirs';

// Quick-link items — single source of truth. Default presentation
// is alphabetical by label; user can override via Edit mode and the
// chosen order persists in localStorage scoped to the signed-in user.
const QUICK_LINKS = [
  { label: 'Appliances & Systems', icon: Package, href: '/appliances', color: 'text-purple-500' },
  { label: 'Documents', icon: FileText, href: '/documents', color: 'text-sky-500' },
  { label: 'Expenses', icon: Banknote, href: '/expenses', color: 'text-emerald-500' },
  { label: 'Home Profile', icon: HomeIcon, href: '/home-profile', color: 'text-brand-500' },
  { label: 'Home Timeline', icon: Clock3, href: '/timeline', color: 'text-amber-500' },
  { label: 'Annual Report', icon: BarChart3, href: '/reports', color: 'text-rose-500' },
] as const;

const linkOrderKey = (uid: string | null | undefined) =>
  `hk:dashboard-quick-links-order:${uid || 'anon'}`;

export default function DashboardPage() {
  const { tasks, home, user, members, history, appliances, documents } = useStore();
  const { loadData } = useAppInit();
  const router = useRouter();
  const [claimFilter, setClaimFilter] = useState<ClaimFilter>('all');

  // null = use alphabetical default; array of hrefs = custom user order.
  // Only hrefs that exist in QUICK_LINKS are honored, and any hrefs added
  // to QUICK_LINKS after a user customized get appended alphabetically.
  const [linkOrder, setLinkOrder] = useState<string[] | null>(null);
  const [editingLinks, setEditingLinks] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(linkOrderKey(user?.id));
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) {
          setLinkOrder(arr);
          return;
        }
      }
      setLinkOrder(null);
    } catch {
      setLinkOrder(null);
    }
  }, [user?.id]);

  const orderedLinks = useMemo(() => {
    const alpha = [...QUICK_LINKS].sort((a, b) =>
      a.label.localeCompare(b.label)
    );
    if (!linkOrder) return alpha;
    const byHref = new Map<string, (typeof QUICK_LINKS)[number]>(
      QUICK_LINKS.map((l) => [l.href as string, l])
    );
    const seen = new Set<string>();
    const result: typeof alpha = [];
    for (const href of linkOrder) {
      const found = byHref.get(href);
      if (found && !seen.has(href)) {
        result.push(found);
        seen.add(href);
      }
    }
    // Append any links not in the saved order, alphabetically.
    for (const link of alpha) {
      if (!seen.has(link.href)) result.push(link);
    }
    return result;
  }, [linkOrder]);

  const persistOrder = (next: string[] | null) => {
    setLinkOrder(next);
    if (typeof window === 'undefined') return;
    try {
      const key = linkOrderKey(user?.id);
      if (next === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* localStorage may be disabled — UI still works in-memory */
    }
  };

  const moveLink = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= orderedLinks.length) return;
    const hrefs = orderedLinks.map((l) => l.href);
    [hrefs[idx], hrefs[target]] = [hrefs[target], hrefs[idx]];
    persistOrder(hrefs);
  };

  const resetLinkOrder = () => persistOrder(null);

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
      className={`px-3.5 py-1.5 rounded-full text-caption font-semibold whitespace-nowrap transition-all active:scale-95 ${
        claimFilter === value
          ? 'bg-brand-500 text-white shadow-card'
          : 'bg-white text-ink-secondary shadow-card active:bg-gray-50 md:hover:bg-gray-50'
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
    <div className="mx-4 mt-6 mb-6 rounded-ios-xl bg-gradient-warm p-7 text-center animate-scale-in">
      <div className="text-6xl mb-4 animate-scale-in" aria-hidden="true">🎉</div>
      <p className="text-headline font-bold text-ink-primary tracking-[-0.02em]">
        {claimFilter === 'all' ? "You're all caught up" : 'Nothing in this view'}
      </p>
      <p className="text-caption text-ink-secondary mt-1.5 mb-5 max-w-sm mx-auto">
        {claimFilter === 'all'
          ? activeTasks.length === 0
            ? 'Add your first task or complete your home profile and we\'ll suggest tasks tailored to your house.'
            : 'You have no pending tasks. Nice work.'
          : 'Try switching filters to see other tasks.'}
      </p>
      {claimFilter === 'all' && activeTasks.length === 0 && (
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={() => router.push('/add-task')}
            className="px-5 py-2.5 rounded-ios bg-brand-500 text-white text-body font-semibold active:bg-brand-600 active:scale-[0.98] md:hover:bg-brand-600 transition-all shadow-card"
          >
            Add a task
          </button>
          <button
            onClick={() => router.push('/home-profile')}
            className="px-5 py-2.5 rounded-ios bg-white/70 backdrop-blur-sm text-brand-600 text-body font-semibold active:bg-white active:scale-[0.98] md:hover:bg-white transition-all"
          >
            Complete home profile
          </button>
        </div>
      )}
    </div>
  );

  // Time-of-day greeting drives the hero copy. Kept simple — the
  // home name still anchors identity in the subtitle.
  const greetingHour = now.getHours();
  const greeting =
    greetingHour < 5  ? 'Good evening' :
    greetingHour < 12 ? 'Good morning' :
    greetingHour < 18 ? 'Good afternoon' :
                        'Good evening';
  const firstName = (user?.display_name || '').trim().split(/\s+/)[0] || '';
  const dueTodayCount = useMemo(() => {
    const today = format(now, 'yyyy-MM-dd');
    return activeTasks.filter((t) => t.due_date === today).length;
  }, [activeTasks, now]);
  const spentDisplay =
    spentThisYear >= 10000
      ? `$${(spentThisYear / 1000).toFixed(1)}k`
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(spentThisYear);

  return (
    <div>
      <PageHeader
        title={home?.name || 'HomeKeeper'}
        subtitle={
          claimFilter === 'all'
            ? undefined
            : `${filteredTasks.length} of ${activeTasks.length} active`
        }
        rightAction={
          <button
            onClick={() => router.push('/settings')}
            aria-label="Members and settings"
            className="text-brand-500 p-1.5 -mr-1.5 rounded-full active:bg-brand-50 md:hover:bg-brand-50 transition-colors"
          >
            <Users size={22} />
          </button>
        }
      />

      <div className="pb-4">
        {/* Hero — the headline of the dashboard. Greeting + the three
            numbers users care about (overdue, due today, spent this
            year). Replaces the older standalone tile row. */}
        {claimFilter === 'all' && (
          <div className="mx-4 mt-4 mb-3 animate-scale-in">
            <div className="relative rounded-ios-xl bg-gradient-hero shadow-float overflow-hidden">
              {/* Decorative blob to give the hero some depth without
                  pulling focus from the content. */}
              <div
                className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-25"
                style={{ background: 'radial-gradient(circle at center, #ffffff 0%, transparent 70%)' }}
                aria-hidden="true"
              />
              <div className="relative px-5 pt-5 pb-4 md:px-6 md:pt-6 md:pb-5">
                <p className="text-white/85 text-caption font-medium">
                  {greeting}{firstName ? `, ${firstName}` : ''}
                </p>
                <h2 className="text-white text-display font-bold mt-0.5 leading-tight">
                  {activeTasks.length === 0
                    ? "You're all caught up"
                    : `${activeTasks.length} active task${activeTasks.length === 1 ? '' : 's'}`}
                </h2>

                <div className="grid grid-cols-3 gap-2 mt-4">
                  <button
                    onClick={() => {
                      // Smooth-scroll to the Overdue section instead of
                      // routing — the bucket is right below the hero.
                      if (typeof window !== 'undefined') {
                        const el = document.getElementById('bucket-overdue');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    className="text-left rounded-ios bg-white/12 backdrop-blur-sm px-3 py-2.5 active:bg-white/20 md:hover:bg-white/20 transition-colors"
                  >
                    <p className="text-white text-headline font-bold leading-none animate-count-up">
                      {overdue.length}
                    </p>
                    <p className="text-white/80 text-micro font-medium uppercase tracking-wider mt-1">
                      Overdue
                    </p>
                  </button>
                  <button
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        const el = document.getElementById('bucket-this-week');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    className="text-left rounded-ios bg-white/12 backdrop-blur-sm px-3 py-2.5 active:bg-white/20 md:hover:bg-white/20 transition-colors"
                  >
                    <p className="text-white text-headline font-bold leading-none animate-count-up">
                      {dueTodayCount}
                    </p>
                    <p className="text-white/80 text-micro font-medium uppercase tracking-wider mt-1">
                      Due Today
                    </p>
                  </button>
                  <button
                    onClick={() => router.push('/expenses')}
                    className="text-left rounded-ios bg-white/12 backdrop-blur-sm px-3 py-2.5 active:bg-white/20 md:hover:bg-white/20 transition-colors"
                  >
                    <p className="text-white text-headline font-bold leading-none animate-count-up">
                      {spentDisplay}
                    </p>
                    <p className="text-white/80 text-micro font-medium uppercase tracking-wider mt-1">
                      {currentYear}
                    </p>
                  </button>
                </div>
              </div>
            </div>
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

        {/* Quick Links — only on the unfiltered view. Alphabetical
            by default; long-tap or hit Edit to reorder. */}
        {claimFilter === 'all' && (
          <div className="mx-4 mb-4">
            <div className="flex items-center justify-end gap-3 mb-1.5 px-1">
              {editingLinks && linkOrder && (
                <button
                  onClick={resetLinkOrder}
                  className="text-xs font-medium text-ink-tertiary md:hover:text-ink-secondary"
                >
                  Reset
                </button>
              )}
              <button
                onClick={() => setEditingLinks((v) => !v)}
                className="text-xs font-semibold text-brand-500"
              >
                {editingLinks ? 'Done' : 'Edit'}
              </button>
            </div>
            <div className="ios-card overflow-hidden">
              {orderedLinks.map((link, idx) => {
                const Icon = link.icon;
                const count =
                  link.href === '/appliances'
                    ? appliances.length
                    : link.href === '/documents'
                    ? documents.length
                    : null;
                const isFirst = idx === 0;
                const isLast = idx === orderedLinks.length - 1;
                if (editingLinks) {
                  return (
                    <div key={link.href} className="ios-list-item w-full">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center ${link.color}`}>
                          <Icon size={18} />
                        </div>
                        <span className="text-[15px] font-medium">{link.label}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveLink(idx, -1)}
                          disabled={isFirst}
                          aria-label={`Move ${link.label} up`}
                          className="w-8 h-8 rounded-md flex items-center justify-center text-ink-secondary disabled:opacity-30 active:bg-surface-tertiary"
                        >
                          <ChevronUp size={18} />
                        </button>
                        <button
                          onClick={() => moveLink(idx, 1)}
                          disabled={isLast}
                          aria-label={`Move ${link.label} down`}
                          className="w-8 h-8 rounded-md flex items-center justify-center text-ink-secondary disabled:opacity-30 active:bg-surface-tertiary"
                        >
                          <ChevronDown size={18} />
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <button
                    key={link.href}
                    onClick={() => router.push(link.href)}
                    className="ios-list-item w-full"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center ${link.color}`}>
                        <Icon size={18} />
                      </div>
                      <span className="text-[15px] font-medium">{link.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {count !== null && count > 0 && (
                        <span className="text-xs text-ink-tertiary tabular-nums">{count}</span>
                      )}
                      <ChevronRight size={16} className="text-ink-tertiary" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {everythingEmpty && emptyState}

        {/* Task buckets — single column on mobile, two columns on desktop.
            When everything is empty we show the hero above instead. */}
        <div className={`md:grid md:grid-cols-2 md:gap-x-4 md:px-0 ${everythingEmpty ? 'hidden' : ''}`}>
          {/* Overdue */}
          <div id="bucket-overdue" className="scroll-mt-20">
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
          <div id="bucket-this-week" className="scroll-mt-20">
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
            <div className="section-header flex items-center justify-between !pr-2">
              <span className="flex items-center">
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: '#8E8E93' }} />
                Recently Completed ({recentlyCompleted.length})
              </span>
              <button
                onClick={() => router.push('/history')}
                className="text-brand-500 text-caption font-semibold normal-case tracking-normal active:text-brand-600 md:hover:text-brand-600"
              >
                View all
              </button>
            </div>
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
