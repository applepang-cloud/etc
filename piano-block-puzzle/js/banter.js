// 블록 맞추기 중 도현·서윤의 한마디(말풍선 + 음성)와 결과 화면의 서윤 한마디.
// 게임이 hooks.event(name, data) 로 알려 주는 순간마다 확률과 쉬는 간격을 보고 고른다.

import { BANTER } from './banter-data.js';
import { CAST } from './story-data.js';
import { VOICES } from './voices.js';
import { voiceKey } from './voice-key.js';
import { portrait } from './portraits.js';

const KEY = 'pb.banter'; // 'off' 면 끔
const GAP = 9; // 한마디 뒤 최소 쉬는 시간(초)
// 이벤트마다 말할 확률
const CHANCE = { start: 0.85, fantastic: 0.22, combo: 0.6, bad: 0.35, clear: 0.7, timeup: 0.6, idle: 0.9, bomb: 0.5 };

const isMonologue = (text) => /^\(.*\)$/s.test(text.trim());
const voiceOn = () => {
  try {
    return localStorage.getItem('pb.voice') !== 'off';
  } catch {
    return true;
  }
};

export class Banter {
  constructor(stage) {
    this.el = document.createElement('div');
    this.el.className = 'banter';
    this.el.setAttribute('aria-live', 'polite');
    this.el.hidden = true;
    stage.appendChild(this.el);
    this.last = new Map(); // 묶음별 마지막으로 쓴 줄 (같은 말 연달아 안 하게)
    this.quietUntil = 0;
    this.active = false;
    try {
      this.on = localStorage.getItem(KEY) !== 'off';
    } catch {
      this.on = true;
    }
  }

  setOn(v) {
    this.on = v;
    try {
      localStorage.setItem(KEY, v ? 'on' : 'off');
    } catch {}
    if (!v) this.hide();
  }

  // 곡 시작. story 중에는 스토리 대사가 있으니 조용히 있는다.
  begin(song, mode, story) {
    this.active = this.on && !story;
    this.hide();
    this.quietUntil = 0;
    if (!this.active) return;
    const base = String(song.id || '').replace(/^band-/, '');
    let pool = BANTER.start;
    if (mode === 'free') pool = BANTER.startFree;
    else if (BANTER.song[base] && Math.random() < 0.6) pool = BANTER.song[base];
    else if (mode === 'band') pool = BANTER.startBand;
    else if (song.level >= 3) pool = BANTER.startHard;
    if (Math.random() < CHANCE.start) setTimeout(() => this.active && this.say(this.pick(pool)), 4000); // 시작 안내 문구가 지나간 뒤
  }

  stop() {
    this.active = false;
    this.hide();
  }

  event(name, data = {}) {
    if (!this.active) return;
    if (performance.now() / 1000 < this.quietUntil) return;
    let key = name;
    if (name === 'judge') {
      if (data.word === 'FANTASTIC') key = data.combo >= 3 ? 'combo' : 'fantastic';
      else if (data.word === 'BAD') key = 'bad';
      else return;
    }
    if (!BANTER[key] || Math.random() > (CHANCE[key] ?? 0.3)) return;
    this.say(this.pick(BANTER[key]));
  }

  pick(pool) {
    const prev = this.last.get(pool);
    const options = pool.length > 1 ? pool.filter((l) => l !== prev) : pool;
    const line = options[Math.floor(Math.random() * options.length)];
    this.last.set(pool, line);
    return line;
  }

  // 말풍선 띄우고 음성 재생
  say([who, text, expr = 'normal'], target = this.el) {
    const cast = CAST[who];
    if (!cast) return;
    const mono = isMonologue(text);
    target.hidden = false;
    target.classList.toggle('mono', mono);
    target.style.setProperty('--c', cast.color);
    target.innerHTML = `<div class="banter-face">${portrait(who, expr)}</div>
      <div class="banter-bubble"><b>${cast.name}</b><span></span></div>`;
    target.querySelector('span').textContent = text;
    target.classList.remove('show');
    void target.offsetWidth;
    target.classList.add('show');

    this.stopVoice();
    let secs = Math.max(2.8, text.length * 0.13);
    const data = voiceOn() ? VOICES[voiceKey(who, text)] : null;
    if (data) {
      const a = new Audio(`data:audio/mpeg;base64,${data}`);
      a.volume = mono ? 0.5 : 0.9;
      a.play().catch(() => {});
      a.addEventListener('loadedmetadata', () => {
        if (isFinite(a.duration)) this.schedule(target, Math.max(secs, a.duration + 0.8));
      });
      this.audio = a;
    }
    this.schedule(target, secs);
    if (target === this.el) this.quietUntil = performance.now() / 1000 + secs + GAP;
  }

  schedule(target, secs) {
    clearTimeout(target._hideTimer);
    target._hideTimer = setTimeout(() => {
      target.classList.remove('show');
      setTimeout(() => {
        if (!target.classList.contains('show')) target.hidden = true;
      }, 300);
    }, secs * 1000);
  }

  stopVoice() {
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
  }

  hide() {
    this.stopVoice();
    clearTimeout(this.el._hideTimer);
    this.el.classList.remove('show');
    this.el.hidden = true;
  }

  // 결과 화면: 별 개수에 따라 칭찬하거나 위로한다 (스토리 중에는 하지 않음)
  result(target, stats, mode, story) {
    target.hidden = true;
    if (!this.on || story) return;
    const pool = mode === 'free' ? BANTER.resultFree : BANTER[`result${Math.max(0, Math.min(3, stats.stars | 0))}`];
    this.stopVoice();
    setTimeout(() => this.say(this.pick(pool), target), 500);
  }
}
