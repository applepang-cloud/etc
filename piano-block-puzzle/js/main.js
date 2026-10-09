import { SONGS, BAND_SONGS, FREE_SONG } from './songs.js';
import { PianoAudio } from './audio.js';
import { Game } from './game.js';

const $ = (sel) => document.querySelector(sel);

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

const el = {
  menu: $('#menu'),
  pause: $('#pause'),
  result: $('#result'),
  hudTitle: $('#hud-title'),
  hudScore: $('#hud-score'),
  hudTimer: $('#hud-timer'),
  hudTimerN: $('#hud-timer-n'),
  hudProgress: $('#hud-progress'),
  done: $('#btn-done'),
  flow: $('#btn-flow'),
  flowLabel: $('#btn-flow-label'),
};

const PLAY_DESC = {
  stop: '한 페이지를 30초 동안 멈춰 두고 채워요. 시간이 끝나거나 다 채우면 그 페이지만 흘러가며 연주하고, 마지막에 전체 연주를 들려줘요.',
  flow: '멈추지 않고 곡 템포대로 계속 흘러가요. 재생선에 닿기 전에 흘러오는 자리에 블록을 놓아야 해요.',
};
const MODE_NAME = { stop: '정지 모드', flow: '자동 이동 모드', band: '합주', free: '자유 작곡' };

const audio = new PianoAudio();
let playMode = store.get('pb.play', 'stop');
let current = null; // { song, mode }
let lastStats = null;
const shown = {};

function setText(node, key, text) {
  if (shown[key] === text) return;
  shown[key] = text;
  node.textContent = text;
}

const game = new Game($('#board'), audio, {
  hud(s) {
    const { song, mode } = current;
    let title = song.title;
    if (mode === 'band') title += ` · ${s.part ? s.part.name : '합주'}`;
    let sub;
    if (s.finale) sub = '전체 연주';
    else if (mode === 'flow' || (mode === 'free' && current.auto)) sub = '자동 이동';
    else if (mode !== 'free') sub = `${s.scene + 1} / ${s.scenes} 페이지`;
    setText(el.hudTitle, 'title', sub ? `${title}  ·  ${sub}` : title);
    let big = s.score.toLocaleString('ko-KR');
    if (mode === 'free') big = current.auto ? `${s.bar}마디` : `${s.scene + 1} 페이지`;
    setText(el.hudScore, 'score', big);

    const showTimer = s.timer != null;
    if (el.hudTimer.hidden === showTimer) el.hudTimer.hidden = !showTimer;
    if (showTimer) {
      setText(el.hudTimerN, 'timer', String(Math.ceil(s.timer)));
      el.hudTimer.style.setProperty('--p', (s.timer / s.timerTotal).toFixed(3));
      el.hudTimer.classList.toggle('warn', s.timer <= 5);
    }
    const showDone = mode === 'free' && !s.finale;
    if (el.done.hidden === showDone) el.done.hidden = !showDone;
    if (el.flow.hidden === s.placing) el.flow.hidden = !s.placing;

    const p = s.progress != null ? s.progress : (s.scene + (s.placing ? 0 : 1)) / s.scenes;
    const w = `${Math.round(Math.min(1, p) * 1000) / 10}%`;
    if (shown.progress !== w) {
      shown.progress = w;
      el.hudProgress.style.width = w;
    }
  },
  layout({ trayTop, H }) {
    el.flow.style.bottom = `${Math.round(H - trayTop + 12)}px`;
  },
  end: showResult,
  listened() {
    if (lastStats) showResult(lastStats, true);
  },
});

new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  game.resize(width, height);
}).observe($('#stage'));

// ---------- 메뉴 ----------

const bestKey = (song, mode) => `pb.best.${song.id}.${mode}`;

function songButton(song, mode) {
  const best = store.get(bestKey(song, mode), null);
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'song';
  btn.innerHTML = `
    <span class="song-level" aria-label="난이도 ${song.level}">
      ${[1, 2, 3].map((i) => `<i class="${i <= song.level ? 'on' : ''}"></i>`).join('')}
    </span>
    <span class="song-text">
      <span class="song-title"></span>
      <span class="song-composer"></span>
    </span>
    <span class="song-best">${best ? `<small>최고</small>${best.score.toLocaleString('ko-KR')}` : '<small>첫 도전</small>'}</span>
    <span class="song-play" aria-hidden="true"></span>`;
  btn.querySelector('.song-title').textContent = song.title;
  btn.querySelector('.song-composer').textContent =
    mode === 'band' ? `${song.composer} · 피아노 · 드럼 · 보컬` : song.composer;
  btn.addEventListener('click', () => startGame(song, mode));
  li.appendChild(btn);
  return li;
}

function renderMenu() {
  const list = $('#song-list');
  list.innerHTML = '';
  for (const song of SONGS) list.appendChild(songButton(song, playMode));
  const band = $('#band-list');
  band.innerHTML = '';
  for (const song of BAND_SONGS) band.appendChild(songButton(song, 'band'));
  for (const b of document.querySelectorAll('[data-play]')) {
    b.setAttribute('aria-checked', String(b.dataset.play === playMode));
  }
  $('#play-desc').textContent = PLAY_DESC[playMode];
}

for (const b of document.querySelectorAll('[data-play]')) {
  b.addEventListener('click', () => {
    playMode = b.dataset.play;
    store.set('pb.play', playMode);
    renderMenu();
  });
}

$('#btn-free').addEventListener('click', () => startGame(FREE_SONG, 'free'));

function startGame(song, mode) {
  // 자유 작곡도 진행 방식(정지/자동 이동)을 따른다. 합주는 항상 정지 방식.
  const auto = mode === 'free' && playMode === 'flow';
  current = { song, mode, auto };
  lastStats = null;
  audio.ensure();
  el.menu.hidden = true;
  el.pause.hidden = true;
  el.result.hidden = true;
  el.flowLabel.textContent = mode === 'free' ? '다음 페이지' : '바로 연주';
  for (const k of Object.keys(shown)) delete shown[k];
  game.start(song, mode, { auto });
}

function openMenu() {
  game.stop();
  el.pause.hidden = true;
  el.result.hidden = true;
  el.flow.hidden = true;
  renderMenu();
  el.menu.hidden = false;
}

// ---------- 진행 버튼 ----------

el.flow.addEventListener('click', () => game.skip());
el.done.addEventListener('click', () => game.completeFree());

// ---------- 일시정지 ----------

function openPause() {
  if (game.state !== 'playing') return;
  game.pause();
  el.pause.hidden = false;
}

$('#btn-pause').addEventListener('click', openPause);
$('#btn-resume').addEventListener('click', () => {
  el.pause.hidden = true;
  game.resume();
});
$('#btn-restart').addEventListener('click', () => startGame(current.song, current.mode));
$('#btn-quit').addEventListener('click', openMenu);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) openPause();
});

// ---------- 결과 ----------

function stat(label, value, wide = false) {
  return `<div${wide ? ' class="wide"' : ''}><dt>${label}</dt><dd>${value}</dd></div>`;
}

function showResult(stats, again = false) {
  lastStats = stats;
  const free = stats.mode === 'free';
  let isBest = false;
  if (!free && !again) {
    const key = bestKey(stats.song, stats.mode);
    const prev = store.get(key, null);
    isBest = stats.score > 0 && (!prev || stats.score > prev.score);
    if (isBest) store.set(key, { score: stats.score, stars: stats.stars });
  }

  const modeName = MODE_NAME[stats.mode] + (free && current.auto ? ' · 자동 이동' : '');
  $('#result-song').textContent = free ? modeName : `${stats.song.title} · ${modeName}`;
  $('#result-stars').hidden = free;
  document.querySelectorAll('#result-stars .star').forEach((s, i) => s.classList.toggle('on', i < stats.stars));
  $('#result-verdict').textContent = free ? '작곡 완성!' : ['다시 도전해 보세요', '좋아요', '훌륭해요', '완벽한 연주!'][stats.stars];
  $('#result-score').textContent = free ? `${stats.blocks}칸` : stats.score.toLocaleString('ko-KR');
  if (!again) $('#result-best').hidden = !isBest;

  if (free) {
    const sec = Math.round(stats.length * FREE_SONG.stepSec);
    $('#result-stats').innerHTML = stat('마디', Math.ceil(stats.length / FREE_SONG.stepsPerBar)) + stat('길이', `${sec}초`);
  } else {
    let html =
      stat('정확도', `${Math.round(stats.accuracy * 100)}%`) +
      stat('FANTASTIC', stats.perfects) +
      stat('최대 콤보', stats.maxCombo) +
      stat('빈칸 블록', stats.badCells);
    if (stats.mode !== 'flow') html += stat('다 채운 페이지', `${stats.sceneClears} / ${stats.scenes}`, true);
    $('#result-stats').innerHTML = html;
  }

  $('#btn-original').hidden = free;
  $('#btn-continue').hidden = !free;
  $('#btn-again').textContent = free ? '새로 만들기' : '다시 하기';
  el.flow.hidden = true;
  el.result.hidden = false;
}

$('#btn-listen').addEventListener('click', () => {
  el.result.hidden = true;
  game.listen(false);
});
$('#btn-original').addEventListener('click', () => {
  el.result.hidden = true;
  game.listen(true);
});
$('#btn-continue').addEventListener('click', () => {
  el.result.hidden = true;
  game.continueFree();
});
$('#btn-again').addEventListener('click', () => startGame(current.song, current.mode));
$('#btn-songs').addEventListener('click', openMenu);

renderMenu();
