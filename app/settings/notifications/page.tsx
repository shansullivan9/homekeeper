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

  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        setPushPermission('unsupported');
        return;
      }
      const perm = (window as any).Notification?.permission as PushState;
      setPushPermission(perm || 'default');
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
        // Table missing or RLS denied — fall back to defaults silently.
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

  const requestPushPermission = async () => {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        toast.error('Notifications not supported in this browser');
        return;
      }
      const result = await (window as any).Notification.requestPermission();
      setPushPermission((result as PushState) || 'default');
      if (result === 'granted') toast.success('Notifications enabled');
      else if (result === 'denied')
        toast.error('Notifications blocked — enable in your browser settings');
    } catch {
      toast.error('Notifications not supported');
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
                  className="text-brand-500 text-sm font-semibold"
                >
                  Enable
                </button>
              )}
            </div>
          </div>
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
            permission and may not be available in every browser.
          </p>
        </div>
      </div>
    </div>
  );
}
