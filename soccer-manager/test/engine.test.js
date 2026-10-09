'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TL = require('../js/engine.js');

function fresh(seed) {
  TL.setRandom(TL.seeded(seed || 1));
  return TL.newGame({ name: '테스트 FC', kit: 'navy' });
}

// 다음 이벤트가 나올 때까지 1초씩 진행
function runUntil(s, kind, limit) {
  for (let i = 0; i < (limit || 100000); i++) {
    const out = TL.tick(s, 1);
    const hit = out.find((e) => e.kind === kind);
    if (hit) return hit;
  }
  throw new Error(kind + ' 이벤트가 오지 않음');
}

/* ------------------------------------------------------------ 구단·리그 */

test('새 게임은 유효한 구단과 리그, RPG 자원을 만든다', () => {
  const s = fresh(1);
  assert.equal(s.club.name, '테스트 FC');
  assert.equal(s.club.kit, 'navy');
  assert.equal(s.tier, 5);
  assert.ok(s.players.length >= 18);
  assert.equal(s.league.teams.length, 7);
  assert.equal(s.league.fixtures.length, 14);
  for (const round of s.league.fixtures) {
    const ids = round.flatMap((m) => [m.h, m.a]);
    assert.equal(new Set(ids).size, 8, '한 라운드에 모든 팀이 한 번씩');
  }
  const nums = s.players.map((p) => p.num);
  assert.equal(new Set(nums).size, nums.length, '등번호 중복 없음');
  assert.deepEqual(s.mat, { tickets: 3, shards: 5, books: 2 });
  assert.equal(s.mgr.lv, 1);
  for (const p of s.players) {
    assert.ok(TL.GRADES[p.grade]);
    assert.ok(TL.SKILLS[p.skill]);
    assert.ok(TL.SKILLS[p.skill].pos.includes(p.pos), '포지션에 맞는 스킬');
  }
  assert.ok(s.players.some((p) => p.grade === 'SR'), '에이스 영웅 선수');
});

test('더블 라운드로빈: 모든 팀 쌍이 홈·원정 한 번씩 만난다', () => {
  const s = fresh(2);
  const pairs = new Map();
  for (const round of s.league.fixtures) for (const m of round) pairs.set(m.h + '>' + m.a, (pairs.get(m.h + '>' + m.a) || 0) + 1);
  assert.equal(pairs.size, 56);
  for (const v of pairs.values()) assert.equal(v, 1);
});

test('라인업은 포메이션 인원을 채우고 부상자를 뺀다', () => {
  const s = fresh(3);
  const hurt = s.players.find((p) => p.pos === 'FW');
  hurt.inj = 3;
  for (const f of Object.keys(TL.FORMATIONS)) {
    TL.setFormation(s, f);
    const { xi } = TL.lineup(s);
    assert.equal(xi.length, 11);
    assert.ok(!xi.some((x) => x.id === hurt.id));
    assert.equal(xi.filter((x) => x.pos === 'GK').length, 1);
    assert.equal(new Set(xi.map((x) => x.id)).size, 11);
  }
});

test('경기 한 판: 결과·경험치·전리품이 반영된다', () => {
  const s = fresh(4);
  const lvBefore = s.players.reduce((n, p) => n + p.lv + p.xp / 1000, 0);
  const ft = runUntil(s, 'fulltime');
  assert.equal(s.round, 1);
  let games = 0, gf = 0, ga = 0;
  for (const id in s.league.table) { games += s.league.table[id].p; gf += s.league.table[id].gf; ga += s.league.table[id].ga; }
  assert.equal(games, 8);
  assert.equal(gf, ga);
  assert.equal(s.league.table.me.gf, ft.gf);
  const goals = s.players.reduce((n, p) => n + p.sGoals, 0);
  assert.equal(goals, ft.gf, '우리 득점자 합 = 우리 골');
  const lvAfter = s.players.reduce((n, p) => n + p.lv + p.xp / 1000, 0);
  assert.ok(lvAfter > lvBefore, '경험치가 쌓인다');
  assert.ok(s.mgr.xp > 0 || s.mgr.lv > 1, '감독 경험치');
});

test('시즌 종료 시 상금·승강·시즌 보상·새 리그가 처리된다', () => {
  const s = fresh(5);
  const before = Object.assign({}, s.mat);
  const end = runUntil(s, 'seasonEnd');
  const sm = end.summary;
  assert.equal(sm.w + sm.d + sm.l, 14);
  assert.equal(s.season, 2);
  assert.equal(s.round, 0);
  assert.equal(s.phase, 'offseason');
  assert.equal(s.history.length, 1);
  if (sm.pos <= 2) assert.equal(s.tier, 4); else assert.equal(s.tier, 5);
  for (const id in s.league.table) assert.equal(s.league.table[id].p, 0);
  assert.ok(s.youth.length >= 1, '유스 콜업');
  assert.ok(s.mat.shards >= before.shards + sm.reward.shards, '돌파석 보상');
  assert.ok(s.mat.books >= before.books + sm.reward.books, '스킬북 보상');
});

test('비시즌을 건너뛰면 다음 시즌 경기 준비로 넘어간다', () => {
  const s = fresh(6);
  runUntil(s, 'seasonEnd');
  assert.ok(TL.skipOffseason(s).ok);
  TL.tick(s, 0.5);
  assert.equal(s.phase, 'pre');
});

/* ---------------------------------------------------------------- 성장 */

test('골드 레벨업은 비용을 내고 OVR을 올린다', () => {
  const s = fresh(7);
  const p = s.players.find((q) => q.lv < TL.levelCap(q.star));
  const cost = TL.levelCost(s, p);
  const ovr = p.ovr, lv = p.lv;
  s.money = cost;
  assert.ok(TL.levelUp(s, p.id).ok);
  assert.equal(p.lv, lv + 1);
  assert.equal(s.money, 0);
  assert.ok(Math.abs(p.ovr - ovr - TL.GRADES[p.grade].growth) < 0.02);
  assert.equal(TL.levelUp(s, p.id).ok, false, '돈이 없으면 실패');
  assert.ok(TL.levelCost(s, p) > cost, '레벨이 오를수록 비싸진다');
});

test('레벨 상한에 막히면 돌파로 상한을 올린다', () => {
  const s = fresh(8);
  const p = s.players[0];
  s.money = 1e13;
  TL.levelUp(s, p.id, 999);
  assert.equal(p.lv, TL.levelCap(1));
  assert.equal(TL.levelUp(s, p.id).ok, false);
  s.mat.shards = 0;
  assert.equal(TL.starUp(s, p.id).ok, false, '돌파석 부족');
  s.mat.shards = 1000;
  const ovr = p.ovr;
  assert.ok(TL.starUp(s, p.id).ok);
  assert.equal(p.star, 2);
  assert.ok(p.ovr > ovr);
  assert.ok(TL.levelUp(s, p.id).ok, '상한이 올라 다시 레벨업 가능');
  for (let i = 0; i < 10; i++) { TL.levelUp(s, p.id, 999); TL.starUp(s, p.id); }
  assert.equal(p.star, TL.MAX_STAR);
  assert.equal(p.lv, TL.levelCap(TL.MAX_STAR));
  assert.equal(TL.starUp(s, p.id).ok, false);
});

test('경험치로 자동 레벨업하되 상한을 넘지 않는다', () => {
  const s = fresh(9);
  s.paused = false;
  for (let i = 0; i < 60; i++) TL.tick(s, 60);
  for (const p of s.players) assert.ok(p.lv <= TL.levelCap(p.star));
  assert.ok(s.players.some((p) => p.lv >= 5));
});

test('스킬 강화는 스킬북과 자금을 쓴다', () => {
  const s = fresh(10);
  const p = s.players[0];
  s.mat.books = 0;
  s.money = 1e12;
  assert.equal(TL.skillUp(s, p.id).ok, false);
  s.mat.books = 100;
  for (let i = 0; i < 20; i++) TL.skillUp(s, p.id);
  assert.equal(p.slv, TL.MAX_SKILL);
  assert.equal(s.mat.books, 100 - 45, '1+2+…+9권');
});

test('패시브 스킬은 팀 능력치에 더해진다', () => {
  const s = fresh(11);
  const { xi } = TL.lineup(s);
  const df = s.players.find((p) => p.id === xi.find((x) => x.pos === 'DF').id);
  df.skill = 'wall';
  df.slv = 1;
  const a = TL.teamRating(s, xi).def;
  df.slv = 10;
  const b = TL.teamRating(s, xi).def;
  assert.ok(Math.abs((b - a) - 0.15 * 9) < 1e-9);
});

test('방출은 최소 인원과 마지막 골키퍼를 지키고 돌파석을 준다', () => {
  const s = fresh(12);
  const gks = s.players.filter((p) => p.pos === 'GK');
  const shards = s.mat.shards;
  assert.ok(TL.releasePlayer(s, gks[0].id).ok);
  assert.ok(s.mat.shards > shards);
  assert.equal(TL.releasePlayer(s, gks[1].id).ok, false, '마지막 골키퍼');
  while (s.players.length > TL.SQUAD_MIN) {
    const p = s.players.find((q) => q.pos !== 'GK');
    TL.releasePlayer(s, p.id);
  }
  assert.equal(TL.releasePlayer(s, s.players.find((q) => q.pos !== 'GK').id).ok, false, '최소 인원');
});

/* -------------------------------------------------------------- 스카우트 */

test('프리미엄 10연차는 티켓 10장을 쓰고 영웅 이상을 보장한다', () => {
  for (let seed = 20; seed < 40; seed++) {
    const s = fresh(seed);
    s.mat.tickets = 10;
    const r = TL.scout(s, 'premium', 10);
    assert.ok(r.ok);
    assert.equal(r.results.length, 10);
    const refund = r.events.reduce((n, e) => n + (e.tickets || 0), 0); // 업적 보상 티켓
    assert.equal(s.mat.tickets, refund);
    assert.ok(r.results.some((x) => TL.GRADE_KEYS.indexOf(x.player.grade) >= 2));
    assert.ok(!r.results.some((x) => x.player.grade === 'N'), '프리미엄에는 일반 등급 없음');
  }
});

test('일반 스카우트는 자금을 쓰고, 스쿼드가 차면 돌파석으로 바뀐다', () => {
  const s = fresh(13);
  const price = TL.scoutPrice(s, 'gold', 10).money;
  assert.equal(price, TL.scoutPrice(s, 'gold', 1).money * 9, '10연차 10% 할인');
  s.money = price - 1;
  assert.equal(TL.scout(s, 'gold', 10).ok, false);
  s.money = 1e12;
  while (s.players.length < TL.SQUAD_MAX) TL.scout(s, 'gold', 1);
  const shards = s.mat.shards;
  const r = TL.scout(s, 'gold', 1);
  assert.equal(r.results[0].kept, false);
  assert.ok(s.mat.shards > shards);
  assert.equal(s.players.length, TL.SQUAD_MAX);
});

test('스카우트 확률 합은 100이고 시설이 높을수록 고등급이 늘어난다', () => {
  const s = fresh(14);
  for (const k of ['gold', 'premium']) {
    const o = TL.scoutOdds(s, k);
    const sum = Object.values(o).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) < 1e-9);
  }
  const low = TL.scoutOdds(s, 'premium');
  s.fac.scout = 10;
  const high = TL.scoutOdds(s, 'premium');
  assert.ok(high.SSR > low.SSR && high.UR > low.UR);
});

/* ---------------------------------------------------------------- 장비 */

test('장비 장착·강화·해제가 OVR에 반영된다', () => {
  const s = fresh(15);
  const p = s.players[0];
  s.items.push({ id: 900, slot: 'boots', grade: 'SR', plus: 0, name: '테스트 부트', owner: null });
  const base = p.ovr;
  assert.ok(TL.equipItem(s, 900, p.id).ok);
  assert.ok(Math.abs(p.ovr - base - 1.2) < 0.02);
  s.money = 1e12;
  for (let i = 0; i < 20; i++) TL.enhanceItem(s, 900);
  assert.equal(s.items[0].plus, TL.MAX_PLUS);
  assert.ok(Math.abs(p.ovr - base - (1.2 + 0.12 * 15)) < 0.02);
  assert.ok(TL.unequipItem(s, 900).ok);
  assert.ok(Math.abs(p.ovr - base) < 0.02);
});

test('한 선수는 슬롯당 장비 하나만 낀다', () => {
  const s = fresh(16);
  const p = s.players[0];
  s.items.push({ id: 1, slot: 'boots', grade: 'N', plus: 0, name: 'a', owner: null });
  s.items.push({ id: 2, slot: 'boots', grade: 'R', plus: 0, name: 'b', owner: null });
  TL.equipItem(s, 1, p.id);
  TL.equipItem(s, 2, p.id);
  assert.equal(s.items.filter((i) => i.owner === p.id).length, 1);
  assert.equal(s.items.find((i) => i.owner === p.id).id, 2);
});

test('자동 장착은 선발에게 좋은 장비부터 준다', () => {
  const s = fresh(17);
  s.items.push({ id: 1, slot: 'boots', grade: 'UR', plus: 0, name: 'a', owner: null });
  s.items.push({ id: 2, slot: 'gear', grade: 'N', plus: 0, name: 'b', owner: null });
  assert.ok(TL.autoEquip(s).ok);
  const xi = new Set(TL.lineup(s).xi.map((x) => x.id));
  assert.ok(xi.has(s.items[0].owner));
  assert.notEqual(s.items[1].owner, null);
});

test('일괄 분해는 장착·강화된 장비를 남긴다', () => {
  const s = fresh(18);
  s.items.push({ id: 1, slot: 'boots', grade: 'N', plus: 0, name: 'a', owner: null });
  s.items.push({ id: 2, slot: 'boots', grade: 'N', plus: 3, name: 'b', owner: null });
  s.items.push({ id: 3, slot: 'gear', grade: 'N', plus: 0, name: 'c', owner: s.players[0].id });
  s.items.push({ id: 4, slot: 'gear', grade: 'SR', plus: 0, name: 'd', owner: null });
  const money = s.money;
  assert.ok(TL.dismantleBelow(s, 'R').ok);
  assert.deepEqual(s.items.map((i) => i.id), [2, 3, 4]);
  assert.ok(s.money > money);
});

/* ---------------------------------------------------------------- 감독 */

test('특성 포인트를 쓰고 되돌릴 수 있다', () => {
  const s = fresh(19);
  assert.equal(TL.addTalent(s, 'atk').ok, false, '포인트 없음');
  s.mgr.pts = 3;
  const { xi } = TL.lineup(s);
  const a = TL.teamRating(s, xi).att;
  TL.addTalent(s, 'atk'); TL.addTalent(s, 'atk');
  assert.ok(Math.abs(TL.teamRating(s, xi).att - a - 0.8) < 1e-9);
  s.money = 1e12;
  assert.ok(TL.resetTalents(s).ok);
  assert.equal(s.mgr.pts, 3);
  assert.equal(s.mgr.tal.atk, 0);
});

test('카리스마 5포인트면 경기당 감독 지시가 3회', () => {
  const s = fresh(21);
  s.mgr.tal.chari = 5;
  runUntil(s, 'kickoff');
  assert.equal(s.live.ordersLeft, 3);
  assert.ok(TL.issueOrder(s, 'allout').ok);
});

test('감독 지시는 기본 경기당 2회까지만', () => {
  const s = fresh(22);
  assert.equal(TL.issueOrder(s, 'allout').ok, false, '경기 전에는 불가');
  runUntil(s, 'kickoff');
  assert.ok(TL.issueOrder(s, 'allout').ok);
  assert.ok(TL.issueOrder(s, 'park').ok);
  assert.equal(TL.issueOrder(s, 'focus').ok, false);
});

/* -------------------------------------------------------- 엔드게임·저장 */

test('1부 우승 시 명성이 올라 1부 상대가 강해진다', () => {
  const s = fresh(23);
  assert.equal(TL.tierAI(s, 1), TL.TIERS[1].ai);
  s.prestige = 2;
  assert.equal(TL.tierAI(s, 1), TL.TIERS[1].ai + 5);
  assert.ok(TL.scaleOf(s, 1) > TL.TIERS[1].scale);
  assert.equal(TL.tierAI(s, 3), TL.TIERS[3].ai, '하위 리그는 그대로');
});

test('저장 → 불러오기 왕복 후에도 진행이 이어진다', () => {
  const s = fresh(24);
  runUntil(s, 'fulltime');
  const json = TL.serialize(s);
  const t = TL.deserialize(json);
  assert.deepEqual(t, JSON.parse(json));
  runUntil(t, 'fulltime');
  assert.equal(t.round, 2);
  assert.throws(() => TL.deserialize('{"v":999}'));
  assert.throws(() => TL.deserialize('null'));
});

test('v1(구단 운영판) 저장본을 RPG판으로 옮긴다', () => {
  const s = fresh(25);
  const v1 = JSON.parse(TL.serialize(s));
  v1.v = 1;
  delete v1.mgr; delete v1.mat; delete v1.items;
  v1.players = v1.players.map((p) => ({ id: p.id, name: p.name, pos: p.pos, age: 25, ovr: 44.5, pot: 75, fit: 90, inj: 0, goals: 2, apps: 3, sGoals: 1, sApps: 2, youth: false, joined: 1, rest: false, num: p.num }));
  v1.market = [];
  const t = TL.deserialize(JSON.stringify(v1));
  assert.equal(t.v, 2);
  assert.equal(t.players[0].grade, 'SR', '잠재력 75 → 영웅');
  assert.equal(t.players[0].lv, 1);
  assert.ok(Math.abs(t.players[0].ovr - 44.5) < 0.01, '능력치 보존');
  assert.equal(t.mat.tickets, 5);
  assert.equal(t.market, undefined);
  runUntil(t, 'fulltime');
});

test('오프라인 진행은 상한과 배율을 지키고 일시정지면 멈춘다', () => {
  const s = fresh(26);
  const r = TL.applyOffline(s, 10 * 3600);
  assert.ok(r.capped);
  assert.equal(r.gameSec, TL.OFFLINE_CAP * TL.OFFLINE_RATE);
  assert.ok(r.w + r.d + r.l > 0);
  assert.ok(r.levels > 0, '자리를 비운 동안에도 선수가 큰다');
  const p = fresh(27);
  TL.setPaused(p, true);
  assert.equal(TL.applyOffline(p, 3600), null);
});

test('오프라인 진행은 시즌이 끝나면 비시즌에서 기다린다', () => {
  const s = fresh(28);
  const r = TL.applyOffline(s, TL.OFFLINE_CAP);
  assert.equal(r.seasons.length, 1, '시즌을 하나만 마무리');
  assert.ok(r.held);
  assert.equal(s.phase, 'offseason');
  assert.equal(s.phaseT, 0);
  assert.equal(s.season, 2);
  TL.tick(s, TL.T.offseason + 0.5);
  assert.equal(s.phase, 'pre', '돌아오면 정상 진행');
});

test('여러 시즌을 돌려도 상태가 망가지지 않는다', () => {
  const s = fresh(29);
  for (let i = 0; i < 4; i++) {
    runUntil(s, 'seasonEnd', 200000);
    TL.skipOffseason(s);
  }
  assert.equal(s.season, 5);
  assert.ok(s.players.length >= TL.SQUAD_MIN);
  assert.ok(Number.isFinite(s.money));
  for (const p of s.players) {
    assert.ok(p.lv <= TL.levelCap(p.star));
    assert.ok(p.fit >= 0 && p.fit <= 100);
  }
  assert.ok(s.items.length <= TL.INVENTORY_MAX);
  TL.deserialize(TL.serialize(s));
});

test('금액 표기와 조사 처리', () => {
  assert.equal(TL.fmtMoney(35000000), '₩3,500만');
  assert.equal(TL.fmtMoney(120000000), '₩1.2억');
  assert.equal(TL.fmtMoney(12000000000), '₩120억');
  assert.equal(TL.fmtMoney(-250000000), '-₩2.5억');
  assert.equal(TL.josa('김민준', '이', '가'), '김민준이');
  assert.equal(TL.josa('실바', '이', '가'), '실바가');
});

test('승률 전망 합은 1', () => {
  const p = TL.outcomeProbs(1.4, 1.1);
  assert.ok(Math.abs(p.w + p.d + p.l - 1) < 1e-9);
  assert.ok(p.w > p.l);
});
