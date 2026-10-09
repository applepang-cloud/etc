/*
 * 터치라인 매니저 — 게임 엔진
 *
 * DOM에 의존하지 않는 순수 로직이다. 브라우저에서는 window.TL, Node에서는
 * module.exports로 노출된다. 모든 시간은 "게임 초" 단위이며 속도 배율은
 * tick()에서만 곱한다. 상태 객체는 JSON으로 그대로 저장할 수 있어야 한다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TL = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SAVE_VERSION = 1;

  /* ------------------------------------------------------------------ 난수 */

  let rng = Math.random;
  function setRandom(fn) { rng = typeof fn === 'function' ? fn : Math.random; }
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = (a, b) => a + (b - a) * rng();
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const chance = (p) => rng() < p;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function gauss() {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function poisson(lambda) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rng(); } while (p > L);
    return k - 1;
  }
  function weighted(items, weightOf) {
    let total = 0;
    for (const it of items) total += Math.max(0, weightOf(it));
    let r = rng() * total;
    for (const it of items) {
      r -= Math.max(0, weightOf(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* ---------------------------------------------------------------- 상수 */

  // 한 라운드(1주) = 경기 준비 → 경기(전·후반 + 하프타임) → 경기 종료
  const T = { pre: 15, match: 45, half: 3, post: 5, offseason: 20 };
  const ROUND_SECONDS = T.pre + T.match + T.half + T.post;
  const SPEEDS = [1, 2, 4, 8];
  const OFFLINE_CAP = 2 * 3600; // 실제 시간 기준 최대 2시간까지 인정
  const OFFLINE_RATE = 0.5;     // 오프라인 진행은 1배속의 절반

  const TIERS = {
    5: { name: '5부 리그', label: '아마추어', ai: 41, scale: 1, ticket: 7000, fanCap: 9000 },
    4: { name: '4부 리그', label: '세미프로', ai: 50, scale: 2.6, ticket: 11000, fanCap: 40000 },
    3: { name: '3부 리그', label: '프로', ai: 59, scale: 7, ticket: 18000, fanCap: 160000 },
    2: { name: '2부 리그', label: '챔피언십', ai: 67, scale: 18, ticket: 28000, fanCap: 650000 },
    1: { name: '1부 리그', label: '프리미어', ai: 75, scale: 45, ticket: 42000, fanCap: 2500000 },
  };

  const ECON = {
    startMoney: 1.5e8,
    startFans: 600,
    sponsorPerRound: 150e4,
    tvPerRound: 150e4,
    merchPerFanRound: 300,
    winBonus: 80e4,
    drawBonus: 30e4,
    prizeBase: 6000e4,
    promoBonus: 5000e4,
    attendRate: 0.6,
    sellRate: 0.85,
    refreshCost: 300e4,
  };
  const PRIZE_SHARE = [1, 0.75, 0.6, 0.5, 0.42, 0.36, 0.3, 0.25];
  const SQUAD_MAX = 26;
  const SQUAD_MIN = 14;
  const MARKET_REFRESH_ROUNDS = 3;

  const GROWTH_PER_SEC = 0.0062;
  const FIT_PER_SEC = 0.29;

  const POSITIONS = ['GK', 'DF', 'MF', 'FW'];
  const POS_NAME = { GK: '골키퍼', DF: '수비수', MF: '미드필더', FW: '공격수' };
  const W_ATT = { GK: 0, DF: 0.25, MF: 0.7, FW: 1.1 };
  const W_DEF = { GK: 2.2, DF: 1.0, MF: 0.45, FW: 0.08 };
  const W_SCORE = { GK: 0.01, DF: 0.6, MF: 2, FW: 5 };

  const FORMATIONS = {
    '4-4-2': { GK: 1, DF: 4, MF: 4, FW: 2, att: 0, def: 0, desc: '균형 잡힌 기본형' },
    '4-3-3': { GK: 1, DF: 4, MF: 3, FW: 3, att: 1.5, def: -1, desc: '측면 공격 강화' },
    '4-2-3-1': { GK: 1, DF: 4, MF: 5, FW: 1, att: 0.5, def: 0.5, desc: '중원 장악' },
    '3-5-2': { GK: 1, DF: 3, MF: 5, FW: 2, att: 1, def: -1.5, desc: '미드필드 숫자 우위' },
    '5-3-2': { GK: 1, DF: 5, MF: 3, FW: 2, att: -1.5, def: 2, desc: '두 줄 수비' },
  };
  const TACTICS = {
    attack: { name: '공격적', att: 2.5, def: -2.5 },
    balanced: { name: '균형', att: 0, def: 0 },
    defend: { name: '수비적', att: -2.5, def: 2.5 },
  };
  // 경기 중 감독 지시: 15분간 유지, 경기당 2회
  const ORDERS = {
    allout: { name: '총공격', att: 5, def: -4, line: '전원 공격! 라인을 끌어올린다' },
    focus: { name: '집중력', att: 2, def: 2, line: '감독이 테크니컬 에어리어에서 집중을 주문한다' },
    park: { name: '잠그기', att: -4, def: 5, line: '수비 숫자를 늘려 문을 걸어 잠근다' },
  };
  const ORDER_MINUTES = 15;
  const ORDERS_PER_MATCH = 2;

  const KITS = {
    red: { name: '레드', l: '#C8102E', d: '#FF6B7A', onL: '#FFFFFF', onD: '#2A0A0F' },
    sky: { name: '스카이', l: '#1F74B8', d: '#6CB8F0', onL: '#FFFFFF', onD: '#071E30' },
    navy: { name: '네이비', l: '#22357F', d: '#8FA4FF', onL: '#FFFFFF', onD: '#0C1336' },
    green: { name: '그린', l: '#13723F', d: '#52C98A', onL: '#FFFFFF', onD: '#062314' },
    yellow: { name: '옐로', l: '#8F6B00', d: '#F2C230', onL: '#FFFFFF', onD: '#2A2000' },
    purple: { name: '퍼플', l: '#6A3D9A', d: '#B996F0', onL: '#FFFFFF', onD: '#1E0F33' },
    orange: { name: '오렌지', l: '#C2500A', d: '#FF9550', onL: '#FFFFFF', onD: '#2E1203' },
    black: { name: '블랙', l: '#24282E', d: '#D3D8DF', onL: '#FFFFFF', onD: '#15181C' },
  };
  const KIT_KEYS = Object.keys(KITS);

  const STADIUM_CAP = [1500, 3000, 5000, 8000, 12000, 18000, 27000, 40000, 56000, 75000];
  const FAC_MAX = 10;
  const FACILITIES = {
    stadium: { name: '경기장', base: 3000e4, growth: 2.15, blurb: '관중 수용 인원이 늘어 홈 경기 입장 수입이 커진다' },
    training: { name: '훈련장', base: 2500e4, growth: 2.1, blurb: '선수들이 잠재력까지 더 빨리 성장한다' },
    academy: { name: '유소년 아카데미', base: 2000e4, growth: 2.1, blurb: '시즌마다 더 많고 뛰어난 유망주가 올라온다' },
    medical: { name: '메디컬 센터', base: 1500e4, growth: 2.0, blurb: '체력 회복이 빨라지고 부상이 줄어든다' },
    store: { name: '구단 스토어', base: 1800e4, growth: 2.05, blurb: '팬 한 명당 굿즈 수입이 늘어난다' },
    scout: { name: '스카우트 네트워크', base: 1200e4, growth: 2.0, blurb: '이적 시장 매물이 늘고 잠재력을 정확히 본다' },
  };
  const FAC_KEYS = Object.keys(FACILITIES);

  const trainMult = (l) => 1 + 0.15 * (l - 1);
  const medMult = (l) => 1 + 0.12 * (l - 1);
  const storeMult = (l) => 1 + 0.3 * (l - 1);
  const youthCount = (l) => 1 + Math.floor(l / 3);
  const marketSize = (l) => 6 + Math.floor(l / 2);
  const scoutSpread = (l) => Math.max(0, 12 - Math.round(l * 1.25));

  /* ---------------------------------------------------------------- 이름 */

  const SURNAMES = '김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허남심노하곽성차주우구민진나엄원천방공현함변염여추도소석선설마길연위표명기반라왕금옥육인맹제모탁국어은편용'.split('');
  const GIVEN1 = '민서지현준도우시하주건재태승성동영상정진수용기희석혁훈호원경형윤찬규범빈결율온은선종한'.split('');
  const GIVEN2 = '준우호민현수진혁훈석규원빈성재기영철환찬열웅균결율범후식국'.split('');
  const F_FIRST = ['마르코', '루카스', '다니엘', '하비에르', '안드레', '니콜라스', '마테오', '토마스', '레오', '이반', '파블로', '세르히오', '카를로스', '디에고', '알렉스', '라파엘', '브루노', '펠리페', '조나단', '케빈', '루이스', '에밀', '오스카', '사무엘', '유세프', '아마두', '이삭', '엔조', '미겔', '라울', '휴고', '테오', '마티아스', '얀', '올리버', '해리', '잭', '페드로', '주앙', '티아고', '아드리안', '빅토르', '막심', '야쿠브', '미하일', '루벤', '세드릭', '오마르', '이브라힘', '칼리두', '소피앙', '닐스', '라스무스', '보리스'];
  const F_LAST = ['실바', '산토스', '로드리게스', '페레이라', '곤살레스', '무뇨스', '페르난데스', '로페스', '마르티네스', '가르시아', '로시', '비안키', '콘티', '뮐러', '슈미트', '베버', '바그너', '뒤부아', '모로', '르루아', '지루', '데용', '얀선', '스미스', '존스', '윌리엄스', '브라운', '테일러', '코바치', '노바크', '호르바트', '페트로프', '이바노프', '디알로', '트라오레', '칸테', '멘사', '나카무라', '스즈키', '다나카', '알리', '하산', '요르겐센', '닐센', '안데르손', '칼손', '올센', '레예스', '카스트로', '오카포'];
  const PLACES = ['한강', '남산', '동해', '서해', '백두', '한라', '낙동', '금강', '소백', '태백', '설악', '가야', '탐라', '무등', '달구벌', '빛고을', '한밭', '미추홀', '서라벌', '완산', '온조', '관악', '도봉', '계룡', '속리', '덕유', '오대', '월출', '팔공', '가지', '청량', '두물', '은하', '새벽', '바람골', '솔내', '갈매', '여울', '노을', '별빛'];
  const SUFFIXES = ['FC', '유나이티드', '시티', '레인저스', '원더러스', '로버스', '애슬레틱', '스타즈', '킹스', '웨이브즈', '나이츠', '알비온', '호크스', '마린즈', '스파르탄스', '이글스', '팰컨스', '볼츠', 'SC', '펄스'];

  function genName() {
    if (chance(0.68)) {
      const a = pick(GIVEN1);
      let b = pick(GIVEN2);
      if (b === a) b = pick(GIVEN2);
      return pick(SURNAMES) + a + b;
    }
    return pick(F_FIRST) + ' ' + pick(F_LAST);
  }
  function genClubName(used) {
    for (let i = 0; i < 50; i++) {
      const place = pick(PLACES);
      const name = place + ' ' + pick(SUFFIXES);
      if (!used || (!used.has(name) && !used.has(place))) return { name, short: place };
    }
    const place = pick(PLACES);
    return { name: place + ' ' + pick(SUFFIXES) + ' ' + randInt(2, 9), short: place };
  }

  /* ------------------------------------------------------------- 문자열 */

  function hasBatchim(word) {
    const ch = String(word).charCodeAt(String(word).length - 1);
    if (ch >= 0xAC00 && ch <= 0xD7A3) return (ch - 0xAC00) % 28 !== 0;
    return false;
  }
  const josa = (word, withB, withoutB) => word + (hasBatchim(word) ? withB : withoutB);

  function fmtInt(n) { return Math.round(n).toLocaleString('ko-KR'); }
  // 1.2억, 3,500만, 8,000원 식의 한국식 금액 표기
  function fmtMoney(n, opts) {
    const sign = n < 0 ? '-' : '';
    const a = Math.abs(n);
    const pre = opts && opts.plain ? '' : '₩';
    if (a >= 1e12) return sign + pre + String(parseFloat((a / 1e12).toFixed(a >= 1e13 ? 0 : 1))) + '조';
    if (a >= 1e10) return sign + pre + fmtInt(Math.floor(a / 1e8)) + '억';
    if (a >= 1e8) return sign + pre + String(parseFloat((a / 1e8).toFixed(a >= 1e9 ? 1 : 2))) + '억';
    if (a >= 1e4) return sign + pre + fmtInt(Math.floor(a / 1e4)) + '만';
    return sign + pre + fmtInt(a) + (pre ? '' : '원');
  }
  function roundMoney(v) {
    if (!(v > 0)) return 0;
    const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 2));
    return Math.round(v / mag) * mag;
  }

  /* ---------------------------------------------------------------- 선수 */

  const KIT_NUMBERS = {
    GK: [1, 12, 21, 31, 41],
    DF: [2, 3, 4, 5, 13, 15, 22, 23, 24, 25, 26, 32],
    MF: [6, 8, 10, 14, 16, 17, 18, 20, 27, 28, 34],
    FW: [9, 11, 7, 19, 29, 30, 33, 39],
  };
  function assignNumber(s, pos) {
    const used = new Set(s.players.map((p) => p.num));
    for (const n of KIT_NUMBERS[pos]) if (!used.has(n)) return n;
    for (let n = 2; n < 100; n++) if (!used.has(n)) return n;
    return 99;
  }

  function makePlayer(s, o) {
    const ovr = clamp(o.ovr, 15, 97);
    return {
      id: s.nextId++,
      name: o.name || genName(),
      pos: o.pos,
      age: o.age,
      ovr: Math.round(ovr * 100) / 100,
      pot: Math.round(clamp(Math.max(o.pot, ovr), 15, 99)),
      fit: 100,
      inj: 0,
      goals: 0,
      apps: 0,
      sGoals: 0,
      sApps: 0,
      youth: !!o.youth,
      joined: s.season,
      rest: false,
      num: 0,
    };
  }
  const ovrOf = (p) => Math.floor(p.ovr);
  function playerValue(p) {
    let v = 5e7 * Math.pow(4, (p.ovr - 50) / 10);
    const gap = Math.max(0, p.pot - p.ovr);
    if (p.age <= 21) v *= 1 + gap / 22;
    else if (p.age <= 25) v *= 1 + gap / 35;
    else if (p.age >= 30) v *= Math.max(0.2, 1 - (p.age - 29) * 0.14);
    return roundMoney(v);
  }
  const playerWage = (p) => roundMoney(3e5 * Math.pow(4, (p.ovr - 50) / 10));
  const sellPrice = (p) => roundMoney(playerValue(p) * ECON.sellRate);
  function ageFactor(age) {
    if (age <= 19) return 1.15;
    if (age <= 21) return 1;
    if (age <= 23) return 0.75;
    if (age <= 25) return 0.5;
    if (age <= 27) return 0.28;
    if (age <= 29) return 0.12;
    return 0;
  }
  const gapFactor = (p) => clamp((p.pot - p.ovr) / 8, 0, 1);
  // 컨디션이 경기력에 반영된 실효 능력치
  const effOf = (p) => p.ovr * (0.82 + 0.18 * p.fit / 100);

  function pickPos() {
    const r = rng();
    if (r < 0.12) return 'GK';
    if (r < 0.44) return 'DF';
    if (r < 0.76) return 'MF';
    return 'FW';
  }

  function squadWages(s) {
    let w = 0;
    for (const p of s.players) w += playerWage(p);
    return w;
  }

  /* ------------------------------------------------------------- 라인업 */

  function lineup(s) {
    const f = FORMATIONS[s.formation] || FORMATIONS['4-4-2'];
    const healthy = s.players.filter((p) => p.inj <= 0);
    let avail = healthy.filter((p) => !p.rest);
    if (avail.length < 11) avail = healthy; // 휴식 지정은 인원이 모자라면 무시
    const used = new Set();
    const xi = [];
    for (const pos of POSITIONS) {
      const cands = avail.filter((p) => p.pos === pos).sort((a, b) => effOf(b) - effOf(a));
      for (let i = 0; i < f[pos]; i++) {
        const p = cands[i];
        if (p) { xi.push({ id: p.id, pos, eff: effOf(p), oop: false }); used.add(p.id); }
        else xi.push({ id: null, pos, eff: 0, oop: true });
      }
    }
    for (const slot of xi) {
      if (slot.id !== null) continue;
      const best = avail.filter((p) => !used.has(p.id))
        .sort((a, b) => effOf(b) - effOf(a))
        .find((p) => (slot.pos === 'GK') === (p.pos === 'GK')) ||
        avail.filter((p) => !used.has(p.id)).sort((a, b) => effOf(b) - effOf(a))[0];
      if (best) {
        const gkSwap = (slot.pos === 'GK') !== (best.pos === 'GK');
        slot.id = best.id;
        slot.eff = effOf(best) * (gkSwap ? 0.55 : 0.82);
        used.add(best.id);
      } else {
        slot.eff = 15; // 빈자리: 사실상 10명이 뛰는 셈
      }
    }
    const bench = s.players.filter((p) => !used.has(p.id)).sort((a, b) => effOf(b) - effOf(a));
    return { xi, bench };
  }

  function rateXI(xi) {
    let a = 0, aw = 0, d = 0, dw = 0, o = 0;
    for (const s of xi) {
      a += s.eff * W_ATT[s.pos]; aw += W_ATT[s.pos];
      d += s.eff * W_DEF[s.pos]; dw += W_DEF[s.pos];
      o += s.eff;
    }
    return { att: a / aw, def: d / dw, ovr: o / xi.length };
  }

  function teamRating(s, xi, order) {
    const base = rateXI(xi);
    const f = FORMATIONS[s.formation] || FORMATIONS['4-4-2'];
    const t = TACTICS[s.tactic] || TACTICS.balanced;
    let att = base.att + f.att + t.att;
    let def = base.def + f.def + t.def;
    if (order && ORDERS[order]) { att += ORDERS[order].att; def += ORDERS[order].def; }
    return { att, def, ovr: base.ovr };
  }

  function xg(att, def, home) {
    return clamp(1.3 * Math.exp((att - def) * 0.085) * (home ? 1.12 : 0.92), 0.12, 5.5);
  }

  function poissonPmf(lambda, k) {
    let p = Math.exp(-lambda);
    for (let i = 1; i <= k; i++) p *= lambda / i;
    return p;
  }
  function outcomeProbs(lh, la) {
    let w = 0, d = 0, l = 0;
    for (let i = 0; i <= 10; i++) {
      const pi = poissonPmf(lh, i);
      for (let j = 0; j <= 10; j++) {
        const pj = pi * poissonPmf(la, j);
        if (i > j) w += pj; else if (i === j) d += pj; else l += pj;
      }
    }
    const t = w + d + l;
    return { w: w / t, d: d / t, l: l / t };
  }

  /* ---------------------------------------------------------------- 리그 */

  function genTeam(s, tier, bias, used) {
    const n = genClubName(used);
    used.add(n.name); used.add(n.short);
    const base = TIERS[tier].ai + bias + rand(-4, 4);
    const tilt = rand(-3, 3);
    return {
      id: 't' + (s.nextTeamId++),
      name: n.name,
      short: n.short,
      kit: pick(KIT_KEYS),
      att: Math.round((base + tilt) * 10) / 10,
      def: Math.round((base - tilt) * 10) / 10,
      stars: [genName(), genName(), genName(), genName()], // GK, DF, MF, FW
    };
  }

  function makeFixtures(ids) {
    const n = ids.length;
    const arr = shuffle(ids.slice());
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const ms = [];
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        ms.push((r + i) % 2 === 0 ? { h: a, a: b } : { h: b, a: a });
      }
      rounds.push(ms);
      arr.splice(1, 0, arr.pop());
    }
    const second = rounds.map((ms) => ms.map((m) => ({ h: m.a, a: m.h })));
    return rounds.concat(second);
  }

  function newLeague(s, tier, keep) {
    const used = new Set([s.club.name]);
    const teams = (keep || []).map((t) => {
      used.add(t.name); used.add(t.short);
      const drift = rand(-2, 2);
      return Object.assign({}, t, { att: Math.round((t.att + drift + rand(-1, 1)) * 10) / 10, def: Math.round((t.def + drift + rand(-1, 1)) * 10) / 10 });
    });
    let favorite = teams.length === 0;
    while (teams.length < 7) {
      const bias = favorite ? 4 : rand(-2, 2);
      favorite = false;
      teams.push(genTeam(s, tier, bias, used));
    }
    const ids = ['me'].concat(teams.map((t) => t.id));
    const table = {};
    for (const id of ids) table[id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
    s.league = { tier, teams, fixtures: makeFixtures(ids), table };
  }

  function teamById(s, id) {
    if (id === 'me') return { id: 'me', name: s.club.name, short: s.club.short, kit: s.club.kit, me: true };
    return s.league.teams.find((t) => t.id === id);
  }

  function standings(s) {
    const rows = Object.keys(s.league.table).map((id) => {
      const t = teamById(s, id);
      const r = s.league.table[id];
      return Object.assign({ id, name: t.name, short: t.short, kit: t.kit, me: id === 'me', gd: r.gf - r.ga }, r);
    });
    rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || (a.me ? -1 : b.me ? 1 : a.name.localeCompare(b.name)));
    return rows;
  }
  const leaguePos = (s) => standings(s).findIndex((r) => r.me) + 1;

  function recordResult(s, h, a, hg, ag) {
    const th = s.league.table[h], ta = s.league.table[a];
    th.p++; ta.p++;
    th.gf += hg; th.ga += ag; ta.gf += ag; ta.ga += hg;
    if (hg > ag) { th.w++; ta.l++; th.pts += 3; th.form.push('W'); ta.form.push('L'); }
    else if (hg < ag) { ta.w++; th.l++; ta.pts += 3; th.form.push('L'); ta.form.push('W'); }
    else { th.d++; ta.d++; th.pts++; ta.pts++; th.form.push('D'); ta.form.push('D'); }
    if (th.form.length > 5) th.form.shift();
    if (ta.form.length > 5) ta.form.shift();
  }

  function myFixture(s, round) {
    const r = s.league.fixtures[round == null ? s.round : round];
    return r ? r.find((m) => m.h === 'me' || m.a === 'me') : null;
  }

  // 다음 경기 전망(경기 준비 화면용)
  function matchPreview(s) {
    const fx = myFixture(s);
    if (!fx) return null;
    const home = fx.h === 'me';
    const opp = teamById(s, home ? fx.a : fx.h);
    const me = teamRating(s, lineup(s).xi);
    const lh = home ? xg(me.att, opp.def, true) : xg(opp.att, me.def, true);
    const la = home ? xg(opp.att, me.def, false) : xg(me.att, opp.def, false);
    const pr = outcomeProbs(lh, la);
    const mine = home ? pr : { w: pr.l, d: pr.d, l: pr.w };
    const rows = standings(s);
    return { fx, home, opp, me, oppPos: rows.findIndex((r) => r.id === opp.id) + 1, probs: mine };
  }

  /* ---------------------------------------------------------------- 경제 */

  function incomeRates(s) {
    const t = TIERS[s.tier];
    const sponsor = ECON.sponsorPerRound * t.scale * (1 + 0.05 * Math.min(10, totalTrophies(s))) / ROUND_SECONDS;
    const merch = s.fans * ECON.merchPerFanRound * storeMult(s.fac.store) / ROUND_SECONDS;
    return { sponsor, merch, total: sponsor + merch };
  }
  const stadiumCap = (s) => STADIUM_CAP[s.fac.stadium - 1];
  function expectedAttendance(s) {
    let mood = 1;
    const form = s.league.table.me.form;
    for (const r of form) mood += r === 'W' ? 0.04 : r === 'L' ? -0.04 : 0;
    return Math.round(Math.min(stadiumCap(s), s.fans * ECON.attendRate * mood));
  }
  function facilityCost(key, level) {
    const f = FACILITIES[key];
    return roundMoney(f.base * Math.pow(f.growth, level - 1));
  }
  function totalTrophies(s) {
    let n = 0;
    for (const k in s.trophies) n += s.trophies[k];
    return n;
  }
  function addFin(s, key, v) { s.fin.cur[key] = (s.fin.cur[key] || 0) + v; }
  function emptyFin() { return { gate: 0, tv: 0, sponsor: 0, merch: 0, bonus: 0, sales: 0, wages: 0, buys: 0, build: 0 }; }

  // 한 라운드 기준 예상 손익(대시보드용)
  function roundEconomy(s) {
    const r = incomeRates(s);
    const t = TIERS[s.tier];
    const gate = expectedAttendance(s) * t.ticket / 2; // 홈 경기는 두 라운드에 한 번
    const tv = ECON.tvPerRound * t.scale;
    const wages = squadWages(s);
    const inc = { gate, tv, sponsor: r.sponsor * ROUND_SECONDS, merch: r.merch * ROUND_SECONDS };
    const total = inc.gate + inc.tv + inc.sponsor + inc.merch;
    return { inc, total, wages, net: total - wages };
  }

  function describeFacility(key, l) {
    switch (key) {
      case 'stadium': return `${fmtInt(STADIUM_CAP[l - 1])}석`;
      case 'training': return `성장 ×${trainMult(l).toFixed(2)}`;
      case 'academy': return `유망주 ${youthCount(l)}명 · 최대 잠재 ${youthPotCeil(l)}`;
      case 'medical': return `회복 ×${medMult(l).toFixed(2)} · 부상 −${Math.round((1 - injuryMult(l)) * 100)}%`;
      case 'store': return `굿즈 ×${storeMult(l).toFixed(2)}`;
      case 'scout': return `매물 ${marketSize(l)}명 · 오차 ±${Math.ceil(scoutSpread(l) / 2)}`;
      default: return '';
    }
  }
  const injuryMult = (l) => 1 - 0.06 * (l - 1);
  const youthPotCeil = (l) => Math.min(99, 66 + l * 3);

  /* ------------------------------------------------------------ 새 게임 */

  function newGame(opts) {
    opts = opts || {};
    const s = {
      v: SAVE_VERSION,
      created: Date.now(),
      lastSeen: Date.now(),
      time: 0,
      rev: 1,
      club: null,
      money: ECON.startMoney,
      fans: ECON.startFans,
      season: 1,
      round: 0,
      tier: 5,
      bestTier: 5,
      phase: 'pre',
      phaseT: 0,
      speed: 1,
      paused: false,
      formation: '4-4-2',
      tactic: 'balanced',
      players: [],
      nextId: 1,
      nextTeamId: 1,
      league: null,
      live: null,
      fac: { stadium: 1, training: 1, academy: 1, medical: 1, store: 1, scout: 1 },
      market: [],
      marketIn: MARKET_REFRESH_ROUNDS,
      youth: [],
      news: [],
      history: [],
      trophies: {},
      ach: {},
      stats: { w: 0, d: 0, l: 0, gf: 0, ga: 0, bigWin: 0, promotions: 0, unbeaten: 0, bestWin: null },
      fin: { cur: emptyFin(), prev: null },
      objective: null,
      lastResult: null,
      seasonEnd: null,
      flags: { welcome: true },
    };
    const n = genClubName();
    s.club = {
      name: (opts.name && String(opts.name).trim()) || n.name,
      short: n.short,
      kit: KITS[opts.kit] ? opts.kit : pick(KIT_KEYS),
    };
    if (opts.name) s.club.short = shortName(s.club.name);

    // 창단 스쿼드: 18명, 리그 평균보다 살짝 약하고 유망주 셋
    const base = TIERS[5].ai;
    const plan = [['GK', 2], ['DF', 6], ['MF', 6], ['FW', 4]];
    for (const [pos, n2] of plan) {
      for (let i = 0; i < n2; i++) {
        const age = randInt(20, 32);
        const ovr = base + rand(-6, 2.5) - (age >= 30 ? 0 : 0.5);
        const p = makePlayer(s, { pos, age, ovr, pot: ovr + (age < 24 ? rand(2, 9) : rand(0, 2)) });
        p.num = assignNumber(s, pos);
        s.players.push(p);
      }
    }
    for (const pos of ['DF', 'MF', 'FW']) {
      const ovr = base + rand(-9, -5);
      const p = makePlayer(s, { pos, age: randInt(17, 18), ovr, pot: rand(62, 72), youth: true });
      p.num = assignNumber(s, pos);
      s.players.push(p);
    }
    newLeague(s, 5, null);
    s.market = genMarket(s);
    s.objective = makeObjective(s);
    pushNews(s, 'club', `${josa(s.club.name, '이', '가')} 창단했습니다. 목표는 1부 리그!`);
    return s;
  }

  function shortName(name) {
    const clean = String(name).trim();
    const first = clean.split(/\s+/)[0].replace(/[^가-힣]/g, '');
    if (first.length >= 2 && first.length <= 3) return first;
    const hangul = clean.replace(/[^가-힣]/g, '');
    if (hangul.length >= 2) return hangul.slice(0, 2);
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
    return clean.slice(0, 3).toUpperCase() || 'FC';
  }

  /* ------------------------------------------------------- 시장 · 유스 */

  function genMarketPlayer(s) {
    const lvl = s.fac.scout;
    const base = TIERS[s.tier].ai;
    const age = randInt(18, 32);
    const ovr = clamp(base + rand(-7, 5) + lvl * 0.6 - (age < 21 ? 4 : 0), 25, 94);
    let pot = age < 24 ? ovr + rand(2, 10 + lvl * 1.2) : ovr + rand(0, 3);
    let gem = false;
    if (age < 22 && chance(0.04 + lvl * 0.012)) { pot += rand(6, 14); gem = true; }
    const p = makePlayer(s, { pos: pickPos(), age, ovr, pot });
    const spread = scoutSpread(lvl);
    const lo = Math.round(p.pot - rand(0, spread));
    p.potLo = Math.max(ovrOf(p), lo);
    p.potHi = Math.min(99, p.potLo + spread);
    if (p.potHi < p.pot) p.potHi = p.pot;
    p.gem = gem;
    p.price = roundMoney(playerValue(p) * rand(1.1, 1.35));
    return p;
  }
  function genMarket(s) {
    const n = marketSize(s.fac.scout);
    const list = [];
    for (let i = 0; i < n; i++) list.push(genMarketPlayer(s));
    list.sort((a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || b.ovr - a.ovr);
    return list;
  }

  function genYouth(s) {
    const lvl = s.fac.academy;
    const out = [];
    const n = youthCount(lvl) + (chance(0.3) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const ovr = 28 + lvl * 2 + rand(0, 10);
      let pot = ovr + 14 + lvl * 2.2 + rand(0, 14);
      pot = Math.min(pot, youthPotCeil(lvl) + rand(0, 4));
      const p = makePlayer(s, { pos: pickPos(), age: randInt(16, 17), ovr, pot, youth: true });
      p.until = s.season + 1; // 다음 시즌 유스 콜업 전까지 대기
      out.push(p);
    }
    return out;
  }

  function makeObjective(s) {
    const our = rateXI(lineup(s).xi).ovr;
    const diff = our - TIERS[s.tier].ai;
    const target = diff >= 5 ? 1 : diff >= 2 ? 2 : diff >= -1 ? 4 : diff >= -4 ? 5 : 6;
    return { target, reward: roundMoney(4000e4 * TIERS[s.tier].scale * (1 + (6 - target) * 0.15)), done: false };
  }
  function objectiveLabel(o, tier) {
    if (!o) return '';
    if (o.target === 1) return '리그 우승';
    if (o.target === 2 && tier > 1) return '승격 (2위 이내)';
    if (o.target === 6 && tier < 5) return '잔류 (6위 이내)';
    return `${o.target}위 이내`;
  }

  function pushNews(s, kind, text) {
    s.news.unshift({ s: s.season, r: s.round, k: kind, t: text });
    if (s.news.length > 40) s.news.length = 40;
  }

  /* ---------------------------------------------------------------- 경기 */

  function minuteAt(clock) {
    const h = T.match / 2;
    if (clock < h) return Math.floor(clock / h * 45);
    if (clock < h + T.half) return 45;
    return Math.min(90, 45 + Math.floor((clock - h - T.half) / h * 45));
  }

  function startMatch(s, out) {
    const fx = myFixture(s);
    const home = fx.h === 'me';
    const oppId = home ? fx.a : fx.h;
    const lu = lineup(s);
    s.live = {
      h: fx.h, a: fx.a, home, opp: oppId,
      clock: 0, minute: 0, hg: 0, ag: 0, mom: 0,
      xi: lu.xi.map((x) => ({ id: x.id, pos: x.pos, eff: x.eff })),
      subs: 0,
      ordersLeft: ORDERS_PER_MATCH,
      order: null,
      events: [{ m: 0, t: 'ko', side: '', text: '킥오프! 주심의 휘슬이 울린다' }],
      done: false,
    };
    s.phase = 'match';
    s.phaseT = 0;
    out.push({ kind: 'kickoff' });
  }

  function liveRatings(s) {
    const L = s.live;
    const me = teamRating(s, L.xi, L.order && L.order.k);
    const opp = teamById(s, L.opp);
    return L.home
      ? { h: me, a: { att: opp.att, def: opp.def } }
      : { h: { att: opp.att, def: opp.def }, a: me };
  }

  function liveEvent(s, ev) {
    s.live.events.push(ev);
    if (s.live.events.length > 40) s.live.events.shift();
  }

  function playerById(s, id) { return s.players.find((p) => p.id === id); }

  function simMinute(s, m, out) {
    const L = s.live;
    if (L.order && m > L.order.until) {
      liveEvent(s, { m, t: 'info', side: L.home ? 'h' : 'a', text: `${ORDERS[L.order.k].name} 지시 종료` });
      L.order = null;
    }
    const R = liveRatings(s);
    const lh = xg(R.h.att, R.a.def, true) / 90;
    const la = xg(R.a.att, R.h.def, false) / 90;
    const bias = (R.h.att + R.h.def - R.a.att - R.a.def) * 0.004;
    L.mom = clamp(L.mom * 0.78 + bias + gauss() * 0.24, -1, 1);
    const ph = lh * (1 + L.mom * 0.35);
    const pa = la * (1 - L.mom * 0.35);
    const mySide = L.home ? 'h' : 'a';

    const nameFor = (side, role) => {
      if (side === mySide) {
        const pool = L.xi.filter((x) => x.id !== null).map((x) => ({ x, p: playerById(s, x.id) })).filter((o) => o.p);
        if (!pool.length) return { name: '선수', p: null };
        if (role === 'gk') {
          const g = pool.find((o) => o.x.pos === 'GK') || pool[0];
          return { name: g.p.name, p: g.p };
        }
        const w = role === 'card' ? (o) => (o.x.pos === 'GK' ? 0.1 : 1) : (o) => W_SCORE[o.x.pos] * o.x.eff;
        const o = weighted(pool, w);
        return { name: o.p.name, p: o.p };
      }
      const t = teamById(s, L.opp);
      if (role === 'gk') return { name: t.stars[0], p: null };
      if (role === 'card') return { name: pick(t.stars.slice(1)), p: null };
      const i = weighted([1, 2, 3], (k) => [0, 0.8, 2, 5][k]);
      return { name: t.stars[i], p: null };
    };

    if (chance(ph) || chance(pa)) {
      // 같은 분에 양쪽 모두 골이 나오는 일은 막는다
      const side = rng() < ph / (ph + pa) ? 'h' : 'a';
      if (side === 'h') L.hg++; else L.ag++;
      const sc = nameFor(side, 'goal');
      if (sc.p) { sc.p.goals++; sc.p.sGoals++; }
      liveEvent(s, { m, t: 'goal', side, text: pick(GOAL_LINES)(sc.name) });
      L.mom = 0;
      out.push({ kind: 'goal', mine: side === mySide, minute: m, scorer: sc.name });
    } else if (chance((lh + la) * 0.9)) {
      const side = rng() < lh / (lh + la) ? 'h' : 'a';
      if (chance(0.5)) {
        const gk = nameFor(side === 'h' ? 'a' : 'h', 'gk');
        liveEvent(s, { m, t: 'save', side: side === 'h' ? 'a' : 'h', text: pick(SAVE_LINES)(gk.name) });
      } else {
        const sh = nameFor(side, 'goal');
        liveEvent(s, { m, t: 'miss', side, text: pick(MISS_LINES)(sh.name) });
      }
      L.mom = clamp(L.mom + (side === 'h' ? 0.35 : -0.35), -1, 1);
    } else if (chance(0.045)) {
      const side = chance(0.5) ? 'h' : 'a';
      const c = nameFor(side, 'card');
      liveEvent(s, { m, t: 'card', side, text: pick(CARD_LINES)(c.name) });
    }

    // 우리 선수 부상
    if (chance(0.0016 * injuryMult(s.fac.medical))) {
      const idx = Math.floor(rng() * L.xi.length);
      const slot = L.xi[idx];
      const p = slot.id !== null ? playerById(s, slot.id) : null;
      if (p) {
        const d = Math.max(1, Math.round(randInt(1, 4) * injuryMult(s.fac.medical)));
        p.inj = d + 1; // 경기 종료 시 1 차감된다
        liveEvent(s, { m, t: 'injury', side: mySide, text: `${p.name} 부상 (${d}경기 결장 예상)` });
        out.push({ kind: 'injury', name: p.name, rounds: d });
        const inXI = new Set(L.xi.map((x) => x.id));
        if (L.subs < 5) {
          const sub = s.players
            .filter((q) => q.inj <= 0 && !inXI.has(q.id) && q.pos === slot.pos)
            .sort((a, b) => effOf(b) - effOf(a))[0] ||
            s.players.filter((q) => q.inj <= 0 && !inXI.has(q.id) && (q.pos === 'GK') === (slot.pos === 'GK'))
              .sort((a, b) => effOf(b) - effOf(a))[0];
          if (sub) {
            L.subs++;
            L.xi[idx] = { id: sub.id, pos: slot.pos, eff: effOf(sub) * (sub.pos === slot.pos ? 1 : 0.82) };
            sub.apps++; sub.sApps++;
            liveEvent(s, { m, t: 'sub', side: mySide, text: `교체: ${p.name} → ${sub.name}` });
            return;
          }
        }
        L.xi[idx] = { id: null, pos: slot.pos, eff: 15 };
      }
    }
  }

  const GOAL_LINES = [
    (n) => `${n}의 골! 골망이 출렁인다`,
    (n) => `${josa(n, '이', '가')} 침착하게 마무리한다`,
    (n) => `${n}의 왼발 중거리 슛이 그대로 꽂힌다`,
    (n) => `코너킥 상황, ${n}의 헤더 골`,
    (n) => `${josa(n, '이', '가')} 골키퍼까지 제치고 밀어 넣는다`,
    (n) => `역습 한 방, ${n}의 골`,
  ];
  const MISS_LINES = [
    (n) => `${n}의 슈팅이 골대를 살짝 벗어난다`,
    (n) => `${n}, 결정적인 기회를 놓친다`,
    (n) => `${n}의 슛이 크로스바를 때린다`,
    (n) => `${n}의 헤더는 높이 뜬다`,
  ];
  const SAVE_LINES = [
    (n) => `${n}의 선방`,
    (n) => `${n}, 몸을 날려 막아낸다`,
    (n) => `${josa(n, '이', '가')} 일대일 상황을 막아낸다`,
  ];
  const CARD_LINES = [
    (n) => `${n} 경고`,
    (n) => `${n}, 늦은 태클로 옐로카드`,
    (n) => `${n}, 항의하다 경고를 받는다`,
  ];

  function advanceMatch(s, dt, out) {
    const L = s.live;
    L.clock += dt;
    const target = minuteAt(L.clock);
    while (L.minute < target) {
      L.minute++;
      simMinute(s, L.minute, out);
      if (L.minute === 45) liveEvent(s, { m: 45, t: 'ht', side: '', text: `하프타임 ${L.hg} : ${L.ag}` });
    }
    if (L.clock >= T.match + T.half && L.minute >= 90) endMatch(s, out);
  }

  function issueOrder(s, key) {
    const L = s.live;
    if (s.phase !== 'match' || !L || L.done) return { ok: false, msg: '경기 중에만 지시할 수 있어요' };
    if (!ORDERS[key]) return { ok: false, msg: '알 수 없는 지시예요' };
    if (L.ordersLeft <= 0) return { ok: false, msg: '이번 경기 지시를 모두 썼어요' };
    if (L.minute >= 88) return { ok: false, msg: '경기가 곧 끝나요' };
    L.ordersLeft--;
    L.order = { k: key, until: Math.min(90, L.minute + ORDER_MINUTES) };
    liveEvent(s, { m: L.minute, t: 'order', side: L.home ? 'h' : 'a', text: ORDERS[key].line });
    return { ok: true };
  }

  function simulateOther(s, m) {
    const h = teamById(s, m.h), a = teamById(s, m.a);
    m.hg = poisson(xg(h.att, a.def, true));
    m.ag = poisson(xg(a.att, h.def, false));
    recordResult(s, m.h, m.a, m.hg, m.ag);
  }

  function endMatch(s, out) {
    const L = s.live;
    L.done = true;
    liveEvent(s, { m: 90, t: 'ft', side: '', text: `경기 종료 ${L.hg} : ${L.ag}` });
    const fx = myFixture(s);
    fx.hg = L.hg; fx.ag = L.ag;
    recordResult(s, L.h, L.a, L.hg, L.ag);
    for (const m of s.league.fixtures[s.round]) if (m !== fx) simulateOther(s, m);

    const gf = L.home ? L.hg : L.ag;
    const ga = L.home ? L.ag : L.hg;
    const res = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
    const t = TIERS[s.tier];
    const opp = teamById(s, L.opp);

    // 출전 선수: 경기 수, 체력, 실전 성장
    const tm = trainMult(s.fac.training);
    for (const x of L.xi) {
      if (x.id === null) continue;
      const p = playerById(s, x.id);
      if (!p) continue;
      p.apps++; p.sApps++;
      p.fit = Math.max(30, p.fit - (p.pos === 'GK' ? rand(6, 10) : rand(17, 25)));
      p.ovr = Math.min(p.pot, p.ovr + 0.12 * tm * ageFactor(p.age) * gapFactor(p));
    }
    for (const p of s.players) if (p.inj > 0) p.inj--;

    // 수입·지출
    let gate = 0;
    if (L.home) {
      const att = Math.round(expectedAttendance(s) * rand(0.92, 1.03));
      gate = Math.min(stadiumCap(s), att) * t.ticket;
      L.attendance = Math.min(stadiumCap(s), att);
    }
    const tv = ECON.tvPerRound * t.scale;
    const bonus = (res === 'W' ? ECON.winBonus : res === 'D' ? ECON.drawBonus : 0) * t.scale;
    const wages = squadWages(s);
    s.money += gate + tv + bonus - wages;
    addFin(s, 'gate', gate); addFin(s, 'tv', tv); addFin(s, 'bonus', bonus); addFin(s, 'wages', wages);

    // 팬
    const cap = t.fanCap;
    if (res === 'W') s.fans += 20 + s.fans * 0.035 * Math.max(0.05, 1 - s.fans / cap);
    else if (res === 'D') s.fans += s.fans * 0.008 * Math.max(0, 1 - s.fans / cap);
    else s.fans -= s.fans * 0.008;
    s.fans = Math.max(100, Math.round(s.fans));

    // 통산 기록
    const st = s.stats;
    if (res === 'W') st.w++; else if (res === 'D') st.d++; else st.l++;
    st.gf += gf; st.ga += ga;
    if (res === 'W' && gf - ga >= 5) st.bigWin++;
    if (res === 'W' && (!st.bestWin || gf - ga > st.bestWin.gf - st.bestWin.ga)) {
      st.bestWin = { gf, ga, opp: opp.name, season: s.season };
    }

    const word = res === 'W' ? '승리' : res === 'D' ? '무승부' : '패배';
    s.lastResult = { round: s.round + 1, opp: opp.name, oppId: opp.id, home: L.home, gf, ga, res, gate, attendance: L.attendance || 0 };
    pushNews(s, 'match', `${s.round + 1}R ${L.home ? '홈' : '원정'} ${opp.name}전 ${gf}:${ga} ${word}`);
    if (s.money < 0) pushNews(s, 'warn', `자금이 바닥났습니다. 주급 ${fmtMoney(wages)}을 감당하기 어렵습니다`);

    s.round++;
    s.marketIn--;
    if (s.marketIn <= 0) {
      s.market = genMarket(s);
      s.marketIn = MARKET_REFRESH_ROUNDS;
      out.push({ kind: 'market' });
    }
    s.phase = 'post';
    s.phaseT = 0;
    s.rev++;
    out.push({ kind: 'fulltime', res, gf, ga, opp: opp.name, home: L.home });
    checkAchievements(s, out);
  }

  /* ------------------------------------------------------------ 시즌 */

  function endSeason(s, out) {
    const table = standings(s);
    const pos = table.findIndex((r) => r.me) + 1;
    const me = s.league.table.me;
    const tier = s.tier;
    const t = TIERS[tier];
    const prize = roundMoney(ECON.prizeBase * t.scale * PRIZE_SHARE[pos - 1]);
    s.money += prize;
    addFin(s, 'bonus', prize);

    let move = 0;
    if (pos <= 2 && tier > 1) move = -1;
    else if (pos >= 7 && tier < 5) move = 1;
    const champion = pos === 1;
    if (champion) s.trophies[tier] = (s.trophies[tier] || 0) + 1;
    if (me.l === 0) s.stats.unbeaten++;

    let objective = null;
    if (s.objective) {
      const ok = pos <= s.objective.target;
      objective = { label: objectiveLabel(s.objective, tier), ok, reward: ok ? s.objective.reward : 0 };
      if (ok) { s.money += s.objective.reward; addFin(s, 'bonus', s.objective.reward); }
    }

    const scorers = s.players.filter((p) => p.sGoals > 0).sort((a, b) => b.sGoals - a.sGoals);
    const top = scorers[0] ? { name: scorers[0].name, goals: scorers[0].sGoals } : null;

    let promoBonus = 0;
    if (move === -1) {
      promoBonus = roundMoney(ECON.promoBonus * TIERS[tier - 1].scale);
      s.money += promoBonus;
      addFin(s, 'bonus', promoBonus);
      s.fans = Math.round(s.fans * 1.2 + 500);
      s.stats.promotions++;
    } else if (move === 1) {
      s.fans = Math.round(s.fans * 0.88);
    }
    if (champion) s.fans = Math.round(s.fans * 1.08);

    const summary = {
      season: s.season, tier, tierName: t.name, pos, move, champion,
      w: me.w, d: me.d, l: me.l, gf: me.gf, ga: me.ga, pts: me.pts,
      prize, promoBonus, objective, top,
      table: table.map((r) => ({ id: r.id, name: r.name, kit: r.kit, me: r.me, pts: r.pts, gd: r.gd, w: r.w, d: r.d, l: r.l })),
      retired: [], youth: 0, fin: Object.assign({}, s.fin.cur),
    };
    s.history.unshift({ season: s.season, tier, pos, w: me.w, d: me.d, l: me.l, gf: me.gf, ga: me.ga, pts: me.pts, move, champion, top });

    // 다음 리그 구성: 우리와 함께 남는 팀은 유지한다
    let keep = null;
    if (move === 0) {
      keep = table.filter((r, i) => !r.me && !(i < 2 && tier > 1) && !(i >= 6 && tier < 5)).map((r) => s.league.teams.find((x) => x.id === r.id));
    }
    s.tier += move;
    s.bestTier = Math.min(s.bestTier, s.tier);

    // 선수 나이·노쇠·은퇴
    const retired = [];
    for (const p of s.players) {
      p.age++;
      if (p.age >= 31) {
        p.ovr = Math.max(20, p.ovr - (rand(0.4, 1.4) + (p.age - 31) * 0.55));
        p.pot = Math.min(p.pot, Math.ceil(p.ovr));
      }
      p.sGoals = 0; p.sApps = 0;
      p.fit = 100; p.inj = 0;
    }
    s.players = s.players.filter((p) => {
      const pRet = p.age >= 37 ? 1 : p.age >= 33 ? (p.age - 32) * 0.22 : 0;
      if (chance(pRet)) { retired.push(p.name); return false; }
      return true;
    });
    summary.retired = retired;
    for (const n of retired) pushNews(s, 'club', `${josa(n, '이', '가')} 은퇴를 선언했습니다`);

    // 유스 콜업
    s.youth = s.youth.filter((y) => y.until > s.season);
    const fresh = genYouth(s);
    s.youth = s.youth.concat(fresh);
    summary.youth = fresh.length;
    const gem = fresh.find((y) => y.pot >= 80);
    if (gem) pushNews(s, 'youth', `아카데미에서 특급 유망주 ${josa(gem.name, '이', '가')} 올라왔습니다 (잠재 ${gem.pot})`);
    else pushNews(s, 'youth', `유스 아카데미에서 유망주 ${fresh.length}명이 콜업 대기 중입니다`);

    // 재정 위기: 큰 빚을 지면 최고 몸값 선수를 강제로 판다
    const wages = squadWages(s);
    if (s.money < -3 * wages && s.players.length > SQUAD_MIN) {
      const star = s.players.slice().sort((a, b) => playerValue(b) - playerValue(a))[0];
      const price = sellPrice(star);
      s.players = s.players.filter((p) => p !== star);
      s.money += price;
      addFin(s, 'sales', price);
      pushNews(s, 'warn', `재정 위기로 ${josa(star.name, '을', '를')} ${fmtMoney(price)}에 매각했습니다`);
    }
    fillSquad(s);

    s.fin.prev = s.fin.cur;
    s.fin.cur = emptyFin();
    s.season++;
    s.round = 0;
    newLeague(s, s.tier, keep);
    s.market = genMarket(s);
    s.marketIn = MARKET_REFRESH_ROUNDS;
    s.objective = makeObjective(s);

    if (move === -1) pushNews(s, 'big', `${t.name} ${pos}위! ${TIERS[s.tier].name}로 승격합니다`);
    else if (move === 1) pushNews(s, 'warn', `${t.name} ${pos}위로 ${TIERS[s.tier].name} 강등`);
    if (champion) pushNews(s, 'big', `${t.name} 우승! 트로피를 들어 올렸습니다`);
    if (!champion && move === 0) pushNews(s, 'club', `${summary.season}시즌 ${t.name} ${pos}위로 마감`);

    s.seasonEnd = summary;
    s.phase = 'offseason';
    s.phaseT = 0;
    s.live = null;
    s.rev++;
    out.push({ kind: 'seasonEnd', summary });
    checkAchievements(s, out);
  }

  // 은퇴로 스쿼드가 비면 유스 → 자유계약 순으로 채운다
  function fillSquad(s) {
    const need = (pos) => s.players.filter((p) => p.pos === pos).length;
    const mins = { GK: 2, DF: 5, MF: 5, FW: 3 };
    for (const pos of POSITIONS) {
      while (need(pos) < mins[pos] || (s.players.length < 16 && pos === 'MF')) {
        const y = s.youth.filter((q) => q.pos === pos).sort((a, b) => b.ovr - a.ovr)[0];
        if (y) {
          s.youth = s.youth.filter((q) => q !== y);
          joinSquad(s, y);
          pushNews(s, 'youth', `스쿼드 공백을 메우려 유스 ${josa(y.name, '을', '를')} 1군에 올렸습니다`);
        } else {
          const p = makePlayer(s, { pos, age: randInt(20, 28), ovr: TIERS[s.tier].ai - rand(5, 9), pot: 0 });
          joinSquad(s, p);
          pushNews(s, 'club', `자유계약으로 ${POS_NAME[pos]} ${josa(p.name, '을', '를')} 데려왔습니다`);
        }
        if (s.players.length >= 16 && need(pos) >= mins[pos]) break;
      }
    }
  }

  function joinSquad(s, p) {
    delete p.price; delete p.potLo; delete p.potHi; delete p.gem; delete p.until;
    p.joined = s.season;
    p.fit = 100;
    p.inj = 0;
    p.rest = false;
    p.num = assignNumber(s, p.pos);
    s.players.push(p);
  }

  /* ------------------------------------------------------------- 업적 */

  const ACHIEVEMENTS = [
    { id: 'first_win', name: '첫 승리', desc: '공식 경기 첫 승', reward: 500e4, test: (s) => s.stats.w >= 1 },
    { id: 'wins_25', name: '이기는 습관', desc: '통산 25승', reward: 3000e4, test: (s) => s.stats.w >= 25 },
    { id: 'wins_100', name: '백승 감독', desc: '통산 100승', reward: 5e8, test: (s) => s.stats.w >= 100 },
    { id: 'goals_100', name: '골 폭죽', desc: '통산 100골', reward: 5000e4, test: (s) => s.stats.gf >= 100 },
    { id: 'big_win', name: '대승', desc: '5골 차 이상 승리', reward: 2000e4, test: (s) => s.stats.bigWin >= 1 },
    { id: 'promo', name: '첫 승격', desc: '상위 리그로 승격', reward: 5000e4, test: (s) => s.stats.promotions >= 1 },
    { id: 'tier3', name: '프로의 세계', desc: '3부 리그 진출', reward: 3e8, test: (s) => s.bestTier <= 3 },
    { id: 'tier1', name: '꿈의 무대', desc: '1부 리그 진출', reward: 30e8, test: (s) => s.bestTier <= 1 },
    { id: 'title', name: '첫 우승', desc: '어느 리그든 우승', reward: 1e8, test: (s) => totalTrophies(s) >= 1 },
    { id: 'title1', name: '정상 등극', desc: '1부 리그 우승', reward: 100e8, test: (s) => (s.trophies[1] || 0) >= 1 },
    { id: 'unbeaten', name: '무패 시즌', desc: '한 시즌 무패', reward: 3e8, test: (s) => s.stats.unbeaten >= 1 },
    { id: 'fans_10k', name: '동네 명물', desc: '팬 1만 명', reward: 3000e4, test: (s) => s.fans >= 1e4 },
    { id: 'fans_100k', name: '전국구 클럽', desc: '팬 10만 명', reward: 5e8, test: (s) => s.fans >= 1e5 },
    { id: 'fans_1m', name: '세계적 명문', desc: '팬 100만 명', reward: 50e8, test: (s) => s.fans >= 1e6 },
    { id: 'rich', name: '든든한 금고', desc: '자금 100억', reward: 0, test: (s) => s.money >= 100e8 },
    { id: 'stadium_max', name: '꿈의 구장', desc: '경기장 최고 레벨', reward: 0, test: (s) => s.fac.stadium >= FAC_MAX },
    { id: 'homegrown', name: '우리가 키웠다', desc: '유스 출신 OVR 75 선수', reward: 2e8, test: (s) => s.players.some((p) => p.youth && p.ovr >= 75) },
    { id: 'star', name: '월드클래스', desc: 'OVR 90 선수 보유', reward: 10e8, test: (s) => s.players.some((p) => p.ovr >= 90) },
  ];
  function checkAchievements(s, out) {
    for (const a of ACHIEVEMENTS) {
      if (s.ach[a.id] || !a.test(s)) continue;
      s.ach[a.id] = { season: s.season };
      if (a.reward) { s.money += a.reward; addFin(s, 'bonus', a.reward); }
      pushNews(s, 'ach', `업적 달성: ${a.name}${a.reward ? ` (+${fmtMoney(a.reward)})` : ''}`);
      out.push({ kind: 'achievement', id: a.id, name: a.name, reward: a.reward });
    }
  }

  /* ------------------------------------------------------------ 진행 */

  // hold: 오프라인 진행 중에는 비시즌에서 멈춰 새 시즌 개막을 감독에게 맡긴다
  function step(s, dt, out, hold) {
    s.time += dt;
    s.phaseT += dt;

    const r = incomeRates(s);
    s.money += r.total * dt;
    addFin(s, 'sponsor', r.sponsor * dt);
    addFin(s, 'merch', r.merch * dt);

    const tm = trainMult(s.fac.training);
    const mm = medMult(s.fac.medical);
    const playing = s.phase === 'match' && s.live ? new Set(s.live.xi.map((x) => x.id)) : null;
    for (const p of s.players) {
      const g = GROWTH_PER_SEC * tm * ageFactor(p.age) * gapFactor(p);
      if (g > 0) p.ovr = Math.min(p.pot, p.ovr + g * dt);
      if (!playing || !playing.has(p.id)) p.fit = Math.min(100, p.fit + FIT_PER_SEC * mm * dt);
    }

    switch (s.phase) {
      case 'pre':
        if (s.phaseT >= T.pre) startMatch(s, out);
        break;
      case 'match':
        advanceMatch(s, dt, out);
        break;
      case 'post':
        if (s.phaseT >= T.post) {
          if (s.round >= s.league.fixtures.length) endSeason(s, out);
          else { s.phase = 'pre'; s.phaseT = 0; s.live = null; }
        }
        break;
      case 'offseason':
        if (s.phaseT >= T.offseason && !hold) { s.phase = 'pre'; s.phaseT = 0; s.live = null; s.rev++; out.push({ kind: 'newSeason' }); }
        break;
      default:
        s.phase = 'pre'; s.phaseT = 0;
    }
  }

  // 실시간 진행: dt는 실제 초, 속도 배율을 곱해 게임 초로 바꾼다
  function tick(s, dt) {
    const out = [];
    if (s.paused || !(dt > 0)) return out;
    let remaining = dt * s.speed;
    while (remaining > 1e-9) {
      const d = Math.min(1, remaining);
      step(s, d, out);
      remaining -= d;
    }
    return out;
  }

  // 자리를 비운 동안의 진행
  function applyOffline(s, realSeconds) {
    if (s.paused || !(realSeconds > 1)) return null;
    const counted = Math.min(realSeconds, OFFLINE_CAP);
    const gameSec = counted * OFFLINE_RATE;
    const before = { money: s.money, fans: s.fans, w: s.stats.w, d: s.stats.d, l: s.stats.l, gf: s.stats.gf, ga: s.stats.ga, season: s.season, tier: s.tier };
    const events = [];
    let t = gameSec;
    while (t > 1e-9) {
      const d = Math.min(1, t);
      step(s, d, events, true);
      t -= d;
    }
    const held = s.phase === 'offseason';
    if (held) s.phaseT = 0; // 돌아온 감독이 비시즌을 온전히 볼 수 있게
    return {
      realSeconds, counted, gameSec, capped: realSeconds > OFFLINE_CAP, held,
      money: s.money - before.money,
      fans: s.fans - before.fans,
      w: s.stats.w - before.w, d: s.stats.d - before.d, l: s.stats.l - before.l,
      gf: s.stats.gf - before.gf, ga: s.stats.ga - before.ga,
      seasons: events.filter((e) => e.kind === 'seasonEnd').map((e) => e.summary),
      achievements: events.filter((e) => e.kind === 'achievement'),
      events,
    };
  }

  /* ------------------------------------------------------------- 행동 */

  const ok = (msg) => ({ ok: true, msg });
  const no = (msg) => ({ ok: false, msg });
  const inLiveXI = (s, id) => s.phase === 'match' && s.live && !s.live.done && s.live.xi.some((x) => x.id === id);

  function buyPlayer(s, id) {
    const p = s.market.find((m) => m.id === id);
    if (!p) return no('이미 다른 구단으로 떠난 선수예요');
    if (s.players.length >= SQUAD_MAX) return no(`스쿼드는 최대 ${SQUAD_MAX}명이에요`);
    if (s.money < p.price) return no(`자금이 ${fmtMoney(p.price - s.money)} 부족해요`);
    s.money -= p.price;
    addFin(s, 'buys', p.price);
    s.market = s.market.filter((m) => m !== p);
    const price = p.price;
    joinSquad(s, p);
    pushNews(s, 'transfer', `${josa(p.name, '을', '를')} ${fmtMoney(price)}에 영입했습니다`);
    s.rev++;
    return ok(`${p.name} 영입 완료`);
  }

  function sellPlayer(s, id) {
    const p = playerById(s, id);
    if (!p) return no('선수를 찾을 수 없어요');
    if (s.players.length <= SQUAD_MIN) return no(`스쿼드는 최소 ${SQUAD_MIN}명이 필요해요`);
    if (inLiveXI(s, id)) return no('경기에 뛰고 있는 선수는 팔 수 없어요');
    if (p.pos === 'GK' && s.players.filter((q) => q.pos === 'GK').length <= 1) return no('마지막 골키퍼는 팔 수 없어요');
    const price = sellPrice(p);
    s.players = s.players.filter((q) => q !== p);
    s.money += price;
    addFin(s, 'sales', price);
    pushNews(s, 'transfer', `${josa(p.name, '을', '를')} ${fmtMoney(price)}에 이적시켰습니다`);
    s.rev++;
    return ok(`${p.name} 판매 완료 (+${fmtMoney(price)})`);
  }

  function promoteYouth(s, id) {
    const y = s.youth.find((q) => q.id === id);
    if (!y) return no('유망주를 찾을 수 없어요');
    if (s.players.length >= SQUAD_MAX) return no(`스쿼드는 최대 ${SQUAD_MAX}명이에요`);
    s.youth = s.youth.filter((q) => q !== y);
    joinSquad(s, y);
    pushNews(s, 'youth', `유스 ${josa(y.name, '이', '가')} 1군 계약을 맺었습니다`);
    s.rev++;
    return ok(`${y.name} 1군 승격`);
  }

  function releaseYouth(s, id) {
    const y = s.youth.find((q) => q.id === id);
    if (!y) return no('유망주를 찾을 수 없어요');
    s.youth = s.youth.filter((q) => q !== y);
    s.rev++;
    return ok(`${y.name} 방출`);
  }

  function upgradeFacility(s, key) {
    if (!FACILITIES[key]) return no('알 수 없는 시설이에요');
    const lvl = s.fac[key];
    if (lvl >= FAC_MAX) return no('이미 최고 레벨이에요');
    const cost = facilityCost(key, lvl);
    if (s.money < cost) return no(`자금이 ${fmtMoney(cost - s.money)} 부족해요`);
    s.money -= cost;
    addFin(s, 'build', cost);
    s.fac[key] = lvl + 1;
    pushNews(s, 'build', `${FACILITIES[key].name} Lv.${lvl + 1} 공사 완료`);
    const out = [];
    checkAchievements(s, out);
    s.rev++;
    return Object.assign(ok(`${FACILITIES[key].name} Lv.${lvl + 1}`), { events: out });
  }

  function refreshMarket(s) {
    const cost = roundMoney(ECON.refreshCost * TIERS[s.tier].scale);
    if (s.money < cost) return no(`자금이 ${fmtMoney(cost - s.money)} 부족해요`);
    s.money -= cost;
    addFin(s, 'buys', cost);
    s.market = genMarket(s);
    s.marketIn = MARKET_REFRESH_ROUNDS;
    s.rev++;
    return ok('스카우트가 새 명단을 가져왔어요');
  }
  const refreshCost = (s) => roundMoney(ECON.refreshCost * TIERS[s.tier].scale);

  function toggleRest(s, id) {
    const p = playerById(s, id);
    if (!p) return no('선수를 찾을 수 없어요');
    p.rest = !p.rest;
    s.rev++;
    return ok(p.rest ? `${p.name} 휴식 지정` : `${p.name} 선발 후보 복귀`);
  }

  function setFormation(s, f) {
    if (!FORMATIONS[f]) return no('알 수 없는 포메이션이에요');
    s.formation = f; s.rev++;
    return ok(`포메이션 ${f}`);
  }
  function setTactic(s, t) {
    if (!TACTICS[t]) return no('알 수 없는 전술이에요');
    s.tactic = t; s.rev++;
    return ok(`전술: ${TACTICS[t].name}`);
  }
  function setSpeed(s, v) {
    if (SPEEDS.indexOf(v) < 0) return no('지원하지 않는 속도예요');
    s.speed = v; s.paused = false;
    return ok(`${v}배속`);
  }
  function setPaused(s, v) { s.paused = !!v; return ok(v ? '일시정지' : '재개'); }
  function renameClub(s, name) {
    const n = String(name || '').trim().slice(0, 20);
    if (n.length < 2) return no('구단 이름은 두 글자 이상이어야 해요');
    s.club.name = n;
    s.club.short = shortName(n);
    s.rev++;
    return ok(`구단 이름을 ${n}${hasBatchim(n) ? '으로' : '로'} 바꿨어요`);
  }
  function setKit(s, k) {
    if (!KITS[k]) return no('알 수 없는 색상이에요');
    s.club.kit = k; s.rev++;
    return ok(`홈 유니폼: ${KITS[k].name}`);
  }
  function skipOffseason(s) {
    if (s.phase !== 'offseason') return no('지금은 비시즌이 아니에요');
    s.phaseT = T.offseason;
    return ok('새 시즌을 시작합니다');
  }

  /* -------------------------------------------------------- 저장/불러오기 */

  function serialize(s) { return JSON.stringify(s); }
  function deserialize(str) {
    const o = typeof str === 'string' ? JSON.parse(str) : str;
    if (!o || typeof o !== 'object') throw new Error('저장 데이터가 비어 있어요');
    if (o.v !== SAVE_VERSION) throw new Error('지원하지 않는 저장 버전이에요');
    const need = ['club', 'players', 'league', 'fac', 'stats', 'fin'];
    for (const k of need) if (!o[k]) throw new Error('저장 데이터가 손상됐어요 (' + k + ')');
    if (!Array.isArray(o.players) || !Array.isArray(o.league.fixtures)) throw new Error('저장 데이터가 손상됐어요');
    if (!Number.isFinite(o.money) || !Number.isFinite(o.fans)) throw new Error('저장 데이터가 손상됐어요 (자금)');
    if (!TIERS[o.tier]) throw new Error('저장 데이터가 손상됐어요 (리그)');
    for (const k of FAC_KEYS) o.fac[k] = clamp(Math.round(o.fac[k] || 1), 1, FAC_MAX);
    if (!KITS[o.club.kit]) o.club.kit = 'red';
    if (!FORMATIONS[o.formation]) o.formation = '4-4-2';
    if (!TACTICS[o.tactic]) o.tactic = 'balanced';
    if (SPEEDS.indexOf(o.speed) < 0) o.speed = 1;
    o.flags = o.flags || {};
    o.ach = o.ach || {};
    o.trophies = o.trophies || {};
    o.youth = o.youth || [];
    o.market = o.market || [];
    o.news = o.news || [];
    o.history = o.history || [];
    return o;
  }

  return {
    SAVE_VERSION, T, ROUND_SECONDS, SPEEDS, OFFLINE_CAP, OFFLINE_RATE,
    TIERS, ECON, FORMATIONS, TACTICS, ORDERS, ORDERS_PER_MATCH, KITS, KIT_KEYS,
    FACILITIES, FAC_KEYS, FAC_MAX, STADIUM_CAP, POSITIONS, POS_NAME, SQUAD_MAX, SQUAD_MIN,
    ACHIEVEMENTS, PRIZE_SHARE,
    setRandom, seeded,
    newGame, tick, applyOffline, serialize, deserialize,
    lineup, teamRating, rateXI, xg, outcomeProbs, matchPreview, standings, leaguePos, myFixture, teamById,
    incomeRates, roundEconomy, expectedAttendance, stadiumCap, squadWages, facilityCost, describeFacility,
    playerValue, playerWage, sellPrice, effOf, ovrOf, totalTrophies, objectiveLabel, refreshCost, minuteAt,
    buyPlayer, sellPlayer, promoteYouth, releaseYouth, upgradeFacility, refreshMarket, toggleRest,
    setFormation, setTactic, setSpeed, setPaused, renameClub, setKit, skipOffseason, issueOrder,
    fmtMoney, fmtInt, josa, hasBatchim, shortName,
  };
});
