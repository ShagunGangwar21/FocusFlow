import React, { useState, useEffect } from 'react';
import { IconX, IconTarget, IconClock, IconCheckSquare } from '../common/Icons';

export default function GoalModal({ isOpen, onClose, onSave, goalToEdit = null, isSaving = false, error = null }) {
  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState('DAILY');
  const [type, setType] = useState('FOCUS_TIME');
  const [targetValue, setTargetValue] = useState(60);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  useEffect(() => {
    if (goalToEdit) {
      setTitle(goalToEdit.title || '');
      setPeriod(goalToEdit.period || 'DAILY');
      setType(goalToEdit.type || 'FOCUS_TIME');
      setTargetValue(goalToEdit.targetValue || (goalToEdit.type === 'FOCUS_TIME' ? 60 : 5));
      setStartsAt(goalToEdit.startsAt ? new Date(goalToEdit.startsAt).toISOString().split('T')[0] : '');
      setEndsAt(goalToEdit.endsAt ? new Date(goalToEdit.endsAt).toISOString().split('T')[0] : '');
    } else {
      setTitle('');
      setPeriod('DAILY');
      setType('FOCUS_TIME');
      setTargetValue(60);
      setStartsAt(new Date().toISOString().split('T')[0]);
      setEndsAt('');
    }
  }, [goalToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      title: title.trim() || (type === 'FOCUS_TIME' ? `${targetValue}m Focus Time` : `${targetValue} Tasks Completed`),
      period,
      type,
      targetValue: Number(targetValue),
    };

    if (startsAt) payload.startsAt = new Date(`${startsAt}T00:00:00.000Z`).toISOString();
    if (endsAt) payload.endsAt = new Date(`${endsAt}T23:59:59.999Z`).toISOString();

    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl p-6 text-[var(--text-main)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
              <IconTarget className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight">
                {goalToEdit ? 'Edit Goal' : 'Create Productivity Goal'}
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Set personal focus time or task targets to maintain momentum
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-xl bg-[var(--status-danger)]/10 border border-[var(--status-danger)]/20 text-xs text-[var(--status-danger)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1.5">
              Goal Title / Label (Optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === 'FOCUS_TIME' ? 'e.g. Daily Deep Work' : 'e.g. Sprint Tasks'}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-hidden focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
            />
          </div>

          {/* Period & Goal Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1.5">
                Period
              </label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                disabled={!!goalToEdit}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-hidden focus:border-[var(--accent)]"
              >
                <option value="DAILY">Daily Goal</option>
                <option value="WEEKLY">Weekly Goal</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1.5">
                Metric Type
              </label>
              <select
                value={type}
                onChange={(e) => {
                  const newType = e.target.value;
                  setType(newType);
                  if (newType === 'FOCUS_TIME' && targetValue < 15) setTargetValue(60);
                  if (newType === 'TASK_COMPLETION' && targetValue > 50) setTargetValue(5);
                }}
                disabled={!!goalToEdit}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-hidden focus:border-[var(--accent)]"
              >
                <option value="FOCUS_TIME">Focus Time (Minutes)</option>
                <option value="TASK_COMPLETION">Tasks Completed</option>
              </select>
            </div>
          </div>

          {/* Target Value Input */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1.5">
              Target Value ({type === 'FOCUS_TIME' ? 'Minutes' : 'Tasks'})
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--text-dim)]">
                {type === 'FOCUS_TIME' ? <IconClock className="w-4 h-4" /> : <IconCheckSquare className="w-4 h-4" />}
              </div>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={targetValue}
                onChange={(e) => setTargetValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-hidden focus:border-[var(--accent)]"
              />
            </div>
            {type === 'FOCUS_TIME' && (
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Equivalent to ≈ {(targetValue / 60).toFixed(1)} hours of server-tracked focus time.
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1.5">
                Effective Start
              </label>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-hidden focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1.5">
                End Date (Optional)
              </label>
              <input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-hidden focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-main)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl bg-[var(--accent)] text-[var(--accent-text)] hover:opacity-90 transition-opacity shadow-xs disabled:opacity-50"
            >
              {isSaving && <div className="w-3.5 h-3.5 border-2 border-[var(--accent-text)] border-t-transparent rounded-full animate-spin" />}
              {goalToEdit ? 'Save Changes' : 'Create Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
