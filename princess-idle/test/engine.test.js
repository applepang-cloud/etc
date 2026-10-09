'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/data.js');
const E = require('../js/engine.js');

function fresh(seed = 1, name = '아리아') {
  const state = E.createState(seed);
  E.newRun(state, name);
  return state;
}

test('달력: 4월 1일에 시작해 30일 단위로 달이 바뀐다', () => {
  assert.deepEqual(E.calendar(0), { year: 1210, month: 4, day: 1, slot: 0, dayInSlot: 0 });
  assert.equal(E.calendar(29).day, 30);
  assert.equal(E.calendar(29).slot, 2);
  assert.equal(E.calendar(30).month, 5);
  assert.equal(E.calendar(270).month, 1);
  assert.equal(E.calendar(270).year, 1211);
});

test('조사는 받침에 따라 바뀐다', () => {
  assert.equal(E.josa('아리아', '이'), '아리아가');
  assert.equal(E.josa('클로에', '은'), '클로에는');
  assert.equal(E.josa('에스텔', '이'), '에스텔이');
  assert.equal(E.josa('에스텔', '과'), '에스텔과');
  assert.equal(E.josa('Anna', '은'), 'Anna은(는)');
  assert.equal(E.fill('{N이} 웃었다', '로제'), '로제가 웃었다');
});

test('8년(2880일)이 지나면 성인식과 함께 엔딩이 정해진다', () => {
  const state = fresh(3);
  const rep = E.simulate(state, 99999);
  assert.equal(rep.days, D.TOTAL_DAYS);
  assert.equal(state.run.totalDays, D.TOTAL_DAYS);
  assert.ok(state.run.ended);
  assert.ok(E.END[state.run.ended.ending]);
  assert.ok(state.meta.stars > 0);
  assert.equal(state.meta.history.length, 1);
  assert.equal(E.stepDay(state), null, '끝난 뒤에는 더 진행되지 않는다');
});

test('다음 세대는 유산을 이어받고 나머지는 새로 시작한다', () => {
  const state = fresh(4);
  E.buyUpgrade(state, 'bookshelf');
  E.simulate(state, D.TOTAL_DAYS);
  const stars = state.meta.stars;
  state.meta.stars = 1000;
  assert.ok(E.buyLegacy(state, 'inherit').ok);
  assert.ok(E.buyLegacy(state, 'talent').ok);
  E.startNextGeneration(state, '로제');
  assert.equal(state.meta.generation, 2);
  assert.equal(state.run.name, '로제');
  assert.equal(state.run.totalDays, 0);
  assert.equal(state.run.gold, D.START_GOLD + 200);
  assert.deepEqual(state.run.upgrades, {});
  assert.ok(state.run.stats.con >= 25 - 3 + 6);
  assert.ok(stars > 0);
});

test('엔딩 판정: 아무것도 없으면 평범한 아가씨, 모두 999면 여왕', () => {
  const state = fresh(5);
  const low = Object.assign({}, state.run, { stats: Object.fromEntries(D.STATS.map((s) => [s.id, 10])), gold: 0, fame: 0 });
  assert.equal(E.evaluateEnding(low).id, 'villager');
  const high = Object.assign({}, state.run, { stats: Object.fromEntries(D.STATS.map((s) => [s.id, 999])), fame: 500 });
  assert.equal(E.evaluateEnding(high).id, 'queen');
});

test('모든 엔딩은 서로 다른 id를 가지고, 마지막 엔딩은 항상 성립한다', () => {
  const ids = new Set(D.ENDINGS.map((e) => e.id));
  assert.equal(ids.size, D.ENDINGS.length);
  assert.ok(D.ENDINGS[D.ENDINGS.length - 1].check({}, {}));
  for (const e of D.ENDINGS) assert.ok(D.TIERS[e.tier], e.id);
});

test('해금 조건이 안 맞는 활동은 일정에 넣을 수 없다', () => {
  const state = fresh(6);
  const res = E.setSchedule(state, 0, 'tutor');
  assert.equal(res.ok, false);
  assert.ok(res.unmet.includes('13세부터'));
  assert.equal(E.setSchedule(state, 0, 'art').ok, true);
  assert.equal(state.run.schedule[0], 'art');
});

test('상점: 골드를 내고 레벨이 오르며, 최고 단계 이후로는 못 산다', () => {
  const state = fresh(7);
  state.run.gold = 1e9;
  const up = E.UPG.scholarship;
  for (let i = 0; i < up.max; i++) assert.ok(E.buyUpgrade(state, 'scholarship').ok);
  assert.equal(E.buyUpgrade(state, 'scholarship').reason, 'max');
  state.run.gold = 0;
  assert.equal(E.buyUpgrade(state, 'bookshelf').reason, 'gold');
});

test('자동 휴식을 끄고 무리하면 앓아눕는다', () => {
  const state = fresh(8);
  E.setAutoRest(state, { enabled: false });
  state.run.gold = 1e6;
  state.run.schedule = ['fencing', 'fencing', 'fencing'];
  let sick = 0;
  for (let i = 0; i < 200; i++) E.stepDay(state, (e) => { if (e.kind === 'sick') sick++; });
  assert.ok(sick > 0);
});

test('자동 휴식이 켜져 있으면 스트레스가 한계에 닿기 전에 쉰다', () => {
  const state = fresh(9);
  state.run.gold = 1e6;
  state.run.schedule = ['fencing', 'fencing', 'fencing'];
  let sick = 0;
  let maxStress = 0;
  for (let i = 0; i < 400; i++) {
    E.stepDay(state, (e) => { if (e.kind === 'sick') sick++; });
    maxStress = Math.max(maxStress, state.run.stress);
  }
  assert.equal(sick, 0);
  assert.ok(maxStress < 100);
});

test('수업료가 모자라면 집안일을 대신 한다', () => {
  const state = fresh(10);
  state.run.gold = 0;
  state.run.schedule = ['study', 'study', 'study'];
  E.stepDay(state);
  assert.equal(state.run.current.id, 'housework');
  assert.equal(state.run.current.reason, 'nogold');
});

test('자동 구매는 일정과 관계있는 물건만 사고, 한 달 수업료는 남긴다', () => {
  const state = fresh(11);
  state.run.schedule = ['study', 'flower', 'rest'];
  state.run.gold = 5000;
  const bought = E.autoBuy(state);
  assert.ok(bought.length > 0);
  assert.equal(E.upgradeLevel(state, 'crystal'), 0, '마력과 관계없는 일정이면 수정 구슬은 사지 않는다');
  assert.equal(E.upgradeLevel(state, 'armor'), 0);
  assert.ok(E.upgradeLevel(state, 'bookshelf') > 0);
  const reserve = 5 * (1 + D.MASTERY_FEE * D.MASTERY_MAX) * D.SLOT_DAYS;
  assert.ok(state.run.gold >= reserve);
});

test('저장 후 불러오면 같은 미래가 펼쳐진다 (시드 난수 포함)', () => {
  const a = fresh(12);
  E.simulate(a, 500);
  const b = E.deserialize(E.serialize(a));
  E.simulate(a, 700);
  E.simulate(b, 700);
  assert.deepEqual(b.run.stats, a.run.stats);
  assert.equal(b.run.gold, a.run.gold);
  assert.equal(b.rng, a.rng);
});

test('망가진 저장 데이터는 거부하고, 빠진 값은 채워 넣는다', () => {
  assert.throws(() => E.deserialize('{}'));
  const state = fresh(13);
  const raw = JSON.parse(E.serialize(state));
  delete raw.meta.autoRest;
  delete raw.run.mastery;
  raw.run.schedule = ['study', 'nope'];
  const loaded = E.deserialize(raw);
  assert.deepEqual(loaded.meta.autoRest, { enabled: true, at: 80, until: 25 });
  assert.deepEqual(loaded.run.mastery, {});
  assert.deepEqual(loaded.run.schedule, ['study', 'rest', 'rest']);
});

test('수확제는 매년 10월 15일에 열린다', () => {
  const state = fresh(14);
  const festivals = [];
  E.simulate(state, D.TOTAL_DAYS);
  for (const entry of state.log) if (entry.kind === 'festival') festivals.push(E.calendar(entry.day));
  assert.ok(festivals.length > 0);
  for (const c of festivals) assert.deepEqual([c.month, c.day], [10, 15]);
});

test('유산 효과: 속도와 오프라인 한도가 오른다', () => {
  const state = fresh(15);
  assert.equal(E.speedOf(state), 1);
  assert.equal(E.offlineCapMs(state), 3600 * 1000);
  state.meta.legacy.hourglass = 4;
  state.meta.legacy.dream = 2;
  assert.equal(E.speedOf(state), 2);
  assert.equal(E.offlineCapMs(state), 3 * 3600 * 1000);
});

test('시작 보너스: 포인트 3개를 원하는 능력치에 나눠 준다 (1포인트 = +10)', () => {
  const state = fresh(16);
  assert.equal(state.run.bonusPoints, D.START_POINTS);
  const before = Object.assign({}, state.run.stats);
  const res = E.spendStartPoints(state, { int: 2, cha: 1 });
  assert.ok(res.ok);
  assert.equal(state.run.bonusPoints, 0);
  assert.equal(state.run.stats.int, before.int + 2 * D.POINT_VALUE);
  assert.equal(state.run.stats.cha, before.cha + D.POINT_VALUE);
  assert.equal(state.run.stats.con, before.con);
  assert.equal(state.run.monthStart.int, state.run.stats.int, '이번 달 변화에 보너스가 섞이지 않는다');
});

test('시작 보너스: 남은 포인트보다 많이, 잘못된 값으로, 시작한 뒤에는 쓸 수 없다', () => {
  const state = fresh(17);
  assert.equal(E.spendStartPoints(state, { int: 4 }).reason, 'too_many');
  assert.equal(E.spendStartPoints(state, { int: -1 }).reason, 'invalid');
  assert.equal(E.spendStartPoints(state, { int: 1.5 }).reason, 'invalid');
  assert.equal(E.spendStartPoints(state, { luck: 1 }).reason, 'invalid');
  assert.equal(state.run.bonusPoints, D.START_POINTS, '실패하면 포인트가 그대로 남는다');
  E.stepDay(state);
  assert.equal(E.spendStartPoints(state, { int: 1 }).reason, 'started');
});

test('다음 세대도 시작 보너스를 새로 받는다', () => {
  const state = fresh(18);
  E.spendStartPoints(state, { fai: 3 });
  E.simulate(state, D.TOTAL_DAYS);
  E.startNextGeneration(state, '아델');
  assert.equal(state.run.bonusPoints, D.START_POINTS);
});

test('시작 전 이름 바꾸기는 능력치를 다시 굴리지 않고 첫 일지도 고친다', () => {
  const state = fresh(19, '아리아');
  const stats = Object.assign({}, state.run.stats);
  assert.ok(E.renameRun(state, '  에스텔 '));
  assert.equal(state.run.name, '에스텔');
  assert.deepEqual(state.run.stats, stats);
  assert.match(state.log.find((e) => e.welcome).text, /^에스텔이 /);
  assert.equal(E.renameRun(state, '   '), false);
});

test('성장 포인트: 10일마다 1개, 숙련도 레벨업과 생일에 더 쌓인다', () => {
  const state = fresh(20);
  state.run.gold = 1e6;
  state.run.schedule = ['study', 'study', 'study'];
  E.setAutoRest(state, { enabled: false });
  let levelUps = 0;
  for (let i = 0; i < 10; i++) E.stepDay(state, (e) => { if (e.kind === 'level') levelUps++; });
  assert.equal(levelUps, 1, '10일째에 학문 Lv.1');
  assert.equal(state.run.points, 1 + D.POINT_LEVELUP);
  const s2 = fresh(21);
  E.simulate(s2, D.DAYS_PER_YEAR);
  assert.ok(s2.run.points >= D.DAYS_PER_YEAR / D.POINT_EVERY + D.POINT_BIRTHDAY);
});

test('성장 포인트: 필요 포인트는 능력치마다 다르고, 높을수록 늘어난다', () => {
  const state = fresh(22);
  for (const id of D.POINT_STATS) state.run.stats[id] = 50;
  const costs = D.POINT_STATS.map((id) => E.pointCost(state.run, id));
  assert.ok(new Set(costs).size > 1, '능력치마다 필요 포인트가 다르다');
  assert.equal(E.pointCost(state.run, 'int'), D.POINT_BASE_COST.int);
  state.run.stats.int = 250;
  assert.equal(E.pointCost(state.run, 'int'), D.POINT_BASE_COST.int + 2);
  assert.deepEqual(D.POINT_STATS.map((id) => E.STAT[id].name), ['지력', '체력', '매력', '인성', '감성', '영성']);
});

test('성장 포인트: 모자라면 못 올리고, 넉넉하면 필요한 만큼만 쓴다', () => {
  const state = fresh(27);
  state.run.stats.mor = 50;
  state.run.points = 1;
  const res = E.spendPoints(state, 'mor');
  assert.equal(res.reason, 'points');
  assert.equal(res.cost, 2);
  assert.equal(state.run.points, 1, '실패하면 포인트가 그대로 남는다');
  state.run.points = 5;
  assert.ok(E.spendPoints(state, 'mor').ok);
  assert.equal(state.run.stats.mor, 50 + D.POINT_GAIN);
  assert.equal(state.run.points, 3);
  assert.equal(E.spendPoints(state, 'mag').reason, 'invalid', '마력은 포인트로 못 올린다');
});

test('다음 성장 포인트까지 남은 날', () => {
  const state = fresh(28);
  assert.equal(E.daysToNextPoint(state.run), D.POINT_EVERY);
  E.simulate(state, 3);
  assert.equal(E.daysToNextPoint(state.run), D.POINT_EVERY - 3);
});

test('자동 선택: 골고루면 가장 낮은 능력치, 정해 두면 그 능력치에 쓴다', () => {
  const state = fresh(23);
  for (const id of D.POINT_STATS) state.run.stats[id] = 50;
  state.run.stats.sen = 10;
  state.run.points = 4;
  const spent = E.autoSpend(state);
  assert.deepEqual(spent, { sen: 4 });
  assert.equal(state.run.points, 0);
  assert.ok(E.setAutoTarget(state, 'cha'));
  assert.equal(E.setAutoTarget(state, 'mag'), false);
  state.run.points = 5;
  assert.deepEqual(E.autoSpend(state), { cha: 2 }, '매력은 한 번에 2포인트');
  assert.equal(state.run.points, 1, '모자란 1포인트는 다음을 위해 남긴다');
  state.run.stats.cha = D.STAT_MAX;
  assert.notEqual(E.autoPick(state), 'cha', '최대치면 다른 능력치로 넘어간다');
});

test('보석으로 자동 시간을 사고, 광고는 1분을 더한다', () => {
  const state = fresh(24);
  assert.equal(state.meta.gems, D.START_GEMS);
  const offer = D.AUTO_OFFERS[0];
  assert.ok(E.buyAuto(state, offer.id).ok);
  assert.equal(state.meta.gems, D.START_GEMS - offer.gems);
  assert.equal(state.meta.autoMs, offer.minutes * 60000);
  state.meta.gems = 0;
  assert.equal(E.buyAuto(state, offer.id).reason, 'gems');
  E.grantAdReward(state);
  assert.equal(state.meta.autoMs, offer.minutes * 60000 + D.AD_AUTO_SECONDS * 1000);
  E.useAutoTime(state, 1e12);
  assert.equal(state.meta.autoMs, 0);
});

test('보석은 생일·엔딩에서 얻고 다음 세대에도 남는다', () => {
  const state = fresh(25);
  E.simulate(state, D.TOTAL_DAYS);
  const tier = E.END[state.run.ended.ending].tier;
  assert.equal(state.run.ended.gems, D.GEM_REWARDS.ending[tier]);
  assert.ok(state.meta.gems >= D.START_GEMS + 7 * D.GEM_REWARDS.birthday + D.GEM_REWARDS.ending[tier]);
  const gems = state.meta.gems;
  E.startNextGeneration(state, '로제');
  assert.equal(state.meta.gems, gems);
  assert.equal(state.run.points, 0);
});

test('예전 저장 데이터에는 보석·포인트 기본값이 채워진다', () => {
  const state = fresh(26);
  const raw = JSON.parse(E.serialize(state));
  delete raw.meta.gems;
  delete raw.meta.autoMs;
  delete raw.meta.autoTarget;
  delete raw.run.points;
  const loaded = E.deserialize(raw);
  assert.equal(loaded.meta.gems, D.START_GEMS);
  assert.equal(loaded.meta.autoMs, 0);
  assert.equal(loaded.meta.autoTarget, 'balanced');
  assert.equal(loaded.run.points, 0);
});
