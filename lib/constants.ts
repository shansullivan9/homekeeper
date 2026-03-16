import { Recurrence } from './types';

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  one_time: 'One Time',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Every 3 Months',
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

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
