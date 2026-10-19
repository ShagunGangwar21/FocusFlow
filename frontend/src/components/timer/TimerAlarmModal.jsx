import React, { useState, useEffect, useRef } from 'react';
import {
  IconBell,
  IconVolume2,
  IconVolumeX,
  IconCoffee,
  IconTrophy,
  IconCheck,
  IconX,
  IconPlay,
} from '../common/Icons';

import { validateDurationInput } from '../dashboard/QuickAddTaskModal';

/**
 * Validates break duration inputs (minutes and seconds).
 * Requirements:
 * - Allow non-negative whole numbers for minutes (>= 0).
 * - Allow non-negative whole numbers for seconds (0 to 59).
 * - Combined duration (totalSeconds = minutes * 60 + seconds) must be > 0.
 * - Negative values, decimals, characters, seconds >= 60, and 0+0 are rejected.
 */
export function validateBreakDurationInputs(minutesVal, secondsVal) {
  const minStr = String(minutesVal ?? '').trim();
  const secStr = String(secondsVal ?? '').trim();

  if (minStr === '' && secStr === '') {
    return {
      isValid: false,
      error: 'Please enter minutes or seconds.',
      totalSeconds: 0,
      minutes: 0,
      seconds: 0,
    };
  }

  // Validate minutes field if provided
  if (minStr !== '') {
    if (minStr.includes('.') || minStr.includes(',')) {
      return { isValid: false, error: 'Minutes must be a whole number.', totalSeconds: 0, minutes: 0, seconds: 0 };
    }
    if (!/^-?\d+$/.test(minStr)) {
      return { isValid: false, error: 'Minutes must be a valid whole number.', totalSeconds: 0, minutes: 0, seconds: 0 };
    }
    const m = parseInt(minStr, 10);
    if (m < 0) {
      return { isValid: false, error: 'Minutes cannot be negative.', totalSeconds: 0, minutes: 0, seconds: 0 };
    }
  }

  // Validate seconds field if provided
  if (secStr !== '') {
    if (secStr.includes('.') || secStr.includes(',')) {
      return { isValid: false, error: 'Seconds must be a whole number.', totalSeconds: 0, minutes: 0, seconds: 0 };
    }
    if (!/^-?\d+$/.test(secStr)) {
      return { isValid: false, error: 'Seconds must be a valid whole number.', totalSeconds: 0, minutes: 0, seconds: 0 };
    }
    const s = parseInt(secStr, 10);
    if (s < 0) {
      return { isValid: false, error: 'Seconds cannot be negative.', totalSeconds: 0, minutes: 0, seconds: 0 };
    }
    if (s >= 60) {
      return { isValid: false, error: 'Seconds must be between 0 and 59.', totalSeconds: 0, minutes: 0, seconds: 0 };
    }
  }

  const mins = minStr === '' ? 0 : parseInt(minStr, 10);
  const secs = secStr === '' ? 0 : parseInt(secStr, 10);
  const total = (mins * 60) + secs;

  if (total <= 0) {
    return {
      isValid: false,
      error: 'Break duration must be greater than 0 seconds.',
      totalSeconds: 0,
      minutes: mins,
      seconds: secs,
    };
  }

  return {
    isValid: true,
    error: null,
    totalSeconds: total,
    minutes: mins,
    seconds: secs,
  };
}

export function formatCombinedBreakDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0 sec';
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins > 0 && secs > 0) {
    return `${mins} min ${secs} sec`;
  }
  if (mins > 0) {
    return `${mins} min`;
  }
  return `${secs} sec`;
}

/**
 * frontend/src/components/timer/TimerAlarmModal.jsx
 *
 * Visual completion notification and alarm dialog for FocusFlow.
 * Displays when a focus session or break timer reaches zero, or during
 * alarm testing. Provides explicit controls to stop audio independently
 * of dismissing the dialog, custom break duration selection for the upcoming break,
 * and one-click actions to transition between focus and break periods.
 */
export default function TimerAlarmModal({
  isOpen = false,
  alarmType = 'focus', // 'focus' | 'break' | 'test'
  taskTitle = 'Focus Session',
  durationFormatted = '25 minutes',
  ringtoneName = 'Gentle Chime',
  isPlayingSound = false,
  isMuted = false,
  defaultBreakDurationMinutes = 5,
  onStopSound,
  onDismiss,
  onStartBreak,
  onResumeFocus,
}) {
  const dismissBtnRef = useRef(null);
  const wasOpenRef = useRef(false);

  // Raw string states for inputs so users can backspace, clear, select, and edit digits smoothly
  const [breakMinutes, setBreakMinutes] = useState(String(defaultBreakDurationMinutes || 5));
  const [breakSeconds, setBreakSeconds] = useState('0');

  // Only sync from defaultBreakDurationMinutes when the modal first transitions from closed to open
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const initMins = typeof defaultBreakDurationMinutes === 'number' && defaultBreakDurationMinutes > 0
        ? defaultBreakDurationMinutes
        : 5;
      setBreakMinutes(String(initMins));
      setBreakSeconds('0');
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, defaultBreakDurationMinutes]);

  // Keyboard shortcut listener (Escape closes)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    if (dismissBtnRef.current) {
      dismissBtnRef.current.focus();
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onDismiss]);

  const validationResult = validateBreakDurationInputs(breakMinutes, breakSeconds);

  const handleMinutesChange = (e) => {
    setBreakMinutes(e.target.value);
  };

  const handleSecondsChange = (e) => {
    setBreakSeconds(e.target.value);
  };

  const handlePresetClick = (preset) => {
    setBreakMinutes(String(preset));
    setBreakSeconds('0');
  };

  const activePreset =
    validationResult.isValid &&
    validationResult.seconds === 0 &&
    !String(breakMinutes).includes('.') &&
    !String(breakSeconds).includes('.')
      ? [5, 10, 15].find((p) => p === validationResult.minutes)
      : null;

  const handleTakeBreakClick = () => {
    const result = validateBreakDurationInputs(breakMinutes, breakSeconds);
    if (!result.isValid) {
      return;
    }
    onStopSound();
    onStartBreak({
      totalSeconds: result.totalSeconds,
      minutes: result.minutes,
      seconds: result.seconds,
    });
  };

  if (!isOpen) return null;

  const isFocus = alarmType === 'focus';
  const isBreak = alarmType === 'break';
  const isTest = alarmType === 'test';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alarm-modal-title"
    >
      <div className="relative w-full max-w-md p-6 rounded-2xl bg-[var(--bg-card)] border-2 border-[var(--accent)] shadow-2xl text-[var(--text-main)] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Glow ambient background effect */}
        <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-[var(--accent)]/15 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full bg-[var(--accent)]/10 blur-2xl pointer-events-none" />

        {/* Header Icon & Title */}
        <div className="flex items-start gap-4 mb-5">
          <div
            className={`p-3.5 rounded-2xl shrink-0 flex items-center justify-center shadow-md ${
              isFocus
                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                : isBreak
                ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                : 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30'
            }`}
          >
            {isFocus ? (
              <IconTrophy className="w-8 h-8" />
            ) : isBreak ? (
              <IconCoffee className="w-8 h-8" />
            ) : (
              <IconBell className="w-8 h-8" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                  isFocus
                    ? 'bg-amber-500/20 text-amber-400'
                    : isBreak
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-[var(--accent)]/20 text-[var(--accent)]'
                }`}
              >
                {isFocus ? 'Focus Complete' : isBreak ? 'Break Finished' : 'Alarm Test Preview'}
              </span>
            </div>

            <h2
              id="alarm-modal-title"
              className="text-lg sm:text-xl font-bold tracking-tight text-[var(--text-main)] leading-snug"
            >
              {isFocus
                ? 'Focus Session Completed!'
                : isBreak
                ? 'Break Time Over!'
                : 'Test Alarm Preview'}
            </h2>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] mb-5 space-y-2">
          {isFocus && (
            <>
              <p className="text-xs text-[var(--text-muted)]">
                Great work! You reached your focus goal for:
              </p>
              <p className="text-sm font-semibold text-[var(--text-main)] truncate">
                {taskTitle}
              </p>
              <div className="text-[11px] text-[var(--text-dim)] font-mono">
                Duration logged: <span className="text-[var(--accent)] font-bold">{durationFormatted}</span>
              </div>
            </>
          )}

          {isBreak && (
            <>
              <p className="text-xs text-[var(--text-muted)]">
                Your recovery break has ended.
              </p>
              <p className="text-sm font-semibold text-[var(--text-main)]">
                Ready to dive back into deep focus?
              </p>
              <div className="text-[11px] text-[var(--text-dim)] font-mono">
                Task waiting: <span className="text-[var(--accent)] font-semibold truncate">{taskTitle}</span>
              </div>
            </>
          )}

          {isTest && (
            <>
              <p className="text-xs text-[var(--text-muted)]">
                This is a test of the FocusFlow sound and alarm system.
              </p>
              <p className="text-sm font-semibold text-[var(--text-main)]">
                Selected tone: <span className="text-[var(--accent)]">{ringtoneName}</span>
              </p>
              <div className="text-[11px] text-[var(--text-dim)]">
                Your focus sessions and database history are unaffected.
              </div>
            </>
          )}
        </div>

        {/* Break Duration Selector (when focus session completes) */}
        {isFocus && onStartBreak && (
          <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] mb-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--text-main)] flex items-center gap-1.5">
                <IconCoffee className="w-3.5 h-3.5 text-emerald-400" />
                Break Duration
              </label>
              <span className="text-[10px] text-[var(--text-dim)]">
                For this break only (preserves saved default)
              </span>
            </div>

            {/* Minutes & Seconds Dual Input Fields */}
            <div className="grid grid-cols-2 gap-3">
              {/* Minutes Field */}
              <div>
                <label
                  htmlFor="alarm-break-minutes"
                  className="block text-[11px] font-medium text-[var(--text-muted)] mb-1"
                >
                  Minutes
                </label>
                <div className="relative flex items-center">
                  <input
                    id="alarm-break-minutes"
                    type="number"
                    min="0"
                    step="1"
                    value={breakMinutes}
                    onChange={handleMinutesChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && validationResult.isValid) {
                        handleTakeBreakClick();
                      }
                    }}
                    placeholder="0"
                    className={`w-full px-3 py-1.5 pr-12 text-xs rounded-lg bg-[var(--bg-card)] border text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-none transition-colors ${
                      validationResult.error && (breakMinutes === '' || parseInt(breakMinutes, 10) < 0 || String(breakMinutes).includes('.'))
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-[var(--border-subtle)] focus:border-emerald-500'
                    }`}
                  />
                  <span className="absolute right-3 text-xs font-medium text-[var(--text-muted)] pointer-events-none select-none">
                    min
                  </span>
                </div>
              </div>

              {/* Seconds Field */}
              <div>
                <label
                  htmlFor="alarm-break-seconds"
                  className="block text-[11px] font-medium text-[var(--text-muted)] mb-1"
                >
                  Seconds (0–59)
                </label>
                <div className="relative flex items-center">
                  <input
                    id="alarm-break-seconds"
                    type="number"
                    min="0"
                    max="59"
                    step="1"
                    value={breakSeconds}
                    onChange={handleSecondsChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && validationResult.isValid) {
                        handleTakeBreakClick();
                      }
                    }}
                    placeholder="0"
                    className={`w-full px-3 py-1.5 pr-12 text-xs rounded-lg bg-[var(--bg-card)] border text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-none transition-colors ${
                      validationResult.error && (breakSeconds === '' || parseInt(breakSeconds, 10) < 0 || parseInt(breakSeconds, 10) >= 60 || String(breakSeconds).includes('.'))
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-[var(--border-subtle)] focus:border-emerald-500'
                    }`}
                  />
                  <span className="absolute right-3 text-xs font-medium text-[var(--text-muted)] pointer-events-none select-none">
                    sec
                  </span>
                </div>
              </div>
            </div>

            {/* Combined Duration Display & Error Messaging */}
            <div className="flex items-center justify-between text-xs pt-0.5">
              <span className="text-[11px] text-[var(--text-dim)]">
                Combined duration:
              </span>
              <span
                id="alarm-break-combined-display"
                className={`text-xs font-mono font-semibold px-2 py-0.5 rounded transition-colors ${
                  validationResult.isValid
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                    : 'bg-red-500/10 text-red-400 border border-red-500/25'
                }`}
              >
                {validationResult.isValid
                  ? formatCombinedBreakDuration(validationResult.totalSeconds)
                  : 'Invalid duration'}
              </span>
            </div>

            {validationResult.error && (
              <p
                id="alarm-break-validation-error"
                className="text-[11px] text-red-500 dark:text-red-400 font-medium"
              >
                {validationResult.error}
              </p>
            )}

            {/* Quick-select duration options */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-[10px] text-[var(--text-dim)] mr-1">Presets:</span>
              {[5, 10, 15].map((preset) => {
                const isHighlighted = activePreset === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handlePresetClick(preset)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-all cursor-pointer ${
                      isHighlighted
                        ? 'bg-emerald-600 text-white border-emerald-600 font-semibold shadow-xs ring-1 ring-emerald-500'
                        : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-main)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    {preset} min
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Audio Status Banner & Stop Sound Control */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] mb-6 text-xs">
          <div className="flex items-center gap-2.5 overflow-hidden">
            {isPlayingSound ? (
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
              </span>
            ) : (
              <IconVolumeX className="w-4 h-4 text-[var(--text-dim)] shrink-0" />
            )}

            <div className="truncate">
              {isPlayingSound ? (
                <span className="font-medium text-amber-400 flex items-center gap-1.5 truncate">
                  <IconVolume2 className="w-3.5 h-3.5 shrink-0" />
                  Playing &ldquo;{ringtoneName}&rdquo;
                </span>
              ) : isMuted ? (
                <span className="text-[var(--text-dim)]">Sound disabled in preferences</span>
              ) : (
                <span className="text-[var(--text-dim)]">Audio stopped</span>
              )}
            </div>
          </div>

          {isPlayingSound && (
            <button
              type="button"
              onClick={onStopSound}
              className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-semibold text-xs border border-amber-500/30 transition-colors cursor-pointer shrink-0"
              title="Stop alarm audio playback without closing this message"
            >
              Stop Sound
            </button>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
          {/* Secondary / Dismiss */}
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            title="Stop audio and dismiss this notification"
          >
            <IconX className="w-3.5 h-3.5" />
            Dismiss
          </button>

          {/* Contextual Primary Action */}
          {isFocus && onStartBreak && (
            <button
              ref={dismissBtnRef}
              type="button"
              id="alarm-take-break-btn"
              onClick={handleTakeBreakClick}
              disabled={!validationResult.isValid}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95"
            >
              <IconCoffee className="w-4 h-4" />
              {validationResult.isValid
                ? `Take a ${formatCombinedBreakDuration(validationResult.totalSeconds)} Break`
                : 'Take a Break'}
            </button>
          )}

          {isBreak && onResumeFocus && (
            <button
              ref={dismissBtnRef}
              type="button"
              onClick={() => {
                onStopSound();
                onResumeFocus();
              }}
              className="px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-[var(--accent)]/20 active:scale-95"
            >
              <IconPlay className="w-4 h-4" />
              Resume Focus
            </button>
          )}

          {isTest && (
            <button
              ref={dismissBtnRef}
              type="button"
              onClick={onDismiss}
              className="px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-95"
            >
              <IconCheck className="w-4 h-4" />
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
