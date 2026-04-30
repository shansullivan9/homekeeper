'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useStore } from '@/lib/store';
import { Task, TaskHistory, Appliance, Document } from '@/lib/types';

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
              } else if (payload.eventType === 'UPDATE') {
                const h = payload.new as TaskHistory;
                store.setHistory(
                  store.history.map((existing) => (existing.id === h.id ? h : existing))
                );
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

      // Documents — partners uploading manuals / receipts should appear
      // live without a manual refresh.
      const docsChannel = supabase
        .channel(`hk-docs-${homeId}-${unique}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'documents',
            filter: `home_id=eq.${homeId}`,
          },
          (payload: any) => {
            const store = useStore.getState();
            try {
              if (payload.eventType === 'INSERT') {
                const d = payload.new as Document;
                if (store.documents.some((existing) => existing.id === d.id)) return;
                store.setDocuments([d, ...store.documents]);
              } else if (payload.eventType === 'UPDATE') {
                const d = payload.new as Document;
                store.setDocuments(
                  store.documents.map((existing) => (existing.id === d.id ? d : existing))
                );
              } else if (payload.eventType === 'DELETE') {
                const id = (payload.old as Document)?.id;
                if (!id) return;
                store.setDocuments(store.documents.filter((d) => d.id !== id));
              }
            } catch (err) {
              console.warn('realtime documents handler error:', err);
            }
          }
        )
        .subscribe();
      channels.push(docsChannel);

      // Appliances — same rationale: a partner registering the new
      // washer should show up on every connected device.
      const appsChannel = supabase
        .channel(`hk-appliances-${homeId}-${unique}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'appliances',
            filter: `home_id=eq.${homeId}`,
          },
          (payload: any) => {
            const store = useStore.getState();
            try {
              if (payload.eventType === 'INSERT') {
                const a = payload.new as Appliance;
                if (store.appliances.some((existing) => existing.id === a.id)) return;
                store.setAppliances([a, ...store.appliances]);
              } else if (payload.eventType === 'UPDATE') {
                const a = payload.new as Appliance;
                store.setAppliances(
                  store.appliances.map((existing) => (existing.id === a.id ? a : existing))
                );
              } else if (payload.eventType === 'DELETE') {
                const id = (payload.old as Appliance)?.id;
                if (!id) return;
                store.setAppliances(store.appliances.filter((a) => a.id !== id));
              }
            } catch (err) {
              console.warn('realtime appliances handler error:', err);
            }
          }
        )
        .subscribe();
      channels.push(appsChannel);
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
