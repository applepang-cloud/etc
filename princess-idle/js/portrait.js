/*
 * 방치형 공주 키우기 — 공주 초상화 (SVG)
 * 나이에 따라 키와 머리 길이가, 기분에 따라 표정이 바뀐다.
 * 배경 색은 CSS 변수(--sky, --hill, --castle …)를 따라 계절·테마에 맞춰진다.
 */
(function (root) {
  'use strict';

  const INK = '#3A2433';

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
    const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  function eyes(mood) {
    switch (mood) {
      case 'happy':
        return `<path d="M98 104 Q104 96 110 104 M130 104 Q136 96 142 104" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      case 'tired':
        return `<path d="M98 101 L110 103 M142 101 L130 103" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
          <ellipse cx="104" cy="106" rx="5" ry="3.5" fill="${INK}"/><ellipse cx="136" cy="106" rx="5" ry="3.5" fill="${INK}"/>`;
      case 'exhausted':
      case 'sick':
        return `<path d="M99 98 L108 103 L99 108 M141 98 L132 103 L141 108" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      case 'rest':
        return `<path d="M98 103 Q104 109 110 103 M130 103 Q136 109 142 103" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      default:
        return `<ellipse cx="104" cy="103" rx="5.5" ry="7.5" fill="${INK}"/><ellipse cx="136" cy="103" rx="5.5" ry="7.5" fill="${INK}"/>
          <circle cx="102" cy="100" r="2" fill="#fff"/><circle cx="134" cy="100" r="2" fill="#fff"/>`;
    }
  }

  function brows(mood) {
    if (mood === 'tired' || mood === 'exhausted' || mood === 'sick') {
      return `<path d="M97 90 Q103 86 110 89 M143 90 Q137 86 130 89" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>`;
    }
    return `<path d="M97 89 Q104 85 110 88 M143 89 Q136 85 130 88" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".55"/>`;
  }

  function mouth(mood) {
    switch (mood) {
      case 'happy':
        return '<path d="M112 115 Q120 126 128 115 Z" fill="#C2546B"/>';
      case 'tired':
        return `<path d="M115 119 L125 119" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
      case 'exhausted':
      case 'sick':
        return `<path d="M112 120 Q115 116 118 120 Q121 124 124 120 Q126 117 128 120" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
      case 'rest':
        return '<ellipse cx="120" cy="119" rx="2.6" ry="3" fill="#C2546B"/>';
      default:
        return `<path d="M114 117 Q120 122 126 117" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    }
  }

  function extras(mood) {
    if (mood === 'tired' || mood === 'exhausted') {
      return '<path d="M161 82 Q166 92 161 97 Q156 92 161 82 Z" fill="#8EC5F0" opacity=".9"/>';
    }
    if (mood === 'sick') {
      return '<rect x="102" y="64" width="36" height="11" rx="4" fill="#fff" stroke="#D8C6D2"/>';
    }
    if (mood === 'rest') {
      return `<text x="158" y="62" class="pr-zz" fill="${INK}">z</text><text x="170" y="48" class="pr-zz pr-zz-2" fill="${INK}">z</text>`;
    }
    return '';
  }

  function scenery(season) {
    // 계절마다 흩날리는 것: 꽃잎, 반딧불, 낙엽, 눈
    const bits = {
      spring: [[30, 120], [200, 80], [180, 150], [60, 60], [215, 190]],
      summer: [[40, 140], [190, 110], [210, 170], [70, 90]],
      autumn: [[35, 110], [205, 95], [185, 160], [70, 70], [220, 210]],
      winter: [[30, 100], [60, 160], [200, 70], [180, 140], [215, 200], [100, 40]],
    }[season] || [];
    const shape = (x, y, i) => {
      if (season === 'winter') return `<circle cx="${x}" cy="${y}" r="${2 + (i % 2)}"/>`;
      if (season === 'summer') return `<circle cx="${x}" cy="${y}" r="2.2"/>`;
      return `<ellipse cx="${x}" cy="${y}" rx="4" ry="2.4" transform="rotate(${(i * 47) % 180} ${x} ${y})"/>`;
    };
    return `<g class="pr-drift" fill="var(--petal)">${bits.map((b, i) => shape(b[0], b[1], i)).join('')}</g>`;
  }

  /**
   * @param {{age:number, mood:string, hair:string, skin:string, dress:string, season:string}} o
   */
  function render(o) {
    const t = Math.max(0, Math.min(1, (o.age - 10) / 8));
    const scale = (0.84 + t * 0.2).toFixed(3);
    const hairEnd = Math.round(176 + t * 44);
    const hair = o.hair;
    const hairDark = shade(hair, -0.12);
    const skin = o.skin;
    const dress = o.dress;
    const dressDark = shade(dress, -0.12);
    const dressLight = shade(dress, 0.22);
    const blush = o.mood === 'sick' ? 0.85 : 0.45;

    return `<svg viewBox="0 0 240 280" role="img" aria-label="${o.label || '공주'}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="42" cy="54" r="17" fill="var(--orb)"/>
  <path d="M150 214 V150 h8 v-8 h6 v8 h6 v-8 h6 v8 h8 V214 Z M176 214 V128 l9 -14 l9 14 V214 Z M196 214 V160 h7 v-7 h6 v7 h7 V214 Z" fill="var(--castle)"/>
  <path d="M0 214 Q60 186 120 204 T240 196 V280 H0 Z" fill="var(--hill)"/>
  <path d="M0 238 Q80 222 160 236 T240 232 V280 H0 Z" fill="var(--hill-2)"/>
  ${scenery(o.season)}
  <ellipse cx="120" cy="263" rx="46" ry="6" fill="var(--shadow)"/>
  <g transform="translate(120 262) scale(${scale}) translate(-120 -262)">
    <g class="pr-body">
      <path d="M76 106 C66 150 70 ${hairEnd - 22} 84 ${hairEnd} Q120 ${hairEnd + 10} 156 ${hairEnd} C170 ${hairEnd - 22} 174 150 164 106 Z" fill="${hairDark}"/>
      <ellipse cx="108" cy="258" rx="9" ry="5" fill="#4A3045"/>
      <ellipse cx="132" cy="258" rx="9" ry="5" fill="#4A3045"/>
      <path d="M98 176 L142 176 Q176 226 172 252 Q120 264 68 252 Q64 226 98 176 Z" fill="${dress}"/>
      <path d="M71 249 Q120 261 169 249" stroke="${dressLight}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M100 148 Q120 154 140 148 L143 180 Q120 186 97 180 Z" fill="${dressDark}"/>
      <rect x="96" y="173" width="48" height="8" rx="4" fill="${dressLight}"/>
      <rect x="85" y="158" width="10" height="32" rx="5" fill="${skin}" transform="rotate(10 90 160)"/>
      <rect x="145" y="158" width="10" height="32" rx="5" fill="${skin}" transform="rotate(-10 150 160)"/>
      <circle cx="94" cy="190" r="6" fill="${skin}"/>
      <circle cx="146" cy="190" r="6" fill="${skin}"/>
      <circle cx="96" cy="154" r="12" fill="${dress}"/>
      <circle cx="144" cy="154" r="12" fill="${dress}"/>
      <rect x="113" y="126" width="14" height="22" rx="4" fill="${skin}"/>
      <path d="M108 146 Q120 157 132 146 L128 142 Q120 150 112 142 Z" fill="#fff" opacity=".9"/>
      <circle cx="120" cy="96" r="42" fill="${skin}"/>
      <ellipse cx="100" cy="113" rx="7" ry="4" fill="#FF8FA3" opacity="${blush}"/>
      <ellipse cx="140" cy="113" rx="7" ry="4" fill="#FF8FA3" opacity="${blush}"/>
      ${brows(o.mood)}
      ${eyes(o.mood)}
      ${mouth(o.mood)}
      <path d="M76 104 C70 60 104 46 120 50 C138 46 172 60 164 104 C158 92 152 84 146 80 C140 92 128 94 122 82 C116 94 102 96 96 82 C90 90 84 96 76 104 Z" fill="${hair}"/>
      <path d="M78 98 C73 120 76 138 86 150 C86 132 84 116 88 102 Z" fill="${hair}"/>
      <path d="M162 98 C167 120 164 138 154 150 C154 132 156 116 152 102 Z" fill="${hair}"/>
      <path d="M96 64 Q112 55 130 58" stroke="#fff" stroke-opacity=".3" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M103 59 L107 44 L113 53 L120 37 L127 53 L133 44 L137 59 Q120 54 103 59 Z" fill="#E9C155" stroke="#B88A1E" stroke-width="1.2" stroke-linejoin="round"/>
      <circle cx="120" cy="50" r="3.6" fill="#E0507F"/>
      ${extras(o.mood)}
    </g>
  </g>
</svg>`;
  }

  root.PrincessPortrait = { render, shade };
})(typeof self !== 'undefined' ? self : this);
