#!/usr/bin/env node
/*
 * 밸런스 점검용 자동 플레이 시뮬레이션.
 * 단순한 규칙으로 레벨업·스카우트·돌파·장비·시설에 투자하는 "자동 감독"이 N시즌을 치른다.
 *
 *   node scripts/simulate.js [시즌 수=20] [시드=7]
 */
'use strict';
const TL = require('../js/engine.js');

const seasons = Number(process.argv[2] || 20);
const seed = Number(process.argv[3] || 7);
TL.setRandom(TL.seeded(seed));

const s = TL.newGame({ name: '시뮬 FC', kit: 'red' });
const gi = (g) => TL.GRADE_KEYS.indexOf(g);

function manage() {
  // 스카우트: 티켓이 10장이면 10연차, 아니면 한 장씩
  while (s.mat.tickets >= 10) TL.scout(s, 'premium', 10);
  while (s.mat.tickets >= 1) TL.scout(s, 'premium', 1);
  // 일반 스카우트: 10연차 값이 자금의 15% 이하면
  const g10 = TL.scoutPrice(s, 'gold', 10).money;
  if (g10 <= s.money * 0.15 && s.players.length <= 20) TL.scout(s, 'gold', 10);
  // 유스: 영웅 이상만
  for (const y of s.youth.slice()) if (gi(y.grade) >= 2 && s.players.length < 26) TL.promoteYouth(s, y.id);
  // 선발에 못 드는 낮은 등급 정리
  const xi = new Set(TL.lineup(s).xi.map((x) => x.id));
  while (s.players.length > 22) {
    const v = s.players.filter((p) => !xi.has(p.id)).sort((a, b) => a.ovr - b.ovr)[0];
    if (!v || !TL.releasePlayer(s, v.id).ok) break;
  }
  // 돌파·스킬
  for (const id of xi) {
    const p = s.players.find((q) => q.id === id);
    if (!p) continue;
    if (p.lv >= TL.levelCap(p.star)) TL.starUp(s, id);
    TL.skillUp(s, id);
  }
  // 특성
  const order = ['atk', 'def', 'money', 'train', 'nego', 'chari'];
  while (s.mgr.pts > 0) {
    const k = order.find((x) => s.mgr.tal[x] < TL.TALENTS[x].max);
    if (!k) break;
    TL.addTalent(s, k);
  }
  // 장비
  TL.autoEquip(s);
  TL.dismantleBelow(s, 'N');
  // 시설: 관중이 꽉 차면 경기장, 아니면 가장 싼 시설 (자금의 30%까지)
  const att = s.fans * TL.ECON.attendRate;
  const pri = att >= TL.stadiumCap(s) * 0.9 ? ['stadium'] : [];
  const rest = TL.FAC_KEYS.filter((k) => k !== 'stadium' && s.fac[k] < TL.FAC_MAX)
    .sort((a, b) => TL.facilityCost(a, s.fac[a]) - TL.facilityCost(b, s.fac[b]));
  for (const k of pri.concat(rest)) {
    if (s.fac[k] >= TL.FAC_MAX) continue;
    if (TL.facilityCost(k, s.fac[k]) <= s.money * 0.3) TL.upgradeFacility(s, k);
  }
  // 장비 강화: 자금의 10%
  const eq = s.items.filter((i) => i.owner != null).sort((a, b) => TL.enhanceCost(a) - TL.enhanceCost(b))[0];
  if (eq && TL.enhanceCost(eq) <= s.money * 0.1) TL.enhanceItem(s, eq.id);
  // 남은 돈으로 선발 레벨업
  TL.levelUpTeam(s, s.money * 0.9);
}

const rows = [];
let guard = 0;
while (s.season <= seasons && guard++ < 5e6) {
  const out = TL.tick(s, 1);
  for (const e of out) {
    if (e.kind === 'fulltime') manage();
    if (e.kind === 'seasonEnd') {
      const sm = e.summary;
      const lu = TL.lineup(s).xi.map((x) => s.players.find((p) => p.id === x.id)).filter(Boolean);
      const grades = TL.GRADE_KEYS.map((g) => lu.filter((p) => p.grade === g).length).join('/');
      rows.push({
        시즌: sm.season, 리그: sm.tierName, 순위: sm.pos, 전적: `${sm.w}-${sm.d}-${sm.l}`,
        결과: sm.champion ? '우승' : sm.move < 0 ? '승격' : sm.move > 0 ? '강등' : '',
        자금: TL.fmtMoney(s.money), 'XI OVR': TL.rateXI(TL.lineup(s).xi).ovr.toFixed(1),
        '평균Lv': (lu.reduce((n, p) => n + p.lv, 0) / lu.length).toFixed(1),
        '등급 N/R/SR/SSR/UR': grades,
        감독: s.mgr.lv, 명성: s.prestige, 시설: TL.FAC_KEYS.map((k) => s.fac[k]).join(''),
        수입: TL.fmtMoney(sm.fin.gate + sm.fin.tv + sm.fin.sponsor + sm.fin.merch + sm.fin.bonus),
      });
    }
  }
}
console.table(rows);
console.log(`게임 시간 ${(s.time / 60).toFixed(0)}분(1배속 기준), 업적 ${Object.keys(s.ach).length}/${TL.ACHIEVEMENTS.length}, 스카우트 ${s.stats.scouted}회, 장비 ${s.items.length}개`);
