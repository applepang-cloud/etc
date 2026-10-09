'use strict';
/* 캔버스 차트: 캔들 + 이동평균 + 볼린저 + 거래량 + RSI, 공포탐욕 게이지, 도넛, 라인, 스파크라인 */

function cssVars() {
  const cs = getComputedStyle(document.body);
  const g = n => cs.getPropertyValue(n).trim();
  return {
    bg: g('--panel'), fg: g('--fg'), muted: g('--muted'), faint: g('--faint'), line: g('--line'), line2: g('--line-2'),
    up: g('--up'), down: g('--down'), gold: g('--gold'), violet: g('--violet'), amber: g('--amber'), green: g('--green'), blue: g('--blue'), red: g('--red'),
    mono: g('--f-mono') || 'monospace', body: g('--f-body') || 'sans-serif',
  };
}

function fitCanvas(cv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return null;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

const Chart = {
  cv: null,
  hover: null,

  init(cv) {
    this.cv = cv;
    const move = (x, y) => { this.hover = { x, y }; Game.drawChart(); };
    cv.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(); move(e.clientX - r.left, e.clientY - r.top); });
    cv.addEventListener('mouseleave', () => { this.hover = null; Game.drawChart(); });
    cv.addEventListener('touchstart', e => { const r = cv.getBoundingClientRect(); const t = e.touches[0]; move(t.clientX - r.left, t.clientY - r.top); }, { passive: true });
    cv.addEventListener('touchmove', e => { const r = cv.getBoundingClientRect(); const t = e.touches[0]; move(t.clientX - r.left, t.clientY - r.top); }, { passive: true });
    cv.addEventListener('touchend', () => { setTimeout(() => { this.hover = null; Game.drawChart(); }, 1500); });
  },

  draw(S) {
    const fit = fitCanvas(this.cv);
    if (!fit) return;
    const { ctx, w, h } = fit;
    const V = cssVars();
    const sym = S.ui.sel, tf = S.ui.tf, ind = S.ui.ind;
    const c = S.coins[sym];
    const all = c.k[tf];
    const axisW = 78, axisH = 18;
    const rsiH = ind.rsi ? Math.max(50, h * 0.17) : 0;
    const plotW = w - axisW;
    const priceH = h - axisH - rsiH - (rsiH ? 8 : 0);
    const cw = Math.max(4, Math.min(14, plotW / 70));
    const n = Math.min(all.length, Math.floor(plotW / cw));
    const k = all.slice(all.length - n);
    const start = all.length - n;
    const closesAll = all.map(x => x[3]);

    ctx.clearRect(0, 0, w, h);
    ctx.font = `11px ${V.mono}`;

    // 지표 계산 (전체 데이터 기준)
    const maLine = (len) => k.map((_, i) => sma(closesAll, len, start + i + 1));
    const ma7 = ind.ma ? maLine(7) : [];
    const ma25 = ind.ma ? maLine(25) : [];
    let bbU = [], bbL = [];
    if (ind.bb) {
      for (let i = 0; i < n; i++) {
        const end = start + i + 1;
        const m = sma(closesAll, 20, end);
        if (m == null) { bbU.push(null); bbL.push(null); continue; }
        let v = 0;
        for (let j = end - 20; j < end; j++) v += (closesAll[j] - m) ** 2;
        const sd = Math.sqrt(v / 20);
        bbU.push(m + 2 * sd); bbL.push(m - 2 * sd);
      }
    }

    let hi = -Infinity, lo = Infinity;
    for (const x of k) { if (x[1] > hi) hi = x[1]; if (x[2] < lo) lo = x[2]; }
    for (const arr of [ma7, ma25, bbU, bbL]) for (const v of arr) if (v != null) { if (v > hi) hi = v; if (v < lo) lo = v; }
    const h0 = S.hold[sym];
    if (hi === lo) { hi *= 1.01; lo *= 0.99; }
    const pad = (hi - lo) * 0.08;
    hi += pad; lo -= pad;
    const volH = ind.vol ? priceH * 0.2 : 0;
    const py = p => 6 + (hi - p) / (hi - lo) * (priceH - 12);
    const x0 = plotW - n * cw;
    const xc = i => x0 + i * cw + cw / 2;

    // 격자 + 가격축
    ctx.strokeStyle = V.line;
    ctx.lineWidth = 1;
    ctx.fillStyle = V.faint;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const p = lo + (hi - lo) * (i / 4);
      const y = Math.round(py(p)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke();
      ctx.fillText(fmtPrice(p), plotW + 6, y);
    }

    // 거래량
    if (ind.vol) {
      let vmax = 0;
      for (const x of k) vmax = Math.max(vmax, x[4]);
      for (let i = 0; i < n; i++) {
        const x = k[i];
        const vh = vmax ? x[4] / vmax * volH : 0;
        ctx.fillStyle = x[3] >= x[0] ? V.up : V.down;
        ctx.globalAlpha = 0.22;
        ctx.fillRect(x0 + i * cw + 1, priceH - vh, Math.max(1, cw - 2), vh);
      }
      ctx.globalAlpha = 1;
    }

    // 볼린저
    if (ind.bb) {
      ctx.fillStyle = V.violet;
      ctx.globalAlpha = 0.07;
      ctx.beginPath();
      let first = true;
      for (let i = 0; i < n; i++) if (bbU[i] != null) { if (first) { ctx.moveTo(xc(i), py(bbU[i])); first = false; } else ctx.lineTo(xc(i), py(bbU[i])); }
      for (let i = n - 1; i >= 0; i--) if (bbL[i] != null) ctx.lineTo(xc(i), py(bbL[i]));
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      this.line(ctx, bbU, xc, py, V.violet, 1, 0.6);
      this.line(ctx, bbL, xc, py, V.violet, 1, 0.6);
    }

    // 캔들
    for (let i = 0; i < n; i++) {
      const x = k[i];
      const up = x[3] >= x[0];
      const col = up ? V.up : V.down;
      const cx = Math.round(xc(i)) + 0.5;
      ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(cx, py(x[1])); ctx.lineTo(cx, py(x[2])); ctx.stroke();
      const yo = py(x[0]), yc = py(x[3]);
      const bw = Math.max(1, cw - 2);
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(cx - bw / 2), Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
    }

    if (ind.ma) {
      this.line(ctx, ma7, xc, py, V.gold, 1.4, 1);
      this.line(ctx, ma25, xc, py, V.violet, 1.4, 1);
    }

    // 평균 매수가 · 지정가 주문
    if (h0 && h0.q > 0) this.hline(ctx, py(h0.cost / h0.q), plotW, V.amber, '평단 ' + fmtPrice(h0.cost / h0.q), V, hi, lo, h0.cost / h0.q);
    for (const o of S.orders) if (o.sym === sym) this.hline(ctx, py(o.price), plotW, o.side === 'buy' ? V.up : V.down, (o.side === 'buy' ? '매수 ' : '매도 ') + fmtPrice(o.price), V, hi, lo, o.price);
    for (const f of S.futures) if (f.sym === sym) {
      const lq = Trade.liqPrice(f);
      this.hline(ctx, py(lq), plotW, V.red, '청산 ' + fmtPrice(lq), V, hi, lo, lq);
    }

    // 내 거래 표시
    const cur = Math.floor((S.t - 1) / tf);
    for (const e of S.log) {
      if (e.sym !== sym || e.kind !== 'coin') continue;
      const j = cur - Math.floor((e.t - 1) / tf);
      if (j >= n) break;
      const i = n - 1 - j;
      if (i < 0) continue;
      const x = xc(i);
      const y = py(e.p);
      const mine = !e.mgr;
      ctx.fillStyle = e.side === 'buy' ? V.up : V.down;
      ctx.strokeStyle = V.bg;
      ctx.beginPath();
      if (e.side === 'buy') { ctx.moveTo(x, y + 4); ctx.lineTo(x - 5, y + 12); ctx.lineTo(x + 5, y + 12); }
      else { ctx.moveTo(x, y - 4); ctx.lineTo(x - 5, y - 12); ctx.lineTo(x + 5, y - 12); }
      ctx.closePath();
      ctx.globalAlpha = mine ? 1 : 0.45;
      ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 뉴스 · 유튜브 표시: 해당 캔들 아래에 점을 찍고, 십자선을 올리면 제목을 보여준다
    this.newsAt = new Map();
    for (const nw of S.news) {
      if (!(nw.coins || []).includes(sym)) continue;
      const j = cur - Math.floor((nw.t - 1) / tf);
      if (j >= n) break;
      const i = n - 1 - j;
      if (i < 0) continue;
      if (!this.newsAt.has(i)) this.newsAt.set(i, []);
      this.newsAt.get(i).push(nw);
    }
    const ny = priceH - (ind.vol ? volH : 0) - 7;
    for (const [i, list] of this.newsAt) {
      const nw = list[0];
      const col = nw.tone > 0 ? V.up : nw.tone < 0 ? V.down : V.muted;
      ctx.beginPath();
      ctx.arc(xc(i), ny, list.some(x => x.big) ? 5 : 3.5, 0, Math.PI * 2);
      if (nw.cat === 'yt') { ctx.fillStyle = V.bg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke(); ctx.lineWidth = 1; }
      else { ctx.fillStyle = col; ctx.fill(); }
    }

    // 현재가 라벨
    const yp = py(c.p);
    const last = k[n - 1];
    const lastUp = last ? last[3] >= last[0] : true;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = lastUp ? V.up : V.down;
    ctx.beginPath(); ctx.moveTo(0, Math.round(yp) + 0.5); ctx.lineTo(plotW, Math.round(yp) + 0.5); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = lastUp ? V.up : V.down;
    ctx.fillRect(plotW + 1, yp - 9, axisW - 1, 18);
    ctx.fillStyle = '#fff';
    ctx.font = `600 11px ${V.mono}`;
    ctx.fillText(fmtPrice(c.p), plotW + 6, yp);

    // 시간축
    ctx.font = `10.5px ${V.mono}`;
    ctx.fillStyle = V.faint;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const every = Math.max(1, Math.ceil(96 / cw));
    for (let i = n - 1; i >= 0; i -= every) {
      const tick = (cur - (n - 1 - i)) * tf + 1;
      const d = Math.floor((tick - 1) / TPD) + 1;
      const day = d >= 1 ? `D+${d}` : `D${d - 1}`;
      const hh = Math.floor((((tick - 1) % TPD + TPD) % TPD) * 12 / 60);
      const label = tf >= 120 ? day : `${day} ${String(hh).padStart(2, '0')}시`;
      ctx.fillText(label, xc(i), priceH + rsiH + (rsiH ? 8 : 0) + 3);
    }

    // RSI
    if (rsiH) {
      const top = priceH + 8;
      ctx.strokeStyle = V.line;
      ctx.strokeRect(0.5, top + 0.5, plotW - 1, rsiH - 1);
      const ry = v => top + (100 - v) / 100 * rsiH;
      ctx.fillStyle = V.gold;
      ctx.globalAlpha = 0.06;
      ctx.fillRect(0, ry(70), plotW, ry(30) - ry(70));
      ctx.globalAlpha = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(0, ry(70)); ctx.lineTo(plotW, ry(70)); ctx.moveTo(0, ry(30)); ctx.lineTo(plotW, ry(30)); ctx.stroke();
      ctx.setLineDash([]);
      const rv = k.map((_, i) => {
        const end = start + i + 1;
        return end > 15 ? rsi(closesAll.slice(end - 15, end), 14) : null;
      });
      this.line(ctx, rv, xc, ry, V.violet, 1.3, 1);
      ctx.fillStyle = V.faint;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `10.5px ${V.mono}`;
      ctx.fillText('70', plotW + 6, ry(70));
      ctx.fillText('30', plotW + 6, ry(30));
      const lastR = rv[rv.length - 1];
      if (lastR != null) { ctx.fillStyle = V.violet; ctx.fillText('RSI ' + lastR.toFixed(0), 6, top + 9); }
    }

    // 범례
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `11px ${V.mono}`;
    let lx = 6;
    const legend = (txt, col) => { ctx.fillStyle = col; ctx.fillText(txt, lx, 4); lx += ctx.measureText(txt).width + 12; };
    if (ind.ma && ma7[n - 1]) { legend('MA7 ' + fmtPrice(ma7[n - 1]), V.gold); if (ma25[n - 1]) legend('MA25 ' + fmtPrice(ma25[n - 1]), V.violet); }

    // 십자선
    if (this.hover && this.hover.x < plotW && this.hover.y < priceH) {
      const i = Math.floor((this.hover.x - x0) / cw);
      if (i >= 0 && i < n) {
        const x = k[i];
        const cx = xc(i);
        ctx.strokeStyle = V.muted;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, priceH); ctx.moveTo(0, this.hover.y); ctx.lineTo(plotW, this.hover.y); ctx.stroke();
        ctx.setLineDash([]);
        const hp = hi - (this.hover.y - 6) / (priceH - 12) * (hi - lo);
        ctx.fillStyle = V.fg;
        ctx.fillRect(plotW + 1, this.hover.y - 9, axisW - 1, 18);
        ctx.fillStyle = V.bg;
        ctx.textBaseline = 'middle';
        ctx.fillText(fmtPrice(hp), plotW + 6, this.hover.y);
        const chg = x[3] / x[0] - 1;
        const txt = `시 ${fmtPrice(x[0])}  고 ${fmtPrice(x[1])}  저 ${fmtPrice(x[2])}  종 ${fmtPrice(x[3])}  ${fmtPct(chg)}`;
        ctx.font = `11px ${V.mono}`;
        const tw = ctx.measureText(txt).width + 12;
        ctx.fillStyle = V.bg;
        ctx.globalAlpha = 0.92;
        ctx.fillRect(4, 18, Math.min(tw, plotW - 8), 20);
        ctx.globalAlpha = 1;
        ctx.fillStyle = chg >= 0 ? V.up : V.down;
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, 10, 28);
        const nl = this.newsAt && this.newsAt.get(i);
        if (nl) {
          nl.slice(0, 3).forEach((nw, k) => {
            let line = (nw.cat === 'yt' ? '▶ ' : nw.tone > 0 ? '▲ ' : nw.tone < 0 ? '▼ ' : '● ') + nw.title;
            let cut = false;
            while (ctx.measureText(line + (cut ? '…' : '')).width > plotW - 24 && line.length > 4) { line = line.slice(0, -1); cut = true; }
            if (cut) line += '…';
            const w = ctx.measureText(line).width + 12;
            ctx.fillStyle = V.bg;
            ctx.globalAlpha = 0.92;
            ctx.fillRect(4, 40 + k * 20, w, 20);
            ctx.globalAlpha = 1;
            ctx.fillStyle = nw.tone > 0 ? V.up : nw.tone < 0 ? V.down : V.fg;
            ctx.fillText(line, 10, 50 + k * 20);
          });
        }
      }
    }
  },

  line(ctx, arr, xc, py, col, width, alpha) {
    ctx.strokeStyle = col;
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] == null) { pen = false; continue; }
      if (!pen) { ctx.moveTo(xc(i), py(arr[i])); pen = true; } else ctx.lineTo(xc(i), py(arr[i]));
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
  },

  hline(ctx, y, w, col, label, V, hi, lo, p) {
    if (p > hi || p < lo) return;
    ctx.strokeStyle = col;
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.font = `10.5px ${V.mono}`;
    const tw = ctx.measureText(label).width + 8;
    ctx.fillStyle = V.bg;
    ctx.fillRect(w - tw - 4, y - 8, tw, 15);
    ctx.fillStyle = col;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w - tw, y);
  },

  gauge(cv, v) {
    const fit = fitCanvas(cv);
    if (!fit) return;
    const { ctx, w, h } = fit;
    const V = cssVars();
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h - 10, r = Math.min(w / 2 - 12, h - 20);
    const segs = [[V.down, 0, 25], [V.blue, 25, 45], [V.faint, 45, 55], [V.amber, 55, 75], [V.up, 75, 100]];
    ctx.lineWidth = 14;
    for (const [col, a, b] of segs) {
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI + a / 100 * Math.PI + 0.02, Math.PI + b / 100 * Math.PI - 0.02);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const ang = Math.PI + v / 100 * Math.PI;
    ctx.strokeStyle = V.fg;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * (r - 18), cy + Math.sin(ang) * (r - 18)); ctx.stroke();
    ctx.fillStyle = V.fg;
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
  },

  donut(cv, parts, colors) {
    const fit = fitCanvas(cv);
    if (!fit) return;
    const { ctx, w, h } = fit;
    const V = cssVars();
    ctx.clearRect(0, 0, w, h);
    const total = parts.reduce((a, p) => a + Math.max(0, p.v), 0);
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 6;
    let a = -Math.PI / 2;
    ctx.lineWidth = r * 0.36;
    if (total <= 0) {
      ctx.strokeStyle = V.line;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    parts.forEach((p, i) => {
      if (p.v <= 0) return;
      const da = p.v / total * Math.PI * 2;
      ctx.strokeStyle = colors[i % colors.length];
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, a, a + da); ctx.stroke();
      a += da;
    });
  },

  area(cv, pts) {
    const fit = fitCanvas(cv);
    if (!fit) return;
    const { ctx, w, h } = fit;
    const V = cssVars();
    ctx.clearRect(0, 0, w, h);
    if (pts.length < 2) {
      ctx.fillStyle = V.muted;
      ctx.font = `13px ${V.body}`;
      ctx.fillText('기록이 쌓이는 중입니다', 10, 24);
      return;
    }
    const axisW = 70;
    const pw = w - axisW, ph = h - 20;
    let hi = Math.max(...pts.map(p => p[1])), lo = Math.min(...pts.map(p => p[1]));
    if (hi === lo) { hi *= 1.05; lo *= 0.95; }
    const pad = (hi - lo) * 0.1;
    hi += pad; lo = Math.max(0, lo - pad);
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
    const X = t => (t - t0) / Math.max(1, t1 - t0) * pw;
    const Y = v => 6 + (hi - v) / (hi - lo) * (ph - 12);
    ctx.strokeStyle = V.line;
    ctx.fillStyle = V.faint;
    ctx.font = `10.5px ${V.mono}`;
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 3; i++) {
      const v = lo + (hi - lo) * i / 3;
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pw, y); ctx.stroke();
      ctx.fillText(won(v, true), pw + 6, y);
    }
    const grad = ctx.createLinearGradient(0, 0, 0, ph);
    grad.addColorStop(0, V.gold);
    grad.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
    for (const p of pts) ctx.lineTo(X(p[0]), Y(p[1]));
    ctx.lineTo(X(t1), ph);
    ctx.lineTo(X(t0), ph);
    ctx.closePath();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
    for (const p of pts) ctx.lineTo(X(p[0]), Y(p[1]));
    ctx.strokeStyle = V.gold;
    ctx.lineWidth = 2;
    ctx.stroke();
    const lp = pts[pts.length - 1];
    ctx.fillStyle = V.gold;
    ctx.beginPath(); ctx.arc(X(lp[0]), Y(lp[1]), 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = V.faint;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(gameClock(t0).str, 0, ph + 4);
    ctx.textAlign = 'right';
    ctx.fillText(gameClock(t1).str, pw, ph + 4);
    ctx.textAlign = 'left';
  },
};

/** 인라인 SVG 스파크라인 */
function sparkSVG(vals, w = 64, h = 20, cls = '') {
  if (!vals || vals.length < 2) return `<svg class="spark" width="${w}" height="${h}"></svg>`;
  let hi = -Infinity, lo = Infinity;
  for (const v of vals) { if (v > hi) hi = v; if (v < lo) lo = v; }
  if (hi === lo) { hi += 1; lo -= 1; }
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(2 + (hi - v) / (hi - lo) * (h - 4)).toFixed(1)}`).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  return `<svg class="spark ${cls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="var(${up ? '--up' : '--down'})" stroke-width="1.5" points="${pts}"/></svg>`;
}
