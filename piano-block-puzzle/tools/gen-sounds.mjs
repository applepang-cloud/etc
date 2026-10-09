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
// 멜로디 악기: 목표 음마다 후보를 만들고, 잰 음정을 모두 모아 음역을 고르게 덮는 샘플만 남긴다.
// range 는 실제로 울릴 음역(octave 옮김 반영).
const INSTR = {
  guitar: { range: [45, 81], targets: [40, 43, 47, 48, 52, 53, 55, 58, 63, 68, 73, 78], seconds: 3, keep: 2.6, fade: 0.6, influence: 0.75,
    text: (n, m) => `${m < 57 ? 'A low note on the bass strings of the guitar, well below middle C: ' : ''}One single note ${n} plucked on a nylon-string classical acoustic guitar, warm and clear, let ring, close-miked studio recording, dry, no other notes, no strumming, no background noise` },
  bass: { range: [33, 67], targets: [36, 41, 46, 51, 56, 61, 66], seconds: 2.5, keep: 2.2, fade: 0.5, influence: 0.75, fmin: 35,
    text: (n) => `One single deep note ${n} on an electric bass guitar played fingerstyle, round warm tone, let ring, dry studio recording, no other notes, no background noise` },
  violin: { range: [52, 88], targets: [55, 60, 65, 70, 75, 80, 85], seconds: 3, keep: 2.4, fade: 0.35, influence: 0.75,
    text: (n) => `One single sustained note ${n} bowed on a solo violin, smooth steady legato bow, gentle vibrato, single pitch held, close-miked studio recording, dry, no other notes, no accompaniment` },
  cello: { range: [36, 72], targets: [38, 43, 48, 53, 58, 63, 68], seconds: 3, keep: 2.4, fade: 0.35, influence: 0.75, fmin: 40,
    text: (n) => `One single sustained note ${n} bowed on a solo cello, rich warm tone, smooth steady bow, gentle vibrato, single pitch held, close-miked studio recording, dry, no other notes` },
  flute: { range: [57, 93], targets: [60, 65, 70, 75, 80, 85, 90], seconds: 3, keep: 2.4, fade: 0.35, influence: 0.75, fmax: 2400,
    text: (n) => `One single sustained note ${n} played on a concert flute, pure airy tone, steady breath, single pitch held, close-miked studio recording, dry, no other notes, no accompaniment` },
  trumpet: { range: [52, 84], targets: [55, 60, 65, 70, 72, 75, 77, 80, 82], seconds: 3, keep: 2.2, fade: 0.3, influence: 0.75,
    text: (n, m) => `${m >= 70 ? 'A high bright note in the upper register of the trumpet, well above middle C: ' : ''}One single sustained note ${n} played on a solo trumpet, warm bright brass tone, steady, single pitch held, close-miked studio recording, dry, no other notes, no accompaniment` },
  synth: { range: [45, 88], targets: [48, 54, 60, 66, 72, 78, 84], seconds: 2.5, keep: 2.2, fade: 0.3, influence: 0.75,
    text: (n) => `One single sustained note ${n} on a warm analog synthesizer lead, smooth sawtooth with gentle filter, steady pitch, no vibrato, dry, no other notes, no effects, no background noise` },
};
const INSTR_TRIES = 3;

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

// 멜로디 악기 하나: 후보 생성 → 음정 측정 → 음역을 덮는 최소 조합 선택 → 다듬어 저장
async function makeInstrument(id, def) {
  console.log(id);
  const opts = { fmin: def.fmin ?? 60, fmax: def.fmax ?? 1400 };
  const cands = [];
  for (const t of def.targets) {
    for (let i = 0; i < INSTR_TRIES; i++) {
      const raw = join(RAW, `${id}_t${t}_${i}.mp3`);
      if (!existsSync(raw)) await generate(def.text(spoken(t), t), def.seconds, raw, def.influence);
      const p = pitch(decode(raw), opts);
      const ok = p && p.stable >= 0.8;
      console.log(`  ${noteName(t)} #${i + 1}: ${p ? `${noteName(p.nearest)} ${p.off >= 0 ? '+' : ''}${p.off}c, 안정 ${(p.stable * 100) | 0}%` : '음정 못 잼'}${ok ? '' : ' (버림)'}`);
      if (ok) cands.push({ raw, midi: p.midi, stable: p.stable });
      if (ok && Math.abs(p.midi - t) < 0.5) break;
    }
  }
  if (!cands.length) throw new Error(`${id}: 쓸 만한 후보가 없다`);
  // 음역의 반음마다 가장 가까운 후보를 고르고, 거의 같은 음은 하나만
  const chosen = new Set();
  let worst = 0;
  for (let m = def.range[0]; m <= def.range[1]; m++) {
    let best = cands[0];
    for (const c of cands) if (Math.abs(c.midi - m) < Math.abs(best.midi - m)) best = c;
    worst = Math.max(worst, Math.abs(best.midi - m));
    chosen.add(best);
  }
  const picked = [...chosen].sort((a, b) => a.midi - b.midi)
    .filter((c, i, arr) => i === 0 || c.midi - arr[i - 1].midi > 0.6);
  for (const k of Object.keys(manifest)) if (manifest[k].group === 'inst' && manifest[k].inst === id) {
    delete manifest[k];
    rmSync(join(OUT, `${k}.mp3`), { force: true });
  }
  picked.forEach((c, i) => {
    const name = `${id}_${i + 1}`;
    const info = finish(c.raw, { group: 'inst', keep: def.keep, fade: def.fade }, join(OUT, `${name}.mp3`));
    manifest[name] = { group: 'inst', inst: id, midi: +c.midi.toFixed(3), ...info };
  });
  saveManifest();
  console.log(`  → ${picked.map((c) => noteName(Math.round(c.midi))).join(' ')} (최대 ${worst.toFixed(1)}반음 옮김)`);
}

function embed() {
  const entries = SOUNDS.filter((s) => manifest[s.name] && existsSync(join(OUT, `${s.name}.mp3`)));
  const b64 = (s) => readFileSync(join(OUT, `${s.name}.mp3`)).toString('base64');
  const pitched = (g) => entries.filter((s) => s.group === g)
    .map((s) => `    { midi: ${manifest[s.name].midi}, data: '${b64(s)}' },`).join('\n');
  const keyed = (g) => entries.filter((s) => s.group === g)
    .map((s) => `    ${s.key}: '${b64(s)}',`).join('\n');
  const instBlock = Object.keys(INSTR).map((id) => {
    const rows = Object.entries(manifest)
      .filter(([name, m]) => m.group === 'inst' && m.inst === id && existsSync(join(OUT, `${name}.mp3`)))
      .sort((a, b) => a[1].midi - b[1].midi)
      .map(([name, m]) => `      { midi: ${m.midi}, data: '${b64({ name })}' },`);
    return `    ${id}: [\n${rows.join('\n')}\n    ],`;
  }).join('\n');
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
  inst: {
${instBlock}
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
  for (const [id, def] of Object.entries(INSTR)) {
    const have = Object.values(manifest).some((m) => m.group === 'inst' && m.inst === id);
    if (only.length ? !only.includes(id) : have) continue;
    await makeInstrument(id, def);
  }
}
embed();
