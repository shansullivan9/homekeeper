'use client';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, back, onBack, rightAction }: PageHeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-lg border-b border-gray-100">
      <div className="flex items-center justify-between px-4 h-[56px]"
           style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {back && (
            <button
              onClick={() => (onBack ? onBack() : router.back())}
              className="p-1 -ml-1 text-brand-500 active:opacity-60"
            >
              <ChevronLeft size={28} strokeWidth={2.2} />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{title}</h1>
            {subtitle && <p className="text-xs text-ink-secondary truncate -mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {rightAction && <div className="flex-shrink-0 ml-3">{rightAction}</div>}
      </div>
    </header>
  );
}
