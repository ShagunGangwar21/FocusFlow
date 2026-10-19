import React, { useState, useEffect, useRef } from 'react';
import { IconX, IconLock, IconUnlock } from '../common/Icons';
import { getLocalDateKey } from '../calendar/CalendarModule';

export function validateDurationInput(val) {
  if (val === '' || val === null || val === undefined) {
    return 'Please enter a duration greater than 0 minutes.';
  }
  const str = String(val).trim();
  if (!str) {
    return 'Please enter a duration greater than 0 minutes.';
  }
  if (str.includes('.') || str.includes(',')) {
    return 'Duration must be a whole number of minutes.';
  }
  if (!/^-?\d+$/.test(str)) {
    return 'Please enter a valid number of minutes.';
  }
  const num = parseInt(str, 10);
  if (isNaN(num) || num <= 0) {
    return 'Please enter a duration greater than 0 minutes.';
  }
  return null;
}

export default function QuickAddTaskModal({ isOpen, onClose, onAddTask }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduleType, setScheduleType] = useState('FLEXIBLE');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [durationError, setDurationError] = useState(null);
  const [priority, setPriority] = useState('MEDIUM');
  const [scheduledDate, setScheduledDate] = useState(() => getLocalDateKey(new Date()));
  const [startTime, setStartTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setDurationError(null);
      setScheduledDate(getLocalDateKey(new Date()));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleDurationChange = (e) => {
    const val = e.target.value;
    setDurationMinutes(val);
    setDurationError(validateDurationInput(val));
  };

  const handlePresetClick = (preset) => {
    setDurationMinutes(preset);
    setDurationError(null);
  };

  const durationNum = parseInt(durationMinutes, 10);
  const isPresetHighlighted = (preset) => {
    if (durationError) return false;
    const str = String(durationMinutes).trim();
    if (!str || str.includes('.') || str.includes(',')) return false;
    return durationNum === preset;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Please provide a task title.');
      return;
    }

    const durErr = validateDurationInput(durationMinutes);
    if (durErr) {
      setDurationError(durErr);
      return;
    }

    const parsedDuration = parseInt(durationMinutes, 10);

    setError(null);
    setIsSubmitting(true);

    try {
      let startAt = null;
      let endAt = null;
      let deadlineAt = null;
      if (scheduledDate) {
        if (startTime) {
          const start = new Date(`${scheduledDate}T${startTime}:00`);
          startAt = start.toISOString();
          const end = new Date(start.getTime() + parsedDuration * 60000);
          endAt = end.toISOString();
        } else {
          // Default to 09:00 AM local time on scheduled date
          const start = new Date(`${scheduledDate}T09:00:00`);
          startAt = start.toISOString();
          const end = new Date(start.getTime() + parsedDuration * 60000);
          endAt = end.toISOString();
        }
        deadlineAt = new Date(`${scheduledDate}T23:59:59.999`).toISOString();
      }

      await onAddTask({
        title: trimmedTitle,
        description: description.trim() || null,
        scheduleType,
        estimatedDurationMinutes: parsedDuration,
        priority,
        startAt,
        endAt,
        deadlineAt,
      });

      setTitle('');
      setDescription('');
      setScheduleType('FLEXIBLE');
      setDurationMinutes(45);
      setDurationError(null);
      setPriority('MEDIUM');
      setStartTime('');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
          <h2 id="modal-title" className="text-base font-bold tracking-tight text-[var(--text-main)]">
            Create New Task
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 transition-colors"
            aria-label="Close modal"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-500 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Title */}
          <div>
            <label htmlFor="task-title" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Task Title <span className="text-red-400">*</span>
            </label>
            <input
              id="task-title"
              ref={inputRef}
              type="text"
              required
              placeholder="e.g., Conduct user research interviews"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="task-description" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Description (Optional)
            </label>
            <textarea
              id="task-description"
              rows={2}
              placeholder="Add key notes, links, or context..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] resize-none disabled:opacity-50"
            />
          </div>

          {/* Schedule Type Selection (FIXED vs FLEXIBLE) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Schedule Type (Recovery Rule)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScheduleType('FIXED')}
                disabled={isSubmitting}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  scheduleType === 'FIXED'
                    ? 'border-rose-500 bg-rose-500/15 text-rose-400 font-bold'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                }`}
              >
                <IconLock className="w-3.5 h-3.5" />
                <span>FIXED Commitment</span>
              </button>
              <button
                type="button"
                onClick={() => setScheduleType('FLEXIBLE')}
                disabled={isSubmitting}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  scheduleType === 'FLEXIBLE'
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] font-bold'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                }`}
              >
                <IconUnlock className="w-3.5 h-3.5" />
                <span>FLEXIBLE Slot</span>
              </button>
            </div>
            <p className="text-[11px] text-[var(--text-dim)] mt-1">
              {scheduleType === 'FIXED'
                ? 'Fixed tasks require explicit consent before any schedule shift.'
                : 'Flexible tasks can be rescheduled automatically into recovery buffers.'}
            </p>
          </div>

          {/* Schedule Date & Start Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="schedule-date" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                Scheduled Date
              </label>
              <input
                id="schedule-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
              />
            </div>

            <div>
              <label htmlFor="start-time" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                Start Time (Optional)
              </label>
              <input
                id="start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. 10:00"
                className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
              />
            </div>
          </div>

          {/* Estimated Duration */}
          <div>
            <label htmlFor="duration-input" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Estimated Duration <span className="text-red-400">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                id="duration-input"
                type="number"
                min="1"
                step="1"
                value={durationMinutes}
                onChange={handleDurationChange}
                disabled={isSubmitting}
                placeholder="Enter duration"
                aria-invalid={!!durationError}
                aria-describedby={durationError ? 'duration-error' : undefined}
                className={`w-full px-3 py-2 pr-20 text-sm rounded-lg bg-[var(--bg-subtle)] border text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-none transition-colors disabled:opacity-50 ${
                  durationError
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-[var(--border-subtle)] focus:border-[var(--accent)]'
                }`}
              />
              <span className="absolute right-3 text-xs font-medium text-[var(--text-muted)] pointer-events-none select-none">
                minutes
              </span>
            </div>

            {/* Inline validation message */}
            {durationError && (
              <p id="duration-error" className="mt-1.5 text-xs text-red-500 dark:text-red-400 font-medium">
                {durationError}
              </p>
            )}

            {/* Quick-select duration buttons */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {[15, 25, 45, 60].map((preset) => {
                const highlighted = isPresetHighlighted(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handlePresetClick(preset)}
                    disabled={isSubmitting}
                    className={`px-3 py-1 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                      highlighted
                        ? 'bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)] font-semibold shadow-xs'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-main)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    {preset} min
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label htmlFor="priority-input" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Priority
            </label>
            <select
              id="priority-input"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !!durationError}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-colors cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {isSubmitting && (
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              )}
              <span>Add Task</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
