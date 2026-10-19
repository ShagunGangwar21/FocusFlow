import React from 'react';
import { IconPlay, IconPause, IconCheck, IconX, IconCoffee, IconClock } from '../common/Icons';

/**
 * frontend/src/components/dashboard/ActiveTimerBanner.jsx
 *
 * Floating focus timer & break banner displaying the currently active
 * server-authoritative session or local recovery break interval.
 * Displays countdown remaining time alongside total duration,
 * prevents duplicate clicks during mutations, and provides pause/resume/finish/discard actions.
 */
export default function ActiveTimerBanner({
  task,
  elapsedSeconds = 0,
  accumulatedSeconds = 0,
  targetFocusSeconds = 1500,
  isPaused = false,
  isMutating = false,
  errorMessage = null,
  // Break mode props
  isBreakMode = false,
  breakTotalSeconds = 300,
  breakElapsedSeconds = 0,
  breakTaskTitle = '',
  onToggleBreakPause,
  onSkipBreak,
  // Focus handlers
  onClearError,
  onTogglePause,
  onFinishSession,
  onDiscardSession,
}) {
  const formatTime = (secs) => {
    const safeSecs = Math.max(0, Math.floor(secs));
    const minutesPart = Math.floor(safeSecs / 60);
    const secondsPart = safeSecs % 60;
    return `${String(minutesPart).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}`;
  };

  // 1. Break Mode Display
  if (isBreakMode) {
    const remainingBreak = Math.max(0, breakTotalSeconds - breakElapsedSeconds);
    const breakFormatted = formatTime(remainingBreak);

    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-40 animate-in slide-in-from-bottom-5 duration-200">
        <div className="flex flex-col p-3.5 rounded-xl bg-[var(--bg-card)] border-2 border-emerald-500 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between">
            {/* Left: Indicator & Break Info */}
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 shrink-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full bg-emerald-500 ${
                    !isPaused ? 'animate-ping' : ''
                  }`}
                />
                <IconCoffee className="absolute w-4 h-4 text-emerald-400" />
              </div>

              <div className="flex flex-col truncate">
                <span className="text-xs font-bold text-[var(--text-main)] truncate flex items-center gap-1.5">
                  Break in Progress
                  {breakTaskTitle && (
                    <span className="text-[10px] text-[var(--text-dim)] font-normal truncate">
                      (Next: {breakTaskTitle})
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-mono font-bold text-emerald-400">
                    {breakFormatted} left
                  </span>
                  <span className="text-[10px] text-[var(--text-dim)]">
                    {isPaused ? '• Paused' : '• Resting & Recharging'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-1.5 shrink-0 pl-2">
              <button
                type="button"
                onClick={onToggleBreakPause}
                className="p-1.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-card-hover)] text-[var(--text-main)] transition-colors cursor-pointer"
                title={isPaused ? 'Resume break timer' : 'Pause break timer'}
                aria-label={isPaused ? 'Resume break timer' : 'Pause break timer'}
              >
                {isPaused ? <IconPlay className="w-4 h-4" /> : <IconPause className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={onSkipBreak}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer active:scale-95"
                title="End break early and resume work"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Focus Session Display
  if (!task) return null;

  const totalFocusSeconds = accumulatedSeconds + elapsedSeconds;
  const remainingFocus = Math.max(0, targetFocusSeconds - elapsedSeconds);
  const remainingFormatted = formatTime(remainingFocus);
  const totalFormatted = formatTime(totalFocusSeconds);
  const currentFormatted = formatTime(elapsedSeconds);

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
                  {remainingFormatted} left
                </span>
                <span className="text-[10px] font-mono font-medium text-[var(--text-muted)]">
                  (Total: {totalFormatted})
                </span>
                <span className="text-[10px] text-[var(--text-dim)]">
                  {isMutating
                    ? '• Syncing...'
                    : isPaused
                    ? '• Paused'
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
          <div className="mt-2 text-[10px] text-red-400 bg-red-500/10 p-1.5 rounded-md flex items-center justify-between gap-2">
            <span>{errorMessage}</span>
            {onClearError && (
              <button
                type="button"
                onClick={onClearError}
                className="text-[10px] text-red-400 hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
