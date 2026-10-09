// 곡 데이터.
// 토큰 형식: 음이름[:길이]  (예: C4, D#5:2, C4+E4:2)  R = 쉼표, | = 마디 구분(무시됨)
// 드럼은 음이름 대신 CR(크래시) HH(하이햇) TH(하이탐) TL(로우탐) SN(스네어) KK(킥)
// 길이 단위는 1칸(step). 곡마다 한 칸이 몇 분음표인지 다르다.

import { DRUM_KEYS, PART_ORDER } from './instruments.js';

const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteToMidi(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`잘못된 음이름: ${name}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + NOTE_INDEX[m[1]] + acc;
}

function parseTrack(src) {
  const notes = [];
  let t = 0;
  for (const tok of src.trim().split(/\s+/)) {
    if (tok === '|') continue;
    const [body, lenStr] = tok.split(':');
    const len = lenStr ? Number(lenStr) : 1;
    if (body !== 'R') {
      for (const n of body.split('+')) {
        notes.push({ key: DRUM_KEYS.has(n) ? n : noteToMidi(n), start: t, len });
      }
    }
    t += len;
  }
  return { notes, length: t };
}

function buildPart(inst, tracks) {
  const notes = [];
  let length = 0;
  for (const track of tracks) {
    const parsed = parseTrack(track);
    notes.push(...parsed.notes);
    length = Math.max(length, parsed.length);
  }
  notes.sort((a, b) => a.start - b.start);
  const pitches = notes.map((n) => n.key).filter((k) => typeof k === 'number');
  return {
    inst,
    notes,
    length,
    lo: pitches.length ? Math.min(...pitches) : 60,
    hi: pitches.length ? Math.max(...pitches) : 72,
  };
}

function buildSong(def) {
  const parts = PART_ORDER.filter((id) => def.parts[id]).map((id) => buildPart(id, def.parts[id]));
  const length = Math.max(...parts.map((p) => p.length));
  return { ...def, parts, length };
}

// 새 곡들의 멜로디 (곡 연주와 합주에서 같이 쓴다)
const MARY_Q = 'E4 D4 C4 D4 | E4 E4 E4:2 | D4 D4 D4:2 | E4 G4 G4:2 | E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4:4';
const LIGHTLY_Q = 'G4 E4 E4:2 | F4 D4 D4:2 | C4 D4 E4 F4 | G4 G4 G4:2 | G4 E4 E4:2 | F4 D4 D4:2 | C4 E4 G4 G4 | C4:4';
const LIGHTLY_Q2 = 'D4 D4 D4 D4 | D4 E4 F4:2 | E4 E4 E4 E4 | E4 F4 G4:2 | G4 E4 E4:2 | F4 D4 D4:2 | C4 E4 G4 G4 | C4:4';
// 아래는 8분음표 = 1칸
const FRERE = `C4:2 D4:2 E4:2 C4:2 | C4:2 D4:2 E4:2 C4:2 | E4:2 F4:2 G4:4 | E4:2 F4:2 G4:4 |
  G4 A4 G4 F4 E4:2 C4:2 | G4 A4 G4 F4 E4:2 C4:2 | C4:2 G3:2 C4:4 | C4:2 G3:2 C4:4`;
const LONDON = 'G4 A4 G4 F4 E4 F4 G4:2 | D4 E4 F4:2 E4 F4 G4:2 | G4 A4 G4 F4 E4 F4 G4:2 | D4:2 G4:2 E4 C4:3';
// 고요한 밤 (3/4박자)
const SILENT_A = 'G4:3 A4 G4:2 | E4:6 | G4:3 A4 G4:2 | E4:6 | D5:4 D5:2 | B4:6 | C5:4 C5:2 | G4:6';
const SILENT_B = `A4:4 A4:2 | C5:3 B4 A4:2 | G4:3 A4 G4:2 | E4:6 | A4:4 A4:2 | C5:3 B4 A4:2 | G4:3 A4 G4:2 | E4:6 |
  D5:4 D5:2 | F5:3 D5 B4:2 | C5:6 | E5:6 | C5:3 G4 E4:2 | G4:3 F4 D4:2 | C4:6 | C4:6`;
// 미뉴에트 G장조(페촐트)를 다장조로 옮김 (3/4박자)
const MINUET_A = 'G4:2 C4 D4 E4 F4 | G4:2 C4:2 C4:2 | A4:2 F4 G4 A4 B4 | C5:2 C4:2 C4:2';
const MINUET_B1 = 'F4:2 G4 F4 E4 D4 | E4:2 F4 E4 D4 C4 | B3:2 C4 D4 E4 C4 | D4:6';
const MINUET_B2 = 'F4:2 G4 F4 E4 D4 | E4:2 F4 E4 D4 C4 | D4:2 E4 D4 C4 B3 | C4:6';
// 4분음표 그리드 멜로디를 8분음표 그리드로 (길이 두 배)
const double = (src) => src.replace(/([A-G][#b]?\d|R)(?::(\d+))?/g, (_, n, len) => `${n}:${(Number(len) || 1) * 2}`);

const SONG_DEFS = [
  {
    id: 'twinkle',
    title: '작은 별',
    composer: '프랑스 민요',
    level: 1,
    stepSec: 0.55, // 4분음표 = 1칸
    stepsPerBeat: 1,
    stepsPerBar: 4,
    sceneSteps: 12,
    parts: {
      piano: [
        `C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 |
         G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2 |
         C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2`,
      ],
    },
  },
  {
    id: 'jingle',
    title: '징글벨',
    composer: 'J. 피어폰트',
    level: 1,
    stepSec: 0.48,
    stepsPerBeat: 1,
    stepsPerBar: 4,
    sceneSteps: 12,
    parts: {
      piano: [
        `E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4 D4 | E4:4 |
         F4 F4 F4 F4 | F4 E4 E4 E4 | E4 D4 D4 E4 | D4:2 G4:2 |
         E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4 D4 | E4:4 |
         F4 F4 F4 F4 | F4 E4 E4 E4 | G4 G4 F4 D4 | C4:4`,
      ],
    },
  },
  {
    id: 'mary',
    title: '비행기',
    composer: '미국 동요 · Mary Had a Little Lamb',
    level: 1,
    stepSec: 0.5,
    stepsPerBeat: 1,
    stepsPerBar: 4,
    sceneSteps: 12,
    parts: { piano: [MARY_Q] },
  },
  {
    id: 'lightly',
    title: '나비야',
    composer: '독일 민요 · Hänschen klein',
    level: 1,
    stepSec: 0.5,
    stepsPerBeat: 1,
    stepsPerBar: 4,
    sceneSteps: 12,
    parts: { piano: [`${LIGHTLY_Q} | ${LIGHTLY_Q2}`] },
  },
  {
    id: 'birthday',
    title: '생일 축하합니다',
    composer: 'M. J. 힐 · P. S. 힐',
    level: 2,
    stepSec: 0.36, // 8분음표 = 1칸, 3/4박자
    stepsPerBeat: 2,
    stepsPerBar: 6,
    sceneSteps: 12,
    parts: {
      piano: [
        `R:4 G3 G3 | A3:2 G3:2 C4:2 | B3:4 G3 G3 | A3:2 G3:2 D4:2 | C4:4 G3 G3 |
         G4:2 E4:2 C4:2 | B3:2 A3:2 F4 F4 | E4:2 C4:2 D4:2 | C4:6`,
        'R:6 | C3:6 | B2:6 | B2:6 | C3:6 | C3:6 | F3:6 | C3:2 R:2 B2:2 | C3:6',
      ],
    },
  },
  {
    id: 'frere',
    title: '자크 형제',
    composer: '프랑스 민요 · Frère Jacques',
    level: 1,
    stepSec: 0.3, // 8분음표 = 1칸
    stepsPerBeat: 2,
    stepsPerBar: 8,
    sceneSteps: 12,
    parts: { piano: [FRERE] },
  },
  {
    id: 'london',
    title: '런던 다리',
    composer: '영국 민요 · London Bridge',
    level: 2,
    stepSec: 0.3,
    stepsPerBeat: 2,
    stepsPerBar: 8,
    sceneSteps: 12,
    parts: {
      piano: [
        `${LONDON} | ${LONDON}`,
        'C3:4 C3:4 | G3:4 C3:4 | C3:4 C3:4 | G3:4 C3:4 | C3:4 C3:4 | G3:4 C3:4 | C3:4 C3:4 | G3:4 C3:4',
      ],
    },
  },
  {
    id: 'silent',
    title: '고요한 밤',
    composer: 'F. X. 그루버',
    level: 2,
    stepSec: 0.34, // 8분음표 = 1칸, 3/4박자
    stepsPerBeat: 2,
    stepsPerBar: 6,
    sceneSteps: 12,
    parts: { piano: [`${SILENT_A} | ${SILENT_B}`] },
  },
  {
    id: 'minuet',
    title: '미뉴에트',
    composer: 'C. 페촐트 · 바흐의 미뉴에트',
    level: 2,
    stepSec: 0.28, // 8분음표 = 1칸, 3/4박자
    stepsPerBeat: 2,
    stepsPerBar: 6,
    sceneSteps: 12,
    parts: {
      piano: [
        `${MINUET_A} | ${MINUET_B1} | ${MINUET_A} | ${MINUET_B2}`,
        'C3:6 | C3:6 | F3:6 | C3:6 | F3:6 | C3:6 | G3:6 | G3:6 | C3:6 | C3:6 | F3:6 | C3:6 | F3:6 | C3:6 | G3:6 | C3:6',
      ],
    },
  },
  {
    id: 'ode',
    title: '환희의 송가',
    composer: 'L. v. 베토벤',
    level: 2,
    stepSec: 0.36, // 8분음표 = 1칸
    stepsPerBeat: 2,
    stepsPerBar: 8,
    sceneSteps: 12,
    parts: {
      piano: [
        `E4:2 E4:2 F4:2 G4:2 | G4:2 F4:2 E4:2 D4:2 | C4:2 C4:2 D4:2 E4:2 | E4:3 D4:1 D4:4 |
         E4:2 E4:2 F4:2 G4:2 | G4:2 F4:2 E4:2 D4:2 | C4:2 C4:2 D4:2 E4:2 | D4:3 C4:1 C4:4 |
         D4:2 D4:2 E4:2 C4:2 | D4:2 E4:1 F4:1 E4:2 C4:2 | D4:2 E4:1 F4:1 E4:2 D4:2 | C4:2 D4:2 G3:4 |
         E4:2 E4:2 F4:2 G4:2 | G4:2 F4:2 E4:2 D4:2 | C4:2 C4:2 D4:2 E4:2 | D4:3 C4:1 C4:4`,
        `C3:4 E3:4 | G3:4 D3:4 | C3:4 E3:4 | G3:4 D3:4 |
         C3:4 E3:4 | G3:4 D3:4 | C3:4 E3:4 | G3:4 C3:4 |
         G3:4 C3:4 | G3:4 C3:4 | G3:4 D3:4 | C3:4 D3:4 |
         C3:4 E3:4 | G3:4 D3:4 | C3:4 E3:4 | G3:4 C3:4`,
      ],
    },
  },
  {
    id: 'elise',
    title: '엘리제를 위하여',
    composer: 'L. v. 베토벤',
    level: 3,
    stepSec: 0.3, // 16분음표 = 1칸, 3/8박자
    stepsPerBeat: 2,
    stepsPerBar: 6,
    sceneSteps: 12,
    parts: {
      piano: [
        `R:4 E5 D#5 |
         E5 D#5 E5 B4 D5 C5 | A4:2 R C4 E4 A4 | B4:2 R E4 G#4 B4 | C5:2 R E4 E5 D#5 |
         E5 D#5 E5 B4 D5 C5 | A4:2 R C4 E4 A4 | B4:2 R E4 C5 B4 | A4:2 R:2 E5 D#5 |
         E5 D#5 E5 B4 D5 C5 | A4:2 R C4 E4 A4 | B4:2 R E4 G#4 B4 | C5:2 R E4 E5 D#5 |
         E5 D#5 E5 B4 D5 C5 | A4:2 R C4 E4 A4 | B4:2 R E4 C5 B4 | A4:6`,
      ],
    },
  },
];

// 합주: 장면마다 피아노 → 드럼 → 보컬 순서로 채운다. 8분음표 = 1칸, 한 장면 = 한 마디.
const BAND_DEFS = [
  {
    id: 'band-twinkle',
    title: '작은 별 밴드',
    composer: '프랑스 민요 · 합주 편곡',
    level: 2,
    band: true,
    stepSec: 0.3,
    stepsPerBeat: 2,
    stepsPerBar: 8,
    sceneSteps: 8,
    parts: {
      piano: [
        'C3:4 G3:4 | F3:4 C3:4 | F3:4 C3:4 | G3:4 C3:4',
        'R:2 E4+G4:2 R:2 E4+G4:2 | R:2 F4+A4:2 R:2 E4+G4:2 | R:2 F4+A4:2 R:2 E4+G4:2 | R:2 D4+G4:2 R:2 E4+G4:2',
      ],
      drums: [
        'CR R:7 | R:8 | R:8 | R:8',
        'R HH HH HH HH HH HH HH | HH HH HH HH HH HH HH HH | HH HH HH HH HH HH HH HH | HH HH HH HH R:4',
        'R:8 | R:8 | R:8 | R:6 TH TL',
        'R:2 SN R:3 SN R | R:2 SN R:3 SN R | R:2 SN R:3 SN R | R:2 SN R SN SN R:2',
        'KK R:3 KK R:3 | KK R:2 KK KK R:3 | KK R:3 KK R:3 | KK R:3 KK R:3',
      ],
      vocal: ['C4:2 C4:2 G4:2 G4:2 | A4:2 A4:2 G4:4 | F4:2 F4:2 E4:2 E4:2 | D4:2 D4:2 C4:4'],
    },
  },
  {
    id: 'band-mary',
    title: '비행기 밴드',
    composer: '미국 동요 · 록 비트 편곡',
    level: 1,
    band: true,
    stepSec: 0.32,
    stepsPerBeat: 2,
    stepsPerBar: 8,
    sceneSteps: 8,
    parts: {
      piano: [
        'C3:4 G3:4 | C3:4 G3:4 | G3:4 D3:4 | C3:4 G3:4 | C3:4 G3:4 | C3:4 G3:4 | G3:4 D3:4 | C3:8',
        `R:2 E4+G4:2 R:2 E4+G4:2 | R:2 E4+G4:2 R:2 E4+G4:2 | R:2 D4+G4:2 R:2 D4+G4:2 | R:2 E4+G4:2 R:2 E4+G4:2 |
         R:2 E4+G4:2 R:2 E4+G4:2 | R:2 E4+G4:2 R:2 E4+G4:2 | R:2 D4+G4:2 R:2 D4+G4:2 | R:2 E4+G4:6`,
      ],
      drums: [
        'CR R:7 | R:8 | R:8 | R:8 | CR R:7 | R:8 | R:8 | CR R:7',
        `R HH HH HH HH HH HH HH | HH HH HH HH HH HH HH HH | HH HH HH HH HH HH HH HH | HH HH HH HH R:4 |
         R HH HH HH HH HH HH HH | HH HH HH HH HH HH HH HH | HH HH HH HH HH HH HH HH | R:8`,
        'R:8 | R:8 | R:8 | R:6 TH TL | R:8 | R:8 | R:8 | R:8',
        `R:2 SN R:3 SN R | R:2 SN R:3 SN R | R:2 SN R:3 SN R | R:2 SN R SN SN R:2 |
         R:2 SN R:3 SN R | R:2 SN R:3 SN R | R:2 SN R:3 SN R | R:8`,
        `KK R:3 KK R:3 | KK R:2 KK KK R:3 | KK R:3 KK R:3 | KK R:3 KK R:3 |
         KK R:3 KK R:3 | KK R:2 KK KK R:3 | KK R:3 KK R:3 | KK R:7`,
      ],
      vocal: [double(MARY_Q)],
    },
  },
  {
    id: 'band-lightly',
    title: '나비야 밴드',
    composer: '독일 민요 · 팝 편곡',
    level: 2,
    band: true,
    stepSec: 0.32,
    stepsPerBeat: 2,
    stepsPerBar: 8,
    sceneSteps: 8,
    parts: {
      piano: [
        `C3:2 G3:2 C3:2 G3:2 | G3:2 D3:2 G3:2 D3:2 | C3:2 G3:2 C3:2 G3:2 | C3:2 G3:2 C3:2 G3:2 |
         C3:2 G3:2 C3:2 G3:2 | G3:2 D3:2 G3:2 D3:2 | C3:2 G3:2 C3:2 G3:2 | C3:8`,
        'E4+G4:8 | D4+F4:8 | E4+G4:8 | E4+G4:8 | E4+G4:8 | D4+F4:8 | E4+G4:8 | E4+G4:8',
      ],
      drums: [
        'CR R:7 | R:8 | R:8 | R:8 | CR R:7 | R:8 | R:8 | CR R:7',
        `R:2 HH R HH R HH R | HH R HH R HH R HH R | HH R HH R HH R HH R | HH R HH R R:4 |
         R:2 HH R HH R HH R | HH R HH R HH R HH R | HH R HH R HH R HH R | R:8`,
        'R:8 | R:8 | R:8 | R:4 TH TH TL TL | R:8 | R:8 | R:8 | R:8',
        `R:2 SN R:3 SN R | R:2 SN R:3 SN R | R:2 SN R:3 SN R | R:2 SN R:5 |
         R:2 SN R:3 SN R | R:2 SN R:3 SN R | R:2 SN R:3 SN R | R:8`,
        `KK R:3 KK R:3 | KK R:3 KK R:3 | KK R:3 KK R:3 | KK R:3 KK R:3 |
         KK R:3 KK R:3 | KK R:3 KK R:3 | KK R:3 KK R:3 | KK R:7`,
      ],
      vocal: [double(LIGHTLY_Q)],
    },
  },
  {
    id: 'band-birthday',
    title: '생일 축하 밴드',
    composer: 'M. J. 힐 · P. S. 힐 · 왈츠 편곡',
    level: 2,
    band: true,
    stepSec: 0.34,
    stepsPerBeat: 2,
    stepsPerBar: 6, // 3/4박자
    sceneSteps: 6,
    parts: {
      piano: [
        'R:6 | C3:2 R:4 | G3:2 R:4 | G3:2 R:4 | C3:2 R:4 | C3:2 R:4 | F3:2 R:4 | C3:2 R:2 G3:2 | C3:6',
        `R:6 | R:2 E4+G4:2 E4+G4:2 | R:2 D4+F4:2 D4+F4:2 | R:2 D4+F4:2 D4+F4:2 | R:2 E4+G4:2 E4+G4:2 |
         R:2 E4+G4:2 E4+G4:2 | R:2 F4+A4:2 F4+A4:2 | R:2 E4+G4:2 R:2 | E4+G4:6`,
      ],
      drums: [
        'R:6 | CR R:5 | R:6 | R:6 | R:6 | CR R:5 | R:6 | R:6 | CR R:5',
        `R:4 HH HH | R:2 HH R HH R | R:2 HH R HH R | R:2 HH R HH R | R:2 HH R:3 |
         R:2 HH R HH R | R:2 HH R HH R | R:2 HH R HH R | R:6`,
        'R:6 | R:6 | R:6 | R:6 | R:4 SN SN | R:6 | R:6 | R:2 SN R SN R | R:6',
        'R:6 | KK R:5 | KK R:5 | KK R:5 | KK R:5 | KK R:5 | KK R:5 | KK R:3 KK R | KK R:5',
      ],
      vocal: [
        `R:4 G4 G4 | A4:2 G4:2 C5:2 | B4:4 G4 G4 | A4:2 G4:2 D5:2 | C5:4 G4 G4 |
         G5:2 E5:2 C5:2 | B4:2 A4:2 F5 F5 | E5:2 C5:2 D5:2 | C5:6`,
      ],
    },
  },
  {
    id: 'band-frere',
    title: '자크 형제 밴드',
    composer: '프랑스 민요 · 행진 편곡',
    level: 1,
    band: true,
    stepSec: 0.32,
    stepsPerBeat: 2,
    stepsPerBar: 8,
    sceneSteps: 8,
    parts: {
      piano: [
        `C3:2 G3:2 C3:2 G3:2 | C3:2 G3:2 C3:2 G3:2 | C3:2 G3:2 C3:2 G3:2 | C3:2 G3:2 C3:2 G3:2 |
         C3:2 G3:2 C3:2 G3:2 | C3:2 G3:2 C3:2 G3:2 | C3:2 G3:2 C3:2 G3:2 | C3:8`,
        `R:2 E4+G4:2 R:2 E4+G4:2 | R:2 E4+G4:2 R:2 E4+G4:2 | R:2 E4+G4:2 R:2 E4+G4:2 | R:2 E4+G4:2 R:2 E4+G4:2 |
         R:2 E4+G4:2 R:2 E4+G4:2 | R:2 E4+G4:2 R:2 E4+G4:2 | R:2 E4+G4:2 R:2 E4+G4:2 | E4+G4:8`,
      ],
      drums: [
        'CR R:7 | R:8 | R:8 | R:8 | CR R:7 | R:8 | R:8 | CR R:7',
        `R HH HH HH HH HH HH HH | HH HH HH HH HH HH HH HH | HH HH HH HH HH HH HH HH | HH HH HH HH HH HH R:2 |
         R HH HH HH HH HH HH HH | HH HH HH HH HH HH HH HH | HH HH HH HH HH HH HH HH | R:8`,
        'R:8 | R:8 | R:8 | R:6 TH TL | R:8 | R:8 | R:8 | R:8',
        `R:2 SN R:3 SN R | R:2 SN R:3 SN R | R:2 SN R:3 SN R | R:2 SN R:3 SN R |
         R:2 SN R:3 SN R | R:2 SN R:3 SN R | R:2 SN R:3 SN SN | R:8`,
        `KK R:3 KK R:3 | KK R:3 KK R:3 | KK R:3 KK R:3 | KK R:3 KK R:3 |
         KK R:3 KK R:3 | KK R:3 KK R:3 | KK R:3 KK R:3 | KK R:7`,
      ],
      vocal: [FRERE],
    },
  },
  {
    id: 'band-london',
    title: '런던 다리 밴드',
    composer: '영국 민요 · 록 편곡',
    level: 1,
    band: true,
    stepSec: 0.3,
    stepsPerBeat: 2,
    stepsPerBar: 8,
    sceneSteps: 8,
    parts: {
      piano: [
        'C3:4 C3:4 | G3:4 C3:4 | C3:4 C3:4 | G3:4 C3:4',
        'R:2 E4+G4:2 R:2 E4+G4:2 | R:2 D4+F4:2 R:2 E4+G4:2 | R:2 E4+G4:2 R:2 E4+G4:2 | R:2 D4+F4:2 R:2 E4+G4:2',
      ],
      drums: [
        'CR R:7 | R:8 | R:8 | R:8',
        'R HH HH HH HH HH HH HH | HH HH HH HH HH HH HH HH | HH HH HH HH HH HH HH HH | HH HH HH HH HH HH R:2',
        'R:8 | R:8 | R:8 | R:6 TH TL',
        'R:2 SN R:3 SN R | R:2 SN R:3 SN R | R:2 SN R:3 SN R | R:2 SN R:3 SN R',
        'KK R:3 KK R:3 | KK R:2 KK KK R:3 | KK R:3 KK R:3 | KK R:2 KK KK R:3',
      ],
      vocal: [LONDON],
    },
  },
  {
    id: 'band-minuet',
    title: '미뉴에트 밴드',
    composer: 'C. 페촐트 · 왈츠 편곡',
    level: 2,
    band: true,
    stepSec: 0.3,
    stepsPerBeat: 2,
    stepsPerBar: 6, // 3/4박자
    sceneSteps: 6,
    parts: {
      piano: [
        'C3:2 R:4 | C3:2 R:4 | F3:2 R:4 | C3:2 R:4 | F3:2 R:4 | C3:2 R:4 | G3:2 R:4 | C3:6',
        `R:2 E4+G4:2 E4+G4:2 | R:2 E4+G4:2 E4+G4:2 | R:2 F4+A4:2 F4+A4:2 | R:2 E4+G4:2 E4+G4:2 |
         R:2 F4+A4:2 F4+A4:2 | R:2 E4+G4:2 E4+G4:2 | R:2 D4+F4:2 D4+F4:2 | E4+G4:6`,
      ],
      drums: [
        'CR R:5 | R:6 | R:6 | R:6 | CR R:5 | R:6 | R:6 | CR R:5',
        'R:2 HH R HH R | R:2 HH R HH R | R:2 HH R HH R | R:2 HH R:3 | R:2 HH R HH R | R:2 HH R HH R | R:2 HH R HH R | R:6',
        'R:6 | R:6 | R:6 | R:4 SN SN | R:6 | R:6 | R:2 SN R SN R | R:6',
        'KK R:5 | KK R:5 | KK R:5 | KK R:5 | KK R:5 | KK R:5 | KK R:3 KK R | KK R:5',
      ],
      vocal: [`${MINUET_A} | ${MINUET_B2}`],
    },
  },
  {
    id: 'band-silent',
    title: '고요한 밤 밴드',
    composer: 'F. X. 그루버 · 발라드 편곡',
    level: 2,
    band: true,
    stepSec: 0.36,
    stepsPerBeat: 2,
    stepsPerBar: 6, // 3/4박자
    sceneSteps: 6,
    parts: {
      piano: [
        'C3:6 | C3:6 | C3:6 | C3:6 | G3:6 | G3:6 | C3:6 | C3:6',
        'R:2 E4+G4:4 | R:2 E4+G4:4 | R:2 E4+G4:4 | R:2 E4+G4:4 | R:2 D4+F4:4 | R:2 D4+F4:4 | R:2 E4+G4:4 | R:2 E4+G4:4',
      ],
      drums: [
        'CR R:5 | R:6 | R:6 | R:6 | R:6 | R:6 | R:6 | R:6',
        'R:2 HH R HH R | R:2 HH R HH R | R:2 HH R HH R | R:2 HH R HH R | R:2 HH R HH R | R:2 HH R HH R | R:2 HH R HH R | R:2 HH R:3',
        'R:6 | R:6 | R:6 | R:4 TH TL | R:6 | R:6 | R:6 | R:6',
        'KK R:5 | KK R:5 | KK R:5 | KK R:5 | KK R:5 | KK R:5 | KK R:5 | KK R:5',
      ],
      vocal: [SILENT_A],
    },
  },
];

// 메뉴에는 쉬운 곡부터 (같은 난이도는 적어 둔 순서대로)
const byLevel = (a, b) => a.level - b.level;
export const SONGS = SONG_DEFS.map(buildSong).sort(byLevel);
export const BAND_SONGS = BAND_DEFS.map(buildSong).sort(byLevel);

// 자유 작곡: 목표 노트 없이 빈 피아노 롤. 길이는 장면을 넘길 때마다 늘어난다.
export const FREE_SONG = {
  id: 'free',
  title: '자유 작곡',
  composer: '',
  free: true,
  stepSec: 0.3,
  stepsPerBeat: 2,
  stepsPerBar: 8,
  sceneSteps: 12,
  length: 0,
  parts: [{ inst: 'piano', notes: [], length: 0, lo: 60, hi: 72 }],
};
