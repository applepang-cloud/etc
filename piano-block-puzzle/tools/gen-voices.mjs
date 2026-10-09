// 스토리 대사와 플레이 중 한마디(banter-data.js)를 캐릭터별 일레븐랩스 목소리로 읽혀 sounds/voice/ 에 저장하고 js/voices.js 로 묶는다.
//   node tools/gen-voices.mjs          없는 줄만 새로 만든다
//   node tools/gen-voices.mjs --force  전부 다시 만든다 (모델·말투를 바꿨을 때)
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
const { allBanterLines } = await import(pathToFileURL(join(ROOT, 'js', 'banter-data.js')).href);

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
// eleven_v3: 억양·끊어 읽기가 사람에 가깝고 [감정] 지시를 알아듣는다 (두근두근 뮤직과 같은 모델)
const MODEL = 'eleven_v3';
const SETTINGS = { stability: 0.5 }; // v3 는 0(풍부)·0.5(자연)·1(안정) 중 하나

// 대본의 표정(expr) → v3 감정 지시
const EXPR_TAG = { smile: 'warmly', blush: 'shyly', surprise: 'surprised', sad: 'sadly', serious: 'seriously' };
// 표정이 없는 줄의 캐릭터 기본 말투
const BASE_TAG = { seoyun: 'gently', taejun: 'calmly, smoothly', chaea: 'confidently', prof: 'sternly', mc: 'like an energetic announcer' };

// 대본에서 대사(s) 줄을 모두 모은다
const lines = new Map();
(function walk(x) {
  if (Array.isArray(x)) return x.forEach(walk);
  if (!x || typeof x !== 'object') return;
  if (Array.isArray(x.s)) {
    const [who, text] = x.s;
    if (VOICE_IDS[who]) lines.set(voiceKey(who, text), { who, text, expr: x.s[2] });
  }
  for (const v of Object.values(x)) if (typeof v === 'object') walk(v);
})(CHAPTER1);
// 플레이 중 한마디·결과 화면 대사
for (const [who, text, expr] of allBanterLines()) if (VOICE_IDS[who]) lines.set(voiceKey(who, text), { who, text, expr });

// 읽힐 글: 괄호(속마음)·낫표를 떼고, 말줄임은 쉼으로, 앞에 감정 지시를 붙인다
function spoken({ who, text, expr }) {
  const mono = /^\(.*\)$/s.test(text.trim());
  const body = text.trim().replace(/^\((.*)\)$/s, '$1').replace(/[「」]/g, '').replace(/…/g, '...').replace(/\s+/g, ' ').trim();
  const tags = [];
  if (mono) tags.push('quietly, thinking to himself');
  if (EXPR_TAG[expr]) tags.push(EXPR_TAG[expr]);
  else if (!mono && BASE_TAG[who]) tags.push(BASE_TAG[who]);
  return tags.length ? `[${tags.join(', ')}] ${body}` : body;
}

async function tts(voice, text, attempt = 0) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS, language_code: 'ko' }),
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
  // --force: 모델·말투를 바꿨을 때 전부 다시 만든다
  if (process.argv.includes('--force')) for (const f of readdirSync(OUT)) if (f.endsWith('.mp3')) rmSync(join(OUT, f));
  const todo = [...lines].filter(([key]) => !existsSync(join(OUT, `${key}.mp3`)));
  console.log(`대사 ${lines.size}줄, 새로 만들 줄 ${todo.length}`);
  let done = 0;
  const worker = async () => {
    while (todo.length) {
      const [key, line] = todo.shift();
      const raw = join(tmpdir(), `pb-voice-${key}.mp3`);
      // 아주 짧은 줄은 v3 가 빈 소리를 줄 때가 있다 → 감정 지시 없이 다시, 그래도 안 되면 건너뜀
      let ok = false;
      for (const text of [spoken(line), spoken({ who: line.who, text: line.text })]) {
        try {
          writeFileSync(raw, await tts(VOICE_IDS[line.who], text));
          shrink(raw, join(OUT, `${key}.mp3`));
          ok = true;
          break;
        } catch {}
      }
      rmSync(raw, { force: true });
      if (!ok) console.log(`\n건너뜀: ${line.who} ${line.text}`);
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
