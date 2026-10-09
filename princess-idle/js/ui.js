/*
 * 방치형 공주 키우기 — 화면
 * 엔진 상태를 그리고, 실시간으로 하루를 흘려보내며, 저장·오프라인 진행을 맡는다.
 */
(function () {
  'use strict';

  const D = window.PrincessData;
  const E = window.PrincessEngine;
  const P = window.PrincessPortrait;

  const SAVE_KEY = 'princess-idle:save:v1';
  const UI_KEY = 'princess-idle:ui:v1';
  const TABS = ['schedule', 'stats', 'shop', 'legacy', 'endings', 'log'];
  const STAT_NAME = Object.fromEntries(D.STATS.map((s) => [s.id, s.name]));
  const POINT_DEFS = D.POINT_STATS.map((id) => D.STATS.find((s) => s.id === id));
  const TOAST_KINDS = new Set(['birthday', 'festival', 'sick', 'legend', 'danger', 'treasure', 'event', 'level', 'shop']);
  const MOOD_NAME = { happy: '최고예요', calm: '평온해요', tired: '지쳤어요', exhausted: '한계예요', rest: '쉬는 중', sick: '아파요' };

  let state = null;
  let acc = 0;
  let lastTick = Date.now();
  let lastSave = 0;
  let lastPanelAt = 0;
  let lastPanelDay = -1;
  let forcePanel = true;
  let portraitKey = '';
  let logStamp = '';
  let endingsStamp = '';
  let statFloors = {};
  let bubble = { key: '', until: 0 };
  let lastPoints = 0;
  const ui = { tab: 'schedule', slot: 0, filter: 'all' };
  const refs = {};
  const modalQueue = [];
  let modal = null; // { locked: bool }

  // ── 작은 도우미 ───────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children !== undefined) {
      for (const c of [].concat(children)) {
        if (c === null || c === undefined || c === false) continue;
        node.append(c.nodeType ? c : document.createTextNode(String(c)));
      }
    }
    return node;
  }
  // 빈 값(null 등)은 건너뛰고 붙인다
  function put(parent, ...nodes) {
    parent.append(...nodes.filter((n) => n !== null && n !== undefined && n !== false));
  }
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
  function setHTML(node, html) { if (node._html !== html) { node._html = html; node.innerHTML = html; } }
  function setWidth(node, frac) {
    const w = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + '%';
    if (node.style.width !== w) node.style.width = w;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  const nf = new Intl.NumberFormat('ko-KR');
  function int(n) { return nf.format(Math.floor(n)); }
  function signed(v, digits) {
    const p = Math.pow(10, digits === undefined ? 1 : digits);
    const r = Math.round(v * p) / p;
    if (r === 0) return '±0';
    return (r > 0 ? '+' : '−') + nf.format(Math.abs(r));
  }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function dateLabel(totalDays) {
    const c = E.calendar(totalDays);
    return '왕국력 ' + c.year + '년 ' + c.month + '월 ' + c.day + '일';
  }
  function shortDate(totalDays) {
    const c = E.calendar(totalDays);
    return c.year + '.' + c.month + '.' + c.day;
  }
  function duration(ms) {
    const m = Math.floor(ms / 60000);
    const h = Math.floor(m / 60);
    if (h) return h + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '');
    if (m) return m + '분';
    return Math.max(1, Math.floor(ms / 1000)) + '초';
  }

  // ── 저장 ─────────────────────────────────────────────
  function save() {
    if (!state || !state.run) return;
    state.lastSeen = Date.now();
    lastSave = state.lastSeen;
    try { localStorage.setItem(SAVE_KEY, E.serialize(state)); } catch (e) { /* 저장소를 쓸 수 없는 환경 */ }
  }
  function loadSaved() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? E.deserialize(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function saveUi() {
    try { localStorage.setItem(UI_KEY, JSON.stringify({ tab: ui.tab, filter: ui.filter })); } catch (e) { /* 무시 */ }
  }
  function loadUi() {
    try {
      const raw = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
      if (TABS.includes(raw.tab)) ui.tab = raw.tab;
      if (raw.filter) ui.filter = raw.filter;
    } catch (e) { /* 무시 */ }
    const hash = (location.hash || '').slice(1);
    if (TABS.includes(hash)) ui.tab = hash;
  }
  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromBase64(b64) {
    const bin = atob(b64.trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // ── 상태 해석 ─────────────────────────────────────────
  function moodOf(run) {
    const cur = run.current || {};
    if (run.ended) return 'happy';
    if (cur.id === 'sick') return 'sick';
    if ((cur.id === 'rest' || cur.id === 'vacation') && cur.reason !== 'start') return 'rest';
    if (run.stress >= 85) return 'exhausted';
    if (run.stress >= 60) return 'tired';
    if (run.stress < 30) return 'happy';
    return 'calm';
  }
  function dressColor(run) {
    const sum = {};
    const cnt = {};
    for (const s of D.STATS) {
      sum[s.group] = (sum[s.group] || 0) + run.stats[s.id];
      cnt[s.group] = (cnt[s.group] || 0) + 1;
    }
    let best = 'grace';
    let bestV = -1;
    for (const g in sum) {
      const v = sum[g] / cnt[g];
      if (v > bestV) { bestV = v; best = g; }
    }
    return D.GROUP_DRESS[best];
  }
  function doingInfo(run) {
    const cur = run.current || { id: 'rest', reason: 'start' };
    const cal = E.calendar(run.totalDays);
    if (run.ended) return { glyph: '冠', cat: 'rest', name: '성인식', sub: '새로운 길이 열렸어요' };
    if (cur.id === 'sick') return { glyph: '병', cat: 'sick', name: '몸져누움', sub: run.sick + '일 더 쉬어야 해요' };
    if (cur.reason === 'auto') {
      return { glyph: '쉼', cat: 'rest', name: '자동 휴식', sub: '스트레스 ' + state.meta.autoRest.until + ' 이하가 되면 일정으로 돌아가요' };
    }
    if (cur.reason === 'nogold' || cur.reason === 'locked') {
      const planned = E.ACT[cur.planned];
      return {
        glyph: '집', cat: 'job', name: '집안일',
        sub: (planned ? planned.name : '일정') + (cur.reason === 'nogold' ? ' 수업료가 모자라요' : ' 조건이 맞지 않아요'),
      };
    }
    const id = cur.reason === 'start' ? run.schedule[cal.slot] : cur.id;
    const act = E.ACT[id];
    const m = E.masteryInfo(state, id);
    return {
      glyph: act.glyph, cat: act.cat, name: act.name + (act.cat === 'rest' ? '' : ' 중'),
      sub: (act.cat === 'rest' ? '' : 'Lv.' + m.level + ' · ') + D.SLOT_NAMES[cal.slot] + ' 일정',
    };
  }

  // ── 효과 문구 ─────────────────────────────────────────
  function effectText(type, v, extra) {
    switch (type) {
      case 'stat': return extra.map((s) => STAT_NAME[s]).join('·') + ' 성장 +' + pct(v);
      case 'stat_all': return '모든 능력치 성장 +' + pct(v);
      case 'income': return '수입 +' + pct(v);
      case 'fee': return '수업료·여행비 −' + pct(v);
      case 'rest': return '휴식 회복 +' + pct(v);
      case 'calm': return '스트레스 증가 −' + pct(v);
      case 'power': return '전투력 +' + pct(v);
      case 'start_stats': return '시작 능력치 +' + v;
      case 'start_gold': return '시작 골드 +' + int(v) + 'G';
      case 'xp': return '숙련도 경험치 +' + pct(v);
      case 'speed': return '게임 속도 ×' + (1 + v).toFixed(2).replace(/0$/, '');
      case 'offline': return '오프라인 최대 ' + (D.BASE_OFFLINE_HOURS + v) + '시간';
      default: return '';
    }
  }
  function wareEffect(item, lvl) {
    const e = item.effect;
    const now = effectText(e.type, e.per * lvl, e.stats);
    if (lvl >= item.max) return now;
    return now + ' → ' + effectText(e.type, e.per * (lvl + 1), e.stats).replace(/^.*?([+−×]|최대 |\+)/, '$1');
  }

  function fxHTML(pv, act) {
    const parts = [];
    for (const id in pv.gains) {
      const v = pv.gains[id] * D.SLOT_DAYS;
      parts.push('<span class="' + (v >= 0 ? 'plus' : 'minus') + '">' + STAT_NAME[id] + ' ' + signed(v) + '</span>');
    }
    if (act.fame) parts.push('<span class="plus">명성 ' + signed(act.fame * D.SLOT_DAYS, 1) + '</span>');
    return parts.join(' · ');
  }
  function metaHTML(pv, act) {
    const out = [];
    const g = pv.gold * D.SLOT_DAYS;
    if (act.loot) out.push('<span class="goldtext">전리품 약 ' + int(g) + 'G</span>');
    else if (g < 0) out.push('<span>비용 <b class="goldtext">' + int(-g) + 'G</b></span>');
    else if (g > 0) out.push('<span class="goldtext">+' + int(g) + 'G</span>');
    else out.push('<span>무료</span>');
    const s = pv.stress * D.SLOT_DAYS;
    out.push('<span class="' + (s > 0 ? 'minus' : 'plus') + '">스트레스 ' + signed(s, 0) + '</span>');
    if (pv.winChance !== undefined) out.push('<span>승률 ' + pct(pv.winChance) + '</span>');
    return out.join('');
  }

  // ── 알림·모달 ─────────────────────────────────────────
  function toast(text, kind) {
    if (document.visibilityState === 'hidden') return;
    const t = el('div', { class: 'toast k-' + kind, text });
    refs.toasts.append(t);
    while (refs.toasts.children.length > 3) refs.toasts.firstChild.remove();
    const life = kind === 'festival' || kind === 'legend' ? 6500 : 3800;
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 450);
    }, life);
  }

  function queueModal(build, opts) {
    modalQueue.push({ build, opts: opts || {} });
    if (!modal) nextModal();
  }
  function nextModal() {
    const item = modalQueue.shift();
    if (!item) {
      modal = null;
      refs.scrim.hidden = true;
      lastTick = Date.now();
      return;
    }
    modal = item.opts;
    refs.modal.textContent = '';
    item.build(refs.modal);
    refs.scrim.hidden = false;
    const focusTarget = refs.modal.querySelector('input, .btn-primary, button');
    if (focusTarget) setTimeout(() => focusTarget.focus(), 30);
  }
  function closeModal() { nextModal(); }

  function nameField(id, value) {
    const input = el('input', { id, type: 'text', maxlength: '12', value, autocomplete: 'off' });
    const reroll = el('button', {
      type: 'button', class: 'btn', text: '다른 이름',
      onclick: () => {
        const pool = D.NAMES.filter((n) => n !== input.value);
        input.value = pool[Math.floor(Math.random() * pool.length)];
      },
    });
    return { input, node: el('div', { class: 'field' }, [el('label', { for: id, text: '공주의 이름' }), el('div', { class: 'name-row' }, [input, reroll])]) };
  }

  // 시작 보너스: 포인트를 능력치에 직접 나눠 준다
  function pointPicker(onChange) {
    const run = state.run;
    const total = run.bonusPoints;
    const alloc = {};
    const rows = {};
    const left = el('b', { class: 'num' });
    const used = () => Object.values(alloc).reduce((a, b) => a + b, 0);
    const refresh = () => {
      const remain = total - used();
      setText(left, String(remain));
      for (const s of POINT_DEFS) {
        const r = rows[s.id];
        const n = alloc[s.id] || 0;
        setText(r.val, int(run.stats[s.id] + n * D.POINT_VALUE));
        setText(r.add, n ? '+' + n * D.POINT_VALUE : '');
        r.row.classList.toggle('picked', n > 0);
        r.minus.disabled = n === 0;
        r.plus.disabled = remain === 0 || run.stats[s.id] + (n + 1) * D.POINT_VALUE > D.STAT_MAX;
      }
      onChange(remain);
    };
    const grid = el('div', { class: 'alloc-grid' });
    for (const s of POINT_DEFS) {
      const val = el('span', { class: 'alloc-val num' });
      const add = el('span', { class: 'alloc-add' });
      const minus = el('button', {
        type: 'button', class: 'step', text: '−', 'aria-label': s.name + ' 포인트 빼기',
        onclick: () => { if (alloc[s.id]) { alloc[s.id] -= 1; refresh(); } },
      });
      const plus = el('button', {
        type: 'button', class: 'step', text: '+', 'aria-label': s.name + ' 포인트 더하기',
        onclick: () => { if (used() < total) { alloc[s.id] = (alloc[s.id] || 0) + 1; refresh(); } },
      });
      const row = el('div', { class: 'alloc-row' }, [el('span', { class: 'alloc-name', text: s.name }), val, add, minus, plus]);
      rows[s.id] = { row, val, add, minus, plus };
      grid.append(row);
    }
    const node = el('fieldset', { class: 'alloc' }, [
      el('legend', { text: '시작 보너스' }),
      el('p', { class: 'alloc-head' }, [
        el('span', { text: '포인트를 원하는 능력치에 나눠 주세요. 1포인트 = 능력치 +' + D.POINT_VALUE + '.' }),
        el('span', { class: 'alloc-left' }, ['남은 포인트 ', left]),
      ]),
      grid,
    ]);
    refresh();
    return { node, alloc, remaining: () => total - used() };
  }

  function introModal(m) {
    const run = state.run;
    const gen = state.meta.generation;
    const name = nameField('intro-name', run.name);
    const hint = el('p', { class: 'hint', 'aria-live': 'polite' });
    const startBtn = el('button', { type: 'button', class: 'btn btn-primary', text: '키우기 시작' });
    const picker = run.bonusPoints > 0 ? pointPicker((remain) => {
      startBtn.disabled = remain > 0;
      setText(hint, remain > 0 ? '포인트 ' + remain + '개를 더 나눠 주세요.' : '');
    }) : null;
    const start = () => {
      if (picker && picker.remaining() > 0) return;
      E.renameRun(state, name.input.value);
      if (picker) E.spendStartPoints(state, picker.alloc);
      buildAll();
      save();
      closeModal();
      if (gen > 1) toast(E.fill('{N이} 성에 들어왔어요. ' + gen + '대 공주의 시작이에요.', state.run.name), 'birthday');
    };
    startBtn.addEventListener('click', start);
    name.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
    put(m,
      el('p', { class: 'eyebrow', text: gen > 1 ? gen + '대 공주 · 왕국력 ' + D.START_YEAR + '년 봄' : '왕국력 ' + D.START_YEAR + '년 봄' }),
      el('h2', { id: 'modal-title', text: gen > 1 ? '새 공주가 성에 들어왔어요' : '공주를 맡게 되었어요' }),
      gen > 1
        ? el('p', { class: 'lede', text: '선대 공주들의 유산을 이어받은 새 공주예요. 이름을 지어 주고 시작 보너스를 나눠 주세요.' })
        : el('p', { class: 'lede', text: '열 살 공주가 성인식을 치르는 열여덟 살까지, 8년을 함께 보내요. 한 달을 상순·중순·하순으로 나눠 일정을 짜 두면 공주가 알아서 배우고, 일하고, 쉬어요.' }),
      gen > 1 ? null : el('p', { class: 'lede', text: '창을 닫아도 시간은 흘러요(처음엔 최대 1시간). 성인식 날 능력치에 따라 공주의 앞날이 정해지고, 받은 왕관 별로 다음 세대를 더 강하게 키울 수 있어요.' }),
      name.node,
      picker ? picker.node : null,
      el('div', { class: 'modal-actions' }, [hint, startBtn]),
    );
  }

  function topStats(run, n) {
    return D.STATS.slice().sort((a, b) => run.stats[b.id] - run.stats[a.id]).slice(0, n);
  }

  function endingModal(m) {
    const run = state.run;
    const ending = E.END[run.ended.ending];
    const tier = D.TIERS[ending.tier];
    const stars = run.ended.stars;
    const next = () => {
      const pool = D.NAMES.filter((n) => n !== run.name);
      E.startNextGeneration(state, pool[Math.floor(Math.random() * pool.length)]);
      acc = 0;
      buildAll();
      save();
      closeModal();
      queueModal(introModal, { locked: true });
    };
    put(m,
      el('p', { class: 'eyebrow', text: '성인식 · ' + dateLabel(run.totalDays) }),
      el('h2', { id: 'modal-title', text: E.fill('{N}의 열여덟 번째 생일', run.name) }),
      el('div', { class: 'ending-card tier-' + ending.tier }, [
        el('span', { class: 'tier tier-' + ending.tier, text: ending.tier + ' · ' + tier.name }),
        el('h3', { text: ending.name }),
        el('p', { text: ending.text }),
        stars.first ? el('p', { class: 'new-badge', text: '새 엔딩 발견' }) : null,
        el('div', { class: 'top-stats' }, topStats(run, 4).map((s) => el('span', { text: s.name + ' ' + int(run.stats[s.id]) }))),
      ]),
      el('ul', { class: 'ledger', 'aria-label': '받은 왕관 별' }, stars.parts.map((p) =>
        el('li', null, [el('span', { text: p.label }), el('span', { class: 'num', text: '★ ' + p.stars })]),
      ).concat(el('li', { class: 'total' }, [el('span', { text: '합계' }), el('span', { class: 'num', text: '★ ' + stars.total })]))),
      run.ended.gems ? el('p', { class: 'lede', text: '보석 ' + run.ended.gems + '개도 받았어요. 보석은 다음 세대에도 그대로 남아요.' }) : null,
      el('p', { class: 'lede', text: '왕관 별은 유산 탭에서 다음 세대를 위한 축복으로 바꿀 수 있어요.' }),
      el('div', { class: 'modal-actions' }, [el('button', { type: 'button', class: 'btn btn-primary', text: '다음 세대 키우기', onclick: next })]),
    );
  }

  function reportModal(rep, awayMs, capped, autoSpent) {
    return (m) => {
      const run = state.run;
      const spentText = autoSpent ? Object.keys(autoSpent).map((id) => STAT_NAME[id] + ' +' + autoSpent[id] * D.POINT_GAIN).join(', ') : '';
      const rows = D.STATS.filter((s) => Math.abs(rep.statDiff[s.id]) >= 0.5)
        .map((s) => el('span', null, [s.name, el('b', { class: rep.statDiff[s.id] > 0 ? 'plus' : 'minus', text: signed(rep.statDiff[s.id], 0) })]));
      rows.push(el('span', null, ['골드', el('b', { class: 'goldtext', text: signed(rep.goldDiff, 0) })]));
      if (rep.fameDiff >= 0.5) rows.push(el('span', null, ['명성', el('b', { class: 'plus', text: signed(rep.fameDiff, 0) })]));
      const notes = rep.highlights.slice(-14).reverse();
      put(m,
        el('p', { class: 'eyebrow', text: '다녀오셨어요' }),
        el('h2', { id: 'modal-title', text: E.fill('{N이} ' + rep.days + '일을 보냈어요', run.name) }),
        el('p', { class: 'lede', text: '자리를 비운 ' + duration(awayMs) + ' 동안의 기록이에요.' + (capped ? ' 오프라인 진행은 최대 ' + duration(E.offlineCapMs(state)) + '까지만 흘러요.' : '') }),
        el('div', { class: 'report-grid' }, rows),
        spentText ? el('p', { class: 'lede', text: '자동 선택으로 성장 포인트를 썼어요: ' + spentText }) : null,
        run.points > 0 ? el('p', { class: 'lede', text: '쌓인 성장 포인트 ' + run.points + '개가 기다리고 있어요. 공주 화면에서 올릴 능력치를 골라 주세요.' }) : null,
        notes.length ? el('ul', { class: 'report-list' }, notes.map((n) => el('li', { text: shortDate(n.day) + ' ' + n.text }))) : null,
        el('div', { class: 'modal-actions' }, [el('button', { type: 'button', class: 'btn btn-primary', text: '확인', onclick: closeModal })]),
      );
    };
  }

  // 보상형 광고 자리. 실제 광고 SDK를 붙일 때는 이 함수의 재생 부분만 바꾸면 된다.
  function adModal(m) {
    let left = D.AD_WATCH_SECONDS;
    const count = el('b', { class: 'num', text: String(left) });
    const status = el('p', { class: 'ad-status', 'aria-live': 'polite' }, [count, '초 뒤에 보상을 받을 수 있어요']);
    const claim = el('button', { type: 'button', class: 'btn btn-primary', text: '보상 받기', disabled: true });
    const timer = setInterval(() => {
      if (!claim.isConnected) { clearInterval(timer); return; }
      left -= 1;
      if (left > 0) { setText(count, String(left)); return; }
      clearInterval(timer);
      claim.disabled = false;
      status.textContent = '광고가 끝났어요. 보상을 받으세요.';
    }, 1000);
    claim.addEventListener('click', () => {
      clearInterval(timer);
      E.grantAdReward(state);
      save();
      closeModal();
      toast('자동 선택 ' + D.AD_AUTO_SECONDS / 60 + '분이 추가됐어요.', 'event');
    });
    put(m,
      el('p', { class: 'eyebrow', text: '광고 보고 자동 받기' }),
      el('h2', { id: 'modal-title', text: '광고를 보면 ' + D.AD_AUTO_SECONDS / 60 + '분 동안 포인트를 자동으로 올려요' }),
      el('div', { class: 'ad-slot' }, [
        el('span', { class: 'ad-label', text: 'AD' }),
        el('p', { text: '광고 자리' }),
        el('small', { text: '광고 SDK를 연결하면 여기에서 보상형 광고가 재생돼요.' }),
      ]),
      status,
      el('div', { class: 'modal-actions' }, [
        el('button', { type: 'button', class: 'btn', text: '그만 보기', onclick: () => { clearInterval(timer); closeModal(); } }),
        claim,
      ]),
    );
  }

  function settingsModal(m) {
    let armed = false;
    const exportBox = el('textarea', { id: 'export-box', readonly: true, rows: '3', 'aria-label': '저장 데이터' });
    exportBox.value = toBase64(E.serialize(state));
    const importBox = el('textarea', { id: 'import-box', rows: '3', placeholder: '다른 기기에서 복사한 저장 데이터를 붙여 넣으세요', 'aria-label': '불러올 저장 데이터' });
    const status = el('p', { class: 'hint', 'aria-live': 'polite' });
    const copyBtn = el('button', {
      type: 'button', class: 'btn', text: '복사',
      onclick: () => {
        const done = () => setText(status, '저장 데이터를 복사했어요.');
        try {
          navigator.clipboard.writeText(exportBox.value).then(done, () => { exportBox.select(); setText(status, '자동 복사가 막혀 있어요. 선택된 글자를 직접 복사하세요.'); });
        } catch (e) {
          exportBox.select();
          setText(status, '자동 복사가 막혀 있어요. 선택된 글자를 직접 복사하세요.');
        }
      },
    });
    const importBtn = el('button', {
      type: 'button', class: 'btn', text: '불러오기',
      onclick: () => {
        try {
          const loaded = E.deserialize(fromBase64(importBox.value));
          if (!loaded.run) throw new Error('empty');
          state = loaded;
          acc = 0;
          buildAll();
          save();
          closeModal();
          toast('저장 데이터를 불러왔어요.', 'event');
          if (needsIntroFor(state.run)) queueModal(introModal, { locked: true });
          if (state.run.ended) queueModal(endingModal, { locked: true });
        } catch (e) {
          setText(status, '불러올 수 없는 데이터예요. 복사한 글자 전체를 붙여 넣었는지 확인하세요.');
        }
      },
    });
    const resetBtn = el('button', {
      type: 'button', class: 'btn btn-danger', text: '모든 기록 지우기',
      onclick: () => {
        if (!armed) {
          armed = true;
          setText(resetBtn, '정말 지울까요? 한 번 더 누르세요');
          return;
        }
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
        state = E.createState();
        E.newRun(state, '');
        acc = 0;
        buildAll();
        closeModal();
        queueModal(introModal, { locked: true });
      },
    });
    put(m,
      el('h2', { id: 'modal-title', text: '설정' }),
      el('p', { class: 'lede', text: '진행 상황은 이 브라우저에 자동으로 저장돼요. 다른 기기로 옮기려면 아래 저장 데이터를 복사해 붙여 넣으세요.' }),
      el('div', { class: 'field' }, [el('label', { for: 'export-box', text: '내 저장 데이터' }), exportBox, el('div', { class: 'modal-actions' }, [copyBtn])]),
      el('div', { class: 'field' }, [el('label', { for: 'import-box', text: '저장 데이터 불러오기' }), importBox, el('div', { class: 'modal-actions' }, [importBtn])]),
      status,
      el('div', { class: 'modal-actions' }, [resetBtn, el('button', { type: 'button', class: 'btn btn-primary', text: '닫기', onclick: closeModal })]),
    );
  }

  // ── 화면 구성 ─────────────────────────────────────────
  function cacheRefs() {
    for (const id of ['hud-gold', 'hud-fame', 'hud-stars', 'hud-gems', 'pt-count', 'auto-badge', 'pt-grid', 'auto-target',
      'auto-buy', 'points-hint', 'pt-next-gauge', 'pt-next-bar', 'pt-next-text', 'hud-speed', 'btn-pause', 'btn-settings', 'window', 'portrait', 'bubble',
      'floaters', 'pr-gen', 'pr-name', 'pr-age', 'pr-date', 'month-track', 'doing-seal', 'doing-name', 'doing-sub',
      'stress-val', 'stress-bar', 'mood', 'countdown', 'toasts', 'scrim', 'modal']) {
      refs[id.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = document.getElementById(id);
    }
    refs.tabs = {};
    refs.panels = {};
    for (const t of TABS) {
      refs.tabs[t] = document.getElementById('tab-' + t);
      refs.panels[t] = document.getElementById('panel-' + t);
    }
  }

  function bindStatic() {
    for (const t of TABS) refs.tabs[t].addEventListener('click', () => selectTab(t));
    document.querySelector('.tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = TABS.indexOf(ui.tab) + (e.key === 'ArrowRight' ? 1 : -1);
      const t = TABS[(i + TABS.length) % TABS.length];
      selectTab(t);
      refs.tabs[t].focus();
    });
    refs.btnPause.addEventListener('click', () => {
      state.paused = !state.paused;
      lastTick = Date.now();
      save();
      renderHud();
    });
    refs.btnSettings.addEventListener('click', () => queueModal(settingsModal));
    refs.scrim.addEventListener('click', (e) => { if (e.target === refs.scrim && modal && !modal.locked) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.locked) closeModal(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save();
    });
    window.addEventListener('pagehide', save);
    buildPoints();
    const track = refs.monthTrack;
    track.textContent = '';
    refs.segs = D.SLOT_NAMES.map((name) => {
      const fill = el('i');
      const li = el('li', null, [el('span', { text: name }), el('span', { class: 'seg' }, fill)]);
      track.append(li);
      return { li, fill };
    });
  }

  // ── 성장 포인트 패널 (공주 화면) ──────────────────────────
  function buildPoints() {
    refs.ptButtons = {};
    refs.ptGrid.textContent = '';
    for (const s of POINT_DEFS) {
      const val = el('span', { class: 'pt-val num' });
      const fill = el('i');
      const need = el('span', { class: 'pt-need num' });
      const btn = el('button', {
        type: 'button', class: 'pt',
        onclick: () => {
          const res = E.spendPoints(state, s.id);
          if (!res.ok) return;
          statFloors[s.id] = Math.floor(state.run.stats[s.id]);
          floater(s.name + ' +' + D.POINT_GAIN);
          forcePanel = true;
          render();
        },
      }, [
        el('span', { class: 'pt-top' }, [el('span', { class: 'pt-name', text: s.name }), val]),
        el('span', { class: 'pt-gauge', 'aria-hidden': 'true' }, fill),
        need,
      ]);
      refs.ptGrid.append(btn);
      refs.ptButtons[s.id] = { btn, val, fill, need, name: s.name };
    }

    const sel = refs.autoTarget;
    sel.textContent = '';
    sel.append(el('option', { value: 'balanced', text: '골고루 (낮은 것부터)' }));
    for (const s of POINT_DEFS) sel.append(el('option', { value: s.id, text: s.name + '만' }));
    sel.addEventListener('change', () => { E.setAutoTarget(state, sel.value); save(); render(); });

    refs.autoBuy.textContent = '';
    const ad = el('button', {
      type: 'button', class: 'btn btn-ad',
      onclick: () => queueModal(adModal),
    }, [el('span', { text: '광고 보고' }), el('b', { text: D.AD_AUTO_SECONDS / 60 + '분 자동' })]);
    refs.autoBuy.append(ad);
    refs.offerButtons = D.AUTO_OFFERS.map((o) => {
      const btn = el('button', {
        type: 'button', class: 'btn btn-gem',
        onclick: () => {
          const res = E.buyAuto(state, o.id);
          if (res.ok) {
            toast('보석 ' + o.gems + '개로 자동 ' + autoLabel(o.minutes) + '을(를) 켰어요.', 'event');
            save();
            render();
          }
        },
      }, [el('span', { text: '보석 ' + o.gems + '개' }), el('b', { text: autoLabel(o.minutes) + ' 자동' })]);
      refs.autoBuy.append(btn);
      return { btn, offer: o };
    });
    setText(refs.pointsHint, D.POINT_EVERY + '일마다 +1 · 숙련도 레벨업 +' + D.POINT_LEVELUP + ' · 생일 +' + D.POINT_BIRTHDAY +
      '. 게이지가 차면 눌러서 +' + D.POINT_GAIN + '. 능력치가 ' + D.POINT_COST_STEP + ' 오를 때마다 필요 포인트도 1 늘어요.');
  }
  function autoLabel(minutes) { return minutes >= 60 ? minutes / 60 + '시간' : minutes + '분'; }
  function clock(ms) {
    const sec = Math.ceil(ms / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const ss = String(sec % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
  }

  function renderPoints() {
    const run = state.run;
    const pts = run.points;
    setText(refs.ptCount, int(pts));
    if (pts > lastPoints) {
      refs.ptCount.classList.remove('bump');
      void refs.ptCount.offsetWidth;
      refs.ptCount.classList.add('bump');
    }
    lastPoints = pts;
    const autoOn = state.meta.autoMs > 0;
    const pick = autoOn ? E.autoPick(state) : null;
    for (const id in refs.ptButtons) {
      const r = refs.ptButtons[id];
      const maxed = run.stats[id] >= D.STAT_MAX;
      const cost = E.pointCost(run, id);
      const ready = !run.ended && !maxed && pts >= cost;
      setText(r.val, int(run.stats[id]));
      setWidth(r.fill, maxed ? 1 : pts / cost);
      setText(r.need, maxed ? '최대' : ready ? '+' + D.POINT_GAIN + ' 올리기' : int(pts) + ' / ' + cost);
      if (r.btn.disabled !== !ready) r.btn.disabled = !ready;
      r.btn.classList.toggle('ready', ready);
      r.btn.classList.toggle('target', autoOn && pick === id);
      r.btn.setAttribute('aria-label', r.name + ' ' + int(run.stats[id]) + ', 필요 포인트 ' + cost + (ready ? ', 올리기' : ', 포인트 부족'));
    }
    const left = E.daysToNextPoint(run);
    const frac = run.ended ? 0 : (D.POINT_EVERY - left + acc / D.DAY_MS) / D.POINT_EVERY;
    setWidth(refs.ptNextBar, frac);
    refs.ptNextGauge.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    setText(refs.ptNextText, run.ended ? '성인식을 마쳤어요' : '다음 포인트까지 ' + left + '일');
    if (document.activeElement !== refs.autoTarget && refs.autoTarget.value !== state.meta.autoTarget) {
      refs.autoTarget.value = state.meta.autoTarget;
    }
    refs.autoBadge.hidden = !autoOn;
    setText(refs.autoBadge, autoOn ? '자동 ' + clock(state.meta.autoMs) : '');
    for (const o of refs.offerButtons) {
      const off = state.meta.gems < o.offer.gems;
      if (o.btn.disabled !== off) o.btn.disabled = off;
    }
  }

  // 자동 시간이 남아 있으면 쌓인 포인트를 알아서 쓴다
  function runAuto() {
    if (state.meta.autoMs <= 0 || state.run.points <= 0 || state.run.ended) return null;
    const spent = E.autoSpend(state);
    let shown = 0;
    for (const id in spent) {
      statFloors[id] = Math.floor(state.run.stats[id]);
      if (shown < 3 && document.visibilityState === 'visible') floater(STAT_NAME[id] + ' +' + spent[id] * D.POINT_GAIN, shown);
      shown++;
    }
    return spent;
  }

  function selectTab(t) {
    ui.tab = t;
    for (const k of TABS) {
      const on = k === t;
      refs.tabs[k].setAttribute('aria-selected', on ? 'true' : 'false');
      refs.tabs[k].tabIndex = on ? 0 : -1;
      refs.panels[k].hidden = !on;
    }
    forcePanel = true;
    saveUi();
    renderPanel(true);
  }

  function buildAll() {
    lastPoints = state.run.points;
    portraitKey = '';
    logStamp = '';
    endingsStamp = '';
    statFloors = {};
    for (const s of D.STATS) statFloors[s.id] = Math.floor(state.run.stats[s.id]);
    buildSchedule();
    buildStats();
    buildShop();
    buildLegacy();
    buildEndings();
    buildLog();
    selectTab(ui.tab);
    render();
  }

  // 일정 탭
  function buildSchedule() {
    const p = refs.panels.schedule;
    p.textContent = '';
    refs.slots = [];
    refs.acts = {};
    refs.filterChips = {};

    const slotsWrap = el('div', { class: 'slots', role: 'group', 'aria-label': '한 달 일정' });
    D.SLOT_NAMES.forEach((name, i) => {
      const seal = el('span', { class: 'seal' });
      const title = el('span', { class: 'slot-name' });
      const sum = el('span', { class: 'slot-sum' });
      const now = el('span', { class: 'now' });
      const prog = el('i', { class: 'slot-progress' });
      const btn = el('button', {
        type: 'button', class: 'slot', 'aria-pressed': 'false',
        onclick: () => { ui.slot = i; forcePanel = true; renderPanel(true); },
      }, [
        el('span', { class: 'slot-label' }, [el('span', { text: name + ' · ' + (i * 10 + 1) + '–' + (i * 10 + 10) + '일' }), now]),
        seal, title, sum, prog,
      ]);
      slotsWrap.append(btn);
      refs.slots.push({ btn, seal, title, sum, now, prog });
    });

    const filters = el('div', { class: 'filters', role: 'group', 'aria-label': '활동 종류' });
    [{ id: 'all', name: '전체' }].concat(D.CATEGORIES).forEach((c) => {
      const chip = el('button', {
        type: 'button', class: 'chip', text: c.name, 'aria-pressed': 'false',
        onclick: () => { ui.filter = c.id; saveUi(); forcePanel = true; renderPanel(true); },
      });
      refs.filterChips[c.id] = chip;
      filters.append(chip);
    });

    const grid = el('div', { class: 'acts' });
    for (const act of D.ACTIVITIES) {
      const lv = el('span', { class: 'lv' });
      const fx = el('span', { class: 'act-fx' });
      const meta = el('span', { class: 'act-meta' });
      const lock = el('span', { class: 'act-lock' });
      const bar = el('i');
      const btn = el('button', {
        type: 'button', class: 'act',
        title: act.desc,
        onclick: () => {
          const res = E.setSchedule(state, ui.slot, act.id);
          if (res.ok) {
            toast(D.SLOT_NAMES[ui.slot] + ' 일정을 「' + act.name + '」(으)로 바꿨어요.', 'event');
            forcePanel = true;
            renderPanel(true);
            save();
          }
        },
      }, [
        el('span', { class: 'seal cat-' + act.cat, text: act.glyph, 'aria-hidden': 'true' }),
        el('span', { class: 'act-body' }, [
          el('span', { class: 'act-title' }, [el('b', { text: act.name }), lv]),
          el('span', { class: 'hint', text: act.desc }),
          fx, meta, lock,
          el('span', { class: 'mastery' }, bar),
        ]),
      ]);
      grid.append(btn);
      refs.acts[act.id] = { btn, lv, fx, meta, lock, bar, act };
    }

    const ar = state.meta.autoRest;
    const enabled = el('input', { type: 'checkbox', id: 'ar-enabled' });
    enabled.checked = ar.enabled;
    const at = el('input', { type: 'range', id: 'ar-at', min: '40', max: '99', value: String(ar.at) });
    const until = el('input', { type: 'range', id: 'ar-until', min: '0', max: '80', value: String(ar.until) });
    const atOut = el('output', { for: 'ar-at' });
    const untilOut = el('output', { for: 'ar-until' });
    const sync = () => {
      enabled.checked = ar.enabled;
      at.value = String(ar.at);
      until.value = String(ar.until);
      setText(atOut, String(ar.at));
      setText(untilOut, String(ar.until));
      at.disabled = until.disabled = !ar.enabled;
    };
    enabled.addEventListener('change', () => { E.setAutoRest(state, { enabled: enabled.checked }); sync(); save(); });
    at.addEventListener('input', () => { E.setAutoRest(state, { at: +at.value }); sync(); });
    until.addEventListener('input', () => { E.setAutoRest(state, { until: +until.value }); sync(); });
    at.addEventListener('change', save);
    until.addEventListener('change', save);
    sync();

    p.append(
      el('div', { class: 'panel-head' }, [
        el('h2', { text: '한 달 일정' }),
        el('p', { text: '일정은 매달 반복돼요. 위에서 칸을 고르고 아래에서 활동을 누르면 바뀌어요. 숫자는 10일 기준이에요.' }),
      ]),
      slotsWrap,
      filters,
      grid,
      el('fieldset', { class: 'autorest' }, [
        el('legend', { text: '자동 휴식' }),
        el('label', { class: 'toggle', for: 'ar-enabled' }, [enabled, '스트레스가 쌓이면 알아서 쉬기']),
        el('div', { class: 'range-row' }, [el('label', { for: 'ar-at', text: '쉬기 시작' }), at, atOut]),
        el('div', { class: 'range-row' }, [el('label', { for: 'ar-until', text: '일정으로 복귀' }), until, untilOut]),
        el('p', { class: 'hint', text: '스트레스가 50을 넘으면 효율이 떨어지고, 100이 되면 일주일 동안 앓아누워요.' }),
      ]),
    );
  }

  function updateSchedule() {
    const run = state.run;
    const cal = E.calendar(run.totalDays);
    refs.slots.forEach((s, i) => {
      const act = E.ACT[run.schedule[i]];
      const pv = E.preview(state, act.id);
      s.seal.className = 'seal cat-' + act.cat;
      setText(s.seal, act.glyph);
      setText(s.title, act.name);
      setHTML(s.sum, fxHTML(pv, act) || '능력치 변화 없음');
      setText(s.now, i === cal.slot ? '진행 중' : '');
      s.btn.classList.toggle('selected', ui.slot === i);
      s.btn.setAttribute('aria-pressed', ui.slot === i ? 'true' : 'false');
      setWidth(s.prog, i === cal.slot ? (cal.dayInSlot + acc / D.DAY_MS) / D.SLOT_DAYS : 0);
    });
    for (const id in refs.filterChips) refs.filterChips[id].setAttribute('aria-pressed', ui.filter === id ? 'true' : 'false');
    for (const id in refs.acts) {
      const r = refs.acts[id];
      const act = r.act;
      const shown = ui.filter === 'all' || ui.filter === act.cat;
      if (r.btn.hidden === shown) r.btn.hidden = !shown;
      if (!shown) continue;
      const unmet = E.unmetReqs(run, act);
      const locked = unmet.length > 0;
      if (r.btn.disabled !== locked) r.btn.disabled = locked;
      r.btn.classList.toggle('assigned', run.schedule[ui.slot] === id);
      const m = E.masteryInfo(state, id);
      setText(r.lv, act.cat === 'rest' ? '' : 'Lv.' + m.level + (m.max ? ' 최고' : ''));
      setWidth(r.bar, act.cat === 'rest' ? 0 : m.progress);
      const pv = E.preview(state, id);
      setHTML(r.fx, fxHTML(pv, act));
      setHTML(r.meta, metaHTML(pv, act));
      setText(r.lock, locked ? '해금 조건: ' + unmet.join(' · ') : '');
      r.lock.hidden = !locked;
    }
  }

  // 능력치 탭
  function buildStats() {
    const p = refs.panels.stats;
    p.textContent = '';
    refs.stats = {};
    const groups = el('div', { class: 'stat-groups' });
    for (const g of D.STAT_GROUPS) {
      const box = el('section', { class: 'stat-group g-' + g.id }, [el('h3', null, [g.name, el('small', { text: g.desc })])]);
      for (const s of D.STATS.filter((x) => x.group === g.id)) {
        const bar = el('i');
        const val = el('span', { class: 'stat-val' });
        const delta = el('span', { class: 'stat-delta', title: '이번 달 변화' });
        box.append(el('div', { class: 'stat-row' }, [el('span', { text: s.name }), el('span', { class: 'stat-bar' }, bar), val, delta]));
        refs.stats[s.id] = { bar, val, delta };
      }
      groups.append(box);
    }
    const fact = (label) => {
      const dd = el('dd');
      return { node: el('div', { class: 'fact' }, [el('dt', { text: label }), dd]), dd };
    };
    refs.facts = { fame: fact('명성'), wins: fact('수확제 우승'), power: fact('전투력'), earned: fact('지금까지 번 돈') };
    refs.forecast = {
      tier: el('span', { class: 'tier' }),
      name: el('span'),
      text: el('p'),
    };
    p.append(
      el('div', { class: 'panel-head' }, [
        el('h2', { text: '능력치' }),
        el('p', { text: '능력치는 최대 999까지 올라요. 오른쪽 숫자는 이번 달에 달라진 만큼이에요.' }),
      ]),
      el('div', { class: 'forecast' }, [
        el('p', { class: 'eyebrow', text: '이대로 성인식을 맞는다면' }),
        el('h3', null, [refs.forecast.name, refs.forecast.tier]),
        refs.forecast.text,
      ]),
      groups,
      el('dl', { class: 'facts' }, Object.values(refs.facts).map((f) => f.node)),
    );
  }

  function updateStats() {
    const run = state.run;
    for (const s of D.STATS) {
      const r = refs.stats[s.id];
      const v = run.stats[s.id];
      setWidth(r.bar, v / D.STAT_MAX);
      setText(r.val, int(v));
      const d = Math.floor(v) - Math.floor(run.monthStart[s.id]);
      setText(r.delta, d ? signed(d, 0) : '');
      r.delta.classList.toggle('neg', d < 0);
    }
    setText(refs.facts.fame.dd, int(run.fame));
    setText(refs.facts.wins.dd, run.festivalWins + '회');
    setText(refs.facts.power.dd, int(E.combatPower(state)));
    setText(refs.facts.earned.dd, int(run.goldEarned) + 'G');
    const ending = E.evaluateEnding(run);
    const known = !!state.meta.endings[ending.id];
    setText(refs.forecast.name, known ? ending.name : '아직 모르는 길');
    refs.forecast.tier.className = 'tier tier-' + ending.tier;
    setText(refs.forecast.tier, ending.tier);
    setText(refs.forecast.text, known ? ending.text : '힌트 — ' + ending.hint + '. 성인식을 치르면 도감에 기록돼요.');
  }

  // 상점·유산 공통 카드
  function buildWares(container, items, kind) {
    const out = {};
    for (const item of items) {
      const lv = el('span', { class: 'lv' });
      const effect = el('p', { class: 'effect' });
      const pips = el('div', { class: 'pips', 'aria-hidden': 'true' });
      for (let i = 0; i < Math.min(item.max, 10); i++) pips.append(el('i'));
      const btn = el('button', {
        type: 'button', class: 'btn btn-primary',
        onclick: () => {
          const res = kind === 'shop' ? E.buyUpgrade(state, item.id) : E.buyLegacy(state, item.id);
          if (res.ok) {
            toast(item.name + ' Lv.' + res.level + '!', 'event');
            forcePanel = true;
            renderPanel(true);
            renderHud();
            save();
          }
        },
      }, el('span', { class: 'cost' + (kind === 'legacy' ? ' star' : '') }));
      const card = el('div', { class: 'ware' }, [
        el('div', { class: 'ware-head' }, [el('b', { text: item.name }), lv]),
        el('p', { class: 'desc', text: item.desc }),
        el('div', null, [effect, pips]),
        btn,
      ]);
      container.append(card);
      out[item.id] = { card, lv, effect, pips: Array.from(pips.children), btn, cost: btn.firstChild, item };
    }
    return out;
  }
  function updateWares(map, kind) {
    const wallet = kind === 'shop' ? state.run.gold : state.meta.stars;
    for (const id in map) {
      const r = map[id];
      const item = r.item;
      const lvl = kind === 'shop' ? E.upgradeLevel(state, id) : E.legacyLevel(state, id);
      const maxed = lvl >= item.max;
      setText(r.lv, 'Lv.' + lvl + '/' + item.max);
      setText(r.effect, wareEffect(item, lvl) + (kind === 'legacy' && /^start_/.test(item.effect.type) ? ' (다음 세대부터)' : ''));
      const filled = item.max > 10 ? Math.round((lvl / item.max) * 10) : lvl;
      r.pips.forEach((p, i) => p.classList.toggle('on', i < filled));
      r.card.classList.toggle('maxed', maxed);
      const cost = maxed ? 0 : E.upgradeCost(item, lvl);
      setText(r.cost, maxed ? '최고 단계' : int(cost) + (kind === 'shop' ? 'G' : ''));
      r.cost.classList.toggle('star', kind === 'legacy' && !maxed);
      const disabled = maxed || wallet < cost;
      if (r.btn.disabled !== disabled) r.btn.disabled = disabled;
    }
  }

  function buildShop() {
    const p = refs.panels.shop;
    p.textContent = '';
    const grid = el('div', { class: 'shop' });
    refs.shop = buildWares(grid, D.UPGRADES, 'shop');
    const auto = el('input', { type: 'checkbox', id: 'auto-buy' });
    auto.checked = !!state.meta.autoBuy;
    auto.addEventListener('change', () => { state.meta.autoBuy = auto.checked; save(); });
    p.append(
      el('div', { class: 'panel-head' }, [
        el('h2', { text: '공주의 방 꾸미기' }),
        el('p', { text: '골드로 산 물건은 이번 세대가 끝날 때까지 효과가 이어져요. 성인식이 지나면 방은 새로 꾸며야 해요.' }),
      ]),
      el('div', { class: 'autobuy' }, [
        el('label', { class: 'toggle', for: 'auto-buy' }, [auto, '자동 구매']),
        el('p', { class: 'hint', text: '매달 1일, 지금 일정에 도움이 되는 물건을 싼 것부터 사요. 한 달치 수업료는 남겨 둬요.' }),
      ]),
      grid,
    );
  }

  function buildLegacy() {
    const p = refs.panels.legacy;
    p.textContent = '';
    const grid = el('div', { class: 'shop' });
    refs.legacy = buildWares(grid, D.LEGACY, 'legacy');
    refs.bigStar = el('span');
    refs.history = el('ol', { class: 'history' });
    refs.historyHead = el('h2', { text: '역대 공주' });
    p.append(
      el('div', { class: 'legacy-head' }, [
        el('div', { class: 'big-star' }, [refs.bigStar, el('small', { text: '보유한 왕관 별' })]),
        el('p', { class: 'hint', text: '성인식을 마칠 때마다 능력치·엔딩·명성에 따라 왕관 별을 받아요. 별로 산 유산은 영원히 남아 다음 세대를 도와요.' }),
      ]),
      grid,
      refs.historyHead,
      refs.history,
    );
  }
  function updateLegacy() {
    setText(refs.bigStar, '★ ' + int(state.meta.stars));
    updateWares(refs.legacy, 'legacy');
    const hist = state.meta.history;
    const stamp = hist.length + ':' + (hist[0] ? hist[0].generation : 0);
    if (refs.history._stamp !== stamp) {
      refs.history._stamp = stamp;
      refs.history.textContent = '';
      refs.historyHead.hidden = !hist.length;
      for (const h of hist) {
        const e = E.END[h.ending];
        refs.history.append(el('li', null, [
          el('span', { class: 'g', text: h.generation + '대' }),
          el('span', null, [el('b', { text: h.name }), ' — ' + (e ? e.name : '?')]),
          el('span', { class: 'tier tier-' + (e ? e.tier : 'C'), text: e ? e.tier : '?' }),
          el('span', { class: 'num', text: '★ ' + h.stars }),
        ]));
      }
    }
  }

  // 엔딩 도감
  function buildEndings() {
    const p = refs.panels.endings;
    p.textContent = '';
    refs.codexBar = el('i');
    refs.codexCount = el('span', { class: 'num' });
    refs.codex = el('div', { class: 'codex' });
    p.append(
      el('div', { class: 'panel-head' }, [
        el('h2', { text: '엔딩 도감' }),
        el('p', { text: '성인식 날의 능력치로 공주의 앞날이 정해져요. 위쪽 엔딩일수록 먼저 판정돼요.' }),
      ]),
      el('div', { class: 'codex-progress' }, [el('div', { class: 'bar' }, refs.codexBar), refs.codexCount]),
      refs.codex,
    );
  }
  function updateEndings() {
    const seen = state.meta.endings;
    const stamp = JSON.stringify(seen);
    if (stamp === endingsStamp) return;
    endingsStamp = stamp;
    const found = D.ENDINGS.filter((e) => seen[e.id]).length;
    setWidth(refs.codexBar, found / D.ENDINGS.length);
    setText(refs.codexCount, found + ' / ' + D.ENDINGS.length);
    refs.codex.textContent = '';
    for (const e of D.ENDINGS) {
      const rec = seen[e.id];
      refs.codex.append(el('article', { class: 'page' + (rec ? '' : ' locked') }, [
        el('div', { class: 'page-head' }, [el('span', { class: 'tier tier-' + e.tier, text: e.tier }), el('b', { text: rec ? e.name : '???' })]),
        el('p', { text: rec ? e.text : '힌트 — ' + e.hint }),
        rec ? el('p', { class: 'seen', text: rec.count + '번 · 처음 ' + rec.firstGen + '대 공주 · 최근 ' + rec.lastName }) : null,
      ]));
    }
  }

  // 일지
  function buildLog() {
    const p = refs.panels.log;
    p.textContent = '';
    refs.log = el('ol', { class: 'log', reversed: true });
    p.append(
      el('div', { class: 'panel-head' }, [
        el('h2', { text: '육성 일지' }),
        el('p', { text: '최근 ' + 150 + '개의 일이 기록돼요.' }),
      ]),
      refs.log,
    );
  }
  function updateLog() {
    const top = state.log[0];
    const stamp = state.log.length + ':' + (top ? top.day + top.text : '');
    if (stamp === logStamp) return;
    logStamp = stamp;
    const frag = document.createDocumentFragment();
    for (const entry of state.log) {
      frag.append(el('li', null, [
        el('time', { text: shortDate(entry.day) }),
        el('span', { class: 'k-' + entry.kind }, [entry.text, entry.effects ? el('span', { class: 'fx', text: entry.effects }) : null]),
      ]));
    }
    refs.log.textContent = '';
    refs.log.append(frag);
  }

  // ── 그리기 ───────────────────────────────────────────
  function renderHud() {
    const run = state.run;
    setText(refs.hudGold, int(run.gold));
    setText(refs.hudFame, int(run.fame));
    setText(refs.hudStars, int(state.meta.stars));
    setText(refs.hudGems, int(state.meta.gems));
    const speed = E.speedOf(state);
    refs.hudSpeed.hidden = speed === 1;
    setText(refs.hudSpeed, '속도 ×' + speed.toFixed(2).replace(/0$/, ''));
    setText(refs.btnPause, state.paused ? '다시 진행' : '일시정지');
    refs.btnPause.setAttribute('aria-pressed', state.paused ? 'true' : 'false');

    // 살 수 있는 것이 생기면 탭에 점을 찍는다
    const canShop = D.UPGRADES.some((u) => {
      const l = E.upgradeLevel(state, u.id);
      return l < u.max && run.gold >= E.upgradeCost(u, l);
    });
    const canLegacy = D.LEGACY.some((u) => {
      const l = E.legacyLevel(state, u.id);
      return l < u.max && state.meta.stars >= E.upgradeCost(u, l);
    });
    markTab('shop', canShop);
    markTab('legacy', canLegacy);
  }
  function markTab(t, on) {
    const tab = refs.tabs[t];
    const dot = tab.querySelector('.dot');
    if (on && !dot) tab.append(el('span', { class: 'dot', 'aria-label': '살 수 있는 항목 있음' }));
    else if (!on && dot) dot.remove();
  }

  function renderStage(now) {
    const run = state.run;
    const cal = E.calendar(run.totalDays);
    const age = E.ageOf(run);
    const mood = moodOf(run);
    const season = E.season(cal.month);
    const dress = dressColor(run);
    const key = [age, mood, run.looks.hair, run.looks.skin, dress, season].join('|');
    if (key !== portraitKey) {
      portraitKey = key;
      refs.window.dataset.season = season;
      refs.portrait.innerHTML = P.render({ age, mood, season, dress, hair: run.looks.hair, skin: run.looks.skin, label: run.name + ', ' + age + '세' });
    }
    setText(refs.prGen, state.meta.generation + '대 공주');
    setText(refs.prName, run.name);
    const months = Math.floor((run.totalDays % D.DAYS_PER_YEAR) / D.DAYS_PER_MONTH);
    setText(refs.prAge, age + '세' + (months ? ' ' + months + '개월' : ''));
    setText(refs.prDate, dateLabel(run.totalDays) + (state.paused ? ' · 멈춤' : ''));
    refs.segs.forEach((s, i) => {
      s.li.classList.toggle('now', i === cal.slot);
      s.li.classList.toggle('past', i < cal.slot);
      setWidth(s.fill, i < cal.slot ? 1 : i === cal.slot ? (cal.dayInSlot + acc / D.DAY_MS) / D.SLOT_DAYS : 0);
    });

    const doing = doingInfo(run);
    refs.doingSeal.className = 'seal cat-' + doing.cat;
    setText(refs.doingSeal, doing.glyph);
    setText(refs.doingName, doing.name);
    setText(refs.doingSub, doing.sub);

    const stress = run.stress;
    setText(refs.stressVal, String(Math.round(stress)));
    setWidth(refs.stressBar, stress / 100);
    refs.stressBar.className = stress >= 75 ? 'high' : stress >= 50 ? 'mid' : '';
    setText(refs.mood, '기분: ' + MOOD_NAME[mood] + ' · 효율 ' + pct(E.efficiency(stress)));

    const rem = Math.max(0, D.TOTAL_DAYS - run.totalDays);
    const y = Math.floor(rem / D.DAYS_PER_YEAR);
    const mo = Math.floor((rem % D.DAYS_PER_YEAR) / D.DAYS_PER_MONTH);
    const d = rem % D.DAYS_PER_MONTH;
    const parts = [];
    if (y) parts.push(y + '년');
    if (mo) parts.push(mo + '개월');
    if (d || !parts.length) parts.push(d + '일');
    setText(refs.countdown, run.ended ? '성인식을 마쳤어요' : '성인식까지 ' + parts.join(' '));

    updateBubble(now, mood, run, doing);
  }

  function updateBubble(now, mood, run, doing) {
    const cur = run.current || {};
    let key = mood;
    if (cur.reason === 'nogold') key = 'poor';
    if (state.paused) { setText(refs.bubble, '잠깐 쉬는 시간이에요.'); bubble.key = ''; return; }
    if (run.ended) { setText(refs.bubble, '그동안 고마웠어요!'); bubble.key = ''; return; }
    const k = key + '|' + doing.name;
    if (k === bubble.key && now < bubble.until) return;
    const lines = D.SPEECH[key] || D.SPEECH.calm;
    const actName = doing.name.replace(/ 중$/, '');
    bubble = { key: k, until: now + 9000 + Math.random() * 5000 };
    setText(refs.bubble, lines[Math.floor(Math.random() * lines.length)].replace('{A}', actName));
  }

  function renderPanel(force) {
    const now = Date.now();
    if (!force && !forcePanel && state.run.totalDays === lastPanelDay && now - lastPanelAt < 1000) {
      if (ui.tab === 'schedule') {
        const cal = E.calendar(state.run.totalDays);
        setWidth(refs.slots[cal.slot].prog, (cal.dayInSlot + acc / D.DAY_MS) / D.SLOT_DAYS);
      }
      return;
    }
    forcePanel = false;
    lastPanelDay = state.run.totalDays;
    lastPanelAt = now;
    switch (ui.tab) {
      case 'schedule': updateSchedule(); break;
      case 'stats': updateStats(); break;
      case 'shop': updateWares(refs.shop, 'shop'); break;
      case 'legacy': updateLegacy(); break;
      case 'endings': updateEndings(); break;
      case 'log': updateLog(); break;
      default: break;
    }
  }

  function render() {
    if (!state || !state.run) return;
    const now = Date.now();
    renderHud();
    renderStage(now);
    renderPoints();
    renderPanel(false);
  }

  function floater(text, index) {
    const f = el('span', { class: 'floater', text });
    f.style.left = (35 + Math.random() * 30).toFixed(1) + '%';
    f.style.top = (52 - (index || 0) * 10) + '%';
    refs.floaters.append(f);
    setTimeout(() => f.remove(), 1900);
  }
  function afterDay() {
    const run = state.run;
    let shown = 0;
    for (const s of D.STATS) {
      const f = Math.floor(run.stats[s.id]);
      const prev = statFloors[s.id];
      statFloors[s.id] = f;
      if (prev !== undefined && f > prev && shown < 2 && document.visibilityState === 'visible') {
        floater(s.name + ' +' + (f - prev), shown);
        shown++;
      }
    }
  }
  function onEntry(entry) {
    if (!TOAST_KINDS.has(entry.kind)) return;
    toast(entry.text + (entry.effects ? ' (' + entry.effects + ')' : ''), entry.kind);
  }

  // ── 시간 흐름 ─────────────────────────────────────────
  function tick() {
    const now = Date.now();
    const dt = Math.max(0, now - lastTick);
    lastTick = now;
    const run = state && state.run;
    if (run && !run.ended && !state.paused && !modal) {
      acc += dt * E.speedOf(state);
      const autoWas = state.meta.autoMs > 0;
      if (dt > 4000) {
        // 탭이 백그라운드에 있다가 돌아온 경우: 밀린 날을 한꺼번에 진행
        const days = Math.floor(acc / D.DAY_MS);
        acc -= days * D.DAY_MS;
        if (days > 0) {
          const rep = E.simulate(state, days);
          const spent = autoWas ? E.autoSpend(state) : null;
          for (const s of D.STATS) statFloors[s.id] = Math.floor(state.run.stats[s.id]);
          if (rep.days >= 5 && !rep.ended) queueModal(reportModal(rep, dt, false, spent));
        }
      } else {
        let guard = 0;
        while (acc >= D.DAY_MS && !state.run.ended && guard++ < 30) {
          acc -= D.DAY_MS;
          E.stepDay(state, onEntry);
          afterDay();
          runAuto();
        }
        runAuto();
      }
      if (autoWas) {
        E.useAutoTime(state, dt);
        if (state.meta.autoMs <= 0) toast('자동 선택 시간이 끝났어요.', 'event');
      }
      if (state.run.ended) {
        acc = 0;
        save();
        forcePanel = true;
        queueModal(endingModal, { locked: true });
      }
    }
    render();
    if (now - lastSave > 5000) save();
  }

  function offlineCatchUp() {
    const run = state.run;
    if (!run || run.ended || state.paused || !state.lastSeen) return;
    const away = Date.now() - state.lastSeen;
    if (away < 5000) return;
    const cap = E.offlineCapMs(state);
    const used = Math.min(away, cap);
    const days = Math.floor((used * E.speedOf(state)) / D.DAY_MS);
    if (days <= 0) return;
    const rep = E.simulate(state, days);
    let spent = null;
    if (state.meta.autoMs > 0) {
      spent = E.autoSpend(state);
      E.useAutoTime(state, used);
    }
    if (rep.days >= 3) queueModal(reportModal(rep, away, away > cap, spent));
  }

  // ── 시작 ─────────────────────────────────────────────
  function needsIntroFor(run) { return !run.ended && run.totalDays === 0 && run.bonusPoints > 0; }

  function boot(hotData) {
    cacheRefs();
    bindStatic();
    loadUi();

    let loaded = null;
    if (hotData && hotData.save) {
      try { loaded = E.deserialize(hotData.save); } catch (e) { loaded = null; }
    }
    state = loaded || loadSaved();
    if (!state || !state.run) {
      state = state || E.createState();
      E.newRun(state, '');
    }
    const needsIntro = needsIntroFor(state.run);
    if (!needsIntro) offlineCatchUp();
    buildAll();
    if (needsIntro) queueModal(introModal, { locked: true });
    if (state.run.ended) queueModal(endingModal, { locked: true });
    lastTick = Date.now();
    save();
    setInterval(tick, 100);

    try {
      const hot = window.claude && window.claude.hot;
      if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ save: E.serialize(state) }));
    } catch (e) { /* 미리보기 환경이 아니면 무시 */ }
  }

  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.ready === 'function') hot.ready(boot);
  else boot((hot && hot.data) || {});
})();
