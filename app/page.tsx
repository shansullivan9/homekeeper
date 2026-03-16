'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      router.replace(user ? '/dashboard' : '/auth');
    };
    check();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-secondary">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-brand-500 flex items-center justify-center">
          <span className="text-3xl">🏠</span>
        </div>
        <p className="text-ink-secondary text-sm">Loading...</p>
      </div>
    </div>
  );
}
