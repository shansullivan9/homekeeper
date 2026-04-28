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
