// 악기별 줄(행) 배치와 색. 줄 목록은 위에서 아래 순서.

export const DRUM_ROWS = [
  { key: 'CR', label: '크래시', color: '#f6c344' },
  { key: 'HH', label: '하이햇', color: '#3cc1f0' },
  { key: 'TH', label: '하이탐', color: '#b07cf0' },
  { key: 'TL', label: '로우탐', color: '#8a64e8' },
  { key: 'SN', label: '스네어', color: '#f2604f' },
  { key: 'KK', label: '킥', color: '#f39233' },
];
export const DRUM_KEYS = new Set(DRUM_ROWS.map((d) => d.key));

export const INSTRUMENTS = {
  piano: { id: 'piano', name: '피아노', color: '#34a853', edge: '#1b6430', top: '#62cf7c', maxAspect: 1 },
  drums: { id: 'drums', name: '드럼', color: '#f39233', edge: '#9a5310', top: '#ffc07a', maxAspect: 2 },
  vocal: { id: 'vocal', name: '보컬', color: '#ef5fae', edge: '#9c2c68', top: '#ffa3d2', maxAspect: 1.8 },
};

export const PART_ORDER = ['piano', 'drums', 'vocal'];

// 건반형(피아노) 파트를 연주할 멜로디 악기. 배치는 피아노 롤 그대로, 소리·색·이름만 바뀐다.
// octave: 실제로 울릴 때 옮기는 반음 수 (베이스·첼로는 한 옥타브 아래, 플루트는 위)
// sustain: 활·숨으로 끄는 악기는 노트 길이만큼 이어지고 짧게 끊긴다
export const MELODIC = {
  piano: { name: '피아노', color: '#34a853', edge: '#1b6430', top: '#62cf7c', octave: 0, release: 0.12 },
  guitar: { name: '기타', color: '#d9a05b', edge: '#8a5a22', top: '#f3c98f', octave: 0, release: 0.15 },
  bass: { name: '베이스', color: '#6c7bd9', edge: '#333f91', top: '#9ea9f2', octave: -12, release: 0.1 },
  violin: { name: '바이올린', color: '#e2725b', edge: '#93382a', top: '#f5a493', octave: 0, release: 0.09, sustain: true },
  cello: { name: '첼로', color: '#b5634b', edge: '#6b3020', top: '#de9580', octave: -12, release: 0.1, sustain: true },
  flute: { name: '플루트', color: '#4fc3c8', edge: '#1f7a7e', top: '#8ee3e6', octave: 12, release: 0.07, sustain: true },
  trumpet: { name: '트럼펫', color: '#f2c335', edge: '#9a7612', top: '#fde27f', octave: 0, release: 0.07, sustain: true },
  synth: { name: '신스', color: '#a35ee0', edge: '#5e2b91', top: '#c99bf3', octave: 0, release: 0.08, sustain: true },
};

// 피아노 파트를 고른 악기로 바꾼 정보 (id 는 'piano' 그대로 두어 배치 코드가 건반형으로 다룬다)
export function melodicInst(timbre = 'piano') {
  const m = MELODIC[timbre] ?? MELODIC.piano;
  return { ...INSTRUMENTS.piano, name: m.name, color: m.color, edge: m.edge, top: m.top, timbre: MELODIC[timbre] ? timbre : 'piano' };
}

const BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
const SOLFEGE = ['도', '', '레', '', '미', '파', '', '솔', '', '라', '', '시'];

export const isBlack = (pitch) => BLACK[pitch % 12];
export const solfege = (pitch) => SOLFEGE[pitch % 12];

// 반음 단위 피아노 건반
export function pianoRows(topPitch, count) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const pitch = topPitch - i;
    rows.push({ key: pitch, black: isBlack(pitch) });
  }
  return rows;
}

// 보컬: 도레미(다장조 음계)만, 음역 위아래로 한 음씩 여유
export function vocalRows(lo, hi, min = 10) {
  const scale = [];
  for (let p = lo - 12; p <= hi + 12; p++) if (SOLFEGE[p % 12]) scale.push(p);
  let a = scale.indexOf(lo) - 1;
  let b = scale.indexOf(hi) + 1;
  while (b - a + 1 < min) {
    if ((b - a) % 2 === 0) b++;
    else a--;
  }
  const rows = [];
  for (let i = b; i >= a; i--) rows.push({ key: scale[i], label: SOLFEGE[scale[i] % 12] });
  return rows;
}

export function drumRows() {
  return DRUM_ROWS.map((d) => ({ ...d }));
}
