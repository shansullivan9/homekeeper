'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import { Task, TaskHistory } from '@/lib/types';

/**
 * Subscribes the Zustand store to Supabase Realtime for the active
 * home so multi-device / multi-member usage stays in sync without
 * waiting for a manual refresh.
 *
 * Listens to public.tasks (INSERT / UPDATE / DELETE) and
 * public.task_history (INSERT / DELETE). The schema already publishes
 * both via supabase_realtime so no DB change is needed.
 */
export function useRealtimeHome() {
  // Re-subscribe whenever the active home changes (multi-home switch).
  const homeId = useStore((s) => s.home?.id);

  useEffect(() => {
    if (!homeId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`home-${homeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `home_id=eq.${homeId}`,
        },
        (payload) => {
          const store = useStore.getState();
          if (payload.eventType === 'INSERT') {
            const t = payload.new as Task;
            if (store.tasks.some((existing) => existing.id === t.id)) return;
            store.setTasks([t, ...store.tasks]);
          } else if (payload.eventType === 'UPDATE') {
            const t = payload.new as Task;
            store.setTasks(
              store.tasks.map((existing) => (existing.id === t.id ? t : existing))
            );
          } else if (payload.eventType === 'DELETE') {
            const id = (payload.old as Task)?.id;
            if (!id) return;
            store.setTasks(store.tasks.filter((t) => t.id !== id));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_history',
          filter: `home_id=eq.${homeId}`,
        },
        (payload) => {
          const store = useStore.getState();
          if (payload.eventType === 'INSERT') {
            const h = payload.new as TaskHistory;
            if (store.history.some((existing) => existing.id === h.id)) return;
            store.setHistory([h, ...store.history]);
          } else if (payload.eventType === 'DELETE') {
            const id = (payload.old as TaskHistory)?.id;
            if (!id) return;
            store.setHistory(store.history.filter((h) => h.id !== id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [homeId]);
}
