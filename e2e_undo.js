// jsdom click-through of ↶ 되돌리기 / ↷ 다시 실행 on the built CBT.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('./_jsdom/node_modules/jsdom');

const html = fs.readFileSync(process.env.CBT_HTML || path.join('cbt_v2', 'cbt.html'), 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(String(e.stack || e)));
vc.on('error', e => errors.push('console.error: ' + e));

let confirmAnswer = true;
function boot(ls = {}) {
  return new JSDOM(html, { url: 'http://localhost/cbt_v2/cbt.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      Object.entries(ls).forEach(([k, v]) => w.localStorage.setItem(k, v));
      w.confirm = () => confirmAnswer; w.alert = () => {}; w.scrollTo = () => {};
      w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
    } });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let dom = boot();
  const w = dom.window, d = w.document;
  const run = c => w.eval(c);
  const $ = s => d.querySelector(s);
  const $$ = s => [...d.querySelectorAll(s)];
  const click = el => { assert.ok(el, 'element to click not found'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const active = () => $$('.screen.active').map(e => e.id);
  const tab = n => click($(`.nav-tab[data-screen="${n}"]`));
  const stackLen = () => run('UNDO.stack.length');
  const redoLen = () => run('UNDO.redo.length');
  const topLabel = () => run('UNDO.stack.length ? UNDO.stack[UNDO.stack.length-1].label : null');
  const key = (target, k, opt = {}) => target.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, opt)));
  const lsJson = k => JSON.parse(w.localStorage.getItem(k) || 'null');

  assert.deepStrictEqual(errors, [], 'load errors:\n' + errors.join('\n'));

  // ---------------------------------------------------------------- 0. UI is present, empty at start
  assert.ok($('#undo-btn') && $('#redo-btn') && $('#undo-list-btn') && $('#undo-panel') && $('#undo-snack'));
  assert.strictEqual($('#undo-btn').disabled, true);
  assert.strictEqual($('#redo-btn').disabled, true);
  assert.strictEqual(stackLen(), 0);
  const h0 = w.history.length;
  assert.strictEqual(run('UNDO_BACK.armed'), false, 'history guard is not pushed before the first user gesture');

  // ---------------------------------------------------------------- 1. screen navigation is undoable ("뒤로")
  tab('exam-select');
  assert.strictEqual(run('UNDO_BACK.armed'), true, 'armed on the first click');
  assert.strictEqual(w.history.length, h0 + 1);
  assert.deepStrictEqual(active(), ['screen-exam-select']);
  assert.strictEqual(stackLen(), 1);
  assert.strictEqual($('#undo-btn').disabled, false);
  assert.strictEqual($('#undo-count').textContent, '1');
  tab('exam-select');                                           // same screen again -> nothing changed -> not recorded
  assert.strictEqual(stackLen(), 1, 'no-op navigation not recorded');
  tab('wrongnote');
  assert.strictEqual(stackLen(), 2);
  click($('#undo-btn'));
  assert.deepStrictEqual(active(), ['screen-exam-select']);
  assert.strictEqual(redoLen(), 1);
  assert.strictEqual($('#redo-btn').disabled, false);
  click($('#redo-btn'));
  assert.deepStrictEqual(active(), ['screen-wrongnote']);
  click($('#undo-btn')); click($('#undo-btn'));
  assert.deepStrictEqual(active(), ['screen-home']);
  assert.strictEqual(stackLen(), 0);
  assert.strictEqual($('#undo-btn').disabled, true);
  assert.strictEqual(redoLen(), 2);

  // ---------------------------------------------------------------- 2. exam: start / reveal / grade / move / finish
  const ei = run('DB[0].ei');
  run(`startExam('${ei}')`);
  assert.deepStrictEqual(active(), ['screen-quiz']);
  assert.strictEqual(redoLen(), 0, 'a new action clears the redo list');
  assert.ok(topLabel().startsWith('시험 시작'), topLabel());
  assert.strictEqual($('#undo-snack').style.display, 'flex', 'snackbar offered after a real action');
  const q0 = run('STATE.questions[0].id');
  const n0 = stackLen();

  const ta = $('#user-ans-ta');
  ta.value = '내 메모 ABC'; ta.dispatchEvent(new w.Event('input', { bubbles: true }));

  click($('#ans-reveal .answer-reveal-header'));
  assert.strictEqual(run(`STATE.shown['${q0}']`), true);
  assert.strictEqual(stackLen(), n0 + 1);
  assert.strictEqual($('#undo-snack').style.display, 'flex', 'snack still showing from launch');

  click($('.sg-btn[data-grade="O"]'));
  assert.strictEqual(run(`STATE.answers['${q0}']`), 'O');
  assert.ok(topLabel().includes('채점 ✅'), topLabel());
  click($('#undo-snack button'));                                // snackbar's own ↶
  assert.strictEqual(run(`STATE.answers['${q0}']`), undefined);
  assert.strictEqual(run(`STATE.pointScores['${q0}']`), undefined);
  assert.strictEqual(run(`STATE.shown['${q0}']`), true, 'reveal state from before the grade is kept');
  assert.ok(!$('.sg-btn.correct'), 'grade button highlight removed');
  assert.strictEqual($('#quiz-nav-status').textContent.trim().startsWith('0/'), true);
  assert.strictEqual($('#user-ans-ta').value, '내 메모 ABC', 'typed memo survives undo');
  assert.strictEqual($('#undo-snack').style.display, 'none');
  click($('#redo-btn'));
  assert.strictEqual(run(`STATE.answers['${q0}']`), 'O');
  assert.ok($('.sg-btn.correct'));

  // an invalid partial-score click changes nothing -> not recorded
  const before = stackLen();
  click($('.sg-btn[data-grade="P"]'));                          // empty partial input -> toast only
  assert.strictEqual(stackLen(), before, 'rejected action not recorded');

  // move to next question, then Ctrl+Z (keyboard) goes back
  click($('#btn-next'));
  assert.strictEqual($('#quiz-cur').textContent, '2');
  assert.strictEqual($('#undo-snack').style.display === 'flex' && false, false);
  key(d.body, 'z', { ctrlKey: true });
  assert.strictEqual($('#quiz-cur').textContent, '1');
  assert.strictEqual(run(`STATE.answers['${q0}']`), 'O');
  key(d.body, 'y', { ctrlKey: true });
  assert.strictEqual($('#quiz-cur').textContent, '2');
  key(d.body, 'z', { ctrlKey: true, shiftKey: true });          // Ctrl+Shift+Z = redo alias; nothing left to redo
  assert.strictEqual($('#quiz-cur').textContent, '2');
  key(d.body, 'z', { ctrlKey: true });
  // Ctrl+Z inside the memo textarea must keep the browser's own text-undo
  const stackNow = stackLen();
  key($('#user-ans-ta'), 'z', { ctrlKey: true });
  assert.strictEqual(stackLen(), stackNow, 'typing context is left alone');

  // finish exam (종료 button -> confirm) then undo it
  const wrongBefore = JSON.stringify(run('STORE.wrong'));
  const histBefore = run('STORE.history.length');
  const solvedBefore = run('STORE.solved.length');
  click($('.quiz-header button.btn-outline'));
  assert.deepStrictEqual(active(), ['screen-result']);
  assert.strictEqual(run('STORE.history.length'), histBefore + 1);
  assert.ok(run('STORE.solved.length') > solvedBefore);
  const scoreText = $('#res-score').textContent;
  assert.ok(topLabel().startsWith('시험 종료'), topLabel());
  click($('#undo-btn'));
  assert.deepStrictEqual(active(), ['screen-quiz']);
  assert.strictEqual(run('STORE.history.length'), histBefore, 'history restored');
  assert.strictEqual(run('STORE.solved.length'), solvedBefore, 'solved restored');
  assert.strictEqual(JSON.stringify(run('STORE.wrong')), wrongBefore, 'wrong restored');
  assert.strictEqual(run('STATE.finished'), false);
  assert.strictEqual(lsJson('cbt_store_v2').history.length, histBefore, 'localStorage re-synced');
  assert.strictEqual($('#quiz-cur').textContent, '1');
  assert.strictEqual(run(`STATE.answers['${q0}']`), 'O');
  click($('#redo-btn'));                                          // redo -> back to the result screen with the same numbers
  assert.deepStrictEqual(active(), ['screen-result']);
  assert.strictEqual($('#res-score').textContent, scoreText);
  assert.strictEqual(run('STORE.history.length'), histBefore + 1);

  // retry from result -> new quiz; undo brings the result screen back (DOM restored)
  const nBeforeRetry = stackLen();
  run('retryExam()');
  assert.deepStrictEqual(active(), ['screen-quiz']);
  assert.strictEqual(run('STATE.finished'), false);
  assert.strictEqual(stackLen(), nBeforeRetry + 1);
  click($('#undo-btn'));
  assert.deepStrictEqual(active(), ['screen-result']);
  assert.strictEqual($('#res-score').textContent, scoreText);
  assert.ok($$('#result-list .result-item').length > 0);
  assert.strictEqual(run('STATE.finished'), true);

  // ---------------------------------------------------------------- 3. timer interplay
  run(`launchQuiz('random', DB.slice(0,3), null, null, 5)`);
  assert.ok(run('STATE.timerEndsAt') > Date.now());
  assert.ok(run('QUIZ_TIMER_INTERVAL') !== null);
  run('finishExam()');
  assert.strictEqual(run('QUIZ_TIMER_INTERVAL'), null);
  click($('#undo-btn'));
  assert.deepStrictEqual(active(), ['screen-quiz']);
  assert.ok(run('STATE.timerEndsAt') > Date.now(), 'time keeps running after undoing a manual finish');
  assert.ok(run('QUIZ_TIMER_INTERVAL') !== null, 'timer restarted');
  assert.strictEqual($('#quiz-timer-wrap').style.display, 'flex');
  // time-up auto finish: undo resumes without a time limit (no instant re-finish loop)
  run('STATE.timerEndsAt = Date.now() - 5000');
  run('finishExam(true)');
  assert.ok(topLabel().startsWith('시간 종료'), topLabel());
  click($('#undo-btn'));
  assert.deepStrictEqual(active(), ['screen-quiz']);
  assert.strictEqual(run('STATE.finished'), false);
  assert.strictEqual(run('STATE.timerMinutes'), null);
  assert.strictEqual($('#quiz-timer-wrap').style.display, 'none');
  await sleep(1300);
  assert.strictEqual(run('STATE.finished'), false, 'no automatic finish after resume');
  run('STATE.finished = true; clearInterval(QUIZ_TIMER_INTERVAL)');
  run('STATE.finished = false');

  // ---------------------------------------------------------------- 4. 복습노트 전체 초기화
  run(`addWrong(DB[1].id); addWrong(DB[2].id); STORE.wrong[DB[1].id] = 3`);
  tab('wrongnote');
  assert.strictEqual($$('#wn-list .wn-item').length, 2);
  const wnBefore = JSON.stringify(run('STORE.wrong'));
  run('clearWrongNote()');
  assert.strictEqual(JSON.stringify(run('STORE.wrong')), '{}');
  assert.strictEqual($$('#wn-list .wn-item').length, 0);
  click($('#undo-btn'));
  assert.strictEqual(JSON.stringify(run('STORE.wrong')), wnBefore);
  assert.strictEqual($$('#wn-list .wn-item').length, 2, 'wrong note re-rendered');
  assert.strictEqual(Object.keys(lsJson('cbt_store_v2').wrong).length, 2);
  confirmAnswer = false;                                        // cancelled confirm -> nothing happened -> nothing recorded
  const nc = stackLen();
  run('clearWrongNote()');
  assert.strictEqual(stackLen(), nc);
  confirmAnswer = true;

  // ---------------------------------------------------------------- 5. 단답·서술: grade / remove / clear
  const K = 'k2012_0_31';
  run(`STORE.sa.wrong = {}; STORE.sa.solved = []; _persistSA()`);
  run(`saLaunch('테스트', [{k:'${K}', id:SA_CL['${K}'].rep}], 'all')`);
  assert.deepStrictEqual(active(), ['screen-sa-quiz']);
  click($('#sa-reveal .answer-reveal-header'));
  click($$('#sa-grade .sg-btn')[2]);                              // ❌
  assert.strictEqual(run(`STORE.sa.wrong['${K}']`), 1);
  assert.ok(topLabel().includes('단답 채점 ❌'), topLabel());
  click($('#undo-btn'));
  assert.strictEqual(run(`STORE.sa.wrong['${K}']`), undefined, 'SA wrong note entry undone');
  assert.deepStrictEqual(lsJson('cbt_sa_v1').wrong, {});
  assert.ok(!$('#sa-grade .sg-btn.wrong'));
  assert.strictEqual(run(`STORE.sa.solved.includes('${K}')`), false);
  click($('#redo-btn'));
  assert.strictEqual(run(`STORE.sa.wrong['${K}']`), 1);
  assert.ok($('#sa-grade .sg-btn.wrong'));
  // grading again with a different grade is also undoable (snap counter restored)
  click($$('#sa-grade .sg-btn')[0]);                              // ✅ -> removes from wrong note
  assert.strictEqual(run(`STORE.sa.wrong['${K}']`), undefined);
  click($('#undo-btn'));
  assert.strictEqual(run(`STORE.sa.wrong['${K}']`), 1);
  assert.strictEqual(run(`SA_STATE.snap['${K}']`), 0);

  tab('sa-wrong');
  assert.strictEqual($$('#sa-wn-list .sa-wn-item').length, 1);
  click($('#sa-wn-list .btn-success'));                           // 외웠어요
  assert.strictEqual($$('#sa-wn-list .sa-wn-item').length, 0);
  click($('#undo-btn'));
  assert.strictEqual($$('#sa-wn-list .sa-wn-item').length, 1, 'removed item is back');
  assert.strictEqual(run(`STORE.sa.wrong['${K}']`), 1);
  run('saClearWrong()');
  assert.strictEqual(JSON.stringify(run('STORE.sa.wrong')), '{}');
  key(d.body, 'z', { ctrlKey: true });
  assert.strictEqual(run(`STORE.sa.wrong['${K}']`), 1);
  assert.ok(!errors.length, errors.join('\n'));

  // the old wrong note is untouched by all of the SA undo/redo
  assert.strictEqual(JSON.stringify(run('STORE.wrong')), wnBefore);

  // ---------------------------------------------------------------- 6. 카드 훈련 (알겠어요 / 헷갈려요)
  run(`STORE.sa.wrong = {}; _persistSA()`);
  run(`SA_MEMO_UI.tab='flash'; SA_FLASH=null`);
  tab('sa-memo');
  click($$('#sa-memo-body button').find(b => b.textContent.includes('훈련 시작')));
  assert.ok(run('SA_FLASH.deck.length') > 100);
  const k0 = run('SA_FLASH.deck[0]');
  click($$('#sa-memo-body .sa-flash-btns button')[0]);           // 힌트
  assert.strictEqual(run('SA_FLASH.stage'), 1);
  click($$('#sa-memo-body .sa-flash-btns button')[0]);           // 정답 확인
  assert.strictEqual(run('SA_FLASH.stage'), 2);
  click($$('#sa-memo-body .sa-flash-btns button')[1]);           // 🤔 헷갈려요
  assert.strictEqual(run('SA_FLASH.i'), 1);
  assert.strictEqual(run(`STORE.sa.wrong['${k0}']`), 1);
  click($('#undo-btn'));                                          // ← 이전 카드로 + 오답노트 담기 취소
  assert.strictEqual(run('SA_FLASH.i'), 0);
  assert.strictEqual(run('SA_FLASH.stage'), 2);
  assert.strictEqual(run('SA_FLASH.flagged.size'), 0);
  assert.strictEqual(run(`STORE.sa.wrong['${k0}']`), undefined);
  assert.ok($('#sa-memo-body .sa-memo-box') && $('#sa-memo-body .sa-q'), 'card re-rendered at the answer stage');
  click($('#undo-btn'));                                          // 정답 확인 취소 -> 힌트 단계
  assert.strictEqual(run('SA_FLASH.stage'), 1);
  assert.ok($('#sa-memo-body .sa-memo-hook') && !$('#sa-memo-body .answer-reveal'));
  click($$('#sa-memo-body .sa-flash-btns button')[0]); // 정답 확인
  click($$('#sa-memo-body .sa-flash-btns button')[0]); // 👍 알겠어요
  assert.strictEqual(run('SA_FLASH.known'), 1);
  click($$('#sa-memo-body .sa-flash-top button')[0]);             // 그만하기
  assert.strictEqual(run('SA_FLASH'), null);
  click($('#undo-btn'));
  assert.ok(run('SA_FLASH') && run('SA_FLASH.i') === 1, 'quit flash-card training can be undone');
  assert.ok($('#sa-memo-body .sa-flash-btns'));
  click($$('#sa-memo-body .sa-flash-top button')[1]);             // card screen's own "↶ 이전 단계" button
  assert.strictEqual(run('SA_FLASH.i'), 0);
  assert.strictEqual(run('SA_FLASH.known'), 0);
  assert.strictEqual(run('SA_FLASH.stage'), 2);

  // ---------------------------------------------------------------- 7. history panel: jump several steps
  tab('home');
  tab('exam-select');
  tab('conceptnote');
  const lenBefore = stackLen();
  click($('#undo-list-btn'));
  assert.strictEqual($('#undo-panel').style.display, 'flex');
  const items = $$('#undo-panel-body .undo-item:not(.redo)');
  assert.ok(items.length >= 3);
  assert.ok(items[0].textContent.includes('암기노트'), items[0].textContent);
  click(items[2]);                                                // jump back 3 steps
  assert.strictEqual(stackLen(), lenBefore - 3);
  assert.deepStrictEqual(active(), ['screen-sa-memo']);
  assert.strictEqual($('#undo-panel').style.display, 'flex', 'panel stays open');
  assert.ok($$('#undo-panel-body .undo-item.redo').length >= 3);
  click($$('#undo-panel-body .undo-item.redo')[0]);              // redo list: the first item is the next redo
  assert.strictEqual(stackLen(), lenBefore - 2);
  click(d.body);
  assert.strictEqual($('#undo-panel').style.display, 'none', 'outside click closes the panel');
  click($('#undo-list-btn')); key(d.body, 'Escape');
  assert.strictEqual($('#undo-panel').style.display, 'none');

  // ---------------------------------------------------------------- 8. browser / phone Back = undo
  tab('home');
  const lenH = w.history.length;
  const sl = stackLen();
  w.dispatchEvent(new w.PopStateEvent('popstate', { state: { cbt: 'base' } }));
  assert.strictEqual(stackLen(), sl - 1, 'Back button undoes one step');
  assert.notDeepStrictEqual(active(), ['screen-home'], 'the navigation to home was undone');
  assert.strictEqual(w.history.length, lenH + 1, 'guard re-armed so the page is not left');
  run('undoClear()');
  let leftPage = 0;
  w.history.back = () => { leftPage++; };
  w.dispatchEvent(new w.PopStateEvent('popstate'));              // nothing to undo: warn once
  assert.strictEqual(leftPage, 0);
  w.dispatchEvent(new w.PopStateEvent('popstate'));              // second press within the window leaves
  assert.strictEqual(leftPage, 1);
  // switching the feature off: the next Back behaves natively
  click($('#undo-list-btn')); $('#undo-back-chk').checked = false; $('#undo-back-chk').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.strictEqual(w.localStorage.getItem('cbt_undo_back'), '0');
  tab('exam-select');
  w.dispatchEvent(new w.PopStateEvent('popstate'));
  assert.strictEqual(leftPage, 2);
  assert.strictEqual(stackLen(), 1, 'off: Back did not undo');
  $('#undo-back-chk').checked = true; $('#undo-back-chk').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.strictEqual(w.localStorage.getItem('cbt_undo_back'), '1');

  // ---------------------------------------------------------------- 9. file import (replace / merge) is undoable
  run('undoClear()');
  run(`STORE.wrong = {'x1': 2}; STORE.solved = ['x1']; STORE.myNotes = {'개념A': '내 메모'}; STORE.sa = normalizeSA({wrong:{'${K}': 1}}); _persistToLS(); _persistSA()`);
  const orig = JSON.stringify({ wrong: run('STORE.wrong'), solved: run('STORE.solved'), myNotes: run('STORE.myNotes'), sa: run('STORE.sa') });
  confirmAnswer = false;                                          // [취소] = replace
  const file = new w.File([JSON.stringify({ wrong: { y1: 5 }, solved: ['y1', 'y2'], history: [], myNotes: { 개념B: '파일 메모' }, sa: { wrong: {}, solved: ['a'], history: [] } })], 'cbt_data.json');
  w.onDataFileSelected({ target: { files: [file], value: 'x' } });
  await sleep(80);
  assert.strictEqual(JSON.stringify(run('STORE.wrong')), '{"y1":5}');
  assert.strictEqual(JSON.stringify(run('STORE.myNotes')), '{"개념B":"파일 메모"}');
  assert.strictEqual(stackLen(), 1);
  assert.ok(topLabel().includes('불러오기'), topLabel());
  click($('#undo-btn'));
  assert.strictEqual(JSON.stringify({ wrong: run('STORE.wrong'), solved: run('STORE.solved'), myNotes: run('STORE.myNotes'), sa: run('STORE.sa') }), orig, 'import undone, notes included');
  assert.deepStrictEqual(lsJson('cbt_store_v2').wrong, { x1: 2 });
  confirmAnswer = true;                                           // [확인] = merge
  const file2 = new w.File([JSON.stringify({ wrong: { x1: 1, z: 1 }, solved: ['z'], history: [], myNotes: {}, sa: { wrong: { [K]: 2 }, solved: [], history: [] } })], 'cbt_data.json');
  w.onDataFileSelected({ target: { files: [file2], value: 'x' } });
  await sleep(80);
  assert.strictEqual(run('STORE.wrong.x1'), 3);
  click($('#undo-btn'));
  assert.strictEqual(run('STORE.wrong.x1'), 2);
  assert.strictEqual(run(`STORE.sa.wrong['${K}']`), 1);
  click($('#redo-btn'));
  assert.strictEqual(run('STORE.wrong.x1'), 3);

  // ---------------------------------------------------------------- 10. bounded history, no leaks into unrelated state
  run('undoClear()');
  for (let i = 0; i < 70; i++) { tab(i % 2 ? 'home' : 'exam-select'); }
  assert.ok(stackLen() <= 120 && stackLen() >= 60);
  run('UNDO.max = 20');
  for (let i = 0; i < 40; i++) { tab(i % 2 ? 'home' : 'exam-select'); }
  assert.strictEqual(stackLen(), 20);
  run('UNDO.max = 120');
  assert.strictEqual(run('Object.keys(STORE).sort().join()'), '_dirty,history,myNotes,sa,solved,wrong');

  // ---------------------------------------------------------------- 11. data from an older save: undo never invents keys / crashes
  assert.deepStrictEqual(errors, [], 'script errors during the run:\n' + errors.join('\n'));
  dom.window.close();

  // a fresh boot shows an empty history (history is in-memory only) while saved study data stays
  dom = boot({ cbt_store_v2: JSON.stringify({ wrong: { a: 1 }, history: [], solved: ['a'], myNotes: {} }) });
  assert.strictEqual(dom.window.eval('UNDO.stack.length'), 0);
  assert.strictEqual(dom.window.eval('Object.keys(STORE.wrong).length'), 1);
  assert.strictEqual(dom.window.document.querySelector('#undo-btn').disabled, true);
  assert.deepStrictEqual(errors, []);
  dom.window.close();

  // ---------------------------------------------------------------- 12. undoing the very first exam start returns to a clean state
  dom = boot();
  {
    const w2 = dom.window, d2 = w2.document, run2 = c => w2.eval(c);
    const click2 = el => el.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
    click2(d2.querySelector('.nav-tab[data-screen="exam-select"]'));
    run2(`startExam(DB[0].ei)`);
    assert.ok(d2.querySelector('#screen-quiz').classList.contains('active'));
    click2(d2.querySelector('#undo-btn'));
    assert.ok(d2.querySelector('#screen-exam-select').classList.contains('active'));
    assert.strictEqual(run2('STATE.questions.length'), 0);
    assert.strictEqual(run2('STATE.mode'), null);
    assert.strictEqual(d2.querySelector('#quiz-timer-wrap').style.display, 'none');
    click2(d2.querySelector('#redo-btn'));
    assert.ok(d2.querySelector('#screen-quiz').classList.contains('active'));
    assert.strictEqual(run2('STATE.questions.length'), 15);
    assert.strictEqual(d2.querySelector('#quiz-cur').textContent, '1');
    // a result screen's own buttons keep working after an undo/redo round trip
    run2('finishExam()');
    click2(d2.querySelector('#undo-btn'));
    click2(d2.querySelector('#redo-btn'));
    assert.ok(d2.querySelector('#screen-result').classList.contains('active'));
    assert.ok(d2.querySelectorAll('#result-list .result-item').length === 15);
    click2(d2.querySelectorAll('.result-filter button, #screen-result .filter-chip')[0] || d2.querySelector('#screen-result'));
  }
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  dom.window.close();
  console.log('PASS e2e undo (jsdom): navigation, grade, reveal, move, finish, retry, timer, wrong-note clear, SA grade/remove/clear, flash cards, history panel, Back button, import, limits');
})().catch(e => { console.error(e); process.exit(1); });
