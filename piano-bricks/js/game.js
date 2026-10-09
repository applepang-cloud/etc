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
  const STORE_KEY = 'pianoBricks.v2'; // v2: 16-cell stages, old layouts don't carry over
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
  // Songs made in the 만들기 screen live in their own key, appended after the built-in songs.
  const CUSTOM_KEY = 'pianoBricks.custom';

  function loadCustomSongs() {
    let list = [];
    try {
      list = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    } catch (e) { /* ignore */ }
    if (!Array.isArray(list)) return;
    list.forEach((song) => {
      try {
        if (!song || !song.custom || !song.stages.length) return;
        core.songRows(song); // throws on a malformed melody
        PB.SONGS.push(song);
      } catch (e) { /* skip a broken entry */ }
    });
  }

  function saveCustomSongs() {
    const songs = PB.SONGS.filter((s) => s.custom);
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(songs, (k, v) => (k.charAt(0) === '_' ? undefined : v)));
    } catch (e) { /* ignore */ }
  }

  function addCustomSong(song) {
    PB.SONGS.push(song);
    saveCustomSongs();
    return PB.SONGS.length - 1;
  }

  function removeCustomSong(id) {
    const i = PB.SONGS.findIndex((s) => s.custom && s.id === id);
    if (i < 0) return;
    PB.SONGS.splice(i, 1);
    saveCustomSongs();
    Object.keys(store.stars).forEach((k) => {
      if (k.startsWith(id + ':')) {
        delete store.stars[k];
        delete store.left[k];
        delete store.best[k];
      }
    });
    saveStore();
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
    pad: { x: C.W / 2, w: C.PADDLE_W, flash: 0 }, // 발판 (paddle)
    padW: C.PADDLE_W, // width the paddle grows toward
    perLaunch: 1, // balls fired per launch
    speedMult: 1, // ⚡ items, this turn only
    balls: [],
    items: [], // falling ↔ capsules
    dir: null,
    world: null,
    toLaunch: 0,
    launchT: 0,
    turnT: 0,
    settle: 0,
    allClear: false,
    aim: null,
    aimAngle: -Math.PI / 2 + 0.2,
    keyDir: 0,
    pointer: null,
    padDrag: false,
    seq: null, // song melody played by block hits
    seqIdx: 0,
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
    G.items = [];
    G.toLaunch = 0;
    G.aim = null;
    G.play = null;
    G.pad.x = C.W / 2;
    G.pad.w = G.padW = C.PADDLE_W;
    G.perLaunch = G.st.balls;
    G.speedMult = 1;
    G.seq = core.melodySequence(G.st.song);
    G.seqIdx = G.seq.start[stageIdx] || 0;
    SND.ambientChords(G.st.chords.map((c) => c.chord));
    SND.ambientDuck(false);
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
    return { x: G.x, rows: G.st.rows, melody: G.st.melody, noise: G.st.noise, paddle: G.pad };
  }

  function movePaddle(x) {
    G.pad.x = clamp(x, G.pad.w / 2, C.W - G.pad.w / 2);
  }

  function setAimAngle(a) {
    G.aimAngle = clamp(a, -Math.PI + MIN_ANG, -MIN_ANG);
    const b = { dx: Math.cos(G.aimAngle), dy: Math.sin(G.aimAngle) };
    core.fixDir(b);
    G.aim = { valid: true, dx: b.dx, dy: b.dy, pts: core.traceAim(G.pad.x, C.LAUNCH_Y, b.dx, b.dy, world()) };
  }

  function aimAt(p) {
    const dx = p.x - G.pad.x, dy = p.y - C.LAUNCH_Y;
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
    G.toLaunch = G.perLaunch;
    G.launchT = 0;
    G.turnT = 0;
    G.settle = 0;
    G.speedMult = 1;
    G.balls = [];
    G.allClear = false;
    G.mode = 'shoot';
  }

  function randomUp() {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    return { dx: Math.cos(a), dy: Math.sin(a) };
  }

  function giveItem(item, cx, cy) {
    if (item === 'ball') {
      // A new ball joins right away, and every later launch fires one more.
      const d = randomUp();
      G.balls.push({ x: cx, y: cy, dx: d.dx, dy: d.dy, active: true });
      G.perLaunch = Math.min(C.MAX_BALLS, G.perLaunch + 1);
      floater('공 +1', cx, cy - 18, core.ITEM_COLORS.ball);
      SND.item();
    } else if (item === 'speed') {
      G.speedMult = Math.min(C.SPEED_ITEM_MAX, G.speedMult * C.SPEED_ITEM);
      floater('속도 UP', cx, cy - 18, core.ITEM_COLORS.speed);
      SND.item();
    } else if (item === 'paddle') {
      G.items.push({ type: 'paddle', x: cx, y: cy, t: 0 });
    }
  }

  // Every block hit plays the next note of the song, so play itself sounds like the melody.
  function playHitNote() {
    const notes = G.seq && G.seq.notes;
    if (!notes || !notes.length) return;
    const n = notes[G.seqIdx % notes.length];
    if (!SND.melodyHit(n.midi, (n.len * 60) / G.st.song.bpm)) return;
    G.seqIdx++;
    flashKey(n.midi, false);
  }

  function onHit(kind, obj, b) {
    if (kind === 'noise') {
      obj.hp--;
      obj.flash = 1;
      const cx = G.world.x + obj.col * CW + CW / 2, cy = rowY(obj.row) + G.st.rows.h / 2;
      playHitNote();
      if (obj.hp <= 0) {
        obj.alive = false;
        G.score += 100;
        burst(cx, cy, obj.color);
        floater('+100', cx, cy, '#fff');
        SND.sparkle();
        if (obj.item) giveItem(obj.item, cx, cy);
        if (!G.allClear && aliveCount() === 0) {
          G.allClear = true;
          setBanner('CLEAR!', 1.2, YELLOW);
        }
      } else {
        G.score += 10;
      }
    } else if (kind === 'paddle') {
      G.pad.flash = 1;
      SND.paddle();
    } else if (kind === 'melody') {
      obj.flash = 1;
      playHitNote();
    } else if (kind === 'key') {
      playHitNote();
    }
  }

  // Balls speed up the longer a turn lasts, so every turn ends eventually.
  const rampMult = () => Math.min(C.RAMP_CAP, 1 + C.RAMP * Math.floor(G.turnT / C.RAMP_EVERY));

  function updateItems(dt) {
    const p = G.pad;
    G.items = G.items.filter((it) => {
      it.t += dt;
      it.y += C.ITEM_SPEED * dt;
      const caught = it.y + 9 >= C.PADDLE_Y && it.y - 9 <= C.PADDLE_Y + C.PADDLE_H &&
        Math.abs(it.x - p.x) <= p.w / 2 + 16;
      if (caught) {
        G.padW = Math.min(C.PADDLE_MAX_W, G.padW + C.PADDLE_GROW);
        p.flash = 1;
        floater('발판 UP', p.x, C.PADDLE_Y - 24, core.ITEM_COLORS.paddle);
        SND.item();
        return false;
      }
      return it.y < C.H + 20;
    });
  }

  function updateShoot(dt) {
    G.turnT += dt;
    if (G.keyDir) movePaddle(G.pad.x + G.keyDir * 900 * dt);
    if (G.toLaunch > 0) {
      G.launchT -= dt;
      while (G.toLaunch > 0 && G.launchT <= 0) {
        G.balls.push({ x: G.pad.x, y: C.LAUNCH_Y, dx: G.dir.dx, dy: G.dir.dy, active: true });
        G.toLaunch--;
        G.launchT += 0.08;
        SND.launch();
      }
    }
    if (G.allClear) {
      G.balls = [];
      G.items = [];
      G.toLaunch = 0;
    }
    const dist = C.BALL_SPEED * rampMult() * G.speedMult * dt;
    for (const b of G.balls) {
      if (b.active && core.stepBall(b, dist, G.world, onHit)) {
        b.active = false;
        SND.lose();
      }
    }
    G.balls = G.balls.filter((b) => b.active);
    updateItems(dt);
    if (G.turnT >= C.TURN_LIMIT && G.balls.length) {
      // Time's up: the balls still in play vanish and the turn ends.
      G.balls.forEach((b) => burst(b.x, b.y, '#ffffff'));
      G.balls = [];
      G.toLaunch = 0;
      setBanner('TIME', 0.8, '#fff', 56);
    }
    if (G.toLaunch === 0 && !G.balls.length && !G.items.length) {
      G.settle += dt;
      if (G.settle > 0.3) endVolley();
    }
  }

  function endVolley() {
    G.balls = [];
    G.speedMult = 1;
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
    const spc = 60 / board.song.bpm / C.STEPS; // seconds per grid cell
    const speed = CW / spc;
    const at = (px) => lead + (px - PH) / speed;
    SND.stopMusic();
    board.melody.forEach((n) => SND.note(n.midi, at(startX + n.start * CW), n.len * spc * 0.95, 0.5));
    board.noise.forEach((c) => { if (c.alive) SND.wrong(c.midi, at(startX + c.col * CW), spc * 1.6, 0.3); });
    board.chords.forEach((ch) => SND.chord(ch.chord, at(startX + ch.cell * CW), 2 * C.STEPS * spc, 0.16));
    return { t: -lead, speed, startX, wrong: 0 };
  }

  function startPlay(perfect) {
    G.mode = 'play';
    G.aim = null;
    SND.ambientDuck(true);
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
    SND.ambientDuck(false);
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
    SND.ambientChords(G.st.chords.slice(0, 4).map((c) => c.chord));
    SND.ambientDuck(true);
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
    SND.ambientDuck(false);
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
    SND.ambientDuck(false);
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
    // Paddle grows smoothly after a ↔ pickup.
    G.pad.w += (G.padW - G.pad.w) * Math.min(1, dt * 8);
    G.pad.flash = Math.max(0, G.pad.flash - dt * 4);
    movePaddle(G.pad.x);
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

  function fitText(text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
  }

  // One compact bar: title + score on the left, blocks-left pill, launches-left ring;
  // the DOM buttons (close, sound, restart) sit on top of it.
  function drawHud() {
    ctx.fillStyle = '#0f1011';
    ctx.fillRect(0, 0, C.W, C.HUD_H);
    if (!G.st) return;
    const song = G.st.song, full = !!G.st.form;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#9a9b9e';
    ctx.font = '600 15px ' + FONT_U;
    const sub = full ? '전곡 듣기' : (G.st.stageIdx + 1) + ' / ' + song.stages.length;
    ctx.fillText(fitText(song.title + ' · ' + sub, full ? 300 : 158), 68, 27);

    let progress;
    if (full) {
      const len = G.st.cols * CW;
      progress = G.play ? clamp((G.play.startX - G.x) / (G.play.startX - PH + len), 0, 1) : 0;
    } else {
      ctx.font = '30px ' + FONT_D;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#000';
      ctx.strokeText(G.score.toLocaleString(), 68, 59);
      ctx.fillStyle = YELLOW;
      ctx.fillText(G.score.toLocaleString(), 68, 59);

      // Pill: interference blocks left, with the stars that count would earn.
      const left = aliveCount(), stars = core.starsFor(left), bad = stars === 0;
      roundRect(232, 22, 124, 30, 15);
      ctx.fillStyle = bad ? 'rgba(239,91,75,0.18)' : 'rgba(76,201,110,0.16)';
      ctx.fill();
      for (let i = 0; i < 3; i++) drawStar(250 + i * 15, 37, 6.5, i < stars ? YELLOW : 'rgba(255,255,255,0.22)');
      ctx.font = '700 15px ' + FONT_U;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = bad ? '#ff9a8a' : '#8fe3a2';
      ctx.fillText('방해 ' + left, 292, 38);

      // Ring: launches left.
      const turnsLeft = C.TURNS - G.turn, warn = turnsLeft <= 5;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(396, 37, 21, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = warn ? RED : YELLOW;
      ctx.beginPath();
      ctx.arc(396, 37, 21, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * turnsLeft) / C.TURNS);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = '22px ' + FONT_D;
      ctx.fillStyle = warn ? '#ff9a8a' : '#fff';
      ctx.fillText(String(turnsLeft), 396, 39);
      ctx.textBaseline = 'alphabetic';

      const total = G.st.noise.length;
      progress = total ? 1 - left / total : 1;
    }
    // Progress line: blocks cleared (stage) or song played (full song).
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, C.HUD_H - 3, C.W, 3);
    ctx.fillStyle = '#4cc96e';
    ctx.fillRect(0, C.HUD_H - 3, C.W * progress, 3);
  }

  // Grid line weight for cell k: 2 = bar, 1 = beat, 0 = half beat.
  function gridKind(k) {
    const m = (n) => ((k % n) + n) % n;
    return m(4 * C.STEPS) === 0 ? 2 : m(C.STEPS) === 0 ? 1 : 0;
  }

  function drawStrip() {
    const top = C.HUD_H;
    ctx.fillStyle = '#18191b';
    ctx.fillRect(0, top, C.W, C.STRIP_H);
    ctx.fillStyle = '#0d0d0e';
    ctx.fillRect(0, top, C.KEY_W, C.STRIP_H);
    // Bar numbers count from the start of the song (each stage is two bars).
    const barOffset = G.st.form ? 0 : Math.max(0, G.st.song.form.indexOf(G.st.stageIdx)) * 2;
    ctx.font = '700 11px ' + FONT_U;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let k = Math.ceil((C.ROLL_LEFT - G.x) / CW);
    for (let x = G.x + k * CW; x < C.W; x += CW, k++) {
      const g = gridKind(k);
      if (g === 0) continue;
      ctx.fillStyle = g === 2 ? '#4a4c51' : '#2c2e32';
      const h = g === 2 ? C.STRIP_H - 4 : 5;
      ctx.fillRect(Math.round(x) - 0.5, top + C.STRIP_H - h, 1, h);
      if (g === 2 && k >= 0) {
        ctx.fillStyle = '#76787d';
        ctx.fillText(String(barOffset + k / (4 * C.STEPS) + 1), Math.round(x) + 4, top + 15);
      }
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
    const colors = ['#17181a', '#1f2023', '#2e3034'];
    for (let x = G.x + k * CW; x < C.W; x += CW, k++) {
      ctx.fillStyle = colors[gridKind(k)];
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
    if (hp > 0) {
      const label = String(hp);
      ctx.font = '800 ' + Math.min(label.length > 1 ? 13 : 15, h * 0.6) + 'px ' + FONT_U;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.strokeText(label, x + w / 2, y + h / 2 + 1);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    }
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + flash * 0.7 + ')';
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  // Item icons: ⊕ ball, ⚡ speed, ↔ paddle. s = icon size.
  function drawItemIcon(type, cx, cy, s, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (type === 'ball') {
      ctx.beginPath();
      ctx.arc(cx - s * 0.12, cy + s * 0.12, s * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, s * 0.12);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.3, cy - s * 0.42);
      ctx.lineTo(cx + s * 0.3, cy - s * 0.06);
      ctx.moveTo(cx + s * 0.12, cy - s * 0.24);
      ctx.lineTo(cx + s * 0.48, cy - s * 0.24);
      ctx.stroke();
    } else if (type === 'speed') {
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.1, cy - s * 0.5);
      ctx.lineTo(cx - s * 0.32, cy + s * 0.06);
      ctx.lineTo(cx - s * 0.02, cy + s * 0.06);
      ctx.lineTo(cx - s * 0.12, cy + s * 0.5);
      ctx.lineTo(cx + s * 0.32, cy - s * 0.08);
      ctx.lineTo(cx + s * 0.02, cy - s * 0.08);
      ctx.closePath();
      ctx.fill();
    } else {
      const a = s * 0.46, hd = s * 0.2;
      ctx.lineWidth = Math.max(1.5, s * 0.13);
      ctx.beginPath();
      ctx.moveTo(cx - a, cy);
      ctx.lineTo(cx + a, cy);
      ctx.moveTo(cx - a + hd, cy - hd);
      ctx.lineTo(cx - a, cy);
      ctx.lineTo(cx - a + hd, cy + hd);
      ctx.moveTo(cx + a - hd, cy - hd);
      ctx.lineTo(cx + a, cy);
      ctx.lineTo(cx + a - hd, cy + hd);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Special blocks: dark tile, glowing border in the item colour, icon instead of a number.
  function drawItemTile(x, y, w, h, item, flash, alpha) {
    const color = core.ITEM_COLORS[item];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6 + 4 * Math.sin(G.time * 5);
    ctx.fillStyle = '#202126';
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    drawItemIcon(item, x + w / 2, y + h / 2, Math.min(w, h) * 0.78, color);
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
      const y = C.ROLL_TOP + c.row * h + 1, a = alpha * (c.passed ? 0.5 : 1);
      if (c.item && !board.form) drawItemTile(x, y, CW - 2, h - 2, c.item, c.flash, a);
      else drawTile(x, y, CW - 2, h - 2, c.color, board.form ? 0 : c.hp, c.flash, a);
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
    if (G.mode !== 'shoot') return;
    // Turn timer: shrinks over TURN_LIMIT seconds.
    const left = Math.max(0, 1 - G.turnT / C.TURN_LIMIT);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(0, C.ROLL_BOTTOM, C.W, 5);
    ctx.fillStyle = left < 0.25 ? RED : 'rgba(255,255,255,0.75)';
    ctx.fillRect(0, C.ROLL_BOTTOM, C.W * left, 5);
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

  // 발판: a white piano key lying on its side.
  function drawPaddle() {
    const p = G.pad, x = p.x - p.w / 2, y = C.PADDLE_Y;
    ctx.save();
    ctx.shadowColor = p.flash > 0 ? 'rgba(255,214,90,' + (0.5 + p.flash * 0.5) + ')' : 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = p.flash > 0 ? 18 : 10;
    ctx.shadowOffsetY = p.flash > 0 ? 0 : 4;
    const g = ctx.createLinearGradient(0, y, 0, y + C.PADDLE_H);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#d3d2cc');
    roundRect(x, y, p.w, C.PADDLE_H, 5);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    // A black key on the paddle's centre marks where balls launch from.
    roundRect(p.x - 7, y + 2, 14, C.PADDLE_H - 6, 2);
    ctx.fillStyle = '#1b1c1f';
    ctx.fill();
  }

  function drawFallingItems() {
    for (const it of G.items) {
      const color = core.ITEM_COLORS[it.type];
      const wob = Math.sin(it.t * 6) * 0.12;
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(wob);
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      roundRect(-20, -10, 40, 20, 10);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
      drawItemIcon(it.type, 0, 0, 22, '#1a1a1a');
      ctx.restore();
    }
  }

  function drawLauncher() {
    if (!G.st || G.st.form || G.mode === 'play' || G.mode === 'title' || G.mode === 'menu') return;
    drawPaddle();
    const showRest = G.mode === 'intro' || G.mode === 'aim' || (G.mode === 'shoot' && G.toLaunch > 0);
    if (showRest) {
      drawBall(G.pad.x, C.LAUNCH_Y);
      const n = G.mode === 'shoot' ? G.toLaunch : G.perLaunch;
      if (n > 1) {
        const right = G.pad.x > C.W - 60;
        ctx.font = '700 15px ' + FONT_U;
        ctx.textAlign = right ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText('×' + n, G.pad.x + (right ? -14 : 14), C.LAUNCH_Y - 14);
      }
    }
    for (const b of G.balls) drawBall(b.x, b.y);
    drawFallingItems();
    if (G.mode === 'shoot' && G.speedMult > 1) {
      ctx.font = '800 16px ' + FONT_U;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = core.ITEM_COLORS.speed;
      ctx.fillText('속도 ×' + G.speedMult.toFixed(1), C.W - 14, C.ROLL_BOTTOM + 14);
    }
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


  // First-turn help, shown on the board until the player starts aiming.
  function drawHint() {
    if (G.mode !== 'aim' || G.turn > 0 || (G.aim && G.aim.valid)) return;
    const x = C.ROLL_LEFT + 10, w = C.W - x - 10, h = 200, y = C.ROLL_BOTTOM - h - 24, cx = x + w / 2;
    roundRect(x, y, w, h, 16);
    ctx.fillStyle = 'rgba(8,9,10,0.82)';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(G.time * 4);
    ctx.font = '700 19px ' + FONT_U;
    ctx.fillStyle = '#fff';
    ctx.fillText(fitText('보드를 눌러 조준하고, 손을 떼면 발사!', w - 24), cx, y + 32);
    ctx.globalAlpha = 1;
    ctx.font = '600 15px ' + FONT_U;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(fitText('공이 날아가는 동안 화면을 좌우로 밀어 발판으로 받으세요', w - 24), cx, y + 64);
    ctx.fillText(fitText('흰·검은 블럭 = 원곡 멜로디, 깨지지 않아요', w - 24), cx, y + 90);
    ctx.fillText(fitText('컬러 블럭 = 방해 음, 적힌 숫자만큼 맞히면 깨져요', w - 24), cx, y + 116);
    const items = [['ball', '공 추가'], ['speed', '속도 UP'], ['paddle', '발판 UP (받아야 획득)']];
    ctx.font = '700 14px ' + FONT_U;
    ctx.textAlign = 'left';
    const widths = items.map(([, label]) => ctx.measureText(label).width + 22);
    let ix = cx - (widths.reduce((a, b) => a + b, 0) + 24 * (items.length - 1)) / 2;
    items.forEach(([type, label], i) => {
      drawItemIcon(type, ix + 8, y + 158, 18, core.ITEM_COLORS[type]);
      ctx.fillStyle = core.ITEM_COLORS[type];
      ctx.fillText(label, ix + 22, y + 158);
      ix += widths[i] + 24;
    });
  }

  function drawPlayPanel() {
    const P = G.play;
    if (!P) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const full = !!G.st.form;
    ctx.font = '32px ' + FONT_D;
    ctx.fillStyle = '#fff';
    const base = C.ROLL_BOTTOM;
    ctx.fillText(full ? '♪ 전곡 듣기' : '♪ 재생 중', C.W / 2, base + 46);
    ctx.font = '600 16px ' + FONT_U;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText(fitText([G.st.song.title, G.st.song.en].filter(Boolean).join(' — '), C.W - 60), C.W / 2, base + 80);
    const len = full ? G.st.cols * CW : C.PHRASE_W;
    const prog = clamp((P.startX - G.x) / (P.startX - PH + len), 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(70, base + 106, C.W - 140, 8, 4);
    ctx.fill();
    ctx.fillStyle = YELLOW;
    roundRect(70, base + 106, Math.max(8, (C.W - 140) * prog), 8, 4);
    ctx.fill();
    ctx.font = '700 18px ' + FONT_U;
    if (P.wrong > 0) {
      ctx.fillStyle = '#ff8a7a';
      ctx.fillText('틀린 음 ' + P.wrong + '개', C.W / 2, base + 144);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(G.st.noise.some((c) => c.alive) ? '방해 블럭이 재생 라인으로 다가와요…' : '원곡 그대로 연주 중', C.W / 2, base + 144);
    }
  }

  function drawBanner() {
    const b = G.banner;
    if (!b) return;
    const p = b.t / b.dur;
    const sc = p < 0.15 ? 0.6 + (p / 0.15) * 0.45 : p < 0.25 ? 1.05 - ((p - 0.15) / 0.1) * 0.05 : 1;
    ctx.save();
    ctx.globalAlpha = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
    ctx.translate(C.ROLL_LEFT + C.ROLL_W / 2, C.ROLL_TOP + C.ROLL_H * 0.45);
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
    // Separate x/y factors so the logical C.W × C.H area covers the whole bitmap
    // (rounding the canvas size would otherwise leave stale rows at the bottom).
    ctx.setTransform(canvas.width / C.W, 0, 0, canvas.height / C.H, 0, 0);
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
      else if (!G.st.form && G.mode !== 'title' && G.mode !== 'menu') drawHint();
      drawAim();
      drawLauncher();
      drawParticles();
    }
    drawBanner();
    ctx.restore();
  }

  // ---------- DOM screens ----------

  function showScreen(name) {
    ['title', 'menu', 'result', 'create'].forEach((n) => $('screen-' + n).classList.toggle('hidden', n !== name));
    $('hud').classList.toggle('hidden', name === 'title' || name === 'menu' || name === 'create');
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
  const SOURCE_LABEL = { ai: '제목으로 만듦', midi: 'MIDI로 만듦', audio: '음악 분석으로 만듦' };
  const LEVEL_LABEL = ['쉬움', '보통', '어려움'];

  function renderMenu() {
    const list = $('song-list');
    list.textContent = '';
    let total = 0, max = 0, customHeading = false;
    PB.SONGS.forEach((song, si) => {
      const got = song.stages.reduce((a, _, i) => a + starsOf(si, i), 0);
      total += got;
      max += song.stages.length * 3;

      if (song.custom && !customHeading) {
        list.appendChild(el('h3', 'list-heading', '내가 만든 곡'));
        customHeading = true;
      }
      const card = el('article', 'song-card' + (song.custom ? ' custom' : ''));
      const head = el('div', 'song-head');
      const names = el('div');
      names.appendChild(el('h3', null, song.title));
      const info = song.custom
        ? [song.en, SOURCE_LABEL[song.source] || '직접 만든 곡', LEVEL_LABEL[song.level || 0], song.stages.length + '스테이지']
        : [song.en, song.stages.length + '스테이지'];
      names.appendChild(el('p', null, info.filter(Boolean).join(' · ')));
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
      if (song.custom) {
        // Two taps to delete: no confirm() dialogs inside an artifact.
        const del = el('button', 'btn del-btn', '삭제');
        let armed = null;
        del.addEventListener('click', () => {
          if (armed) {
            clearTimeout(armed);
            removeCustomSong(song.id);
            renderMenu();
            return;
          }
          del.textContent = '한 번 더 누르면 삭제';
          del.classList.add('armed');
          armed = setTimeout(() => {
            armed = null;
            del.textContent = '삭제';
            del.classList.remove('armed');
          }, 3000);
        });
        card.appendChild(del);
      }
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
    // Aim mode: press above the paddle to aim (release fires), press on the paddle row to slide it.
    // Shoot mode: the paddle follows the finger / mouse horizontally.
    canvas.addEventListener('pointerdown', (e) => {
      SND.unlock();
      const p = toLogical(e);
      if (G.mode === 'shoot') {
        G.pointer = e.pointerId;
        movePaddle(p.x);
        return;
      }
      if (G.mode !== 'aim') return;
      e.preventDefault();
      G.pointer = e.pointerId;
      G.keyDir = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      G.padDrag = p.y >= C.PADDLE_Y - 40;
      if (G.padDrag) {
        G.aim = null;
        movePaddle(p.x);
      } else {
        aimAt(p);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = toLogical(e);
      if (G.mode === 'shoot') {
        if (G.pointer === e.pointerId || e.pointerType === 'mouse') movePaddle(p.x);
        return;
      }
      if (G.pointer !== e.pointerId || G.mode !== 'aim') return;
      if (G.padDrag) movePaddle(p.x);
      else aimAt(p);
    });
    canvas.addEventListener('pointerup', (e) => {
      if (G.pointer !== e.pointerId) return;
      G.pointer = null;
      if (G.mode !== 'aim') return;
      if (G.padDrag) {
        G.padDrag = false;
        return;
      }
      aimAt(toLogical(e));
      if (G.aim && G.aim.valid) fire();
      else G.aim = null;
    });
    canvas.addEventListener('pointercancel', () => {
      G.pointer = null;
      G.padDrag = false;
      if (G.mode === 'aim') G.aim = null;
    });

    // Keyboard: ← → aim (aim mode) or move the paddle (shoot mode); Space / Enter fires.
    window.addEventListener('keydown', (e) => {
      SND.unlock();
      if (G.mode !== 'aim' && G.mode !== 'shoot') return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        G.keyDir = e.key === 'ArrowLeft' ? -1 : 1;
        if (G.mode === 'aim' && (!G.aim || !G.aim.valid)) setAimAngle(G.aimAngle);
        e.preventDefault();
      } else if (G.mode === 'aim' && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp')) {
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
    C.setHeight(Math.round(clamp((C.W * vh) / vw, 960, 1200)));
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
    loadCustomSongs();
    SND.setMuted(store.muted);
    syncSoundButton();
    // Title backdrop: the first stage, idle.
    G.st = core.buildStage(0, 0);
    G.x = C.START_X;
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => SND.setSuspended(document.hidden));
    bindInput();
    showScreen('title');
    requestAnimationFrame(loop);
  }

  PB.game = { state: G, startStage, startFull, openMenu, showScreen, addCustomSong, fire, setAimAngle, hit: onHit, store };
  document.addEventListener('DOMContentLoaded', boot);
})(window.PB = window.PB || {});
