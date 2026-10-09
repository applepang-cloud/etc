'use strict';
/* 뉴스: 국내 · 해외 · 유튜브. 뉴스는 시세에 충격을 주고, 일부는 루머이거나 재료 소멸로 되돌려진다 */

const News = {
  tick(S) {
    if (--S.nextNews <= 0) {
      this.gen(S, chance(0.5) ? 'kr' : 'gl');
      S.nextNews = randi(15, 35);
    }
    if (--S.nextYT <= 0) {
      this.genYT(S);
      S.nextYT = randi(22, 45);
    }
    // 연속 보도: 진행 중인 이슈는 정해진 간격으로 다음 소식이 이어진다
    for (const st of S.stories.slice()) if (S.t >= st.next) this.advanceStory(S, st);
    if (--S.nextStory <= 0) {
      if (S.stories.length < 3) this.startStory(S);
      S.nextStory = randi(60, 140);
    }
    for (let i = S.pend.length - 1; i >= 0; i--) {
      const p = S.pend[i];
      if (S.t >= p.t) {
        S.pend.splice(i, 1);
        this.runPending(S, p);
      }
    }
    this.scheduled(S);
    for (const def of COINS) {
      const c = S.coins[def.sym];
      if (def.rug && c.warn < S.t && chance(def.rug / TPD)) this.rug(S, def.sym);
      else if (def.tags.includes('fict') && c.warn < S.t && c.p < def.p * 0.03 && chance(0.3 / TPD)) this.rebrand(S, def.sym);
    }
    this.tipTick(S);
    S.tips = S.tips.filter(tp => tp.until > S.t);
  },

  push(S, item) {
    item.id = uid(S);
    item.t = S.t;
    item.p0 = {};
    for (const sym of item.coins || []) item.p0[sym] = S.coins[sym].p;
    S.news.unshift(item);
    if (S.news.length > 120) S.news.length = 120;
    Game.emit('news', item);
    return item;
  },

  power(mag) {
    if (!mag) return 0;
    return mag < 0.03 ? 1 : mag < 0.1 ? 2 : 3;
  },

  /** 개별 코인 충격: 일부는 즉시, 나머지는 dur 동안 나눠 반영 */
  shock(S, sym, amt, dur, o = {}) {
    const c = S.coins[sym];
    const jump = amt * (o.jump ?? 0.45);
    Market.nudge(S, sym, jump);
    c.shocks.push({ a: amt - jump, r: Math.min(1, 3 / Math.max(1, dur)), d: 0 });
    if (o.perm) c.anchor += amt * o.perm * 0.5;
    if (o.rev) c.shocks.push({ a: -amt * o.rev, r: Math.min(1, 2 / Math.max(1, dur)), d: dur + (o.revDelay || 30) });
    c.vm = Math.min(3, c.vm + Math.abs(amt) * 4);
    c.ns += amt * 12;
  },

  marketShock(S, amt, dur, o = {}) {
    for (const def of COINS) {
      const k = def.rho * Math.pow(def.vol / 0.045, 0.6);
      this.shock(S, def.sym, amt * k, dur, o);
    }
  },

  vars(S, sym) {
    return {
      c: sym ? COIN[sym].name : '', s: sym || '', ex: pick(KR_EX), gx: pick(GL_EX), corp: pick(CORPS),
      n: randi(2, 9), h: randi(2, 9), q: (randi(2, 40) * (sym === 'BTC' ? 100 : sym === 'ETH' ? 1000 : 1e6)).toLocaleString('ko-KR'),
      kp: ((S.kp + 0.025) * 100).toFixed(1),
    };
  },

  /** 호재가 이어지면 악재가, 악재가 이어지면 호재가 나오기 쉽게 가중치를 조정 */
  pickTpl(S, list) {
    const f = Math.exp(-Market.dev(S) * 2.5 - S.sent / 50);
    const ok = list.filter(tp => !tp.etf || COIN_POOLS.etf.some(s => !S.etfDone.includes(s)));
    return pickW(ok, tp => (tp.w || 1) * (tp.tone > 0 ? f : tp.tone < 0 ? 1 / f : 1));
  },

  gen(S, cat, tplOverride, symOverride, extra = {}) {
    const list = cat === 'kr' ? NEWS_KR : NEWS_GL;
    const tpl = tplOverride || this.pickTpl(S, list);
    let syms = [];
    if (tpl.pool && tpl.pool !== 'none') {
      let pool = COIN_POOLS[tpl.pool];
      if (tpl.etf) pool = pool.filter(s => !S.etfDone.includes(s));
      if (!pool.length) pool = COIN_POOLS.major;
      syms = tpl.all ? pool.slice() : [symOverride || pick(pool)];
      if (tpl.etf === 'approve') S.etfDone.push(syms[0]);
    }
    const sym = syms[0];
    const v = extra.vars || this.vars(S, sym);
    if (tpl.fx === 'fgUp') v.n = randi(8, 30);
    if (tpl.fx === 'kpUp') { this.fx(S, 'kpUp', 1, syms); v.kp = (S.kp * 100).toFixed(1); }
    const mag = tpl.mag ? rand(tpl.mag[0], tpl.mag[1]) : 0;
    let tone = tpl.tone;
    const mkt = !tpl.pool && mag > 0;
    const item = {
      cat, src: cat === 'kr' ? pick(KR_SRC) : pick(GL_SRC), title: fill(tpl.t, v), body: fill(tpl.b || '', v),
      tone, coins: mkt ? ['BTC', 'ETH'] : syms.slice(0, 6), mkt, big: !!tpl.big, rumor: tpl.cred != null, power: this.power(mag), planned: !!extra.planned,
      story: extra.story || null,
    };
    if (mag > 0) {
      // 재료 선반영: 가끔은 호재에도 떨어지고 악재에도 오른다
      let eff = tone;
      if (!tpl.big && !extra.planned && chance(0.1)) eff = -tone * 0.5;
      const o = { perm: tpl.perm, rev: tpl.rev, revDelay: tpl.revDelay };
      if (!tpl.pool) this.marketShock(S, eff * mag, tpl.dur || 30, o);
      else for (const s of syms) this.shock(S, s, eff * mag, tpl.dur || 30, o);
      if (tpl.spill) this.marketShock(S, eff * mag * tpl.spill, tpl.dur || 30, {});
      S.sent += tone * Math.min(12, mag * 120);
      if (typeof tpl.cred === 'number' && !chance(tpl.cred)) {
        S.pend.push({ t: S.t + randi(20, 60), type: 'debunk', title: item.title, syms, amt: -eff * mag * 1.1, pool: !tpl.pool, cat });
      }
    }
    if (tpl.fx && tpl.fx !== 'kpUp') this.fx(S, tpl.fx, tone, syms);
    this.push(S, item);
    // 큰 뉴스나 이어지는 이슈에는 유튜버들이 반응 영상을 올린다
    if (mag > 0 && (item.big || item.story) && chance(item.big ? 0.75 : 0.45)) {
      S.pend.push({ t: S.t + randi(8, 25), type: 'ytReact', newsId: item.id, sym: syms[0] || 'BTC', topic: this.topic(item.title), tone });
    }
    return item;
  },

  /** 뉴스 제목을 영상 제목에 넣기 좋게 줄인다 */
  topic(title) {
    let t = title.replace(/^\[[^\]]*\]\s*/, '').split(/…|\.\.\./)[0].replace(/["“”]/g, '').replace(/\([A-Z]+\)/g, '').replace(/\s+/g, ' ').trim();
    if (t.length > 26) {
      const cut = t.lastIndexOf(' ', 26);
      t = t.slice(0, cut > 12 ? cut : 26).replace(/[,·]$/, '').trim() + '…';
    }
    return t;
  },

  /* ---------- 연속 보도 ---------- */
  startStory(S) {
    const active = new Set(S.stories.map(x => x.sid));
    const f = Math.exp(-Market.dev(S) * 2.5 - S.sent / 50);
    const cands = STORIES.filter(d => !active.has(d.id) && (!d.etf || COIN_POOLS.etf.some(s => !S.etfDone.includes(s))));
    if (!cands.length) return null;
    const def = pickW(cands, d => (d.w || 1) * (d.steps[0].tone > 0 ? f : 1 / f));
    let sym = null;
    if (def.pool) {
      let pool = COIN_POOLS[def.pool];
      if (def.etf) pool = pool.filter(s => !S.etfDone.includes(s));
      const busy = new Set(S.stories.map(x => x.sym));
      sym = pick(pool.filter(s => !busy.has(s)).length ? pool.filter(s => !busy.has(s)) : pool);
    }
    // 갈림길 결과는 시작할 때 미리 정해 둔다 (보도 전까지는 인맥 귀띔으로만 알 수 있음)
    const picks = def.steps.map(stp => stp.branch ? stp.branch.indexOf(pickW(stp.branch, b => b.p)) : 0);
    const st = { id: uid(S), sid: def.id, sym, v: this.vars(S, sym), step: 0, next: S.t, picks, tipped: false, start: S.t, news: [] };
    S.stories.push(st);
    this.advanceStory(S, st);
    return st;
  },

  advanceStory(S, st) {
    const def = STORIES.find(d => d.id === st.sid);
    if (!def) { S.stories = S.stories.filter(x => x !== st); return; }
    let step = def.steps[st.step];
    if (step.branch) step = step.branch[st.picks[st.step]];
    const item = this.gen(S, def.cat, { ...step, pool: def.pool }, st.sym, {
      vars: st.v, story: { id: st.id, sid: def.id, name: def.name, step: st.step + 1, total: def.steps.length },
    });
    if (step.etfDone && st.sym && !S.etfDone.includes(st.sym)) S.etfDone.push(st.sym);
    st.news.push(item.id);
    st.last = item.title;
    st.lastTone = step.tone;
    st.step++;
    if (st.step >= def.steps.length) S.stories = S.stories.filter(x => x !== st);
    else st.next = S.t + randi(...(step.gap || [40, 90]));
  },

  fx(S, key, tone, syms) {
    switch (key) {
      case 'kpUp': S.kp = Math.min(0.2, S.kp + rand(0.015, 0.03)); break;
      case 'volUp': for (const def of COINS) S.coins[def.sym].vm = Math.min(3, S.coins[def.sym].vm + 0.5); break;
      case 'fgUp': S.sent += 8; break;
      case 'reUp': S.reShock += 0.025; break;
      case 'reDown': S.reShock -= 0.03; break;
      case 'kospiUp': S.idxShock.KR += 0.025; break;
      case 'kospiDown': S.idxShock.KR -= 0.025; break;
      case 'nasdaqUp': S.idxShock.US += 0.025; break;
      case 'nasdaqDown': S.idxShock.US -= 0.025; break;
      case 'elecUp': S.elecMult = Math.min(2, S.elecMult * 1.1); break;
      case 'elecDown': S.elecMult = Math.max(0.7, S.elecMult * 0.96); break;
      case 'mineDown': S.diff = Math.max(0.5, S.diff * 0.85); break;
      case 'bull': if (S.regime.type !== 'mania') Market.setRegime(S, chance(0.3) ? 'mania' : 'bull', true); break;
      case 'warn': if (syms && syms[0]) S.coins[syms[0]].warn = S.t + TPD * 2; break;
    }
  },

  runPending(S, p) {
    if (p.type === 'debunk') {
      if (p.pool) this.marketShock(S, p.amt, 20, {});
      else for (const s of p.syms) this.shock(S, s, p.amt, 20, {});
      this.push(S, {
        cat: p.cat, src: p.cat === 'kr' ? pick(KR_SRC) : pick(GL_SRC),
        title: `[정정] "${p.title.replace(/^\[.*?\]\s*/, '').slice(0, 34)}…" 사실무근`,
        body: '당사자가 공식 부인하면서 앞서 나온 보도가 사실이 아닌 것으로 확인됐다.',
        tone: Math.sign(p.amt), coins: p.syms.slice(0, 6), power: this.power(Math.abs(p.amt)),
      });
    } else if (p.type === 'planned') {
      const list = p.cat === 'kr' ? NEWS_KR : NEWS_GL;
      this.gen(S, p.cat, list[p.idx], p.sym, { planned: true });
    } else if (p.type === 'plannedYT') {
      this.genYT(S, YT_CH[p.ch], p.sym);
    } else if (p.type === 'ytReact') {
      this.genYT(S, null, p.sym, p);
    }
  },

  regimeNews(S, type) {
    const rn = REGIME_NEWS[type];
    if (!rn) return;
    this.push(S, {
      cat: rn.cat, src: rn.cat === 'kr' ? pick(KR_SRC) : pick(GL_SRC), title: fill(rn.t, { n: randi(1, 4) }), body: rn.b,
      tone: type === 'bull' || type === 'mania' ? 1 : -1, coins: ['BTC'], big: type === 'mania' || type === 'crash', power: 2,
    });
  },

  genYT(S, chOverride, symOverride, react) {
    const ch = chOverride || (react
      ? pickW(YT_CH, c => ({ hype: 3, analyst: 2, doom: react.tone < 0 ? 3 : 1.5, calm: 1.5, hodl: 1, diary: 1 }[c.style]))
      : pick(YT_CH));
    const st = YT_STYLE[ch.style];
    const sym = symOverride || pick(COIN_POOLS[pick(st.pool)]);
    let tone = st.tone;
    if (tone === 0 && !st.flavor) {
      const truth = Math.sign(Market.pending(S, sym)) || 1;
      tone = chance(st.rel) ? truth : -truth;
    }
    const mag = st.mag[1] > 0 ? rand(st.mag[0], st.mag[1]) : 0;
    if (mag > 0) {
      const o = st.bait ? { rev: 1.15, revDelay: 12, jump: 0.3 } : { jump: 0.3 };
      if (st.market && !react) this.marketShock(S, tone * mag, 12, o);
      else this.shock(S, sym, tone * mag * (react ? 1.3 : 1), 12, o);
      S.sent += tone * (st.bait ? 3 : 1.5);
    }
    const mm = randi(6, 24), ss = randi(0, 59);
    return this.push(S, {
      cat: 'yt', src: ch.name, ch: ch.name, hue: ch.hue, subs: ch.subs, style: ch.style, bait: !!st.bait, rel: st.rel,
      title: fill(pick(react ? YT_REACT[ch.style] : st.titles), { c: COIN[sym].name, s: sym, kp: ((S.kp + 0.02) * 100).toFixed(1), topic: react ? react.topic : '' }),
      ref: react ? react.newsId : null, topic: react ? react.topic : null,
      tone: st.flavor ? 0 : tone, coins: [sym], power: this.power(mag), views: Math.round(ch.subs * rand(0.08, 0.9)),
      dur: `${mm}:${String(ss).padStart(2, '0')}`, points: st.points,
    });
  },

  /* ---------- 일정 이벤트: FOMC · 한은 금통위 · 반감기 ---------- */
  scheduled(S) {
    const sc = S.sched;
    if (S.t === sc.fomc - TPD) {
      for (const def of COINS) S.coins[def.sym].vm = Math.min(3, S.coins[def.sym].vm + 0.4);
      this.push(S, { cat: 'gl', src: pick(GL_SRC), title: '내일 FOMC 앞두고 관망세…"변동성 확대 주의"', body: '선물 시장은 금리 동결 가능성을 가장 높게 보고 있다.', tone: 0, coins: ['BTC'], power: 1 });
    }
    if (S.t >= sc.fomc) { this.rateDecision(S, 'US'); sc.fomc = S.t + TPD * 16; }
    if (S.t >= sc.bok) { this.rateDecision(S, 'KR'); sc.bok = S.t + TPD * 16; }
    if (S.t >= sc.halving) { this.halving(S); sc.halving = S.t + TPD * 60; }
  },

  rateDecision(S, where) {
    const key = where === 'US' ? 'rateUS' : 'rateKR';
    const rate = S[key];
    const pCut = clamp(0.3 + (rate - 3) * 0.12, 0.08, 0.6);
    const pHike = clamp(0.2 - (rate - 3) * 0.1, 0.05, 0.4);
    const r = Math.random();
    const dec = r < pCut ? -1 : r < pCut + pHike ? 1 : 0;
    S[key] = Math.max(0.5, +(rate + dec * 0.25).toFixed(2));
    const rs = S[key].toFixed(2);
    let title, body;
    if (where === 'US') {
      title = dec < 0 ? `[속보] 美 연준, 기준금리 0.25%p 인하…연 ${rs}%` : dec > 0 ? `[속보] 美 연준, 기준금리 0.25%p 인상…연 ${rs}%` : `美 연준, 기준금리 연 ${rs}%로 동결`;
      body = dec < 0 ? '유동성 기대감에 위험자산이 일제히 반등했다.' : dec > 0 ? '예상 밖의 매파적 결정에 위험자산이 급락했다.' : '파월 의장은 "데이터를 더 지켜보겠다"고 말했다.';
      if (dec !== 0) this.marketShock(S, -dec * rand(0.03, 0.06), 40, { perm: 0.4 });
      else this.marketShock(S, rand(-0.01, 0.01), 20, {});
      S.idxShock.US += -dec * 0.03;
    } else {
      title = dec < 0 ? `한국은행, 기준금리 0.25%p 인하…연 ${rs}%` : dec > 0 ? `한국은행, 기준금리 인상…"가계부채 잡는다" 연 ${rs}%` : `한은 금통위, 기준금리 연 ${rs}% 동결`;
      body = dec < 0 ? '대출 이자 부담이 줄면서 부동산과 주식 시장에 온기가 돌 전망이다.' : dec > 0 ? '대출 금리가 오르며 부동산 시장 위축이 우려된다.' : '총재는 "물가와 성장 모두 지켜보겠다"고 밝혔다.';
      S.reShock += -dec * 0.03;
      S.idxShock.KR += -dec * 0.02;
      if (dec !== 0) this.marketShock(S, -dec * rand(0.01, 0.02), 30, {});
    }
    this.push(S, { cat: where === 'US' ? 'gl' : 'kr', src: where === 'US' ? pick(GL_SRC) : pick(KR_SRC), title, body, tone: -dec, coins: ['BTC'], big: dec !== 0 && where === 'US', power: dec ? 2 : 1, rate: true });
  },

  halving(S) {
    S.halvings++;
    this.shock(S, 'BTC', rand(0.06, 0.12), 120, { perm: 0.7 });
    if (S.regime.type !== 'mania') Market.setRegime(S, 'bull', true);
    this.push(S, {
      cat: 'gl', src: pick(GL_SRC), title: `[속보] 비트코인 반감기 완료…채굴 보상 절반으로`,
      body: '공급 감소 기대감에 매수세가 몰렸다. BTC 채굴 수익은 절반으로 줄어든다.', tone: 1, coins: ['BTC'], big: true, power: 3,
    });
  },

  rug(S, sym) {
    const c = S.coins[sym];
    const drop = rand(0.82, 0.95);
    Market.nudge(S, sym, Math.log(1 - drop));
    c.anchor = Math.log(c.p) + 0.15;
    c.shocks = [];
    c.warn = S.t + TPD * 3;
    c.vm = 3;
    const exposed = (S.hold[sym]?.q || 0) > 0 || (S.staked[sym]?.q || 0) > 0 || S.managers.some(m => m.pos[sym]?.q > 0);
    if (exposed) S.stats.rugged++;
    this.push(S, {
      cat: 'kr', src: pick(KR_SRC), title: `[속보] ${COIN[sym].name}(${sym}) 재단 잠적…러그풀 의혹, 시세 ${(drop * 100).toFixed(0)}% 폭락`,
      body: '재단 지갑의 물량이 한꺼번에 팔려 나갔다. 거래소는 유의종목으로 지정했다.', tone: -1, coins: [sym], big: true, power: 3, rug: true,
    });
  },

  /** 거의 죽은 잡코인이 새 재단과 함께 부활 */
  rebrand(S, sym) {
    const def = COIN[sym];
    const c = S.coins[sym];
    const amt = Math.log(def.p * rand(0.2, 0.6) / c.p);
    this.shock(S, sym, amt, 60, { perm: 2, jump: 0.3 });
    this.push(S, {
      cat: 'kr', src: pick(KR_SRC), title: `${def.name}(${sym}), 새 재단 영입하고 리브랜딩…거래량 폭발`,
      body: '토큰 소각과 로드맵 재공개 소식에 단기 투자자가 몰렸다.', tone: 1, coins: [sym], big: true, power: 3,
    });
  },

  /* ---------- 인맥 귀띔: 앞으로 나올 뉴스를 미리 알려준다 ---------- */
  tipTick(S) {
    if (S.t < S.tipNext) return;
    S.tipNext = S.t + randi(TPD * 1, TPD * 2);
    const an = Life.contactLv(S, 'analyst');
    const ex = Life.contactLv(S, 'exchange');
    const yt = Life.contactLv(S, 'youtuber');
    const options = [];
    if (an >= 2) options.push('analyst');
    if (ex >= 3) options.push('exchange');
    if (yt >= 3) options.push('youtuber');
    if (!options.length) return;
    if (an >= 2 && this.storyTip(S, an)) return;
    const who = pick(options);
    const at = S.t + randi(15, 40);
    let sym, tone, text, acc;
    if (who === 'youtuber') {
      const chIdx = YT_CH.findIndex(c => c.style === 'hype');
      sym = pick(COIN_POOLS.meme);
      S.pend.push({ t: at, type: 'plannedYT', ch: chIdx, sym });
      acc = 0.9;
      text = `"다음 영상에서 ${COIN[sym].name} 띄운대. 올라도 금방 빠지니까 짧게 먹고 나와."`;
      tone = 1;
    } else {
      const list = chance(0.5) ? 'kr' : 'gl';
      const src = list === 'kr' ? NEWS_KR : NEWS_GL;
      let cands = src.map((tp, i) => ({ tp, i })).filter(x => x.tp.mag && x.tp.pool && x.tp.pool !== 'none' && x.tp.cred == null);
      if (who === 'exchange') {
        cands = NEWS_KR.map((tp, i) => ({ tp, i })).filter(x => x.tp.pool === 'listable');
        sym = pick(COIN_POOLS.listable);
        S.pend.push({ t: at, type: 'planned', cat: 'kr', idx: cands[0].i, sym });
        acc = 0.95;
        tone = 1;
        text = `"곧 ${COIN[sym].name} 원화마켓 상장 공지 나가요. 상장 직후 고점 잡지 마세요."`;
      } else {
        const pickd = pick(cands);
        sym = pick(COIN_POOLS[pickd.tp.pool]);
        S.pend.push({ t: at, type: 'planned', cat: list, idx: pickd.i, sym });
        acc = an >= 3 ? 0.95 : 0.75;
        tone = pickd.tp.tone;
      }
    }
    const told = chance(acc) ? tone : -tone;
    if (who === 'analyst') text = told > 0 ? `"${COIN[sym].name} 쪽에 곧 큰 호재 뜬다더라. 나만 알고 있어."` : `"${COIN[sym].name} 곧 안 좋은 뉴스 나온대. 들고 있으면 정리해."`;
    const tip = { id: uid(S), who, sym, tone: told, text, at, until: at + 40 };
    S.tips.unshift(tip);
    Game.emit('tip', tip);
  },

  /** 결말이 다가온 이슈가 있으면 애널리스트가 결과를 귀띔한다 */
  storyTip(S, an) {
    const st = S.stories.find(x => !x.tipped && STORIES.find(d => d.id === x.sid).steps[x.step]?.branch);
    if (!st || !chance(0.7)) return false;
    st.tipped = true;
    const def = STORIES.find(d => d.id === st.sid);
    const br = def.steps[st.step].branch;
    const real = st.picks[st.step];
    const acc = an >= 3 ? 0.95 : 0.75;
    const said = chance(acc) ? real : (real + 1) % br.length;
    const name = def.name + (st.sym ? ` (${COIN[st.sym].name})` : '');
    const tip = { id: uid(S), who: 'analyst', sym: st.sym || 'BTC', tone: br[said].tone, text: `"${name} 건 말인데, ${br[said].hint}더라."`, at: st.next, until: st.next + 40, story: st.id };
    S.tips.unshift(tip);
    Game.emit('tip', tip);
    return true;
  },
};
