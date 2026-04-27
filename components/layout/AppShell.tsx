'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import { useRouter, usePathname } from 'next/navigation';
import BottomNav from '@/components/layout/BottomNav';
import SideNav from '@/components/layout/SideNav';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const store = useStore();
  const supabase = createClient();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          router.push('/auth');
          return;
        }

        const userId = session.user.id;

        // Load profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        if (profile) store.setUser(profile);

        // Load home membership
        const { data: membership } = await supabase
          .from('home_members')
          .select('*')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();

        if (!membership) {
          if (pathname !== '/home-profile') {
            router.push('/home-profile');
          }
          setReady(true);
          return;
        }

        // Load home
        const { data: homeData } = await supabase
          .from('homes')
          .select('*')
          .eq('id', membership.home_id)
          .maybeSingle();

        if (homeData) store.setHome(homeData);

        // Load everything else in parallel
        const homeId = homeData?.id || membership.home_id;
        const results = await Promise.allSettled([
          supabase.from('tasks').select('*').eq('home_id', homeId),
          supabase.from('categories').select('*').order('sort_order'),
          supabase.from('home_members').select('*').eq('home_id', homeId),
          supabase.from('appliances').select('*').eq('home_id', homeId),
          supabase.from('task_history').select('*').eq('home_id', homeId).order('completed_at', { ascending: false }).limit(100),
          supabase.from('documents').select('*').eq('home_id', homeId).order('uploaded_at', { ascending: false }),
        ]);

        const getData = (r: any) => r.status === 'fulfilled' ? r.value.data || [] : [];
        store.setTasks(getData(results[0]));
        store.setCategories(getData(results[1]));
        const rawMembers = getData(results[2]);
        store.setAppliances(getData(results[3]));
        store.setHistory(getData(results[4]));
        store.setDocuments(getData(results[5]));

        const memberUserIds = rawMembers
          .map((m: any) => m.user_id)
          .filter(Boolean);
        if (memberUserIds.length > 0) {
          const { data: memberProfiles } = await supabase
            .from('profiles')
            .select('id, display_name, email')
            .in('id', memberUserIds);
          const byId = new Map(
            (memberProfiles || []).map((p: any) => [p.id, p])
          );
          store.setMembers(
            rawMembers.map((m: any) => ({
              ...m,
              display_name: byId.get(m.user_id)?.display_name || null,
              email: byId.get(m.user_id)?.email || null,
            }))
          );
        } else {
          store.setMembers(rawMembers);
        }

      } catch (err: any) {
        setError(err.message || 'Something went wrong');
      }

      setReady(true);
      store.setLoading(false);
    }

    init();
  }, []);

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>Error</h2>
        <p style={{ color: 'red' }}>{error}</p>
        <button onClick={() => window.location.href = '/auth'} style={{ marginTop: 20, padding: '10px 20px' }}>
          Back to Login
        </button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ fontSize: 32 }}>🏠</div>
        <p style={{ color: '#888', marginTop: 8 }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-secondary">
      <SideNav />
      <div className="md:pl-60">
        <div className="md:max-w-3xl md:mx-auto md:px-2">
          {children}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
