// 일레븐랩스 보이스 디자인으로 캐릭터 설명에 맞춘 새 목소리 후보를 만들어 들어보기 페이지를 만든다.
//   node piano-block-puzzle/tools/gen-voice-design.mjs   → voice-audition/round2.html
// 고른 후보는 candidates.json 의 generated_voice_id 로 계정에 저장할 수 있다(POST /v1/text-to-voice).
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'voice-audition');
mkdirSync(OUT, { recursive: true });

const CAST = [
  {
    id: 'dohyun', name: '이도현', desc: '20세 · 악보 없이 귀로 익힌 독학 천재, 수줍지만 속은 단단함',
    text: '네? 아, 네… 시끄러웠으면 죄송합니다. 콩쿠르요? 저 악보도 못 읽는데요. 레슨비도 없고… 선생님은 왜 더 이상 무대에 안 서세요? …들키면 끝이다. 그래도, 이번엔 끝까지 쳐 보고 싶어요.',
    designs: [
      ['수줍은 청년', 'A shy, gentle Korean man aged 20, soft warm young tenor voice with a slight breathiness, speaks Korean quietly and a little hesitantly, sincere and kind, anime-protagonist feel, clean studio recording.'],
      ['맑은 소년미', 'A youthful Korean male voice, 19 to 21 years old, clear bright light tenor, boyish and earnest, sounds like a Korean drama or webtoon male lead, natural Seoul accent, calm but emotional underneath, studio quality.'],
    ],
  },
  {
    id: 'taejun', name: '강태준', desc: '서윤의 약혼자 · 재벌 2세, 여유 있고 차가운 미소',
    text: '서윤 씨, 데리러 왔어요. 아버님은 먼저 우리 집에 가 계신다고. 이쪽이 그 거리 피아노 친구인가? …재밌네. 콩쿠르, 객석에서 지켜볼게. 말이 통해서 좋네. 서윤 씨, 가죠. 장인어른이 기다리셔. 축하는 그 정도면 됐잖아.',
    designs: [
      ['차가운 재벌', 'A wealthy, arrogant Korean man around 30, smooth deep baritone, polished and composed, speaks Korean slowly with a cold, condescending smile in his voice, like a chaebol heir villain in a Korean drama, studio quality.'],
      ['젠틀한 위압감', 'A refined Korean businessman in his early thirties, low velvety voice, very calm and controlled, outwardly polite but subtly intimidating and possessive, elegant Seoul accent, clean studio recording.'],
    ],
  },
  {
    id: 'chaea', name: '윤채아', desc: '21세 · 작년 우승자, 한 교수의 제자, 도도한 라이벌',
    text: '당신이 그 「거리 피아노」 천재? 악보도 못 읽는다던데. …흥. 기대는 안 할게. 화났어? 재밌네. 결선에서 봐. 무시하는 거야? 좋아. 무대에서 보자. …인정할게. 하지만 전국 대회에선 절대 안 져.',
    designs: [
      ['도도한 라이벌', 'A proud, confident Korean woman aged 21, clear crisp mezzo voice, slightly haughty and teasing, quick sharp delivery in Korean, tsundere rival character from an anime or Korean webtoon, studio quality.'],
      ['시크한 천재', 'A cool, elegant young Korean woman about 21, smooth bright voice, cool and aloof with a hint of playfulness, speaks Korean precisely like a gifted classical pianist who knows she is the best, clean studio recording.'],
    ],
  },
];

const index = existsSync(join(OUT, 'candidates.json')) ? JSON.parse(readFileSync(join(OUT, 'candidates.json'), 'utf8')) : {};

async function design(description, text, attempt = 0) {
  const res = await fetch('https://api.elevenlabs.io/v1/text-to-voice/design', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice_description: description, text, model_id: 'eleven_multilingual_ttv_v2' }),
  });
  if (res.status === 429 && attempt < 8) {
    await new Promise((ok) => setTimeout(ok, 4000 * (attempt + 1)));
    return design(description, text, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()).previews;
}

for (const [c, [label, description], d] of CAST.flatMap((c) => c.designs.map((x, d) => [c, x, d]))) {
  const key = `${c.id}_d${d}`;
  if (index[key]) continue;
  const previews = await design(description, c.text);
  index[key] = previews.map((p, i) => {
    const file = `${key}_${i}.mp3`;
    writeFileSync(join(OUT, file), Buffer.from(p.audio_base_64, 'base64'));
    return { file, generated_voice_id: p.generated_voice_id, label: `${label} ${i + 1}`, description };
  });
  writeFileSync(join(OUT, 'candidates.json'), JSON.stringify(index, null, 2));
  console.log(key, '완료');
}
writeFileSync(join(OUT, 'candidates.json'), JSON.stringify(index, null, 2));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>보이스 오디션 2차</title>
<style>
:root{--bg:#14161c;--card:#1d2029;--line:#2b2f3b;--text:#e9ecf2;--sub:#9aa3b5;--accent:#f48fb6}
@media (prefers-color-scheme: light){:root:not([data-theme=dark]){--bg:#f5f6f9;--card:#fff;--line:#e2e5ec;--text:#1b1e26;--sub:#5d6577;--accent:#d2588a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,"Malgun Gothic",sans-serif;padding:24px 16px 80px}
main{max-width:860px;margin:0 auto}h1{margin:0 0 4px;font-size:22px}.lead{color:var(--sub);margin:0 0 24px}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
h2{margin:0;font-size:18px}.desc{color:var(--sub);margin:2px 0 6px;font-size:13px}.script{font-size:13px;color:var(--sub);border-left:3px solid var(--line);padding-left:10px;margin:0 0 10px}
.cand{border-top:1px solid var(--line);padding:10px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.cand .n{font-weight:600;min-width:120px}
button{font:inherit;border:1px solid var(--line);background:transparent;color:var(--text);border-radius:999px;padding:5px 12px;cursor:pointer}
button:hover{border-color:var(--accent)}button.pick[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
#summary{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:10px 16px;font-size:13px;text-align:center}
</style></head><body><main>
<h1>보이스 오디션 2차 · 새로 디자인한 목소리</h1>
<p class="lead">캐릭터 설명을 바탕으로 일레븐랩스 보이스 디자인이 새로 만든 목소리예요. 캐릭터마다 두 가지 방향 × 3개씩 6개. 마음에 드는 후보에 <b>이 목소리로</b>를 누르고 아래 줄을 알려주세요.</p>
${CAST.map((c) => `<section data-name="${c.name}"><h2>${c.name}</h2><p class="desc">${esc(c.desc)}</p><p class="script">${esc(c.text)}</p>
${c.designs.flatMap((_, d) => index[`${c.id}_d${d}`]).map((p) => `<div class="cand" data-label="${esc(p.label)}"><span class="n">${esc(p.label)}</span><button data-src="${p.file}">▶ 듣기</button><button class="pick" aria-pressed="false">이 목소리로</button></div>`).join('\n')}
</section>`).join('\n')}
</main><div id="summary">아직 고른 목소리가 없어요</div>
<script>
const audio = new Audio();
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.src) { audio.src = b.dataset.src; audio.play(); }
  else if (b.classList.contains('pick')) {
    b.closest('section').querySelectorAll('.pick').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    const picks = [...document.querySelectorAll('section')].map((s) => { const p = s.querySelector('.pick[aria-pressed=true]'); return p ? s.dataset.name + ': ' + p.closest('.cand').dataset.label : null; }).filter(Boolean);
    document.getElementById('summary').textContent = picks.join('  ·  ');
  }
});
</script></body></html>
`;
writeFileSync(join(OUT, 'round2.html'), html);
console.log(join(OUT, 'round2.html'));
