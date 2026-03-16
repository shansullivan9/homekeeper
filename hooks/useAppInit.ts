'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import { useRouter } from 'next/navigation';

export function useAppInit() {
  const router = useRouter();
  const store = useStore();
  const supabase = createClient();
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (started) return;
    setStarted(true);

    async function load() {
      store.setLoading(true);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          store.setLoading(false);
          router.push('/auth');
          return;
        }

        const userId = session.user.id;

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (profile) store.setUser(profile);

        const { data: membership } = await supabase
          .from('home_members')
          .select('*')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();

        if (!membership) {
          store.setLoading(false);
          router.push('/home-profile');
          return;
        }

        const { data: homeData } = await supabase
          .from('homes')
          .select('*')
          .eq('id', membership.home_id)
          .maybeSingle();

        if (!homeData) {
          store.setLoading(false);
          router.push('/home-profile');
          return;
        }

        store.setHome(homeData);

        const [tasksRes, catsRes, membersRes, appliancesRes, historyRes] = await Promise.all([
          supabase.from('tasks').select('*').eq('home_id', homeData.id).order('due_date', { ascending: true, nullsFirst: false }),
          supabase.from('categories').select('*').order('sort_order'),
          supabase.from('home_members').select('*').eq('home_id', homeData.id),
          supabase.from('appliances').select('*').eq('home_id', homeData.id),
          supabase.from('task_history').select('*').eq('home_id', homeData.id).order('completed_at', { ascending: false }).limit(100),
        ]);

        if (tasksRes.data) store.setTasks(tasksRes.data);
        if (catsRes.data) store.setCategories(catsRes.data);
        if (membersRes.data) store.setMembers(membersRes.data);
        if (appliancesRes.data) store.setAppliances(appliancesRes.data);
        if (historyRes.data) store.setHistory(historyRes.data);

      } catch (err) {
        console.error('Load error:', err);
      }

      store.setLoading(false);
    }

    load();
  }, [started]);

  return {
    loadData: () => {
      setStarted(false);
    }
  };
}
