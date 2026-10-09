#!/usr/bin/env node
// 별빛 멜로디 · AI 뮤직맵 도우미 서버
// The game (a static page) cannot run Codex itself, so this tiny local server does it:
//   POST http://127.0.0.1:8131/map {"query": "노래 제목 가수"}  ->  a song map in the game's SONGS format.
// Codex (your ChatGPT/Codex subscription, via `codex exec`) looks the song up and writes five 8-step bars;
// this server then checks every bar is solvable by line logic alone and adds star cells (givens) until it is.
// Run:  node music-map-server.js        (needs Node 18+ and a logged-in Codex CLI)
'use strict';
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');

const PORT = +(process.env.PORT || 8131);
const HEROINES = ['ria', 'yuna', 'hana', 'sora', 'arin', 'sena'];
const LEADS = ['chip', 'piano', 'musicbox', 'flute', 'guitar', 'synth', 'violin', 'marimba', 'harp', 'trumpet'];
const MELODY = ['A', 'G', 'E', 'D', 'C'], OTHER = ['B', 'Q', 'H', 'T', 'P', 'S', 'K'], ORDER = MELODY.concat(OTHER);
const W = 8;

function codexBin() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  const cmd = path.join(os.homedir(), 'bin', 'codex.cmd');
  return process.platform === 'win32' && fs.existsSync(cmd) ? cmd : 'codex';
}

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'artist', 'bpm', 'singer', 'lead', 'stages', 'ending'],
  properties: {
    title: { type: 'string' }, artist: { type: 'string' }, bpm: { type: 'integer' },
    singer: { type: 'string', enum: HEROINES }, lead: { type: 'string', enum: LEADS },
    ending: { type: 'array', items: { type: 'string' } },
    stages: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['title', 'root', 'pad', 'rows', 'intro', 'clear'],
      properties: {
        title: { type: 'string' }, root: { type: 'integer' }, pad: { type: 'array', items: { type: 'integer' } },
        intro: { type: 'array', items: { type: 'string' } }, clear: { type: 'string' },
        rows: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['lane', 'steps'],
          properties: { lane: { type: 'string', enum: ORDER }, steps: { type: 'string' } } } }
      } } }
  }
};

const prompt = q => `너는 리듬 퍼즐 게임 '별빛 멜로디'의 뮤직맵 제작자야. 사용자가 고른 노래: "${q}"

1. 웹 검색으로 이 노래를 찾아 정확한 제목, 가수, 템포(BPM), 조성, 후렴(가장 유명한 부분)의 멜로디 흐름과 코드 진행을 확인해.
2. 그 정보를 바탕으로 게임용 5소절 맵을 만들어. 파일은 만들지 말고 최종 답으로 JSON만 내.

[게임 규칙]
- 한 소절 = 8칸(8분음표 8개, 4/4 한 마디). 각 줄(lane)은 8글자 문자열로, x = 소리 남, . = 쉼.
- 멜로디 줄은 음높이가 고정이야: A=라(A5), G=솔(G5), E=미(E5), D=레(D5), C=도(C5). 다장조 5음계뿐이니, 원곡 멜로디의 오르내림과 리듬이 느껴지게 이 5음으로 옮겨(이조·단순화 OK). 한 칸에는 멜로디 음 하나만.
- 반주 줄: B=베이스(그 소절 root 음), Q=코드 스탭(pad 3음), H=하이햇, T=탬버린, P=박수, S=스네어, K=킥.
- rows 는 위 순서(A G E D C B Q H T P S K)대로, 실제로 쓰는 줄만 넣어. 각 줄에는 x가 최소 1개.
- 같은 소절 안에서 두 줄의 x 위치가 완전히 똑같으면 안 돼(퍼즐 답이 하나로 정해지도록 킥·베이스 등도 조금씩 다르게).
- 난이도: 1소절은 3~4줄로 성기게, 5소절은 7~8줄로 꽉 차게 점점 늘려.
- root: 그 소절 코드의 베이스 MIDI 번호(36~52). pad: 그 코드의 구성음 MIDI 3개(55~72).
- bpm: 원곡 템포(70~160 사이로 맞춰).
- 각 소절 title: 짧은 한국어 이름(예: 전주, 1절, 프리코러스, 후렴, 피날레).
- singer: 곡 분위기에 어울리는 보컬 한 명 — ria(밝은 아이돌 지망), yuna(차분한 피아노 보컬), hana(신나는 락), sora(수줍고 서정적), arin(축제·흥겨움), sena(시티팝·쿨함).
- lead: 곡에 어울리는 멜로디 악기 하나 — ${LEADS.join(', ')}.
- intro: 그 소절을 시작하기 전에 singer가 하는 대사 2줄, clear: 소절을 완성했을 때 대사 1줄, ending: 곡을 다 완성했을 때 대사 2줄. 모두 그 캐릭터 말투의 짧은 한국어 반말(소라는 존댓말).
- 가사는 한 글자도 옮기지 마(저작권). 대사는 노래 분위기나 연주 이야기만.`;

function runCodex(q) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'starlight-map-'));
    const schemaFile = path.join(dir, 'schema.json'), outFile = path.join(dir, 'out.json');
    fs.writeFileSync(schemaFile, JSON.stringify(SCHEMA));
    const args = ['exec', '--skip-git-repo-check', '-s', 'read-only', '-C', dir, '-c', 'web_search=live', '--output-schema', schemaFile, '-o', outFile, '-'];
    // codex.cmd needs a shell on Windows; quote what has spaces (the song query itself goes through stdin, never the command line)
    const win = process.platform === 'win32', q2 = a => win && /[\s"]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a;
    const p = win ? spawn([codexBin(), ...args].map(q2).join(' '), { shell: true, windowsHide: true }) : spawn(codexBin(), args, { windowsHide: true });
    let log = ''; p.stdout.on('data', d => log += d); p.stderr.on('data', d => log += d);
    const timer = setTimeout(() => { p.kill(); reject(new Error('코덱스 응답 시간 초과(6분)')); }, 6 * 60 * 1000);
    p.on('error', e => { clearTimeout(timer); reject(new Error('코덱스를 실행하지 못했어요: ' + e.message)); });
    p.on('close', code => {
      clearTimeout(timer);
      try { resolve(JSON.parse(fs.readFileSync(outFile, 'utf8'))); }
      catch (e) { reject(new Error(`코덱스 결과를 읽지 못했어요 (exit ${code}). ` + log.slice(-300))); }
    });
    p.stdin.end(prompt(q));
  });
}

/* ---- line logic: settle every cell that all placements of a clue agree on ---- */
const clueOf = line => { const r = []; let n = 0; line.forEach(v => { if (v) n++; else if (n) { r.push(n); n = 0; } }); if (n) r.push(n); return r.length ? r : [0]; };
function placements(clue, len) {
  if (clue.length === 1 && clue[0] === 0) return [Array(len).fill(0)];
  const out = [];
  (function rec(i, pos, acc) {
    if (i === clue.length) { out.push(acc.concat(Array(len - acc.length).fill(0))); return; }
    const rest = clue.slice(i + 1).reduce((s, n) => s + n + 1, 0);
    for (let s = pos; s + clue[i] + rest <= len; s++) {
      const a = acc.concat(Array(s - acc.length).fill(0), Array(clue[i]).fill(1));
      rec(i + 1, s + clue[i] + 1, i + 1 < clue.length ? a.concat([0]) : a);
    }
  })(0, 0, []);
  return out;
}
function solveLine(cells, clue) { // cells: 1 filled, 0 empty, -1 unknown
  const fits = placements(clue, cells.length).filter(pl => pl.every((v, i) => cells[i] < 0 || cells[i] === v));
  if (!fits.length) return null;
  return cells.map((c, i) => c >= 0 ? c : fits.every(pl => pl[i] === fits[0][i]) ? fits[0][i] : -1);
}
function propagate(sol, givens) { // -> how many cells line logic settles (all of them = solvable)
  const H = sol.length, g = sol.map((r, y) => r.map((_, x) => givens.has(y + ',' + x) ? 1 : -1));
  const rows = sol.map(clueOf), cols = [...Array(W)].map((_, x) => clueOf(sol.map(r => r[x])));
  for (let changed = true; changed;) {
    changed = false;
    for (let y = 0; y < H; y++) { const n = solveLine(g[y], rows[y]); if (!n) return 0; if (n.some((v, x) => v !== g[y][x])) { g[y] = n; changed = true; } }
    for (let x = 0; x < W; x++) { const col = g.map(r => r[x]), n = solveLine(col, cols[x]); if (!n) return 0; n.forEach((v, y) => { if (v !== g[y][x]) { g[y][x] = v; changed = true; } }); }
  }
  return g.reduce((s, r) => s + r.filter(v => v >= 0).length, 0);
}
const solvable = (sol, givens) => propagate(sol, givens) === sol.length * W;
function starCells(sol, lanes) { // fewest stars: each pick is the cell that lets line logic settle the most
  const givens = new Set(), total = sol.length * W;
  const pool = []; sol.forEach((r, y) => r.forEach((v, x) => { if (v) pool.push(y + ',' + x); }));
  if (pool.length) givens.add(pool.find(k => MELODY.includes(lanes[+k.split(',')[0]])) || pool[0]); // one remembered melody note, like the built-in songs
  while (propagate(sol, givens) < total) {
    let best = null, score = -1;
    pool.forEach(k => { if (givens.has(k)) return; const t = new Set(givens); t.add(k); const n = propagate(sol, t) + (MELODY.includes(lanes[+k.split(',')[0]]) ? 0.5 : 0); if (n > score) { score = n; best = k; } });
    if (!best) break; givens.add(best);
  }
  return givens;
}

function toSong(m, q) {
  const bpm = Math.max(70, Math.min(160, m.bpm | 0 || 110));
  const stages = (m.stages || []).slice(0, 5).map((st, i) => {
    const seen = new Set(), rows = [];
    (st.rows || []).forEach(r => {
      const steps = String(r.steps || '').toLowerCase().replace(/[^x.]/g, '.').padEnd(W, '.').slice(0, W);
      if (ORDER.includes(r.lane) && !seen.has(r.lane) && steps.includes('x')) { seen.add(r.lane); rows.push({ lane: r.lane, steps }); }
    });
    // melody stays one note per step: keep the highest lane on a collision
    for (let x = 0; x < W; x++) { let hit = false; rows.forEach(r => { if (!MELODY.includes(r.lane) || r.steps[x] !== 'x') return; if (hit) r.steps = r.steps.slice(0, x) + '.' + r.steps.slice(x + 1); hit = true; }); }
    const kept = rows.filter(r => r.steps.includes('x')).sort((a, b) => ORDER.indexOf(a.lane) - ORDER.indexOf(b.lane));
    if (kept.length < 2) throw new Error(`${i + 1}소절에 쓸 줄이 너무 적어요`);
    const lanes = kept.map(r => r.lane), sol = kept.map(r => [...r.steps].map(c => c === 'x'));
    // star cells until the bar is solvable by line logic alone
    const givens = starCells(sol, lanes);
    const root = Math.max(36, Math.min(52, st.root | 0 || 48));
    const pad = (Array.isArray(st.pad) && st.pad.length >= 3 ? st.pad.slice(0, 3) : [60, 64, 67]).map(n => Math.max(55, Math.min(72, n | 0)));
    return { id: 'b' + (i + 1), title: String(st.title || `${i + 1}소절`).slice(0, 12), root, pad, lanes,
      pattern: Object.fromEntries(kept.map(r => [r.lane, r.steps])),
      givens: [...givens].map(k => { const [y, x] = k.split(',').map(Number); return lanes[y] + x; }),
      intro: (st.intro || []).slice(0, 2).map(String).filter(Boolean), clear: String(st.clear || '좋아, 다음 소절!') };
  });
  if (stages.length < 3) throw new Error('소절이 너무 적어요');
  stages.forEach(st => { if (!st.intro.length) st.intro = ['다음 소절 가 보자!']; });
  return { id: 'ai_' + Date.now().toString(36), title: String(m.title || q).slice(0, 24), artist: String(m.artist || '').slice(0, 24), ai: true, query: q, bpm,
    lead: LEADS.includes(m.lead) ? m.lead : 'piano', singer: HEROINES.includes(m.singer) ? m.singer : 'ria',
    ending: (m.ending || []).slice(0, 2).map(String).filter(Boolean).concat(['우리만의 버전 완성!']).slice(0, 2), stages };
}

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }); res.end(JSON.stringify(obj)); };
let busy = false;
if (require.main === module) http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, busy });
  if (req.method !== 'POST' || req.url !== '/map') return send(res, 404, { error: 'not found' });
  let body = '';
  req.on('data', d => { body += d; if (body.length > 4000) req.destroy(); });
  req.on('end', async () => {
    let q = ''; try { q = String(JSON.parse(body).query || '').trim().slice(0, 80); } catch (_) {}
    if (!q) return send(res, 400, { error: '노래 제목을 적어 주세요.' });
    if (busy) return send(res, 429, { error: '다른 곡을 만드는 중이에요. 잠시 뒤에 다시 해 주세요.' });
    busy = true; const t0 = Date.now(); console.log(`[map] ${q} …`);
    try { const song = toSong(await runCodex(q), q); console.log(`[map] ${song.title} / ${song.artist} (${((Date.now() - t0) / 1000) | 0}s)`); send(res, 200, { song }); }
    catch (e) { console.log('[map] 실패:', e.message); send(res, 500, { error: e.message }); }
    finally { busy = false; }
  });
}).listen(PORT, '127.0.0.1', () => console.log(`별빛 멜로디 AI 뮤직맵 서버: http://127.0.0.1:${PORT}  (게임의 자유 연주 > AI 뮤직맵)`));

module.exports = { toSong, solvable, clueOf };
