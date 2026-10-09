// 스토리 모드 캐릭터 일러스트 (SVG). 외부 이미지 없이 도형으로 그린다.
// portrait(id, expr): expr = normal | smile | blush | surprise | sad | serious | back(교수·태준 뒷모습)
import { PORTRAIT_ART } from './portrait-art.js';


const SKIN = '#fde4d4';
const SKIN_SH = '#efc2ad';
const LINE = '#3a2626';

const CHARS = {
  seoyun: { hair: '#3b2a2a', hairHi: '#6b4a42', iris: '#7a4a32', cloth: '#2c3e66', inner: '#f6f6fb' },
  dohyun: { hair: '#1e2128', hairHi: '#434a5a', iris: '#44506e', cloth: '#2a2e38', inner: '#3a3f4c' },
  chaea: { hair: '#b08a6a', hairHi: '#dcb795', iris: '#b07a2a', cloth: '#1c1c24', inner: '#ffffff' },
  prof: { hair: '#6f6f78', hairHi: '#b4b4bd', iris: '#3a3030', cloth: '#3a3f4a', inner: '#f2f3f6' },
  taejun: { hair: '#2b211d', hairHi: '#6e5546', iris: '#4a3526', cloth: '#14161c', inner: '#f4f4f6' },
};

function eye(cx, cy, expr, iris, lash) {
  if (expr === 'smile') {
    return `<path d="M${cx - 14} ${cy + 3} Q${cx} ${cy - 13} ${cx + 14} ${cy + 3}" fill="none" stroke="${lash}" stroke-width="4.5" stroke-linecap="round"/>`;
  }
  const big = expr === 'surprise';
  const rx = big ? 17 : 15;
  const ry = big ? 20 : 18;
  const irx = big ? 9 : 12;
  const iry = big ? 11 : 15;
  let s = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff"/>`;
  s += `<ellipse cx="${cx}" cy="${cy + 3}" rx="${irx}" ry="${iry}" fill="${iris}"/>`;
  s += `<ellipse cx="${cx}" cy="${cy + 4}" rx="${irx * 0.5}" ry="${iry * 0.55}" fill="${LINE}" opacity="0.85"/>`;
  s += `<circle cx="${cx - 4}" cy="${cy - 3}" r="${big ? 2.6 : 3.6}" fill="#fff"/>`;
  s += `<circle cx="${cx + 4}" cy="${cy + 8}" r="1.7" fill="#fff" opacity="0.85"/>`;
  if (expr === 'serious' || expr === 'sad') {
    // 눈꺼풀을 내려 가늘게
    const lid = expr === 'serious' ? 7 : 6;
    s += `<rect x="${cx - rx - 2}" y="${cy - ry - 2}" width="${rx * 2 + 4}" height="${lid + 4}" fill="${SKIN}"/>`;
    s += `<path d="M${cx - 18} ${cy - ry + lid + 1} Q${cx} ${cy - ry + lid - 3} ${cx + 18} ${cy - ry + lid + 1}" fill="none" stroke="${lash}" stroke-width="4.5" stroke-linecap="round"/>`;
  } else {
    s += `<path d="M${cx - 18} ${cy - 7} Q${cx} ${cy - ry - 7} ${cx + 18} ${cy - 9}" fill="none" stroke="${lash}" stroke-width="4.5" stroke-linecap="round"/>`;
  }
  s += `<path d="M${cx - 10} ${cy + ry - 1} Q${cx} ${cy + ry + 2} ${cx + 10} ${cy + ry - 1}" fill="none" stroke="${lash}" stroke-width="1.5" opacity="0.5"/>`;
  return s;
}

function brows(expr, color) {
  const sets = {
    normal: ['M106 160 Q121 151 136 158', 'M164 158 Q179 151 194 160'],
    smile: ['M106 158 Q121 149 136 156', 'M164 156 Q179 149 194 158'],
    blush: ['M106 160 Q121 153 136 158', 'M164 158 Q179 153 194 160'],
    surprise: ['M106 150 Q121 140 136 148', 'M164 148 Q179 140 194 150'],
    sad: ['M106 162 Q122 158 136 151', 'M164 151 Q178 158 194 162'],
    serious: ['M106 155 L136 162', 'M164 162 L194 155'],
  };
  const [a, b] = sets[expr] || sets.normal;
  return `<path d="${a}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/><path d="${b}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
}

function mouth(expr) {
  switch (expr) {
    case 'smile':
      return '<path d="M137 236 Q150 253 163 236 Q150 242 137 236 Z" fill="#d45f6c"/>';
    case 'blush':
      return '<path d="M142 240 Q150 246 158 240" fill="none" stroke="#b9505e" stroke-width="2.6" stroke-linecap="round"/>';
    case 'surprise':
      return '<ellipse cx="150" cy="243" rx="5.5" ry="7" fill="#a8414f"/>';
    case 'sad':
      return '<path d="M141 246 Q150 238 159 246" fill="none" stroke="#9c4652" stroke-width="2.6" stroke-linecap="round"/>';
    case 'serious':
      return '<path d="M142 242 L158 242" fill="none" stroke="#9c4652" stroke-width="2.6" stroke-linecap="round"/>';
    default:
      return '<path d="M142 240 Q150 245 158 240" fill="none" stroke="#b9505e" stroke-width="2.6" stroke-linecap="round"/>';
  }
}

function face(c, expr) {
  let s = '';
  s += `<path d="M134 255 L134 304 L166 304 L166 255 Z" fill="${SKIN_SH}"/>`;
  s += `<ellipse cx="99" cy="190" rx="8" ry="13" fill="${SKIN}"/><ellipse cx="201" cy="190" rx="8" ry="13" fill="${SKIN}"/>`;
  s += `<path d="M100 150 C100 228 124 268 150 273 C176 268 200 228 200 150 C200 108 178 92 150 92 C122 92 100 108 100 150 Z" fill="${SKIN}"/>`;
  s += eye(121, 192, expr, c.iris, LINE) + eye(179, 192, expr, c.iris, LINE);
  s += brows(expr, c.hair);
  s += `<path d="M151 211 L148 221 L152 222" fill="none" stroke="${SKIN_SH}" stroke-width="2" stroke-linecap="round"/>`;
  s += mouth(expr);
  if (expr === 'blush' || expr === 'smile') {
    const o = expr === 'blush' ? 0.55 : 0.3;
    s += `<ellipse cx="114" cy="222" rx="14" ry="7" fill="#ff8a9e" opacity="${o}"/><ellipse cx="186" cy="222" rx="14" ry="7" fill="#ff8a9e" opacity="${o}"/>`;
    if (expr === 'blush') {
      s += '<path d="M106 219 l5 -5 M113 220 l5 -5 M120 221 l5 -5 M178 221 l5 -5 M185 220 l5 -5 M192 219 l5 -5" stroke="#f0637c" stroke-width="1.6" stroke-linecap="round"/>';
    }
  }
  return s;
}

function body(c, extra = '') {
  return `<path d="M34 420 C40 360 70 330 112 316 L134 300 L166 300 L188 316 C230 330 260 360 266 420 Z" fill="${c.cloth}"/>${extra}`;
}

function seoyun(expr) {
  const c = CHARS.seoyun;
  let s = '';
  s += `<path d="M78 160 C66 260 58 360 84 420 L216 420 C242 360 234 260 222 160 C216 92 186 68 150 68 C114 68 84 92 78 160 Z" fill="${c.hair}"/>`;
  s += body(c, `<path d="M128 302 L150 352 L172 302 Z" fill="${c.inner}"/><path d="M128 302 L140 330 L150 312 L160 330 L172 302" fill="none" stroke="#d9dbe6" stroke-width="2"/><path d="M112 316 L150 420 M188 316 L150 420" stroke="#22314f" stroke-width="3" opacity="0.5"/>`);
  s += face(c, expr);
  s += `<path d="M97 168 C92 110 118 76 158 76 C192 78 210 108 205 162 C198 128 182 110 162 106 C150 132 126 148 97 168 Z" fill="${c.hair}"/>`;
  s += `<path d="M100 150 C90 205 94 255 108 292 C114 252 110 205 113 162 Z" fill="${c.hair}"/><path d="M200 150 C210 205 206 255 192 292 C186 252 190 205 187 162 Z" fill="${c.hair}"/>`;
  s += `<path d="M120 92 C140 82 168 82 186 96" fill="none" stroke="${c.hairHi}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>`;
  s += '<rect x="182" y="104" width="18" height="7" rx="3" fill="#e8c46a" transform="rotate(-24 191 107)"/>';
  s += '<circle cx="99" cy="208" r="3" fill="#e8c46a"/><circle cx="201" cy="208" r="3" fill="#e8c46a"/>';
  return s;
}

function dohyun(expr) {
  const c = CHARS.dohyun;
  let s = '';
  s += `<path d="M90 172 C86 110 112 72 150 70 C190 70 216 108 210 172 Z" fill="${c.hair}"/>`;
  s += body(c, `<path d="M104 318 C120 300 180 300 196 318 C186 334 114 334 104 318 Z" fill="#22262f"/><path d="M138 318 L136 372 M162 318 L164 372" stroke="#e8eaf0" stroke-width="3" stroke-linecap="round"/>`);
  s += face(c, expr);
  s += `<path d="M95 158 C98 102 124 80 150 80 C178 80 204 100 206 156 L198 142 L192 166 L182 138 L172 168 L162 136 L151 170 L140 136 L129 166 L119 138 L110 162 L103 142 Z" fill="${c.hair}"/>`;
  s += `<path d="M118 96 C134 86 162 84 182 94" fill="none" stroke="${c.hairHi}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>`;
  return s;
}

function chaea(expr) {
  const c = CHARS.chaea;
  let s = '';
  s += `<path d="M86 165 C82 108 110 74 150 72 C190 74 218 108 214 165 C216 222 208 252 196 266 L104 266 C92 252 84 222 86 165 Z" fill="${c.hair}"/>`;
  s += body(c, `<path d="M116 312 C130 334 170 334 184 312 C172 304 128 304 116 312 Z" fill="${c.inner}"/>`);
  s += face(c, expr);
  s += `<path d="M97 160 C97 108 120 84 150 84 C180 84 203 108 203 160 L203 150 C201 140 196 134 189 133 L111 133 C104 134 99 140 97 150 Z" fill="${c.hair}"/>`;
  s += `<path d="M98 150 C92 200 96 240 106 262 C110 230 108 190 110 156 Z" fill="${c.hair}"/><path d="M202 150 C208 200 204 240 194 262 C190 230 192 190 190 156 Z" fill="${c.hair}"/>`;
  s += `<path d="M118 96 C136 86 164 86 184 96" fill="none" stroke="${c.hairHi}" stroke-width="5" stroke-linecap="round" opacity="0.8"/>`;
  s += '<path d="M104 104 L86 92 L90 116 Z M104 104 L118 86 L122 110 Z" fill="#111"/><circle cx="104" cy="104" r="5" fill="#222"/>';
  return s;
}

// 뒷모습 (돌아앉아 있을 때)
function back(c) {
  let s = body(c);
  s += `<ellipse cx="99" cy="190" rx="8" ry="13" fill="${SKIN}"/><ellipse cx="201" cy="190" rx="8" ry="13" fill="${SKIN}"/>`;
  s += `<path d="M134 250 L134 304 L166 304 L166 250 Z" fill="${SKIN_SH}"/>`;
  s += `<path d="M98 160 C96 104 120 82 150 82 C182 82 204 104 202 160 C204 214 186 252 150 256 C114 252 96 214 98 160 Z" fill="${c.hair}"/>`;
  s += `<path d="M120 100 C138 90 166 90 182 102" fill="none" stroke="${c.hairHi}" stroke-width="4" stroke-linecap="round" opacity="0.6"/>`;
  return s;
}

function prof(expr) {
  const c = CHARS.prof;
  const tie = '<path d="M146 304 L154 304 L158 316 L150 380 L142 316 Z" fill="#23314f"/>';
  const shirt = `<path d="M128 302 L150 360 L172 302 Z" fill="${c.inner}"/>`;
  const lapel = '<path d="M112 316 L134 302 L150 360 Z M188 316 L166 302 L150 360 Z" fill="#2f333d"/>';
  if (expr === 'back') return back(c);
  let s = '';
  s += `<path d="M94 166 C92 108 118 80 152 80 C186 80 210 108 206 166 Z" fill="${c.hair}"/>`;
  s += body(c, shirt + tie + lapel);
  s += face(c, expr === 'normal' ? 'serious' : expr);
  s += `<path d="M98 152 C104 104 132 90 160 92 C186 96 204 116 204 152 C196 126 178 112 150 112 C128 116 108 128 98 152 Z" fill="${c.hair}"/>`;
  s += `<path d="M126 228 Q122 238 128 246 M174 228 Q178 238 172 246" fill="none" stroke="${SKIN_SH}" stroke-width="2" stroke-linecap="round"/>`;
  s += '<rect x="101" y="176" width="40" height="32" rx="9" fill="none" stroke="#1d1f24" stroke-width="3"/><rect x="159" y="176" width="40" height="32" rx="9" fill="none" stroke="#1d1f24" stroke-width="3"/><path d="M141 188 Q150 183 159 188" fill="none" stroke="#1d1f24" stroke-width="3"/>';
  s += '<path d="M106 182 L118 182" stroke="#fff" stroke-width="2" opacity="0.6"/><path d="M164 182 L176 182" stroke="#fff" stroke-width="2" opacity="0.6"/>';
  return s;
}

function taejun(expr) {
  const c = CHARS.taejun;
  if (expr === 'back') return back(c);
  let s = '';
  s += `<path d="M92 170 C88 106 116 74 152 74 C188 74 214 106 208 170 Z" fill="${c.hair}"/>`;
  s += body(
    c,
    `<path d="M130 302 L150 344 L170 302 Z" fill="${c.inner}"/><path d="M140 304 L150 320 L160 304" fill="none" stroke="#c9ccd4" stroke-width="2"/>` +
      '<path d="M112 316 L134 302 L150 352 Z M188 316 L166 302 L150 352 Z" fill="#0c0d11"/><rect x="176" y="336" width="14" height="4" rx="1" fill="#d8b45a"/>',
  );
  s += face(c, expr === 'normal' ? 'smile' : expr);
  // 이마를 드러내고 뒤로 넘긴 머리
  s += `<path d="M98 146 C100 98 128 76 156 76 C188 78 208 100 204 146 C196 120 180 108 160 104 C140 102 116 112 98 146 Z" fill="${c.hair}"/>`;
  s += `<path d="M118 100 C136 86 166 84 188 98 M126 110 C144 98 168 98 186 108" fill="none" stroke="${c.hairHi}" stroke-width="3.5" stroke-linecap="round" opacity="0.75"/>`;
  return s;
}

const DRAW = { seoyun, dohyun, chaea, prof, taejun };

// 코덱스로 그린 일러스트가 있으면 그것을, 없으면 위의 SVG 그림을 쓴다.
// 일러스트에 없는 표정은 기본 표정으로 (뒷모습은 SVG 로).
export function portrait(id, expr = 'normal') {
  const art = PORTRAIT_ART[id];
  const data = art && (art[expr] || (expr !== 'back' && art.normal));
  if (data) return `<img class="art" src="data:image/webp;base64,${data}" alt="" draggable="false">`;
  const draw = DRAW[id];
  if (!draw) return '';
  return `<svg viewBox="0 0 300 420" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${draw(expr)}</svg>`;
}
