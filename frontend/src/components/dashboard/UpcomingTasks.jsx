import React, { useState, useMemo } from 'react';
import {
  IconCheck,
  IconLock,
  IconUnlock,
  IconClock,
  IconPlay,
  IconPlus,
  IconEdit,
  IconTrash,
  IconSearch,
} from '../common/Icons';
import ConfirmDialog from '../common/ConfirmDialog';

export default function UpcomingTasks({
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
}) {
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'COMPLETED' | 'FIXED' | 'FLEXIBLE'
  const [searchQuery, setSearchQuery] = useState('');
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter and search tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // 1. Status/Type Filter
      if (filter === 'FIXED' && task.scheduleType !== 'FIXED') return false;
      if (filter === 'FLEXIBLE' && task.scheduleType !== 'FLEXIBLE') return false;
      if (filter === 'ACTIVE' && task.status === 'COMPLETED') return false;
      if (filter === 'COMPLETED' && task.status !== 'COMPLETED') return false;

      // 2. Search Query Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const titleMatch = task.title?.toLowerCase().includes(query);
        const descMatch = task.description?.toLowerCase().includes(query);
        return titleMatch || descMatch;
      }

      return true;
    });
  }, [tasks, filter, searchQuery]);

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

  return (
    <div className="flex flex-col p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs transition-colors">
      {/* Header and Controls */}
      <div className="flex flex-col gap-3 pb-4 border-b border-[var(--border-subtle)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight text-[var(--text-main)]">
                Today's Schedule & Tasks
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
              </span>
            </div>
            <p className="text-xs text-[var(--text-dim)] mt-0.5">
              Manage fixed commitments and flexible tasks ready for schedule recovery
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenQuickAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-all shadow-xs cursor-pointer self-start sm:self-auto active:scale-95"
          >
            <IconPlus className="w-3.5 h-3.5" />
            <span>New Task</span>
          </button>
        </div>

        {/* Filter Pills and Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] overflow-x-auto">
            {[
              { id: 'ALL', label: 'All' },
              { id: 'ACTIVE', label: 'Active' },
              { id: 'COMPLETED', label: 'Completed' },
              { id: 'FIXED', label: 'Fixed' },
              { id: 'FLEXIBLE', label: 'Flexible' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  filter === tab.id
                    ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative min-w-[180px] sm:w-48">
            <span className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-[var(--text-dim)]">
              <IconSearch className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
      </div>

      {/* Error State Banner */}
      {error && (
        <div className="my-4 p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-500 dark:text-red-400 flex items-center justify-between gap-3">
          <span>Failed to load tasks: {error.message || error}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-2.5 py-1 text-[11px] font-bold rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Task List Content */}
      <div className="divide-y divide-[var(--border-subtle)] mt-1 min-h-[160px]">
        {/* Loading Skeletons */}
        {isLoading ? (
          <div className="space-y-3 py-4 animate-pulse">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-subtle)]/50">
                <div className="flex items-center gap-3 w-2/3">
                  <div className="w-5 h-5 rounded-md bg-[var(--border-subtle)]" />
                  <div className="space-y-1.5 flex-1">
                    <div className="w-1/2 h-4 rounded bg-[var(--border-subtle)]" />
                    <div className="w-1/3 h-3 rounded bg-[var(--border-subtle)]/60" />
                  </div>
                </div>
                <div className="w-16 h-7 rounded bg-[var(--border-subtle)]" />
              </div>
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          /* Empty State */
          <div className="py-12 text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-dim)] mb-2">
              <IconCheck className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-[var(--text-main)]">
              {searchQuery ? 'No matching tasks found' : 'No tasks in this view'}
            </p>
            <p className="text-xs text-[var(--text-dim)] mt-0.5">
              {searchQuery
                ? 'Try adjusting your search terms or filter.'
                : 'Stay organized by adding your first task for today.'}
            </p>
            <button
              type="button"
              onClick={onOpenQuickAdd}
              className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer"
            >
              <IconPlus className="w-3.5 h-3.5" />
              Add a new task
            </button>
          </div>
        ) : (
          /* Rendered Tasks */
          filteredTasks.map((task) => {
            const isCompleted = task.status === 'COMPLETED';
            const isFocusing = activeTaskId === task.id;

            return (
              <div
                key={task.id}
                className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 transition-colors ${
                  isCompleted ? 'opacity-65' : ''
                }`}
              >
                {/* Left: Checkbox + Title & Badges */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Custom Checkbox Button */}
                  <button
                    type="button"
                    onClick={() => onToggleComplete(task.id)}
                    className={`mt-0.5 flex items-center justify-center w-5 h-5 rounded-md border transition-all cursor-pointer shrink-0 ${
                      isCompleted
                        ? 'bg-[var(--status-success)] border-[var(--status-success)] text-white'
                        : 'border-[var(--border-subtle)] hover:border-[var(--accent)] bg-[var(--bg-subtle)] text-transparent'
                    }`}
                    aria-label={`Mark task '${task.title}' as ${isCompleted ? 'pending' : 'complete'}`}
                    title={isCompleted ? 'Click to reopen task' : 'Click to complete task'}
                  >
                    <IconCheck className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm font-semibold tracking-tight truncate max-w-md ${
                          isCompleted
                            ? 'line-through text-[var(--text-dim)]'
                            : 'text-[var(--text-main)]'
                        }`}
                      >
                        {task.title}
                      </span>

                      {/* Schedule Type Pill (Fixed vs Flexible) */}
                      {task.scheduleType === 'FIXED' ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--badge-fixed-bg)] text-[var(--badge-fixed-text)]"
                          title="Fixed Commitment: Never shifted automatically"
                        >
                          <IconLock className="w-3 h-3" />
                          Fixed
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--badge-flex-bg)] text-[var(--badge-flex-text)]"
                          title="Flexible Slot: Can be rescheduled into recovery buffers"
                        >
                          <IconUnlock className="w-3 h-3" />
                          Flexible
                        </span>
                      )}

                      {/* Priority Tag */}
                      <span
                        className={`px-1.5 py-0.5 rounded-xs text-[10px] font-semibold uppercase ${
                          task.priority === 'HIGH'
                            ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400'
                            : task.priority === 'MEDIUM'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-slate-500/10 text-slate-400'
                        }`}
                      >
                        {task.priority}
                      </span>

                      {/* Completed badge if finished */}
                      {isCompleted && (
                        <span className="px-1.5 py-0.5 rounded-xs text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">
                          Done
                        </span>
                      )}
                    </div>

                    {/* Description preview if present */}
                    {task.description && (
                      <p className="text-xs text-[var(--text-dim)] mt-0.5 line-clamp-1">
                        {task.description}
                      </p>
                    )}

                    {/* Metadata Subtitle */}
                    <div className="flex items-center gap-2.5 mt-1 text-xs text-[var(--text-dim)] flex-wrap">
                      <span className="flex items-center gap-1">
                        <IconClock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        <span>{task.estimatedDurationMinutes || 30}m</span>
                      </span>
                      <span>•</span>
                      <span>
                        {task.scope === 'PERSONAL' ? 'Personal' : 'Team'}
                      </span>
                      {taskElapsedSeconds[task.id] > 0 && !isCompleted && (
                        <>
                          <span>•</span>
                          <span className="text-[var(--accent)] font-mono font-medium">
                            {Math.floor(taskElapsedSeconds[task.id] / 60)}m {taskElapsedSeconds[task.id] % 60}s logged
                          </span>
                        </>
                      )}
                      {task.completedAt && (
                        <>
                          <span>•</span>
                          <span className="text-[var(--status-success)]">
                            Completed {new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  {/* Focus timer button (if pending) */}
                  {!isCompleted && onStartFocus && (
                    <button
                      type="button"
                      disabled={isTimerMutating}
                      onClick={() => onStartFocus(task.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        isFocusing
                          ? 'bg-[var(--accent)] text-[var(--accent-text)] ring-2 ring-[var(--accent)]/30'
                          : 'bg-[var(--bg-subtle)] hover:bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)]'
                      }`}
                    >
                      <IconPlay className="w-3 h-3" />
                      <span>
                        {isFocusing
                          ? 'Focusing...'
                          : taskElapsedSeconds[task.id] > 0
                          ? 'Resume'
                          : 'Focus'}
                      </span>
                    </button>
                  )}

                  {/* Edit Task Button */}
                  {onEditTask && (
                    <button
                      type="button"
                      onClick={() => onEditTask(task)}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] border border-transparent hover:border-[var(--border-subtle)] transition-colors cursor-pointer"
                      title="Edit task"
                      aria-label={`Edit task '${task.title}'`}
                    >
                      <IconEdit className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Delete Task Button */}
                  {onDeleteTask && (
                    <button
                      type="button"
                      onClick={() => setTaskToDelete(task)}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--bg-subtle)] border border-transparent hover:border-[var(--border-subtle)] transition-colors cursor-pointer"
                      title="Delete task"
                      aria-label={`Delete task '${task.title}'`}
                    >
                      <IconTrash className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Accessible Task Deletion Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(taskToDelete)}
        title="Delete Task"
        message={`Are you sure you want to delete "${taskToDelete?.title}"? This action cannot be undone.`}
        confirmLabel="Delete task"
        cancelLabel="Cancel"
        confirmVariant="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isDeleting) {
            setTaskToDelete(null);
          }
        }}
      />
    </div>
  );
}
