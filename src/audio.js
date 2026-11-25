// Procedural sound: everything is synthesised with WebAudio, so there are no audio files to load.
// Audio starts on the first tap (browsers block it before a user gesture).

let ctx = null, master = null, sfxBus = null, ambBus = null, noiseBuf = null;
let fallsGain = null, started = false, muted = false;

function makeNoise() {
  const len = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export function unlockAudio() {
  if (started) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  started = true;
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = 0.5; ambBus.connect(master);
  noiseBuf = makeNoise();
  startAmbience();
}

export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; }
export function isMuted() { return muted; }

// ---------------------------------------------------------------- building blocks
function env(g, t, a, peak, d, sustain = 0) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
}
function noise(t, dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, peak = 0.5, a = 0.005, out = sfxBus } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g, t, a, peak, dur);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(t, dur, { type = 'sine', f0 = 440, f1 = f0, peak = 0.3, a = 0.005, out = sfxBus, detune = 0 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g, t, a, peak, dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}
const ready = () => started && ctx.state === 'running';
const now = () => ctx.currentTime;

// ---------------------------------------------------------------- sound effects
export const sfx = {
  whoosh(big = false) {
    if (!ready()) return; const t = now();
    noise(t, big ? 0.32 : 0.22, { f0: big ? 500 : 700, f1: big ? 2600 : 3200, q: 1.2, peak: big ? 0.55 : 0.38, a: 0.04 });
  },
  hit(material = 'wood', heavy = false) {
    if (!ready()) return; const t = now();
    const k = heavy ? 1.4 : 1;
    if (material === 'wood') {
      tone(t, 0.12, { type: 'triangle', f0: 220, f1: 110, peak: 0.5 * k });
      noise(t, 0.08, { f0: 1800, f1: 600, q: 2, peak: 0.5 * k });
    } else if (material === 'straw') {
      noise(t, 0.16, { type: 'highpass', f0: 2500, f1: 1200, q: 0.7, peak: 0.45 * k });
      tone(t, 0.09, { type: 'sine', f0: 160, f1: 70, peak: 0.4 * k });
    } else { // stone
      tone(t, 0.25, { type: 'square', f0: 120, f1: 50, peak: 0.25 * k });
      noise(t, 0.2, { type: 'lowpass', f0: 1400, f1: 200, q: 1, peak: 0.6 * k });
      tone(t, 0.05, { type: 'triangle', f0: 1900, f1: 1400, peak: 0.15 * k });
    }
  },
  cast(kind) {
    if (!ready()) return; const t = now();
    if (kind === 'fire') {
      noise(t, 0.5, { type: 'lowpass', f0: 600, f1: 2400, q: 0.8, peak: 0.5, a: 0.06 });
      tone(t, 0.4, { type: 'sawtooth', f0: 90, f1: 180, peak: 0.12, a: 0.05 });
    } else if (kind === 'bolt') {
      for (let i = 0; i < 5; i++) tone(t + i * 0.03, 0.08, { type: 'square', f0: 2400 - i * 300, f1: 400, peak: 0.1 });
      noise(t, 0.3, { type: 'highpass', f0: 3000, f1: 5000, q: 0.5, peak: 0.35 });
    } else if (kind === 'vortex') {
      noise(t, 0.9, { f0: 300, f1: 1800, q: 4, peak: 0.45, a: 0.15 });
      tone(t, 0.9, { type: 'sine', f0: 220, f1: 660, peak: 0.12, a: 0.2 });
    } else if (kind === 'slash') {
      noise(t, 0.35, { f0: 400, f1: 3000, q: 1.5, peak: 0.55, a: 0.03 });
      tone(t, 0.3, { type: 'sawtooth', f0: 300, f1: 900, peak: 0.08, a: 0.03 });
    } else if (kind === 'potion') {
      for (let i = 0; i < 4; i++) tone(t + i * 0.06, 0.18, { type: 'sine', f0: 500 + i * 160, f1: 700 + i * 200, peak: 0.15 });
    }
  },
  dodge() { if (!ready()) return; const t = now(); noise(t, 0.25, { type: 'lowpass', f0: 1800, f1: 300, q: 0.7, peak: 0.35, a: 0.02 }); },
  windup() { if (!ready()) return; const t = now(); tone(t, 0.6, { type: 'sawtooth', f0: 110, f1: 240, peak: 0.12, a: 0.2 }); },
  chime() {
    if (!ready()) return; const t = now();
    [784, 988, 1319].forEach((f, i) => tone(t + i * 0.09, 0.6, { type: 'sine', f0: f, peak: 0.18 }));
  },
  pickup() {
    if (!ready()) return; const t = now();
    [1047, 1568].forEach((f, i) => tone(t + i * 0.07, 0.35, { type: 'triangle', f0: f, peak: 0.2 }));
  },
  xp() { if (!ready()) return; const t = now(); tone(t, 0.25, { type: 'sine', f0: 660, f1: 1320, peak: 0.12 }); },
  error() { if (!ready()) return; const t = now(); tone(t, 0.15, { type: 'square', f0: 180, f1: 150, peak: 0.08 }); },
  ui() { if (!ready()) return; const t = now(); tone(t, 0.06, { type: 'triangle', f0: 900, f1: 700, peak: 0.1 }); },
  fanfare() {
    if (!ready()) return; const t = now();
    const notes = [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.4], [988, 0.62], [1047, 0.75]];
    for (const [f, dt] of notes) { tone(t + dt, 0.5, { type: 'triangle', f0: f, peak: 0.2 }); tone(t + dt, 0.5, { type: 'sine', f0: f * 2, peak: 0.05 }); }
    noise(t + 0.4, 1.2, { type: 'highpass', f0: 6000, f1: 9000, q: 0.5, peak: 0.08, a: 0.05 });
  },
};

// ---------------------------------------------------------------- ambience: waterfall rush + birdsong
function startAmbience() {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  fallsGain = ctx.createGain(); fallsGain.gain.value = 0.05;
  s.connect(f).connect(fallsGain).connect(ambBus); s.start();
  const wind = ctx.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true; wind.playbackRate.value = 0.5;
  const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 400; wf.Q.value = 0.6;
  const wg = ctx.createGain(); wg.gain.value = 0.04;
  wind.connect(wf).connect(wg).connect(ambBus); wind.start();
  const bird = () => {
    if (ready()) {
      const t = now(), base = 2200 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) tone(t + i * 0.11, 0.09, { type: 'sine', f0: base * (1 + (i % 2) * 0.15), f1: base * 1.25, peak: 0.035, out: ambBus });
    }
    setTimeout(bird, 1500 + Math.random() * 4500);
  };
  setTimeout(bird, 1200);
}
/** Louder waterfall when the hero is near it. */
export function setFallsDistance(d) {
  if (!fallsGain) return;
  fallsGain.gain.setTargetAtTime(0.03 + 0.35 * Math.max(0, 1 - d / 30), ctx.currentTime, 0.3);
}
