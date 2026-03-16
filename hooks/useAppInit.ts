'use client';
import { useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { Task } from '@/lib/types';

export function useAppInit() {
  const router = useRouter();
  const {
    setUser, setHome, setMembers, setTasks, setCategories,
    setAppliances, setHistory, setLoading, user, home,
  } = useStore();

  const supabase = createClient();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Get auth user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
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

      // Get home membership
      const { data: membership } = await supabase
        .from('home_members')
        .select('*, homes(*)')
        .eq('user_id', authUser.id)
        .limit(1)
        .single();

      if (!membership) {
        setLoading(false);
        router.push('/home-profile');
        return;
      }

      const homeData = (membership as any).homes;
      setHome(homeData);

      // Load all home members with profiles
      const { data: members } = await supabase
        .from('home_members')
        .select('*, profiles(*)')
        .eq('home_id', homeData.id);
      if (members) setMembers(members);

      // Load tasks
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*, categories(*)')
        .eq('home_id', homeData.id)
        .order('due_date', { ascending: true, nullsFirst: false });
      if (tasks) setTasks(tasks);

      // Load categories
      const { data: categories } = await supabase
        .from('categories')
        .select('*')
        .or(`home_id.is.null,home_id.eq.${homeData.id}`)
        .order('sort_order');
      if (categories) setCategories(categories);

      // Load appliances
      const { data: appliances } = await supabase
        .from('appliances')
        .select('*')
        .eq('home_id', homeData.id)
        .order('name');
      if (appliances) setAppliances(appliances);

      // Load recent history
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

  // Realtime subscription
  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!home) return;

    const channel = supabase
      .channel('home-tasks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `home_id=eq.${home.id}` },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const { data } = await supabase
              .from('tasks')
              .select('*, categories(*)')
              .eq('id', (payload.new as Task).id)
              .single();
            if (data) useStore.getState().addTask(data);
          } else if (payload.eventType === 'UPDATE') {
            const { data } = await supabase
              .from('tasks')
              .select('*, categories(*)')
              .eq('id', (payload.new as Task).id)
              .single();
            if (data) useStore.getState().updateTask(data);
          } else if (payload.eventType === 'DELETE') {
            useStore.getState().removeTask((payload.old as any).id);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_history', filter: `home_id=eq.${home.id}` },
        (payload) => {
          const current = useStore.getState().history;
          useStore.getState().setHistory([payload.new as any, ...current]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [home?.id]);

  return { loadData };
}
