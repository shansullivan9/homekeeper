'use client';
import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Calendar, PlusCircle, Clock, Settings } from 'lucide-react';
import QuickAddMenu from '@/components/layout/QuickAddMenu';
import { useStore } from '@/lib/store';

const tabs = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/add', label: 'Add', icon: PlusCircle },
  { href: '/history', label: 'Task History', icon: Clock },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const tasks = useStore((s) => s.tasks);

  // Live overdue counter for the Dashboard tab badge — visible from
  // any page so users always know how many tasks are past due
  // without needing to nav back to the dashboard.
  const overdueCount = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    return tasks.filter(
      (t) =>
        !t.is_suggestion &&
        t.status !== 'completed' &&
        t.status !== 'skipped' &&
        t.due_date &&
        t.due_date < todayIso
    ).length;
  }, [tasks]);

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-gray-200/60 shadow-nav"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}
      aria-label="Primary"
    >
      <div className="flex items-stretch justify-around max-w-lg mx-auto h-[58px]">
        {tabs.map((tab) => {
          const active = pathname === tab.href || (tab.href !== '/dashboard' && pathname.startsWith(tab.href));
          const isAdd = tab.href === '/add';
          const Icon = tab.icon;

          return (
            <button
              key={tab.href}
              onClick={() => (isAdd ? setMenuOpen(true) : router.push(tab.href))}
              aria-label={tab.label}
              aria-current={!isAdd && active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-w-[56px] py-1 transition-all active:scale-95 ${
                isAdd ? '' : active ? 'text-brand-500' : 'text-ink-tertiary md:hover:text-ink-secondary'
              }`}
            >
              {isAdd ? (
                <div className="w-12 h-12 -mt-5 rounded-full bg-gradient-hero flex items-center justify-center shadow-float active:scale-95 transition-transform ring-4 ring-white">
                  <Icon size={24} className="text-white" strokeWidth={2.2} />
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Icon size={22} strokeWidth={active ? 2.4 : 1.6} />
                    {tab.href === '/dashboard' && overdueCount > 0 && (
                      <span
                        aria-label={`${overdueCount} overdue tasks`}
                        className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-status-red text-white text-[9px] font-bold flex items-center justify-center"
                      >
                        {overdueCount > 9 ? '9+' : overdueCount}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] leading-none mt-0.5 ${active ? 'font-semibold' : 'font-medium'}`}>
                    {tab.label}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
      <QuickAddMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </nav>
  );
}
