'use strict';
/* 라이프: 자동차 · 연애(여친) · 인맥 · 쇼핑/소비. 돈을 쓰면 매력·명성·행복이 오르고 인맥이 생긴다 */

const Life = {
  /* ---------- 능력치 ---------- */
  charm(S) {
    const L = S.life;
    let best = 0, sum = 0;
    for (const id in L.cars) { const ch = CAR[id].charm; sum += ch; best = Math.max(best, ch); }
    let c = 10 + best + (sum - best) * 0.25;
    for (const it of ITEMS) if (L.items[it.id]) c += it.charm;
    if (L.married) c += 10;
    const club = this.contactLv(S, 'club');
    c *= 1 + (club >= 2 ? 0.2 : club >= 1 ? 0.1 : 0);
    return Math.round(c);
  },

  fame(S) {
    const nw = Math.max(1, Wealth.net(S));
    let f = Math.max(0, (Math.log10(nw) - 7) * 8) + S.life.famePerm;
    for (const it of ITEMS) if (S.life.items[it.id]) f += it.fame;
    if (this.contactLv(S, 'heir') >= 1) f += 10;
    return Math.round(f);
  },

  happyMult(S) {
    return 1 + S.life.happy / 500;
  },

  addHappy(S, n) {
    S.life.happy = clamp(S.life.happy + n, 0, 100);
  },

  spend(S, cost) {
    if (S.cash < cost) fail('현금이 부족합니다.');
    S.cash -= cost;
    S.stats.spent += cost;
  },

  taxCut(S) {
    const lv = this.contactLv(S, 'tax');
    return lv * 0.1;
  },

  upkeepPerDay(S) {
    let u = 0;
    for (const id in S.life.cars) u += CAR[id].price * 0.0012;
    return u;
  },

  /* ---------- 자동차 ---------- */
  carValue(S, id) {
    const car = S.life.cars[id];
    if (!car) return 0;
    const days = (S.t - car.t) / TPD;
    return CAR[id].price * Math.max(0.4, 0.82 * Math.pow(0.996, days));
  },

  buyCar(S, id) {
    if (S.life.cars[id]) fail('이미 보유한 차입니다.');
    this.spend(S, CAR[id].price);
    S.life.cars[id] = { t: S.t };
    this.addHappy(S, 12);
  },

  sellCar(S, id) {
    if (!S.life.cars[id]) return;
    const v = this.carValue(S, id);
    delete S.life.cars[id];
    S.cash += v;
    return v;
  },

  /* ---------- 연애 ---------- */
  meet(S, meetId) {
    const M = MEETS.find(m => m.id === meetId);
    if (S.life.gf) fail('이미 연애 중입니다.');
    if (this.charm(S) < M.charm) fail(`매력 ${M.charm} 이상이 필요합니다.`);
    if (this.fame(S) < M.fame) fail(`명성 ${M.fame} 이상이 필요합니다.`);
    this.spend(S, M.cost);
    const jobs = GF_JOBS.map(j => ({ ...j, w: j.w * (j.premium ? 1 + (M.premium || 0) * 10 : 1) }));
    const job = pickW(jobs);
    const type = pick(Object.keys(GF_TYPES));
    const std = Math.round(rand(M.std[0], M.std[1]));
    const club = this.contactLv(S, 'club') >= 3 ? 0.15 : 0;
    const odds = clamp(M.base + (this.charm(S) + this.fame(S) * 0.6 - std) / 120 + club, 0.05, 0.92);
    S.life.cand = { id: uid(S), name: pick(GF_NAMES), age: randi(25, 34), type, job: job.job, contact: job.contact || null, std, odds, via: M.name };
    return S.life.cand;
  },

  askOut(S) {
    const c = S.life.cand;
    if (!c) return null;
    S.life.cand = null;
    if (chance(c.odds)) {
      S.life.gf = { ...c, aff: 35, since: S.t, dates: 0, contactGiven: false, lastId: null };
      S.stats.gfs++;
      this.addHappy(S, 15);
      return true;
    }
    this.addHappy(S, -6);
    return false;
  },

  pass(S) {
    S.life.cand = null;
  },

  dateReady(S) {
    return S.t - S.life.lastDate >= DATE_CD;
  },

  dateGain(S, dateId) {
    const gf = S.life.gf;
    const D = DATES.find(d => d.id === dateId);
    const T = GF_TYPES[gf.type];
    let m = 1;
    if (T.like.includes(dateId)) m = 1.6;
    else if (T.dislike.includes(dateId)) m = 0.5;
    if (gf.lastId === dateId) m *= 0.6;
    return { gain: D.aff * m, like: T.like.includes(dateId), dislike: T.dislike.includes(dateId) };
  },

  date(S, dateId) {
    const gf = S.life.gf;
    if (!gf) fail('먼저 연애를 시작하세요.');
    if (!this.dateReady(S)) fail('조금 쉬었다가 다시 데이트하세요.');
    const D = DATES.find(d => d.id === dateId);
    this.spend(S, D.cost);
    const { gain } = this.dateGain(S, dateId);
    gf.aff = Math.min(100, gf.aff + gain);
    gf.dates++;
    gf.lastId = dateId;
    S.life.lastDate = S.t;
    this.addHappy(S, D.happy);
    return gain;
  },

  canPropose(S) {
    const gf = S.life.gf;
    return gf && !S.life.married && gf.aff >= 90 && (S.t - gf.since) >= TPD * 15;
  },

  propose(S) {
    if (!this.canPropose(S)) fail('호감도 90 이상, 15일 이상 만나야 프로포즈할 수 있습니다.');
    this.spend(S, 3e7);
    if (chance(0.85)) {
      S.life.married = { name: S.life.gf.name, since: S.t };
      S.life.famePerm += 5;
      this.addHappy(S, 30);
      return true;
    }
    S.life.gf.aff -= 20;
    this.addHappy(S, -15);
    return false;
  },

  breakup(S, byMe) {
    const gf = S.life.gf;
    if (!gf) return;
    let penalty = 0;
    if (S.life.married) {
      penalty = Math.floor(S.cash * 0.2);
      S.cash -= penalty;
      S.life.married = false;
    }
    S.life.gf = null;
    S.life.exes++;
    this.addHappy(S, byMe ? -10 : -30);
    Game.emit('breakup', { gf, byMe, penalty });
  },

  /* ---------- 인맥 ---------- */
  contactLv(S, id) {
    const c = S.life && S.life.contacts[id];
    if (!c) return 0;
    return c.close >= 85 ? 3 : c.close >= 50 ? 2 : 1;
  },

  addContact(S, id, via, close = 25) {
    const L = S.life;
    if (L.contacts[id]) {
      L.contacts[id].close = Math.min(100, L.contacts[id].close + 10);
      return false;
    }
    L.contacts[id] = { close, via, since: S.t, last: -999 };
    Game.emit('contact', { id, via });
    return true;
  },

  network(S, evId) {
    const E = NET_EVENTS.find(e => e.id === evId);
    if (this.charm(S) < E.charm) fail(`매력 ${E.charm} 이상이 필요합니다.`);
    if (this.fame(S) < E.fame) fail(`명성 ${E.fame} 이상이 필요합니다.`);
    this.spend(S, E.cost);
    this.addHappy(S, 3);
    const p = E.p + (this.contactLv(S, 'club') >= 3 ? 0.15 : 0) + this.charm(S) / 1000;
    const unknown = E.pool.filter(id => !S.life.contacts[id]);
    if (unknown.length && chance(p)) {
      const id = pick(unknown);
      this.addContact(S, id, E.name);
      return { id, isNew: true };
    }
    const known = E.pool.filter(id => S.life.contacts[id]);
    if (known.length && chance(0.6)) {
      const id = pick(known);
      S.life.contacts[id].close = Math.min(100, S.life.contacts[id].close + 6);
      return { id, isNew: false };
    }
    return null;
  },

  treat(S, id, giftId) {
    const c = S.life.contacts[id];
    if (!c) return;
    if (S.t - c.last < CONTACT_CD) fail('너무 자주 연락하면 부담스러워해요.');
    const G = MEET_GIFTS.find(g => g.id === giftId);
    this.spend(S, G.cost);
    c.close = Math.min(100, c.close + G.gain);
    c.last = S.t;
    this.addHappy(S, 2);
  },

  /* ---------- 쇼핑 · 소비 ---------- */
  buyItem(S, id) {
    if (S.life.items[id]) fail('이미 가지고 있습니다.');
    const it = ITEMS.find(x => x.id === id);
    this.spend(S, it.price);
    S.life.items[id] = S.t;
    this.addHappy(S, it.happy);
  },

  spendPrice(S, sp) {
    return sp.donate ? Math.max(1e6, Math.round(Wealth.net(S) * 0.01 / 1e4) * 1e4) : sp.price;
  },

  doSpend(S, id) {
    const sp = SPENDS.find(x => x.id === id);
    const price = this.spendPrice(S, sp);
    this.spend(S, price);
    this.addHappy(S, sp.happy);
    if (sp.fame) S.life.famePerm += sp.fame;
    return price;
  },

  /* ---------- 매 틱 ---------- */
  tick(S) {
    const L = S.life;
    const floor = L.married ? 45 : L.gf ? 35 : 20;
    L.happy += (floor - L.happy) * 0.002;
    if (S.t % TPD === 0 && S.t > 0) this.daily(S);
    if (S.t % 10 === 0) this.unlocks(S);
  },

  daily(S) {
    const L = S.life;
    const up = this.upkeepPerDay(S);
    if (up > 0) {
      if (S.cash >= up) S.cash -= up;
      else { this.addHappy(S, -8); Game.emit('upkeepMiss', up); }
    }
    if (L.gf) {
      const decay = L.married ? 1.5 : GF_TYPES[L.gf.type].decay;
      L.gf.aff -= decay;
      if (L.gf.aff <= 0) this.breakup(S, false);
    }
    for (const id in L.contacts) L.contacts[id].close = Math.max(5, L.contacts[id].close - 0.5);
    if (this.contactLv(S, 'banker') >= 2 && S.cash > 0) {
      const it = S.cash * 0.0002;
      S.cash += it;
    }
  },

  unlocks(S) {
    const L = S.life;
    if (S.stats.hires >= 1) this.addOnce(S, 'headhunter', '첫 매니저 채용');
    if (Object.values(S.props).some(n => n > 0)) this.addOnce(S, 'realtor', '첫 부동산 거래');
    if (S.stats.peak >= 1e9) this.addOnce(S, 'banker', '자산 10억 달성');
    if (Object.keys(L.cars).some(id => CAR[id].charm >= 95)) this.addOnce(S, 'club', '슈퍼카 구매');
    if (S.stats.volume >= 5e9) this.addOnce(S, 'exchange', '누적 거래대금 50억');
    if (S.stats.invests >= 1) this.addOnce(S, 'vc', '첫 스타트업 투자');
    const gf = L.gf;
    if (gf && gf.contact && !gf.contactGiven && gf.aff >= 50) {
      gf.contactGiven = true;
      this.addOnce(S, gf.contact, `여자친구 ${gf.name}의 소개`);
    }
  },

  addOnce(S, id, via) {
    if (!S.life.contacts[id]) this.addContact(S, id, via);
  },
};

/* 인맥 해금 힌트 */
const CONTACT_HINT = {
  analyst: '투자 세미나 · 애널리스트 여자친구',
  exchange: '누적 거래대금 50억 · 투자 세미나',
  realtor: '첫 부동산 구매 · 골프 모임',
  vc: '첫 스타트업 투자 · 스타트업 밋업',
  tax: '골프 모임 · 회계사 여자친구',
  youtuber: '스타트업 밋업 · 유튜버 여자친구',
  headhunter: '첫 매니저 고용',
  banker: '총자산 10억 · 투자 세미나',
  heir: '자선 갈라 디너 · 재벌가 여자친구',
  club: '슈퍼카(매력 95+) 구매 · 골프 모임',
};
