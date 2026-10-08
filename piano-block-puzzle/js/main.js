import { SONGS } from './songs.js';
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
  songList: $('#song-list'),
  hudTitle: $('#hud-title'),
  hudScore: $('#hud-score'),
  hudCombo: $('#hud-combo'),
  hudComboN: $('#hud-combo-n'),
  hudProgress: $('#hud-progress'),
};

const audio = new PianoAudio();
let speed = store.get('pbp.speed', 1);
let current = null;
const shown = { score: -1, combo: -1, progress: -1 };

const game = new Game($('#board'), audio, {
  hud(score, combo, progress) {
    if (score !== shown.score) {
      shown.score = score;
      el.hudScore.textContent = score.toLocaleString('ko-KR');
    }
    if (combo !== shown.combo) {
      shown.combo = combo;
      el.hudComboN.textContent = combo;
      el.hudCombo.classList.toggle('on', combo > 1);
    }
    const p = Math.round(progress * 1000) / 10;
    if (p !== shown.progress) {
      shown.progress = p;
      el.hudProgress.style.width = `${p}%`;
    }
  },
  end: showResult,
});

new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  game.resize(width, height);
}).observe($('#stage'));

// ---------- 메뉴 ----------

function bestKey(song) {
  return `pbp.best.${song.id}`;
}

function renderSongs() {
  el.songList.innerHTML = '';
  for (const song of SONGS) {
    const best = store.get(bestKey(song), null);
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
    btn.querySelector('.song-composer').textContent = song.composer;
    btn.addEventListener('click', () => startSong(song));
    li.appendChild(btn);
    el.songList.appendChild(li);
  }
}

function renderSpeed() {
  for (const b of document.querySelectorAll('[data-speed]')) {
    b.setAttribute('aria-checked', String(Number(b.dataset.speed) === speed));
  }
}

for (const b of document.querySelectorAll('[data-speed]')) {
  b.addEventListener('click', () => {
    speed = Number(b.dataset.speed);
    store.set('pbp.speed', speed);
    renderSpeed();
  });
}

function startSong(song) {
  current = song;
  audio.ensure();
  el.menu.hidden = true;
  el.pause.hidden = true;
  el.result.hidden = true;
  el.hudTitle.textContent = song.title;
  game.start(song, speed);
}

function openMenu() {
  game.stop();
  el.pause.hidden = true;
  el.result.hidden = true;
  renderSongs();
  el.menu.hidden = false;
}

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
$('#btn-restart').addEventListener('click', () => startSong(current));
$('#btn-quit').addEventListener('click', openMenu);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) openPause();
});

// ---------- 결과 ----------

function showResult(stats) {
  const prev = store.get(bestKey(stats.song), null);
  const isBest = !prev || stats.score > prev.score;
  if (isBest) store.set(bestKey(stats.song), { score: stats.score, stars: stats.stars });

  $('#result-song').textContent = stats.song.title;
  $('#result-score').textContent = stats.score.toLocaleString('ko-KR');
  $('#result-best').hidden = !isBest || stats.score === 0;
  $('#result-accuracy').textContent = `${Math.round(stats.accuracy * 100)}%`;
  $('#result-perfects').textContent = stats.perfects;
  $('#result-combo').textContent = stats.maxCombo;
  $('#result-bars').textContent = `${stats.perfectBars} / ${stats.barsWithNotes}`;
  $('#result-wrong').textContent = stats.badCells;
  document.querySelectorAll('#result-stars .star').forEach((s, i) => s.classList.toggle('on', i < stats.stars));
  $('#result-verdict').textContent = ['다시 도전해 보세요', '좋아요', '훌륭해요', '완벽한 연주!'][stats.stars];
  el.result.hidden = false;
}

$('#btn-again').addEventListener('click', () => startSong(current));
$('#btn-songs').addEventListener('click', openMenu);

renderSpeed();
renderSongs();
