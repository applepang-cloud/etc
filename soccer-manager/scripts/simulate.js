#!/usr/bin/env node
/*
 * 밸런스 점검용 자동 플레이 시뮬레이션.
 * 단순한 규칙으로 영입·판매·시설 투자를 하는 "자동 감독"이 N시즌을 치른다.
 *
 *   node scripts/simulate.js [시즌 수=20] [시드=7]
 */
'use strict';
const TL = require('../js/engine.js');

const seasons = Number(process.argv[2] || 20);
const seed = Number(process.argv[3] || 7);
TL.setRandom(TL.seeded(seed));

const s = TL.newGame({ name: '시뮬 FC', kit: 'red' });

function weakestStarter(pos) {
  const lu = TL.lineup(s);
  const ids = lu.xi.filter((x) => x.pos === pos && x.id !== null).map((x) => x.id);
  const ps = s.players.filter((p) => ids.includes(p.id));
  return ps.sort((a, b) => a.ovr - b.ovr)[0];
}

function manage() {
  const reserve = TL.squadWages(s) * 4;
  // 유스: 잠재력이 높은 순으로 1군 승격
  for (const y of s.youth.slice().sort((a, b) => b.pot - a.pot)) {
    if (s.players.length >= 24) break;
    if (y.pot >= TL.TIERS[s.tier].ai + 10) TL.promoteYouth(s, y.id);
  }
  // 영입: 주전보다 확실히 나은 선수만
  for (const m of s.market.slice().sort((a, b) => b.ovr - a.ovr)) {
    const w = weakestStarter(m.pos);
    if (!w || m.ovr < w.ovr + 3) continue;
    if (m.price > s.money - reserve) continue;
    if (s.players.length >= TL.SQUAD_MAX) {
      const worst = s.players.filter((p) => p.pos === m.pos).sort((a, b) => a.ovr - b.ovr)[0];
      if (worst) TL.sellPlayer(s, worst.id);
    }
    TL.buyPlayer(s, m.id);
  }
  // 초과 인원 정리: 나이 많고 약한 선수부터
  while (s.players.length > 23) {
    const victim = s.players.slice().sort((a, b) => (a.ovr - a.age * 0.3) - (b.ovr - b.age * 0.3))[0];
    if (!TL.sellPlayer(s, victim.id).ok) break;
  }
  // 시설: 관중이 꽉 차면 경기장, 아니면 가장 싼 시설
  const cap = TL.stadiumCap(s);
  const att = s.fans * TL.ECON.attendRate;
  const order = att >= cap * 0.9 ? ['stadium'] : [];
  const rest = TL.FAC_KEYS.filter((k) => k !== 'stadium' && s.fac[k] < TL.FAC_MAX)
    .sort((a, b) => TL.facilityCost(a, s.fac[a]) - TL.facilityCost(b, s.fac[b]));
  for (const k of order.concat(rest)) {
    if (s.fac[k] >= TL.FAC_MAX) continue;
    const c = TL.facilityCost(k, s.fac[k]);
    if (c <= (s.money - reserve) * 0.5) TL.upgradeFacility(s, k);
  }
}

const rows = [];
let lastSeason = s.season;
let guard = 0;
while (s.season <= seasons && guard++ < 5e6) {
  const out = TL.tick(s, 1);
  for (const e of out) {
    if (e.kind === 'fulltime') manage();
    if (e.kind === 'seasonEnd') {
      const sm = e.summary;
      const xi = TL.rateXI(TL.lineup(s).xi);
      rows.push({
        시즌: sm.season, 리그: sm.tierName, 순위: sm.pos, 전적: `${sm.w}-${sm.d}-${sm.l}`,
        결과: sm.champion ? '우승' : sm.move < 0 ? '승격' : sm.move > 0 ? '강등' : '',
        자금: TL.fmtMoney(s.money), 팬: TL.fmtInt(s.fans), 'XI OVR': xi.ovr.toFixed(1),
        시설: TL.FAC_KEYS.map((k) => s.fac[k]).join(''),
        수입: TL.fmtMoney(sm.fin.gate + sm.fin.tv + sm.fin.sponsor + sm.fin.merch + sm.fin.bonus),
        주급: TL.fmtMoney(sm.fin.wages),
      });
    }
  }
  if (s.season !== lastSeason) lastSeason = s.season;
}
console.table(rows);
const minutes = (s.time / 60).toFixed(0);
console.log(`게임 시간 ${minutes}분(1배속 기준), 업적 ${Object.keys(s.ach).length}/${TL.ACHIEVEMENTS.length}`);
