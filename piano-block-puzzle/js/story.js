// 스토리 모드: 비주얼 노벨 엔진 (대사, 선택지 분기, 연주 연동, 미니게임)

import { portrait } from './portraits.js';
import { CAST, CHAPTER1, DUET } from './story-data.js';
import { buildSong } from './songs.js';
import { solfege } from './instruments.js';
import { rrect } from './draw.js';
import { VOICES } from './voices.js';
import { voiceKey } from './voice-key.js';

const SAVE_KEY = 'pb.story.v2'; // 설정이 바뀌면 버전을 올려 예전 저장을 쓰지 않는다
const TYPE_MS = 28;
const VOICE_KEY = 'pb.voice'; // 대사 음성 켬/끔

const SFX = {
  elise: [[76, 0], [75, 0.16], [76, 0.32], [75, 0.48], [76, 0.64], [71, 0.8], [74, 0.96], [72, 1.12], [69, 1.28, 0.6]],
  twinkle: [[60, 0], [60, 0.3], [67, 0.6], [67, 0.9], [69, 1.2], [69, 1.5], [67, 1.8, 0.6]],
  chime: [[72, 0], [76, 0.08], [79, 0.16], [84, 0.24, 0.9]],
};

const heartIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.8 6.6 4.8c2.1 0 3.5 1.2 4.4 2.5.9-1.3 2.3-2.5 4.4-2.5 3.6 0 5.7 3.6 4.2 7C19.5 16.4 12 21 12 21z"/></svg>';
const pianoSvg =
  '<svg class="vn-piano" viewBox="0 0 400 200" aria-hidden="true"><path d="M20 120 C20 60 90 30 190 34 C290 38 370 70 380 120 L380 150 L20 150 Z" fill="#0d0b0e"/><rect x="20" y="148" width="360" height="14" fill="#18141a"/><rect x="40" y="162" width="10" height="38" fill="#0d0b0e"/><rect x="350" y="162" width="10" height="38" fill="#0d0b0e"/><path d="M60 120 L300 120" stroke="#2a2430" stroke-width="3"/></svg>';

const store = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    } catch {
      return null;
    }
  },
  save(v) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(v));
    } catch {}
  },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Story {
  // hooks: { audio, songs, play(song, purpose) => Promise<stats>, exit() }
  constructor(root, hooks) {
    this.root = root;
    this.hooks = hooks;
    this.chapter = CHAPTER1;
    this.build();
  }

  build() {
    const r = this.root;
    r.innerHTML = `
      <div class="vn-bg" data-bg="station"><div class="vn-bg-art"></div></div>
      <div class="vn-chars">
        <div class="vn-char" data-pos="left"></div>
        <div class="vn-char" data-pos="center"></div>
        <div class="vn-char" data-pos="right"></div>
      </div>
      <div class="vn-top">
        <span class="vn-chapter"></span>
        <span class="vn-stat vn-aff" title="호감도">${heartIcon}<b>0</b></span>
        <span class="vn-stat vn-skill" title="실력"><i></i><b>실력 0</b></span>
        <button type="button" class="vn-btn vn-voice" aria-pressed="true">음성</button>
        <button type="button" class="vn-btn vn-skip">빨리</button>
        <button type="button" class="vn-btn vn-exit">나가기</button>
      </div>
      <div class="vn-box">
        <div class="vn-name"></div>
        <p class="vn-text"></p>
        <span class="vn-next" aria-hidden="true"></span>
      </div>
      <div class="vn-choices" hidden></div>
      <div class="vn-panel" hidden></div>
      <div class="vn-mini" hidden></div>
      <div class="vn-flash"></div>
      <div class="vn-toasts"></div>`;
    const q = (s) => r.querySelector(s);
    this.el = {
      bg: q('.vn-bg'),
      art: q('.vn-bg-art'),
      chars: { left: q('[data-pos="left"]'), center: q('[data-pos="center"]'), right: q('[data-pos="right"]') },
      chapter: q('.vn-chapter'),
      aff: q('.vn-aff b'),
      skillBar: q('.vn-skill i'),
      skill: q('.vn-skill b'),
      skip: q('.vn-skip'),
      voice: q('.vn-voice'),
      exit: q('.vn-exit'),
      box: q('.vn-box'),
      name: q('.vn-name'),
      text: q('.vn-text'),
      choices: q('.vn-choices'),
      panel: q('.vn-panel'),
      mini: q('.vn-mini'),
      flash: q('.vn-flash'),
      toasts: q('.vn-toasts'),
    };
    r.addEventListener('click', (e) => {
      if (e.target.closest('button, .vn-choices, .vn-panel, .vn-mini')) return;
      this.tap?.();
    });
    this.el.skip.addEventListener('click', () => {
      this.skipping = !this.skipping;
      this.el.skip.classList.toggle('on', this.skipping);
      if (this.skipping) this.tap?.();
    });
    this.el.exit.addEventListener('click', () => this.exit());
    try {
      this.voiceOn = localStorage.getItem(VOICE_KEY) !== 'off';
    } catch {
      this.voiceOn = true;
    }
    const showVoice = () => {
      this.el.voice.setAttribute('aria-pressed', String(this.voiceOn));
      this.el.voice.textContent = this.voiceOn ? '음성 켬' : '음성 끔';
    };
    showVoice();
    this.el.voice.addEventListener('click', () => {
      this.voiceOn = !this.voiceOn;
      showVoice();
      try {
        localStorage.setItem(VOICE_KEY, this.voiceOn ? 'on' : 'off');
      } catch {}
      if (!this.voiceOn) this.stopVoice();
    });
  }

  // 대사 음성 (일레븐랩스로 미리 만든 mp3). 속마음(괄호) 대사는 작게.
  playVoice(who, text) {
    this.stopVoice();
    if (!this.voiceOn || this.skipping) return;
    const data = VOICES[voiceKey(who, text)];
    if (!data) return;
    const a = new Audio(`data:audio/mpeg;base64,${data}`);
    a.volume = /^\(.*\)$/s.test(text.trim()) ? 0.55 : 1;
    a.play().catch(() => {});
    this.voice = a;
  }

  stopVoice() {
    if (this.voice) {
      this.voice.pause();
      this.voice = null;
    }
  }

  hasSave() {
    const s = store.load();
    return !!(s && s.scene);
  }

  cleared() {
    return !!store.load()?.cleared;
  }

  start(fresh) {
    const saved = fresh ? null : store.load();
    this.st = saved && saved.scene ? saved : { scene: this.chapter.start, aff: 0, skill: 0, flags: {}, cleared: store.load()?.cleared || false };
    this.st.flags ||= {};
    this.cast = {};
    for (const c of Object.values(this.el.chars)) c.innerHTML = '';
    this.el.chapter.textContent = this.chapter.title;
    this.root.hidden = false;
    this.root.scrollLeft = 0;
    this.run = (this.run || 0) + 1;
    this.skipping = false;
    this.el.skip.classList.remove('on');
    this.renderStats();
    this.goto(this.st.scene);
  }

  exit() {
    this.run++;
    this.tap = null;
    this.stopVoice();
    this.root.hidden = true;
    this.hooks.exit();
  }

  save() {
    store.save(this.st);
  }

  goto(id) {
    if (!this.chapter.scenes[id]) id = this.chapter.start;
    this.st.scene = id;
    this.save();
    this.queue = [...this.chapter.scenes[id]];
    this.loop(this.run);
  }

  async loop(run) {
    while (run === this.run && this.queue.length) {
      const step = this.queue.shift();
      const jumped = await this.exec(step, run);
      if (jumped) return;
    }
  }

  // 한 단계 실행. 장면을 옮기면 true
  async exec(s, run) {
    if (s.bg) await this.setBg(s.bg);
    if (s.show) this.show(...s.show);
    if (s.hide) this.hide(s.hide);
    if (s.n) await this.say(null, s.n, run);
    if (s.s) {
      const [who, text, expr] = s.s;
      if (expr) this.show(who, expr);
      await this.say(who, text, run);
    }
    if (s.fx) this.fx(s.fx);
    if (s.sfx) this.sfx(s.sfx);
    if (s.add) this.apply(s.add);
    if (s.if) this.queue.unshift(...((s.if(this.st) ? s.then : s.else) || []));
    if (s.choice) {
      const opt = await this.choose(s.choice, run);
      if (run !== this.run) return true;
      this.apply(opt);
      if (opt.then) this.queue.unshift(...opt.then);
      if (opt.go) {
        this.goto(opt.go);
        return true;
      }
    }
    if (s.play || s.contest || s.minigame || s.pick) this.stopVoice();
    if (s.play) {
      const song = this.hooks.songs.find((x) => x.id === s.play);
      const stats = await this.play(song, 'practice', run);
      if (run !== this.run) return true;
      this.st.last = { accuracy: stats.accuracy, stars: stats.stars, score: stats.score };
    }
    if (s.pick) {
      const song = await this.pickSong(run);
      if (run !== this.run) return true;
      this.st.picked = song.id;
      this.st.pickedLevel = song.level;
      this.save();
    }
    if (s.contest) {
      const song = this.hooks.songs.find((x) => x.id === this.st.picked) || this.hooks.songs[0];
      const stats = await this.play(song, 'contest', run);
      if (run !== this.run) return true;
      const total = await this.scoreCard(song, stats, s.contest.rival, run);
      if (run !== this.run) return true;
      this.goto(total > s.contest.rival ? s.contest.win : s.contest.lose);
      return true;
    }
    if (s.minigame) {
      const result = s.minigame === 'duet' ? await this.duet(run) : await this.sneak(run);
      if (run !== this.run) return true;
      this.queue.unshift(...(s[result] || []));
    }
    if (s.go) {
      this.goto(s.go);
      return true;
    }
    if (s.end) {
      await this.chapterEnd(run);
      return true;
    }
    return false;
  }

  apply(o) {
    const st = this.st;
    if (o.aff) {
      st.aff = Math.max(0, st.aff + o.aff);
      this.toast(`호감도 ${o.aff > 0 ? '+' : ''}${o.aff}`, 'aff');
    }
    if (o.skill) {
      st.skill = Math.min(10, st.skill + o.skill);
      this.toast(`실력 +${o.skill}`, 'skill');
    }
    if (o.flag) st.flags[o.flag] = true;
    this.renderStats();
  }

  renderStats() {
    this.el.aff.textContent = this.st.aff;
    this.el.skill.textContent = `실력 ${this.st.skill}`;
    this.el.skillBar.style.width = `${this.st.skill * 10}%`;
  }

  toast(text, kind) {
    const t = document.createElement('div');
    t.className = `vn-toast ${kind}`;
    t.textContent = text;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 1600);
  }

  // ---------- 무대 연출 ----------

  async setBg(name) {
    if (this.el.bg.dataset.bg === name && this.el.art.childElementCount) return;
    this.el.bg.classList.add('fade');
    await wait(this.skipping ? 60 : 260);
    this.el.bg.dataset.bg = name;
    this.el.art.innerHTML = ['academy', 'night', 'hall', 'station', 'party'].includes(name) ? pianoSvg : '';
    this.el.bg.classList.remove('fade');
    await wait(this.skipping ? 40 : 200);
  }

  show(id, expr = 'normal', pos) {
    const cur = this.cast[id];
    pos ||= cur?.pos || 'center';
    if (cur && cur.pos !== pos) this.el.chars[cur.pos].innerHTML = '';
    // 같은 자리에 다른 인물이 있으면 내보낸다
    for (const [other, info] of Object.entries(this.cast)) if (other !== id && info.pos === pos) delete this.cast[other];
    const slot = this.el.chars[pos];
    const fresh = !cur || cur.pos !== pos;
    slot.innerHTML = portrait(id, expr);
    slot.dataset.who = id;
    if (fresh) {
      slot.classList.remove('enter');
      void slot.offsetWidth;
      slot.classList.add('enter');
    }
    this.cast[id] = { pos, expr };
  }

  hide(id) {
    const cur = this.cast[id];
    if (!cur) return;
    this.el.chars[cur.pos].innerHTML = '';
    delete this.cast[id];
  }

  focus(who) {
    for (const [pos, slot] of Object.entries(this.el.chars)) {
      const id = slot.dataset.who;
      const active = this.cast[id]?.pos === pos;
      slot.classList.toggle('dim', active && who !== null && who !== id && !!CAST[who]);
    }
  }

  fx(kind) {
    if (kind === 'flash') {
      this.el.flash.classList.remove('on');
      void this.el.flash.offsetWidth;
      this.el.flash.classList.add('on');
      this.hooks.audio.sparkle();
    } else if (kind === 'shake') {
      this.root.classList.remove('shake');
      void this.root.offsetWidth;
      this.root.classList.add('shake');
      this.hooks.audio.thud();
    } else if (kind === 'heart') {
      for (let i = 0; i < 9; i++) {
        const h = document.createElement('span');
        h.className = 'vn-heart';
        h.innerHTML = heartIcon;
        h.style.left = `${20 + Math.random() * 60}%`;
        h.style.animationDelay = `${Math.random() * 0.5}s`;
        h.style.setProperty('--s', (0.7 + Math.random() * 0.8).toFixed(2));
        this.el.toasts.appendChild(h);
        setTimeout(() => h.remove(), 2200);
      }
      this.hooks.audio.sparkle();
    }
  }

  sfx(name) {
    const a = this.hooks.audio;
    a.ensure();
    const t = a.now + 0.05;
    for (const [m, at, dur = 0.3] of SFX[name] || []) a.note(m, t + at, dur, 0.7);
  }

  // ---------- 대사 ----------

  say(who, text, run) {
    const cast = who ? CAST[who] : null;
    this.el.box.classList.toggle('narration', !cast);
    this.el.name.hidden = !cast;
    if (cast) {
      this.el.name.textContent = cast.name;
      this.el.name.style.setProperty('--c', cast.color);
    }
    this.focus(who);
    const box = this.el.text;
    box.textContent = '';
    this.el.box.classList.remove('done');
    if (cast) this.playVoice(who, text);
    else this.stopVoice();
    return new Promise((resolve) => {
      let i = 0;
      let timer = null;
      const finish = () => {
        clearInterval(timer);
        box.textContent = text;
        this.el.box.classList.add('done');
      };
      const done = () => {
        this.tap = null;
        resolve();
      };
      if (this.skipping) {
        finish();
        setTimeout(() => run === this.run && done(), 90);
        return;
      }
      timer = setInterval(() => {
        i++;
        box.textContent = text.slice(0, i);
        if (i >= text.length) finish();
      }, TYPE_MS);
      this.tap = () => {
        if (!this.el.box.classList.contains('done')) finish();
        else done();
      };
    });
  }

  choose(options, run) {
    this.skipping = false;
    this.el.skip.classList.remove('on');
    const box = this.el.choices;
    box.innerHTML = '';
    return new Promise((resolve) => {
      options.forEach((o) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'vn-choice';
        b.textContent = o.t;
        b.addEventListener('click', () => {
          box.hidden = true;
          this.hooks.audio.tick(this.hooks.audio.now, true);
          if (run === this.run) resolve(o);
        });
        box.appendChild(b);
      });
      box.hidden = false;
    });
  }

  // ---------- 연주 연동 ----------

  async play(song, purpose, run) {
    const stats = await this.hooks.play(song, purpose);
    if (run === this.run) {
      this.root.hidden = false;
      this.renderStats();
    }
    return stats;
  }

  pickSong(run) {
    this.skipping = false;
    const p = this.el.panel;
    const songs = this.hooks.songs;
    p.innerHTML = `
      <div class="vn-card">
        <h3>결선 곡 고르기</h3>
        <p class="vn-sub">어려운 곡일수록 심사 가산점이 커요</p>
        <ul class="vn-songs">${songs
          .map(
            (s) => `<li><button type="button" data-id="${s.id}">
              <span class="t">${s.title}</span>
              <span class="lv">${'<i class="on"></i>'.repeat(s.level)}${'<i></i>'.repeat(3 - s.level)}</span>
              <span class="b">가산점 +${s.level * 6}</span></button></li>`,
          )
          .join('')}</ul>
      </div>`;
    p.hidden = false;
    return new Promise((resolve) => {
      p.querySelectorAll('[data-id]').forEach((b) =>
        b.addEventListener('click', () => {
          p.hidden = true;
          this.hooks.audio.tick(this.hooks.audio.now, true);
          if (run === this.run) resolve(songs.find((s) => s.id === b.dataset.id));
        }),
      );
    });
  }

  // 심사: 연주 정확도 + 곡 난이도 + 완성도(별) + 연습량(실력) + 선생님 응원(호감도)
  async scoreCard(song, stats, rival, run) {
    const st = this.st;
    const rows = [
      ['연주 정확도', Math.round(stats.accuracy * 600) / 10],
      ['곡 난이도', song.level * 6],
      ['완성도', stats.stars * 3],
      ['연습량', Math.min(10, st.skill)],
      ['선생님의 응원', Math.min(4, Math.floor(st.aff / 2))],
    ];
    const total = Math.round(rows.reduce((a, [, v]) => a + v, 0) * 10) / 10;
    const p = this.el.panel;
    p.innerHTML = `
      <div class="vn-card score">
        <h3>심사 결과</h3>
        <div class="vn-rival"><span>윤채아</span><b>${rival.toFixed(1)}</b></div>
        <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>+${v.toFixed(1)}</dd></div>`).join('')}</dl>
        <div class="vn-total"><span>이도현</span><b class="n">0.0</b></div>
        <button type="button" class="vn-go" hidden>결과 발표</button>
      </div>`;
    p.hidden = false;
    const n = p.querySelector('.n');
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / 1400);
        n.textContent = (total * (1 - Math.pow(1 - k, 3))).toFixed(1);
        if (k < 1 && run === this.run) requestAnimationFrame(tick);
        else res();
      };
      requestAnimationFrame(tick);
    });
    n.classList.add(total > rival ? 'win' : 'lose');
    const go = p.querySelector('.vn-go');
    go.hidden = false;
    await new Promise((res) => go.addEventListener('click', res, { once: true }));
    p.hidden = true;
    return total;
  }

  async chapterEnd(run) {
    this.st.cleared = true;
    const p = this.el.panel;
    p.innerHTML = `
      <div class="vn-card">
        <h3>${this.chapter.title} 완료</h3>
        <p class="vn-sub">호감도 ${this.st.aff} · 실력 ${this.st.skill}</p>
        <p class="vn-sub">2장 「전국 대회」는 준비 중이에요.</p>
        <button type="button" class="vn-go">메뉴로</button>
      </div>`;
    p.hidden = false;
    this.st.scene = null;
    this.save();
    await new Promise((res) => p.querySelector('.vn-go').addEventListener('click', res, { once: true }));
    p.hidden = true;
    if (run === this.run) this.exit();
  }

  // ---------- 미니게임: 들키지 마! ----------
  // 버튼을 누르고 있으면 마음 게이지가 찬다. 교수가 돌아보는 동안 누르고 있으면 들킨다(3번이면 실패).
  sneak(run) {
    this.skipping = false;
    this.el.skip.classList.remove('on');
    const m = this.el.mini;
    m.classList.remove('duet');
    m.innerHTML = `
      <div class="mini-top">
        <h3>들키지 마!</h3>
        <div class="mini-strikes"><b></b><b></b><b></b></div>
      </div>
      <div class="mini-bars">
        <div class="mini-bar love"><span>마음</span><i></i></div>
        <div class="mini-bar time"><span>시간</span><i></i></div>
      </div>
      <div class="mini-scene">
        <div class="mini-door"><div class="mini-prof"></div><div class="mini-state"></div></div>
        <div class="mini-her"></div>
        <div class="mini-fx"></div>
        <div class="mini-msg"></div>
      </div>
      <p class="mini-hint">교수님이 <b>!</b> 하고 돌아보려 하면 손을 떼고 안 보는 척!</p>
      <button type="button" class="mini-hold"><b class="main">안 보는 척</b><small class="sub">꾹 누르면 선생님 쳐다보기</small></button>`;
    m.hidden = false;
    const q = (s) => m.querySelector(s);
    const ui = {
      prof: q('.mini-prof'),
      state: q('.mini-state'),
      door: q('.mini-door'),
      her: q('.mini-her'),
      fx: q('.mini-fx'),
      msg: q('.mini-msg'),
      love: q('.love i'),
      time: q('.time i'),
      strikes: [...m.querySelectorAll('.mini-strikes b')],
      hold: q('.mini-hold'),
      holdMain: q('.mini-hold .main'),
      holdSub: q('.mini-hold .sub'),
    };
    const audio = this.hooks.audio;
    const LIMIT = 26;
    let holding = false;
    let love = 0;
    let elapsed = 0;
    let strikes = 0;
    let phase = 'back';
    let phaseLeft = 1.8;
    let struck = false;
    let lastHer = '';
    let lastProf = '';
    let heartAcc = 0;
    let stepAcc = 0;

    const setHer = (e) => {
      if (e !== lastHer) ui.her.innerHTML = portrait('seoyun', (lastHer = e));
    };
    const setProf = (e) => {
      if (e !== lastProf) ui.prof.innerHTML = portrait('prof', (lastProf = e));
    };
    const setPhase = (p) => {
      phase = p;
      struck = false;
      ui.door.dataset.phase = p;
      if (p === 'back') {
        phaseLeft = 1.4 + Math.random() * 2;
        ui.state.textContent = '통화 중';
        setProf('back');
      } else if (p === 'warn') {
        phaseLeft = 0.75;
        ui.state.textContent = '!';
        stepAcc = 0;
      } else {
        phaseLeft = 1.2 + Math.random() * 1;
        ui.state.textContent = '보는 중';
        setProf('normal');
      }
    };
    setHer('normal');
    setPhase('back');

    const press = (on) => (e) => {
      e?.preventDefault?.();
      holding = on;
      ui.hold.classList.toggle('on', on);
      // 누르는 동안 = 선생님 쳐다보기, 떼면 = 안 보는 척
      ui.holdMain.textContent = on ? '선생님 쳐다보기' : '안 보는 척';
      ui.holdSub.textContent = on ? '떼면 안 보는 척' : '꾹 누르면 선생님 쳐다보기';
    };
    ui.hold.addEventListener('pointerdown', press(true));
    ui.hold.addEventListener('pointerup', press(false));
    ui.hold.addEventListener('pointerleave', press(false));
    ui.hold.addEventListener('pointercancel', press(false));
    const key = (on) => (e) => {
      if (e.code === 'Space') press(on)(e);
    };
    const kd = key(true);
    const ku = key(false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    return new Promise((resolve) => {
      let last = performance.now();
      let result = null;
      const finish = (r, text) => {
        result = r;
        holding = false;
        ui.hold.disabled = true;
        ui.msg.textContent = text;
        ui.msg.className = `mini-msg show ${r}`;
        if (r === 'success') audio.sparkle();
        else audio.thud();
        window.removeEventListener('keydown', kd);
        window.removeEventListener('keyup', ku);
        setTimeout(() => {
          m.hidden = true;
          if (run === this.run) resolve(r);
        }, 1500);
      };
      const frame = (now) => {
        if (result || run !== this.run) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        elapsed += dt;
        phaseLeft -= dt;
        if (phaseLeft <= 0) setPhase(phase === 'back' ? 'warn' : phase === 'warn' ? 'look' : 'back');
        if (phase === 'warn') {
          stepAcc -= dt;
          if (stepAcc <= 0) {
            stepAcc = 0.25;
            audio.tick(audio.now, false);
          }
        }
        if (holding) {
          love = Math.min(100, love + dt * 10);
          heartAcc += dt;
          if (heartAcc > 0.18) {
            heartAcc = 0;
            const h = document.createElement('span');
            h.className = 'vn-heart small';
            h.innerHTML = heartIcon;
            h.style.left = `${35 + Math.random() * 30}%`;
            ui.fx.appendChild(h);
            setTimeout(() => h.remove(), 1400);
          }
          if (phase === 'look' && !struck) {
            struck = true;
            strikes++;
            ui.strikes.forEach((b, i) => b.classList.toggle('on', i < strikes));
            setProf('serious');
            m.classList.remove('hit');
            void m.offsetWidth;
            m.classList.add('hit');
            audio.thud();
            setHer('surprise');
            if (strikes >= 3) return finish('caught', '들켰다…!');
          } else if (phase !== 'look' || struck) {
            if (lastHer !== 'surprise' || phase !== 'look') setHer('blush');
          }
        } else {
          setHer(phase === 'look' ? 'serious' : 'normal');
        }
        ui.love.style.width = `${love}%`;
        ui.time.style.width = `${Math.max(0, 1 - elapsed / LIMIT) * 100}%`;
        if (love >= 100) return finish('success', '마음이 전해졌다');
        if (elapsed >= LIMIT) return finish('timeout', '시간 초과');
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }
  // ---------- 미니게임: 비밀 연탄곡 ----------
  // 왼쪽 레인 = 멜로디 건반(맞추면 그 음이 울리고, 놓치면 소리가 빈다). 오른쪽 레인 = ♥ 신호.
  // 태준이 안 볼 때 ♥를 받으면 마음 게이지가 차고, 보는 중에 받으면 들킨다(3번이면 실패).
  // 건반을 놓치면 소리가 비어 태준이 곧 돌아본다. 결과: success | caught | shy, st.duet = { result, accuracy }
  duet(run) {
    this.skipping = false;
    this.el.skip.classList.remove('on');
    const m = this.el.mini;
    m.classList.add('duet');
    m.innerHTML = `
      <div class="mini-top">
        <h3>비밀 연탄곡</h3>
        <div class="mini-strikes" aria-label="들킨 횟수"><b></b><b></b><b></b></div>
      </div>
      <div class="mini-bars">
        <div class="mini-bar love"><span>마음</span><i></i></div>
        <div class="mini-bar time"><span>${DUET.title}</span><i></i></div>
      </div>
      <div class="duet-scene">
        <div class="duet-her"></div>
        <div class="mini-door table"><div class="mini-watch"></div><div class="mini-state"></div></div>
        <div class="mini-fx"></div>
      </div>
      <div class="duet-lanes"><canvas></canvas><div class="mini-msg"></div></div>
      <p class="mini-hint">태준이 <b>안 볼 때</b>만 ♥를 받아요. 건반을 놓치면 소리가 비어 시선이 쏠려요</p>
      <div class="duet-pads">
        <button type="button" class="duet-pad key"><b>건반</b><small>멜로디</small></button>
        <button type="button" class="duet-pad love"><b>♥ 신호</b><small>눈 맞추기</small></button>
      </div>`;
    m.hidden = false;
    const q = (sel) => m.querySelector(sel);
    const ui = {
      her: q('.duet-her'),
      door: q('.mini-door'),
      watch: q('.mini-watch'),
      state: q('.mini-state'),
      fx: q('.mini-fx'),
      lanes: q('.duet-lanes'),
      cv: q('canvas'),
      msg: q('.mini-msg'),
      love: q('.love i'),
      time: q('.time i'),
      strikes: [...m.querySelectorAll('.mini-strikes b')],
      pads: [...m.querySelectorAll('.duet-pad')],
    };
    const g = ui.cv.getContext('2d');
    const audio = this.hooks.audio;
    audio.ensure();

    // 악보
    const sec = DUET.stepSec;
    const beat = sec * 2;
    const bar = DUET.stepsPerBar;
    const melody = buildSong({ parts: { piano: [DUET.melody] } }).parts[0].notes;
    const harmony = DUET.harmony.split(' ');
    const totalSteps = harmony.length * bar;
    const CHORD = { C: [36, 52, 55], F: [41, 53, 57], G: [43, 55, 59] }; // [베이스, 화음]
    // 마디마다 멜로디가 쉬는 칸(가운데에 가까운 곳)에 ♥, 첫 마디는 연습
    const hearts = [];
    for (let b = 1; b < harmony.length; b++) {
      const on = new Set(melody.filter((n) => n.start >= b * bar && n.start < (b + 1) * bar).map((n) => n.start - b * bar));
      const free = [...Array(bar).keys()].filter((i) => !on.has(i)).sort((x, y) => Math.abs(x - 3) - Math.abs(y - 3));
      if (free.length) hearts.push(b * bar + free[0]);
      const far = free.find((i) => Math.abs(i - free[0]) >= 3);
      if (free.length >= 3 && far != null) hearts.push(b * bar + far);
    }
    hearts.sort((a, b) => a - b);
    const LOVE = 100 / 8; // ♥ 8개면 가득

    const t0 = audio.now + 0.4 + beat * 3; // 세 박 카운트인
    const songEnd = t0 + totalSteps * sec;
    const lanes = [
      melody.map((n) => ({ t: t0 + n.start * sec, pitch: n.key, len: n.len, state: null })),
      hearts.map((st) => ({ t: t0 + st * sec, state: null })),
    ];
    const acc = [];
    harmony.forEach((name, b) => {
      const [bass, ...chord] = CHORD[name];
      const at = t0 + b * bar * sec;
      acc.push({ t: at, pitch: bass, dur: bar * sec * 0.95, vel: 0.5 });
      for (const k of [2, 4]) for (const p of chord) acc.push({ t: at + k * sec, pitch: p, dur: sec * 1.6, vel: 0.28 });
    });
    for (let i = 0; i < 3; i++) audio.tick(t0 - (3 - i) * beat, i === 0);

    const PERFECT = 0.08;
    const GOOD = 0.16;
    const AHEAD = 1.6; // 몇 초 앞까지 보이나
    let hits = 0;
    let love = 0;
    let strikes = 0;
    let ai = 0;
    let lastNow = audio.now;
    let done = false;
    let alertUntil = 0;
    const judge = [null, null];
    const flashAt = [0, 0];

    // 태준: away(손님과 건배) → warn(!) → look(보는 중)
    let phase = 'away';
    let phaseLeft = t0 - audio.now + beat * 4;
    let tickLeft = 0;
    let lastHer = '';
    let lastWatch = '';
    let herUntil = 0;
    const setHer = (e) => e !== lastHer && (ui.her.innerHTML = portrait('seoyun', (lastHer = e)));
    const setWatch = (e) => e !== lastWatch && (ui.watch.innerHTML = portrait('taejun', (lastWatch = e)));
    const setPhase = (p) => {
      phase = p;
      ui.door.dataset.phase = p;
      if (p === 'away') {
        phaseLeft = beat * (3 + Math.floor(Math.random() * 4));
        ui.state.textContent = '손님과 건배 중';
        setWatch('back');
      } else if (p === 'warn') {
        phaseLeft = beat * 2;
        tickLeft = 0;
        ui.state.textContent = '!';
      } else {
        phaseLeft = beat * (2 + Math.floor(Math.random() * 3));
        ui.state.textContent = '보는 중';
        setWatch('serious');
      }
    };
    setHer('smile');
    setPhase('away');
    phaseLeft = t0 - audio.now + beat * 4;
    // 자동 테스트용으로 진행 상태를 노출한다 (게임 동작에는 쓰지 않음)
    m.duetState = { lanes, phase: () => phase };

    // 캔버스 크기
    let W = 0;
    let H = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => {
      const r = ui.lanes.getBoundingClientRect();
      W = r.width;
      H = r.height;
      ui.cv.width = Math.round(W * dpr);
      ui.cv.height = Math.round(H * dpr);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(ui.lanes);
    fit();

    const heartPath = (x, y, r) => {
      g.beginPath();
      g.moveTo(x, y + r * 0.9);
      g.bezierCurveTo(x - r * 1.6, y - r * 0.1, x - r * 0.8, y - r * 1.25, x, y - r * 0.45);
      g.bezierCurveTo(x + r * 0.8, y - r * 1.25, x + r * 1.6, y - r * 0.1, x, y + r * 0.9);
      g.closePath();
    };

    const draw = (now) => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const lw = W / 2;
      const hitY = H - 34;
      const pps = (hitY - 8) / AHEAD;
      const yOf = (t) => hitY - (t - now) * pps;
      // 레인 바탕: 오른쪽은 태준의 시선에 따라 색이 바뀐다
      g.fillStyle = '#17131b';
      g.fillRect(0, 0, lw, H);
      const blink = Math.floor(now / 0.18) % 2 === 0;
      g.fillStyle = phase === 'look' ? '#4a1518' : phase === 'warn' ? (blink ? '#4a3a12' : '#2a1a22') : '#2a1622';
      g.fillRect(lw, 0, lw, H);
      // 박자선
      const s0 = Math.floor((now - t0) / sec) - 1;
      for (let st = Math.max(0, s0); st <= s0 + AHEAD / sec + 2; st++) {
        if (st % 2 || st > totalSteps) continue;
        const y = yOf(t0 + st * sec);
        g.fillStyle = st % bar === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)';
        g.fillRect(0, y, W, 1);
      }
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(lw - 0.5, 0, 1, H);
      // 판정선
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(0, hitY, W, 2);
      for (let l = 0; l < 2; l++) {
        const cx = lw * (l + 0.5);
        const glow = Math.max(0, 1 - (now - flashAt[l]) / 0.25);
        if (glow > 0) {
          g.fillStyle = l ? `rgba(255,122,162,${0.45 * glow})` : `rgba(255,255,255,${0.35 * glow})`;
          g.fillRect(l * lw, hitY - 26, lw, 52);
        }
        g.strokeStyle = l ? 'rgba(255,179,207,0.7)' : 'rgba(255,255,255,0.5)';
        g.lineWidth = 2;
        if (l) {
          heartPath(cx, hitY, 13);
          g.stroke();
        } else {
          g.strokeRect(cx - lw * 0.32, hitY - 9, lw * 0.64, 18);
        }
      }
      // 멜로디 노트
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '600 12px "IBM Plex Sans KR", sans-serif';
      // 한 번 누르는 건반 타일 + 음 길이만큼 옅은 꼬리
      for (const n of lanes[0]) {
        if (n.state && n.state !== 'miss') continue;
        const y = yOf(n.t);
        const tail = Math.max(0, n.len * sec * pps - 4);
        if (y < -4 || y - tail > H) continue;
        const x = lw * 0.18;
        const w = lw * 0.64;
        if (tail > 24) {
          g.fillStyle = 'rgba(243,245,247,0.12)';
          g.fillRect(x + w * 0.3, y - tail, w * 0.4, tail);
        }
        g.fillStyle = n.state === 'miss' ? 'rgba(140,140,150,0.35)' : '#f3f5f7';
        rrect(g, x, y - 22, w, 22, 5);
        g.fill();
        if (!n.state) {
          g.fillStyle = '#c9ced6';
          g.fillRect(x + 2, y - 5, w - 4, 4);
          g.fillStyle = '#1b1f24';
          g.fillText(solfege(n.pitch) || '', x + w / 2, y - 12);
        }
      }
      // ♥ 노트
      for (const n of lanes[1]) {
        if (n.state && n.state !== 'miss') continue;
        const y = yOf(n.t);
        if (y < -20 || y > H + 20) continue;
        heartPath(lw * 1.5, y, 13);
        g.fillStyle = n.state === 'miss' ? 'rgba(160,120,135,0.35)' : phase === 'look' ? '#ff5d6c' : '#ff8fb3';
        g.fill();
      }
      // 판정 글자
      g.font = '22px "Black Han Sans", sans-serif';
      judge.forEach((j, l) => {
        if (!j) return;
        const k = (now - j.at) / 0.55;
        if (k > 1) return;
        g.globalAlpha = 1 - k;
        g.fillStyle = j.color;
        g.fillText(j.text, lw * (l + 0.5), hitY - 44 - k * 12);
        g.globalAlpha = 1;
      });
      // 시선 표시
      if (phase !== 'away') {
        g.font = '18px "Black Han Sans", sans-serif';
        g.fillStyle = phase === 'look' ? '#ffb0b0' : '#ffe08a';
        g.fillText(phase === 'look' ? '태준이 보는 중!' : '! 돌아본다', lw * 1.5, 22);
      }
      if (now < alertUntil) {
        g.font = '15px "Black Han Sans", sans-serif';
        g.fillStyle = '#ffe08a';
        g.fillText('음이 비었다! 시선이 쏠린다', lw * 0.5, 22);
      }
      // 카운트인
      if (now < t0) {
        const n = Math.ceil((t0 - now) / beat);
        if (n <= 3) {
          g.font = '56px "Black Han Sans", sans-serif';
          g.fillStyle = 'rgba(255,255,255,0.9)';
          g.fillText(String(n), W / 2, H * 0.42);
        }
      }
    };

    const setJudge = (l, text, color, now) => (judge[l] = { text, color, at: now });
    const popHeart = () => {
      const h = document.createElement('span');
      h.className = 'vn-heart small';
      h.innerHTML = heartIcon;
      h.style.left = `${20 + Math.random() * 30}%`;
      ui.fx.appendChild(h);
      setTimeout(() => h.remove(), 1400);
    };

    return new Promise((resolve) => {
      const cleanup = () => {
        ro.disconnect();
        window.removeEventListener('keydown', onKey);
        document.removeEventListener('visibilitychange', onVis);
      };
      const finish = (result, text) => {
        if (done) return;
        done = true;
        cleanup();
        ui.pads.forEach((b) => (b.disabled = true));
        if (result === 'caught') audio.resetBus();
        const accuracy = Math.round((hits / lanes[0].length) * 100) / 100;
        this.st.duet = { result, accuracy };
        ui.msg.innerHTML = `<span></span><small>연주 ${Math.round(accuracy * 100)}%</small>`;
        ui.msg.firstChild.textContent = text;
        ui.msg.className = `mini-msg show ${result === 'shy' ? 'timeout' : result}`;
        if (result === 'success') audio.sparkle();
        else audio.thud();
        setHer(result === 'success' ? 'blush' : result === 'caught' ? 'surprise' : 'sad');
        setTimeout(() => {
          m.hidden = true;
          m.classList.remove('duet');
          if (run === this.run) resolve(result);
        }, 1900);
      };

      const press = (l) => {
        if (done) return;
        const now = audio.now;
        const pad = ui.pads[l];
        pad.classList.add('down');
        setTimeout(() => pad.classList.remove('down'), 90);
        let best = null;
        for (const n of lanes[l]) {
          if (n.t > now + GOOD) break;
          if (n.state || Math.abs(n.t - now) > GOOD) continue;
          if (!best || Math.abs(n.t - now) < Math.abs(best.t - now)) best = n;
        }
        if (!best) return;
        const perfect = Math.abs(best.t - now) <= PERFECT;
        best.state = perfect ? 'perfect' : 'good';
        flashAt[l] = now;
        if (l === 0) {
          hits++;
          audio.note(best.pitch, now, Math.max(0.2, best.len * sec * 0.95), 0.85);
          setJudge(0, perfect ? 'PERFECT' : 'GOOD', perfect ? '#ffd76a' : '#ffffff', now);
          return;
        }
        if (phase === 'look') {
          strikes++;
          ui.strikes.forEach((b, i) => b.classList.toggle('on', i < strikes));
          m.classList.remove('hit');
          void m.offsetWidth;
          m.classList.add('hit');
          audio.thud();
          setHer('surprise');
          herUntil = now + 0.9;
          setJudge(1, '들켰다!', '#ff6b5e', now);
          if (strikes >= 3) finish('caught', '들켰다…!');
          return;
        }
        love = Math.min(100, love + LOVE);
        audio.note(84, now, 0.3, 0.3);
        audio.note(88, now + 0.07, 0.4, 0.26);
        setHer('blush');
        herUntil = now + 0.9;
        popHeart();
        setJudge(1, '♥', '#ffb3cf', now);
      };
      ui.pads.forEach((b, l) =>
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          press(l);
        }),
      );
      const onKey = (e) => {
        if (e.repeat) return;
        if (['ArrowLeft', 'KeyF', 'KeyD'].includes(e.code)) press(0);
        else if (['ArrowRight', 'KeyJ', 'KeyK'].includes(e.code)) press(1);
        else return;
        e.preventDefault();
      };
      // 화면을 벗어나면 시계(오디오)를 멈춘다
      const onVis = () => (document.hidden ? audio.suspend() : audio.resume());
      window.addEventListener('keydown', onKey);
      document.addEventListener('visibilitychange', onVis);

      const frame = () => {
        if (done) return;
        if (run !== this.run) {
          cleanup();
          audio.resetBus();
          return;
        }
        const now = audio.now;
        const dt = Math.max(0, Math.min(0.1, now - lastNow));
        lastNow = now;
        // 반주 예약
        while (ai < acc.length && acc[ai].t < now + 0.3) {
          const a = acc[ai++];
          audio.note(a.pitch, a.t, a.dur, a.vel);
        }
        // 태준
        phaseLeft -= dt;
        if (phaseLeft <= 0) setPhase(phase === 'away' ? 'warn' : phase === 'warn' ? 'look' : 'away');
        if (phase === 'warn' && (tickLeft -= dt) <= 0) {
          tickLeft = beat / 2;
          audio.tick(now, false);
        }
        // 놓친 노트
        for (const n of lanes[0]) {
          if (n.t > now - GOOD) break;
          if (n.state) continue;
          n.state = 'miss';
          setJudge(0, 'MISS', '#9aa0aa', now);
          // 소리가 비면 태준이 곧 돌아본다
          if (phase === 'away' && phaseLeft > beat) {
            phaseLeft = beat * 0.5;
            alertUntil = now + 1.2;
          }
        }
        for (const n of lanes[1]) {
          if (n.t > now - GOOD) break;
          if (!n.state) n.state = 'miss';
        }
        if (now > herUntil) setHer(phase === 'look' ? 'serious' : 'smile');
        ui.love.style.width = `${love}%`;
        ui.time.style.width = `${Math.max(0, Math.min(1, (now - t0) / (songEnd - t0))) * 100}%`;
        draw(now);
        if (now > songEnd + 0.5) {
          if (love >= 99.9) finish('success', '마음이 전해졌다');
          else finish('shy', '끝내 눈을 못 맞췄다');
          return;
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }
}
