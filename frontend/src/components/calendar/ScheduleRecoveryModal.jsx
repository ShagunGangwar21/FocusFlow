import React, { useState } from 'react';
import {
  IconX,
  IconCheck,
  IconAlertTriangle,
  IconSparkles,
  IconLock,
  IconUnlock,
  IconClock,
  IconArrowRight,
  IconRefreshCw,
} from '../common/Icons';

/**
 * frontend/src/components/calendar/ScheduleRecoveryModal.jsx
 *
 * Conflict Recovery Review & Confirmation Dialog:
 *  - Displays before & after comparison for each task in the proposal
 *  - Explains the rationale for each displacement
 *  - Enforces the core invariant: FIXED tasks require explicit checkbox consent before applying
 *  - Protects against stale proposals with 409 handling and proposal regeneration
 */
export default function ScheduleRecoveryModal({
  isOpen,
  proposal,
  isLoading = false,
  isApplying = false,
  error = null,
  onClose,
  onAccept,
  onReject,
  onRegenerate,
}) {
  const [consentedFixedTaskIds, setConsentedFixedTaskIds] = useState([]);

  if (!isOpen || !proposal) return null;

  const items = proposal.items || [];
  const fixedItems = items.filter((i) => i.isFixed || i.requiresConsent);
  const allFixedConsented = fixedItems.every((i) => consentedFixedTaskIds.includes(i.taskId));

  const toggleFixedConsent = (taskId) => {
    setConsentedFixedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const handleApply = () => {
    if (!allFixedConsented || isApplying) return;
    const taskVersions = items.map((i) => ({
      taskId: i.taskId,
      version: i.task?.version || 1,
    }));
    onAccept(proposal.id, {
      taskVersions,
      acceptedFixedTaskIds: consentedFixedTaskIds,
    });
  };

  const formatSlot = (isoString) => {
    if (!isoString) return 'Unscheduled';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const isStale = error?.code === 'STALE_PROPOSAL' || error?.status === 409;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-500">
              <IconSparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-main)]">
                Smart Schedule Recovery
              </h3>
              <p className="text-xs text-[var(--text-dim)]">
                {proposal.reason || 'Deterministic schedule realignment plan'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Error Alert / Stale Proposal Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2">
                <IconAlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error.message || 'Failed to apply schedule recovery'}</span>
              </div>
              {isStale && onRegenerate && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 font-semibold cursor-pointer shrink-0 transition-colors"
                >
                  Regenerate Fresh Plan
                </button>
              )}
            </div>
          )}

          {/* Invariant Explanation Banner */}
          <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
            <p className="font-semibold">Deterministic Scheduling Invariants:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px] text-blue-300/90">
              <li>Flexible tasks are shifted into genuine open gaps within working hours.</li>
              <li>Recovery buffers are preserved to prevent cascade overruns.</li>
              <li>Fixed commitments are strictly protected and never moved without your explicit consent.</li>
            </ul>
          </div>

          {/* Proposed Changes List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Proposed Schedule Modifications ({items.length} {items.length === 1 ? 'task' : 'tasks'})
            </h4>

            {items.map((item) => {
              const isFixed = item.isFixed || item.requiresConsent;
              const hasConsent = consentedFixedTaskIds.includes(item.taskId);

              return (
                <div
                  key={item.id || item.taskId}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isFixed
                      ? 'bg-amber-500/5 border-amber-500/30'
                      : 'bg-[var(--bg-subtle)]/60 border-[var(--border-subtle)]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]/50">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[var(--text-main)]">
                        {item.task?.title || 'Task'}
                      </span>
                      {isFixed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--badge-fixed-bg)] text-[var(--badge-fixed-text)]">
                          <IconLock className="w-3 h-3" />
                          Fixed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--badge-flex-bg)] text-[var(--badge-flex-text)]">
                          <IconUnlock className="w-3 h-3" />
                          Flexible
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] font-mono text-[var(--text-muted)]">
                      {formatDate(item.newStartAt)}
                    </span>
                  </div>

                  {/* Before vs After Comparison */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2.5 text-xs">
                    <div className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                      <span className="text-[10px] font-bold text-[var(--text-dim)] uppercase block mb-1">
                        Current Slot
                      </span>
                      <div className="flex items-center gap-1.5 font-mono text-[var(--text-main)]">
                        <IconClock className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                        <span>
                          {item.oldStartAt ? `${formatSlot(item.oldStartAt)} – ${formatSlot(item.oldEndAt)}` : 'Unscheduled'}
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-[var(--accent)] uppercase block mb-1">
                          Proposed Slot
                        </span>
                        <IconArrowRight className="w-3.5 h-3.5 text-[var(--accent)]" />
                      </div>
                      <div className="flex items-center gap-1.5 font-mono font-bold text-[var(--accent)]">
                        <IconClock className="w-3.5 h-3.5" />
                        <span>
                          {formatSlot(item.newStartAt)} – {formatSlot(item.newEndAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Rationale */}
                  <p className="text-[11px] text-[var(--text-dim)] italic mt-1">
                    "{item.reason}"
                  </p>

                  {/* Fixed Task Explicit Confirmation Checkbox */}
                  {isFixed && (
                    <div className="mt-3 pt-2.5 border-t border-amber-500/20">
                      <label className="flex items-start gap-2.5 cursor-pointer text-xs text-amber-400 select-none">
                        <input
                          type="checkbox"
                          checked={hasConsent}
                          onChange={() => toggleFixedConsent(item.taskId)}
                          className="mt-0.5 rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-[var(--accent)]"
                        />
                        <span>
                          I acknowledge this is a <strong>FIXED commitment</strong> and explicitly consent to rescheduling it.
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50">
          <div className="text-xs text-[var(--text-dim)]">
            {fixedItems.length > 0 && !allFixedConsented ? (
              <span className="text-amber-400 font-medium flex items-center gap-1.5">
                <IconAlertTriangle className="w-3.5 h-3.5" />
                Consent required for {fixedItems.length} fixed {fixedItems.length === 1 ? 'task' : 'tasks'}
              </span>
            ) : (
              <span>Review complete. Ready to apply schedule updates atomically.</span>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              disabled={isApplying}
              onClick={() => onReject(proposal.id)}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] transition-colors cursor-pointer disabled:opacity-50"
            >
              Reject Plan
            </button>

            <button
              type="button"
              disabled={isApplying || !allFixedConsented}
              onClick={handleApply}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isApplying ? (
                <>
                  <IconRefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Applying Changes...</span>
                </>
              ) : (
                <>
                  <IconCheck className="w-3.5 h-3.5" />
                  <span>Apply Schedule Recovery</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
