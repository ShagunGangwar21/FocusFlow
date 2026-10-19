import React, { useState, useEffect, useRef } from 'react';
import { IconX, IconLock, IconUnlock } from '../common/Icons';
import { getLocalDateKey } from '../calendar/CalendarModule';
import { validateDurationInput } from './QuickAddTaskModal';

export default function EditTaskModal({ isOpen, task, onClose, onUpdateTask }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduleType, setScheduleType] = useState('FLEXIBLE');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [durationError, setDurationError] = useState(null);
  const [priority, setPriority] = useState('MEDIUM');
  const [status, setStatus] = useState('PENDING');
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setScheduleType(task.scheduleType || 'FLEXIBLE');
      setDurationMinutes(task.estimatedDurationMinutes || 30);
      setDurationError(null);
      setPriority(task.priority || 'MEDIUM');
      setStatus(task.status || 'PENDING');
      if (task.startAt) {
        const d = new Date(task.startAt);
        setScheduledDate(getLocalDateKey(d));
        setStartTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
      } else {
        setScheduledDate('');
        setStartTime('');
      }
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, task]);

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

  if (!isOpen || !task) return null;

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
          const s = new Date(`${scheduledDate}T${startTime}:00`);
          startAt = s.toISOString();
          const eTime = new Date(s.getTime() + parsedDuration * 60000);
          endAt = eTime.toISOString();
        } else {
          const s = new Date(`${scheduledDate}T09:00:00`);
          startAt = s.toISOString();
          const eTime = new Date(s.getTime() + parsedDuration * 60000);
          endAt = eTime.toISOString();
        }
        deadlineAt = new Date(`${scheduledDate}T23:59:59.999`).toISOString();
      }

      await onUpdateTask(task.id, {
        title: trimmedTitle,
        description: description.trim() || null,
        scheduleType,
        estimatedDurationMinutes: parsedDuration,
        priority,
        status,
        startAt,
        endAt,
        deadlineAt,
        version: task.version, // Optimistic concurrency protection
      });

      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update task. Please reload and try again.');
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
        aria-labelledby="edit-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
          <h2 id="edit-modal-title" className="text-base font-bold tracking-tight text-[var(--text-main)]">
            Edit Task
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
            <label htmlFor="edit-task-title" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Task Title <span className="text-red-400">*</span>
            </label>
            <input
              id="edit-task-title"
              ref={inputRef}
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="edit-task-description" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Description (Optional)
            </label>
            <textarea
              id="edit-task-description"
              rows={2}
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
          </div>

          {/* Estimated Duration */}
          <div>
            <label htmlFor="edit-duration-input" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Estimated Duration <span className="text-red-400">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                id="edit-duration-input"
                type="number"
                min="1"
                step="1"
                value={durationMinutes}
                onChange={handleDurationChange}
                disabled={isSubmitting}
                placeholder="Enter duration"
                aria-invalid={!!durationError}
                aria-describedby={durationError ? 'edit-duration-error' : undefined}
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
              <p id="edit-duration-error" className="mt-1.5 text-xs text-red-500 dark:text-red-400 font-medium">
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

          {/* Priority & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-priority-input" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                Priority
              </label>
              <select
                id="edit-priority-input"
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

            <div>
              <label htmlFor="edit-status-input" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                Status
              </label>
              <select
                id="edit-status-input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
              >
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
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
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
