// components/recommendations/HomeProfileAdditions.tsx
// ============================================================
// Drop these two sections into your existing home-profile/page.tsx
// INSIDE the form, alongside the existing feature toggles.
//
// This file exports two components:
//   1. ClimateZonePicker — goes near the top of the profile form
//   2. InstallYearInputs — goes below the feature toggles
// ============================================================
'use client';

import { CLIMATE_ZONES, FEATURE_META, FEATURE_TO_INSTALL_YEAR, type FeatureKey } from '@/lib/recommendations';

// ─── 1. CLIMATE ZONE PICKER ──────────────────────────────
// Add this above or below the "Property Details" section
// Expects: value = current climate zone string, onChange = setter
interface ClimateZonePickerProps {
  value: string;
  onChange: (zone: string) => void;
}

export function ClimateZonePicker({ value, onChange }: ClimateZonePickerProps) {
  return (
    <div>
      <p className="section-header">Climate Zone</p>
      <div className="mx-4 ios-card">
        <p className="text-xs text-gray-500 mb-3">
          Select your region so recommendations match your local weather patterns.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(CLIMATE_ZONES).map(([key, zone]) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all ${
                value === key
                  ? 'bg-blue-50 border-2 border-blue-500'
                  : 'bg-gray-50 border-2 border-transparent'
              }`}
            >
              <span className="text-xl">{zone.icon}</span>
              <div>
                <p className={`text-sm font-medium ${value === key ? 'text-blue-700' : 'text-gray-700'}`}>
                  {zone.name}
                </p>
                <p className="text-[10px] text-gray-400">{zone.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 2. INSTALL YEAR INPUTS ──────────────────────────────
// Add this BELOW the feature toggles section.
// Only shows inputs for features that are currently active.
// Expects: values = { hvac_install_year: 2018, ... }, onChange = (field, val) => ...
// activeFeatures = the boolean fields from home profile that are true

interface InstallYearInputsProps {
  values: Record<string, number | null>;
  onChange: (field: string, year: number | null) => void;
  activeFeatureKeys: string[]; // e.g. ['has_hvac', 'has_garage', ...]
}

// Maps the DB boolean column to the feature key for install year lookup
const DB_COL_TO_FEATURE: Record<string, FeatureKey> = {
  has_hvac: 'hvac',
  has_gutters: 'gutters',
  has_garage: 'garage',
  has_fireplace: 'fireplace',
  has_dryer: 'dryer',
  has_pool: 'pool',
  has_roof: 'roof',
  has_smoke_detectors: 'smokeDetectors',
  has_sump_pump: 'sumpPump',
  has_irrigation: 'irrigation',
  has_deck: 'deck',
  has_water_softener: 'waterSoftener',
  has_generator: 'generator',
  has_septic: 'septic',
};

export function InstallYearInputs({ values, onChange, activeFeatureKeys }: InstallYearInputsProps) {
  const currentYear = new Date().getFullYear();

  // Only show features that are active AND have an install year column
  const visibleFeatures = activeFeatureKeys
    .map((col) => {
      const featureKey = DB_COL_TO_FEATURE[col];
      if (!featureKey) return null;
      const installCol = FEATURE_TO_INSTALL_YEAR[featureKey];
      if (!installCol) return null;
      const meta = FEATURE_META[featureKey];
      return { featureKey, installCol, meta };
    })
    .filter(Boolean) as Array<{ featureKey: FeatureKey; installCol: string; meta: { name: string; emoji: string } }>;

  if (visibleFeatures.length === 0) return null;

  return (
    <div>
      <p className="section-header">System Install Years</p>
      <div className="mx-4 ios-card">
        <p className="text-xs text-gray-500 mb-3">
          Optional — helps us warn you when systems are approaching end-of-life.
        </p>
        <div className="space-y-2.5">
          {visibleFeatures.map(({ featureKey, installCol, meta }) => {
            const val = values[installCol];
            const age = val ? currentYear - val : null;

            return (
              <div key={featureKey} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{meta.emoji}</span>
                  <span className="text-sm font-medium text-gray-700">{meta.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Year"
                    value={val ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') {
                        onChange(installCol, null);
                      } else {
                        const parsed = parseInt(v);
                        if (!isNaN(parsed) && parsed >= 1950 && parsed <= currentYear) {
                          onChange(installCol, parsed);
                        }
                      }
                    }}
                    min={1950}
                    max={currentYear}
                    className="w-[72px] text-center text-sm rounded-lg border border-gray-200 px-2 py-1.5 focus:border-blue-400 focus:outline-none"
                  />
                  {age !== null && (
                    <span className="text-xs text-gray-400 w-10 text-right">{age} yr</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
