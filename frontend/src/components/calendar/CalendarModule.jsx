import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  IconCalendar,
  IconClock,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconPlay,
  IconLock,
  IconUnlock,
  IconCheck,
  IconAlertTriangle,
  IconSparkles,
  IconRefreshCw,
  IconEdit,
} from '../common/Icons';
import { fetchCalendar } from '../../api/calendar';
import {
  createScheduleProposal,
  acceptScheduleProposal,
  rejectScheduleProposal,
} from '../../api/scheduling';
import ScheduleRecoveryModal from './ScheduleRecoveryModal';

export default function CalendarModule({
  onStartFocus,
  onEditTask,
  onOpenQuickAdd,
  onTasksChanged,
  activeSession = null,
}) {
  const [viewMode, setViewMode] = useState('WEEK'); // 'DAY' | 'WEEK' | 'MONTH'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarData, setCalendarData] = useState({ tasks: [], conflicts: [], summary: {} });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Recovery Proposal Modal State
  const [activeProposal, setActiveProposal] = useState(null);
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const [isApplyingProposal, setIsApplyingProposal] = useState(false);
  const [proposalError, setProposalError] = useState(null);

  // Compute view bounds [from, to] based on viewMode and currentDate
  const { fromDate, toDate } = useMemo(() => {
    const base = new Date(currentDate);

    if (viewMode === 'DAY') {
      const start = new Date(base);
      start.setHours(0, 0, 0, 0);
      const end = new Date(base);
      end.setHours(23, 59, 59, 999);
      return { fromDate: start, toDate: end };
    }

    if (viewMode === 'WEEK') {
      const day = base.getDay();
      const diffToMonday = (day + 6) % 7;
      const start = new Date(base);
      start.setDate(base.getDate() - diffToMonday);
      start.setHours(0, 0, 0, 0);

      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { fromDate: start, toDate: end };
    }

    // MONTH
    const start = new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0, 0);
    // Pad to full weeks for display
    const startDay = start.getDay();
    const diff = (startDay + 6) % 7;
    start.setDate(start.getDate() - diff);

    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
    const endDay = end.getDay();
    const padEnd = endDay === 0 ? 0 : 7 - endDay;
    end.setDate(end.getDate() + padEnd);

    return { fromDate: start, toDate: end };
  }, [currentDate, viewMode]);

  // Load calendar tasks and conflict diagnostics
  const loadCalendar = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchCalendar({
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        scope: 'PERSONAL',
      });
      setCalendarData(data);
    } catch (err) {
      console.error('Failed to load calendar data:', err);
      setError(err.message || 'Failed to load calendar');
    } finally {
      setIsLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  // Navigation handlers
  const handlePrev = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === 'DAY') d.setDate(d.getDate() - 1);
      else if (viewMode === 'WEEK') d.setDate(d.getDate() - 7);
      else d.setMonth(d.getMonth() - 1);
      return d;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === 'DAY') d.setDate(d.getDate() + 1);
      else if (viewMode === 'WEEK') d.setDate(d.getDate() + 7);
      else d.setMonth(d.getMonth() + 1);
      return d;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Header Title Formatter
  const headerTitle = useMemo(() => {
    if (viewMode === 'DAY') {
      return currentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    if (viewMode === 'WEEK') {
      const weekEnd = new Date(fromDate);
      weekEnd.setDate(fromDate.getDate() + 6);
      return `${fromDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [currentDate, viewMode, fromDate]);

  // Trigger automatic schedule recovery proposal
  const handleInitiateRecovery = async () => {
    setIsGeneratingProposal(true);
    setProposalError(null);
    try {
      const dateStr = currentDate.toISOString().split('T')[0];
      const conflictTaskIds = calendarData.conflicts.flatMap((c) => c.taskIds || (c.taskId ? [c.taskId] : []));
      const proposal = await createScheduleProposal({
        date: dateStr,
        conflictTaskIds,
      });
      setActiveProposal(proposal);
    } catch (err) {
      console.error('Failed to generate recovery proposal:', err);
      setProposalError(err);
    } finally {
      setIsGeneratingProposal(false);
    }
  };

  // Accept and apply recovery proposal atomically
  const handleAcceptProposal = async (proposalId, payload) => {
    setIsApplyingProposal(true);
    setProposalError(null);
    try {
      await acceptScheduleProposal(proposalId, payload);
      setActiveProposal(null);
      await loadCalendar();
      if (onTasksChanged) onTasksChanged();
    } catch (err) {
      console.error('Failed to apply recovery proposal:', err);
      setProposalError(err);
    } finally {
      setIsApplyingProposal(false);
    }
  };

  const handleRejectProposal = async (proposalId) => {
    try {
      await rejectScheduleProposal(proposalId);
    } catch (e) {
      // Ignore
    }
    setActiveProposal(null);
  };

  // Group tasks by Date string (YYYY-MM-DD)
  const tasksByDate = useMemo(() => {
    const map = {};
    (calendarData.tasks || []).forEach((task) => {
      if (!task.startAt) return;
      const dateKey = new Date(task.startAt).toISOString().split('T')[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(task);
    });
    return map;
  }, [calendarData.tasks]);

  const conflicts = calendarData.conflicts || [];

  return (
    <div className="space-y-5">
      {/* Top Calendar Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs transition-colors">
        {/* Left: Title & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
              <IconCalendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-[var(--text-main)]">
                {headerTitle}
              </h2>
              <p className="text-xs text-[var(--text-dim)]">
                {calendarData.summary?.totalTasks || 0} scheduled tasks • {calendarData.summary?.conflictCount || 0} conflicts
              </p>
            </div>
          </div>

          {/* Date Step Navigation */}
          <div className="flex items-center gap-1 sm:ml-4">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-card-hover)] text-[var(--text-main)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
              title="Previous period"
            >
              <IconChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-card-hover)] text-[var(--text-main)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="p-1.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-card-hover)] text-[var(--text-main)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
              title="Next period"
            >
              <IconChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: View Switcher & Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* View Mode Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
            {['DAY', 'WEEK', 'MONTH'].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  viewMode === mode
                    ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-xs font-bold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                {mode.charAt(0) + mode.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {/* Conflict Recovery Button (Pulsing if conflicts exist) */}
          {conflicts.length > 0 && (
            <button
              type="button"
              disabled={isGeneratingProposal}
              onClick={handleInitiateRecovery}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 border border-amber-500/30 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              title="Detect and resolve scheduling overlaps"
            >
              <IconSparkles className="w-3.5 h-3.5" />
              <span>{isGeneratingProposal ? 'Analyzing...' : `Recover (${conflicts.length})`}</span>
            </button>
          )}

          {/* New Task Button */}
          <button
            type="button"
            onClick={onOpenQuickAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <IconPlus className="w-3.5 h-3.5" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Conflict Diagnostic Banner (If any conflicts exist) */}
      {conflicts.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-500 shrink-0 mt-0.5">
              <IconAlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-400">
                {conflicts.length} Schedule {conflicts.length === 1 ? 'Conflict' : 'Conflicts'} Detected
              </h4>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                {conflicts[0]?.message} {conflicts.length > 1 ? `(+${conflicts.length - 1} more)` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isGeneratingProposal}
            onClick={handleInitiateRecovery}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-black cursor-pointer transition-colors shrink-0 self-start sm:self-auto shadow-xs"
          >
            {isGeneratingProposal ? 'Generating Plan...' : 'Review Recovery Plan'}
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center justify-between">
          <span>Failed to load calendar: {error}</span>
          <button
            type="button"
            onClick={loadCalendar}
            className="px-2.5 py-1 text-[11px] font-bold rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Calendar Grid Display */}
      {isLoading ? (
        <div className="p-12 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] animate-pulse">
          <div className="w-8 h-8 mx-auto rounded-full bg-[var(--border-subtle)] mb-3" />
          <p className="text-xs font-semibold text-[var(--text-muted)]">Loading schedule commitments...</p>
        </div>
      ) : viewMode === 'WEEK' ? (
        /* WEEK VIEW (7 Days Grid) */
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
          {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
            const colDate = new Date(fromDate);
            colDate.setDate(fromDate.getDate() + dayOffset);
            const dateKey = colDate.toISOString().split('T')[0];
            const isToday = new Date().toISOString().split('T')[0] === dateKey;
            const dayTasks = tasksByDate[dateKey] || [];

            return (
              <div
                key={dateKey}
                className={`flex flex-col min-h-[380px] p-3 rounded-xl border transition-colors ${
                  isToday
                    ? 'bg-[var(--bg-card)] border-[var(--accent)]/50 ring-1 ring-[var(--accent)]/20'
                    : 'bg-[var(--bg-card)] border-[var(--border-subtle)]'
                }`}
              >
                {/* Column Day Header */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-subtle)]">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                      {colDate.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <span className={`text-base font-extrabold ${isToday ? 'text-[var(--accent)]' : 'text-[var(--text-main)]'}`}>
                      {colDate.getDate()}
                    </span>
                  </div>
                  {dayTasks.length > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-[var(--bg-subtle)] text-[var(--text-dim)] border border-[var(--border-subtle)]">
                      {dayTasks.length}
                    </span>
                  )}
                </div>

                {/* Day Tasks List */}
                <div className="space-y-2 flex-1 overflow-y-auto">
                  {dayTasks.length === 0 ? (
                    <div className="h-full flex items-center justify-center py-8 text-center">
                      <span className="text-[11px] text-[var(--text-dim)]">No tasks</span>
                    </div>
                  ) : (
                    dayTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isActive={activeSession && activeSession.taskId === task.id}
                        onEditTask={onEditTask}
                        onStartFocus={onStartFocus}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'DAY' ? (
        /* DAY VIEW (Time-Slot Detailed Timeline) */
        <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs">
          <div className="space-y-3">
            {calendarData.tasks.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-dim)] mb-2">
                  <IconCalendar className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--text-main)]">No tasks scheduled for this day</h3>
                <p className="text-xs text-[var(--text-dim)] mt-0.5">Use "New Task" to schedule focused work or fixed appointments.</p>
                <button
                  type="button"
                  onClick={onOpenQuickAdd}
                  className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer"
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  <span>Add task for today</span>
                </button>
              </div>
            ) : (
              calendarData.tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] hover:border-[var(--accent)]/40 transition-all"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex flex-col min-w-[70px] text-right font-mono text-xs text-[var(--text-muted)] shrink-0">
                      <span>{task.startAt ? new Date(task.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unset'}</span>
                      <span className="text-[10px] text-[var(--text-dim)]">{task.estimatedDurationMinutes || 30}m</span>
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-bold truncate ${task.status === 'COMPLETED' ? 'line-through text-[var(--text-dim)]' : 'text-[var(--text-main)]'}`}>
                          {task.title}
                        </span>

                        {task.scheduleType === 'FIXED' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[var(--badge-fixed-bg)] text-[var(--badge-fixed-text)]">
                            <IconLock className="w-3 h-3" />
                            Fixed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[var(--badge-flex-bg)] text-[var(--badge-flex-text)]">
                            <IconUnlock className="w-3 h-3" />
                            Flexible
                          </span>
                        )}

                        <span className={`px-1.5 py-0.5 rounded-xs text-[9px] font-semibold uppercase ${
                          task.priority === 'HIGH' ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-500/10 text-slate-400'
                        }`}>
                          {task.priority}
                        </span>

                        {task.status === 'COMPLETED' && (
                          <span className="px-1.5 py-0.5 rounded-xs text-[9px] font-semibold bg-emerald-500/10 text-emerald-400">
                            Done
                          </span>
                        )}
                      </div>

                      {task.description && (
                        <p className="text-xs text-[var(--text-dim)] mt-0.5 line-clamp-1">{task.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                    {task.status !== 'COMPLETED' && onStartFocus && (
                      <button
                        type="button"
                        onClick={() => onStartFocus(task.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-colors cursor-pointer"
                      >
                        <IconPlay className="w-3 h-3" />
                        <span>Focus</span>
                      </button>
                    )}
                    {onEditTask && (
                      <button
                        type="button"
                        onClick={() => onEditTask(task)}
                        className="p-1 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                        title="Edit task"
                      >
                        <IconEdit className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* MONTH VIEW (Calendar Grid) */
        <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs">
          {/* Weekday Header */}
          <div className="grid grid-cols-7 gap-1 pb-2 border-b border-[var(--border-subtle)] text-center">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <span key={day} className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {day}
              </span>
            ))}
          </div>

          {/* Month Day Cells */}
          <div className="grid grid-cols-7 gap-1 pt-2">
            {Array.from({ length: 35 }).map((_, i) => {
              const cellDate = new Date(fromDate);
              cellDate.setDate(fromDate.getDate() + i);
              const dateKey = cellDate.toISOString().split('T')[0];
              const isToday = new Date().toISOString().split('T')[0] === dateKey;
              const isCurrentMonth = cellDate.getMonth() === currentDate.getMonth();
              const dayTasks = tasksByDate[dateKey] || [];

              return (
                <div
                  key={dateKey}
                  onClick={() => {
                    setCurrentDate(cellDate);
                    setViewMode('DAY');
                  }}
                  className={`min-h-[85px] p-1.5 rounded-lg border transition-all cursor-pointer hover:border-[var(--accent)]/50 ${
                    isToday
                      ? 'bg-[var(--bg-subtle)] border-[var(--accent)]'
                      : isCurrentMonth
                      ? 'bg-[var(--bg-subtle)]/40 border-[var(--border-subtle)]'
                      : 'opacity-40 bg-transparent border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className={`font-bold ${isToday ? 'text-[var(--accent)]' : 'text-[var(--text-main)]'}`}>
                      {cellDate.getDate()}
                    </span>
                    {dayTasks.length > 0 && (
                      <span className="text-[9px] font-bold text-[var(--text-dim)]">
                        {dayTasks.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 overflow-hidden">
                    {dayTasks.slice(0, 2).map((t) => (
                      <div
                        key={t.id}
                        className="truncate text-[10px] px-1 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] font-medium text-[var(--text-main)]"
                        title={t.title}
                      >
                        {t.title}
                      </div>
                    ))}
                    {dayTasks.length > 2 && (
                      <span className="text-[9px] text-[var(--text-dim)] font-semibold block px-1">
                        +{dayTasks.length - 2} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Schedule Recovery Modal */}
      <ScheduleRecoveryModal
        isOpen={Boolean(activeProposal)}
        proposal={activeProposal}
        isApplying={isApplyingProposal}
        error={proposalError}
        onClose={() => setActiveProposal(null)}
        onAccept={handleAcceptProposal}
        onReject={handleRejectProposal}
        onRegenerate={handleInitiateRecovery}
      />
    </div>
  );
}

/**
 * Task Card component for calendar week & day columns.
 */
function TaskCard({ task, isActive, onEditTask, onStartFocus }) {
  const isCompleted = task.status === 'COMPLETED';
  const timeStr = task.startAt
    ? new Date(task.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : `${task.estimatedDurationMinutes || 30}m`;

  return (
    <div
      className={`group p-2.5 rounded-lg border text-xs transition-all ${
        isActive
          ? 'bg-[var(--accent)]/10 border-[var(--accent)]'
          : isCompleted
          ? 'bg-[var(--bg-subtle)]/30 border-[var(--border-subtle)] opacity-60'
          : 'bg-[var(--bg-subtle)] hover:bg-[var(--bg-card-hover)] border-[var(--border-subtle)]'
      }`}
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="font-mono text-[10px] text-[var(--text-muted)] flex items-center gap-1">
          <IconClock className="w-3 h-3 text-[var(--text-dim)]" />
          {timeStr}
        </span>

        {task.scheduleType === 'FIXED' ? (
          <IconLock className="w-3 h-3 text-[var(--badge-fixed-text)]" title="Fixed commitment" />
        ) : (
          <IconUnlock className="w-3 h-3 text-[var(--text-dim)]" title="Flexible slot" />
        )}
      </div>

      <div
        className={`font-semibold tracking-tight line-clamp-2 cursor-pointer ${
          isCompleted ? 'line-through text-[var(--text-dim)]' : 'text-[var(--text-main)]'
        }`}
        onClick={() => onEditTask && onEditTask(task)}
        title={task.title}
      >
        {task.title}
      </div>

      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[var(--border-subtle)]/60">
        <span
          className={`px-1 py-0.2 rounded-xs text-[9px] font-semibold uppercase ${
            task.priority === 'HIGH'
              ? 'text-rose-400'
              : task.priority === 'MEDIUM'
              ? 'text-amber-400'
              : 'text-slate-400'
          }`}
        >
          {task.priority}
        </span>

        {!isCompleted && onStartFocus && (
          <button
            type="button"
            onClick={() => onStartFocus(task.id)}
            className="p-1 rounded text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors cursor-pointer"
            title="Start focus timer"
          >
            <IconPlay className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
