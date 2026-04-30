'use client';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import PageHeader from '@/components/layout/PageHeader';
import toast from 'react-hot-toast';
import { Bell } from 'lucide-react';

interface Prefs {
  remind_days_before: number;
  remind_on_due: boolean;
  remind_when_overdue: boolean;
  timezone: string;
  reminder_hour_local: number;
  notifications_paused: boolean;
}

const detectTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
};

const DEFAULTS: Prefs = {
  remind_days_before: 3,
  remind_on_due: true,
  remind_when_overdue: true,
  timezone: 'America/New_York',
  reminder_hour_local: 12,
  notifications_paused: false,
};

const DAYS_OPTIONS = [0, 1, 2, 3, 5, 7, 14];

// Format an hour 0-23 as friendly 12-hour string ("12pm", "9am", "7pm").
const fmtHour = (h: number): string => {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
};

type PushState = 'default' | 'granted' | 'denied' | 'unsupported';

export default function NotificationsPage() {
  const user = useStore((s) => s.user);
  const supabase = createClient();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushPermission, setPushPermission] = useState<PushState>('default');
  const [subscribing, setSubscribing] = useState(false);

  // Detect notification permission on mount. Wrapped in try/catch and
  // null-checks so the page never throws a render-time exception on
  // browsers that don't expose the API (older iOS, in-app browsers,
  // Private Browsing, etc.).
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const N = (window as any).Notification;
      if (!N || typeof N.permission !== 'string') {
        setPushPermission('unsupported');
        return;
      }
      const perm = N.permission;
      if (perm === 'granted' || perm === 'denied' || perm === 'default') {
        setPushPermission(perm);
      } else {
        setPushPermission('default');
      }
    } catch {
      setPushPermission('unsupported');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user?.id) return;
      try {
        const { data } = await supabase
          .from('notification_preferences')
          .select('remind_days_before, remind_on_due, remind_when_overdue, timezone, reminder_hour_local, notifications_paused')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;
        const browserTz = detectTimezone();
        if (data) {
          const d = data as any;
          setPrefs({
            remind_days_before:
              typeof d.remind_days_before === 'number'
                ? d.remind_days_before
                : DEFAULTS.remind_days_before,
            remind_on_due:
              typeof d.remind_on_due === 'boolean'
                ? d.remind_on_due
                : DEFAULTS.remind_on_due,
            remind_when_overdue:
              typeof d.remind_when_overdue === 'boolean'
                ? d.remind_when_overdue
                : DEFAULTS.remind_when_overdue,
            timezone: d.timezone || browserTz,
            reminder_hour_local:
              typeof d.reminder_hour_local === 'number'
                ? d.reminder_hour_local
                : DEFAULTS.reminder_hour_local,
            notifications_paused:
              typeof d.notifications_paused === 'boolean'
                ? d.notifications_paused
                : DEFAULTS.notifications_paused,
          });
        } else {
          setPrefs((p) => ({ ...p, timezone: browserTz }));
        }
      } catch (err) {
        console.error('notification prefs load:', err);
      }
      if (!cancelled) setLoaded(true);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, supabase]);

  const save = async (next: Prefs) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: user.id,
            remind_days_before: next.remind_days_before,
            remind_on_due: next.remind_on_due,
            remind_when_overdue: next.remind_when_overdue,
            timezone: next.timezone,
            reminder_hour_local: next.reminder_hour_local,
            notifications_paused: next.notifications_paused,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: 'user_id' } as any
        );
      if (error) throw error;
      toast.success('Saved');
    } catch (err: any) {
      toast.error(err?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const updatePref = (next: Partial<Prefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    save(merged);
  };

  // Once permission is granted (and the user hasn't paused), silently
  // make sure the subscription is registered with our backend. Re-runs
  // on every visit so a browser-rotated endpoint or fresh device gets
  // re-saved without the user having to do anything.
  useEffect(() => {
    if (pushPermission !== 'granted') return;
    if (!loaded || prefs.notifications_paused) return;
    if (!user?.id) return;
    let cancelled = false;
    const ensureSubscribed = async () => {
      try {
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
        // Look at existing subscriptions across any registered SW.
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) {
          try {
            const existing = await r.pushManager.getSubscription();
            if (existing) {
              // Make sure DB has it; upsert is idempotent.
              if (!cancelled) {
                await supabase
                  .from('notification_preferences')
                  .upsert(
                    {
                      user_id: user.id,
                      push_subscription: existing.toJSON(),
                      updated_at: new Date().toISOString(),
                    } as any,
                    { onConflict: 'user_id' } as any
                  );
              }
              return;
            }
          } catch {
            /* ignore individual reg failures */
          }
        }
        // No existing subscription anywhere — kick off the subscribe
        // flow without showing the staged toasts.
        if (!cancelled) await subscribeToPush({ silent: true });
      } catch (err) {
        console.warn('background subscription check failed:', err);
      }
    };
    ensureSubscribed();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushPermission, user?.id, loaded, prefs.notifications_paused]);
  const urlBase64ToUint8Array = (base64String: string): Uint8Array | null => {
    try {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const raw = atob(base64);
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  };

  // Subscribe the browser to push and persist the endpoint to the
  // user's prefs row. This now ONLY runs from the explicit Enable
  // button click — no useEffect auto-fire — because iOS Safari
  // throws PushManager errors when the page isn't installed as a
  // PWA, and we don't want that to crash the whole page.
  const subscribeToPush = async (opts: { silent?: boolean } = {}) => {
    const silent = !!opts.silent;
    const t = (msg: string, kind: 'loading' | 'success' | 'error') => {
      if (silent) return;
      if (kind === 'loading') toast.loading(msg, { id: 'push-step', duration: 6000 });
      else if (kind === 'success') {
        toast.dismiss('push-step');
        toast.success(msg);
      } else {
        toast.dismiss('push-step');
        toast.error(msg);
      }
    };

    if (!user?.id) {
      t('No user — please sign in again', 'error');
      return;
    }
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      t('Service workers not supported in this browser', 'error');
      return;
    }
    setSubscribing(true);

    // Helper that races a promise against a timeout so we can catch
    // hangs (especially iOS Safari's pushManager calls) instead of
    // leaving the user staring at a spinner forever.
    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string) =>
      Promise.race<T>([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
        ),
      ]);

    let stage = 'init';
    try {
      stage = 'fetching VAPID config';
      t('Step 1/4: fetching VAPID config…', 'loading');
      const cfgRes = await withTimeout(
        fetch('/api/push/config', { cache: 'no-store' }),
        10_000,
        'config fetch'
      );
      const cfg = await cfgRes.json().catch(() => ({}));
      const vapid = (cfg && cfg.vapidPublicKey) || '';
      if (!vapid || vapid === 'your_vapid_public_key') {
        t('Server missing VAPID_PUBLIC_KEY env var', 'error');
        setSubscribing(false);
        return;
      }

      stage = 'registering push service worker';
      t('Step 2/4: registering push service worker…', 'loading');
      // We register our OWN dedicated push-only SW at /push-sw.js with
      // its own scope (/push-sw/), separate from next-pwa's caching SW.
      // It's ~50 lines, calls skipWaiting + clients.claim, and avoids
      // every iOS-Safari SW-activation gotcha that the bigger
      // next-pwa worker has hit so far.
      let reg = await navigator.serviceWorker.getRegistration('/push-sw/');
      if (!reg || !reg.active) {
        if (reg) {
          try { await reg.unregister(); } catch { /* ignore */ }
        }
        reg = await withTimeout(
          navigator.serviceWorker.register('/push-sw.js', { scope: '/push-sw/' }),
          10_000,
          'push SW register'
        );
      }
      // Wait for it to actually be active so pushManager.subscribe
      // accepts it. skipWaiting + clients.claim in the SW make this
      // typically resolve within a second.
      if (!reg.active) {
        await withTimeout(
          new Promise<void>((resolve, reject) => {
            const sw = reg!.installing || reg!.waiting;
            if (!sw) return reg!.active ? resolve() : reject(new Error('no worker on registration'));
            const onChange = () => {
              if (sw.state === 'activated') {
                sw.removeEventListener('statechange', onChange);
                resolve();
              } else if (sw.state === 'redundant') {
                sw.removeEventListener('statechange', onChange);
                reject(new Error('worker became redundant'));
              }
            };
            sw.addEventListener('statechange', onChange);
          }),
          10_000,
          'push SW activation'
        );
      }
      if (!reg.active) {
        throw new Error('push SW still not active after activation wait');
      }

      stage = 'subscribing to push';
      t('Step 3/4: subscribing to push…', 'loading');
      let sub: PushSubscription | null = null;
      try {
        sub = await reg.pushManager.getSubscription();
      } catch {
        sub = null;
      }
      if (!sub) {
        const key = urlBase64ToUint8Array(vapid);
        if (!key) throw new Error('VAPID key looks malformed');
        sub = await withTimeout(
          reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          }),
          15_000,
          'pushManager.subscribe'
        );
      }

      stage = 'saving subscription';
      t('Step 4/4: saving to your account…', 'loading');
      const { error: upsertErr } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: user.id,
            push_subscription: sub.toJSON(),
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: 'user_id' } as any
        );
      if (upsertErr) throw new Error('DB save failed: ' + upsertErr.message);

      t('Push subscription saved!', 'success');
    } catch (err: any) {
      const msg = (err && err.message) || String(err);
      t(`Failed at "${stage}": ${msg}`, 'error');
      console.error('push subscribe failed at', stage, err);
    } finally {
      setSubscribing(false);
    }
  };

  const requestPushPermission = async () => {
    try {
      if (typeof window === 'undefined') return;
      const N = (window as any).Notification;
      if (!N) {
        toast.error('Notifications not supported in this browser');
        return;
      }
      const result = await N.requestPermission();
      if (result === 'granted' || result === 'denied' || result === 'default') {
        setPushPermission(result);
      }
      if (result === 'granted') {
        toast.success('Notifications enabled');
        await subscribeToPush();
      } else if (result === 'denied') {
        toast.error('Notifications blocked — enable in your browser settings');
      }
    } catch (err) {
      console.error('notification permission failed:', err);
      toast.error('Notifications not supported on this device.');
    }
  };

  // Pause: unsubscribe the browser PushSubscription on this device
  // and null it out in the DB so the edge function stops sending.
  // Browser-level permission stays "granted" — we just go silent.
  const pausePush = async () => {
    if (!user?.id) return;
    setSubscribing(true);
    try {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) {
          try {
            const existing = await r.pushManager.getSubscription();
            if (existing) await existing.unsubscribe();
          } catch {
            /* ignore individual reg errors */
          }
        }
      }
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: user.id,
            notifications_paused: true,
            push_subscription: null,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: 'user_id' } as any
        );
      if (error) throw error;
      setPrefs((p) => ({ ...p, notifications_paused: true }));
      toast.success('Notifications paused');
    } catch (err: any) {
      toast.error(err?.message || 'Could not pause notifications');
    } finally {
      setSubscribing(false);
    }
  };

  const resumePush = async () => {
    if (!user?.id) return;
    setSubscribing(true);
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: user.id,
            notifications_paused: false,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: 'user_id' } as any
        );
      if (error) throw error;
      setPrefs((p) => ({ ...p, notifications_paused: false }));
    } catch (err: any) {
      toast.error(err?.message || 'Could not resume notifications');
      setSubscribing(false);
      return;
    }
    setSubscribing(false);
    await subscribeToPush({ silent: true });
  };

  const togglePush = async () => {
    if (subscribing) return;
    if (pushPermission === 'unsupported' || pushPermission === 'denied') return;
    if (pushPermission === 'default') {
      await requestPushPermission();
      return;
    }
    if (prefs.notifications_paused) {
      await resumePush();
    } else {
      await pausePush();
    }
  };

  const pushActive = pushPermission === 'granted' && !prefs.notifications_paused;

  return (
    <div>
      <PageHeader title="Notifications" back />

      <div className="py-4 space-y-5 md:max-w-2xl">
        {/* Unified push master toggle. The toggle handles: first-time
            permission request, pausing (unsubscribes from this device
            and nulls the DB row so the edge function stops sending),
            and resuming. Browsers that flat-out can't do push show a
            disabled, explanatory row. */}
        <div className="mx-4 ios-card overflow-hidden">
          <button
            type="button"
            onClick={togglePush}
            disabled={
              subscribing ||
              pushPermission === 'unsupported' ||
              pushPermission === 'denied'
            }
            className="ios-list-item w-full disabled:opacity-100"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
              <Bell size={18} className="text-brand-500" />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium">Push notifications</p>
                <p className="text-xs text-ink-secondary">
                  {pushPermission === 'unsupported'
                    ? "This browser doesn't support web notifications."
                    : pushPermission === 'denied'
                    ? 'Blocked — enable in your browser settings.'
                    : pushActive
                    ? 'On for this device.'
                    : pushPermission === 'default'
                    ? 'Tap to receive reminders.'
                    : 'Paused. Tap to resume.'}
                </p>
              </div>
            </div>
            {(pushPermission === 'default' || pushPermission === 'granted') && (
              <div
                className={`w-12 h-7 rounded-full transition-colors relative shrink-0 ${
                  pushActive ? 'bg-status-green' : 'bg-gray-200'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                    pushActive ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </div>
            )}
          </button>
        </div>
        {pushPermission === 'unsupported' && (
          <p className="text-[11px] text-ink-tertiary mx-4 -mt-3">
            On iPhone, tap Share in Safari → Add to Home Screen, then open
            the app from your home screen and try again.
          </p>
        )}

        {/* Reminder rules */}
        <div>
          <p className="section-header">Reminders</p>
          <div className="mx-4 ios-card overflow-hidden">
            {/* Time of day picker — runs in the user's local zone via
                the function's timezone-aware dispatcher. */}
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[15px] font-medium mb-2">Time of day</p>
              <select
                value={prefs.reminder_hour_local}
                onChange={(e) =>
                  updatePref({ reminder_hour_local: parseInt(e.target.value, 10) })
                }
                disabled={saving || !loaded}
                className="ios-input"
              >
                {Array.from({ length: 24 }).map((_, h) => (
                  <option key={h} value={h}>
                    {fmtHour(h)}
                  </option>
                ))}
              </select>
            </div>

            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[15px] font-medium mb-2">Days before due</p>
              <div className="flex flex-wrap gap-2">
                {DAYS_OPTIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => updatePref({ remind_days_before: d })}
                    disabled={saving || !loaded}
                    className={`px-3 py-1.5 rounded-ios text-sm font-medium transition-colors ${
                      prefs.remind_days_before === d
                        ? 'bg-brand-500 text-white'
                        : 'bg-surface-secondary text-ink-secondary md:hover:bg-surface-tertiary active:bg-surface-tertiary'
                    } disabled:opacity-50`}
                  >
                    {d === 0 ? 'Off' : d === 1 ? '1 day' : `${d} days`}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => updatePref({ remind_on_due: !prefs.remind_on_due })}
              disabled={saving || !loaded}
              className="ios-list-item w-full"
            >
              <p className="text-[15px] font-medium text-left flex-1">
                On the due date
              </p>
              <div
                className={`w-12 h-7 rounded-full transition-colors relative shrink-0 ${
                  prefs.remind_on_due ? 'bg-status-green' : 'bg-gray-200'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                    prefs.remind_on_due ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </button>

            <button
              onClick={() =>
                updatePref({ remind_when_overdue: !prefs.remind_when_overdue })
              }
              disabled={saving || !loaded}
              className="ios-list-item w-full"
            >
              <div className="text-left flex-1">
                <p className="text-[15px] font-medium">When overdue</p>
                <p className="text-xs text-ink-secondary">
                  Daily until you complete it.
                </p>
              </div>
              <div
                className={`w-12 h-7 rounded-full transition-colors relative shrink-0 ${
                  prefs.remind_when_overdue ? 'bg-status-green' : 'bg-gray-200'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                    prefs.remind_when_overdue ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </button>
          </div>
          <p className="text-[11px] text-ink-tertiary mx-4 mt-2">
            Delivered in your local time ({prefs.timezone || detectTimezone()}).
            Changes save automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
