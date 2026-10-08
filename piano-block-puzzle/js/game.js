// 게임 본체: 상단 피아노 롤(보드) + 하단 블록 3개.
// 재생선은 가운데 고정, 노트가 오른쪽에서 왼쪽으로 흘러온다.
// 시계는 AudioContext.currentTime을 쓴다. 일시정지하면 컨텍스트를 멈춰 시계도 같이 멈춘다.

import { makeTray } from './pieces.js';

const PLAYHEAD_FRAC = 0.5; // 재생선 위치 (그리드 폭 기준)
const VISIBLE_COLS = 14; // 화면에 보이는 칸 수 목표치
const MAX_ROWS = 40;
const OFFSCREEN_COLS = 3;
const SCHEDULE_AHEAD = 0.1; // 오디오 예약 선행 시간(초)
const RULER_H = 18;

const POINTS_GOOD = 100;
const POINTS_BAD = 50;
const POINTS_BAR = 500;

const KEY = (r, c) => c * 128 + r;
const BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
const WRONG = '#5b6270';
const FONT = '"Black Han Sans", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

const COL = {
  bg: '#121513',
  rowWhite: '#252a27',
  rowBlack: '#1d211f',
  rowLine: 'rgba(0,0,0,0.35)',
  step: 'rgba(255,255,255,0.04)',
  beat: 'rgba(255,255,255,0.09)',
  bar: 'rgba(255,255,255,0.24)',
  past: 'rgba(0,0,0,0.28)',
  outside: 'rgba(0,0,0,0.4)',
  note: '#34a853',
  noteEdge: '#1b6430',
  noteTop: '#62cf7c',
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

const keyboardWidth = (W) => Math.round(Math.min(60, Math.max(40, W * 0.12)));
// 블록 3줄(트레이 칸은 보드 칸의 80%)과 위아래 여백만큼
const trayHeight = (cell) => Math.max(84, Math.round(cell * 0.8) * 3 + 24);

const shadeCache = new Map();
function shade(hex, amt) {
  const k = hex + amt;
  let v = shadeCache.get(k);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const ch = (x) => Math.round(x + (t - x) * p);
  v = `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  shadeCache.set(k, v);
  return v;
}

function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// 블록 블라스트 스타일의 입체 블록 한 칸
function drawBlock(g, x, y, s, color) {
  const b = Math.max(2, Math.round(s * 0.15));
  g.fillStyle = color;
  g.fillRect(x, y, s, s);
  g.fillStyle = shade(color, 0.45);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + s, y);
  g.lineTo(x + s - b, y + b);
  g.lineTo(x + b, y + b);
  g.fill();
  g.fillStyle = shade(color, 0.2);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + b, y + b);
  g.lineTo(x + b, y + s - b);
  g.lineTo(x, y + s);
  g.fill();
  g.fillStyle = shade(color, -0.22);
  g.beginPath();
  g.moveTo(x + s, y);
  g.lineTo(x + s, y + s);
  g.lineTo(x + s - b, y + s - b);
  g.lineTo(x + s - b, y + b);
  g.fill();
  g.fillStyle = shade(color, -0.38);
  g.beginPath();
  g.moveTo(x, y + s);
  g.lineTo(x + b, y + s - b);
  g.lineTo(x + s - b, y + s - b);
  g.lineTo(x + s, y + s);
  g.fill();
}

export class Game {
  constructor(canvas, audio, hooks) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.audio = audio;
    this.hooks = hooks;
    this.state = 'idle';
    this.song = null;
    this.W = 0;
    this.H = 0;
    this.dpr = 1;
    this.pos = 0;
    this.drag = null;
    this.lastTs = null;

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e, true));

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
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

  layout() {
    if (!this.song || !this.W) return;
    const { W, H } = this;
    this.kbW = keyboardWidth(W);
    const gridW = W - this.kbW;
    // 보드를 최대한 크게: 하단 트레이는 블록 3줄 높이만 남긴다.
    const rollAvail = H - RULER_H - trayHeight(Math.floor(gridW / VISIBLE_COLS));
    this.cell = Math.max(10, Math.floor(Math.min(gridW / VISIBLE_COLS, rollAvail / this.rows)));
    this.gridTop = RULER_H;
    this.gridBottom = this.gridTop + this.rows * this.cell;
    this.trayTop = this.gridBottom;
    this.phX = Math.round(this.kbW + gridW * PLAYHEAD_FRAC);
    this.aheadCols = (W - this.phX) / this.cell;
    this.behindCols = (this.phX - this.kbW) / this.cell;
    const trayH = H - this.trayTop;
    this.trayCell = Math.max(8, Math.floor(Math.min(this.cell * 0.8, (trayH - 16) / 3, (W / 3 - 16) / 5)));
  }

  // 곡 음역을 가운데 두고, 남는 세로 공간은 건반 줄로 채운다. 곡을 시작할 때 한 번 정한다.
  fitRows() {
    const song = this.song;
    const gridW = this.W - keyboardWidth(this.W);
    const rollAvail = this.H - RULER_H - trayHeight(Math.floor(gridW / VISIBLE_COLS));
    const cell = Math.max(10, Math.floor(Math.min(gridW / VISIBLE_COLS, rollAvail / song.rows)));
    this.rows = Math.min(MAX_ROWS, Math.max(song.rows, Math.floor(rollAvail / cell)));
    this.topPitch = Math.ceil((song.lowPitch + song.highPitch + this.rows - 1) / 2);
  }

  xOf(col) {
    return this.phX + (col - this.pos) * this.cell;
  }

  // ---------- 게임 흐름 ----------

  start(song, speed = 1) {
    this.song = song;
    this.stepSec = song.stepSec / speed;
    this.fitRows();
    this.layout();

    this.notes = song.notes.map((n) => ({ ...n, row: this.topPitch - n.pitch }));
    this.noteAt = new Map();
    this.byCol = [];
    for (const n of this.notes) {
      for (let c = n.start; c < n.start + n.len; c++) {
        this.noteAt.set(KEY(n.row, c), n);
        (this.byCol[c] ||= []).push(n);
      }
    }
    this.totalGreen = this.noteAt.size;
    this.barCount = Math.ceil(song.length / song.stepsPerBar);
    this.barsWithNotes = 0;
    for (let b = 0; b < this.barCount; b++) {
      for (let c = b * song.stepsPerBar; c < (b + 1) * song.stepsPerBar; c++) {
        if (this.byCol[c]) {
          this.barsWithNotes++;
          break;
        }
      }
    }

    this.occupied = new Map();
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.perfects = 0;
    this.goodCells = 0;
    this.badCells = 0;
    this.perfectBars = 0;

    this.particles = [];
    this.popups = [];
    this.flashes = [];
    this.glow = new Map();
    this.shake = 0;
    this.events = [];
    this.drag = null;

    this.audio.ensure();
    this.audio.resetBus();
    // 첫 노트가 화면 오른쪽 안쪽에 보이는 상태로 시작하고, 마지막 한 마디는 카운트인.
    const spb = song.stepsPerBeat;
    this.leadIn = Math.max(song.stepsPerBar, Math.ceil((this.aheadCols * 0.8) / spb) * spb);
    this.startTime = this.audio.now + 0.15 + this.leadIn * this.stepSec;
    this.processed = -this.leadIn - 1;
    this.pos = -this.leadIn;
    this.endAt = 0;
    this.tray = makeTray(this.upcomingGreen());
    this.state = 'playing';
    this.lastTs = null;
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
    this.audio.resetBus();
    this.audio.resume();
  }

  finish() {
    this.state = 'ended';
    this.drag = null;
    const accuracy = this.totalGreen ? this.goodCells / this.totalGreen : 0;
    const stars = accuracy >= 0.85 ? 3 : accuracy >= 0.65 ? 2 : accuracy >= 0.4 ? 1 : 0;
    this.hooks.end?.({
      song: this.song,
      score: this.score,
      accuracy,
      stars,
      perfects: this.perfects,
      maxCombo: this.maxCombo,
      perfectBars: this.perfectBars,
      barsWithNotes: this.barsWithNotes,
      goodCells: this.goodCells,
      badCells: this.badCells,
      totalGreen: this.totalGreen,
    });
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
    const now = this.audio.now;
    this.pos = (now - this.startTime) / this.stepSec;

    const horizon = Math.floor((now + SCHEDULE_AHEAD - this.startTime) / this.stepSec);
    while (this.processed < horizon) {
      this.processed++;
      this.processColumn(this.processed, this.startTime + this.processed * this.stepSec);
    }
    while (this.events.length && this.events[0].t <= now) this.fire(this.events.shift(), now);

    if (this.drag) this.computeSnap();

    const song = this.song;
    if (!this.endAt && this.pos > song.length + 1) this.endAt = now + 0.8;
    if (this.endAt && now >= this.endAt) this.finish();

    this.hooks.hud?.(this.score, this.combo, Math.max(0, Math.min(1, this.pos / song.length)));
  }

  pushEvent(ev) {
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].t > ev.t) i--;
    this.events.splice(i, 0, ev);
  }

  // 재생선이 c열에 닿기 직전에 한 번 호출된다. 덮인 노트만 소리를 낸다.
  processColumn(c, t) {
    const song = this.song;
    if (c < 0) {
      const spb = song.stepsPerBeat;
      if (c >= -song.stepsPerBar && ((c % spb) + spb) % spb === 0) this.audio.tick(t, c === -song.stepsPerBar);
      return;
    }
    if (c >= song.length) return;

    for (const n of this.byCol[c] || []) {
      const k = KEY(n.row, c);
      const occ = this.occupied.get(k);
      if (!occ) continue;
      const contFromPrev = c > n.start && this.occupied.has(KEY(n.row, c - 1));
      if (contFromPrev) continue;
      let run = 1;
      while (c + run < n.start + n.len && this.occupied.has(KEY(n.row, c + run))) run++;
      this.audio.note(n.pitch, t, run * this.stepSec * 0.97, 0.85);
      this.pushEvent({ t, type: 'hit', row: n.row, col: c, run, color: occ.color });
    }

    if ((c + 1) % song.stepsPerBar === 0) {
      const b0 = c + 1 - song.stepsPerBar;
      let any = false;
      let full = true;
      for (let cc = b0; cc <= c && full; cc++) {
        for (const n of this.byCol[cc] || []) {
          any = true;
          if (!this.occupied.has(KEY(n.row, cc))) {
            full = false;
            break;
          }
        }
      }
      if (any && full) this.pushEvent({ t: t + this.stepSec, type: 'bar', bar: b0 / song.stepsPerBar });
    }
  }

  fire(ev, now) {
    if (ev.type === 'hit') {
      const dur = ev.run * this.stepSec;
      this.glow.set(ev.row, { until: ev.t + dur, color: ev.color });
      for (let i = 0; i < ev.run; i++) {
        const o = this.occupied.get(KEY(ev.row, ev.col + i));
        if (o) o.hitAt = ev.t + i * this.stepSec;
      }
      const y = this.gridTop + (ev.row + 0.5) * this.cell;
      for (let i = 0; i < 9; i++) {
        this.particles.push({
          x: this.phX,
          y,
          vx: -40 - Math.random() * 140,
          vy: (Math.random() - 0.5) * 220,
          life: 0.45 + Math.random() * 0.25,
          age: 0,
          size: 2 + Math.random() * 3,
          color: ev.color,
        });
      }
    } else if (ev.type === 'bar') {
      this.score += POINTS_BAR;
      this.perfectBars++;
      this.flashes.push({ bar: ev.bar, t0: now });
      this.popups.push({
        text: `마디 완성 +${POINTS_BAR}`,
        x: (this.kbW + this.phX) / 2,
        y: this.gridTop + 28,
        age: 0,
        life: 1.1,
        size: 18,
        color: '#ffe27a',
      });
      this.audio.sparkle();
    }
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
    this.shake = Math.max(0, this.shake - dt * 3);
  }

  // ---------- 블록 ----------

  upcomingGreen() {
    const from = Math.max(0, this.processed + 3);
    const to = Math.min(this.song.length - 1, Math.floor(Math.max(this.pos, 0) + this.aheadCols + OFFSCREEN_COLS));
    const out = [];
    for (let c = from; c <= to; c++) {
      for (const n of this.byCol[c] || []) {
        if (!this.occupied.has(KEY(n.row, c))) out.push([n.row, c]);
      }
    }
    return out;
  }

  canPlace(piece, r0, c0) {
    const minC = Math.max(0, this.processed + 1);
    // 긴 블록도 앞부분이 보이면 놓을 수 있게 오른쪽 화면 밖으로 몇 칸 걸쳐도 허용
    const maxC = Math.min(this.song.length - 1, Math.floor(this.pos + this.aheadCols) + OFFSCREEN_COLS);
    for (const [dr, dc] of piece.cells) {
      const r = r0 + dr;
      const c = c0 + dc;
      if (r < 0 || r >= this.rows || c < minC || c > maxC) return false;
      if (this.occupied.has(KEY(r, c))) return false;
    }
    return true;
  }

  computeSnap() {
    const d = this.drag;
    const p = d.piece;
    const s = this.cell;
    d.px = d.x - (p.w * s) / 2;
    d.py = d.y - d.lift - p.h * s;
    if (d.py + p.h * s < this.gridTop - s * 0.5 || d.py > this.gridBottom - s * 0.5) {
      d.snap = null;
      return;
    }
    const c0 = Math.round((d.px - this.phX) / s + this.pos);
    const r0 = Math.round((d.py - this.gridTop) / s);
    d.snap = this.canPlace(p, r0, c0) ? { r0, c0 } : null;
  }

  place(slot, piece, r0, c0) {
    const now = this.audio.now;
    let good = 0;
    let bad = 0;
    const pitches = new Set();
    for (const [dr, dc] of piece.cells) {
      const k = KEY(r0 + dr, c0 + dc);
      const note = this.noteAt.get(k);
      this.occupied.set(k, { color: note ? piece.color : WRONG, good: !!note, born: now, hitAt: 0 });
      if (note) {
        good++;
        pitches.add(note.pitch);
      } else {
        bad++;
      }
    }
    this.goodCells += good;
    this.badCells += bad;

    let gain;
    let label = '';
    if (bad === 0) {
      this.combo++;
      this.perfects++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const mult = 1 + Math.min(this.combo - 1, 10) * 0.2;
      gain = Math.round(good * POINTS_GOOD * mult);
      label = this.combo > 1 ? `PERFECT · 콤보 ${this.combo}` : 'PERFECT';
    } else {
      this.combo = 0;
      gain = good * POINTS_GOOD - bad * POINTS_BAD;
      if (good === 0) this.shake = 1;
    }
    this.score = Math.max(0, this.score + gain);

    if (pitches.size) this.audio.preview([...pitches].sort((a, b) => a - b));
    if (bad) this.audio.thud();

    const cx = this.xOf(c0) + (piece.w * this.cell) / 2;
    const cy = this.gridTop + r0 * this.cell;
    this.popups.push({
      text: gain >= 0 ? `+${gain}` : `${gain}`,
      x: cx,
      y: cy,
      age: 0,
      life: 0.9,
      size: 20,
      color: gain > 0 ? (bad ? '#ffffff' : '#ffe27a') : '#ff7b6e',
    });
    if (label) this.popups.push({ text: label, x: cx, y: cy + 20, age: 0, life: 0.9, size: 12, color: '#bff5c9' });

    this.tray[slot] = null;
    if (this.tray.every((t) => !t)) this.tray = makeTray(this.upcomingGreen());
  }

  // ---------- 입력 ----------

  point(e) {
    const r = this.cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  onDown(e) {
    if (this.state !== 'playing' || this.drag) return;
    const { x, y } = this.point(e);
    if (y < this.trayTop) return;
    const slot = Math.min(2, Math.floor(x / (this.W / 3)));
    const piece = this.tray[slot];
    if (!piece) return;
    e.preventDefault();
    try {
      this.cv.setPointerCapture(e.pointerId);
    } catch {}
    const lift = e.pointerType === 'mouse' ? -(piece.h * this.cell) / 2 : this.cell * 1.3 + 26;
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
    if (!cancelled && this.state === 'playing') this.computeSnap();
    this.drag = null;
    if (cancelled || this.state !== 'playing') return;
    if (d.snap && this.tray[d.slot] === d.piece) this.place(d.slot, d.piece, d.snap.r0, d.snap.c0);
  }

  // ---------- 그리기 ----------

  render() {
    const g = this.g;
    const { W, H } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = COL.bg;
    g.fillRect(0, 0, W, H);
    if (!this.song || !this.cell) return;

    g.save();
    if (this.shake > 0) {
      const m = this.shake * 5;
      g.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    g.save();
    g.beginPath();
    g.rect(this.kbW, this.gridTop, W - this.kbW, this.gridBottom - this.gridTop);
    g.clip();
    this.drawGrid();
    this.drawFlashes();
    this.drawNotes();
    this.drawBlocks();
    this.drawGhost();
    g.restore();
    this.drawPlayhead();
    this.drawParticles();
    this.drawKeyboard();
    this.drawRuler();
    g.restore();

    this.drawTray();
    this.drawHint();
    this.drawDrag();
    this.drawPopups();
    this.drawCountdown();
  }

  drawGrid() {
    const g = this.g;
    const { W, kbW, gridTop, gridBottom, cell, song, phX } = this;
    for (let r = 0; r < this.rows; r++) {
      const pitch = this.topPitch - r;
      g.fillStyle = BLACK[pitch % 12] ? COL.rowBlack : COL.rowWhite;
      g.fillRect(kbW, gridTop + r * cell, W - kbW, cell);
      g.fillStyle = COL.rowLine;
      g.fillRect(kbW, gridTop + r * cell, W - kbW, 1);
    }
    const c0 = Math.floor(this.pos - this.behindCols) - 1;
    const c1 = Math.ceil(this.pos + this.aheadCols) + 1;
    for (let c = c0; c <= c1; c++) {
      const x = Math.round(this.xOf(c));
      if (x < kbW) continue;
      g.fillStyle = c % song.stepsPerBar === 0 ? COL.bar : c % song.stepsPerBeat === 0 ? COL.beat : COL.step;
      g.fillRect(x, gridTop, 1, gridBottom - gridTop);
    }
    g.fillStyle = COL.past;
    g.fillRect(kbW, gridTop, phX - kbW, gridBottom - gridTop);
    g.fillStyle = COL.outside;
    const xs = this.xOf(0);
    if (xs > kbW) g.fillRect(kbW, gridTop, xs - kbW, gridBottom - gridTop);
    const xe = this.xOf(song.length);
    if (xe < W) g.fillRect(xe, gridTop, W - xe, gridBottom - gridTop);
  }

  drawFlashes() {
    const g = this.g;
    const now = this.audio.now;
    const spb = this.song.stepsPerBar;
    this.flashes = this.flashes.filter((f) => now - f.t0 < 0.6);
    for (const f of this.flashes) {
      const a = 1 - (now - f.t0) / 0.6;
      const x0 = this.xOf(f.bar * spb);
      g.fillStyle = `rgba(255,236,150,${0.35 * a})`;
      g.fillRect(x0, this.gridTop, spb * this.cell, this.gridBottom - this.gridTop);
    }
  }

  drawNotes() {
    const g = this.g;
    const { cell, gridTop, kbW, W, phX } = this;
    for (const n of this.notes) {
      const x0 = this.xOf(n.start);
      const x1 = this.xOf(n.start + n.len);
      if (x1 < kbW || x0 > W) continue;
      const y = gridTop + n.row * cell;
      rrect(g, x0 + 1, y + 1, x1 - x0 - 2, cell - 2, 3);
      g.fillStyle = COL.note;
      g.fill();
      g.strokeStyle = COL.noteEdge;
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = COL.noteTop;
      g.fillRect(x0 + 3, y + 2, x1 - x0 - 6, Math.max(1, cell * 0.12));
      // 재생선을 지나간 빈 노트는 어둡게
      for (let c = n.start; c < n.start + n.len; c++) {
        const cx1 = this.xOf(c + 1);
        if (cx1 > phX) break;
        if (!this.occupied.has(KEY(n.row, c))) {
          g.fillStyle = COL.noteMiss;
          g.fillRect(this.xOf(c), y, cell, cell);
        }
      }
    }
  }

  drawBlocks() {
    const g = this.g;
    const { cell, gridTop, kbW, W, phX } = this;
    const now = this.audio.now;
    for (const [k, o] of this.occupied) {
      const c = Math.floor(k / 128);
      const r = k % 128;
      const x = this.xOf(c);
      if (x + cell < kbW || x > W) continue;
      const y = gridTop + r * cell;
      const age = now - o.born;
      const sc = age < 0.14 ? 0.6 + 0.4 * (age / 0.14) : 1;
      const s = cell * sc;
      const off = (cell - s) / 2;
      g.globalAlpha = x + cell <= phX ? 0.78 : 1;
      drawBlock(g, x + off, y + off, s, o.color);
      g.globalAlpha = 1;
      if (o.hitAt && now >= o.hitAt && now - o.hitAt < 0.3) {
        g.fillStyle = `rgba(255,255,255,${0.75 * (1 - (now - o.hitAt) / 0.3)})`;
        g.fillRect(x, y, cell, cell);
      }
    }
  }

  drawGhost() {
    const d = this.drag;
    if (!d || !d.snap) return;
    const g = this.g;
    const { cell, gridTop } = this;
    for (const [dr, dc] of d.piece.cells) {
      const r = d.snap.r0 + dr;
      const c = d.snap.c0 + dc;
      const x = this.xOf(c);
      const y = gridTop + r * cell;
      if (this.noteAt.has(KEY(r, c))) {
        g.globalAlpha = 0.75;
        drawBlock(g, x, y, cell, d.piece.color);
        g.globalAlpha = 1;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2;
        g.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
      } else {
        g.fillStyle = 'rgba(242,96,79,0.35)';
        g.fillRect(x, y, cell, cell);
        g.strokeStyle = '#f2604f';
        g.lineWidth = 2;
        g.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
      }
    }
  }

  drawPlayhead() {
    const g = this.g;
    const x = this.phX;
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x - 3, this.gridTop, 6, this.gridBottom - this.gridTop);
    g.fillStyle = COL.playhead;
    g.fillRect(x - 1, this.gridTop, 2, this.gridBottom - this.gridTop);
  }

  drawParticles() {
    const g = this.g;
    for (const p of this.particles) {
      g.globalAlpha = 1 - p.age / p.life;
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;
  }

  drawKeyboard() {
    const g = this.g;
    const { kbW, cell, gridTop, rows, topPitch } = this;
    const now = this.audio.now;
    const bw = Math.round(kbW * 0.6);
    const h = rows * cell;
    g.fillStyle = COL.keyWhite;
    g.fillRect(0, gridTop, kbW, h);

    const lit = (r) => {
      const gl = this.glow.get(r);
      return gl && now < gl.until ? gl.color : null;
    };

    for (let r = 0; r < rows; r++) {
      const pitch = topPitch - r;
      if (BLACK[pitch % 12]) continue;
      const color = lit(r);
      if (color) {
        g.fillStyle = color;
        g.fillRect(0, gridTop + r * cell, kbW, cell);
      }
    }
    g.fillStyle = COL.keyLine;
    for (let r = 0; r < rows; r++) {
      const pitch = topPitch - r;
      const pc = pitch % 12;
      const y = gridTop + r * cell;
      if (pc === 4 || pc === 11) g.fillRect(0, y, kbW, 1);
      if (BLACK[pc]) g.fillRect(bw, Math.round(y + cell / 2), kbW - bw, 1);
    }
    for (let r = 0; r < rows; r++) {
      const pitch = topPitch - r;
      if (!BLACK[pitch % 12]) continue;
      const y = gridTop + r * cell;
      const inset = Math.max(1, cell * 0.06);
      const color = lit(r);
      rrect(g, -4, y + inset, bw + 4, cell - inset * 2, 3);
      g.fillStyle = color ? shade(color, -0.25) : COL.keyBlack;
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(2, y + inset + 1, bw - 5, 1);
    }
    g.fillStyle = COL.keyLabel;
    g.font = `600 ${Math.max(8, Math.min(11, cell * 0.45))}px ${FONT}`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let r = 0; r < rows; r++) {
      const pitch = topPitch - r;
      if (pitch % 12 !== 0) continue;
      g.fillText(`C${Math.floor(pitch / 12) - 1}`, kbW - 4, gridTop + (r + 0.5) * cell);
    }
    g.fillStyle = '#0a0b0a';
    g.fillRect(kbW - 1, gridTop, 1, h);
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
    const c0 = Math.floor(this.pos - this.behindCols) - 1;
    const c1 = Math.ceil(this.pos + this.aheadCols) + 1;
    for (let c = c0; c <= c1; c++) {
      if (c < 0 || c > song.length) continue;
      const x = Math.round(this.xOf(c));
      if (x < kbW) continue;
      if (c % song.stepsPerBar === 0) {
        g.fillStyle = COL.rulerText;
        g.fillRect(x, 3, 1, RULER_H - 4);
        if (c < song.length) g.fillText(String(c / song.stepsPerBar + 1), x + 3, RULER_H / 2);
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
    const grad = g.createLinearGradient(0, trayTop, 0, H);
    grad.addColorStop(0, COL.trayTop);
    grad.addColorStop(1, COL.trayBottom);
    g.fillStyle = grad;
    g.fillRect(0, trayTop, W, H - trayTop);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(0, trayTop, W, 2);

    const s = this.trayCell;
    const slotW = W / 3;
    const cy = trayTop + (H - trayTop) / 2;
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(Math.round(slotW * i), trayTop + 12, 1, H - trayTop - 24);
      }
      const p = this.tray?.[i];
      if (!p || (this.drag && this.drag.slot === i)) continue;
      const ox = slotW * (i + 0.5) - (p.w * s) / 2;
      const oy = cy - (p.h * s) / 2;
      for (const [r, c] of p.cells) drawBlock(g, ox + c * s, oy + r * s, s, p.color);
    }
  }

  drawHint() {
    if (this.state !== 'playing' || this.pos >= this.song.stepsPerBar * 2) return;
    const g = this.g;
    const text = '아래 블록을 끌어서 초록 노트 위에 놓으세요';
    g.font = `13px ${FONT}`;
    const w = g.measureText(text).width + 24;
    const x = (this.W - w) / 2;
    const y = this.gridBottom - 40;
    g.fillStyle = 'rgba(0,0,0,0.65)';
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
    const s = this.cell;
    g.globalAlpha = d.snap ? 0.45 : 0.95;
    for (const [r, c] of d.piece.cells) drawBlock(g, d.px + c * s, d.py + r * s, s, d.piece.color);
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

  drawCountdown() {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    const spb = this.song.stepsPerBeat;
    if (this.pos >= spb * 2) return;
    const beats = Math.ceil(-this.pos / spb);
    let text;
    if (beats > 3) text = 'READY';
    else if (beats >= 1) text = String(beats);
    else text = 'GO!';
    const frac = beats >= 1 ? 1 - (-this.pos / spb - (beats - 1)) : this.pos / (spb * 2);
    const g = this.g;
    const cx = (this.kbW + this.W) / 2;
    const cy = (this.gridTop + this.gridBottom) / 2;
    const size = text === 'READY' ? 40 : 64;
    g.globalAlpha = text === 'READY' ? 0.9 : Math.max(0, 1 - frac * 0.8);
    g.font = `${size * (1 + frac * 0.15)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.strokeText(text, cx, cy);
    g.fillStyle = text === 'GO!' ? '#ffe27a' : '#ffffff';
    g.fillText(text, cx, cy);
    g.globalAlpha = 1;
  }
}
