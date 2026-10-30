const assert=require('node:assert/strict'),fs=require('fs');
const {JSDOM,VirtualConsole}=require('./_jsdom/node_modules/jsdom');
const html=fs.readFileSync('cbt_v2/cbt.html','utf8');
const server={version:0,data:null,tokens:new Set(),calls:0,offline:false,onPut:null};
const doms=[];const errors=[];
function boot(ls={}){
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(String(e)));
 const dom=new JSDOM(html,{url:'https://cjg10040.github.io/fire-electric-cbt/cbt_v2/cbt.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  for(const [k,v] of Object.entries(ls))w.localStorage.setItem(k,v);
  w.scrollTo=()=>{};w.confirm=()=>true;w.alert=()=>{};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
  w.fetch=async(url,o)=>{server.calls++;if(server.offline)throw new Error('offline');const method=o.method||'GET',path=new URL(url).pathname,b=o.body?JSON.parse(o.body):null,t=(o.headers.Authorization||'').replace('Bearer ','');let status=200,data={};
   if(path==='/login'){if(b.pin!=='012345'){status=401;}else{const token=String.fromCharCode(65+server.tokens.size).repeat(43);server.tokens.add(token);data={username:b.username,token,expiresAt:Math.floor(Date.now()/1000)+86400};}}
   else if(!server.tokens.has(t))status=401;
   else if(path==='/logout'){server.tokens.delete(t);data={ok:true};}
   else if(method==='GET')data={version:server.version,data:server.data};
   else if(b.baseVersion!==server.version)status=409;
   else {server.data=JSON.parse(JSON.stringify(b.data));server.version++;if(server.onPut){const fn=server.onPut;server.onPut=null;fn();}data={version:server.version};}
   return {ok:status<300,status,json:async()=>w.JSON.parse(JSON.stringify(data))};
  };
 }});doms.push(dom);return dom;
}
const ev=(d,s)=>d.window.eval(s);
function stop(d){ev(d,'clearTimeout(CLOUD.timer)');}
async function login(d){const w=d.window;w.document.getElementById('cloud-user').value='tester';w.document.getElementById('cloud-pin').value='012345';w.document.getElementById('cloud-remember').checked=true;await w.cloudLogin();stop(d);}
function saved(d){return Object.fromEntries(Object.entries(d.window.localStorage));}
(async()=>{
 const a=boot({'cbt_store_v2':JSON.stringify({wrong:{legacy:2},solved:['legacy'],history:[],myNotes:{legacy:'keep'}})});
 assert.equal(server.calls,0,'no network before opt-in');assert.ok(a.window.document.getElementById('cloud-launch'));
 await login(a);assert.equal(server.data,null);assert.equal(ev(a,'STORE.wrong.legacy'),2);assert.equal(ev(a,'CLOUD.paused'),true,'initial local progress requires choice');
 await a.window.cloudChoose('local');stop(a);assert.equal(server.version,1);assert.equal(server.data.wrong.legacy,2);
 const b=boot();await login(b);assert.equal(ev(b,'STORE.wrong.legacy'),2,'new device pulls cloud');assert.equal(ev(b,'UNDO.stack.length'),0);
 ev(a,"addWrong('qa')");await a.window.cloudSync();stop(a);assert.equal(server.version,2);
 ev(b,"addWrong('qb')");await b.window.cloudSync();stop(b);assert.equal(ev(b,'CLOUD.paused'),true);assert.equal(ev(b,'STORE.wrong.qb'),1);assert.equal(server.data.wrong.qb,undefined,'conflict does not overwrite');
 await b.window.cloudChoose('remote');stop(b);assert.equal(ev(b,'STORE.wrong.qb'),undefined);assert.ok(JSON.parse(b.window.localStorage.getItem('cbt_cloud_backup_v1'))[0].local.wrong.qb);
 await b.window.cloudRestoreBackup();stop(b);assert.equal(ev(b,'STORE.wrong.qb'),1);assert.equal(ev(b,'CLOUD.paused'),true,'restoring backup must not auto overwrite cloud');
 server.offline=true;ev(a,"addWrong('offline')");await a.window.cloudSync();stop(a);assert.equal(ev(a,'STORE.wrong.offline'),1);assert.equal(server.data.wrong.offline,undefined);
 const snapshot=saved(a);a.window.close();server.offline=false;const reload=boot(snapshot);stop(reload);await reload.window.cloudSync();stop(reload);assert.equal(server.data.wrong.offline,1,'offline change survives reload and uploads');
 ev(reload,"addWrong('before')");server.onPut=()=>ev(reload,"addWrong('during')");await reload.window.cloudSync();stop(reload);assert.equal(ev(reload,'CLOUD.meta.pending'),true);assert.equal(server.data.wrong.during,undefined);await reload.window.cloudSync();stop(reload);assert.equal(server.data.wrong.during,1);
 let exported='';reload.window.Blob=class{constructor(parts){exported=parts.join('');}};reload.window.cloudDownloadBackup();const payload=JSON.parse(exported);assert.equal(payload._version,3);assert.equal(payload.sa.history.length,0);assert.equal('token' in payload,false);assert.equal(exported.includes(ev(reload,'CLOUD.auth.token')),false);assert.equal('CLOUD' in payload,false);
 const oldToken=ev(reload,'CLOUD.auth.token');server.tokens.delete(oldToken);await reload.window.cloudSync();stop(reload);assert.equal(ev(reload,'CLOUD.auth'),null);assert.equal(ev(reload,'CLOUD.busy'),false);assert.equal(ev(reload,'STORE.wrong.offline'),1);
 await login(reload);await reload.window.cloudLogout();assert.equal(ev(reload,'CLOUD.auth'),null);assert.equal(ev(reload,'STORE.wrong.offline'),1);
 assert.deepEqual(errors,[]);console.log('PASS cloud DOM: opt-in/no initial network; PIN; initial choice; 2 clients; conflict; backups; offline+reload; changes during save; session expiry; logout; export excludes tokens');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const d of doms)d.window.close();});
