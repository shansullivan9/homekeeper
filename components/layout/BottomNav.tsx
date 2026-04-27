'use client';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Calendar, PlusCircle, Clock, Settings } from 'lucide-react';

const tabs = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/add', label: 'Add', icon: PlusCircle },
  { href: '/history', label: 'History', icon: Clock },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleAddClick = () => {
    if (pathname.startsWith('/documents')) {
      router.push('/documents?new=1');
      return;
    }
    if (pathname.startsWith('/appliances')) {
      router.push('/appliances?new=1');
      return;
    }
    router.push('/add-task');
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-gray-200/60 shadow-nav"
         style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}>
      <div className="flex items-center justify-around max-w-lg mx-auto h-[54px]">
        {tabs.map((tab) => {
          const active = pathname === tab.href || (tab.href !== '/dashboard' && pathname.startsWith(tab.href));
          const isAdd = tab.href === '/add';
          const Icon = tab.icon;

          return (
            <button
              key={tab.href}
              onClick={() => (isAdd ? handleAddClick() : router.push(tab.href))}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[64px] py-1 transition-colors ${
                isAdd ? '' : active ? 'text-brand-500' : 'text-ink-tertiary'
              }`}
            >
              {isAdd ? (
                <div className="w-11 h-11 -mt-4 rounded-full bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30 active:scale-95 transition-transform">
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
    </nav>
  );
}
