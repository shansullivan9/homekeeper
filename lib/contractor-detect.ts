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
  // Every row that surfaced this name. Used both to show the user
  // "this would link X past jobs" and to actually patch contractor_id
  // on those rows after import.
  sources: DetectionSource[];
}

const PHONE_RE = /\b\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/;

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
    const existing = map.get(key);
    const fullSource: DetectionSource = { ...source, raw: text };
    if (existing) {
      // Pick the longer/more-formatted name casing (e.g. "Mario
      // Tolentino" beats "mario tolentino").
      if (hit.name.length > existing.name.length) existing.name = hit.name;
      if (!existing.phone && hit.phone) existing.phone = hit.phone;
      existing.sources.push(fullSource);
    } else {
      map.set(key, { name: hit.name, phone: hit.phone, sources: [fullSource] });
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
