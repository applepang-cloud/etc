/*
 * 터치라인 매니저 — 게임 엔진 (방치형 축구 RPG)
 *
 * DOM에 의존하지 않는 순수 로직이다. 브라우저에서는 window.TL, Node에서는
 * module.exports로 노출된다. 모든 시간은 "게임 초" 단위이며 속도 배율은
 * tick()에서만 곱한다. 상태 객체는 JSON으로 그대로 저장할 수 있어야 한다.
 *
 * 성장 축: 선수 레벨(경험치·골드) → 돌파(★, 레벨 상한) → 스킬 레벨 → 장비 강화,
 * 그리고 감독 레벨과 특성. 구단 운영(리그·시설·팬·수입)이 골드를 만든다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TL = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SAVE_VERSION = 2;

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
  const round2 = (v) => Math.round(v * 100) / 100;
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
  function pickOdds(odds) {
    return weighted(Object.keys(odds), (k) => odds[k]);
  }

  /* ---------------------------------------------------------------- 상수 */

  // 한 라운드(1주) = 경기 준비 → 경기(전·후반 + 하프타임) → 경기 종료
  const T = { pre: 15, match: 45, half: 3, post: 5, offseason: 20 };
  const ROUND_SECONDS = T.pre + T.match + T.half + T.post;
  const SPEEDS = [1, 2, 4, 8];
  const OFFLINE_CAP = 2 * 3600; // 실제 시간 기준 최대 2시간까지 인정
  const OFFLINE_RATE = 0.5;     // 오프라인 진행은 1배속의 절반

  const TIERS = {
    5: { name: '5부 리그', label: '아마추어', ai: 42, scale: 1, ticket: 7000, fanCap: 9000, recruitLv: 1 },
    4: { name: '4부 리그', label: '세미프로', ai: 52, scale: 2.6, ticket: 11000, fanCap: 40000, recruitLv: 5 },
    3: { name: '3부 리그', label: '프로', ai: 62, scale: 7, ticket: 18000, fanCap: 160000, recruitLv: 10 },
    2: { name: '2부 리그', label: '챔피언십', ai: 71, scale: 18, ticket: 28000, fanCap: 650000, recruitLv: 15 },
    1: { name: '1부 리그', label: '프리미어', ai: 79, scale: 45, ticket: 42000, fanCap: 2500000, recruitLv: 20 },
  };

  const ECON = {
    startMoney: 3000e4,
    startFans: 600,
    sponsorPerRound: 150e4,
    tvPerRound: 150e4,
    merchPerFanRound: 300,
    winBonus: 80e4,
    drawBonus: 30e4,
    prizeBase: 6000e4,
    promoBonus: 5000e4,
    attendRate: 0.6,
    scoutCost: 500e4,
  };
  const PRIZE_SHARE = [1, 0.75, 0.6, 0.5, 0.42, 0.36, 0.3, 0.25];
  // 명성: 1부 리그 우승마다 1씩 올라 1부 상대가 강해지고 보상도 커진다(끝없는 엔드게임)
  const PRESTIGE_AI = 2.5;
  const PRESTIGE_PAY = 0.2;
  const tierAI = (s, tier) => TIERS[tier].ai + (tier === 1 ? PRESTIGE_AI * (s.prestige || 0) : 0);
  const scaleOf = (s, tier) => TIERS[tier].scale * (tier === 1 ? 1 + PRESTIGE_PAY * (s.prestige || 0) : 1);
  const SQUAD_MAX = 30;
  const SQUAD_MIN = 14;

  /* ------------------------------------------------------------- 등급·성장 */

  const GRADE_KEYS = ['N', 'R', 'SR', 'SSR', 'UR'];
  const GRADES = {
    N: { name: '일반', base: [31, 35], growth: 0.39, cost: 1, shards: 1 },
    R: { name: '희귀', base: [36, 40], growth: 0.46, cost: 1.3, shards: 3 },
    SR: { name: '영웅', base: [41, 45], growth: 0.53, cost: 1.7, shards: 8 },
    SSR: { name: '전설', base: [46, 50], growth: 0.59, cost: 2.2, shards: 20 },
    UR: { name: '신화', base: [51, 55], growth: 0.66, cost: 3, shards: 50 },
  };
  const MAX_STAR = 5;
  const STAR_OVR = 2;
  const STAR_SHARDS = [0, 5, 15, 40, 100]; // ★n → ★n+1
  const MAX_SKILL = 10;
  const levelCap = (star) => 10 + star * 10;
  const xpNeed = (lv) => Math.round(60 * Math.pow(1.12, lv - 1));
  const XP_PER_SEC = 0.35;
  const XP_START = 30, XP_BENCH = 8, XP_GOAL = 10, XP_SKILL = 5;
  const FIT_PER_SEC = 0.29;

  const POSITIONS = ['GK', 'DF', 'MF', 'FW'];
  const POS_NAME = { GK: '골키퍼', DF: '수비수', MF: '미드필더', FW: '공격수' };
  const W_ATT = { GK: 0, DF: 0.25, MF: 0.7, FW: 1.1 };
  const W_DEF = { GK: 2.2, DF: 1.0, MF: 0.45, FW: 0.08 };
  const W_SCORE = { GK: 0.01, DF: 0.6, MF: 2, FW: 5 };

  /* ---------------------------------------------------------------- 스킬 */

  // kind: passive(선발이면 팀 능력치 가산) · trigger(경기 중 발동해 슈팅) · block(실점 위기 저지)
  const SKILLS = {
    cannon: { name: '대포알 슛', pos: ['FW', 'MF'], kind: 'trigger', uses: 2, p: (l) => 0.3 + 0.03 * l,
      desc: (l) => `경기당 2번, 강력한 슈팅을 날린다 (골 확률 ${Math.round((0.3 + 0.03 * l) * 100)}%)` },
    poacher: { name: '골 냄새', pos: ['FW'], kind: 'passive', att: (l) => 0.35 + 0.13 * l, score: 2,
      desc: (l) => `팀 공격 +${(0.35 + 0.13 * l).toFixed(1)}, 이 선수에게 득점 기회가 몰린다` },
    playmaker: { name: '킬패스', pos: ['MF'], kind: 'passive', att: (l) => 0.4 + 0.15 * l,
      desc: (l) => `팀 공격 +${(0.4 + 0.15 * l).toFixed(1)}` },
    freekick: { name: '프리킥 마스터', pos: ['MF', 'FW', 'DF'], kind: 'trigger', uses: 1, p: (l) => 0.28 + 0.035 * l,
      desc: (l) => `경기당 1번, 직접 프리킥 (골 확률 ${Math.round((0.28 + 0.035 * l) * 100)}%)` },
    engine: { name: '강철 체력', pos: ['MF', 'DF'], kind: 'passive', def: (l) => 0.25 + 0.1 * l, fatigue: 0.5,
      desc: (l) => `팀 수비 +${(0.25 + 0.1 * l).toFixed(1)}, 경기 후 체력 소모 절반` },
    wall: { name: '철벽', pos: ['DF'], kind: 'passive', def: (l) => 0.4 + 0.15 * l,
      desc: (l) => `팀 수비 +${(0.4 + 0.15 * l).toFixed(1)}` },
    tackle: { name: '슬라이딩 태클', pos: ['DF'], kind: 'block', uses: 1, p: (l) => 0.2 + 0.025 * l,
      desc: (l) => `경기당 1번, 실점 위기를 ${Math.round((0.2 + 0.025 * l) * 100)}% 확률로 끊어낸다` },
    save: { name: '슈퍼 세이브', pos: ['GK'], kind: 'block', uses: 2, p: (l) => 0.2 + 0.025 * l,
      desc: (l) => `경기당 2번, 실점 위기를 ${Math.round((0.2 + 0.025 * l) * 100)}% 확률로 막아낸다` },
    sweeper: { name: '스위퍼 키퍼', pos: ['GK'], kind: 'passive', def: (l) => 0.5 + 0.15 * l,
      desc: (l) => `팀 수비 +${(0.5 + 0.15 * l).toFixed(1)}` },
    captain: { name: '캡틴', pos: ['GK', 'DF', 'MF', 'FW'], kind: 'passive', rare: true, att: (l) => 0.25 + 0.08 * l, def: (l) => 0.25 + 0.08 * l,
      desc: (l) => `팀 공격·수비 +${(0.25 + 0.08 * l).toFixed(1)}` },
  };
  const SKILL_TRIGGER_P = 0.022; // 선수 한 명당 분당 발동 확률

  /* ---------------------------------------------------------------- 장비 */

  const SLOTS = { boots: '축구화', gear: '보호구' };
  const SLOT_KEYS = ['boots', 'gear'];
  const ITEM_NAMES = {
    boots: ['스터드 축구화', '스피드 축구화', '컨트롤 축구화', '파워 축구화', '골든 부트'],
    gear: ['정강이 보호대', '압박 셔츠', '캡틴 완장', '테이핑 키트', '카본 보호대'],
  };
  const ITEM_STAT = {
    N: { base: 0.4, step: 0.08 }, R: { base: 0.8, step: 0.1 }, SR: { base: 1.2, step: 0.12 },
    SSR: { base: 1.8, step: 0.15 }, UR: { base: 2.5, step: 0.18 },
  };
  const MAX_PLUS = 15;
  const INVENTORY_MAX = 60;
  const DROP_CHANCE = { W: 0.4, D: 0.18, L: 0.06 };

  /* ---------------------------------------------------------------- 감독 */

  const TALENTS = {
    atk: { name: '공격 전술가', max: 10, desc: (n) => `팀 공격 +${(0.4 * n).toFixed(1)}` },
    def: { name: '수비 전술가', max: 10, desc: (n) => `팀 수비 +${(0.4 * n).toFixed(1)}` },
    train: { name: '명 트레이너', max: 10, desc: (n) => `선수 경험치 +${10 * n}%` },
    money: { name: '재무 전문가', max: 10, desc: (n) => `모든 수입 +${5 * n}%` },
    nego: { name: '협상가', max: 10, desc: (n) => `레벨업·스카우트 비용 −${3 * n}%` },
    chari: { name: '카리스마', max: 5, desc: (n) => `감독 지시 효과 +${15 * n}%${n >= 5 ? ', 경기당 지시 +1회' : ''}` },
  };
  const TALENT_KEYS = Object.keys(TALENTS);
  const MGR_TITLES = [[40, '축구의 신'], [30, '전설의 명장'], [20, '명장'], [10, '프로 감독'], [5, '유망한 감독'], [1, '초보 감독']];
  const mgrXpNeed = (lv) => Math.round(80 * Math.pow(1.18, lv - 1));
  const mgrTitle = (lv) => MGR_TITLES.find(([n]) => lv >= n)[1];

  /* ------------------------------------------------------------- 전술·경기 */

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
  // 경기 중 감독 지시: 15분간 유지, 경기당 2회(카리스마 5포인트면 3회)
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

  /* ---------------------------------------------------------------- 시설 */

  const STADIUM_CAP = [1500, 3000, 5000, 8000, 12000, 18000, 27000, 40000, 56000, 75000];
  const FAC_MAX = 10;
  const FACILITIES = {
    stadium: { name: '경기장', base: 3000e4, growth: 2.15, blurb: '관중 수용 인원이 늘어 홈 경기 입장 수입이 커진다' },
    training: { name: '훈련장', base: 2500e4, growth: 2.1, blurb: '선수들이 경험치를 더 빨리 쌓는다' },
    academy: { name: '유소년 아카데미', base: 2000e4, growth: 2.1, blurb: '시즌마다 더 많고 등급 높은 유망주가 올라온다' },
    medical: { name: '메디컬 센터', base: 1500e4, growth: 2.0, blurb: '체력 회복이 빨라지고 부상이 줄어든다' },
    store: { name: '구단 스토어', base: 1800e4, growth: 2.05, blurb: '팬 한 명당 굿즈 수입이 늘어난다' },
    scout: { name: '스카우트 네트워크', base: 1200e4, growth: 2.0, blurb: '스카우트에서 높은 등급이 더 잘 나온다' },
  };
  const FAC_KEYS = Object.keys(FACILITIES);

  const trainMult = (l) => 1 + 0.15 * (l - 1);
  const medMult = (l) => 1 + 0.12 * (l - 1);
  const storeMult = (l) => 1 + 0.3 * (l - 1);
  const injuryMult = (l) => 1 - 0.06 * (l - 1);
  const youthCount = (l) => 1 + Math.floor(l / 3);

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
  // 1.2억, 3,500만, ₩8,000 식의 한국식 금액 표기
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

  function pickPos() {
    const r = rng();
    if (r < 0.12) return 'GK';
    if (r < 0.44) return 'DF';
    if (r < 0.76) return 'MF';
    return 'FW';
  }
  function pickSkill(pos) {
    if (chance(0.07)) return 'captain';
    const keys = Object.keys(SKILLS).filter((k) => !SKILLS[k].rare && SKILLS[k].pos.indexOf(pos) >= 0);
    return pick(keys);
  }

  function makePlayer(s, o) {
    const g = GRADES[o.grade] ? o.grade : 'N';
    const pos = o.pos || pickPos();
    const p = {
      id: s.nextId++,
      name: o.name || genName(),
      pos,
      grade: g,
      star: 1,
      lv: clamp(o.lv || 1, 1, levelCap(1)),
      xp: 0,
      base: round2(o.base != null ? o.base : rand(GRADES[g].base[0], GRADES[g].base[1])),
      ovr: 0,
      skill: o.skill || pickSkill(pos),
      slv: 1,
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
      spent: 0,
    };
    p.ovr = round2(p.base + GRADES[g].growth * (p.lv - 1));
    return p;
  }

  const ovrOf = (p) => Math.floor(p.ovr);
  // 컨디션이 경기력에 반영된 실효 능력치
  const effOf = (p) => p.ovr * (0.82 + 0.18 * p.fit / 100);

  function itemBonus(it) {
    const st = ITEM_STAT[it.grade] || ITEM_STAT.N;
    return st.base + st.step * it.plus;
  }
  function gearOf(s, p) {
    const out = {};
    for (const it of s.items) if (it.owner === p.id) out[it.slot] = it;
    return out;
  }
  function gearBonus(s, p) {
    let b = 0;
    for (const it of s.items) if (it.owner === p.id) b += itemBonus(it);
    return b;
  }
  function refreshOvr(s, p) {
    p.ovr = round2(p.base + GRADES[p.grade].growth * (p.lv - 1) + STAR_OVR * (p.star - 1) + gearBonus(s, p));
  }
  function refreshAll(s) { for (const p of s.players) refreshOvr(s, p); }

  const negoMult = (s) => 1 - 0.03 * (s.mgr.tal.nego || 0);
  function levelCost(s, p) {
    return roundMoney(120e4 * GRADES[p.grade].cost * Math.pow(1.12, p.lv - 1) * negoMult(s));
  }
  function starCost(s, p) {
    if (p.star >= MAX_STAR) return null;
    return { shards: STAR_SHARDS[p.star], money: roundMoney(levelCost(s, p) * 3) };
  }
  function skillCost(s, p) {
    if (p.slv >= MAX_SKILL) return null;
    return { books: p.slv, money: roundMoney(50e4 * p.slv * p.slv * GRADES[p.grade].cost) };
  }
  const xpMult = (s) => trainMult(s.fac.training) * (1 + 0.1 * (s.mgr.tal.train || 0));

  // 경험치를 더하고 상한까지 자동 레벨업. 오른 레벨 수를 돌려준다.
  function gainXp(s, p, amount) {
    const cap = levelCap(p.star);
    if (p.lv >= cap) { p.xp = Math.min(xpNeed(p.lv), p.xp + amount); return 0; }
    p.xp += amount;
    let up = 0;
    while (p.lv < cap && p.xp >= xpNeed(p.lv)) {
      p.xp -= xpNeed(p.lv);
      p.lv++;
      up++;
    }
    if (p.lv >= cap) p.xp = Math.min(p.xp, xpNeed(p.lv));
    if (up) refreshOvr(s, p);
    return up;
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
      const rest = avail.filter((p) => !used.has(p.id)).sort((a, b) => effOf(b) - effOf(a));
      const best = rest.find((p) => (slot.pos === 'GK') === (p.pos === 'GK')) || rest[0];
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

  // 선발 선수들의 패시브 스킬 합
  function skillBonus(s, xi) {
    let att = 0, def = 0;
    for (const x of xi) {
      if (x.id === null) continue;
      const p = playerById(s, x.id);
      if (!p) continue;
      const sk = SKILLS[p.skill];
      if (!sk || sk.kind !== 'passive') continue;
      if (sk.att) att += sk.att(p.slv);
      if (sk.def) def += sk.def(p.slv);
    }
    return { att, def };
  }

  function teamRating(s, xi, order) {
    const base = rateXI(xi);
    const f = FORMATIONS[s.formation] || FORMATIONS['4-4-2'];
    const t = TACTICS[s.tactic] || TACTICS.balanced;
    const sk = skillBonus(s, xi);
    const tal = s.mgr.tal;
    let att = base.att + f.att + t.att + sk.att + 0.4 * (tal.atk || 0);
    let def = base.def + f.def + t.def + sk.def + 0.4 * (tal.def || 0);
    if (order && ORDERS[order]) {
      const m = 1 + 0.15 * (tal.chari || 0);
      att += ORDERS[order].att * m;
      def += ORDERS[order].def * m;
    }
    return { att, def, ovr: base.ovr, skill: sk };
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
    const base = tierAI(s, tier) + bias + rand(-4, 4);
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

  const moneyMult = (s) => 1 + 0.05 * (s.mgr.tal.money || 0);
  function incomeRates(s) {
    const t = TIERS[s.tier];
    const m = moneyMult(s);
    const sponsor = ECON.sponsorPerRound * scaleOf(s, s.tier) * (1 + 0.05 * Math.min(10, totalTrophies(s))) / ROUND_SECONDS * m;
    const merch = s.fans * ECON.merchPerFanRound * storeMult(s.fac.store) / ROUND_SECONDS * m;
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
  function emptyFin() { return { gate: 0, tv: 0, sponsor: 0, merch: 0, bonus: 0, sales: 0, growth: 0, scout: 0, gear: 0, build: 0 }; }

  // 한 라운드 기준 예상 수입(대시보드용)
  function roundEconomy(s) {
    const r = incomeRates(s);
    const t = TIERS[s.tier];
    const m = moneyMult(s);
    const gate = expectedAttendance(s) * t.ticket / 2 * m; // 홈 경기는 두 라운드에 한 번
    const tv = ECON.tvPerRound * scaleOf(s, s.tier) * m;
    const inc = { gate, tv, sponsor: r.sponsor * ROUND_SECONDS, merch: r.merch * ROUND_SECONDS };
    const total = inc.gate + inc.tv + inc.sponsor + inc.merch;
    return { inc, total };
  }

  function describeFacility(key, l) {
    switch (key) {
      case 'stadium': return `${fmtInt(STADIUM_CAP[l - 1])}석`;
      case 'training': return `경험치 ×${trainMult(l).toFixed(2)}`;
      case 'academy': return `유망주 ${youthCount(l)}명 · 영웅 이상 ${Math.round(youthHighOdds(l))}%`;
      case 'medical': return `회복 ×${medMult(l).toFixed(2)} · 부상 −${Math.round((1 - injuryMult(l)) * 100)}%`;
      case 'store': return `굿즈 ×${storeMult(l).toFixed(2)}`;
      case 'scout': {
        const o = scoutOddsFor(l, 'premium');
        return `프리미엄 전설 이상 ${(o.SSR + o.UR).toFixed(1)}%`;
      }
      default: return '';
    }
  }

  /* ---------------------------------------------------------- 스카우트 */

  const SCOUTS = {
    gold: { name: '일반 스카우트', odds: { N: 70, R: 26, SR: 3.5, SSR: 0.45, UR: 0.05 } },
    premium: { name: '프리미엄 스카우트', odds: { N: 0, R: 60, SR: 30, SSR: 8.5, UR: 1.5 } },
  };
  function scoutOddsFor(level, kind) {
    const base = SCOUTS[kind].odds;
    const l = level - 1;
    const o = Object.assign({}, base);
    o.SR = base.SR * (1 + 0.05 * l);
    o.SSR = base.SSR * (1 + 0.07 * l);
    o.UR = base.UR * (1 + 0.09 * l);
    const extra = (o.SR + o.SSR + o.UR) - (base.SR + base.SSR + base.UR);
    if (kind === 'gold') o.N -= extra; else o.R -= extra;
    return o;
  }
  const scoutOdds = (s, kind) => scoutOddsFor(s.fac.scout, kind);
  function scoutPrice(s, kind, count) {
    if (kind === 'premium') return { tickets: count };
    const one = roundMoney(ECON.scoutCost * TIERS[s.tier].scale * negoMult(s));
    return { money: count >= 10 ? one * 9 : one * count };
  }

  function recruit(s, grade) {
    const lv = Math.min(levelCap(1), TIERS[s.tier].recruitLv);
    return makePlayer(s, { grade, lv });
  }

  function scout(s, kind, count) {
    count = count === 10 ? 10 : 1;
    if (!SCOUTS[kind]) return no('알 수 없는 스카우트예요');
    const price = scoutPrice(s, kind, count);
    if (price.tickets && s.mat.tickets < price.tickets) return no(`티켓이 ${price.tickets - s.mat.tickets}장 부족해요`);
    if (price.money && s.money < price.money) return no(`자금이 ${fmtMoney(price.money - s.money)} 부족해요`);
    if (price.tickets) s.mat.tickets -= price.tickets;
    if (price.money) { s.money -= price.money; addFin(s, 'scout', price.money); }
    const odds = scoutOdds(s, kind);
    const grades = [];
    for (let i = 0; i < count; i++) grades.push(pickOdds(odds));
    // 10연차 보장: 프리미엄은 영웅 이상, 일반은 희귀 이상 1명
    if (count === 10) {
      const floor = kind === 'premium' ? 'SR' : 'R';
      const fi = GRADE_KEYS.indexOf(floor);
      if (!grades.some((g) => GRADE_KEYS.indexOf(g) >= fi)) grades[9] = floor;
    }
    const results = [];
    for (const g of grades) {
      const p = recruit(s, g);
      if (s.players.length < SQUAD_MAX) {
        joinSquad(s, p);
        results.push({ player: p, kept: true });
      } else {
        const shards = GRADES[g].shards * 2;
        s.mat.shards += shards;
        results.push({ player: p, kept: false, shards });
      }
      if (GRADE_KEYS.indexOf(g) >= 3) pushNews(s, 'big', `${SCOUTS[kind].name}에서 ${GRADES[g].name} ${josa(p.name, '을', '를')} 영입했습니다!`);
    }
    s.stats.scouted = (s.stats.scouted || 0) + count;
    const out = [];
    checkAchievements(s, out);
    s.rev++;
    return { ok: true, msg: `${SCOUTS[kind].name} ${count}회`, results, events: out };
  }

  /* -------------------------------------------------------------- 유스 */

  function youthOdds(l) {
    return { N: Math.max(10, 70 - 6 * l), R: 25 + 2 * l, SR: 4 + 2.2 * l, SSR: 1 + 0.9 * l, UR: 0.15 * l };
  }
  function youthHighOdds(l) {
    const o = youthOdds(l);
    const t = o.N + o.R + o.SR + o.SSR + o.UR;
    return (o.SR + o.SSR + o.UR) / t * 100;
  }
  function genYouth(s) {
    const lvl = s.fac.academy;
    const out = [];
    const n = youthCount(lvl) + (chance(0.3) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const p = makePlayer(s, { grade: pickOdds(youthOdds(lvl)), lv: 1, youth: true });
      p.until = s.season + 1; // 다음 시즌 유스 콜업 전까지 대기
      out.push(p);
    }
    return out;
  }

  /* -------------------------------------------------------------- 장비 */

  function dropGradeOdds(tier) {
    const tb = 5 - tier;
    return { N: Math.max(15, 55 - 8 * tb), R: 30, SR: 11 + 3 * tb, SSR: 3.5 + 1.5 * tb, UR: 0.5 + 0.5 * tb };
  }
  function makeItem(s, grade, slot) {
    const sl = slot || pick(SLOT_KEYS);
    return { id: s.nextItemId++, slot: sl, grade, plus: 0, name: pick(ITEM_NAMES[sl]), owner: null };
  }
  function addItem(s, it, out) {
    if (s.items.length >= INVENTORY_MAX) {
      const gold = dismantleValue(it);
      s.money += gold;
      addFin(s, 'sales', gold);
      if (out) out.push({ kind: 'loot', item: it, auto: gold });
      return false;
    }
    s.items.push(it);
    if (out) out.push({ kind: 'loot', item: it });
    return true;
  }
  const enhanceCost = (it) => roundMoney(20e4 * GRADES[it.grade].cost * Math.pow(1.28, it.plus));
  function enhanceSpent(it) {
    let t = 0;
    for (let i = 0; i < it.plus; i++) t += roundMoney(20e4 * GRADES[it.grade].cost * Math.pow(1.28, i));
    return t;
  }
  const dismantleValue = (it) => roundMoney(8e4 * GRADES[it.grade].cost * (1 + it.plus * 0.5) + enhanceSpent(it) * 0.3);

  /* -------------------------------------------------------------- 목표 */

  function makeObjective(s) {
    const our = rateXI(lineup(s).xi).ovr;
    const diff = our - tierAI(s, s.tier);
    const target = diff >= 5 ? 1 : diff >= 2 ? 2 : diff >= -1 ? 4 : diff >= -4 ? 5 : 6;
    return { target, reward: roundMoney(4000e4 * scaleOf(s, s.tier) * (1 + (6 - target) * 0.15)), done: false };
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

  /* ------------------------------------------------------------ 새 게임 */

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
      prestige: 0,
      phase: 'pre',
      phaseT: 0,
      speed: 1,
      paused: false,
      formation: '4-4-2',
      tactic: 'balanced',
      players: [],
      nextId: 1,
      nextTeamId: 1,
      nextItemId: 1,
      league: null,
      live: null,
      fac: { stadium: 1, training: 1, academy: 1, medical: 1, store: 1, scout: 1 },
      mat: { tickets: 3, shards: 5, books: 2 },
      items: [],
      mgr: { lv: 1, xp: 0, pts: 0, tal: { atk: 0, def: 0, train: 0, money: 0, nego: 0, chari: 0 } },
      youth: [],
      news: [],
      history: [],
      trophies: {},
      ach: {},
      stats: { w: 0, d: 0, l: 0, gf: 0, ga: 0, bigWin: 0, promotions: 0, unbeaten: 0, bestWin: null, scouted: 0, skills: 0, bestGrade: 'N' },
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

    // 창단 스쿼드: 대부분 일반 등급, 포지션마다 희귀 한 명, 에이스 공격수 한 명
    const plan = [['GK', 2], ['DF', 6], ['MF', 6], ['FW', 3]];
    for (const [pos, cnt] of plan) {
      for (let i = 0; i < cnt; i++) {
        const grade = i === 0 && pos !== 'GK' ? 'R' : chance(0.15) ? 'R' : 'N';
        const p = makePlayer(s, { pos, grade, lv: randInt(1, 4) });
        p.num = assignNumber(s, pos);
        s.players.push(p);
      }
    }
    const ace = makePlayer(s, { pos: 'FW', grade: 'SR', lv: 1, skill: 'cannon' });
    ace.num = assignNumber(s, 'FW');
    s.players.push(ace);
    s.stats.bestGrade = 'SR';
    refreshAll(s);
    newLeague(s, 5, null);
    s.objective = makeObjective(s);
    pushNews(s, 'club', `${josa(s.club.name, '이', '가')} 창단했습니다. 창단 선물로 프리미엄 스카우트 티켓 3장을 받았습니다`);
    return s;
  }

  /* ---------------------------------------------------------------- 경기 */

  function minuteAt(clock) {
    const h = T.match / 2;
    if (clock < h) return Math.floor(clock / h * 45);
    if (clock < h + T.half) return 45;
    return Math.min(90, 45 + Math.floor((clock - h - T.half) / h * 45));
  }

  const ordersPerMatch = (s) => ORDERS_PER_MATCH + ((s.mgr.tal.chari || 0) >= 5 ? 1 : 0);

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
      ordersLeft: ordersPerMatch(s),
      order: null,
      skillUse: {},
      scorers: {},
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

  function xiPlayers(s) {
    return s.live.xi.filter((x) => x.id !== null).map((x) => ({ x, p: playerById(s, x.id) })).filter((o) => o.p);
  }

  function scoreGoal(s, side, name, p, m, out, line) {
    const L = s.live;
    if (side === 'h') L.hg++; else L.ag++;
    if (p) { p.goals++; p.sGoals++; L.scorers[p.id] = (L.scorers[p.id] || 0) + 1; }
    liveEvent(s, { m, t: 'goal', side, text: line || pick(GOAL_LINES)(name) });
    L.mom = 0;
    out.push({ kind: 'goal', mine: side === (L.home ? 'h' : 'a'), minute: m, scorer: name });
  }

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
    const oppSide = L.home ? 'a' : 'h';

    const nameFor = (side, role) => {
      if (side === mySide) {
        const pool = xiPlayers(s);
        if (!pool.length) return { name: '선수', p: null };
        if (role === 'gk') {
          const g = pool.find((o) => o.x.pos === 'GK') || pool[0];
          return { name: g.p.name, p: g.p };
        }
        const w = role === 'card'
          ? (o) => (o.x.pos === 'GK' ? 0.1 : 1)
          : (o) => W_SCORE[o.x.pos] * o.x.eff * ((SKILLS[o.p.skill] && SKILLS[o.p.skill].score) || 1);
        const o = weighted(pool, w);
        return { name: o.p.name, p: o.p };
      }
      const t = teamById(s, L.opp);
      if (role === 'gk') return { name: t.stars[0], p: null };
      if (role === 'card') return { name: pick(t.stars.slice(1)), p: null };
      const i = weighted([1, 2, 3], (k) => [0, 0.8, 2, 5][k]);
      return { name: t.stars[i], p: null };
    };

    let happened = false;
    if (chance(ph) || chance(pa)) {
      happened = true;
      // 같은 분에 양쪽 모두 골이 나오는 일은 막는다
      const side = rng() < ph / (ph + pa) ? 'h' : 'a';
      const sc = nameFor(side, 'goal');
      let blocked = false;
      if (side === oppSide) {
        // 수비 스킬: 실점 위기 저지
        for (const o of xiPlayers(s)) {
          const sk = SKILLS[o.p.skill];
          if (!sk || sk.kind !== 'block') continue;
          const used = L.skillUse[o.p.id] || 0;
          if (used >= sk.uses) continue;
          if (chance(sk.p(o.p.slv))) {
            L.skillUse[o.p.id] = used + 1;
            liveEvent(s, { m, t: 'skill', side: mySide, text: `[${sk.name}] ${o.p.name}! ${sc.name}의 결정적인 슈팅을 막아낸다` });
            out.push({ kind: 'skill', name: o.p.name, skill: sk.name, mine: true });
            s.stats.skills = (s.stats.skills || 0) + 1;
            blocked = true;
            break;
          }
        }
      }
      if (!blocked) scoreGoal(s, side, sc.name, sc.p, m, out);
      else L.mom = clamp(L.mom + (mySide === 'h' ? 0.3 : -0.3), -1, 1);
    }

    // 공격 스킬: 분당 한 번 발동 기회
    if (!happened) {
      const cands = xiPlayers(s).filter((o) => {
        const sk = SKILLS[o.p.skill];
        return sk && sk.kind === 'trigger' && (L.skillUse[o.p.id] || 0) < sk.uses;
      });
      if (cands.length && chance(SKILL_TRIGGER_P * cands.length)) {
        happened = true;
        const o = pick(cands);
        const sk = SKILLS[o.p.skill];
        L.skillUse[o.p.id] = (L.skillUse[o.p.id] || 0) + 1;
        s.stats.skills = (s.stats.skills || 0) + 1;
        out.push({ kind: 'skill', name: o.p.name, skill: sk.name, mine: true });
        if (chance(sk.p(o.p.slv))) {
          scoreGoal(s, mySide, o.p.name, o.p, m, out, `[${sk.name}] ${o.p.name}의 슈팅이 그물을 찢는다!`);
        } else {
          const gk = nameFor(oppSide, 'gk');
          liveEvent(s, { m, t: 'skill', side: mySide, text: `[${sk.name}] ${o.p.name}의 슈팅, ${gk.name}에게 막힌다` });
          L.mom = clamp(L.mom + (mySide === 'h' ? 0.4 : -0.4), -1, 1);
        }
      }
    }

    if (!happened && chance((lh + la) * 0.9)) {
      const side = rng() < lh / (lh + la) ? 'h' : 'a';
      if (chance(0.5)) {
        const gk = nameFor(side === 'h' ? 'a' : 'h', 'gk');
        liveEvent(s, { m, t: 'save', side: side === 'h' ? 'a' : 'h', text: pick(SAVE_LINES)(gk.name) });
      } else {
        const sh = nameFor(side, 'goal');
        liveEvent(s, { m, t: 'miss', side, text: pick(MISS_LINES)(sh.name) });
      }
      L.mom = clamp(L.mom + (side === 'h' ? 0.35 : -0.35), -1, 1);
    } else if (!happened && chance(0.045)) {
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
    if (s.phase !== 'match' || !L || L.done) return no('경기 중에만 지시할 수 있어요');
    if (!ORDERS[key]) return no('알 수 없는 지시예요');
    if (L.ordersLeft <= 0) return no('이번 경기 지시를 모두 썼어요');
    if (L.minute >= 88) return no('경기가 곧 끝나요');
    L.ordersLeft--;
    L.order = { k: key, until: Math.min(90, L.minute + ORDER_MINUTES) };
    liveEvent(s, { m: L.minute, t: 'order', side: L.home ? 'h' : 'a', text: ORDERS[key].line });
    return ok(`${ORDERS[key].name} 지시`);
  }

  function simulateOther(s, m) {
    const h = teamById(s, m.h), a = teamById(s, m.a);
    m.hg = poisson(xg(h.att, a.def, true));
    m.ag = poisson(xg(a.att, h.def, false));
    recordResult(s, m.h, m.a, m.hg, m.ag);
  }

  function gainMgrXp(s, amount, out) {
    const g = s.mgr;
    g.xp += amount;
    while (g.xp >= mgrXpNeed(g.lv)) {
      g.xp -= mgrXpNeed(g.lv);
      g.lv++;
      g.pts++;
      let gift = '';
      if (g.lv % 5 === 0) { s.mat.tickets++; gift = ' · 프리미엄 티켓 1장'; }
      pushNews(s, 'ach', `감독 레벨 ${g.lv} 달성! 특성 포인트 +1${gift}`);
      out.push({ kind: 'mgrLevel', lv: g.lv });
    }
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
    const mm = moneyMult(s);

    // 출전 선수: 경기 수, 체력, 경험치
    const xm = xpMult(s);
    const played = new Set();
    let levels = 0;
    for (const x of L.xi) {
      if (x.id === null) continue;
      const p = playerById(s, x.id);
      if (!p) continue;
      played.add(p.id);
      p.apps++; p.sApps++;
      const sk = SKILLS[p.skill];
      const drain = p.pos === 'GK' ? rand(6, 10) : rand(17, 25);
      p.fit = Math.max(30, p.fit - drain * (sk && sk.fatigue ? sk.fatigue : 1));
      const goals = L.scorers[p.id] || 0;
      const skills = L.skillUse[p.id] || 0;
      levels += gainXp(s, p, (XP_START + goals * XP_GOAL + skills * XP_SKILL) * (res === 'W' ? 1.2 : 1) * xm);
    }
    for (const p of s.players) {
      if (!played.has(p.id)) levels += gainXp(s, p, XP_BENCH * xm);
      if (p.inj > 0) p.inj--;
    }

    // 수입
    let gate = 0;
    if (L.home) {
      const att = Math.round(expectedAttendance(s) * rand(0.92, 1.03));
      L.attendance = Math.min(stadiumCap(s), att);
      gate = L.attendance * t.ticket * mm;
    }
    const tv = ECON.tvPerRound * scaleOf(s, s.tier) * mm;
    const bonus = (res === 'W' ? ECON.winBonus : res === 'D' ? ECON.drawBonus : 0) * scaleOf(s, s.tier) * mm;
    s.money += gate + tv + bonus;
    addFin(s, 'gate', gate); addFin(s, 'tv', tv); addFin(s, 'bonus', bonus);

    // 전리품: 장비·돌파석·스킬북
    const loot = { shards: 0, books: 0, item: null };
    const tierMult = 1 + (5 - s.tier) * 0.5;
    if (res === 'W') {
      loot.shards = Math.round(randInt(1, 2) * tierMult);
      if (chance(0.25)) loot.books = 1;
    } else if (res === 'D' && chance(0.5)) {
      loot.shards = 1;
    }
    s.mat.shards += loot.shards;
    s.mat.books += loot.books;
    if (chance(DROP_CHANCE[res])) {
      const it = makeItem(s, pickOdds(dropGradeOdds(s.tier)));
      if (addItem(s, it, out)) loot.item = it;
    }

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

    gainMgrXp(s, (res === 'W' ? 40 : res === 'D' ? 20 : 10) * (1 + (5 - s.tier) * 0.25), out);

    const word = res === 'W' ? '승리' : res === 'D' ? '무승부' : '패배';
    s.lastResult = { round: s.round + 1, opp: opp.name, oppId: opp.id, home: L.home, gf, ga, res, gate, attendance: L.attendance || 0, loot, levels };
    pushNews(s, 'match', `${s.round + 1}R ${L.home ? '홈' : '원정'} ${opp.name}전 ${gf}:${ga} ${word}`);

    s.round++;
    s.phase = 'post';
    s.phaseT = 0;
    s.rev++;
    out.push({ kind: 'fulltime', res, gf, ga, opp: opp.name, home: L.home, loot, levels });
    checkAchievements(s, out);
  }

  /* ------------------------------------------------------------ 시즌 */

  function endSeason(s, out) {
    const table = standings(s);
    const pos = table.findIndex((r) => r.me) + 1;
    const me = s.league.table.me;
    const tier = s.tier;
    const t = TIERS[tier];
    const mm = moneyMult(s);
    const prize = roundMoney(ECON.prizeBase * scaleOf(s, tier) * PRIZE_SHARE[pos - 1] * mm);
    s.money += prize;
    addFin(s, 'bonus', prize);

    let move = 0;
    if (pos <= 2 && tier > 1) move = -1;
    else if (pos >= 7 && tier < 5) move = 1;
    const champion = pos === 1;
    if (champion) s.trophies[tier] = (s.trophies[tier] || 0) + 1;
    if (champion && tier === 1) s.prestige = (s.prestige || 0) + 1;
    if (me.l === 0) s.stats.unbeaten++;

    let objective = null;
    if (s.objective) {
      const hit = pos <= s.objective.target;
      objective = { label: objectiveLabel(s.objective, tier), ok: hit, reward: hit ? s.objective.reward : 0 };
      if (hit) { s.money += s.objective.reward; addFin(s, 'bonus', s.objective.reward); }
    }

    // 시즌 보상: 티켓·돌파석·스킬북
    const reward = {
      tickets: Math.max(0, 4 - pos) + (move < 0 ? 1 : 0) + (champion ? 1 : 0),
      shards: Math.round(10 * (1 + (5 - tier) * 0.6)),
      books: 3 + (5 - tier),
    };
    s.mat.tickets += reward.tickets;
    s.mat.shards += reward.shards;
    s.mat.books += reward.books;

    const scorers = s.players.filter((p) => p.sGoals > 0).sort((a, b) => b.sGoals - a.sGoals);
    const top = scorers[0] ? { name: scorers[0].name, goals: scorers[0].sGoals } : null;

    let promoBonus = 0;
    if (move === -1) {
      promoBonus = roundMoney(ECON.promoBonus * TIERS[tier - 1].scale * mm);
      s.money += promoBonus;
      addFin(s, 'bonus', promoBonus);
      s.fans = Math.round(s.fans * 1.2 + 500);
      s.stats.promotions++;
    } else if (move === 1) {
      s.fans = Math.round(s.fans * 0.88);
    }
    if (champion) s.fans = Math.round(s.fans * 1.08);
    gainMgrXp(s, 150 * (1 + (5 - tier) * 0.5) * (move < 0 ? 1.5 : 1), out);

    const summary = {
      season: s.season, tier, tierName: t.name, pos, move, champion,
      w: me.w, d: me.d, l: me.l, gf: me.gf, ga: me.ga, pts: me.pts,
      prize, promoBonus, objective, top, reward,
      table: table.map((r) => ({ id: r.id, name: r.name, kit: r.kit, me: r.me, pts: r.pts, gd: r.gd, w: r.w, d: r.d, l: r.l })),
      youth: 0, fin: Object.assign({}, s.fin.cur),
    };
    s.history.unshift({ season: s.season, tier, pos, w: me.w, d: me.d, l: me.l, gf: me.gf, ga: me.ga, pts: me.pts, move, champion, top });

    // 다음 리그 구성: 우리와 함께 남는 팀은 유지한다
    let keep = null;
    if (move === 0) {
      keep = table.filter((r, i) => !r.me && !(i < 2 && tier > 1) && !(i >= 6 && tier < 5)).map((r) => s.league.teams.find((x) => x.id === r.id));
      if (champion && tier === 1) keep = keep.map((x) => Object.assign({}, x, { att: x.att + PRESTIGE_AI, def: x.def + PRESTIGE_AI }));
    }
    s.tier += move;
    s.bestTier = Math.min(s.bestTier, s.tier);

    for (const p of s.players) {
      p.sGoals = 0; p.sApps = 0;
      p.fit = 100; p.inj = 0;
    }

    // 유스 콜업
    s.youth = s.youth.filter((y) => y.until > s.season);
    const fresh = genYouth(s);
    s.youth = s.youth.concat(fresh);
    summary.youth = fresh.length;
    const gem = fresh.slice().sort((a, b) => GRADE_KEYS.indexOf(b.grade) - GRADE_KEYS.indexOf(a.grade))[0];
    if (gem && GRADE_KEYS.indexOf(gem.grade) >= 2) pushNews(s, 'youth', `아카데미에서 ${GRADES[gem.grade].name} 등급 유망주 ${josa(gem.name, '이', '가')} 올라왔습니다`);
    else pushNews(s, 'youth', `유스 아카데미에서 유망주 ${fresh.length}명이 콜업 대기 중입니다`);

    s.fin.prev = s.fin.cur;
    s.fin.cur = emptyFin();
    s.season++;
    s.round = 0;
    newLeague(s, s.tier, keep);
    s.objective = makeObjective(s);

    if (move === -1) pushNews(s, 'big', `${t.name} ${pos}위! ${TIERS[s.tier].name}로 승격합니다`);
    else if (move === 1) pushNews(s, 'warn', `${t.name} ${pos}위로 ${TIERS[s.tier].name} 강등`);
    if (champion) pushNews(s, 'big', `${t.name} 우승! 트로피를 들어 올렸습니다`);
    if (champion && tier === 1) pushNews(s, 'warn', `명성 Lv.${s.prestige}: 1부 리그 상대들이 더 강해지고 보상도 커집니다`);
    if (!champion && move === 0) pushNews(s, 'club', `${summary.season}시즌 ${t.name} ${pos}위로 마감`);
    pushNews(s, 'ach', `시즌 보상: 티켓 ${reward.tickets}장 · 돌파석 ${reward.shards}개 · 스킬북 ${reward.books}권`);

    s.seasonEnd = summary;
    s.phase = 'offseason';
    s.phaseT = 0;
    s.live = null;
    s.rev++;
    out.push({ kind: 'seasonEnd', summary });
    checkAchievements(s, out);
  }

  function joinSquad(s, p) {
    delete p.until;
    p.joined = s.season;
    p.fit = 100;
    p.inj = 0;
    p.rest = false;
    p.num = assignNumber(s, p.pos);
    s.players.push(p);
    refreshOvr(s, p);
    if (GRADE_KEYS.indexOf(p.grade) > GRADE_KEYS.indexOf(s.stats.bestGrade || 'N')) s.stats.bestGrade = p.grade;
  }

  /* ------------------------------------------------------------- 업적 */

  const gi = (g) => GRADE_KEYS.indexOf(g);
  const ACHIEVEMENTS = [
    { id: 'first_win', name: '첫 승리', desc: '공식 경기 첫 승', reward: 500e4, tickets: 1, test: (s) => s.stats.w >= 1 },
    { id: 'wins_25', name: '이기는 습관', desc: '통산 25승', reward: 3000e4, tickets: 1, test: (s) => s.stats.w >= 25 },
    { id: 'wins_100', name: '백승 감독', desc: '통산 100승', reward: 5e8, tickets: 3, test: (s) => s.stats.w >= 100 },
    { id: 'goals_100', name: '골 폭죽', desc: '통산 100골', reward: 5000e4, tickets: 1, test: (s) => s.stats.gf >= 100 },
    { id: 'big_win', name: '대승', desc: '5골 차 이상 승리', reward: 2000e4, tickets: 1, test: (s) => s.stats.bigWin >= 1 },
    { id: 'promo', name: '첫 승격', desc: '상위 리그로 승격', reward: 5000e4, tickets: 2, test: (s) => s.stats.promotions >= 1 },
    { id: 'tier3', name: '프로의 세계', desc: '3부 리그 진출', reward: 3e8, tickets: 2, test: (s) => s.bestTier <= 3 },
    { id: 'tier1', name: '꿈의 무대', desc: '1부 리그 진출', reward: 30e8, tickets: 5, test: (s) => s.bestTier <= 1 },
    { id: 'title', name: '첫 우승', desc: '어느 리그든 우승', reward: 1e8, tickets: 1, test: (s) => totalTrophies(s) >= 1 },
    { id: 'title1', name: '정상 등극', desc: '1부 리그 우승', reward: 100e8, tickets: 10, test: (s) => (s.trophies[1] || 0) >= 1 },
    { id: 'unbeaten', name: '무패 시즌', desc: '한 시즌 무패', reward: 3e8, tickets: 3, test: (s) => s.stats.unbeaten >= 1 },
    { id: 'fans_10k', name: '동네 명물', desc: '팬 1만 명', reward: 3000e4, tickets: 1, test: (s) => s.fans >= 1e4 },
    { id: 'fans_100k', name: '전국구 클럽', desc: '팬 10만 명', reward: 5e8, tickets: 2, test: (s) => s.fans >= 1e5 },
    { id: 'fans_1m', name: '세계적 명문', desc: '팬 100만 명', reward: 50e8, tickets: 5, test: (s) => s.fans >= 1e6 },
    { id: 'ssr', name: '전설의 시작', desc: '전설 등급 선수 영입', reward: 0, tickets: 1, test: (s) => gi(s.stats.bestGrade) >= 3 },
    { id: 'ur', name: '신화를 품다', desc: '신화 등급 선수 영입', reward: 0, tickets: 3, test: (s) => gi(s.stats.bestGrade) >= 4 },
    { id: 'lv30', name: '성장의 증거', desc: '선수 레벨 30 달성', reward: 1e8, tickets: 1, test: (s) => s.players.some((p) => p.lv >= 30) },
    { id: 'star5', name: '완전 돌파', desc: '★5 선수 보유', reward: 10e8, tickets: 3, test: (s) => s.players.some((p) => p.star >= MAX_STAR) },
    { id: 'skill10', name: '필살기 완성', desc: '스킬 레벨 10 달성', reward: 3e8, tickets: 2, test: (s) => s.players.some((p) => p.slv >= MAX_SKILL) },
    { id: 'plus10', name: '장인의 손길', desc: '+10 장비 보유', reward: 2e8, tickets: 1, test: (s) => s.items.some((i) => i.plus >= 10) },
    { id: 'mgr10', name: '프로 감독', desc: '감독 레벨 10', reward: 1e8, tickets: 1, test: (s) => s.mgr.lv >= 10 },
    { id: 'skills_50', name: '스킬 쇼', desc: '경기 중 스킬 50회 발동', reward: 5000e4, tickets: 1, test: (s) => (s.stats.skills || 0) >= 50 },
    { id: 'stadium_max', name: '꿈의 구장', desc: '경기장 최고 레벨', reward: 0, tickets: 3, test: (s) => s.fac.stadium >= FAC_MAX },
    { id: 'star', name: '월드클래스', desc: 'OVR 90 선수 보유', reward: 10e8, tickets: 3, test: (s) => s.players.some((p) => p.ovr >= 90) },
  ];
  function checkAchievements(s, out) {
    for (const a of ACHIEVEMENTS) {
      if (s.ach[a.id] || !a.test(s)) continue;
      s.ach[a.id] = { season: s.season };
      if (a.reward) { s.money += a.reward; addFin(s, 'bonus', a.reward); }
      if (a.tickets) s.mat.tickets += a.tickets;
      const parts = [];
      if (a.reward) parts.push(fmtMoney(a.reward));
      if (a.tickets) parts.push(`티켓 ${a.tickets}장`);
      pushNews(s, 'ach', `업적 달성: ${a.name}${parts.length ? ` (+${parts.join(', ')})` : ''}`);
      out.push({ kind: 'achievement', id: a.id, name: a.name, reward: a.reward, tickets: a.tickets });
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

    const xp = XP_PER_SEC * xpMult(s) * dt;
    const mm = medMult(s.fac.medical);
    const playing = s.phase === 'match' && s.live ? new Set(s.live.xi.map((x) => x.id)) : null;
    let up = 0;
    for (const p of s.players) {
      up += gainXp(s, p, xp);
      if (!playing || !playing.has(p.id)) p.fit = Math.min(100, p.fit + FIT_PER_SEC * mm * dt);
    }
    if (up) out.push({ kind: 'levelUp', count: up });

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
    const before = { money: s.money, fans: s.fans, w: s.stats.w, d: s.stats.d, l: s.stats.l, gf: s.stats.gf, ga: s.stats.ga, mat: Object.assign({}, s.mat) };
    const lvBefore = s.players.reduce((n, p) => n + p.lv, 0);
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
      levels: s.players.reduce((n, p) => n + p.lv, 0) - lvBefore,
      tickets: s.mat.tickets - before.mat.tickets,
      shards: s.mat.shards - before.mat.shards,
      books: s.mat.books - before.mat.books,
      items: events.filter((e) => e.kind === 'loot' && !e.auto).length,
      seasons: events.filter((e) => e.kind === 'seasonEnd').map((e) => e.summary),
      achievements: events.filter((e) => e.kind === 'achievement'),
      events,
    };
  }

  /* ------------------------------------------------------------- 행동 */

  function ok(msg) { return { ok: true, msg }; }
  function no(msg) { return { ok: false, msg }; }
  const inLiveXI = (s, id) => s.phase === 'match' && s.live && !s.live.done && s.live.xi.some((x) => x.id === id);

  function levelUp(s, id, times) {
    const p = playerById(s, id);
    if (!p) return no('선수를 찾을 수 없어요');
    const cap = levelCap(p.star);
    if (p.lv >= cap) return no(p.star >= MAX_STAR ? '최고 레벨이에요' : `레벨 상한 ${cap}. 돌파가 필요해요`);
    let n = 0, spent = 0;
    const want = times || 1;
    while (n < want && p.lv < cap) {
      const c = levelCost(s, p);
      if (s.money < c) break;
      s.money -= c;
      spent += c;
      p.lv++;
      n++;
    }
    if (!n) return no(`자금이 ${fmtMoney(levelCost(s, p) - s.money)} 부족해요`);
    if (p.lv >= cap) p.xp = Math.min(p.xp, xpNeed(p.lv));
    p.spent += spent;
    addFin(s, 'growth', spent);
    refreshOvr(s, p);
    const out = [];
    checkAchievements(s, out);
    s.rev++;
    return Object.assign(ok(`${p.name} Lv.${p.lv}${n > 1 ? ` (+${n})` : ''}`), { events: out, count: n, spent });
  }

  // 선발 11명 중 가장 싼 레벨업부터 자금이 허락하는 만큼
  function levelUpTeam(s, budget) {
    const ids = new Set(lineup(s).xi.map((x) => x.id).filter((x) => x !== null));
    const ps = s.players.filter((p) => ids.has(p.id));
    let n = 0, spent = 0;
    const limit = budget == null ? Infinity : budget;
    for (let guard = 0; guard < 2000; guard++) {
      const cand = ps.filter((p) => p.lv < levelCap(p.star)).sort((a, b) => levelCost(s, a) - levelCost(s, b))[0];
      if (!cand) break;
      const c = levelCost(s, cand);
      if (s.money < c || spent + c > limit) break;
      s.money -= c;
      spent += c;
      cand.spent += c;
      cand.lv++;
      if (cand.lv >= levelCap(cand.star)) cand.xp = Math.min(cand.xp, xpNeed(cand.lv));
      n++;
    }
    if (!n) return no('레벨업할 자금이 부족하거나 모두 레벨 상한이에요');
    for (const p of ps) refreshOvr(s, p);
    addFin(s, 'growth', spent);
    const out = [];
    checkAchievements(s, out);
    s.rev++;
    return Object.assign(ok(`선발 11명 레벨업 ${n}회 (${fmtMoney(spent)})`), { events: out, count: n, spent });
  }

  function starUp(s, id) {
    const p = playerById(s, id);
    if (!p) return no('선수를 찾을 수 없어요');
    if (p.star >= MAX_STAR) return no('이미 최대 돌파예요');
    if (p.lv < levelCap(p.star)) return no(`레벨 ${levelCap(p.star)}을 찍어야 돌파할 수 있어요`);
    const c = starCost(s, p);
    if (s.mat.shards < c.shards) return no(`돌파석이 ${c.shards - s.mat.shards}개 부족해요`);
    if (s.money < c.money) return no(`자금이 ${fmtMoney(c.money - s.money)} 부족해요`);
    s.mat.shards -= c.shards;
    s.money -= c.money;
    p.spent += c.money;
    addFin(s, 'growth', c.money);
    p.star++;
    refreshOvr(s, p);
    gainXp(s, p, 0);
    pushNews(s, 'big', `${p.name} ★${p.star} 돌파! 레벨 상한이 ${levelCap(p.star)}로 올랐습니다`);
    const out = [];
    checkAchievements(s, out);
    s.rev++;
    return Object.assign(ok(`${p.name} ★${p.star} 돌파`), { events: out });
  }

  function skillUp(s, id) {
    const p = playerById(s, id);
    if (!p) return no('선수를 찾을 수 없어요');
    const c = skillCost(s, p);
    if (!c) return no('스킬이 이미 최고 레벨이에요');
    if (s.mat.books < c.books) return no(`스킬북이 ${c.books - s.mat.books}권 부족해요`);
    if (s.money < c.money) return no(`자금이 ${fmtMoney(c.money - s.money)} 부족해요`);
    s.mat.books -= c.books;
    s.money -= c.money;
    p.spent += c.money;
    addFin(s, 'growth', c.money);
    p.slv++;
    const out = [];
    checkAchievements(s, out);
    s.rev++;
    return Object.assign(ok(`${SKILLS[p.skill].name} Lv.${p.slv}`), { events: out });
  }

  function releaseValue(p) {
    return { money: roundMoney(p.spent * 0.3), shards: GRADES[p.grade].shards * p.star };
  }

  function releasePlayer(s, id) {
    const p = playerById(s, id);
    if (!p) return no('선수를 찾을 수 없어요');
    if (s.players.length <= SQUAD_MIN) return no(`스쿼드는 최소 ${SQUAD_MIN}명이 필요해요`);
    if (inLiveXI(s, id)) return no('경기에 뛰고 있는 선수는 내보낼 수 없어요');
    if (p.pos === 'GK' && s.players.filter((q) => q.pos === 'GK').length <= 1) return no('마지막 골키퍼는 내보낼 수 없어요');
    const v = releaseValue(p);
    for (const it of s.items) if (it.owner === p.id) it.owner = null;
    s.players = s.players.filter((q) => q !== p);
    s.money += v.money;
    s.mat.shards += v.shards;
    addFin(s, 'sales', v.money);
    pushNews(s, 'transfer', `${josa(p.name, '을', '를')} 방출했습니다 (돌파석 +${v.shards})`);
    s.rev++;
    return ok(`${p.name} 방출 · 돌파석 +${v.shards}${v.money ? ` · ${fmtMoney(v.money)}` : ''}`);
  }

  function promoteYouth(s, id) {
    const y = s.youth.find((q) => q.id === id);
    if (!y) return no('유망주를 찾을 수 없어요');
    if (s.players.length >= SQUAD_MAX) return no(`스쿼드는 최대 ${SQUAD_MAX}명이에요`);
    s.youth = s.youth.filter((q) => q !== y);
    joinSquad(s, y);
    pushNews(s, 'youth', `유스 ${josa(y.name, '이', '가')} 1군 계약을 맺었습니다`);
    const out = [];
    checkAchievements(s, out);
    s.rev++;
    return Object.assign(ok(`${y.name} 1군 승격`), { events: out });
  }

  function releaseYouth(s, id) {
    const y = s.youth.find((q) => q.id === id);
    if (!y) return no('유망주를 찾을 수 없어요');
    s.youth = s.youth.filter((q) => q !== y);
    s.mat.shards += GRADES[y.grade].shards;
    s.rev++;
    return ok(`${y.name} 방출 · 돌파석 +${GRADES[y.grade].shards}`);
  }

  function equipItem(s, itemId, playerId) {
    const it = s.items.find((i) => i.id === itemId);
    const p = playerById(s, playerId);
    if (!it || !p) return no('장비나 선수를 찾을 수 없어요');
    const prevOwner = it.owner != null ? playerById(s, it.owner) : null;
    for (const o of s.items) if (o.owner === p.id && o.slot === it.slot && o !== it) o.owner = null;
    it.owner = p.id;
    refreshOvr(s, p);
    if (prevOwner && prevOwner !== p) refreshOvr(s, prevOwner);
    s.rev++;
    return ok(`${p.name}에게 ${it.name} 장착`);
  }
  function unequipItem(s, itemId) {
    const it = s.items.find((i) => i.id === itemId);
    if (!it || it.owner == null) return no('장착된 장비가 아니에요');
    const p = playerById(s, it.owner);
    it.owner = null;
    if (p) refreshOvr(s, p);
    s.rev++;
    return ok('장비를 해제했어요');
  }
  // 선발 선수부터 좋은 장비를 채운다
  function autoEquip(s) {
    const xiIds = lineup(s).xi.map((x) => x.id).filter((x) => x !== null);
    const order = xiIds.map((id) => playerById(s, id)).filter(Boolean)
      .concat(s.players.filter((p) => xiIds.indexOf(p.id) < 0).sort((a, b) => b.ovr - a.ovr));
    for (const it of s.items) it.owner = null;
    let n = 0;
    for (const slot of SLOT_KEYS) {
      const pool = s.items.filter((i) => i.slot === slot).sort((a, b) => itemBonus(b) - itemBonus(a));
      for (let i = 0; i < pool.length && i < order.length; i++) { pool[i].owner = order[i].id; n++; }
    }
    refreshAll(s);
    s.rev++;
    return ok(n ? `장비 ${n}개를 자동 장착했어요` : '장착할 장비가 없어요');
  }
  function enhanceItem(s, itemId) {
    const it = s.items.find((i) => i.id === itemId);
    if (!it) return no('장비를 찾을 수 없어요');
    if (it.plus >= MAX_PLUS) return no('최대 강화예요');
    const c = enhanceCost(it);
    if (s.money < c) return no(`자금이 ${fmtMoney(c - s.money)} 부족해요`);
    s.money -= c;
    addFin(s, 'gear', c);
    it.plus++;
    if (it.owner != null) { const p = playerById(s, it.owner); if (p) refreshOvr(s, p); }
    const out = [];
    checkAchievements(s, out);
    s.rev++;
    return Object.assign(ok(`${it.name} +${it.plus}`), { events: out });
  }
  function dismantleItem(s, itemId) {
    const it = s.items.find((i) => i.id === itemId);
    if (!it) return no('장비를 찾을 수 없어요');
    const v = dismantleValue(it);
    const owner = it.owner != null ? playerById(s, it.owner) : null;
    s.items = s.items.filter((i) => i !== it);
    if (owner) refreshOvr(s, owner);
    s.money += v;
    addFin(s, 'sales', v);
    s.rev++;
    return ok(`${it.name} 분해 +${fmtMoney(v)}`);
  }
  // 장착하지 않은, 강화 안 한 특정 등급 이하 장비 일괄 분해
  function dismantleBelow(s, grade) {
    const lim = GRADE_KEYS.indexOf(grade);
    const targets = s.items.filter((i) => i.owner == null && GRADE_KEYS.indexOf(i.grade) <= lim && i.plus === 0);
    if (!targets.length) return no('분해할 장비가 없어요');
    let v = 0;
    for (const it of targets) v += dismantleValue(it);
    s.items = s.items.filter((i) => targets.indexOf(i) < 0);
    s.money += v;
    addFin(s, 'sales', v);
    s.rev++;
    return ok(`장비 ${targets.length}개 분해 +${fmtMoney(v)}`);
  }

  function addTalent(s, key) {
    const t = TALENTS[key];
    if (!t) return no('알 수 없는 특성이에요');
    if (s.mgr.pts <= 0) return no('특성 포인트가 없어요');
    if ((s.mgr.tal[key] || 0) >= t.max) return no('이미 최대예요');
    s.mgr.pts--;
    s.mgr.tal[key] = (s.mgr.tal[key] || 0) + 1;
    s.rev++;
    return ok(`${t.name} ${s.mgr.tal[key]}/${t.max}`);
  }
  const respecCost = (s) => roundMoney(500e4 * s.mgr.lv);
  function resetTalents(s) {
    const spent = TALENT_KEYS.reduce((n, k) => n + (s.mgr.tal[k] || 0), 0);
    if (!spent) return no('되돌릴 특성이 없어요');
    const c = respecCost(s);
    if (s.money < c) return no(`자금이 ${fmtMoney(c - s.money)} 부족해요`);
    s.money -= c;
    for (const k of TALENT_KEYS) s.mgr.tal[k] = 0;
    s.mgr.pts += spent;
    s.rev++;
    return ok(`특성 포인트 ${spent}개를 돌려받았어요`);
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

  // v1(구단 운영판) 저장본을 RPG판으로 옮긴다: 잠재력으로 등급을 정하고 능력치는 기본값으로 보존
  function migrateV1(o) {
    const gradeOf = (p) => (p.pot >= 85 ? 'SSR' : p.pot >= 72 ? 'SR' : p.pot >= 55 ? 'R' : 'N');
    const conv = (p, extra) => Object.assign({
      id: p.id, name: p.name, pos: p.pos, grade: gradeOf(p), star: 1, lv: 1, xp: 0,
      base: round2(p.ovr), ovr: p.ovr, skill: pickSkill(p.pos), slv: 1, fit: p.fit || 100, inj: p.inj || 0,
      goals: p.goals || 0, apps: p.apps || 0, sGoals: p.sGoals || 0, sApps: p.sApps || 0, youth: !!p.youth,
      joined: p.joined || 1, rest: !!p.rest, num: p.num || 0, spent: 0,
    }, extra || {});
    o.players = (o.players || []).map((p) => conv(p));
    o.youth = (o.youth || []).map((y) => conv(y, { youth: true, until: y.until }));
    delete o.market; delete o.marketIn;
    o.mat = { tickets: 5, shards: 10, books: 3 };
    o.items = [];
    o.nextItemId = 1;
    o.mgr = { lv: 1, xp: 0, pts: 0, tal: { atk: 0, def: 0, train: 0, money: 0, nego: 0, chari: 0 } };
    o.stats = Object.assign({ scouted: 0, skills: 0, bestGrade: 'N' }, o.stats);
    o.fin = { cur: emptyFin(), prev: null };
    if (o.live) o.live.skillUse = o.live.skillUse || {};
    if (o.live) o.live.scorers = o.live.scorers || {};
    o.v = 2;
    o.news = o.news || [];
    pushNews(o, 'big', 'RPG 업데이트! 선수 등급·레벨·스킬·장비와 감독 특성이 생겼습니다. 보상으로 티켓 5장을 드립니다');
    return o;
  }

  function serialize(s) { return JSON.stringify(s); }
  function deserialize(str) {
    let o = typeof str === 'string' ? JSON.parse(str) : str;
    if (!o || typeof o !== 'object') throw new Error('저장 데이터가 비어 있어요');
    if (o.v === 1) o = migrateV1(o);
    if (o.v !== SAVE_VERSION) throw new Error('지원하지 않는 저장 버전이에요');
    const need = ['club', 'players', 'league', 'fac', 'stats', 'fin', 'mgr', 'mat'];
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
    o.items = o.items || [];
    o.news = o.news || [];
    o.history = o.history || [];
    o.nextItemId = o.nextItemId || 1;
    o.prestige = o.prestige || 0;
    o.mgr.tal = Object.assign({ atk: 0, def: 0, train: 0, money: 0, nego: 0, chari: 0 }, o.mgr.tal);
    for (const k of ['tickets', 'shards', 'books']) if (!Number.isFinite(o.mat[k])) o.mat[k] = 0;
    for (const p of o.players) {
      if (!GRADES[p.grade]) p.grade = 'N';
      if (!SKILLS[p.skill]) p.skill = pickSkill(p.pos);
      p.star = clamp(p.star || 1, 1, MAX_STAR);
      p.lv = clamp(p.lv || 1, 1, levelCap(p.star));
      p.slv = clamp(p.slv || 1, 1, MAX_SKILL);
    }
    refreshAll(o);
    return o;
  }

  return {
    SAVE_VERSION, T, ROUND_SECONDS, SPEEDS, OFFLINE_CAP, OFFLINE_RATE,
    TIERS, ECON, FORMATIONS, tierAI, scaleOf, TACTICS, ORDERS, ORDERS_PER_MATCH, KITS, KIT_KEYS,
    FACILITIES, FAC_KEYS, FAC_MAX, STADIUM_CAP, POSITIONS, POS_NAME, SQUAD_MAX, SQUAD_MIN,
    ACHIEVEMENTS, PRIZE_SHARE, GRADES, GRADE_KEYS, SKILLS, SLOTS, SLOT_KEYS, TALENTS, TALENT_KEYS,
    MAX_STAR, MAX_SKILL, MAX_PLUS, INVENTORY_MAX, SCOUTS, STAR_SHARDS,
    setRandom, seeded,
    newGame, tick, applyOffline, serialize, deserialize,
    lineup, teamRating, rateXI, skillBonus, xg, outcomeProbs, matchPreview, standings, leaguePos, myFixture, teamById,
    incomeRates, roundEconomy, expectedAttendance, stadiumCap, facilityCost, describeFacility,
    effOf, ovrOf, totalTrophies, objectiveLabel, minuteAt, ordersPerMatch,
    levelCap, xpNeed, levelCost, starCost, skillCost, releaseValue, itemBonus, gearOf, gearBonus,
    enhanceCost, dismantleValue, scoutOdds, scoutPrice, mgrXpNeed, mgrTitle, respecCost, youthOdds,
    levelUp, levelUpTeam, starUp, skillUp, releasePlayer, promoteYouth, releaseYouth,
    equipItem, unequipItem, autoEquip, enhanceItem, dismantleItem, dismantleBelow,
    scout, addTalent, resetTalents, upgradeFacility, toggleRest,
    setFormation, setTactic, setSpeed, setPaused, renameClub, setKit, skipOffseason, issueOrder,
    fmtMoney, fmtInt, josa, hasBatchim, shortName,
  };
});
