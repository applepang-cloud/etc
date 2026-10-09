// 스토리 캐릭터별 일레븐랩스 목소리 후보로 대표 대사를 만들어 들어보기 페이지를 만든다.
//   node piano-block-puzzle/tools/gen-voice-audition.mjs   → voice-audition/index.html
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'voice-audition');
mkdirSync(OUT, { recursive: true });
const MODEL = 'eleven_multilingual_v2';

const CAST = [
  {
    id: 'dohyun', name: '이도현', desc: '20세 · 악보 없이 귀로 익힌 독학 천재, 수줍음',
    lines: ['네? 아, 네… 시끄러웠으면 죄송합니다.', '콩쿠르요? 저 악보도 못 읽는데요. 레슨비도 없고…', '선생님은 왜 더 이상 무대에 안 서세요?'],
    voices: [['pgoxOdha2whKIn0lZCXb', 'Kai · 젊은 서울, 단정'], ['rCm09Tf1yMYbOyCRLDyB', 'Taek · 젊은, 차분'], ['srhGhMYcxqeTNVuSRvWg', 'Junho · 젊은, 느긋'], ['f2lXVdK3ZBbavHW9BpNk', 'Minsoo · 젊은, 또렷']],
  },
  {
    id: 'seoyun', name: '한서윤', desc: '27세 · 손목 부상으로 무대를 떠난 아카데미 강사, 다정',
    lines: ['…방금 그거, 악보 없이 친 거예요?', '아니요, 오히려 반대예요. 왼손 화음을 그렇게 바꿔 치는 사람은 처음 봤어요.', '…좋아요. 그럼 내일, 기다릴게요.'],
    voices: [['sf8Bpb1IU97NI9BHSMRf', 'Rosa Oh · 젊은, 부드러움'], ['lKmpLuKb4TMrZnFZ0EI9', 'Ivy · 젊은, 차분'], ['9Es4T0g1lLLAXX26GW2T', '귀엽고 차분한 여자'], ['bQlkYuipD5BHEhntA5iz', 'JY · 젊은, 밝음']],
  },
  {
    id: 'prof', name: '한정훈 교수', desc: '서윤의 아버지 · 한국대 음대 교수, 엄격',
    lines: ['서윤아. 레슨 중에 무슨 얘기를 그렇게 속닥거리지?', '약혼 앞두고 쓸데없는 일 만들지 마라. 나는 먼저 차에 가 있으마.', '…거리 피아노라더니, 박자 감각 하나는 쓸 만하군.'],
    voices: [['UmYoqGlufKxhJ6NCx5Mv', 'Jang Ho · 노년, 진중·허스키'], ['5ON5Fnz24cnOozEQfGAm', 'Namchun · 노년, 품위'], ['hjCvGtSCRPyjYwe2lDf1', 'Juan · 중년, 자신감']],
  },
  {
    id: 'taejun', name: '강태준', desc: '서윤의 약혼자 · 재벌 2세, 여유 있고 차가움',
    lines: ['서윤 씨, 데리러 왔어요. 아버님은 먼저 우리 집에 가 계신다고.', '…재밌네. 콩쿠르, 객석에서 지켜볼게.', '서윤 씨, 가죠. 장인어른이 기다리셔. 축하는 그 정도면 됐잖아.'],
    voices: [['ZJCNdZEjYwkOElxugmW2', 'Hyuk · 중년, 차갑고 맑음'], ['2Lqdr3NogQ7cw7DRXpv2', 'Ben · 중년 서울, 자신감'], ['eMzlsWTml7eAEDvSiETn', 'Kwan · 중년 서울, 자신감']],
  },
  {
    id: 'chaea', name: '윤채아', desc: '21세 · 작년 우승자, 한 교수의 제자, 도도한 라이벌',
    lines: ['당신이 그 「거리 피아노」 천재? 악보도 못 읽는다던데.', '…흥. 기대는 안 할게.', '…인정할게. 하지만 전국 대회에선 안 져.'],
    voices: [['bQlkYuipD5BHEhntA5iz', 'JY · 젊은, 밝음'], ['lKmpLuKb4TMrZnFZ0EI9', 'Ivy · 젊은, 차분'], ['9Es4T0g1lLLAXX26GW2T', '귀엽고 차분한 여자'], ['sf8Bpb1IU97NI9BHSMRf', 'Rosa Oh · 젊은, 부드러움']],
  },
];

async function tts(voice, text, out) {
  if (existsSync(out)) return;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } }),
  });
  if (!res.ok) throw new Error(`${voice}: ${res.status} ${await res.text()}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
}

const jobs = [];
for (const c of CAST) for (const [vid] of c.voices) c.lines.forEach((line, i) => jobs.push([vid, line, join(OUT, `${c.id}_${vid}_${i}.mp3`)]));
for (let i = 0; i < jobs.length; i += 4) {
  await Promise.all(jobs.slice(i, i + 4).map((j) => tts(...j)));
  process.stdout.write(`\r${Math.min(i + 4, jobs.length)}/${jobs.length}`);
}
console.log();

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>보이스 오디션</title>
<style>
:root{--bg:#14161c;--card:#1d2029;--line:#2b2f3b;--text:#e9ecf2;--sub:#9aa3b5;--accent:#f48fb6}
@media (prefers-color-scheme: light){:root:not([data-theme=dark]){--bg:#f5f6f9;--card:#fff;--line:#e2e5ec;--text:#1b1e26;--sub:#5d6577;--accent:#d2588a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,"Malgun Gothic",sans-serif;padding:24px 16px 80px}
main{max-width:860px;margin:0 auto}h1{margin:0 0 4px;font-size:22px}.lead{color:var(--sub);margin:0 0 24px}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
h2{margin:0;font-size:18px}.desc{color:var(--sub);margin:2px 0 14px;font-size:13px}
.voice{border-top:1px solid var(--line);padding:12px 0;display:grid;gap:8px}
.vhead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.vname{font-weight:600}
button{font:inherit;border:1px solid var(--line);background:transparent;color:var(--text);border-radius:999px;padding:5px 12px;cursor:pointer}
button:hover{border-color:var(--accent)}button.pick[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.line{display:flex;align-items:center;gap:10px;font-size:14px}.line button{flex:none;padding:3px 10px}.line span{color:var(--sub)}
#summary{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:10px 16px;font-size:13px;text-align:center}
</style></head><body><main>
<h1>스토리 보이스 오디션</h1>
<p class="lead">캐릭터마다 일레븐랩스 목소리 후보로 같은 대사를 읽혔어요(${MODEL}). <b>전체 듣기</b>로 이어 듣고, 마음에 드는 목소리에 <b>이 목소리로</b>를 눌러 주세요. 고른 결과는 아래 줄에 모여요.</p>
${CAST.map((c) => `<section data-id="${c.id}" data-name="${c.name}"><h2>${c.name}</h2><p class="desc">${esc(c.desc)}</p>
${c.voices.map(([vid, label]) => `<div class="voice" data-vid="${vid}" data-label="${esc(label)}"><div class="vhead"><span class="vname">${esc(label)}</span><button class="all">▶ 전체 듣기</button><button class="pick" aria-pressed="false">이 목소리로</button></div>
${c.lines.map((l, i) => `<div class="line"><button data-src="${c.id}_${vid}_${i}.mp3">▶</button><span>${esc(l)}</span></div>`).join('\n')}</div>`).join('\n')}
</section>`).join('\n')}
</main><div id="summary">아직 고른 목소리가 없어요</div>
<script>
const audio = new Audio(); let queue = [];
function play(list){ queue = list.slice(); next(); }
function next(){ const s = queue.shift(); if(!s) return; audio.src = s; audio.play(); }
audio.addEventListener('ended', () => setTimeout(next, 350));
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if(!b) return;
  if (b.dataset.src) play([b.dataset.src]);
  else if (b.classList.contains('all')) play([...b.closest('.voice').querySelectorAll('[data-src]')].map(x => x.dataset.src));
  else if (b.classList.contains('pick')) {
    b.closest('section').querySelectorAll('.pick').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    summary();
  }
});
function summary(){
  const picks = [...document.querySelectorAll('section')].map(s => { const p = s.querySelector('.pick[aria-pressed=true]'); return p ? s.dataset.name + ': ' + p.closest('.voice').dataset.label : null; }).filter(Boolean);
  document.getElementById('summary').textContent = picks.length ? picks.join('  ·  ') : '아직 고른 목소리가 없어요';
}
</script></body></html>
`;
writeFileSync(join(OUT, 'index.html'), html);
console.log(join(OUT, 'index.html'));
