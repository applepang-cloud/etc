// 일레븐랩스 효과음 생성 + 음정 분석 도우미 (gen-sounds.mjs 에서 쓴다)
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const API = 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128';
export const RATE = 44100;

export async function generate(text, seconds, out, influence = 0.7) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY 환경 변수가 없다');
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, duration_seconds: seconds, prompt_influence: influence }),
  });
  if (!res.ok) throw new Error(`일레븐랩스 ${res.status}: ${await res.text()}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  return out;
}

// 모노 float32 PCM 으로 디코딩
export function decode(file) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], {
    maxBuffer: 1 << 28,
  });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}

// 소리가 처음 문턱을 넘는 지점(초)
export function onset(pcm, ratio = 0.06) {
  let peak = 0;
  for (const v of pcm) peak = Math.max(peak, Math.abs(v));
  const th = peak * ratio;
  for (let i = 0; i < pcm.length; i++) if (Math.abs(pcm[i]) >= th) return { at: i / RATE, peak };
  return { at: 0, peak };
}

// YIN 으로 한 구간의 기본 주파수를 구한다. 신뢰도가 낮으면 null.
function yin(frame, fmin = 60, fmax = 1400) {
  const maxLag = Math.floor(RATE / fmin);
  const minLag = Math.floor(RATE / fmax);
  const W = frame.length - maxLag;
  if (W <= 0) return null;
  const d = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const x = frame[i] - frame[i + lag];
      s += x * x;
    }
    d[lag] = s;
  }
  // 누적 평균 정규화
  const cm = new Float32Array(maxLag + 1);
  cm[0] = 1;
  let run = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    run += d[lag];
    cm[lag] = run ? (d[lag] * lag) / run : 1;
  }
  let lag = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (cm[t] < 0.15) {
      while (t + 1 <= maxLag && cm[t + 1] < cm[t]) t++;
      lag = t;
      break;
    }
  }
  if (lag < 0) return null;
  // 포물선 보간
  const a = cm[lag - 1] ?? cm[lag], b = cm[lag], c = cm[lag + 1] ?? cm[lag];
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return { f0: RATE / (lag + shift), clarity: 1 - b };
}

// 소리 시작 뒤 구간들의 음정 중앙값과 흔들림(센트)
export function pitch(pcm, { from = 0.08, to = 0.9, fmin, fmax } = {}) {
  const start = onset(pcm).at;
  const N = 4096;
  const vals = [];
  for (let t = start + from; t + N / RATE < start + to && (t * RATE + N) < pcm.length; t += 0.04) {
    const i = Math.floor(t * RATE);
    const r = yin(pcm.subarray(i, i + N), fmin, fmax);
    if (r) vals.push(r.f0);
  }
  if (vals.length < 3) return null;
  vals.sort((x, y) => x - y);
  const f0 = vals[Math.floor(vals.length / 2)];
  const cents = vals.map((v) => 1200 * Math.log2(v / f0));
  const inBand = cents.filter((c) => Math.abs(c) < 30).length / cents.length;
  const midi = 69 + 12 * Math.log2(f0 / 440);
  return { f0, midi, nearest: Math.round(midi), off: Math.round((midi - Math.round(midi)) * 100), stable: inBand, frames: vals.length };
}
