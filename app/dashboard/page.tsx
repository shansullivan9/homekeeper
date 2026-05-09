'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import {
  pickPendingDuplicatesToDelete,
  pickRecurringTasksToRespawn,
} from '@/lib/task-dedup';
import { format, isBefore, startOfDay, endOfDay, addDays, endOfMonth, subDays } from 'date-fns';
import TaskCard from '@/components/tasks/TaskCard';
import SuggestionBanner from '@/components/dashboard/SuggestionBanner';
import PageHeader from '@/components/layout/PageHeader';
import { useRouter } from 'next/navigation';
import { useAppInit } from '@/hooks/useAppInit';
import { Home as HomeIcon, Users, ChevronRight, ChevronDown, GripVertical, Package, Clock3, Banknote, FileText, BarChart3, Briefcase } from 'lucide-react';
import { useStoredState } from '@/lib/useStoredState';

type ClaimFilter = 'all' | 'unclaimed' | 'mine' | 'theirs';

// Quick-link items — single source of truth. Default presentation
// is alphabetical by label; user can override via Edit mode and the
// chosen order persists in localStorage scoped to the signed-in user.
const QUICK_LINKS = [
  { label: 'Appliances & Systems', icon: Package, href: '/appliances', color: 'text-purple-500' },
  { label: 'Contractors', icon: Briefcase, href: '/contractors', color: 'text-indigo-500' },
  { label: 'Documents', icon: FileText, href: '/documents', color: 'text-sky-500' },
  { label: 'Expenses', icon: Banknote, href: '/expenses', color: 'text-emerald-500' },
  { label: 'Home Profile', icon: HomeIcon, href: '/home-profile', color: 'text-brand-500' },
  { label: 'Home Timeline', icon: Clock3, href: '/timeline', color: 'text-amber-500' },
  { label: 'Annual Report', icon: BarChart3, href: '/reports', color: 'text-rose-500' },
] as const;

const linkOrderKey = (uid: string | null | undefined) =>
  `hk:dashboard-quick-links-order:${uid || 'anon'}`;

export default function DashboardPage() {
  const { tasks, home, user, members, history, appliances, documents, contractors, categories } = useStore();
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

  // One-shot auto-migration: re-point any task that's still attached
  // to the legacy "Yard" category at "Exterior". Runs once per dashboard
  // mount and is a no-op when nothing matches. RLS lets the user update
  // their own household's tasks; the now-orphan default Yard category
  // row is hidden from pickers separately so the user never sees it.
  const yardMigratedRef = useRef(false);
  useEffect(() => {
    if (yardMigratedRef.current) return;
    if (!home?.id || categories.length === 0 || tasks.length === 0) return;
    const yardCat = categories.find(
      (c: any) => (c.name || '').trim().toLowerCase() === 'yard'
    );
    const exteriorCat = categories.find(
      (c: any) => (c.name || '').trim().toLowerCase() === 'exterior'
    );
    if (!yardCat || !exteriorCat) {
      yardMigratedRef.current = true;
      return;
    }
    const yardTasks = tasks.filter((t) => t.category_id === yardCat.id);
    if (yardTasks.length === 0) {
      yardMigratedRef.current = true;
      return;
    }
    yardMigratedRef.current = true;
    const supabase = createClient();
    supabase
      .from('tasks')
      .update({ category_id: exteriorCat.id, updated_at: new Date().toISOString() })
      .in('id', yardTasks.map((t) => t.id))
      .then(({ error }) => {
        if (error) {
          // eslint-disable-next-line no-console
          console.warn('[migrate-yard] update failed', error);
          yardMigratedRef.current = false;
          return;
        }
        const yardSet = new Set(yardTasks.map((t) => t.id));
        useStore.getState().setTasks(
          useStore.getState().tasks.map((t) =>
            yardSet.has(t.id) ? ({ ...t, category_id: exteriorCat.id } as any) : t
          )
        );
      });
  }, [home?.id, categories, tasks]);

  // Self-healing for the recurring-bill pipeline. Two operations, both
  // idempotent and gated to run at most once per dashboard mount:
  //   1. Collapse duplicate pending recurring tasks created by older
  //      uploads where AI phrasing drift fooled dedup.
  //   2. Respawn a pending task for any (vendor, recurrence) group that
  //      has completed history but no live pending — covers the case
  //      where the user trash-canned a recurring pending and the chain
  //      silently stopped firing.
  const cleanedUpRef = useRef(false);
  useEffect(() => {
    if (cleanedUpRef.current) return;
    if (!home?.id || tasks.length === 0) return;
    cleanedUpRef.current = true;

    const toDelete = pickPendingDuplicatesToDelete(tasks);
    const seeds = pickRecurringTasksToRespawn(tasks);
    if (toDelete.length === 0 && seeds.length === 0) return;

    const supabase = createClient();
    (async () => {
      const dropped = new Set<string>();
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from('tasks')
          .delete()
          .in('id', toDelete);
        if (error) {
          // eslint-disable-next-line no-console
          console.warn('[dedupe-pending] delete failed', error);
          cleanedUpRef.current = false;
        } else {
          for (const id of toDelete) dropped.add(id);
        }
      }

      const respawned: any[] = [];
      for (const seed of seeds) {
        const { data, error } = await supabase
          .from('tasks')
          .insert({
            home_id: seed.home_id,
            category_id: seed.category_id,
            title: seed.title,
            description: seed.description,
            due_date: seed.due_date,
            recurrence: seed.recurrence,
            priority: 'medium',
            status: 'pending',
            estimated_cost: seed.estimated_cost,
            created_by: seed.created_by,
            assigned_to: seed.assigned_to,
          })
          .select()
          .single();
        if (error) {
          // eslint-disable-next-line no-console
          console.warn('[respawn-recurring] insert failed', error);
          continue;
        }
        if (data) respawned.push(data);
      }

      if (dropped.size > 0 || respawned.length > 0) {
        const current = useStore.getState().tasks;
        const next = [
          ...respawned,
          ...current.filter((t) => !dropped.has(t.id)),
        ];
        useStore.getState().setTasks(next);
      }
    })();
  }, [home?.id, tasks]);

  const orderedLinks = useMemo(() => {
    const alpha = [...QUICK_LINKS].sort((a, b) =>
      a.label.localeCompare(b.label)
    );
    if (!linkOrder) return alpha;
    const byHref = new Map<string, (typeof QUICK_LINKS)[number]>(
      QUICK_LINKS.map((l) => [l.href as string, l])
    );
    const saved = linkOrder
      .map((href) => byHref.get(href))
      .filter((l): l is (typeof QUICK_LINKS)[number] => !!l);

    // If the saved order is already alphabetical for the links it
    // covers, the user never actually customized — fall back to the
    // fresh alphabetical default so new features slot in by name.
    const savedAlpha = [...saved].sort((a, b) =>
      a.label.localeCompare(b.label)
    );
    const savedIsAlphabetical = saved.every(
      (l, i) => l.href === savedAlpha[i]?.href
    );
    if (savedIsAlphabetical) return alpha;

    const seen = new Set<string>(saved.map((l) => l.href));
    const result: typeof alpha = [...saved];
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

  const resetLinkOrder = () => persistOrder(null);

  // Drag-to-reorder. We use pointer events so the same code path
  // handles mouse + touch. While dragging, finger position is matched
  // to row bounding rects (midpoint test) and the saved order is
  // updated live so the list reflows under the finger.
  const linksListRef = useRef<HTMLDivElement | null>(null);
  const [draggingHref, setDraggingHref] = useState<string | null>(null);

  // FLIP animation: capture each row's position before the next
  // render, then translate it back and animate to zero so reorders
  // slide instead of jumping. Skip the dragged row — it's already
  // where the finger put it.
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());
  useLayoutEffect(() => {
    const list = linksListRef.current;
    if (!list) return;
    const rows = Array.from(
      list.querySelectorAll<HTMLElement>('[data-link-href]')
    );
    if (rows.length === 0) {
      prevRectsRef.current.clear();
      return;
    }
    const newRects = new Map<string, DOMRect>();
    for (const row of rows) {
      newRects.set(row.dataset.linkHref!, row.getBoundingClientRect());
    }
    const prev = prevRectsRef.current;
    for (const row of rows) {
      const href = row.dataset.linkHref!;
      if (href === draggingHref) continue;
      const before = prev.get(href);
      const after = newRects.get(href)!;
      if (!before) continue;
      const dy = before.top - after.top;
      if (Math.abs(dy) < 1) continue;
      row.style.transition = 'none';
      row.style.transform = `translateY(${dy}px)`;
    }
    void list.offsetHeight;
    for (const row of rows) {
      const href = row.dataset.linkHref!;
      if (href === draggingHref) continue;
      if (!prev.has(href)) continue;
      row.style.transition = 'transform 200ms cubic-bezier(0.2, 0, 0, 1)';
      row.style.transform = '';
    }
    prevRectsRef.current = newRects;
  });

  const handleDragMove = (e: React.PointerEvent) => {
    if (!draggingHref || !linksListRef.current) return;
    e.preventDefault();
    const rows = Array.from(
      linksListRef.current.querySelectorAll<HTMLElement>('[data-link-href]')
    );
    const from = orderedLinks.findIndex((l) => l.href === draggingHref);
    if (from < 0) return;

    let target = from;
    for (let i = 0; i < rows.length; i++) {
      if (i === from) continue;
      const rect = rows[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (i < from && e.clientY < mid) {
        target = i;
        break;
      }
      if (i > from && e.clientY > mid) {
        target = i;
      }
    }

    if (target !== from) {
      const hrefs = orderedLinks.map((l) => l.href);
      const [moved] = hrefs.splice(from, 1);
      hrefs.splice(target, 0, moved);
      persistOrder(hrefs);
    }
  };

  const endDrag = () => setDraggingHref(null);

  // Per-bucket collapse state. Stored as an array (JSON-friendly) and
  // converted to a Set for O(1) membership checks. Each section
  // header is tap-to-toggle so the user can hide overwhelming
  // buckets (e.g. 11 mortgage bills under "Due This Month") without
  // scrolling past them every time.
  const [collapsedBuckets, setCollapsedBuckets] = useStoredState<string[]>(
    'dashboard:collapsed-buckets',
    [],
    user?.id
  );
  const collapsed = useMemo(() => new Set(collapsedBuckets), [collapsedBuckets]);
  const toggleBucket = (key: string) => {
    setCollapsedBuckets((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

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
    // Sort each bucket by due date ascending so the most-imminent tasks
    // surface first within their section. Overdue is sorted oldest →
    // newest (most overdue at the top so it can't be missed). Tasks
    // without a due date land last, alphabetically.
    const byDueAsc = (a: any, b: any) =>
      (a.due_date || '￿').localeCompare(b.due_date || '￿');
    overdue.sort(byDueAsc);
    dueThisWeek.sort(byDueAsc);
    dueThisMonth.sort(byDueAsc);
    upcoming.sort(byDueAsc);
    later.sort((a, b) => {
      if (a.due_date && b.due_date) return byDueAsc(a, b);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return (a.title || '').localeCompare(b.title || '');
    });
    return { overdue, dueThisWeek, dueThisMonth, upcoming, later };
  }, [filteredTasks, now, weekEnd, monthEnd, sixWeeksOut]);

  const overdue = buckets.overdue;
  const dueThisWeek = buckets.dueThisWeek;
  const dueThisMonth = buckets.dueThisMonth;
  const upcoming = buckets.upcoming;
  const later = buckets.later;

  // "Recently Completed" surfaces both work that was completed
  // recently AND historical completions that the user just logged
  // (e.g. uploading 4 months of past bills). We OR the completed_at
  // window with a created_at window so freshly-inserted rows show up
  // even when their service date is months in the past.
  const recentlyCompletedCutoff = useMemo(() => subDays(now, 30), [now]);
  const recentlyCompleted = useMemo(() =>
    tasks
      .filter((t) => {
        if (t.status !== 'completed' || !t.completed_at) return false;
        const completedRecently =
          new Date(t.completed_at) >= recentlyCompletedCutoff;
        const loggedRecently =
          (t as any).created_at &&
          new Date((t as any).created_at) >= recentlyCompletedCutoff;
        if (!completedRecently && !loggedRecently) return false;
        // Match the claim filter so "Yours" shows only tasks you
        // completed, "Theirs" shows partner-completed, etc.
        if (claimFilter === 'mine')
          return (t as any).completed_by === user?.id;
        if (claimFilter === 'theirs')
          return (t as any).completed_by && (t as any).completed_by !== user?.id;
        if (claimFilter === 'unclaimed') return !(t as any).completed_by;
        return true;
      })
      .sort((a, b) => {
        // Sort strictly by service date (completed_at), most recent
        // first — that's how a completion log reads. created_at is
        // only consulted in the FILTER above so just-logged old
        // bills make it through the visibility window.
        const aT = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const bT = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return bT - aT;
      }),
    [tasks, recentlyCompletedCutoff, claimFilter, user]
  );
  const RECENTLY_COMPLETED_LIMIT = 25;
  const recentlyCompletedVisible = recentlyCompleted.slice(0, RECENTLY_COMPLETED_LIMIT);
  const recentlyCompletedHidden = Math.max(
    0,
    recentlyCompleted.length - RECENTLY_COMPLETED_LIMIT
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
            by default; hit Edit then drag the handle to reorder. */}
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
            <div ref={linksListRef} className="ios-card overflow-hidden">
              {orderedLinks.map((link) => {
                const Icon = link.icon;
                const count =
                  link.href === '/appliances'
                    ? appliances.length
                    : link.href === '/documents'
                    ? documents.length
                    : link.href === '/contractors'
                    ? contractors.length
                    : null;
                if (editingLinks) {
                  const isDragging = draggingHref === link.href;
                  return (
                    <div
                      key={link.href}
                      data-link-href={link.href}
                      className={`ios-list-item w-full transition-shadow ${
                        isDragging
                          ? 'bg-brand-50/60 shadow-md scale-[1.01] relative z-10'
                          : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center ${link.color}`}>
                          <Icon size={18} />
                        </div>
                        <span className="text-[15px] font-medium">{link.label}</span>
                      </div>
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          setDraggingHref(link.href);
                        }}
                        onPointerMove={handleDragMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        aria-label={`Drag to reorder ${link.label}`}
                        className="w-10 h-10 -mr-2 rounded-md flex items-center justify-center text-ink-tertiary active:text-ink-secondary touch-none cursor-grab active:cursor-grabbing select-none"
                      >
                        <GripVertical size={18} />
                      </button>
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
            <BucketHeader
              bucketKey="overdue"
              label="Overdue"
              count={overdue.length}
              dotColor="#FF3B30"
              collapsed={collapsed.has('overdue')}
              onToggle={() => toggleBucket('overdue')}
            />
            {!collapsed.has('overdue') && (
              <div className="mx-4 ios-card overflow-hidden">
                {overdue.length > 0 ? (
                  overdue.map((t) => (
                    <TaskCard key={t.id} task={t} onComplete={loadData} sectionColor="#FF3B30" />
                  ))
                ) : (
                  <div className="px-4 py-3.5 text-sm text-ink-tertiary">None</div>
                )}
              </div>
            )}
          </div>

          {/* Due This Week */}
          <div id="bucket-this-week" className="scroll-mt-20">
            <BucketHeader
              bucketKey="this-week"
              label="Due This Week"
              count={dueThisWeek.length}
              dotColor="#FF9F0A"
              collapsed={collapsed.has('this-week')}
              onToggle={() => toggleBucket('this-week')}
            />
            {!collapsed.has('this-week') && (
              <div className="mx-4 ios-card overflow-hidden">
                {dueThisWeek.length > 0 ? (
                  dueThisWeek.map((t) => (
                    <TaskCard key={t.id} task={t} onComplete={loadData} sectionColor="#FF9F0A" />
                  ))
                ) : (
                  <div className="px-4 py-3.5 text-sm text-ink-tertiary">None</div>
                )}
              </div>
            )}
          </div>

          {/* Due This Month */}
          <div>
            <BucketHeader
              bucketKey="this-month"
              label="Due This Month"
              count={dueThisMonth.length}
              dotColor="#34C759"
              collapsed={collapsed.has('this-month')}
              onToggle={() => toggleBucket('this-month')}
            />
            {!collapsed.has('this-month') && (
              <div className="mx-4 ios-card overflow-hidden">
                {dueThisMonth.length > 0 ? (
                  dueThisMonth.map((t) => (
                    <TaskCard key={t.id} task={t} onComplete={loadData} sectionColor="#34C759" />
                  ))
                ) : (
                  <div className="px-4 py-3.5 text-sm text-ink-tertiary">None</div>
                )}
              </div>
            )}
          </div>

          {/* Upcoming */}
          <div>
            <BucketHeader
              bucketKey="upcoming"
              label="Upcoming"
              count={upcoming.length}
              dotColor="#4B9CD3"
              collapsed={collapsed.has('upcoming')}
              onToggle={() => toggleBucket('upcoming')}
            />
            {!collapsed.has('upcoming') && (
              <div className="mx-4 ios-card overflow-hidden">
                {upcoming.length > 0 ? (
                  upcoming.map((t) => (
                    <TaskCard key={t.id} task={t} onComplete={loadData} sectionColor="#4B9CD3" />
                  ))
                ) : (
                  <div className="px-4 py-3.5 text-sm text-ink-tertiary">None</div>
                )}
              </div>
            )}
          </div>

          {/* Later */}
          <div>
            <BucketHeader
              bucketKey="later"
              label="Later"
              count={later.length}
              dotColor="#592A8A"
              collapsed={collapsed.has('later')}
              onToggle={() => toggleBucket('later')}
            />
            {!collapsed.has('later') && (
              <div className="mx-4 ios-card overflow-hidden">
                {later.length > 0 ? (
                  later.map((t) => (
                    <TaskCard key={t.id} task={t} onComplete={loadData} sectionColor="#592A8A" />
                  ))
                ) : (
                  <div className="px-4 py-3.5 text-sm text-ink-tertiary">None</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Recently Completed — outside the conditional bucket grid so
            it stays visible even when active buckets are empty. */}
        {recentlyCompleted.length > 0 && (
          <div>
            <BucketHeader
              bucketKey="recently-completed"
              label="Recently Completed"
              count={recentlyCompleted.length}
              dotColor="#8E8E93"
              collapsed={collapsed.has('recently-completed')}
              onToggle={() => toggleBucket('recently-completed')}
              rightSlot={
                <button
                  onClick={(e) => { e.stopPropagation(); router.push('/history'); }}
                  className="text-brand-500 text-caption font-semibold normal-case tracking-normal active:text-brand-600 md:hover:text-brand-600"
                >
                  View all
                </button>
              }
            />
            {!collapsed.has('recently-completed') && (
              <div className="mx-4 ios-card overflow-hidden">
                {recentlyCompletedVisible.map((t) => (
                  <TaskCard key={t.id} task={t} compact sectionColor="#8E8E93" />
                ))}
                {recentlyCompletedHidden > 0 && (
                  <button
                    onClick={() => router.push('/history')}
                    className="ios-list-item w-full text-brand-500 text-caption font-semibold active:bg-gray-50 md:hover:bg-gray-50"
                  >
                    +{recentlyCompletedHidden} more in Task History →
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Tap-to-collapse section header used by every dashboard bucket.
// Renders the colored dot + label + count, a chevron that flips
// when collapsed, and an optional rightSlot for actions like
// "View all" that should sit in the same row.
function BucketHeader({
  bucketKey,
  label,
  count,
  dotColor,
  collapsed,
  onToggle,
  rightSlot,
}: {
  bucketKey: string;
  label: string;
  count: number;
  dotColor: string;
  collapsed: boolean;
  onToggle: () => void;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="section-header flex items-center justify-between !pr-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={`bucket-body-${bucketKey}`}
        className="flex items-center gap-1.5 flex-1 text-left active:opacity-70"
      >
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <span>
          {label} ({count})
        </span>
        <ChevronDown
          size={14}
          className={`text-ink-tertiary transition-transform ${
            collapsed ? '-rotate-90' : ''
          }`}
        />
      </button>
      {rightSlot}
    </div>
  );
}
