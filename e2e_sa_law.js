// jsdom regression for additive current-law notes. No remote network required.
const assert = require('assert');
const fs = require('fs');
const {JSDOM, VirtualConsole} = require('./_jsdom/node_modules/jsdom');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e=>errors.push(String(e.stack || e)));
const html = fs.readFileSync('cbt_v2/cbt.html','utf8');
const dom = new JSDOM(html,{url:'https://local.invalid/cbt.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){w.confirm=()=>true;w.alert=()=>{};w.scrollTo=()=>{};}});
const w=dom.window,d=w.document,run=x=>w.eval(x),$=s=>d.querySelector(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  await sleep(150);
  assert.deepStrictEqual(errors,[]);
  const origStore=run('JSON.stringify({wrong:STORE.wrong,solved:STORE.solved,history:STORE.history})');
  run("showScreen('sa')");
  assert.ok($('#sa-law-summary').textContent.includes('법령 대조'));
  const n=run('SA_BANK.clusters.filter(c=>saLawNeedsUpdate(c.k)).length');
  assert.strictEqual(n,54);
  run("saLawStart('updated')");
  assert.strictEqual(run('SA_STATE.units.length'),n);
  assert.strictEqual(run('SA_STATE.study'),false);
  assert.strictEqual($('#sa-reveal-body').innerHTML,'','notes must not be put into an unrevealed answer');
  const k=run('SA_STATE.units[0].k');
  run(`saToggleAnswer('${k}')`);
  assert.ok($('#sa-reveal-body .sa-law-box'));
  assert.ok($('#sa-reveal-body .sa-original-label').textContent.includes('원문 보존'));
  assert.ok($('#sa-reveal-body').innerHTML.includes(run(`saRep('${k}').ah`)));
  run('undoDo()');
  assert.strictEqual(run(`!!SA_STATE.shown['${k}']`),false);
  assert.ok(!$('#sa-reveal').classList.contains('show'));
  run('redoDo()');
  assert.ok($('#sa-reveal').classList.contains('show'));
  run(`saGrade('${k}','X')`);
  assert.strictEqual(run(`STORE.sa.wrong['${k}']`),1);
  run('saFinish()');
  assert.ok($('#sa-res-list .sa-law-box'));
  run("showScreen('sa-wrong')");
  assert.ok($('#sa-wn-list .sa-law-box'));
  assert.strictEqual(run('JSON.stringify({wrong:STORE.wrong,solved:STORE.solved,history:STORE.history})'),origStore,'image-CBT progress untouched');

  // All 447 occurrences retain their own original answer and get their cluster's status.
  const all=run("SA_BANK.occ.map(o=>{const c=SA_BANK.clusters.find(c=>c.m.includes(o.id));return {id:o.id,k:c.k};})");
  for(const u of all){
    const s=run(`saAnswerHtml(${JSON.stringify(u)})`);
    assert.ok(s.includes(run(`SA_OCC['${u.id}'].ah`)),u.id);
    assert.ok(s.includes('현행 기준 대조'),u.id);
  }
  // Exact critical corrections, not guessed amendments.
  assert.ok(run("saLawBox('k2010_0_10')").includes('백색 = 80℃ 미만'));
  assert.ok(run("saLawBox('k2021_0_12')").includes('1,440V'));
  assert.ok(run("saLawBox('k2019_0_01')").includes('확인 보류'));
  assert.ok(run("saLawBox('k2013_0_01')").includes('높이표 확인'));
  assert.ok(run("saLawBox('k2013_0_20')").includes('5%/m 미만'));
  assert.ok(run("saLawBox('k2022_0_22')").includes('제1호부터 제5호까지 외의 건축물'));
  assert.ok(run("saLawBox('k2023_0_14')").includes('시각경보장치'));
  assert.ok(run("saLawBox('k2020_0_07')").includes('25mm 이상'));
  assert.strictEqual(run("SA_LAW.counts.pending"),14);

  // A changed-answer flash card must not rehearse the old mnemonic in hint stage.
  run("showScreen('sa-memo');SA_MEMO_UI.tab='flash';SA_FLASH={deck:['k2010_0_10'],i:0,stage:0,known:0,flagged:new Set()};saRenderMemo()");
  assert.ok(!$('#sa-memo-body .sa-law-box'));
  run('saFlashStage(1)');
  assert.ok(!$('#sa-memo-body .sa-law-box'));
  assert.ok($('#sa-memo-body').textContent.includes('현행 보충이 있는 암기법'));
  run('saFlashStage(2)');
  assert.ok($('#sa-memo-body .sa-law-box').textContent.includes('백색 = 80℃ 미만'));
  assert.ok($('#sa-memo-body .sa-law-memo-alert'));
  run('undoDo()');
  assert.ok(!$('#sa-memo-body .sa-law-box'));
  run("SA_FLASH=null;SA_MEMO_UI.tab='cards';saRenderMemo()");
  assert.ok($('#sa-memo-list .sa-law-related'));
  assert.ok($('#sa-memo-list .sa-memo-rel .sa-law-box'));
  run("saMemoTab('cmp')");
  assert.ok($('#sa-memo-body .sa-law-related'));
  // No localStorage migration or new law state; undo/redo continue through existing wrappers.
  assert.strictEqual(run('JSON.stringify({wrong:STORE.wrong,solved:STORE.solved,history:STORE.history})'),origStore);
  assert.deepStrictEqual(errors,[],'runtime errors: '+errors.join('\n'));
  console.log(`PASS SA law e2e: ${n} update questions; 447 original variants; reveal/undo/redo/result/wrong/flash/memo/compare; original progress isolated`);
  dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
