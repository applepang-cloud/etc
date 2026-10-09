'use strict';
/* 매니저: 고용 · 담당 코인 지정 · 역할(자율 매매 / 매수 전담 / 매도 전담) · 전략별 매매 AI */

const MGR_MAX = 6;

const Mgr = {
  gen(S) {
    const hh = Life.contactLv(S, 'headhunter');
    let skill = 1 + Math.pow(Math.random(), 1.9 - hh * 0.3) * 4;
    if (hh >= 3 && chance(0.3)) skill = rand(4.3, 5);
    skill = Math.round(skill * 10) / 10;
    const strat = pick(Object.keys(STRATS));
    const tier = skill < 2.5 ? 0 : skill < 4 ? 1 : 2;
    const salary = Math.round(30000 * Math.pow(skill, 2.4) * rand(0.85, 1.15) / 1000) * 1000;
    return {
      id: uid(S), name: pick(SURNAMES) + pick(GIVEN), hue: randi(0, 359), skill, strat,
      bg: pick(MGR_BG[tier]), quote: pick(STRATS[strat].quote), salary,
    };
  },

  refreshCands(S) {
    S.cands = [this.gen(S), this.gen(S), this.gen(S), this.gen(S)];
    S.candNext = S.t + TPD * 4;
  },

  refreshCost(S) {
    if (Life.contactLv(S, 'headhunter') >= 1 && S.hhFree !== Math.floor(S.t / TPD)) return 0;
    return Math.max(100000, Math.round(Wealth.net(S) * 0.002 / 1000) * 1000);
  },

  paidRefresh(S) {
    const cost = this.refreshCost(S);
    if (S.cash < cost) fail('헤드헌터 비용이 부족합니다.');
    S.cash -= cost;
    if (cost === 0) S.hhFree = Math.floor(S.t / TPD);
    this.refreshCands(S);
  },

  salary(S, m) {
    return m.salary * (1 - Life.taxCut(S));
  },

  hire(S, id) {
    if (S.managers.length >= MGR_MAX) fail(`매니저는 최대 ${MGR_MAX}명까지 고용할 수 있습니다.`);
    const i = S.cands.findIndex(c => c.id === id);
    if (i < 0) return null;
    const cand = S.cands[i];
    const fee = cand.salary * 2;
    if (S.cash < fee) fail(`계약금 ${won(fee)}이 필요합니다.`);
    S.cash -= fee;
    S.cands.splice(i, 1);
    const st = STRATS[cand.strat];
    const m = {
      ...cand, lv: 1, xp: 0, role: 'trade', target: S.ui.sel, cash: 0, inv: 0, budget: 0, pos: {},
      tradePct: 0.25, tp: st.tp, sl: st.sl, active: true, last: S.t, hiredT: S.t,
      stats: { trades: 0, wins: 0, pnl: 0, bq: 0, bkrw: 0, bench: 0, benchN: 0, sold: 0 }, log: [],
    };
    S.managers.push(m);
    S.stats.hires++;
    return m;
  },

  get(S, id) {
    return S.managers.find(m => m.id === id);
  },

  posValue(S, m) {
    let v = 0;
    for (const sym in m.pos) v += m.pos[sym].q * S.coins[sym].p;
    return v;
  },

  value(S, m) {
    return m.cash + this.posValue(S, m);
  },

  deposit(S, m, krw) {
    krw = Math.floor(Math.min(krw, S.cash));
    if (krw <= 0) fail('입금할 금액을 입력하세요.');
    S.cash -= krw;
    m.cash += krw;
    m.inv += krw;
    m.budget += krw;
    m.spent = false;
  },

  withdraw(S, m, krw) {
    krw = Math.floor(Math.min(krw, m.cash));
    if (krw <= 0) fail('출금할 수 있는 현금이 없습니다.');
    m.cash -= krw;
    m.inv -= krw;
    S.cash += krw;
  },

  sellAll(S, m) {
    for (const sym of Object.keys(m.pos)) this.sellPos(S, m, sym, 1, '전량 매도 지시');
  },

  fire(S, m) {
    this.sellAll(S, m);
    S.cash += m.cash;
    S.managers = S.managers.filter(x => x.id !== m.id);
  },

  note(m, S, text) {
    m.log.unshift({ t: S.t, text });
    if (m.log.length > 12) m.log.length = 12;
  },

  /* ---------- 매매 신호 ---------- */
  signal(S, m, sym) {
    const c = S.coins[sym];
    const def = COIN[sym];
    const k = c.k[5];
    const cl = [];
    for (let i = Math.max(0, k.length - 30); i < k.length; i++) cl.push(k[i][3]);
    const volH = def.vol / Math.sqrt(24);
    let s = 0;
    switch (m.strat) {
      case 'scalp': {
        const ma5 = sma(cl, 5) || c.p, ma20 = sma(cl, 20) || c.p;
        const dev = (c.p - ma5) / ma5 / (def.vol / SQRT_TPD * 3);
        s = 0.5 * Math.sign(ma5 - ma20) - 0.5 * clamp(dev, -1.5, 1.5);
        break;
      }
      case 'trend': {
        const ma7 = sma(cl, 7) || c.p, ma25 = sma(cl, 25) || c.p;
        s = clamp((ma7 - ma25) / ma25 / (volH * 1.5), -1, 1);
        break;
      }
      case 'dip':
        s = clamp((50 - rsi(cl, 14)) / 22, -1, 1);
        break;
      case 'hodl': {
        const ma25 = sma(cl, 25) || c.p;
        s = 0.55 - clamp((c.p / ma25 - 1) / def.vol, -1, 1) * 0.8;
        break;
      }
      case 'news':
        s = clamp(c.ns * 2, -1, 1);
        break;
    }
    // 실력이 좋을수록 앞으로 반영될 재료(숨은 추세)를 읽어낸다
    const ins = clamp(Market.pending(S, sym) / (def.vol / SQRT_TPD * 4), -1, 1);
    if (chance(0.1 + 0.1 * m.skill)) s = s * 0.35 + ins * 0.9;
    s += gauss() * (0.42 - 0.06 * m.skill);
    if (c.warn > S.t) s -= 0.2 + m.skill * 0.1;
    return clamp(s, -1.5, 1.5);
  },

  /* ---------- 매매 실행 ---------- */
  buyPos(S, m, sym, krw, why) {
    krw = Math.floor(Math.min(krw, m.cash));
    if (krw < MIN_ORDER) return;
    m.cash -= krw;
    const r = Trade.execBuy(S, sym, krw);
    const p = m.pos[sym] || (m.pos[sym] = { q: 0, cost: 0 });
    p.q += r.q;
    p.cost += krw;
    this.note(m, S, `${sym} ${fmtQty(r.q)}개 매수 · ${why}`);
    addLog(S, { kind: 'coin', sym, side: 'buy', q: r.q, p: r.avg, krw, who: m.name, mgr: m.id });
  },

  sellPos(S, m, sym, frac, why) {
    const p = m.pos[sym];
    if (!p || p.q <= 0) return;
    let q = p.q * frac;
    if (q * S.coins[sym].p < MIN_ORDER) q = p.q;
    const r = Trade.execSell(S, sym, q);
    const cost = p.cost * (q / p.q);
    p.q -= q;
    p.cost -= cost;
    if (p.q <= 1e-12) delete m.pos[sym];
    m.cash += r.krw;
    const pnl = r.krw - cost;
    m.stats.trades++;
    m.stats.pnl += pnl;
    if (pnl > 0) m.stats.wins++;
    this.note(m, S, `${sym} ${why} ${pnl >= 0 ? '+' : ''}${won(pnl, true)}`);
    addLog(S, { kind: 'coin', sym, side: 'sell', q, p: r.avg, krw: r.krw, pnl, who: m.name, mgr: m.id });
    this.gainXp(S, m, pnl);
  },

  gainXp(S, m, pnl) {
    m.xp += 10 + (pnl > 0 ? 12 : 0);
    if (m.xp >= m.lv * 70) {
      m.xp -= m.lv * 70;
      m.lv++;
      m.skill = Math.min(5, Math.round((m.skill + 0.15) * 10) / 10);
      m.salary = Math.round(m.salary * 1.05 / 1000) * 1000;
      Game.emit('mgrLevel', m);
    }
  },

  decide(S, m) {
    if (m.role === 'buy') return this.decideBuy(S, m);
    if (m.role === 'sell') return this.decideSell(S, m);
    // 자율 매매: 들고 있는 포지션부터 관리
    for (const sym of Object.keys(m.pos)) this.manage(S, m, sym);
    if (m.target === 'AUTO') {
      if (m.cash < MIN_ORDER || Object.keys(m.pos).length >= 3) return;
      const pool = COINS.map(d => d.sym).filter(s => !m.pos[s]).sort(() => Math.random() - 0.5).slice(0, 5);
      let best = null, bs = -9;
      for (const sym of pool) {
        const s = this.signal(S, m, sym);
        if (s > bs) { bs = s; best = sym; }
      }
      if (best && bs > 0.5) this.buyPos(S, m, best, m.cash * m.tradePct, '자동 선별');
    } else if (!m.pos[m.target]) {
      const s = this.signal(S, m, m.target);
      if (s > 0.45) this.buyPos(S, m, m.target, m.cash * m.tradePct, '매수 신호');
    }
  },

  manage(S, m, sym) {
    const p = m.pos[sym];
    const c = S.coins[sym];
    const ret = c.p / (p.cost / p.q) - 1;
    const s = this.signal(S, m, sym);
    if (ret >= m.tp) this.sellPos(S, m, sym, 1, '익절');
    else if (ret <= -m.sl) this.sellPos(S, m, sym, 1, '손절');
    else if (s < -0.5) this.sellPos(S, m, sym, s < -0.9 ? 1 : 0.5, '매도 신호');
    else if (s > 0.85 && m.cash >= MIN_ORDER && p.cost < this.value(S, m) * 0.7) this.buyPos(S, m, sym, m.cash * m.tradePct, '추가 매수');
  },

  /* 매수 전담: 예산을 나눠 좋은 타이밍에 사서 내 지갑으로 */
  decideBuy(S, m) {
    const sym = m.target === 'AUTO' ? S.ui.sel : m.target;
    const c = S.coins[sym];
    m.stats.bench += c.p;
    m.stats.benchN++;
    if (m.cash < MIN_ORDER) {
      if (!m.spent) { m.spent = true; this.note(m, S, '예산을 모두 집행했습니다'); Game.emit('mgrBudget', m); }
      return;
    }
    const s = this.signal(S, m, sym);
    // 한 번에 몰아 사지 않도록 최소 10틱(2시간) 간격을 둔다
    if (s > 0.35 && S.t - (m.lastBuy || -99) >= 10) {
      m.lastBuy = S.t;
      const krw = Math.floor(Math.min(m.cash, Math.max(MIN_ORDER, m.budget * m.tradePct)));
      m.cash -= krw;
      const r = Trade.execBuy(S, sym, krw);
      holdAdd(S, sym, r.q, krw);
      m.stats.bq += r.q;
      m.stats.bkrw += krw;
      m.stats.trades++;
      S.stats.buys++;
      this.note(m, S, `${sym} ${fmtQty(r.q)}개 매수 → 내 지갑`);
      addLog(S, { kind: 'coin', sym, side: 'buy', q: r.q, p: r.avg, krw, who: m.name, mgr: m.id });
      this.gainXp(S, m, 0);
    }
  },

  /* 매도 전담: 내 지갑의 코인을 익절/손절 기준으로 나눠 판다 */
  decideSell(S, m) {
    const sym = m.target === 'AUTO' ? S.ui.sel : m.target;
    const h = S.hold[sym];
    if (!h || h.q <= 0) return;
    const ret = S.coins[sym].p / (h.cost / h.q) - 1;
    const s = this.signal(S, m, sym);
    let frac = 0, why = '';
    if (ret >= m.tp) { frac = m.tradePct; why = '익절'; }
    else if (ret <= -m.sl) { frac = m.tradePct; why = '손절'; }
    else if (s < -0.7 && ret > 0.01) { frac = m.tradePct * 0.5; why = '고점 신호'; }
    if (!frac) return;
    let q = h.q * frac;
    if (q * S.coins[sym].p < MIN_ORDER) q = h.q;
    try {
      const r = Trade.sell(S, sym, q, m.name);
      m.stats.trades++;
      m.stats.pnl += r.pnl;
      m.stats.sold += r.krw;
      if (r.pnl > 0) m.stats.wins++;
      this.note(m, S, `${sym} ${why} 매도 ${r.pnl >= 0 ? '+' : ''}${won(r.pnl, true)}`);
      this.gainXp(S, m, r.pnl);
    } catch (e) { /* 수량 부족 */ }
  },

  payday(S) {
    let total = 0;
    for (const m of S.managers.slice()) {
      const sal = this.salary(S, m);
      if (S.cash >= sal) { S.cash -= sal; total += sal; }
      else if (m.cash >= sal) { m.cash -= sal; m.inv -= sal; total += sal; this.note(m, S, '급여를 운용자금에서 받았습니다'); }
      else {
        this.fire(S, m);
        Game.emit('mgrQuit', m);
      }
    }
    if (total > 0) Game.emit('payday', total);
  },

  tick(S) {
    for (const m of S.managers) {
      if (!m.active) continue;
      if (S.t - m.last >= STRATS[m.strat].every) {
        m.last = S.t;
        this.decide(S, m);
      }
    }
    if (S.t % TPD === 0 && S.t > 0) this.payday(S);
    if (S.t >= S.candNext) this.refreshCands(S);
  },
};
