/* Piano Bricks — layout constants, stage building and ball physics.
 * No DOM access here, so the same code runs in the browser and in tests. */
(function (PB) {
  'use strict';

  const C = {
    W: 540,
    H: 960,
    HUD_H: 96,
    STRIP_H: 22,
    ROLL_H: 384,
    KEY_W: 56,
    BALL_R: 6,
    BALL_SPEED: 850,
    TURNS: 30,
    STEPS: 2, // cells per beat (eighth-note grid)
    COLS: 16, // cells per stage = 8 beats
    CELL_W: 26,
    MIN_ROWS: 12,
    PADDLE_W: 100,
    PADDLE_MAX_W: 190,
    PADDLE_GROW: 30,
    PADDLE_H: 14,
    ITEM_SPEED: 150, // falling ↔ capsule, px/s
    MAX_BALLS: 5,
    SPEED_ITEM: 1.2,
    SPEED_ITEM_MAX: 1.9,
    TURN_LIMIT: 8, // seconds per launch, keeps a stage around 1–4 minutes
    RAMP: 0.05, // +5% ball speed …
    RAMP_EVERY: 2, // … every 2 s of a turn
    RAMP_CAP: 1.5
  };
  // The paddle sits near the bottom; balls launch from its top.
  C.setHeight = function (h) {
    C.H = h;
    C.PADDLE_Y = h - 74;
    C.LAUNCH_Y = C.PADDLE_Y - C.BALL_R - 1;
  };
  C.setHeight(C.H);
  C.ROLL_TOP = C.HUD_H + C.STRIP_H;
  C.ROLL_BOTTOM = C.ROLL_TOP + C.ROLL_H;
  C.ROLL_LEFT = C.KEY_W;
  C.ROLL_W = C.W - C.KEY_W;
  // The playback line sits at the left edge of the roll, right next to the keys.
  C.PLAYHEAD_X = C.ROLL_LEFT + 2;
  C.PHRASE_W = C.COLS * C.CELL_W;
  // Distance the board travels over the 30 turns before the phrase hits the playback line;
  // the stage fills the rest of the roll.
  C.GAP = C.W - C.PLAYHEAD_X - C.PHRASE_W;
  C.START_X = C.PLAYHEAD_X + C.GAP;
  PB.C = C;

  const BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
  const isBlack = (midi) => BLACK[((midi % 12) + 12) % 12];

  function songRows(song) {
    if (song._rows) return song._rows;
    let lo = Infinity, hi = -Infinity;
    song.stages.forEach((st) => {
      PB.parseMelody(st.melody).notes.forEach((n) => {
        lo = Math.min(lo, n.midi);
        hi = Math.max(hi, n.midi);
      });
    });
    lo -= 1;
    hi += 1;
    for (let grow = 0; hi - lo + 1 < C.MIN_ROWS; grow++) {
      if (grow % 2 === 0) hi++;
      else lo--;
    }
    const n = hi - lo + 1;
    song._rows = { lo, hi, n, h: C.ROLL_H / n };
    return song._rows;
  }

  // Index of a stage across all songs; drives difficulty.
  function stageNumber(songIdx, stageIdx) {
    let d = stageIdx;
    for (let i = 0; i < songIdx; i++) d += PB.SONGS[i].stages.length;
    return d;
  }

  // Block HP is tuned with a headless bot that catches the ball with the paddle
  // most of the time (see README): a shaky player scrapes 1–2 stars, a steady one gets 3.
  const tuning = { noiseBase: 24, noiseStep: 1.2, hpBase: 2.5, hpStep: 0.5 };

  function difficulty(d) {
    const items = ['ball', 'speed', 'paddle'];
    if (d >= 6) items.push('ball');
    if (d >= 11) items.push('paddle');
    return {
      noise: tuning.noiseBase + Math.round(tuning.noiseStep * d),
      items,
      meanHp: tuning.hpBase + tuning.hpStep * d
    };
  }

  function mulberry32(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  const COLORS = ['#3ab8ea', '#7ccb4b', '#ef5b4b', '#f5c443', '#a678ec', '#f28a3a'];
  const SHAPES = [
    { cells: [[0, 0]], weight: 3 },
    { cells: [[0, 0], [1, 0]], weight: 4 },
    { cells: [[0, 0], [0, 1]], weight: 2 },
    { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], weight: 2 },
    { cells: [[0, 0], [1, 0], [2, 0]], weight: 1 }
  ];
  const SHAPE_WEIGHT = SHAPES.reduce((a, s) => a + s.weight, 0);

  function pickShape(rng) {
    let r = rng() * SHAPE_WEIGHT;
    for (const s of SHAPES) {
      r -= s.weight;
      if (r < 0) return s;
    }
    return SHAPES[0];
  }

  // Melody notes become blocks on the cell grid (start/len in cells).
  function melodyBlocks(src, rows, colOffset) {
    return PB.parseMelody(src).notes.map((n) => ({
      midi: n.midi,
      start: n.start * C.STEPS + colOffset,
      len: n.len * C.STEPS,
      row: rows.hi - n.midi,
      black: isBlack(n.midi),
      flash: 0,
      played: false
    }));
  }

  // Special blocks: break in one hit and give an item.
  const ITEM_COLORS = { ball: '#5ce1ff', speed: '#ff5fa2', paddle: '#ffd34d' };

  function noiseCell(col, midi, rows, hp, color, item) {
    return { col, row: rows.hi - midi, midi, hp, maxHp: hp, color, item: item || null, alive: true, flash: 0, passed: false };
  }

  function buildStage(songIdx, stageIdx) {
    const song = PB.SONGS[songIdx];
    const st = song.stages[stageIdx];
    const rows = songRows(song);
    const d = stageNumber(songIdx, stageIdx);
    const diff = difficulty(d);
    const melody = melodyBlocks(st.melody, rows, 0);

    const taken = new Set();
    melody.forEach((n) => {
      for (let c = Math.floor(n.start); c < Math.ceil(n.start + n.len - 1e-6); c++) taken.add(c + ',' + n.row);
    });

    // Same seed every time, so a retry gives the same layout.
    const rng = mulberry32(hashStr(song.id + ':' + stageIdx));
    const noise = [];
    const plain = diff.noise - diff.items.length;
    for (let tries = 0; noise.length < plain && tries < 5000; tries++) {
      const shape = pickShape(rng);
      const c0 = Math.floor(rng() * C.COLS);
      const r0 = Math.floor(rng() * rows.n);
      const cells = shape.cells.map(([dc, dr]) => [c0 + dc, r0 + dr]);
      if (noise.length + cells.length > plain) continue;
      const fits = cells.every(([c, r]) => c < C.COLS && r < rows.n && !taken.has(c + ',' + r));
      if (!fits) continue;
      const hp = Math.max(1, Math.round(diff.meanHp * (0.6 + 0.8 * rng())));
      const color = COLORS[Math.floor(rng() * COLORS.length)];
      cells.forEach(([c, r]) => {
        taken.add(c + ',' + r);
        noise.push(noiseCell(c, rows.hi - r, rows, hp, color));
      });
    }
    diff.items.forEach((item) => {
      for (let tries = 0; tries < 500; tries++) {
        const c = Math.floor(rng() * C.COLS), r = Math.floor(rng() * rows.n);
        if (taken.has(c + ',' + r)) continue;
        taken.add(c + ',' + r);
        noise.push(noiseCell(c, rows.hi - r, rows, 1, ITEM_COLORS[item], item));
        return;
      }
    });

    return {
      song,
      songIdx,
      stageIdx,
      rows,
      melody,
      noise,
      balls: 1,
      chords: st.chords.split(/\s+/).map((name, i) => ({ cell: i * 2 * C.STEPS, chord: PB.parseChord(name) }))
    };
  }

  // The whole song laid out in form order; leftovers[stageIdx] = [[col, midi, color], ...]
  function buildFullSong(songIdx, leftovers) {
    const song = PB.SONGS[songIdx];
    const rows = songRows(song);
    const melody = [], noise = [], chords = [];
    song.form.forEach((si, i) => {
      const off = i * C.COLS;
      const st = song.stages[si];
      melody.push(...melodyBlocks(st.melody, rows, off));
      (leftovers[si] || []).forEach(([col, midi, color]) => noise.push(noiseCell(col + off, midi, rows, 1, color)));
      st.chords.split(/\s+/).forEach((name, j) => chords.push({ cell: off + j * 2 * C.STEPS, chord: PB.parseChord(name) }));
    });
    return { song, songIdx, rows, melody, noise, chords, cols: song.form.length * C.COLS };
  }

  // The song's melody in form order. Every block a ball hits plays the next note of it;
  // start[stageIdx] is where that stage's phrase first begins.
  function melodySequence(song) {
    if (song._seq) return song._seq;
    const notes = [], start = {};
    song.form.forEach((si) => {
      if (start[si] === undefined) start[si] = notes.length;
      PB.parseMelody(song.stages[si].melody).notes.forEach((n) => notes.push({ midi: n.midi, len: n.len }));
    });
    song._seq = { notes, start };
    return song._seq;
  }

  // ★ rule: 0 left → 3, 1–5 → 2, 6–10 → 1, 11+ → game over (0).
  function starsFor(remaining) {
    if (remaining === 0) return 3;
    if (remaining <= 5) return 2;
    if (remaining <= 10) return 1;
    return 0;
  }

  // ---------- physics ----------

  function circleRect(bx, by, r, rx, ry, rw, rh) {
    const cx = Math.max(rx, Math.min(bx, rx + rw));
    const cy = Math.max(ry, Math.min(by, ry + rh));
    const dx = bx - cx, dy = by - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return null;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      return { nx: dx / d, ny: dy / d, pen: r - d };
    }
    // Centre inside the rect: push out along the shortest axis.
    const left = bx - rx, right = rx + rw - bx, top = by - ry, bottom = ry + rh - by;
    const m = Math.min(left, right, top, bottom);
    if (m === left) return { nx: -1, ny: 0, pen: left + r };
    if (m === right) return { nx: 1, ny: 0, pen: right + r };
    if (m === top) return { nx: 0, ny: -1, pen: top + r };
    return { nx: 0, ny: 1, pen: bottom + r };
  }

  // Keep the direction away from flat or vertical angles so balls never get stuck.
  function fixDir(b) {
    const MIN_DY = 0.16, MIN_DX = 0.06;
    if (Math.abs(b.dy) < MIN_DY) b.dy = (b.dy < 0 ? -1 : 1) * MIN_DY;
    if (Math.abs(b.dx) < MIN_DX) b.dx = (b.dx < 0 ? -1 : 1) * MIN_DX;
    const l = Math.hypot(b.dx, b.dy);
    b.dx /= l;
    b.dy /= l;
  }

  const blockX = (world, col) => world.x + col * C.CELL_W + 1;
  const blockY = (world, row) => C.ROLL_TOP + row * world.rows.h + 1;

  // Paddle bounce angle depends on where the ball lands on it (edges = up to 60°).
  function paddleBounce(b, p) {
    const rel = Math.max(-1, Math.min(1, (b.x - p.x) / (p.w / 2)));
    const ang = rel * 1.05;
    b.dx = Math.sin(ang);
    b.dy = -Math.cos(ang);
    b.y = C.PADDLE_Y - C.BALL_R;
    fixDir(b);
  }

  // Moves ball b by dist px. onHit(kind, obj, b) fires on each bounce
  // (kind: 'wall' | 'key' | 'melody' | 'noise' | 'paddle').
  // world.paddle = { x (centre), w }. Returns true once the ball has fallen off the bottom.
  function stepBall(b, dist, world, onHit) {
    const R = C.BALL_R;
    const steps = Math.max(1, Math.ceil(dist / 3));
    const h = dist / steps;
    const rh = world.rows.h - 2;
    for (let s = 0; s < steps; s++) {
      b.x += b.dx * h;
      b.y += b.dy * h;

      if (b.x < R) {
        b.x = R;
        if (b.dx < 0) { b.dx = -b.dx; fixDir(b); if (onHit) onHit('wall', null, b); }
      } else if (b.x > C.W - R) {
        b.x = C.W - R;
        if (b.dx > 0) { b.dx = -b.dx; fixDir(b); if (onHit) onHit('wall', null, b); }
      }
      if (b.y < C.ROLL_TOP + R) {
        b.y = C.ROLL_TOP + R;
        if (b.dy < 0) { b.dy = -b.dy; fixDir(b); if (onHit) onHit('wall', null, b); }
      }

      let best = circleRect(b.x, b.y, R, 0, C.ROLL_TOP, C.KEY_W, C.ROLL_H);
      let kind = best ? 'key' : null, obj = null;
      if (b.y < C.ROLL_BOTTOM + R) {
        for (const n of world.melody) {
          const c = circleRect(b.x, b.y, R, blockX(world, n.start), blockY(world, n.row), n.len * C.CELL_W - 2, rh);
          if (c && (!best || c.pen > best.pen)) { best = c; kind = 'melody'; obj = n; }
        }
        for (const n of world.noise) {
          if (!n.alive) continue;
          const c = circleRect(b.x, b.y, R, blockX(world, n.col), blockY(world, n.row), C.CELL_W - 2, rh);
          if (c && (!best || c.pen > best.pen)) { best = c; kind = 'noise'; obj = n; }
        }
      }
      if (best) {
        b.x += best.nx * best.pen;
        b.y += best.ny * best.pen;
        const dot = b.dx * best.nx + b.dy * best.ny;
        if (dot < 0) {
          b.dx -= 2 * dot * best.nx;
          b.dy -= 2 * dot * best.ny;
          fixDir(b);
          if (onHit) onHit(kind, obj, b);
        }
      }

      const p = world.paddle;
      if (p && b.dy > 0 && b.y + R >= C.PADDLE_Y && b.y <= C.PADDLE_Y + C.PADDLE_H / 2 &&
          Math.abs(b.x - p.x) <= p.w / 2 + R * 0.6) {
        paddleBounce(b, p);
        if (onHit) onHit('paddle', p, b);
      }

      if (b.y - R > C.H) return true;
    }
    return false;
  }

  // Aim guide: path up to the first bounce plus a short tail.
  function traceAim(x, y, dx, dy, world) {
    const b = { x, y, dx, dy };
    const pts = [{ x, y }];
    let bounced = false, tail = 0;
    for (let total = 0; total < 1800; total += 4) {
      let hit = false;
      const lost = stepBall(b, 4, world, () => { hit = true; });
      if (hit && !bounced) { pts.push({ x: b.x, y: b.y }); bounced = true; }
      if (bounced && (tail += 4) > 140) break;
      if (lost) break;
    }
    pts.push({ x: b.x, y: b.y });
    return pts;
  }

  PB.core = {
    tuning,
    ITEM_COLORS,
    isBlack,
    songRows,
    buildStage,
    buildFullSong,
    melodySequence,
    starsFor,
    stepBall,
    traceAim,
    fixDir
  };
})(window.PB = window.PB || {});
