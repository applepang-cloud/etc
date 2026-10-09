/*
 * 방치형 공주 키우기 — 게임 엔진
 * DOM에 의존하지 않는 순수 로직. 하루 단위로 시뮬레이션한다.
 * 브라우저에서는 window.PrincessEngine, Node에서는 require로 쓴다.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const D = isNode ? require('./data.js') : root.PrincessData;
  const api = factory(D);
  if (isNode) module.exports = api;
  else root.PrincessEngine = api;
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  const SAVE_VERSION = 1;
  const LOG_LIMIT = 150;
  const HISTORY_LIMIT = 40;

  const ACT = Object.fromEntries(D.ACTIVITIES.map((a) => [a.id, a]));
  const UPG = Object.fromEntries(D.UPGRADES.map((u) => [u.id, u]));
  const LEG = Object.fromEntries(D.LEGACY.map((l) => [l.id, l]));
  const STAT = Object.fromEntries(D.STATS.map((s) => [s.id, s]));
  const END = Object.fromEntries(D.ENDINGS.map((e) => [e.id, e]));

  // ── 유틸 ───────────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // mulberry32 — 저장 가능한 시드 난수
  function rand(state) {
    let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randInt(state, lo, hi) { return lo + Math.floor(rand(state) * (hi - lo + 1)); }
  function pick(state, list) { return list[Math.floor(rand(state) * list.length)]; }

  // 받침에 따라 조사를 고른다: josa('아리아', '이') → '아리아가'
  const JOSA = { '은': ['은', '는'], '이': ['이', '가'], '을': ['을', '를'], '과': ['과', '와'], '아': ['아', '야'] };
  function josa(word, key) {
    const pair = JOSA[key];
    const code = word.charCodeAt(word.length - 1);
    if (!(code >= 0xac00 && code <= 0xd7a3)) return word + pair[0] + '(' + pair[1] + ')';
    return word + ((code - 0xac00) % 28 ? pair[0] : pair[1]);
  }
  function fill(text, name, extra) {
    let out = text.replace(/\{N([은이을과아]?)\}/g, (_, k) => (k ? josa(name, k) : name));
    if (extra) out = out.replace(/\{(\w)\}/g, (m, k) => (k in extra ? extra[k] : m));
    return out;
  }

  // ── 달력 ───────────────────────────────────────────────
  function calendar(totalDays) {
    const monthsElapsed = Math.floor(totalDays / D.DAYS_PER_MONTH);
    const abs = D.START_MONTH - 1 + monthsElapsed;
    const day = (totalDays % D.DAYS_PER_MONTH) + 1;
    return {
      year: D.START_YEAR + Math.floor(abs / 12),
      month: (abs % 12) + 1,
      day,
      slot: Math.floor((day - 1) / D.SLOT_DAYS),
      dayInSlot: (day - 1) % D.SLOT_DAYS,
    };
  }
  function ageOf(run) { return D.START_AGE + Math.floor(run.totalDays / D.DAYS_PER_YEAR); }
  function season(month) {
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'autumn';
    return 'winter';
  }

  // ── 보정치 ─────────────────────────────────────────────
  function legacyLevel(state, id) { return state.meta.legacy[id] || 0; }
  function upgradeLevel(state, id) { return state.run.upgrades[id] || 0; }

  function legacySum(state, type) {
    let sum = 0;
    for (const l of D.LEGACY) if (l.effect.type === type) sum += l.effect.per * legacyLevel(state, l.id);
    return sum;
  }
  function upgradeSum(state, type) {
    let sum = 0;
    for (const u of D.UPGRADES) if (u.effect.type === type) sum += u.effect.per * upgradeLevel(state, u.id);
    return sum;
  }

  function statMul(state, statId) {
    let shop = 0;
    for (const u of D.UPGRADES) {
      if (u.effect.type === 'stat' && u.effect.stats.includes(statId)) shop += u.effect.per * upgradeLevel(state, u.id);
    }
    return (1 + shop) * (1 + legacySum(state, 'stat_all'));
  }
  function incomeMul(state) { return (1 + upgradeSum(state, 'income')) * (1 + legacySum(state, 'income')); }
  function feeMul(state) { return Math.max(0.2, 1 - upgradeSum(state, 'fee')); }
  function restMul(state) { return 1 + upgradeSum(state, 'rest'); }
  function stressMul(state) {
    return Math.max(0.3, 1 - upgradeSum(state, 'calm')) * Math.max(0.4, 1 - legacySum(state, 'calm'));
  }
  function powerMul(state) { return 1 + upgradeSum(state, 'power'); }
  function xpMul(state) { return 1 + legacySum(state, 'xp'); }
  function speedOf(state) { return 1 + legacySum(state, 'speed'); }
  function offlineCapMs(state) { return (D.BASE_OFFLINE_HOURS + legacySum(state, 'offline')) * 3600 * 1000; }

  // 스트레스가 50을 넘으면 효율이 떨어져 100에서 절반이 된다
  function efficiency(stress) { return stress <= 50 ? 1 : 1 - (stress - 50) / 100; }

  function masteryLevel(xp) {
    let lvl = 0;
    while (lvl < D.MASTERY_MAX && xp >= D.masteryXpFor(lvl + 1)) lvl++;
    return lvl;
  }
  function masteryInfo(state, actId) {
    const xp = state.run.mastery[actId] || 0;
    const level = masteryLevel(xp);
    if (level >= D.MASTERY_MAX) return { level, xp, progress: 1, max: true };
    const lo = level ? D.masteryXpFor(level) : 0;
    const hi = D.masteryXpFor(level + 1);
    return { level, xp, progress: (xp - lo) / (hi - lo), max: false };
  }

  function combatPower(state) {
    const s = state.run.stats;
    return (s.cmb + s.str * 0.4 + s.con * 0.3 + s.mag * 0.6) * powerMul(state);
  }
  function winChance(state, act) {
    const p = combatPower(state);
    return clamp((p * p) / (p * p + act.danger * act.danger), 0.1, 0.97);
  }

  // ── 해금 조건 ──────────────────────────────────────────
  function unmetReqs(run, act) {
    const out = [];
    const req = act.req;
    if (!req) return out;
    if (req.age && ageOf(run) < req.age) out.push(req.age + '세부터');
    if (req.stats) {
      for (const id in req.stats) {
        if (run.stats[id] < req.stats[id]) out.push(STAT[id].name + ' ' + req.stats[id]);
      }
    }
    return out;
  }
  function isUnlocked(run, act) { return unmetReqs(run, act).length === 0; }

  // 활동 하루치 결과 미리보기 (UI 표시에 사용)
  function preview(state, actId) {
    const run = state.run;
    const act = ACT[actId];
    const lvl = masteryLevel(run.mastery[actId] || 0);
    const eff = efficiency(run.stress);
    const gains = {};
    for (const id in act.gain) {
      const v = act.gain[id];
      gains[id] = v > 0 ? v * (1 + D.MASTERY_GAIN * lvl) * statMul(state, id) * eff : v;
    }
    let gold = 0;
    if (act.gold < 0) gold = act.gold * (1 + D.MASTERY_FEE * lvl) * feeMul(state);
    else if (act.gold > 0) gold = incomeFor(state, act, lvl, eff);
    else if (act.loot) gold = ((act.loot[0] + act.loot[1]) / 2) * (1 + D.MASTERY_GAIN * lvl) * incomeMul(state) * eff;
    const stress = act.stress > 0 ? act.stress * stressMul(state) : act.stress * restMul(state);
    const out = { gains, gold, stress, level: lvl };
    if (act.danger) out.winChance = winChance(state, act);
    return out;
  }
  function incomeFor(state, act, lvl, eff) {
    const statBonus = act.incomeStat ? 1 + state.run.stats[act.incomeStat] / 600 : 1;
    return act.gold * (1 + D.MASTERY_GAIN * lvl) * statBonus * incomeMul(state) * eff;
  }

  // ── 상태 생성 ──────────────────────────────────────────
  function defaultMeta() {
    return {
      generation: 1,
      stars: 0,
      starsEarned: 0,
      legacy: {},
      endings: {},
      history: [],
      autoRest: { enabled: true, at: 80, until: 25 },
      autoBuy: false,
    };
  }

  function createState(seed) {
    const state = {
      v: SAVE_VERSION,
      rng: (seed === undefined ? Math.floor(Math.random() * 2 ** 32) : seed) >>> 0,
      meta: defaultMeta(),
      run: null,
      log: [],
      paused: false,
      lastSeen: 0,
    };
    return state;
  }

  function newRun(state, name) {
    const bonus = legacySum(state, 'start_stats');
    const stats = {};
    for (const s of D.STATS) stats[s.id] = clamp(s.base + randInt(state, -3, 6) + bonus, 0, D.STAT_MAX);
    state.run = {
      name: (name || '').trim() || pick(state, D.NAMES),
      generation: state.meta.generation,
      totalDays: 0,
      gold: D.START_GOLD + legacySum(state, 'start_gold'),
      stress: 0,
      fame: 0,
      stats,
      monthStart: Object.assign({}, stats),
      schedule: ['study', 'flower', 'rest'],
      mastery: {},
      upgrades: {},
      sick: 0,
      resting: false,
      current: { id: 'rest', reason: 'start' },
      flags: {},
      festivalWins: 0,
      goldEarned: 0,
      warnSlot: -1,
      looks: {
        hair: pick(state, D.HAIR_COLORS),
        skin: pick(state, D.SKIN_TONES),
      },
      ended: null,
    };
    state.log = [];
    pushLog(state, { kind: 'system', text: fill('{N이} 열 살 생일을 맞아 성에 들어왔다. 오늘부터 잘 부탁해!', state.run.name), day: 0 });
    return state.run;
  }

  function pushLog(state, entry) {
    state.log.unshift(entry);
    if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
  }

  // ── 하루 진행 ──────────────────────────────────────────
  function resolveActivity(state) {
    const run = state.run;
    if (run.sick > 0) return { id: 'sick', reason: 'sick' };

    const ar = state.meta.autoRest;
    if (ar.enabled) {
      if (run.resting && run.stress <= ar.until) run.resting = false;
      else if (!run.resting && run.stress >= ar.at) run.resting = true;
    } else {
      run.resting = false;
    }
    if (run.resting) return { id: 'rest', reason: 'auto' };

    const cal = calendar(run.totalDays);
    const id = run.schedule[cal.slot];
    const act = ACT[id];
    if (!act || !isUnlocked(run, act)) return { id: 'housework', reason: 'locked', planned: id };
    if (act.gold < 0) {
      const lvl = masteryLevel(run.mastery[id] || 0);
      const fee = -act.gold * (1 + D.MASTERY_FEE * lvl) * feeMul(state);
      if (run.gold < fee) return { id: 'housework', reason: 'nogold', planned: id };
    }
    return { id, reason: 'plan' };
  }

  function addStat(run, id, v) {
    run.stats[id] = clamp(run.stats[id] + v, 0, D.STAT_MAX);
  }

  function applyActivity(state, plan, emit, day) {
    const run = state.run;

    if (plan.id === 'sick') {
      run.stress -= 5 * restMul(state);
      run.gold = Math.max(0, run.gold - D.SICK_COST);
      run.sick -= 1;
      if (run.sick === 0) {
        emit('system', fill('{N이} 자리를 털고 일어났다.', run.name));
        if (state.meta.autoRest.enabled) run.resting = true;
      }
      return;
    }

    const act = ACT[plan.id];
    const lvlBefore = masteryLevel(run.mastery[act.id] || 0);
    const eff = efficiency(run.stress);
    const gainMul = (1 + D.MASTERY_GAIN * lvlBefore) * eff;

    let success = true;
    if (act.danger) success = rand(state) < winChance(state, act);

    if (success) {
      for (const id in act.gain) {
        const v = act.gain[id];
        const amount = v > 0 ? v * gainMul * statMul(state, id) : v;
        addStat(run, id, amount);
        day.gains[id] = (day.gains[id] || 0) + amount;
      }
      if (act.fame) run.fame += act.fame;
    }

    // 골드
    if (act.gold < 0) {
      const fee = -act.gold * (1 + D.MASTERY_FEE * lvlBefore) * feeMul(state);
      run.gold = Math.max(0, run.gold - fee);
      day.gold -= fee;
    } else if (act.gold > 0) {
      const inc = incomeFor(state, act, lvlBefore, eff);
      run.gold += inc;
      run.goldEarned += inc;
      day.gold += inc;
    } else if (act.loot && success) {
      const inc = randInt(state, act.loot[0], act.loot[1]) * (1 + D.MASTERY_GAIN * lvlBefore) * incomeMul(state) * eff;
      run.gold += inc;
      run.goldEarned += inc;
      day.gold += inc;
    }

    // 스트레스
    if (act.stress > 0) run.stress += act.stress * stressMul(state);
    else run.stress += act.stress * restMul(state);
    if (act.danger && !success) run.stress += 2.5 * stressMul(state);

    // 무사수행 특수 사건
    if (act.danger) adventureEvents(state, act, emit);

    // 숙련도 (휴식·대체 활동은 제외)
    if (act.cat !== 'rest' && plan.reason === 'plan') {
      run.mastery[act.id] = (run.mastery[act.id] || 0) + xpMul(state);
      const lvlAfter = masteryLevel(run.mastery[act.id]);
      if (lvlAfter > lvlBefore) {
        emit('level', act.name + ' 숙련도가 Lv.' + lvlAfter + '이 되었다.');
      }
    }
  }

  function adventureEvents(state, act, emit) {
    const run = state.run;
    if (act.boss && !run.flags.dragon && rand(state) < act.boss.chance) {
      if (combatPower(state) >= act.boss.power) {
        run.flags.dragon = true;
        run.fame += 100;
        const loot = 2000;
        run.gold += loot;
        run.goldEarned += loot;
        emit('legend', fill('{N이} 잠에서 깬 붉은 용을 쓰러뜨렸다! 명성 +100, 보물 ' + loot + 'G', run.name));
      } else {
        run.stress += 20;
        emit('danger', fill('붉은 용이 깨어났다! {N은} 간신히 도망쳤다…', run.name));
      }
      return;
    }
    if (rand(state) < 0.006) {
      const g = Math.round(randInt(state, act.loot[0], act.loot[1]) * 8 * incomeMul(state));
      run.gold += g;
      run.goldEarned += g;
      emit('treasure', act.name + '에서 보물 상자를 발견했다! +' + g + 'G');
    }
  }

  function randomEvent(state, emit, day) {
    const run = state.run;
    const age = ageOf(run);
    const pool = D.EVENTS.filter((e) => !e.cond || e.cond(run, age));
    const ev = pick(state, pool);
    const fx = ev.fx;
    const parts = [];
    if (fx.gold) {
      const g = randInt(state, fx.gold[0], fx.gold[1]);
      run.gold += g;
      run.goldEarned += g;
      day.gold += g;
      parts.push('골드 +' + g);
    }
    if (fx.stats) {
      for (const id in fx.stats) {
        addStat(run, id, fx.stats[id]);
        day.gains[id] = (day.gains[id] || 0) + fx.stats[id];
        parts.push(STAT[id].name + ' ' + signed(fx.stats[id]));
      }
    }
    if (fx.stress) {
      run.stress += fx.stress;
      parts.push('스트레스 ' + signed(fx.stress));
    }
    if (fx.fame) {
      run.fame += fx.fame;
      parts.push('명성 +' + fx.fame);
    }
    emit('event', fill(ev.text, run.name), { effects: parts.join(', ') });
  }
  function signed(v) { return (v > 0 ? '+' : '') + v; }

  function festival(state, emit) {
    const run = state.run;
    const yearIndex = Math.floor(run.totalDays / D.DAYS_PER_YEAR);
    const rivalBase = D.rivalScore(yearIndex);
    const results = [];
    let prize = 0;
    let fame = 0;
    for (const c of D.CONTESTS) {
      const score = c.score(run.stats);
      const rival = rivalBase * (0.9 + rand(state) * 0.2);
      let place;
      if (score >= rival) {
        place = 1;
        prize += 120 * (yearIndex + 1);
        fame += 12;
        run.festivalWins += 1;
      } else if (score >= rival * 0.8) {
        place = 2;
        prize += 40 * (yearIndex + 1);
        fame += 4;
      } else {
        place = 0;
        fame += 1;
      }
      results.push({ id: c.id, name: c.name, place, score: Math.round(score), rival: Math.round(rival) });
    }
    run.gold += prize;
    run.goldEarned += prize;
    run.fame += fame;
    const summary = results
      .map((r) => r.name + ' ' + (r.place === 1 ? '우승' : r.place === 2 ? '준우승' : '참가'))
      .join(' · ');
    emit('festival', '수확제 결과 — ' + summary + (prize ? ' (상금 ' + Math.round(prize) + 'G)' : ''), { results });
  }

  /**
   * 하루를 진행한다. sink(entry)로 그날 일어난 사건을 받는다.
   * 반환값: 그날의 요약 { plan, gains, gold } 또는 진행할 수 없으면 null
   */
  function stepDay(state, sink) {
    const run = state.run;
    if (!run || run.ended) return null;
    const emit = (kind, text, extra) => {
      const entry = Object.assign({ kind, text, day: run.totalDays }, extra);
      pushLog(state, entry);
      if (sink) sink(entry);
    };
    const cal = calendar(run.totalDays);
    const day = { plan: null, gains: {}, gold: 0 };

    if (cal.day === 1) {
      run.monthStart = Object.assign({}, run.stats);
      if (run.totalDays > 0) {
        run.gold += D.ALLOWANCE;
        day.gold += D.ALLOWANCE;
      }
      if (state.meta.autoBuy) {
        const bought = autoBuy(state);
        if (bought.length) emit('shop', '자동 구매: ' + bought.join(', '));
      }
    }

    const plan = resolveActivity(state);
    run.current = plan;
    day.plan = plan;
    if (plan.reason === 'nogold' || plan.reason === 'locked') {
      const slotKey = Math.floor(run.totalDays / D.SLOT_DAYS);
      if (run.warnSlot !== slotKey) {
        run.warnSlot = slotKey;
        const planned = ACT[plan.planned];
        emit('warn', plan.reason === 'nogold'
          ? planned.name + ' 수업료가 모자라서 집안일을 했다.'
          : (planned ? planned.name + ' 조건이 맞지 않아' : '일정이 비어 있어') + ' 집안일을 했다.');
      }
    }
    applyActivity(state, plan, emit, day);

    if (run.stress >= 100 && run.sick === 0) {
      run.stress = 100;
      run.sick = D.SICK_DAYS;
      run.resting = false;
      emit('sick', fill('{N이} 무리하다 몸져누웠다. ' + D.SICK_DAYS + '일 동안 쉬어야 한다.', run.name));
    }

    if (run.sick === 0 && rand(state) < D.EVENT_CHANCE) randomEvent(state, emit, day);
    if (cal.month === D.FESTIVAL_MONTH && cal.day === D.FESTIVAL_DAY) festival(state, emit);

    run.stress = clamp(run.stress, 0, 100);
    run.totalDays += 1;

    if (run.totalDays % D.DAYS_PER_YEAR === 0) {
      const age = ageOf(run);
      if (age >= D.END_AGE) {
        finishRun(state, emit);
      } else {
        const gift = D.birthdayGift(age);
        run.gold += gift;
        emit('birthday', fill('{N이} ' + age + '살이 되었다! 왕실에서 생일 축하금 ' + gift + 'G가 도착했다.', run.name));
      }
    }
    return day;
  }

  // ── 엔딩·세대 ──────────────────────────────────────────
  function evaluateEnding(run) {
    for (const e of D.ENDINGS) if (e.check(run.stats, run)) return e;
    return D.ENDINGS[D.ENDINGS.length - 1];
  }

  function starBreakdown(state, ending) {
    const run = state.run;
    const total = D.STATS.reduce((sum, s) => sum + run.stats[s.id], 0);
    const first = !state.meta.endings[ending.id];
    const parts = [
      { label: '능력치 합계 ' + Math.round(total), stars: Math.floor(total / 100) },
      { label: D.TIERS[ending.tier].name + ' 엔딩 (' + ending.tier + ')', stars: D.TIERS[ending.tier].stars },
    ];
    if (first) parts.push({ label: '새 엔딩 발견', stars: D.TIERS[ending.tier].stars });
    if (run.fame >= 25) parts.push({ label: '명성 ' + Math.floor(run.fame), stars: Math.floor(run.fame / 25) });
    if (run.festivalWins) parts.push({ label: '수확제 우승 ' + run.festivalWins + '회', stars: run.festivalWins });
    return { parts, total: parts.reduce((s, p) => s + p.stars, 0), first };
  }

  function finishRun(state, emit) {
    const run = state.run;
    const ending = evaluateEnding(run);
    const stars = starBreakdown(state, ending);
    const meta = state.meta;
    const prev = meta.endings[ending.id];
    meta.endings[ending.id] = {
      count: (prev ? prev.count : 0) + 1,
      firstGen: prev ? prev.firstGen : meta.generation,
      lastName: run.name,
    };
    meta.stars += stars.total;
    meta.starsEarned += stars.total;
    meta.history.unshift({
      generation: meta.generation,
      name: run.name,
      ending: ending.id,
      stars: stars.total,
      total: Math.round(D.STATS.reduce((sum, s) => sum + run.stats[s.id], 0)),
    });
    if (meta.history.length > HISTORY_LIMIT) meta.history.length = HISTORY_LIMIT;
    run.ended = { ending: ending.id, stars };
    run.current = { id: 'rest', reason: 'ended' };
    emit('ending', fill('{N이} 성인식을 맞았다. 그녀의 길은… 「' + ending.name + '」', run.name));
  }

  function startNextGeneration(state, name) {
    if (state.run && state.run.ended) state.meta.generation += 1;
    newRun(state, name);
    return state.run;
  }

  // ── 플레이어 조작 ──────────────────────────────────────
  function setSchedule(state, slot, actId) {
    const act = ACT[actId];
    if (!act || slot < 0 || slot > 2) return { ok: false, reason: 'invalid' };
    const unmet = unmetReqs(state.run, act);
    if (unmet.length) return { ok: false, reason: 'locked', unmet };
    state.run.schedule[slot] = actId;
    return { ok: true };
  }

  function upgradeCost(up, level) { return Math.round(up.base * Math.pow(up.growth, level)); }

  function buyUpgrade(state, id) {
    const up = UPG[id];
    const run = state.run;
    if (!up || !run || run.ended) return { ok: false, reason: 'invalid' };
    const lvl = upgradeLevel(state, id);
    if (lvl >= up.max) return { ok: false, reason: 'max' };
    const cost = upgradeCost(up, lvl);
    if (run.gold < cost) return { ok: false, reason: 'gold', cost };
    run.gold -= cost;
    run.upgrades[id] = lvl + 1;
    return { ok: true, level: lvl + 1 };
  }

  // 지금 일정에 도움이 되는 물건인가 (자동 구매 판단용)
  function isUpgradeRelevant(state, up) {
    const acts = state.run.schedule.map((id) => ACT[id]).filter(Boolean);
    const e = up.effect;
    switch (e.type) {
      case 'stat': return acts.some((a) => e.stats.some((s) => (a.gain[s] || 0) > 0));
      case 'income': return acts.some((a) => (a.gold > 1) || !!a.loot);
      case 'fee': return acts.some((a) => a.gold < 0);
      case 'power': return acts.some((a) => !!a.danger);
      default: return true;
    }
  }

  // 한 달 수업료만큼은 남겨 두고, 도움이 되는 물건을 싼 것부터 산다
  function autoBuy(state) {
    const run = state.run;
    const reserve = run.schedule.reduce((sum, id) => {
      const a = ACT[id];
      return sum + (a && a.gold < 0 ? -a.gold * (1 + D.MASTERY_FEE * D.MASTERY_MAX) * D.SLOT_DAYS : 0);
    }, 0);
    const bought = [];
    for (let guard = 0; guard < 100; guard++) {
      let best = null;
      let bestCost = Infinity;
      for (const up of D.UPGRADES) {
        const lvl = upgradeLevel(state, up.id);
        if (lvl >= up.max || !isUpgradeRelevant(state, up)) continue;
        const cost = upgradeCost(up, lvl);
        if (cost < bestCost) { best = up; bestCost = cost; }
      }
      if (!best || run.gold - bestCost < reserve) break;
      run.gold -= bestCost;
      run.upgrades[best.id] = upgradeLevel(state, best.id) + 1;
      bought.push(best.name + ' Lv.' + run.upgrades[best.id]);
    }
    return bought;
  }

  function buyLegacy(state, id) {
    const l = LEG[id];
    if (!l) return { ok: false, reason: 'invalid' };
    const lvl = legacyLevel(state, id);
    if (lvl >= l.max) return { ok: false, reason: 'max' };
    const cost = upgradeCost(l, lvl);
    if (state.meta.stars < cost) return { ok: false, reason: 'stars', cost };
    state.meta.stars -= cost;
    state.meta.legacy[id] = lvl + 1;
    return { ok: true, level: lvl + 1 };
  }

  function setAutoRest(state, patch) {
    const ar = state.meta.autoRest;
    if ('enabled' in patch) ar.enabled = !!patch.enabled;
    if ('at' in patch) ar.at = clamp(Math.round(patch.at), 40, 99);
    if ('until' in patch) ar.until = clamp(Math.round(patch.until), 0, 80);
    if (ar.until >= ar.at) ar.until = Math.max(0, ar.at - 10);
  }

  // ── 여러 날 진행 (오프라인·백그라운드) ──────────────────────
  function snapshot(run) {
    return { stats: Object.assign({}, run.stats), gold: run.gold, fame: run.fame, totalDays: run.totalDays };
  }

  function simulate(state, days) {
    const run = state.run;
    const before = snapshot(run);
    const highlights = [];
    const sink = (e) => {
      if (e.kind !== 'level' && e.kind !== 'warn') highlights.push(e);
    };
    let n = 0;
    while (n < days && state.run && !state.run.ended) {
      stepDay(state, sink);
      n++;
    }
    const after = snapshot(run);
    const statDiff = {};
    for (const s of D.STATS) statDiff[s.id] = after.stats[s.id] - before.stats[s.id];
    return {
      days: n,
      statDiff,
      goldDiff: after.gold - before.gold,
      fameDiff: after.fame - before.fame,
      highlights,
      ended: !!run.ended,
    };
  }

  // ── 저장 ───────────────────────────────────────────────
  function serialize(state) { return JSON.stringify(state); }

  function deserialize(json) {
    const raw = typeof json === 'string' ? JSON.parse(json) : json;
    if (!raw || typeof raw !== 'object' || !raw.meta) throw new Error('잘못된 저장 데이터');
    const state = createState(raw.rng);
    state.meta = Object.assign(defaultMeta(), raw.meta);
    state.meta.autoRest = Object.assign(defaultMeta().autoRest, raw.meta.autoRest);
    state.log = Array.isArray(raw.log) ? raw.log : [];
    state.paused = !!raw.paused;
    state.lastSeen = raw.lastSeen || 0;
    if (raw.run) {
      const run = raw.run;
      for (const s of D.STATS) if (typeof run.stats[s.id] !== 'number') run.stats[s.id] = s.base;
      run.schedule = (run.schedule || []).slice(0, 3);
      while (run.schedule.length < 3) run.schedule.push('rest');
      run.schedule = run.schedule.map((id) => (ACT[id] ? id : 'rest'));
      run.mastery = run.mastery || {};
      run.upgrades = run.upgrades || {};
      run.flags = run.flags || {};
      run.monthStart = run.monthStart || Object.assign({}, run.stats);
      run.looks = run.looks || { hair: D.HAIR_COLORS[0], skin: D.SKIN_TONES[0] };
      run.current = run.current || { id: 'rest', reason: 'start' };
      state.run = run;
    }
    return state;
  }

  return {
    SAVE_VERSION,
    ACT, UPG, LEG, STAT, END,
    clamp, josa, fill, calendar, ageOf, season,
    efficiency, masteryLevel, masteryInfo, combatPower, winChance,
    statMul, incomeMul, feeMul, restMul, stressMul, speedOf, offlineCapMs,
    unmetReqs, isUnlocked, preview,
    createState, newRun, stepDay, simulate,
    evaluateEnding, starBreakdown, startNextGeneration,
    setSchedule, upgradeCost, buyUpgrade, buyLegacy, setAutoRest, isUpgradeRelevant, autoBuy,
    legacyLevel, upgradeLevel,
    serialize, deserialize,
  };
});
