// index.html + style.css + js/*.js 를 서버 없이 바로 열리는 HTML 파일 하나로 합친다.
// 각 모듈은 자기 함수 스코프로 감싸서 최상위 이름이 겹쳐도 충돌하지 않는다.
//   node build-single.mjs            → ../piano-block.html
//   node build-single.mjs out.html   → out.html
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.argv[2] ?? join(ROOT, '..', 'piano-block.html'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+)\.js';?\s*$/gm;
const EXPORT_RE = /^export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm;

const modules = new Map();
for (const file of readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js'))) {
  const name = file.replace(/\.js$/, '');
  const src = read(`js/${file}`);
  if (/^export\s+(default|\{)/m.test(src) || /^import\s/m.test(src.replace(IMPORT_RE, ''))) {
    throw new Error(`${file}: 지원하지 않는 import/export 형식`);
  }
  const deps = [...src.matchAll(IMPORT_RE)].map((m) => m[2]);
  const exports = [...src.matchAll(EXPORT_RE)].map((m) => m[1]);
  const body = src
    .replace(IMPORT_RE, (_, names, from) => {
      const binds = names.split(',').map((s) => s.trim()).filter(Boolean)
        .map((s) => s.replace(/\s+as\s+/, ': '));
      return `const { ${binds.join(', ')} } = __mod['${from}'];`;
    })
    .replace(/^export\s+/gm, '');
  modules.set(name, { deps, exports, body });
}

// 의존 순서대로 정렬
const order = [];
const state = new Map();
function visit(name, chain = []) {
  if (!modules.has(name)) throw new Error(`없는 모듈: ${name} (${chain.join(' → ')})`);
  if (state.get(name) === 'done') return;
  if (state.get(name) === 'visiting') throw new Error(`순환 import: ${[...chain, name].join(' → ')}`);
  state.set(name, 'visiting');
  for (const d of modules.get(name).deps) visit(d, [...chain, name]);
  state.set(name, 'done');
  order.push(name);
}
visit('main');

const js = ['const __mod = {};']
  .concat(order.map((name) => {
    const { exports, body } = modules.get(name);
    return `// ── js/${name}.js ──\n__mod['${name}'] = (() => {\n${body}\nreturn { ${exports.join(', ')} };\n})();`;
  }))
  .join('\n\n');

// 인라인 <script> 안에서 문자열 "</script" 가 태그를 닫지 않게 한다
const safe = (s) => s.replace(/<\/(script|style)/gi, '<\\/$1');

let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="style\.css">/, () => `<style>\n${safe(read('style.css'))}\n</style>`);
html = html.replace(/<script type="module" src="js\/main\.js"><\/script>/, () => `<script type="module">\n${safe(js)}\n</script>`);
if (/href="style\.css"|src="js\//.test(html)) throw new Error('index.html 의 css/js 링크를 바꾸지 못했다');

writeFileSync(OUT, html);
console.log(`${OUT} (${(html.length / 1024).toFixed(0)} KB, 모듈 ${order.length}개: ${order.join(', ')})`);
