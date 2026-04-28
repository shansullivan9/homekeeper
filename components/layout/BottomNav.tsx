'use client';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Calendar, PlusCircle, Clock, Settings } from 'lucide-react';
import QuickAddMenu from '@/components/layout/QuickAddMenu';

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

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-gray-200/60 shadow-nav"
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
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-w-[56px] py-1 transition-colors ${
                isAdd ? '' : active ? 'text-brand-500' : 'text-ink-tertiary'
              }`}
            >
              {isAdd ? (
                <div className="w-12 h-12 -mt-5 rounded-full bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30 active:scale-95 transition-transform">
                  <Icon size={24} className="text-white" strokeWidth={2} />
                </div>
              ) : (
                <>
                  <Icon size={22} strokeWidth={active ? 2.2 : 1.6} />
                  <span className={`text-[10px] leading-none ${active ? 'font-semibold' : 'font-medium'}`}>
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
