// Web Audio 합성 피아노. 샘플 파일 없이 배음을 겹쳐 소리를 만든다.

// [배음 배수, 세기]
const PARTIALS = [
  [1, 1.0],
  [1.0015, 0.3],
  [2, 0.42],
  [3, 0.22],
  [4, 0.12],
  [5, 0.07],
  [6, 0.04],
];

export class PianoAudio {
  constructor() {
    this.ctx = null;
    this.bus = null;
  }

  // 사용자 터치 안에서 호출해야 모바일에서 소리가 난다.
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
      } catch {}
      const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      comp.connect(ctx.destination);

      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(comp);

      const verb = ctx.createConvolver();
      verb.buffer = this.impulse(2.2, 3);
      const wet = ctx.createGain();
      wet.gain.value = 0.2;
      this.master.connect(verb);
      verb.connect(wet);
      wet.connect(comp);

      const len = Math.floor(ctx.sampleRate * 0.06);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      // iOS 잠금 해제용 무음 재생
      const unlock = ctx.createBufferSource();
      unlock.buffer = ctx.createBuffer(1, 1, 22050);
      unlock.connect(ctx.destination);
      unlock.start(0);

      this.resetBus();
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  // 예약된 음을 모두 끊고 새 출력 버스를 만든다 (재시작/종료 시).
  resetBus() {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.bus) {
      const old = this.bus;
      old.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => old.disconnect(), 300);
    }
    this.bus = ctx.createGain();
    this.bus.connect(this.master);
  }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  note(midi, when, dur, vel = 0.8) {
    const ctx = this.ctx;
    if (!ctx) return;
    when = Math.max(when, ctx.currentTime);
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const end = when + dur;

    const out = ctx.createGain();
    out.gain.value = vel;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.3;
    lp.frequency.setValueAtTime(Math.min(16000, f * 9), when);
    lp.frequency.exponentialRampToValueAtTime(Math.max(500, f * 2.5), when + 1.5);
    lp.connect(out);
    out.connect(this.bus);

    const decay = Math.max(0.9, Math.min(4, 3.2 - (midi - 60) * 0.045));
    let last;
    for (const [h, amp] of PARTIALS) {
      const freq = f * h * (1 + 0.00035 * h * h);
      if (freq > ctx.sampleRate / 2.2) continue;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      const peak = amp * 0.2;
      const tau = (decay / (1 + (h - 1) * 0.7)) * 0.35;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(peak, when + 0.004);
      g.gain.setTargetAtTime(peak * 0.35, when + 0.004, 0.08);
      if (when + 0.25 < end) g.gain.setTargetAtTime(0, when + 0.25, tau);
      g.gain.setTargetAtTime(0, end, 0.07);
      o.connect(g);
      g.connect(lp);
      o.start(when);
      o.stop(end + 0.6);
      last = o;
    }
    if (last) last.onended = () => out.disconnect();

    // 해머 타격음
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(8000, f * 4);
    bp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.06 * vel, when);
    ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(out);
    src.start(when);
  }

  // 블록을 노트 위에 놓았을 때 짧게 들려주는 소리
  preview(pitches) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    pitches.forEach((p, i) => this.note(p, t + i * 0.035, 0.18, 0.42));
  }

  // 빈칸에 놓았을 때
  thud() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.3);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.connect(lp);
    lp.connect(ng);
    ng.connect(this.master);
    src.start(t);
  }

  // 카운트인 박자
  tick(when, accent) {
    const ctx = this.ctx;
    if (!ctx) return;
    when = Math.max(when, ctx.currentTime);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = accent ? 1760 : 1175;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.12, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    o.connect(g);
    g.connect(this.bus);
    o.start(when);
    o.stop(when + 0.08);
  }

  // 마디를 완벽하게 채웠을 때
  sparkle() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [2093, 2637, 3136, 4186].forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      const s = t + i * 0.05;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.06, s + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.35);
      o.connect(g);
      g.connect(this.master);
      o.start(s);
      o.stop(s + 0.4);
    });
  }
}
