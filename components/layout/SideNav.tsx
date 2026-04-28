'use client';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  PlusCircle,
  Clock,
  Settings,
  Home as HomeIcon,
  Package,
  FileText,
  Banknote,
  Clock3,
} from 'lucide-react';
import QuickAddMenu from '@/components/layout/QuickAddMenu';

const primaryTabs = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/history', label: 'Task History', icon: Clock },
];

const secondaryTabs = [
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/appliances', label: 'Appliances', icon: Package },
  { href: '/expenses', label: 'Expenses', icon: Banknote },
  { href: '/timeline', label: 'Home Timeline', icon: Clock3 },
  { href: '/home-profile', label: 'Home Profile', icon: HomeIcon },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function SideNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const renderTab = (tab: { href: string; label: string; icon: any }) => {
    const Icon = tab.icon;
    const active =
      pathname === tab.href || (tab.href !== '/dashboard' && pathname.startsWith(tab.href));
    return (
      <button
        key={tab.href}
        onClick={() => router.push(tab.href)}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-3 px-3 py-2 rounded-ios text-[14px] font-medium transition-colors ${
          active
            ? 'bg-brand-50 text-brand-600'
            : 'text-ink-secondary hover:bg-gray-50 hover:text-ink-primary'
        }`}
      >
        <Icon size={18} strokeWidth={active ? 2.2 : 1.7} />
        <span>{tab.label}</span>
      </button>
    );
  };

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-60 bg-white border-r border-gray-200/70 flex-col z-40">
      <button
        onClick={() => router.push('/dashboard')}
        className="px-5 py-5 flex items-center gap-2 border-b border-gray-100 text-left hover:bg-gray-50/50 transition-colors"
      >
        <span className="text-2xl">🏠</span>
        <div>
          <p className="text-[15px] font-bold leading-tight">HomeKeeper</p>
          <p className="text-[11px] text-ink-tertiary leading-tight">Maintenance, made simple</p>
        </div>
      </button>

      <div className="px-3 py-4">
        <button
          onClick={() => setMenuOpen(true)}
          className="w-full flex items-center gap-2 justify-center bg-brand-500 text-white rounded-ios py-2.5 text-[14px] font-semibold shadow-md shadow-brand-500/20 hover:bg-brand-600 transition-colors"
        >
          <PlusCircle size={18} strokeWidth={2.2} />
          New
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-0.5">
        {primaryTabs.map(renderTab)}
        <p className="text-[10px] uppercase tracking-wider text-ink-tertiary font-semibold mt-4 mb-1 px-3">
          Library
        </p>
        {secondaryTabs.map(renderTab)}
      </nav>
      <QuickAddMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </aside>
  );
}
