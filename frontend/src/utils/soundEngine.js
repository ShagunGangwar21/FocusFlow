/**
 * frontend/src/utils/soundEngine.js
 *
 * Web Audio API-based sound synthesis engine for FocusFlow.
 * Provides original, royalty-free, pleasant synthesized ringtones
 * for focus completion, break completion, and previewing without
 * requiring external audio assets or network downloads.
 */

// Ringtone catalog definitions
export const RINGTONE_CATALOG = [
  {
    id: 'classic-bell',
    name: 'Classic Bell',
    description: 'Resonant brass bell strike with harmonic sustain',
    category: 'Bell',
  },
  {
    id: 'digital-beep',
    name: 'Digital Beep',
    description: 'Crisp two-tone modern electronic alert',
    category: 'Digital',
  },
  {
    id: 'gentle-chime',
    name: 'Gentle Chime',
    description: 'Peaceful ascending pentatonic wind chime',
    category: 'Chime',
  },
  {
    id: 'soft-notification',
    name: 'Soft Notification',
    description: 'Warm two-tone ambient notification bubble',
    category: 'Ambient',
  },
  {
    id: 'double-bell',
    name: 'Double Bell',
    description: 'Traditional two-stroke counter chime',
    category: 'Bell',
  },
  {
    id: 'piano-tone',
    name: 'Piano Tone',
    description: 'Acoustic major seventh harmonic chord',
    category: 'Acoustic',
  },
  {
    id: 'nature-tone',
    name: 'Nature Tone',
    description: 'Organic bamboo meditation bell with subtle vibrato',
    category: 'Nature',
  },
  {
    id: 'minimal-alert',
    name: 'Minimal Alert',
    description: 'Subtle rising pitch glide for unobtrusive focus',
    category: 'Minimal',
  },
];

let globalAudioCtx = null;
let currentActiveSources = [];
let alarmLoopTimer = null;
let activePreviewCallback = null;

/**
 * Lazily obtains or resumes the singleton AudioContext.
 */
export function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtxClass) return null;

  if (!globalAudioCtx) {
    globalAudioCtx = new AudioCtxClass();
  }

  if (globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume().catch(() => {});
  }

  return globalAudioCtx;
}

/**
 * Unlock audio context upon user interaction (click, keypress).
 */
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

// Auto-bind one-time user interaction unlock listener
if (typeof window !== 'undefined') {
  const unlockHandler = () => {
    unlockAudio();
    window.removeEventListener('click', unlockHandler);
    window.removeEventListener('keydown', unlockHandler);
    window.removeEventListener('touchstart', unlockHandler);
  };
  window.addEventListener('click', unlockHandler, { once: true });
  window.addEventListener('keydown', unlockHandler, { once: true });
  window.addEventListener('touchstart', unlockHandler, { once: true });
}

/**
 * Checks whether Web Audio API is supported by the current browser.
 */
export function isAudioSupported() {
  return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
}

/**
 * Maps a volume percentage (0 - 100) to a master gain multiplier (0 - 0.35)
 * to keep synthesized audio pleasant and avoid distortion or sudden loud bursts.
 */
function getScaledGain(volume) {
  const normalized = Math.max(0, Math.min(100, Number(volume) || 70)) / 100;
  return normalized * 0.35;
}

/**
 * Tracks an active audio node and its scheduled cleanup.
 */
function registerActiveNode(node) {
  currentActiveSources.push(node);
}

/**
 * Immediately stops all active sounds, previews, and alarm intervals.
 */
export function stopAllSounds() {
  if (alarmLoopTimer) {
    clearInterval(alarmLoopTimer);
    alarmLoopTimer = null;
  }

  currentActiveSources.forEach((item) => {
    try {
      if (item && typeof item.stop === 'function') {
        item.stop();
      }
      if (item && typeof item.disconnect === 'function') {
        item.disconnect();
      }
    } catch {
      // Ignored if node already stopped/garbage-collected
    }
  });
  currentActiveSources = [];

  if (activePreviewCallback) {
    const cb = activePreviewCallback;
    activePreviewCallback = null;
    cb();
  }
}

/**
 * Synthesizes a single play of one of the 8 ringtones.
 * Returns the estimated duration in milliseconds.
 */
function synthesizeTone(ctx, ringtoneId, masterGainVal, startTime = null) {
  const t0 = startTime !== null ? startTime : ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(masterGainVal, t0);
  masterGain.connect(ctx.destination);
  registerActiveNode(masterGain);

  let durationMs = 1500;

  switch (ringtoneId) {
    case 'classic-bell': {
      // 587.33 Hz (D5) with overtones 1174.66 Hz and 1760 Hz
      const freqs = [587.33, 1174.66, 1760.0];
      const gains = [0.8, 0.4, 0.15];
      durationMs = 1800;

      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0);

        g.gain.setValueAtTime(gains[i], t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);

        osc.connect(g);
        g.connect(masterGain);
        osc.start(t0);
        osc.stop(t0 + 1.85);
        registerActiveNode(osc);
      });
      break;
    }

    case 'digital-beep': {
      // Crisp 3-pulse electronic beep (A5 880Hz, C6 1046.5Hz)
      const pulses = [
        { time: 0, freq: 880, dur: 0.08 },
        { time: 0.12, freq: 880, dur: 0.08 },
        { time: 0.24, freq: 1046.5, dur: 0.14 },
      ];
      durationMs = 600;

      pulses.forEach(({ time, freq, dur }) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t0 + time);

        // Softer square wave with low-pass filter
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2200, t0 + time);

        g.gain.setValueAtTime(0.4, t0 + time);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + time + dur);

        osc.connect(filter);
        filter.connect(g);
        g.connect(masterGain);

        osc.start(t0 + time);
        osc.stop(t0 + time + dur + 0.02);
        registerActiveNode(osc);
      });
      break;
    }

    case 'gentle-chime': {
      // Ascending pentatonic chime (C5 523.25, E5 659.25, G5 783.99, B5 987.77)
      const notes = [523.25, 659.25, 783.99, 987.77];
      durationMs = 2000;

      notes.forEach((freq, i) => {
        const offset = i * 0.18;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0 + offset);

        g.gain.setValueAtTime(0.0001, t0 + offset);
        g.gain.linearRampToValueAtTime(0.5, t0 + offset + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 1.2);

        osc.connect(g);
        g.connect(masterGain);

        osc.start(t0 + offset);
        osc.stop(t0 + offset + 1.25);
        registerActiveNode(osc);
      });
      break;
    }

    case 'soft-notification': {
      // Warm modern ambient notification: F5 (698.46 Hz) -> C6 (1046.5 Hz)
      const notes = [
        { freq: 698.46, offset: 0, dur: 0.35, gain: 0.5 },
        { freq: 1046.5, offset: 0.12, dur: 0.65, gain: 0.6 },
      ];
      durationMs = 900;

      notes.forEach(({ freq, offset, dur, gain }) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t0 + offset);

        g.gain.setValueAtTime(0.0001, t0 + offset);
        g.gain.linearRampToValueAtTime(gain, t0 + offset + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + dur);

        osc.connect(g);
        g.connect(masterGain);

        osc.start(t0 + offset);
        osc.stop(t0 + offset + dur + 0.05);
        registerActiveNode(osc);
      });
      break;
    }

    case 'double-bell': {
      // Two-strike traditional counter bell (E5 659.25 Hz -> A5 880 Hz)
      const strikes = [
        { freqs: [659.25, 1318.5], offset: 0, decay: 0.5, gain: 0.6 },
        { freqs: [880.0, 1760.0], offset: 0.22, decay: 1.2, gain: 0.7 },
      ];
      durationMs = 1600;

      strikes.forEach(({ freqs, offset, decay, gain }) => {
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t0 + offset);

          const strikeGain = idx === 0 ? gain : gain * 0.4;
          g.gain.setValueAtTime(strikeGain, t0 + offset);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + decay);

          osc.connect(g);
          g.connect(masterGain);

          osc.start(t0 + offset);
          osc.stop(t0 + offset + decay + 0.05);
          registerActiveNode(osc);
        });
      });
      break;
    }

    case 'piano-tone': {
      // Acoustic major 7th chord: C4 (261.63), G4 (392), B4 (493.88), E5 (659.25)
      const chord = [261.63, 392.0, 493.88, 659.25];
      durationMs = 2100;

      chord.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = i % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, t0);

        g.gain.setValueAtTime(0.001, t0);
        g.gain.linearRampToValueAtTime(0.4, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.9);

        osc.connect(g);
        g.connect(masterGain);

        osc.start(t0);
        osc.stop(t0 + 2.0);
        registerActiveNode(osc);
      });
      break;
    }

    case 'nature-tone': {
      // Bamboo chime: F#4 (369.99 Hz) and C#5 (554.37 Hz) with subtle vibrato
      const freqs = [369.99, 554.37, 739.98];
      durationMs = 2200;

      // Vibrato LFO
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(4.8, t0); // 4.8 Hz gentle vibrato
      lfoGain.gain.setValueAtTime(3.5, t0); // 3.5 Hz pitch variance
      lfo.start(t0);
      lfo.stop(t0 + 2.2);
      registerActiveNode(lfo);

      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        lfo.connect(osc.frequency);

        const level = idx === 0 ? 0.6 : idx === 1 ? 0.4 : 0.2;
        g.gain.setValueAtTime(0.001, t0);
        g.gain.linearRampToValueAtTime(level, t0 + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.1);

        osc.connect(g);
        g.connect(masterGain);

        osc.start(t0);
        osc.stop(t0 + 2.15);
        registerActiveNode(osc);
      });
      break;
    }

    case 'minimal-alert':
    default: {
      // Smooth pitch glide 440 Hz -> 880 Hz over 0.12s
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t0);
      osc.frequency.exponentialRampToValueAtTime(880, t0 + 0.12);

      g.gain.setValueAtTime(0.001, t0);
      g.gain.linearRampToValueAtTime(0.5, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);

      osc.connect(g);
      g.connect(masterGain);

      osc.start(t0);
      osc.stop(t0 + 0.5);
      registerActiveNode(osc);
      durationMs = 550;
      break;
    }
  }

  return durationMs;
}

/**
 * Preview a ringtone once. Stops any other preview or alarm immediately.
 * Calls onEnded callback when the preview playback completes.
 */
export function previewRingtone(ringtoneId, volume = 70, onEnded = null) {
  stopAllSounds();

  const ctx = getAudioContext();
  if (!ctx) {
    if (onEnded) onEnded();
    return;
  }

  activePreviewCallback = onEnded;
  const masterGainVal = getScaledGain(volume);
  const durationMs = synthesizeTone(ctx, ringtoneId, masterGainVal);

  setTimeout(() => {
    if (activePreviewCallback === onEnded) {
      activePreviewCallback = null;
      if (onEnded) onEnded();
    }
  }, durationMs + 80);
}

/**
 * Plays an alarm sound loop when a focus session or break timer completes.
 * Repeats at safe intervals until stopAllSounds() is called or maxDurationMs elapses.
 */
export function playAlarmSound(
  ringtoneId,
  volume = 70,
  { maxDurationMs = 30000, loopIntervalMs = 2800 } = {}
) {
  stopAllSounds();

  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };

  const masterGainVal = getScaledGain(volume);
  if (masterGainVal <= 0) return { stop: () => {} };

  // Play immediately
  synthesizeTone(ctx, ringtoneId, masterGainVal);

  // Setup loop
  const startTime = Date.now();
  alarmLoopTimer = setInterval(() => {
    if (Date.now() - startTime >= maxDurationMs) {
      stopAllSounds();
      return;
    }
    synthesizeTone(ctx, ringtoneId, masterGainVal);
  }, loopIntervalMs);

  return {
    stop: () => stopAllSounds(),
  };
}

/**
 * Helper to get human-readable ringtone name from id.
 */
export function getRingtoneName(id) {
  const found = RINGTONE_CATALOG.find((r) => r.id === id);
  return found ? found.name : 'Gentle Chime';
}
