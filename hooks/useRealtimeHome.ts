'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import { Task, TaskHistory } from '@/lib/types';

/**
 * Subscribes the Zustand store to Supabase Realtime for the active
 * home so multi-device / multi-member usage stays in sync without a
 * manual refresh.
 *
 * Implementation notes:
 *   - Uses two SEPARATE channels (one per table) so a re-mount race
 *     can't trigger Supabase's "cannot add postgres_changes after
 *     subscribe()" error by re-attaching to a half-cleaned channel.
 *   - Wrapped in try/catch with a no-op cleanup safety net so a
 *     transient realtime error never bubbles up to the React error
 *     boundary and crashes the page.
 */
export function useRealtimeHome() {
  const homeId = useStore((s) => s.home?.id);

  useEffect(() => {
    if (!homeId) return;
    const supabase = createClient();
    const channels: any[] = [];
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      const tasksChannel = supabase
        .channel(`hk-tasks-${homeId}-${unique}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tasks',
            filter: `home_id=eq.${homeId}`,
          },
          (payload: any) => {
            const store = useStore.getState();
            try {
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
            } catch (err) {
              console.warn('realtime tasks handler error:', err);
            }
          }
        )
        .subscribe();
      channels.push(tasksChannel);

      const historyChannel = supabase
        .channel(`hk-history-${homeId}-${unique}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'task_history',
            filter: `home_id=eq.${homeId}`,
          },
          (payload: any) => {
            const store = useStore.getState();
            try {
              if (payload.eventType === 'INSERT') {
                const h = payload.new as TaskHistory;
                if (store.history.some((existing) => existing.id === h.id)) return;
                store.setHistory([h, ...store.history]);
              } else if (payload.eventType === 'DELETE') {
                const id = (payload.old as TaskHistory)?.id;
                if (!id) return;
                store.setHistory(store.history.filter((h) => h.id !== id));
              }
            } catch (err) {
              console.warn('realtime history handler error:', err);
            }
          }
        )
        .subscribe();
      channels.push(historyChannel);
    } catch (err) {
      console.warn('realtime subscribe failed (non-fatal):', err);
    }

    return () => {
      for (const ch of channels) {
        try {
          supabase.removeChannel(ch);
        } catch {
          // ignore — best-effort cleanup
        }
      }
    };
  }, [homeId]);
}
