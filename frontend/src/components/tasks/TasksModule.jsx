import React, { useState, useMemo } from 'react';
import {
  IconCheckSquare,
  IconClock,
  IconCalendar,
  IconPlay,
  IconPlus,
  IconEdit,
  IconTrash,
  IconSearch,
  IconLock,
  IconUnlock,
  IconAlertTriangle,
  IconRefreshCw,
  IconCheck,
  IconSparkles,
  IconArrowRight,
} from '../common/Icons';
import ConfirmDialog from '../common/ConfirmDialog';

export default function TasksModule({
  tasks = [],
  isLoading = false,
  error = null,
  onRetry,
  onToggleComplete,
  activeTaskId,
  taskElapsedSeconds = {},
  isTimerMutating = false,
  onStartFocus,
  onOpenQuickAdd,
  onEditTask,
  onDeleteTask,
  onNavigateToCalendar,
}) {
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'TODAY' | 'UPCOMING' | 'PENDING' | 'COMPLETED' | 'OVERDUE'
  const [priorityFilter, setPriorityFilter] = useState('ALL'); // 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'
  const [scheduleTypeFilter, setScheduleTypeFilter] = useState('ALL'); // 'ALL' | 'FIXED' | 'FLEXIBLE'
  const [sortBy, setSortBy] = useState('DEADLINE_ASC'); // 'DEADLINE_ASC' | 'SCHEDULED_ASC' | 'PRIORITY_DESC' | 'CREATED_DESC' | 'TITLE_ASC'
  const [searchQuery, setSearchQuery] = useState('');
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Helper to format local date keys (YYYY-MM-DD)
  const getLocalDateKey = (dateInput) => {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayKey = useMemo(() => getLocalDateKey(new Date()), []);
  const nowTime = useMemo(() => new Date().getTime(), []);

  // Compute Task Counts for Header Badges
  const counts = useMemo(() => {
    let today = 0;
    let upcoming = 0;
    let pending = 0;
    let completed = 0;
    let overdue = 0;

    tasks.forEach((t) => {
      const isCompleted = t.status === 'COMPLETED';
      if (isCompleted) {
        completed++;
      } else {
        pending++;
      }

      const scheduledKey = t.startAt ? getLocalDateKey(t.startAt) : null;
      const deadlineKey = t.deadlineAt ? getLocalDateKey(t.deadlineAt) : null;
      const createdKey = getLocalDateKey(t.createdAt);

      const isTodayTask =
        scheduledKey === todayKey ||
        (!t.startAt && deadlineKey === todayKey) ||
        (!t.startAt && !t.deadlineAt && createdKey === todayKey);

      if (isTodayTask) {
        today++;
      }

      const isUpcomingTask =
        (scheduledKey && scheduledKey > todayKey) ||
        (!t.startAt && deadlineKey && deadlineKey > todayKey) ||
        (t.startAt && new Date(t.startAt).getTime() > nowTime && scheduledKey !== todayKey);

      if (isUpcomingTask) {
        upcoming++;
      }

      if (!isCompleted && t.deadlineAt && new Date(t.deadlineAt).getTime() < nowTime) {
        overdue++;
      }
    });

    return {
      all: tasks.length,
      today,
      upcoming,
      pending,
      completed,
      overdue,
    };
  }, [tasks, todayKey, nowTime]);

  // Filter & Search
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const isCompleted = task.status === 'COMPLETED';
      const taskScheduledDateKey = task.startAt ? getLocalDateKey(task.startAt) : null;
      const taskDeadlineDateKey = task.deadlineAt ? getLocalDateKey(task.deadlineAt) : null;
      const taskCreatedDateKey = getLocalDateKey(task.createdAt);

      // 1. Status / Period Filter
      if (filter === 'TODAY') {
        const isToday =
          taskScheduledDateKey === todayKey ||
          (!task.startAt && taskDeadlineDateKey === todayKey) ||
          (!task.startAt && !task.deadlineAt && taskCreatedDateKey === todayKey);
        if (!isToday) return false;
      } else if (filter === 'UPCOMING') {
        const isUpcoming =
          (taskScheduledDateKey && taskScheduledDateKey > todayKey) ||
          (!task.startAt && taskDeadlineDateKey && taskDeadlineDateKey > todayKey) ||
          (task.startAt && new Date(task.startAt).getTime() > nowTime && taskScheduledDateKey !== todayKey);
        if (!isUpcoming) return false;
      } else if (filter === 'PENDING') {
        if (isCompleted) return false;
      } else if (filter === 'COMPLETED') {
        if (!isCompleted) return false;
      } else if (filter === 'OVERDUE') {
        const isOverdue = !isCompleted && task.deadlineAt && new Date(task.deadlineAt).getTime() < nowTime;
        if (!isOverdue) return false;
      }

      // 2. Priority Filter
      if (priorityFilter !== 'ALL' && task.priority !== priorityFilter) {
        return false;
      }

      // 3. Schedule Type Filter
      if (scheduleTypeFilter !== 'ALL' && task.scheduleType !== scheduleTypeFilter) {
        return false;
      }

      // 4. Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = task.title?.toLowerCase().includes(q);
        const descMatch = task.description?.toLowerCase().includes(q);
        const projMatch = task.project?.name?.toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !projMatch) return false;
      }

      return true;
    });
  }, [tasks, filter, priorityFilter, scheduleTypeFilter, searchQuery, todayKey, nowTime]);

  // Sort Tasks
  const sortedTasks = useMemo(() => {
    const list = [...filteredTasks];
    list.sort((a, b) => {
      // Completed tasks sink to the bottom when viewing general lists
      if (filter === 'ALL') {
        if (a.status === 'COMPLETED' && b.status !== 'COMPLETED') return 1;
        if (a.status !== 'COMPLETED' && b.status === 'COMPLETED') return -1;
      }

      if (sortBy === 'DEADLINE_ASC') {
        if (!a.deadlineAt && !b.deadlineAt) return 0;
        if (!a.deadlineAt) return 1;
        if (!b.deadlineAt) return -1;
        return new Date(a.deadlineAt) - new Date(b.deadlineAt);
      }

      if (sortBy === 'SCHEDULED_ASC') {
        if (!a.startAt && !b.startAt) return 0;
        if (!a.startAt) return 1;
        if (!b.startAt) return -1;
        return new Date(a.startAt) - new Date(b.startAt);
      }

      if (sortBy === 'PRIORITY_DESC') {
        const priorityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        const pA = priorityWeight[a.priority] || 2;
        const pB = priorityWeight[b.priority] || 2;
        return pB - pA;
      }

      if (sortBy === 'CREATED_DESC') {
        return new Date(b.createdAt) - new Date(a.createdAt);
      }

      if (sortBy === 'TITLE_ASC') {
        return (a.title || '').localeCompare(b.title || '');
      }

      return 0;
    });
    return list;
  }, [filteredTasks, sortBy, filter]);

  const handleConfirmDelete = async () => {
    if (!taskToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDeleteTask(taskToDelete.id);
      setTaskToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatMinutes = (mins) => {
    if (!mins || mins <= 0) return '0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-[var(--bg-card)] via-[var(--bg-card)] to-[var(--bg-subtle)] border border-[var(--border-subtle)] shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
              <IconCheckSquare className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-main)]">
              Tasks & Commitments
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-muted)]">
            Manage your schedule, track focus progress, and align fixed commitments with flexible slots.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {onRetry && (
            <button
              onClick={onRetry}
              title="Refresh task list"
              className="p-2 rounded-xl border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors"
            >
              <IconRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            onClick={onOpenQuickAdd}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--accent)] text-[var(--accent-text)] hover:opacity-90 transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <IconPlus className="w-4 h-4" />
            <span>Create Task</span>
          </button>
        </div>
      </div>

      {/* Metric Stat Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { id: 'ALL', label: 'All Tasks', count: counts.all, color: 'text-[var(--text-main)]' },
          { id: 'TODAY', label: 'Today', count: counts.today, color: 'text-[var(--accent)]' },
          { id: 'UPCOMING', label: 'Upcoming', count: counts.upcoming, color: 'text-indigo-400' },
          { id: 'PENDING', label: 'Pending', count: counts.pending, color: 'text-amber-400' },
          { id: 'COMPLETED', label: 'Completed', count: counts.completed, color: 'text-[var(--status-success)]' },
          { id: 'OVERDUE', label: 'Overdue', count: counts.overdue, color: 'text-[var(--status-danger)]' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
              filter === item.id
                ? 'bg-[var(--bg-card)] border-[var(--accent)] shadow-xs ring-1 ring-[var(--accent)]/30'
                : 'bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-[var(--border-subtle)]/80'
            }`}
          >
            <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider block truncate">
              {item.label}
            </span>
            <span className={`text-xl font-bold tracking-tight mt-1 block ${item.color}`}>
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filter, Search & Sort Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--text-dim)]">
            <IconSearch className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks by title, description, or project..."
            className="w-full pl-10 pr-3.5 py-2 text-xs rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-hidden focus:border-[var(--accent)] transition-all"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-hidden focus:border-[var(--accent)] cursor-pointer"
          >
            <option value="ALL">All Priorities</option>
            <option value="HIGH">High Priority</option>
            <option value="MEDIUM">Medium Priority</option>
            <option value="LOW">Low Priority</option>
          </select>

          {/* Schedule Type Filter */}
          <select
            value={scheduleTypeFilter}
            onChange={(e) => setScheduleTypeFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-hidden focus:border-[var(--accent)] cursor-pointer"
          >
            <option value="ALL">All Schedule Types</option>
            <option value="FIXED">Fixed Commitments</option>
            <option value="FLEXIBLE">Flexible Tasks</option>
          </select>

          {/* Sort By Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-hidden focus:border-[var(--accent)] cursor-pointer"
          >
            <option value="DEADLINE_ASC">Deadline: Earliest First</option>
            <option value="SCHEDULED_ASC">Scheduled: Earliest First</option>
            <option value="PRIORITY_DESC">Priority: High to Low</option>
            <option value="CREATED_DESC">Created: Newest First</option>
            <option value="TITLE_ASC">Title: A to Z</option>
          </select>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-xl bg-[var(--status-danger)]/10 border border-[var(--status-danger)]/20 text-xs text-[var(--status-danger)] flex items-center justify-between">
          <span>Failed to load tasks: {error.message || error}</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1 text-xs font-bold rounded-lg bg-[var(--status-danger)]/20 hover:bg-[var(--status-danger)]/30 text-[var(--status-danger)] cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Tasks List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] animate-pulse" />
          ))}
        </div>
      ) : sortedTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs">
          <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] text-[var(--accent)] mb-3">
            <IconCheckSquare className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-[var(--text-main)] mb-1">
            {tasks.length === 0
              ? 'No Tasks Created Yet'
              : filter === 'OVERDUE'
              ? 'All Caught Up! Zero Overdue Tasks'
              : 'No Tasks Match the Selected Filters'}
          </h3>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mb-4">
            {tasks.length === 0
              ? 'Create your first scheduled commitment or flexible task to take control of your day.'
              : filter === 'OVERDUE'
              ? 'Every scheduled commitment is on track. Great job maintaining your schedule!'
              : 'Try clearing your search query or selecting a different status filter.'}
          </p>
          {tasks.length === 0 ? (
            <button
              onClick={onOpenQuickAdd}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--accent)] text-[var(--accent-text)] hover:opacity-90 transition-opacity shadow-xs cursor-pointer"
            >
              <IconPlus className="w-4 h-4" />
              <span>Create Task</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setFilter('ALL');
                setPriorityFilter('ALL');
                setScheduleTypeFilter('ALL');
                setSearchQuery('');
              }}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-main)] transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedTasks.map((task) => {
            const isCompleted = task.status === 'COMPLETED';
            const isCurrentActive = activeTaskId === task.id;
            const elapsedForTask = taskElapsedSeconds[task.id] || 0;
            const accumulatedSeconds = (task.accumulatedFocusSeconds || 0) + elapsedForTask;
            const accumulatedMinutes = Math.round(accumulatedSeconds / 60);

            const isOverdue =
              !isCompleted && task.deadlineAt && new Date(task.deadlineAt).getTime() < nowTime;

            const scheduledDateStr = task.startAt
              ? new Date(task.startAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
              : null;
            const scheduledTimeStr = task.startAt
              ? `${new Date(task.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${
                  task.endAt ? ` – ${new Date(task.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''
                }`
              : null;

            return (
              <div
                key={task.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border transition-all ${
                  isCurrentActive
                    ? 'bg-[var(--bg-card)] border-[var(--accent)] ring-1 ring-[var(--accent)]/30 shadow-md'
                    : isCompleted
                    ? 'bg-[var(--bg-card)]/60 border-[var(--border-subtle)] opacity-75'
                    : 'bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-[var(--border-subtle)]/80 shadow-xs'
                }`}
              >
                {/* Left: Complete Checkbox + Title + Metadata */}
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  {/* Status Toggle Checkbox */}
                  <button
                    type="button"
                    onClick={() => onToggleComplete(task.id)}
                    className={`w-5 h-5 rounded-md border mt-0.5 flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                      isCompleted
                        ? 'bg-[var(--status-success)] border-[var(--status-success)] text-white'
                        : 'border-[var(--border-subtle)] hover:border-[var(--accent)] bg-[var(--bg-subtle)]'
                    }`}
                    title={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
                  >
                    {isCompleted && <IconCheck className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>

                  {/* Task Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={`text-sm font-bold truncate ${
                          isCompleted ? 'line-through text-[var(--text-dim)]' : 'text-[var(--text-main)]'
                        }`}
                      >
                        {task.title}
                      </span>

                      {/* Schedule Type Tag */}
                      {task.scheduleType === 'FIXED' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[var(--badge-fixed-bg)] text-[var(--badge-fixed-text)]">
                          <IconLock className="w-2.5 h-2.5" />
                          Fixed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[var(--badge-flex-bg)] text-[var(--badge-flex-text)]">
                          <IconUnlock className="w-2.5 h-2.5" />
                          Flexible
                        </span>
                      )}

                      {/* Priority Tag */}
                      <span
                        className={`px-1.5 py-0.5 rounded-xs text-[9px] font-semibold uppercase ${
                          task.priority === 'HIGH'
                            ? 'bg-rose-500/15 text-rose-400'
                            : task.priority === 'LOW'
                            ? 'bg-slate-500/15 text-slate-400'
                            : 'bg-amber-500/15 text-amber-400'
                        }`}
                      >
                        {task.priority}
                      </span>

                      {/* Overdue Tag */}
                      {isOverdue && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
                          <IconAlertTriangle className="w-2.5 h-2.5" />
                          Overdue
                        </span>
                      )}

                      {/* Project Tag if present */}
                      {task.project?.name && (
                        <span className="px-1.5 py-0.5 rounded-xs text-[9px] font-medium bg-[var(--bg-subtle)] text-[var(--text-dim)] border border-[var(--border-subtle)]">
                          {task.project.name}
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {task.description && (
                      <p className="text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed mb-1.5">
                        {task.description}
                      </p>
                    )}

                    {/* Scheduling & Duration Meta */}
                    <div className="flex items-center gap-3 text-[11px] text-[var(--text-dim)] flex-wrap">
                      {scheduledDateStr && (
                        <span className="flex items-center gap-1 text-[var(--text-main)] font-medium">
                          <IconCalendar className="w-3.5 h-3.5 text-[var(--accent)]" />
                          {scheduledDateStr} {scheduledTimeStr && `(${scheduledTimeStr})`}
                        </span>
                      )}

                      <span className="flex items-center gap-1">
                        <IconClock className="w-3.5 h-3.5" />
                        Est: {task.estimatedDurationMinutes || 30}m
                      </span>

                      {accumulatedMinutes > 0 && (
                        <span className="text-[var(--accent)] font-semibold">
                          Logged: {formatMinutes(accumulatedMinutes)}
                        </span>
                      )}

                      {task.deadlineAt && (
                        <span className={isOverdue ? 'text-rose-400 font-semibold' : ''}>
                          Due: {new Date(task.deadlineAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Action Buttons */}
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  {/* Focus Session Trigger */}
                  {!isCompleted && onStartFocus && (
                    <button
                      type="button"
                      disabled={isTimerMutating || isCurrentActive}
                      onClick={() => onStartFocus(task.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isCurrentActive
                          ? 'bg-[var(--accent)] text-[var(--accent-text)] ring-2 ring-[var(--accent)]/50'
                          : 'bg-[var(--accent)] hover:opacity-90 text-[var(--accent-text)] shadow-xs active:scale-95'
                      } disabled:opacity-50`}
                      title={isCurrentActive ? 'Active Focus Session' : 'Start Focus Timer'}
                    >
                      <IconPlay className="w-3.5 h-3.5" />
                      <span>{isCurrentActive ? 'Focusing...' : 'Focus'}</span>
                    </button>
                  )}

                  {/* Calendar Jump Button */}
                  {onNavigateToCalendar && (
                    <button
                      type="button"
                      onClick={() => onNavigateToCalendar(task.startAt || task.deadlineAt || new Date())}
                      className="p-2 rounded-xl text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer border border-transparent hover:border-[var(--border-subtle)]"
                      title="View date in Calendar"
                    >
                      <IconCalendar className="w-4 h-4" />
                    </button>
                  )}

                  {/* Edit Task Button */}
                  {onEditTask && (
                    <button
                      type="button"
                      onClick={() => onEditTask(task)}
                      className="p-2 rounded-xl text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer border border-transparent hover:border-[var(--border-subtle)]"
                      title="Edit task details"
                    >
                      <IconEdit className="w-4 h-4" />
                    </button>
                  )}

                  {/* Delete Task Button */}
                  {onDeleteTask && (
                    <button
                      type="button"
                      onClick={() => setTaskToDelete(task)}
                      className="p-2 rounded-xl text-[var(--text-dim)] hover:text-[var(--status-danger)] hover:bg-[var(--status-danger)]/10 transition-colors cursor-pointer"
                      title="Delete task"
                    >
                      <IconTrash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(taskToDelete)}
        title="Delete Task"
        message={`Are you sure you want to delete "${taskToDelete?.title}"? This cannot be undone.`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete Task'}
        confirmVariant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setTaskToDelete(null)}
      />
    </div>
  );
}
