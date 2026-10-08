// 곡 데이터.
// 토큰 형식: 음이름[:길이]  (예: C4, D#5:2, C4+E4:2)  R = 쉼표, | = 마디 구분(무시됨)
// 길이 단위는 1칸(step). 곡마다 한 칸이 몇 분음표인지 다르다.

const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MIN_ROWS = 12;

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
      for (const n of body.split('+')) notes.push({ pitch: noteToMidi(n), start: t, len });
    }
    t += len;
  }
  return { notes, length: t };
}

function buildSong(def) {
  const notes = [];
  let length = 0;
  for (const track of def.tracks) {
    const parsed = parseTrack(track);
    notes.push(...parsed.notes);
    length = Math.max(length, parsed.length);
  }
  notes.sort((a, b) => a.start - b.start || b.pitch - a.pitch);

  const lowPitch = Math.min(...notes.map((n) => n.pitch));
  const highPitch = Math.max(...notes.map((n) => n.pitch));
  // 위아래로 한 줄씩 여유를 둔 최소 줄 수. 실제 줄 수는 화면 크기에 맞춰 게임에서 늘린다.
  const rows = Math.max(MIN_ROWS, highPitch - lowPitch + 3);
  return { ...def, notes, length, lowPitch, highPitch, rows };
}

const DEFS = [
  {
    id: 'twinkle',
    title: '작은 별',
    composer: '프랑스 민요',
    level: 1,
    stepSec: 0.55, // 4분음표 = 1칸
    stepsPerBeat: 1,
    stepsPerBar: 4,
    tracks: [
      `C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 |
       G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2 |
       C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2`,
    ],
  },
  {
    id: 'jingle',
    title: '징글벨',
    composer: 'J. 피어폰트',
    level: 1,
    stepSec: 0.48,
    stepsPerBeat: 1,
    stepsPerBar: 4,
    tracks: [
      `E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4 D4 | E4:4 |
       F4 F4 F4 F4 | F4 E4 E4 E4 | E4 D4 D4 E4 | D4:2 G4:2 |
       E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4 D4 | E4:4 |
       F4 F4 F4 F4 | F4 E4 E4 E4 | G4 G4 F4 D4 | C4:4`,
    ],
  },
  {
    id: 'ode',
    title: '환희의 송가',
    composer: 'L. v. 베토벤',
    level: 2,
    stepSec: 0.36, // 8분음표 = 1칸
    stepsPerBeat: 2,
    stepsPerBar: 8,
    tracks: [
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
  {
    id: 'elise',
    title: '엘리제를 위하여',
    composer: 'L. v. 베토벤',
    level: 3,
    stepSec: 0.3, // 16분음표 = 1칸, 3/8박자
    stepsPerBeat: 2,
    stepsPerBar: 6,
    tracks: [
      `R:4 E5 D#5 |
       E5 D#5 E5 B4 D5 C5 | A4:2 R C4 E4 A4 | B4:2 R E4 G#4 B4 | C5:2 R E4 E5 D#5 |
       E5 D#5 E5 B4 D5 C5 | A4:2 R C4 E4 A4 | B4:2 R E4 C5 B4 | A4:2 R:2 E5 D#5 |
       E5 D#5 E5 B4 D5 C5 | A4:2 R C4 E4 A4 | B4:2 R E4 G#4 B4 | C5:2 R E4 E5 D#5 |
       E5 D#5 E5 B4 D5 C5 | A4:2 R C4 E4 A4 | B4:2 R E4 C5 B4 | A4:6`,
    ],
  },
];

export const SONGS = DEFS.map(buildSong);
