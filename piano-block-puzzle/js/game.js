// 게임 본체: 상단 피아노 롤(보드) + 하단 블록 3개.
// 재생선은 보드 왼쪽에서 한 칸 위치에 고정되고, 노트가 오른쪽에서 왼쪽으로 흘러온다.
//
// 모드
//   flow  흐름 모드: 곡 템포대로 계속 흘러가고, 흘러오는 노트 위에 블록을 놓는다.
//   stop  정지 모드: 한 페이지를 30초 동안 멈춰 두고 블록을 놓는다. 시간이 끝나면(또는 다 채우면)
//         그 페이지만 흘러가며 연주하고 다음 페이지로. 모든 페이지가 끝나면 전체 연주.
//   band  합주 모드: 페이지마다 피아노 → 드럼 → 보컬을 채우고 그 페이지를 합주로 들려준다.
//         30초 정지(악기마다 멈춰서 채움)와 자동 이동(악기마다 페이지가 흘러오는 동안 채움) 둘 다 된다.
//   free  자유 작곡: 목표 노트 없이 놓은 블록이 그대로 음이 된다. 시간 제한 없음.
//         정지(페이지 단위)와 자동 이동(계속 흘러가며 놓기) 둘 다 된다.
//
// 시계는 AudioContext.currentTime. 일시정지하면 컨텍스트를 멈춰 시계(제한 시간 포함)도 멈춘다.

import { makeTray } from './pieces.js';
import { INSTRUMENTS, melodicInst, pianoRows, vocalRows, drumRows, solfege, isBlack } from './instruments.js';
import { drawBlock, drawBomb, rrect, shade } from './draw.js';
import { KEY_ART } from './key-art.js';

// 건반 질감 그림 (읽기 전에는 단색으로 그린다)
const KEY_IMG = {};
if (typeof Image !== 'undefined') {
  for (const [k, data] of Object.entries(KEY_ART)) {
    KEY_IMG[k] = new Image();
    KEY_IMG[k].src = `data:image/webp;base64,${data}`;
  }
}
const keyReady = (k) => KEY_IMG[k]?.complete && KEY_IMG[k].naturalWidth > 0;

export const SCENE_TIME = 30; // 정지 모드 한 페이지 제한 시간(초)
const PLAYHEAD_COLS = 1; // 재생선 왼쪽에 보이는 칸 수
const SCHEDULE_AHEAD = 0.1; // 오디오 예약 선행 시간(초)
const RULER_H = 18;
const MAX_ROWS = 40;
const MAX_CELL = 64; // 칸 폭 상한 (넓은 화면에서 블록이 너무 커지지 않게)
const STORE_MAX = 9; // 보관함에 쌓을 수 있는 블록 수
const STORE_SLOT = 3; // 드래그 출처: 0~2 = 트레이 칸, 3 = 보관함
const OFFSCREEN_COLS = 3; // 자동 이동 중 화면 오른쪽 밖으로 걸쳐 놓을 수 있는 칸 수
const FREE_LIVE_STEPS = 256; // 자유 작곡 자동 이동의 최대 길이(칸)

const POINTS_GOOD = 100;
const POINTS_BAD = 50;
const POINTS_CLEAR = 300;
const POINTS_PER_SEC = 10;

const KEY = (r, c) => c * 128 + r;
// 음정(반음 수 % 12)별 어울림: 화음 추천 점수에 쓴다
const CONSONANCE = [0.4, -2.5, -2, 0.8, 0.8, 0.3, -2.5, 0.8, 0.8, 0.8, -2, -2.5];
const WHITE = '#f3f5f7';
const FONT = '"Black Han Sans", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

const COL = {
  bg: '#121513',
  void: '#0f1211',
  rowWhite: '#252a27',
  rowBlack: '#1d211f',
  rowA: '#232825',
  rowB: '#1d2220',
  rowLine: 'rgba(0,0,0,0.35)',
  step: 'rgba(255,255,255,0.04)',
  beat: 'rgba(255,255,255,0.09)',
  bar: 'rgba(255,255,255,0.24)',
  past: 'rgba(0,0,0,0.3)',
  outside: 'rgba(0,0,0,0.45)',
  offScene: 'rgba(6,8,7,0.55)',
  noteMiss: 'rgba(8,16,10,0.6)',
  ruler: '#151816',
  rulerText: '#8c958f',
  playhead: '#f4f6f4',
  keyWhite: '#e6e9e6',
  keyLine: '#a9b0aa',
  keyBlack: '#161817',
  keyLabel: '#78807a',
  trayTop: '#25584f',
  trayBottom: '#183b36',
  hint: 'rgba(255,255,255,0.85)',
};

const JUDGE_STYLE = {
  FANTASTIC: { fill: ['#fff3a6', '#ffb02e'], size: 1 },
  GOOD: { fill: ['#c9fbff', '#3cc1f0'], size: 0.9 },
  BAD: { fill: ['#ffb3a8', '#f2463a'], size: 0.95 },
  CLEAR: { fill: ['#d6ffe6', '#34d27a'], size: 0.9 },
  BOOM: { fill: ['#ffe0a3', '#ff7a2e'], size: 0.95 },
  'ALL CLEAR': { fill: ['#fff3a6', '#ffb02e'], size: 0.85 },
  'TIME UP': { fill: ['#ffffff', '#b8c0bb'], size: 0.85 },
};

const keyboardWidth = (W) => Math.round(Math.min(64, Math.max(46, W * 0.13)));
// 하단 블록 트레이 높이: 화면 높이의 17% (120~170px)
const trayHeight = (H) => Math.round(Math.min(170, Math.max(120, H * 0.17)));
const pianoMinRows = (p) => Math.max(12, p.src.hi - p.src.lo + 3);

export class Game {
  constructor(canvas, audio, hooks) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.audio = audio;
    this.hooks = hooks;
    this.state = 'idle';
    this.song = null;
    this.parts = null;
    this.W = 0;
    this.H = 0;
    this.dpr = 1;
    this.pos = 0;
    this.drag = null;
    this.lastTs = null;
    this.particles = [];
    this.popups = [];
    this.rings = [];

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e, true));

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  get now() {
    return this.audio.now;
  }

  // ---------- 배치 / 크기 ----------

  resize(w, h) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.W = w;
    this.H = h;
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    this.cv.style.width = `${w}px`;
    this.cv.style.height = `${h}px`;
    this.layout();
  }

  // 칸 폭은 한 페이지가 재생선부터 화면 오른쪽 끝까지 차도록 정하고,
  // 칸 높이는 악기마다 줄 수에 맞춰 따로 정한다 (피아노는 폭을 넘지 않게, 줄이 많으면 납작해진다).
  layout(refit = false) {
    if (!this.song || !this.W) return;
    const { W, H } = this;
    this.kbW = keyboardWidth(W);
    const gridW = W - this.kbW;
    this.cellW = Math.max(10, Math.floor(Math.min(MAX_CELL, gridW / (this.song.sceneSteps + PLAYHEAD_COLS))));
    this.rollTop = RULER_H;
    this.rollBottom = H - trayHeight(H);
    const rollH = this.rollBottom - this.rollTop;
    this.phX = this.kbW + this.cellW * PLAYHEAD_COLS;
    this.aheadCols = (W - this.phX) / this.cellW;
    this.behindCols = PLAYHEAD_COLS;

    for (const p of this.parts) {
      if (p.inst.id === 'piano') {
        const need = p.rows ? p.rows.length : pianoMinRows(p);
        p.cellH = Math.max(8, Math.floor(Math.min(this.cellW, rollH / need)));
        if (refit) this.assignRows(p, Math.floor(rollH / p.cellH));
      } else {
        if (refit) this.assignRows(p);
        p.cellH = Math.floor(Math.min(rollH / p.rows.length, this.cellW * p.inst.maxAspect));
      }
      p.top = Math.round(this.rollTop + (rollH - p.rows.length * p.cellH) / 2);
    }
    this.trayTop = this.rollBottom;
    // 하단: 블록 3칸 + 오른쪽 보관함
    this.storeW = Math.round(Math.min(110, Math.max(72, W * 0.22)));
    this.slotW = (W - this.storeW) / 3;
    this.hooks.layout?.({ trayTop: this.trayTop, H });
  }

  // 줄 배치를 정하고 노트를 줄에 매핑한다. 피아노는 남는 세로 공간(fit 줄)을 건반 줄로 채운다.
  assignRows(p, fit = 0) {
    const id = p.inst.id;
    if (id === 'piano') {
      const count = Math.min(MAX_ROWS, Math.max(pianoMinRows(p), fit));
      const top = Math.ceil((p.src.lo + p.src.hi + count - 1) / 2);
      p.rows = pianoRows(top, count);
    } else if (id === 'vocal') {
      p.rows = vocalRows(p.src.lo, p.src.hi);
    } else {
      p.rows = drumRows();
    }
    const index = new Map(p.rows.map((r, i) => [r.key, i]));
    p.noteAt = new Map();
    p.byCol = [];
    for (const n of p.notes) {
      n.row = index.get(n.key);
      for (let c = n.start; c < n.start + n.len; c++) {
        p.noteAt.set(KEY(n.row, c), n);
        (p.byCol[c] ||= []).push(n);
      }
    }
  }

  xOf(col) {
    return this.phX + (col - this.pos) * this.cellW;
  }

  // ---------- 게임 흐름 ----------

  // opts.auto: 자유 작곡을 자동 이동으로 진행
  start(song, mode, opts = {}) {
    this.song = song;
    this.mode = mode;
    this.free = mode === 'free';
    this.auto = !!opts.auto;
    // 자유 작곡에서 반투명 추천 블록 표시
    this.hints = this.free && !!opts.hints;
    this.hintCache = null;
    this.pieceSeq = 0;
    // live: 곡 전체가 한 번에 흘러가는 진행 (곡 연주 자동 이동, 자유 작곡 자동 이동)
    this.live = mode === 'flow' || (this.free && this.auto);
    this.stepSec = song.stepSec;
    this.length = this.free ? (this.live ? FREE_LIVE_STEPS : song.sceneSteps) : song.length;
    this.parts = song.parts.map((src) => ({
      inst: src.inst === 'piano' ? melodicInst(opts.timbre) : INSTRUMENTS[src.inst],
      src,
      notes: src.notes.map((n) => ({ ...n })),
      rows: null,
      occupied: new Map(),
      glow: new Map(),
    }));
    this.part = this.parts[0];
    this.view = 'part';
    this.layout(true);

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.perfects = 0;
    this.goodCells = 0;
    this.badCells = 0;
    this.penaltyBank = 0;
    this.totalTargets = this.parts.reduce((sum, p) => sum + p.noteAt.size, 0);
    this.pageScores = new Map();
    this.pageCard = null;
    this.sceneClears = 0;
    this.scenesDone = 0;
    this.particles = [];
    this.popups = [];
    this.rings = [];
    this.events = [];
    this.judgement = null;
    this.banner = null;
    this.shake = 0;
    this.drag = null;
    this.tray = null;
    this.store = [];
    this.storeBump = -1;
    this.listening = false;

    this.audio.ensure();
    this.audio.resetBus();
    this.queue = this.buildQueue();
    this.state = 'playing';
    this.lastTs = null;
    this.lastPlaceAt = this.now;
    this.next();
  }

  get sceneCount() {
    return Math.max(1, Math.ceil(this.length / this.song.sceneSteps));
  }

  buildQueue() {
    if (this.live) return [this.liveFlow(0)];
    if (this.free) return this.freeScene(0);
    const q = [];
    const pageLive = this.mode === 'band' && this.auto;
    for (let k = 0; k < this.sceneCount; k++) {
      for (const part of this.parts) {
        if (pageLive) {
          // 합주 자동 이동: 악기 페이지가 오른쪽에서 흘러오는 동안 블록을 놓는다
          q.push({ type: 'intro', scene: k, part, page: true });
          q.push({ type: 'flow', live: true, page: true, scene: k, parts: [part], view: 'part', part });
        } else {
          q.push({ type: 'intro', scene: k, part });
          q.push({ type: 'place', scene: k, part });
          q.push({ type: 'flow', scene: k, parts: [part], view: 'part', part });
        }
      }
      if (this.parts.length > 1) {
        q.push({ type: 'intro', scene: k, band: true });
        q.push({ type: 'flow', scene: k, parts: this.parts, view: 'lanes' });
      }
    }
    q.push(...this.finaleQueue());
    return q;
  }

  // 흘러오기 시작할 때 재생선 앞에 미리 보이는 칸 수 (박 단위로 맞춤, 최소 한 마디)
  leadSteps(frac) {
    const spb = this.song.stepsPerBeat;
    return Math.max(this.song.stepsPerBar, Math.ceil((this.aheadCols * frac) / spb) * spb);
  }

  liveFlow(startAt) {
    return { type: 'flow', live: true, startAt, parts: this.parts, view: 'part', part: this.parts[0] };
  }

  freeScene(k) {
    const part = this.parts[0];
    return [
      { type: 'place', scene: k, part },
      { type: 'flow', scene: k, parts: [part], view: 'part', part },
    ];
  }

  finaleQueue(original = false) {
    const view = this.parts.length > 1 ? 'lanes' : 'part';
    return [
      { type: 'intro', finale: true, original },
      { type: 'flow', finale: true, original, parts: this.parts, view, part: this.parts[0] },
    ];
  }

  next() {
    const ph = this.queue.shift();
    if (!ph) {
      this.phase = null;
      if (this.listening) {
        this.listening = false;
        this.state = 'ended';
        this.hooks.listened?.();
      } else {
        this.finish();
      }
      return;
    }
    this.phase = ph;
    this.enter(ph);
  }

  enter(ph) {
    const now = this.now;
    const ss = this.song.sceneSteps;
    const n = this.sceneCount;
    this.drag = null;
    if (ph.type === 'intro') {
      if (ph.finale) {
        ph.until = now + 1.4;
        this.view = this.parts.length > 1 ? 'lanes' : 'part';
        this.part = this.parts[0];
        this.pos = 0;
        this.showBanner(ph.original ? '원곡 듣기' : '전체 연주', this.song.title, '#ffe27a', 1.4);
      } else if (ph.band) {
        ph.until = now + 1.1;
        this.view = 'lanes';
        this.pos = ph.scene * ss;
        this.showBanner('합주', `${ph.scene + 1} / ${n} 페이지`, '#ffe27a', 1.1);
      } else {
        ph.until = now + 0.9;
        this.part = ph.part;
        this.view = 'part';
        this.pos = ph.scene * ss - (ph.page ? this.leadSteps(0.9) : 0);
        if (this.parts.length > 1) this.showBanner(ph.part.inst.name, `${ph.scene + 1} / ${n} 페이지`, ph.part.inst.color, 0.9);
        else this.showBanner(`${ph.scene + 1} 페이지`, `전체 ${n}페이지`, ph.part.inst.color, 0.9);
      }
    } else if (ph.type === 'place') {
      this.part = ph.part;
      this.view = 'part';
      ph.s0 = ph.scene * ss;
      ph.s1 = Math.min(this.length, ph.s0 + ss);
      ph.deadline = now + SCENE_TIME;
      ph.lastSec = SCENE_TIME;
      this.pos = ph.s0;
      this.tray = this.newTray(0.08);
    } else if (ph.type === 'hold') {
      ph.until = now + ph.dur;
    } else if (ph.type === 'flow') {
      if (ph.live && ph.page) {
        ph.s0 = ph.scene * ss;
        ph.s1 = Math.min(this.length, ph.s0 + ss);
        ph.from = ph.s0 - this.leadSteps(0.9);
        ph.to = ph.s1;
        ph.playFrom = ph.s0;
      } else if (ph.live) {
        ph.from = ph.startAt - this.leadSteps(0.6);
        ph.to = this.length;
        ph.playFrom = ph.startAt;
      } else {
        ph.from = ph.finale ? 0 : ph.scene * ss;
        ph.to = ph.finale ? this.length : Math.min(this.length, ph.from + ss);
      }
      ph.processed = ph.from - 1;
      ph.t0 = now + (ph.finale || ph.live ? 0.25 : 0.08);
      ph.end = ph.t0 + (ph.to - ph.from) * this.stepSec + (ph.finale || (ph.live && !ph.page) ? 1.2 : 0.1);
      this.view = ph.view;
      if (ph.part) this.part = ph.part;
      this.pos = ph.from;
      if (ph.live) this.tray = this.newTray(0.08);
    }
  }

  showBanner(title, sub, color, life) {
    this.banner = { title, sub, color, t0: this.now, life };
  }

  newTray(bombChance) {
    return makeTray(this.upcomingGreen(), { fits: !this.free, bombChance: this.free ? 0.2 : bombChance });
  }

  // 지금 블록을 놓을 수 있는 열 범위 [첫 열, 끝 열]
  placeRange() {
    const ph = this.phase;
    if (!ph || this.state !== 'playing') return null;
    if (ph.type === 'place') return [ph.s0, ph.s1 - 1];
    if (ph.type === 'flow' && ph.live) {
      const lo = Math.max(0, ph.processed + 1, ph.page ? ph.s0 : 0);
      const hi = Math.min(ph.page ? ph.s1 - 1 : this.length - 1, Math.floor(this.pos + this.aheadCols) + OFFSCREEN_COLS);
      return lo <= hi ? [lo, hi] : null;
    }
    return null;
  }

  // 놓을 수 있는 범위 안의 덮이지 않은 노트 칸 (트레이 모양 생성용)
  upcomingGreen() {
    const range = this.placeRange();
    if (!range || this.free) return [];
    const part = this.part;
    const from = this.phase.live && !this.phase.page ? Math.max(range[0] + 2, 0) : range[0];
    const out = [];
    for (let c = from; c <= range[1]; c++) {
      for (const n of part.byCol[c] || []) {
        if (!part.occupied.has(KEY(n.row, c))) out.push([n.row, c]);
      }
    }
    return out;
  }

  // ---------- 자유 작곡 추천 블록 ----------

  // c열에 놓인 음들 (앞서 추천한 블록 virtual 도 놓인 것으로 친다)
  columnPitches(part, c, virtual) {
    const out = [];
    for (let r = 0; r < part.rows.length; r++) {
      if (part.occupied.has(KEY(r, c)) || virtual?.has(KEY(r, c))) out.push(part.rows[r].key);
    }
    return out;
  }

  // 트레이 블록마다 놓기 좋은 자리 하나 (서로 겹치지 않게). 트레이·블록·범위가 바뀔 때만 다시 계산한다.
  hintsFor() {
    if (!this.hints || !this.tray) return [];
    const range = this.placeRange();
    if (!range) return [];
    const part = this.part;
    const slots = [0, 1, 2, STORE_SLOT];
    const ids = slots.map((i) => this.pieceAt(i)).map((p) => (p ? (p.hintId ||= ++this.pieceSeq) : 0)).join(',');
    const key = `${ids}|${part.occupied.size}|${range[0]}|${range[1]}`;
    if (this.hintCache?.key === key) return this.hintCache.list;

    // 자동 이동에서는 재생선 바로 앞은 옮길 시간이 없으니 건너뛴다
    const from = this.phase.live ? range[0] + Math.ceil(1.2 / this.stepSec) : range[0];
    const list = [];
    const used = new Set();
    for (const slot of slots) {
      const p = this.pieceAt(slot);
      if (!p || p.bomb) continue;
      let best = null;
      for (let c0 = from; c0 + p.w - 1 <= range[1]; c0++) {
        for (let r0 = 0; r0 + p.h <= part.rows.length; r0++) {
          if (!this.canPlace(p, r0, c0)) continue;
          if (p.cells.some(([dr, dc]) => used.has(KEY(r0 + dr, c0 + dc)))) continue;
          const sc = this.hintScore(part, p, r0, c0, from, used);
          if (sc > -Infinity && (!best || sc > best.sc)) best = { slot, r0, c0, sc };
        }
      }
      if (!best) continue;
      list.push(best);
      for (const [dr, dc] of p.cells) used.add(KEY(best.r0 + dr, best.c0 + dc));
    }
    this.hintCache = { key, list };
    return list;
  }

  // 음악적으로 그럴듯한 자리일수록 높은 점수: 다장조 흰 건반, 앞 음과 가까운 음정, 어울리는 화음, 빈 박 채우기
  hintScore(part, p, r0, c0, from, virtual) {
    const { stepsPerBeat } = this.song;
    const cells = [];
    for (const [dr, dc] of p.cells) {
      const pitch = part.rows[r0 + dr].key;
      if (isBlack(pitch)) return -Infinity;
      cells.push({ pitch, c: c0 + dc });
    }
    let score = -(c0 - from) * 0.15; // 왼쪽부터 채우기
    for (const { pitch, c } of cells) {
      score -= Math.abs(pitch - 67) / 10; // 가운데 음역(솔4) 근처
      const col = this.columnPitches(part, c, virtual);
      if (!col.length) score += 1.5;
      for (const q of col) score += CONSONANCE[Math.abs(pitch - q) % 12];
      for (const o of cells) if (o.c === c && o.pitch > pitch) score += CONSONANCE[(o.pitch - pitch) % 12]; // 블록 안 화음
      if (c % stepsPerBeat === 0 && [0, 4, 7].includes(pitch % 12)) score += 0.6; // 박에는 도·미·솔
    }
    // 앞에 놓인 음과 이어지는 멜로디
    const first = cells.reduce((a, b) => (b.c < a.c || (b.c === a.c && b.pitch > a.pitch) ? b : a));
    for (let c = c0 - 1; c >= Math.max(0, c0 - 8); c--) {
      const col = this.columnPitches(part, c, virtual);
      if (!col.length) continue;
      const d = Math.abs(first.pitch - Math.max(...col));
      score += d === 0 ? 0.4 : d <= 2 ? 2 : d <= 4 ? 1.3 : d <= 7 ? 0.3 : -1.2;
      score -= (c0 - c - 1) * 0.25;
      return score;
    }
    return score + (first.pitch % 12 === 0 ? 1 : 0); // 첫 음은 도로 시작
  }

  drawHints(part) {
    const hints = this.hintsFor();
    if (!hints.length) return;
    const g = this.g;
    const cw = this.cellW;
    const ch = part.cellH;
    const d = this.drag;
    const pulse = 0.08 * Math.sin(this.now * 4);
    for (const h of hints) {
      if (d && d.slot !== h.slot) continue;
      const p = this.pieceAt(h.slot);
      if (!p) continue;
      for (const [dr, dc] of p.cells) {
        const x = this.xOf(h.c0 + dc);
        const y = part.top + (h.r0 + dr) * ch;
        g.globalAlpha = (d ? 0.42 : 0.26) + pulse;
        drawBlock(g, x, y, cw, ch, p.color);
        g.globalAlpha = 0.85;
        g.strokeStyle = p.color;
        g.lineWidth = 1.5;
        g.setLineDash([4, 3]);
        g.strokeRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
        g.setLineDash([]);
      }
    }
    g.globalAlpha = 1;
  }

  // ---------- 페이지 점수 ----------

  pageKey(part, col) {
    return `${this.parts.indexOf(part)}:${Math.floor(col / this.song.sceneSteps)}`;
  }

  addPageScore(part, col, points) {
    const k = this.pageKey(part, col);
    this.pageScores.set(k, (this.pageScores.get(k) || 0) + points);
  }

  // 한 페이지 연주가 끝나면 그 페이지에서 얻은 점수와 연주 퍼센트를 카드로 보여준다
  showPageCard(part, page) {
    if (this.free) return;
    const ss = this.song.sceneSteps;
    let total = 0;
    let covered = 0;
    for (let c = page * ss; c < Math.min(this.length, (page + 1) * ss); c++) {
      for (const n of part.byCol[c] || []) {
        total++;
        if (part.occupied.has(KEY(n.row, c))) covered++;
      }
    }
    if (!total) return;
    const score = this.pageScores.get(`${this.parts.indexOf(part)}:${page}`) || 0;
    const name = this.parts.length > 1 ? ` · ${part.inst.name}` : '';
    this.pageCard = {
      title: `${page + 1} 페이지${name}`,
      score,
      pct: Math.round((covered / total) * 100),
      color: part.inst.color,
      t0: this.now,
      life: 2,
    };
  }

  // 정지 모드 페이지 끝: reason = clear | timeup | skip
  endPlace(reason) {
    const ph = this.phase;
    if (!ph || ph.type !== 'place') return;
    const now = this.now;
    this.drag = null;
    if (reason === 'clear') {
      const left = Math.max(0, Math.ceil(ph.deadline - now));
      const bonus = POINTS_CLEAR + left * POINTS_PER_SEC;
      this.score += bonus;
      this.addPageScore(this.part, ph.s0, bonus);
      this.sceneClears++;
      this.judge('ALL CLEAR', `+${bonus}`);
      this.audio.sparkle();
      this.hooks.event?.('clear');
    } else if (reason === 'timeup') {
      this.judge('TIME UP');
      this.hooks.event?.('timeup');
    }
    this.queue.unshift({ type: 'hold', dur: reason === 'skip' ? 0.15 : 0.75 });
    this.next();
  }

  finish() {
    this.state = 'ended';
    this.drag = null;
    let covered = 0;
    let total = 0;
    let blocks = 0;
    for (const p of this.parts) {
      blocks += p.occupied.size;
      for (const k of p.noteAt.keys()) {
        total++;
        if (p.occupied.has(k)) covered++;
      }
    }
    const accuracy = total ? covered / total : 0;
    const stars = accuracy >= 0.85 ? 3 : accuracy >= 0.65 ? 2 : accuracy >= 0.4 ? 1 : 0;
    this.hooks.end?.({
      song: this.song,
      mode: this.mode,
      score: this.score,
      accuracy,
      stars,
      perfects: this.perfects,
      maxCombo: this.maxCombo,
      badCells: this.badCells,
      sceneClears: this.sceneClears,
      scenes: this.sceneCount * (this.free ? 1 : this.parts.length),
      length: this.length,
      blocks,
      covered,
      total,
    });
  }

  // 결과 화면에서 다시 듣기 / 원곡 듣기
  listen(original = false) {
    this.state = 'playing';
    this.listening = true;
    this.audio.resetBus();
    this.queue = this.finaleQueue(original);
    this.lastTs = null;
    this.next();
  }

  // 자유 작곡: 지금까지 만든 곡을 전체 연주하고 완성
  completeFree() {
    if (!this.free || this.state !== 'playing') return false;
    const ph = this.phase;
    if (ph?.live) {
      let maxCol = -1;
      for (const k of this.part.occupied.keys()) maxCol = Math.max(maxCol, Math.floor(k / 128));
      if (maxCol < 0) return false;
      const bar = this.song.stepsPerBar;
      this.length = Math.ceil((maxCol + 1) / bar) * bar;
      this.scenesDone = Math.ceil(this.length / this.song.sceneSteps);
      this.queue = this.finaleQueue();
      this.next();
      return true;
    }
    let scenes = this.scenesDone;
    if (ph && ph.type === 'place') {
      for (const k of this.part.occupied.keys()) {
        if (Math.floor(k / 128) >= ph.s0) {
          scenes = ph.scene + 1;
          break;
        }
      }
    }
    if (scenes === 0) return false;
    this.scenesDone = scenes;
    this.length = scenes * this.song.sceneSteps;
    this.queue = this.finaleQueue();
    this.next();
    return true;
  }

  // 자유 작곡 결과 화면에서 이어서 만들기
  continueFree() {
    this.state = 'playing';
    if (this.live) {
      const startAt = this.length;
      this.length = startAt + FREE_LIVE_STEPS;
      this.queue = [this.liveFlow(startAt)];
    } else {
      this.length = (this.scenesDone + 1) * this.song.sceneSteps;
      this.queue = this.freeScene(this.scenesDone);
    }
    this.lastTs = null;
    this.next();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.drag = null;
    this.audio.suspend();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.lastTs = null;
    this.audio.resume();
  }

  stop() {
    this.state = 'idle';
    this.drag = null;
    this.phase = null;
    this.audio.resetBus();
    this.audio.resume();
  }

  // 정지 모드에서 시간을 기다리지 않고 바로 흘려보내기 (자유 작곡에서는 다음 페이지)
  skip() {
    if (this.state === 'playing' && this.phase?.type === 'place') this.endPlace('skip');
  }

  loop(ts) {
    requestAnimationFrame(this.loop);
    const dt = this.lastTs == null ? 0 : Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    if (this.state === 'playing') this.update();
    if (this.state !== 'paused') this.updateFx(dt);
    this.render();
  }

  update() {
    const now = this.now;
    const ph = this.phase;
    // 블록을 한동안 안 놓으면 알린다 (말 걸기용)
    if (!this.drag && (ph?.type === 'place' || this.live) && now - this.lastPlaceAt > 14) {
      this.lastPlaceAt = now;
      this.hooks.event?.('idle');
    }
    if (ph) {
      if (ph.type === 'intro' || ph.type === 'hold') {
        if (now >= ph.until) this.next();
      } else if (ph.type === 'place') {
        if (!this.free) {
          const left = ph.deadline - now;
          const sec = Math.ceil(left);
          if (sec < ph.lastSec) {
            ph.lastSec = sec;
            if (sec > 0 && sec <= 5) this.audio.tick(now, sec <= 3);
          }
          if (left <= 0) this.endPlace('timeup');
        }
      } else if (ph.type === 'flow') {
        this.updateFlow(now, ph);
      }
    }
    if (this.drag) this.computeSnap();
    while (this.events.length && this.events[0].t <= now) this.fire(this.events.shift());
    this.emitHud();
  }

  emitHud() {
    const ph = this.phase;
    const placing = ph?.type === 'place';
    let scene = 0;
    if (ph?.scene != null) scene = ph.scene;
    else if (ph?.live) scene = Math.max(0, Math.floor(this.pos / this.song.sceneSteps));
    this.hooks.hud?.({
      score: this.score,
      combo: this.combo,
      timer: placing && !this.free ? Math.max(0, ph.deadline - this.now) : null,
      timerTotal: SCENE_TIME,
      placing,
      part: this.view === 'lanes' ? null : this.part?.inst,
      scene,
      scenes: this.sceneCount,
      finale: !!ph?.finale,
      live: !!ph?.live,
      progress: ph?.live && !this.free ? Math.max(0, Math.min(1, this.pos / this.length)) : null,
      percent: this.free || !this.totalTargets ? null : Math.round((this.goodCells / this.totalTargets) * 100),
      bar: Math.max(1, Math.floor(this.pos / this.song.stepsPerBar) + 1),
    });
  }

  updateFlow(now, ph) {
    this.pos = Math.min(ph.to, ph.from + Math.max(0, now - ph.t0) / this.stepSec);
    const horizon = ph.from + Math.floor((now + SCHEDULE_AHEAD - ph.t0) / this.stepSec);
    while (ph.processed < ph.to - 1 && ph.processed < horizon) {
      ph.processed++;
      this.playColumn(ph.processed, ph.t0 + (ph.processed - ph.from) * this.stepSec, ph);
    }
    // 자동 이동(곡 전체): 재생선이 페이지 경계를 지날 때마다 지난 페이지 결과
    if (ph.live && !ph.page) {
      const ss = this.song.sceneSteps;
      const done = now >= ph.end ? Math.ceil(this.length / ss) - 1 : Math.floor(this.pos / ss) - 1;
      if (done >= 0 && done > (ph.lastCard ?? -1)) {
        ph.lastCard = done;
        this.showPageCard(this.parts[0], done);
      }
    }
    if (now < ph.end) return;
    if (ph.page && !this.free && this.sceneComplete()) {
      this.score += POINTS_CLEAR;
      this.addPageScore(ph.part, ph.s0, POINTS_CLEAR);
      this.sceneClears++;
      this.judge('ALL CLEAR', `+${POINTS_CLEAR}`);
      this.audio.sparkle();
    }
    // 정지 모드 / 합주의 악기 페이지가 다 흘러갔으면 그 페이지 결과
    if (!ph.live || ph.page) {
      if (!ph.finale && ph.view === 'part' && ph.scene != null) this.showPageCard(ph.part, ph.scene);
    }
    if (this.free && ph.live) {
      // 자동 이동 최대 길이까지 갔으면 지금까지 만든 곡으로 완성
      if (!this.completeFree()) this.finish();
      return;
    }
    if (this.free && !ph.finale) {
      this.scenesDone = ph.scene + 1;
      this.length = (this.scenesDone + 1) * this.song.sceneSteps;
      this.queue.push(...this.freeScene(this.scenesDone));
    }
    this.next();
  }

  pushEvent(ev) {
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].t > ev.t) i--;
    this.events.splice(i, 0, ev);
  }

  sound(part, key, t, run) {
    const dur = run * this.stepSec * 0.97;
    if (part.inst.id === 'drums') this.audio.drum(key, t, 0.9);
    else if (part.inst.id === 'vocal') this.audio.voice(key, t, dur, 0.85);
    else this.audio.note(key, t, dur, 0.85, part.inst.timbre);
  }

  // 재생선이 c열에 닿기 직전에 한 번 호출. 덮인 노트와 노트 밖에 놓인 블록(그 줄의 음)이 소리를 낸다.
  // 원곡 듣기는 원래 노트만.
  playColumn(c, t, ph) {
    const start = ph.playFrom || 0;
    if (c < start) {
      // 흘러오기 전 마지막 한 마디는 박자 카운트
      const { stepsPerBeat: spb, stepsPerBar: bar } = this.song;
      const d = c - start;
      if (d >= -bar && ((d % spb) + spb) % spb === 0) this.audio.tick(t, d === -bar);
      return;
    }
    for (const part of ph.parts) {
      const drum = part.inst.id === 'drums';
      if (this.free) {
        for (let r = 0; r < part.rows.length; r++) {
          const o = part.occupied.get(KEY(r, c));
          if (!o) continue;
          if (!drum && c > ph.from && part.occupied.has(KEY(r, c - 1))) continue;
          let run = 1;
          while (!drum && c + run < ph.to && part.occupied.has(KEY(r, c + run))) run++;
          this.sound(part, part.rows[r].key, t, run);
          this.pushEvent({ t, part, row: r, col: c, run, color: o.color });
        }
        continue;
      }
      for (const n of part.byCol[c] || []) {
        const has = (cc) => ph.original || part.occupied.has(KEY(n.row, cc));
        if (!has(c)) continue;
        let run = 1;
        if (!drum) {
          if (c > n.start && c > ph.from && has(c - 1)) continue;
          while (c + run < n.start + n.len && c + run < ph.to && has(c + run)) run++;
        }
        this.sound(part, n.key, t, run);
        this.pushEvent({ t, part, row: n.row, col: c, run, color: ph.original ? part.inst.color : WHITE });
      }
      if (ph.original) continue;
      // 노트 밖 블록: 같은 줄에 이어진 노트 밖 블록은 하나의 음으로 묶는다 (드럼은 칸마다 한 번)
      const off = (r, cc) => {
        const o = part.occupied.get(KEY(r, cc));
        return o && !o.good ? o : null;
      };
      for (let r = 0; r < part.rows.length; r++) {
        const o = off(r, c);
        if (!o) continue;
        if (!drum && c > ph.from && off(r, c - 1)) continue;
        let run = 1;
        while (!drum && c + run < ph.to && off(r, c + run)) run++;
        this.sound(part, part.rows[r].key, t, run);
        this.pushEvent({ t, part, row: r, col: c, run, color: o.color });
      }
    }
  }

  fire(ev) {
    const { part } = ev;
    const color = ev.color === WHITE ? part.inst.top : ev.color;
    part.glow.set(ev.row, { until: ev.t + Math.max(0.12, ev.run * this.stepSec), color });
    for (let i = 0; i < ev.run; i++) {
      const o = part.occupied.get(KEY(ev.row, ev.col + i));
      if (o) o.hitAt = ev.t + i * this.stepSec;
    }
    const y = this.rowY(part, ev.row);
    if (y == null) return;
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: this.phX,
        y,
        vx: -30 - Math.random() * 120,
        vy: (Math.random() - 0.5) * 200,
        life: 0.4 + Math.random() * 0.25,
        age: 0,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  // 화면에 보이는 줄의 세로 중앙 (합주 화면에서는 레인 안의 위치)
  rowY(part, row) {
    if (this.view === 'lanes') {
      const lane = this.lane(this.parts.indexOf(part));
      return lane.top + (row + 0.5) * lane.rowH;
    }
    if (part !== this.part) return null;
    return part.top + (row + 0.5) * part.cellH;
  }

  lane(i) {
    const h = (this.rollBottom - this.rollTop) / this.parts.length;
    const y0 = this.rollTop + i * h;
    return { y0, h, top: y0 + 4, rowH: (h - 8) / this.parts[i].rows.length };
  }

  updateFx(dt) {
    if (!this.song) return;
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 380 * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const p of this.popups) p.age += dt;
    this.popups = this.popups.filter((p) => p.age < p.life);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < r.life);
    this.shake = Math.max(0, this.shake - dt * 3);
  }

  // ---------- 블록 ----------

  canPlace(piece, r0, c0) {
    const range = this.placeRange();
    if (!range) return false;
    const part = this.part;
    for (const [dr, dc] of piece.cells) {
      const r = r0 + dr;
      const c = c0 + dc;
      if (r < 0 || r >= part.rows.length || c < range[0] || c > range[1]) return false;
      if (!piece.bomb && part.occupied.has(KEY(r, c))) return false;
    }
    return true;
  }

  computeSnap() {
    const d = this.drag;
    const p = d.piece;
    const part = this.part;
    const cw = this.cellW;
    const ch = part.cellH;
    d.px = d.x - (p.w * cw) / 2;
    d.py = d.y - d.lift(ch) - p.h * ch;
    // 손가락이 보관함 위면 보드에 놓지 않고 보관
    d.overStore = d.slot !== STORE_SLOT && this.overStore(d.x, d.y);
    if (d.overStore) {
      d.snap = null;
      return;
    }
    const bottom = part.top + part.rows.length * ch;
    if (d.py + p.h * ch < part.top - ch * 0.5 || d.py > bottom - ch * 0.5) {
      d.snap = null;
      return;
    }
    const c0 = Math.round((d.px - this.phX) / cw + this.pos);
    const r0 = Math.round((d.py - part.top) / ch);
    d.snap = this.canPlace(p, r0, c0) ? { r0, c0 } : null;
  }

  place(slot, piece, r0, c0) {
    const part = this.part;
    const now = this.now;
    this.lastPlaceAt = now;
    if (piece.bomb) {
      this.detonate(piece, r0, c0);
    } else {
      let good = 0;
      let bad = 0;
      const keys = new Set();
      for (const [dr, dc] of piece.cells) {
        const r = r0 + dr;
        const k = KEY(r, c0 + dc);
        const note = this.free ? null : part.noteAt.get(k);
        const ok = this.free || !!note;
        // 노트 위 칸은 하얀색, 노트 밖 칸은 블록 원래 색
        part.occupied.set(k, { color: !this.free && note ? WHITE : piece.color, good: ok, born: now, hitAt: 0 });
        keys.add(part.rows[r].key);
        if (ok) good++;
        else bad++;
      }
      this.previewSound(part, [...keys], bad > 0 && !this.free);
      if (!this.free) this.scorePlacement(good, bad, piece, r0, c0);
    }

    this.consume(slot);
    if (!this.free && this.phase?.type === 'place' && this.sceneComplete()) this.endPlace('clear');
  }

  // 0~2 = 트레이 칸, 3 = 보관함 맨 위
  pieceAt(slot) {
    if (slot === STORE_SLOT) return this.store[this.store.length - 1] || null;
    return this.tray?.[slot] || null;
  }

  consume(slot) {
    if (slot === STORE_SLOT) {
      this.store.pop();
      return;
    }
    this.tray[slot] = null;
    if (this.tray.every((t) => !t)) this.tray = this.newTray(this.wrongInRange() ? 0.45 : 0.1);
  }

  overStore(x, y) {
    return y >= this.trayTop && x >= this.W - this.storeW;
  }

  // 안 쓰는 블록을 보관함에 쌓는다. 트레이에서는 쓴 것으로 친다.
  stash(slot, piece) {
    if (this.store.length >= STORE_MAX) {
      this.popups.push({
        text: '보관함이 가득 찼어요',
        x: this.W - this.storeW / 2 - 30,
        y: this.trayTop - 8,
        age: 0,
        life: 1.1,
        size: 14,
        color: '#ff7b6e',
      });
      return;
    }
    this.store.push(piece);
    this.storeBump = this.now;
    this.audio.tick(this.now, false);
    this.consume(slot);
  }

  // 블록을 놓을 때 덮은 줄의 건반(드럼/보컬) 소리
  previewSound(part, keys, bad) {
    const id = part.inst.id;
    if (id === 'drums') keys.forEach((k, i) => this.audio.drum(k, this.now + i * 0.03, 0.6));
    else if (id === 'vocal') keys.forEach((k, i) => this.audio.voice(k, this.now + i * 0.04, 0.22, 0.6));
    else this.audio.preview(keys.sort((a, b) => a - b), part.inst.timbre);
    if (bad) this.audio.thud();
  }

  scorePlacement(good, bad, piece, r0, c0) {
    this.goodCells += good;
    this.badCells += bad;
    let gain;
    let word;
    if (bad === 0) {
      this.combo++;
      this.perfects++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      gain = Math.round(good * POINTS_GOOD * (1 + Math.min(this.combo - 1, 10) * 0.2));
      word = 'FANTASTIC';
    } else {
      this.combo = 0;
      gain = good * POINTS_GOOD - bad * POINTS_BAD;
      word = good / (good + bad) >= 0.5 ? 'GOOD' : 'BAD';
      if (word === 'BAD') this.shake = 1;
    }
    const before = this.score;
    this.score = Math.max(0, this.score + gain);
    this.addPageScore(this.part, c0, this.score - before);
    // 실제로 깎인 감점만큼만 폭탄으로 돌려받을 수 있다 (0점 아래로는 안 깎이므로)
    if (bad) this.penaltyBank += Math.min(bad * POINTS_BAD, before + good * POINTS_GOOD);
    this.judge(word, this.combo > 1 ? `${this.combo} COMBO` : '');
    this.hooks.event?.('judge', { word, combo: this.combo });
    this.popups.push({
      text: gain >= 0 ? `+${gain}` : `${gain}`,
      x: this.xOf(c0) + (piece.w * this.cellW) / 2,
      y: this.part.top + r0 * this.part.cellH,
      age: 0,
      life: 0.9,
      size: 18,
      color: gain > 0 ? '#ffe27a' : '#ff7b6e',
    });
  }

  judge(word, sub = '') {
    this.judgement = { word, sub, t0: this.now };
  }

  // 폭탄: 모양 안의 블록을 지운다. 빈칸 블록을 지우면 감점을 돌려받고, 노트 위 블록을 지우면 점수를 잃는다.
  detonate(piece, r0, c0) {
    const part = this.part;
    let removedGood = 0;
    let removedBad = 0;
    for (const [dr, dc] of piece.cells) {
      const r = r0 + dr;
      const c = c0 + dc;
      const x = this.xOf(c) + this.cellW / 2;
      const y = part.top + (r + 0.5) * part.cellH;
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 220;
        this.particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 60,
          life: 0.5 + Math.random() * 0.3,
          age: 0,
          size: 3 + Math.random() * 4,
          color: ['#ffd34d', '#ff7a2e', '#ffffff', '#f2463a'][i % 4],
        });
      }
      const k = KEY(r, c);
      const o = part.occupied.get(k);
      if (!o) continue;
      part.occupied.delete(k);
      if (o.good) removedGood++;
      else removedBad++;
    }
    const cx = this.xOf(c0) + (piece.w * this.cellW) / 2;
    const cy = part.top + (r0 + piece.h / 2) * part.cellH;
    this.rings.push({ x: cx, y: cy, age: 0, life: 0.45, r: Math.max(piece.w, piece.h) * this.cellW });
    this.shake = 0.7;
    this.audio.boom();
    this.hooks.event?.('bomb');
    if (!this.free) {
      this.goodCells -= removedGood;
      this.badCells -= removedBad;
      const refund = Math.min(removedBad * POINTS_BAD, this.penaltyBank);
      this.penaltyBank -= refund;
      const before = this.score;
      this.score = Math.max(0, this.score + refund - removedGood * POINTS_GOOD);
      this.addPageScore(part, c0, this.score - before);
    }
    this.judge(removedBad > 0 || (this.free && removedGood > 0) ? 'CLEAR' : 'BOOM');
  }

  wrongInRange() {
    const range = this.placeRange();
    if (!range || this.free) return false;
    for (const [k, o] of this.part.occupied) {
      const c = Math.floor(k / 128);
      if (!o.good && c >= range[0] && c <= range[1]) return true;
    }
    return false;
  }

  sceneComplete() {
    const ph = this.phase;
    const part = this.part;
    let any = false;
    for (let c = ph.s0; c < ph.s1; c++) {
      for (const n of part.byCol[c] || []) {
        any = true;
        if (!part.occupied.has(KEY(n.row, c))) return false;
      }
    }
    return any;
  }

  // ---------- 입력 ----------

  point(e) {
    const r = this.cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  onDown(e) {
    if (this.drag || !this.placeRange() || !this.tray) return;
    const { x, y } = this.point(e);
    if (y < this.trayTop) return;
    const slot = x >= this.W - this.storeW ? STORE_SLOT : Math.min(2, Math.floor(x / this.slotW));
    const piece = this.pieceAt(slot);
    if (!piece) return;
    e.preventDefault();
    try {
      this.cv.setPointerCapture(e.pointerId);
    } catch {}
    const touch = e.pointerType !== 'mouse';
    const lift = (ch) => (touch ? ch * 1.2 + 26 : -(piece.h * ch) / 2);
    this.drag = { id: e.pointerId, slot, piece, x, y, lift, snap: null };
    this.computeSnap();
  }

  onMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const { x, y } = this.point(e);
    d.x = x;
    d.y = y;
    this.computeSnap();
  }

  onUp(e, cancelled = false) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!cancelled && this.placeRange()) this.computeSnap();
    this.drag = null;
    if (cancelled || this.pieceAt(d.slot) !== d.piece) return;
    if (d.slot !== STORE_SLOT && this.overStore(d.x, d.y)) {
      this.stash(d.slot, d.piece);
      return;
    }
    if (d.snap) this.place(d.slot, d.piece, d.snap.r0, d.snap.c0);
  }

  // ---------- 그리기 ----------

  render() {
    const g = this.g;
    const { W, H } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = COL.bg;
    g.fillRect(0, 0, W, H);
    if (!this.song || !this.cellW || !this.parts) return;

    g.save();
    if (this.shake > 0) {
      const m = this.shake * 5;
      g.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    if (this.view === 'lanes') this.drawLanes();
    else this.drawPart(this.part);
    this.drawPlayhead();
    this.drawParticles();
    this.drawRuler();
    g.restore();

    this.drawTray();
    this.drawHint();
    this.drawDrag();
    this.drawPopups();
    this.drawJudgement();
    this.drawBanner();
    this.drawPageCard();
  }

  visibleCols() {
    return [Math.floor(this.pos - this.behindCols) - 1, Math.ceil(this.pos + this.aheadCols) + 1];
  }

  drawGridLines(top, bottom) {
    const g = this.g;
    const [c0, c1] = this.visibleCols();
    const { stepsPerBar: bar, stepsPerBeat: beat } = this.song;
    for (let c = c0; c <= c1; c++) {
      const x = Math.round(this.xOf(c));
      if (x < this.kbW) continue;
      g.fillStyle = c % bar === 0 ? COL.bar : c % beat === 0 ? COL.beat : COL.step;
      g.fillRect(x, top, 1, bottom - top);
    }
  }

  drawShading(top, bottom) {
    const g = this.g;
    const { W, kbW, phX } = this;
    const h = bottom - top;
    const ph = this.phase;
    if (ph && (ph.type === 'place' || ph.page)) {
      // 이번 페이지 밖은 어둡게
      g.fillStyle = COL.offScene;
      const x1 = this.xOf(ph.s1);
      if (x1 < W) g.fillRect(x1, top, W - x1, h);
      const x0 = this.xOf(ph.s0);
      if (x0 > kbW) g.fillRect(kbW, top, Math.min(W, x0) - kbW, h);
      g.fillStyle = 'rgba(255,226,122,0.6)';
      if (x1 < W) g.fillRect(Math.round(x1) - 1, top, 2, h);
      if (x0 > kbW && x0 < W) g.fillRect(Math.round(x0) - 1, top, 2, h);
    }
    g.fillStyle = COL.past;
    g.fillRect(kbW, top, phX - kbW, h);
    g.fillStyle = COL.outside;
    const xs = this.xOf(0);
    if (xs > kbW) g.fillRect(kbW, top, Math.min(W, xs) - kbW, h);
    const xe = Math.max(kbW, this.xOf(this.length));
    if (xe < W) g.fillRect(xe, top, W - xe, h);
  }

  drawPart(part) {
    const g = this.g;
    const { W, kbW, rollTop, rollBottom, cellW } = this;
    const ch = part.cellH;
    const top = part.top;
    const n = part.rows.length;
    const bottom = top + n * ch;
    const id = part.inst.id;
    const inst = part.inst;
    const now = this.now;

    g.fillStyle = COL.void;
    g.fillRect(kbW, rollTop, W - kbW, rollBottom - rollTop);
    g.save();
    g.beginPath();
    g.rect(kbW, rollTop, W - kbW, rollBottom - rollTop);
    g.clip();

    for (let r = 0; r < n; r++) {
      const row = part.rows[r];
      if (id === 'piano') g.fillStyle = row.black ? COL.rowBlack : COL.rowWhite;
      else if (id === 'vocal') g.fillStyle = row.key % 12 === 0 ? '#2b2429' : r % 2 ? COL.rowA : COL.rowB;
      else g.fillStyle = r % 2 ? COL.rowA : COL.rowB;
      g.fillRect(kbW, top + r * ch, W - kbW, ch);
      g.fillStyle = COL.rowLine;
      g.fillRect(kbW, top + r * ch, W - kbW, 1);
    }
    this.drawGridLines(top, bottom);
    this.drawShading(top, bottom);

    // 목표 노트
    for (const note of part.notes) {
      const x0 = this.xOf(note.start);
      const x1 = this.xOf(note.start + note.len);
      if (x1 < kbW || x0 > W) continue;
      const y = top + note.row * ch;
      if (id === 'drums') rrect(g, x0 + 3, y + 3, x1 - x0 - 6, ch - 6, Math.min(8, ch / 3));
      else rrect(g, x0 + 1, y + 1, x1 - x0 - 2, ch - 2, id === 'vocal' ? ch / 2 : 3);
      g.fillStyle = inst.color;
      g.fill();
      g.strokeStyle = inst.edge;
      g.lineWidth = 1;
      g.stroke();
      if (id === 'piano') {
        g.fillStyle = inst.top;
        g.fillRect(x0 + 3, y + 2, x1 - x0 - 6, Math.max(1, ch * 0.12));
      }
      if (id === 'vocal') {
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.font = `${Math.round(Math.min(ch * 0.45, cellW * 0.6))}px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(solfege(note.key), x0 + Math.min(cellW, x1 - x0) / 2, y + ch / 2 + 1);
      }
      for (let c = note.start; c < note.start + note.len; c++) {
        if (this.xOf(c + 1) > this.phX) break;
        if (!part.occupied.has(KEY(note.row, c))) {
          g.fillStyle = COL.noteMiss;
          g.fillRect(this.xOf(c), y, cellW, ch);
        }
      }
    }

    // 놓은 블록
    for (const [k, o] of part.occupied) {
      const c = Math.floor(k / 128);
      const r = k % 128;
      const x = this.xOf(c);
      if (x + cellW < kbW || x > W) continue;
      const y = top + r * ch;
      const age = now - o.born;
      const sc = age < 0.14 ? 0.6 + 0.4 * (age / 0.14) : 1;
      g.globalAlpha = x + cellW <= this.phX ? 0.82 : 1;
      drawBlock(g, x + (cellW * (1 - sc)) / 2, y + (ch * (1 - sc)) / 2, cellW * sc, ch * sc, o.color);
      g.globalAlpha = 1;
      if (o.hitAt && now >= o.hitAt && now - o.hitAt < 0.3) {
        g.fillStyle = `rgba(255,255,255,${0.8 * (1 - (now - o.hitAt) / 0.3)})`;
        g.fillRect(x, y, cellW, ch);
      }
    }

    this.drawHints(part);
    this.drawGhost(part);

    for (const ring of this.rings) {
      const k = ring.age / ring.life;
      g.strokeStyle = `rgba(255,190,80,${1 - k})`;
      g.lineWidth = 6 * (1 - k) + 1;
      g.beginPath();
      g.arc(ring.x, ring.y, ring.r * (0.4 + k * 1.2), 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();

    this.drawSidePanel(part);
  }

  drawGhost(part) {
    const d = this.drag;
    if (!d || !d.snap) return;
    const g = this.g;
    const ch = part.cellH;
    const cw = this.cellW;
    for (const [dr, dc] of d.piece.cells) {
      const r = d.snap.r0 + dr;
      const c = d.snap.c0 + dc;
      const x = this.xOf(c);
      const y = part.top + r * ch;
      const k = KEY(r, c);
      if (d.piece.bomb) {
        g.fillStyle = part.occupied.has(k) ? 'rgba(255,120,40,0.55)' : 'rgba(255,120,40,0.22)';
        g.fillRect(x, y, cw, ch);
        g.strokeStyle = '#ffb347';
      } else if (this.free || part.noteAt.has(k)) {
        g.globalAlpha = 0.85;
        drawBlock(g, x, y, cw, ch, this.free ? d.piece.color : WHITE);
        g.globalAlpha = 1;
        g.strokeStyle = '#ffffff';
      } else {
        g.globalAlpha = 0.5;
        drawBlock(g, x, y, cw, ch, d.piece.color);
        g.globalAlpha = 1;
        g.strokeStyle = '#f2604f';
      }
      g.lineWidth = 2;
      g.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
    }
  }

  drawSidePanel(part) {
    const g = this.g;
    const { kbW, rollTop, rollBottom } = this;
    const ch = part.cellH;
    const top = part.top;
    const n = part.rows.length;
    const now = this.now;
    const lit = (r) => {
      const gl = part.glow.get(r);
      return gl && now < gl.until ? gl.color : null;
    };
    g.fillStyle = COL.void;
    g.fillRect(0, rollTop, kbW, rollBottom - rollTop);

    if (part.inst.id === 'piano') {
      const bw = Math.round(kbW * 0.6);
      g.fillStyle = COL.keyWhite;
      g.fillRect(0, top, kbW, n * ch);
      if (keyReady('white')) {
        // 흰 건반 하나 = 경계(미-파, 시-도 사이와 검은 건반 가운데) 사이 구간마다 질감 그림 한 장
        const edges = [top, top + n * ch];
        for (let r = 0; r < n; r++) {
          const pc = part.rows[r].key % 12;
          if (pc === 4 || pc === 11) edges.push(top + r * ch);
          if (part.rows[r].black) edges.push(top + r * ch + ch / 2);
        }
        edges.sort((a, b) => a - b);
        for (let i = 0; i + 1 < edges.length; i++) {
          const h = edges[i + 1] - edges[i];
          if (h > 0.5) g.drawImage(KEY_IMG.white, 0, edges[i], kbW, h);
        }
      }
      for (let r = 0; r < n; r++) {
        if (part.rows[r].black) continue;
        const color = lit(r);
        if (color) {
          g.globalAlpha = 0.82;
          g.fillStyle = color;
          g.fillRect(0, top + r * ch, kbW, ch);
          g.globalAlpha = 1;
        }
      }
      g.fillStyle = COL.keyLine;
      for (let r = 0; r < n; r++) {
        const pc = part.rows[r].key % 12;
        const y = top + r * ch;
        if (pc === 4 || pc === 11) g.fillRect(0, y, kbW, 1);
        if (part.rows[r].black) g.fillRect(bw, Math.round(y + ch / 2), kbW - bw, 1);
      }
      for (let r = 0; r < n; r++) {
        if (!part.rows[r].black) continue;
        const y = top + r * ch;
        const inset = Math.max(1, ch * 0.06);
        const color = lit(r);
        if (keyReady('black')) {
          g.drawImage(KEY_IMG.black, -4, y + inset, bw + 4, ch - inset * 2);
          if (color) {
            g.globalAlpha = 0.7;
            rrect(g, -4, y + inset, bw + 4, ch - inset * 2, 3);
            g.fillStyle = shade(color, -0.25);
            g.fill();
            g.globalAlpha = 1;
          }
        } else {
          rrect(g, -4, y + inset, bw + 4, ch - inset * 2, 3);
          g.fillStyle = color ? shade(color, -0.25) : COL.keyBlack;
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.12)';
          g.fillRect(2, y + inset + 1, bw - 5, 1);
        }
      }
      g.fillStyle = COL.keyLabel;
      g.font = `${Math.max(8, Math.min(11, ch * 0.45))}px ${FONT}`;
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      for (let r = 0; r < n; r++) {
        const pitch = part.rows[r].key;
        if (pitch % 12 === 0) g.fillText(`C${Math.floor(pitch / 12) - 1}`, kbW - 4, top + (r + 0.5) * ch);
      }
    } else if (part.inst.id === 'drums') {
      for (let r = 0; r < n; r++) {
        const row = part.rows[r];
        const y = top + r * ch;
        const color = lit(r);
        g.fillStyle = color ? shade(row.color, -0.2) : r % 2 ? '#1e2321' : '#252b28';
        g.fillRect(0, y, kbW, ch);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, y, kbW, 1);
        g.fillStyle = row.color;
        g.beginPath();
        g.arc(9, y + ch / 2, Math.min(5, ch * 0.18), 0, Math.PI * 2);
        g.fill();
        g.fillStyle = color ? '#ffffff' : '#d9dfdb';
        g.font = `${Math.max(9, Math.min(12, ch * 0.32))}px ${FONT}`;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText(row.label, 17, y + ch / 2 + 1);
      }
    } else {
      for (let r = 0; r < n; r++) {
        const row = part.rows[r];
        const y = top + r * ch;
        const color = lit(r);
        g.fillStyle = color || (row.key % 12 === 0 ? '#f6dbe9' : '#efe6eb');
        g.fillRect(0, y, kbW, ch);
        g.fillStyle = 'rgba(120,40,80,0.25)';
        g.fillRect(0, y, kbW, 1);
        g.fillStyle = color ? '#ffffff' : '#7a2d55';
        g.font = `${Math.max(10, Math.min(16, ch * 0.42))}px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(row.label, kbW / 2, y + ch / 2 + 1);
        const oct = Math.floor(row.key / 12) - 5; // C4 기준 옥타브 점
        if (oct !== 0) {
          g.beginPath();
          g.arc(kbW / 2 + 12, y + ch / 2 + (oct > 0 ? -ch * 0.22 : ch * 0.22), 2, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.fillStyle = '#0a0b0a';
    g.fillRect(kbW - 1, rollTop, 1, rollBottom - rollTop);
  }

  // 합주: 세 악기를 레인으로 나눠 한 화면에
  drawLanes() {
    const g = this.g;
    const { W, kbW, cellW } = this;
    const now = this.now;
    this.parts.forEach((part, i) => {
      const lane = this.lane(i);
      const inst = part.inst;
      g.fillStyle = i % 2 ? '#181c1a' : '#1d2220';
      g.fillRect(kbW, lane.y0, W - kbW, lane.h);
      g.save();
      g.beginPath();
      g.rect(kbW, lane.y0, W - kbW, lane.h);
      g.clip();
      this.drawGridLines(lane.y0, lane.y0 + lane.h);
      this.drawShading(lane.y0, lane.y0 + lane.h);
      const bh = Math.max(2, lane.rowH - 1);
      for (const note of part.notes) {
        const x0 = this.xOf(note.start);
        const x1 = this.xOf(note.start + note.len);
        if (x1 < kbW || x0 > W) continue;
        const y = lane.top + note.row * lane.rowH;
        if (this.phase?.original) {
          g.fillStyle = inst.color;
          g.fillRect(x0 + 1, y, x1 - x0 - 2, bh);
        } else {
          g.strokeStyle = inst.color;
          g.globalAlpha = 0.6;
          g.lineWidth = 1;
          g.strokeRect(x0 + 0.5, y + 0.5, x1 - x0 - 1, bh);
          g.globalAlpha = 1;
        }
      }
      if (!this.phase?.original) {
        for (const [k, o] of part.occupied) {
          const c = Math.floor(k / 128);
          const r = k % 128;
          const x = this.xOf(c);
          if (x + cellW < kbW || x > W) continue;
          const y = lane.top + r * lane.rowH;
          g.fillStyle = o.good ? o.color : shade(o.color, -0.35);
          g.fillRect(x + 1, y, cellW - 2, bh);
          if (o.hitAt && now >= o.hitAt && now - o.hitAt < 0.25) {
            g.fillStyle = inst.top;
            g.fillRect(x - 1, y - 1, cellW + 2, bh + 2);
          }
        }
      }
      g.restore();

      let active = false;
      for (const gl of part.glow.values()) if (now < gl.until) active = true;
      g.fillStyle = active ? inst.color : shade(inst.color, -0.65);
      g.fillRect(0, lane.y0, kbW, lane.h);
      g.fillStyle = active ? '#111111' : inst.color;
      g.font = `14px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(inst.name, kbW / 2, lane.y0 + lane.h / 2);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(0, lane.y0 + lane.h - 1, W, 1);
    });
  }

  drawPlayhead() {
    const g = this.g;
    const x = this.phX;
    const top = this.rollTop;
    const h = this.rollBottom - this.rollTop;
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x - 3, top, 6, h);
    g.fillStyle = COL.playhead;
    g.fillRect(x - 1, top, 2, h);
  }

  drawParticles() {
    const g = this.g;
    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, 1 - p.age / p.life);
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;
  }

  drawRuler() {
    const g = this.g;
    const { W, kbW, song } = this;
    g.fillStyle = COL.ruler;
    g.fillRect(0, 0, W, RULER_H);
    g.fillStyle = '#0d0f0e';
    g.fillRect(0, 0, kbW, RULER_H);
    g.fillRect(0, RULER_H - 1, W, 1);
    g.font = `10px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const [c0, c1] = this.visibleCols();
    for (let c = c0; c <= c1; c++) {
      if (c < 0 || c > this.length) continue;
      const x = Math.round(this.xOf(c));
      if (x < kbW) continue;
      if (c % song.stepsPerBar === 0) {
        g.fillStyle = COL.rulerText;
        g.fillRect(x, 3, 1, RULER_H - 4);
        if (c < this.length) g.fillText(String(c / song.stepsPerBar + 1), x + 3, RULER_H / 2);
      } else if (c % song.stepsPerBeat === 0) {
        g.fillStyle = 'rgba(140,149,143,0.5)';
        g.fillRect(x, RULER_H - 6, 1, 5);
      }
    }
    const x = this.phX;
    g.fillStyle = COL.playhead;
    g.beginPath();
    g.moveTo(x - 6, 1);
    g.lineTo(x + 6, 1);
    g.lineTo(x + 6, RULER_H - 7);
    g.lineTo(x, RULER_H);
    g.lineTo(x - 6, RULER_H - 7);
    g.fill();
  }

  drawTray() {
    const g = this.g;
    const { W, H, trayTop } = this;
    const trayH = H - trayTop;
    const grad = g.createLinearGradient(0, trayTop, 0, H);
    grad.addColorStop(0, COL.trayTop);
    grad.addColorStop(1, COL.trayBottom);
    g.fillStyle = grad;
    g.fillRect(0, trayTop, W, trayH);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(0, trayTop, W, 2);
    this.drawStore();
    const areaW = W - this.storeW;

    if (!this.placeRange() || !this.tray) {
      const ph = this.phase;
      let text = '';
      if (this.state === 'playing' && ph?.type === 'flow') {
        text = ph.finale ? (ph.original ? '원곡 연주 중' : '전체 연주 중') : ph.view === 'lanes' ? '합주 중' : '연주 중';
      }
      if (text) {
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.font = `16px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(text, areaW / 2, trayTop + trayH / 2);
      }
      return;
    }

    const aspect = Math.min(1.4, Math.max(0.85, this.part.cellH / this.cellW)); // 하단에서는 너무 납작하거나 길쭉하지 않게
    // 지금 트레이에서 가장 넓은 블록이 칸에 들어가는 만큼 (모두 같은 비율)
    const widest = Math.max(3, ...this.tray.map((p) => (p ? p.w : 0)));
    let sw = Math.min(this.cellW * 1.15, 40, (this.slotW - 12) / widest);
    let sh = sw * aspect;
    if (sh * 3 > trayH - 20) {
      sh = (trayH - 20) / 3;
      sw = sh / aspect;
    }
    const slotW = this.slotW;
    const cy = trayTop + trayH / 2;
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(Math.round(slotW * i), trayTop + 12, 1, trayH - 24);
      }
      const p = this.tray[i];
      if (!p || (this.drag && this.drag.slot === i)) continue;
      const ox = slotW * (i + 0.5) - (p.w * sw) / 2;
      const oy = cy - (p.h * sh) / 2;
      p.cells.forEach(([r, c], j) => {
        if (p.bomb) drawBomb(g, ox + c * sw, oy + r * sh, sw, sh, j === 0, this.now);
        else drawBlock(g, ox + c * sw, oy + r * sh, sw, sh, p.color);
      });
    }
  }

  // 보관함: 맨 위 블록과 쌓인 수량
  drawStore() {
    const g = this.g;
    const { W, H, trayTop } = this;
    const trayH = H - trayTop;
    const x0 = W - this.storeW;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(x0, trayTop + 2, this.storeW, trayH - 2);
    const bx = x0 + 7;
    const by = trayTop + 9;
    const bw = this.storeW - 14;
    const bh = trayH - 18;
    const full = this.store.length >= STORE_MAX;
    const over = this.drag?.overStore;

    rrect(g, bx, by, bw, bh, 10);
    g.fillStyle = over ? (full ? 'rgba(242,96,79,0.28)' : 'rgba(255,226,122,0.22)') : 'rgba(255,255,255,0.05)';
    g.fill();
    g.setLineDash([5, 4]);
    g.lineWidth = 1.5;
    g.strokeStyle = over ? (full ? '#f2604f' : '#ffe27a') : 'rgba(255,255,255,0.32)';
    g.stroke();
    g.setLineDash([]);

    g.textAlign = 'center';
    g.font = `11px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.65)';
    g.textBaseline = 'bottom';
    g.fillText('보관함', bx + bw / 2, by + bh - 5);

    // 보관함에서 꺼내 끄는 중이면 그 아래 블록을 보여준다
    const dragging = this.drag?.slot === STORE_SLOT;
    const count = this.store.length - (dragging ? 1 : 0);
    const shown = this.store[count - 1];
    const cx = bx + bw / 2;
    const cy = by + (bh - 14) / 2 + 2;
    if (!shown) {
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.textBaseline = 'middle';
      g.fillText('끌어다', cx, cy - 8);
      g.fillText('보관', cx, cy + 8);
      return;
    }
    const aspect = Math.min(1.4, Math.max(0.85, this.part.cellH / this.cellW)); // 하단에서는 너무 납작하거나 길쭉하지 않게
    let sw = Math.min(this.cellW * 0.9, 32, (bw - 16) / Math.max(3, shown.w));
    let sh = sw * aspect;
    const availH = bh - 34;
    if (sh * Math.max(2, shown.h) > availH) {
      sh = availH / Math.max(2, shown.h);
      sw = sh / aspect;
    }
    const age = this.now - this.storeBump;
    const k = age >= 0 && age < 0.18 ? 1.2 - (age / 0.18) * 0.2 : 1;
    sw *= k;
    sh *= k;
    const pw = shown.w * sw;
    const ph = shown.h * sh;
    // 여러 개면 뒤에 카드가 겹쳐 보이게
    for (let i = Math.min(count - 1, 2); i >= 1; i--) {
      rrect(g, cx - pw / 2 - 5 + i * 3, cy - ph / 2 - 5 - i * 3, pw + 10, ph + 10, 6);
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.fill();
    }
    const ox = cx - pw / 2;
    const oy = cy - ph / 2;
    shown.cells.forEach(([r, c], j) => {
      if (shown.bomb) drawBomb(g, ox + c * sw, oy + r * sh, sw, sh, j === 0, this.now);
      else drawBlock(g, ox + c * sw, oy + r * sh, sw, sh, shown.color);
    });
    // 쌓인 수량
    const rx = bx + bw - 12;
    const ry = by + 12;
    g.beginPath();
    g.arc(rx, ry, 10, 0, Math.PI * 2);
    g.fillStyle = full ? '#f2604f' : '#f6c344';
    g.fill();
    g.fillStyle = full ? '#ffffff' : '#2a2008';
    g.font = `12px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText(String(count), rx, ry + 1);
  }

  drawHint() {
    const ph = this.phase;
    if (this.state !== 'playing' || !ph) return;
    let text = '';
    if (ph.type === 'place' && ph.scene === 0 && this.now - (ph.deadline - SCENE_TIME) < 5) {
      text = this.free ? (this.hints ? '반투명 블록이 추천 자리예요. 그대로 놓아 보세요' : '블록을 놓으면 그 자리의 음이 연주돼요') : '아래 블록을 끌어서 초록 노트 위에 놓으세요';
    } else if (ph.live && this.pos < (ph.startAt || 0) + this.song.stepsPerBar) {
      text = this.free ? '블록을 놓으면 재생선이 지날 때 그 음이 연주돼요' : '아래 블록을 끌어서 흘러오는 노트 위에 놓으세요';
    }
    if (!text) return;
    const g = this.g;
    g.font = `13px ${FONT}`;
    const w = g.measureText(text).width + 24;
    const x = (this.W - w) / 2;
    const y = this.rollTop + 10;
    g.fillStyle = 'rgba(0,0,0,0.7)';
    rrect(g, x, y, w, 28, 14);
    g.fill();
    g.fillStyle = COL.hint;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, this.W / 2, y + 14);
  }

  drawDrag() {
    const d = this.drag;
    if (!d || d.px == null) return;
    const g = this.g;
    const cw = this.cellW;
    const ch = this.part.cellH;
    g.globalAlpha = d.snap ? 0.45 : 0.95;
    d.piece.cells.forEach(([r, c], j) => {
      if (d.piece.bomb) drawBomb(g, d.px + c * cw, d.py + r * ch, cw, ch, j === 0, this.now);
      else drawBlock(g, d.px + c * cw, d.py + r * ch, cw, ch, d.piece.color);
    });
    g.globalAlpha = 1;
  }

  drawPopups() {
    const g = this.g;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const p of this.popups) {
      const k = p.age / p.life;
      const y = p.y - p.age * 46;
      g.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      g.font = `${p.size}px ${FONT}`;
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.strokeText(p.text, p.x, y);
      g.fillStyle = p.color;
      g.fillText(p.text, p.x, y);
    }
    g.globalAlpha = 1;
  }

  // FANTASTIC / GOOD / BAD 같은 판정 글자
  drawJudgement() {
    const j = this.judgement;
    if (!j) return;
    const age = this.now - j.t0;
    const life = 0.95;
    if (age > life) {
      this.judgement = null;
      return;
    }
    if (age < 0) return;
    const style = JUDGE_STYLE[j.word] || JUDGE_STYLE.GOOD;
    const g = this.g;
    const cy = this.rollTop + (this.rollBottom - this.rollTop) * 0.38;
    const base = Math.min(52, this.W * 0.12) * style.size;
    const pop = age < 0.12 ? 1.5 - 0.5 * (age / 0.12) : 1;
    g.save();
    g.globalAlpha = age > 0.7 ? Math.max(0, 1 - (age - 0.7) / 0.25) : 1;
    g.translate(this.W / 2, cy);
    if (j.word === 'BAD') g.rotate(Math.sin(age * 40) * 0.05 * (1 - age));
    g.scale(pop, pop);
    g.font = `${base}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = base * 0.18;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(j.word, 0, 0);
    const grad = g.createLinearGradient(0, -base / 2, 0, base / 2);
    grad.addColorStop(0, style.fill[0]);
    grad.addColorStop(1, style.fill[1]);
    g.fillStyle = grad;
    g.fillText(j.word, 0, 0);
    if (j.sub) {
      g.font = `${base * 0.38}px ${FONT}`;
      g.lineWidth = 4;
      g.strokeText(j.sub, 0, base * 0.72);
      g.fillStyle = '#ffffff';
      g.fillText(j.sub, 0, base * 0.72);
    }
    g.restore();
  }

  // 페이지 결과 카드 (보드 위쪽)
  drawPageCard() {
    const c = this.pageCard;
    if (!c) return;
    const age = this.now - c.t0;
    if (age > c.life) {
      this.pageCard = null;
      return;
    }
    if (age < 0) return;
    const g = this.g;
    const k = age / c.life;
    const alpha = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1;
    const w = Math.min(this.W - 32, 260);
    const h = 66;
    const x = (this.W - w) / 2;
    const y = this.rollTop + 46 - (k < 0.1 ? (1 - k / 0.1) * 12 : 0);
    g.save();
    g.globalAlpha = Math.max(0, alpha);
    g.fillStyle = 'rgba(8,10,9,0.88)';
    rrect(g, x, y, w, h, 12);
    g.fill();
    g.fillStyle = c.color;
    g.fillRect(x + 12, y, w - 24, 3);
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.font = `12px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText(c.title, this.W / 2, y + 17);
    g.font = `24px ${FONT}`;
    g.textAlign = 'right';
    g.fillStyle = c.score >= 0 ? '#ffe27a' : '#ff7b6e';
    g.fillText(`${c.score >= 0 ? '+' : ''}${c.score.toLocaleString('ko-KR')}점`, this.W / 2 - 8, y + 44);
    g.textAlign = 'left';
    g.fillStyle = c.pct >= 85 ? '#7dffb0' : c.pct >= 50 ? '#ffffff' : '#ffb3a8';
    g.fillText(`연주 ${c.pct}%`, this.W / 2 + 8, y + 44);
    g.restore();
  }

  // 페이지/악기 전환 배너
  drawBanner() {
    const b = this.banner;
    if (!b) return;
    const age = this.now - b.t0;
    if (age > b.life) {
      this.banner = null;
      return;
    }
    if (age < 0) return;
    const g = this.g;
    const k = age / b.life;
    const slide = k < 0.18 ? (1 - k / 0.18) * this.W : k > 0.85 ? -((k - 0.85) / 0.15) * this.W : 0;
    const cy = (this.rollTop + this.rollBottom) / 2;
    const h = 92;
    g.save();
    g.translate(slide, 0);
    g.fillStyle = 'rgba(8,10,9,0.82)';
    g.fillRect(0, cy - h / 2, this.W, h);
    g.fillStyle = b.color;
    g.fillRect(0, cy - h / 2, this.W, 3);
    g.fillRect(0, cy + h / 2 - 3, this.W, 3);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `40px ${FONT}`;
    g.fillStyle = b.color;
    g.fillText(b.title, this.W / 2, cy - 10);
    g.font = `14px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText(b.sub, this.W / 2, cy + 26);
    g.restore();
  }
}
