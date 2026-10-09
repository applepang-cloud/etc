'use strict';
/* 게임 루프 · 이벤트 알림 · 버튼 동작 · 오프라인(방치) 진행 · 저장 */

const trimQty = q => String(+(Math.max(0, q)).toFixed(8));
const plainPrice = p => roundTick(p).toFixed(priceDecimals(p));

const Game = {
  S: null,
  silent: false,
  off: null,
  ready: false,
  busy: false,
  lastTick: Date.now(),

  emit(type, p) {
    if (this.silent) {
      if (this.off) this.collect(type, p);
      return;
    }
    if (!this.ready) return;
    const S = this.S;
    switch (type) {
      case 'news': {
        UI.renderTicker();
        if (UI.tab !== 'news') $('#news-dot').hidden = false;
        const mine = (p.coins || []).some(s => (S.hold[s]?.q || 0) > 0);
        const storyEnd = p.story && p.story.step === p.story.total;
        if (p.big) {
          Sound.play('breaking', { gap: 400 });
          UI.toast(p.title, p.cat === 'yt' ? p.ch : p.src, p.tone > 0 ? 'up' : p.tone < 0 ? 'down' : '');
        } else if (p.story && (storyEnd || mine)) {
          Sound.play('news', { gap: 400 });
          UI.toast(p.title, `${p.story.name} ${p.story.step}/${p.story.total}${storyEnd ? ' · 결말' : ' · 이어지는 보도'}`, p.tone > 0 ? 'up' : p.tone < 0 ? 'down' : '');
        } else if (p.cat === 'yt') {
          Sound.play('yt', { gap: 400 });
          if (mine) UI.toast('유튜브: ' + p.title, p.ch, '');
        } else {
          Sound.play('news', { gap: 400 });
          if (mine) UI.toast(p.title, '보유 코인 관련 뉴스', p.tone > 0 ? 'up' : p.tone < 0 ? 'down' : '');
        }
        break;
      }
      case 'tip':
        Sound.play('news');
        UI.toast(`귀띔 · ${CONTACTS[p.who].name}`, p.text.replace(/"/g, ''), 'warn');
        break;
      case 'fill': {
        const o = p.o;
        Sound.play('coin');
        UI.toast(`지정가 ${o.side === 'buy' ? '매수' : '매도'} 체결`, `${COIN[o.sym].name} ${fmtQty(o.q)}개 @ ${fmtPrice(o.price)}${p.pnl != null ? ` · ${signedWon(p.pnl, true)}` : ''}`, o.side === 'buy' ? 'up' : 'down');
        break;
      }
      case 'rule':
        Sound.play(p.r.pnl >= 0 ? 'profit' : 'loss');
        UI.toast(`${p.why} 실행`, `${COIN[p.sym].name} 전량 매도 · ${signedWon(p.r.pnl)} (${fmtPct(p.r.ret)})`, p.r.pnl >= 0 ? 'up' : 'down');
        break;
      case 'liquidated':
        Sound.play('liquidation');
        UI.toast('강제청산 당했습니다', `${p.sym} ${p.side === 'long' ? '롱' : '숏'} ${p.lev}x · 증거금 ${won(p.margin)} 전액 손실`, 'down');
        break;
      case 'dividend':
        Sound.play('coin');
        UI.toast('배당금 입금', won(p), 'up');
        break;
      case 'mgrLevel':
        Sound.play('level');
        UI.toast(`${p.name} 매니저 레벨업! Lv.${p.lv}`, `실력 ${p.skill.toFixed(1)} · 일급 ${won(p.salary)}`, 'up');
        break;
      case 'mgrQuit':
        Sound.play('error');
        UI.toast(`${p.name} 매니저가 퇴사했습니다`, '급여를 받지 못했습니다. 남은 자금은 돌려받았습니다.', 'warn');
        break;
      case 'mgrBudget':
        UI.toast(`${p.name}: 매수 예산을 모두 썼습니다`, '산 코인은 내 지갑에 있습니다', '');
        break;
      case 'startup':
        Sound.play(p.m >= 1 ? 'profit' : 'loss');
        UI.toast(`${p.inv.name} ${p.outcome}`, `${won(p.inv.amt, true)} → ${won(p.payout, true)} (${p.m.toFixed(2)}배)`, p.m >= 1 ? 'up' : 'down');
        break;
      case 'ach':
        Sound.play('achieve', { gap: 500 });
        UI.toast(`업적 달성: ${p.name}`, p.desc, 'up');
        break;
      case 'contact':
        Sound.play('hire');
        UI.toast(`인맥 추가됨: ${CONTACTS[p.id].name}`, `${p.via} · 라이프 탭에서 확인하세요`, 'up');
        break;
      case 'breakup':
        Sound.play('loss');
        UI.toast(p.byMe ? `${p.gf.name}님과 헤어졌습니다` : `${p.gf.name}님이 이별을 고했습니다`, p.penalty ? `재산분할 ${won(p.penalty)}` : (p.byMe ? '' : '호감도가 바닥났습니다. 데이트를 자주 해주세요.'), 'down');
        break;
      case 'upkeepMiss':
        UI.toast('차량 유지비를 내지 못했습니다', `${won(p)} · 행복이 줄었습니다`, 'warn');
        break;
    }
  },

  collect(type, p) {
    const o = this.off;
    o.counts[type] = (o.counts[type] || 0) + 1;
    const note = (txt) => { if (o.notes.length < 10) o.notes.push(txt); };
    if (type === 'news' && p.big) note(`[뉴스] ${p.title}`);
    if (type === 'liquidated') note(`[청산] ${p.sym} ${p.side === 'long' ? '롱' : '숏'} ${p.lev}x 강제청산`);
    if (type === 'startup') note(`[투자] ${p.inv.name} ${p.outcome} · ${p.m.toFixed(2)}배`);
    if (type === 'ach') note(`[업적] ${p.name}`);
    if (type === 'contact') note(`[인맥] ${CONTACTS[p.id].name} 추가`);
    if (type === 'mgrQuit') note(`[매니저] ${p.name} 퇴사`);
    if (type === 'breakup') note(`[연애] ${p.gf.name}님과 이별`);
    if (type === 'rule') note(`[예약매도] ${COIN[p.sym].name} ${p.why}`);
  },

  drawChart() {
    if (this.S && UI.tab === 'ex') Chart.draw(this.S);
  },

  mood() {
    const fg = this.S.fg;
    Sound.setMood(fg > 65 ? 'greed' : fg < 35 ? 'fear' : 'calm');
  },

  loop() {
    if (this.busy) return;
    const now = Date.now();
    const due = Math.floor((now - this.lastTick) / 1000);
    if (due <= 0) return;
    if (due > 30) {
      this.lastTick = now;
      this.catchUp(Math.min(due, OFFLINE_CAP), due > 120);
      return;
    }
    this.lastTick += due * 1000;
    for (let i = 0; i < due; i++) Engine.step(this.S);
    this.mood();
    UI.update();
  },

  /** 오프라인/백그라운드 동안의 시간을 조용히 빠르게 돌린다 */
  catchUp(ticks, report) {
    const S = this.S;
    this.busy = true;
    const before = {
      nw: Wealth.net(S), biz: S.stats.bizIncome, rent: S.stats.rent, mined: S.stats.mined, divs: S.stats.divs,
      realized: S.stats.realized, t: S.t, mgrTrades: S.managers.reduce((a, m) => a + m.stats.trades, 0),
    };
    this.silent = true;
    this.off = { counts: {}, notes: [] };
    const boot = $('#boot');
    const showBar = ticks > 1500;
    if (showBar) { boot.hidden = false; setT($('#boot-msg'), `자리를 비운 ${realDuration(ticks)} 동안의 시장을 따라잡는 중…`); }
    let done = 0;
    const chunk = () => {
      const end = Math.min(ticks, done + 800);
      try {
        for (; done < end; done++) Engine.step(S);
      } catch (e) {
        console.error(e);
        done = ticks;
      }
      if (showBar) $('#boot-fill').style.width = (done / ticks * 100).toFixed(1) + '%';
      if (done < ticks) { setTimeout(chunk, 0); return; }
      this.silent = false;
      const off = this.off;
      this.off = null;
      boot.hidden = true;
      this.busy = false;
      this.lastTick = Date.now();
      this.mood();
      UI.renderTicker();
      UI.update(true);
      saveGame(S);
      if (report) this.report(ticks, before, off);
    };
    chunk();
  },

  report(ticks, b, off) {
    const S = this.S;
    const nw = Wealth.net(S);
    const d = nw - b.nw;
    const mgrTrades = S.managers.reduce((a, m) => a + m.stats.trades, 0) - b.mgrTrades;
    const row = (k, v, cls = '') => `<span>${k}</span><b class="${cls}">${v}</b>`;
    UI.modal('다녀오셨어요?', `
      <p style="margin:0">자리를 비운 <b>${realDuration(ticks)}</b> 동안 게임 속 <b>${Math.round((S.t - b.t) / TPD)}일</b>이 흘렀습니다.</p>
      <div class="kv">
        ${row('총자산', `${won(b.nw, true)} → ${won(nw, true)}`)}
        ${row('변화', `${signedWon(d, true)} (${fmtPct(b.nw ? d / b.nw : 0)})`, signCls(d))}
        ${row('사업 수익', won(S.stats.bizIncome - b.biz, true), 'up')}
        ${row('임대 수익', won(S.stats.rent - b.rent, true), 'up')}
        ${row('채굴 가치', won(S.stats.mined - b.mined, true), 'up')}
        ${row('배당금', won(S.stats.divs - b.divs, true), 'up')}
        ${row('매니저 거래', mgrTrades + '회')}
        ${row('실현 손익', signedWon(S.stats.realized - b.realized, true), signCls(S.stats.realized - b.realized))}
        ${row('쏟아진 뉴스', (off.counts.news || 0) + '건')}
      </div>
      ${off.notes.length ? `<div><b class="small">주요 소식</b><ul>${off.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
      <p class="muted small" style="margin:0">방치 진행은 최대 8시간까지 쌓입니다.</p>`,
    [{ label: '확인', cls: 'primary', fn: () => Sound.play('coin') }]);
  },

  welcome() {
    UI.modal('방치형 코인 키우기', `
      <p style="margin:0">시드머니 <b>100만 원</b>으로 시작합니다. 목표는 코인으로 자산을 불려 <b>코인황제</b>가 되는 것.</p>
      <ul>
        <li><b>채굴</b> 탭에서 코인을 탭해서 캐고, <b>거래소</b>에서 원하는 코인을 골라 사고파세요. 지정가 · 예약매도 · 선물 · 스테이킹도 됩니다.</li>
        <li><b>매니저</b>를 고용해 담당 코인과 역할(자율 매매 · 매수 전담 · 매도 전담)을 지정하면 대신 거래합니다.</li>
        <li><b>뉴스</b>(국내 · 해외 · 유튜브)가 시세를 움직입니다. 루머와 낚시 영상도 섞여 있어요.</li>
        <li>돈이 모이면 <b>주식 · 부동산 · 사업</b>에 투자하고, <b>라이프</b>에서 차를 사고 연애하며 인맥을 넓히세요. 인맥은 귀띔 · 수수료 할인 같은 혜택을 줍니다.</li>
        <li>창을 닫아도 최대 8시간까지 시장과 사업이 계속 돌아갑니다.</li>
      </ul>
      <p class="muted small" style="margin:0">시세와 뉴스는 모두 게임용 가상 데이터입니다. 실제 투자 조언이 아닙니다.</p>`,
    [
      { label: '소리 없이 시작', cls: 'ghost', fn: () => { this.S.settings.sfxOn = false; UI.syncToggles(); } },
      { label: '효과음 켜고 시작', cls: 'primary', fn: () => { Sound.unlock(); this.S.settings.sfxOn = true; Sound.applyVolumes(); Sound.play('achieve'); UI.syncToggles(); } },
    ]);
  },

  reset() {
    resetGame();
    const S = newState();
    this.S = S;
    Sound.bind(S.settings);
    Sound.stopBgm();
    UI.attach(S);
    this.lastTick = Date.now();
    saveGame(S);
    this.welcome();
  },

  save() {
    if (this.S && !this.busy) saveGame(this.S);
  },
};

/* ---------- 버튼 동작 ---------- */
UI.acts = {
  tab(arg) { Sound.play('click'); this.showTab(arg); window.scrollTo({ top: 0 }); },
  sel(arg) { this.S.ui.sel = arg; Sound.play('click'); this.onSelChange(); },
  fav(arg) {
    const f = this.S.ui.fav;
    const i = f.indexOf(arg);
    if (i >= 0) f.splice(i, 1); else f.push(arg);
    Sound.play('click');
    this.update(true);
  },
  filter(arg) { this.S.ui.filter = arg; this.syncToggles(); this.updateCoinList(); },
  tf(arg) { this.S.ui.tf = +arg; this.syncToggles(); Game.drawChart(); },
  ind(arg) { this.S.ui.ind[arg] = !this.S.ui.ind[arg]; this.syncToggles(); Game.drawChart(); },
  otab(arg) { this.S.ui.otab = arg; this.syncToggles(); this.updateOrderForm(); },
  btab(arg, el) {
    this.S.ui.btab = arg;
    this.syncToggles();
    this.updateBottom();
    if (el && el.classList.contains('news-line')) $('#btabs').scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  pct(arg) {
    const S = this.S, sym = S.ui.sel;
    const [k, p] = arg.split(':');
    const pv = +p;
    if (k === 'buy') $('#buy-amt').value = Math.floor(S.cash * pv).toLocaleString('ko-KR');
    if (k === 'sell') $('#sell-qty').value = trimQty((S.hold[sym]?.q || 0) * pv);
    if (k === 'lim') {
      const price = parseQty($('#lim-price').value) || S.coins[sym].p;
      $('#lim-qty').value = S.ui.limSide === 'buy' ? trimQty(S.cash * pv / (price * (1 + Trade.feeRate(S)))) : trimQty((S.hold[sym]?.q || 0) * pv);
    }
    if (k === 'fut') {
      const lev = +$('#fut-lev').value;
      $('#fut-margin').value = Math.floor(S.cash * pv / (1 + lev * FUT_FEE)).toLocaleString('ko-KR');
    }
    if (k === 'stake') $('#stake-qty').value = trimQty((S.hold[sym]?.q || 0) * pv);
    if (k === 'unstake') $('#stake-qty').value = trimQty((S.staked[sym]?.q || 0) * pv);
    this.updateOrderForm();
  },

  doBuy() {
    const S = this.S, sym = S.ui.sel;
    const krw = parseAmount($('#buy-amt').value);
    if (!(krw > 0)) fail('주문 금액을 입력하세요.');
    const r = Trade.buy(S, sym, krw);
    Sound.play('buy');
    this.toast(`${COIN[sym].name} 매수 체결`, `${fmtQty(r.q)} ${sym} · 평균 ${fmtPrice(r.avg)}`, 'up');
    $('#buy-amt').value = '';
    this.update(true);
  },
  doSell() {
    const S = this.S, sym = S.ui.sel;
    const q = parseQty($('#sell-qty').value);
    if (!(q > 0)) fail('수량을 입력하세요.');
    const r = Trade.sell(S, sym, q);
    Sound.play(r.pnl >= 0 ? 'sell' : 'loss');
    this.toast(`${COIN[sym].name} 매도 체결`, `${won(r.krw)} 수령 · 손익 ${signedWon(r.pnl)} (${fmtPct(r.ret)})`, r.pnl >= 0 ? 'up' : 'down');
    $('#sell-qty').value = '';
    this.update(true);
  },
  limSide(arg) { this.S.ui.limSide = arg; this.syncToggles(); this.updateOrderForm(); },
  limStep(arg) {
    const S = this.S;
    const p = parseQty($('#lim-price').value) || S.coins[S.ui.sel].p;
    $('#lim-price').value = plainPrice(Math.max(tickSize(p), p + tickSize(p) * +arg));
    this.updateOrderForm();
  },
  limAt(arg) {
    const S = this.S;
    $('#lim-price').value = plainPrice(S.coins[S.ui.sel].p * (1 + +arg));
    this.updateOrderForm();
  },
  doLimit() {
    const S = this.S, sym = S.ui.sel;
    const p = parseQty($('#lim-price').value), q = parseQty($('#lim-qty').value);
    const o = Trade.placeLimit(S, sym, S.ui.limSide, p, q);
    Sound.play('coin');
    this.toast('지정가 주문 접수', `${COIN[sym].name} ${o.side === 'buy' ? '매수' : '매도'} ${fmtPrice(o.price)} × ${fmtQty(o.q)}`);
    $('#lim-qty').value = '';
    S.ui.btab = 'orders';
    this.syncToggles();
    this.update(true);
  },
  cancelOrder(arg) {
    Trade.cancelLimit(this.S, +arg);
    Sound.play('click');
    this.toast('주문을 취소했습니다');
    this.update(true);
  },
  obPick(arg, el) {
    const S = this.S;
    S.ui.otab = 'limit';
    S.ui.limSide = el.classList.contains('ask') ? 'buy' : 'sell';
    $('#lim-price').value = plainPrice(+el.dataset.arg);
    this.syncToggles();
    this.updateOrderForm();
    $('#lim-qty').focus();
  },
  futSide(arg) { this.S.ui.futSide = arg; this.syncToggles(); this.updateOrderForm(); },
  doFut() {
    const S = this.S, sym = S.ui.sel;
    const m = parseAmount($('#fut-margin').value);
    if (!(m > 0)) fail('증거금을 입력하세요.');
    const f = Trade.openFut(S, sym, S.ui.futSide, +$('#fut-lev').value, m);
    Sound.play('buy');
    this.toast(`${f.side === 'long' ? '롱' : '숏'} ${f.lev}x 진입`, `${sym} 진입가 ${fmtPrice(f.entry)} · 청산가 ${fmtPrice(Trade.liqPrice(f))}`, f.side === 'long' ? 'up' : 'down');
    $('#fut-margin').value = '';
    S.ui.btab = 'futs';
    this.syncToggles();
    this.update(true);
  },
  closeFut(arg) {
    const r = Trade.closeFut(this.S, +arg);
    if (!r) return;
    Sound.play(r.pnl >= 0 ? 'profit' : 'loss');
    this.toast('선물 포지션 종료', `${r.f.sym} ${signedWon(r.pnl)} (ROE ${fmtPct(r.roe)})`, r.pnl >= 0 ? 'up' : 'down');
    this.update(true);
  },
  doStake() {
    const S = this.S, sym = S.ui.sel;
    const q = parseQty($('#stake-qty').value);
    if (!(q > 0)) fail('수량을 입력하세요.');
    Trade.stake(S, sym, q);
    Sound.play('coin');
    this.toast(`${COIN[sym].name} 스테이킹 시작`, `하루 ${(COIN[sym].stake * 100).toFixed(2)}% 보상이 복리로 쌓입니다`, 'up');
    $('#stake-qty').value = '';
    this.update(true);
  },
  doUnstake() {
    const S = this.S, sym = S.ui.sel;
    const q = parseQty($('#stake-qty').value) || (S.staked[sym]?.q || 0);
    Trade.unstake(S, sym, q);
    Sound.play('click');
    this.toast('스테이킹 해제', `${fmtQty(q)} ${sym}이 지갑으로 돌아왔습니다`);
    $('#stake-qty').value = '';
    this.update(true);
  },
  doRule() {
    const S = this.S, sym = S.ui.sel;
    const tp = parseQty($('#rule-tp').value) / 100, sl = parseQty($('#rule-sl').value) / 100;
    Trade.setRule(S, sym, tp, sl);
    Sound.play('coin');
    this.toast('예약매도 저장', `${COIN[sym].name} ${tp > 0 ? '익절 +' + (tp * 100).toFixed(1) + '%' : ''} ${sl > 0 ? '손절 -' + (sl * 100).toFixed(1) + '%' : ''}`);
    this.update(true);
  },
  clearRule() {
    delete this.S.rules[this.S.ui.sel];
    $('#rule-tp').value = '';
    $('#rule-sl').value = '';
    this.toast('예약매도를 해제했습니다');
    this.update(true);
  },

  toggleSfx() {
    const s = this.S.settings;
    s.sfxOn = !s.sfxOn;
    Sound.unlock();
    Sound.applyVolumes();
    if (s.sfxOn) Sound.play('coin');
    this.syncToggles();
  },
  toggleBgm() {
    const s = this.S.settings;
    s.bgmOn = !s.bgmOn;
    Sound.unlock();
    if (s.bgmOn) Sound.startBgm(); else Sound.stopBgm();
    Sound.applyVolumes();
    this.syncToggles();
  },

  hire(arg) {
    const m = Mgr.hire(this.S, +arg);
    if (!m) return;
    Sound.play('hire');
    this.toast(`${m.name} 매니저를 고용했습니다`, '역할 · 담당 코인 · 자금을 정해주세요', 'up');
    this.update(true);
  },
  refreshCands() {
    Mgr.paidRefresh(this.S);
    Sound.play('coin');
    this.toast('새 지원자가 도착했습니다');
    this.update(true);
  },
  mDeposit(arg) {
    const m = Mgr.get(this.S, +arg);
    const v = parseAmount($('#fund-' + arg).value);
    if (!(v > 0)) fail('맡길 금액을 입력하세요. 예: 1000만');
    Mgr.deposit(this.S, m, v);
    $('#fund-' + arg).value = '';
    Sound.play('coin');
    this.toast(`${m.name} 매니저에게 ${won(Math.min(v, m.cash), true)} 입금`);
    this.update(true);
  },
  mWithdraw(arg) {
    const m = Mgr.get(this.S, +arg);
    const v = parseAmount($('#fund-' + arg).value);
    const amt = v > 0 ? v : m.cash;
    Mgr.withdraw(this.S, m, amt);
    $('#fund-' + arg).value = '';
    Sound.play('sell');
    this.toast(`${m.name} 매니저에게서 출금`, '보유 코인은 그대로 운용됩니다');
    this.update(true);
  },
  mSellAll(arg) {
    const m = Mgr.get(this.S, +arg);
    Mgr.sellAll(this.S, m);
    Sound.play('sell');
    this.toast(`${m.name}: 전량 매도했습니다`);
    this.update(true);
  },
  mToggle(arg) {
    const m = Mgr.get(this.S, +arg);
    m.active = !m.active;
    Sound.play('click');
    this.update(true);
  },
  mFire(arg) {
    const S = this.S;
    const m = Mgr.get(S, +arg);
    this.confirm(`${m.name} 매니저 해고`, `<p style="margin:0">보유 코인을 모두 시장가로 팔고 남은 자금 약 <b>${won(Mgr.value(S, m))}</b>을 돌려받습니다.</p>`, '해고하기', () => {
      Mgr.fire(S, m);
      Sound.play('error');
      this.toast(`${m.name} 매니저를 내보냈습니다`);
      this.update(true);
    });
  },

  tap() {
    const r = Mining.tap(this.S);
    Sound.play('tap', { gap: 25, pitch: Math.random() * 0.12 });
    this.tapFx(r);
    this.updateMine();
  },
  tapUp() {
    Mining.tapUp(this.S);
    Sound.play('level');
    this.updateMine();
  },
  mineCoin(arg) { this.S.mineCoin = arg; Sound.play('click'); this.syncToggles(); this.updateMine(); },
  buyRig(arg) {
    Mining.buyRig(this.S, arg);
    Sound.play('build');
    this.toast(`${RIGS.find(r => r.id === arg).name} 설치 완료`, `${this.S.mineCoin}을 캐기 시작합니다`, 'up');
    this.updateMine();
  },

  newsFilter(arg) { this.S.ui.newsFilter = arg; this.syncToggles(); this.updateNews(); },
  ytOpen(arg) {
    const n = this.S.news.find(x => String(x.id) === String(arg));
    if (n) { Sound.play('click'); this.openVideo(n); }
  },
  goCoin(arg) {
    this.closeModal();
    this.S.ui.sel = arg;
    this.showTab('ex');
    this.onSelChange();
    window.scrollTo({ top: 0 });
  },

  stockQty(arg) { this.S.ui.stockQty = +arg; this.syncToggles(); this.updateStock(); },
  stockBuy(arg) {
    const S = this.S;
    const p = S.stocks[arg].p;
    const q = Math.min(S.ui.stockQty, Math.floor(S.cash / (p * 1.00015)));
    if (q < 1) fail('현금이 부족합니다.');
    Stocks.buy(S, arg, q);
    Sound.play('buy');
    this.toast(`${STOCK[arg].name} ${q}주 매수`, won(q * p), 'up');
    this.updateStock();
  },
  stockSell(arg) {
    const S = this.S;
    const h = S.sHold[arg];
    if (!h) fail('보유 주식이 없습니다.');
    const q = Math.min(S.ui.stockQty, h.q);
    const cost = h.cost * (q / h.q);
    Stocks.sell(S, arg, q);
    const got = q * S.stocks[arg].p * 0.998;
    Sound.play(got >= cost ? 'sell' : 'loss');
    this.toast(`${STOCK[arg].name} ${q}주 매도`, `손익 ${signedWon(got - cost, true)}`, got >= cost ? 'up' : 'down');
    this.updateStock();
  },
  propBuy(arg) {
    Realty.buy(this.S, arg);
    Sound.play('build');
    this.toast(`${PROPS.find(p => p.id === arg).name} 매수 완료`, `하루 임대료 ${won(Realty.rentPerDay(this.S, arg), true)}`, 'up');
    this.updateRealty();
  },
  propSell(arg) {
    const v = Realty.sellValue(this.S, arg);
    Realty.sell(this.S, arg);
    Sound.play('sell');
    this.toast(`${PROPS.find(p => p.id === arg).name} 매도`, `${won(v, true)} 입금`);
    this.updateRealty();
  },
  bizQty(arg) { this.S.ui.bizQty = arg === 'max' ? 'max' : +arg; this.syncToggles(); this.updateBiz(); },
  bizBuy(arg) {
    const r = Biz.buy(this.S, arg, this.S.ui.bizQty);
    const d = Biz.def(arg);
    if (r.milestone) {
      Sound.play('achieve');
      this.toast(`${d.name} Lv.${r.milestone[0]} 달성!`, `수익 ×${r.milestone[1]}`, 'up');
    } else Sound.play('build');
    this.updateBiz();
  },
  invest(arg) {
    const v = parseAmount($('#inv-' + arg).value);
    if (!(v > 0)) fail('투자금을 입력하세요.');
    const o = this.S.offers.find(x => String(x.id) === String(arg));
    Startup.invest(this.S, +arg, v);
    Sound.play('coin');
    this.toast(`${o.name}에 ${won(v, true)} 투자`, `${o.days}일 뒤 결과가 나옵니다`);
    this.updateBiz();
  },

  carBuy(arg) {
    Life.buyCar(this.S, arg);
    Sound.play('engine');
    this.toast(`${CAR[arg].name} 출고!`, `매력 +${CAR[arg].charm} · 행복 +12`, 'up');
    this.updateLife();
  },
  carSell(arg) {
    const v = Life.sellCar(this.S, arg);
    Sound.play('sell');
    this.toast(`${CAR[arg].name} 중고 판매`, `${won(v, true)} 입금`);
    this.updateLife();
  },
  meet(arg) {
    const c = Life.meet(this.S, arg);
    Sound.play('heart');
    this.toast(`${c.name}님을 만났습니다`, `${c.age}세 · ${c.job}`, 'love');
    this.updateLife();
  },
  askOut() {
    const name = this.S.life.cand && this.S.life.cand.name;
    const ok = Life.askOut(this.S);
    if (ok) { Sound.play('achieve'); this.toast(`${name}님과 사귀게 됐습니다!`, '데이트로 호감도를 쌓으세요', 'love'); }
    else { Sound.play('loss'); this.toast(`${name}님에게 거절당했습니다`, '매력과 명성을 더 키워보세요', 'down'); }
    this.updateLife();
  },
  passCand() { Life.pass(this.S); this.updateLife(); },
  date(arg) {
    const g = Life.date(this.S, arg);
    Sound.play('heart');
    this.toast(DATES.find(d => d.id === arg).name, `호감도 +${g.toFixed(0)}`, 'love');
    this.updateLife();
  },
  propose() {
    const S = this.S;
    const name = S.life.gf.name;
    const ok = Life.propose(S);
    if (ok) { Sound.play('achieve'); this.toast(`${name}님이 프로포즈를 받아줬습니다!`, '결혼 축하합니다. 행복 +30 · 명성 +5', 'love'); }
    else { Sound.play('loss'); this.toast('프로포즈 실패…', '호감도가 20 줄었습니다', 'down'); }
    this.updateLife();
  },
  breakupAsk() {
    const S = this.S;
    const married = S.life.married;
    this.confirm(married ? '이혼' : '이별', married ? `<p style="margin:0">이혼하면 현금의 20%를 재산분할로 잃습니다.</p>` : `<p style="margin:0">${esc(S.life.gf.name)}님과 헤어집니다. 행복이 10 줄어듭니다.</p>`, married ? '이혼하기' : '헤어지기', () => { Life.breakup(S, true); this.updateLife(); });
  },
  network(arg) {
    const r = Life.network(this.S, arg);
    Sound.play('coin');
    if (!r) this.toast('명함만 잔뜩 받았습니다', '이번엔 인연이 없었네요');
    else if (!r.isNew) this.toast(`${CONTACTS[r.id].name}와 더 가까워졌습니다`, '친밀도 +6');
    this.updateLife();
  },
  treat(arg) {
    const [id, g] = arg.split(':');
    Life.treat(this.S, id, g);
    Sound.play('coin');
    this.toast(`${CONTACTS[id].name}와 시간을 보냈습니다`, `친밀도 +${MEET_GIFTS.find(x => x.id === g).gain}`, 'up');
    this.updateLife();
  },
  itemBuy(arg) {
    Life.buyItem(this.S, arg);
    const it = ITEMS.find(x => x.id === arg);
    Sound.play('sell');
    this.toast(`${it.name} 구매`, `매력 +${it.charm} · 행복 +${it.happy}`, 'up');
    this.updateLife();
  },
  spend(arg) {
    const p = Life.doSpend(this.S, arg);
    const sp = SPENDS.find(x => x.id === arg);
    Sound.play('sell');
    this.toast(sp.name, `${won(p, true)} 지출 · 행복 +${sp.happy}${sp.fame ? ` · 명성 +${sp.fame}` : ''}`, 'love');
    this.updateLife();
  },

  colors(arg) {
    this.S.settings.colors = arg;
    document.body.classList.toggle('colors-global', arg === 'global');
    this.syncToggles();
    this.redrawCanvases();
  },
  saveNow() {
    if (saveGame(this.S)) this.toast('저장했습니다');
    else this.toast('저장할 수 없습니다', '이 브라우저는 저장소 사용이 막혀 있습니다', 'warn');
  },
  resetAsk() {
    this.confirm('처음부터 다시', '<p style="margin:0">모든 진행 상황이 지워집니다. 되돌릴 수 없습니다.</p>', '초기화', () => Game.reset());
  },
  closeModal() { this.closeModal(); },
  modalAct(arg) {
    const a = this.modalActs[+arg];
    this.closeModal();
    if (a && a.fn) a.fn();
  },
};

/* ---------- 시작 ---------- */
function start(data) {
  let S = null;
  if (data && data.save) {
    try { S = reviveState(JSON.parse(data.save)); } catch (e) { S = null; }
  }
  if (!S) S = loadGame();
  const isNew = !S;
  const away = S ? Math.min(OFFLINE_CAP, Math.floor((Date.now() - (S.lastSave || Date.now())) / 1000)) : 0;
  if (!S) S = newState();
  Game.S = S;
  Sound.bind(S.settings);
  UI.init(S);
  Game.ready = true;
  Game.lastTick = Date.now();
  if (away > 30) Game.catchUp(away, true);
  else $('#boot').hidden = true;
  if (isNew) Game.welcome();

  setInterval(() => Game.loop(), 200);
  setInterval(() => Game.save(), 10000);
  const unlock = () => { Sound.unlock(); };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', () => { if (document.hidden) Game.save(); else Game.loop(); });
  window.addEventListener('pagehide', () => Game.save());
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) {
    try { hot.snapshot(() => ({ save: serialize(Game.S) })); } catch (e) { /* 뷰어가 아닌 환경 */ }
  }
}

(function boot() {
  const hot = window.claude && window.claude.hot;
  const go = () => {
    try {
      if (hot && hot.ready) hot.ready(start);
      else start((hot && hot.data) || {});
    } catch (e) {
      console.error(e);
      setT($('#boot-msg'), '게임을 시작하지 못했습니다. 새로고침해 주세요.');
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})();
