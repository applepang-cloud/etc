// 노래 제목으로 새 레벨 만들기.
// 코덱스 브리지(tools/codex-bridge.mjs)가 켜져 있으면 코덱스에게, claude.ai 안에서 열리면 Claude에게
// 멜로디를 부탁하고(sample 기능), 둘 다 안 되면 제목을 씨앗으로 한 자동 작곡으로 만든다.
// 결과는 songs.js 의 곡 정의와 같은 모양이다.
//
// 저작권: 저작권이 끝난 곡(민요·동요·옛 찬송가·작곡가 사후 70년이 지난 클래식)만 원곡 멜로디로 쓰고,
// 그 밖의 곡은 제목 분위기에 맞춘 새 멜로디로 만들도록 Claude에게 요청한다.

import { noteToMidi } from './songs.js';
import { promptFor } from './maker-prompt.js';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiName = (p) => `${NAMES[p % 12]}${Math.floor(p / 12) - 1}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cleanText = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

const MAX_STEPS = 128; // 8분음표 칸 기준 최대 길이 (4/4박자 16마디)
const MIN_NOTES = 8;

export function normalizeTitle(s) {
  return cleanText(s, 40);
}

// ---------- AI(코덱스·Claude)에게 부탁하기 ----------
// 지시문은 maker-prompt.js (코덱스 브리지 서버와 같이 쓴다)

// Claude를 쓸 수 없을 때의 안내. off = 이 화면에서는 다시 묻지 않는다.
function explain(e) {
  switch (e?.code) {
    case 'not_granted':
    case 'sampling_disabled':
    case 'not_declared':
    case 'capability_disabled':
    case 'capability_removed':
      return { off: true, note: 'Claude를 쓸 수 없어서 제목으로 자동 작곡했어요.' };
    case 'rate_limited':
      return { note: 'Claude 사용량이 많아 이번엔 자동 작곡으로 만들었어요. 잠시 뒤 다시 만들어 보세요.' };
    case 'session_expired':
      return { note: '로그인이 끝나서 자동 작곡으로 만들었어요. 다시 로그인하면 Claude가 만들어 줘요.' };
    case 'refused':
      return { note: '이 제목은 Claude가 만들 수 없대요. 대신 자동 작곡으로 만들었어요.' };
    default:
      return { note: 'Claude의 악보를 읽지 못해 자동 작곡으로 만들었어요. 다시 누르면 Claude에게 다시 부탁해요.' };
  }
}

// 코덱스 브리지(tools/codex-bridge.mjs)가 켜져 있으면 그 주소. 꺼져 있으면 null.
export const CODEX_URL = 'http://127.0.0.1:8770';
export async function codexReady() {
  try {
    const res = await fetch(`${CODEX_URL}/health`, { signal: AbortSignal.timeout(1500) });
    const j = await res.json();
    return !!(j.ok && j.codex);
  } catch {
    return false;
  }
}

const CODEX_NOTE = {
  busy: '코덱스가 다른 곡을 만드는 중이라 이번엔 자동 작곡으로 만들었어요.',
  timeout: '코덱스 응답이 너무 늦어 자동 작곡으로 만들었어요.',
  login: '코덱스 로그인이 필요해요(코덱스 앱에서 로그인). 이번엔 자동 작곡으로 만들었어요.',
};

// codex: 코덱스 브리지를 쓸지. sample: claude.use('sample')의 결과(없으면 null).
// offline: 이 화면에서 Claude가 이미 거절됨. 순서: 코덱스 → Claude → 자동 작곡.
// 취소되면 {code:'cancelled'}로 거절한다.
export async function makeLevel(title, level, { codex = false, sample = null, signal, onProgress, offline = false } = {}) {
  let note = offline ? 'Claude를 쓸 수 없어서 제목으로 자동 작곡했어요.' : '코덱스 서버가 꺼져 있어서 제목으로 자동 작곡했어요.';
  let off = false;
  if (codex) {
    try {
      onProgress?.('코덱스가 악보를 쓰는 중… (보통 20~60초)');
      const res = await fetch(`${CODEX_URL}/melody`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, level }),
        signal,
      });
      const raw = await res.json();
      if (!res.ok) throw { code: raw?.error };
      const source = raw?.source === 'melody' ? 'melody' : 'original';
      const def = toSongDef(raw, { title, source });
      return {
        def,
        via: 'codex',
        note: source === 'melody' ? '코덱스가 원곡 멜로디로 만들었어요.' : '코덱스가 제목에 어울리는 새 멜로디로 만들었어요.',
      };
    } catch (e) {
      if (e?.name === 'AbortError' || signal?.aborted) throw { code: 'cancelled' };
      note = CODEX_NOTE[e?.code] || '코덱스의 악보를 읽지 못해 자동 작곡으로 만들었어요. 다시 누르면 코덱스에게 다시 부탁해요.';
    }
  }
  if (sample) {
    try {
      onProgress?.('Claude가 악보를 쓰는 중… (보통 10~40초)');
      const raw = await sample.json(promptFor(title, level), {
        signal,
        cache: false, // 같은 제목으로 다시 만들면 새 멜로디
        onText: () => onProgress?.('악보를 받는 중…'),
      });
      const source = raw?.source === 'melody' ? 'melody' : 'original';
      const def = toSongDef(raw, { title, source });
      return {
        def,
        via: 'claude',
        note: source === 'melody' ? '원곡 멜로디로 만들었어요.' : '제목에 어울리는 새 멜로디로 만들었어요.',
      };
    } catch (e) {
      if (e?.code === 'cancelled' || signal?.aborted) throw { code: 'cancelled' };
      ({ note, off = false } = explain(e));
    }
  }
  const def = toSongDef(composeFromTitle(title, level), { title, source: 'auto' });
  return { def, via: 'auto', note, off };
}

// ---------- 악보 읽기와 곡 정의 만들기 ----------

const TOKEN = /^(R|[A-G][#b]?\d(?:\+[A-G][#b]?\d)*)(?::(\d{1,2}))?$/;

function readMelody(src) {
  const notes = [];
  let t = 0;
  let bad = 0;
  let total = 0;
  const text = String(src).replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\|/g, ' ').replace(/,/g, ' ');
  for (const tok of text.split(/\s+/)) {
    if (!tok) continue;
    total++;
    const m = TOKEN.exec(tok);
    const len = m && m[2] ? Number(m[2]) : 1;
    if (!m || len < 1 || len > 16) {
      bad++;
      continue;
    }
    if (m[1] !== 'R') {
      const pitches = m[1].split('+').map(noteToMidi);
      notes.push({ pitch: Math.max(...pitches), start: t, len }); // 화음이면 맨 위 음만
    }
    t += len;
  }
  return { notes, bad, total };
}

export function toSongDef(raw, { title, source }) {
  if (!raw || typeof raw !== 'object' || typeof raw.melody !== 'string') throw new Error('악보가 없어요');
  const meter = Number(raw.meter) === 3 ? 3 : 4;
  const bpm = clamp(Math.round(Number(raw.bpm) || 100), 56, 160);
  const read = readMelody(raw.melody);
  if (!read.total || read.bad / read.total > 0.15) throw new Error('악보 형식이 맞지 않아요');

  // 한 줄 멜로디로 정리: 같은 자리 음은 하나만, 다음 음과 겹치면 자른다
  let notes = read.notes.sort((a, b) => a.start - b.start || b.pitch - a.pitch);
  notes = notes.filter((n, i) => i === 0 || n.start !== notes[i - 1].start);
  for (let i = 0; i + 1 < notes.length; i++) notes[i].len = Math.min(notes[i].len, notes[i + 1].start - notes[i].start);
  if (!notes.length) throw new Error('음이 없어요');

  // 앞쪽의 빈 마디는 버리고, 너무 길면 자른다
  const bar8 = meter * 2;
  const shift = Math.floor(notes[0].start / bar8) * bar8;
  notes = notes
    .map((n) => ({ ...n, start: n.start - shift }))
    .filter((n) => n.start < MAX_STEPS)
    .map((n) => ({ ...n, len: Math.min(n.len, MAX_STEPS - n.start) }));
  if (notes.length < MIN_NOTES) throw new Error('음이 너무 적어요');

  // 음역: 가운데에서 많이 벗어난 음은 옥타브를 옮기고, 전체를 C4~C5 근처로
  const sorted = notes.map((n) => n.pitch).sort((a, b) => a - b);
  const mid = sorted[sorted.length >> 1];
  for (const n of notes) {
    while (n.pitch > mid + 9) n.pitch -= 12;
    while (n.pitch < mid - 8) n.pitch += 12;
  }
  let lo = Math.min(...notes.map((n) => n.pitch));
  let hi = Math.max(...notes.map((n) => n.pitch));
  const oct = Math.round((66 - (lo + hi) / 2) / 12) * 12;
  for (const n of notes) n.pitch += oct;
  lo += oct;
  hi += oct;

  // 8분음표가 하나도 없으면 4분음표 = 1칸 격자로 (칸이 넓어진다)
  const quarter = notes.every((n) => n.start % 2 === 0 && n.len % 2 === 0);
  const unit = quarter ? 2 : 1;
  let t = 0;
  const tokens = [];
  for (const n of notes) {
    const start = n.start / unit;
    const len = n.len / unit;
    if (start > t) tokens.push(`R:${start - t}`);
    tokens.push(len === 1 ? midiName(n.pitch) : `${midiName(n.pitch)}:${len}`);
    t = start + len;
  }

  // 난이도는 실제 악보로 매긴다
  const range = hi - lo;
  const shortShare = notes.filter((n) => n.len === 1).length / notes.length;
  const level = quarter ? (range <= 9 ? 1 : 2) : shortShare > 0.3 || range > 14 ? 3 : 2;

  const mood = cleanText(raw.mood, 24);
  const shown = source === 'melody' ? cleanText(raw.title, 30) || title : title;
  let composer;
  if (source === 'melody') composer = `원곡 멜로디 · ${cleanText(raw.composer, 20) || '전래곡'}`;
  else if (source === 'original') composer = `새 멜로디 · ${mood || 'Claude 작곡'}`;
  else composer = `자동 작곡 · ${mood}`;

  return {
    id: `c${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    title: shown,
    asked: title,
    composer,
    source,
    custom: true,
    level,
    stepSec: quarter ? clamp(60 / bpm, 0.36, 0.7) : clamp(30 / bpm, 0.26, 0.42),
    stepsPerBeat: quarter ? 1 : 2,
    stepsPerBar: quarter ? meter : meter * 2,
    sceneSteps: 12,
    parts: { piano: [tokens.join(' ')] },
  };
}

// ---------- 자동 작곡 (제목이 같으면 같은 곡) ----------

function hashStr(s) {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function pickW(r, pairs) {
  let x = r() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of pairs) if ((x -= w) < 0) return v;
  return pairs[pairs.length - 1][0];
}

const SAD = /슬프|슬픈|이별|눈물|빗|비 오|장마|밤|겨울|그리|안녕|혼자|외로|달빛|새벽|기억|추억|sad|rain|night|blue|tear|lonely|goodbye|cry|winter|moon/i;
const HAPPY = /신나|신난|파티|여름|춤|사랑|행복|햇|봄|축하|웃|소풍|달려|happy|dance|party|summer|sun|love|joy|fun/i;
const WALTZ = /왈츠|자장|요람|회전|꿈|waltz|lullaby|dream/i;
const SLOW = /자장|요람|꿈|lullaby|dream/i;

// 다장조 / 가단조 (흰 건반만). 화음은 음이름 번호(0=도) 묶음
const KEYS = {
  major: {
    tonicPc: 0,
    chords: { I: [0, 4, 7], ii: [2, 5, 9], IV: [5, 9, 0], V: [7, 11, 2], vi: [9, 0, 4] },
    progs: [['I', 'V', 'vi'], ['I', 'IV', 'V'], ['I', 'vi', 'IV'], ['I', 'IV', 'I'], ['I', 'ii', 'V']],
    half: 'V',
    tonic: 'I',
  },
  minor: {
    tonicPc: 9,
    chords: { i: [9, 0, 4], iv: [2, 5, 9], v: [4, 7, 11], VI: [5, 9, 0], III: [0, 4, 7], VII: [7, 11, 2] },
    progs: [['i', 'VI', 'III'], ['i', 'iv', 'v'], ['i', 'VII', 'VI'], ['i', 'iv', 'VII']],
    half: 'v',
    tonic: 'i',
  },
};
const WHITE = [55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76]; // G3 ~ E5
const RANGE = {
  major: { 1: [60, 69], 2: [55, 72], 3: [55, 76] },
  minor: { 1: [57, 69], 2: [55, 72], 3: [57, 76] },
};

// 한 마디 리듬 (8분음표 칸)
const RHYTHMS = {
  4: {
    1: [[2, 2, 2, 2], [2, 2, 4], [4, 2, 2], [4, 4]],
    2: [[2, 1, 1, 2, 2], [1, 1, 2, 2, 2], [3, 1, 2, 2], [2, 2, 1, 1, 2]],
    3: [[1, 1, 1, 1, 2, 2], [2, 1, 1, 1, 1, 2], [1, 1, 2, 1, 1, 2], [3, 1, 3, 1]],
  },
  3: {
    1: [[2, 2, 2], [4, 2], [2, 4]],
    2: [[2, 1, 1, 2], [3, 1, 2], [1, 1, 2, 2]],
    3: [[1, 1, 1, 1, 2], [2, 1, 1, 1, 1], [1, 1, 2, 1, 1]],
  },
};
const ENDS = {
  4: { half: [[4, 4], [2, 2, 4]], full: [[8], [4, 4]] },
  3: { half: [[2, 4], [6]], full: [[6]] },
};

export function composeFromTitle(title, level) {
  const r = rng(hashStr(`${title}|${level}`));
  const sad = SAD.test(title);
  const happy = !sad && HAPPY.test(title);
  const minor = sad || (!happy && r() < 0.3);
  const meter = WALTZ.test(title) || r() < 0.15 ? 3 : 4;
  let bpm = sad ? 72 + Math.floor(r() * 16) : happy ? 112 + Math.floor(r() * 20) : 92 + Math.floor(r() * 20);
  if (SLOW.test(title)) bpm = Math.round(bpm * 0.85);

  const key = KEYS[minor ? 'minor' : 'major'];
  const [lo, hi] = RANGE[minor ? 'minor' : 'major'][level];
  const pool = WHITE.filter((p) => p >= lo && p <= hi);
  const rhythms = level === 1 ? RHYTHMS[meter][1] : [...RHYTHMS[meter][level - 1], ...RHYTHMS[meter][level]];
  const motif = pick(r, rhythms); // 마디 1·3에 되풀이되는 리듬
  const ctx = { cur: pool.findIndex((p) => p % 12 === key.tonicPc), half: meter === 4 ? 4 : -1 };
  if (ctx.cur < 0) ctx.cur = pool.length >> 1;

  const nearest = (want) => {
    let best = ctx.cur;
    let bd = Infinity;
    pool.forEach((p, j) => {
      const d = Math.abs(j - ctx.cur) + (j < ctx.cur ? 0.1 : 0);
      if (want(p) && d < bd) {
        bd = d;
        best = j;
      }
    });
    return best;
  };
  const chordTone = (pcs) => {
    const cands = [];
    pool.forEach((p, j) => {
      const d = Math.abs(j - ctx.cur);
      if (pcs.includes(p % 12) && d <= 4) cands.push([j, d === 0 ? 0.5 : 1 / d]);
    });
    return cands.length ? pickW(r, cands) : nearest((p) => pcs.includes(p % 12));
  };
  const stepMove = () => {
    let d = pickW(r, [[-1, 3], [1, 3], [-2, 1], [2, 1], [0, 0.6]]);
    if (ctx.cur <= 1) d = Math.abs(d) || 1;
    if (ctx.cur >= pool.length - 2) d = -Math.abs(d) || -1;
    return clamp(ctx.cur + d, 0, pool.length - 1);
  };

  const bar = (chord, rhythm, cadence) => {
    const pcs = key.chords[chord];
    let pos = 0;
    return rhythm.map((len, i) => {
      let j;
      if (cadence && i === rhythm.length - 1) j = nearest((p) => (cadence === 'full' ? p % 12 === key.tonicPc : pcs.includes(p % 12)));
      else if (pos === 0 || pos === ctx.half || len >= 3) j = chordTone(pcs);
      else j = stepMove();
      ctx.cur = j;
      pos += len;
      return { j, len };
    });
  };
  const lastOf = (b) => b[b.length - 1].j;

  // 4마디 악절: 앞 3마디는 화음 진행, 마지막 마디는 반마침(half) 또는 온마침(full)
  const phrase = (prog, cadence, final = false) => {
    const chords = cadence === 'full' ? [prog[0], prog[1], key.half] : prog;
    const bars = chords.map((c, b) => bar(c, b === 1 ? pick(r, rhythms) : motif));
    const ends = final ? [ENDS[meter].full[0]] : ENDS[meter][cadence];
    bars.push(bar(cadence === 'full' ? key.tonic : key.half, pick(r, ends), cadence));
    return bars;
  };
  // 같은 첫머리로 시작해서 온마침으로 끝나는 악절
  const answer = (a, final) => {
    ctx.cur = lastOf(a[1]);
    return [a[0], a[1], bar(key.half, motif), bar(key.tonic, final ? ENDS[meter].full[0] : pick(r, ENDS[meter].full), 'full')];
  };

  const progA = pick(r, key.progs);
  const A = phrase(progA, 'half');
  let bars;
  if (level === 1) bars = [...A, ...answer(A, true)];
  else {
    ctx.cur = Math.min(pool.length - 1, ctx.cur + 2); // 가운데 악절은 조금 높게
    const B = phrase(pick(r, key.progs.filter((p) => p !== progA)), 'half');
    if (level === 2) bars = [...A, ...B, ...answer(A, true)];
    else bars = [...A, ...answer(A, false), ...B, ...answer(A, true)];
  }

  const melody = bars.map((b) => b.map(({ j, len }) => `${midiName(pool[j])}:${len}`).join(' ')).join(' | ');
  const mood = `${minor ? (sad ? '쓸쓸한' : '차분한') : happy ? '경쾌한' : '밝은'} ${minor ? '가단조' : '다장조'} · ${meter}/4박자`;
  return { source: 'auto', title, composer: '자동 작곡', mood, bpm, meter, melody };
}
