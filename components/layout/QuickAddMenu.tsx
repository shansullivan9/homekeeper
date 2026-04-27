'use client';
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
      className="fixed inset-0 z-[60] bg-black/40 flex items-end md:items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-ios-lg w-full max-w-sm shadow-xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-[15px] font-semibold">Add new</p>
          <button onClick={onClose} className="p-1 -mr-1 text-ink-tertiary">
            <X size={20} />
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => go(item.path)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50"
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${item.tone}`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-[15px] font-medium">{item.label}</p>
                  <p className="text-xs text-ink-tertiary">{item.hint}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
