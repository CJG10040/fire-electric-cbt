// 단답·서술 모드 smoke tests (run via: node smoke_test_cbt.js --sa)
const fs = require('fs');

module.exports = function ({ assert, fresh, load, HTML, legacy }) {
  const J = (x) => JSON.stringify(x);

  // ---------------------------------------------------------------- 1. bank integrity
  let app = fresh();
  assert.strictEqual(app.run('SA_BANK.occ.length'), 447);
  assert.strictEqual(app.run('SA_BANK.clusters.length'), 307);
  assert.strictEqual(app.run('SA_TOPICS.length'), 14);
  assert.strictEqual(app.run('SA_BLOCKS.length'), 17);
  assert.strictEqual(app.run('SA_BANK.occ.filter(o=>!SA_CL[o.c]||!SA_CL[o.c].m.includes(o.id)).length'), 0);
  assert.strictEqual(app.run('SA_BANK.clusters.reduce((s,c)=>s+c.m.length,0)'), 447);
  assert.strictEqual(app.run('SA_BANK.clusters.filter(c=>new Set(c.m.map(id=>saBlockKey(SA_OCC[id]))).size!==c.m.length).length'), 0, 'same exam block twice in a cluster');
  assert.strictEqual(app.run('Math.max(...SA_BANK.clusters.map(c=>c.m.length))'), 9);
  assert.strictEqual(app.run('SA_BANK.clusters.filter(c=>c.m.length>1).length'), 83);

  // ---------------------------------------------------------------- 2. hub: modes, filters, counts
  app.run('saRenderHub()');
  assert.ok(app.elements['sa-summary'].innerHTML.includes('307'), app.elements['sa-summary'].innerHTML);
  assert.ok(app.elements['sa-note'].innerHTML.includes('447문항') && app.elements['sa-note'].innerHTML.includes('307문항'));
  assert.ok(app.elements['sa-top'].innerHTML.includes('출제 9회'));
  app.run(`saSetMode('year'); saToggleBlock('2024_3')`);
  assert.strictEqual(app.run('saBuildUnits().length'), 9);
  assert.ok(app.elements['sa-summary'].innerHTML.includes('>9<'));
  app.run(`saToggleBlock('2023_0'); saToggleBlock('2021_0')`);
  const expectUnion = app.run(`new Set(SA_BANK.occ.filter(o=>['2024_3','2023_0','2021_0'].includes(saBlockKey(o))).map(o=>o.c)).size`);
  assert.strictEqual(app.run('saBuildUnits().length'), expectUnion);
  assert.ok(expectUnion < 9 + 29 + 32, 'year selection must de-duplicate repeated questions');
  // year mode keeps the occurrence from the newest selected block
  app.run(`SA_SEL.blocks = new Set(['2023_0','2018_0'])`);
  const u3 = app.run(`saBuildUnits().find(u=>u.k==='k2010_0_11')`);
  assert.strictEqual(u3.id, 'm2023_0_12');
  app.run(`saSelectAll('blocks', true)`);
  assert.strictEqual(app.run('saBuildUnits().length'), 307);
  app.run(`saSelectAll('blocks', false)`);
  assert.strictEqual(app.run('saBuildUnits().length'), 0);
  assert.strictEqual(app.run(`document.getElementById('sa-start-btn').disabled`), true);
  app.run(`saSetMode('topic'); saToggleTopic(0)`);
  assert.strictEqual(app.run('saBuildUnits().length'), app.run('SA_BANK.clusters.filter(c=>c.tp===0).length'));
  app.run(`saToggleTopic(1)`);
  assert.strictEqual(app.run('saBuildUnits().length'), app.run('SA_BANK.clusters.filter(c=>c.tp<=1).length'));
  app.run(`saSetMode('all'); saSetOpt('order','hot'); saSetOpt('limit','5')`);
  const hot = app.run('saBuildUnits().map(u=>saCount(u.k))');
  assert.deepStrictEqual(hot, [...hot].sort((a, b) => b - a));
  assert.strictEqual(hot.length, 5);
  assert.strictEqual(hot[0], 9);
  app.run(`saSetOpt('order','random'); saSetOpt('limit','0')`);
  assert.strictEqual(new Set(app.run('saBuildUnits().map(u=>u.k)')).size, 307);
  app.run(`saSetOpt('scope','wrong')`);
  assert.strictEqual(app.run('saBuildUnits().length'), 0);

  // ---------------------------------------------------------------- 3. session + isolated wrong note
  app = fresh();
  const beforeWrong = J(app.run('STORE.wrong')), beforeSolved = J(app.run('STORE.solved')), beforeHist = J(app.run('STORE.history'));
  app.run(`saSetOpt('order','exam'); saSetOpt('limit','5'); saStart()`);
  assert.strictEqual(app.run('SA_STATE.units.length'), 5);
  const ks = app.run('SA_STATE.units.map(u=>u.k)');
  app.run(`saGrade('${ks[0]}','X'); saGrade('${ks[1]}','P'); saGrade('${ks[2]}','O')`);
  assert.deepStrictEqual(app.run('STORE.sa.wrong'), { [ks[0]]: 1, [ks[1]]: 1 });
  assert.deepStrictEqual(app.run('STORE.sa.solved'), ks.slice(0, 3));
  // regrading inside one session never double-counts
  app.run(`saGrade('${ks[0]}','O')`);
  assert.ok(!(ks[0] in app.run('STORE.sa.wrong')));
  app.run(`saGrade('${ks[0]}','X')`);
  assert.strictEqual(app.run(`STORE.sa.wrong['${ks[0]}']`), 1);
  // a question already wrong 3 times becomes 4 (once per session), correct removes it
  app.run(`STORE.sa.wrong['${ks[3]}']=3; saMove(3); saGrade('${ks[3]}','X'); saGrade('${ks[3]}','P')`);
  assert.strictEqual(app.run(`STORE.sa.wrong['${ks[3]}']`), 4);
  app.run(`saGrade('${ks[3]}','O')`);
  assert.ok(!(ks[3] in app.run('STORE.sa.wrong')));
  app.run(`saGrade('${ks[3]}','X')`);
  assert.strictEqual(app.run(`STORE.sa.wrong['${ks[3]}']`), 4);
  // old store untouched
  assert.strictEqual(J(app.run('STORE.wrong')), beforeWrong);
  assert.strictEqual(J(app.run('STORE.solved')), beforeSolved);
  assert.strictEqual(J(app.run('STORE.history')), beforeHist);
  app.run('saFinish()');
  assert.strictEqual(app.run('STORE.sa.history.length'), 1);
  const h = app.run('STORE.sa.history[0]');
  assert.strictEqual(h.total, 5); assert.strictEqual(h.correct, 1); assert.strictEqual(h.partial, 1); assert.strictEqual(h.wrong, 2); assert.strictEqual(h.unanswered, 1);
  assert.strictEqual(h.pct, 20);
  assert.strictEqual(J(app.run('STORE.history')), beforeHist, 'SA history must not leak into exam history');
  // persistence layers are separate
  const lsSA = JSON.parse(app.lsData['cbt_sa_v1']);
  assert.deepStrictEqual(lsSA.wrong, app.run('STORE.sa.wrong'));
  const lsOld = JSON.parse(app.lsData['cbt_store_v2'] || '{}');
  assert.ok(!('sa' in lsOld), 'old localStorage record must not contain sa');
  // existing exam flow does not touch sa
  const saSnap = J(app.run('STORE.sa'));
  app.run(`startExam('2016_1')`);
  const q0 = app.run('STATE.questions[0].id');
  app.run(`gradeQ('${q0}','X'); finishExam()`);
  assert.strictEqual(app.run(`STORE.wrong['${q0}']`), 1);
  assert.strictEqual(J(app.run('STORE.sa')), saSnap, 'exam grading must not change sa');

  // retry-wrong and same-set retry
  app.run(`showScreen('sa'); saSetMode('all')`);
  app.run(`SA_STATE = null; SA_LAST = null`);
  app.run(`saSetOpt('limit','5'); saSetOpt('order','exam'); saStart()`);
  app.run(`saGrade('${ks[0]}','X'); saGrade('${ks[1]}','O'); saGrade('${ks[4]}','P'); saFinish()`);
  app.run('saRetryWrong()');
  assert.deepStrictEqual(app.run('SA_STATE.units.map(u=>u.k)').sort(), [ks[0], ks[4]].sort());
  app.run('saRetrySame()');
  assert.strictEqual(app.run('SA_STATE.units.length'), 2);

  // ---------------------------------------------------------------- 4. wrong-note screen
  app.run('saRenderWrong()');
  const wl = app.elements['sa-wn-list'].innerHTML;
  const wrongKeys = Object.keys(app.run('STORE.sa.wrong'));
  assert.ok(wrongKeys.length >= 3);
  assert.strictEqual((wl.match(/<details class="sa-wn-item"/g) || []).length, wrongKeys.length);
  assert.ok(wl.includes('오답 ') && wl.includes('외웠어요'));
  assert.ok(app.elements['sa-wn-stats'].innerHTML.includes(String(wrongKeys.length)));
  const topic0 = app.run(`SA_CL['${wrongKeys[0]}'].tp`);
  app.run(`saWnTopic(${topic0})`);
  const filtered = app.run(`saWrongKeys().filter(k=>SA_CL[k].tp===${topic0}).length`);
  assert.strictEqual((app.elements['sa-wn-list'].innerHTML.match(/<details class="sa-wn-item"/g) || []).length, filtered);
  app.run('saStartWrong()');
  assert.strictEqual(app.run('SA_STATE.units.length'), filtered);
  app.run(`saWnTopic(-1)`);
  app.run(`saRemoveWrong('${wrongKeys[0]}')`);
  assert.ok(!(wrongKeys[0] in app.run('STORE.sa.wrong')));
  const oldWrongBefore = J(app.run('STORE.wrong'));
  app.run('saClearWrong()');
  assert.deepStrictEqual(app.run('STORE.sa.wrong'), {});
  assert.strictEqual(J(app.run('STORE.wrong')), oldWrongBefore, 'clearing SA wrong note must not clear the old one');
  app.run('saRenderWrong()');
  assert.ok(app.elements['sa-wn-list'].innerHTML.includes('오답이 없어요'));

  // ---------------------------------------------------------------- 5. rendering sweep (every cluster / every occurrence)
  app = fresh();
  const bad = /undefined|NaN|\[object|null</;
  const total = app.run('SA_BANK.occ.length');
  for (let i = 0; i < total; i++) {
    const out = app.run(`(function(){
      const o = SA_BANK.occ[${i}];
      saLaunch('t', [{k:o.c,id:o.id}], 'year');
      const q = document.getElementById('sa-quiz-body').innerHTML;
      const a = saAnswerHtml({k:o.c,id:o.id});
      return {q, a, c:o.c, id:o.id};
    })()`);
    assert.ok(!bad.test(out.q), 'bad token in question view ' + out.id + ': ' + (out.q.match(bad) || [])[0]);
    assert.ok(!bad.test(out.a), 'bad token in answer view ' + out.id);
    const opens = (out.a.match(/<details/g) || []).length, closes = (out.a.match(/<\/details>/g) || []).length;
    assert.strictEqual(opens, closes);
    assert.strictEqual((out.a.match(/sa-hist-row/g) || []).length, app.run(`SA_CL['${out.c}'].m.length`));
    assert.ok(out.q.includes('출제 연도'));
    assert.ok(out.q.includes('📅 출제 '));
  }
  // specific content checks
  const rep9 = app.run(`(function(){saLaunch('t',[{k:'k2010_0_11',id:'m2024_3_07'}],'all'); return document.getElementById('sa-quiz-body').innerHTML;})()`);
  assert.ok(rep9.includes('출제 9회') && rep9.includes('sa-repeat hot') && rep9.includes('2024-3') && rep9.includes('2010'));
  assert.ok(rep9.includes('2가지 택일') || rep9.includes('2가지'));
  const ans9 = app.run(`saAnswerHtml({k:'k2010_0_11',id:'m2024_3_07'})`);
  assert.ok(ans9.includes('https://youtu.be/') && ans9.includes('?t='), 'video deep links');
  assert.ok(ans9.includes('2가지'), 'pick notice');
  const yearQ = app.run(`(function(){saLaunch('t',[{k:'k2010_0_11',id:'m2018_0_01'}],'year'); return document.getElementById('sa-quiz-body').innerHTML;})()`);
  assert.ok(yearQ.includes('2018년 · 1번'));
  const noteAns = app.run(`saAnswerHtml({k:'k2013_0_16',id:'m2024_1_10'})`);
  assert.ok(noteAns.includes('절연저항시험') && noteAns.includes('sa-note-box'));
  const diffAns = app.run(`saAnswerHtml({k:'k2012_0_31',id:'m2024_3_09'})`);
  assert.ok(diffAns.includes('sa-hist-row'));
  // titles that leak the answer are hidden in the quiz view but kept for lists
  const leak = app.run(`(function(){saLaunch('t',[{k:SA_OCC['m2024_2_11'].c,id:'m2024_2_11'}],'year'); return document.getElementById('sa-quiz-body').innerHTML;})()`);
  assert.ok(!leak.includes('sa-title'), 'answer-revealing title must be hidden');
  assert.ok(app.run(`SA_OCC['m2024_2_11'].t`).includes('광전식 분리형 감지기'));
  assert.ok(rep9.includes('sa-title'));
  // answer toggle (uses the reveal element) + study mode
  app.run(`document.getElementById('sa-reveal')._q = { innerHTML: '' }`);
  app.run(`saLaunch('t',[{k:'k2012_0_33',id:'m2022_0_12'}],'all')`);
  app.run(`saToggleAnswer('k2012_0_33')`);
  assert.strictEqual(app.run(`SA_STATE.shown['k2012_0_33']`), true);
  assert.ok(app.elements['sa-reveal-body'].innerHTML.includes('7개 이하'));
  app.run(`saToggleStudy()`);
  assert.strictEqual(app.run('SA_STATE.study'), true);
  // result list render
  app.run(`saLaunch('t',[{k:'k2012_0_33',id:'m2022_0_12'},{k:'k2010_0_05',id:'m2021_0_02'}],'all'); saGrade('k2012_0_33','O'); saFinish()`);
  assert.strictEqual(app.run('STORE.sa.history[0].unanswered'), 1);
  assert.ok(app.elements['sa-res-list'].innerHTML.includes('sa-res-item'));
  app.run(`saRenderResult('U')`);
  assert.strictEqual((app.elements['sa-res-list'].innerHTML.match(/<details class="sa-res-item/g) || []).length, 1);

  // ---------------------------------------------------------------- 6. storage load / export / import compatibility
  // 6a. corrupt SA localStorage falls back to defaults; broken field types are normalised
  app = fresh({ cbt_sa_v1: '{not json' });
  assert.deepStrictEqual(app.run('STORE.sa'), { wrong: {}, solved: [], history: [] });
  app = fresh({ cbt_sa_v1: JSON.stringify({ wrong: [1, 2], solved: 'x', history: null }) });
  assert.deepStrictEqual(app.run('STORE.sa'), { wrong: {}, solved: [], history: [] });
  app = fresh({ cbt_sa_v1: JSON.stringify({ wrong: { k2010_0_11: 2 }, solved: ['k2010_0_11'], history: [] }), cbt_store_v2: JSON.stringify(legacy) });
  assert.strictEqual(app.run('STORE.sa.wrong.k2010_0_11'), 2);
  assert.strictEqual(Object.keys(app.run('STORE.wrong')).length, Object.keys(legacy.wrong).length);
  // 6b. export contains sa + all legacy keys
  app.run('saveDataFile()');
  const exported = JSON.parse(app.captured.blob.parts[0]);
  assert.strictEqual(exported._version, 3);
  assert.deepStrictEqual(exported.sa, { wrong: { k2010_0_11: 2 }, solved: ['k2010_0_11'], history: [] });
  for (const key of ['wrong', 'history', 'solved', 'myNotes']) assert.ok(key in exported, 'missing legacy key ' + key);
  assert.strictEqual(Object.keys(exported.wrong).length, Object.keys(legacy.wrong).length);
  // 6c. import: legacy file (no sa) in REPLACE mode keeps sa untouched
  const file = (obj) => ({ text: JSON.stringify(obj) });
  const mk = (confirmAnswer) => {
    const a = load(HTML, { confirm: () => confirmAnswer, localStorage: { cbt_sa_v1: JSON.stringify({ wrong: { k2010_0_11: 2 }, solved: ['k2010_0_11'], history: [] }), cbt_store_v2: JSON.stringify({ wrong: { '2016_1_01': 1 }, solved: ['2016_1_01'], history: [], myNotes: {} }) } });
    return a;
  };
  let a1 = mk(false); // cancel => replace
  a1.run(`onDataFileSelected({target:{files:[${J(file(legacy))}], value:'x'}})`);
  assert.strictEqual(a1.run('STORE.sa.wrong.k2010_0_11'), 2, 'legacy file must not wipe sa');
  assert.deepStrictEqual(a1.run('STORE.solved').length, legacy.solved.length);
  assert.strictEqual(Object.keys(a1.run('STORE.wrong')).length, Object.keys(legacy.wrong).length);
  // 6d. file with sa in replace mode replaces sa
  let a2 = mk(false);
  a2.run(`onDataFileSelected({target:{files:[${J(file({ _version: 3, wrong: {}, solved: [], history: [], myNotes: {}, sa: { wrong: { k2011_0_23: 5 }, solved: ['k2011_0_23'], history: [] } }))}], value:'x'}})`);
  assert.deepStrictEqual(a2.run('STORE.sa.wrong'), { k2011_0_23: 5 });
  assert.deepStrictEqual(JSON.parse(a2.lsData['cbt_sa_v1']).wrong, { k2011_0_23: 5 });
  // 6e. merge mode sums both stores independently
  let a3 = mk(true);
  a3.run(`onDataFileSelected({target:{files:[${J(file({ _version: 3, wrong: { '2016_1_01': 2, '2016_1_02': 1 }, solved: ['2016_1_02'], history: [], myNotes: {}, sa: { wrong: { k2010_0_11: 1, k2011_0_23: 4 }, solved: ['k2011_0_23'], history: [{ label: 'x', pct: 50, total: 2, date: '1/1' }] } }))}], value:'x'}})`);
  assert.deepStrictEqual(a3.run('STORE.wrong'), { '2016_1_01': 3, '2016_1_02': 1 });
  assert.deepStrictEqual(a3.run('STORE.sa.wrong'), { k2010_0_11: 3, k2011_0_23: 4 });
  assert.deepStrictEqual(a3.run('STORE.sa.solved').sort(), ['k2010_0_11', 'k2011_0_23']);
  assert.strictEqual(a3.run('STORE.sa.history.length'), 1);
  // 6f. malformed sa in an imported file is normalised, not fatal
  let a4 = mk(false);
  a4.run(`onDataFileSelected({target:{files:[${J(file({ _version: 3, wrong: {}, solved: [], history: [], sa: { wrong: 'oops' } }))}], value:'x'}})`);
  assert.deepStrictEqual(a4.run('STORE.sa'), { wrong: {}, solved: [], history: [] });
  // 6g. sync badge mentions SA only when there is SA data
  let a5 = fresh();
  a5.run('updateSyncBadge()');
  assert.ok(!a5.elements['sync-badge'].textContent.includes('단답'));
  a5.run(`STORE.sa.wrong['k2010_0_11']=1; updateSyncBadge()`);
  assert.ok(a5.elements['sync-badge'].textContent.includes('단답 오답 1'));

  // ---------------------------------------------------------------- 7. 🧠 암기노트 (암기법 카드 · 비교 세트 · 카드 훈련)
  app = fresh();
  assert.strictEqual(app.run('SA_MEMO.compares.length'), 14);
  assert.ok(app.run('SA_MEMO.cards.length') >= 100);
  // every cluster has exactly one mnemonic card, all references resolve
  assert.strictEqual(app.run('SA_BANK.clusters.filter(c=>SA_CARD_BY_K[c.k]===undefined).length'), 0);
  assert.strictEqual(app.run('SA_MEMO.cards.reduce((s,c)=>s+c.ks.length,0)'), 307);
  assert.strictEqual(app.run('SA_MEMO.cards.filter(c=>c.ks.some(k=>!SA_CL[k])).length'), 0);
  assert.strictEqual(app.run('SA_MEMO.compares.filter(s=>s.r.some(r=>r.ks.some(k=>!SA_CL[k]))).length'), 0);
  assert.ok(app.run('SA_MEMO.compares.every(s=>s.r.length>=5)'));
  const badMemo = /undefined|NaN|\[object|null</;
  for (const k of app.run('SA_BANK.clusters.map(c=>c.k)')) {
    const box = app.run(`saMemoBox('${k}')`);
    assert.ok(box.includes('sa-memo-box') && box.includes('🧠 암기법') && !badMemo.test(box), 'memo box for ' + k);
  }
  const boxWires = app.run(`saMemoBox('k2010_0_11')`);
  assert.ok(boxWires.includes('자·비·정·수·소') && boxWires.includes("saMemoGoCompare('wires')"));
  // the memo box is part of the revealed answer, results and wrong note
  assert.ok(app.run(`saAnswerHtml({k:'k2012_0_31',id:'m2024_3_09'})`).includes('sa-memo-hook'));
  app.run(`saLaunch('t',[{k:'k2012_0_31',id:'m2024_3_09'}],'all'); saGrade('k2012_0_31','X')`);
  app.run('saRenderWrong()');
  assert.ok(app.elements['sa-wn-list'].innerHTML.includes('sa-memo-box'));
  app.run(`saFinish()`);
  assert.ok(app.elements['sa-res-list'].innerHTML.includes('sa-memo-box'));

  // compare tab
  app.run('saRenderMemo()');
  let mb = app.elements['sa-memo-body'].innerHTML;
  assert.strictEqual((mb.match(/<details class="sa-cmp"/g) || []).length, 14);
  assert.ok(mb.includes('설치 높이 한 장'));
  assert.ok(!badMemo.test(mb));
  assert.strictEqual((mb.match(/<details/g) || []).length, (mb.match(/<\/details>/g) || []).length);
  assert.ok(app.elements['sa-memo-seg'].innerHTML.includes('헷갈리는 숫자 비교'));
  app.run(`saMemoGoCompare('time')`);
  assert.ok(app.elements['sa-memo-body'].innerHTML.includes('id="sa-cmp-time" open'));

  // cards tab: filters, search, sort
  app.run(`saMemoTab('cards')`);
  const nAll = (app.elements['sa-memo-list'].innerHTML.match(/class="sa-memo-card"/g) || []).length;
  assert.strictEqual(nAll, app.run('SA_MEMO.cards.length'));
  assert.ok(!badMemo.test(app.elements['sa-memo-list'].innerHTML));
  const lst = app.elements['sa-memo-list'].innerHTML;
  assert.strictEqual((lst.match(/<details/g) || []).length, (lst.match(/<\/details>/g) || []).length);
  app.run(`saMemoTopic(3)`);
  const nTopic = (app.elements['sa-memo-list'].innerHTML.match(/class="sa-memo-card"/g) || []).length;
  assert.strictEqual(nTopic, app.run('SA_MEMO.cards.filter(c=>SA_CL[c.ks[0]].tp===3).length'));
  assert.ok(nTopic > 0 && nTopic < nAll);
  app.run(`saMemoTopic(-1); saMemoSearch('종단저항')`);
  const nSearch = (app.elements['sa-memo-list'].innerHTML.match(/class="sa-memo-card"/g) || []).length;
  assert.ok(nSearch >= 1 && nSearch < nAll);
  app.run(`saMemoSearch('zzzz-없는말')`);
  assert.ok(app.elements['sa-memo-list'].innerHTML.includes('조건에 맞는 카드가 없어요'));
  app.run(`saMemoSearch(''); saMemoSort('topic')`);
  assert.strictEqual((app.elements['sa-memo-list'].innerHTML.match(/class="sa-memo-card"/g) || []).length, nAll);
  const hotOrder = app.run(`(function(){SA_MEMO_UI.sort='hot'; return saMemoFiltered().map(x=>saCardWeight(x.c));})()`);
  assert.deepStrictEqual(hotOrder, [...hotOrder].sort((a, b) => b - a));

  // practice buttons start a normal SA session (graded into the same separate wrong note)
  app.run(`saMemoPractice('k2012_0_31')`);
  assert.strictEqual(app.run('SA_STATE.units.length'), 1);
  assert.strictEqual(app.run('SA_STATE.units[0].k'), 'k2012_0_31');
  const shared = app.run(`SA_MEMO.cards.findIndex(c=>c.ks.length>5)`);
  assert.ok(shared >= 0);
  app.run(`saMemoPracticeCard(${shared})`);
  assert.strictEqual(app.run('SA_STATE.units.length'), app.run(`SA_MEMO.cards[${shared}].ks.length`));

  // flash-card training
  app.run(`SA_MEMO_UI.tab='flash'; SA_FLASH=null; saRenderMemo()`);
  assert.ok(app.elements['sa-memo-body'].innerHTML.includes('훈련 시작') && app.elements['sa-flash-sum'].innerHTML.includes('307'));
  app.run('saFlashStart()');
  assert.strictEqual(app.run('SA_FLASH.deck.length'), 307);
  assert.strictEqual(new Set(app.run('SA_FLASH.deck')).size, 307);
  let fb = app.elements['sa-memo-body'].innerHTML;
  assert.ok(fb.includes('힌트(암기법)') && !fb.includes('sa-memo-hook'), 'stage 0 hides the hint');
  app.run('saFlashStage(1)');
  fb = app.elements['sa-memo-body'].innerHTML;
  assert.ok(fb.includes('sa-memo-hook') && !fb.includes('알겠어요'), 'stage 1 shows only the hint');
  app.run('saFlashStage(2)');
  fb = app.elements['sa-memo-body'].innerHTML;
  assert.ok(fb.includes('sa-memo-box') && fb.includes('알겠어요') && fb.includes('헷갈려요'));
  const k0 = app.run('SA_FLASH.deck[0]');
  const oldWrong = J(app.run('STORE.wrong'));
  app.run(`STORE.sa.wrong = {}; saFlashNext(false)`);
  assert.strictEqual(app.run(`STORE.sa.wrong['${k0}']`), 1);
  assert.strictEqual(J(app.run('STORE.wrong')), oldWrong);
  assert.deepStrictEqual(JSON.parse(app.lsData['cbt_sa_v1']).wrong, { [k0]: 1 });
  app.run('saFlashStage(2); saFlashNext(true)');
  assert.strictEqual(app.run('SA_FLASH.known'), 1);
  assert.strictEqual(app.run('SA_FLASH.i'), 2);
  for (let i = 0; i < 305; i++) app.run('saFlashNext(true)');
  assert.ok(app.elements['sa-memo-body'].innerHTML.includes('다시 고르기'));
  assert.strictEqual(app.run('SA_FLASH.flagged.size'), 1);
  app.run('saFlashReset()');
  assert.strictEqual(app.run('SA_FLASH'), null);
  app.run(`saFlashTopic(2)`);
  assert.ok(app.elements['sa-memo-body'].innerHTML.includes('훈련 시작'));
};
