'use strict';
/* 코인 거래: 시장가 · 지정가 · 예약매도(익절/손절) · 선물(레버리지) · 스테이킹 */

const MIN_ORDER = 5000;
const FUT_FEE = 0.0004;
const FUT_MMR = 0.005;
const FUT_MAX_LEV = 25;

class GameError extends Error {}
const fail = msg => { throw new GameError(msg); };

const Trade = {
  feeRate(S) {
    const lv = Life.contactLv(S, 'exchange');
    return lv >= 2 ? 0.0002 : lv >= 1 ? 0.00035 : 0.0005;
  },

  /** 주문 금액이 유동성 대비 클수록 불리하게 체결된다 */
  impact(sym, krw) {
    return krw / COIN[sym].liq * 0.01;
  },

  execBuy(S, sym, krw) {
    const c = S.coins[sym];
    const imp = this.impact(sym, krw);
    const avg = c.p * (1 + imp / 2);
    const fee = krw * this.feeRate(S);
    const q = (krw - fee) / avg;
    Market.nudge(S, sym, imp * 0.5);
    S.stats.volume += krw;
    S.stats.fees += fee;
    return { q, avg, fee };
  },

  execSell(S, sym, q) {
    const c = S.coins[sym];
    const imp = this.impact(sym, q * c.p);
    const avg = c.p * (1 - imp / 2);
    const gross = q * avg;
    const fee = gross * this.feeRate(S);
    Market.nudge(S, sym, -imp * 0.5);
    S.stats.volume += gross;
    S.stats.fees += fee;
    return { krw: gross - fee, avg, fee };
  },

  quoteBuy(S, sym, krw) {
    const c = S.coins[sym];
    const imp = this.impact(sym, krw);
    const avg = c.p * (1 + imp / 2);
    const fee = krw * this.feeRate(S);
    return { q: Math.max(0, (krw - fee) / avg), avg, fee, slip: imp / 2 };
  },

  quoteSell(S, sym, q) {
    const c = S.coins[sym];
    const imp = this.impact(sym, q * c.p);
    const avg = c.p * (1 - imp / 2);
    const fee = q * avg * this.feeRate(S);
    return { krw: q * avg - fee, avg, fee, slip: imp / 2 };
  },

  buy(S, sym, krw, who = '나') {
    krw = Math.floor(Math.min(krw, S.cash));
    if (krw < MIN_ORDER) fail('최소 주문 금액은 5,000원입니다.');
    S.cash -= krw;
    const r = this.execBuy(S, sym, krw);
    holdAdd(S, sym, r.q, krw);
    S.stats.buys++;
    addLog(S, { kind: 'coin', sym, side: 'buy', q: r.q, p: r.avg, krw, who });
    return r;
  },

  sell(S, sym, q, who = '나') {
    const h = S.hold[sym];
    if (!h || h.q <= 0) fail('보유한 수량이 없습니다.');
    q = Math.min(q, h.q);
    const isAll = q >= h.q * (1 - 1e-9);
    if (q <= 0) fail('수량을 입력하세요.');
    if (!isAll && q * S.coins[sym].p < MIN_ORDER) fail('최소 주문 금액은 5,000원입니다.');
    const r = this.execSell(S, sym, q);
    const cost = holdSub(S, sym, q);
    S.cash += r.krw;
    const pnl = r.krw - cost;
    this.recordPnl(S, pnl);
    S.stats.sells++;
    addLog(S, { kind: 'coin', sym, side: 'sell', q, p: r.avg, krw: r.krw, pnl, who });
    return { ...r, pnl, ret: cost > 0 ? pnl / cost : 0 };
  },

  recordPnl(S, pnl) {
    S.stats.realized += pnl;
    if (pnl > 0) S.stats.wins++;
    else if (pnl < 0) S.stats.losses++;
  },

  /* ---------- 지정가 ---------- */
  placeLimit(S, sym, side, price, q) {
    price = roundTick(price);
    if (!(price > 0)) fail('가격을 입력하세요.');
    if (!(q > 0)) fail('수량을 입력하세요.');
    const fee = this.feeRate(S);
    const o = { id: uid(S), sym, side, price, q, t: S.t };
    if (side === 'buy') {
      const krw = price * q * (1 + fee);
      if (krw < MIN_ORDER) fail('최소 주문 금액은 5,000원입니다.');
      if (krw > S.cash) fail('주문 가능 금액이 부족합니다.');
      S.cash -= krw;
      o.lock = krw;
    } else {
      const h = S.hold[sym];
      if (!h || h.q < q * (1 - 1e-9)) fail('매도 가능 수량이 부족합니다.');
      if (price * q < MIN_ORDER) fail('최소 주문 금액은 5,000원입니다.');
      o.q = Math.min(q, h.q);
      o.cost = holdSub(S, sym, o.q);
    }
    S.orders.push(o);
    return o;
  },

  cancelLimit(S, id) {
    const i = S.orders.findIndex(o => o.id === id);
    if (i < 0) return;
    const o = S.orders[i];
    S.orders.splice(i, 1);
    if (o.side === 'buy') S.cash += o.lock;
    else holdAdd(S, o.sym, o.q, o.cost);
  },

  checkLimits(S) {
    for (let i = S.orders.length - 1; i >= 0; i--) {
      const o = S.orders[i];
      const p = S.coins[o.sym].p;
      if (o.side === 'buy' && p <= o.price) {
        S.orders.splice(i, 1);
        holdAdd(S, o.sym, o.q, o.lock);
        S.stats.buys++;
        S.stats.volume += o.lock;
        addLog(S, { kind: 'coin', sym: o.sym, side: 'buy', q: o.q, p: o.price, krw: o.lock, who: '지정가' });
        Game.emit('fill', { o });
      } else if (o.side === 'sell' && p >= o.price) {
        S.orders.splice(i, 1);
        const krw = o.price * o.q * (1 - this.feeRate(S));
        S.cash += krw;
        const pnl = krw - o.cost;
        this.recordPnl(S, pnl);
        S.stats.sells++;
        S.stats.volume += krw;
        addLog(S, { kind: 'coin', sym: o.sym, side: 'sell', q: o.q, p: o.price, krw, pnl, who: '지정가' });
        Game.emit('fill', { o, pnl });
      }
    }
  },

  /* ---------- 예약 매도(익절/손절) ---------- */
  setRule(S, sym, tp, sl) {
    if (!(tp > 0) && !(sl > 0)) fail('익절 또는 손절 비율을 입력하세요.');
    S.rules[sym] = { tp: tp > 0 ? tp : 0, sl: sl > 0 ? sl : 0 };
  },

  checkRules(S) {
    for (const sym in S.rules) {
      const h = S.hold[sym];
      if (!h || h.q <= 0) continue;
      const rule = S.rules[sym];
      const ret = S.coins[sym].p / (h.cost / h.q) - 1;
      let why = null;
      if (rule.tp && ret >= rule.tp) why = '예약 익절';
      else if (rule.sl && ret <= -rule.sl) why = '예약 손절';
      if (why) {
        delete S.rules[sym];
        try {
          const r = this.sell(S, sym, h.q, why);
          Game.emit('rule', { sym, why, r });
        } catch (e) { /* 잔량 부족 등은 무시 */ }
      }
    }
  },

  /* ---------- 선물 ---------- */
  openFut(S, sym, side, lev, margin) {
    if (!COIN[sym].fut) fail('이 코인은 선물 거래를 지원하지 않습니다.');
    lev = clamp(Math.round(lev), 1, FUT_MAX_LEV);
    margin = Math.floor(margin);
    if (margin < 10000) fail('최소 증거금은 10,000원입니다.');
    const notional = margin * lev;
    const fee = notional * FUT_FEE;
    if (margin + fee > S.cash) fail('증거금과 수수료를 낼 현금이 부족합니다.');
    S.cash -= margin + fee;
    S.stats.fees += fee;
    const p = S.coins[sym].p;
    const entry = p * (side === 'long' ? 1.0002 : 0.9998);
    const f = { id: uid(S), sym, side, lev, margin, entry, q: notional / entry, t: S.t, funding: 0 };
    S.futures.push(f);
    addLog(S, { kind: 'fut', sym, side: side === 'long' ? 'buy' : 'sell', q: f.q, p: entry, krw: margin, who: `${side === 'long' ? '롱' : '숏'} ${lev}x 진입` });
    return f;
  },

  futPnl(S, f) {
    const p = S.coins[f.sym].p;
    return (f.side === 'long' ? p - f.entry : f.entry - p) * f.q;
  },

  liqPrice(f) {
    const buffer = (f.margin - FUT_MMR * f.entry * f.q) / f.q;
    return f.side === 'long' ? f.entry - buffer : f.entry + buffer;
  },

  closeFut(S, id, reason = '수동 종료') {
    const i = S.futures.findIndex(f => f.id === id);
    if (i < 0) return null;
    const f = S.futures[i];
    S.futures.splice(i, 1);
    const p = S.coins[f.sym].p;
    const pnl = this.futPnl(S, f);
    const fee = f.q * p * FUT_FEE;
    const back = Math.max(0, f.margin + pnl - fee);
    S.cash += back;
    S.stats.fees += fee;
    const roe = (back - f.margin) / f.margin;
    S.stats.bestRoe = Math.max(S.stats.bestRoe, roe);
    this.recordPnl(S, back - f.margin);
    addLog(S, { kind: 'fut', sym: f.sym, side: f.side === 'long' ? 'sell' : 'buy', q: f.q, p, krw: back, pnl: back - f.margin, who: `${f.side === 'long' ? '롱' : '숏'} ${f.lev}x ${reason}` });
    return { f, back, roe, pnl: back - f.margin };
  },

  checkFut(S) {
    for (let i = S.futures.length - 1; i >= 0; i--) {
      const f = S.futures[i];
      const p = S.coins[f.sym].p;
      // 펀딩비: 8시간(40틱)마다. 시장이 과열이면 롱이, 공포면 숏이 낸다
      if ((S.t - f.t) > 0 && (S.t - f.t) % 40 === 0) {
        const payer = S.fg >= 50 ? 'long' : 'short';
        const rate = 0.0001 * (1 + Math.abs(S.fg - 50) / 25);
        const amt = f.q * p * rate * (f.side === payer ? 1 : -1);
        f.margin -= amt;
        f.funding += amt;
      }
      const liq = this.liqPrice(f);
      const hit = f.side === 'long' ? p <= liq : p >= liq;
      if (hit || f.margin <= 0) {
        S.futures.splice(i, 1);
        S.stats.liqs++;
        this.recordPnl(S, -f.margin);
        addLog(S, { kind: 'fut', sym: f.sym, side: f.side === 'long' ? 'sell' : 'buy', q: f.q, p, krw: 0, pnl: -f.margin, who: `${f.side === 'long' ? '롱' : '숏'} ${f.lev}x 강제청산` });
        Game.emit('liquidated', f);
      }
    }
  },

  /* ---------- 스테이킹 ---------- */
  stake(S, sym, q) {
    if (!COIN[sym].stake) fail('이 코인은 스테이킹을 지원하지 않습니다.');
    const h = S.hold[sym];
    if (!h || h.q <= 0) fail('보유한 수량이 없습니다.');
    q = Math.min(q, h.q);
    if (!(q > 0)) fail('수량을 입력하세요.');
    const cost = holdSub(S, sym, q);
    const st = S.staked[sym] || (S.staked[sym] = { q: 0, cost: 0 });
    st.q += q;
    st.cost += cost;
  },

  unstake(S, sym, q) {
    const st = S.staked[sym];
    if (!st || st.q <= 0) fail('스테이킹 중인 수량이 없습니다.');
    q = Math.min(q, st.q);
    const cost = st.cost * (q / st.q);
    st.q -= q;
    st.cost -= cost;
    if (st.q <= 1e-12) delete S.staked[sym];
    holdAdd(S, sym, q, cost);
  },

  /** 하루마다 보상 지급(복리). 보상은 지급 시점 시세를 원가로 잡는다 */
  stakeDaily(S) {
    let total = 0;
    for (const sym in S.staked) {
      const st = S.staked[sym];
      const r = st.q * COIN[sym].stake;
      const v = r * S.coins[sym].p;
      st.q += r;
      st.cost += v;
      S.stakeEarned[sym] = (S.stakeEarned[sym] || 0) + r;
      total += v;
    }
    if (total > 0) Game.emit('stake', total);
  },

  tick(S) {
    this.checkLimits(S);
    this.checkRules(S);
    this.checkFut(S);
    if (S.t % TPD === 0) this.stakeDaily(S);
  },
};
