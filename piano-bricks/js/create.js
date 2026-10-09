/* Piano Bricks — the 새 곡 만들기 screen.
 * A song title goes to Claude (when the page runs as a claude.ai artifact);
 * a file is read as MIDI or analysed as audio. Either way PB.maker builds the map. */
(function (PB) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const M = PB.maker;
  let sample = null; // Claude, when available
  let aiChecked = false; // claude.use('sample') has answered
  let aiCtl = null;
  let madeId = null;

  const AI_ERRORS = {
    not_granted: 'Claude 사용을 허용하지 않아서 만들 수 없어요.',
    sampling_disabled: '이 계정에서는 Claude를 쓸 수 없어요.',
    capability_disabled: '지금 화면에서는 Claude를 쓸 수 없어요.',
    rate_limited: '잠시 사용량이 많아요. 조금 뒤에 다시 해 보세요.',
    session_expired: 'claude.ai에 다시 로그인한 뒤 해 보세요.',
    refused: '이 요청으로는 만들 수 없어요. 제목을 바꿔 보세요.',
    invalid_json: '답을 맵으로 바꾸지 못했어요. 한 번 더 눌러 보세요.',
    empty_completion: '답이 비어 있었어요. 제목을 바꿔 다시 해 보세요.'
  };

  function setStatus(el, text, kind) {
    el.textContent = text;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  const options = () => ({ level: Number($('opt-level').value), stages: Number($('opt-stages').value) });

  // Mini piano roll of the whole song in form order.
  function drawPreview(song) {
    const cv = $('made-preview'), g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    g.fillStyle = '#111214';
    g.fillRect(0, 0, W, H);
    const notes = [];
    song.form.forEach((si, i) => {
      PB.parseMelody(song.stages[si].melody).notes.forEach((n) => notes.push({ midi: n.midi, start: n.start + i * 8, len: n.len }));
    });
    const total = song.form.length * 8;
    const lo = Math.min(...notes.map((n) => n.midi)) - 1, hi = Math.max(...notes.map((n) => n.midi)) + 1;
    const rh = H / (hi - lo + 1);
    g.fillStyle = '#26282c';
    for (let b = 0; b <= total; b += 8) g.fillRect(Math.round((b / total) * W), 0, 1, H);
    notes.forEach((n) => {
      g.fillStyle = PB.core.isBlack(n.midi) ? '#8a8b90' : '#f2f1ed';
      g.fillRect((n.start / total) * W + 0.5, (hi - n.midi) * rh + 1, Math.max(2, (n.len / total) * W - 1), Math.max(2, rh - 2));
    });
  }

  function showMade(song) {
    PB.game.addCustomSong(song);
    madeId = song.id;
    $('made-title').textContent = song.title;
    const noteCount = song.form.reduce((a, si) => a + PB.parseMelody(song.stages[si].melody).notes.length, 0);
    $('made-info').textContent = [
      song.en,
      'BPM ' + song.bpm,
      song.key,
      song.stages.length + '스테이지',
      '음 ' + noteCount + '개'
    ].filter(Boolean).join(' · ');
    drawPreview(song);
    const card = $('create-result');
    card.classList.remove('hidden');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function syncAi() {
    const el = $('ai-status');
    if (sample) setStatus(el, '');
    else if (window.claude && !aiChecked) setStatus(el, 'Claude 연결을 확인하는 중…', 'muted');
    else setStatus(el, '제목으로 만들기는 claude.ai에서 이 게임을 열었을 때만 쓸 수 있어요. 아래 음악 파일로 만들어 보세요.', 'muted');
  }

  async function makeFromTitle(e) {
    e.preventDefault();
    const el = $('ai-status'), btn = $('btn-ai');
    if (aiCtl) {
      aiCtl.abort();
      return;
    }
    const title = $('title-input').value.trim();
    if (!title) {
      setStatus(el, '노래 제목을 적어 주세요.', 'warn');
      return;
    }
    if (!sample) {
      syncAi();
      return;
    }
    aiCtl = new AbortController();
    btn.textContent = '멈추기';
    const t0 = Date.now();
    const tick = () => setStatus(el, 'Claude가 멜로디를 받아 적는 중… ' + Math.round((Date.now() - t0) / 1000) + '초');
    tick();
    const timer = setInterval(tick, 1000);
    try {
      // The same title within a day replays the stored answer instead of asking again.
      const data = await sample.json(M.claudePrompt(title), { signal: aiCtl.signal, cache: { gcTime: 24 * 3600e3 } });
      const src = M.fromClaude(data);
      if (!src.title) src.title = title;
      showMade(M.buildSong(src, options()));
      setStatus(el, '맵을 만들었어요! 아래에서 바로 플레이할 수 있어요.', 'ok');
    } catch (err) {
      if (err && err.code === 'cancelled') setStatus(el, '멈췄어요.');
      else if (err && err.code) setStatus(el, AI_ERRORS[err.code] || '만들지 못했어요. 잠시 뒤 다시 해 보세요.', 'warn');
      else setStatus(el, (err && err.message) || '만들지 못했어요.', 'warn');
      if (err && ['not_granted', 'sampling_disabled', 'capability_disabled'].includes(err.code)) sample = null;
    } finally {
      clearInterval(timer);
      aiCtl = null;
      btn.textContent = '만들기';
    }
  }

  async function decodeAudio(buf) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) throw new Error('이 브라우저는 음악 파일 분석을 지원하지 않아요.');
    const sr = 22050;
    const ac = new OAC(1, sr, sr);
    let audio;
    try {
      audio = await new Promise((resolve, reject) => {
        const p = ac.decodeAudioData(buf, resolve, reject);
        if (p && p.then) p.then(resolve, reject);
      });
    } catch (e) {
      throw new Error('이 파일은 열 수 없어요. MP3, WAV, M4A 같은 음악 파일이나 MIDI 파일을 골라 주세요.');
    }
    const n = audio.length, data = new Float32Array(n);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const ch = audio.getChannelData(c);
      for (let i = 0; i < n; i++) data[i] += ch[i] / audio.numberOfChannels;
    }
    return { data, sr: audio.sampleRate };
  }

  const isMidi = (buf) => buf.byteLength > 4 && String.fromCharCode(...new Uint8Array(buf, 0, 4)) === 'MThd';

  async function makeFromFile() {
    const input = $('file-input'), el = $('file-status');
    const file = input.files && input.files[0];
    if (!file) return;
    input.disabled = true;
    try {
      const buf = await file.arrayBuffer();
      let src;
      if (isMidi(buf)) {
        setStatus(el, 'MIDI 악보를 읽는 중…');
        src = M.parseMidi(buf);
      } else {
        setStatus(el, '음악을 여는 중…');
        const pcm = await decodeAudio(buf);
        const startSec = Math.max(0, Number($('start-sec').value) || 0);
        if (startSec * pcm.sr >= pcm.data.length) throw new Error('시작 시간이 곡 길이보다 길어요.');
        src = await M.analyzeAudio(pcm.data, pcm.sr, {
          startSec,
          maxSec: 80,
          onProgress: (f) => setStatus(el, '멜로디를 분석하는 중… ' + Math.round(f * 100) + '%')
        });
      }
      src.title = file.name.replace(/\.[^.]+$/, '');
      showMade(M.buildSong(src, options()));
      setStatus(el, '맵을 만들었어요! 아래에서 바로 플레이할 수 있어요.', 'ok');
    } catch (err) {
      setStatus(el, (err && err.message) || '파일을 읽지 못했어요.', 'warn');
    } finally {
      input.disabled = false;
      input.value = '';
    }
  }

  function open() {
    PB.audio.unlock();
    madeId = null;
    $('create-result').classList.add('hidden');
    setStatus($('file-status'), '');
    syncAi();
    PB.game.showScreen('create');
  }

  function init() {
    $('btn-create').addEventListener('click', open);
    $('create-back').addEventListener('click', () => PB.game.openMenu());
    $('ai-form').addEventListener('submit', makeFromTitle);
    $('file-input').addEventListener('change', makeFromFile);
    $('btn-list-made').addEventListener('click', () => PB.game.openMenu());
    $('btn-play-made').addEventListener('click', () => {
      const idx = PB.SONGS.findIndex((s) => s.id === madeId);
      if (idx >= 0) PB.game.startStage(idx, 0, false);
    });
    if (window.claude && typeof window.claude.use === 'function') {
      const done = (s) => { sample = s || null; aiChecked = true; syncAi(); };
      window.claude.use('sample').then(done, () => done(null));
    }
    syncAi();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.PB = window.PB || {});
