// Offline official-table regression; does not access the network.
const assert=require('assert'), fs=require('fs');
const {JSDOM,VirtualConsole}=require('./_jsdom/node_modules/jsdom');
const errors=[], vc=new VirtualConsole(); vc.on('jsdomError',e=>errors.push(String(e)));
const dom=new JSDOM(fs.readFileSync('cbt_v2/cbt.html','utf8'),{url:'https://local.invalid/cbt.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.alert=()=>{};w.confirm=()=>true;w.scrollTo=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
}});
const w=dom.window,d=w.document,run=s=>w.eval(s),$=s=>d.querySelector(s);
try {
 const before=run('JSON.stringify({wrong:STORE.wrong,solved:STORE.solved,history:STORE.history})');
 for(const k of ['k2013_0_01','k2013_0_20','k2019_0_24']) {
  run(`saMemoPractice('${k}')`);
  assert.ok(!$('#sa-reveal-body .sa-law-table'),'unrevealed answer must not contain a table');
  run(`saToggleAnswer('${k}')`);
  assert.ok($('#sa-reveal-body .sa-law-table'));
  assert.ok($('#sa-reveal-body .sa-law-table img').src.startsWith('data:image/gif;base64,'));
  assert.ok($('#sa-reveal-body .sa-law-table').textContent.includes('출제 당시 판본을 뜻하지 않습니다'));
  assert.ok($('#sa-reveal-body .sa-law-table-hint').textContent.includes('읽을 곳:') || k==='k2019_0_24');
  $('#sa-reveal-body .sa-law-table-image').click();
  assert.ok($('#sa-law-table-viewer').open);
  run('saLawTableZoom(25)');assert.strictEqual($('#sa-law-table-viewer img').style.width,'125%');
  run('saLawTableZoom(999)');assert.strictEqual($('#sa-law-table-viewer img').style.width,'300%');
  run('saLawTableZoom(-999)');assert.strictEqual($('#sa-law-table-viewer img').style.width,'50%');
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.ok(!$('#sa-law-table-viewer').open);
  run('undoDo()');assert.ok(!$('#sa-reveal').classList.contains('show'));
  run('redoDo()');assert.ok($('#sa-reveal').classList.contains('show'));
 }
 run("saGrade('k2019_0_24','X');saFinish()");
 assert.ok($('#sa-res-list .sa-law-table'));
 run("showScreen('sa-wrong')");assert.ok($('#sa-wn-list .sa-law-table'));
 assert.strictEqual(run('JSON.stringify({wrong:STORE.wrong,solved:STORE.solved,history:STORE.history})'),before);
 assert.deepStrictEqual(errors,[]);
 console.log('PASS official tables: 3 clusters; embedded offline GIF; hidden answer; source/version/hints; enlarge/zoom/Escape; undo/redo; result/wrong notes; original progress isolated');
} catch(e){console.error(e);process.exitCode=1;} finally {dom.window.close();}
