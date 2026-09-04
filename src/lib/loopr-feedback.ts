/**
 * Small presentation-layer helpers for sound + haptic feedback.
 * Both are opt-out and stored per device.
 */

const SOUND_KEY = "loopr.sound";
const HAPTICS_KEY = "loopr.haptics";

// localStorage-backed on/off flags, defaulting to on when unset.

function readFlag(key: string) {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(key) !== "off";
}

// Persists a flag and notifies listeners so UI toggles stay in sync.
function writeFlag(key: string, on: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, on ? "on" : "off");
  window.dispatchEvent(new CustomEvent("loopr:feedback"));
}

// Public getters/setters for the sound and haptics preferences.
export const isSoundOn = () => readFlag(SOUND_KEY);
export const setSoundOn = (on: boolean) => writeFlag(SOUND_KEY, on);
export const isHapticsOn = () => readFlag(HAPTICS_KEY);
export const setHapticsOn = (on: boolean) => writeFlag(HAPTICS_KEY, on);

/** Subscribes to sound/haptics preference changes; returns an unsubscribe fn. */
export function subscribeFeedback(fn: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("loopr:feedback", fn);
  return () => window.removeEventListener("loopr:feedback", fn);
}

// Lazily-created, shared AudioContext for playing chimes.
let ctx: AudioContext | null = null;

// Gets (creating/resuming as needed) the shared AudioContext, or null if unsupported.
function audioContext() {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// Schedules a single sine-wave tone with an attack/decay envelope.
function tone(at: number, freq: number, duration: number, gainPeak: number) {
  const audio = audioContext();
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(gainPeak, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

/** Two-note chime played when a ticket is called forward. */
export function playCallChime() {
  if (!isSoundOn()) return;
  const audio = audioContext();
  if (!audio) return;
  const now = audio.currentTime;
  tone(now, 880, 0.28, 0.18);
  tone(now + 0.16, 1318.5, 0.36, 0.16);
}

/** Softer blip for secondary actions (served, walk-in added). */
export function playSoftBlip() {
  if (!isSoundOn()) return;
  const audio = audioContext();
  if (!audio) return;
  tone(audio.currentTime, 660, 0.16, 0.1);
}

/** Triggers a vibration pattern if haptics are enabled and supported. */
export function vibrate(pattern: number | number[]) {
  if (!isHapticsOn()) return;
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* unsupported */
  }
}

// Predefined vibration patterns for common events.
export const HAPTIC_CALLED = [90, 60, 90, 60, 160];
export const HAPTIC_NEXT = [60, 50, 60];
export const HAPTIC_TAP = 18;
