/*
 * 터치라인 매니저 — 소리
 *
 * 음원 파일 없이 Web Audio API로 모든 소리를 합성한다.
 * - 배경음악: 116BPM 응원가풍 루프(드럼·베이스·코드·멜로디), 32마디
 * - 관중: 경기 중에 깔리는 함성, 골이 나면 크게 터진다
 * - 효과음: 휘슬, 골, 스킬, 레벨업, 뽑기, 강화 등
 * 브라우저 정책상 첫 클릭·키 입력 뒤에만 소리가 난다(unlock).
 */
(function (root) {
  'use strict';

  const PREF_KEY = 'touchline-manager-audio';
  const prefs = { music: true, sfx: true, mv: 0.5, sv: 0.7 };
  try {
    const saved = JSON.parse(root.localStorage.getItem(PREF_KEY) || 'null');
    if (saved && typeof saved === 'object') Object.assign(prefs, saved);
  } catch (e) { /* 무시 */ }
  function savePrefs() {
    try { root.localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* 무시 */ }
  }

  let ctx = null;
  let master, musicBus, sfxBus, crowdBus, crowdGain, noiseBuf;
  let scene = 'menu';
  let unlocked = false;
  const last = {};

  const Ctx = root.AudioContext || root.webkitAudioContext;
  const supported = !!Ctx;

  function init() {
    if (ctx || !supported) return;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    crowdBus = ctx.createGain();
    musicBus.connect(master);
    sfxBus.connect(master);
    crowdBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    buildCrowd();
    applyVolumes(true);
  }

  function applyVolumes(instant) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const duck = scene === 'match' ? 0.45 : 1;
    const set = (param, v) => {
      param.cancelScheduledValues(t);
      if (instant) param.setValueAtTime(v, t);
      else param.setTargetAtTime(v, t, 0.4);
    };
    set(musicBus.gain, prefs.music ? 0.42 * prefs.mv * duck : 0);
    set(sfxBus.gain, prefs.sfx ? 0.8 * prefs.sv : 0);
    set(crowdBus.gain, prefs.sfx ? prefs.sv : 0);
    set(crowdGain.gain, scene === 'match' ? 0.11 : 0);
  }

  /* ------------------------------------------------------------ 기본 재료 */

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function env(g, t, peak, a, d, sustain, r, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    if (sustain != null) {
      g.gain.exponentialRampToValueAtTime(Math.max(peak * sustain, 0.0002), t + a + d);
      g.gain.setValueAtTime(Math.max(peak * sustain, 0.0002), end);
      g.gain.exponentialRampToValueAtTime(0.0001, end + r);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
  }

  function tone(dest, t, freq, dur, opt) {
    const o = Object.assign({ type: 'sine', gain: 0.3, a: 0.005, r: 0.08, cutoff: 0, detune: 0 }, opt);
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    osc.detune.value = o.detune;
    const g = ctx.createGain();
    let node = osc;
    if (o.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.cutoff;
      f.Q.value = o.q || 0.7;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(dest);
    env(g, t, o.gain, o.a, Math.max(0.01, dur - o.a), 0.7, o.r, t + dur);
    osc.start(t);
    osc.stop(t + dur + o.r + 0.05);
    return osc;
  }

  function noise(dest, t, dur, opt) {
    const o = Object.assign({ type: 'bandpass', freq: 1000, q: 0.8, gain: 0.3, a: 0.005, r: 0.05 }, opt);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.frequency.setValueAtTime(o.freq, t);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
    f.Q.value = o.q;
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(dest);
    env(g, t, o.gain, o.a, Math.max(0.01, dur), null);
    src.start(t, Math.random());
    src.stop(t + dur + o.r + 0.1);
  }

  /* ---------------------------------------------------------------- 관중 */

  function buildCrowd() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 650;
    bp.Q.value = 0.6;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    crowdGain = ctx.createGain();
    crowdGain.gain.value = 0;
    // 웅성거림의 출렁임: 1±0.35로 흔든 뒤 장면별 크기(crowdGain)를 곱한다
    const swell = ctx.createGain();
    swell.gain.value = 1;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.35;
    lfo.connect(lfoAmt).connect(swell.gain);
    src.connect(bp).connect(lp).connect(swell).connect(crowdGain).connect(crowdBus);
    src.start();
    lfo.start();
  }

  function cheer(intensity, dur) {
    const t = ctx.currentTime;
    noise(crowdBus, t, dur || 2.6, { type: 'bandpass', freq: 900, q: 0.5, gain: 0.55 * intensity, a: 0.18 });
    noise(crowdBus, t + 0.05, (dur || 2.6) * 0.8, { type: 'bandpass', freq: 2200, q: 0.9, gain: 0.25 * intensity, a: 0.2 });
  }
  function groan(intensity) {
    const t = ctx.currentTime;
    noise(crowdBus, t, 1.3, { type: 'lowpass', freq: 900, sweep: 260, q: 1.2, gain: 0.4 * intensity, a: 0.08 });
  }

  /* ---------------------------------------------------------------- 효과음 */

  function whistle(t, dur) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 2950;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 32;
    const amt = ctx.createGain();
    amt.gain.value = 140;
    lfo.connect(amt).connect(osc.frequency);
    const g = ctx.createGain();
    osc.connect(g).connect(sfxBus);
    env(g, t, 0.16, 0.012, dur, 0.85, 0.05, t + dur);
    osc.start(t); lfo.start(t);
    osc.stop(t + dur + 0.15); lfo.stop(t + dur + 0.15);
    noise(sfxBus, t, dur, { type: 'highpass', freq: 5000, q: 0.5, gain: 0.03 });
  }

  function arp(notes, step, opt) {
    const t = ctx.currentTime + 0.01;
    notes.forEach((m, i) => tone(sfxBus, t + i * step, mtof(m), (opt && opt.len) || step * 1.6, opt));
  }

  const SFX = {
    click() { tone(sfxBus, ctx.currentTime, 1500, 0.025, { type: 'triangle', gain: 0.06, r: 0.02 }); },
    kickoff() { whistle(ctx.currentTime + 0.02, 0.38); },
    halftime() { const t = ctx.currentTime + 0.02; whistle(t, 0.28); whistle(t + 0.42, 0.5); },
    fulltime() { const t = ctx.currentTime + 0.02; whistle(t, 0.22); whistle(t + 0.34, 0.22); whistle(t + 0.68, 0.75); },
    card() { whistle(ctx.currentTime + 0.01, 0.16); },
    goal(mine) {
      if (mine) {
        cheer(1, 3.2);
        arp([72, 76, 79, 84], 0.085, { type: 'square', gain: 0.09, cutoff: 3200 });
        const t = ctx.currentTime + 0.4;
        [72, 76, 79].forEach((m) => tone(sfxBus, t, mtof(m), 0.6, { type: 'sawtooth', gain: 0.05, cutoff: 2400, r: 0.4 }));
      } else {
        groan(1);
        arp([67, 63, 60], 0.14, { type: 'triangle', gain: 0.08, len: 0.2 });
      }
    },
    chance() { const t = ctx.currentTime; noise(crowdBus, t, 0.6, { type: 'bandpass', freq: 520, sweep: 380, q: 1, gain: 0.22, a: 0.08 }); },
    skill() {
      arp([84, 88, 91, 96, 100], 0.045, { type: 'triangle', gain: 0.07, len: 0.12 });
      noise(sfxBus, ctx.currentTime, 0.3, { type: 'highpass', freq: 6000, gain: 0.05, a: 0.02 });
    },
    injury() { tone(sfxBus, ctx.currentTime, 110, 0.18, { slide: 60, gain: 0.25 }); groan(0.4); },
    level() { arp([76, 79, 84], 0.07, { type: 'triangle', gain: 0.08, len: 0.14 }); },
    star() {
      arp([72, 76, 79, 84, 88], 0.06, { type: 'square', gain: 0.06, cutoff: 3500, len: 0.12 });
      const t = ctx.currentTime + 0.32;
      [84, 88, 91].forEach((m) => tone(sfxBus, t, mtof(m), 0.7, { type: 'triangle', gain: 0.06, r: 0.5 }));
    },
    coin() { const t = ctx.currentTime; tone(sfxBus, t, mtof(83), 0.06, { type: 'square', gain: 0.05, cutoff: 4000 }); tone(sfxBus, t + 0.06, mtof(88), 0.22, { type: 'square', gain: 0.05, cutoff: 4000, r: 0.15 }); },
    enhance() {
      const t = ctx.currentTime;
      tone(sfxBus, t, 1850, 0.25, { gain: 0.12, r: 0.25 });
      tone(sfxBus, t, 2770, 0.18, { gain: 0.07, r: 0.2 });
      noise(sfxBus, t, 0.05, { type: 'highpass', freq: 3000, gain: 0.15 });
    },
    build() {
      const t = ctx.currentTime;
      tone(sfxBus, t, 95, 0.22, { slide: 45, gain: 0.4 });
      noise(sfxBus, t, 0.12, { type: 'lowpass', freq: 600, gain: 0.25 });
      tone(sfxBus, t + 0.18, mtof(84), 0.2, { type: 'triangle', gain: 0.06 });
    },
    error() { const t = ctx.currentTime; tone(sfxBus, t, 140, 0.12, { type: 'square', gain: 0.06, cutoff: 900 }); tone(sfxBus, t + 0.13, 110, 0.16, { type: 'square', gain: 0.06, cutoff: 900 }); },
    achievement() {
      arp([72, 76, 79], 0.1, { type: 'square', gain: 0.06, cutoff: 3000, len: 0.18 });
      const t = ctx.currentTime + 0.32;
      [72, 76, 79, 84].forEach((m) => tone(sfxBus, t, mtof(m), 0.8, { type: 'triangle', gain: 0.05, r: 0.5 }));
    },
    drumroll(dur) {
      const t = ctx.currentTime;
      const n = Math.floor((dur || 0.7) / 0.045);
      for (let i = 0; i < n; i++) noise(sfxBus, t + i * 0.045, 0.04, { type: 'bandpass', freq: 1800, q: 0.7, gain: 0.05 + 0.12 * (i / n) });
    },
    reveal(grade) {
      const t = ctx.currentTime;
      if (grade === 'UR' || grade === 'SSR') {
        cheer(grade === 'UR' ? 1 : 0.7, 2.6);
        arp(grade === 'UR' ? [72, 76, 79, 84, 88, 91, 96] : [72, 76, 79, 84, 88], 0.07, { type: 'square', gain: 0.07, cutoff: 3600, len: 0.14 });
        [84, 88, 91].forEach((m) => tone(sfxBus, t + 0.45, mtof(m), 1.1, { type: 'sawtooth', gain: 0.04, cutoff: 2600, r: 0.7 }));
      } else if (grade === 'SR') {
        arp([79, 84, 88], 0.08, { type: 'triangle', gain: 0.09, len: 0.2 });
      } else {
        tone(sfxBus, t, mtof(grade === 'R' ? 84 : 79), 0.16, { type: 'triangle', gain: 0.07 });
      }
    },
    promotion() {
      cheer(1, 3.5);
      const seq = [[67, 0, 0.18], [72, 0.2, 0.18], [76, 0.4, 0.18], [79, 0.6, 0.5], [76, 1.15, 0.15], [79, 1.32, 0.9]];
      const t = ctx.currentTime + 0.05;
      seq.forEach(([m, at, len]) => tone(sfxBus, t + at, mtof(m), len, { type: 'sawtooth', gain: 0.07, cutoff: 2800, r: 0.2 }));
    },
    relegation() {
      const t = ctx.currentTime + 0.05;
      [[62, 0, 0.45], [60, 0.5, 0.45], [57, 1, 1.1]].forEach(([m, at, len]) => tone(sfxBus, t + at, mtof(m), len, { type: 'triangle', gain: 0.1, r: 0.4 }));
    },
  };

  /* ------------------------------------------------------------ 배경음악 */

  const BPM = 116;
  const STEP = 60 / BPM / 4; // 16분음표
  const CHORDS = {
    C: { root: 48, pad: [60, 64, 67] }, G: { root: 43, pad: [59, 62, 67] }, Am: { root: 45, pad: [57, 60, 64] },
    F: { root: 41, pad: [57, 60, 65] }, Em: { root: 40, pad: [59, 64, 67] }, Dm: { root: 50, pad: [57, 62, 65] },
  };
  const SONG_A = ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'];
  const SONG_B = ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'];
  // [스텝, 음, 길이(스텝)]
  const MEL_A = [
    [[0, 72, 4], [4, 76, 4], [8, 79, 6], [14, 77, 2]],
    [[0, 74, 4], [4, 79, 4], [8, 77, 4], [12, 76, 4]],
    [[0, 76, 4], [4, 72, 4], [8, 76, 4], [12, 79, 4]],
    [[0, 77, 6], [6, 76, 2], [8, 74, 8]],
    [[0, 72, 2], [2, 74, 2], [4, 76, 4], [8, 79, 4], [12, 84, 4]],
    [[0, 83, 4], [4, 79, 4], [8, 74, 4], [12, 79, 4]],
    [[0, 81, 4], [4, 77, 4], [8, 72, 4], [12, 77, 4]],
    [[0, 79, 8], [8, 74, 4], [12, 71, 4]],
  ];
  const MEL_B = [
    [[0, 77, 3], [3, 77, 1], [4, 79, 4], [8, 81, 4], [12, 79, 4]],
    [[0, 79, 3], [3, 79, 1], [4, 81, 4], [8, 83, 4], [12, 81, 4]],
    [[0, 79, 4], [4, 76, 4], [8, 79, 4], [12, 83, 4]],
    [[0, 81, 8], [8, 76, 4], [12, 72, 4]],
    [[0, 77, 3], [3, 77, 1], [4, 79, 4], [8, 81, 4], [12, 84, 4]],
    [[0, 83, 4], [4, 81, 4], [8, 79, 4], [12, 74, 4]],
    [[0, 76, 4], [4, 79, 4], [8, 84, 8]],
    [[0, 84, 4], [4, 79, 4], [8, 76, 4], [12, 72, 4]],
  ];
  const BASS = [[0, 0], [3, 0], [6, 12], [8, 0], [11, 0], [14, 7]];
  const BARS = 32; // A A B B

  let seqTimer = null;
  let nextTime = 0;
  let stepIdx = 0;
  let cycle = 0;

  function barInfo(bar) {
    const part = Math.floor(bar / 8); // 0 A, 1 A, 2 B, 3 B
    const i = bar % 8;
    const isB = part >= 2;
    return { chord: CHORDS[(isB ? SONG_B : SONG_A)[i]], mel: (isB ? MEL_B : MEL_A)[i], isB, part };
  }

  function kick(t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(g).connect(musicBus);
    env(g, t, 0.9, 0.003, 0.24, null);
    o.start(t); o.stop(t + 0.3);
  }
  function snare(t) {
    noise(musicBus, t, 0.14, { type: 'highpass', freq: 1400, q: 0.6, gain: 0.32 });
    tone(musicBus, t, 190, 0.06, { type: 'triangle', gain: 0.18, r: 0.04 });
  }
  function hat(t, open) {
    noise(musicBus, t, open ? 0.18 : 0.035, { type: 'highpass', freq: 7500, q: 0.4, gain: open ? 0.08 : 0.06 });
  }

  function scheduleStep(t, s) {
    const bar = Math.floor(s / 16) % BARS;
    const st = s % 16;
    const info = barInfo(bar);
    const fill = bar % 8 === 7 && st >= 12;
    // 드럼
    if (st === 0 || st === 8 || (st === 10 && bar % 2 === 1)) kick(t);
    if (st === 4 || st === 12) snare(t);
    if (fill && st > 12) snare(t);
    if (st % 2 === 0) hat(t, st === 14);
    // 베이스
    for (const [bs, off] of BASS) {
      if (bs === st) tone(musicBus, t, mtof(info.chord.root + off), STEP * 1.8, { type: 'sawtooth', gain: 0.16, cutoff: 650, q: 3, r: 0.05 });
    }
    // 코드: 마디 시작에 깔고, B 파트는 8분음표 스탭
    if (st === 0 && !info.isB) {
      for (const m of info.chord.pad) {
        tone(musicBus, t, mtof(m), STEP * 15, { type: 'sawtooth', gain: 0.035, cutoff: 1300, a: 0.08, r: 0.3, detune: -6 });
        tone(musicBus, t, mtof(m), STEP * 15, { type: 'sawtooth', gain: 0.035, cutoff: 1300, a: 0.08, r: 0.3, detune: 6 });
      }
    } else if (info.isB && (st === 2 || st === 6 || st === 10 || st === 14)) {
      for (const m of info.chord.pad) tone(musicBus, t, mtof(m), STEP * 1.2, { type: 'square', gain: 0.025, cutoff: 1800, r: 0.05 });
    }
    // 멜로디: 짝수 바퀴는 A 파트도, 홀수 바퀴는 B 파트만(덜 질리게)
    const playMel = info.isB || cycle % 2 === 0;
    if (playMel) {
      for (const [ms, m, len] of info.mel) {
        if (ms === st) {
          tone(musicBus, t, mtof(m), STEP * len * 0.92, { type: 'square', gain: 0.055, cutoff: 2600, a: 0.01, r: 0.08 });
          tone(musicBus, t, mtof(m + 12), STEP * len * 0.92, { type: 'triangle', gain: 0.025, a: 0.01, r: 0.08 });
        }
      }
    }
  }

  function pump() {
    if (!ctx) return;
    const ahead = ctx.currentTime + 0.18;
    if (nextTime < ctx.currentTime - 0.5) nextTime = ctx.currentTime + 0.05; // 탭 전환 등으로 밀렸으면 다시 맞춘다
    while (nextTime < ahead) {
      scheduleStep(nextTime, stepIdx);
      stepIdx++;
      if (stepIdx % (16 * BARS) === 0) cycle++;
      nextTime += STEP;
    }
  }

  function startMusic() {
    if (!ctx || seqTimer) return;
    nextTime = ctx.currentTime + 0.1;
    seqTimer = setInterval(pump, 40);
    pump();
  }
  function stopMusic() {
    if (seqTimer) { clearInterval(seqTimer); seqTimer = null; }
  }

  /* ------------------------------------------------------------ 바깥 API */

  const THROTTLE = { click: 40, chance: 400, card: 300, level: 900, coin: 120, enhance: 90, skill: 300 };

  function play(name, arg) {
    if (!ctx || !unlocked || !prefs.sfx || !SFX[name] || ctx.state !== 'running') return;
    const now = performance.now();
    const gap = THROTTLE[name] || 120;
    if (last[name] && now - last[name] < gap) return;
    last[name] = now;
    try { SFX[name](arg); } catch (e) { /* 소리 실패는 게임에 영향 없음 */ }
  }

  function unlock() {
    if (!supported) return false;
    init();
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
    if (prefs.music) startMusic();
    return true;
  }

  function setScene(next) {
    if (next === scene) return;
    scene = next;
    applyVolumes(false);
  }

  function setPref(key, value) {
    if (!(key in prefs)) return;
    prefs[key] = value;
    savePrefs();
    if (ctx) {
      applyVolumes(false);
      if (key === 'music') { if (value && unlocked) startMusic(); else if (!value) stopMusic(); }
    }
  }

  function setMuted(m) {
    setPref('music', !m);
    setPref('sfx', !m);
  }

  // 탭이 가려지면 소리를 멈춘다(배터리·백그라운드 소음 방지)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.visibilityState === 'hidden') { stopMusic(); ctx.suspend(); }
      else if (unlocked) { ctx.resume(); if (prefs.music) startMusic(); }
    });
  }

  root.TLAudio = {
    supported,
    unlock,
    play,
    cheer: (i) => { if (ctx && unlocked && prefs.sfx) cheer(i || 1); },
    setScene,
    setPref,
    setMuted,
    prefs: () => Object.assign({}, prefs),
    muted: () => !prefs.music && !prefs.sfx,
    isUnlocked: () => unlocked,
    sfxNames: () => Object.keys(SFX),
    // 테스트용: 출력 레벨을 재기 위한 내부 노드
    _debug: () => ({ ctx, master }),
  };
})(typeof window !== 'undefined' ? window : globalThis);
