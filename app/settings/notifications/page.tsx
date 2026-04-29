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
}

const DEFAULTS: Prefs = {
  remind_days_before: 3,
  remind_on_due: true,
  remind_when_overdue: true,
};

const DAYS_OPTIONS = [0, 1, 2, 3, 5, 7, 14];

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
          .select('remind_days_before, remind_on_due, remind_when_overdue')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;
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
          });
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

  // Translate a URL-safe base64 VAPID key into a Uint8Array. Wrapped
  // so any decoding glitch (bad chars, missing atob) returns null
  // instead of throwing.
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
  const subscribeToPush = async () => {
    if (!user?.id) {
      toast.error('No user — please sign in again');
      return;
    }
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      toast.error('Service workers not supported in this browser');
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
      toast.loading('Step 1/4: fetching VAPID config…', { id: 'push-step', duration: 4000 });
      const cfgRes = await withTimeout(
        fetch('/api/push/config', { cache: 'no-store' }),
        10_000,
        'config fetch'
      );
      const cfg = await cfgRes.json().catch(() => ({}));
      const vapid = (cfg && cfg.vapidPublicKey) || '';
      if (!vapid || vapid === 'your_vapid_public_key') {
        toast.dismiss('push-step');
        toast.error('Server missing VAPID_PUBLIC_KEY env var');
        setSubscribing(false);
        return;
      }

      stage = 'registering push service worker';
      toast.loading('Step 2/4: registering push service worker…', { id: 'push-step', duration: 6000 });
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
      toast.loading('Step 3/4: subscribing to push…', { id: 'push-step', duration: 8000 });
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
      toast.loading('Step 4/4: saving to your account…', { id: 'push-step', duration: 6000 });
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

      toast.dismiss('push-step');
      toast.success('Push subscription saved!');
    } catch (err: any) {
      toast.dismiss('push-step');
      const msg = (err && err.message) || String(err);
      toast.error(`Failed at "${stage}": ${msg}`);
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

  return (
    <div>
      <PageHeader title="Notifications" back />

      <div className="py-4 space-y-5 md:max-w-2xl">
        {/* System permission */}
        <div>
          <p className="section-header">Browser Permission</p>
          <div className="mx-4 ios-card overflow-hidden">
            <div className="ios-list-item">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Bell size={18} className="text-brand-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium">Push notifications</p>
                  <p className="text-xs text-ink-secondary">
                    {pushPermission === 'granted'
                      ? 'Allowed in this browser.'
                      : pushPermission === 'denied'
                      ? 'Blocked. Enable in your browser settings.'
                      : pushPermission === 'unsupported'
                      ? "This browser doesn't support web notifications."
                      : 'Not yet allowed.'}
                  </p>
                </div>
              </div>
              {pushPermission === 'default' && (
                <button
                  onClick={requestPushPermission}
                  disabled={subscribing}
                  className="text-brand-500 text-sm font-semibold disabled:opacity-50"
                >
                  {subscribing ? 'Enabling…' : 'Enable'}
                </button>
              )}
              {pushPermission === 'granted' && (
                <button
                  onClick={subscribeToPush}
                  disabled={subscribing}
                  className="text-brand-500 text-xs font-semibold disabled:opacity-50"
                  title="Re-register this device for push"
                >
                  {subscribing ? '…' : 'Refresh'}
                </button>
              )}
            </div>
          </div>
          {pushPermission === 'unsupported' && (
            <p className="text-[11px] text-ink-tertiary mx-4 mt-2">
              On iPhone, install the app first: tap Share in Safari → Add to
              Home Screen, then open it from your home screen and try again.
            </p>
          )}
        </div>

        {/* Reminder rules */}
        <div>
          <p className="section-header">Reminders</p>
          <div className="mx-4 ios-card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[15px] font-medium">Remind me before due</p>
              <p className="text-xs text-ink-secondary mb-2">
                How many days ahead of a task's due date.
              </p>
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
              <div className="text-left">
                <p className="text-[15px] font-medium">On the due date</p>
                <p className="text-xs text-ink-secondary">
                  A reminder the day a task is due.
                </p>
              </div>
              <div
                className={`w-12 h-7 rounded-full transition-colors relative ${
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
              <div className="text-left">
                <p className="text-[15px] font-medium">When a task is overdue</p>
                <p className="text-xs text-ink-secondary">
                  Daily nudge until you complete it.
                </p>
              </div>
              <div
                className={`w-12 h-7 rounded-full transition-colors relative ${
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
            Preferences save automatically. Push delivery requires browser
            permission. iPhone users must install the app to the Home Screen
            first.
          </p>
        </div>
      </div>
    </div>
  );
}
