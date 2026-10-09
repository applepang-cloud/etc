// index.html + css + js 를 하나의 HTML 파일로 묶는다.
//   node build.mjs dist/coin-idle.html            → 단독 실행용 (doctype 포함)
//   node build.mjs dist/artifact.html --fragment   → 문서 골격 없이 본문만 (호스팅 페이지 삽입용)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(root, 'dist', 'coin-idle.html');
const fragment = process.argv.includes('--fragment');

const html = readFileSync(join(root, 'index.html'), 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]*>/)[0];
const app = html.slice(html.indexOf('<!--APP-->') + 10, html.indexOf('<!--/APP-->')).trim();
const css = readFileSync(join(root, 'css', 'style.css'), 'utf8');
const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => {
  const src = readFileSync(join(root, m[1]), 'utf8');
  if (src.includes('</script')) throw new Error(`${m[1]}에 </script 문자열이 있습니다`);
  return `<script>\n${src}\n</script>`;
});

const body = `${app}\n${scripts.join('\n')}`;
const doc = fragment
  ? `${title}\n${fonts}\n<style>\n${css}\n</style>\n${body}\n`
  : `<!DOCTYPE html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${title}\n${fonts}\n<style>\n${css}\n</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, doc);
console.log(`${out} (${(doc.length / 1024).toFixed(0)} KB)`);
