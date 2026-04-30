'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import PageHeader from '@/components/layout/PageHeader';
import TaskCard from '@/components/tasks/TaskCard';
import { useAppInit } from '@/hooks/useAppInit';
import { sectionColorForTask, SECTION_COLORS } from '@/lib/constants';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const router = useRouter();
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
    // Priority order for picking the dominant dot color when a date has
    // multiple tasks. Lower index = more urgent and wins.
    const PRIORITY: Record<string, number> = {
      [SECTION_COLORS.overdue]: 0,
      [SECTION_COLORS.thisWeek]: 1,
      [SECTION_COLORS.thisMonth]: 2,
      [SECTION_COLORS.upcoming]: 3,
      [SECTION_COLORS.later]: 4,
      [SECTION_COLORS.completed]: 5,
    };
    const map: Record<string, { count: number; color: string }> = {};
    const place = (key: string, color: string) => {
      const existing = map[key];
      if (!existing) {
        map[key] = { count: 1, color };
      } else {
        existing.count += 1;
        if ((PRIORITY[color] ?? 99) < (PRIORITY[existing.color] ?? 99)) {
          existing.color = color;
        }
      }
    };

    activeTasks.forEach((t) => {
      if (!t.due_date) return;
      place(t.due_date, sectionColorForTask(t.due_date, t.status));
    });
    // Completed tasks land on the day they were completed only — never
    // also on their original due date — so a task can't appear on two
    // calendar days.
    completedTasks.forEach((t) => {
      const key = t.completed_at ? t.completed_at.slice(0, 10) : null;
      if (!key) return;
      place(key, SECTION_COLORS.completed);
    });
    return map;
  }, [activeTasks, completedTasks]);

  const selectedTasks = useMemo(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const active = activeTasks.filter((t) => t.due_date === dateStr);
    const completed = completedTasks.filter(
      (t) => t.completed_at && t.completed_at.slice(0, 10) === dateStr
    );
    return [...active, ...completed];
  }, [selectedDate, activeTasks, completedTasks]);

  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const calendarPanel = (
    <div className="px-4 pt-3 md:pt-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => {
            const next = subMonths(currentMonth, 1);
            setCurrentMonth(next);
            setSelectedDate(startOfMonth(next));
          }}
          aria-label="Previous month"
          className="p-2 rounded-full text-ink-secondary active:text-brand-500 md:hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="flex items-center gap-2">
          <h2 className="text-base md:text-lg font-bold">{format(currentMonth, 'MMMM yyyy')}</h2>
          <button
            onClick={() => {
              const now = new Date();
              setCurrentMonth(now);
              setSelectedDate(now);
            }}
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-brand-50 text-brand-600 border border-brand-200 active:bg-brand-100 md:hover:bg-brand-100 transition-colors"
          >
            Today
          </button>
        </div>
        <button
          onClick={() => {
            const next = addMonths(currentMonth, 1);
            setCurrentMonth(next);
            setSelectedDate(startOfMonth(next));
          }}
          aria-label="Next month"
          className="p-2 rounded-full text-ink-secondary active:text-brand-500 md:hover:bg-gray-100 transition-colors"
        >
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
              className={`relative flex flex-col items-center justify-center py-2.5 md:py-3 rounded-xl transition-colors ${
                isSelected
                  ? 'bg-brand-500 text-white'
                  : today
                  ? 'bg-brand-50'
                  : 'active:bg-gray-100 md:hover:bg-gray-100'
              } ${!isCurrentMonth ? 'opacity-30' : ''}`}
            >
              <span className={`text-sm md:text-base font-medium ${isSelected ? 'text-white' : today ? 'text-brand-600 font-bold' : ''}`}>
                {format(day, 'd')}
              </span>
              {count > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1 h-1 rounded-full"
                      style={{
                        backgroundColor: isSelected ? 'rgba(255,255,255,0.85)' : dotColor,
                      }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Dot color legend — same colors the dashboard buckets use. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-tertiary">
        {[
          { color: SECTION_COLORS.overdue, label: 'Overdue' },
          { color: SECTION_COLORS.thisWeek, label: 'This week' },
          { color: SECTION_COLORS.thisMonth, label: 'This month' },
          { color: SECTION_COLORS.upcoming, label: 'Upcoming' },
          { color: SECTION_COLORS.later, label: 'Later' },
          { color: SECTION_COLORS.completed, label: 'Done' },
        ].map((k) => (
          <div key={k.label} className="flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: k.color }}
            />
            <span>{k.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const tasksPanel = (
    <div className="mt-4 md:mt-0">
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
          <p className="text-ink-tertiary text-sm mb-3">No tasks on this date</p>
          <button
            onClick={() => {
              // Pre-set the new task's due_date via sessionStorage; Add
              // Task picks it up on mount.
              const dateStr = format(selectedDate, 'yyyy-MM-dd');
              if (typeof window !== 'undefined') {
                sessionStorage.setItem('homekeeper.prefilledDueDate', dateStr);
              }
              router.push('/add-task');
            }}
            className="px-4 py-2 rounded-ios bg-brand-500 text-white text-sm font-semibold active:bg-brand-600 md:hover:bg-brand-600 transition-colors"
          >
            + Add task on {format(selectedDate, 'MMM d')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader title="Calendar" />
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-6 md:py-4">
        {calendarPanel}
        {tasksPanel}
      </div>
    </div>
  );
}
