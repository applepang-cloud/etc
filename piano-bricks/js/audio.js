/* Piano Bricks — a small WebAudio synth: piano-ish notes, wrong-note buzz,
 * chord pads and sound effects. Music goes through a bus that can be cut. */
(function (PB) {
  'use strict';

  let ctx = null, master = null, sfx = null, music = null, noiseBuf = null;
  let muted = false, unlocked = false;
  const lastAt = {};
  let lastAny = 0;

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (e) {
      return null;
    }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(comp);
    comp.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.gain.value = 0.8;
    sfx.connect(master);
    music = ctx.createGain();
    music.connect(master);
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // Must run inside a user gesture (iOS / Chrome autoplay rules).
  function unlock() {
    const c = init();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    if (!unlocked) {
      const s = c.createBufferSource();
      s.buffer = c.createBuffer(1, 1, 22050);
      s.connect(c.destination);
      s.start(0);
      unlocked = true;
    }
  }

  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // [frequency ratio, wave, gain, detune cents]
  const TIMBRE = {
    piano: [[1, 'triangle', 1, 0], [2, 'sine', 0.45, 3], [3, 'sine', 0.18, -3], [5, 'sine', 0.05, 0]],
    wrong: [[1, 'sawtooth', 0.55, 22], [1, 'square', 0.3, -26], [2, 'sine', 0.2, 0]],
    pad: [[1, 'triangle', 1, -6], [1, 'sine', 0.6, 6]],
    bass: [[1, 'sine', 1, 0], [2, 'triangle', 0.25, 0]],
    bell: [[1, 'sine', 1, 0], [2.76, 'sine', 0.35, 0], [5.4, 'sine', 0.12, 0]]
  };

  function tone(midi, opt) {
    const c = init();
    if (!c) return;
    const kind = opt.kind || 'piano';
    const t = c.currentTime + Math.max(0, opt.at || 0);
    const dur = opt.dur || 0.4;
    const vel = opt.vel || 0.5;
    const f = freq(midi);
    const soft = kind === 'pad' || kind === 'bass';

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    const bright = kind === 'wrong' ? 5200 : kind === 'pad' ? 1400 : Math.min(7000, f * 7);
    lp.frequency.setValueAtTime(bright, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(250, bright * 0.25), t + dur + 0.3);

    const g = c.createGain();
    const atk = soft ? 0.04 : 0.006;
    const decayEnd = t + atk + Math.min(0.25, dur * 0.5);
    const release = Math.max(t + dur, decayEnd + 0.001);
    const end = release + (soft ? 0.5 : 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + atk);
    g.gain.exponentialRampToValueAtTime(vel * (soft ? 0.7 : 0.35), decayEnd);
    g.gain.setTargetAtTime(0.0001, release, soft ? 0.12 : 0.1);

    lp.connect(g);
    g.connect(opt.dest || music);
    TIMBRE[kind].forEach(([ratio, wave, gain, detune]) => {
      const o = c.createOscillator();
      const pg = c.createGain();
      o.type = wave;
      o.frequency.value = f * ratio;
      o.detune.value = detune;
      pg.gain.value = gain;
      o.connect(pg);
      pg.connect(lp);
      o.start(t);
      o.stop(end);
    });
  }

  function noiseBurst(dur, fc, vel) {
    const c = init();
    if (!c) return;
    const t = c.currentTime;
    const s = c.createBufferSource();
    const bp = c.createBiquadFilter();
    const g = c.createGain();
    s.buffer = noiseBuf;
    bp.type = 'bandpass';
    bp.frequency.value = fc;
    bp.Q.value = 1.2;
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp);
    bp.connect(g);
    g.connect(sfx);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  function sweep(f0, f1, dur, vel) {
    const c = init();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Avoids a wall of sound when many balls hit at once.
  function allow(key, gap) {
    const c = init();
    if (!c) return false;
    const now = c.currentTime;
    if (lastAt[key] !== undefined && now - lastAt[key] < gap) return false;
    if (now - lastAny < 0.018) return false;
    lastAt[key] = now;
    lastAny = now;
    return true;
  }

  function stopMusic() {
    if (!ctx) return;
    const old = music;
    try {
      old.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
    } catch (e) { /* ignore */ }
    setTimeout(() => { try { old.disconnect(); } catch (e) { /* ignore */ } }, 200);
    music = ctx.createGain();
    music.connect(master);
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.02);
  }

  PB.audio = {
    unlock,
    stopMusic,
    setMuted,
    isMuted: () => muted,
    note(midi, at, dur, vel) { tone(midi, { at, dur, vel, kind: 'piano' }); },
    wrong(midi, at, dur, vel) { tone(midi, { at, dur, vel, kind: 'wrong' }); },
    chord(ch, at, dur, vel) {
      tone(ch.bass, { at, dur, vel: vel * 1.3, kind: 'bass' });
      ch.notes.forEach((m) => tone(m, { at, dur, vel: vel * 0.5, kind: 'pad' }));
    },
    hit(midi) {
      if (allow('h' + midi, 0.08)) tone(midi, { dur: 0.16, vel: 0.22, dest: sfx });
    },
    pop(midi) {
      if (!allow('p' + midi, 0.03)) return;
      tone(midi + 12, { dur: 0.08, vel: 0.26, kind: 'bell', dest: sfx });
      noiseBurst(0.05, 2400, 0.16);
    },
    bump() {
      if (allow('bump', 0.04)) noiseBurst(0.04, 900, 0.16);
    },
    launch() {
      if (allow('launch', 0.05)) sweep(420, 760, 0.06, 0.06);
    },
    go() {
      [76, 83].forEach((m, i) => tone(m, { at: i * 0.08, dur: 0.15, vel: 0.3, kind: 'bell', dest: sfx }));
    },
    fanfare(stars) {
      [72, 76, 79, 84].slice(0, stars + 1).forEach((m, i) =>
        tone(m, { at: 0.25 + i * 0.16, dur: 0.3, vel: 0.35, kind: 'bell', dest: sfx }));
    },
    fail() {
      [67, 63, 60, 55].forEach((m, i) => tone(m, { at: 0.2 + i * 0.2, dur: 0.35, vel: 0.35, dest: sfx }));
    }
  };
})(window.PB = window.PB || {});
