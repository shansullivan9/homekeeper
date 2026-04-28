'use client';
import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import PageHeader from '@/components/layout/PageHeader';
import TaskCard from '@/components/tasks/TaskCard';
import { useAppInit } from '@/hooks/useAppInit';
import { getTaskUrgency, urgencyColor } from '@/lib/constants';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { tasks } = useStore();
  const { loadData } = useAppInit();

  const activeTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'skipped' && !t.is_suggestion);
  const completedTasks = tasks.filter((t) => t.status === 'completed' && !t.is_suggestion);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const start = startOfWeek(monthStart);
    const end = endOfWeek(monthEnd);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const tasksByDate = useMemo(() => {
    const order: Record<string, number> = { overdue: 0, due_soon: 1, upcoming: 2, none: 3 };
    const map: Record<string, { count: number; color: string }> = {};
    activeTasks.forEach((t) => {
      if (!t.due_date) return;
      const key = t.due_date;
      const urgency = getTaskUrgency(t.due_date);
      const existing = map[key];
      if (!existing) {
        map[key] = { count: 1, color: urgencyColor(urgency) };
        (map[key] as any)._u = urgency;
      } else {
        existing.count += 1;
        const prevU = (existing as any)._u as string;
        if (order[urgency] < order[prevU]) {
          existing.color = urgencyColor(urgency);
          (existing as any)._u = urgency;
        }
      }
    });
    // Add a green dot for any day that has at least one completed task,
    // unless that day is already covered by an active-task urgency dot.
    completedTasks.forEach((t) => {
      const key = t.completed_at ? t.completed_at.slice(0, 10) : t.due_date;
      if (!key) return;
      if (!map[key]) {
        map[key] = { count: 1, color: '#8E8E93' };
        (map[key] as any)._u = 'completed';
      }
    });
    return map;
  }, [activeTasks, completedTasks]);

  const selectedTasks = useMemo(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const active = activeTasks.filter((t) => t.due_date === dateStr);
    const completed = completedTasks.filter((t) => {
      const key = t.completed_at ? t.completed_at.slice(0, 10) : t.due_date;
      return key === dateStr;
    });
    return [...active, ...completed];
  }, [selectedDate, activeTasks, completedTasks]);

  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div>
      <PageHeader title="Calendar" />

      <div className="px-4 pt-3">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 text-ink-secondary active:text-brand-500">
            <ChevronLeft size={22} />
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold">{format(currentMonth, 'MMMM yyyy')}</h2>
            <button
              onClick={() => {
                const now = new Date();
                setCurrentMonth(now);
                setSelectedDate(now);
              }}
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-brand-50 text-brand-600 border border-brand-200 active:bg-brand-100"
            >
              Today
            </button>
          </div>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 text-ink-secondary active:text-brand-500">
            <ChevronRight size={22} />
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 mb-2">
          {days.map((d, i) => (
            <div key={i} className="text-center text-xs font-semibold text-ink-tertiary py-1">{d}</div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-px">
          {calendarDays.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayInfo = tasksByDate[dateStr];
            const count = dayInfo?.count || 0;
            const dotColor = dayInfo?.color;
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isSelected = isSameDay(day, selectedDate);
            const today = isToday(day);

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(day)}
                className={`relative flex flex-col items-center justify-center py-2.5 rounded-xl transition-colors ${
                  isSelected
                    ? 'bg-brand-500 text-white'
                    : today
                    ? 'bg-brand-50'
                    : 'active:bg-gray-100'
                } ${!isCurrentMonth ? 'opacity-30' : ''}`}
              >
                <span className={`text-sm font-medium ${isSelected ? 'text-white' : today ? 'text-brand-600 font-bold' : ''}`}>
                  {format(day, 'd')}
                </span>
                {count > 0 && (
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-0.5"
                    style={{
                      backgroundColor: isSelected ? 'rgba(255,255,255,0.85)' : dotColor,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Date Tasks */}
      <div className="mt-4">
        <p className="section-header">
          {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEEE, MMMM d')}
          {selectedTasks.length > 0 && ` · ${selectedTasks.length} task${selectedTasks.length !== 1 ? 's' : ''}`}
        </p>
        {selectedTasks.length > 0 ? (
          <div className="mx-4 ios-card overflow-hidden">
            {selectedTasks.map((t) => (
              <TaskCard key={t.id} task={t} onComplete={loadData} />
            ))}
          </div>
        ) : (
          <div className="mx-4 ios-card px-4 py-8 text-center">
            <p className="text-ink-tertiary text-sm">No tasks on this date</p>
          </div>
        )}
      </div>
    </div>
  );
}
