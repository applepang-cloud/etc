// 대사 음성의 키: 누가 + 무슨 말 (FNV-1a 32비트). 대본을 고치면 그 줄만 새 키가 된다.
// tools/gen-voices.mjs 와 story.js 가 같이 쓴다.
export function voiceKey(who, text) {
  let h = 0x811c9dc5;
  const s = `${who}|${text}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
