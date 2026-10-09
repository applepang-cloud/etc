// 스토리 대사를 캐릭터별 일레븐랩스 목소리로 읽혀 sounds/voice/ 에 저장하고 js/voices.js 로 묶는다.
//   node tools/gen-voices.mjs          없는 줄만 새로 만든다
//   node tools/gen-voices.mjs --embed  생성 없이 voices.js 만 다시 쓴다
// ELEVENLABS_API_KEY 환경 변수가 필요하다. 해설(n)은 읽지 않는다.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'sounds', 'voice');
mkdirSync(OUT, { recursive: true });
const { CHAPTER1 } = await import(pathToFileURL(join(ROOT, 'js', 'story-data.js')).href);
const { voiceKey } = await import(pathToFileURL(join(ROOT, 'js', 'voice-key.js')).href);

// 캐릭터 → 일레븐랩스 목소리 (보이스 오디션에서 고름)
export const VOICE_IDS = {
  dohyun: 'ihlabR7UElco54Fu6MMA', // PB 이도현 (보이스 디자인 · 맑은 소년미)
  seoyun: '9Es4T0g1lLLAXX26GW2T', // 귀엽고 차분한 여자
  prof: 'UmYoqGlufKxhJ6NCx5Mv', // Jang Ho · 진중, 허스키
  taejun: 'WmbZPt6ei1sctzqPHrGr', // PB 강태준 (보이스 디자인 · 젠틀한 위압감)
  chaea: 'wS36Z5Rg7em6Gl0vlhBo', // PB 윤채아 (보이스 디자인 · 시크한 천재)
  director: 'hjCvGtSCRPyjYwe2lDf1', // Juan · 중년, 자신감
  mc: 'eMzlsWTml7eAEDvSiETn', // Kwan · 중년 서울, 자신감
};
const MODEL = 'eleven_multilingual_v2';
const SETTINGS = { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true };

// 대본에서 대사(s) 줄을 모두 모은다
const lines = new Map();
(function walk(x) {
  if (Array.isArray(x)) return x.forEach(walk);
  if (!x || typeof x !== 'object') return;
  if (Array.isArray(x.s)) {
    const [who, text] = x.s;
    if (VOICE_IDS[who]) lines.set(voiceKey(who, text), { who, text });
  }
  for (const v of Object.values(x)) if (typeof v === 'object') walk(v);
})(CHAPTER1);

// 괄호(속마음)와 낫표는 떼고 읽힌다
const spoken = (t) => t.replace(/^\((.*)\)$/s, '$1').replace(/[「」]/g, '').trim();

async function tts(voice, text, attempt = 0) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }),
  });
  if (res.status === 429 && attempt < 8) {
    await new Promise((ok) => setTimeout(ok, 3000 * (attempt + 1)));
    return tts(voice, text, attempt + 1);
  }
  if (!res.ok) throw new Error(`${voice}: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

// 게임에 넣을 크기로: 모노 24kHz 48kbps, 앞뒤 무음 정리
function shrink(raw, out) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw,
    '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.08',
    '-ac', '1', '-ar', '24000', '-b:a', '48k', out]);
}

if (!process.argv.includes('--embed')) {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY 환경 변수가 없다');
  const todo = [...lines].filter(([key]) => !existsSync(join(OUT, `${key}.mp3`)));
  console.log(`대사 ${lines.size}줄, 새로 만들 줄 ${todo.length}`);
  let done = 0;
  const worker = async () => {
    while (todo.length) {
      const [key, { who, text }] = todo.shift();
      const raw = join(tmpdir(), `pb-voice-${key}.mp3`);
      writeFileSync(raw, await tts(VOICE_IDS[who], spoken(text)));
      shrink(raw, join(OUT, `${key}.mp3`));
      rmSync(raw, { force: true });
      process.stdout.write(`\r${++done}`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  console.log();
  // 대본에서 빠진 줄의 음성은 지운다
  for (const f of readdirSync(OUT)) if (f.endsWith('.mp3') && !lines.has(f.slice(0, -4))) rmSync(join(OUT, f));
}

const entries = [...lines.keys()].filter((k) => existsSync(join(OUT, `${k}.mp3`))).sort();
const js = `// tools/gen-voices.mjs 가 만든 파일. 직접 고치지 말 것.
// 스토리 대사 음성(일레븐랩스, mp3 base64). 키는 voice-key.js 의 voiceKey(누가, 대사).
export const VOICES = {
${entries.map((k) => `  '${k}': '${readFileSync(join(OUT, `${k}.mp3`)).toString('base64')}',`).join('\n')}
};
`;
writeFileSync(join(ROOT, 'js', 'voices.js'), js);
console.log(`js/voices.js: ${entries.length}줄, ${(js.length / 1024).toFixed(0)} KB`);
