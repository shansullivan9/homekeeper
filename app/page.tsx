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
    <div className="flex items-center justify-center min-h-screen bg-gradient-hero-soft">
      <div className="flex flex-col items-center gap-3 animate-scale-in">
        <div className="w-16 h-16 rounded-ios-xl bg-gradient-hero flex items-center justify-center shadow-float">
          <span className="text-3xl">🏠</span>
        </div>
        <p className="text-ink-secondary text-caption">Loading…</p>
      </div>
    </div>
  );
}
