// End-to-end click-through of the built CBT in a real DOM (jsdom): navigation, SA flow, wrong note, old flow unaffected.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('./_jsdom/node_modules/jsdom');

const html = fs.readFileSync(process.env.CBT_HTML || path.join('cbt_v2', 'cbt.html'), 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(String(e.stack || e)));
vc.on('error', e => errors.push('console.error: ' + e));

function boot(ls = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost/cbt_v2/cbt.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      Object.entries(ls).forEach(([k, v]) => w.localStorage.setItem(k, v));
      w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {};
      w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () {};
    } });
  return dom;
}
const $ = (d, s) => d.window.document.querySelector(s);
const $$ = (d, s) => [...d.window.document.querySelectorAll(s)];
const click = (el) => { assert.ok(el, 'element to click not found'); el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true })); };
const active = (d) => $$(d, '.screen.active').map(e => e.id);
const tab = (d, name) => click($(d, `.nav-tab[data-screen="${name}"]`));

let dom = boot();
assert.deepStrictEqual(errors, [], 'script errors at load:\n' + errors.join('\n'));
assert.strictEqual($$(dom, '.nav-tab').length, 9);
assert.ok($$(dom, '#home-cat-chart .cat-row').length > 5, 'home category chart rendered (INIT ran)');
assert.deepStrictEqual(active(dom), ['screen-home']);

// ---- SA hub
tab(dom, 'sa');
assert.deepStrictEqual(active(dom), ['screen-sa']);
assert.ok($(dom, '.nav-tab[data-screen="sa"]').classList.contains('active'));
assert.strictEqual($$(dom, '#sa-stats .stat-box').length, 4);
assert.strictEqual($$(dom, '#sa-top .sa-top-row').length, 10);
assert.ok($(dom, '#sa-summary').textContent.includes('307'));
assert.strictEqual($$(dom, '#sa-seg button').length, 3);

// year mode -> pick 2024년 3회 -> 9 questions
click($$(dom, '#sa-seg button')[1]);
const chips = $$(dom, '#sa-panel .filter-chip');
assert.strictEqual(chips.length, 17);
click(chips.find(c => c.textContent.includes('2024년 3회')));
assert.ok($(dom, '#sa-summary').textContent.includes('9'));
assert.strictEqual($(dom, '#sa-start-btn').disabled, false);
click($(dom, '#sa-start-btn'));
assert.deepStrictEqual(active(dom), ['screen-sa-quiz']);
assert.strictEqual($(dom, '#sa-quiz-tot').textContent, '9');
let body = $(dom, '#sa-quiz-body');
assert.ok(body.querySelector('.sa-repeat') && body.querySelector('.sa-years') && body.querySelector('.sa-q'));
assert.ok(body.textContent.includes('2024년 3회 · 1번'), body.textContent.slice(0, 200));
assert.ok(!body.querySelector('.answer-reveal.show'));
assert.ok(!$(dom, '#sa-grade').classList.contains('visible'));

// reveal answer, grade X on #1 and O on #2, P on #3
click($(dom, '#sa-reveal .answer-reveal-header'));
assert.ok($(dom, '#sa-reveal').classList.contains('show') && $(dom, '#sa-grade').classList.contains('visible'));
assert.ok($$(dom, '#sa-reveal-body .sa-hist').length === 1);
click($$(dom, '#sa-grade .sg-btn')[2]);                         // ❌
assert.ok($$(dom, '#sa-grade .sg-btn')[2].classList.contains('wrong'));
click($(dom, '#sa-btn-next'));
assert.strictEqual($(dom, '#sa-quiz-cur').textContent, '2');
click($(dom, '#sa-reveal .answer-reveal-header'));
click($$(dom, '#sa-grade .sg-btn')[0]);                         // ✅
click($(dom, '#sa-btn-next'));
click($(dom, '#sa-reveal .answer-reveal-header'));
click($$(dom, '#sa-grade .sg-btn')[1]);                         // 🟡
const w = dom.window;
const sa1 = JSON.parse(w.localStorage.getItem('cbt_sa_v1'));
assert.strictEqual(Object.keys(sa1.wrong).length, 2);
assert.strictEqual(sa1.solved.length, 3);
assert.strictEqual(w.localStorage.getItem('cbt_store_v2'), null, 'old store untouched');
assert.ok($(dom, '#sync-badge').textContent.includes('단답 오답 2'));

// study mode toggles answer auto-show
click($(dom, '#btn-sa-study'));
click($(dom, '#sa-btn-next'));
assert.ok($(dom, '#sa-reveal').classList.contains('show'), 'study mode auto-reveals');
click($(dom, '#btn-sa-study'));

// finish early via 종료 (confirm=true) -> result
click($$(dom, '#screen-sa-quiz .quiz-header button').find(b => b.textContent.trim() === '종료'));
assert.deepStrictEqual(active(dom), ['screen-sa-result']);
assert.strictEqual($(dom, '#sa-res-correct').textContent, '1');
assert.strictEqual($(dom, '#sa-res-partial').textContent, '1');
assert.strictEqual($(dom, '#sa-res-wrong').textContent, '1');
assert.strictEqual($(dom, '#sa-res-unanswered').textContent, '6');
assert.strictEqual($$(dom, '#sa-res-list .sa-res-item').length, 9);
click($$(dom, '#screen-sa-result .card button').find(b => b.textContent.includes('오답')));
assert.strictEqual($$(dom, '#sa-res-list .sa-res-item').length, 1);

// ---- SA wrong note (separate tab)
tab(dom, 'sa-wrong');
assert.deepStrictEqual(active(dom), ['screen-sa-wrong']);
assert.strictEqual($$(dom, '#sa-wn-list .sa-wn-item').length, 2);
assert.ok($(dom, '#sa-wn-stats').textContent.includes('2'));
const firstWrongTitle = $(dom, '#sa-wn-list .sa-wn-title').textContent;
// the old wrong note is empty and separate
tab(dom, 'wrongnote');
assert.ok($(dom, '#wn-list').textContent.includes('오답이 없어요'), 'old wrong note must stay empty');
tab(dom, 'sa-wrong');
// retake from wrong note then fix one as correct -> list shrinks
click($$(dom, '#screen-sa-wrong button').find(b => b.textContent.includes('오답 문제 풀기')));
assert.deepStrictEqual(active(dom), ['screen-sa-quiz']);
assert.strictEqual($(dom, '#sa-quiz-tot').textContent, '2');
click($(dom, '#sa-reveal .answer-reveal-header'));
click($$(dom, '#sa-grade .sg-btn')[0]);
tab(dom, 'sa-wrong');
assert.strictEqual($$(dom, '#sa-wn-list .sa-wn-item').length, 1);
// 외웠어요 removes the last one
click($(dom, '#sa-wn-list .sa-wn-actions button'));
assert.ok($(dom, '#sa-wn-list').textContent.includes('오답이 없어요'));

// ---- topic mode + all mode + scope filters
tab(dom, 'sa');
click($$(dom, '#sa-seg button')[2]);
const tchips = $$(dom, '#sa-panel .filter-chip');
assert.strictEqual(tchips.length, 14);
click(tchips[0]); click(tchips[1]);
const topicCount = $(dom, '#sa-summary').textContent.match(/(\d+)문항/)[1];
assert.strictEqual(Number(topicCount), 100, 'topics 감지기(75)+수신기(25)');
click($$(dom, '#sa-panel button').find(b => b.textContent.includes('전체 선택')));
assert.ok($(dom, '#sa-summary').textContent.includes('307'));
const sel = $(dom, '#sa-scope'); sel.value = 'wrong'; sel.dispatchEvent(new w.Event('change'));
assert.ok($(dom, '#sa-summary').textContent.includes('0문항') && $(dom, '#sa-start-btn').disabled);
sel.value = 'all'; sel.dispatchEvent(new w.Event('change'));
const lim = $(dom, '#sa-limit'); lim.value = '10'; lim.dispatchEvent(new w.Event('change'));
const ord = $(dom, '#sa-order'); ord.value = 'hot'; ord.dispatchEvent(new w.Event('change'));
click($$(dom, '#sa-seg button')[0]);
assert.ok($(dom, '#sa-summary').textContent.includes('10문항'));
click($(dom, '#sa-start-btn'));
assert.ok($(dom, '#sa-quiz-body').textContent.includes('출제 9회'));

// ---- 🧠 단답 암기노트
tab(dom, 'sa-memo');
assert.deepStrictEqual(active(dom), ['screen-sa-memo']);
assert.ok($(dom, '.nav-tab[data-screen="sa-memo"]').classList.contains('active'));
assert.strictEqual($$(dom, '#sa-memo-seg button').length, 3);
let cmps = $$(dom, '#sa-memo-body details.sa-cmp');
assert.strictEqual(cmps.length, 14);
assert.strictEqual(cmps.filter(d => d.open).length, 0);
cmps[0].open = true;
const rowsOpen = $$(dom, '#sa-memo-body details.sa-cmp')[0].querySelectorAll('.sa-cmp-row');
assert.ok(rowsOpen.length >= 10, 'height set rows');
click($$(dom, '#sa-memo-body details.sa-cmp')[0].querySelector('.sa-cmp-tools button'));
assert.ok($$(dom, '#sa-memo-body details.sa-cmp')[0].classList.contains('hide'));
const vcell = $$(dom, '#sa-memo-body details.sa-cmp')[0].querySelector('.sa-cmp-row .v');
click(vcell);
assert.ok(vcell.classList.contains('show'), 'tapping a blurred value reveals it');
// a row's 📝 button starts a one-question SA session
click($$(dom, '#sa-memo-body details.sa-cmp')[0].querySelector('.sa-cmp-row .go button'));
assert.deepStrictEqual(active(dom), ['screen-sa-quiz']);
assert.strictEqual($(dom, '#sa-quiz-tot').textContent, '1');
// the mnemonic box appears only after revealing the answer, with a link back to the comparison set
assert.ok(!$(dom, '#sa-quiz-body .sa-memo-box'));
click($(dom, '#sa-reveal .answer-reveal-header'));
assert.ok($(dom, '#sa-reveal-body .sa-memo-box'), 'memo box after reveal');
const cmpLink = $(dom, '#sa-reveal-body .sa-cmp-link');
assert.ok(cmpLink, 'compare link inside memo box');
click(cmpLink);
assert.deepStrictEqual(active(dom), ['screen-sa-memo']);
assert.ok($$(dom, '#sa-memo-body details.sa-cmp').some(d => d.open), 'target compare set opened');
// cards tab
click($$(dom, '#sa-memo-seg button')[1]);
let cardEls = $$(dom, '#sa-memo-list .sa-memo-card');
assert.ok(cardEls.length >= 100);
const allCards = cardEls.length;
click($$(dom, '#sa-memo-chips .filter-chip')[1]);
assert.ok($$(dom, '#sa-memo-list .sa-memo-card').length < allCards);
click($$(dom, '#sa-memo-chips .filter-chip')[0]);
const qin = $(dom, '#sa-memo-q'); qin.value = '부싱'; qin.dispatchEvent(new w.Event('input'));
const found = $$(dom, '#sa-memo-list .sa-memo-card');
assert.ok(found.length >= 1 && found.length < 10);
assert.ok(found[0].textContent.includes('부싱'));
qin.value = ''; qin.dispatchEvent(new w.Event('input'));
click($$(dom, '#sa-memo-list .sa-cmp-link.go')[0]);
assert.deepStrictEqual(active(dom), ['screen-sa-quiz']);
// flash-card training: question -> hint -> answer -> 헷갈려요 adds to the separate wrong note
tab(dom, 'sa-memo');
click($$(dom, '#sa-memo-seg button')[2]);
click($$(dom, '#sa-memo-body button').find(b => b.textContent.includes('훈련 시작')));
assert.ok($(dom, '#sa-memo-body .sa-q') && !$(dom, '#sa-memo-body .sa-memo-hook'));
click($$(dom, '#sa-memo-body .sa-flash-btns button')[0]);                 // 힌트
assert.ok($(dom, '#sa-memo-body .sa-memo-hook'));
click($$(dom, '#sa-memo-body .sa-flash-btns button')[0]);                 // 정답 확인
assert.ok($(dom, '#sa-memo-body .answer-reveal .sa-a') && $(dom, '#sa-memo-body .sa-memo-box'));
const wrongBefore = Object.keys(JSON.parse(w.localStorage.getItem('cbt_sa_v1')).wrong).length;
click($$(dom, '#sa-memo-body .sa-flash-btns button')[1]);                 // 🤔 헷갈려요
assert.strictEqual(Object.keys(JSON.parse(w.localStorage.getItem('cbt_sa_v1')).wrong).length, wrongBefore + 1);
assert.ok($(dom, '#sa-memo-body').textContent.includes('2 /'));
click($$(dom, '#sa-memo-body .sa-flash-top button')[0]);                  // 그만하기
assert.ok($$(dom, '#sa-memo-body button').some(b => b.textContent.includes('훈련 시작')));

// ---- old exam flow still works and does not touch SA
const saBefore = w.localStorage.getItem('cbt_sa_v1');
tab(dom, 'exam-select');
const card = $$(dom, '#exam-grid .exam-card')[0];
assert.ok(card, 'exam cards rendered');
click(card);
assert.deepStrictEqual(active(dom), ['screen-quiz']);
assert.ok($(dom, '#quiz-body .q-card'));
click($(dom, '#quiz-body .answer-reveal-header'));
click($$(dom, '#quiz-body .sg-btn')[2]);
click($(dom, '#screen-quiz .quiz-header button.btn-outline'));      // 종료
assert.strictEqual(w.localStorage.getItem('cbt_sa_v1'), saBefore, 'exam flow must not change SA storage');
const old = JSON.parse(w.localStorage.getItem('cbt_store_v2'));
assert.strictEqual(Object.keys(old.wrong).length, 1);
assert.ok(!('sa' in old));

// ---- save / reload persistence: SA state survives a page reload (localStorage)
const lsCopy = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); lsCopy[k] = w.localStorage.getItem(k); }
const dom2 = boot(lsCopy);
assert.ok($(dom2, '#sync-badge').textContent.includes('오답 1'));
tab(dom2, 'sa-wrong');
assert.deepStrictEqual(errors, [], 'script errors during the session:\n' + errors.join('\n'));
console.log('PASS e2e (jsdom): navigation, hub filters, SA quiz + grading, separate wrong note, old flow unaffected, reload persistence');
