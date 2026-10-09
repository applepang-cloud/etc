/* Piano Bricks — a small WebAudio synth: piano-ish notes, wrong-note buzz,
 * chord pads, sound effects, and a quiet ambience (looping accompaniment + wind).
 * Song playback goes through a bus that can be cut. */
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
    startAmbient();
  }

  function setSuspended(hidden) {
    if (!ctx) return;
    if (hidden) ctx.suspend();
    else if (unlocked) ctx.resume();
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
    const atk = opt.attack || (soft ? 0.04 : 0.006);
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


  // ---------- ambience: a soft looping accompaniment and wind ----------
  // The accompaniment loops the current stage's chords, one per bar, as a quiet pad,
  // a low note and a music-box arpeggio. It dips while a song is being played back.
  const AMB_BPM = 68;
  const ACCOMP_LEVEL = 0.45; // ~15 dB under the block-hit melody (measured)
  const ARP = [[0, 0], [2, 1], [1, 2], [2, 3], [1, 3.5]]; // [chord tone, beat]
  let amb = null;
  let ambChords = null;

  function brownNoise(c, seconds) {
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  // Looping noise through a slowly wandering band-pass, with a slow swell in level.
  function windLayer(c, dest, centre, sweep, level, rate) {
    const src = c.createBufferSource();
    src.buffer = brownNoise(c, 4);
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = centre;
    bp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.value = level;
    const lfoF = c.createOscillator(), lfoFg = c.createGain();
    lfoF.frequency.value = rate;
    lfoFg.gain.value = sweep;
    lfoF.connect(lfoFg);
    lfoFg.connect(bp.frequency);
    const lfoA = c.createOscillator(), lfoAg = c.createGain();
    lfoA.frequency.value = rate * 1.7;
    lfoAg.gain.value = level * 0.7;
    lfoA.connect(lfoAg);
    lfoAg.connect(g.gain);
    src.connect(bp);
    bp.connect(g);
    g.connect(dest);
    src.start();
    lfoF.start();
    lfoA.start();
  }

  function startAmbient() {
    const c = init();
    if (!c || amb) return;
    const bus = c.createGain();
    bus.gain.setValueAtTime(0.0001, c.currentTime);
    bus.gain.setTargetAtTime(1, c.currentTime, 1.2); // fade in
    bus.connect(master);
    const accomp = c.createGain();
    accomp.gain.value = ACCOMP_LEVEL;
    accomp.connect(bus);
    windLayer(c, bus, 520, 260, 0.08, 0.07);
    windLayer(c, bus, 1800, 600, 0.02, 0.045);
    amb = { bus, accomp, next: c.currentTime + 0.4, beat: 0 };
    amb.timer = setInterval(scheduleAmbient, 100);
  }

  function chordAt(beat) {
    const list = ambChords || (PB.parseChord ? ['C', 'A', 'F', 'G'].map(PB.parseChord) : null);
    return list ? list[Math.floor(beat / 4) % list.length] : null;
  }

  function scheduleAmbient() {
    if (!amb || ctx.state !== 'running') return;
    const spb = 60 / AMB_BPM;
    const now = ctx.currentTime;
    if (amb.next < now) amb.next = now + 0.05; // skip what was missed while hidden
    while (amb.next < now + 0.5) {
      const ch = chordAt(amb.beat);
      if (ch && amb.beat % 4 === 0) {
        const at = amb.next - now;
        ch.notes.forEach((m) => tone(m + 12, { at, dur: 4 * spb, vel: 0.035, kind: 'pad', attack: 0.6, dest: amb.accomp }));
        tone(ch.bass + 12, { at, dur: 4 * spb, vel: 0.05, kind: 'bass', attack: 0.3, dest: amb.accomp });
        ARP.forEach(([i, b]) => {
          tone(ch.notes[i % ch.notes.length] + 24, { at: at + b * spb, dur: 1.4 * spb, vel: 0.045, kind: 'bell', dest: amb.accomp });
        });
      }
      amb.next += spb;
      amb.beat++;
    }
  }

  function ambientChords(chords) {
    ambChords = chords && chords.length ? chords : null;
  }

  function ambientDuck(on) {
    if (amb) amb.accomp.gain.setTargetAtTime(ACCOMP_LEVEL * (on ? 0.12 : 1), ctx.currentTime, 0.4);
  }

  // Bass note of the accompaniment chord sounding now (for the paddle bounce).
  function currentBass() {
    const ch = amb ? chordAt(Math.max(0, amb.beat - 1)) : chordAt(0);
    return ch ? ch.bass + 12 : 48;
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
    setSuspended,
    ambientChords,
    ambientDuck,
    stopMusic,
    setMuted,
    isMuted: () => muted,
    note(midi, at, dur, vel) { tone(midi, { at, dur, vel, kind: 'piano' }); },
    wrong(midi, at, dur, vel) { tone(midi, { at, dur, vel, kind: 'wrong' }); },
    chord(ch, at, dur, vel) {
      tone(ch.bass, { at, dur, vel: vel * 1.3, kind: 'bass' });
      ch.notes.forEach((m) => tone(m, { at, dur, vel: vel * 0.5, kind: 'pad' }));
    },
    // A block hit plays a note of the song's melody; returns false when throttled
    // (so the caller does not advance to the next note).
    melodyHit(midi, seconds) {
      if (!allow('melody', 0.085)) return false;
      tone(midi, { dur: Math.min(0.7, Math.max(0.18, seconds * 0.8)), vel: 0.34, dest: sfx });
      return true;
    },
    sparkle() {
      if (allow('sparkle', 0.03)) noiseBurst(0.05, 5200, 0.07);
    },
    launch() {
      if (allow('launch', 0.05)) sweep(420, 760, 0.06, 0.06);
    },
    paddle() {
      if (!allow('paddle', 0.05)) return;
      tone(currentBass(), { dur: 0.25, vel: 0.28, dest: sfx });
      noiseBurst(0.03, 1800, 0.06);
    },
    item() {
      [84, 88, 91].forEach((m, i) => tone(m, { at: i * 0.06, dur: 0.12, vel: 0.25, kind: 'bell', dest: sfx }));
    },
    lose() {
      if (allow('lose', 0.1)) sweep(300, 110, 0.18, 0.12);
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
