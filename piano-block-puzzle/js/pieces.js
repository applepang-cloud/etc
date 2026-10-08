// 하단에 주어지는 블록 3개를 만든다.

export const PALETTE = ['#f6c344', '#a35ee0', '#3cc1f0', '#f2604f', '#f39233', '#4d7cf0', '#ef5fae', '#7fd34a'];

// 블록 블라스트식 랜덤 모양. [가중치, 칸 목록([행, 열])]
// 노트는 가로로 긴 막대라 가로 모양을 더 자주 낸다.
const LIB = [
  [1, [[0, 0]]],
  [9, [[0, 0], [0, 1]]],
  [8, [[0, 0], [0, 1], [0, 2]]],
  [6, [[0, 0], [0, 1], [0, 2], [0, 3]]],
  [2, [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]],
  [4, [[0, 0], [1, 0]]],
  [2, [[0, 0], [1, 0], [2, 0]]],
  [3, [[0, 0], [0, 1], [1, 0], [1, 1]]],
  [2, [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]]],
  [1, [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]]],
  [2, [[0, 0], [1, 0], [1, 1]]],
  [2, [[0, 1], [1, 0], [1, 1]]],
  [2, [[0, 0], [0, 1], [1, 0]]],
  [2, [[0, 0], [0, 1], [1, 1]]],
  [2, [[0, 0], [1, 0], [1, 1], [1, 2]]],
  [2, [[0, 2], [1, 0], [1, 1], [1, 2]]],
  [1, [[0, 0], [0, 1], [0, 2], [1, 1]]],
  [1, [[0, 1], [0, 2], [1, 0], [1, 1]]],
  [1, [[0, 0], [0, 1], [1, 1], [1, 2]]],
];
const TOTAL = LIB.reduce((sum, [w]) => sum + w, 0);
const MAX_RUN = 4;

export function makePiece(cells, color) {
  let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
  for (const [r, c] of cells) {
    minR = Math.min(minR, r);
    minC = Math.min(minC, c);
    maxR = Math.max(maxR, r);
    maxC = Math.max(maxC, c);
  }
  return {
    cells: cells.map(([r, c]) => [r - minR, c - minC]),
    h: maxR - minR + 1,
    w: maxC - minC + 1,
    color,
  };
}

function randomShape() {
  let x = Math.random() * TOTAL;
  for (const [w, cells] of LIB) {
    if ((x -= w) < 0) return cells;
  }
  return LIB[1][1];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 아직 덮이지 않은 노트 칸([행, 열] 목록)에서 딱 맞는 모양을 찾는다.
// 이어진 칸 덩어리가 작으면 그대로, 크면 가로 막대 단위로 자른다.
export function fitShapes(green) {
  const cells = new Map();
  for (const [r, c] of green) cells.set(c * 128 + r, [r, c]);

  const seen = new Set();
  const out = [];
  for (const start of cells.keys()) {
    if (seen.has(start)) continue;
    const comp = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const k = stack.pop();
      comp.push(cells.get(k));
      for (const nk of [k + 1, k - 1, k + 128, k - 128]) {
        if (cells.has(nk) && !seen.has(nk)) {
          seen.add(nk);
          stack.push(nk);
        }
      }
    }

    const rs = comp.map((x) => x[0]);
    const cs = comp.map((x) => x[1]);
    const h = Math.max(...rs) - Math.min(...rs) + 1;
    const w = Math.max(...cs) - Math.min(...cs) + 1;
    if (comp.length <= 5 && h <= 3 && w <= 5) {
      out.push({ cells: comp, col: Math.min(...cs) });
      continue;
    }

    const byRow = new Map();
    for (const [r, c] of comp) {
      if (!byRow.has(r)) byRow.set(r, []);
      byRow.get(r).push(c);
    }
    for (const [r, list] of byRow) {
      list.sort((a, b) => a - b);
      let runStart = 0;
      for (let i = 1; i <= list.length; i++) {
        if (i < list.length && list[i] === list[i - 1] + 1) continue;
        for (let j = runStart; j < i; j += MAX_RUN) {
          const chunk = list.slice(j, Math.min(i, j + MAX_RUN));
          out.push({ cells: chunk.map((c) => [r, c]), col: chunk[0] });
        }
        runStart = i;
      }
    }
  }
  return out.sort((a, b) => a.col - b.col);
}

// 3개 중 최대 2개는 다가오는 노트에 딱 맞는 모양, 나머지는 랜덤.
export function makeTray(green) {
  const fits = fitShapes(green);
  const shapes = [];
  if (fits.length > 0) shapes.push(fits[0].cells);
  if (fits.length > 1) {
    const i = 1 + Math.floor(Math.random() * Math.min(3, fits.length - 1));
    shapes.push(fits[i].cells);
  }
  while (shapes.length < 3) shapes.push(randomShape());
  shuffle(shapes);
  const colors = shuffle(PALETTE.slice());
  return shapes.map((cells, i) => makePiece(cells, colors[i]));
}
