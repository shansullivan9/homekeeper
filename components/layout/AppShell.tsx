'use client';
import { useAppInit } from '@/hooks/useAppInit';
import { useStore } from '@/lib/store';
import BottomNav from '@/components/layout/BottomNav';

export default function AppShell({ children }: { children: React.ReactNode }) {
  useAppInit();
  const loading = useStore((s) => s.loading);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-secondary">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center animate-pulse">
            <span className="text-2xl">🏠</span>
          </div>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-secondary">
      {children}
      <BottomNav />
    </div>
  );
}
