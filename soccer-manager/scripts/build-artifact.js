#!/usr/bin/env node
/*
 * claude.ai 아티팩트용 단일 HTML 만들기.
 * index.html의 <title>·폰트 링크·본문을 꺼내고 style.css와 js/*.js를 인라인한다.
 * 아티팩트는 게시할 때 doctype/head/body 뼈대를 씌우므로 그 태그들은 빼고 쓴다.
 *
 *   node scripts/build-artifact.js [출력 경로=dist/touchline-manager.html]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dist', 'touchline-manager.html'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const fontLinks = (html.match(/<link rel="(?:preconnect|stylesheet)" href="https:\/\/fonts[^>]*>/g) || []).join('\n');
let body = html.match(/<body>([\s\S]*)<\/body>/)[1];

const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
body = body.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const js = fs.readFileSync(path.join(root, src), 'utf8');
  if (/<\/script/i.test(js)) throw new Error(src + ' 안에 </script 문자열이 있어 인라인할 수 없습니다');
  return '<script>\n' + js + '\n</script>';
});

const page = [title, fontLinks, '<style>\n' + css + '\n</style>', body.trim(), ''].join('\n');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`${path.relative(process.cwd(), out)} (${(page.length / 1024).toFixed(0)} KB)`);
