// 스토리 모드: 비주얼 노벨 엔진 (대사, 선택지 분기, 연주 연동, 미니게임)

import { portrait } from './portraits.js';
import { CAST, CHAPTER1 } from './story-data.js';

const SAVE_KEY = 'pb.story.v2'; // 설정이 바뀌면 버전을 올려 예전 저장을 쓰지 않는다
const TYPE_MS = 28;

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
      const result = await this.sneak(run);
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
    this.el.art.innerHTML = ['academy', 'night', 'hall', 'station'].includes(name) ? pianoSvg : '';
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
      <p class="mini-hint">교수님이 <b>!</b> 하고 돌아보려 하면 손을 떼고 연습하는 척!</p>
      <button type="button" class="mini-hold">꾹 눌러서 눈빛 보내기</button>`;
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
}
