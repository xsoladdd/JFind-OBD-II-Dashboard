/*
 * Alert sound and vibration. Browsers keep audio locked until the user interacts with the page, so the shell
 * calls armAudio() on the first tap or key press (e.g. the Connect tap). Everything is feature-detected.
 */
let ctx: AudioContext | null = null;

export function armAudio() {
  const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

/** Two short tones from an oscillator (no audio files). Silent if audio was never armed. */
export function beep() {
  if (!ctx || ctx.state !== "running") return;
  for (const start of [0, 0.25]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + 0.2);
  }
}

/** Vibrates where supported (Android Chrome); iOS has no Vibration API. */
export function buzz() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate([200, 100, 200]);
}
