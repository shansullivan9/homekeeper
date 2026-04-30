'use client';
import { useEffect } from 'react';
import { useConfirmStore } from '@/lib/confirm';

export default function ConfirmDialogHost() {
  const opts = useConfirmStore((s) => s.opts);
  const resolve = useConfirmStore((s) => s.resolve);

  // Esc cancels, Enter confirms — matches native confirm() muscle memory.
  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolve(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        resolve(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opts, resolve]);

  if (!opts) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={opts.title}
      className="fixed inset-0 z-[100] flex items-center justify-center px-6"
    >
      <div
        className="absolute inset-0 bg-black/40 animate-fade-in"
        onClick={() => resolve(false)}
      />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-hidden">
        <div className="px-5 pt-5 pb-4 text-center">
          <h3 className="text-base font-semibold">{opts.title}</h3>
          {opts.message && (
            <p className="text-[13px] text-ink-secondary mt-2 leading-snug">
              {opts.message}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 border-t border-gray-200">
          <button
            onClick={() => resolve(false)}
            className="py-3 text-[15px] text-ink-secondary border-r border-gray-200 active:bg-gray-100 md:hover:bg-gray-50 transition-colors"
          >
            {opts.cancelLabel || 'Cancel'}
          </button>
          <button
            onClick={() => resolve(true)}
            autoFocus
            className={`py-3 text-[15px] font-semibold active:bg-gray-100 md:hover:bg-gray-50 transition-colors ${
              opts.destructive ? 'text-status-red' : 'text-brand-500'
            }`}
          >
            {opts.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
