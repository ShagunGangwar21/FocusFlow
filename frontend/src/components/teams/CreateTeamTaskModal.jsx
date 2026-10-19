import React, { useState } from 'react';
import { IconX, IconCheckSquare, IconLock, IconUnlock } from '../common/Icons';

export default function CreateTeamTaskModal({
  isOpen,
  onClose,
  teamId,
  teamName,
  projects = [],
  members = [],
  onCreateTask,
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeUserIds, setAssigneeUserIds] = useState([]);
  const [priority, setPriority] = useState('MEDIUM');
  const [scheduleType, setScheduleType] = useState('FLEXIBLE');
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState(30);
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const toggleAssignee = (userId) => {
    setAssigneeUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Task title is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      let startAt = null;
      let endAt = null;

      if (scheduledDate && startTime) {
        const start = new Date(`${scheduledDate}T${startTime}:00`);
        const durationMs = (parseInt(estimatedDurationMinutes, 10) || 30) * 60 * 1000;
        const end = new Date(start.getTime() + durationMs);
        startAt = start.toISOString();
        endAt = end.toISOString();
      }

      await onCreateTask({
        title: title.trim(),
        description: description.trim() || null,
        scope: 'TEAM',
        teamId,
        projectId: projectId || null,
        assigneeUserIds: assigneeUserIds.length > 0 ? assigneeUserIds : undefined,
        priority,
        scheduleType,
        estimatedDurationMinutes: parseInt(estimatedDurationMinutes, 10) || 30,
        startAt,
        endAt,
      });

      // Reset
      setTitle('');
      setDescription('');
      setProjectId('');
      setAssigneeUserIds([]);
      setScheduledDate('');
      setStartTime('');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create team task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl p-6 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
              <IconCheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-main)]">New Team Task</h2>
              <p className="text-xs text-[var(--text-muted)]">for {teamName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs shrink-0">
            {error}
          </div>
        )}

        {/* Form Body - Scrollable */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4 overflow-y-auto pr-1 flex-1">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Implement Team Member Invitation UI"
              maxLength={200}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              Description <span className="text-[var(--text-muted)] font-normal">(Optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Context, requirements, or links..."
              rows={2}
              maxLength={2000}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Project Selection */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Project
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">No Project (Standalone)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
          </div>

          {/* Schedule Type & Estimated Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Schedule Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleType('FLEXIBLE')}
                  className={`px-3 py-2 text-xs font-medium rounded-xl border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    scheduleType === 'FLEXIBLE'
                      ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)]'
                      : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  <IconUnlock className="w-3.5 h-3.5" />
                  Flexible
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleType('FIXED')}
                  className={`px-3 py-2 text-xs font-medium rounded-xl border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    scheduleType === 'FIXED'
                      ? 'bg-amber-500/15 border-amber-500 text-amber-500'
                      : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  <IconLock className="w-3.5 h-3.5" />
                  Fixed
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Estimated Duration (mins)
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={estimatedDurationMinutes}
                onChange={(e) => setEstimatedDurationMinutes(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {/* Optional Schedule Time */}
          <div className="p-3 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] space-y-2">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Calendar Placement (Optional)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-[var(--text-muted)] mb-1">Date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[var(--text-muted)] mb-1">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)]"
                />
              </div>
            </div>
          </div>

          {/* Assignees Selector */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              Assign To Team Members ({assigneeUserIds.length} selected)
            </label>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {members.map((m) => {
                const isSelected = assigneeUserIds.includes(m.userId);
                return (
                  <label
                    key={m.userId}
                    className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--text-main)]'
                        : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAssignee(m.userId)}
                        className="rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-0"
                      />
                      <span className="font-medium text-[var(--text-main)]">
                        {m.user?.name || 'Member'}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        ({m.user?.email})
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                      {m.role}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-[var(--accent-text)] border-t-transparent rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Team Task'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
