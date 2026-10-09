/*
 * 방치형 공주 키우기 — 게임 데이터
 * 능력치, 활동, 상점, 유산, 엔딩, 이벤트 정의. 엔진/UI는 이 값들만 참조한다.
 */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.PrincessData = data;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── 시간 ────────────────────────────────────────────────
  const DAY_MS = 1500;            // 배속 1에서 하루가 흐르는 실제 시간
  const DAYS_PER_MONTH = 30;
  const SLOT_DAYS = 10;           // 한 달 = 상순·중순·하순
  const MONTHS_PER_YEAR = 12;
  const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;
  const START_AGE = 10;
  const END_AGE = 18;
  const TOTAL_DAYS = (END_AGE - START_AGE) * DAYS_PER_YEAR;
  const START_YEAR = 1210;        // 왕국력
  const START_MONTH = 4;          // 4월 1일이 공주의 생일
  const SLOT_NAMES = ['상순', '중순', '하순'];

  // ── 경제·컨디션 ─────────────────────────────────────────
  const START_GOLD = 300;
  const START_POINTS = 3;          // 첫 화면에서 직접 나눠 주는 시작 보너스
  const POINT_VALUE = 10;         // 1포인트 = 능력치 +10
  const ALLOWANCE = 40;           // 매달 1일 왕실 양육비
  const STAT_MAX = 999;
  const SICK_DAYS = 7;
  const SICK_COST = 8;
  const EVENT_CHANCE = 0.018;
  const FESTIVAL_MONTH = 10;
  const FESTIVAL_DAY = 15;
  const BASE_OFFLINE_HOURS = 1;

  function birthdayGift(age) { return 100 + age * 20; }
  function rivalScore(yearIndex) { return 50 + yearIndex * 55; }

  // ── 능력치 ─────────────────────────────────────────────
  const STAT_GROUPS = [
    { id: 'body', name: '몸', desc: '튼튼한 몸과 검' },
    { id: 'mind', name: '머리', desc: '배움과 마법' },
    { id: 'grace', name: '품격', desc: '아름다움과 예술' },
    { id: 'spirit', name: '마음', desc: '선함과 믿음' },
  ];

  const STATS = [
    { id: 'con', name: '체력', group: 'body', base: 25 },
    { id: 'str', name: '근력', group: 'body', base: 12 },
    { id: 'cmb', name: '무예', group: 'body', base: 5 },
    { id: 'int', name: '지능', group: 'mind', base: 18 },
    { id: 'mag', name: '마력', group: 'mind', base: 3 },
    { id: 'ele', name: '기품', group: 'grace', base: 12 },
    { id: 'cha', name: '매력', group: 'grace', base: 18 },
    { id: 'sen', name: '감수성', group: 'grace', base: 15 },
    { id: 'mor', name: '도덕', group: 'spirit', base: 20 },
    { id: 'fai', name: '신앙', group: 'spirit', base: 12 },
  ];

  // ── 활동 ───────────────────────────────────────────────
  // gain: 하루 능력치 변화 / gold: 음수는 수업료, 양수는 일당 / stress: 하루 스트레스
  // incomeStat: 일당이 이 능력치에 비례해 오른다 / req: 해금 조건
  const CATEGORIES = [
    { id: 'lesson', name: '수업' },
    { id: 'job', name: '아르바이트' },
    { id: 'adventure', name: '무사수행' },
    { id: 'rest', name: '휴식' },
  ];

  const ACTIVITIES = [
    // 수업
    { id: 'study', name: '학문', glyph: '학', cat: 'lesson',
      desc: '왕립 학당에서 역사와 셈법을 배운다.',
      gain: { int: 0.32, sen: 0.04 }, gold: -5, stress: 1.0 },
    { id: 'manners', name: '예법', glyph: '예', cat: 'lesson',
      desc: '궁정의 인사법과 식사 예절을 익힌다.',
      gain: { ele: 0.3, mor: 0.1 }, gold: -6, stress: 1.0 },
    { id: 'dance', name: '무용', glyph: '춤', cat: 'lesson',
      desc: '왈츠부터 민속춤까지, 몸으로 음악을 표현한다.',
      gain: { cha: 0.24, con: 0.1, sen: 0.08 }, gold: -6, stress: 1.1 },
    { id: 'art', name: '미술', glyph: '화', cat: 'lesson',
      desc: '화실에서 정물과 풍경을 그린다.',
      gain: { sen: 0.3, cha: 0.06 }, gold: -5, stress: 0.8 },
    { id: 'fencing', name: '검술', glyph: '검', cat: 'lesson',
      desc: '은퇴한 기사에게 검 쓰는 법을 배운다.',
      gain: { cmb: 0.3, str: 0.12, ele: -0.04 }, gold: -7, stress: 1.3 },
    { id: 'magic', name: '마법학', glyph: '마', cat: 'lesson',
      desc: '마법사 탑에서 주문과 마법진을 공부한다.',
      gain: { mag: 0.3, int: 0.08, fai: -0.04 }, gold: -8, stress: 1.2,
      req: { age: 11 } },
    { id: 'theology', name: '신학', glyph: '신', cat: 'lesson',
      desc: '대성당 사제에게 경전과 기도를 배운다.',
      gain: { fai: 0.3, mor: 0.12 }, gold: -5, stress: 0.9 },
    { id: 'politics', name: '궁정 교양', glyph: '정', cat: 'lesson',
      desc: '외교 문서와 화술, 사교계의 법도를 배운다.',
      gain: { int: 0.18, ele: 0.18, cha: 0.1 }, gold: -14, stress: 1.2,
      req: { age: 14, stats: { ele: 120 } } },

    // 아르바이트
    { id: 'housework', name: '집안일', glyph: '집', cat: 'job',
      desc: '청소와 빨래를 돕는다. 돈은 거의 안 되지만 공짜다.',
      gain: { mor: 0.1, con: 0.06 }, gold: 1, stress: 0.4 },
    { id: 'flower', name: '꽃집', glyph: '꽃', cat: 'job',
      desc: '광장 꽃집에서 꽃다발을 만든다.',
      gain: { sen: 0.1, cha: 0.06 }, gold: 5, incomeStat: 'cha', stress: 1.0 },
    { id: 'church', name: '성당 일손', glyph: '성', cat: 'job',
      desc: '성당을 청소하고 순례자를 안내한다.',
      gain: { fai: 0.14, mor: 0.1 }, gold: 3, incomeStat: 'fai', stress: 0.7 },
    { id: 'farm', name: '농장', glyph: '농', cat: 'job',
      desc: '밭을 갈고 소젖을 짠다. 고되지만 벌이가 괜찮다.',
      gain: { con: 0.14, str: 0.14, ele: -0.06 }, gold: 7, incomeStat: 'str', stress: 1.4 },
    { id: 'diner', name: '식당', glyph: '식', cat: 'job',
      desc: '여관 식당에서 음식을 나른다.',
      gain: { con: 0.1, cha: 0.04 }, gold: 8, incomeStat: 'con', stress: 1.5,
      req: { age: 11 } },
    { id: 'hunter', name: '사냥꾼', glyph: '냥', cat: 'job',
      desc: '사냥꾼을 따라 숲에서 짐승을 쫓는다.',
      gain: { cmb: 0.12, str: 0.1, sen: -0.06 }, gold: 10, incomeStat: 'cmb', stress: 1.6,
      req: { age: 12, stats: { cmb: 40 } } },
    { id: 'tutor', name: '가정교사', glyph: '교', cat: 'job',
      desc: '귀족 집 아이들에게 글을 가르친다.',
      gain: { int: 0.12, ele: 0.04 }, gold: 12, incomeStat: 'int', stress: 1.2,
      req: { age: 13, stats: { int: 150 } } },
    { id: 'potion', name: '마법 상점', glyph: '약', cat: 'job',
      desc: '물약을 달이고 마법 재료를 손질한다.',
      gain: { mag: 0.12, int: 0.06 }, gold: 12, incomeStat: 'mag', stress: 1.3,
      req: { age: 13, stats: { mag: 120 } } },
    { id: 'maid', name: '궁정 시녀', glyph: '궁', cat: 'job',
      desc: '왕궁에서 왕비의 시중을 든다.',
      gain: { ele: 0.14, cha: 0.06 }, gold: 14, incomeStat: 'ele', stress: 1.5,
      req: { age: 14, stats: { ele: 180 } } },
    { id: 'theater', name: '극단', glyph: '극', cat: 'job',
      desc: '떠돌이 극단의 무대에 선다. 이름이 조금씩 알려진다.',
      gain: { cha: 0.16, sen: 0.1, mor: -0.06 }, gold: 16, incomeStat: 'cha', stress: 1.7, fame: 0.03,
      req: { age: 15, stats: { cha: 200 } } },
    { id: 'guard', name: '성벽 경비', glyph: '경', cat: 'job',
      desc: '성문을 지키며 수상한 자를 막는다.',
      gain: { cmb: 0.14, con: 0.12, cha: -0.04 }, gold: 16, incomeStat: 'cmb', stress: 1.7, fame: 0.02,
      req: { age: 15, stats: { cmb: 220 } } },

    // 무사수행 — 매일 전투 판정. 이기면 전리품과 경험, 지면 스트레스.
    { id: 'forest', name: '동쪽 숲', glyph: '숲', cat: 'adventure',
      desc: '슬라임과 들개가 나오는 숲. 초보 모험가의 첫걸음.',
      gain: { cmb: 0.22, con: 0.12 }, loot: [3, 9], danger: 40, fame: 0.04, stress: 1.5,
      req: { age: 12, stats: { cmb: 30 } } },
    { id: 'canyon', name: '바람 협곡', glyph: '협', cat: 'adventure',
      desc: '오크 도적단이 숨어 있는 협곡. 보물 상자 소문이 있다.',
      gain: { cmb: 0.3, str: 0.12, con: 0.12 }, loot: [10, 24], danger: 160, fame: 0.12, stress: 1.8,
      req: { age: 14, stats: { cmb: 150 } } },
    { id: 'dragon', name: '용의 산맥', glyph: '용', cat: 'adventure',
      desc: '전설의 붉은 용이 잠든 산맥. 살아 돌아오면 영웅이다.',
      gain: { cmb: 0.38, str: 0.16, mag: 0.08 }, loot: [25, 55], danger: 380, fame: 0.3, stress: 2.2,
      boss: { chance: 0.004, power: 650 },
      req: { age: 16, stats: { cmb: 350 } } },

    // 휴식
    { id: 'rest', name: '휴식', glyph: '쉼', cat: 'rest',
      desc: '집에서 뒹굴며 푹 쉰다.',
      gain: { con: 0.02 }, gold: 0, stress: -4 },
    { id: 'vacation', name: '바캉스', glyph: '여', cat: 'rest',
      desc: '계절마다 바다나 산으로 여행을 떠난다.',
      gain: { sen: 0.1 }, gold: -15, stress: -9 },
  ];

  // 숙련도: 같은 활동을 할수록 효율이 오른다
  const MASTERY_MAX = 10;
  const MASTERY_GAIN = 0.08;      // 레벨당 능력치·일당 +8%
  const MASTERY_FEE = 0.06;       // 레벨당 수업료 +6% (고급반일수록 비싸다)
  function masteryXpFor(level) { return 5 * level * (level + 1); }

  // ── 상점 (골드, 세대마다 초기화) ───────────────────────────
  // effect.type: stat(해당 능력치 성장), income, rest, fee, calm, power
  const UPGRADES = [
    { id: 'bookshelf', name: '손때 묻은 책장', desc: '읽을 책이 늘면 생각도 깊어진다.',
      effect: { type: 'stat', stats: ['int'], per: 0.1 }, base: 60, growth: 1.6, max: 10 },
    { id: 'crystal', name: '수정 구슬', desc: '희미한 빛 속에서 마력이 일렁인다.',
      effect: { type: 'stat', stats: ['mag'], per: 0.1 }, base: 80, growth: 1.6, max: 10 },
    { id: 'teaset', name: '은 찻잔 세트', desc: '매일 오후의 다과회가 몸가짐을 바꾼다.',
      effect: { type: 'stat', stats: ['ele'], per: 0.1 }, base: 60, growth: 1.6, max: 10 },
    { id: 'mirror', name: '전신 거울', desc: '거울 앞에서 미소를 연습한다.',
      effect: { type: 'stat', stats: ['cha'], per: 0.1 }, base: 60, growth: 1.6, max: 10 },
    { id: 'musicbox', name: '태엽 오르골', desc: '잠들기 전 음악이 마음결을 다듬는다.',
      effect: { type: 'stat', stats: ['sen'], per: 0.1 }, base: 60, growth: 1.6, max: 10 },
    { id: 'woodsword', name: '연습용 목검', desc: '마당에서 혼자 휘두르는 시간이 늘어난다.',
      effect: { type: 'stat', stats: ['cmb'], per: 0.1 }, base: 70, growth: 1.6, max: 10 },
    { id: 'dumbbell', name: '무쇠 아령', desc: '근력과 체력이 함께 붙는다.',
      effect: { type: 'stat', stats: ['str', 'con'], per: 0.08 }, base: 70, growth: 1.6, max: 10 },
    { id: 'motto', name: '가훈 액자', desc: '"정직하게, 다정하게." 매일 아침 읽는다.',
      effect: { type: 'stat', stats: ['mor'], per: 0.1 }, base: 50, growth: 1.6, max: 10 },
    { id: 'rosary', name: '진주 묵주', desc: '기도하는 손에 작은 위안이 깃든다.',
      effect: { type: 'stat', stats: ['fai'], per: 0.1 }, base: 50, growth: 1.6, max: 10 },
    { id: 'armor', name: '가죽 갑옷', desc: '무사수행의 전투력이 오른다.',
      effect: { type: 'power', per: 0.12 }, base: 120, growth: 1.6, max: 10 },
    { id: 'ledger', name: '가계부', desc: '아르바이트와 전리품 수입이 늘어난다.',
      effect: { type: 'income', per: 0.1 }, base: 100, growth: 1.6, max: 10 },
    { id: 'scholarship', name: '장학 증서', desc: '수업료와 여행 경비가 줄어든다.',
      effect: { type: 'fee', per: 0.06 }, base: 120, growth: 1.7, max: 8 },
    { id: 'bed', name: '깃털 침대', desc: '쉴 때 스트레스가 더 빨리 풀린다.',
      effect: { type: 'rest', per: 0.15 }, base: 80, growth: 1.6, max: 8 },
    { id: 'kitten', name: '아기 고양이', desc: '곁에 있으면 스트레스가 덜 쌓인다.',
      effect: { type: 'calm', per: 0.04 }, base: 150, growth: 1.7, max: 8 },
  ];

  // ── 유산 (왕관 별, 세대를 넘어 영구) ───────────────────────
  const LEGACY = [
    { id: 'blood', name: '왕가의 혈통', desc: '대대로 이어진 피가 무엇이든 빨리 익히게 한다.',
      effect: { type: 'stat_all', per: 0.05 }, base: 4, growth: 1.3, max: 30 },
    { id: 'golden', name: '황금 손', desc: '손대는 일마다 금화가 따라붙는다.',
      effect: { type: 'income', per: 0.1 }, base: 3, growth: 1.3, max: 25 },
    { id: 'talent', name: '타고난 재능', desc: '태어날 때부터 남다른 아이.',
      effect: { type: 'start_stats', per: 6 }, base: 4, growth: 1.4, max: 15 },
    { id: 'inherit', name: '유산 상속', desc: '선대 공주가 남긴 금고를 물려받는다.',
      effect: { type: 'start_gold', per: 200 }, base: 3, growth: 1.4, max: 10 },
    { id: 'mentor', name: '명문가 가정교사', desc: '이름난 스승들이 손수 가르친다.',
      effect: { type: 'xp', per: 0.25 }, base: 5, growth: 1.5, max: 8 },
    { id: 'calm', name: '평온한 마음', desc: '어지간한 일에는 지치지 않는 마음.',
      effect: { type: 'calm', per: 0.05 }, base: 5, growth: 1.5, max: 8 },
    { id: 'hourglass', name: '시간의 모래시계', desc: '모래가 떨어지는 속도가 빨라진다.',
      effect: { type: 'speed', per: 0.25 }, base: 10, growth: 2, max: 4 },
    { id: 'dream', name: '기다림의 꿈', desc: '자리를 비운 동안에도 공주의 하루가 더 길게 이어진다.',
      effect: { type: 'offline', per: 1 }, base: 6, growth: 1.6, max: 5 },
  ];

  // ── 엔딩 (위에서부터 먼저 만족하는 것) ─────────────────────
  const TIERS = {
    S: { name: '전설', stars: 50 },
    A: { name: '영광', stars: 25 },
    B: { name: '보람', stars: 12 },
    C: { name: '소박', stars: 5 },
  };

  const ENDINGS = [
    { id: 'queen', name: '여왕', tier: 'S',
      hint: '기품·지능·매력·도덕, 그리고 명성까지 모두 갖춘 자에게',
      text: '왕국 역사상 가장 현명하고 아름다운 여왕이 탄생했다. 백성들은 그녀의 이름을 노래로 불렀다.',
      check: (s, r) => s.ele >= 600 && s.int >= 550 && s.cha >= 500 && s.mor >= 450 && r.fame >= 120 },
    { id: 'saint', name: '성녀', tier: 'S',
      hint: '깊은 신앙과 흔들림 없는 도덕',
      text: '그녀의 손길이 닿은 곳에 기적이 일어났다. 대성당은 그녀를 성녀로 추대했고, 그녀가 지나간 길에는 꽃이 피었다고 한다.',
      check: (s) => s.fai >= 700 && s.mor >= 650 && s.sen >= 400 },
    { id: 'archmage', name: '대마도사', tier: 'S',
      hint: '마력과 지능의 극한',
      text: '탑의 꼭대기에서 별의 운행을 읽는 대마도사. 대륙의 모든 마법사가 그녀의 제자가 되기를 꿈꾼다.',
      check: (s) => s.mag >= 750 && s.int >= 600 },
    { id: 'hero', name: '용사', tier: 'S',
      hint: '용의 산맥에서 전설을 쓴 정의로운 자에게',
      text: '용을 쓰러뜨린 소녀의 이야기는 전설이 되었다. 아이들은 오늘도 나무 막대를 들고 그녀를 흉내 낸다.',
      check: (s, r) => r.flags.dragon && s.cmb >= 500 && s.mor >= 400 },
    { id: 'general', name: '대장군', tier: 'S',
      hint: '무예와 근력에 지략까지 갖춘 자에게',
      text: '왕국군 최초의 여성 대장군. 그녀가 지휘한 군대는 단 한 번도 패하지 않았다.',
      check: (s) => s.cmb >= 700 && s.str >= 500 && s.int >= 350 },

    { id: 'crownprincess', name: '왕세자비', tier: 'A',
      hint: '눈부신 매력과 기품',
      text: '무도회에서 그녀를 본 이웃 나라 왕세자는 첫눈에 반했다. 두 나라는 그녀 덕분에 오랜 평화를 맞았다.',
      check: (s) => s.cha >= 550 && s.ele >= 450 && s.sen >= 300 },
    { id: 'chancellor', name: '재상', tier: 'A',
      hint: '날카로운 지능에 도덕과 기품을 더해',
      text: '어린 나이에 왕의 오른팔이 된 재상. 그녀의 정책으로 왕국의 곳간이 가득 찼다.',
      check: (s) => s.int >= 600 && s.mor >= 350 && s.ele >= 300 },
    { id: 'courtmage', name: '궁정 마법사', tier: 'A',
      hint: '마력과 지능',
      text: '왕궁의 궁정 마법사로 임명되었다. 축제 날이면 그녀의 불꽃 마법이 밤하늘을 수놓는다.',
      check: (s) => s.mag >= 450 && s.int >= 300 },
    { id: 'knightcaptain', name: '기사단장', tier: 'A',
      hint: '무예·체력·도덕',
      text: '백은 기사단의 단장이 되었다. 그녀의 정의로운 검은 언제나 약한 사람 편에 선다.',
      check: (s) => s.cmb >= 450 && s.con >= 350 && s.mor >= 300 },
    { id: 'primadonna', name: '프리마돈나', tier: 'A',
      hint: '매력과 감수성',
      text: '왕립 극장의 프리마돈나. 그녀의 노래가 끝나면 객석은 늘 눈물과 박수로 가득했다.',
      check: (s) => s.cha >= 450 && s.sen >= 450 },
    { id: 'painter', name: '궁정 화가', tier: 'A',
      hint: '넘쳐흐르는 감수성',
      text: '궁정 화가가 되어 왕가의 초상을 그린다. 그녀의 그림 속 사람들은 금방이라도 말을 걸어올 것 같다.',
      check: (s) => s.sen >= 550 && s.int >= 200 },
    { id: 'abbess', name: '수도원장', tier: 'A',
      hint: '신앙과 도덕',
      text: '고요한 수도원의 원장이 되었다. 길 잃은 이들이 그녀를 찾아 문을 두드린다.',
      check: (s) => s.fai >= 500 && s.mor >= 450 },

    { id: 'witch', name: '숲의 마녀', tier: 'B',
      hint: '강한 마력, 그리고 흐려진 도덕',
      text: '숲속 오두막에 사는 마녀. 사람들은 그녀를 두려워하면서도 밤이면 몰래 약을 사러 찾아온다.',
      check: (s) => s.mag >= 300 && s.mor <= 80 },
    { id: 'scholar', name: '학자', tier: 'B',
      hint: '지능',
      text: '왕립 아카데미의 학자가 되었다. 도서관 불은 오늘도 그녀의 자리에서 가장 늦게 꺼진다.',
      check: (s) => s.int >= 380 },
    { id: 'knight', name: '기사', tier: 'B',
      hint: '무예와 체력',
      text: '정식으로 기사 서임을 받았다. 반짝이는 갑옷이 꽤 잘 어울린다.',
      check: (s) => s.cmb >= 320 && s.con >= 200 },
    { id: 'mage', name: '마법사', tier: 'B',
      hint: '마력',
      text: '떠돌이 마법사가 되어 마을의 골칫거리를 하나씩 해결해 준다.',
      check: (s) => s.mag >= 300 },
    { id: 'nun', name: '수녀', tier: 'B',
      hint: '신앙',
      text: '성당의 수녀가 되어 아이들에게 글과 기도를 가르친다.',
      check: (s) => s.fai >= 320 },
    { id: 'dancer', name: '광장의 무희', tier: 'B',
      hint: '매력',
      text: '그녀가 춤추는 날이면 광장이 사람들로 붐볐다. 동전 바구니는 언제나 가득 찬다.',
      check: (s) => s.cha >= 320 },
    { id: 'lady', name: '귀족 부인', tier: 'B',
      hint: '기품과 매력',
      text: '명문가의 귀족과 결혼해 우아한 살롱의 안주인이 되었다.',
      check: (s) => s.ele >= 320 && s.cha >= 200 },
    { id: 'adventurer', name: '모험가', tier: 'B',
      hint: '무예와 체력',
      text: '길드 소속 모험가가 되었다. 오늘은 또 어떤 던전에 가 볼까?',
      check: (s) => s.cmb >= 220 && s.con >= 220 },
    { id: 'tycoon', name: '대상인', tier: 'B',
      hint: '성인식 날 금고에 쌓인 금화',
      text: '타고난 장사 수완으로 대륙 제일의 상단을 세웠다. 금화 소리만 들어도 웃음이 난다는 소문이 있다.',
      check: (s, r) => r.gold >= 20000 },

    { id: 'teacher', name: '마을 선생님', tier: 'C',
      hint: '지능',
      text: '마을 학교의 선생님이 되었다. 아이들은 그녀를 무척 따른다.',
      check: (s) => s.int >= 200 },
    { id: 'florist', name: '꽃집 주인', tier: 'C',
      hint: '감수성 또는 매력',
      text: '작은 꽃집을 열었다. 가게 앞에는 언제나 계절 꽃 향기가 가득하다.',
      check: (s) => s.sen >= 200 || s.cha >= 220 },
    { id: 'bride', name: '마을의 신부', tier: 'C',
      hint: '매력',
      text: '이웃 마을 청년과 결혼해 소박하지만 행복한 가정을 꾸렸다.',
      check: (s) => s.cha >= 140 },
    { id: 'villager', name: '평범한 아가씨', tier: 'C',
      hint: '뚜렷하게 뛰어난 능력치가 없을 때',
      text: '특별한 일은 없었지만, 그녀는 오늘도 평범한 하루를 즐겁게 살아간다.',
      check: () => true },
  ];

  // ── 수확제 (매년 10월 15일) ───────────────────────────────
  const CONTESTS = [
    { id: 'martial', name: '무술 대회', score: (s) => s.cmb + s.str * 0.5 + s.con * 0.3 },
    { id: 'beauty', name: '미인 대회', score: (s) => s.cha + s.ele * 0.5 + s.sen * 0.2 },
    { id: 'art', name: '예술제', score: (s) => s.sen + s.int * 0.3 + s.cha * 0.2 },
    { id: 'magic', name: '마법 경연', score: (s) => s.mag + s.int * 0.4 },
  ];

  // ── 무작위 사건 ─────────────────────────────────────────
  // {N이}/{N은}/{N을}/{N과}/{N} 은 공주 이름과 조사로 바뀐다
  const EVENTS = [
    { text: '{N이} 길에서 반짝이는 동전을 주웠다.', fx: { gold: [8, 30] } },
    { text: '{N이} 길 잃은 아이를 집까지 데려다주었다.', fx: { stats: { mor: 3 } } },
    { text: '도서관에서 재미있는 책을 발견해 밤새 읽었다.', fx: { stats: { int: 3 }, stress: 2 } },
    { text: '골목 고양이와 하루 종일 놀았다.', fx: { stress: -10 } },
    { text: '소나기를 맞고 감기에 걸렸다.', fx: { stress: 8, stats: { con: -1 } } },
    { text: '떠돌이 시인의 노래에 마음이 일렁였다.', fx: { stats: { sen: 3 } } },
    { text: '성당 종소리에 저도 모르게 두 손을 모았다.', fx: { stats: { fai: 3 } } },
    { text: '거울 앞에서 미소 짓는 연습을 했다.', fx: { stats: { cha: 2 } } },
    { text: '늦잠을 푹 잤다. 개운하다!', fx: { stress: -5 } },
    { text: '가게 할머니가 빨간 사과를 쥐여 주셨다.', fx: { stress: -4 } },
    { text: '언덕을 뛰어 내려가다 넘어져 무릎을 다쳤다.', fx: { stress: 4, stats: { con: -1 } } },
    { text: '친구와 사소한 일로 다퉜다.', fx: { stress: 6 } },
    { text: '별똥별에 소원을 빌었다.', fx: { stress: -4, stats: { sen: 2 } } },
    { text: '기사단의 훈련을 넋 놓고 구경했다.', fx: { stats: { cmb: 2 } } },
    { text: '수상한 마법사가 간단한 주문을 알려주었다.', fx: { stats: { mag: 4, fai: -1 } } },
    { text: '시장 상인이 셈을 틀린 것을 바로잡아 주었다.', fx: { stats: { int: 2, mor: 1 } } },
    { text: '무도회 초대장이 날아왔다!', fx: { stats: { ele: 3, cha: 2 }, fame: 2 },
      cond: (r, age) => age >= 14 },
    { text: '이웃 나라 왕자와 우연히 눈이 마주쳤다.', fx: { stats: { cha: 3 }, stress: -6 },
      cond: (r, age) => age >= 15 },
    { text: '길드에서 마물 퇴치 사례금을 받았다.', fx: { gold: [40, 90], fame: 3 },
      cond: (r) => r.stats.cmb >= 120 },
    { text: '{N}의 그림이 화랑 창가에 걸렸다.', fx: { fame: 4, gold: [20, 60] },
      cond: (r) => r.stats.sen >= 200 },
    { text: '광장에서 마을 사람들이 {N}의 이름을 부르며 손을 흔들었다.', fx: { stress: -6, fame: 2 },
      cond: (r) => r.fame >= 30 },
  ];

  // ── 대사·외형 ─────────────────────────────────────────
  const NAMES = ['아리아', '세레나', '엘리제', '로제', '마리엘', '클로에', '비비안',
    '이레네', '루시아', '오필리아', '아델', '샤를로트', '에스텔', '플로라'];
  const HAIR_COLORS = ['#5B3A29', '#E2B860', '#2B2230', '#C2566B', '#C9C6D6', '#8C4A2F', '#3E4E7A'];
  const SKIN_TONES = ['#FFE4D4', '#F7D3B9', '#E9BC98', '#C8916B', '#9C6A4C'];
  const GROUP_DRESS = { body: '#C9534A', mind: '#4B62B5', grace: '#DD6F9F', spirit: '#3F9272' };

  const SPEECH = {
    happy: ['오늘은 뭐든 잘될 것 같아!', '{A} 시간이 제일 좋아!', '언젠가 멋진 어른이 될 거야.', '콧노래가 절로 나와~'],
    calm: ['차근차근 해 볼게요.', '조금씩 늘고 있는 것 같아.', '{A}, 생각보다 재밌어.', '오늘 저녁은 뭘까?'],
    tired: ['조금 쉬고 싶어…', '어깨가 뻐근해…', '{A}… 오늘은 좀 힘들다.'],
    exhausted: ['더는 못 하겠어…', '머리가 핑 돌아…'],
    rest: ['푹 쉬니까 살 것 같아~', '이불 밖은 위험해.', '구름이 양 모양이네.'],
    sick: ['콜록… 미안해요…', '머리가 뜨거워…'],
    poor: ['수업료가 모자라서 집안일을 했어요.', '돈을 좀 벌어야겠어…'],
  };

  return {
    DAY_MS, DAYS_PER_MONTH, SLOT_DAYS, MONTHS_PER_YEAR, DAYS_PER_YEAR,
    START_AGE, END_AGE, TOTAL_DAYS, START_YEAR, START_MONTH, SLOT_NAMES,
    START_GOLD, START_POINTS, POINT_VALUE, ALLOWANCE, STAT_MAX, SICK_DAYS, SICK_COST, EVENT_CHANCE,
    FESTIVAL_MONTH, FESTIVAL_DAY, BASE_OFFLINE_HOURS,
    birthdayGift, rivalScore,
    STAT_GROUPS, STATS, CATEGORIES, ACTIVITIES,
    MASTERY_MAX, MASTERY_GAIN, MASTERY_FEE, masteryXpFor,
    UPGRADES, LEGACY, TIERS, ENDINGS, CONTESTS, EVENTS,
    NAMES, HAIR_COLORS, SKIN_TONES, GROUP_DRESS, SPEECH,
  };
});
