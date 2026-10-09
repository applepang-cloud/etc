import { SONGS, BAND_SONGS, FREE_SONG, buildSong } from './songs.js';
import { makeLevel, normalizeTitle } from './maker.js';
import { PianoAudio } from './audio.js';
import { Game } from './game.js';
import { Story } from './story.js';
import { portrait } from './portraits.js';
import { MELODIC } from './instruments.js';
import { Banter } from './banter.js';

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
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

const el = {
  menu: $('#menu'),
  story: $('#story'),
  pause: $('#pause'),
  result: $('#result'),
  hudTitle: $('#hud-title'),
  hudScore: $('#hud-score'),
  hudPct: $('#hud-pct'),
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
let hintsOn = store.get('pb.hints', true);
let timbre = MELODIC[store.get('pb.timbre', 'piano')] ? store.get('pb.timbre', 'piano') : 'piano';

// 악기 고르기 (멜로디 악기 8가지)
function renderInst() {
  const grid = $('#inst-grid');
  grid.innerHTML = '';
  for (const [id, m] of Object.entries(MELODIC)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'inst-chip';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(id === timbre));
    b.style.setProperty('--chip', m.color);
    b.innerHTML = `<span class="dot"></span>${m.name}`;
    b.addEventListener('click', () => {
      timbre = id;
      store.set('pb.timbre', id);
      renderInst();
      audio.ensure();
      audio.preview([60, 64, 67], id);
    });
    grid.appendChild(b);
  }
}
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
    else if (mode !== 'free') sub = `${current.auto ? '자동 이동 · ' : ''}${s.scene + 1} / ${s.scenes} 페이지`;
    setText(el.hudTitle, 'title', sub ? `${title}  ·  ${sub}` : title);
    let big = s.score.toLocaleString('ko-KR');
    if (mode === 'free') big = current.auto ? `${s.bar}마디` : `${s.scene + 1} 페이지`;
    setText(el.hudScore, 'score', big);
    const showPct = s.percent != null;
    if (el.hudPct.hidden === showPct) el.hudPct.hidden = !showPct;
    if (showPct) setText(el.hudPct, 'pct', `연주 ${s.percent}%`);

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
  end: showResult,
  event(name, data) {
    banter.event(name, data);
  },
  listened() {
    if (lastStats) showResult(lastStats, true);
  },
});

const banter = new Banter($('#stage'));
const talkBtn = $('#btn-talk');
const showTalk = () => {
  talkBtn.setAttribute('aria-pressed', String(banter.on));
  talkBtn.textContent = banter.on ? '선생님 대화 켬' : '선생님 대화 끔';
};
showTalk();
talkBtn.addEventListener('click', () => {
  banter.setOn(!banter.on);
  showTalk();
});

new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  game.resize(width, height);
}).observe($('#stage'));

// ---------- 메뉴 ----------

const bestKey = (song, mode, auto = false) => `pb.best.${song.id}.${mode}${auto ? '-auto' : ''}`;

function songButton(song, mode) {
  const best = store.get(bestKey(song, mode, mode === 'band' && playMode === 'flow'), null);
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
  $('#btn-story-continue').hidden = !story.hasSave();
  const mine = $('#custom-list');
  mine.innerHTML = '';
  for (const song of customSongs) mine.appendChild(customButton(song));
  mine.hidden = !customSongs.length;
  freshId = null;
  for (const b of document.querySelectorAll('[data-diff]')) {
    b.setAttribute('aria-checked', String(Number(b.dataset.diff) === makerLevel));
  }
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
renderInst();

// ---------- 노래 제목으로 레벨 만들기 ----------

const CUSTOM_KEY = 'pb.custom.v1';
const CUSTOM_MAX = 30;
let customDefs = store.get(CUSTOM_KEY, []);
if (!Array.isArray(customDefs)) customDefs = [];
let customSongs = buildCustom();
let freshId = null;

function buildCustom() {
  const out = [];
  for (const def of customDefs) {
    try {
      out.push(buildSong(def));
    } catch {}
  }
  return out;
}

const dropBest = (id) => ['stop', 'flow'].forEach((m) => store.remove(`pb.best.${id}.${m}`));

function saveCustom(def) {
  // 같은 제목으로 다시 만들면 예전 레벨을 바꾼다
  const k = (t) => String(t || '').toLowerCase().replace(/\s+/g, '');
  const same = (d) => k(d.title) === k(def.title) || k(d.asked) === k(def.asked);
  const keep = [def, ...customDefs.filter((d) => !same(d))];
  for (const d of customDefs) if (same(d) || keep.indexOf(d) >= CUSTOM_MAX) dropBest(d.id);
  customDefs = keep.slice(0, CUSTOM_MAX);
  store.set(CUSTOM_KEY, customDefs);
  customSongs = buildCustom();
}

function removeCustom(id) {
  customDefs = customDefs.filter((d) => d.id !== id);
  store.set(CUSTOM_KEY, customDefs);
  customSongs = buildCustom();
  dropBest(id);
  if (makerSong?.id === id) setMaker('idle');
}

function customButton(song) {
  const li = songButton(song, playMode);
  li.classList.add('custom');
  if (song.id === freshId) li.classList.add('fresh');
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'song-del';
  del.textContent = '삭제';
  del.setAttribute('aria-label', `${song.title} 삭제`);
  let timer = 0;
  del.addEventListener('click', () => {
    // 두 번 눌러야 지운다
    if (del.classList.contains('armed')) {
      clearTimeout(timer);
      removeCustom(song.id);
      renderMenu();
      return;
    }
    del.classList.add('armed');
    del.textContent = '삭제?';
    timer = setTimeout(() => {
      del.classList.remove('armed');
      del.textContent = '삭제';
    }, 2500);
  });
  li.appendChild(del);
  return li;
}

const maker = {
  form: $('#maker-form'),
  input: $('#maker-title'),
  go: $('#maker-go'),
  status: $('#maker-status'),
  msg: $('#maker-msg'),
  act: $('#maker-act'),
};
let makerLevel = [1, 2, 3].includes(store.get('pb.maker.level', 1)) ? store.get('pb.maker.level', 1) : 1;
let makerCtl = null;
let makerSong = null;
// claude.ai 안에서 열리면 Claude에게 멜로디를 부탁할 수 있다 (없으면 null → 자동 작곡)
const samplePromise =
  typeof window.claude?.use === 'function' ? Promise.resolve(window.claude.use('sample')).catch(() => null) : Promise.resolve(null);
let sampleOff = false;

function setMaker(state, text = '', song = null) {
  maker.status.hidden = state === 'idle';
  maker.status.className = `maker-status ${state}`;
  maker.msg.textContent = text;
  maker.act.textContent = state === 'busy' ? '취소' : '바로 플레이';
  maker.go.disabled = state === 'busy';
  maker.input.disabled = state === 'busy';
  makerSong = song;
}

for (const b of document.querySelectorAll('[data-diff]')) {
  b.addEventListener('click', () => {
    makerLevel = Number(b.dataset.diff);
    store.set('pb.maker.level', makerLevel);
    renderMenu();
  });
}

maker.act.addEventListener('click', () => {
  if (makerCtl) {
    makerCtl.abort();
    makerCtl = null;
    setMaker('idle');
  } else if (makerSong) {
    startGame(makerSong, playMode);
  }
});

maker.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (makerCtl) return;
  const title = normalizeTitle(maker.input.value);
  if (!title) {
    maker.input.focus();
    return;
  }
  const ctl = new AbortController();
  makerCtl = ctl;
  setMaker('busy', '준비 중…');
  try {
    const sample = sampleOff ? null : await samplePromise;
    if (ctl.signal.aborted) return;
    const res = await makeLevel(title, makerLevel, {
      sample,
      offline: sampleOff,
      signal: ctl.signal,
      onProgress: (text) => {
        if (makerCtl === ctl) maker.msg.textContent = text;
      },
    });
    if (ctl.signal.aborted) return;
    makerCtl = null;
    if (res.off) sampleOff = true;
    saveCustom(res.def);
    freshId = res.def.id;
    renderMenu();
    const song = customSongs.find((s) => s.id === res.def.id);
    maker.input.value = '';
    setMaker('done', `「${song.title}」 레벨을 만들었어요. ${res.note}`, song);
  } catch (err) {
    if (ctl.signal.aborted) return;
    makerCtl = null;
    console.error(err);
    setMaker('error', '레벨을 만들지 못했어요. 다른 제목으로 해 보세요.');
  }
});

const hintBtn = $('#btn-hint');
function renderHint() {
  hintBtn.setAttribute('aria-pressed', String(hintsOn));
  hintBtn.textContent = hintsOn ? '추천 블록 켬' : '추천 블록 끔';
}
hintBtn.addEventListener('click', () => {
  hintsOn = !hintsOn;
  store.set('pb.hints', hintsOn);
  renderHint();
});
renderHint();

function startGame(song, mode, extra = {}) {
  // 합주와 자유 작곡도 진행 방식(30초 정지 / 자동 이동)을 따른다.
  const auto = (mode === 'free' || mode === 'band') && playMode === 'flow';
  current = { song, mode, auto, story: extra.story || null };
  lastStats = null;
  audio.ensure();
  el.menu.hidden = true;
  el.pause.hidden = true;
  el.result.hidden = true;
  el.flowLabel.textContent = mode === 'free' ? '다음' : '연주';
  for (const k of Object.keys(shown)) delete shown[k];
  // 크기 알림(ResizeObserver)이 아직 안 왔으면 무대 크기를 직접 재서 넘긴다
  if (!game.W) {
    const r = $('#stage').getBoundingClientRect();
    if (r.width && r.height) game.resize(r.width, r.height);
  }
  // 스토리는 피아노 이야기라서 늘 피아노로 연주한다
  game.start(song, mode, { auto, hints: hintsOn, timbre: extra.story ? 'piano' : timbre });
  banter.begin(song, mode, extra.story);
}

function openMenu() {
  game.stop();
  banter.stop();
  banter.result($('#result-talk'), {}, '', true);
  storyResolve = null;
  el.story.hidden = true;
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
  banter.hide();
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
  if (!free && !again && !current.story) {
    const key = bestKey(stats.song, stats.mode, current.auto);
    const prev = store.get(key, null);
    isBest = stats.score > 0 && (!prev || stats.score > prev.score);
    if (isBest) store.set(key, { score: stats.score, stars: stats.stars });
  }

  let modeName = MODE_NAME[stats.mode] + (current.auto ? ' · 자동 이동' : '');
  if (current.story) modeName = current.story === 'contest' ? '스토리 · 결선 연주' : '스토리 · 레슨';
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

  // 스토리 연주면 '스토리 계속'으로 돌아간다
  const inStory = !!current.story;
  $('#btn-story-next').hidden = !inStory;
  $('#btn-listen').classList.toggle('primary', !inStory);
  $('#btn-original').hidden = free || inStory;
  $('#btn-again').hidden = inStory;
  $('#btn-songs').hidden = inStory;
  $('#btn-continue').hidden = !free;
  $('#btn-again').textContent = free ? '새로 만들기' : '다시 하기';
  el.flow.hidden = true;
  el.result.hidden = false;
  // 서윤의 한마디: 별이 많으면 칭찬, 적으면 아쉬움·위로
  if (!again) {
    banter.stop();
    banter.result($('#result-talk'), stats, stats.mode, current.story);
  }
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

// ---------- 스토리 ----------

let storyResolve = null;

// 스토리에서 곡을 연주하고, 결과 화면의 '스토리 계속'을 누르면 결과를 돌려준다
function playForStory(song, purpose) {
  return new Promise((resolve) => {
    storyResolve = resolve;
    el.story.hidden = true;
    startGame(song, playMode === 'flow' ? 'flow' : 'stop', { story: purpose });
  });
}

const story = new Story(el.story, {
  audio,
  songs: SONGS,
  play: playForStory,
  exit: () => openMenu(),
});

$('#btn-story-next').addEventListener('click', () => {
  el.result.hidden = true;
  game.stop();
  el.story.hidden = false;
  const resolve = storyResolve;
  storyResolve = null;
  resolve?.(lastStats);
});

function openStory(fresh) {
  audio.ensure();
  el.menu.hidden = true;
  story.start(fresh);
}
$('#btn-story-new').addEventListener('click', () => openStory(true));
$('#btn-story-continue').addEventListener('click', () => openStory(false));
$('#story-art').innerHTML = `<div class="a">${portrait('dohyun', 'normal')}</div><div class="b">${portrait('seoyun', 'smile')}</div>`;

renderMenu();
