// Piano Bricks — Codex bridge.
// Lets the game (index.html) find songs and transcribe their melody with Codex, using this PC's
// Codex login (ChatGPT / Codex subscription). Run it with codex-bridge.cmd or `node codex-bridge.mjs`,
// then open the game on this PC and use 새 곡 만들기 → 노래 찾기.
//
// It only does two fixed jobs (song search, melody transcription); the prompts are written here,
// the game only sends the song text. Codex runs read-only with web search, in an empty temp folder.
// Node 18+, no packages.

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.PB_BRIDGE_PORT) || 8788;
const TIMEOUT_MS = 6 * 60 * 1000;
const CACHE_MS = 24 * 3600 * 1000;
// Pages allowed to call the bridge: files opened directly, local servers, and GitHub Pages.
const ORIGINS = [/^null$/, /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^https:\/\/applepang-cloud\.github\.io$/]
  .concat((process.env.PB_BRIDGE_ORIGINS || '').split(',').filter(Boolean).map((o) => new RegExp('^' + o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')));

// ---------- finding Codex ----------

function findCodex() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  // Codex app: %LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe, newest complete download first
  const base = join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  if (existsSync(base)) {
    const found = readdirSync(base)
      .map((d) => join(base, d))
      .filter((d) => existsSync(join(d, 'codex.exe')) && existsSync(join(d, 'codex-code-mode-host.exe')))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (found.length) return join(found[0], 'codex.exe');
  }
  const cmd = join(homedir(), 'bin', 'codex.cmd');
  if (existsSync(cmd)) return cmd;
  return 'codex';
}
const CODEX = findCodex();

// ---------- the two jobs ----------

const str = { type: 'string' };
const obj = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });

const JOBS = {
  search: {
    effort: 'low',
    schema: obj({ results: { type: 'array', items: obj({ title: str, artist: str, year: str, note: str }) } }),
    prompt: ({ query }) => [
      'You help a player pick a song for a piano brick-breaker game.',
      'Use web search to find the songs that best match the player\'s search text: "' + query + '"',
      'The text may be a title, an artist, lyrics they remember, or a mix, in any language.',
      'Return up to 6 different songs, the most likely one first. Leave out covers and remixes unless asked.',
      '- title: the song\'s usual title in its original language.',
      '- artist: the main performer (original language; add the English name in parentheses if commonly used).',
      '- year: release year, or "" if unknown.',
      '- note: one short plain Korean phrase that tells the songs apart (album, drama OST, genre…). No links, no markdown.',
      'If nothing matches, return {"results": []}.'
    ].join('\n')
  },
  transcribe: {
    effort: 'medium',
    schema: obj({
      title: str, artist: str, bpm: { type: 'number' },
      notes: { type: 'array', items: obj({ pitch: str, beats: { type: 'number' } }) },
      chords: { type: 'array', items: str },
      error: str
    }),
    prompt: ({ title, artist }) => [
      'You transcribe songs into a simple melody chart for a piano brick-breaker game.',
      'Song: "' + title + '"' + (artist ? ' by ' + artist : '') + '.',
      'Use web search (sheet music, melody/note sites, chord sites, tempo databases) to get the real tune, key, tempo and chords.',
      'Be quick: a few searches are enough; do not read more pages than you need.',
      'Do not output any lyrics.',
      '- title / artist: the song\'s usual name and performer, original language.',
      '- bpm: tempo in quarter-note beats per minute.',
      '- notes: the main vocal melody of the most recognizable part (for example the chorus, or verse then chorus), in order,',
      '  48 to 64 beats in total. pitch is like "C4", "F#4", "Bb3", or "R" for a rest. beats is the length in quarter-note',
      '  beats, a multiple of 0.5. Keep pitches between C3 and C6, in the song\'s real key.',
      '- chords: one chord symbol per 2 beats covering the same span (like "C", "Am", "G7").',
      '- error: "" normally. If you cannot find or recognize the song at all, set error to "unknown" and leave notes empty.',
      'If exact notes are uncertain, give your closest version of the tune\'s contour and rhythm.'
    ].join('\n')
  }
};

// ---------- running Codex ----------

let busy = Promise.resolve();
const cache = new Map();
const CACHE_FILE = join(tmpdir(), 'piano-bricks-codex-cache.json');
try {
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(CACHE_FILE, 'utf8')))) if (Date.now() - v.at < CACHE_MS) cache.set(k, v);
} catch { /* no cache yet */ }

function runCodex(job, input) {
  const key = job + ':' + JSON.stringify(input).toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.data);
  // One job at a time: Codex runs are heavy and this is a one-player bridge.
  const run = busy.then(() => new Promise((resolve, reject) => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-codex-'));
    const schema = join(dir, 'schema.json'), out = join(dir, 'answer.json');
    writeFileSync(schema, JSON.stringify(JOBS[job].schema));
    const args = ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-C', dir,
      '-c', 'web_search=live', '-c', 'model_reasoning_effort=' + JOBS[job].effort, '--output-schema', schema, '--color', 'never', '-o', out, '-'];
    const isCmd = /\.(cmd|bat)$/i.test(CODEX);
    const child = isCmd
      ? spawn('cmd.exe', ['/d', '/s', '/c', '"' + [CODEX, ...args].map((a) => '"' + a + '"').join(' ') + '"'], { windowsVerbatimArguments: true })
      : spawn(CODEX, args);
    let err = '';
    child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    child.stdout.resume();
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.on('error', (e) => { clearTimeout(timer); reject(new Error('Codex를 실행하지 못했어요: ' + e.message)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        if (!existsSync(out)) throw new Error(code === null ? 'Codex가 너무 오래 걸려서 멈췄어요.' : 'Codex가 답하지 못했어요. (' + (err.split('\n').filter((l) => !/rmcp|127\.0\.0\.1/.test(l)).pop() || 'exit ' + code) + ')');
        const data = JSON.parse(readFileSync(out, 'utf8'));
        const empty = (data.results && !data.results.length) || data.error;
        if (!empty) { // misses are not kept, so a retry asks again
          cache.set(key, { at: Date.now(), data });
          try { writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(cache))); } catch { /* ignore */ }
        }
        resolve(data);
      } catch (e) {
        reject(e);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
    child.stdin.end(JOBS[job].prompt(input));
  }));
  busy = run.catch(() => {});
  return run;
}

// ---------- HTTP ----------

const clean = (v, n) => String(v || '').replace(/["\\\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

function send(res, status, body, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (d) => { s += d; if (s.length > 4096) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  const allowed = origin === undefined || ORIGINS.some((re) => re.test(origin));
  if (!allowed) return send(res, 403, { error: '허용되지 않은 페이지예요.' });
  const cors = origin === undefined ? null : origin;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': cors || '*',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Private-Network': 'true',
      'Access-Control-Max-Age': '600',
      'Vary': 'Origin'
    });
    return res.end();
  }
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, app: 'piano-bricks-codex-bridge' }, cors);
    if (req.method === 'POST' && url.pathname === '/search') {
      const query = clean((await readBody(req)).query, 100);
      if (!query) return send(res, 400, { error: '찾을 노래를 적어 주세요.' }, cors);
      return send(res, 200, await runCodex('search', { query }), cors);
    }
    if (req.method === 'POST' && url.pathname === '/transcribe') {
      const body = await readBody(req);
      const title = clean(body.title, 100), artist = clean(body.artist, 100);
      if (!title) return send(res, 400, { error: '노래 제목이 비어 있어요.' }, cors);
      return send(res, 200, await runCodex('transcribe', { title, artist }), cors);
    }
    send(res, 404, { error: 'not found' }, cors);
  } catch (e) {
    send(res, 500, { error: e.message || 'Codex 오류' }, cors);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('피아노 브릭스 Codex 연결 켜짐: http://127.0.0.1:' + PORT);
  console.log('Codex: ' + CODEX);
  console.log('이 창을 켜 둔 채로 게임의 새 곡 만들기 → 노래 찾기를 쓰세요. 끄려면 이 창을 닫으세요.');
});
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? '이미 켜져 있어요 (포트 ' + PORT + ').' : e.message);
  process.exit(1);
});
