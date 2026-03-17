// components/recommendations/RecommendationSummary.tsx
// ============================================================
// Drop this into your Dashboard page to show a summary card
// with the top 3 recommendations for the current month.
// ============================================================
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  getRecommendationsForMonth,
  getAgeAlerts,
  FEATURE_TO_DB_COLUMN,
  FEATURE_META,
  FEATURE_TO_INSTALL_YEAR,
  type FeatureKey,
  type Recommendation,
} from '@/lib/recommendations';
import { supabase } from '@/lib/supabase-browser';

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'text-red-600 bg-red-50',
  high: 'text-orange-600 bg-orange-50',
  medium: 'text-yellow-600 bg-yellow-50',
  low: 'text-green-600 bg-green-50',
};

export default function RecommendationSummary() {
  const router = useRouter();
  const { home } = useStore();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [ageAlerts, setAgeAlerts] = useState<any[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!home) return;

    // Load dismissed/accepted recommendations
    const loadDismissed = async () => {
      const { data } = await supabase
        .from('recommendation_actions')
        .select('recommendation_id')
        .eq('home_id', home.id);
      if (data) {
        setDismissedIds(data.map((d: any) => d.recommendation_id));
      }
    };
    loadDismissed();

    // Build active features list from home profile
    const activeFeatures: FeatureKey[] = [];
    const featureStates: Record<string, { active: boolean; installYear: number | null }> = {};

    (Object.entries(FEATURE_TO_DB_COLUMN) as [FeatureKey, string][]).forEach(([key, col]) => {
      const isActive = (home as any)[col] === true;
      const installCol = FEATURE_TO_INSTALL_YEAR[key];
      const installYear = installCol ? (home as any)[installCol] || null : null;

      if (isActive) activeFeatures.push(key);
      featureStates[key] = { active: isActive, installYear };
    });

    const month = new Date().getMonth();
    const climateZone = (home as any).climate_zone || 'southeast';
    const filtered = getRecommendationsForMonth(month, activeFeatures, climateZone, dismissedIds);
    setRecs(filtered.slice(0, 3));

    const alerts = getAgeAlerts(featureStates);
    setAgeAlerts(alerts.slice(0, 2));
  }, [home, dismissedIds]);

  if (!home || (recs.length === 0 && ageAlerts.length === 0)) return null;

  const month = new Date().getMonth();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="mx-4 mt-4">
      {/* Age Alerts */}
      {ageAlerts.length > 0 && (
        <div className="mb-3">
          {ageAlerts.map((alert, i) => (
            <div
              key={i}
              className={`rounded-xl px-4 py-3 mb-2 flex items-start gap-3 ${
                alert.priority === 'critical' ? 'bg-red-50 border border-red-200' : 'bg-orange-50 border border-orange-200'
              }`}
            >
              <span className="text-xl flex-shrink-0">{alert.emoji}</span>
              <div>
                <p className={`text-sm font-semibold ${
                  alert.priority === 'critical' ? 'text-red-700' : 'text-orange-700'
                }`}>
                  {alert.featureName} — {alert.age} years old
                </p>
                <p className="text-xs text-gray-600 mt-0.5">{alert.msg}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recommendations Card */}
      {recs.length > 0 && (
        <div className="ios-card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Recommended Actions
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {monthNames[month]} · Based on your home profile
              </p>
            </div>
            <button
              onClick={() => router.push('/recommendations')}
              className="text-sm font-medium text-blue-600"
            >
              See all →
            </button>
          </div>

          <div className="space-y-2.5">
            {recs.map((rec) => {
              const meta = FEATURE_META[rec.feature];
              return (
                <div
                  key={rec.id}
                  onClick={() => router.push('/recommendations')}
                  className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 active:bg-gray-100 cursor-pointer"
                >
                  <span className="text-lg flex-shrink-0 mt-0.5">{meta.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${PRIORITY_COLORS[rec.priority]}`}>
                        {rec.priority}
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {rec.diyPro} · {rec.timeEstMinutes < 60 ? `${rec.timeEstMinutes} min` : `${Math.round(rec.timeEstMinutes / 60)} hr`}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 leading-tight">
                      {rec.title}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
