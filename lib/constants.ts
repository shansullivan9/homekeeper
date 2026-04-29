import { Recurrence } from './types';

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  one_time: 'One Time',
  weekly: 'Weekly',
  bi_monthly: 'Every 2 Months',
  monthly: 'Monthly',
  quarterly: 'Every 3 Months',
  bi_annual: 'Every 6 Months',
  yearly: 'Yearly',
  custom: 'Custom',
};


export const PRIORITY_CONFIG = {
  low: { label: 'Low', color: '#34C759', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  medium: { label: 'Medium', color: '#FF9F0A', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  high: { label: 'High', color: '#FF3B30', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
};

export const CATEGORY_ICONS: Record<string, string> = {
  home: '🏠', trees: '🌲', thermometer: '🌡️', droplets: '💧', zap: '⚡',
  flower2: '🌸', refrigerator: '🔧', receipt: '📄', hammer: '🔨', wrench: '🔩',
};

// Title-keyword → emoji map. We try these in order, longest/most-specific
// first, so "pressure wash" beats "wash", "co detector" beats "detector",
// and obvious nouns ("chimney", "gutter", "termite") get their own picture.
// Falls through to the category icon if nothing matches.
const TASK_ICON_RULES: { match: string[]; icon: string }[] = [
  // Multi-word phrases first (more specific)
  { match: ['pressure wash', 'power wash'], icon: '🚰' },
  { match: ['co detector', 'carbon monoxide', 'smoke detector', 'smoke alarm'], icon: '🚨' },
  { match: ['air filter', 'hvac filter', 'furnace filter'], icon: '🌬️' },
  { match: ['water heater'], icon: '🚿' },
  { match: ['dryer vent'], icon: '👕' },
  { match: ['septic'], icon: '🚽' },
  { match: ['weed', 'fertiliz', 'mulch'], icon: '🌱' },
  // Single-word noun matches
  { match: ['pest', 'termite', 'roach', 'rodent', 'ant', 'mice', 'mosquito', 'extermin'], icon: '🐜' },
  { match: ['chimney'], icon: '🧱' },
  { match: ['fireplace'], icon: '🔥' },
  { match: ['gutter'], icon: '🍁' },
  { match: ['roof'], icon: '🏚️' },
  { match: ['leak', 'plumb', 'pipe', 'drain', 'faucet', 'sink'], icon: '💧' },
  { match: ['toilet'], icon: '🚽' },
  { match: ['hvac', 'furnace', 'air condition', 'a/c ', 'ac unit', 'thermostat'], icon: '🌡️' },
  { match: ['heat pump', 'heating'], icon: '♨️' },
  { match: ['vent'], icon: '🌬️' },
  { match: ['landscap', 'lawn', 'mow', 'grass', 'garden', 'tree', 'shrub', 'hedge', 'yard'], icon: '🌿' },
  { match: ['paint'], icon: '🎨' },
  { match: ['carpet', 'rug'], icon: '🧶' },
  { match: ['window'], icon: '🪟' },
  { match: ['door', 'lock'], icon: '🚪' },
  { match: ['garage'], icon: '🚗' },
  { match: ['pool', 'spa', 'hot tub'], icon: '🏊' },
  { match: ['deck', 'patio', 'fence'], icon: '🪵' },
  { match: ['snow', 'ice', 'winteriz'], icon: '❄️' },
  { match: ['leaf', 'leaves', 'rake'], icon: '🍁' },
  { match: ['hoa', 'association'], icon: '🏘️' },
  { match: ['bill', 'invoice', 'tax', 'mortgage', 'insurance', 'utility'], icon: '🧾' },
  { match: ['dryer'], icon: '👕' },
  { match: ['washer', 'laundry'], icon: '🧺' },
  { match: ['dishwasher', 'dish'], icon: '🍽️' },
  { match: ['oven', 'stove', 'range', 'burner'], icon: '🍳' },
  { match: ['fridge', 'refrigerator', 'freezer'], icon: '🧊' },
  { match: ['microwave'], icon: '♨️' },
  { match: ['battery', 'batter'], icon: '🔋' },
  { match: ['light', 'bulb', 'lamp'], icon: '💡' },
  { match: ['electric', 'outlet', 'circuit', 'wiring', 'breaker'], icon: '⚡' },
  { match: ['irrigation', 'sprinkler'], icon: '💦' },
  { match: ['inspect', 'check'], icon: '🔍' },
  { match: ['recycl'], icon: '♻️' },
  { match: ['compost'], icon: '🌱' },
  { match: ['trash', 'garbage', 'bin', 'waste', 'dumpster', 'rubbish'], icon: '🗑️' },
  { match: ['clean', 'wash', 'dust', 'vacuum', 'mop', 'sweep'], icon: '🧹' },
  { match: ['water'], icon: '💧' },
  { match: ['filter'], icon: '🌬️' },
];

export function emojiForTaskTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  for (const rule of TASK_ICON_RULES) {
    if (rule.match.some((kw) => t.includes(kw))) return rule.icon;
  }
  return null;
}

export function getTaskUrgency(dueDate: string | null): 'overdue' | 'due_soon' | 'upcoming' | 'none' {
  if (!dueDate) return 'none';
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diff = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'overdue';
  if (diff <= 3) return 'due_soon';
  return 'upcoming';
}

export function urgencyColor(urgency: string): string {
  switch (urgency) {
    case 'overdue': return '#FF3B30';
    case 'due_soon': return '#FF9F0A';
    case 'upcoming': return '#34C759';
    default: return '#8E8E93';
  }
}

// Single source of truth for the dot color of a task across the whole app
// (dashboard sections, calendar, task cards). Bucketing matches the
// dashboard sections exactly so a task that lives in 'Later' on the
// dashboard gets the same purple dot on the calendar.
export const SECTION_COLORS = {
  overdue: '#FF3B30',      // red
  thisWeek: '#FF9F0A',     // orange
  thisMonth: '#34C759',    // green
  upcoming: '#4B9CD3',     // Carolina Blue
  later: '#592A8A',        // ECU Pirates purple
  completed: '#8E8E93',    // muted grey
};

export function sectionColorForTask(
  dueDate: string | null,
  status?: string | null
): string {
  if (status === 'completed') return SECTION_COLORS.completed;
  if (!dueDate) return SECTION_COLORS.later;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diffDays = Math.floor((due.getTime() - now.getTime()) / 86400000);

  if (diffDays < 0) return SECTION_COLORS.overdue;
  if (diffDays < 7) return SECTION_COLORS.thisWeek;

  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);
  if (due <= monthEnd) return SECTION_COLORS.thisMonth;

  const sixWeeksOut = new Date(now.getTime() + 42 * 86400000);
  if (due < sixWeeksOut) return SECTION_COLORS.upcoming;

  return SECTION_COLORS.later;
}

export function formatCurrency(amount: number): string {
  // Drop the cents when the value is whole, otherwise keep two decimals.
  // Always include the thousands separator ($323,000 not $323000).
  const opts: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  };
  return new Intl.NumberFormat('en-US', opts).format(amount);
}
