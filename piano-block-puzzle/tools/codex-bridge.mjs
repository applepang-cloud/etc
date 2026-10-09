// 코덱스 브리지: 게임의 "노래 제목으로 레벨 만들기"가 이 PC의 코덱스(구독)로 멜로디를 받게 해 주는 로컬 서버.
// 코덱스 짭 MCP 와 같은 방식으로 `codex exec` 를 부른다 (코덱스 앱 로그인 그대로, API 키 불필요).
//   node piano-block-puzzle/tools/codex-bridge.mjs        → http://127.0.0.1:8770
//
// 안전: 127.0.0.1 에서만 받고, 이 게임 파일(file://)이나 localhost 페이지의 요청만 허락한다.
// 게임은 제목과 난이도만 보내고 지시문은 서버가 만든다. 코덱스는 읽기 전용으로 빈 임시 폴더에서 돈다.
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PORT = Number(process.env.PB_CODEX_PORT || 8770);
const TIMEOUT = 180_000;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { promptFor } = await import(pathToFileURL(join(ROOT, 'js', 'maker-prompt.js')).href);

// 코덱스 실행 파일 찾기 (코덱스 짭 MCP 와 같은 순서): ~/bin/codex.cmd → 앱에 든 최신 codex.exe → PATH 의 codex
function findCodex() {
  const shim = join(homedir(), 'bin', 'codex.cmd');
  // .cmd 는 셸 옵션 없이 cmd.exe /c 로 부른다 (인자는 Node 가 따옴표로 감싼다)
  if (existsSync(shim)) return { cmd: process.env.ComSpec || 'cmd.exe', pre: ['/d', '/c', shim] };
  const root = join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  if (existsSync(root)) {
    const dirs = readdirSync(root)
      .map((d) => join(root, d))
      .filter((d) => existsSync(join(d, 'codex.exe')))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (dirs.length) return { cmd: join(dirs[0], 'codex.exe'), pre: [] };
  }
  return process.platform === 'win32' ? { cmd: process.env.ComSpec || 'cmd.exe', pre: ['/d', '/c', 'codex'] } : { cmd: 'codex', pre: [] };
}
const CODEX = findCodex();
let version = '';
try {
  version = execFileSync(CODEX.cmd, [...CODEX.pre, '--version'], { encoding: 'utf8', timeout: 20_000, windowsHide: true }).trim();
} catch {
  version = '';
}

// 지시문을 표준 입력으로 넘기고 마지막 답만 파일로 받는다
function askCodex(prompt, signal) {
  return new Promise((resolve, reject) => {
    const work = mkdtempSync(join(tmpdir(), 'pb-codex-'));
    const out = join(work, 'last.txt');
    // 악보 한 줄 쓰는 일이라 추론은 낮게 (보통 20~40초, 기본값이면 1~2분)
    const args = ['exec', '--skip-git-repo-check', '-s', 'read-only', '-c', 'model_reasoning_effort=low', '-C', work, '-o', out, '-'];
    const child = spawn(CODEX.cmd, [...CODEX.pre, ...args], { windowsHide: true });
    let log = '';
    child.stdout.on('data', (d) => (log = (log + d).slice(-4000)));
    child.stderr.on('data', (d) => (log = (log + d).slice(-4000)));
    const kill = () => {
      if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
      else child.kill();
    };
    const timer = setTimeout(() => {
      kill();
      reject(Object.assign(new Error('코덱스 응답 시간 초과'), { code: 'timeout' }));
    }, TIMEOUT);
    signal.addEventListener('abort', () => {
      kill();
      reject(Object.assign(new Error('취소됨'), { code: 'cancelled' }));
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(Object.assign(e, { code: 'no_codex' }));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = existsSync(out) ? readFileSync(out, 'utf8') : '';
      rmSync(work, { recursive: true, force: true });
      if (signal.aborted) return;
      if (code !== 0 || !text.trim()) {
        const login = /401|unauthorized|login/i.test(log);
        return reject(Object.assign(new Error(log.trim().split('\n').slice(-3).join(' ') || `codex 종료 코드 ${code}`), { code: login ? 'login' : 'codex_failed' }));
      }
      resolve(text);
    });
    child.stdin.end(prompt);
  });
}

// 답에서 JSON 객체만 꺼낸다
function parseJson(text) {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw Object.assign(new Error('JSON 이 없는 답'), { code: 'bad_reply' });
  return JSON.parse(text.slice(a, b + 1));
}

// file:// 로 연 게임은 Origin: null, 로컬 서버로 띄우면 http://127.0.0.1:포트 / http://localhost:포트
const allowed = (origin) => !origin || origin === 'null' || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);

let busy = false;
const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (!allowed(origin)) {
    res.writeHead(403).end();
    return;
  }
  const cors = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
    'Content-Type': 'application/json; charset=utf-8',
  };
  const send = (status, body) => res.writeHead(status, cors).end(JSON.stringify(body));
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true, codex: version || null, busy });
  if (req.method !== 'POST' || req.url !== '/melody') return send(404, { error: 'not_found' });

  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2000) return send(413, { error: 'too_large' });
  }
  let title;
  let level;
  try {
    ({ title, level } = JSON.parse(body));
  } catch {
    return send(400, { error: 'bad_request' });
  }
  title = String(title ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  level = [1, 2, 3].includes(Number(level)) ? Number(level) : 1;
  if (!title) return send(400, { error: 'bad_request' });
  if (busy) return send(429, { error: 'busy' });

  busy = true;
  const ctl = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) ctl.abort();
  });
  const t0 = Date.now();
  console.log(`[${new Date().toLocaleTimeString()}] 「${title}」 난이도 ${level} 요청`);
  try {
    const raw = parseJson(await askCodex(promptFor(title, level), ctl.signal));
    console.log(`  → ${raw.source} · ${raw.title} (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
    send(200, raw);
  } catch (e) {
    console.log(`  → 실패: ${e.code || ''} ${e.message}`);
    if (!ctl.signal.aborted) send(502, { error: e.code || 'codex_failed', message: e.message });
  } finally {
    busy = false;
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`코덱스 브리지: http://127.0.0.1:${PORT}  (${version || '코덱스 버전 확인 실패'})`);
  console.log('게임의 "노래 제목으로 레벨 만들기"가 이 서버로 코덱스에게 멜로디를 부탁해요. 끄려면 Ctrl+C.');
});
