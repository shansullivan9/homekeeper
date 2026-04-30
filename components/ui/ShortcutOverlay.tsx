'use client';
// Discoverable shortcut cheat-sheet. `?` (Shift+/) toggles open from
// anywhere outside an input. Mounted globally in AppShell.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Row {
  keys: string[];
  label: string;
}

const ROWS: { group: string; rows: Row[] }[] = [
  {
    group: 'Anywhere',
    rows: [
      { keys: ['⌘', 'K'], label: 'Open command palette' },
      { keys: ['N'],      label: 'New task' },
      { keys: ['?'],      label: 'Show this shortcut sheet' },
    ],
  },
  {
    group: 'Calendar',
    rows: [
      { keys: ['←', '→'], label: 'Move selected day by 1' },
      { keys: ['↑', '↓'], label: 'Move selected day by 1 week' },
      { keys: ['T'],      label: 'Jump to today' },
    ],
  },
  {
    group: 'Dialogs',
    rows: [
      { keys: ['Esc'],    label: 'Close any dialog' },
      { keys: ['↵'],      label: 'Confirm the focused action' },
    ],
  },
];

export default function ShortcutOverlay() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Toggle on `?`. We require Shift+/ specifically (and not just /
  // alone) so it doesn't collide with any future "/ to focus search"
  // affordance and matches common cheat-sheet conventions (GitHub,
  // Notion, Linear, etc.).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-[105] flex items-center justify-center px-4"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-fade-in"
        onClick={() => setOpen(false)}
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          WebkitBackdropFilter: 'blur(20px)',
          backdropFilter: 'blur(20px)',
        }}
      />
      <div className="relative w-full max-w-md bg-white rounded-ios-xl shadow-elevated overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="text-title font-semibold">Keyboard Shortcuts</p>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="p-1 -mr-1 text-ink-tertiary tap-shrink"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-3 max-h-[70vh] overflow-y-auto">
          {ROWS.map((section) => (
            <div key={section.group} className="py-2">
              <p className="text-micro font-semibold uppercase tracking-wider text-ink-tertiary mb-2">
                {section.group}
              </p>
              <div className="space-y-2">
                {section.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-body text-ink-primary">{row.label}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {row.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="font-mono text-[11px] text-ink-secondary border border-gray-300 rounded px-1.5 py-0.5 bg-gray-50"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
