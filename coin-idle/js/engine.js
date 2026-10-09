'use strict';
/* 한 틱(실제 1초 = 게임 12분) 진행 순서 */

const Engine = {
  step(S) {
    S.t++;
    Market.tick(S);
    News.tick(S);
    Trade.tick(S);
    Mgr.tick(S);
    Mining.tick(S);
    Stocks.tick(S);
    Realty.tick(S);
    Biz.tick(S);
    Startup.tick(S);
    Life.tick(S);
    const nw = Wealth.net(S);
    if (nw > S.stats.peak) S.stats.peak = nw;
    if (S.t % 30 === 0) {
      S.nwHist.push([S.t, Math.round(nw)]);
      if (S.nwHist.length > 480) S.nwHist.splice(0, S.nwHist.length - 480);
    }
    if (S.t % 5 === 0) this.checkAch(S);
  },

  checkAch(S) {
    for (const a of ACHS) {
      if (S.ach[a.id]) continue;
      let ok = false;
      try { ok = a.test(S); } catch (e) { ok = false; }
      if (ok) {
        S.ach[a.id] = S.t;
        Game.emit('ach', a);
      }
    }
  },

  rank(S) {
    const nw = Wealth.net(S);
    let cur = RANKS[0], next = null;
    for (let i = 0; i < RANKS.length; i++) {
      if (nw >= RANKS[i][0]) { cur = RANKS[i]; next = RANKS[i + 1] || null; }
    }
    return { name: cur[1], at: cur[0], next };
  },
};
