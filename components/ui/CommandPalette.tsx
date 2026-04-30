'use client';
// Cmd+K / Ctrl+K command palette — global navigation + quick actions
// for power users. Opens via the keyboard shortcut anywhere in the app
// (also ⌘K on Mac, Ctrl+K elsewhere). Filters items by typed prefix /
// fuzzy substring.
//
// Mounted once in AppShell; uses a small zustand store for open state
// so anything in the app can call useCommandStore.getState().open().

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { create } from 'zustand';
import {
  LayoutDashboard,
  Calendar as CalendarIcon,
  Clock,
  Settings,
  Package,
  FileText,
  Banknote,
  BarChart3,
  Home as HomeIcon,
  Bell,
  Plus,
  Search as SearchIcon,
  CornerDownLeft,
} from 'lucide-react';

interface CommandStore {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

export const useCommandStore = create<CommandStore>((set, get) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
  toggle: () => set({ open: !get().open }),
}));

interface Item {
  label: string;
  hint?: string;
  group: 'Navigate' | 'Create' | 'Manage';
  icon: any;
  href?: string;
  // For non-navigation actions; takes precedence over href when set.
  run?: () => void;
  keywords?: string[];
}

export default function CommandPalette() {
  const open = useCommandStore((s) => s.open);
  const setOpen = useCommandStore((s) => s.setOpen);
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K / Ctrl+K opens the palette. Esc closes. We attach this
  // hook unconditionally (open or not) so the OPEN shortcut works
  // even when the palette is currently closed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isCmdK) {
        e.preventDefault();
        setOpen(!useCommandStore.getState().open);
      } else if (e.key === 'Escape' && useCommandStore.getState().open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  // Reset query + selection whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      // Focus the input on the next tick so the autoFocus from React
      // doesn't fight the keydown handler that opened us.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items: Item[] = useMemo(
    () => [
      // Navigate
      { label: 'Dashboard',         icon: LayoutDashboard, href: '/dashboard',              group: 'Navigate', keywords: ['home', 'overview'] },
      { label: 'Calendar',          icon: CalendarIcon,    href: '/calendar',               group: 'Navigate', keywords: ['schedule', 'month'] },
      { label: 'Task History',      icon: Clock,           href: '/history',                group: 'Navigate', keywords: ['log', 'completed'] },
      { label: 'Appliances',        icon: Package,         href: '/appliances',             group: 'Navigate', keywords: ['systems'] },
      { label: 'Documents',         icon: FileText,        href: '/documents',              group: 'Navigate', keywords: ['manuals', 'invoices', 'paperwork'] },
      { label: 'Expenses',          icon: Banknote,        href: '/expenses',               group: 'Navigate', keywords: ['cost', 'spending', 'money'] },
      { label: 'Annual Report',     icon: BarChart3,       href: '/reports',                group: 'Navigate', keywords: ['summary', 'pdf'] },
      { label: 'Home Timeline',     icon: Clock,           href: '/timeline',               group: 'Navigate', keywords: ['events'] },
      { label: 'Home Profile',      icon: HomeIcon,        href: '/home-profile',           group: 'Navigate', keywords: ['property', 'address'] },
      { label: 'Settings',          icon: Settings,        href: '/settings',               group: 'Navigate', keywords: ['preferences', 'account'] },
      { label: 'Notification Settings', icon: Bell,        href: '/settings/notifications', group: 'Navigate', keywords: ['push', 'reminders', 'alerts'] },
      // Create
      { label: 'Add Task',          icon: Plus,            href: '/add-task',               group: 'Create',   keywords: ['new', 'todo', 'chore'] },
      { label: 'Add Document',      icon: FileText,        href: '/documents?new=1',        group: 'Create',   keywords: ['upload', 'manual', 'invoice'] },
      { label: 'Add Appliance',     icon: Package,         href: '/appliances?new=1',       group: 'Create',   keywords: ['system', 'register'] },
    ],
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = [
        item.label,
        item.hint || '',
        item.group,
        ...(item.keywords || []),
      ]
        .join(' ')
        .toLowerCase();
      // Every word in the query must appear somewhere — gives us a
      // forgiving fuzzy match without pulling in a library.
      return q.split(/\s+/).every((token) => haystack.includes(token));
    });
  }, [items, query]);

  // Keep activeIdx within the filtered list bounds so navigation
  // never points past the end.
  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered.length, activeIdx]);

  const runItem = (item: Item) => {
    setOpen(false);
    if (item.run) {
      item.run();
    } else if (item.href) {
      router.push(item.href);
    }
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIdx];
      if (item) runItem(item);
    }
  };

  if (!open) return null;

  // Group filtered items by `group` for display. Keep insertion order.
  const grouped: Record<string, Item[]> = {};
  for (const item of filtered) {
    (grouped[item.group] ||= []).push(item);
  }

  // We need to know each item's flat index across groups so the
  // arrow-key activeIdx maps onto the rendered row.
  let flatIdx = 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[110] flex items-start justify-center pt-[10vh] px-4"
    >
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-xl animate-fade-in"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-lg bg-white rounded-ios-xl shadow-elevated overflow-hidden animate-scale-in">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <SearchIcon size={18} className="text-ink-tertiary flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search or jump to…"
            className="flex-1 bg-transparent outline-none text-body placeholder:text-ink-tertiary"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden sm:inline-block text-[10px] font-mono text-ink-tertiary border border-gray-200 rounded px-1.5 py-0.5">
            esc
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="text-caption text-ink-tertiary text-center py-8">
              No matches for &ldquo;{query}&rdquo;
            </p>
          )}
          {Object.entries(grouped).map(([group, list]) => (
            <div key={group} className="py-1">
              <p className="text-micro font-semibold uppercase tracking-wider text-ink-tertiary px-4 py-1.5">
                {group}
              </p>
              {list.map((item) => {
                const myIdx = flatIdx++;
                const isActive = myIdx === activeIdx;
                const Icon = item.icon;
                return (
                  <button
                    key={`${item.group}-${item.label}`}
                    onClick={() => runItem(item)}
                    onMouseEnter={() => setActiveIdx(myIdx)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isActive ? 'bg-brand-50' : 'md:hover:bg-gray-50'
                    }`}
                  >
                    <Icon
                      size={18}
                      className={isActive ? 'text-brand-600' : 'text-ink-secondary'}
                    />
                    <span
                      className={`text-body flex-1 ${
                        isActive ? 'text-brand-700 font-semibold' : 'text-ink-primary font-medium'
                      }`}
                    >
                      {item.label}
                    </span>
                    {isActive && (
                      <CornerDownLeft size={14} className="text-brand-500" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 text-micro text-ink-tertiary">
          <span className="flex items-center gap-3">
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> open</span>
          </span>
          <span><kbd className="font-mono">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
