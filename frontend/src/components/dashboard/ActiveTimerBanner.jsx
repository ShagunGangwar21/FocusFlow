import React from 'react';
import { IconPlay, IconPause, IconCheck, IconX } from '../common/Icons';

/**
 * frontend/src/components/dashboard/ActiveTimerBanner.jsx
 *
 * Floating focus timer banner displaying the currently active server-authoritative session.
 * Controlled component: displays synchronized elapsed focus time from server timestamps,
 * prevents duplicate clicks during async mutations, and exposes pause/resume/finish/discard actions.
 */
export default function ActiveTimerBanner({
  task,
  elapsedSeconds = 0,
  accumulatedSeconds = 0,
  isPaused = false,
  isMutating = false,
  errorMessage = null,
  onTogglePause,
  onFinishSession,
  onDiscardSession,
}) {
  if (!task) return null;

  const totalFocusSeconds = accumulatedSeconds + elapsedSeconds;

  const formatTime = (secs) => {
    const minutesPart = Math.floor(secs / 60);
    const secondsPart = secs % 60;
    return `${String(minutesPart).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}`;
  };

  const currentFormatted = formatTime(elapsedSeconds);
  const totalFormatted = formatTime(totalFocusSeconds);

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-40 animate-in slide-in-from-bottom-5 duration-200">
      <div className="flex flex-col p-3.5 rounded-xl bg-[var(--bg-card)] border-2 border-[var(--accent)] shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between">
          {/* Left: Indicator & Task Info */}
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] shrink-0">
              <span
                className={`w-2.5 h-2.5 rounded-full bg-[var(--accent)] ${
                  !isPaused && !isMutating ? 'animate-ping' : ''
                }`}
              />
              <span className="absolute w-2 h-2 rounded-full bg-[var(--accent)]" />
            </div>

            <div className="flex flex-col truncate">
              <span className="text-xs font-bold text-[var(--text-main)] truncate">
                {task.title}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-mono font-semibold text-[var(--accent)]">
                  {currentFormatted}
                </span>
                {accumulatedSeconds > 0 && (
                  <span className="text-[10px] font-mono font-medium text-[var(--text-muted)]">
                    (Total: {totalFormatted})
                  </span>
                )}
                <span className="text-[10px] text-[var(--text-dim)]">
                  {isMutating
                    ? '• Syncing...'
                    : isPaused
                    ? '• Paused (Paused time excluded)'
                    : '• Active Focus'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-1.5 shrink-0 pl-2">
            {/* Pause / Resume */}
            <button
              type="button"
              disabled={isMutating}
              onClick={onTogglePause}
              className="p-1.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-card-hover)] text-[var(--text-main)] transition-colors cursor-pointer disabled:opacity-50"
              title={isPaused ? 'Resume focus timer' : 'Pause focus timer'}
              aria-label={isPaused ? 'Resume focus timer' : 'Pause focus timer'}
            >
              {isPaused ? <IconPlay className="w-4 h-4" /> : <IconPause className="w-4 h-4" />}
            </button>

            {/* Finish & Complete */}
            <button
              type="button"
              disabled={isMutating}
              onClick={() => onFinishSession(task.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
              title="Finish focus session and mark task completed"
            >
              <IconCheck className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Done</span>
            </button>

            {/* Discard Session */}
            <button
              type="button"
              disabled={isMutating}
              onClick={onDiscardSession}
              className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
              title="Discard focus session"
              aria-label="Discard focus session"
            >
              <IconX className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Optional Transient Error */}
        {errorMessage && (
          <div className="mt-2 text-[10px] text-red-400 bg-red-500/10 p-1.5 rounded-md">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}
