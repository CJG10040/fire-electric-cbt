// Script-free snapshot of the undo UI (FAB, history panel, snackbar) over the quiz screen, for a visual check.
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('./_jsdom/node_modules/jsdom');
const html = fs.readFileSync('cbt_v2/cbt.html', 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/cbt_v2/cbt.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  beforeParse(w) { w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; } });
const w = dom.window, d = w.document;
const run = c => w.eval(c);
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
click(d.querySelector('.nav-tab[data-screen="exam-select"]'));
run(`startExam(DB[3].ei)`);
click(d.querySelector('#ans-reveal .answer-reveal-header'));
click(d.querySelector('.sg-btn[data-grade="O"]'));
click(d.querySelector('#btn-next'));
click(d.querySelector('.answer-reveal-header'));
click(d.querySelector('.sg-btn[data-grade="X"]'));
click(d.querySelector('#undo-list-btn'));
// undo the last grade so the redo list also shows an entry
click(d.querySelector('#undo-btn'));
click(d.querySelector('#undo-panel-body .undo-item'));   // jump back one more -> shows a redo section
d.getElementById('undo-panel').style.display = 'flex';
run('undoRenderPanel()');
run(`undoSnack('문제 02 채점 ❌')`);
const style = [...d.querySelectorAll('style')].map(s => s.outerHTML).join('\n');
const page = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${style}</head><body>${d.body.innerHTML}</body></html>`
  .replace(/<script[\s\S]*?<\/script>/g, '');
fs.mkdirSync('preview', { recursive: true });
fs.writeFileSync('preview/undo_snapshot.html', page);
console.log('snapshot', page.length);
