'use strict';
/* 공용 유틸: 난수, 포맷(한국식 단위), 호가 단위, 게임 시간 */

const TPD = 120;                 // 하루(게임) = 120틱 = 실제 2분
const SQRT_TPD = Math.sqrt(TPD);
const TFS = [5, 20, 120];        // 캔들 단위(틱): 1시간 / 4시간 / 1일
const TF_LABEL = { 5: '1시간', 20: '4시간', 120: '1일' };
const MAX_CANDLES = 220;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;

function pickW(items, wf = it => it.w || 1) {
  let total = 0;
  for (const it of items) total += Math.max(0, wf(it));
  let r = Math.random() * total;
  for (const it of items) {
    r -= Math.max(0, wf(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

let _gSpare = null;
function gauss() {
  if (_gSpare !== null) { const s = _gSpare; _gSpare = null; return s; }
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const m = Math.sqrt(-2 * Math.log(u));
  _gSpare = m * Math.sin(2 * Math.PI * v);
  return m * Math.cos(2 * Math.PI * v);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
}

/* ---------- 숫자 포맷 ---------- */
const K_UNITS = [[1e24, '자'], [1e20, '해'], [1e16, '경'], [1e12, '조'], [1e8, '억'], [1e4, '만']];

function kUnit(a) {
  for (const [v, u] of K_UNITS) {
    if (a >= v) {
      const x = a / v;
      const s = x >= 1000 ? Math.round(x).toLocaleString('ko-KR') : x >= 100 ? x.toFixed(1) : x.toFixed(2);
      return s + u;
    }
  }
  return Math.round(a).toLocaleString('ko-KR');
}

/** ₩ 금액. 1억 미만은 전체 자릿수, 이상은 한국식 단위(억·조·경). short=true면 1만 이상부터 단위 사용 */
function won(n, short = false) {
  if (!isFinite(n)) n = 0;
  const neg = n < 0;
  const a = Math.abs(n);
  let s;
  if (a < (short ? 1e4 : 1e8)) s = Math.round(a).toLocaleString('ko-KR');
  else s = kUnit(a);
  return (neg ? '-' : '') + '₩' + s;
}

function signedWon(n, short = false) {
  return (n > 0 ? '+' : '') + won(n, short);
}

/** 업비트식 원화마켓 호가 단위 (게임용 근사) */
function tickSize(p) {
  if (p >= 2e6) return 1000;
  if (p >= 1e6) return 500;
  if (p >= 5e5) return 100;
  if (p >= 1e5) return 50;
  if (p >= 1e4) return 10;
  if (p >= 1e3) return 1;
  if (p >= 100) return 0.1;
  if (p >= 10) return 0.01;
  if (p >= 1) return 0.001;
  if (p >= 0.1) return 0.0001;
  if (p >= 0.01) return 0.00001;
  if (p >= 0.001) return 0.000001;
  if (p >= 0.0001) return 0.0000001;
  return 0.00000001;
}

function priceDecimals(p) {
  const t = tickSize(p);
  return t >= 1 ? 0 : Math.min(8, Math.round(-Math.log10(t)));
}

function roundTick(p) {
  const t = tickSize(p);
  const d = priceDecimals(p);
  return +(Math.round(p / t) * t).toFixed(d);
}

function fmtPrice(p) {
  if (!isFinite(p)) return '-';
  const d = priceDecimals(p);
  return p.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtQty(q) {
  if (!isFinite(q)) return '0';
  const a = Math.abs(q);
  let d = 8;
  if (a >= 1e6) d = 0;
  else if (a >= 1000) d = 2;
  else if (a >= 1) d = 4;
  let s = q.toLocaleString('ko-KR', { maximumFractionDigits: d });
  if (s === '-0') s = '0';
  return s;
}

function fmtPct(x, digits = 2) {
  if (!isFinite(x)) x = 0;
  const v = x * 100;
  return (v > 0.0049 ? '+' : '') + v.toFixed(digits) + '%';
}

function fmtNum(n) {
  if (n >= 1e8) return kUnit(n);
  return Math.round(n).toLocaleString('ko-KR');
}

function signCls(x) {
  if (x > 1e-9) return 'up';
  if (x < -1e-9) return 'down';
  return 'flat';
}

/* ---------- 게임 시간: 1틱 = 12분, 하루 = 120틱 ---------- */
function gameClock(t) {
  const day = Math.floor(t / TPD) + 1;
  const mins = (t % TPD) * 12;
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return { day, hh, mm, str: `D+${day} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}

function ticksToText(n) {
  if (n <= 0) return '곧';
  const days = Math.floor(n / TPD);
  const hours = Math.floor((n % TPD) / 5);
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간`;
  return `${Math.max(1, Math.round((n % 5) * 12))}분`;
}

function realDuration(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}시간 ${m}분`;
  if (m) return `${m}분 ${s}초`;
  return `${s}초`;
}

/* ---------- 지표 ---------- */
function sma(arr, n, end = arr.length) {
  if (end < n) return null;
  let s = 0;
  for (let i = end - n; i < end; i++) s += arr[i];
  return s / n;
}

function rsi(closes, n = 14) {
  if (closes.length < n + 1) return 50;
  let g = 0, l = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  if (l === 0) return 100;
  const rs = g / l;
  return 100 - 100 / (1 + rs);
}

function uid(S) {
  S.nextId = (S.nextId || 1) + 1;
  return S.nextId;
}

/* 링크: 실제 뉴스/영상 참고용 (새 탭) */
const REF = {
  newsKR: q => `https://news.google.com/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR%3Ako`,
  newsGL: q => `https://news.google.com/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US%3Aen`,
  yt: q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=CAI%253D`,
};
