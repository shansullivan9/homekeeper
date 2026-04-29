'use client';
import { useCallback, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import { useRouter } from 'next/navigation';

// Hook the dashboard uses to keep its data fresh after task actions.
// AppShell already does the initial population on mount, so this hook
// is mostly a refresh button: any caller can invoke `loadData()` and
// it will re-fetch tasks/categories/members/appliances/history/documents
// in parallel without duplicating the auth bootstrap.
export function useAppInit() {
  const router = useRouter();
  const supabase = createClient();
  const startedRef = useRef(false);

  const load = useCallback(async () => {
    const store = useStore.getState();
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

      const [tasksRes, catsRes, membersRes, appliancesRes, historyRes, docsRes, dismissedRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('home_id', homeData.id).order('due_date', { ascending: true, nullsFirst: false }),
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('home_members').select('*').eq('home_id', homeData.id),
        supabase.from('appliances').select('*').eq('home_id', homeData.id),
        supabase.from('task_history').select('*').eq('home_id', homeData.id).order('completed_at', { ascending: false }).limit(100),
        supabase.from('documents').select('*').eq('home_id', homeData.id).order('uploaded_at', { ascending: false }),
        supabase.from('suggestion_dismissals').select('title').eq('home_id', homeData.id),
      ]);

      if (tasksRes.data) store.setTasks(tasksRes.data);
      if (catsRes.data) store.setCategories(catsRes.data);
      if (membersRes.data) {
        const memberIds = membersRes.data.map((m: any) => m.user_id).filter(Boolean);
        if (memberIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, email')
            .in('id', memberIds);
          const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
          store.setMembers(
            membersRes.data.map((m: any) => ({
              ...m,
              display_name: byId.get(m.user_id)?.display_name || null,
              email: byId.get(m.user_id)?.email || null,
            }))
          );
        } else {
          store.setMembers(membersRes.data);
        }
      }
      if (appliancesRes.data) store.setAppliances(appliancesRes.data);
      if (historyRes.data) store.setHistory(historyRes.data);
      if (docsRes.data) store.setDocuments(docsRes.data);
      if (dismissedRes.data) {
        store.setDismissedSuggestions(
          dismissedRes.data.map((r: any) => (r.title || '').trim().toLowerCase())
        );
      }
    } catch (err) {
      console.error('Load error:', err);
    }

    store.setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    load();
  }, [load]);

  return { loadData: load };
}
