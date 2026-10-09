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

test('새 게임은 유효한 구단과 리그를 만든다', () => {
  const s = fresh(1);
  assert.equal(s.club.name, '테스트 FC');
  assert.equal(s.club.kit, 'navy');
  assert.equal(s.tier, 5);
  assert.ok(s.players.length >= 18);
  assert.equal(s.league.teams.length, 7);
  assert.equal(s.league.fixtures.length, 14);
  for (const round of s.league.fixtures) {
    assert.equal(round.length, 4);
    const ids = round.flatMap((m) => [m.h, m.a]);
    assert.equal(new Set(ids).size, 8, '한 라운드에 모든 팀이 한 번씩');
  }
  const nums = s.players.map((p) => p.num);
  assert.equal(new Set(nums).size, nums.length, '등번호 중복 없음');
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

test('경기 한 판: 결과가 순위표와 통계에 반영된다', () => {
  const s = fresh(4);
  const ft = runUntil(s, 'fulltime');
  assert.equal(s.round, 1);
  const tbl = s.league.table;
  let games = 0, gf = 0, ga = 0;
  for (const id in tbl) { games += tbl[id].p; gf += tbl[id].gf; ga += tbl[id].ga; }
  assert.equal(games, 8, '4경기 × 2팀');
  assert.equal(gf, ga);
  assert.equal(tbl.me.gf, ft.gf);
  assert.equal(s.stats.w + s.stats.d + s.stats.l, 1);
  const goals = s.players.reduce((n, p) => n + p.sGoals, 0);
  assert.equal(goals, ft.gf, '우리 득점자 합 = 우리 골');
});

test('시즌 종료 시 상금·승강·나이·새 리그가 처리된다', () => {
  const s = fresh(5);
  const ages = new Map(s.players.map((p) => [p.id, p.age]));
  const end = runUntil(s, 'seasonEnd');
  const sm = end.summary;
  assert.equal(sm.w + sm.d + sm.l, 14);
  assert.ok(sm.pos >= 1 && sm.pos <= 8);
  assert.equal(s.season, 2);
  assert.equal(s.round, 0);
  assert.equal(s.phase, 'offseason');
  assert.equal(s.history.length, 1);
  if (sm.pos <= 2) assert.equal(s.tier, 4); else assert.equal(s.tier, 5);
  for (const p of s.players) if (ages.has(p.id)) assert.equal(p.age, ages.get(p.id) + 1);
  for (const id in s.league.table) assert.equal(s.league.table[id].p, 0);
  assert.ok(s.youth.length >= 1, '유스 콜업');
});

test('비시즌을 건너뛰면 다음 시즌 경기 준비로 넘어간다', () => {
  const s = fresh(6);
  runUntil(s, 'seasonEnd');
  assert.ok(TL.skipOffseason(s).ok);
  TL.tick(s, 0.5);
  assert.equal(s.phase, 'pre');
});

test('영입과 판매는 자금과 스쿼드 제한을 지킨다', () => {
  const s = fresh(7);
  const m = s.market[0];
  s.money = m.price - 1;
  assert.equal(TL.buyPlayer(s, m.id).ok, false);
  s.money = m.price + 100;
  const n = s.players.length;
  assert.ok(TL.buyPlayer(s, m.id).ok);
  assert.equal(s.players.length, n + 1);
  assert.equal(s.money, 100);
  assert.ok(!s.market.some((x) => x.id === m.id));
  const joined = s.players.find((p) => p.id === m.id);
  assert.equal(joined.price, undefined, '시장 전용 필드 정리');

  const before = s.money;
  const target = s.players.find((p) => p.pos === 'MF');
  const price = TL.sellPrice(target);
  assert.ok(TL.sellPlayer(s, target.id).ok);
  assert.equal(s.money, before + price);

  while (s.players.length > TL.SQUAD_MIN) {
    const p = s.players.find((q) => q.pos !== 'GK');
    TL.sellPlayer(s, p.id);
  }
  assert.equal(TL.sellPlayer(s, s.players[0].id).ok, false, '최소 인원 보호');
});

test('마지막 골키퍼는 팔 수 없다', () => {
  const s = fresh(8);
  const gks = s.players.filter((p) => p.pos === 'GK');
  TL.sellPlayer(s, gks[0].id);
  assert.equal(TL.sellPlayer(s, gks[1].id).ok, false);
});

test('시설 업그레이드는 비용을 내고 레벨을 올린다', () => {
  const s = fresh(9);
  const cost = TL.facilityCost('stadium', 1);
  s.money = cost;
  const cap = TL.stadiumCap(s);
  assert.ok(TL.upgradeFacility(s, 'stadium').ok);
  assert.equal(s.fac.stadium, 2);
  assert.equal(s.money, 0);
  assert.ok(TL.stadiumCap(s) > cap);
  assert.equal(TL.upgradeFacility(s, 'stadium').ok, false);
  s.fac.stadium = TL.FAC_MAX;
  s.money = 1e15;
  assert.equal(TL.upgradeFacility(s, 'stadium').ok, false);
});

test('감독 지시는 경기 중 2회까지만', () => {
  const s = fresh(10);
  assert.equal(TL.issueOrder(s, 'allout').ok, false, '경기 전에는 불가');
  runUntil(s, 'kickoff');
  assert.ok(TL.issueOrder(s, 'allout').ok);
  assert.ok(TL.issueOrder(s, 'park').ok);
  assert.equal(TL.issueOrder(s, 'focus').ok, false);
  assert.equal(s.live.ordersLeft, 0);
});

test('저장 → 불러오기 왕복 후에도 진행이 이어진다', () => {
  const s = fresh(11);
  runUntil(s, 'fulltime');
  const json = TL.serialize(s);
  const t = TL.deserialize(json);
  assert.deepEqual(t, JSON.parse(json));
  runUntil(t, 'fulltime');
  assert.equal(t.round, 2);
  assert.throws(() => TL.deserialize('{"v":999}'));
  assert.throws(() => TL.deserialize('null'));
});

test('오프라인 진행은 상한과 배율을 지키고 일시정지면 멈춘다', () => {
  const s = fresh(12);
  const r = TL.applyOffline(s, 10 * 3600);
  assert.ok(r.capped);
  assert.equal(r.gameSec, TL.OFFLINE_CAP * TL.OFFLINE_RATE);
  assert.ok(r.w + r.d + r.l > 0);
  assert.ok(Math.abs(s.time - r.gameSec) < 1e-6);
  const p = fresh(13);
  TL.setPaused(p, true);
  assert.equal(TL.applyOffline(p, 3600), null);
});

test('오프라인 진행은 시즌이 끝나면 비시즌에서 기다린다', () => {
  const s = fresh(15);
  const r = TL.applyOffline(s, TL.OFFLINE_CAP);
  assert.equal(r.seasons.length, 1, '시즌을 하나만 마무리');
  assert.ok(r.held);
  assert.equal(s.phase, 'offseason');
  assert.equal(s.phaseT, 0);
  assert.equal(s.season, 2);
  assert.equal(s.round, 0);
  TL.tick(s, TL.T.offseason + 0.5);
  assert.equal(s.phase, 'pre', '돌아오면 정상 진행');
});

test('여러 시즌을 돌려도 상태가 망가지지 않는다', () => {
  const s = fresh(14);
  for (let i = 0; i < 4; i++) runUntil(s, 'seasonEnd', 200000);
  assert.equal(s.season, 5);
  assert.ok(s.players.length >= 14);
  assert.ok(s.players.filter((p) => p.pos === 'GK').length >= 1);
  assert.ok(Number.isFinite(s.money));
  for (const p of s.players) {
    assert.ok(p.ovr <= p.pot + 1e-9, '능력치는 잠재력을 넘지 않는다');
    assert.ok(p.fit >= 0 && p.fit <= 100);
  }
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
