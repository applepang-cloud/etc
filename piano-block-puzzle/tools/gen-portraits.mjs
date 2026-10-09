// 코덱스 이미지 생성으로 캐릭터 일러스트(표정별)를 만들어 js/portrait-art.js 로 묶는다.
//   node tools/gen-portraits.mjs            없는 그림만 만든다
//   node tools/gen-portraits.mjs seoyun     그 캐릭터를 처음부터 다시 (기본 그림 + 표정)
//   node tools/gen-portraits.mjs seoyun --base-only   기본 그림만 (표정 전에 확인용)
//   node tools/gen-portraits.mjs --embed    생성 없이 portrait-art.js 만 다시 쓴다
// 코덱스 짭 MCP 와 같은 방식으로 `codex exec` 를 부른다(코덱스 앱 로그인). 기본 그림을 먼저 만들고,
// 표정은 기본 그림을 첨부해 얼굴만 바꾸게 해서 같은 사람으로 보이게 한다. 배경은 크로마키 초록으로
// 그리게 한 뒤 tools/key-portrait.py 로 빼서 투명 webp 로 만든다.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'art', 'raw');
const OUT = join(ROOT, 'art');
mkdirSync(RAW, { recursive: true });
const CODEX = existsSync(join(homedir(), 'bin', 'codex.cmd'))
  ? { cmd: process.env.ComSpec || 'cmd.exe', pre: ['/d', '/c', join(homedir(), 'bin', 'codex.cmd')] }
  : { cmd: 'codex', pre: [] };

const STYLE = `모바일 서브컬처 가챠 게임의 고퀄리티 캐릭터 일러스트. 블루 아카이브나 승리의 여신: 니케 같은 요즘 서브컬처 게임의 전반적인 화풍(깔끔하고 선명한 선화, 부드러운 셀 채색, 밝고 화사한 색감, 반짝이는 디테일한 눈)으로, 기존 게임 캐릭터를 닮지 않은 오리지널 캐릭터. 노출 없는 단정한 차림.`;
const FRAME = `구도: 허리 위 상반신, 정면에서 살짝 비스듬히 서서 보는 사람을 바라봄. 머리 끝부터 허리까지 모두 화면 안에 여유 있게. 세로 2:3 비율.
배경: 그림자나 무늬 없는 완전히 평평한 단색 크로마키 초록(#00FF00). 캐릭터 몸이나 옷에는 초록색을 쓰지 않음. 글자, 로고, 테두리 없음.`;

const CHARS = {
  seoyun: '한서윤, 27세 한국 여성 피아노 강사. 손목 부상으로 무대를 떠난 전직 피아니스트. 누구나 돌아볼 만큼 아름답고 우아한 미인. 크고 맑은 눈과 긴 속눈썹, 고운 피부, 부드러운 미소, 다정하고 차분하며 살짝 쓸쓸한 분위기. 허리까지 오는 윤기 나는 긴 짙은 갈색 생머리(옆머리 일부를 땋아 뒤로 묶은 하프업, 진주 머리핀), 따뜻한 갈색 눈. 의상은 화려하고 고급스럽게: 진주 단추와 벚꽃빛 핑크 리본 타이가 달린 크림색 실크 블라우스(목까지 단정히 잠금, 소매와 깃에 레이스), 금색 자수가 들어간 네이비 하이웨이스트 롱스커트, 어깨에 걸친 연한 핑크 니트 숄, 작은 진주 귀걸이. 오른쪽 손목에는 흰 레이스로 감싼 우아한 손목 보호대.',
  dohyun: '이도현, 20세 한국 남성. 악보 없이 귀로 피아노를 익힌 독학 천재, 편의점 야간 아르바이트생. 수줍고 순하지만 눈빛은 맑고 단단함. 살짝 흐트러진 검은 머리(앞머리가 눈썹을 덮음), 푸른 빛이 도는 회색 눈, 마른 체형, 짙은 회색 후드티 위에 검은 오픈 재킷, 은색 이어폰 줄.',
  chaea: '윤채아, 21세 한국 여성. 작년 콩쿠르 우승자인 도도한 천재 피아니스트, 주인공의 라이벌. 자신만만하고 살짝 새침함. 밝은 꿀빛 갈색의 긴 웨이브 머리를 높게 묶은 포니테일과 검은 리본, 호박색 눈, 검은 벨벳 재킷과 흰 블라우스, 작은 진주 귀걸이.',
  prof: '한정훈, 58세 한국 남성 음대 교수. 한서윤의 아버지. 엄격하고 위엄 있음. 단정하게 뒤로 넘긴 회색 머리, 깊은 눈매와 짙은 갈색 눈, 얇은 금속테 안경, 짙은 차콜 정장과 회색 조끼, 남색 넥타이.',
  taejun: '강태준, 30세 한국 남성. 재벌 2세이자 한서윤의 정략 약혼자. 겉으로는 여유롭고 젠틀하지만 차갑고 소유욕이 강함. 단정하게 넘긴 짙은 갈색 머리, 갈색 눈, 날렵한 얼굴, 몸에 꼭 맞는 검은 고급 스리피스 정장과 은색 넥타이, 은색 손목시계.',
};
// portraits.js 의 표정(expr). back 은 교수·태준의 뒷모습.
const EXPRS = {
  smile: '활짝 웃는 밝은 표정(눈웃음, 입을 벌려 웃음)',
  blush: '수줍어하는 표정(볼이 붉어지고 시선을 살짝 피함, 입은 작게 다묾)',
  surprise: '깜짝 놀란 표정(눈을 크게 뜨고 입을 동그랗게 벌림)',
  sad: '슬프고 쓸쓸한 표정(눈썹이 처지고 눈가가 촉촉함, 입꼬리가 내려감)',
  serious: '진지하고 단호한 표정(눈썹에 힘이 들어가고 입을 굳게 다묾)',
};
const BACK = new Set(['prof', 'taejun']);

function codex(prompt, image) {
  return new Promise((resolve, reject) => {
    const args = ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', RAW, ...(image ? ['-i', image] : []), '-'];
    const child = spawn(CODEX.cmd, [...CODEX.pre, ...args], { windowsHide: true });
    let log = '';
    child.stdout.on('data', (d) => (log = (log + d).slice(-3000)));
    child.stderr.on('data', (d) => (log = (log + d).slice(-3000)));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`codex 종료 ${code}: ${log.split('\n').slice(-4).join(' ')}`))));
    child.stdin.end(prompt);
  });
}

const rawPath = (id, expr) => join(RAW, `${id}_${expr}.png`);

// 기본 그림을 그릴 때 참고로 첨부할 다른 캐릭터 그림 (여주인공은 조연보다 돋보이게)
const REF = { seoyun: 'chaea' };

async function makeBase(id) {
  const file = `${id}_normal.png`;
  const ref = REF[id] && existsSync(rawPath(REF[id], 'normal')) ? rawPath(REF[id], 'normal') : null;
  const refNote = ref
    ? `
참고: 첨부한 그림은 같은 게임의 조연 캐릭터다. 그 그림과 같은 화풍과 완성도로 그리되, 이 캐릭터는 게임의 여주인공이므로 첨부한 조연보다 더 아름답고 화려하고 돋보이게. 첨부한 캐릭터와 얼굴·머리·옷은 전혀 다른 사람으로.`
    : '';
  await codex(`이미지 생성 도구로 그림 한 장을 만들어 이 폴더에 ${file} 로 저장하고, 저장한 파일 경로만 답해.

그림: ${STYLE}
캐릭터: ${CHARS[id]} 표정은 부드러운 기본 표정.
${FRAME}${refNote}`, ref);
}

async function makeExpr(id, expr) {
  const file = `${id}_${expr}.png`;
  const base = rawPath(id, 'normal');
  const prompt = expr === 'back'
    ? `첨부한 그림의 캐릭터를 참고해서, 이미지 생성 도구로 같은 사람의 뒷모습 그림을 만들어 이 폴더에 ${file} 로 저장하고, 저장한 파일 경로만 답해.
같은 머리 모양·머리색·옷차림·화풍·크기로, 몸을 완전히 돌려 등을 보이고 서 있는 허리 위 상반신. 얼굴은 보이지 않음.
배경은 첨부한 그림과 똑같은 완전히 평평한 단색 크로마키 초록(#00FF00). 글자 없음.`
    : `첨부한 그림을 편집해서(새로 그리지 말고) 이 폴더에 ${file} 로 저장하고, 저장한 파일 경로만 답해.
바꿀 것: 얼굴 표정만 ${EXPRS[expr]}으로.
그대로 둘 것: 같은 캐릭터, 얼굴 생김새, 머리 모양과 색, 옷, 자세, 손, 구도, 크기, 화풍, 완전히 평평한 크로마키 초록(#00FF00) 배경. 원본 파일은 덮어쓰지 말 것.`;
  await codex(prompt, base);
}

// 동시에 n개까지
async function pool(jobs, n) {
  const queue = [...jobs];
  const fails = [];
  await Promise.all(Array.from({ length: n }, async () => {
    while (queue.length) {
      const [label, fn] = queue.shift();
      const t0 = Date.now();
      try {
        await fn();
        console.log(`  ✓ ${label} (${((Date.now() - t0) / 1000) | 0}초)`);
      } catch (e) {
        console.log(`  ✗ ${label}: ${e.message}`);
        fails.push(label);
      }
    }
  }));
  return fails;
}

function key(id, expr) {
  const src = rawPath(id, expr);
  const dst = join(OUT, `${id}_${expr}.webp`);
  if (!existsSync(src)) return null;
  execFileSync('python', [join(ROOT, 'tools', 'key-portrait.py'), src, dst, '900']);
  return dst;
}

function embed() {
  const rows = [];
  for (const id of Object.keys(CHARS)) {
    const exprs = ['normal', ...Object.keys(EXPRS), ...(BACK.has(id) ? ['back'] : [])];
    const items = exprs.filter((e) => existsSync(join(OUT, `${id}_${e}.webp`)))
      .map((e) => `    ${e}: '${readFileSync(join(OUT, `${id}_${e}.webp`)).toString('base64')}',`);
    if (items.length) rows.push(`  ${id}: {\n${items.join('\n')}\n  },`);
  }
  const js = `// tools/gen-portraits.mjs 가 만든 파일. 직접 고치지 말 것.
// 코덱스 이미지 생성으로 만든 캐릭터 일러스트(투명 webp, base64). [캐릭터][표정]
export const PORTRAIT_ART = {
${rows.join('\n')}
};
`;
  writeFileSync(join(ROOT, 'js', 'portrait-art.js'), js);
  console.log(`js/portrait-art.js: ${(js.length / 1024) | 0} KB`);
}

const args = process.argv.slice(2);
if (!args.includes('--embed')) {
  const only = args.filter((a) => !a.startsWith('--'));
  const ids = only.length ? only : Object.keys(CHARS);
  for (const id of only) for (const f of [`${id}_normal`, ...Object.keys(EXPRS).map((e) => `${id}_${e}`), `${id}_back`]) rmSync(join(RAW, `${f}.png`), { force: true });
  console.log('기본 그림');
  await pool(ids.filter((id) => !existsSync(rawPath(id, 'normal'))).map((id) => [`${id} 기본`, () => makeBase(id)]), 4);
  if (args.includes('--base-only')) process.exit(0);
  console.log('표정');
  const jobs = [];
  for (const id of ids) {
    if (!existsSync(rawPath(id, 'normal'))) continue;
    for (const expr of [...Object.keys(EXPRS), ...(BACK.has(id) ? ['back'] : [])]) {
      if (!existsSync(rawPath(id, expr))) jobs.push([`${id} ${expr}`, () => makeExpr(id, expr)]);
    }
  }
  await pool(jobs, 4);
}
console.log('배경 빼기');
for (const id of Object.keys(CHARS)) for (const e of ['normal', ...Object.keys(EXPRS), 'back']) key(id, e);
embed();
