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
];

export const SONGS = SONG_DEFS.map(buildSong);
export const BAND_SONGS = BAND_DEFS.map(buildSong);

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
