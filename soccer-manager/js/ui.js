/*
 * 터치라인 매니저 — 화면
 *
 * 엔진(TL) 상태를 250ms마다 진행시키고 그린다. 매치데이 패널은 매 프레임
 * 값만 바꾸고, 탭 보드와 열린 창(선수 상세 등)은 상태가 바뀌었을 때(rev)나
 * 탭별 주기에 맞춰 다시 그린다.
 */
(function () {
  'use strict';
  const TL = window.TL;
  const Store = window.TLStore;
  const $ = (id) => document.getElementById(id);
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);
  const M = (n) => TL.fmtMoney(n);
  const N = (n) => TL.fmtInt(n);
  const pct = (x) => Math.round(x * 100) + '%';

  const TABS = [
    ['club', '구단'], ['squad', '선수단'], ['scout', '스카우트'], ['gear', '장비'], ['manager', '감독'],
    ['facilities', '시설'], ['league', '리그'], ['records', '기록'], ['settings', '설정'],
  ];
  // 탭별 주기적 갱신 간격(ms). 0이면 상태가 바뀔 때만 다시 그린다.
  const PERIODIC = { club: 2000, squad: 1500, scout: 1500, gear: 2000, manager: 2000, facilities: 1500, league: 0, records: 0, settings: 0 };
  const TAB_KEY = 'touchline-manager-tab';

  let S = null;
  const ui = {
    tab: 'club',
    confirm: null,
    lastRev: -1,
    lastPanel: 0,
    lastTabs: 0,
    phaseKey: '',
    evCount: -1,
    last: Date.now(),
    saveAt: 0,
    bootSeen: 0,
    cloudReady: false,
    flash: null,
    skillFlash: null,
    mom: 0,
    ball: { x: 50, y: 50 },
    jit: [],
    offline: null,
    modal: null,
    modalRender: null,
    modalRev: -1,
    modalAt: 0,
    crestKey: '',
    draftName: null,
    timer: null,
  };

  /* ---------------------------------------------------------------- 아이콘 */

  const ICON = {
    goal: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#FFFFFF" stroke="currentColor" stroke-width="1.2"/><path d="M6 3.4l2.1 1.5-.8 2.5H4.7l-.8-2.5z" fill="currentColor"/></svg>',
    card: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="3" y="1.5" width="6" height="9" rx="1" fill="#F2C230" stroke="#9A7800" stroke-width=".8"/></svg>',
    injury: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 1.5h3v3h3v3h-3v3h-3v-3h-3v-3h3z" fill="var(--loss)"/></svg>',
    sub: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4h7M7 2l2 2-2 2M10 8H3M5 6L3 8l2 2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    save: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 6.5V3a1 1 0 012 0v3V2a1 1 0 012 0v4V3a1 1 0 012 0v4.5A3.5 3.5 0 015.5 11 3 3 0 013 8.5z" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
    miss: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.6"/></svg>',
    whistle: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="5" cy="7" r="3.3" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M7.5 4.5L11 3v2.6L8.2 6" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    order: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 9.5L6 2l4 7.5z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    skill: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .8l1.5 3.4 3.7.4-2.8 2.5.8 3.6L6 8.9 2.8 10.7l.8-3.6L.8 4.6l3.7-.4z" fill="var(--g-SSR)"/></svg>',
  };
  const EV_ICON = { goal: ICON.goal, card: ICON.card, injury: ICON.injury, sub: ICON.sub, save: ICON.save, miss: ICON.miss, ko: ICON.whistle, ht: ICON.whistle, ft: ICON.whistle, order: ICON.order, info: ICON.order, skill: ICON.skill };
  const CUP = '<svg viewBox="0 0 34 34" aria-hidden="true"><path class="cup" d="M9 4h16v6c0 5-3.4 8.6-8 8.6S9 15 9 10zM9 6H4.5c0 4.3 2 6.8 5.2 7.3M25 6h4.5c0 4.3-2 6.8-5.2 7.3M14.5 19h5l1 5h-7zM10.5 25h13v4h-13z" stroke-width="1.4"/></svg>';

  /* ---------------------------------------------------------------- 엠블럼 */

  const SHIELD = 'M20 1.5L38 6.5V22c0 11.5-7.6 18.6-18 22.5C9.6 40.6 2 33.5 2 22V6.5z';
  let crestSeq = 0;
  function hash(str) {
    let h = 7;
    for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  }
  function crest(kitKey, name, short, size) {
    const k = TL.KITS[kitKey] || TL.KITS.red;
    const id = 'cr' + (++crestSeq);
    const fg = k.onL;
    let deco = '';
    switch (hash(name) % 5) {
      case 1: deco = [8, 16, 24, 32].map((x) => `<rect x="${x}" y="0" width="4" height="46" fill="${fg}" opacity=".22"/>`).join(''); break;
      case 2: deco = `<path d="M-2 10L10 -2 44 34 32 46z" fill="${fg}" opacity=".22"/>`; break;
      case 3: deco = `<rect x="20" y="0" width="20" height="46" fill="${fg}" opacity=".2"/>`; break;
      case 4: deco = `<path d="M0 26l20-11 20 11v7L20 22 0 33z" fill="${fg}" opacity=".22"/>`; break;
      default: deco = `<rect x="0" y="0" width="40" height="9" fill="${fg}" opacity=".2"/>`;
    }
    const s = String(short || '').slice(0, 3);
    const fs = s.length > 2 ? 10 : 13;
    const h = Math.round(size * 46 / 40);
    return `<svg class="crest" viewBox="0 0 40 46" width="${size}" height="${h}" aria-hidden="true">` +
      `<defs><clipPath id="${id}"><path d="${SHIELD}"/></clipPath></defs>` +
      `<path d="${SHIELD}" fill="${k.l}"/><g clip-path="url(#${id})">${deco}</g>` +
      `<path d="${SHIELD}" fill="none" stroke="var(--crest-rim)" stroke-width="1.6"/>` +
      `<text x="20" y="${s.length > 2 ? 27 : 28}" text-anchor="middle" font-size="${fs}" fill="${fg}" font-family="Black Han Sans, IBM Plex Sans KR, sans-serif">${esc(s)}</text></svg>`;
  }
  const kitDot = (kit) => `<span class="kit-dot" style="--k:${(TL.KITS[kit] || TL.KITS.red).l}"></span>`;

  function applyKit() {
    const k = TL.KITS[S.club.kit] || TL.KITS.red;
    const st = document.documentElement.style;
    st.setProperty('--club-l', k.l);
    st.setProperty('--club-d', k.d);
    st.setProperty('--on-club-l', k.onL);
    st.setProperty('--on-club-d', k.onD);
  }

  /* ----------------------------------------------------------- RPG 표시 */

  const gradeBadge = (g) => `<span class="grade g-${g}">${TL.GRADES[g].name}</span>`;
  function starsHTML(n) {
    return `<span class="stars" aria-label="돌파 ${n}단계">${'★'.repeat(n)}<span class="stars-off">${'★'.repeat(TL.MAX_STAR - n)}</span></span>`;
  }
  const skillKind = { passive: '패시브', trigger: '발동', block: '방어' };
  function xpBar(p) {
    const cap = TL.levelCap(p.star);
    const full = p.lv >= cap;
    const w = full ? 100 : Math.min(100, Math.round(p.xp / TL.xpNeed(p.lv) * 100));
    return `<span class="xpbar${full ? ' full' : ''}"><i style="width:${w}%"></i></span>`;
  }
  const itemLabel = (it) => `${esc(it.name)}${it.plus ? ` <b class="plus">+${it.plus}</b>` : ''}`;

  /* ---------------------------------------------------------------- 토스트 */

  function toast(text, kind) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' t-' + kind : '');
    el.setAttribute('role', 'status');
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3600);
  }

  /* ---------------------------------------------------------------- 상단 바 */

  function renderTop() {
    const key = S.club.name + '|' + S.club.kit;
    if (ui.crestKey !== key) {
      ui.crestKey = key;
      $('tb-crest').innerHTML = crest(S.club.kit, S.club.name, S.club.short, 40);
      $('tb-name').textContent = S.club.name;
    }
    const tier = TL.TIERS[S.tier];
    const rounds = S.league.fixtures.length;
    const roundTxt = S.phase === 'offseason' ? '비시즌' : `${Math.min(S.round + (S.phase === 'post' ? 0 : 1), rounds)}/${rounds}R`;
    const fame = S.tier === 1 && S.prestige ? ` · 명성 ${S.prestige}` : '';
    setText('tb-meta', `${tier.name}${fame} · ${TL.leaguePos(S)}위 · 시즌 ${S.season} · ${roundTxt} · 감독 Lv.${S.mgr.lv}`);
    setText('tb-money', M(S.money));
    $('tb-money').classList.toggle('neg', S.money < 0);
    const eco = TL.roundEconomy(S);
    const rate = $('tb-rate');
    setText('tb-rate', '+' + M(eco.total) + '/R');
    rate.title = '한 라운드(경기 1회) 기준 예상 수입';
    setText('tb-tickets', N(S.mat.tickets));
    setText('tb-shards', N(S.mat.shards));
    setText('tb-books', N(S.mat.books));
    for (const b of document.querySelectorAll('#speed .seg-b')) {
      const on = b.dataset.act === 'pause' ? S.paused : (!S.paused && Number(b.dataset.v) === S.speed);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    setText('btn-pause', S.paused ? '재개' : '정지');
  }

  /* ---------------------------------------------------------------- 매치데이 */

  function buildMatchday() {
    const lines = '<svg class="pitch-lines" viewBox="0 0 105 68" aria-hidden="true">' +
      '<rect x="1" y="1" width="103" height="66"/><line x1="52.5" y1="1" x2="52.5" y2="67"/>' +
      '<circle cx="52.5" cy="34" r="9.15"/><circle class="spot" cx="52.5" cy="34" r=".6"/>' +
      '<rect x="1" y="13.85" width="16.5" height="40.3"/><rect x="87.5" y="13.85" width="16.5" height="40.3"/>' +
      '<rect x="1" y="24.84" width="5.5" height="18.32"/><rect x="98.5" y="24.84" width="5.5" height="18.32"/>' +
      '<circle class="spot" cx="12" cy="34" r=".6"/><circle class="spot" cx="93" cy="34" r=".6"/>' +
      '<path d="M17.5 26.7a9.15 9.15 0 010 14.6M87.5 26.7a9.15 9.15 0 000 14.6"/>' +
      '<rect x="-1" y="30.34" width="2" height="7.32"/><rect x="104" y="30.34" width="2" height="7.32"/></svg>';
    $('matchday').innerHTML =
      '<div class="md-top"><span class="md-phase" id="md-phase"></span><span class="md-round" id="md-round"></span></div>' +
      '<div class="led" id="led">' +
      '<div class="led-team"><span id="sb-hc"></span><span class="led-name" id="sb-hn"></span><span class="led-ha">HOME</span></div>' +
      '<div class="led-score" aria-live="off"><span id="sb-hg">-</span><span class="led-colon">:</span><span id="sb-ag">-</span></div>' +
      '<div class="led-team"><span id="sb-ac"></span><span class="led-name" id="sb-an"></span><span class="led-ha">AWAY</span></div>' +
      '<div class="led-clock" id="sb-clock">--</div></div>' +
      `<div class="pitch" id="pitch" role="img" aria-label="경기 진행 화면">${lines}<div id="dots"></div><span class="ball" id="ball"></span><div id="skill-slot"></div><div id="flash-slot"></div></div>` +
      '<div class="mom" aria-hidden="true"><span class="mom-name" id="mom-h"></span><div class="mom-track"><span class="mom-fill" id="mom-fill"></span></div><span class="mom-name" id="mom-a"></span></div>' +
      '<div class="orders" id="orders"></div>' +
      '<div id="md-body"></div>';
    let html = '';
    for (let i = 0; i < 22; i++) html += `<span class="dot" id="dot${i}"></span>`;
    $('dots').innerHTML = html;
    for (let i = 0; i < 22; i++) ui.jit.push({ x: 0, y: 0 });
    ui.phaseKey = '';
  }

  function formationLines(f) {
    if (f === '4-2-3-1') return [['GK', 1, 5], ['DF', 4, 19], ['MF', 2, 30], ['MF', 3, 41], ['FW', 1, 51]];
    const F = TL.FORMATIONS[f] || TL.FORMATIONS['4-4-2'];
    return [['GK', 1, 5], ['DF', F.DF, 19], ['MF', F.MF, 34], ['FW', F.FW, 48]];
  }
  function dotSpots(f) {
    const out = [];
    for (const [, n, x] of formationLines(f)) {
      for (let i = 0; i < n; i++) out.push({ x, y: (i + 1) / (n + 1) * 100 });
    }
    return out;
  }

  // 지금 전광판에 올릴 두 팀(경기 중이면 실제, 아니면 다음 경기)
  function currentPair() {
    if (S.live && (S.phase === 'match' || S.phase === 'post')) return { h: S.live.h, a: S.live.a, live: S.live };
    const fx = TL.myFixture(S);
    return fx ? { h: fx.h, a: fx.a, live: null } : null;
  }

  function oppDotColor(oppKit) {
    if (oppKit !== S.club.kit) return TL.KITS[oppKit].l;
    const alt = TL.KIT_KEYS[(TL.KIT_KEYS.indexOf(oppKit) + 3) % TL.KIT_KEYS.length];
    return TL.KITS[alt].l;
  }

  function renderMatchday(now) {
    const pair = currentPair();
    if (!pair) return;
    const L = pair.live;
    const home = TL.teamById(S, pair.h);
    const away = TL.teamById(S, pair.a);
    const speed = S.speed;

    let phase = '';
    let clock = '';
    const left = (t) => Math.max(0, Math.ceil((t - S.phaseT) / speed));
    if (S.phase === 'pre') { phase = '경기 준비'; clock = `KO ${left(TL.T.pre)}s`; }
    else if (S.phase === 'match') {
      const ht = L.clock >= TL.T.match / 2 && L.clock < TL.T.match / 2 + TL.T.half;
      phase = `<span class="live-dot"></span>${ht ? '하프타임' : L.minute < 45 ? '전반전' : '후반전'}`;
      clock = ht ? 'HT' : `${String(L.minute).padStart(2, '0')}'`;
    } else if (S.phase === 'post') { phase = '경기 종료'; clock = 'FT'; }
    else if (S.phase === 'offseason') { phase = '비시즌'; clock = `NEXT ${left(TL.T.offseason)}s`; }
    if (S.paused) phase += ' · 일시정지';
    setHTML('md-phase', phase);
    const roundNo = S.phase === 'offseason' ? 1 : (L ? S.round + (S.phase === 'post' ? 0 : 1) : S.round + 1);
    setText('md-round', `${TL.TIERS[S.tier].name} ${S.phase === 'offseason' ? `시즌 ${S.season} 개막전` : roundNo + '라운드'}`);

    const key = pair.h + pair.a + S.club.kit + S.club.name;
    if (ui.sbKey !== key) {
      ui.sbKey = key;
      $('sb-hc').innerHTML = crest(home.kit, home.name, home.short, 28);
      $('sb-ac').innerHTML = crest(away.kit, away.name, away.short, 28);
      setText('sb-hn', home.name);
      setText('sb-an', away.name);
      setText('mom-h', home.short);
      setText('mom-a', away.short);
    }
    setText('sb-hg', L ? L.hg : '-');
    setText('sb-ag', L ? L.ag : '-');
    setText('sb-clock', clock);

    // 피치: 선수 점과 공
    const myHome = pair.h === 'me';
    const targetMom = L && S.phase === 'match' ? L.mom : 0;
    ui.mom += (targetMom - ui.mom) * 0.35;
    const homeSpots = dotSpots(myHome ? S.formation : '4-4-2');
    const awaySpots = dotSpots(myHome ? '4-4-2' : S.formation);
    const oppColor = oppDotColor(myHome ? away.kit : home.kit);
    const moving = S.phase === 'match' && !S.paused;
    const shift = ui.mom * 12;
    for (let i = 0; i < 22; i++) {
      const el = $('dot' + i);
      const isHome = i < 11;
      const spot = (isHome ? homeSpots : awaySpots)[i % 11];
      const j = ui.jit[i];
      if (moving) {
        j.x = clamp(j.x + (Math.random() - 0.5) * 2.4, -3.5, 3.5);
        j.y = clamp(j.y + (Math.random() - 0.5) * 3.2, -5, 5);
      }
      const bx = isHome ? spot.x : 100 - spot.x;
      const x = clamp(bx + shift + (spot.x > 6 ? j.x : 0), 2, 98);
      const y = clamp(spot.y + (spot.x > 6 ? j.y : 0), 5, 95);
      el.style.left = x.toFixed(1) + '%';
      el.style.top = y.toFixed(1) + '%';
      el.style.setProperty('--c', (isHome === myHome) ? 'var(--club)' : oppColor);
    }
    const flashOn = ui.flash && now < ui.flash.until;
    if (flashOn) {
      ui.ball.x = ui.flash.side === 'h' ? 99 : 1;
      ui.ball.y = 50;
    } else if (moving) {
      const tx = 50 + ui.mom * 38;
      ui.ball.x = clamp(ui.ball.x + (tx - ui.ball.x) * 0.45 + (Math.random() - 0.5) * 9, 4, 96);
      ui.ball.y = clamp(ui.ball.y + (Math.random() - 0.5) * 16, 10, 90);
    } else if (S.phase !== 'post') {
      ui.ball.x = 50; ui.ball.y = 50;
    }
    const ball = $('ball');
    ball.style.left = ui.ball.x.toFixed(1) + '%';
    ball.style.top = ui.ball.y.toFixed(1) + '%';
    const slot = $('flash-slot');
    if (flashOn && !slot.firstChild) {
      slot.innerHTML = `<div class="flash ${ui.flash.mine ? 'mine' : 'theirs'}">${ui.flash.mine ? 'GOAL!' : '실점'}</div>`;
    } else if (!flashOn && slot.firstChild) slot.innerHTML = '';
    const sk = $('skill-slot');
    const skOn = ui.skillFlash && now < ui.skillFlash.until;
    if (skOn && sk.dataset.k !== String(ui.skillFlash.until)) {
      sk.dataset.k = String(ui.skillFlash.until);
      sk.innerHTML = `<div class="skill-flash"><b>${esc(ui.skillFlash.skill)}</b> ${esc(ui.skillFlash.name)}</div>`;
    } else if (!skOn && sk.firstChild) { sk.innerHTML = ''; sk.dataset.k = ''; }

    const fill = $('mom-fill');
    const m = ui.mom;
    fill.style.left = (m >= 0 ? 50 : 50 + m * 50) + '%';
    fill.style.width = Math.abs(m) * 50 + '%';
    fill.style.setProperty('--c', (m >= 0) === myHome ? 'var(--club)' : oppColor);

    renderOrders();
    renderMdBody(now);
  }

  function renderOrders() {
    const L = S.live;
    const active = S.phase === 'match' && L && !L.done;
    const total = TL.ordersPerMatch(S);
    const left = L ? L.ordersLeft : total;
    const cur = active && L.order ? L.order : null;
    const key = [S.phase, left, total, cur ? cur.k + cur.until : '', active && L.minute >= 88, S.mgr.tal.chari].join('|');
    if (ui.orderKey === key) return;
    ui.orderKey = key;
    const note = cur ? `${TL.ORDERS[cur.k].name} 지시 중 · ${cur.until}'까지` : active ? '15분간 효과' : '경기 중에만 쓸 수 있어요';
    const mult = 1 + 0.15 * (S.mgr.tal.chari || 0);
    const btns = Object.keys(TL.ORDERS).map((k) => {
      const o = TL.ORDERS[k];
      const a = Math.round(o.att * mult * 10) / 10, d = Math.round(o.def * mult * 10) / 10;
      const fx = `공${a > 0 ? '+' : ''}${a} 수${d > 0 ? '+' : ''}${d}`;
      const dis = !active || left <= 0 || L.minute >= 88 || !!cur;
      return `<button type="button" class="btn order-b${cur && cur.k === k ? ' is-on' : ''}" data-act="order" data-k="${k}" data-key="order-${k}"${dis ? ' disabled' : ''}>${o.name}<small>${fx}</small></button>`;
    }).join('');
    $('orders').innerHTML = `<div class="orders-head"><span>감독 지시 ${left}/${total}</span><span>${note}</span></div><div class="orders-row">${btns}</div>`;
  }

  function lootText(loot, levels) {
    if (!loot) return '';
    const parts = [];
    if (loot.shards) parts.push(`돌파석 +${loot.shards}`);
    if (loot.books) parts.push(`스킬북 +${loot.books}`);
    if (loot.item) parts.push(`${gradeBadge(loot.item.grade)} ${esc(loot.item.name)}`);
    if (levels) parts.push(`레벨업 ${levels}회`);
    return parts.join(' · ');
  }

  function renderMdBody(now) {
    const L = S.live;
    const body = $('md-body');
    if (S.phase === 'match' || S.phase === 'post') {
      const key = 'live' + S.season + '-' + S.round + '-' + S.phase;
      if (ui.phaseKey !== key || ui.evCount !== L.events.length) {
        ui.phaseKey = key;
        ui.evCount = L.events.length;
        const mySide = L.home ? 'h' : 'a';
        const items = L.events.slice(-14).reverse().map((e) => {
          const mine = e.side && e.side === mySide;
          return `<li class="ev ev-${e.t}${mine ? ' mine' : ''}"><span class="ev-min">${e.m}'</span><span class="ev-ico">${EV_ICON[e.t] || ''}</span><span class="ev-txt">${esc(e.text)}</span></li>`;
        }).join('');
        let foot = '';
        if (S.phase === 'post' && S.lastResult) {
          const r = S.lastResult;
          const gate = r.home ? `관중 ${N(r.attendance)}명 · 입장 수입 ${M(r.gate)}` : '원정 경기';
          const loot = lootText(r.loot, r.levels);
          foot = `<p class="md-note">${gate}</p>${loot ? `<p class="md-note loot">전리품 ${loot}</p>` : ''}`;
        }
        body.innerHTML = `<ol class="ticker" aria-label="문자 중계">${items}</ol>${foot}`;
      }
      return;
    }
    if (S.phase === 'offseason' && S.seasonEnd) {
      const key = 'off' + S.season;
      if (ui.phaseKey === key && now - (ui.mdAt || 0) < 1000) return;
      ui.phaseKey = key;
      ui.mdAt = now;
      const sm = S.seasonEnd;
      body.innerHTML = `<div class="season-box"><span class="muted">시즌 ${sm.season} · ${esc(sm.tierName)} 최종</span>` +
        `<span class="season-pos">${sm.pos}위</span><span class="season-move">${esc(moveText(sm))}</span>` +
        `<button type="button" class="btn btn-primary" data-act="skip" data-key="skip-md">새 시즌 바로 시작</button></div>`;
      return;
    }
    // 경기 준비: 1초에 한 번만 다시 그린다
    const key = 'pre' + S.season + '-' + S.round + S.formation + S.tactic + S.rev;
    if (ui.phaseKey === key && now - (ui.mdAt || 0) < 1000) return;
    ui.phaseKey = key;
    ui.mdAt = now;
    const pv = TL.matchPreview(S);
    if (!pv) { body.innerHTML = ''; return; }
    const me = pv.me, opp = pv.opp;
    const row = (k, a, b) => {
      const max = Math.max(a, b, 1);
      return `<div class="cmp-row"><span class="v">${a.toFixed(1)}</span><span class="cmp-bar l"><i style="width:${(a / max * 100).toFixed(0)}%"></i></span><span class="k">${k}</span><span class="cmp-bar r"><i style="width:${(b / max * 100).toFixed(0)}%"></i></span><span class="v">${b.toFixed(1)}</span></div>`;
    };
    const oppOvr = (opp.att + opp.def) / 2;
    const xi = TL.lineup(S).xi;
    const byPos = {};
    for (const x of xi) {
      const p = S.players.find((q) => q.id === x.id);
      if (!p) continue;
      (byPos[x.pos] = byPos[x.pos] || []).push(`<button type="button" class="linkish g-t-${p.grade}" data-act="player" data-id="${p.id}">${esc(p.name)}</button> <span class="muted">${Math.floor(p.ovr)}</span>`);
    }
    const lines = TL.POSITIONS.filter((p) => byPos[p]).map((p) => `<div class="xi-line"><span class="pos-badge pos-${p}">${p}</span>${byPos[p].join(' · ')}</div>`).join('');
    const pr = pv.probs;
    const skillTxt = me.skill.att || me.skill.def ? ` · 스킬 공+${me.skill.att.toFixed(1)} 수+${me.skill.def.toFixed(1)}` : '';
    body.innerHTML = `<div class="preview">` +
      `<div class="pv-opp">${crest(opp.kit, opp.name, opp.short, 30)}<div><h3>${pv.home ? '홈' : '원정'} vs ${esc(opp.name)}</h3><p>현재 ${pv.oppPos}위 · 킥오프까지 ${Math.max(0, Math.ceil((TL.T.pre - S.phaseT) / S.speed))}초</p></div></div>` +
      `<div class="cmp">${row('공격', me.att, opp.att)}${row('수비', me.def, opp.def)}${row('전력', me.ovr, oppOvr)}</div>` +
      `<div class="odds" aria-label="예상 승률"><span class="o-w" style="width:${pct(pr.w)}">승 ${pct(pr.w)}</span><span class="o-d" style="width:${pct(pr.d)}">무 ${pct(pr.d)}</span><span class="o-l" style="width:${pct(pr.l)}">패 ${pct(pr.l)}</span></div>` +
      `<div class="xi-mini"><span class="muted">선발 XI · ${esc(S.formation)} ${esc(TL.TACTICS[S.tactic].name)}${skillTxt}</span>${lines}</div></div>`;
  }

  function moveText(sm) {
    if (sm.champion && sm.move < 0) return '우승 · 승격!';
    if (sm.champion) return sm.tier === 1 ? '1부 리그 챔피언!' : '우승!';
    if (sm.move < 0) return '승격!';
    if (sm.move > 0) return '강등';
    return '잔류';
  }

  /* ---------------------------------------------------------------- 탭 */

  function renderTabs() {
    $('tabs').innerHTML = TABS.map(([id, label]) => {
      const on = ui.tab === id;
      return `<button type="button" class="tab" role="tab" id="tab-${id}" aria-controls="panel" aria-selected="${on}" tabindex="${on ? 0 : -1}" data-act="tab" data-tab="${id}">${label}<span id="badge-${id}" hidden></span></button>`;
    }).join('');
    $('panel').setAttribute('aria-labelledby', 'tab-' + ui.tab);
    updateTabBadges();
  }

  // 탭 버튼은 그대로 두고 배지만 바꾼다(키보드 포커스 유지)
  function updateTabBadges() {
    const affordable = TL.FAC_KEYS.some((k) => S.fac[k] < TL.FAC_MAX && TL.facilityCost(k, S.fac[k]) <= S.money);
    const set = (id, text, cls, title) => {
      const el = $('badge-' + id);
      if (!el) return;
      const show = text !== null;
      el.hidden = !show;
      if (!show) return;
      el.className = cls;
      el.textContent = text;
      el.title = title;
    };
    const scoutN = S.mat.tickets + S.youth.length;
    set('scout', scoutN ? String(scoutN) : null, 'tab-badge', '티켓·유스 대기');
    set('manager', S.mgr.pts ? String(S.mgr.pts) : null, 'tab-badge', '남은 특성 포인트');
    set('facilities', affordable ? '' : null, 'tab-badge is-dot', '업그레이드 가능');
  }

  function renderPanel() {
    const panel = $('panel');
    const active = document.activeElement;
    const focusKey = active && panel.contains(active) ? active.getAttribute('data-key') : null;
    if (ui.confirm && Date.now() > ui.confirm.until) ui.confirm = null;
    let html = '';
    switch (ui.tab) {
      case 'club': html = renderClub(); break;
      case 'squad': html = renderSquad(); break;
      case 'scout': html = renderScout(); break;
      case 'gear': html = renderGear(); break;
      case 'manager': html = renderManager(); break;
      case 'facilities': html = renderFacilities(); break;
      case 'league': html = renderLeague(); break;
      case 'records': html = renderRecords(); break;
      case 'settings': html = renderSettings(); break;
    }
    panel.innerHTML = html;
    if (focusKey) {
      const el = panel.querySelector(`[data-key="${focusKey}"]`);
      if (el) el.focus({ preventScroll: true });
    }
    ui.lastRev = S.rev;
    ui.lastPanel = Date.now();
  }

  function maybeRenderPanel(now) {
    if (now - ui.lastTabs > 1000) { updateTabBadges(); ui.lastTabs = now; }
    const active = document.activeElement;
    const typing = active && $('panel').contains(active) && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
    if (typing) return;
    const per = PERIODIC[ui.tab];
    const expired = ui.confirm && now > ui.confirm.until;
    if (S.rev !== ui.lastRev || (per && now - ui.lastPanel > per) || expired) renderPanel();
  }

  function isConfirming(kind, id) {
    return ui.confirm && ui.confirm.kind === kind && ui.confirm.id === String(id) && Date.now() <= ui.confirm.until;
  }

  /* ----- 구단 */

  function renderClub() {
    const tier = TL.TIERS[S.tier];
    const eco = TL.roundEconomy(S);
    const att = TL.expectedAttendance(S);
    const cap = TL.stadiumCap(S);
    const pos = TL.leaguePos(S);
    const xi = TL.rateXI(TL.lineup(S).xi);
    const obj = S.objective;
    let html = '';
    if (S.flags.welcome) {
      const name = ui.draftName != null ? ui.draftName : S.club.name;
      html += `<section class="card welcome"><h2>감독님, ${esc(S.club.name)}에 오신 걸 환영합니다</h2>` +
        `<p>5부 리그에서 출발해 1부 리그 우승까지 가는 방치형 축구 RPG입니다. 경기는 자동으로 흘러가고, 선수들은 경기와 훈련으로 경험치를 쌓습니다. 골드로 레벨업하고, 스카우트로 높은 등급 선수를 뽑고, 경기에서 얻은 장비를 강화하세요. 창단 선물로 프리미엄 스카우트 티켓 3장을 드렸습니다.</p>` +
        `<form class="form-row" id="welcome-form"><label for="welcome-name">구단 이름</label><input class="input" id="welcome-name" maxlength="20" value="${esc(name)}" autocomplete="off">` +
        `<div class="swatches" role="group" aria-label="홈 유니폼 색">${swatches()}</div>` +
        `<button type="submit" class="btn btn-primary">이 이름으로 시작</button></form></section>`;
    }
    const objTxt = obj ? TL.objectiveLabel(obj, S.tier) : '-';
    html += `<div class="kpis">` +
      `<div class="kpi"><span class="kpi-k">라운드당 예상 수입</span><span class="kpi-v pos">+${M(eco.total)}</span><span class="kpi-s">팬 ${N(S.fans)}명 · 스폰서 ${M(eco.inc.sponsor)}</span></div>` +
      `<div class="kpi"><span class="kpi-k">홈 관중</span><span class="kpi-v">${N(att)}<span class="muted" style="font-size:.7em"> / ${N(cap)}</span></span><span class="kpi-s">${att >= cap ? '매진 행렬. 경기장을 넓힐 때입니다' : `빈자리 ${N(cap - att)}석`}</span></div>` +
      `<div class="kpi"><span class="kpi-k">구단주 목표</span><span class="kpi-v">${esc(objTxt)}</span><span class="kpi-s">현재 ${pos}위 · 달성 보상 ${obj ? M(obj.reward) : '-'}</span></div>` +
      `<div class="kpi"><span class="kpi-k">선발 전력</span><span class="kpi-v">${xi.ovr.toFixed(1)}</span><span class="kpi-s">${esc(tier.name)} 평균 ${TL.tierAI(S, S.tier).toFixed(0)}</span></div></div>`;

    const cur = S.fin.cur;
    const ledger = (rows, sumLabel, sum) => `<dl class="ledger">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}<dt class="sum">${sumLabel}</dt><dd class="sum ${sum >= 0 ? 'pos' : 'neg'}">${sum >= 0 ? '+' : ''}${M(sum)}</dd></dl>`;
    const curIn = cur.gate + cur.tv + cur.sponsor + cur.merch + cur.bonus + cur.sales;
    const curOut = cur.growth + cur.scout + cur.gear + cur.build;
    html += `<section class="card"><div class="sec-h"><h2>재정</h2><p>주급은 없습니다. 번 돈은 전부 선수 성장과 시설에 씁니다</p></div><div class="fin-grid">` +
      `<div class="fin-col"><h3>라운드당 예상 수입</h3>${ledger([
        ['입장 수입', M(eco.inc.gate)], ['중계권', M(eco.inc.tv)], ['스폰서', M(eco.inc.sponsor)], ['굿즈 판매', M(eco.inc.merch)],
      ], '합계', eco.total)}</div>` +
      `<div class="fin-col"><h3>시즌 ${S.season} 누적</h3>${ledger([
        ['운영 수입', M(cur.gate + cur.tv + cur.sponsor + cur.merch)], ['상금·보너스', M(cur.bonus)], ['방출·분해', M(cur.sales)],
        ['선수 성장', '−' + M(cur.growth)], ['스카우트', '−' + M(cur.scout)], ['장비 강화', '−' + M(cur.gear)], ['시설 투자', '−' + M(cur.build)],
      ], '합계', curIn - curOut)}</div></div></section>`;

    const form = S.league.table.me.form;
    const lr = S.lastResult;
    html += `<section class="card"><div class="sec-h"><h2>최근 흐름</h2><p>${form.length ? '최근 5경기 ' + formChips(form) : '아직 치른 경기가 없습니다'}</p></div>` +
      (lr ? `<p class="hint">지난 경기: ${lr.round}라운드 ${lr.home ? '홈' : '원정'} ${esc(lr.opp)}전 <b>${lr.gf}:${lr.ga}</b> ${lr.res === 'W' ? '승리' : lr.res === 'D' ? '무승부' : '패배'}${lootText(lr.loot, lr.levels) ? ` · 전리품 ${lootText(lr.loot, lr.levels)}` : ''}</p>` : '<p class="hint">첫 경기가 곧 시작됩니다. 왼쪽 전광판에서 경기를 지켜보세요.</p>') +
      `</section>`;

    html += `<section class="card"><h2>구단 소식</h2><ul class="news">${S.news.slice(0, 14).map((n) => `<li><span class="when">S${n.s} ${n.r}R</span><span class="k-${n.k}">${esc(n.t)}</span></li>`).join('')}</ul></section>`;
    return html;
  }

  function formChips(form) {
    const label = { W: '승', D: '무', L: '패' };
    return `<span class="form-chips">${form.map((r) => `<span class="fc fc-${r}">${label[r]}</span>`).join('')}</span>`;
  }

  function swatches() {
    return TL.KIT_KEYS.map((k) => `<button type="button" class="swatch" style="--k:${TL.KITS[k].l}" data-act="kit" data-kit="${k}" data-key="kit-${k}" aria-pressed="${S.club.kit === k}" aria-label="${TL.KITS[k].name}" title="${TL.KITS[k].name}"></button>`).join('');
  }

  /* ----- 선수단 */

  function grade(ovr) {
    const ai = TL.tierAI(S, S.tier);
    if (ovr >= ai + 8) return 'g-elite';
    if (ovr >= ai + 3) return 'g-good';
    if (ovr >= ai - 3) return 'g-mid';
    return 'g-low';
  }
  const fitClass = (f) => (f >= 85 ? 'f-good' : f >= 65 ? 'f-mid' : 'f-low');

  function levelButton(p, cls) {
    const cap = TL.levelCap(p.star);
    if (p.lv >= cap) {
      if (p.star >= TL.MAX_STAR) return `<button type="button" class="btn btn-sm" disabled>MAX</button>`;
      return `<button type="button" class="btn btn-sm btn-star" data-act="player" data-id="${p.id}" data-key="star-${p.id}">돌파</button>`;
    }
    const c = TL.levelCost(S, p);
    return `<button type="button" class="btn btn-sm ${cls || 'btn-primary'}" data-act="lvup" data-id="${p.id}" data-key="lvup-${p.id}"${S.money < c ? ` disabled title="${M(c - S.money)} 부족"` : ''}>Lv↑ ${M(c)}</button>`;
  }

  function renderSquad() {
    const lu = TL.lineup(S);
    const xiIds = new Set(lu.xi.map((x) => x.id));
    const R = TL.teamRating(S, lu.xi);
    const ai = TL.tierAI(S, S.tier);
    const d = (v) => { const x = v - ai; return `<small class="${x >= 0 ? 'pos' : 'neg'}">${x >= 0 ? '+' : ''}${x.toFixed(1)}</small>`; };
    const forms = Object.keys(TL.FORMATIONS).map((f) => `<button type="button" class="seg-b" data-act="formation" data-f="${f}" data-key="f-${f}" aria-pressed="${S.formation === f}">${f}</button>`).join('');
    const tacs = Object.keys(TL.TACTICS).map((t) => `<button type="button" class="seg-b" data-act="tactic" data-t="${t}" data-key="t-${t}" aria-pressed="${S.tactic === t}">${TL.TACTICS[t].name}</button>`).join('');

    let html = `<section class="card"><div class="ctl-grid">` +
      `<div class="ctl"><span class="ctl-k">포메이션</span><div class="seg" role="group" aria-label="포메이션">${forms}</div><p class="hint">${esc(TL.FORMATIONS[S.formation].desc)}</p></div>` +
      `<div class="ctl"><span class="ctl-k">전술</span><div class="seg" role="group" aria-label="전술">${tacs}</div><p class="hint">공격적일수록 골도 실점도 늘어납니다</p></div></div>` +
      `<div class="ratings" style="margin-top:12px"><span>공격<b>${R.att.toFixed(1)}</b>${d(R.att)}</span><span>수비<b>${R.def.toFixed(1)}</b>${d(R.def)}</span><span>전력<b>${R.ovr.toFixed(1)}</b>${d(R.ovr)}</span><span class="muted" style="align-self:center">리그 평균(${ai.toFixed(0)}) 대비 · 스킬·특성 포함</span></div></section>`;

    html += `<section class="card"><div class="sec-h"><div><h2>선수단 ${S.players.length}/${TL.SQUAD_MAX}</h2><p>선발 11명은 컨디션까지 따져 자동으로 고릅니다. 이름을 누르면 돌파·스킬·장비를 관리할 수 있어요</p></div>` +
      `<button type="button" class="btn btn-primary" data-act="lvteam" data-key="lvteam">선발 일괄 레벨업</button></div><div class="plist">`;
    html += `<div class="prow head"><span>#</span><span>선수</span><span style="text-align:center">OVR</span><span class="p-stats"><span>포지션</span><span>레벨</span><span>컨디션</span><span>스킬</span><span>시즌</span></span><span></span></div>`;
    for (const pos of TL.POSITIONS) {
      const ps = S.players.filter((p) => p.pos === pos).sort((a, b) => b.ovr - a.ovr);
      if (!ps.length) continue;
      html += `<h3 class="pgroup">${TL.POS_NAME[pos]} ${ps.length}</h3>`;
      for (const p of ps) html += playerRow(p, xiIds.has(p.id));
    }
    html += '</div></section>';
    return html;
  }

  function playerRow(p, inXI) {
    const tags = [];
    if (inXI) tags.push('<span class="tag tag-xi">선발</span>');
    if (p.youth) tags.push('<span class="tag tag-youth">유스</span>');
    if (p.inj > 0) tags.push(`<span class="tag tag-inj">부상 ${p.inj}</span>`);
    if (p.rest) tags.push('<span class="tag tag-rest">휴식</span>');
    const fit = Math.round(p.fit);
    const sk = TL.SKILLS[p.skill];
    const cap = TL.levelCap(p.star);
    return `<div class="prow${inXI ? ' is-xi' : ''}${p.inj > 0 ? ' is-out' : ''}">` +
      `<span class="p-num">${p.num}</span>` +
      `<div class="p-main"><button type="button" class="p-name linkish" data-act="player" data-id="${p.id}" data-key="pl-${p.id}">${esc(p.name)}</button>` +
      `<span class="p-sub">${gradeBadge(p.grade)}${starsHTML(p.star)}${tags.join('')}</span></div>` +
      `<span class="p-ovr ${grade(p.ovr)}">${Math.floor(p.ovr)}</span>` +
      `<span class="p-stats"><span><span class="pos-badge pos-${p.pos}">${p.pos}</span></span>` +
      `<span class="p-lv"><span>Lv.${p.lv}<span class="muted">/${cap}</span></span>${xpBar(p)}</span>` +
      `<span class="p-fit"><span class="bar"><i class="${fitClass(fit)}" style="width:${fit}%"></i></span><span>${fit}</span></span>` +
      `<span class="p-skill" title="${esc(sk.desc(p.slv))}">${esc(sk.name)} <span class="muted">Lv.${p.slv}</span></span>` +
      `<span class="p-season">${p.sApps}경기 ${p.sGoals}골</span></span>` +
      `<span class="p-act">${levelButton(p)}</span></div>`;
  }

  /* ----- 선수 상세 창 */

  function openPlayer(id) {
    const p = S.players.find((q) => q.id === id);
    if (!p) return;
    ui.modalPid = id;
    openModal(() => playerModal(), 'player');
  }

  function playerModal() {
    const p = S.players.find((q) => q.id === ui.modalPid);
    if (!p) return `<h2 id="modal-title">선수를 찾을 수 없어요</h2><div class="modal-actions"><button type="button" class="btn" data-act="close">닫기</button></div>`;
    const g = TL.GRADES[p.grade];
    const sk = TL.SKILLS[p.skill];
    const cap = TL.levelCap(p.star);
    const gear = TL.gearBonus(S, p);
    const lvB = g.growth * (p.lv - 1);
    const starB = 2 * (p.star - 1);
    const xiIds = new Set(TL.lineup(S).xi.map((x) => x.id));

    // 레벨업 버튼: 1회, 10회, 최대
    let lvHTML = '';
    if (p.lv < cap) {
      const c1 = TL.levelCost(S, p);
      let sum = 0, n = 0, lv = p.lv;
      const tmp = { lv: p.lv, grade: p.grade };
      while (n < 10 && lv < cap) { tmp.lv = lv; sum += TL.levelCost(S, tmp); lv++; n++; }
      lvHTML = `<div class="btn-row"><button type="button" class="btn btn-primary" data-act="lvup" data-id="${p.id}" data-key="m-lv1"${S.money < c1 ? ' disabled' : ''}>레벨업 ${M(c1)}</button>` +
        `<button type="button" class="btn" data-act="lvup" data-n="10" data-id="${p.id}" data-key="m-lv10"${S.money < c1 ? ' disabled' : ''}>+${n} ${M(sum)}</button>` +
        `<button type="button" class="btn" data-act="lvup" data-n="999" data-id="${p.id}" data-key="m-lvmax"${S.money < c1 ? ' disabled' : ''}>자금 되는 만큼</button></div>`;
    } else {
      lvHTML = `<p class="hint">${p.star >= TL.MAX_STAR ? '최고 레벨입니다.' : `레벨 상한 ${cap}에 닿았습니다. 돌파하면 상한이 ${TL.levelCap(p.star + 1)}로 오릅니다.`}</p>`;
    }

    let starHTML = '';
    const sc = TL.starCost(S, p);
    if (sc) {
      const ready = p.lv >= cap;
      const can = ready && S.mat.shards >= sc.shards && S.money >= sc.money;
      starHTML = `<p class="hint">★${p.star} → ★${p.star + 1}: OVR +2, 레벨 상한 ${cap} → ${TL.levelCap(p.star + 1)} · 돌파석 ${N(S.mat.shards)}/${sc.shards} · ${M(sc.money)}${ready ? '' : ` · Lv.${cap} 필요`}</p>` +
        `<button type="button" class="btn btn-star" data-act="star" data-id="${p.id}" data-key="m-star"${can ? '' : ' disabled'}>돌파</button>`;
    } else starHTML = '<p class="hint">최대 돌파 ★5</p>';

    let skillHTML = '';
    const kc = TL.skillCost(S, p);
    skillHTML = `<p class="skill-desc"><b>${esc(sk.name)}</b> <span class="tag tag-rest">${skillKind[sk.kind]}</span> Lv.${p.slv}/${TL.MAX_SKILL}<br>${esc(sk.desc(p.slv))}</p>`;
    if (kc) {
      const can = S.mat.books >= kc.books && S.money >= kc.money;
      skillHTML += `<p class="hint">다음 레벨: ${esc(sk.desc(p.slv + 1))} · 스킬북 ${N(S.mat.books)}/${kc.books} · ${M(kc.money)}</p>` +
        `<button type="button" class="btn" data-act="skillup" data-id="${p.id}" data-key="m-skill"${can ? '' : ' disabled'}>스킬 강화</button>`;
    }

    const mine = TL.gearOf(S, p);
    const gearHTML = TL.SLOT_KEYS.map((slot) => {
      const it = mine[slot];
      const cands = S.items.filter((i) => i.slot === slot && i.owner !== p.id)
        .sort((a, b) => TL.itemBonus(b) - TL.itemBonus(a)).slice(0, 4);
      const cur = it
        ? `<div class="slot-cur">${gradeBadge(it.grade)} ${itemLabel(it)} <span class="muted">OVR +${TL.itemBonus(it).toFixed(2)}</span> <button type="button" class="btn btn-sm btn-ghost" data-act="unequip" data-item="${it.id}" data-key="m-un-${it.id}">해제</button></div>`
        : '<div class="slot-cur muted">비어 있음</div>';
      const list = cands.map((c) => {
        const owner = c.owner != null ? S.players.find((q) => q.id === c.owner) : null;
        return `<li>${gradeBadge(c.grade)}<span class="slot-txt">${itemLabel(c)} <span class="muted">+${TL.itemBonus(c).toFixed(2)}${owner ? ` · ${esc(owner.name)} 착용 중` : ''}</span></span><button type="button" class="btn btn-sm" data-act="equip" data-item="${c.id}" data-id="${p.id}" data-key="m-eq-${c.id}">장착</button></li>`;
      }).join('');
      return `<div class="slot"><h4>${TL.SLOTS[slot]}</h4>${cur}${list ? `<ul class="slot-list">${list}</ul>` : ''}</div>`;
    }).join('');

    const rv = TL.releaseValue(p);
    const releasing = isConfirming('release-p', p.id);
    const canRelease = S.players.length > TL.SQUAD_MIN;
    return `<div class="pm-head"><div class="pm-ovr ${grade(p.ovr)}">${Math.floor(p.ovr)}<small>OVR</small></div>` +
      `<div class="pm-id"><span class="pm-tags">${gradeBadge(p.grade)}${starsHTML(p.star)}<span class="pos-badge pos-${p.pos}">${p.pos}</span><span class="muted">#${p.num}</span>${xiIds.has(p.id) ? '<span class="tag tag-xi">선발</span>' : ''}</span>` +
      `<h2 id="modal-title">${esc(p.name)}</h2>` +
      `<p class="lead">기본 ${p.base.toFixed(1)} · 레벨 +${lvB.toFixed(1)} · 돌파 +${starB} · 장비 +${gear.toFixed(1)} · 통산 ${p.apps}경기 ${p.goals}골</p></div></div>` +
      `<section class="pm-sec"><h3>레벨 <span class="muted">Lv.${p.lv}/${cap}</span></h3>${xpBar(p)}<p class="hint">경험치 ${p.lv >= cap ? 'MAX' : `${Math.floor(p.xp)}/${TL.xpNeed(p.lv)}`} · 레벨당 OVR +${g.growth} (${g.name})</p>${lvHTML}</section>` +
      `<section class="pm-sec"><h3>돌파 ${starsHTML(p.star)}</h3>${starHTML}</section>` +
      `<section class="pm-sec"><h3>스킬</h3>${skillHTML}</section>` +
      `<section class="pm-sec"><h3>장비</h3><div class="slots">${gearHTML}</div></section>` +
      `<div class="modal-actions"><button type="button" class="btn btn-ghost" data-act="rest" data-id="${p.id}" data-key="m-rest">${p.rest ? '선발 후보로 복귀' : '휴식 지정'}</button>` +
      `<button type="button" class="btn ${releasing ? 'btn-confirm' : 'btn-ghost'}" data-act="release-p" data-id="${p.id}" data-key="m-release"${canRelease ? '' : ' disabled'}>${releasing ? `확인: 방출 (돌파석 +${rv.shards}${rv.money ? `, ${M(rv.money)}` : ''})` : '방출'}</button>` +
      `<button type="button" class="btn btn-primary" data-act="close" data-key="m-close">닫기</button></div>`;
  }

  /* ----- 스카우트 */

  function oddsBars(odds) {
    return `<div class="odds-list">${TL.GRADE_KEYS.filter((g) => odds[g] > 0).map((g) => `<div class="odds-row">${gradeBadge(g)}<span class="odds-bar"><i class="gb-${g}" style="width:${Math.max(1.5, Math.min(100, odds[g]))}%"></i></span><span class="odds-n">${odds[g] >= 10 ? odds[g].toFixed(0) : odds[g].toFixed(2).replace(/0$/, '')}%</span></div>`).join('')}</div>`;
  }

  function renderScout() {
    const g1 = TL.scoutPrice(S, 'gold', 1).money;
    const g10 = TL.scoutPrice(S, 'gold', 10).money;
    const full = S.players.length >= TL.SQUAD_MAX;
    const lv = Math.min(TL.levelCap(1), TL.TIERS[S.tier].recruitLv);
    let html = `<div class="scout-grid">` +
      `<section class="card banner banner-gold"><div class="sec-h"><div><h2>일반 스카우트</h2><p>구단 자금으로 선수를 찾습니다. 리그가 오를수록 비싸집니다</p></div></div>${oddsBars(TL.scoutOdds(S, 'gold'))}` +
      `<div class="btn-row"><button type="button" class="btn" data-act="scout" data-kind="gold" data-n="1" data-key="sc-g1"${S.money < g1 ? ' disabled' : ''}>1회 ${M(g1)}</button>` +
      `<button type="button" class="btn btn-primary" data-act="scout" data-kind="gold" data-n="10" data-key="sc-g10"${S.money < g10 ? ' disabled' : ''}>10회 ${M(g10)}</button></div>` +
      `<p class="hint">10회는 10% 할인, 희귀 이상 1명 보장</p></section>` +
      `<section class="card banner banner-premium"><div class="sec-h"><div><h2>프리미엄 스카우트</h2><p>티켓으로 높은 등급을 노립니다. 보유 티켓 ${N(S.mat.tickets)}장</p></div></div>${oddsBars(TL.scoutOdds(S, 'premium'))}` +
      `<div class="btn-row"><button type="button" class="btn" data-act="scout" data-kind="premium" data-n="1" data-key="sc-p1"${S.mat.tickets < 1 ? ' disabled' : ''}>1회 티켓 1장</button>` +
      `<button type="button" class="btn btn-primary" data-act="scout" data-kind="premium" data-n="10" data-key="sc-p10"${S.mat.tickets < 10 ? ' disabled' : ''}>10회 티켓 10장</button></div>` +
      `<p class="hint">10회는 영웅 이상 1명 보장. 티켓은 시즌 보상·업적·감독 레벨업으로 얻습니다</p></section></div>`;
    html += `<p class="hint">새 선수는 Lv.${lv}로 합류합니다(현재 리그 기준). 스쿼드 ${S.players.length}/${TL.SQUAD_MAX}${full ? ' · 가득 차서 새로 뽑는 선수는 돌파석으로 바뀝니다' : ''}. 스카우트 네트워크 시설을 키우면 고등급 확률이 오릅니다.</p>`;

    html += `<section class="card"><div class="sec-h"><h2>유스 아카데미</h2><p>시즌이 끝날 때마다 유망주가 올라옵니다. 계약하지 않으면 다음 시즌 종료 때 떠납니다</p></div>`;
    if (!S.youth.length) html += '<p class="hint">대기 중인 유망주가 없습니다. 첫 콜업은 시즌이 끝난 뒤입니다.</p>';
    else {
      html += '<div class="plist">';
      for (const y of S.youth.slice().sort((a, b) => TL.GRADE_KEYS.indexOf(b.grade) - TL.GRADE_KEYS.indexOf(a.grade))) {
        const confirming = isConfirming('release-y', y.id);
        const sk = TL.SKILLS[y.skill];
        html += `<div class="prow mk">` +
          `<span class="p-num"><span class="pos-badge pos-${y.pos}">${y.pos}</span></span>` +
          `<div class="p-main"><span class="p-name">${esc(y.name)}</span><span class="p-sub">${gradeBadge(y.grade)}<span class="tag tag-youth">유스</span></span></div>` +
          `<span class="p-ovr ${grade(y.ovr)}">${Math.floor(y.ovr)}</span>` +
          `<span class="p-stats"><span class="p-skill">${esc(sk.name)}</span><span class="muted">Lv.1</span>` +
          `<span class="muted">S${y.until}까지</span><span class="p-money muted">무료</span></span>` +
          `<span class="p-act"><button type="button" class="btn btn-sm btn-primary" data-act="promote" data-id="${y.id}" data-key="promote-${y.id}"${full ? ' disabled title="스쿼드가 가득 찼어요"' : ''}>1군 계약</button>` +
          `<button type="button" class="btn btn-sm ${confirming ? 'btn-confirm' : 'btn-ghost'}" data-act="release-y" data-id="${y.id}" data-key="ry-${y.id}">${confirming ? `확인: 방출 (돌파석 +${TL.GRADES[y.grade].shards})` : '방출'}</button></span></div>`;
      }
      html += '</div>';
    }
    html += '</section>';
    return html;
  }

  function scoutModal(r) {
    const best = r.results.reduce((b, x) => (TL.GRADE_KEYS.indexOf(x.player.grade) > TL.GRADE_KEYS.indexOf(b.player.grade) ? x : b), r.results[0]);
    const big = TL.GRADE_KEYS.indexOf(best.player.grade) >= 3;
    const cards = r.results.map((x, i) => {
      const p = x.player;
      const sk = TL.SKILLS[p.skill];
      return `<div class="pull pull-${p.grade}" style="--i:${i}"><span class="pull-grade">${gradeBadge(p.grade)}</span>` +
        `<b class="pull-ovr">${Math.floor(p.ovr)}</b><span class="pull-name">${esc(p.name)}</span>` +
        `<span class="pull-meta"><span class="pos-badge pos-${p.pos}">${p.pos}</span> ${esc(sk.name)}</span>` +
        (x.kept ? '' : `<span class="pull-conv">돌파석 +${x.shards}</span>`) + `</div>`;
    }).join('');
    openModal(() => `<h2 id="modal-title">${big ? `${TL.GRADES[best.player.grade].name} 등급 ${esc(best.player.name)} 영입!` : '스카우트 결과'}</h2>` +
      `<div class="pull-grid${r.results.length === 1 ? ' single' : ''}">${cards}</div>` +
      `<div class="modal-actions"><button type="button" class="btn" data-act="tab" data-tab="squad">선수단 보기</button><button type="button" class="btn btn-primary" data-act="close" data-autofocus>확인</button></div>`, 'scout', true);
  }

  /* ----- 장비 */

  function renderGear() {
    const xiIds = new Set(TL.lineup(S).xi.map((x) => x.id));
    const items = S.items.slice().sort((a, b) => (b.owner != null) - (a.owner != null) || TL.itemBonus(b) - TL.itemBonus(a));
    const players = S.players.slice().sort((a, b) => (xiIds.has(b.id) - xiIds.has(a.id)) || b.ovr - a.ovr);
    let html = `<section class="card"><div class="sec-h"><div><h2>장비 ${S.items.length}/${TL.INVENTORY_MAX}</h2><p>경기에서 이기면 장비가 떨어집니다(승 40%, 무 18%, 패 6%). 가방이 가득 차면 새 장비는 자동으로 분해됩니다</p></div>` +
      `<div class="btn-row"><button type="button" class="btn btn-primary" data-act="autoequip" data-key="autoequip">자동 장착</button>` +
      `<button type="button" class="btn" data-act="dismantle-below" data-g="N" data-key="dis-n">일반 일괄 분해</button>` +
      `<button type="button" class="btn" data-act="dismantle-below" data-g="R" data-key="dis-r">희귀 이하 일괄 분해</button></div></div>`;
    if (!items.length) {
      html += '<p class="hint">아직 장비가 없습니다. 경기에서 이기면 축구화와 보호구를 얻습니다.</p></section>';
      return html;
    }
    html += '<div class="item-grid">';
    for (const it of items) {
      const owner = it.owner != null ? S.players.find((q) => q.id === it.owner) : null;
      const max = it.plus >= TL.MAX_PLUS;
      const ec = max ? 0 : TL.enhanceCost(it);
      const dis = isConfirming('dismantle', it.id);
      const opts = ['<option value="">미장착</option>'].concat(players.map((p) => `<option value="${p.id}"${owner && owner.id === p.id ? ' selected' : ''}>${xiIds.has(p.id) ? '★ ' : ''}${esc(p.name)} (${p.pos} ${Math.floor(p.ovr)})</option>`)).join('');
      html += `<article class="item item-${it.grade}">` +
        `<header>${gradeBadge(it.grade)}<span class="muted">${TL.SLOTS[it.slot]}</span><b class="item-bonus">OVR +${TL.itemBonus(it).toFixed(2)}</b></header>` +
        `<h3>${itemLabel(it)}</h3>` +
        `<label class="sr-only" for="eq-${it.id}">${esc(it.name)} 장착 선수</label><select class="input select" id="eq-${it.id}" data-equip="${it.id}">${opts}</select>` +
        `<div class="btn-row"><button type="button" class="btn btn-sm btn-primary" data-act="enhance" data-item="${it.id}" data-key="en-${it.id}"${max || S.money < ec ? ' disabled' : ''}>${max ? '최대 강화' : `강화 +${it.plus + 1} ${M(ec)}`}</button>` +
        `<button type="button" class="btn btn-sm ${dis ? 'btn-confirm' : 'btn-ghost'}" data-act="dismantle" data-item="${it.id}" data-key="dis-${it.id}">${dis ? `확인 +${M(TL.dismantleValue(it))}` : '분해'}</button></div></article>`;
    }
    html += '</div></section>';
    return html;
  }

  /* ----- 감독 */

  function renderManager() {
    const g = S.mgr;
    const need = TL.mgrXpNeed(g.lv);
    const w = Math.min(100, Math.round(g.xp / need * 100));
    const spent = TL.TALENT_KEYS.reduce((n, k) => n + (g.tal[k] || 0), 0);
    const resetting = isConfirming('respec', 0);
    let html = `<section class="card mgr-card"><div class="mgr-head"><div class="mgr-badge"><small>LV</small>${g.lv}</div>` +
      `<div class="mgr-id"><h2>${esc(TL.mgrTitle(g.lv))}</h2><p class="hint">${esc(S.club.name)} 감독 · 특성 포인트 <b>${g.pts}</b></p>` +
      `<span class="xpbar"><i style="width:${w}%"></i></span><p class="hint">경험치 ${Math.floor(g.xp)}/${need}</p></div></div>` +
      `<p class="hint">경기 승리 40 · 무승부 20 · 패배 10 경험치(상위 리그일수록 더 많이), 시즌을 마치면 보너스를 받습니다. 레벨마다 특성 포인트 1개, 5레벨마다 프리미엄 티켓 1장.</p></section>`;
    html += `<section class="card"><div class="sec-h"><h2>특성</h2><p>투자 ${spent}포인트</p></div><div class="tal-grid">`;
    for (const k of TL.TALENT_KEYS) {
      const t = TL.TALENTS[k];
      const n = g.tal[k] || 0;
      const max = n >= t.max;
      const pips = Array.from({ length: t.max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
      html += `<article class="tal"><header><h3>${t.name}</h3><span class="lv">${n}/${t.max}</span></header>` +
        `<div class="pips" style="grid-template-columns:repeat(${t.max},1fr)" aria-hidden="true">${pips}</div>` +
        `<p class="fac-eff"><span>현재 <b>${n ? esc(t.desc(n)) : '효과 없음'}</b></span>${max ? '<span class="muted">최대</span>' : `<span class="muted">다음 ${esc(t.desc(n + 1))}</span>`}</p>` +
        `<button type="button" class="btn btn-primary btn-sm" data-act="talent" data-k="${k}" data-key="tal-${k}"${max || g.pts <= 0 ? ' disabled' : ''}>+1 투자</button></article>`;
    }
    html += `</div><div class="btn-row" style="margin-top:12px"><button type="button" class="btn ${resetting ? 'btn-confirm' : ''}" data-act="respec" data-key="respec"${spent ? '' : ' disabled'}>${resetting ? `확인: ${M(TL.respecCost(S))} 내고 초기화` : `특성 초기화 ${M(TL.respecCost(S))}`}</button></div></section>`;
    return html;
  }

  /* ----- 시설 */

  function renderFacilities() {
    let html = `<section class="card"><div class="sec-h"><h2>구단 시설</h2><p>공사는 즉시 끝납니다. 레벨은 최대 ${TL.FAC_MAX}</p></div><div class="fac-grid">`;
    const att = TL.expectedAttendance(S);
    for (const k of TL.FAC_KEYS) {
      const f = TL.FACILITIES[k];
      const lv = S.fac[k];
      const max = lv >= TL.FAC_MAX;
      const cost = max ? 0 : TL.facilityCost(k, lv);
      const short = !max && S.money < cost;
      const pips = Array.from({ length: TL.FAC_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      let alert = '';
      if (k === 'stadium' && att >= TL.stadiumCap(S)) alert = '<p class="fac-alert">관중석이 꽉 찹니다. 지금 넓히면 바로 수입이 늘어요</p>';
      html += `<article class="fac"><header><h3>${f.name}</h3><span class="lv">Lv.${lv}</span></header>` +
        `<div class="pips" aria-hidden="true">${pips}</div>` +
        `<p class="fac-eff"><span>현재 <b>${esc(TL.describeFacility(k, lv))}</b></span>${max ? '<span class="muted">최고 레벨입니다</span>' : `<span class="muted">다음 ${esc(TL.describeFacility(k, lv + 1))}</span>`}</p>` +
        `<p class="fac-blurb">${f.blurb}</p>${alert}` +
        (max ? '' : `<button type="button" class="btn btn-primary" data-act="upgrade" data-fac="${k}" data-key="up-${k}"${short ? ` disabled title="${M(cost - S.money)} 부족"` : ''}>Lv.${lv + 1} 공사 ${M(cost)}</button>`) +
        `</article>`;
    }
    html += '</div></section>';
    return html;
  }

  /* ----- 리그 */

  function renderLeague() {
    const tier = TL.TIERS[S.tier];
    const rows = TL.standings(S);
    const up = S.tier > 1, down = S.tier < 5;
    const fame = S.tier === 1 ? ` · 명성 Lv.${S.prestige || 0}` : '';
    let html = `<section class="card"><div class="sec-h"><h2>${tier.name} ${tier.label} · 시즌 ${S.season}${fame}</h2><div class="zone-key">` +
      (up ? '<span style="--c:var(--win)">1~2위 승격</span>' : '<span style="--c:var(--gold)">1위 우승 · 명성 +1</span>') +
      (down ? '<span style="--c:var(--loss)">7~8위 강등</span>' : '') + '</div></div>' +
      `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">#</th><th class="l">팀</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th><th class="l">최근</th></tr></thead><tbody>`;
    rows.forEach((r, i) => {
      const zone = up && i < 2 ? 'zone-up' : down && i >= 6 ? 'zone-down' : '';
      html += `<tr class="${r.me ? 'me' : ''}"><td class="l ${zone}">${i + 1}</td><td class="l"><span class="team-cell">${kitDot(r.kit)}${esc(r.name)}</span></td>` +
        `<td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td><b>${r.pts}</b></td><td class="l">${r.form.length ? formChips(r.form) : '<span class="muted">-</span>'}</td></tr>`;
    });
    html += '</tbody></table></div>';
    if (S.tier === 1) html += `<p class="hint" style="margin-top:10px">1부 리그에서 우승할 때마다 명성이 1 올라 상대 전력이 +2.5 강해지고 수입이 20%씩 늘어납니다.</p>`;
    html += '</section>';

    html += `<section class="card"><h2>우리 일정</h2><div class="sched">`;
    S.league.fixtures.forEach((round, i) => {
      const m = round.find((x) => x.h === 'me' || x.a === 'me');
      const home = m.h === 'me';
      const opp = TL.teamById(S, home ? m.a : m.h);
      let res = '<span class="muted">예정</span>';
      if (m.hg != null) {
        const gf = home ? m.hg : m.ag, ga = home ? m.ag : m.hg;
        const r = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
        res = `<span class="res">${gf}:${ga} ${formChips([r])}</span>`;
      }
      const next = i === S.round && S.phase !== 'offseason';
      html += `<div class="sched-row${next ? ' next' : ''}"><span class="r">R${i + 1}</span><span class="ha">${home ? '홈' : '원정'}</span><span class="o">${kitDot(opp.kit)} ${esc(opp.name)}</span>${res}</div>`;
    });
    html += '</div></section>';

    const lastIdx = S.round - 1;
    if (lastIdx >= 0) {
      html += `<section class="card"><h2>${lastIdx + 1}라운드 결과</h2><div class="sched">`;
      for (const m of S.league.fixtures[lastIdx]) {
        const h = TL.teamById(S, m.h), a = TL.teamById(S, m.a);
        html += `<div class="sched-row" style="grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)"><span class="o" style="text-align:right">${esc(h.name)}</span><b class="res">${m.hg}:${m.ag}</b><span class="o">${esc(a.name)}</span></div>`;
      }
      html += '</div></section>';
    }
    return html;
  }

  /* ----- 기록 */

  function renderRecords() {
    const st = S.stats;
    let html = `<section class="card"><h2>트로피 장식장</h2><div class="cabinet">`;
    for (const t of [5, 4, 3, 2, 1]) {
      const n = S.trophies[t] || 0;
      html += `<div class="trophy${n ? ' won' : ''}">${CUP}<b>${n}</b><span>${TL.TIERS[t].name} 우승</span></div>`;
    }
    html += '</div></section>';
    const played = st.w + st.d + st.l;
    const best = st.bestWin ? `${st.bestWin.gf}:${st.bestWin.ga} vs ${esc(st.bestWin.opp)} (S${st.bestWin.season})` : '-';
    html += `<section class="card"><h2>통산 기록</h2><dl class="stat-list">` +
      `<div><dt>경기</dt><dd>${played}</dd></div><div><dt>승 · 무 · 패</dt><dd>${st.w} · ${st.d} · ${st.l}</dd></div>` +
      `<div><dt>승률</dt><dd>${played ? pct(st.w / played) : '-'}</dd></div><div><dt>득점 · 실점</dt><dd>${st.gf} · ${st.ga}</dd></div>` +
      `<div><dt>승격</dt><dd>${st.promotions}회</dd></div><div><dt>최다 점수차 승리</dt><dd>${best}</dd></div>` +
      `<div><dt>최고 도달 리그</dt><dd>${TL.TIERS[S.bestTier].name}</dd></div><div><dt>명성</dt><dd>Lv.${S.prestige || 0}</dd></div>` +
      `<div><dt>스카우트</dt><dd>${N(st.scouted || 0)}회</dd></div><div><dt>스킬 발동</dt><dd>${N(st.skills || 0)}회</dd></div>` +
      `<div><dt>최고 등급 영입</dt><dd>${TL.GRADES[st.bestGrade || 'N'].name}</dd></div><div><dt>플레이 시간(게임)</dt><dd>${fmtDur(S.time)}</dd></div></dl></section>`;

    html += `<section class="card"><h2>시즌별 기록</h2>`;
    if (!S.history.length) html += '<p class="hint">첫 시즌이 끝나면 여기에 기록이 쌓입니다.</p>';
    else {
      html += `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">시즌</th><th class="l">리그</th><th>순위</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th><th class="l">득점왕</th><th class="l">결과</th></tr></thead><tbody>`;
      for (const h of S.history) {
        html += `<tr><td class="l">${h.season}</td><td class="l">${TL.TIERS[h.tier].name}</td><td><b>${h.pos}</b></td><td>${h.w}</td><td>${h.d}</td><td>${h.l}</td><td>${h.gf - h.ga > 0 ? '+' : ''}${h.gf - h.ga}</td><td>${h.pts}</td>` +
          `<td class="l">${h.top ? `${esc(h.top.name)} ${h.top.goals}골` : '-'}</td><td class="l">${esc(moveText(h))}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }
    html += '</section>';

    const done = TL.ACHIEVEMENTS.filter((a) => S.ach[a.id]).length;
    html += `<section class="card"><div class="sec-h"><h2>업적</h2><p>${done}/${TL.ACHIEVEMENTS.length} 달성</p></div><div class="ach-grid">`;
    for (const a of TL.ACHIEVEMENTS) {
      const got = S.ach[a.id];
      const rw = [];
      if (a.reward) rw.push(M(a.reward));
      if (a.tickets) rw.push(`티켓 ${a.tickets}`);
      html += `<div class="ach${got ? ' done' : ''}"><b>${a.name}</b><span>${a.desc}${rw.length ? ` · ${rw.join(', ')}` : ''}</span>${got ? `<span>시즌 ${got.season} 달성</span>` : ''}</div>`;
    }
    html += '</div></section>';
    return html;
  }

  /* ----- 설정 */

  function renderSettings() {
    const name = ui.draftName != null ? ui.draftName : S.club.name;
    const cs = Store.cloudState();
    const cloudTxt = cs === 'on' ? '계정에도 저장 중입니다. 다른 기기에서 열어도 이어서 할 수 있어요.' : cs === 'blocked' ? '계정 저장이 막혀 있어 이 브라우저에만 저장합니다.' : '이 브라우저에만 저장합니다. 다른 기기로 옮기려면 저장 코드를 쓰세요.';
    const resetting = isConfirming('reset', 0);
    let code = '';
    try { code = Store.encode(TL.serialize(S)); } catch (e) { code = ''; }
    return `<section class="card"><h2>구단 정보</h2><div class="set-grid">` +
      `<form class="form-row" id="rename-form"><label for="club-name">구단 이름</label><input class="input" id="club-name" maxlength="20" value="${esc(name)}" autocomplete="off"><button type="submit" class="btn">이름 바꾸기</button></form>` +
      `<div class="form-row"><span class="ctl-k">홈 유니폼</span><div class="swatches" role="group" aria-label="홈 유니폼 색">${swatches()}</div></div></div></section>` +
      `<section class="card"><h2>저장</h2><div class="set-grid"><p class="hint">5초마다 자동 저장합니다. ${cloudTxt}</p>` +
      `<div><label class="ctl-k" for="export-code">저장 코드 (복사해 두면 어디서든 불러올 수 있어요)</label><textarea class="code-box" id="export-code" readonly>${esc(code)}</textarea>` +
      `<div class="form-row"><button type="button" class="btn" data-act="copy" data-key="copy">저장 코드 복사</button></div></div>` +
      `<div><label class="ctl-k" for="import-code">저장 코드 불러오기</label><textarea class="code-box" id="import-code" placeholder="TLM1. 로 시작하는 코드를 붙여 넣으세요"></textarea>` +
      `<div class="form-row"><button type="button" class="btn" data-act="import" data-key="import">이 코드로 불러오기</button><span class="hint">지금 진행 중인 구단은 덮어씁니다</span></div></div></div></section>` +
      `<section class="card"><h2>새 게임</h2><p class="hint" style="margin-bottom:10px">지금 구단을 지우고 5부 리그부터 다시 시작합니다. 되돌릴 수 없어요.</p>` +
      `<button type="button" class="btn ${resetting ? 'btn-confirm' : ''}" data-act="reset" data-key="reset">${resetting ? '한 번 더 누르면 처음부터 시작합니다' : '새 게임 시작'}</button></section>`;
  }

  /* ---------------------------------------------------------------- 모달 */

  // render: HTML을 돌려주는 함수. 열려 있는 동안 상태가 바뀌면 다시 그린다(static이면 한 번만).
  function openModal(render, kind, isStatic) {
    const wrap = $('modal');
    if (!ui.modal) ui.modalReturn = document.activeElement;
    ui.modal = kind;
    ui.modalRender = render;
    ui.modalStatic = !!isStatic;
    wrap.innerHTML = `<div class="modal${kind === 'player' ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">${render()}</div>`;
    wrap.hidden = false;
    ui.modalRev = S.rev;
    ui.modalAt = Date.now();
    const first = wrap.querySelector('[data-autofocus]') || wrap.querySelector('button:not([disabled])');
    if (first) first.focus();
  }
  function refreshModal(force) {
    if (!ui.modal || ui.modalStatic || !ui.modalRender) return;
    const now = Date.now();
    if (!force && S.rev === ui.modalRev && now - ui.modalAt < 1500) return;
    const box = $('modal').querySelector('.modal');
    if (!box) return;
    const active = document.activeElement;
    const focusKey = active && box.contains(active) ? active.getAttribute('data-key') : null;
    const scroll = box.scrollTop;
    box.innerHTML = ui.modalRender();
    box.scrollTop = scroll;
    if (focusKey) {
      const el = box.querySelector(`[data-key="${focusKey}"]`);
      if (el) el.focus({ preventScroll: true });
    }
    ui.modalRev = S.rev;
    ui.modalAt = now;
  }
  function closeModal() {
    const wrap = $('modal');
    wrap.hidden = true;
    wrap.innerHTML = '';
    ui.modal = null;
    ui.modalRender = null;
    if (ui.modalReturn && document.contains(ui.modalReturn)) ui.modalReturn.focus({ preventScroll: true });
  }

  function seasonModal(sm) {
    const rows = sm.table.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${kitDot(r.kit)} ${esc(r.name)}</td><td class="muted">${r.w}승 ${r.d}무 ${r.l}패</td><td>${r.pts}</td></tr>`).join('');
    const money = [];
    money.push(`리그 상금 ${M(sm.prize)}`);
    if (sm.promoBonus) money.push(`승격 보너스 ${M(sm.promoBonus)}`);
    if (sm.objective) money.push(sm.objective.ok ? `구단주 목표(${esc(sm.objective.label)}) 달성 ${M(sm.objective.reward)}` : `구단주 목표(${esc(sm.objective.label)}) 실패`);
    const rw = sm.reward ? `시즌 보상: 티켓 ${sm.reward.tickets}장 · 돌파석 ${sm.reward.shards}개 · 스킬북 ${sm.reward.books}권` : '';
    const extra = [];
    if (sm.top) extra.push(`팀 득점왕 ${esc(sm.top.name)} ${sm.top.goals}골`);
    if (sm.youth) extra.push(`유스 유망주 ${sm.youth}명 콜업 대기`);
    const next = sm.champion && sm.tier === 1 ? `명성이 올라 다음 시즌 1부 리그 상대들이 더 강해집니다.`
      : sm.move < 0 ? `다음 시즌은 ${TL.TIERS[sm.tier - 1].name}에서 뜁니다.` : sm.move > 0 ? `다음 시즌은 ${TL.TIERS[sm.tier + 1].name}에서 다시 올라가야 합니다.` : `다음 시즌도 ${esc(sm.tierName)}입니다.`;
    openModal(() => `<h2 id="modal-title">시즌 ${sm.season} 종료</h2>` +
      `<div class="big-result"><span class="season-pos">${sm.pos}위</span><div><b>${esc(moveText(sm))}</b><p class="lead">${esc(sm.tierName)} · ${sm.w}승 ${sm.d}무 ${sm.l}패 · 득점 ${sm.gf} 실점 ${sm.ga} · 승점 ${sm.pts}</p></div></div>` +
      `<p class="lead">${money.join(' · ')}</p>` + (rw ? `<p class="lead"><b>${rw}</b></p>` : '') +
      (extra.length ? `<p class="lead">${extra.join(' · ')}</p>` : '') +
      `<table class="mini-table">${rows}</table><p class="lead">${next}</p>` +
      `<div class="modal-actions"><button type="button" class="btn" data-act="close">닫기</button><button type="button" class="btn btn-primary" data-act="skip" data-autofocus>새 시즌 시작</button></div>`, 'season', true);
  }

  function offlineModal(r) {
    const played = r.w + r.d + r.l;
    const parts = [];
    parts.push(`<p class="lead">자리를 비운 ${fmtDur(r.realSeconds)} 동안 구단이 ${fmtDur(r.gameSec)}만큼 움직였습니다${r.capped ? ' (최대 2시간까지만 인정)' : ''}.</p>`);
    parts.push(`<dl class="stat-list"><div><dt>경기</dt><dd>${played}경기 · ${r.w}승 ${r.d}무 ${r.l}패</dd></div><div><dt>자금</dt><dd class="pos">+${M(r.money)}</dd></div>` +
      `<div><dt>선수 레벨업</dt><dd>${r.levels}회</dd></div><div><dt>장비 획득</dt><dd>${r.items}개</dd></div>` +
      `<div><dt>티켓</dt><dd>+${r.tickets}</dd></div><div><dt>돌파석 · 스킬북</dt><dd>+${r.shards} · +${r.books}</dd></div></dl>`);
    for (const sm of r.seasons) parts.push(`<p class="lead">시즌 ${sm.season} ${esc(sm.tierName)} ${sm.pos}위 · ${esc(moveText(sm))}</p>`);
    if (r.held) parts.push('<p class="lead">시즌이 끝나 새 시즌 개막은 감독님을 기다리고 있습니다. 비시즌 동안 선수들을 키우고 스카우트를 돌려 두세요.</p>');
    if (r.achievements.length) parts.push(`<p class="lead">업적: ${r.achievements.map((a) => esc(a.name)).join(', ')}</p>`);
    ui.offlineSeason = r.seasons.length ? r.seasons[r.seasons.length - 1] : null;
    const more = ui.offlineSeason ? '<button type="button" class="btn" data-act="season-report">시즌 결과 보기</button>' : '';
    openModal(() => `<h2 id="modal-title">다시 오셨군요, 감독님</h2>${parts.join('')}<div class="modal-actions">${more}<button type="button" class="btn btn-primary" data-act="close" data-autofocus>계속하기</button></div>`, 'offline', true);
  }

  function fmtDur(sec) {
    sec = Math.round(sec);
    if (sec < 60) return `${sec}초`;
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m}분`;
    const h = Math.floor(m / 60);
    return `${h}시간${m % 60 ? ' ' + (m % 60) + '분' : ''}`;
  }

  /* ---------------------------------------------------------------- 이벤트 */

  function handleEvents(events, quiet) {
    for (const e of events) {
      if (quiet) continue;
      if (e.kind === 'goal') {
        ui.flash = { mine: e.mine, side: S.live ? (e.mine === S.live.home ? 'h' : 'a') : 'h', until: Date.now() + 1800 };
        if (e.mine) toast(`${e.minute}' 골! ${e.scorer}`, 'goal');
      } else if (e.kind === 'skill') {
        ui.skillFlash = { skill: e.skill, name: e.name, until: Date.now() + 1600 };
      } else if (e.kind === 'achievement') {
        const rw = [];
        if (e.reward) rw.push(M(e.reward));
        if (e.tickets) rw.push(`티켓 ${e.tickets}`);
        toast(`업적 달성: ${e.name}${rw.length ? ' +' + rw.join(', ') : ''}`, 'ach');
      } else if (e.kind === 'mgrLevel') {
        toast(`감독 레벨 ${e.lv}! 특성 포인트 +1`, 'ach');
      } else if (e.kind === 'loot' && !e.auto && TL.GRADE_KEYS.indexOf(e.item.grade) >= 2) {
        toast(`장비 획득: ${TL.GRADES[e.item.grade].name} ${e.item.name}`, 'ach');
      } else if (e.kind === 'injury') {
        toast(`${e.name} 부상 (${e.rounds}경기)`, 'err');
      } else if (e.kind === 'seasonEnd') {
        seasonModal(e.summary);
        save(true);
      }
    }
  }

  function mergeOffline(r) {
    if (!r) return;
    const o = ui.offline;
    if (!o) ui.offline = r;
    else {
      for (const k of ['realSeconds', 'gameSec', 'money', 'fans', 'w', 'd', 'l', 'gf', 'ga', 'levels', 'tickets', 'shards', 'books', 'items']) o[k] += r[k];
      o.capped = o.capped || r.capped;
      o.held = r.held;
      o.seasons = o.seasons.concat(r.seasons);
      o.achievements = o.achievements.concat(r.achievements);
    }
  }
  function flushOffline() {
    const r = ui.offline;
    if (!r || document.visibilityState === 'hidden') return;
    ui.offline = null;
    if (r.realSeconds >= 60 && (r.w + r.d + r.l > 0 || r.seasons.length || r.levels > 0)) offlineModal(r);
    S.rev++;
  }

  function result(r) {
    if (!r) return;
    toast(r.msg, r.ok ? '' : 'err');
    if (r.events) handleEvents(r.events, false);
  }

  function confirmThen(kind, id, fn) {
    if (isConfirming(kind, id)) {
      ui.confirm = null;
      fn();
    } else {
      ui.confirm = { kind, id: String(id), until: Date.now() + 4000 };
    }
    renderPanel();
    refreshModal(true);
  }

  function setTab(id) {
    if (!TABS.some((t) => t[0] === id)) return;
    ui.tab = id;
    ui.confirm = null;
    ui.draftName = null;
    try { localStorage.setItem(TAB_KEY, id); } catch (e) { /* 무시 */ }
    renderTabs();
    renderPanel();
  }

  function act(name, d) {
    const id = Number(d.id);
    const item = Number(d.item);
    switch (name) {
      case 'tab': setTab(d.tab); if (ui.modal) closeModal(); return;
      case 'pause': TL.setPaused(S, !S.paused); renderTop(); return;
      case 'speed': TL.setSpeed(S, Number(d.v)); renderTop(); return;
      case 'order': result(TL.issueOrder(S, d.k)); ui.orderKey = ''; ui.evCount = -1; break;
      case 'player': openPlayer(id); return;
      case 'lvup': result(TL.levelUp(S, id, Number(d.n) || 1)); break;
      case 'lvteam': result(TL.levelUpTeam(S)); break;
      case 'star': result(TL.starUp(S, id)); break;
      case 'skillup': result(TL.skillUp(S, id)); break;
      case 'release-p': confirmThen('release-p', id, () => { const r = TL.releasePlayer(S, id); result(r); if (r.ok) closeModal(); }); break;
      case 'release-y': confirmThen('release-y', id, () => result(TL.releaseYouth(S, id))); break;
      case 'promote': result(TL.promoteYouth(S, id)); break;
      case 'rest': result(TL.toggleRest(S, id)); break;
      case 'equip': result(TL.equipItem(S, item, id)); break;
      case 'unequip': result(TL.unequipItem(S, item)); break;
      case 'autoequip': result(TL.autoEquip(S)); break;
      case 'enhance': result(TL.enhanceItem(S, item)); break;
      case 'dismantle': confirmThen('dismantle', item, () => result(TL.dismantleItem(S, item))); break;
      case 'dismantle-below': result(TL.dismantleBelow(S, d.g)); break;
      case 'scout': {
        const r = TL.scout(S, d.kind, Number(d.n));
        if (!r.ok) { toast(r.msg, 'err'); return; }
        if (r.events) handleEvents(r.events, false);
        scoutModal(r);
        break;
      }
      case 'talent': result(TL.addTalent(S, d.k)); break;
      case 'respec': confirmThen('respec', 0, () => result(TL.resetTalents(S))); break;
      case 'upgrade': result(TL.upgradeFacility(S, d.fac)); break;
      case 'formation': TL.setFormation(S, d.f); break;
      case 'tactic': TL.setTactic(S, d.t); break;
      case 'kit': TL.setKit(S, d.kit); applyKit(); ui.sbKey = ''; break;
      case 'skip': TL.skipOffseason(S); if (ui.modal) closeModal(); break;
      case 'close': closeModal(); break;
      case 'season-report': if (ui.offlineSeason) seasonModal(ui.offlineSeason); return;
      case 'copy': copyExport(); return;
      case 'import': importCode(); return;
      case 'reset': confirmThen('reset', 0, newGame); return;
      default: return;
    }
    S.rev++;
    renderTop();
    renderPanel();
    refreshModal(true);
    save(false);
  }

  function copyExport() {
    const ta = $('export-code');
    if (!ta) return;
    const text = ta.value;
    const fallback = () => { ta.focus(); ta.select(); toast('코드를 선택해 두었어요. 직접 복사해 주세요'); };
    try {
      navigator.clipboard.writeText(text).then(() => toast('저장 코드를 복사했어요'), fallback);
    } catch (e) { fallback(); }
  }

  function importCode() {
    const ta = $('import-code');
    const code = ta ? ta.value : '';
    try {
      const st = TL.deserialize(Store.decode(code));
      st.lastSeen = Date.now();
      S = st;
      afterLoad();
      save(true);
      toast(`${S.club.name}을(를) 불러왔어요`);
    } catch (e) {
      toast(e && e.message ? e.message : '코드를 읽지 못했어요', 'err');
    }
  }

  function newGame() {
    Store.clearLocal();
    S = TL.newGame({});
    afterLoad();
    save(true);
    toast('새 구단을 창단했습니다');
  }

  function afterLoad() {
    applyKit();
    ui.crestKey = '';
    ui.sbKey = '';
    ui.orderKey = '';
    ui.phaseKey = '';
    ui.draftName = null;
    ui.confirm = null;
    if (ui.modal) closeModal();
    renderTop();
    renderTabs();
    renderPanel();
  }

  function onSubmit(e) {
    const form = e.target;
    if (form.id === 'welcome-form') {
      e.preventDefault();
      const r = TL.renameClub(S, $('welcome-name').value);
      if (!r.ok) { toast(r.msg, 'err'); return; }
      S.flags.welcome = false;
      ui.draftName = null;
      ui.crestKey = ''; ui.sbKey = '';
      S.rev++;
      toast(`${S.club.name}의 첫 시즌을 시작합니다`);
      renderTop(); renderPanel(); save(true);
    } else if (form.id === 'rename-form') {
      e.preventDefault();
      const r = TL.renameClub(S, $('club-name').value);
      toast(r.msg, r.ok ? '' : 'err');
      if (r.ok) { ui.draftName = null; ui.crestKey = ''; ui.sbKey = ''; renderTop(); renderPanel(); save(true); }
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.matches && t.matches('[data-equip]')) {
      const itemId = Number(t.getAttribute('data-equip'));
      const r = t.value === '' ? TL.unequipItem(S, itemId) : TL.equipItem(S, itemId, Number(t.value));
      result(r);
      t.blur();
      renderTop();
      renderPanel();
      save(false);
    }
  }

  /* ---------------------------------------------------------------- 저장·루프 */

  function save(force) {
    if (!S) return;
    const now = Date.now();
    ui.saveAt = now;
    S.lastSeen = now;
    const json = TL.serialize(S);
    const okLocal = Store.saveLocal(json);
    if (ui.cloudReady) Store.cloudSave(json, S.rev, force);
    const cs = Store.cloudState();
    $('save-state').textContent = cs === 'on' ? '계정에 저장' : okLocal ? '이 브라우저에 저장' : '저장소를 쓸 수 없어 이번 방문에만 유지';
  }

  function frame() {
    const now = Date.now();
    const dt = (now - ui.last) / 1000;
    ui.last = now;
    if (dt > 10) {
      mergeOffline(TL.applyOffline(S, dt));
    } else if (dt > 0) {
      handleEvents(TL.tick(S, dt), false);
    }
    if (ui.offline) flushOffline();
    renderTop();
    renderMatchday(now);
    maybeRenderPanel(now);
    refreshModal(false);
    if (now - ui.saveAt > 5000) save(false);
  }

  function measure() {
    const h = $('topbar').getBoundingClientRect().height;
    document.documentElement.style.setProperty('--tb-h', Math.round(h) + 'px');
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function setText(id, v) { const el = $(id); if (el && el.textContent !== String(v)) el.textContent = v; }
  function setHTML(id, v) { const el = $(id); if (el && el.innerHTML !== v) el.innerHTML = v; }

  function start(data) {
    document.documentElement.lang = 'ko';
    let state = null;
    let fromHot = false;
    if (data && typeof data.save === 'string') {
      try { state = TL.deserialize(data.save); fromHot = true; } catch (e) { state = null; }
    }
    let report = null;
    if (!state) {
      const raw = Store.loadLocal();
      if (raw) {
        try { state = TL.deserialize(raw); } catch (e) { state = null; }
      }
      if (state) {
        ui.bootSeen = state.lastSeen || 0;
        report = TL.applyOffline(state, (Date.now() - (state.lastSeen || Date.now())) / 1000);
      }
    }
    if (!state) state = TL.newGame({});
    if (fromHot) ui.bootSeen = state.lastSeen || 0;
    S = state;
    S.lastSeen = Date.now();

    try { const t = localStorage.getItem(TAB_KEY); if (t && TABS.some((x) => x[0] === t)) ui.tab = t; } catch (e) { /* 무시 */ }
    const hashTab = (location.hash || '').slice(1);
    if (TABS.some((x) => x[0] === hashTab)) ui.tab = hashTab;

    applyKit();
    buildMatchday();
    renderTop();
    renderTabs();
    renderPanel();
    measure();
    if (report) { mergeOffline(report); flushOffline(); }

    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      act(b.dataset.act, b.dataset);
    });
    document.addEventListener('submit', onSubmit);
    document.addEventListener('change', onChange);
    document.addEventListener('input', (e) => {
      if (e.target.id === 'welcome-name' || e.target.id === 'club-name') ui.draftName = e.target.value;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ui.modal) closeModal();
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target.classList && e.target.classList.contains('tab')) {
        const i = TABS.findIndex((t) => t[0] === ui.tab);
        const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
        setTab(n);
        const el = $('tab-' + n);
        if (el) el.focus();
      }
    });
    $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save(true);
      else { frame(); }
    });
    window.addEventListener('pagehide', () => save(true));
    window.addEventListener('resize', measure);

    try {
      if (window.claude && window.claude.hot && typeof window.claude.hot.snapshot === 'function') {
        window.claude.hot.snapshot(() => ({ save: S ? TL.serialize(S) : null }));
      }
    } catch (e) { /* 무시 */ }

    ui.last = Date.now();
    ui.timer = setInterval(frame, 250);
    save(false);

    // 계정 저장본이 더 최신이면 그쪽으로 이어 한다
    Store.initCloud().then(async (on) => {
      if (!on) return;
      const remote = await Store.cloudLoad();
      ui.cloudReady = true;
      if (remote && remote.savedAt > ui.bootSeen + 3000) {
        try {
          const st = TL.deserialize(remote.json);
          const rep = TL.applyOffline(st, (Date.now() - remote.savedAt) / 1000);
          st.lastSeen = Date.now();
          S = st;
          afterLoad();
          toast('계정에 저장된 진행 상황을 불러왔어요');
          if (rep) { mergeOffline(rep); flushOffline(); }
        } catch (e) { /* 손상된 원격 저장본은 무시 */ }
      }
      save(true);
    });
  }

  function boot() {
    const hot = window.claude && window.claude.hot;
    if (hot && typeof hot.ready === 'function') hot.ready((d) => start(d || {}));
    else start((hot && hot.data) || {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
