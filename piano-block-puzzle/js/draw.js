// 캔버스 그리기 도우미

const shadeCache = new Map();

// amt > 0 이면 흰색 쪽으로, < 0 이면 검은색 쪽으로 섞는다.
export function shade(hex, amt) {
  const k = hex + amt;
  let v = shadeCache.get(k);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const ch = (x) => Math.round(x + (t - x) * p);
  v = `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  shadeCache.set(k, v);
  return v;
}

export function rrect(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// 블록 블라스트 스타일의 입체 블록 한 칸
export function drawBlock(g, x, y, w, h, color) {
  const b = Math.max(2, Math.round(Math.min(w, h) * 0.15));
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
  g.fillStyle = shade(color, 0.45);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w - b, y + b);
  g.lineTo(x + b, y + b);
  g.fill();
  g.fillStyle = shade(color, 0.2);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + b, y + b);
  g.lineTo(x + b, y + h - b);
  g.lineTo(x, y + h);
  g.fill();
  g.fillStyle = shade(color, -0.22);
  g.beginPath();
  g.moveTo(x + w, y);
  g.lineTo(x + w, y + h);
  g.lineTo(x + w - b, y + h - b);
  g.lineTo(x + w - b, y + b);
  g.fill();
  g.fillStyle = shade(color, -0.38);
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x + b, y + h - b);
  g.lineTo(x + w - b, y + h - b);
  g.lineTo(x + w, y + h);
  g.fill();
}

// 폭탄 블록 한 칸. spark = 심지 불꽃 표시
export function drawBomb(g, x, y, w, h, spark, t = 0) {
  drawBlock(g, x, y, w, h, '#3b2a2e');
  const s = Math.min(w, h);
  const cx = x + w / 2;
  const cy = y + h / 2 + s * 0.04;
  const r = s * 0.3;
  const grad = g.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r);
  grad.addColorStop(0, '#7a7f8a');
  grad.addColorStop(1, '#0d0e10');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2a2c31';
  g.fillRect(cx + r * 0.35, cy - r * 1.15, r * 0.5, r * 0.4);
  if (spark) {
    const sx = cx + r * 0.75;
    const sy = cy - r * 1.3;
    const k = 0.75 + 0.25 * Math.sin(t * 20);
    g.fillStyle = '#ffd34d';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const rr = (i % 2 ? r * 0.18 : r * 0.42) * k;
      g.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
    }
    g.fill();
    g.fillStyle = '#fff6d0';
    g.beginPath();
    g.arc(sx, sy, r * 0.1, 0, Math.PI * 2);
    g.fill();
  }
}
