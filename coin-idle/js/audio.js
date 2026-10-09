'use strict';
/* 사운드: Web Audio로 합성한 효과음 + 시장 분위기를 따라가는 생성형 배경음악 */

const Sound = {
  ctx: null,
  master: null,
  sfxBus: null,
  bgmBus: null,
  noiseBuf: null,
  settings: null,
  bgm: { on: false, timer: null, step: 0, next: 0, mood: 'calm' },
  lastPlay: {},

  bind(settings) {
    this.settings = settings;
  },

  /** 첫 사용자 입력 때 호출 (브라우저 자동재생 정책) */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (e) {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfxBus = c.createGain();
    this.bgmBus = c.createGain();
    this.sfxBus.connect(this.master);
    this.bgmBus.connect(this.master);
    const len = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.settings && this.settings.bgmOn) this.startBgm();
  },

  applyVolumes() {
    if (!this.ctx || !this.settings) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(s.sfxOn ? s.sfx : 0, t, 0.05);
    this.bgmBus.gain.setTargetAtTime(s.bgmOn ? s.bgm * 0.55 : 0, t, 0.2);
  },

  tone(freq, start, dur, { type = 'sine', vol = 0.3, attack = 0.005, slideTo = null, bus = null, filter = null } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    let node = o.connect(g);
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq;
      f.Q.value = filter.q || 0.7;
      node = g.connect(f);
      f.connect(bus || this.sfxBus);
    } else {
      g.connect(bus || this.sfxBus);
    }
    o.start(start);
    o.stop(start + dur + 0.05);
  },

  noise(start, dur, { vol = 0.2, freq = 4000, type = 'highpass', bus = null } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(bus || this.sfxBus);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.05);
  },

  /** 효과음 재생. 같은 소리가 너무 촘촘히 겹치지 않게 최소 간격을 둔다 */
  play(name, opt = {}) {
    if (!this.ctx || !this.settings || !this.settings.sfxOn) return;
    const now = performance.now();
    const gap = opt.gap ?? 60;
    if (this.lastPlay[name] && now - this.lastPlay[name] < gap) return;
    this.lastPlay[name] = now;
    const t = this.ctx.currentTime + 0.01;
    const P = this[`sfx_${name}`];
    if (P) P.call(this, t, opt);
  },

  sfx_click(t) {
    this.tone(1800, t, 0.03, { type: 'square', vol: 0.04 });
  },
  sfx_tap(t, o) {
    const k = 1 + (o.pitch || 0);
    this.tone(1568 * k, t, 0.09, { type: 'triangle', vol: 0.22 });
    this.tone(2637 * k, t + 0.02, 0.16, { type: 'sine', vol: 0.12 });
    this.noise(t, 0.03, { vol: 0.05, freq: 6000 });
  },
  sfx_coin(t) {
    this.tone(1318, t, 0.08, { type: 'square', vol: 0.08 });
    this.tone(1976, t + 0.07, 0.25, { type: 'square', vol: 0.08 });
  },
  sfx_buy(t) {
    this.tone(523, t, 0.08, { type: 'triangle', vol: 0.25 });
    this.tone(784, t + 0.07, 0.14, { type: 'triangle', vol: 0.25 });
  },
  sfx_sell(t) {
    this.noise(t, 0.06, { vol: 0.15, freq: 3000 });
    this.tone(1046, t + 0.04, 0.3, { type: 'sine', vol: 0.22 });
    this.tone(1568, t + 0.09, 0.35, { type: 'sine', vol: 0.16 });
  },
  sfx_profit(t) {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.07, 0.22, { type: 'triangle', vol: 0.2 }));
  },
  sfx_loss(t) {
    this.tone(392, t, 0.18, { type: 'sawtooth', vol: 0.1, filter: { freq: 1200 } });
    this.tone(311, t + 0.16, 0.32, { type: 'sawtooth', vol: 0.1, filter: { freq: 900 } });
  },
  sfx_news(t) {
    this.tone(880, t, 0.12, { type: 'sine', vol: 0.18 });
    this.tone(660, t + 0.12, 0.18, { type: 'sine', vol: 0.16 });
  },
  sfx_breaking(t) {
    for (let i = 0; i < 3; i++) this.tone(1040, t + i * 0.13, 0.09, { type: 'square', vol: 0.09 });
    this.tone(1560, t + 0.42, 0.25, { type: 'square', vol: 0.07 });
  },
  sfx_yt(t) {
    this.tone(740, t, 0.08, { type: 'triangle', vol: 0.14 });
    this.tone(988, t + 0.06, 0.12, { type: 'triangle', vol: 0.12 });
  },
  sfx_achieve(t) {
    [659, 784, 988, 1318].forEach((f, i) => this.tone(f, t + i * 0.09, 0.3, { type: 'square', vol: 0.07 }));
    this.tone(1318, t + 0.36, 0.6, { type: 'triangle', vol: 0.18 });
  },
  sfx_level(t) {
    [784, 988, 1175].forEach((f, i) => this.tone(f, t + i * 0.08, 0.25, { type: 'triangle', vol: 0.18 }));
  },
  sfx_hire(t) {
    [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, t + i * 0.05, 0.5, { type: 'sine', vol: 0.1 }));
  },
  sfx_liquidation(t) {
    this.tone(420, t, 0.8, { type: 'sawtooth', vol: 0.18, slideTo: 50, filter: { freq: 1400 } });
    this.noise(t, 0.5, { vol: 0.12, freq: 300, type: 'lowpass' });
  },
  sfx_rug(t) {
    this.tone(880, t, 1.1, { type: 'sawtooth', vol: 0.12, slideTo: 40, filter: { freq: 2000 } });
  },
  sfx_error(t) {
    this.tone(160, t, 0.16, { type: 'square', vol: 0.08, filter: { freq: 800 } });
  },
  sfx_build(t) {
    this.noise(t, 0.05, { vol: 0.12, freq: 1500, type: 'bandpass' });
    this.tone(330, t + 0.03, 0.1, { type: 'square', vol: 0.06 });
    this.tone(494, t + 0.09, 0.14, { type: 'square', vol: 0.06 });
  },
  sfx_heart(t) {
    this.tone(659, t, 0.2, { type: 'sine', vol: 0.18 });
    this.tone(880, t + 0.12, 0.25, { type: 'sine', vol: 0.15 });
    this.tone(1318, t + 0.24, 0.45, { type: 'sine', vol: 0.12 });
  },
  sfx_engine(t) {
    this.tone(70, t, 0.9, { type: 'sawtooth', vol: 0.22, slideTo: 190, filter: { freq: 700 } });
    this.tone(105, t + 0.05, 0.85, { type: 'square', vol: 0.06, slideTo: 280, filter: { freq: 500 } });
  },

  /* ---------- 배경음악 ---------- */
  setMood(m) {
    this.bgm.mood = m;
  },

  startBgm() {
    if (!this.ctx || this.bgm.timer) return;
    this.bgm.next = this.ctx.currentTime + 0.1;
    this.bgm.step = 0;
    this.bgm.timer = setInterval(() => this.schedule(), 100);
  },

  stopBgm() {
    clearInterval(this.bgm.timer);
    this.bgm.timer = null;
  },

  schedule() {
    const c = this.ctx;
    if (!c) return;
    const moods = {
      calm:  { bpm: 88,  prog: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]], scale: [69, 72, 74, 76, 79, 81], cut: 1400 },
      greed: { bpm: 104, prog: [[48, 52, 55, 59], [55, 59, 62, 66], [57, 60, 64, 67], [53, 57, 60, 64]], scale: [72, 74, 76, 79, 81, 84], cut: 2400 },
      fear:  { bpm: 76,  prog: [[57, 60, 64], [53, 56, 60], [50, 53, 57], [52, 56, 59]], scale: [69, 71, 72, 76, 77], cut: 900 },
    };
    const M = moods[this.bgm.mood] || moods.calm;
    const spb = 60 / M.bpm / 2; // 8분음표
    while (this.bgm.next < c.currentTime + 0.3) {
      const t = this.bgm.next;
      const s = this.bgm.step;
      const bar = Math.floor(s / 8) % M.prog.length;
      const chord = M.prog[bar];
      const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
      const B = this.bgmBus;
      if (s % 8 === 0) {
        chord.forEach(n => {
          this.tone(mtof(n), t, spb * 8, { type: 'triangle', vol: 0.05, attack: 0.25, bus: B, filter: { freq: M.cut } });
          this.tone(mtof(n) * 1.004, t, spb * 8, { type: 'sine', vol: 0.03, attack: 0.3, bus: B });
        });
        this.tone(mtof(chord[0] - 12), t, spb * 3, { type: 'sine', vol: 0.16, attack: 0.01, bus: B });
      }
      if (s % 8 === 4) this.tone(mtof(chord[0] - 12), t, spb * 2, { type: 'sine', vol: 0.12, attack: 0.01, bus: B });
      if (s % 2 === 1) this.noise(t, 0.04, { vol: 0.025, freq: 8000, bus: B });
      if (s % 4 === 2) this.noise(t, 0.08, { vol: 0.03, freq: 1800, type: 'bandpass', bus: B });
      if (Math.random() < 0.28) {
        const n = M.scale[Math.floor(Math.random() * M.scale.length)];
        this.tone(mtof(n), t, spb * 1.6, { type: 'sine', vol: 0.045, attack: 0.01, bus: B });
      }
      this.bgm.next += spb;
      this.bgm.step++;
    }
  },
};
