// 코덱스 이미지 생성으로 보드·트레이 UI 그림(블록, 얼음, 폭탄, 미사일, 패널 배경)을 만들어 js/ui-art.js 로 묶는다.
//   node tools/gen-ui-art.mjs            없는 시트만 만든다
//   node tools/gen-ui-art.mjs blocks     그 시트만 다시 (blocks | items | tray)
//   node tools/gen-ui-art.mjs --embed    생성 없이 ui-art.js 만 다시 쓴다
// 같은 종류는 한 장(시트)에 같이 그리게 해서 화풍을 맞추고, tools/slice-sheet.py 로 잘라 낱장으로 쓴다.
// 코덱스 짭 MCP 와 같은 방식으로 `codex exec` 를 부른다(코덱스 앱 로그인).
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'art', 'raw');
const OUT = join(ROOT, 'art', 'ui');
mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });
const CODEX = existsSync(join(homedir(), 'bin', 'codex.cmd'))
  ? { cmd: process.env.ComSpec || 'cmd.exe', pre: ['/d', '/c', join(homedir(), 'bin', 'codex.cmd')] }
  : { cmd: 'codex', pre: [] };

const STYLE = '고급스러운 모바일 퍼즐 게임(블록 블라스트, 캔디크러시 같은 요즘 캐주얼 퍼즐 게임의 프리미엄 버전)의 UI 그림. 반짝이는 광택, 부드러운 입체감, 선명하고 고급스러운 색감, 깔끔한 가장자리.';
const BG = '배경은 그림자나 무늬 없는 완전히 평평한 단색 크로마키 초록(#00FF00). 그림 자체에는 초록색을 쓰지 않음. 글자, 로고, 테두리 없음.';

// 시트: 이름 → 지시문, 잘라 낼 개수, 낱장 이름들
const SHEETS = {
  blocks: {
    names: ['yellow', 'purple', 'cyan', 'red', 'orange', 'blue', 'pink', 'white'],
    size: 96,
    prompt: `이미지 생성 도구로 그림 한 장을 만들어 이 폴더에 sheet_blocks.png 로 저장하고, 저장한 파일 경로만 답해.
그림: ${STYLE}
내용: 정사각형 퍼즐 블록 타일 8개를 가로 4개 × 세로 2줄의 고른 격자로, 서로 넉넉히 떨어뜨려 배치. 모든 타일은 같은 크기·같은 모양·같은 조명으로, 위에서 정면으로 본 모서리가 둥근 정사각형. 젤리나 보석처럼 윤기 있고, 윗부분에 밝은 하이라이트, 아래쪽에 살짝 어두운 두께감.
색 순서(윗줄 왼쪽부터): 1 노랑(#f6c344), 2 보라(#a35ee0), 3 하늘(#3cc1f0), 4 빨강(#f2604f), 아랫줄: 5 주황(#f39233), 6 파랑(#4d7cf0), 7 분홍(#ef5fae), 8 진주처럼 빛나는 하얀 블록(안에 작은 금빛 음표 무늬).
${BG}
가로 3:2 비율.`,
  },
  items: {
    names: ['ice2', 'ice1', 'bomb', 'missile'],
    size: 160,
    prompt: `이미지 생성 도구로 그림 한 장을 만들어 이 폴더에 sheet_items.png 로 저장하고, 저장한 파일 경로만 답해.
그림: ${STYLE}
내용: 아이템 그림 4개를 가로 4개 한 줄로, 서로 넉넉히 떨어뜨려 같은 크기로 배치.
1 두꺼운 얼음 블록: 위에서 정면으로 본 모서리가 둥근 정사각형 얼음 타일. 투명한 하늘빛 얼음, 서리 낀 표면, 반사광.
2 금이 간 얇은 얼음 타일: 1번과 같은 모양·크기인데 더 얇고 투명하며 큰 금이 여러 갈래 나 있음.
3 폭탄 아이템: 둥근 검은 만화풍 폭탄, 금빛 테두리, 불꽃이 튀는 심지, 귀엽고 고급스럽게.
4 미사일 아이템: 오른쪽 위를 향해 비스듬히 날아가는 귀여운 빨강·흰색 만화풍 미사일, 꼬리에 작은 불꽃.
${BG}
가로 4:1 비율.`,
  },
  tray: {
    names: ['tray'],
    size: 0, // 그대로 (가로로 긴 배경)
    prompt: `이미지 생성 도구로 그림 한 장을 만들어 이 폴더에 sheet_tray.png 로 저장하고, 저장한 파일 경로만 답해.
그림: 모바일 음악 퍼즐 게임 화면 아래쪽 블록 보관 패널의 배경 그림. 가로로 긴 패널이 화면 전체를 빈틈없이 꽉 채움. 짙은 남색 벨벳과 윤기 나는 검은 피아노 래커 질감, 위쪽 가장자리에 가는 금색 테두리선, 은은한 음표·오선 무늬, 고급스럽고 차분한 분위기. 가운데는 블록을 올려놓을 수 있게 비교적 단순하고 어둡게. 글자, 로고, 버튼 없음.
가로 3:1 비율.`,
  },
};

function codex(prompt) {
  return new Promise((resolve, reject) => {
    const args = ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', RAW, '-'];
    const child = spawn(CODEX.cmd, [...CODEX.pre, ...args], { windowsHide: true });
    let log = '';
    child.stdout.on('data', (d) => (log = (log + d).slice(-3000)));
    child.stderr.on('data', (d) => (log = (log + d).slice(-3000)));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`codex 종료 ${code}: ${log.split('\n').slice(-4).join(' ')}`))));
    child.stdin.end(prompt);
  });
}

function slice(id) {
  const sheet = SHEETS[id];
  const src = join(RAW, `sheet_${id}.png`);
  if (!existsSync(src)) return;
  if (!sheet.size) {
    // 배경: 너비 900 으로 줄여 그대로
    execFileSync('python', ['-c', `from PIL import Image; im=Image.open(r'${src}').convert('RGB'); w=900; im.resize((w, round(im.height*w/im.width)), Image.LANCZOS).save(r'${join(OUT, `${sheet.names[0]}.webp`)}', 'WEBP', quality=82, method=6)`]);
    return;
  }
  const tmp = join(OUT, `${id}_`);
  execFileSync('python', [join(ROOT, 'tools', 'slice-sheet.py'), src, String(sheet.names.length), tmp, String(sheet.size)], { stdio: 'inherit' });
  sheet.names.forEach((name, i) => {
    const from = `${tmp}${i}.webp`;
    writeFileSync(join(OUT, `${name}.webp`), readFileSync(from));
    rmSync(from);
  });
}

function embed() {
  const rows = [];
  for (const sheet of Object.values(SHEETS)) {
    for (const name of sheet.names) {
      const f = join(OUT, `${name}.webp`);
      if (existsSync(f)) rows.push(`  ${name}: '${readFileSync(f).toString('base64')}',`);
    }
  }
  const js = `// tools/gen-ui-art.mjs 가 만든 파일. 직접 고치지 말 것.
// 코덱스 이미지 생성으로 그린 보드·트레이 UI 그림 (webp base64).
export const UI_ART = {
${rows.join('\n')}
};
`;
  writeFileSync(join(ROOT, 'js', 'ui-art.js'), js);
  console.log(`js/ui-art.js: ${rows.length}장, ${(js.length / 1024) | 0} KB`);
}

const args = process.argv.slice(2);
if (!args.includes('--embed')) {
  const only = args.filter((a) => !a.startsWith('--'));
  const ids = only.length ? only : Object.keys(SHEETS);
  for (const id of only) rmSync(join(RAW, `sheet_${id}.png`), { force: true });
  await Promise.all(ids.filter((id) => !existsSync(join(RAW, `sheet_${id}.png`))).map(async (id) => {
    const t0 = Date.now();
    try {
      await codex(SHEETS[id].prompt);
      console.log(`✓ ${id} (${((Date.now() - t0) / 1000) | 0}초)`);
    } catch (e) {
      console.log(`✗ ${id}: ${e.message}`);
    }
  }));
  for (const id of ids) slice(id);
}
embed();
