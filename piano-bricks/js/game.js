/* Piano Bricks — game flow, rendering and input. */
(function (PB) {
  'use strict';

  const C = PB.C, core = PB.core, SND = PB.audio;
  const CW = C.CELL_W, PH = C.PLAYHEAD_X;
  const FONT_D = '"Black Han Sans", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const FONT_U = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  const MIN_ANG = 0.14;
  const YELLOW = '#f5c518', RED = '#ef5b4b';

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let canvas, ctx;

  // ---------- saved progress ----------
  const STORE_KEY = 'pianoBricks.v1';
  const store = { stars: {}, left: {}, best: {}, muted: false };

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) Object.assign(store, JSON.parse(raw));
    } catch (e) { /* storage unavailable: play without saving */ }
  }
  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) { /* ignore */ }
  }
  const keyOf = (songIdx, stageIdx) => PB.SONGS[songIdx].id + ':' + stageIdx;
  const starsOf = (songIdx, stageIdx) => store.stars[keyOf(songIdx, stageIdx)] || 0;
  const songCleared = (songIdx) => PB.SONGS[songIdx].stages.every((_, i) => starsOf(songIdx, i) > 0);
  const stageUnlocked = (songIdx, stageIdx) => stageIdx === 0 || starsOf(songIdx, stageIdx - 1) > 0;

  // ---------- state ----------
  const G = {
    mode: 'title', // title | menu | intro | aim | shoot | play | result | full
    st: null, // current stage (core.buildStage) or full song (core.buildFullSong)
    x: C.START_X, // board left edge
    target: C.START_X,
    ghost: null, // previous phrase sliding out during the intro
    intro: null,
    turn: 0,
    score: 0,
    launcherX: C.W / 2,
    nextX: null,
    balls: [],
    dir: null,
    world: null,
    toLaunch: 0,
    launchT: 0,
    volleyT: 0,
    settle: 0,
    allClear: false,
    aim: null,
    aimAngle: -Math.PI / 2 + 0.2,
    keyDir: 0,
    pointer: null,
    play: null,
    keyFlash: {},
    particles: [],
    floaters: [],
    banner: null,
    shake: 0,
    time: 0,
    countdown: null
  };

  const aliveCount = () => (G.st ? G.st.noise.reduce((a, c) => a + (c.alive ? 1 : 0), 0) : 0);
  const rowY = (row) => C.ROLL_TOP + row * G.st.rows.h;

  // ---------- flow ----------

  function startStage(songIdx, stageIdx, continueFromPrev) {
    clearCountdown();
    SND.stopMusic();
    const prev = continueFromPrev && G.st && !G.st.form ? { st: G.st, x: G.x } : null;
    G.st = core.buildStage(songIdx, stageIdx);
    G.ghost = prev;
    G.turn = 0;
    G.score = 0;
    G.balls = [];
    G.toLaunch = 0;
    G.nextX = null;
    G.aim = null;
    G.play = null;
    G.launcherX = C.W / 2;
    G.keyFlash = {};
    G.particles = [];
    G.floaters = [];
    const from = prev ? Math.max(C.W + 10, prev.x + C.PHRASE_W + CW * 2) : C.W + 10;
    G.intro = { t: 0, from, ghostFrom: prev ? prev.x : 0 };
    G.x = from;
    G.target = C.START_X;
    G.mode = 'intro';
    showScreen(null);
    setBanner('READY', 1.5);
  }

  function updateIntro(dt) {
    const I = G.intro;
    I.t += dt;
    const p = Math.min(1, I.t / 1.0);
    const e = 1 - Math.pow(1 - p, 3);
    const shift = (C.START_X - I.from) * e;
    G.x = I.from + shift;
    if (G.ghost) G.ghost.x = I.ghostFrom + shift;
    if (I.t >= 1.5) {
      G.ghost = null;
      G.mode = 'aim';
      setBanner('GO!', 0.6, YELLOW);
      SND.go();
    }
  }

  function world() {
    return { x: G.x, rows: G.st.rows, melody: G.st.melody, noise: G.st.noise };
  }

  function setAimAngle(a) {
    G.aimAngle = clamp(a, -Math.PI + MIN_ANG, -MIN_ANG);
    const b = { dx: Math.cos(G.aimAngle), dy: Math.sin(G.aimAngle) };
    core.fixDir(b);
    G.aim = { valid: true, dx: b.dx, dy: b.dy, pts: core.traceAim(G.launcherX, C.LAUNCH_Y, b.dx, b.dy, world()) };
  }

  function aimAt(p) {
    const dx = p.x - G.launcherX, dy = p.y - C.LAUNCH_Y;
    if (dy > -12) {
      G.aim = { valid: false };
      return;
    }
    setAimAngle(Math.atan2(dy, dx));
  }

  function fire() {
    if (G.mode !== 'aim' || !G.aim || !G.aim.valid) return;
    G.x = G.target;
    G.world = world();
    G.dir = { dx: G.aim.dx, dy: G.aim.dy };
    G.aim = null;
    G.turn++;
    G.toLaunch = G.st.balls;
    G.launchT = 0;
    G.volleyT = 0;
    G.settle = 0;
    G.nextX = null;
    G.balls = [];
    G.allClear = false;
    G.mode = 'shoot';
  }

  function onHit(kind, obj, b) {
    if (kind === 'noise') {
      obj.hp--;
      obj.flash = 1;
      const cx = G.world.x + obj.col * CW + CW / 2, cy = rowY(obj.row) + G.st.rows.h / 2;
      if (obj.hp <= 0) {
        obj.alive = false;
        G.score += 100;
        burst(cx, cy, obj.color);
        floater('+100', cx, cy, '#fff');
        SND.pop(obj.midi);
        if (!G.allClear && aliveCount() === 0) {
          G.allClear = true;
          setBanner('CLEAR!', 1.2, YELLOW);
        }
      } else {
        G.score += 10;
        SND.bump();
      }
    } else if (kind === 'melody') {
      obj.flash = 1;
      flashKey(obj.midi, false);
      SND.hit(obj.midi);
    } else if (kind === 'key') {
      const row = clamp(Math.floor((b.y - C.ROLL_TOP) / G.st.rows.h), 0, G.st.rows.n - 1);
      const midi = G.st.rows.hi - row;
      flashKey(midi, false);
      SND.hit(midi);
    }
  }

  function updateShoot(dt) {
    G.volleyT += dt;
    const mult = G.allClear ? 3 : G.volleyT < 4 ? 1 : Math.min(3, 1 + (G.volleyT - 4) * 0.4);
    if (G.toLaunch > 0) {
      G.launchT -= dt * mult;
      while (G.toLaunch > 0 && G.launchT <= 0) {
        G.balls.push({ x: G.launcherX, y: C.LAUNCH_Y, dx: G.dir.dx, dy: G.dir.dy, active: true });
        G.toLaunch--;
        G.launchT += 0.08;
        SND.launch();
      }
    }
    const dist = C.BALL_SPEED * dt * mult;
    let flying = 0;
    for (const b of G.balls) {
      if (b.active) {
        if (core.stepBall(b, dist, G.world, onHit)) {
          b.active = false;
          if (G.nextX === null) G.nextX = clamp(b.x, C.BALL_R + 2, C.W - C.BALL_R - 2);
        } else {
          flying++;
        }
      } else if (G.nextX !== null) {
        b.x += (G.nextX - b.x) * Math.min(1, dt * 14);
      }
    }
    if (G.volleyT > 25) {
      // Safety net: never let a volley run forever.
      G.balls.forEach((b) => {
        if (!b.active) return;
        b.active = false;
        b.y = C.LAUNCH_Y;
        if (G.nextX === null) G.nextX = clamp(b.x, C.BALL_R + 2, C.W - C.BALL_R - 2);
      });
      G.toLaunch = 0;
    }
    if (G.toLaunch === 0 && flying === 0) {
      G.settle += dt;
      if (G.settle > 0.25) endVolley();
    }
  }

  function endVolley() {
    G.balls = [];
    if (G.nextX !== null) G.launcherX = G.nextX;
    G.nextX = null;
    if (aliveCount() === 0) return startPlay(true);
    if (G.turn >= C.TURNS) return startPlay(false);
    // The board flows one step toward the playback line.
    G.target = C.START_X - (C.GAP * G.turn) / C.TURNS;
    G.mode = 'aim';
    const left = C.TURNS - G.turn;
    if (left === 10 || left === 5) setBanner(left + '턴 남음', 1.0, left === 5 ? '#ff8a7a' : '#fff', 52);
    if (G.keyDir) setAimAngle(G.aimAngle);
  }

  // Board scrolls through the playback line at the song tempo; every block that
  // crosses it sounds — leftover interference blocks become wrong notes.
  function schedulePlayback(board, startX, lead) {
    const spb = 60 / board.song.bpm;
    const speed = CW / spb;
    const at = (px) => lead + (px - PH) / speed;
    SND.stopMusic();
    board.melody.forEach((n) => SND.note(n.midi, at(startX + n.start * CW), n.len * spb * 0.95, 0.5));
    board.noise.forEach((c) => { if (c.alive) SND.wrong(c.midi, at(startX + c.col * CW), spb * 0.9, 0.3); });
    board.chords.forEach((ch) => SND.chord(ch.chord, at(startX + ch.beat * CW), 2 * spb, 0.16));
    return { t: -lead, speed, startX, wrong: 0 };
  }

  function startPlay(perfect) {
    G.mode = 'play';
    G.aim = null;
    G.play = schedulePlayback(G.st, G.x, 0.9);
    G.play.perfect = perfect;
    setBanner(perfect ? 'PERFECT!' : 'PLAY', 1.1, perfect ? YELLOW : '#fff');
  }

  function crossings(board) {
    for (const n of board.melody) {
      if (!n.played && G.x + n.start * CW <= PH + 0.5) {
        n.played = true;
        n.flash = 1;
        flashKey(n.midi, false);
      }
    }
    for (const c of board.noise) {
      if (c.alive && !c.passed && G.x + c.col * CW <= PH + 0.5) {
        c.passed = true;
        c.flash = 1;
        flashKey(c.midi, true);
        G.shake = 0.35;
        G.play.wrong++;
        floater('✕', PH, rowY(c.row) + G.st.rows.h / 2, RED);
      }
    }
  }

  function updatePlay(dt) {
    const P = G.play;
    P.t += dt;
    if (P.t > 0) G.x = P.startX - P.speed * P.t;
    crossings(G.st);
    const len = G.st.form ? G.st.cols * CW : C.PHRASE_W;
    if (G.x + len < PH - CW * 0.75) {
      if (G.st.form) finishFull();
      else finishStage();
    }
  }

  function finishStage() {
    const st = G.st;
    const rem = aliveCount();
    const stars = core.starsFor(rem);
    let bonus = 0;
    if (stars > 0) {
      bonus = (C.TURNS - G.turn) * 100 + stars * 300;
      G.score += bonus;
      const k = keyOf(st.songIdx, st.stageIdx);
      const prevStars = store.stars[k] || 0;
      const prevLeft = store.left[k];
      if (stars > prevStars || (stars === prevStars && (!prevLeft || rem < prevLeft.length))) {
        store.stars[k] = stars;
        store.left[k] = st.noise.filter((c) => c.alive).map((c) => [c.col, c.midi, c.color]);
      }
      store.best[k] = Math.max(store.best[k] || 0, G.score);
      saveStore();
      SND.fanfare(stars);
    } else {
      SND.fail();
    }
    G.mode = 'result';
    showStageResult(stars, rem, bonus);
  }

  function startFull(songIdx) {
    clearCountdown();
    const song = PB.SONGS[songIdx];
    const leftovers = song.stages.map((_, i) => store.left[keyOf(songIdx, i)] || []);
    G.st = core.buildFullSong(songIdx, leftovers);
    G.st.form = song.form;
    G.ghost = null;
    G.balls = [];
    G.aim = null;
    G.keyFlash = {};
    G.particles = [];
    G.floaters = [];
    G.x = PH + CW;
    G.mode = 'full';
    G.play = schedulePlayback(G.st, G.x, 1.2);
    showScreen(null);
    setBanner('♪ 전곡 듣기', 1.4, '#fff', 56);
  }

  function finishFull() {
    const songIdx = G.st.songIdx;
    const song = PB.SONGS[songIdx];
    const got = song.stages.reduce((a, _, i) => a + starsOf(songIdx, i), 0);
    const wrong = G.st.noise.length;
    G.mode = 'result';
    SND.fanfare(wrong === 0 ? 3 : 2);
    const actions = [{ label: '다시 듣기', fn: () => startFull(songIdx) }, { label: '목록', fn: openMenu }];
    if (songIdx + 1 < PB.SONGS.length) {
      actions.unshift({ label: '다음 곡 ▶', fn: () => startStage(songIdx + 1, 0, false), primary: true });
    } else {
      actions[0].primary = true;
    }
    showResult({
      sub: song.title + ' · 전곡 듣기',
      title: '완곡!',
      fail: false,
      stars: Math.round(got / song.stages.length),
      stats: [
        ['획득한 별', '★ ' + got + ' / ' + song.stages.length * 3],
        ['틀린 음', wrong + '개']
      ],
      msg: wrong === 0 ? '방해 음 하나 없이 원곡 그대로 연주했어요!' : '남겨 둔 방해 블럭 ' + wrong + '개가 틀린 음으로 섞였어요.',
      actions
    });
  }

  function openMenu() {
    clearCountdown();
    SND.stopMusic();
    G.mode = 'menu';
    renderMenu();
    showScreen('menu');
  }

  // ---------- effects ----------

  function setBanner(text, dur, color, size) {
    G.banner = { text, t: 0, dur, color: color || '#f3f3f3', size: size || 76 };
  }

  function flashKey(midi, wrong) {
    G.keyFlash[midi] = { v: 1, wrong };
  }

  function burst(x, y, color) {
    for (let i = 0; i < 12; i++) {
      G.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 380,
        vy: -Math.random() * 320 - 60,
        s: 3 + Math.random() * 4,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 12,
        t: 0,
        life: 0.55 + Math.random() * 0.35,
        color
      });
    }
  }

  function floater(text, x, y, color) {
    G.floaters.push({ text, x, y, t: 0, life: 0.8, color });
  }

  function updateFx(dt) {
    for (const k in G.keyFlash) {
      G.keyFlash[k].v -= dt * 2.5;
      if (G.keyFlash[k].v <= 0) delete G.keyFlash[k];
    }
    const decay = (o) => { if (o.flash > 0) o.flash = Math.max(0, o.flash - dt * 3.5); };
    if (G.st) {
      G.st.melody.forEach(decay);
      G.st.noise.forEach(decay);
    }
    G.particles = G.particles.filter((p) => {
      p.t += dt;
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      return p.t < p.life;
    });
    G.floaters = G.floaters.filter((f) => {
      f.t += dt;
      f.y -= 60 * dt;
      return f.t < f.life;
    });
    if (G.banner) {
      G.banner.t += dt;
      if (G.banner.t >= G.banner.dur) G.banner = null;
    }
    G.shake = Math.max(0, G.shake - dt * 2);
  }

  function update(dt) {
    G.time += dt;
    updateFx(dt);
    switch (G.mode) {
      case 'intro': updateIntro(dt); break;
      case 'aim':
        G.x += (G.target - G.x) * Math.min(1, dt * 8);
        if (G.keyDir) setAimAngle(G.aimAngle + G.keyDir * 1.3 * dt);
        break;
      case 'shoot': updateShoot(dt); break;
      case 'play':
      case 'full': updatePlay(dt); break;
    }
  }

  // ---------- drawing ----------

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawStar(cx, cy, r, color) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawHud() {
    ctx.fillStyle = '#0f1011';
    ctx.fillRect(0, 0, C.W, C.HUD_H);
    if (!G.st) return;
    const song = G.st.song;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#9a9b9e';
    ctx.font = '600 18px ' + FONT_U;
    const sub = G.st.form ? '전곡 듣기' : (G.st.stageIdx + 1) + ' / ' + song.stages.length;
    ctx.fillText(song.title + '  ·  ' + sub, C.W / 2, 30);
    if (G.st.form) return;
    ctx.font = '40px ' + FONT_D;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#000';
    ctx.strokeText(G.score.toLocaleString(), C.W / 2, 76);
    ctx.fillStyle = YELLOW;
    ctx.fillText(G.score.toLocaleString(), C.W / 2, 76);
  }

  function drawStrip() {
    const top = C.HUD_H;
    ctx.fillStyle = '#18191b';
    ctx.fillRect(0, top, C.W, C.STRIP_H);
    ctx.fillStyle = '#0d0d0e';
    ctx.fillRect(0, top, C.KEY_W, C.STRIP_H);
    let k = Math.ceil((C.ROLL_LEFT - G.x) / CW);
    for (let x = G.x + k * CW; x < C.W; x += CW, k++) {
      const bar = ((k % 4) + 4) % 4 === 0;
      ctx.fillStyle = bar ? '#4a4c51' : '#2c2e32';
      const h = bar ? 9 : 5;
      ctx.fillRect(Math.round(x) - 0.5, top + C.STRIP_H - h, 1, h);
    }
  }

  function drawGrid(rows) {
    for (let r = 0; r < rows.n; r++) {
      const y = C.ROLL_TOP + r * rows.h;
      ctx.fillStyle = core.isBlack(rows.hi - r) ? '#0b0c0d' : '#141517';
      ctx.fillRect(C.ROLL_LEFT, y, C.ROLL_W, rows.h);
      ctx.fillStyle = '#1e1f22';
      ctx.fillRect(C.ROLL_LEFT, y + rows.h - 0.5, C.ROLL_W, 1);
    }
    let k = Math.ceil((C.ROLL_LEFT - G.x) / CW);
    for (let x = G.x + k * CW; x < C.W; x += CW, k++) {
      ctx.fillStyle = ((k % 4) + 4) % 4 === 0 ? '#2b2d31' : '#1b1c1f';
      ctx.fillRect(Math.round(x) - 0.5, C.ROLL_TOP, 1, C.ROLL_H);
    }
  }

  // The stage area and the shrinking distance to the playback line.
  function drawZone() {
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(G.x, C.ROLL_TOP, C.PHRASE_W, C.ROLL_H);
    if (G.x > PH) {
      const danger = G.turn / C.TURNS;
      ctx.fillStyle = 'rgba(239,91,75,' + (0.05 + danger * 0.12) + ')';
      ctx.fillRect(PH, C.ROLL_TOP, G.x - PH, C.ROLL_H);
    }
  }

  function drawNote(x, y, w, h, black, flash, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (flash > 0) {
      ctx.shadowColor = 'rgba(255,214,90,' + flash + ')';
      ctx.shadowBlur = 18 * flash;
    }
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (black) {
      g.addColorStop(0, '#45464c');
      g.addColorStop(0.5, '#1d1e22');
      g.addColorStop(1, '#0d0d0f');
    } else {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#d5d4cf');
    }
    roundRect(x, y, w, h, 4);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = black ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.25)';
    ctx.stroke();
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,220,110,' + flash * 0.55 + ')';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTile(x, y, w, h, color, hp, flash, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const b = Math.max(2, Math.min(w, h) * 0.15);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - b, y + b);
    ctx.lineTo(x + b, y + b); ctx.lineTo(x + b, y + h - b); ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
    ctx.lineTo(x + b, y + h - b); ctx.lineTo(x + w - b, y + h - b); ctx.lineTo(x + w - b, y + b);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (hp > 1) {
      ctx.font = '700 ' + Math.min(15, h * 0.6) + 'px ' + FONT_U;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeText(String(hp), x + w / 2, y + h / 2 + 1);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(hp), x + w / 2, y + h / 2 + 1);
    }
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + flash * 0.7 + ')';
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  function drawBoard(board, bx, alpha) {
    const h = board.rows.h;
    for (const n of board.melody) {
      const x = bx + n.start * CW + 1, w = n.len * CW - 2;
      if (x > C.W || x + w < C.ROLL_LEFT) continue;
      drawNote(x, C.ROLL_TOP + n.row * h + 1, w, h - 2, n.black, n.flash, alpha * (n.played ? 0.55 : 1));
    }
    for (const c of board.noise) {
      if (!c.alive) continue;
      const x = bx + c.col * CW + 1;
      if (x > C.W || x + CW < C.ROLL_LEFT) continue;
      drawTile(x, C.ROLL_TOP + c.row * h + 1, CW - 2, h - 2, c.color, c.hp, c.flash, alpha * (c.passed ? 0.5 : 1));
    }
  }

  function drawPlayhead() {
    const warn = (G.mode === 'aim' || G.mode === 'shoot') && C.TURNS - G.turn <= 5;
    const pulse = warn ? 0.5 + 0.5 * Math.sin(G.time * 8) : 0;
    ctx.save();
    ctx.shadowColor = warn ? 'rgba(239,91,75,0.9)' : 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = warn ? 'rgb(255,' + Math.round(255 - pulse * 150) + ',' + Math.round(255 - pulse * 170) + ')' : '#fff';
    ctx.fillRect(PH - 1.5, C.ROLL_TOP, 3, C.ROLL_H);
    ctx.restore();
  }

  function drawMarker() {
    const t = C.HUD_H + 2, b = C.ROLL_TOP + 6;
    ctx.beginPath();
    ctx.moveTo(PH - 9, t);
    ctx.lineTo(PH + 9, t);
    ctx.lineTo(PH + 9, b - 8);
    ctx.lineTo(PH, b);
    ctx.lineTo(PH - 9, b - 8);
    ctx.closePath();
    ctx.fillStyle = '#f4f4f2';
    ctx.fill();
  }

  function drawKeys(rows) {
    const w = C.KEY_W, h = rows.h, top = C.ROLL_TOP;
    ctx.fillStyle = '#eceae6';
    ctx.fillRect(0, top, w, C.ROLL_H);
    for (let r = 0; r < rows.n; r++) {
      const midi = rows.hi - r, f = G.keyFlash[midi];
      if (f && !core.isBlack(midi)) {
        ctx.fillStyle = (f.wrong ? 'rgba(239,91,75,' : 'rgba(245,197,24,') + f.v * 0.85 + ')';
        ctx.fillRect(0, top + r * h, w, h);
      }
    }
    ctx.fillStyle = '#b5b4af';
    for (let r = 0; r < rows.n; r++) {
      const midi = rows.hi - r, pc = midi % 12, y = top + r * h;
      if (pc === 5 || pc === 0) ctx.fillRect(0, y + h - 0.5, w, 1);
      if (core.isBlack(midi)) ctx.fillRect(w * 0.6, y + h / 2 - 0.5, w * 0.4, 1);
    }
    for (let r = 0; r < rows.n; r++) {
      const midi = rows.hi - r, y = top + r * h;
      if (!core.isBlack(midi)) continue;
      const f = G.keyFlash[midi];
      roundRect(0, y + 1.5, w * 0.62, h - 3, 3);
      ctx.fillStyle = f ? (f.wrong ? RED : YELLOW) : '#18191c';
      ctx.fill();
      if (!f) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(2, y + 3, w * 0.62 - 6, 1.5);
      }
    }
    ctx.font = '700 11px ' + FONT_U;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#8e8d88';
    for (let r = 0; r < rows.n; r++) {
      const midi = rows.hi - r;
      if (midi % 12 === 0) ctx.fillText('C' + (Math.floor(midi / 12) - 1), w - 4, top + r * h + h - 5);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(w - 1, top, 1, C.ROLL_H);
  }

  function drawField() {
    const g = ctx.createLinearGradient(0, C.ROLL_BOTTOM, 0, C.H);
    g.addColorStop(0, '#29594f');
    g.addColorStop(1, '#193833');
    ctx.fillStyle = g;
    ctx.fillRect(0, C.ROLL_BOTTOM, C.W, C.H - C.ROLL_BOTTOM);
    const s = ctx.createLinearGradient(0, C.ROLL_BOTTOM, 0, C.ROLL_BOTTOM + 18);
    s.addColorStop(0, 'rgba(0,0,0,0.35)');
    s.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = s;
    ctx.fillRect(0, C.ROLL_BOTTOM, C.W, 18);
    if (G.mode === 'full' || (G.st && G.st.form)) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, C.LAUNCH_Y + C.BALL_R + 3);
    ctx.lineTo(C.W, C.LAUNCH_Y + C.BALL_R + 3);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawBall(x, y) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.8)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, C.BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
  }

  function drawLauncher() {
    if (!G.st || G.st.form) return;
    const showRest = G.mode === 'intro' || G.mode === 'aim' || (G.mode === 'shoot' && G.toLaunch > 0);
    if (showRest) {
      drawBall(G.launcherX, C.LAUNCH_Y);
      const n = G.mode === 'shoot' ? G.toLaunch : G.st.balls;
      if (n > 1) {
        ctx.font = '700 15px ' + FONT_U;
        ctx.textAlign = G.launcherX > C.W - 60 ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText('×' + n, G.launcherX + (G.launcherX > C.W - 60 ? -14 : 14), C.LAUNCH_Y - 14);
      }
    }
    for (const b of G.balls) drawBall(b.x, b.y);
  }

  function drawAim() {
    if (G.mode !== 'aim' || !G.aim || !G.aim.valid) return;
    const pts = G.aim.pts;
    const spacing = 16;
    let carry = (G.time * 50) % spacing;
    let travelled = 0;
    ctx.fillStyle = '#fff';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      for (let d = spacing - carry; d <= seg; d += spacing) {
        const t = d / seg;
        ctx.globalAlpha = Math.max(0.15, 1 - (travelled + d) / 900);
        ctx.beginPath();
        ctx.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      carry = (carry + seg) % spacing;
      travelled += seg;
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (const p of G.particles) {
      ctx.save();
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of G.floaters) {
      ctx.globalAlpha = 1 - f.t / f.life;
      ctx.font = '700 16px ' + FONT_U;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawStatus() {
    const y = C.H - 32, barY = C.H - 14;
    const left = aliveCount(), turnsLeft = C.TURNS - G.turn;
    ctx.font = '700 17px ' + FONT_U;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = turnsLeft <= 5 ? '#ff9a8a' : 'rgba(255,255,255,0.88)';
    ctx.fillText('남은 발사 ' + turnsLeft, 20, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = left > 10 ? '#ff9a8a' : 'rgba(255,255,255,0.88)';
    ctx.fillText('방해 블럭 ' + left, C.W - 20, y);
    const s = core.starsFor(left);
    for (let i = 0; i < 3; i++) drawStar(C.W / 2 + (i - 1) * 26, y - 1, 10, i < s ? YELLOW : 'rgba(255,255,255,0.2)');
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(20, barY, C.W - 40, 4);
    ctx.fillStyle = turnsLeft <= 5 ? RED : YELLOW;
    ctx.fillRect(20, barY, ((C.W - 40) * turnsLeft) / C.TURNS, 4);
  }

  function drawHint() {
    if (G.mode !== 'aim' || G.turn > 0 || (G.aim && G.aim.valid)) return;
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(G.time * 4);
    ctx.font = '700 19px ' + FONT_U;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    const y = (C.ROLL_BOTTOM + C.LAUNCH_Y) / 2;
    ctx.fillText('위쪽을 눌러 조준하고, 손을 떼면 발사!', C.W / 2, y);
    ctx.font = '600 15px ' + FONT_U;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('흰·검은 블럭은 원곡 멜로디(안 깨짐) · 컬러 블럭을 모두 깨세요', C.W / 2, y + 32);
    ctx.globalAlpha = 1;
  }

  function drawPlayPanel() {
    const P = G.play;
    if (!P) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const full = !!G.st.form;
    ctx.font = (full ? 46 : 40) + 'px ' + FONT_D;
    ctx.fillStyle = '#fff';
    ctx.fillText(full ? '♪ 전곡 듣기' : '♪ 재생 중', C.W / 2, 610);
    ctx.font = '600 19px ' + FONT_U;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText(G.st.song.title + ' — ' + G.st.song.en, C.W / 2, 652);
    const len = full ? G.st.cols * CW : C.PHRASE_W;
    const prog = clamp((P.startX - G.x) / (P.startX - PH + len), 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(70, 690, C.W - 140, 8, 4);
    ctx.fill();
    ctx.fillStyle = YELLOW;
    roundRect(70, 690, Math.max(8, (C.W - 140) * prog), 8, 4);
    ctx.fill();
    ctx.font = '700 20px ' + FONT_U;
    if (P.wrong > 0) {
      ctx.fillStyle = '#ff8a7a';
      ctx.fillText('틀린 음 ' + P.wrong + '개', C.W / 2, 740);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(G.st.noise.some((c) => c.alive) ? '방해 블럭이 재생 라인으로 다가와요…' : '원곡 그대로 연주 중', C.W / 2, 740);
    }
  }

  function drawBanner() {
    const b = G.banner;
    if (!b) return;
    const p = b.t / b.dur;
    const sc = p < 0.15 ? 0.6 + (p / 0.15) * 0.45 : p < 0.25 ? 1.05 - ((p - 0.15) / 0.1) * 0.05 : 1;
    ctx.save();
    ctx.globalAlpha = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
    ctx.translate(PH, C.ROLL_TOP + C.ROLL_H * 0.45);
    ctx.scale(sc, sc);
    ctx.font = b.size + 'px ' + FONT_D;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(b.text, 0, 0);
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, 0, 0);
    ctx.restore();
  }

  function draw() {
    const k = canvas.width / C.W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, C.W, C.H);
    ctx.save();
    if (G.shake > 0) ctx.translate((Math.random() - 0.5) * 10 * G.shake, (Math.random() - 0.5) * 6 * G.shake);
    drawHud();
    drawField();
    if (G.st) {
      drawStrip();
      ctx.save();
      ctx.beginPath();
      ctx.rect(C.ROLL_LEFT, C.ROLL_TOP, C.ROLL_W, C.ROLL_H);
      ctx.clip();
      drawGrid(G.st.rows);
      if (!G.st.form) drawZone();
      if (G.ghost) drawBoard(G.ghost.st, G.ghost.x, 0.4);
      drawBoard(G.st, G.x, 1);
      drawPlayhead();
      ctx.restore();
      drawKeys(G.st.rows);
      drawMarker();
      if (G.mode === 'play' || G.mode === 'full') drawPlayPanel();
      else if (!G.st.form && G.mode !== 'title' && G.mode !== 'menu') {
        drawHint();
        drawStatus();
      }
      drawAim();
      drawLauncher();
      drawParticles();
    }
    drawBanner();
    ctx.restore();
  }

  // ---------- DOM screens ----------

  function showScreen(name) {
    ['title', 'menu', 'result'].forEach((n) => $('screen-' + n).classList.toggle('hidden', n !== name));
    $('hud').classList.toggle('hidden', name === 'title' || name === 'menu');
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

  function renderMenu() {
    const list = $('song-list');
    list.textContent = '';
    let total = 0, max = 0;
    PB.SONGS.forEach((song, si) => {
      const got = song.stages.reduce((a, _, i) => a + starsOf(si, i), 0);
      total += got;
      max += song.stages.length * 3;

      const card = el('article', 'song-card');
      const head = el('div', 'song-head');
      const names = el('div');
      names.appendChild(el('h3', null, song.title));
      names.appendChild(el('p', null, song.en + ' · ' + song.stages.length + '스테이지'));
      head.appendChild(names);
      head.appendChild(el('div', 'song-stars', '★ ' + got + '/' + song.stages.length * 3));
      card.appendChild(head);

      const row = el('div', 'stage-row');
      song.stages.forEach((_, i) => {
        const open = stageUnlocked(si, i);
        const s = starsOf(si, i);
        const b = el('button', 'stage-chip' + (s ? ' done' : ''));
        b.disabled = !open;
        b.appendChild(el('span', 'num', open ? String(i + 1) : '🔒'));
        b.appendChild(el('span', 'mini', open ? starText(s) : String(i + 1)));
        b.setAttribute('aria-label', '스테이지 ' + (i + 1) + (open ? ', 별 ' + s + '개' : ', 잠김'));
        b.addEventListener('click', () => { SND.unlock(); startStage(si, i, false); });
        row.appendChild(b);
      });
      card.appendChild(row);

      const full = el('button', 'btn full-btn', songCleared(si) ? '♪ 전곡 듣기' : '♪ 전곡 듣기 (모든 스테이지 클리어 시)');
      full.disabled = !songCleared(si);
      full.addEventListener('click', () => { SND.unlock(); startFull(si); });
      card.appendChild(full);
      list.appendChild(card);
    });
    $('menu-total').textContent = '★ ' + total + ' / ' + max;
  }

  function clearCountdown() {
    if (G.countdown) clearInterval(G.countdown);
    G.countdown = null;
  }

  function showResult(r) {
    clearCountdown();
    $('res-sub').textContent = r.sub;
    const title = $('res-title');
    title.textContent = r.title;
    title.classList.toggle('fail', r.fail);
    document.querySelectorAll('#res-stars .star').forEach((s, i) => {
      s.classList.remove('on');
      void s.offsetWidth; // restart the pop animation
      s.classList.toggle('on', i < r.stars);
      s.style.animationDelay = 0.15 + i * 0.18 + 's';
    });
    const stats = $('res-stats');
    stats.textContent = '';
    r.stats.forEach(([k, v]) => {
      const row = el('div', 'stat');
      row.appendChild(el('dt', null, k));
      row.appendChild(el('dd', null, v));
      stats.appendChild(row);
    });
    $('res-msg').textContent = r.msg;
    const box = $('res-actions');
    box.textContent = '';
    r.actions.forEach((a) => {
      const b = el('button', 'btn' + (a.primary ? ' primary' : ''), a.label);
      b.addEventListener('click', () => { clearCountdown(); SND.unlock(); a.fn(); });
      box.appendChild(b);
      if (a.auto) {
        let n = a.auto;
        b.textContent = a.label + ' ' + n;
        G.countdown = setInterval(() => {
          n--;
          b.textContent = a.label + ' ' + n;
          if (n <= 0) { clearCountdown(); a.fn(); }
        }, 1000);
      }
    });
    showScreen('result');
  }

  function showStageResult(stars, rem, bonus) {
    const st = G.st, song = st.song, last = st.stageIdx === song.stages.length - 1;
    const retry = { label: '다시 하기', fn: () => startStage(st.songIdx, st.stageIdx, false) };
    const menu = { label: '목록', fn: openMenu };
    let actions;
    if (stars === 0) {
      retry.primary = true;
      actions = [retry, menu];
    } else if (last && songCleared(st.songIdx)) {
      // Whole song cleared: go on to the full-song playback.
      actions = [{ label: '전곡 듣기 ▶', fn: () => startFull(st.songIdx), primary: true, auto: 5 }, retry, menu];
    } else if (last) {
      actions = [retry, menu];
    } else {
      actions = [{ label: '다음 스테이지 ▶', fn: () => startStage(st.songIdx, st.stageIdx + 1, true), primary: true }, retry, menu];
    }
    showResult({
      sub: song.title + ' · STAGE ' + (st.stageIdx + 1),
      title: stars === 3 ? 'PERFECT!' : stars > 0 ? 'STAGE CLEAR' : 'GAME OVER',
      fail: stars === 0,
      stars,
      stats: [
        ['남은 방해 블럭', rem + '개'],
        ['사용한 발사', G.turn + ' / ' + C.TURNS],
        ['점수', G.score.toLocaleString() + (bonus ? ' (보너스 +' + bonus.toLocaleString() + ')' : '')]
      ],
      msg: stars === 3 ? '방해 음 없이 원곡 그대로 연주했어요!'
        : stars > 0 ? '틀린 음 ' + rem + '개가 섞였어요. 0개면 ★★★!'
        : '방해 블럭이 11개 이상 남아 노래를 망쳤어요.',
      actions
    });
  }

  // ---------- input ----------

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * C.W, y: ((e.clientY - r.top) / r.height) * C.H };
  }

  function bindInput() {
    canvas.addEventListener('pointerdown', (e) => {
      SND.unlock();
      if (G.mode !== 'aim') return;
      e.preventDefault();
      G.pointer = e.pointerId;
      G.keyDir = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      aimAt(toLogical(e));
    });
    canvas.addEventListener('pointermove', (e) => {
      if (G.pointer !== e.pointerId || G.mode !== 'aim') return;
      aimAt(toLogical(e));
    });
    canvas.addEventListener('pointerup', (e) => {
      if (G.pointer !== e.pointerId) return;
      G.pointer = null;
      if (G.mode !== 'aim') return;
      aimAt(toLogical(e));
      if (G.aim && G.aim.valid) fire();
      else G.aim = null;
    });
    canvas.addEventListener('pointercancel', () => {
      G.pointer = null;
      G.aim = null;
    });

    window.addEventListener('keydown', (e) => {
      SND.unlock();
      if (G.mode !== 'aim') return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        G.keyDir = e.key === 'ArrowLeft' ? -1 : 1;
        if (!G.aim || !G.aim.valid) setAimAngle(G.aimAngle);
        e.preventDefault();
      } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp') {
        if (!G.aim || !G.aim.valid) setAimAngle(G.aimAngle);
        fire();
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') G.keyDir = 0;
    });

    $('btn-start').addEventListener('click', () => { SND.unlock(); openMenu(); });
    $('menu-back').addEventListener('click', () => showScreen('title'));
    $('btn-close').addEventListener('click', openMenu);
    $('btn-restart').addEventListener('click', () => {
      SND.unlock();
      if (!G.st) return;
      if (G.st.form) startFull(G.st.songIdx);
      else startStage(G.st.songIdx, G.st.stageIdx, false);
    });
    $('btn-sound').addEventListener('click', () => {
      SND.unlock();
      store.muted = !store.muted;
      SND.setMuted(store.muted);
      saveStore();
      syncSoundButton();
    });
  }

  function syncSoundButton() {
    const b = $('btn-sound');
    b.classList.toggle('muted', store.muted);
    b.setAttribute('aria-label', store.muted ? '소리 켜기' : '소리 끄기');
  }

  // ---------- boot ----------

  function resize() {
    const frame = $('frame');
    const vw = document.body.clientWidth || window.innerWidth;
    const vh = document.body.clientHeight || window.innerHeight;
    // Tall phones get a taller launch area instead of empty bars.
    C.H = Math.round(clamp((C.W * vh) / vw, 960, 1200));
    C.LAUNCH_Y = C.H - 66;
    const scale = Math.min(vw / C.W, vh / C.H);
    const w = Math.floor(C.W * scale), h = Math.floor(C.H * scale);
    frame.style.width = w + 'px';
    frame.style.height = h + 'px';
    frame.style.setProperty('--u', scale + 'px');
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  let last = 0;
  function loop(ts) {
    const dt = last ? Math.min(0.033, (ts - last) / 1000) : 0;
    last = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function boot() {
    canvas = $('game');
    ctx = canvas.getContext('2d');
    loadStore();
    SND.setMuted(store.muted);
    syncSoundButton();
    // Title backdrop: the first stage, idle.
    G.st = core.buildStage(0, 0);
    G.x = C.START_X;
    resize();
    window.addEventListener('resize', resize);
    bindInput();
    showScreen('title');
    requestAnimationFrame(loop);
  }

  PB.game = { state: G, startStage, startFull, openMenu, fire, setAimAngle, store };
  document.addEventListener('DOMContentLoaded', boot);
})(window.PB = window.PB || {});
