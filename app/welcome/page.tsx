'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import { CheckCircle2, ChevronRight, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

// Three-step welcome wizard for first-time users:
//   1) confirm/edit home name
//   2) toggle which features the home actually has (drives the
//      per-home suggestion generator on save)
//   3) pick which suggested tasks to keep; everything else is dismissed
//
// AppShell already routes the user here when they have no home set up,
// AND we link here on signup. After completion we set a localStorage
// flag so we don't re-show.
const FEATURES: {
  field: string;
  label: string;
  emoji: string;
}[] = [
  { field: 'has_irrigation', label: 'Irrigation', emoji: '🌧️' },
  { field: 'has_septic', label: 'Septic system', emoji: '🚰' },
  { field: 'has_well_water', label: 'Well water', emoji: '💧' },
  { field: 'has_deck', label: 'Deck', emoji: '🪵' },
  { field: 'has_pool', label: 'Pool', emoji: '🏊' },
  { field: 'has_garage', label: 'Garage', emoji: '🚗' },
  { field: 'has_fireplace', label: 'Fireplace', emoji: '🔥' },
  { field: 'has_basement', label: 'Basement', emoji: '🏠' },
  { field: 'has_attic', label: 'Attic', emoji: '📐' },
  { field: 'has_crawlspace', label: 'Crawlspace', emoji: '🕸️' },
  { field: 'has_hoa', label: 'HOA', emoji: '🏘️' },
];

export default function WelcomePage() {
  const router = useRouter();
  const supabase = createClient();
  const { home, tasks, setHome, setTasks } = useStore();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [homeName, setHomeName] = useState('');
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [keptTasks, setKeptTasks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  // Seed local state from home record when it loads.
  useEffect(() => {
    if (!home) return;
    setHomeName(home.name || '');
    const next: Record<string, boolean> = {};
    for (const { field } of FEATURES) {
      next[field] = !!(home as any)[field];
    }
    setFeatures(next);
  }, [home]);

  const suggestions = useMemo(
    () => tasks.filter((t) => t.is_suggestion && t.status === 'pending'),
    [tasks]
  );

  // When we land on step 3, default every suggestion to "keep".
  useEffect(() => {
    if (step !== 3) return;
    const next: Record<string, boolean> = {};
    for (const t of suggestions) next[t.id] = true;
    setKeptTasks(next);
  }, [step, suggestions]);

  const saveHomeAndFeatures = async () => {
    if (!home) {
      toast.error('No home found — finish home setup first');
      return;
    }
    setBusy(true);
    const patch: Record<string, any> = {
      name: homeName.trim() || home.name,
      updated_at: new Date().toISOString(),
    };
    for (const { field } of FEATURES) {
      patch[field] = !!features[field];
    }
    const { data, error } = await supabase
      .from('homes')
      .update(patch as any)
      .eq('id', home.id)
      .select()
      .single();
    if (error) {
      toast.error(error.message || 'Could not save');
      setBusy(false);
      return;
    }
    if (data) setHome(data as any);
    // Re-run the suggestion generator so toggled features take effect
    // before the user sees the suggestions step.
    await supabase.rpc('generate_suggestions', { p_home_id: home.id } as any);
    // Pull the fresh task list so step 3 has them.
    const { data: freshTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('home_id', home.id);
    if (freshTasks) setTasks(freshTasks as any);
    setBusy(false);
    setStep(3);
  };

  const finish = async () => {
    if (!home) return;
    setBusy(true);

    // Drop any suggestion the user unchecked, accept the rest.
    const toAccept = suggestions.filter((t) => keptTasks[t.id]);
    const toDismiss = suggestions.filter((t) => !keptTasks[t.id]);

    if (toAccept.length > 0) {
      const ids = toAccept.map((t) => t.id);
      await supabase
        .from('tasks')
        .update({ is_suggestion: false } as any)
        .in('id', ids);
    }
    if (toDismiss.length > 0) {
      const dismissals = toDismiss.map((t) => ({
        home_id: home.id,
        title: t.title.trim(),
      }));
      await supabase
        .from('suggestion_dismissals')
        .upsert(dismissals as any, { onConflict: 'home_id,title' } as any);
      const ids = toDismiss.map((t) => t.id);
      await supabase.from('tasks').delete().in('id', ids);
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('homekeeper.welcomedAt', new Date().toISOString());
    }
    setBusy(false);
    router.push('/dashboard');
  };

  const skipWelcome = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('homekeeper.welcomedAt', new Date().toISOString());
    }
    router.push('/dashboard');
  };

  return (
    <div className="md:max-w-2xl md:mx-auto">
      <div className="px-4 py-6 md:py-10">
        <div className="flex items-center gap-2 mb-1 text-brand-500">
          <Sparkles size={16} />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Welcome — Step {step} of 3
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-ink-primary mb-1">
          {step === 1 && "Let's set up your home"}
          {step === 2 && 'What does your home have?'}
          {step === 3 && 'Pick what you want to track'}
        </h1>
        <p className="text-sm text-ink-secondary mb-6">
          {step === 1 && "Give it a name — you can change this any time in Settings."}
          {step === 2 && "Toggling a feature on tells us which maintenance tasks to suggest."}
          {step === 3 && 'Uncheck anything you don\'t want. The rest goes straight to your dashboard.'}
        </p>

        {/* Step 1 — name */}
        {step === 1 && (
          <div className="ios-card p-4 space-y-3">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary block">
              Home Name
            </label>
            <input
              type="text"
              value={homeName}
              onChange={(e) => setHomeName(e.target.value)}
              maxLength={80}
              placeholder="e.g. The Bungalow"
              className="ios-input"
              autoFocus
            />
            <button
              onClick={() => setStep(2)}
              disabled={busy || !homeName.trim()}
              className="ios-button"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 2 — features */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="ios-card divide-y divide-gray-50">
              {FEATURES.map(({ field, label, emoji }) => (
                <button
                  key={field}
                  onClick={() =>
                    setFeatures((f) => ({ ...f, [field]: !f[field] }))
                  }
                  className="ios-list-item w-full"
                >
                  <span className="text-[15px]">
                    <span className="mr-2">{emoji}</span>
                    {label}
                  </span>
                  <div
                    className={`w-12 h-7 rounded-full transition-colors relative ${
                      features[field] ? 'bg-status-green' : 'bg-gray-200'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                        features[field] ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3 rounded-ios bg-white border border-gray-200 text-sm font-semibold text-ink-secondary md:hover:bg-gray-50 active:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={saveHomeAndFeatures}
                disabled={busy}
                className="flex-[2] py-3 rounded-ios bg-brand-500 text-white text-sm font-semibold active:bg-brand-600 md:hover:bg-brand-600 transition-colors disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Generate suggestions'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — pick suggestions */}
        {step === 3 && (
          <div className="space-y-3">
            {suggestions.length === 0 ? (
              <div className="ios-card p-6 text-center">
                <p className="text-ink-secondary text-sm">
                  No suggestions right now — you can always add tasks
                  manually from the dashboard.
                </p>
              </div>
            ) : (
              <div className="ios-card divide-y divide-gray-50">
                {suggestions.map((t) => {
                  const checked = !!keptTasks[t.id];
                  return (
                    <button
                      key={t.id}
                      onClick={() =>
                        setKeptTasks((k) => ({ ...k, [t.id]: !checked }))
                      }
                      className="w-full flex items-start gap-3 px-4 py-3.5 text-left active:bg-gray-50 md:hover:bg-gray-50 transition-colors"
                    >
                      <div
                        className={`w-5 h-5 mt-0.5 rounded flex items-center justify-center flex-shrink-0 ${
                          checked ? 'bg-brand-500 text-white' : 'border-2 border-gray-300'
                        }`}
                      >
                        {checked && <CheckCircle2 size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium">{t.title}</p>
                        {t.description && (
                          <p className="text-xs text-ink-secondary mt-0.5">
                            {t.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                disabled={busy}
                className="flex-1 py-3 rounded-ios bg-white border border-gray-200 text-sm font-semibold text-ink-secondary md:hover:bg-gray-50 active:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={finish}
                disabled={busy}
                className="flex-[2] py-3 rounded-ios bg-brand-500 text-white text-sm font-semibold active:bg-brand-600 md:hover:bg-brand-600 transition-colors disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Finish setup'}
              </button>
            </div>
          </div>
        )}

        <button
          onClick={skipWelcome}
          className="block mx-auto mt-8 text-xs text-ink-tertiary md:hover:text-brand-500 transition-colors"
        >
          Skip setup
        </button>
      </div>
    </div>
  );
}
