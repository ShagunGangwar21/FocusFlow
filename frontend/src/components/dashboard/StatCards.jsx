import React, { useMemo } from 'react';
import {
  IconCheckSquare,
  IconClock,
  IconFlame,
  IconShieldCheck
} from '../common/Icons';
import { getLocalDateKey } from '../calendar/CalendarModule';

export default function StatCards({ tasks = [], activeFocusSeconds = 0, streakData = null, analyticsData = null }) {
  const totalCount = tasks.length;
  const completedTasks = useMemo(
    () => tasks.filter((t) => t.status === 'COMPLETED'),
    [tasks]
  );
  const completedCount = completedTasks.length;
  const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // 1. Focus Time Metrics (Real durations from tasks + live active session)
  const plannedMinutes = useMemo(
    () => tasks.reduce((acc, t) => acc + (t.estimatedDurationMinutes || 0), 0),
    [tasks]
  );
  const plannedHours = Math.floor(plannedMinutes / 60);
  const plannedMinsRem = plannedMinutes % 60;
  const plannedFormatted = plannedMinutes > 0
    ? `${plannedHours}h ${plannedMinsRem > 0 ? `${plannedMinsRem}m` : '00m'}`
    : '0m';

  const completedMinutes = useMemo(
    () => {
      const base = completedTasks.reduce(
        (acc, t) => acc + (t.actualDurationMinutes || t.estimatedDurationMinutes || 0),
        0
      );
      const activeMins = Math.floor(activeFocusSeconds / 60);
      return base + activeMins;
    },
    [completedTasks, activeFocusSeconds]
  );
  const completedHours = Math.floor(completedMinutes / 60);
  const completedMinsRem = completedMinutes % 60;
  const completedFormatted = completedMinutes > 0
    ? `${completedHours}h ${completedMinsRem > 0 ? `${completedMinsRem}m` : '00m'}`
    : '0m';

  const focusPercent = plannedMinutes > 0
    ? Math.min(100, Math.round((completedMinutes / plannedMinutes) * 100))
    : 0;

  // 2. Real Flow Streak Calculation (Use server-authoritative streak if provided, fallback to client calculation)
  const streakDays = useMemo(() => {
    if (streakData && typeof streakData.currentStreakDays === 'number') {
      return streakData.currentStreakDays;
    }

    const tasksWithCompletedDate = completedTasks.filter((t) => t.completedAt);
    if (tasksWithCompletedDate.length === 0) return 0;

    const completedDateSet = new Set(
      tasksWithCompletedDate.map((t) => getLocalDateKey(t.completedAt))
    );

    const today = new Date();
    const todayStr = getLocalDateKey(today);
    let checkDate = new Date(today);

    // If no task completed today, check if yesterday was completed to keep current streak alive
    if (!completedDateSet.has(todayStr)) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    let streak = 0;
    while (completedDateSet.has(getLocalDateKey(checkDate))) {
      streak += 1;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    return streak;
  }, [completedTasks, streakData]);

  // 3. Real Recovery Buffer Calculation (Aggregated from user's flexible tasks)
  const flexibleTasks = useMemo(
    () => tasks.filter((t) => t.scheduleType === 'FLEXIBLE'),
    [tasks]
  );
  const fixedTasks = useMemo(
    () => tasks.filter((t) => t.scheduleType === 'FIXED'),
    [tasks]
  );
  const flexibleBufferMinutes = useMemo(
    () => flexibleTasks.reduce((acc, t) => acc + (t.estimatedDurationMinutes || 0), 0),
    [flexibleTasks]
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Today's Completion Progress */}
      <div className="flex flex-col justify-between p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs transition-colors hover:border-[var(--border-subtle)]/80">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            Today's Progress
          </span>
          <div className="p-2 rounded-lg bg-[var(--bg-subtle)] text-[var(--status-success)]">
            <IconCheckSquare className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-[var(--text-main)]">
              {completedCount}/{totalCount}
            </span>
            <span className="text-xs font-medium text-[var(--text-muted)]">
              {totalCount === 0 ? 'No tasks yet' : `Tasks (${completionPercent}%)`}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1.5 mt-2 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--status-success)] transition-all duration-500 ease-out"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. Planned vs. Actual Focus Time */}
      <div className="flex flex-col justify-between p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs transition-colors hover:border-[var(--border-subtle)]/80">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            Focus Time
          </span>
          <div className="p-2 rounded-lg bg-[var(--bg-subtle)] text-[var(--accent)]">
            <IconClock className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-[var(--text-main)]">
              {completedFormatted}
            </span>
            <span className="text-xs font-medium text-[var(--text-dim)]">
              {plannedMinutes > 0 ? `/ ${plannedFormatted} planned` : '/ 0m planned'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-[var(--text-muted)]">
            {plannedMinutes > 0 ? (
              <span className="text-[var(--status-success)]">
                {focusPercent}% of planned time completed
              </span>
            ) : (
              <span>No planned focus time recorded</span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Flow Streak */}
      <div className="flex flex-col justify-between p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs transition-colors hover:border-[var(--border-subtle)]/80">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            Flow Streak
          </span>
          <div className="p-2 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
            <IconFlame className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-[var(--accent)]">
              {streakDays} {streakDays === 1 ? 'Day' : 'Days'}
            </span>
            <span className="text-xs font-medium text-[var(--text-dim)]">
              {streakDays > 0 ? 'Active' : 'Not started'}
            </span>
          </div>

          <p className="mt-2 text-xs font-medium text-[var(--text-muted)] truncate">
            {streakDays > 0
              ? `${completedCount} total tasks completed`
              : 'Complete tasks to build your streak'}
          </p>
        </div>
      </div>

      {/* 4. Schedule Recovery & Buffers */}
      <div className="flex flex-col justify-between p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs transition-colors hover:border-[var(--border-subtle)]/80">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            Schedule Recovery
          </span>
          <div className="p-2 rounded-lg bg-[var(--bg-subtle)] text-[var(--status-success)]">
            <IconShieldCheck className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-[var(--text-main)]">
              {flexibleBufferMinutes}m Buffer
            </span>
            <span
              className={`text-xs font-medium ${
                flexibleBufferMinutes > 0
                  ? 'text-[var(--status-success)]'
                  : 'text-[var(--text-dim)]'
              }`}
            >
              {totalCount === 0
                ? 'No Tasks'
                : flexibleTasks.length > 0
                ? 'Protected'
                : 'All Fixed'}
            </span>
          </div>

          <p className="mt-2 text-xs font-medium text-[var(--text-muted)] truncate">
            {totalCount === 0
              ? 'Add tasks to enable recovery buffers'
              : `${flexibleTasks.length} flexible • ${fixedTasks.length} fixed commitments`}
          </p>
        </div>
      </div>
    </div>
  );
}
