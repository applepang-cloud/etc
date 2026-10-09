'use strict';
/* 화면: 탭별로 한 번 그린 뒤, 매 틱 숫자만 바꾼다 (클릭이 끊기지 않도록 요소를 갈아끼우지 않음) */

function F(el) {
  if (!el._f) {
    el._f = {};
    el.querySelectorAll('[data-f]').forEach(x => { el._f[x.dataset.f] = x; });
  }
  return el._f;
}
function setT(el, s) { if (el && el.textContent !== s) el.textContent = s; }
function setH(el, s) { if (el && el._h !== s) { el.innerHTML = s; el._h = s; } }
function setC(el, cls) { if (el && el.className !== cls) el.className = cls; }

/** 키 목록이 바뀔 때만 다시 그리고, 나머지는 update로 값만 갱신 */
function syncList(box, items, key, build, update, empty) {
  const sig = items.map(key).join('|');
  if (box._sig !== sig) {
    box.innerHTML = items.length ? items.map(build).join('') : (empty || '');
    box._sig = sig;
    box._rows = new Map();
    for (const el of box.children) if (el.dataset.key) box._rows.set(el.dataset.key, el);
  }
  if (update) for (const it of items) { const el = box._rows.get(String(key(it))); if (el) update(el, it); }
}

function parseAmount(s) {
  if (s == null) return NaN;
  s = String(s).replace(/[,\s원₩]/g, '');
  if (!s) return NaN;
  const units = { '조': 1e12, '억': 1e8, '만': 1e4, '천': 1e3 };
  const re = /([\d.]+)(조|억|만|천)?/g;
  let total = 0, m, ok = false;
  while ((m = re.exec(s))) { ok = true; total += parseFloat(m[1]) * (m[2] ? units[m[2]] : 1); }
  return ok ? total : NaN;
}
function parseQty(s) {
  const v = parseFloat(String(s || '').replace(/,/g, ''));
  return isFinite(v) ? v : NaN;
}

const logoHTML = (sym, lg = false) => `<span class="logo${lg ? ' lg' : ''}" style="background:${COIN[sym].color}">${sym.slice(0, 4)}</span>`;
const avatarHTML = (name, hue, round = false) => `<span class="avatar"${round ? ' style="border-radius:50%;background:hsl(' + hue + ' 55% 46%)"' : ' style="background:hsl(' + hue + ' 50% 42%)"'}>${esc(name[0])}</span>`;
function starsHTML(skill) {
  const full = Math.round(skill);
  return `<span class="stars" title="실력 ${skill.toFixed(1)} / 5">${'★'.repeat(full)}<span class="off">${'★'.repeat(5 - full)}</span></span>`;
}
const pctCls = x => signCls(x);
const ago = (S, t) => {
  const d = S.t - t;
  if (d < 5) return '방금';
  if (d < TPD) return `${Math.round(d * 12 / 60) || 1}시간 전`.replace(/^0/, '');
  return `${Math.floor(d / TPD)}일 전`;
};
const fgLabel = v => v < 20 ? '극단적 공포' : v < 40 ? '공포' : v < 60 ? '중립' : v < 80 ? '탐욕' : '극단적 탐욕';

function buildingSVG(floors, hue) {
  const w = 22 + floors * 6, h = 12 + floors * 6;
  let win = '';
  for (let f = 0; f < floors; f++) for (let c = 0; c < Math.max(2, Math.floor(w / 9)); c++) {
    win += `<rect x="${5 + c * 8}" y="${h - 9 - f * 6}" width="4" height="3" fill="var(--coin)" opacity="${(f * 7 + c * 3) % 5 === 0 ? 0.25 : 0.85}"/>`;
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><rect x="0" y="0" width="${w}" height="${h}" rx="2" fill="hsl(${hue} 22% 46%)"/>${win}</svg>`;
}
function carSVG(car) {
  const sport = car.charm >= 55;
  const len = 120, hue = (car.price / 1e6) % 360;
  const body = sport
    ? `<path d="M8 40 Q20 24 48 22 L76 22 Q96 24 112 36 L114 42 L6 42 Z" fill="hsl(${hue} 70% 48%)"/>`
    : `<path d="M8 40 L12 28 Q16 22 30 22 L44 12 L84 12 L98 24 L110 28 L112 42 L6 42 Z" fill="hsl(${hue} 30% 50%)"/>`;
  return `<svg width="${len}" height="54" viewBox="0 0 ${len} 54" aria-hidden="true">${body}<rect x="40" y="${sport ? 25 : 15}" width="40" height="9" rx="2" fill="var(--panel)" opacity="0.7"/><circle cx="30" cy="42" r="8" fill="var(--fg)"/><circle cx="92" cy="42" r="8" fill="var(--fg)"/><circle cx="30" cy="42" r="3" fill="var(--panel-2)"/><circle cx="92" cy="42" r="3" fill="var(--panel-2)"/></svg>`;
}
const RIG_ICON = {
  gpu: '<svg width="30" height="22" viewBox="0 0 30 22"><rect x="1" y="4" width="28" height="14" rx="2" fill="var(--line-2)"/><circle cx="10" cy="11" r="5" fill="var(--panel)"/><circle cx="21" cy="11" r="5" fill="var(--panel)"/></svg>',
  rig6: '<svg width="32" height="26" viewBox="0 0 32 26"><rect x="1" y="1" width="30" height="24" rx="2" fill="none" stroke="var(--line-2)" stroke-width="2"/><rect x="5" y="5" width="3" height="16" fill="var(--gold)"/><rect x="11" y="5" width="3" height="16" fill="var(--gold)"/><rect x="17" y="5" width="3" height="16" fill="var(--gold)"/><rect x="23" y="5" width="3" height="16" fill="var(--gold)"/></svg>',
  asic: '<svg width="28" height="28" viewBox="0 0 28 28"><rect x="3" y="3" width="22" height="22" rx="3" fill="var(--line-2)"/><circle cx="14" cy="14" r="7" fill="var(--panel)"/><circle cx="14" cy="14" r="2" fill="var(--gold)"/></svg>',
  container: '<svg width="34" height="22" viewBox="0 0 34 22"><rect x="1" y="3" width="32" height="16" fill="hsl(200 35% 45%)"/><path d="M6 3v16M11 3v16M16 3v16M21 3v16M26 3v16" stroke="var(--panel)" stroke-width="1.2"/></svg>',
  hydro: '<svg width="34" height="26" viewBox="0 0 34 26"><path d="M1 25 L8 4 L26 4 L33 25 Z" fill="var(--line-2)"/><path d="M12 8 Q14 16 10 24 M18 8 Q20 16 16 24 M24 8 Q26 16 22 24" stroke="var(--blue)" stroke-width="2" fill="none"/></svg>',
  orbital: '<svg width="34" height="26" viewBox="0 0 34 26"><rect x="1" y="9" width="11" height="8" fill="var(--blue)"/><rect x="22" y="9" width="11" height="8" fill="var(--blue)"/><circle cx="17" cy="13" r="5" fill="var(--gold)"/></svg>',
};
const PART_COLORS = ['#8a91a8', '#f2b53a', '#e2541b', '#6a48d6', '#2160d2', '#0f8f58', '#c2a633', '#14a89a', '#d32f3f'];

const UI = {
  S: null,
  tab: 'ex',
  modalActs: [],

  init(S) {
    $('#coin-filter').innerHTML = COIN_FILTERS.map(f => `<button data-act="filter" data-arg="${f.id}">${f.label}</button>`).join('');
    $('#news-filter').innerHTML = [['all', '전체'], ['kr', '국내'], ['gl', '해외'], ['yt', '유튜브'], ['big', '속보']].map(([k, l]) => `<button data-act="newsFilter" data-arg="${k}">${l}</button>`).join('');
    $('#mine-coin').innerHTML = MINE_COINS.map(s => `<button data-act="mineCoin" data-arg="${s}">${COIN[s].name}</button>`).join('');
    Chart.init($('#chart'));
    this.bind();
    this.buildOrderBook();
    this.buildRefs();
    window.addEventListener('resize', () => { this.measureTop(); Game.drawChart(); });
    this.attach(S);
  },

  /** 새 상태(처음 시작·초기화)를 화면에 연결하고 그려둔 캐시를 비운다 */
  attach(S) {
    this.S = S;
    for (const el of document.querySelectorAll('*')) {
      for (const k of ['_sig', '_h', '_built', '_f', '_rows', '_sym', '_fav', '_ck', '_tab', '_top', '_lp']) if (k in el) delete el[k];
    }
    document.body.classList.toggle('colors-global', S.settings.colors === 'global');
    $('#coin-search').value = S.ui.search || '';
    $('#set-sfx').value = S.settings.sfx;
    $('#set-bgm').value = S.settings.bgm;
    this.buildOrderBook();
    this.showTab(S.ui.tab || 'ex');
    this.syncToggles();
    this.onSelChange();
    this.renderTicker();
    this.measureTop();
  },

  measureTop() {
    const h = $('.topbar').offsetHeight;
    document.documentElement.style.setProperty('--top-h', h + 'px');
  },

  bind() {
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      const act = el.dataset.act;
      const fn = this.acts[act];
      if (!fn) return;
      try {
        fn.call(this, el.dataset.arg, el, e);
      } catch (err) {
        if (err instanceof GameError) { this.toast(err.message, '', 'warn'); Sound.play('error'); }
        else { console.error(err); this.toast('문제가 생겼습니다', String(err.message || err), 'warn'); }
      }
    });
    document.addEventListener('change', e => {
      const el = e.target;
      if (el.dataset.mact) this.onMgrChange(el);
      if (el.id === 'ref-coin') this.updateRefs();
    });
    document.addEventListener('input', e => {
      const id = e.target.id;
      if (id === 'coin-search') { this.S.ui.search = e.target.value; this.updateCoinList(); }
      if (['buy-amt', 'sell-qty', 'lim-price', 'lim-qty', 'fut-lev', 'fut-margin', 'stake-qty', 'rule-tp', 'rule-sl'].includes(id)) this.updateOrderForm();
      if (id === 'set-sfx') { this.S.settings.sfx = +e.target.value; Sound.applyVolumes(); }
      if (id === 'set-bgm') { this.S.settings.bgm = +e.target.value; Sound.applyVolumes(); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('#modal').hidden) this.closeModal();
      if (e.key === 'Enter' && e.target.matches('.ofield input')) {
        const form = e.target.closest('.oform');
        const btn = form && form.querySelector('.obtn');
        if (btn) btn.click();
      }
    });
    $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') this.closeModal(); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => this.redrawCanvases());
  },

  redrawCanvases() {
    Game.drawChart();
    if (this.tab === 'me') this.updateMe(true);
    if (this.tab === 'news') this.updateNews(true);
  },

  /* ---------- 공통 ---------- */
  toast(title, sub = '', type = '') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `<b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, type === 'warn' ? 4200 : 3400);
  },

  modal(title, html, actions = []) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = html;
    this.modalActs = actions;
    $('#modal-actions').innerHTML = actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-act="modalAct" data-arg="${i}">${esc(a.label)}</button>`).join('');
    $('#modal').hidden = false;
    const first = $('#modal-actions .btn.primary') || $('#modal-actions .btn');
    if (first) first.focus();
  },

  closeModal() {
    $('#modal').hidden = true;
    this.modalActs = [];
  },

  confirm(title, html, label, fn, danger = true) {
    this.modal(title, html, [{ label: '취소', cls: 'ghost', fn: () => {} }, { label, cls: danger ? 'danger' : 'primary', fn }]);
  },

  showTab(tab) {
    this.tab = tab;
    this.S.ui.tab = tab;
    $$('.tab').forEach(s => { s.hidden = s.id !== 'tab-' + tab; });
    $$('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.arg === tab ? 'true' : 'false'));
    if (tab === 'news') $('#news-dot').hidden = true;
    this.update(true);
  },

  syncToggles() {
    const S = this.S, ui = S.ui;
    $$('#coin-filter button').forEach(b => b.setAttribute('aria-pressed', b.dataset.arg === ui.filter));
    $$('#news-filter button').forEach(b => b.setAttribute('aria-pressed', b.dataset.arg === ui.newsFilter));
    $$('#tf-seg button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.arg === ui.tf));
    $$('#ind-seg button').forEach(b => b.setAttribute('aria-pressed', !!ui.ind[b.dataset.arg]));
    $$('#otabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.arg === ui.otab));
    $$('.oform').forEach(f => { f.hidden = f.dataset.o !== ui.otab; });
    $$('#btabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.arg === ui.btab));
    $$('#lim-side button').forEach(b => b.setAttribute('aria-pressed', b.dataset.arg === ui.limSide));
    $$('#fut-side button').forEach(b => b.setAttribute('aria-pressed', b.dataset.arg === ui.futSide));
    $$('#mine-coin button').forEach(b => b.setAttribute('aria-pressed', b.dataset.arg === S.mineCoin));
    $$('#stock-qty button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.arg === ui.stockQty));
    $$('#biz-qty button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.arg) === String(ui.bizQty)));
    $$('#set-colors button').forEach(b => b.setAttribute('aria-pressed', b.dataset.arg === S.settings.colors));
    const sfx = $('#btn-sfx'), bgm = $('#btn-bgm');
    sfx.setAttribute('aria-pressed', S.settings.sfxOn);
    bgm.setAttribute('aria-pressed', S.settings.bgmOn);
    const lb = $('#lim-btn');
    lb.className = 'obtn ' + (ui.limSide === 'buy' ? 'buy' : 'sell');
    lb.textContent = ui.limSide === 'buy' ? '지정가 매수 주문' : '지정가 매도 주문';
    const fb = $('#fut-btn');
    fb.className = 'obtn ' + (ui.futSide === 'long' ? 'buy' : 'sell');
    fb.textContent = ui.futSide === 'long' ? '롱 포지션 열기' : '숏 포지션 열기';
  },

  /* ---------- 매 틱 갱신 ---------- */
  update(force = false) {
    this.updateHud();
    const t = this.tab;
    if (t === 'ex') this.updateEx(force);
    else if (t === 'mgr') this.updateMgr(force);
    else if (t === 'mine') this.updateMine(force);
    else if (t === 'news') this.updateNews(force);
    else if (t === 'stock') this.updateStock(force);
    else if (t === 'realty') this.updateRealty(force);
    else if (t === 'biz') this.updateBiz(force);
    else if (t === 'life') this.updateLife(force);
    else if (t === 'me') this.updateMe(force);
  },

  updateHud() {
    const S = this.S;
    const nw = Wealth.net(S);
    setT($('#hud-nw'), won(nw));
    const h = S.nwHist;
    const ref = h.length > 8 ? h[h.length - 8][1] : (h[0] ? h[0][1] : nw);
    const ch = ref ? nw / ref - 1 : 0;
    const el = $('#hud-nwchg');
    setT(el, h.length ? fmtPct(ch) : '');
    setC(el, signCls(ch));
    setT($('#hud-cash'), won(S.cash));
    setT($('#hud-ips'), won(Wealth.perTick(S), true) + '/초');
    const fg = $('#hud-fg');
    setT(fg, `${Math.round(S.fg)} ${fgLabel(S.fg)}`);
    setC(fg, S.fg >= 55 ? 'up' : S.fg <= 45 ? 'down' : '');
    setT($('#hud-time'), gameClock(S.t).str);
    const r = Engine.rank(S);
    setT($('#rank-name'), r.name);
    $('#rank-fill').style.width = r.next ? `${clamp((Math.log10(Math.max(1, nw)) - Math.log10(Math.max(1, r.at))) / (Math.log10(r.next[0]) - Math.log10(Math.max(1, r.at))) * 100, 0, 100)}%` : '100%';
  },

  renderTicker() {
    const S = this.S;
    const items = S.news.slice(0, 10);
    if (!items.length) { setH($('#ticker'), '<span>시장이 열렸습니다. 첫 뉴스를 기다리는 중…</span>'); return; }
    setH($('#ticker'), items.map(n => {
      const tag = n.cat === 'yt' ? '유튜브' : n.cat === 'kr' ? '국내' : '해외';
      const cls = n.tone > 0 ? 'up' : n.tone < 0 ? 'down' : 'flat';
      return `<span><b class="${cls}">${n.big ? '속보' : tag}</b>${esc(n.title)}</span>`;
    }).join(''));
  },

  /* ================= 거래소 ================= */
  onSelChange() {
    const S = this.S;
    const sym = S.ui.sel;
    $('#coin-head')._sym = null;
    for (const id of ['sell-unit', 'lim-unit', 'stake-unit']) setT($('#' + id), sym);
    $('#lim-price').value = fmtPrice(S.coins[sym].p).replace(/,/g, '');
    $('#sell-qty').value = '';
    $('#lim-qty').value = '';
    $('#stake-qty').value = '';
    const rule = S.rules[sym];
    $('#rule-tp').value = rule && rule.tp ? +(rule.tp * 100).toFixed(2) : '';
    $('#rule-sl').value = rule && rule.sl ? +(rule.sl * 100).toFixed(2) : '';
    $('#coin-rows')._sig = null;
    this.update(true);
  },

  coinListItems() {
    const S = this.S, ui = S.ui;
    const q = (ui.search || '').trim().toLowerCase();
    return COINS.filter(d => {
      if (q && !(d.name.includes(q) || d.sym.toLowerCase().includes(q) || d.en.toLowerCase().includes(q))) return false;
      switch (ui.filter) {
        case 'own': return (S.hold[d.sym]?.q || 0) > 0 || (S.staked[d.sym]?.q || 0) > 0;
        case 'fav': return ui.fav.includes(d.sym);
        case 'major': return d.tags.includes('major');
        case 'alt': return d.tags.includes('alt');
        case 'meme': return d.tags.includes('meme');
        case 'fict': return d.tags.includes('fict');
      }
      return true;
    });
  },

  updateCoinList() {
    const S = this.S;
    const items = this.coinListItems();
    syncList($('#coin-rows'), items, d => d.sym + (S.ui.fav.includes(d.sym) ? '*' : '') + (S.ui.sel === d.sym ? '!' : ''), d => `
      <div class="cl-row" data-key="${d.sym}${S.ui.fav.includes(d.sym) ? '*' : ''}${S.ui.sel === d.sym ? '!' : ''}" data-act="sel" data-arg="${d.sym}" aria-current="${S.ui.sel === d.sym}">
        <div class="cl-name"><button class="star" data-act="fav" data-arg="${d.sym}" aria-pressed="${S.ui.fav.includes(d.sym)}" aria-label="관심 코인">★</button><div><b>${d.name}</b><small>${d.sym}/KRW</small></div></div>
        <span class="num px" data-f="px"></span><span class="num" data-f="chg"></span><span class="num vol" data-f="vol"></span>
      </div>`, (el, d) => {
      const f = F(el);
      const c = S.coins[d.sym];
      const st = Market.stats24(S, d.sym);
      setT(f.px, fmtPrice(c.p));
      setC(f.px, 'num px ' + pctCls(st.chg));
      setT(f.chg, fmtPct(st.chg));
      setC(f.chg, 'num ' + pctCls(st.chg));
      setT(f.vol, won(st.vol, true).replace('₩', ''));
      if (el._lp && el._lp !== c.p) {
        el.classList.remove('flash-up', 'flash-down');
        void el.offsetWidth;
        el.classList.add(c.p > el._lp ? 'flash-up' : 'flash-down');
      }
      el._lp = c.p;
    }, '<p class="empty">조건에 맞는 코인이 없습니다</p>');
    let vol = 0, cap = 0;
    for (const d of COINS) { vol += Market.stats24(S, d.sym).vol; cap += Market.mcap(S, d.sym); }
    setH($('#market-foot'), `<span>김치 프리미엄</span><b class="${S.kp >= 0 ? 'up' : 'down'}">${fmtPct(S.kp)}</b><span>원/달러</span><b>${S.fx.toFixed(1)}</b><span>24시간 거래대금</span><b>${won(vol, true)}</b><span>전체 시가총액</span><b>${won(cap, true)}</b>`);
  },

  updateCoinHead() {
    const S = this.S, sym = S.ui.sel, d = COIN[sym], c = S.coins[sym];
    const box = $('#coin-head');
    if (box._sym !== sym || box._fav !== S.ui.fav.includes(sym)) {
      box._sym = sym;
      box._fav = S.ui.fav.includes(sym);
      box._f = null;
      const refs = d.real
        ? `<div class="reflinks"><a href="${REF.newsKR(d.name + ' 코인')}" target="_blank" rel="noopener">국내 뉴스</a><a href="${REF.newsGL(d.en + ' crypto')}" target="_blank" rel="noopener">해외 뉴스</a><a href="${REF.yt(d.name + ' 뉴스')}" target="_blank" rel="noopener">유튜브 영상</a></div>`
        : '<span class="tag">가상 코인 · 실제 뉴스 없음</span>';
      box.innerHTML = `
        <div class="ch-id">${logoHTML(sym, true)}<div><h1>${d.name}</h1><span class="sym">${sym}/KRW · ${d.en}</span></div></div>
        <div class="ch-price"><span class="big" data-f="px"></span><span class="chg" data-f="chg"></span></div>
        <div class="ch-badges">
          <button class="btn ghost" data-act="fav" data-arg="${sym}" aria-pressed="${box._fav}">${box._fav ? '★ 관심' : '☆ 관심 추가'}</button>
        </div>
        <div class="ch-stats">
          <div><span>24시간 고가</span><b class="up" data-f="hi"></b></div>
          <div><span>24시간 저가</span><b class="down" data-f="lo"></b></div>
          <div><span>거래대금(24H)</span><b data-f="vol"></b></div>
          <div><span>시가총액</span><b data-f="cap"></b></div>
          <div><span>해외 시세</span><b data-f="usd"></b></div>
          <div><span>김치 프리미엄</span><b data-f="kp"></b></div>
          <div><span>사상 최고가</span><b data-f="ath"></b></div>
          <div><span>일 변동성</span><b>${(d.vol * 100).toFixed(1)}%</b></div>
        </div>
        <div class="ch-desc"><span>${d.desc} <span data-f="badges"></span></span>${refs}</div>`;
    }
    const f = F(box);
    const st = Market.stats24(S, sym);
    setT(f.px, fmtPrice(c.p));
    setC(f.px, 'big ' + pctCls(st.chg));
    setT(f.chg, `${fmtPct(st.chg)} ${st.chg >= 0 ? '▲' : '▼'} ${fmtPrice(Math.abs(c.p - st.open))}`);
    setC(f.chg, 'chg ' + pctCls(st.chg));
    setT(f.hi, fmtPrice(st.hi));
    setT(f.lo, fmtPrice(st.lo));
    setT(f.vol, won(st.vol, true));
    setT(f.cap, won(Market.mcap(S, sym), true));
    const usd = Market.usd(S, sym);
    setT(f.usd, '$' + (usd >= 1 ? usd.toLocaleString('en-US', { maximumFractionDigits: 2 }) : usd.toPrecision(4)));
    setT(f.kp, fmtPct(S.kp));
    setT(f.ath, fmtPrice(c.ath));
    const badges = [];
    if (c.warn > S.t) badges.push('<span class="tag warn">투자유의</span>');
    if (d.fut) badges.push('<span class="tag">선물</span>');
    if (d.stake) badges.push(`<span class="tag gold">스테이킹 일 ${(d.stake * 100).toFixed(2)}%</span>`);
    if (d.rug) badges.push('<span class="tag warn">러그풀 위험</span>');
    if (MINE_COINS.includes(sym)) badges.push('<span class="tag">채굴 가능</span>');
    setH(f.badges, badges.join(' '));
  },

  updateOrderForm() {
    const S = this.S, sym = S.ui.sel, c = S.coins[sym], d = COIN[sym];
    const h = S.hold[sym];
    const fee = Trade.feeRate(S);
    setT($('#buy-avail'), won(S.cash));
    setT($('#sell-avail'), `${fmtQty(h?.q || 0)} ${sym}`);
    const o = S.ui.otab;
    if (o === 'buy') {
      const krw = parseAmount($('#buy-amt').value);
      if (krw > 0) {
        const q = Trade.quoteBuy(S, sym, Math.min(krw, S.cash));
        setH($('#buy-est'), `<div><span>예상 체결 수량</span><b>${fmtQty(q.q)} ${sym}</b></div><div><span>예상 평균가</span><b>${fmtPrice(q.avg)}</b></div><div><span>슬리피지 · 수수료(${(fee * 100).toFixed(3)}%)</span><b>${(q.slip * 100).toFixed(3)}% · ${won(q.fee)}</b></div>${krw > S.cash ? '<div class="warn-text"><span>보유 현금까지만 매수됩니다</span></div>' : ''}`);
      } else setH($('#buy-est'), '');
    } else if (o === 'sell') {
      const q = parseQty($('#sell-qty').value);
      if (q > 0 && h) {
        const r = Trade.quoteSell(S, sym, Math.min(q, h.q));
        const cost = h.cost * Math.min(1, q / h.q);
        const pnl = r.krw - cost;
        setH($('#sell-est'), `<div><span>예상 수령액</span><b>${won(r.krw)}</b></div><div><span>예상 평균가 · 슬리피지</span><b>${fmtPrice(r.avg)} · ${(r.slip * 100).toFixed(3)}%</b></div><div><span>예상 실현손익</span><b class="${signCls(pnl)}">${signedWon(pnl)} (${fmtPct(cost ? pnl / cost : 0)})</b></div>`);
      } else setH($('#sell-est'), '');
    } else if (o === 'limit') {
      const p = parseQty($('#lim-price').value), q = parseQty($('#lim-qty').value);
      if (p > 0 && q > 0) {
        const tot = p * q;
        const diff = p / c.p - 1;
        setH($('#lim-est'), `<div><span>주문 총액</span><b>${won(tot)}</b></div><div><span>현재가 대비</span><b class="${signCls(diff)}">${fmtPct(diff)}</b></div><div><span>호가 단위</span><b>${fmtPrice(tickSize(p))}원</b></div>`);
      } else setH($('#lim-est'), `<div><span>호가 단위</span><b>${fmtPrice(tickSize(c.p))}원</b></div>`);
    } else if (o === 'fut') {
      $('#fut-na').hidden = !!d.fut;
      $('#fut-body').hidden = !d.fut;
      const lev = +$('#fut-lev').value;
      setT($('#fut-lev-v'), lev + 'x');
      const m = parseAmount($('#fut-margin').value);
      if (d.fut && m > 0) {
        const side = S.ui.futSide;
        const entry = c.p * (side === 'long' ? 1.0002 : 0.9998);
        const fake = { side, entry, margin: m, q: m * lev / entry };
        const liq = Trade.liqPrice(fake);
        setH($('#fut-est'), `<div><span>포지션 규모</span><b>${won(m * lev)}</b></div><div><span>예상 진입가</span><b>${fmtPrice(entry)}</b></div><div><span>청산가</span><b class="warn-text">${fmtPrice(liq)} (${fmtPct(liq / c.p - 1)})</b></div><div><span>진입 수수료</span><b>${won(m * lev * FUT_FEE)}</b></div>`);
      } else setH($('#fut-est'), d.fut ? '<div><span>최대 레버리지</span><b>25x</b></div><div><span>펀딩비</span><b>8시간마다 · 탐욕 시 롱 부담</b></div>' : '');
    } else if (o === 'stake') {
      $('#stake-na').hidden = !!d.stake;
      $('#stake-body').hidden = !d.stake;
      if (d.stake) {
        const st = S.staked[sym];
        setT($('#stake-rate'), `${(d.stake * 100).toFixed(2)}% (매일 복리)`);
        setT($('#stake-cur'), `${fmtQty(st?.q || 0)} ${sym} · ${won((st?.q || 0) * c.p, true)}`);
        setT($('#stake-earn'), `${fmtQty(S.stakeEarned[sym] || 0)} ${sym}`);
      }
    } else if (o === 'rule') {
      const rule = S.rules[sym];
      const avg = h ? h.cost / h.q : 0;
      const tp = parseQty($('#rule-tp').value) / 100, sl = parseQty($('#rule-sl').value) / 100;
      let html = '';
      if (!h) html += '<div class="warn-text"><span>보유 중일 때만 동작합니다</span></div>';
      else {
        html += `<div><span>평균단가 · 현재 수익률</span><b class="${signCls(c.p / avg - 1)}">${fmtPrice(avg)} · ${fmtPct(c.p / avg - 1)}</b></div>`;
        if (tp > 0) html += `<div><span>익절가</span><b class="up">${fmtPrice(avg * (1 + tp))}</b></div>`;
        if (sl > 0) html += `<div><span>손절가</span><b class="down">${fmtPrice(avg * (1 - sl))}</b></div>`;
      }
      html += `<div><span>현재 예약</span><b>${rule ? `익절 ${rule.tp ? fmtPct(rule.tp) : '-'} / 손절 ${rule.sl ? '-' + (rule.sl * 100).toFixed(1) + '%' : '-'}` : '없음'}</b></div>`;
      setH($('#rule-est'), html);
    }
  },

  updateMyPos() {
    const S = this.S, sym = S.ui.sel, c = S.coins[sym];
    const h = S.hold[sym], st = S.staked[sym];
    const q = (h?.q || 0), cost = (h?.cost || 0);
    const val = q * c.p;
    const pnl = val - cost;
    const ret = cost ? pnl / cost : 0;
    let mq = 0, mv = 0;
    for (const m of S.managers) if (m.pos[sym]) { mq += m.pos[sym].q; mv += m.pos[sym].q * c.p; }
    const futs = S.futures.filter(f => f.sym === sym);
    let html = `<div class="mp-head"><h3>내 ${COIN[sym].name}</h3><span class="tag">${S.rules[sym] ? '예약매도 켜짐' : '예약 없음'}</span></div>`;
    if (q > 0) {
      html += `<div class="mp-pnl ${signCls(pnl)}">${signedWon(pnl)} <small>${fmtPct(ret)}</small></div>`;
    } else html += '<p class="muted small" style="margin:0">아직 보유하지 않았습니다. 매수하거나 채굴 탭에서 캐보세요.</p>';
    html += `<div class="kv">
      <span>보유 수량</span><b>${fmtQty(q)} ${sym}</b>
      <span>평균 단가</span><b>${q ? fmtPrice(cost / q) : '-'}</b>
      <span>매수 금액</span><b>${won(cost)}</b>
      <span>평가 금액</span><b>${won(val)}</b>`;
    if (st) html += `<hr><span>스테이킹</span><b>${fmtQty(st.q)} · ${won(st.q * c.p, true)}</b>`;
    if (mq > 0) html += `<span>매니저 운용분</span><b>${fmtQty(mq)} · ${won(mv, true)}</b>`;
    for (const f of futs) {
      const pnlF = Trade.futPnl(S, f);
      html += `<span>${f.side === 'long' ? '롱' : '숏'} ${f.lev}x</span><b class="${signCls(pnlF)}">${signedWon(pnlF, true)} (${fmtPct(pnlF / f.margin)})</b>`;
    }
    html += '</div>';
    setH($('#mypos'), html);
  },

  buildOrderBook() {
    let html = '<div class="ob">';
    for (let i = 9; i >= 0; i--) html += `<div class="ob-row ask" data-act="obPick" data-ob="a${i}"><i></i><span></span><span></span></div>`;
    html += '<div class="ob-mid"><span data-ob="mid"></span><span data-ob="mchg"></span></div>';
    for (let i = 0; i < 10; i++) html += `<div class="ob-row bid" data-act="obPick" data-ob="b${i}"><i></i><span></span><span></span></div>`;
    html += '</div>';
    $('#ob').innerHTML = html;
    this.obEls = {};
    $$('#ob [data-ob]').forEach(el => { this.obEls[el.dataset.ob] = el; });
  },

  updateOrderBook() {
    const S = this.S, sym = S.ui.sel;
    const ob = Market.orderbook(S, sym, 10);
    let max = 0;
    for (const x of ob.asks.concat(ob.bids)) max = Math.max(max, x.q);
    const fill = (el, x) => {
      el.dataset.arg = x.p;
      el.children[0].style.width = (x.q / max * 100).toFixed(1) + '%';
      setT(el.children[1], fmtPrice(x.p));
      setT(el.children[2], fmtQty(x.q));
    };
    ob.asks.forEach((x, i) => fill(this.obEls['a' + i], x));
    ob.bids.forEach((x, i) => fill(this.obEls['b' + i], x));
    const st = Market.stats24(S, sym);
    setT(this.obEls.mid, fmtPrice(S.coins[sym].p));
    setC(this.obEls.mid, pctCls(st.chg));
    setT(this.obEls.mchg, fmtPct(st.chg));
    setC(this.obEls.mchg, pctCls(st.chg));
    const c = S.coins[sym];
    if (c.tape._t !== S.t) { Market.tapeTick(S, sym); c.tape._t = S.t; }
    setH($('#tape'), '<div class="tape">' + c.tape.slice(0, 14).map(x => `<div class="tape-row"><span class="${x.side === 'buy' ? 'up' : 'down'}">${fmtPrice(x.p)}</span><span>${fmtQty(x.q)}</span><span>${gameClock(x.t).str.slice(-5)}</span></div>`).join('') + '</div>');
  },

  updateBottom() {
    const S = this.S, sym = S.ui.sel;
    setT($('#cnt-orders'), S.orders.length ? `(${S.orders.length})` : '');
    setT($('#cnt-futs'), S.futures.length ? `(${S.futures.length})` : '');
    const box = $('#bpanel');
    const tab = S.ui.btab;
    if (box._tab !== tab) { box._tab = tab; box._built = null; box._h = null; box._ck = null; box.innerHTML = ''; }
    const table = (head, emptyMsg) => {
      if (box._built !== tab) {
        box._built = tab;
        box._h = null;
        box.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody></tbody></table></div><p class="empty" data-empty>${emptyMsg}</p>`;
      }
      return [box.querySelector('tbody'), box.querySelector('.tbl-wrap'), box.querySelector('[data-empty]')];
    };
    if (tab === 'orders') {
      const [tb, wrap, em] = table('<th>코인</th><th>구분</th><th class="num">주문가</th><th class="num">수량</th><th class="num">현재가 대비</th><th></th>', '미체결 주문이 없습니다. 지정가 탭에서 원하는 가격에 주문을 걸어두세요.');
      const rows = S.orders.slice().reverse();
      wrap.hidden = !rows.length; em.hidden = !!rows.length;
      syncList(tb, rows, o => o.id, o => `<tr data-key="${o.id}">
          <td><span class="name">${logoHTML(o.sym)} ${COIN[o.sym].name}</span></td>
          <td><span class="tag ${o.side === 'buy' ? 'up' : 'down'}">${o.side === 'buy' ? '매수' : '매도'}</span></td>
          <td class="num">${fmtPrice(o.price)}</td><td class="num">${fmtQty(o.q)}</td>
          <td class="num" data-f="gap"></td>
          <td class="act"><button class="btn" data-act="cancelOrder" data-arg="${o.id}">취소</button></td></tr>`,
        (el, o) => { const g = o.price / S.coins[o.sym].p - 1; setT(F(el).gap, fmtPct(g)); setC(F(el).gap, 'num ' + signCls(g)); });
    } else if (tab === 'futs') {
      const [tb, wrap, em] = table('<th>코인</th><th>포지션</th><th class="num">진입가</th><th class="num">청산가</th><th class="num">증거금</th><th class="num">손익 (ROE)</th><th></th>', '열린 선물 포지션이 없습니다.');
      wrap.hidden = !S.futures.length; em.hidden = !!S.futures.length;
      syncList(tb, S.futures, f => f.id, f => `<tr data-key="${f.id}">
          <td><span class="name">${logoHTML(f.sym)} ${f.sym}</span></td>
          <td><span class="tag ${f.side === 'long' ? 'up' : 'down'}">${f.side === 'long' ? '롱' : '숏'} ${f.lev}x</span></td>
          <td class="num">${fmtPrice(f.entry)}</td><td class="num warn-text" data-f="liq"></td>
          <td class="num" data-f="m"></td><td class="num" data-f="pnl"></td>
          <td class="act"><button class="btn" data-act="closeFut" data-arg="${f.id}">시장가 종료</button></td></tr>`,
        (el, f) => {
          const ff = F(el);
          const pnl = Trade.futPnl(S, f);
          setT(ff.liq, fmtPrice(Trade.liqPrice(f)));
          setT(ff.m, won(f.margin, true));
          setT(ff.pnl, `${signedWon(pnl, true)} (${fmtPct(pnl / f.margin)})`);
          setC(ff.pnl, 'num ' + signCls(pnl));
        });
    } else if (tab === 'hist') {
      const rows = S.log.slice(0, 40);
      setH(box, rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>시각</th><th>종목</th><th>구분</th><th class="num">가격</th><th class="num">수량</th><th class="num">금액</th><th class="num">실현손익</th><th>주체</th></tr></thead><tbody>${rows.map(e => {
        const name = e.kind === 'coin' || e.kind === 'fut' ? e.sym : e.kind === 'stock' ? (STOCK[e.sym] ? STOCK[e.sym].name : e.sym) : e.kind === 'realty' ? (PROPS.find(p => p.id === e.sym) || {}).name || e.sym : e.sym;
        return `<tr><td class="mono">${gameClock(e.t).str}</td><td>${esc(name)}</td><td><span class="tag ${e.side === 'buy' ? 'up' : 'down'}">${e.side === 'buy' ? '매수' : '매도'}</span></td><td class="num">${e.kind === 'coin' || e.kind === 'fut' ? fmtPrice(e.p) : won(e.p, true)}</td><td class="num">${fmtQty(e.q)}</td><td class="num">${won(e.krw, true)}</td><td class="num ${e.pnl != null ? signCls(e.pnl) : ''}">${e.pnl != null ? signedWon(e.pnl, true) : '-'}</td><td>${esc(e.who || '')}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="empty">아직 거래 내역이 없습니다.</p>');
    } else if (tab === 'cnews') {
      const rows = S.news.filter(n => (n.coins || []).includes(sym)).slice(0, 8);
      const key = rows.map(n => n.id).join(',') + sym;
      if (box._ck !== key) { box._ck = key; box.innerHTML = rows.length ? rows.map(n => this.newsItemHTML(n, true)).join('') : '<p class="empty">아직 이 코인 관련 뉴스가 없습니다.</p>'; }
      $$('#bpanel .news-item').forEach(el => this.updateNewsItem(el, S.news.find(n => String(n.id) === el.dataset.key)));
    }
  },

  updateEx() {
    this.updateCoinList();
    this.updateCoinHead();
    Game.drawChart();
    this.updateOrderForm();
    this.updateMyPos();
    this.updateOrderBook();
    this.updateBottom();
  },

  /* ================= 매니저 ================= */
  updateMgr() {
    const S = this.S;
    let aum = 0, pnl = 0, sal = 0;
    for (const m of S.managers) {
      aum += Mgr.value(S, m);
      pnl += m.role === 'trade' ? Mgr.value(S, m) - m.inv : m.stats.pnl;
      sal += Mgr.salary(S, m);
    }
    const top = $('#mgr-top');
    if (!top._built) {
      top._built = true;
      top.innerHTML = `
        <div class="stat"><span>운용 자산</span><b data-f="aum"></b></div>
        <div class="stat"><span>누적 손익</span><b data-f="pnl"></b></div>
        <div class="stat"><span>하루 급여 합계</span><b data-f="sal"></b></div>
        <div class="stat"><span>고용 인원</span><b data-f="cnt"></b></div>
        <div class="mgr-roles">${Object.entries(ROLES).map(([k, r]) => `<div><b>${r.name}</b> · ${r.desc}</div>`).join('')}<div><b>급여</b> · 하루(2분)마다 현금에서 나갑니다. 현금이 없으면 운용자금에서, 그것도 없으면 퇴사합니다.</div></div>`;
    }
    const f = F(top);
    setT(f.aum, won(aum));
    setT(f.pnl, signedWon(pnl));
    setC(f.pnl, signCls(pnl));
    setT(f.sal, won(sal) + '/일');
    setT(f.cnt, `${S.managers.length} / ${MGR_MAX}명`);
    setT($('#mgr-count'), S.managers.length ? '담당 코인과 역할을 지정하고 자금을 맡기세요' : '');

    const coinOpts = (sel, auto) => (auto ? `<option value="AUTO"${sel === 'AUTO' ? ' selected' : ''}>자동 선별</option>` : '') + COINS.map(d => `<option value="${d.sym}"${sel === d.sym ? ' selected' : ''}>${d.name} (${d.sym})</option>`).join('');
    syncList($('#mgr-list'), S.managers, m => `${m.id}:${m.role}:${m.target}:${m.active}:${m.lv}`, m => {
      const st = STRATS[m.strat];
      const pctOpts = [0.1, 0.25, 0.5, 1].map(p => `<option value="${p}"${m.tradePct === p ? ' selected' : ''}>${p * 100}%</option>`).join('');
      const fundLabel = m.role === 'buy' ? '매수 예산' : '운용자금';
      return `<div class="card${m.active ? '' : ' paused'}" data-key="${m.id}:${m.role}:${m.target}:${m.active}:${m.lv}">
        <div class="person">${avatarHTML(m.name, m.hue)}<div><h4>${esc(m.name)} <span class="tag gold">Lv.${m.lv}</span> ${starsHTML(m.skill)}</h4><p>${st.name} · ${esc(m.bg)}</p></div></div>
        <p class="quote">"${esc(m.quote)}" ${st.desc}</p>
        <div class="ctrl-grid">
          <label class="ctrl">역할<select data-mact="role" data-id="${m.id}">${Object.entries(ROLES).map(([k, r]) => `<option value="${k}"${m.role === k ? ' selected' : ''}>${r.name}</option>`).join('')}</select></label>
          <label class="ctrl">담당 코인<select data-mact="target" data-id="${m.id}">${coinOpts(m.target, m.role === 'trade')}</select></label>
          <label class="ctrl">${m.role === 'sell' ? '1회 매도 비중' : '1회 매수 비중'}<select data-mact="tradePct" data-id="${m.id}">${pctOpts}</select></label>
          <label class="ctrl">익절 / 손절 (%)<span class="fund"><input data-mact="tp" data-id="${m.id}" value="${+(m.tp * 100).toFixed(1)}" inputmode="decimal" aria-label="익절 %"><input data-mact="sl" data-id="${m.id}" value="${+(m.sl * 100).toFixed(1)}" inputmode="decimal" aria-label="손절 %"></span></label>
        </div>
        <div class="kv" data-f="kv"></div>
        ${m.role === 'sell' ? `<p class="muted small" style="margin:0">내 지갑의 ${m.target === 'AUTO' ? '선택 중인 코인' : COIN[m.target].name}을 대신 팝니다. 자금은 필요 없습니다.</p>` : `
        <div class="fund"><input id="fund-${m.id}" placeholder="${fundLabel} 금액 (예: 1000만)" inputmode="decimal" autocomplete="off"><button class="btn" data-act="mDeposit" data-arg="${m.id}">입금</button><button class="btn ghost" data-act="mWithdraw" data-arg="${m.id}">출금</button></div>`}
        <div class="mlog" data-f="log"></div>
        <div class="btn-row">
          <button class="btn ghost" data-act="mToggle" data-arg="${m.id}">${m.active ? '일시정지' : '업무 재개'}</button>
          ${m.role === 'trade' ? `<button class="btn ghost" data-act="mSellAll" data-arg="${m.id}">전량 매도</button>` : ''}
          <button class="btn danger" data-act="mFire" data-arg="${m.id}">해고</button>
        </div>
      </div>`;
    }, (el, m) => {
      const f = F(el);
      const v = Mgr.value(S, m);
      let kv = '';
      if (m.role === 'trade') {
        const pos = Object.entries(m.pos).map(([s, p]) => `${s} ${fmtPct(S.coins[s].p / (p.cost / p.q) - 1)}`).join(', ') || '없음';
        const p = v - m.inv;
        kv = `<span>운용자금 (현금)</span><b>${won(m.cash)}</b><span>보유 포지션</span><b>${esc(pos)}</b><span>평가 총액 · 손익</span><b class="${signCls(p)}">${won(v, true)} · ${signedWon(p, true)}</b>`;
      } else if (m.role === 'buy') {
        const avg = m.stats.bq ? m.stats.bkrw / m.stats.bq : 0;
        const bench = m.stats.benchN ? m.stats.bench / m.stats.benchN : 0;
        const eff = avg && bench ? 1 - avg / bench : 0;
        kv = `<span>남은 예산</span><b>${won(m.cash)}</b><span>매수 누적</span><b>${won(m.stats.bkrw, true)} · 평균 ${avg ? fmtPrice(avg) : '-'}</b><span>시장 평균가 대비</span><b class="${signCls(eff)}">${avg ? (eff >= 0 ? fmtPct(eff).replace('+', '') + ' 싸게' : fmtPct(-eff).replace('+', '') + ' 비싸게') : '-'}</b>`;
      } else {
        kv = `<span>매도 누적</span><b>${won(m.stats.sold, true)}</b><span>실현 손익</span><b class="${signCls(m.stats.pnl)}">${signedWon(m.stats.pnl, true)}</b>`;
      }
      kv += `<span>거래 · 승률</span><b>${m.stats.trades}회 · ${m.stats.trades ? Math.round(m.stats.wins / m.stats.trades * 100) : 0}%</b><span>일급</span><b>${won(Mgr.salary(S, m))}</b><span>경험치</span><b>${m.xp} / ${m.lv * 70}</b>`;
      setH(f.kv, kv);
      setH(f.log, m.log.length ? m.log.slice(0, 4).map(l => `<div><time>${gameClock(l.t).str.slice(-5)}</time>${esc(l.text)}</div>`).join('') : `<div>${m.active ? '시장을 지켜보는 중…' : '쉬는 중'}</div>`);
    }, '<p class="empty">아직 매니저가 없습니다. 아래 지원자 중에서 고용하세요.</p>');

    const left = S.candNext - S.t;
    setT($('#cand-timer'), `새 지원자까지 ${ticksToText(left)}`);
    const rc = Mgr.refreshCost(S);
    setT($('#cand-refresh'), rc ? `헤드헌터 호출 ${won(rc, true)}` : '헤드헌터 호출 (오늘 무료)');
    syncList($('#cand-list'), S.cands, c => c.id, c => {
      const st = STRATS[c.strat];
      return `<div class="card" data-key="${c.id}">
        <div class="person">${avatarHTML(c.name, c.hue)}<div><h4>${esc(c.name)} ${starsHTML(c.skill)}</h4><p>${st.name} · ${esc(c.bg)}</p></div></div>
        <p class="quote">"${esc(c.quote)}"</p>
        <div class="kv"><span>실력</span><b>${c.skill.toFixed(1)} / 5</b><span>일급</span><b>${won(c.salary)}</b><span>계약금</span><b>${won(c.salary * 2)}</b></div>
        <button class="btn primary" data-act="hire" data-arg="${c.id}" data-f="btn">고용하기</button>
      </div>`;
    }, (el, c) => { F(el).btn.disabled = S.cash < c.salary * 2 || S.managers.length >= MGR_MAX; }, '<p class="empty">지원자가 없습니다. 헤드헌터를 불러보세요.</p>');
  },

  onMgrChange(el) {
    const S = this.S;
    const m = Mgr.get(S, +el.dataset.id);
    if (!m) return;
    const k = el.dataset.mact;
    if (k === 'role') {
      m.role = el.value;
      if (m.role !== 'trade' && m.target === 'AUTO') m.target = S.ui.sel;
      if (m.role === 'sell' && m.cash > 0) { this.toast(`${m.name} 매니저의 남은 자금은 그대로 보관됩니다`, '출금 버튼은 역할을 바꾸면 다시 보입니다'); }
    } else if (k === 'target') m.target = el.value;
    else if (k === 'tradePct') m.tradePct = +el.value;
    else if (k === 'tp' || k === 'sl') {
      const v = parseQty(el.value);
      if (v > 0 && v < 1000) m[k] = v / 100;
      else el.value = +(m[k] * 100).toFixed(1);
    }
    Sound.play('click');
    this.updateMgr();
  },

  /* ================= 채굴 ================= */
  updateMine() {
    const S = this.S;
    const sym = S.mineCoin;
    setT($('#tap-sym'), sym);
    const tv = Mining.tapValue(S);
    setH($('#tap-info'), `한 번 탭 = <b>${won(tv)}</b> 어치 ${sym}<br><span class="small">곡괭이 Lv.${S.tapLv} · 누적 탭 ${S.stats.taps.toLocaleString('ko-KR')}회</span>`);
    const up = $('#tapup');
    setT(up, `곡괭이 강화 → ${won(Math.round(3000 * Math.pow(1.45, S.tapLv)))} / 탭 (${won(Mining.tapUpCost(S), true)})`);
    up.disabled = S.cash < Mining.tapUpCost(S);
    const h = Mining.hash(S);
    const day = Mining.yieldKRW(S) * TPD;
    const elec = Mining.elec(S) * TPD;
    const halv = S.sched.halving - S.t;
    setH($('#mine-stats'), `
      <div class="stat"><span>총 해시레이트</span><b>${fmtNum(h)} H/s</b></div>
      <div class="stat"><span>하루 채굴량</span><b>${fmtQty(day / S.coins[sym].p)} ${sym}</b></div>
      <div class="stat"><span>하루 채굴 가치</span><b class="up">${won(day, true)}</b></div>
      <div class="stat"><span>하루 전기요금</span><b class="down">${won(elec, true)}</b></div>
      <div class="stat"><span>채굴 난이도</span><b>${S.diff.toFixed(3)}x</b></div>
      <div class="stat"><span>BTC 반감기까지</span><b>${ticksToText(halv)}</b></div>
      <div class="stat"><span>누적 채굴 가치</span><b>${won(S.stats.mined, true)}</b></div>
      <div class="stat"><span>코인별 채굴 효율</span><b class="wrap">${MINE_COINS.map(s => `${s} ${Mining.coinMult(S, s).toFixed(2)}x`).join('<br>')}</b></div>
      <p class="note">${S.minePaused ? '<b class="warn-text">현금이 부족해 전기요금을 못 내서 채굴이 멈췄습니다.</b> ' : ''}채굴한 코인은 그때 시세를 원가로 지갑에 쌓입니다. BTC는 안정적이지만 반감기마다 효율이 절반이 되고, 김치코인(KMC)은 효율이 가장 높지만 러그풀 위험이 있습니다. 매일 난이도가 0.4%씩 오릅니다.</p>`);
    syncList($('#rig-list'), RIGS, r => r.id, r => `<div class="card rig" data-key="${r.id}">
        <div class="rig-ico">${RIG_ICON[r.id]}</div>
        <h4>${r.name} <small data-f="own"></small></h4>
        <p>${r.desc}</p>
        <p class="mono">${fmtNum(r.h)} H/s · 전기 ${won(r.e * TPD, true)}/일</p>
        <button class="btn primary" data-act="buyRig" data-arg="${r.id}" data-f="btn"></button>
      </div>`, (el, r) => {
      const f = F(el);
      const cost = Mining.rigCost(S, r.id);
      setT(f.own, `${S.rigs[r.id] || 0}대`);
      setT(f.btn, `구매 ${won(cost, true)}`);
      f.btn.disabled = S.cash < cost;
    });
  },

  tapFx(r) {
    const btn = $('#tapcoin');
    btn.classList.remove('bump');
    void btn.offsetWidth;
    btn.classList.add('bump');
    const panel = $('.tap-panel');
    const fl = document.createElement('span');
    fl.className = 'floater';
    fl.textContent = `+${fmtQty(r.q)} ${r.sym}`;
    const br = btn.getBoundingClientRect(), pr = panel.getBoundingClientRect();
    fl.style.left = (br.left - pr.left + br.width / 2 + rand(-40, 40)) + 'px';
    fl.style.top = (br.top - pr.top + rand(10, 60)) + 'px';
    panel.appendChild(fl);
    setTimeout(() => fl.remove(), 900);
  },

  /* ================= 뉴스 ================= */
  newsItemHTML(n, compact = false) {
    const S = this.S;
    const cat = n.cat === 'kr' ? '국내' : n.cat === 'gl' ? '해외' : '유튜브';
    const toneTag = n.tone > 0 ? '<span class="tag up">호재</span>' : n.tone < 0 ? '<span class="tag down">악재</span>' : '<span class="tag">중립</span>';
    const anLv = Life.contactLv(S, 'analyst');
    const ytLv = Life.contactLv(S, 'youtuber');
    let extra = '';
    if (n.big) extra += '<span class="tag warn">속보</span>';
    if (n.rumor) extra += '<span class="tag violet">루머</span>';
    if (n.planned) extra += '<span class="tag gold">귀띔 적중</span>';
    if (anLv >= 1 && n.power) extra += `<span class="tag gold" title="애널리스트 친구의 영향 강도 평가">강도 ${'●'.repeat(n.power)}${'○'.repeat(3 - n.power)}</span>`;
    if (n.cat === 'yt') {
      if (ytLv >= 1 && n.bait) extra += '<span class="tag warn">낚시 주의</span>';
      if (ytLv >= 2 && n.rel != null) extra += `<span class="tag">신뢰도 ${Math.round(n.rel * 100)}%</span>`;
    }
    const chips = (n.coins || []).slice(0, 4).map(s => `<button class="tag" data-act="goCoin" data-arg="${s}">${s} <span class="since" data-since="${s}"></span></button>`).join('');
    if (n.cat === 'yt') {
      const words = n.title.replace(/[\[\]]/g, '').split(/[…!?,.]/)[0].slice(0, 18);
      return `<article class="news-item yt" data-key="${n.id}" data-act="ytOpen" data-arg="${n.id}">
        <div class="thumb" style="background:linear-gradient(135deg,hsl(${n.hue} 70% 38%),hsl(${(n.hue + 40) % 360} 75% 22%))"><span class="play"></span><span class="tt">${esc(words)}</span><span class="dur">${n.dur}</span></div>
        <div><h4>${esc(n.title)}</h4><p>${esc(n.ch)} · 조회수 ${fmtNum(n.views)}회 · <time data-ago></time></p><div class="news-tags">${toneTag}${extra}${chips}</div></div>
      </article>`;
    }
    return `<article class="news-item" data-key="${n.id}">
      <div class="news-meta"><span class="tag">${cat}</span><time data-ago></time></div>
      <div><h4>${esc(n.title)}</h4>${compact ? '' : `<p>${esc(n.body || '')} <span class="muted">— ${esc(n.src)}</span></p>`}<div class="news-tags">${toneTag}${extra}${chips}</div></div>
    </article>`;
  },

  updateNewsItem(el, n) {
    if (!el || !n) return;
    const S = this.S;
    const t = el.querySelector('[data-ago]');
    if (t) setT(t, ago(S, n.t));
    el.querySelectorAll('[data-since]').forEach(sp => {
      const s = sp.dataset.since;
      const p0 = n.p0 && n.p0[s];
      if (!p0) return;
      const ch = S.coins[s].p / p0 - 1;
      setT(sp, fmtPct(ch, 1));
      setC(sp, 'since ' + signCls(ch));
    });
  },

  updateNews(force) {
    const S = this.S;
    const fl = S.ui.newsFilter;
    const items = S.news.filter(n => fl === 'all' || (fl === 'big' ? n.big : n.cat === fl)).slice(0, 50);
    const box = $('#news-list');
    const prevTop = box._top;
    syncList(box, items, n => n.id, n => this.newsItemHTML(n), (el, n) => this.updateNewsItem(el, n), '<p class="empty">아직 뉴스가 없습니다.</p>');
    if (items[0] && prevTop && items[0].id !== prevTop) {
      const el = box.firstElementChild;
      if (el) el.classList.add('fresh');
    }
    box._top = items[0] && items[0].id;

    const gb = $('#fg-big');
    if (!gb._built) { gb._built = true; gb.innerHTML = '<div class="fg-gauge"><canvas id="fg-canvas"></canvas><b data-f="v"></b><span data-f="l"></span></div><p class="muted small">코인 등락률, 뉴스 심리, 시장 국면을 합쳐 계산합니다. 극단적 탐욕은 고점, 극단적 공포는 저점 신호인 경우가 많습니다.</p>'; }
    const gf = F(gb);
    setT(gf.v, String(Math.round(S.fg)));
    setT(gf.l, fgLabel(S.fg));
    Chart.gauge($('#fg-canvas'), S.fg);

    const tips = S.tips;
    setH($('#tips'), tips.length ? tips.map(tp => `<div class="tip"><b>${CONTACTS[tp.who].name}</b><span>${esc(tp.text)}</span><small>${tp.at > S.t ? `약 ${ticksToText(tp.at - S.t)} 뒤` : '이미 나왔을 수도'} · ${COIN[tp.sym].name}</small></div>`).join('')
      : `<p class="muted small" style="margin:0">애널리스트(친밀도 50+), 거래소 임원 · 유튜버 친구(친밀도 85+)가 있으면 큰 뉴스를 미리 귀띔해 줍니다. 라이프 탭에서 인맥을 쌓으세요.</p>`);

    const sc = S.sched;
    setH($('#calendar'), `<div class="cal">
      <div><span>美 FOMC 금리 결정</span><b>${ticksToText(sc.fomc - S.t)} 뒤</b></div>
      <div><span>한국은행 금통위</span><b>${ticksToText(sc.bok - S.t)} 뒤</b></div>
      <div><span>비트코인 반감기</span><b>${ticksToText(sc.halving - S.t)} 뒤</b></div>
      <div><span>기준금리 (한국 / 미국)</span><b>${S.rateKR.toFixed(2)}% / ${S.rateUS.toFixed(2)}%</b></div>
      <div><span>원/달러 환율</span><b>${S.fx.toFixed(1)}</b></div>
      <div><span>김치 프리미엄</span><b class="${signCls(S.kp)}">${fmtPct(S.kp)}</b></div>
    </div>`);
  },

  buildRefs() {
    const opts = COINS.filter(d => d.real).map(d => `<option value="${d.sym}">${d.name} (${d.sym})</option>`).join('');
    $('#refs').innerHTML = `<div class="refs">
      <p class="muted small" style="margin:0">게임 속 뉴스는 가상입니다. 실제 시장 분위기가 궁금하면 아래 링크로 확인하세요. 새 탭에서 열립니다.</p>
      <div><h5>시장 전체</h5><div class="reflinks">
        <a href="${REF.newsKR('비트코인 코인 시황')}" target="_blank" rel="noopener">국내 뉴스</a>
        <a href="${REF.newsGL('crypto market')}" target="_blank" rel="noopener">해외 뉴스</a>
        <a href="${REF.yt('코인 시황 뉴스')}" target="_blank" rel="noopener">유튜브 시황</a>
        <a href="${REF.yt('crypto news today')}" target="_blank" rel="noopener">해외 유튜브</a>
      </div></div>
      <div><h5>코인별</h5><select id="ref-coin" aria-label="참고할 코인">${opts}</select><div class="reflinks" id="ref-coin-links" style="margin-top:6px"></div></div>
    </div>`;
    this.updateRefs();
  },

  updateRefs() {
    const sym = $('#ref-coin').value;
    const d = COIN[sym];
    $('#ref-coin-links').innerHTML = `<a href="${REF.newsKR(d.name + ' 코인')}" target="_blank" rel="noopener">${d.name} 국내 뉴스</a><a href="${REF.newsGL(d.en + ' crypto')}" target="_blank" rel="noopener">${d.en} 해외 뉴스</a><a href="${REF.yt(d.name + ' 전망')}" target="_blank" rel="noopener">유튜브 영상</a>`;
  },

  openVideo(n) {
    const S = this.S;
    const ytLv = Life.contactLv(S, 'youtuber');
    const sym = n.coins[0];
    const d = COIN[sym];
    const p0 = n.p0[sym];
    const ch = S.coins[sym].p / p0 - 1;
    this.modal(n.ch, `
      <div class="thumb" style="aspect-ratio:16/9;font-size:22px;background:linear-gradient(135deg,hsl(${n.hue} 70% 38%),hsl(${(n.hue + 40) % 360} 75% 22%))"><span class="play"></span><span class="tt">${esc(n.title)}</span><span class="dur">${n.dur}</span></div>
      <p style="margin:0"><b>${esc(n.title)}</b><br><span class="muted small">구독자 ${fmtNum(n.subs)}명 · 조회수 ${fmtNum(n.views)}회 · ${ago(S, n.t)}</span></p>
      <div><b class="small">영상 요약 (가상)</b><ul>${n.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
      <p class="small" style="margin:0">영상 공개 뒤 ${d.name}: <b class="${signCls(ch)}">${fmtPct(ch)}</b>${ytLv >= 1 ? (n.bait ? ' · <b class="warn-text">유튜버 친구: "이건 낚시야. 올라도 금방 빠져."</b>' : ' · 유튜버 친구: "이 채널은 비교적 믿을 만해."') : ''}</p>
      <p class="muted small" style="margin:0">게임 속 영상은 가상입니다. 실제 영상은 아래 버튼으로 유튜브에서 찾아볼 수 있습니다.</p>`,
    [{ label: '닫기', cls: 'ghost', fn: () => {} }, ...(d.real ? [{ label: `유튜브에서 "${d.name}" 찾아보기`, cls: 'primary', fn: () => { const a = document.createElement('a'); a.href = REF.yt(d.name + ' 뉴스'); a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); } }] : []), { label: `${sym} 차트 보기`, cls: 'ghost', fn: () => this.acts.goCoin.call(this, sym) }]);
  },

  /* ================= 주식 ================= */
  updateStock() {
    const S = this.S;
    setH($('#idx-row'), ['KR', 'US'].map(m => {
      const ch = Stocks.idxChg(S, m);
      return `<div class="panel idx-card"><div><span>${INDEX_NAME[m]} ${m === 'KR' ? '(국내)' : '(해외)'}</span><br><b class="${signCls(ch)}">${S.idx[m].toFixed(2)}</b> <small class="${signCls(ch)} mono">${fmtPct(ch)}</small></div>${sparkSVG(S.idxHist[m].slice(-48), 110, 40)}</div>`;
    }).join('') + `<div class="panel idx-card"><div><span>기준금리 한국 / 미국</span><br><b>${S.rateKR.toFixed(2)}%</b> <small class="mono">/ ${S.rateUS.toFixed(2)}%</small></div></div>`);
    const q = S.ui.stockQty;
    syncList($('#stock-tbl tbody'), STOCKS, d => d.sym, d => `<tr data-key="${d.sym}">
        <td><div class="name"><span class="tag">${d.mkt === 'KR' ? '국내' : '해외'}</span><div><b>${d.name}</b><br><small>${d.sym} · ${d.sector}</small></div></div></td>
        <td class="num" data-f="p"></td><td class="num" data-f="chg"></td><td class="num">${d.div ? (d.div * 100).toFixed(2) + '%' : '-'}</td>
        <td class="num" data-f="q"></td><td class="num" data-f="pnl"></td>
        <td class="act"><button class="btn" data-act="stockBuy" data-arg="${d.sym}" data-f="b">매수</button> <button class="btn ghost" data-act="stockSell" data-arg="${d.sym}" data-f="s">매도</button></td>
      </tr>`, (el, d) => {
      const f = F(el);
      const s = S.stocks[d.sym];
      const ch = Stocks.chg(S, d.sym);
      const h = S.sHold[d.sym];
      setT(f.p, Math.round(s.p).toLocaleString('ko-KR'));
      setC(f.p, 'num ' + signCls(ch));
      setT(f.chg, fmtPct(ch));
      setC(f.chg, 'num ' + signCls(ch));
      setT(f.q, h ? `${h.q.toLocaleString('ko-KR')}주` : '-');
      const pnl = h ? h.q * s.p - h.cost : 0;
      setT(f.pnl, h ? `${signedWon(pnl, true)} (${fmtPct(pnl / h.cost)})` : '-');
      setC(f.pnl, 'num ' + signCls(pnl));
      f.b.disabled = S.cash < s.p * Math.min(q, 1);
      f.s.disabled = !h;
      setT(f.b, `${q}주 매수`);
    });
  },

  /* ================= 부동산 ================= */
  updateRealty() {
    const S = this.S;
    const ch = Realty.chg(S);
    let val = 0, cnt = 0;
    for (const d of PROPS) { const n = S.props[d.id] || 0; cnt += n; val += n * Realty.sellValue(S, d.id); }
    setH($('#realty-top'), `
      <div class="stat"><span>부동산 지수</span><b class="${signCls(ch)}">${S.re.toFixed(2)} <small class="mono">${fmtPct(ch)}</small></b></div>
      <div class="stat"><span>기준금리 (한국)</span><b>${S.rateKR.toFixed(2)}%</b></div>
      <div class="stat"><span>보유 매물 · 평가액</span><b>${cnt}채 · ${won(val, true)}</b></div>
      <div class="stat"><span>하루 임대수익</span><b class="up">${won(Realty.totalRentPerDay(S), true)}</b></div>
      <div class="stat"><span>취득세 · 중개</span><b>${(Realty.taxRate(S) * 100).toFixed(1)}% · 매도 3%</b></div>`);
    syncList($('#prop-list'), PROPS, d => d.id, (d, i) => `<div class="card prop" data-key="${d.id}">
        <div class="prop-art">${buildingSVG(Math.min(d.floors, 12), 200 + PROPS.indexOf(d) * 17)}<span class="tag gold owned" data-f="own"></span></div>
        <div class="prop-body">
          <h4>${d.name}</h4><p>${d.area} · 임대수익률 하루 ${(d.rent * 100).toFixed(2)}%</p>
          <div class="kv"><span>시세</span><b data-f="v"></b><span>하루 임대료</span><b class="up" data-f="r"></b><span>매수 비용(세금 포함)</span><b data-f="c"></b></div>
          <div class="btn-row"><button class="btn primary" data-act="propBuy" data-arg="${d.id}" data-f="b">매수</button><button class="btn ghost" data-act="propSell" data-arg="${d.id}" data-f="s">매도</button></div>
        </div>
      </div>`, (el, d) => {
      const f = F(el);
      const n = S.props[d.id] || 0;
      setT(f.own, n ? `${n}채 보유` : '');
      f.own.hidden = !n;
      setT(f.v, won(Realty.value(S, d.id), true));
      setT(f.r, won(Realty.rentPerDay(S, d.id), true));
      const cost = Realty.buyCost(S, d.id);
      setT(f.c, won(cost, true));
      f.b.disabled = S.cash < cost;
      f.s.disabled = !n;
    });
  },

  /* ================= 사업 ================= */
  updateBiz() {
    const S = this.S;
    const inc = Biz.totalIncome(S);
    setH($('#biz-sum'), `<div class="stat"><span>사업 수익</span><b class="up">${won(inc, true)}/초</b></div><div class="stat"><span>행복 보너스</span><b>+${((Life.happyMult(S) - 1) * 100).toFixed(1)}%</b></div><div class="stat"><span>누적 사업 수익</span><b>${won(S.stats.bizIncome, true)}</b></div>`);
    const qty = S.ui.bizQty;
    syncList($('#biz-list'), BIZ, d => d.id, d => `<div class="card biz" data-key="${d.id}">
        <div class="biz-mark">${d.mark}</div>
        <h4>${d.name} <small data-f="lv"></small></h4>
        <button class="btn primary" data-act="bizBuy" data-arg="${d.id}" data-f="b"><span data-f="bl"></span><small data-f="bc"></small></button>
        <div class="biz-line"><span>수익 <b data-f="inc"></b></span><span data-f="ms"></span><span class="bar"><i data-f="bar"></i></span></div>
      </div>`, (el, d) => {
      const f = F(el);
      const lv = S.biz[d.id] || 0;
      el.classList.toggle('locked', !lv);
      setT(f.lv, lv ? `Lv.${lv}` : '미보유');
      setT(f.inc, won(Biz.income(S, d.id), true) + '/초');
      const n = qty === 'max' ? Math.max(1, Biz.maxN(S, d.id)) : qty;
      const cost = Biz.cost(S, d.id, n);
      setT(f.bl, lv ? `${n}단계 확장` : '창업하기');
      setT(f.bc, won(cost, true));
      f.b.disabled = S.cash < cost;
      const ms = Biz.nextMilestone(lv);
      setT(f.ms, ms ? `Lv.${ms.at} 달성 시 수익 ×${ms.x}` : '모든 보너스 달성');
      const prev = BIZ_MILESTONES.filter(([at]) => at <= lv).map(([at]) => at).pop() || 0;
      f.bar.style.width = ms ? `${(lv - prev) / (ms.at - prev) * 100}%` : '100%';
    });

    setT($('#offer-timer'), `새 투자 제안까지 ${ticksToText(S.offersNext - S.t)}`);
    syncList($('#offer-list'), S.offers, o => o.id, o => {
      const st = SU_STAGE[o.stage];
      const pb = Startup.probBonus(S);
      return `<div class="card offer${o.priv ? ' priv' : ''}" data-key="${o.id}">
        <div class="person"><span class="avatar" style="background:hsl(${(o.id * 47) % 360} 45% 42%)">${esc(o.name[0])}</span><div><h4>${esc(o.name)} ${o.priv ? '<span class="tag gold">프라이빗 딜</span>' : ''}</h4><p>${o.sector} · ${st.name}</p></div></div>
        <div class="kv"><span>성공 확률</span><b>${Math.round((o.prob + pb) * 100)}%${pb ? ` (인맥 +${Math.round(pb * 100)}%p)` : ''}</b><span>성공 시 회수</span><b>${o.mult[0].toFixed(1)}~${o.mult[1].toFixed(1)}배</b><span>결과까지</span><b>${o.days}일</b><span>투자 한도</span><b>${won(o.min, true)} ~ ${won(o.max, true)}</b></div>
        <div class="fund"><input id="inv-${o.id}" placeholder="투자금 (예: ${kUnit(o.min)})" inputmode="decimal" autocomplete="off"><button class="btn primary" data-act="invest" data-arg="${o.id}">투자</button></div>
      </div>`;
    }, null, '<p class="empty">지금은 투자 제안이 없습니다.</p>');
    setH($('#su-list'), S.startups.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>회사</th><th>단계</th><th class="num">투자금</th><th class="num">성공 확률</th><th class="num">결과 발표</th></tr></thead><tbody>${S.startups.map(s => `<tr><td>${esc(s.name)} <small class="muted">${s.sector}</small></td><td>${SU_STAGE[s.stage].name}${s.priv ? ' · 프라이빗' : ''}</td><td class="num">${won(s.amt, true)}</td><td class="num">${Math.round(s.prob * 100)}%</td><td class="num">${ticksToText(s.until - S.t)} 뒤</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">진행 중인 투자가 없습니다. 성공하면 몇 배로, 실패하면 0원이 될 수 있습니다.</p>');
  },

  /* ================= 라이프 ================= */
  updateLife() {
    const S = this.S, L = S.life;
    const charm = Life.charm(S), fame = Life.fame(S);
    setH($('#life-stats'), `
      <div class="stat"><span>매력</span><b>${charm}</b></div>
      <div class="stat"><span>명성</span><b>${fame}</b></div>
      <div class="stat"><span>행복 ${Math.round(L.happy)} / 100</span><div class="bar pink"><i style="width:${L.happy}%"></i></div><small class="muted">수입 보너스 +${((Life.happyMult(S) - 1) * 100).toFixed(1)}%</small></div>
      <div class="stat"><span>하루 차량 유지비</span><b class="down">${won(Life.upkeepPerDay(S), true)}</b></div>
      <div class="stat"><span>라이프에 쓴 돈</span><b>${won(S.stats.spent, true)}</b></div>`);

    // 연애
    const gf = L.gf, cand = L.cand;
    const ready = Life.dateReady(S);
    const loveSig = [gf && gf.id, gf && Math.round(gf.aff), cand && cand.id, !!L.married, ready, Life.canPropose(S), Math.floor(S.cash / 1e5) > 0 ? Math.min(9, Math.floor(Math.log10(S.cash + 1))) : 0, charm, fame].join(':');
    const love = $('#love');
    if (love._sig !== loveSig) {
      love._sig = loveSig;
      if (gf) {
        const T = GF_TYPES[gf.type];
        const days = Math.floor((S.t - gf.since) / TPD);
        love.innerHTML = `
          <div class="gf-card">${avatarHTML(gf.name, (gf.id * 37) % 360, true)}
            <h4>${esc(gf.name)} <span class="tag love ${L.married ? 'gold' : 'up'}">${L.married ? '배우자' : '여자친구'}</span></h4>
            <p>${gf.age}세 · ${esc(gf.job)} · ${T.name} 성격 · 만난 지 ${days}일</p>
            <div><div class="bar pink"><i style="width:${gf.aff}%"></i></div><small class="muted">호감도 ${Math.round(gf.aff)} / 100 · 하루 ${L.married ? 1.5 : T.decay}씩 줄어듭니다</small></div>
          </div>
          ${gf.contact ? `<p class="small muted" style="margin:0 0 8px">${gf.contactGiven ? `${esc(gf.name)}의 소개로 <b>${CONTACTS[gf.contact].name}</b> 인맥이 생겼습니다.` : `호감도 50을 넘기면 ${esc(gf.name)}이(가) <b>${CONTACTS[gf.contact].name}</b>를 소개해 줍니다.`}</p>` : ''}
          <b class="small">데이트 ${ready ? '' : `<span class="muted">(${ticksToText(DATE_CD - (S.t - L.lastDate))} 뒤 가능)</span>`}</b>
          <div class="date-grid">${DATES.map(d => {
            const g = Life.dateGain(S, d.id);
            return `<button class="date-btn${g.like ? ' like' : ''}${g.dislike ? ' dislike' : ''}" data-act="date" data-arg="${d.id}"${!ready || S.cash < d.cost ? ' disabled' : ''}><b>${d.name}</b><small>${won(d.cost, true)}</small><small>호감 +${g.gain.toFixed(0)}${g.like ? ' · 좋아함' : g.dislike ? ' · 별로…' : ''}</small></button>`;
          }).join('')}</div>
          <div class="btn-row" style="margin-top:10px">
            ${!L.married ? `<button class="btn primary" data-act="propose"${Life.canPropose(S) && S.cash >= 3e7 ? '' : ' disabled'}>프로포즈 (반지 ₩3천만)</button>` : ''}
            <button class="btn danger" data-act="breakupAsk">${L.married ? '이혼' : '이별'}</button>
          </div>
          ${!L.married ? '<p class="muted small" style="margin:6px 0 0">호감도 90 이상, 15일 이상 만나면 프로포즈할 수 있습니다.</p>' : ''}`;
      } else if (cand) {
        love.innerHTML = `
          <div class="gf-card">${avatarHTML(cand.name, (cand.id * 37) % 360, true)}
            <h4>${esc(cand.name)} <span class="tag">${esc(cand.via)}에서 만남</span></h4>
            <p>${cand.age}세 · ${esc(cand.job)} · ${GF_TYPES[cand.type].name} 성격</p>
            <p>기대치 ${cand.std} · 내 매력 ${charm} · 명성 ${fame}</p>
          </div>
          <p class="small" style="margin:0 0 10px">사귀자고 하면 성공 확률 <b>${Math.round(cand.odds * 100)}%</b>. ${cand.contact ? `직업 덕분에 <b>${CONTACTS[cand.contact].name}</b> 인맥으로 이어질 수 있습니다.` : ''}</p>
          <div class="btn-row"><button class="btn primary" data-act="askOut">사귀자고 하기</button><button class="btn ghost" data-act="passCand">다음 기회에</button></div>`;
      } else {
        love.innerHTML = `<p class="muted small" style="margin:0 0 10px">${L.exes ? `지난 연애 ${L.exes}번. ` : ''}새로운 만남을 찾아보세요. 매력과 명성이 높을수록 성공 확률이 오릅니다.</p>
          <div class="opt-list">${MEETS.map(m => {
            const lock = charm < m.charm || fame < m.fame;
            return `<div class="opt"><b>${m.name}</b><small>${won(m.cost, true)}${m.charm ? ` · 매력 ${m.charm}+` : ''}${m.fame ? ` · 명성 ${m.fame}+` : ''}</small><button class="btn" data-act="meet" data-arg="${m.id}"${lock || S.cash < m.cost ? ' disabled' : ''}>${lock ? '조건 부족' : '만나러 가기'}</button></div>`;
          }).join('')}</div>`;
      }
    }

    // 인맥
    const known = Object.keys(L.contacts);
    setT($('#net-count'), `${known.length} / ${Object.keys(CONTACTS).length}명`);
    const netSig = known.map(id => `${id}${Math.round(L.contacts[id].close)}${S.t - L.contacts[id].last >= CONTACT_CD ? 'r' : ''}`).join(',') + ':' + charm + ':' + fame + ':' + Math.min(9, Math.floor(Math.log10(S.cash + 1)));
    const net = $('#network');
    if (net._sig !== netSig) {
      net._sig = netSig;
      const evs = NET_EVENTS.map(e => {
        const lock = charm < e.charm || fame < e.fame;
        return `<div class="opt"><b>${e.name}</b><small>${won(e.cost, true)}${e.charm ? ` · 매력 ${e.charm}+` : ''}${e.fame ? ` · 명성 ${e.fame}+` : ''}</small><button class="btn" data-act="network" data-arg="${e.id}"${lock || S.cash < e.cost ? ' disabled' : ''}>${lock ? '조건 부족' : '참석'}</button></div>`;
      }).join('');
      const list = Object.keys(CONTACTS).map(id => {
        const C = CONTACTS[id], c = L.contacts[id];
        if (!c) return `<div class="contact locked"><h4>??? <span class="tag">미해금</span></h4><p>힌트: ${CONTACT_HINT[id]}</p></div>`;
        const lv = Life.contactLv(S, id);
        const ready = S.t - c.last >= CONTACT_CD;
        return `<div class="contact"><h4>${C.name} <span class="tag gold">Lv.${lv}</span> <small class="muted">${C.who}</small></h4>
          <div style="grid-column:1/-1"><div class="bar"><i style="width:${c.close}%"></i></div><small class="muted">친밀도 ${Math.round(c.close)} · ${esc(c.via)}</small></div>
          <div class="perks">${C.perks.map((p, i) => `<span class="tag ${lv > i ? 'gold' : ''}">${i + 1}. ${p}</span>`).join('')}</div>
          <div class="gifts">${MEET_GIFTS.map(g => `<button class="btn ghost" data-act="treat" data-arg="${id}:${g.id}"${!ready || S.cash < g.cost ? ' disabled' : ''}>${g.name} ${won(g.cost, true)} (+${g.gain})</button>`).join('')}</div></div>`;
      }).join('');
      net.innerHTML = `<div class="opt-list" style="margin-bottom:10px">${evs}</div>${list}`;
    }

    // 차고
    let carVal = 0;
    for (const id in L.cars) carVal += Life.carValue(S, id);
    setT($('#car-sum'), `${Object.keys(L.cars).length}대 · 평가액 ${won(carVal, true)} · 새 차는 사자마자 18% 감가됩니다`);
    syncList($('#car-list'), CARS, c => c.id, c => `<div class="card car" data-key="${c.id}">
        <div class="car-art">${carSVG(c)}<span class="tag gold owned" data-f="own">보유 중</span></div>
        <div class="prop-body"><h4>${c.name} <small class="muted">${c.type}</small></h4>
          <div class="kv"><span>가격</span><b>${won(c.price, true)}</b><span>매력</span><b>+${c.charm}</b><span>유지비</span><b>${won(c.price * 0.0012, true)}/일</b><span data-f="vl">중고 시세</span><b data-f="v">-</b></div>
          <button class="btn primary" data-act="carBuy" data-arg="${c.id}" data-f="b">구매</button>
          <button class="btn ghost" data-act="carSell" data-arg="${c.id}" data-f="s">중고로 팔기</button>
        </div></div>`, (el, c) => {
      const f = F(el);
      const own = !!L.cars[c.id];
      f.own.hidden = !own;
      f.b.hidden = own;
      f.s.hidden = !own;
      f.b.disabled = S.cash < c.price;
      setT(f.v, own ? won(Life.carValue(S, c.id), true) : '-');
    });

    // 쇼핑
    const shop = ITEMS.map(it => ({ ...it, kind: 'item' })).concat(SPENDS.map(sp => ({ ...sp, kind: 'spend' })));
    syncList($('#shop'), shop, it => it.kind + it.id, it => `<div class="card shop-item" data-key="${it.kind + it.id}">
        <h4>${it.name} ${it.kind === 'item' ? '<span class="tag">소장</span>' : '<span class="tag">소비</span>'}</h4>
        <p>${[it.charm ? `매력 +${it.charm}` : '', it.fame ? `명성 +${it.fame}` : '', it.happy ? `행복 +${it.happy}` : ''].filter(Boolean).join(' · ')}</p>
        <button class="btn" data-act="${it.kind === 'item' ? 'itemBuy' : 'spend'}" data-arg="${it.id}" data-f="b"></button>
      </div>`, (el, it) => {
      const f = F(el);
      if (it.kind === 'item') {
        const own = !!L.items[it.id];
        setT(f.b, own ? '보유 중' : won(it.price, true));
        f.b.disabled = own || S.cash < it.price;
      } else {
        const p = Life.spendPrice(S, it);
        setT(f.b, won(p, true));
        f.b.disabled = S.cash < p;
      }
    });
  },

  /* ================= 내 자산 ================= */
  updateMe(force) {
    const S = this.S;
    if (!force && S.t % 2 && this._meT === S.t - 1) return;
    this._meT = S.t;
    const bd = Wealth.breakdown(S);
    const keys = Object.keys(bd.parts);
    const parts = keys.map(k => ({ k, v: bd.parts[k] }));
    Chart.donut($('#donut'), parts, PART_COLORS);
    setH($('#donut-legend'), parts.map((p, i) => `<div><i style="background:${PART_COLORS[i]}"></i><span>${PART_LABEL[p.k]}</span><b>${won(p.v, true)}</b><small>${bd.total ? (p.v / bd.total * 100).toFixed(1) : 0}%</small></div>`).join('') + `<div><i></i><b style="text-align:left">총자산</b><b>${won(bd.total, true)}</b><small></small></div>`);
    Chart.area($('#nwchart'), S.nwHist);
    const st = S.stats;
    setH($('#stats'), `
      <span>최고 총자산</span><b>${won(st.peak, true)}</b>
      <span>실현 손익 (코인·주식·선물 등)</span><b class="${signCls(st.realized)}">${signedWon(st.realized, true)}</b>
      <span>매수 · 매도 횟수</span><b>${st.buys} · ${st.sells}</b>
      <span>익절 · 손절</span><b>${st.wins} · ${st.losses}</b>
      <span>누적 거래대금 · 수수료</span><b>${won(st.volume, true)} · ${won(st.fees, true)}</b>
      <span>강제청산</span><b>${st.liqs}회</b>
      <span>채굴 가치</span><b>${won(st.mined, true)}</b>
      <span>임대 수익 · 배당</span><b>${won(st.rent, true)} · ${won(st.divs, true)}</b>
      <span>사업 수익</span><b>${won(st.bizIncome, true)}</b>
      <span>라이프 소비</span><b>${won(st.spent, true)}</b>
      <span>플레이 시간 (게임)</span><b>${Math.floor(S.t / TPD)}일 ${Math.floor((S.t % TPD) / 5)}시간</b>`);
    const done = ACHS.filter(a => S.ach[a.id]).length;
    setT($('#ach-count'), `${done} / ${ACHS.length}`);
    const achSig = Object.keys(S.ach).length;
    const al = $('#ach-list');
    if (al._sig !== achSig) {
      al._sig = achSig;
      al.innerHTML = ACHS.map(a => `<div class="ach${S.ach[a.id] ? ' done' : ''}"><b>${a.name}</b>${a.desc}</div>`).join('');
    }
    setT($('#save-info'), `자동 저장: 10초마다 이 브라우저에 저장됩니다. 창을 닫아도 최대 8시간까지 방치 수익이 쌓입니다. 마지막 저장 ${new Date(S.lastSave).toLocaleTimeString('ko-KR')}`);
  },
};
