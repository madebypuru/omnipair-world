// The sound: a slow generative score, the coast's ambience and the ride's effects, all made here with WebAudio, no
// files. Everything is in one key, D: the score on D lydian, every tune and chime on D major pentatonic, so whatever
// sounds at once agrees. Nothing starts before the first gesture (the title's Step in calls start()).
//
// buildEngine(ac) makes the whole graph on any BaseAudioContext, so an OfflineAudioContext renders the same mix for
// checks (lab.audio.render). createAudio(ctx) is the live side: settings, the speaker button, L, pausing, and the
// ride's events and state turned into sound.
import { SOUND, SOUND_KEY, loadSettings } from './options.js';
import { slot } from './hud.js';

const D4 = 293.66;
const hz = (semi) => D4 * 2 ** (semi / 12);
const PENTA = [0, 2, 4, 7, 9]; // D E F# A B
/** Pentatonic step n (0 = D4) in semitones from D4. */
const step = (n) => PENTA[((n % 5) + 5) % 5] + 12 * Math.floor(n / 5);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// The score's chords in semitones from D4 (all on D lydian), and where each may go next.
const CHORDS = [
  { notes: [-12, -5, 2, 4, 9], root: -24, next: [1, 2, 4] }, // D add9
  { notes: [-12, -3, 2, 6, 9], root: -24, next: [0, 2, 3] }, // E over D: the lydian colour
  { notes: [-15, -8, -5, 0, 4], root: -27, next: [0, 3, 4] }, // B minor 7
  { notes: [-18, -5, -1, 4, 7], root: -30, next: [2, 4, 0] }, // F# minor 7
  { notes: [-17, -10, -3, -1, 4], root: -29, next: [0, 1, 2] }, // A add9
];

/** One second of noise in a buffer, white or a soft brown. */
function noiseBuffer(ac, brown = false) {
  const b = ac.createBuffer(2, ac.sampleRate * 2, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
  }
  return b;
}

/** A hall made of decaying noise: early density, a long darkening tail. */
function impulse(ac, seconds) {
  const n = Math.floor(ac.sampleRate * seconds);
  const b = ac.createBuffer(2, n, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const k = 0.15 + 0.8 * t; // the tail loses its top as it goes
      lp += k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * (1 - t) ** 2.4 * (i < ac.sampleRate * 0.012 ? i / (ac.sampleRate * 0.012) : 1);
    }
  }
  return b;
}

export function buildEngine(ac) {
  const node = (n, to) => { if (to) n.connect(to); return n; };
  const gain = (v, to) => { const g = ac.createGain(); g.gain.value = v; return node(g, to); };
  const filter = (type, f, q, to) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return node(b, to); };
  const pan = (p, to) => { const s = ac.createStereoPanner(); s.pan.value = p; return node(s, to); };

  // master: a soft limiter keeps a pile of chimes under clipping
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.25;
  limiter.connect(ac.destination);
  // nothing under 35 Hz: the noise beds' rumble would only eat headroom
  const master = gain(1, filter('highpass', 35, 0.7, limiter));
  const hall = impulse(ac, 4.5);
  /** A bus: dry and wet inputs, one volume. */
  const bus = (to) => {
    const vol = gain(1, to), dry = gain(1, vol), wet = gain(1);
    const conv = ac.createConvolver(); conv.buffer = hall; wet.connect(conv); conv.connect(vol);
    return { vol, dry, wet };
  };
  const duck = gain(1, master);
  const music = bus(duck), fx = bus(master);
  const white = noiseBuffer(ac), brown = noiseBuffer(ac, true);
  const loopNoise = (buf, to) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); s.connect(to); s.start(); return s; };

  // the score's echo: a dotted beat at 76 a minute, darkening each time round
  const echo = ac.createDelay(2); echo.delayTime.value = 0.592;
  const echoBack = gain(0.38), echoTone = filter('lowpass', 2200, 0.5);
  echo.connect(echoTone); echoTone.connect(echoBack); echoBack.connect(echo); echoTone.connect(music.wet); echoTone.connect(gain(0.5, music.dry));
  const echoIn = gain(1, echo);
  // how bright the pads are: every pad's filter listens to this
  const bright = ac.createConstantSource(); bright.offset.value = 0; bright.start();

  let made = 0; // nodes made by voices, for checks
  const count = (n) => { made += n; };
  const send = (src, dry, wet, b = fx) => { src.connect(gain(dry, b.dry)); if (wet) src.connect(gain(wet, b.wet)); };

  // --- voices ---
  /** A bell: a sine and its inharmonic partner, a quick strike and a long ring. */
  function bell(t, f, { level = 0.12, decay = 1.6, p = 0, wet = 0.5, b = fx } = {}) {
    const out = pan(p), g = gain(0, out);
    const a = ac.createOscillator(), c = ac.createOscillator();
    a.frequency.value = f; c.frequency.value = f * 2.76; a.type = c.type = 'sine';
    const cg = gain(0.18, g); a.connect(g); c.connect(cg);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    cg.gain.setValueAtTime(0.18, t); cg.gain.exponentialRampToValueAtTime(0.001, t + decay * 0.35);
    a.start(t); c.start(t); a.stop(t + decay + 0.05); c.stop(t + decay + 0.05);
    send(out, 1, wet, b);
    count(6);
  }
  /** A pluck: triangle through a closing filter, into the score's echo. */
  function pluck(t, f, { level = 0.1, decay = 1.4, p = 0, wet = 0.6, echoes = 0.35 } = {}) {
    const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const s = ac.createOscillator(); s.type = 'sine'; s.frequency.value = f * 2;
    const pp = pan(p), lp = filter('lowpass', f * 6, 0.8), g = gain(0, pp);
    o.connect(lp); s.connect(gain(0.25, lp)); lp.connect(g);
    lp.frequency.setValueAtTime(f * 8, t); lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + decay * 0.6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.start(t); s.start(t); o.stop(t + decay + 0.05); s.stop(t + decay + 0.05);
    send(pp, 1, wet, music);
    if (echoes) pp.connect(gain(echoes, echoIn));
    count(9);
  }
  /** A pad note: two detuned saws under a slow filter, swelling in and dying away. */
  function pad(t, f, dur, { level = 0.03, p = 0 } = {}) {
    const lp = filter('lowpass', 520, 0.6);
    bright.connect(lp.frequency);
    const pp = pan(p), g = gain(0, pp);
    for (const cents of [-7, 6]) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents;
      o.connect(lp); o.start(t); o.stop(t + dur + 6);
    }
    lp.connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 3.2);
    g.gain.setValueAtTime(level, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 5.5);
    send(pp, 0.7, 0.9, music);
    count(7);
  }
  function bass(t, f, dur, level = 0.07) {
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = gain(0, music.dry); o.connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 4); g.gain.setValueAtTime(level, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 4);
    o.start(t); o.stop(t + dur + 4.1);
    count(2);
  }
  /** A burst of filtered noise: a whoosh, a splash, spray. */
  function hiss(t, { from = 600, to = 2000, q = 1, type = 'bandpass', level = 0.2, attack = 0.05, dur = 0.4, p = 0, wet = 0.2, buf = white } = {}) {
    const s = ac.createBufferSource(); s.buffer = buf; s.loopStart = 0;
    const pp = pan(p), f = filter(type, from, q), g = gain(0, pp);
    s.connect(f); f.connect(g);
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
    send(pp, 1, wet);
    count(5);
  }
  function thump(t, { f = 90, to = 42, level = 0.5, dur = 0.35 } = {}) {
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = gain(0, fx.dry); o.connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
    count(2);
  }

  // --- the effects, by name; each takes (t, data) ---
  let run = { at: -10, n: 0 };
  const FX = {
    token(t, d = {}) {
      // a quick run of pickups climbs the scale; A and B sound a fifth apart
      run = t - run.at < 0.7 ? { at: t, n: Math.min(run.n + 1, 9) } : { at: t, n: 0 };
      const semi = step(5 + run.n) + (d.kind === 'b' ? 7 : 0);
      bell(t, hz(semi), { level: 0.09, decay: 0.9, wet: 0.35, p: d.kind === 'b' ? 0.15 : -0.15 });
    },
    pair(t) { bell(t, hz(12), { level: 0.07, decay: 2.2, wet: 0.7 }); bell(t + 0.09, hz(19), { level: 0.06, decay: 2.4, wet: 0.7 }); },
    product(t, d = {}) {
      const M = { leverage: [0, 7, 12, 19], lending: [16, 12, 9, 7], trade: [7, 4, 9, 12] }[d.key] ?? [0, 7];
      M.forEach((s, i) => bell(t + i * 0.11, hz(s), { level: 0.08, decay: 1.6, wet: 0.6, p: (i % 2 ? 0.2 : -0.2) }));
      hiss(t, { from: 3000, to: 9000, level: 0.04, dur: 0.6, type: 'highpass', wet: 0.6 });
    },
    deposit(t, d = {}) {
      const n = Math.max(3, Math.min(16, 2 + (d.pairs ?? 1)));
      for (let i = 0; i < n; i++) bell(t + i * 0.075, hz(step(i)), { level: 0.075, decay: 1.2 + i * 0.05, wet: 0.5, p: -0.4 + 0.8 * i / n });
      bell(t + n * 0.075 + 0.05, hz(step(n) + 12), { level: 0.06, decay: 3, wet: 0.8 });
    },
    finish(t) {
      for (const s of [-12, -5, 2, 4, 9]) bell(t + 0.02 * (s + 12) / 3, hz(s + 12), { level: 0.05, decay: 4, wet: 0.9 });
      for (const s of [-12, -5, 4]) pad(t, hz(s), 2.5, { level: 0.02 });
    },
    leap(t) { hiss(t, { from: 350, to: 2400, q: 1.4, level: 0.16, attack: 0.08, dur: 0.45, wet: 0.15 }); },
    land(t, d = {}) {
      const hard = d.clean === false;
      thump(t, { f: hard ? 75 : 95, to: hard ? 32 : 48, level: hard ? 0.55 : 0.32, dur: hard ? 0.5 : 0.3 });
      hiss(t, { from: 1800, to: 400, type: 'lowpass', q: 0.6, level: hard ? 0.22 : 0.12, attack: 0.004, dur: hard ? 0.7 : 0.4, wet: 0.2 });
    },
    crash(t) { FX.land(t, { clean: false }); hiss(t + 0.05, { from: 900, to: 200, type: 'lowpass', level: 0.18, dur: 1.1, wet: 0.3, buf: brown }); },
    splash(t) {
      hiss(t, { from: 2600, to: 300, type: 'lowpass', q: 0.7, level: 0.3, attack: 0.01, dur: 1.2, wet: 0.4 });
      for (let i = 0; i < 5; i++) bell(t + 0.15 + i * 0.07 + Math.random() * 0.05, 500 + Math.random() * 600, { level: 0.02, decay: 0.12, wet: 0.2 });
    },
    click(t) { bell(t, hz(24), { level: 0.018, decay: 0.08, wet: 0 }); },
    gull(t, d = {}) {
      // two or three falling cries, far off
      const p = d.p ?? (Math.random() * 1.6 - 0.8), n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const at = t + i * (0.32 + Math.random() * 0.1), f0 = 1500 + Math.random() * 300;
        const o = ac.createOscillator(); o.type = 'triangle';
        o.frequency.setValueAtTime(f0 * 0.8, at); o.frequency.linearRampToValueAtTime(f0, at + 0.05); o.frequency.exponentialRampToValueAtTime(f0 * 0.62, at + 0.3);
        const bp = filter('bandpass', 1800, 2), g = gain(0); o.connect(bp); bp.connect(g);
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.022, at + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
        const pp = pan(p, null); g.connect(pp); send(pp, 0.6, 0.8);
        o.start(at); o.stop(at + 0.36);
        count(5);
      }
    },
  };

  // --- the ambience: steady layers whose levels the live side sets ---
  const layer = (buf, type, f, q, p = 0) => {
    const flt = filter(type, f, q), g = gain(0), pp = pan(p);
    loopNoise(buf, flt); flt.connect(g); g.connect(pp); send(pp, 1, 0.25);
    return { flt, g, pp };
  };
  const sea = layer(brown, 'lowpass', 700, 0.5);
  sea.flt.disconnect(); sea.flt.connect(filter('highpass', 90, 0.6, sea.g));
  // the sea's level runs through one more gain, the swell of each wave
  const swell = gain(0.25); sea.g.disconnect(); sea.g.connect(swell); swell.connect(sea.pp);
  const wind = layer(white, 'bandpass', 500, 0.7);
  const water = layer(white, 'bandpass', 1400, 0.9);
  const spray = layer(white, 'highpass', 3500, 0.7);
  const glide = layer(white, 'bandpass', 900, 0.5);
  const lagoon = { pp: pan(0) }; send(lagoon.pp, 1, 0.3);

  const set = (param, v, k = 0.25) => param.setTargetAtTime(v, ac.currentTime, k);

  // --- schedules ---
  let chordAt = 0, chord = 0, pluckAt = 1.5, pluckNote = 5, lapAt = 0, gullAt = 20 + Math.random() * 30, swellAt = 0, shimmerAt = 6;
  let intensity = 0, lagoonLevel = 0;
  const SWELL = new Float32Array(64).map((_, i) => { const x = i / 63; return 0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, x / 0.3) / 2) ** 2 * (x < 0.3 ? 1 : Math.exp(-(x - 0.3) * 4)); });
  /** Lays every scheduled sound from now up to `until` (seconds, the context's clock). phase: the surf's 0..1 now. */
  function schedule(until, phase = null) {
    const now = ac.currentTime;
    if (chordAt < now) chordAt = now + 0.05;
    while (chordAt < until) {
      const c = CHORDS[chord], dur = 9 + Math.random() * 6;
      c.notes.forEach((s, i) => pad(chordAt + i * 0.15, hz(s), dur, { level: 0.022, p: (i / (c.notes.length - 1)) * 1.2 - 0.6 }));
      bass(chordAt, hz(c.root), dur);
      chordAt += dur;
      chord = pick(c.next);
    }
    if (pluckAt < now) pluckAt = now + 0.5;
    while (pluckAt < until) {
      // a wandering line on the pentatonic, sparse at rest and fuller with speed; now and then it rests a while
      pluckNote = Math.max(2, Math.min(12, pluckNote + pick([-2, -1, -1, 1, 1, 2, 0])));
      if (Math.random() < 0.85) pluck(pluckAt, hz(step(pluckNote)), { level: 0.05 + 0.02 * intensity, p: Math.random() * 0.8 - 0.4 });
      pluckAt += (0.7 + Math.random() * 2.2) * (1 - 0.55 * intensity) + (Math.random() < 0.12 ? 4 : 0);
    }
    if (shimmerAt < now) shimmerAt = now + 1;
    while (shimmerAt < until) {
      if (Math.random() < 0.15 + 0.6 * intensity) bell(shimmerAt, hz(step(10 + Math.floor(Math.random() * 5))), { level: 0.012 + 0.02 * intensity, decay: 3, wet: 1, b: music, p: Math.random() * 1.4 - 0.7 });
      shimmerAt += 1.2 + Math.random() * 2.5;
    }
    // the sea's swell, once a wave: 6.5 s, timed to the surf when the phase is known
    if (swellAt < now) swellAt = phase == null ? now + 0.1 : now + (1 - phase) * 6.5;
    while (swellAt < until) {
      swell.gain.cancelScheduledValues(swellAt);
      swell.gain.setValueCurveAtTime(SWELL, swellAt, 6.45);
      swellAt += 6.5;
    }
    if (lapAt < now) lapAt = now + 0.3;
    while (lapAt < until) {
      if (lagoonLevel > 0.01) {
        const s = ac.createBufferSource(); s.buffer = white;
        const f = filter('bandpass', 500 + Math.random() * 700, 1.2), g = gain(0);
        s.connect(f); f.connect(g); g.connect(lagoon.pp);
        const L = lagoonLevel * (0.5 + Math.random() * 0.5);
        g.gain.setValueAtTime(0, lapAt); g.gain.linearRampToValueAtTime(L * 0.09, lapAt + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, lapAt + 0.55);
        s.start(lapAt, Math.random()); s.stop(lapAt + 0.6);
        count(3);
      }
      lapAt += 0.7 + Math.random() * 1.8;
    }
    while (gullAt < until) {
      if (gullAt > now) FX.gull(gullAt);
      gullAt += 25 + Math.random() * 45;
    }
  }

  return {
    ac, master, music, fx, duck, FX,
    get made() { return made; },
    schedule,
    play(name, data, t = ac.currentTime) { FX[name]?.(t + 0.01, data); return !!FX[name]; },
    /**
     * The scene as it sounds now, each 0..1: speed (score intensity), sea and lagoon (how near), their pans (-1..1),
     * wind, water (board on water), spray (carving), glide (air).
     */
    scene(s) {
      intensity = clamp01(s.speed ?? 0);
      lagoonLevel = clamp01(s.lagoon ?? 0);
      set(bright.offset, 900 * intensity, 1.2);
      set(sea.g.gain, 0.32 * clamp01(s.sea ?? 0), 0.6);
      set(sea.flt.frequency, 350 + 700 * clamp01(s.sea ?? 0), 0.6);
      set(sea.pp.pan, s.seaPan ?? 0, 0.4);
      set(lagoon.pp.pan, s.lagoonPan ?? 0, 0.4);
      set(wind.g.gain, 0.012 + 0.07 * clamp01(s.wind ?? 0), 0.5);
      set(wind.flt.frequency, 380 + 900 * clamp01(s.wind ?? 0), 0.8);
      set(water.g.gain, 0.1 * clamp01(s.water ?? 0), 0.08);
      set(water.flt.frequency, 700 + 1600 * clamp01(s.water ?? 0), 0.15);
      set(spray.g.gain, 0.08 * clamp01(s.spray ?? 0), 0.06);
      set(glide.g.gain, 0.09 * clamp01(s.glide ?? 0), 0.2);
      set(glide.flt.frequency, 500 + 900 * clamp01(s.glide ?? 0), 0.3);
    },
    /** volumes 0..1: music, effects; duck: the score's share while a card is up. */
    levels({ music: m = 0.7, effects: e = 0.8, duck: d = 1 } = {}, k = 0.15) {
      set(music.vol.gain, 0.9 * m * m, k);
      set(fx.vol.gain, e * e, k);
      set(duck.gain, d, 0.6);
    },
  };
}

const SPEAKER = (on) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>${on
  ? '<path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.4 7.4 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
  : '<path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'}</svg>`;

/** The live side. ctx: the game's (BRIEF.md, Contracts). */
export function createAudio(ctx) {
  const quiet = ctx.capture || ctx.patchTest;
  const store = loadSettings({ table: SOUND, key: SOUND_KEY, remember: !quiet, auto: (k) => (k === 'mute' && quiet ? true : undefined) });
  let eng = null, started = false, ducked = false, blurred = false, error = null, timer = 0;
  const v = store.values;

  const levels = () => eng?.levels({ music: v.music, effects: v.effects, duck: ducked ? 0.3 : 1 });
  function apply(key, value) {
    if (key === 'mute') { button?.classList.toggle('on', !!value); if (button) button.innerHTML = SPEAKER(!value); awake(); }
    levels();
  }
  ctx.options?.addSettings?.(SOUND, store, apply);
  const set = (key, value) => { store.set(key, value); apply(key, value); ctx.options?.show?.(key, store); };

  const button = ctx.hud ? document.createElement('button') : null;
  if (button) {
    button.className = 'omni-corner sound-toggle';
    button.tabIndex = -1;
    button.setAttribute('aria-label', 'Sound on or off (L)');
    button.innerHTML = SPEAKER(!v.mute);
    button.addEventListener('mousedown', (e) => e.preventDefault());
    button.addEventListener('click', () => { start(); set('mute', !v.mute); });
    slot('tr').prepend(button);
  }
  addEventListener('keydown', (e) => { if (e.code === 'KeyL' && !e.repeat && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { start(); set('mute', !v.mute); } });

  // Sound pauses with the game: hidden, the window gone (not in Patch's test window), the options up, or muted.
  const want = () => started && !v.mute && !document.hidden && !blurred && !ctx.options?.isOpen;
  function awake() {
    if (!eng) return;
    const on = want();
    if (on && eng.ac.state === 'suspended') eng.ac.resume().catch(() => {});
    if (!on && eng.ac.state === 'running') eng.ac.suspend().catch(() => {});
  }
  addEventListener('visibilitychange', awake);
  addEventListener('blur', () => { blurred = !ctx.patchTest; awake(); });
  addEventListener('focus', () => { blurred = false; awake(); });

  const surfPhase = () => (ctx.time() / 6.5) % 1;
  /** Starts the sound; call it from a click or a key (browsers let sound start only then). */
  function start() {
    if (started) return;
    started = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      eng = buildEngine(new AC({ latencyHint: 'interactive' }));
      eng.music.vol.gain.value = 0;
      levels();
      // the score comes in slowly after stepping in
      eng.music.vol.gain.cancelScheduledValues(eng.ac.currentTime);
      eng.music.vol.gain.setValueAtTime(0, eng.ac.currentTime);
      eng.music.vol.gain.linearRampToValueAtTime(0.9 * v.music * v.music, eng.ac.currentTime + 5);
      timer = setInterval(() => { if (eng.ac.state === 'running') eng.schedule(eng.ac.currentTime + 0.5, surfPhase()); awake(); }, 100);
      awake();
    } catch (e) { error = e.message; }
  }
  const play = (name, data) => { if (!eng || eng.ac.state !== 'running') return false; try { return eng.play(name, data); } catch (e) { error = e.message; return false; } };

  ctx.on?.('token:collect', (d) => play('token', d));
  ctx.on?.('pool:deposit', (d) => play('deposit', d));
  ctx.on?.('product:use', (d) => play('product', d));
  ctx.on?.('run:finish', (d) => { play('finish', d); ducked = true; levels(); });
  ctx.on?.('title:enter', () => { ducked = false; levels(); });
  ctx.on?.('ride:mount', () => { ducked = false; levels(); });
  ctx.on?.('ride:leap', (d) => play('leap', d));
  ctx.on?.('ride:land', (d) => play('land', d));
  ctx.on?.('ride:crash', (d) => play('crash', d));
  ctx.on?.('ride:swim', (d) => play('splash', d));
  // a quiet tick on any of the glass's buttons
  addEventListener('click', (e) => { if (e.target.closest?.('button')) play('click'); }, true);

  // where he is, heard: probes round him find the sea (west of the cliff's edge) and the lagoon (east of it)
  const fwd = { x: 0, z: 0 };
  let probeClock = 0, lastPairs = 0, lastHeading = null, sceneNow = {};
  const DIRS = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)]);
  function listen(p) {
    const e = ctx.camera.matrixWorld.elements; // the eye's forward is -z
    fwd.x = -e[8]; fwd.z = -e[10];
    const n = Math.hypot(fwd.x, fwd.z) || 1; fwd.x /= n; fwd.z /= n;
    const panOf = (dx, dz) => { const m = Math.hypot(dx, dz) || 1; return Math.max(-1, Math.min(1, (-fwd.z * dx + fwd.x * dz) / m)); };
    const up = Math.max(0, p.y - ctx.heightAt(p.x, p.z));
    const ground = ctx.heightAt(p.x, p.z);
    const s = { sea: 0, lagoon: 0, seaPan: 0, lagoonPan: 0, sx: 0, sz: 0, lx: 0, lz: 0 };
    for (const r of [12, 40]) for (const [dx, dz] of DIRS) {
      const x = p.x + dx * r, z = p.z + dz * r;
      if (ctx.heightAt(x, z) > 0.15) continue;
      const w = r === 12 ? 1 / 8 : 0.5 / 8;
      const west = ctx.shoreAt ? x < (ctx.lab?.edgeX?.(z) ?? 0) : dx < 0;
      if (west) { s.sea += w; s.sx += dx; s.sz += dz; } else { s.lagoon += w; s.lx += dx; s.lz += dz; }
    }
    // high on the cliff the sea is farther off; the lagoon is a hand deep and only heard close
    const height = Math.max(ground, 0) + up;
    s.sea = Math.min(1, s.sea * 1.5) * (0.35 + 0.65 * Math.exp(-height / 40)) + 0.12;
    s.lagoon = Math.min(1, s.lagoon * 1.6) * Math.exp(-height / 6);
    s.seaPan = s.sx || s.sz ? panOf(s.sx, s.sz) * 0.8 : -0.3;
    s.lagoonPan = s.lx || s.lz ? panOf(s.lx, s.lz) * 0.8 : 0.3;
    s.height = height;
    return s;
  }

  return {
    start,
    play,
    get started() { return started; },
    update(dt) {
      if (!eng || eng.ac.state !== 'running') return;
      const ride = ctx.ride ?? {}, game = ctx.game;
      const p = ride.mounted && ride.position ? ride.position : ctx.player?.feet;
      if ((probeClock -= dt) <= 0 && p) {
        probeClock = 0.25;
        sceneNow = listen(p);
      }
      const speed = ride.mounted ? ride.speed ?? 0 : ctx.player?.speed ?? 0;
      let turn = 0;
      if (ride.heading != null) {
        if (lastHeading != null) { let d = ride.heading - lastHeading; d = Math.atan2(Math.sin(d), Math.cos(d)); turn = Math.abs(d) / Math.max(dt, 1e-3); }
        lastHeading = ride.heading;
      }
      const onWater = ride.mounted && !ride.airborne && p && ctx.heightAt(p.x, p.z) < 0.3;
      eng.scene({
        ...sceneNow,
        speed: clamp01(speed / 18),
        wind: clamp01((sceneNow.height ?? 0) / 60 + speed / 22),
        water: onWater ? clamp01(speed / 14) : 0,
        spray: onWater ? clamp01((turn - 0.4) * speed / 12) : 0,
        glide: ride.airborne ? clamp01(0.3 + speed / 20) : 0,
      });
      if (game) {
        if (game.pairs > lastPairs) play('pair');
        lastPairs = game.pairs ?? 0;
      }
    },
    state: () => ({
      started, muted: !!v.mute, music: v.music, effects: v.effects, ducked, error,
      context: eng?.ac.state ?? 'none', time: eng ? +eng.ac.currentTime.toFixed(2) : 0, made: eng?.made ?? 0,
    }),
    /** Renders `seconds` of the whole mix offline (score, ambience at the given scene, effects on a timetable): a Float32Array per channel. */
    async render(seconds = 10, scene = { speed: 0.5, sea: 0.7, seaPan: -0.5, lagoon: 0.4, lagoonPan: 0.5, wind: 0.4, water: 0.5 }, fx = [[1, 'token', { kind: 'a' }], [1.3, 'token', { kind: 'b' }], [1.6, 'token', { kind: 'a' }], [2, 'pair'], [3, 'leap'], [3.8, 'land', { clean: true }], [4.5, 'product', { key: 'trade' }], [5.5, 'deposit', { pairs: 6 }], [7, 'land', { clean: false }], [7.5, 'splash'], [8.2, 'product', { key: 'leverage' }], [8.8, 'finish'], [9.3, 'click']]) {
      const off = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100);
      const e = buildEngine(off);
      e.levels({ music: v.music, effects: v.effects }, 0.001);
      e.scene(scene);
      e.schedule(seconds, 0);
      for (const [t, name, data] of fx) e.play(name, data, t);
      const buf = await off.startRendering();
      return { channels: [buf.getChannelData(0), buf.getChannelData(1)], rate: buf.sampleRate, made: e.made };
    },
    dispose() { clearInterval(timer); eng?.ac.close(); },
  };
}
