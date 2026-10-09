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
