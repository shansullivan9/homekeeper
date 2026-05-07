'use client';
// Heuristic scanner that pulls likely contractor entries out of the
// notes fields on existing rows (task history, tasks, appliances,
// documents). Used by the Contractors page's "Detect from notes"
// importer so data that lived on the site BEFORE the contractors
// feature shipped can become real, structured records.
//
// Patterns we recognise:
//   "Mario Tolentino (919) 390-4202"   → name + phone
//   "Sonia 919-555-1234"               → name + phone
//   "Sonia"                             → name only (if it looks like one)
//
// We deliberately keep the bar high — false positives are worse than
// false negatives because every detection turns into a record the
// user has to triage. So:
//   - names must be 1–3 capitalized words, letters/'-/' only
//   - already-existing contractor names are skipped
//   - duplicates collapse onto a single detection with multiple
//     "source" rows so the user creates one contractor, not three.

import { Task, TaskHistory, Appliance, Document, Contractor } from '@/lib/types';

export interface DetectionSource {
  kind: 'history' | 'task' | 'appliance' | 'document';
  id: string;
  title: string;
  raw: string;
}

export interface ContractorDetection {
  // Best-guess name. Editable in the importer UI before saving.
  name: string;
  phone: string | null;
  // Best-guess trade inferred from the source row's title (e.g. a
  // "Lawn Mowing" task points at Landscaping). null when nothing
  // matches; user can edit before import.
  category: string | null;
  // Every row that surfaced this name. Used both to show the user
  // "this would link X past jobs" and to actually patch contractor_id
  // on those rows after import.
  sources: DetectionSource[];
}

const PHONE_RE = /\b\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/;

// Title/notes keyword → contractor trade. Distinct from the task
// CATEGORY_KEYWORDS map because trades read differently than chore
// categories (a contractor is "Landscaping", not "Yard"). First match
// wins; longest/most specific phrases are listed first.
const TRADE_KEYWORDS: { keywords: string[]; trade: string }[] = [
  { keywords: ['hvac', 'furnace', 'air condition', 'thermostat', 'duct', 'heat pump', 'a/c '], trade: 'HVAC' },
  { keywords: ['plumb', 'water heater', 'water softener', 'pipe', 'leak', 'drain', 'faucet', 'sewer', 'sump', 'toilet'], trade: 'Plumbing' },
  { keywords: ['electric', 'wiring', 'breaker', 'gfci', 'outlet', 'panel', 'ceiling fan', 'light bulb'], trade: 'Electrical' },
  { keywords: ['landscap', 'lawn', 'mow', 'garden', 'mulch', 'sprinkler', 'irrigation', 'shrub', 'hedge', 'tree trim', 'leaf'], trade: 'Landscaping' },
  { keywords: ['pool', 'spa', 'hot tub'], trade: 'Pool' },
  { keywords: ['pest', 'termite', 'roach', 'rodent', 'mosquito', 'extermin', 'rat', 'spider'], trade: 'Pest Control' },
  { keywords: ['roof', 'gutter'], trade: 'Roofing' },
  { keywords: ['chimney'], trade: 'Chimney' },
  { keywords: ['paint'], trade: 'Painting' },
  { keywords: ['pressure wash', 'power wash', 'window clean'], trade: 'Exterior Cleaning' },
  { keywords: ['carpet clean', 'house clean', 'maid', 'housekeep', 'cleaner'], trade: 'Cleaning' },
  { keywords: ['washer', 'dryer', 'dishwasher', 'refrigerator', 'fridge', 'oven', 'microwave', 'stove', 'appliance repair'], trade: 'Appliance Repair' },
  { keywords: ['handyman', 'general contract'], trade: 'Handyman' },
  { keywords: ['septic'], trade: 'Septic' },
  { keywords: ['fence', 'deck', 'patio', 'driveway', 'siding'], trade: 'Exterior' },
  { keywords: ['remodel', 'renovat', 'install'], trade: 'Projects' },
];

function inferTrade(...sources: (string | null | undefined)[]): string | null {
  const hay = sources
    .filter((s): s is string => !!s && !!s.trim())
    .join(' ')
    .toLowerCase();
  if (!hay) return null;
  for (const rule of TRADE_KEYWORDS) {
    if (rule.keywords.some((kw) => hay.includes(kw))) return rule.trade;
  }
  return null;
}

function isPlausibleName(raw: string): boolean {
  const s = raw.trim();
  if (s.length < 2 || s.length > 40) return false;
  const words = s.split(/\s+/);
  if (words.length === 0 || words.length > 3) return false;
  return words.every((w) => /^[A-Z][A-Za-z'\-]{1,29}$/.test(w));
}

function tryExtract(
  text: string | null | undefined
): { name: string; phone: string | null } | null {
  if (!text) return null;
  // Use only the first non-empty line so multi-line notes don't pick
  // up "Mario" from one line and a number from a later, unrelated line.
  const firstLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return null;

  const phoneMatch = firstLine.match(PHONE_RE);
  if (phoneMatch) {
    const phone = `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}`;
    const beforePhone = firstLine
      .slice(0, phoneMatch.index)
      .replace(/[,():\s-]+$/, '')
      .trim();
    if (beforePhone && isPlausibleName(beforePhone)) {
      return { name: beforePhone, phone };
    }
    // Phone with no leading name — skip rather than guess.
    return null;
  }

  if (isPlausibleName(firstLine)) {
    return { name: firstLine, phone: null };
  }
  return null;
}

export function detectContractorsFromNotes(input: {
  history: TaskHistory[];
  tasks: Task[];
  appliances: Appliance[];
  documents: Document[];
  existingContractors: Contractor[];
}): ContractorDetection[] {
  const known = new Set(
    input.existingContractors.map((c) => c.name.trim().toLowerCase())
  );
  const map = new Map<string, ContractorDetection>();

  const consider = (
    text: string | null | undefined,
    source: Omit<DetectionSource, 'raw'>
  ) => {
    if (!text) return;
    const hit = tryExtract(text);
    if (!hit) return;
    const key = hit.name.toLowerCase();
    if (known.has(key)) return;
    // Trade is inferred from the source row's title plus its notes —
    // a "Lawn Mowing" task surfaces "Mario" → Landscaping even when
    // the notes themselves are just "Mario (919) 390-4202".
    const trade = inferTrade(source.title, text);
    const existing = map.get(key);
    const fullSource: DetectionSource = { ...source, raw: text };
    if (existing) {
      // Pick the longer/more-formatted name casing (e.g. "Mario
      // Tolentino" beats "mario tolentino").
      if (hit.name.length > existing.name.length) existing.name = hit.name;
      if (!existing.phone && hit.phone) existing.phone = hit.phone;
      if (!existing.category && trade) existing.category = trade;
      existing.sources.push(fullSource);
    } else {
      map.set(key, {
        name: hit.name,
        phone: hit.phone,
        category: trade,
        sources: [fullSource],
      });
    }
  };

  for (const h of input.history) {
    consider(h.notes, { kind: 'history', id: h.id, title: h.title });
  }
  for (const t of input.tasks) {
    consider(t.notes, { kind: 'task', id: t.id, title: t.title });
  }
  for (const a of input.appliances) {
    consider(a.notes, { kind: 'appliance', id: a.id, title: a.name });
  }
  for (const d of input.documents) {
    consider(d.notes, { kind: 'document', id: d.id, title: d.title || d.file_name });
  }

  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
}
