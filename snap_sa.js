// Render SA screens in jsdom and write a static (script-free) snapshot for a visual check in a real browser.
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

w.showScreen('sa');
click($$('#sa-seg button')[1]);
['2024년 3회', '2023년', '2021년'].forEach(t => click($$('#sa-panel .filter-chip').find(c => c.textContent.includes(t))));
grab('screen-sa', '허브 (연도별 선택)');

click(d.getElementById('sa-start-btn'));
w.document.getElementById('sa-quiz-cur');
// jump to a multi-year question and reveal it
const idx = w.eval(`SA_STATE.units.findIndex(u=>u.k==='k2012_0_31')`);
if (idx > 0) { w.eval(`SA_STATE.cur=${idx}; saRenderQuestion()`); }
click(d.querySelector('#sa-reveal .answer-reveal-header'));
click($$('#sa-grade .sg-btn')[2]);
d.querySelector('#sa-hist-dummy');
const det = d.querySelector('#sa-reveal-body details'); if (det) det.setAttribute('open', '');
grab('screen-sa-quiz', '문제 화면 (정답 공개 · 출제 이력 펼침 · 오답 채점)');

w.eval(`saLaunch('단답·서술 · 전체', SA_BANK.clusters.slice(0,6).map(c=>({k:c.k,id:c.rep})), 'all')`);
w.eval(`saGrade(SA_STATE.units[0].k,'O'); saGrade(SA_STATE.units[1].k,'X'); saGrade(SA_STATE.units[2].k,'P'); saFinish()`);
grab('screen-sa-result', '결과 화면');
w.showScreen('sa-wrong');
const wi = d.querySelector('#sa-wn-list .sa-wn-item'); if (wi) wi.setAttribute('open', '');
grab('screen-sa-wrong', '단답·서술 오답노트');

const style = d.querySelector('style').outerHTML;
const page = `<!doctype html><html lang="ko"><head><meta charset="utf-8">${style}<style>.screen{display:block !important;border-bottom:3px dashed #ccc;padding-bottom:12px}.quiz-nav,.quiz-header{position:static !important}.pb-bottom{display:none}</style></head><body>${parts.join('\n')}</body></html>`
  .replace(/<script[\s\S]*?<\/script>/g, '');
fs.mkdirSync('preview', { recursive: true });
fs.writeFileSync('preview/sa_snapshot.html', page);
console.log('snapshot bytes', page.length);
