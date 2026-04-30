'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import { useRouter, usePathname } from 'next/navigation';
import BottomNav from '@/components/layout/BottomNav';
import SideNav from '@/components/layout/SideNav';
import ConfirmDialogHost from '@/components/ui/ConfirmDialog';
import CommandPalette from '@/components/ui/CommandPalette';
import { useRealtimeHome } from '@/hooks/useRealtimeHome';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const store = useStore();
  const supabase = createClient();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  // Subscribe to Supabase Realtime once the home is loaded so changes
  // from another device or housemate flow into the local store.
  useRealtimeHome();

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

        // Load all of the user's home memberships and pick which home
        // to display. Preference order:
        //  1. The home_id stored in localStorage (last one the user
        //     opened, or the one they explicitly switched to).
        //  2. The first membership returned (legacy single-home users).
        const { data: memberships } = await supabase
          .from('home_members')
          .select('*')
          .eq('user_id', userId);

        if (!memberships || memberships.length === 0) {
          if (pathname !== '/home-profile') {
            router.push('/home-profile');
          }
          setReady(true);
          return;
        }

        const stored =
          typeof window !== 'undefined'
            ? window.localStorage.getItem('homekeeper.selectedHomeId')
            : null;
        const membership =
          (stored && memberships.find((m: any) => m.home_id === stored)) ||
          memberships[0];

        // Load home
        const { data: homeData } = await supabase
          .from('homes')
          .select('*')
          .eq('id', (membership as any).home_id)
          .maybeSingle();

        if (homeData) store.setHome(homeData);
        // Surface the rest of the user's memberships so the Settings
        // home-switcher can list them with names.
        store.setUserMemberships(memberships as any);

        // Load everything else in parallel
        const homeId = homeData?.id || membership.home_id;
        const results = await Promise.allSettled([
          supabase.from('tasks').select('*').eq('home_id', homeId),
          supabase.from('categories').select('*').order('sort_order'),
          supabase.from('home_members').select('*').eq('home_id', homeId),
          supabase.from('appliances').select('*').eq('home_id', homeId),
          supabase.from('task_history').select('*').eq('home_id', homeId).order('completed_at', { ascending: false }).limit(100),
          supabase.from('documents').select('*').eq('home_id', homeId).order('uploaded_at', { ascending: false }),
          supabase.from('suggestion_dismissals').select('title').eq('home_id', homeId),
        ]);

        const getData = (r: any) => r.status === 'fulfilled' ? r.value.data || [] : [];
        store.setTasks(getData(results[0]));
        store.setCategories(getData(results[1]));
        const rawMembers = getData(results[2]);
        store.setAppliances(getData(results[3]));
        store.setHistory(getData(results[4]));
        store.setDocuments(getData(results[5]));
        store.setDismissedSuggestions(
          getData(results[6]).map((r: any) => (r.title || '').trim().toLowerCase())
        );

        // First-run welcome redirect — only fire for genuinely brand
        // new accounts. The mere existence of a `homes` row that this
        // user belongs to means setup happened (either via the old
        // home-profile flow or a previous welcome run), so we set the
        // flag and stay put. The wizard is reserved for true first-
        // run flows where the user just signed up and has no home yet
        // (and that case is handled earlier by the no-memberships
        // redirect to /home-profile).
        if (typeof window !== 'undefined' && pathname !== '/welcome') {
          const hasHome = !!homeData;
          if (hasHome) {
            window.localStorage.setItem(
              'homekeeper.welcomedAt',
              new Date().toISOString()
            );
          }
        }

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
      <div className="min-h-screen flex items-center justify-center px-6 bg-surface-secondary">
        <div className="ios-card max-w-sm w-full p-6 text-center">
          <div className="text-4xl mb-2">⚠️</div>
          <h2 className="text-lg font-semibold text-ink-primary mb-1">Something went wrong</h2>
          <p className="text-sm text-status-red mb-4">{error}</p>
          <button
            onClick={() => (window.location.href = '/auth')}
            className="ios-button"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    // Skeleton screen — mirrors the dashboard's hero + bucket layout
    // so the transition into the real UI feels continuous instead of
    // popping in from a generic spinner.
    return (
      <div className="min-h-screen bg-surface-secondary">
        <div className="h-14 md:h-16 bg-white border-b border-gray-100" />
        <div className="md:max-w-5xl md:mx-auto md:px-6 lg:px-10 px-4 py-4 space-y-3">
          <div className="rounded-ios-xl bg-gradient-hero shadow-float overflow-hidden">
            <div className="px-5 pt-5 pb-4 md:px-6 md:pt-6 md:pb-5 space-y-3">
              <div className="h-3 w-24 rounded bg-white/30 animate-pulse" />
              <div className="h-7 w-2/3 rounded bg-white/30 animate-pulse" />
              <div className="grid grid-cols-3 gap-2 mt-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-ios bg-white/12 px-3 py-2.5">
                    <div className="h-5 w-10 rounded bg-white/30 animate-pulse" />
                    <div className="h-2.5 w-14 rounded bg-white/30 animate-pulse mt-2" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="ios-card overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="px-4 py-3.5 border-b border-gray-100 last:border-b-0 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg skeleton" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-1/2 skeleton" />
                  <div className="h-2.5 w-1/3 skeleton" />
                </div>
                <div className="h-3 w-6 skeleton" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-secondary">
      <SideNav />
      <main className="md:pl-60">
        <div className="md:max-w-5xl md:mx-auto md:px-6 lg:px-10">
          {children}
        </div>
      </main>
      <BottomNav />
      <ConfirmDialogHost />
      <CommandPalette />
    </div>
  );
}
