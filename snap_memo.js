// Static snapshot of the 암기노트 screens for a visual check in a real browser.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('./_jsdom/node_modules/jsdom');
const html = fs.readFileSync(path.join('cbt_v2', 'cbt.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/cbt_v2/cbt.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  beforeParse(w) { w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; } });
const w = dom.window, d = w.document;
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const $$ = (s) => [...d.querySelectorAll(s)];
const parts = [];
const grab = (id, label) => parts.push(`<h2 style="font:700 14px sans-serif;margin:18px 16px 6px;color:#c0392b">▼ ${label}</h2>` + d.getElementById(id).outerHTML);

w.showScreen('sa-memo');
$$('#sa-memo-body details.sa-cmp').slice(0, 2).forEach(x => x.setAttribute('open', ''));
$$('#sa-memo-body details.sa-cmp')[0].classList.add('hide');
$$('#sa-memo-body details.sa-cmp')[0].querySelectorAll('.sa-cmp-row .v').forEach((v, i) => { if (i < 3) v.classList.add('show'); });
grab('screen-sa-memo', '암기노트 · 숫자 비교 (첫 세트는 값 가리기 ON, 3행만 공개)');

w.saMemoTab('cards');
w.saMemoTopic(3);
$$('#sa-memo-list details.sa-memo-ans').slice(0, 1).forEach(x => x.setAttribute('open', ''));
grab('screen-sa-memo', '암기노트 · 암기법 카드 (주제: 유도등·비상조명)');

w.saMemoTopic(-1);
w.saMemoSearch('금속관');
grab('screen-sa-memo', '암기노트 · 카드 검색 "금속관"');

w.eval(`SA_MEMO_UI.tab='flash'; SA_FLASH=null; saRenderMemo(); saFlashStart(); SA_FLASH.deck[0]='k2012_0_31'; SA_FLASH.stage=2; saRenderFlash();`);
grab('screen-sa-memo', '암기노트 · 카드 훈련 (정답 단계)');

w.eval(`saLaunch('t',[{k:'k2010_0_11',id:'m2024_3_07'}],'all')`);
click(d.querySelector('#sa-reveal .answer-reveal-header'));
grab('screen-sa-quiz', '문제 화면: 정답 공개 후 암기법 박스');

const style = d.querySelector('style').outerHTML;
const page = `<!doctype html><html lang="ko"><head><meta charset="utf-8">${style}<style>.screen{display:block !important;border-bottom:3px dashed #ccc;padding-bottom:12px}.quiz-nav,.quiz-header{position:static !important}.pb-bottom{display:none}</style></head><body>${parts.join('\n')}</body></html>`
  .replace(/<script[\s\S]*?<\/script>/g, '');
fs.mkdirSync('preview', { recursive: true });
fs.writeFileSync('preview/sa_memo_snapshot.html', page);
console.log('snapshot bytes', page.length);
