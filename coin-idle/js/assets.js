'use strict';
/* 채굴 · 주식 · 부동산 · 사업 · 스타트업 투자 · 총자산 계산 */

const Mining = {
  hash(S) {
    let h = 0;
    for (const r of RIGS) h += (S.rigs[r.id] || 0) * r.h;
    return h;
  },
  elec(S) {
    let e = 0;
    for (const r of RIGS) e += (S.rigs[r.id] || 0) * r.e;
    return e * S.elecMult * (1 - Life.taxCut(S));
  },
  coinMult(S, sym) {
    return MINE_MULT[sym] * (sym === 'BTC' ? Math.pow(0.5, S.halvings) : 1);
  },
  /** 틱당 채굴 가치(원) */
  yieldKRW(S, sym = S.mineCoin) {
    return this.hash(S) * HASH_YIELD / S.diff * this.coinMult(S, sym) * Life.happyMult(S);
  },
  rigCost(S, id) {
    const r = RIGS.find(x => x.id === id);
    return Math.round(r.cost * Math.pow(1.13, S.rigs[id] || 0));
  },
  buyRig(S, id) {
    const cost = this.rigCost(S, id);
    if (S.cash < cost) fail('현금이 부족합니다.');
    S.cash -= cost;
    S.rigs[id] = (S.rigs[id] || 0) + 1;
  },
  tapValue(S) {
    return Math.round(3000 * Math.pow(1.45, S.tapLv - 1));
  },
  tapUpCost(S) {
    return Math.round(40000 * Math.pow(1.75, S.tapLv - 1));
  },
  tapUp(S) {
    const cost = this.tapUpCost(S);
    if (S.cash < cost) fail('현금이 부족합니다.');
    S.cash -= cost;
    S.tapLv++;
  },
  tap(S) {
    const krw = this.tapValue(S);
    const sym = S.mineCoin;
    const q = krw / S.coins[sym].p;
    holdAdd(S, sym, q, krw);
    S.mineQty[sym] = (S.mineQty[sym] || 0) + q;
    S.stats.taps++;
    S.stats.mined += krw;
    return { q, krw, sym };
  },
  tick(S) {
    if (S.t % TPD === 0) S.diff *= 1.004;
    const h = this.hash(S);
    if (!h) return;
    const e = this.elec(S);
    if (S.cash < e) { S.minePaused = true; return; }
    S.minePaused = false;
    S.cash -= e;
    const krw = this.yieldKRW(S);
    const sym = S.mineCoin;
    const q = krw / S.coins[sym].p;
    holdAdd(S, sym, q, krw);
    S.mineQty[sym] = (S.mineQty[sym] || 0) + q;
    S.stats.mined += krw;
  },
};

const Stocks = {
  init(S) {
    for (const def of STOCKS) S.stocks[def.sym] = { p: def.p, hist: [], anchor: Math.log(def.p) };
    for (let i = 0; i < 600; i++) this.step(S, i + 1);
    for (const def of STOCKS) {
      const s = S.stocks[def.sym];
      const f = def.p / s.p;
      s.hist = s.hist.map(x => x * f);
      s.p = def.p;
      s.anchor = Math.log(def.p);
    }
    for (const m of ['KR', 'US']) {
      const f = 100 / S.idx[m];
      S.idxHist[m] = S.idxHist[m].map(x => x * f);
      S.idx[m] = 100;
    }
  },
  step(S, t) {
    const rI = {};
    for (const m of ['KR', 'US']) {
      const sh = S.idxShock[m] * 0.04;
      S.idxShock[m] -= sh;
      const rate = m === 'KR' ? S.rateKR : S.rateUS;
      rI[m] = 0.012 / SQRT_TPD * gauss() + 0.0006 / TPD - (rate - 3) * 0.0004 / TPD + sh;
      S.idx[m] *= Math.exp(rI[m]);
      if (t % 5 === 0) { S.idxHist[m].push(S.idx[m]); if (S.idxHist[m].length > 120) S.idxHist[m].shift(); }
    }
    for (const def of STOCKS) {
      const s = S.stocks[def.sym];
      s.anchor += def.trend / TPD;
      let r = def.beta * rI[def.mkt] + def.vol / SQRT_TPD * gauss() * 0.85 + def.trend / TPD + 0.0004 * (s.anchor - Math.log(s.p));
      if (def.crypto) r += def.crypto * S.mkt;
      s.p *= Math.exp(r);
      if (t % 5 === 0) { s.hist.push(s.p); if (s.hist.length > 120) s.hist.shift(); }
    }
  },
  chg(S, sym) {
    const s = S.stocks[sym];
    const ref = s.hist.length >= 24 ? s.hist[s.hist.length - 24] : s.hist[0] || s.p;
    return s.p / ref - 1;
  },
  idxChg(S, m) {
    const h = S.idxHist[m];
    const ref = h.length >= 24 ? h[h.length - 24] : h[0] || S.idx[m];
    return S.idx[m] / ref - 1;
  },
  buy(S, sym, q) {
    q = Math.floor(q);
    const p = S.stocks[sym].p;
    const cost = q * p * 1.00015;
    if (q < 1) fail('1주 이상 입력하세요.');
    if (cost > S.cash) fail('현금이 부족합니다.');
    S.cash -= cost;
    const h = S.sHold[sym] || (S.sHold[sym] = { q: 0, cost: 0 });
    h.q += q;
    h.cost += cost;
    addLog(S, { kind: 'stock', sym, side: 'buy', q, p, krw: cost, who: '나' });
  },
  sell(S, sym, q) {
    const h = S.sHold[sym];
    if (!h || h.q < 1) fail('보유 주식이 없습니다.');
    q = Math.min(Math.floor(q), h.q);
    const p = S.stocks[sym].p;
    const krw = q * p * (1 - 0.002);
    const cost = h.cost * (q / h.q);
    h.q -= q;
    h.cost -= cost;
    if (h.q <= 0) delete S.sHold[sym];
    S.cash += krw;
    Trade.recordPnl(S, krw - cost);
    addLog(S, { kind: 'stock', sym, side: 'sell', q, p, krw, pnl: krw - cost, who: '나' });
  },
  divMult(S) {
    const lv = Life.contactLv(S, 'banker');
    return lv >= 3 ? 1.25 : lv >= 1 ? 1.1 : 1;
  },
  tick(S) {
    this.step(S, S.t);
    if (S.t % (TPD * 7) === 0) {
      let total = 0;
      for (const sym in S.sHold) total += S.sHold[sym].q * S.stocks[sym].p * STOCK[sym].div;
      total *= this.divMult(S);
      if (total > 0) {
        S.cash += total;
        S.stats.divs += total;
        Game.emit('dividend', total);
      }
    }
  },
};

const Realty = {
  init(S) {
    for (let i = 0; i < 600; i++) {
      S.re *= Math.exp(0.003 / SQRT_TPD * gauss() + 0.0015 / TPD);
      if (i % 5 === 0) S.reHist.push(S.re);
    }
    const f = 100 / S.re;
    S.reHist = S.reHist.map(x => x * f);
    S.re = 100;
  },
  value(S, id) {
    const d = PROPS.find(x => x.id === id);
    return d.p * Math.pow(S.re / 100, d.beta);
  },
  taxRate(S) {
    const lv = Life.contactLv(S, 'realtor');
    return lv >= 3 ? 0.015 : lv >= 1 ? 0.03 : 0.04;
  },
  rentMult(S) {
    const lv = Life.contactLv(S, 'realtor');
    return (lv >= 3 ? 1.2 : lv >= 2 ? 1.1 : 1) * Life.happyMult(S);
  },
  buyCost(S, id) {
    return this.value(S, id) * (1 + this.taxRate(S));
  },
  sellValue(S, id) {
    return this.value(S, id) * 0.97;
  },
  rentPerDay(S, id) {
    const d = PROPS.find(x => x.id === id);
    return this.value(S, id) * d.rent * this.rentMult(S);
  },
  totalRentPerDay(S) {
    let r = 0;
    for (const d of PROPS) r += (S.props[d.id] || 0) * this.rentPerDay(S, d.id);
    return r;
  },
  buy(S, id) {
    const cost = this.buyCost(S, id);
    if (S.cash < cost) fail('현금이 부족합니다.');
    S.cash -= cost;
    S.props[id] = (S.props[id] || 0) + 1;
    addLog(S, { kind: 'realty', sym: id, side: 'buy', q: 1, p: cost, krw: cost, who: '나' });
  },
  sell(S, id) {
    if (!S.props[id]) fail('보유한 매물이 없습니다.');
    const v = this.sellValue(S, id);
    S.props[id]--;
    S.cash += v;
    addLog(S, { kind: 'realty', sym: id, side: 'sell', q: 1, p: v, krw: v, who: '나' });
  },
  chg(S) {
    const h = S.reHist;
    const ref = h.length >= 24 ? h[h.length - 24] : h[0] || S.re;
    return S.re / ref - 1;
  },
  tick(S) {
    const sh = S.reShock * 0.03;
    S.reShock -= sh;
    S.re *= Math.exp(0.0015 / TPD - (S.rateKR - 2.5) * 0.0006 / TPD + 0.003 / SQRT_TPD * gauss() + sh);
    if (S.t % 5 === 0) { S.reHist.push(S.re); if (S.reHist.length > 120) S.reHist.shift(); }
    const rent = this.totalRentPerDay(S) / TPD;
    S.cash += rent;
    S.stats.rent += rent;
  },
};

const Biz = {
  def(id) {
    return BIZ.find(b => b.id === id);
  },
  mult(lv) {
    let m = 1;
    for (const [at, x] of BIZ_MILESTONES) if (lv >= at) m *= x;
    return m;
  },
  nextMilestone(lv) {
    for (const [at, x] of BIZ_MILESTONES) if (lv < at) return { at, x };
    return null;
  },
  income(S, id) {
    const d = this.def(id);
    const lv = S.biz[id] || 0;
    let inc = d.inc * lv * this.mult(lv);
    if (id === 'exchange') inc *= 0.6 + S.fg / 125;
    return inc * Life.happyMult(S);
  },
  totalIncome(S) {
    let t = 0;
    for (const d of BIZ) t += this.income(S, d.id);
    return t;
  },
  cost(S, id, n) {
    const d = this.def(id);
    const lv = S.biz[id] || 0;
    return d.base * Math.pow(d.mult, lv) * (Math.pow(d.mult, n) - 1) / (d.mult - 1);
  },
  maxN(S, id) {
    const d = this.def(id);
    const lv = S.biz[id] || 0;
    const a = d.base * Math.pow(d.mult, lv);
    const n = Math.floor(Math.log(S.cash * (d.mult - 1) / a + 1) / Math.log(d.mult));
    return Math.max(0, n);
  },
  buy(S, id, n) {
    if (n === 'max') n = this.maxN(S, id);
    if (n < 1) fail('현금이 부족합니다.');
    const cost = this.cost(S, id, n);
    if (S.cash < cost) fail('현금이 부족합니다.');
    S.cash -= cost;
    const before = S.biz[id] || 0;
    S.biz[id] = before + n;
    const ms = BIZ_MILESTONES.find(([at]) => before < at && S.biz[id] >= at);
    return { n, cost, milestone: ms };
  },
  tick(S) {
    const inc = this.totalIncome(S);
    S.cash += inc;
    S.stats.bizIncome += inc;
  },
};

const Startup = {
  genOffers(S) {
    const nw = Math.max(Wealth.net(S), 1e6);
    const min = Math.max(1e6, Math.round(nw * 0.01 / 1e5) * 1e5);
    const max = Math.max(min * 5, Math.round(nw * 0.2 / 1e5) * 1e5);
    const offers = [];
    for (let i = 0; i < 3; i++) {
      const stage = pickW([{ k: 'seed', w: 4 }, { k: 'a', w: 3.5 }, { k: 'b', w: 2.5 }]).k;
      offers.push(this.mkOffer(S, stage, min, max, false));
    }
    const vc = Life.contactLv(S, 'vc'), heir = Life.contactLv(S, 'heir');
    if ((vc >= 3 || heir >= 2) && chance(0.6)) offers.push(this.mkOffer(S, pick(['a', 'b']), min * 3, max * 2, true));
    S.offers = offers;
  },
  mkOffer(S, stage, min, max, priv) {
    const st = SU_STAGE[stage];
    return {
      id: uid(S), name: pick(SU_PRE) + pick(SU_SUF), sector: pick(SU_SECTOR), stage, min, max, priv,
      prob: st.prob + (priv ? 0.15 : 0), mult: priv ? [st.mult[0] * 1.3, st.mult[1] * 1.3] : st.mult.slice(),
      days: randi(st.days[0], st.days[1]),
    };
  },
  probBonus(S) {
    const lv = Life.contactLv(S, 'vc');
    return lv >= 2 ? 0.1 : lv >= 1 ? 0.05 : 0;
  },
  invest(S, offerId, amt) {
    const o = S.offers.find(x => x.id === offerId);
    if (!o) return;
    amt = Math.floor(amt);
    if (amt < o.min) fail(`최소 투자금은 ${won(o.min)}입니다.`);
    if (amt > o.max) fail(`최대 투자금은 ${won(o.max)}입니다.`);
    if (amt > S.cash) fail('현금이 부족합니다.');
    S.cash -= amt;
    S.offers = S.offers.filter(x => x !== o);
    S.startups.push({ id: uid(S), name: o.name, sector: o.sector, stage: o.stage, priv: o.priv, amt, t: S.t, until: S.t + o.days * TPD, prob: o.prob + this.probBonus(S), mult: o.mult });
    S.stats.invests++;
  },
  resolve(S, inv) {
    const r = Math.random();
    let m, outcome;
    if (r < inv.prob) {
      m = rand(inv.mult[0], inv.mult[1]) * (Life.contactLv(S, 'heir') >= 3 ? 1.2 : 1);
      outcome = pick(['IPO 성공', '대기업 인수(M&A)', '해외 기업 인수']);
    } else if (r < inv.prob + 0.25) {
      m = rand(0.3, 1.0);
      outcome = '헐값 매각';
    } else {
      m = 0;
      outcome = '폐업';
    }
    const payout = inv.amt * m;
    S.cash += payout;
    S.stats.bestExit = Math.max(S.stats.bestExit, m);
    Trade.recordPnl(S, payout - inv.amt);
    addLog(S, { kind: 'startup', sym: inv.name, side: 'sell', q: 1, p: payout, krw: payout, pnl: payout - inv.amt, who: outcome });
    Game.emit('startup', { inv, m, payout, outcome });
  },
  tick(S) {
    if (S.t >= S.offersNext) {
      this.genOffers(S);
      S.offersNext = S.t + TPD * 3;
    }
    for (const inv of S.startups.slice()) {
      if (S.t >= inv.until) {
        S.startups = S.startups.filter(x => x !== inv);
        this.resolve(S, inv);
      }
    }
  },
};

const Wealth = {
  breakdown(S) {
    if (S._bd && S._bd.t === S.t && S._bd.cash === S.cash) return S._bd;
    let coin = 0;
    for (const sym in S.hold) coin += S.hold[sym].q * S.coins[sym].p;
    for (const sym in S.staked) coin += S.staked[sym].q * S.coins[sym].p;
    let cash = S.cash;
    for (const o of S.orders) {
      if (o.side === 'buy') cash += o.lock;
      else coin += o.q * S.coins[o.sym].p;
    }
    let fut = 0;
    for (const f of S.futures) fut += Math.max(0, f.margin + Trade.futPnl(S, f));
    let mgr = 0;
    for (const m of S.managers) mgr += Mgr.value(S, m);
    let stock = 0;
    for (const sym in S.sHold) stock += S.sHold[sym].q * S.stocks[sym].p;
    let realty = 0;
    for (const d of PROPS) realty += (S.props[d.id] || 0) * Realty.sellValue(S, d.id);
    let biz = 0;
    for (const d of BIZ) {
      const lv = S.biz[d.id] || 0;
      biz += d.inc * lv * Biz.mult(lv) * 600;
    }
    let su = 0;
    for (const s of S.startups) su += s.amt;
    let car = 0;
    for (const id in S.life.cars) car += Life.carValue(S, id);
    const parts = { cash, coin, fut, mgr, stock, realty, biz, su, car };
    const total = Object.values(parts).reduce((a, b) => a + b, 0);
    const bd = { t: S.t, cash: S.cash, parts, total };
    Object.defineProperty(S, '_bd', { value: bd, writable: true, enumerable: false, configurable: true });
    return bd;
  },
  net(S) {
    return this.breakdown(S).total;
  },
  /** 초당(틱당) 고정 수입: 사업 + 임대 + 채굴(전기료 차감) */
  perTick(S) {
    const mine = Mining.hash(S) && !S.minePaused ? Mining.yieldKRW(S) - Mining.elec(S) : 0;
    return Biz.totalIncome(S) + Realty.totalRentPerDay(S) / TPD + mine;
  },
};

const PART_LABEL = { cash: '현금', coin: '코인', fut: '선물', mgr: '매니저 운용', stock: '주식', realty: '부동산', biz: '사업', su: '스타트업', car: '자동차' };
