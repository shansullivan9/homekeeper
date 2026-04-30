'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ListTodo, FileText, Package, X } from 'lucide-react';

export default function QuickAddMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  // Close on Escape so keyboard users aren't trapped.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const go = (path: string) => {
    onClose();
    router.push(path);
  };

  const items = [
    {
      label: 'Task',
      hint: 'A chore or maintenance item',
      icon: ListTodo,
      tone: 'bg-emerald-50 text-emerald-600',
      path: '/add-task',
    },
    {
      label: 'Document',
      hint: 'Upload a manual, invoice, or paperwork',
      icon: FileText,
      tone: 'bg-sky-50 text-sky-600',
      path: '/documents?new=1',
    },
    {
      label: 'Appliance',
      hint: 'Track a system or appliance',
      icon: Package,
      tone: 'bg-purple-50 text-purple-600',
      path: '/appliances?new=1',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-md flex items-end md:items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-ios-xl w-full max-w-sm shadow-elevated overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Drag handle on mobile so it visually reads as a sheet. */}
        <div className="flex justify-center pt-2.5 md:hidden">
          <div className="w-9 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <p className="text-title font-semibold">Add new</p>
          <button
            onClick={onClose}
            aria-label="Close add menu"
            className="p-1 -mr-1 text-ink-tertiary tap-shrink"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-2 pb-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => go(item.path)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-ios text-left active:bg-gray-50 active:scale-[0.99] md:hover:bg-gray-50 transition-all"
              >
                <div className={`w-10 h-10 rounded-ios flex items-center justify-center ${item.tone}`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-body font-semibold">{item.label}</p>
                  <p className="text-caption text-ink-tertiary">{item.hint}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
