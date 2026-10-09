'use strict';
/* 게임 상태 생성 · 저장 · 불러오기 */

const SAVE_KEY = 'coin-idle-save-v1';
const OFFLINE_CAP = 8 * 3600; // 오프라인 진행 최대 8시간(틱)

function newState() {
  const S = {
    v: 1, t: 0, cash: 1000000, created: Date.now(), lastSave: Date.now(), nextId: 1,
    regime: { type: 'side', left: 200 }, mkt: 0, kp: 0.022, fx: 1385, rateKR: 2.75, rateUS: 4.25, fg: 50, sent: 0,
    coins: {}, hold: {}, staked: {}, stakeEarned: {}, orders: [], rules: {}, futures: [],
    rigs: {}, mineCoin: 'BTC', tapLv: 1, halvings: 0, diff: 1, elecMult: 1, mineQty: {},
    managers: [], cands: [], candNext: 0, hhFree: -1,
    stocks: {}, sHold: {}, idx: { KR: 100, US: 100 }, idxHist: { KR: [], US: [] }, idxShock: { KR: 0, US: 0 },
    re: 100, reHist: [], reShock: 0, props: {}, biz: {}, startups: [], offers: [], offersNext: 0,
    news: [], etfDone: [], nextNews: 6, nextYT: 14, sched: { fomc: TPD * 6, bok: TPD * 10, halving: TPD * 45 }, pend: [], tips: [], tipNext: TPD * 2,
    log: [], nwHist: [],
    stats: { taps: 0, buys: 0, sells: 0, wins: 0, losses: 0, realized: 0, hires: 0, liqs: 0, bestRoe: 0, divs: 0, bestExit: 0, rugged: 0, gfs: 0, spent: 0, peak: 0, volume: 0, mined: 0, fees: 0, rent: 0, bizIncome: 0, invests: 0 },
    ach: {},
    life: { cars: {}, items: {}, happy: 55, famePerm: 0, gf: null, married: false, exes: 0, contacts: {}, cand: null, lastDate: -999 },
    settings: { sfx: 0.6, bgm: 0.35, sfxOn: true, bgmOn: false, colors: 'kr' },
    ui: { sel: 'BTC', fav: ['BTC', 'ETH'], tf: 5, tab: 'ex', filter: 'all', search: '', newsFilter: 'all', otab: 'buy', btab: 'orders', limSide: 'buy', futSide: 'long', bizQty: 1, stockQty: 1, ind: { ma: true, bb: false, vol: true, rsi: true } },
  };
  Market.init(S);
  Stocks.init(S);
  Realty.init(S);
  Mgr.refreshCands(S);
  Startup.genOffers(S);
  S.offersNext = TPD * 3;
  return S;
}

/* 저장: 캔들은 유효숫자 7자리로 줄여 용량을 아낀다 */
function serialize(S) {
  const coins = {};
  for (const sym in S.coins) {
    const c = S.coins[sym];
    const k = {};
    for (const tf of TFS) k[tf] = c.k[tf].map(a => a.map(x => +x.toPrecision(7)));
    coins[sym] = { ...c, k, tape: undefined };
  }
  return JSON.stringify({ ...S, coins, _nw: undefined, _bd: undefined });
}

function saveGame(S) {
  try {
    S.lastSave = Date.now();
    localStorage.setItem(SAVE_KEY, serialize(S));
    return true;
  } catch (e) {
    return false;
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return reviveState(JSON.parse(raw));
  } catch (e) {
    return null;
  }
}

/** 저장 데이터에 빠진 필드를 기본값으로 채운다 (버전 업 대비) */
function reviveState(data) {
  if (!data || data.v !== 1) return null;
  const base = newStateShell();
  const S = deepMerge(base, data);
  for (const def of COINS) {
    if (!S.coins[def.sym]) {
      S.coins[def.sym] = Market.coinState(def);
      Market.seedHistory(S, def.sym);
    }
    S.coins[def.sym].tape = [];
  }
  for (const def of STOCKS) if (!S.stocks[def.sym]) S.stocks[def.sym] = { p: def.p, hist: [], anchor: Math.log(def.p) };
  return S;
}

/* newState와 같은 모양이지만 시세 초기화 없이 빈 껍데기 */
function newStateShell() {
  const keep = { Market: Market.init, Stocks: Stocks.init, Realty: Realty.init, Mgr: Mgr.refreshCands, Su: Startup.genOffers };
  Market.init = Stocks.init = Realty.init = Mgr.refreshCands = Startup.genOffers = () => {};
  let S;
  try {
    S = newState();
  } finally {
    Market.init = keep.Market;
    Stocks.init = keep.Stocks;
    Realty.init = keep.Realty;
    Mgr.refreshCands = keep.Mgr;
    Startup.genOffers = keep.Su;
  }
  return S;
}

function deepMerge(base, data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const out = (base && typeof base === 'object' && !Array.isArray(base)) ? { ...base } : {};
    for (const k in data) out[k] = deepMerge(base ? base[k] : undefined, data[k]);
    return out;
  }
  return data === undefined ? base : data;
}

function resetGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 저장소 차단 */ }
}

/* ---------- 보유 코인 헬퍼 ---------- */
function holdAdd(S, sym, q, cost) {
  const h = S.hold[sym] || (S.hold[sym] = { q: 0, cost: 0 });
  h.q += q;
  h.cost += cost;
}

function holdSub(S, sym, q) {
  const h = S.hold[sym];
  if (!h || h.q <= 0) return 0;
  if (q >= h.q * (1 - 1e-9)) {
    const cost = h.cost;
    delete S.hold[sym];
    return cost;
  }
  const cost = h.cost * (q / h.q);
  h.q -= q;
  h.cost -= cost;
  return cost;
}

function addLog(S, e) {
  e.t = S.t;
  S.log.unshift(e);
  if (S.log.length > 200) S.log.length = 200;
}
