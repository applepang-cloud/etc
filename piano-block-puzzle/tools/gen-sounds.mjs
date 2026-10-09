// 일레븐랩스로 게임 소리를 만들고 다듬어 sounds/ 에 저장한 뒤 js/samples.js 로 묶는다.
//   node tools/gen-sounds.mjs            없는 소리만 새로 만들고 samples.js 갱신
//   node tools/gen-sounds.mjs piano_c4   그 소리만 다시 만든다 (이름 여러 개 가능)
//   node tools/gen-sounds.mjs --embed    생성 없이 samples.js 만 다시 쓴다
// ELEVENLABS_API_KEY 환경 변수가 필요하다. 키는 결과물에 들어가지 않는다.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { generate, decode, onset, pitch, RATE } from './sfx-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'sounds');
const RAW = join(tmpdir(), 'pb-sfx-raw');
const MANIFEST = join(OUT, 'manifest.json');
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });
const TRIES = 6;

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m) => NOTE[m % 12] + (Math.floor(m / 12) - 1);
const SPOKEN = { 'C#': 'C sharp', 'D#': 'D sharp', 'F#': 'F sharp', 'G#': 'G sharp', 'A#': 'A sharp' };
const spoken = (m) => (SPOKEN[NOTE[m % 12]] ?? NOTE[m % 12]) + (Math.floor(m / 12) - 1);

// 소리 목록. pitched 는 목표 음(midi)이 있고, 생성 후 실제 음정을 재서 기록한다.
const SOUNDS = [];
for (const m of [48, 52, 56, 60, 64, 68, 72, 76, 80, 84]) {
  SOUNDS.push({
    name: `piano_${noteName(m).replace('#', 's').toLowerCase()}`, group: 'piano', target: m, seconds: 3,
    keep: 2.8, fade: 0.6,
    text: `${m < 60 ? 'A deep low bass-register piano note, left hand, below middle C: ' : ''}One single note ${spoken(m)} on a warm concert grand piano, struck once at medium velocity and left to ring naturally, close-miked studio recording, dry, no reverb, no other notes, no background noise`,
  });
}
for (const m of [60, 64, 67, 71, 74]) {
  SOUNDS.push({
    name: `vocal_${noteName(m).toLowerCase()}`, group: 'vocal', target: m, seconds: 2.5, keep: 2.2, fade: 0.35,
    text: `${m >= 70 ? 'High soprano head voice, bright and light, well above middle C: ' : ''}A solo female pop singer sings one steady sustained "aah" vowel on the note ${spoken(m)}, soft clear tone, gentle vibrato, dry studio vocal, single pitch held, no lyrics, no music, no other sounds`,
  });
}
const DRUMS = {
  KK: ['Single punchy acoustic kick drum hit, tight low thump, dry studio drum sample, one hit only', 0.5],
  SN: ['Single crisp acoustic snare drum hit, bright crack with short snares rattle, dry studio drum sample, one hit only', 0.6],
  HH: ['Single closed hi-hat hit, short tight tick, dry studio drum sample, one hit only', 0.25],
  CR: ['Single crash cymbal hit, bright shimmering wash that decays, studio drum sample, one hit only', 2.0],
  TH: ['Single high rack tom drum hit, round resonant tone, dry studio drum sample, one hit only', 0.7],
  TL: ['Single low floor tom drum hit, deep warm boom, dry studio drum sample, one hit only', 0.9],
};
for (const [key, [text, keep]] of Object.entries(DRUMS)) {
  SOUNDS.push({ name: `drum_${key.toLowerCase()}`, group: 'drums', key, seconds: Math.max(0.6, keep + 0.4), keep, fade: Math.min(0.3, keep / 3), text });
}
const SFX = {
  boom: ['Cartoon bomb explosion for a mobile puzzle game, punchy boom with a quick sparkly debris tail, satisfying, short', 1.4, 1.2],
  thud: ['A soft wooden toy block dropping onto a table, single dull muted thud, short, mobile game sound', 0.6, 0.35],
  tick: ['Single crisp wooden metronome click, very short, dry', 0.5, 0.12],
  tock: ['Single high bright metronome bell ping accent click, very short, dry', 0.5, 0.15],
  sparkle: ['Magical sparkle chime for a mobile puzzle game reward, rising bright twinkling bells, short and pleasant', 1.5, 1.1],
};
for (const [key, [text, seconds, keep]] of Object.entries(SFX)) {
  SOUNDS.push({ name: `sfx_${key}`, group: 'sfx', key, seconds, keep, fade: Math.min(0.4, keep / 3), text });
}

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const saveManifest = () => writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

// 앞 무음을 자르고 길이·페이드·음량을 맞춰 모노 mp3 로 저장
function finish(raw, s, out) {
  const pcm = decode(raw);
  const start = Math.max(0, onset(pcm, s.group === 'vocal' ? 0.1 : 0.04).at - 0.004);
  const keep = Math.min(s.keep, pcm.length / RATE - start);
  let peak = 0;
  for (let i = Math.floor(start * RATE); i < Math.floor((start + keep) * RATE) && i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  const gain = peak > 0 ? 0.89 / peak : 1; // -1 dBFS
  const fadeAt = Math.max(0, keep - s.fade);
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', raw,
    '-af', `atrim=start=${start.toFixed(4)}:duration=${keep.toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:d=0.003,afade=t=out:st=${fadeAt.toFixed(3)}:d=${s.fade},volume=${gain.toFixed(4)}`,
    '-ac', '1', '-ar', String(RATE), '-b:a', '96k', out,
  ]);
  return { seconds: +keep.toFixed(3), gain: +gain.toFixed(2) };
}

async function make(s, use = null) {
  const tries = s.target ? TRIES : 1;
  let best = null;
  for (let i = use ?? 0; i < (use == null ? tries : use + 1); i++) {
    const raw = join(RAW, `${s.name}_${i}.mp3`);
    if (!existsSync(raw)) {
      process.stdout.write(`  생성 ${s.name} #${i + 1}… `);
      await generate(s.text, s.seconds, raw);
      console.log('완료');
    }
    if (!s.target) { best = { raw }; break; }
    const p = pitch(decode(raw), s.group === 'vocal' ? { from: 0.15, to: 1.6, fmin: 150, fmax: 900 } : {});
    const dist = p ? Math.abs(p.midi - s.target) : 99;
    console.log(`  ${s.name} #${i + 1}: ${p ? `${noteName(p.nearest)} ${p.off >= 0 ? '+' : ''}${p.off}c, 안정 ${(p.stable * 100) | 0}%` : '음정 못 잼'}`);
    if (p && p.stable >= 0.8 && (!best || dist < best.dist)) best = { raw, p, dist };
    if (use != null && p) best = { raw, p, dist };
    if (best && best.dist < 0.5) break; // 목표 음에 맞으면 그만
  }
  if (!best) throw new Error(`${s.name}: 음정이 안정된 결과를 못 얻었다`);
  const out = join(OUT, `${s.name}.mp3`);
  const info = finish(best.raw, s, out);
  manifest[s.name] = {
    group: s.group, ...(s.key ? { key: s.key } : {}),
    ...(best.p ? { midi: +best.p.midi.toFixed(3) } : {}),
    ...info,
  };
  saveManifest();
}

function embed() {
  const entries = SOUNDS.filter((s) => manifest[s.name] && existsSync(join(OUT, `${s.name}.mp3`)));
  const b64 = (s) => readFileSync(join(OUT, `${s.name}.mp3`)).toString('base64');
  const pitched = (g) => entries.filter((s) => s.group === g)
    .map((s) => `    { midi: ${manifest[s.name].midi}, data: '${b64(s)}' },`).join('\n');
  const keyed = (g) => entries.filter((s) => s.group === g)
    .map((s) => `    ${s.key}: '${b64(s)}',`).join('\n');
  const js = `// tools/gen-sounds.mjs 가 만든 파일. 직접 고치지 말 것.
// 일레븐랩스 효과음 생성으로 만든 mp3 를 base64 로 담는다. midi 는 실제로 잰 음정.
export const SAMPLES = {
  piano: [
${pitched('piano')}
  ],
  vocal: [
${pitched('vocal')}
  ],
  drums: {
${keyed('drums')}
  },
  sfx: {
${keyed('sfx')}
  },
};
`;
  writeFileSync(join(ROOT, 'js', 'samples.js'), js);
  console.log(`js/samples.js: 소리 ${entries.length}개, ${(js.length / 1024).toFixed(0)} KB`);
}

const args = process.argv.slice(2);
// --use 이름=번호 : 이미 만든 후보 중 그 번호(1부터)를 그대로 쓴다
const uses = args.filter((a) => a.startsWith('--use=')).map((a) => a.slice(6).split('='));
for (const [name, n] of uses) {
  const s = SOUNDS.find((x) => x.name === name);
  if (!s) throw new Error(`없는 소리: ${name}`);
  console.log(`${name} ← 후보 #${n}`);
  await make(s, Number(n) - 1);
}
if (uses.length) args.push('--embed');
if (!args.includes('--embed')) {
  const only = args.filter((a) => !a.startsWith('--'));
  for (const s of SOUNDS) {
    const redo = only.includes(s.name);
    if (only.length && !redo) continue;
    if (!redo && manifest[s.name] && existsSync(join(OUT, `${s.name}.mp3`))) continue;
    if (redo) for (let i = 0; i < TRIES; i++) rmSync(join(RAW, `${s.name}_${i}.mp3`), { force: true });
    console.log(s.name);
    await make(s);
  }
}
embed();
