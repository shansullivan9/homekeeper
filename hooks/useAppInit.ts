'use client';
import { useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import { useRouter } from 'next/navigation';

export function useAppInit() {
  const router = useRouter();
  const {
    setUser, setHome, setMembers, setTasks, setCategories,
    setAppliances, setHistory, setLoading, home,
  } = useStore();
  const hasLoaded = useRef(false);
  const supabase = createClient();

  const loadData = useCallback(async () => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    setLoading(true);

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setLoading(false);
        router.push('/auth');
        return;
      }

      // Get profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();
      if (profile) setUser(profile);

      // Get home membership - simpler query without join
      const { data: membership } = await supabase
        .from('home_members')
        .select('*')
        .eq('user_id', authUser.id)
        .limit(1)
        .maybeSingle();

      if (!membership) {
        setLoading(false);
        router.push('/home-profile');
        return;
      }

      // Get home separately
      const { data: homeData } = await supabase
        .from('homes')
        .select('*')
        .eq('id', membership.home_id)
        .single();

      if (!homeData) {
        setLoading(false);
        router.push('/home-profile');
        return;
      }

      setHome(homeData);

      // Load members
      const { data: members } = await supabase
        .from('home_members')
        .select('*')
        .eq('home_id', homeData.id);

      // Get profiles for members
      if (members && members.length > 0) {
        const userIds = members.map(m => m.user_id);
        const { data: memberProfiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds);

        const enriched = members.map(m => ({
          ...m,
          profiles: memberProfiles?.find(p => p.id === m.user_id) || null
        }));
        setMembers(enriched);
      }

      // Load tasks without join first
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('home_id', homeData.id)
        .order('due_date', { ascending: true, nullsFirst: false });
      if (tasks) setTasks(tasks);

      // Load categories
      const { data: categories } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order');
      if (categories) setCategories(categories);

      // Load appliances
      const { data: appliances } = await supabase
        .from('appliances')
        .select('*')
        .eq('home_id', homeData.id)
        .order('name');
      if (appliances) setAppliances(appliances);

      // Load history
      const { data: history } = await supabase
        .from('task_history')
        .select('*')
        .eq('home_id', homeData.id)
        .order('completed_at', { ascending: false })
        .limit(100);
      if (history) setHistory(history);

    } catch (err) {
      console.error('Init error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    const currentHome = useStore.getState().home;
    if (!currentHome) return;

    const channel = supabase
      .channel('home-tasks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `home_id=eq.${currentHome.id}` },
        async () => {
          const { data } = await supabase
            .from('tasks')
            .select('*')
            .eq('home_id', currentHome.id)
            .order('due_date', { ascending: true, nullsFirst: false });
          if (data) useStore.getState().setTasks(data);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [home?.id]);

  return { loadData: () => { hasLoaded.current = false; loadData(); } };
}
