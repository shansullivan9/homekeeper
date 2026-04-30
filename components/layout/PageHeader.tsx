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
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-gray-100/80 md:bg-white/90">
      <div
        className="flex items-center justify-between px-4 md:px-6 h-[56px] md:h-[64px]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {back && (
            <button
              onClick={() => (onBack ? onBack() : router.back())}
              aria-label="Go back"
              className="p-1.5 -ml-1.5 rounded-full text-brand-500 active:opacity-60 active:scale-95 md:hover:bg-brand-50 transition-all"
            >
              <ChevronLeft size={26} strokeWidth={2.2} />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-title md:text-headline font-bold truncate leading-tight tracking-[-0.01em]">
              {title}
            </h1>
            {subtitle && (
              <p className="text-caption text-ink-secondary truncate leading-tight mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {rightAction && <div className="flex-shrink-0 ml-3">{rightAction}</div>}
      </div>
    </header>
  );
}
