'use strict';
/* 코인 시세 엔진: 시장 국면 + 상관관계 + 평균회귀 + 뉴스 충격 + 시장 충격(슬리피지) */

const MR_K = 0.0006;       // 평균회귀 강도(틱당): 뉴스·국면으로 벌어진 가격이 장기 추세선으로 돌아온다
const MKT_SIG = 0.035 / SQRT_TPD;

const Market = {
  coinState(def) {
    return {
      p: def.p, anchor: Math.log(def.p), k: { 5: [], 20: [], 120: [] }, shocks: [],
      vm: 1, r: 0, ath: def.p, atl: def.p, warn: 0, ns: 0, tape: [],
    };
  },

  init(S) {
    for (const def of COINS) S.coins[def.sym] = this.coinState(def);
    // 30일치 과거 시세를 미리 만들어 차트가 비어 있지 않게 한다
    const saved = S.regime;
    for (let i = 0; i < TPD * 30; i++) {
      if (--S.regime.left <= 0) this.newRegime(S, true);
      this.step(S, i + 1);
    }
    S.regime = saved;
    S.regime.left = randi(150, 300);
    for (const def of COINS) this.rescale(S, def.sym, def.p);
  },

  /* 저장 데이터에 새 코인이 추가된 경우 과거 시세 생성 */
  seedHistory(S, sym) {
    const c = S.coins[sym];
    const def = COIN[sym];
    for (let i = 0; i < TPD * 10; i++) this.stepCoin(S, def, c, gauss(), REGIMES.side, S.t - TPD * 10 + i + 1);
    this.rescale(S, sym, def.p);
  },

  rescale(S, sym, target) {
    const c = S.coins[sym];
    const f = target / c.p;
    for (const tf of TFS) for (const k of c.k[tf]) { k[0] *= f; k[1] *= f; k[2] *= f; k[3] *= f; }
    c.p = target;
    c.anchor = Math.log(target);
    c.ath = Math.max(...c.k[120].map(k => k[1]), target);
    c.atl = Math.min(...c.k[120].map(k => k[2]), target);
    c.shocks = [];
  },

  newRegime(S, silent) {
    const cur = S.regime.type;
    let w = { side: 3, bull: 2.2, bear: 2, mania: 0.2, crash: 0.2 };
    if (cur === 'bull') { w.mania = 0.8; w.bear = 1.3; }
    if (cur === 'bear') { w.crash = 0.7; w.bull = 1.5; }
    if (cur === 'mania') w = { side: 1, bull: 1, bear: 2.5, mania: 0, crash: 1.2 };
    if (cur === 'crash') w = { side: 2, bull: 1.5, bear: 2, mania: 0, crash: 0 };
    if (S.fg > 75) { w.bear += 1; w.crash += 0.3; }
    if (S.fg < 25) w.bull += 1;
    // 추세선보다 많이 올라 있으면 하락장이, 많이 내려 있으면 상승장이 오기 쉽다
    const dev = this.dev(S);
    w.bull *= Math.exp(-dev * 2); w.mania *= Math.exp(-dev * 3);
    w.bear *= Math.exp(dev * 2); w.crash *= Math.exp(dev * 3);
    const type = pickW(Object.keys(w).map(k => ({ k, w: w[k] }))).k;
    this.setRegime(S, type, silent);
  },

  setRegime(S, type, silent) {
    const R = REGIMES[type];
    S.regime = { type, left: randi(R.len[0], R.len[1]) };
    if (!silent && (type === 'mania' || type === 'crash' || chance(0.5))) News.regimeNews(S, type);
  },

  tick(S) {
    if (--S.regime.left <= 0) this.newRegime(S, false);
    this.step(S, S.t);
    // 김치 프리미엄 · 환율
    S.kp += (0.02 - S.kp) * 0.01 + gauss() * 0.0008 + (S.fg - 50) * 0.000004;
    S.kp = clamp(S.kp, -0.05, 0.22);
    S.fx += (1385 - S.fx) * 0.002 + gauss() * 0.6;
    // 공포·탐욕 지수
    let ret = 0, wsum = 0;
    for (const def of COINS) {
      const st = this.stats24(S, def.sym);
      const w = def.tags.includes('major') ? 3 : 1;
      ret += st.chg * w; wsum += w;
    }
    ret /= wsum;
    const regBias = { side: 0, bull: 8, bear: -8, mania: 22, crash: -25 }[S.regime.type];
    S.sent = clamp(S.sent, -40, 40) * 0.992;
    const raw = clamp(50 + ret * 300 + S.sent * 0.6 + regBias, 0, 100);
    S.fg += (raw - S.fg) * 0.04;
  },

  step(S, t) {
    const R = REGIMES[S.regime.type];
    const zM = gauss();
    S.mkt = MKT_SIG * zM * R.vm + R.drift;
    for (const def of COINS) this.stepCoin(S, def, S.coins[def.sym], zM, R, t);
  },

  stepCoin(S, def, c, zM, R, t) {
    const sig = def.vol / SQRT_TPD * c.vm * R.vm;
    let r = sig * (def.rho * zM + Math.sqrt(1 - def.rho * def.rho) * gauss());
    r += R.drift * def.rho * Math.pow(def.vol / 0.045, 0.7);
    r += def.trend / TPD;
    c.anchor += def.trend / TPD;
    r += MR_K * (c.anchor - Math.log(c.p));
    let sh = 0;
    for (let i = c.shocks.length - 1; i >= 0; i--) {
      const s = c.shocks[i];
      if (s.d > 0) { s.d--; continue; }
      const a = s.a * s.r;
      sh += a;
      s.a -= a;
      if (Math.abs(s.a) < 2e-5) c.shocks.splice(i, 1);
    }
    r += sh;
    r = clamp(r, -0.4, 0.4);
    c.vm += (1 - c.vm) * 0.02;
    c.ns *= 0.96;
    c.p = Math.max(c.p * Math.exp(r), def.p * 2e-4);
    c.r = r;
    const hi = c.p * (1 + Math.random() * sig * 0.6);
    const lo = c.p * (1 - Math.random() * sig * 0.6);
    const v = def.dv / TPD * (0.55 + Math.random() * 0.9) * (1 + Math.abs(r) / (sig || 1e-9) * 0.5) * (0.7 + S.fg / 100 * 0.6) * c.vm;
    this.pushCandle(c, c.p, hi, lo, v, t);
    if (c.p > c.ath) c.ath = c.p;
    if (c.p < c.atl) c.atl = c.p;
  },

  pushCandle(c, p, hi, lo, v, t) {
    for (const tf of TFS) {
      const arr = c.k[tf];
      // 캔들 하나는 (t-1)/tf 구간을 맡는다: t % tf === 1 일 때 새 캔들 시작
      if (arr.length === 0 || t % tf === 1) {
        const o = arr.length ? arr[arr.length - 1][3] : p;
        arr.push([o, Math.max(o, hi, p), Math.min(o, lo, p), p, v]);
        if (arr.length > MAX_CANDLES) arr.shift();
      } else {
        const k = arr[arr.length - 1];
        if (hi > k[1]) k[1] = hi;
        if (lo < k[2]) k[2] = lo;
        k[3] = p;
        k[4] += v;
      }
    }
  },

  /** 체결·뉴스로 가격을 즉시 움직인다(로그 변화량) */
  nudge(S, sym, lr) {
    const c = S.coins[sym];
    c.p = Math.max(c.p * Math.exp(lr), COIN[sym].p * 2e-4);
    for (const tf of TFS) {
      const k = c.k[tf][c.k[tf].length - 1];
      if (!k) continue;
      if (c.p > k[1]) k[1] = c.p;
      if (c.p < k[2]) k[2] = c.p;
      k[3] = c.p;
    }
    if (c.p > c.ath) c.ath = c.p;
    if (c.p < c.atl) c.atl = c.p;
  },

  /** 앞으로 반영될 예정인 뉴스 충격 + 국면 드리프트 (숙련 매니저·애널리스트만 일부 읽을 수 있음) */
  pending(S, sym) {
    const c = S.coins[sym];
    const def = COIN[sym];
    let p = 0;
    for (const s of c.shocks) {
      if (s.d <= 6) p += s.a;
    }
    p += REGIMES[S.regime.type].drift * def.rho * 25;
    p += MR_K * (c.anchor - Math.log(c.p)) * 25;
    return p;
  },

  /** 메이저 코인이 장기 추세선에서 얼마나 벗어나 있는지(로그) */
  dev(S) {
    const b = S.coins.BTC, e = S.coins.ETH;
    return (Math.log(b.p) - b.anchor + Math.log(e.p) - e.anchor) / 2;
  },

  stats24(S, sym) {
    const c = S.coins[sym];
    if (c._s24 && c._s24.t === S.t && c._s24.p === c.p) return c._s24;
    const k = c.k[5];
    const n = Math.min(24, k.length);
    let hi = c.p, lo = c.p, vol = 0;
    for (let i = k.length - n; i < k.length; i++) {
      if (k[i][1] > hi) hi = k[i][1];
      if (k[i][2] < lo) lo = k[i][2];
      vol += k[i][4];
    }
    const open = n ? k[k.length - n][0] : c.p;
    const st = { t: S.t, p: c.p, open, hi, lo, vol, chg: c.p / open - 1 };
    Object.defineProperty(c, '_s24', { value: st, writable: true, enumerable: false, configurable: true });
    return st;
  },

  usd(S, sym) {
    return S.coins[sym].p / (1 + S.kp) / S.fx;
  },

  /** 호가창(시뮬레이션). 실제 체결 엔진은 유동성 기반 슬리피지로 처리한다 */
  orderbook(S, sym, levels = 10) {
    const def = COIN[sym];
    const c = S.coins[sym];
    const ts = tickSize(c.p);
    let ask = Math.ceil(c.p / ts) * ts;
    let bid = Math.floor(c.p / ts) * ts;
    if (ask <= bid) ask = bid + ts;
    const base = def.liq / 400 / c.p;
    const hash = (i, side) => {
      const x = Math.sin((S.t * 0.37 + i * 12.9898 + side * 78.233) * 43758.5453);
      return x - Math.floor(x);
    };
    const asks = [], bids = [];
    for (let i = 0; i < levels; i++) {
      asks.push({ p: ask + i * ts, q: base * (0.15 + hash(i, 1) * 1.3) * (1 + i * 0.12) });
      bids.push({ p: bid - i * ts, q: base * (0.15 + hash(i, 2) * 1.3) * (1 + i * 0.12) });
    }
    return { asks, bids, ts };
  },

  /** 체결 내역(연출용) */
  tapeTick(S, sym) {
    const c = S.coins[sym];
    const def = COIN[sym];
    const n = randi(1, 3);
    for (let i = 0; i < n; i++) {
      const side = c.r > 0 ? (chance(0.65) ? 'buy' : 'sell') : (chance(0.65) ? 'sell' : 'buy');
      const q = def.dv / TPD / c.p * Math.exp(gauss() * 1.1) * 0.004;
      c.tape.unshift({ p: roundTick(c.p * (1 + gauss() * 0.0004)), q, side, t: S.t });
    }
    if (c.tape.length > 24) c.tape.length = 24;
  },

  mcap(S, sym) {
    return S.coins[sym].p * COIN[sym].sup;
  },
};
