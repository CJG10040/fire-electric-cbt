// Optional cloud sync. No credentials in STORE, exports, question data or this source.
const CLOUD_API='https://cbt-progress-api.cbt-study-51195438.workers.dev';
const CLOUD={auth:null,meta:null,busy:false,paused:false,conflict:null,applying:false,epoch:0,timer:null,poll:null,retry:15000,status:'로그인하지 않음'};
const CLOUD_KEYS={auth:'cbt_cloud_auth_v1',meta:'cbt_cloud_meta_v1',backup:'cbt_cloud_backup_v1'};
const cloudOriginalFileSave=saveDataFile;
function cloudSnapshot(){return JSON.parse(JSON.stringify({_version:3,wrong:STORE.wrong,solved:STORE.solved,history:STORE.history,myNotes:STORE.myNotes,sa:STORE.sa}));}
function cloudText(){return JSON.stringify(cloudSnapshot());}
function cloudHasData(d){return !!(Object.keys(d.wrong).length||d.solved.length||d.history.length||Object.keys(d.myNotes).length||Object.keys(d.sa.wrong).length||d.sa.solved.length||d.sa.history.length);}
function cloudValid(d){
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
  if(!obj(d)||d._version!==3||!obj(d.wrong)||!obj(d.myNotes)||!Array.isArray(d.solved)||!Array.isArray(d.history)||!obj(d.sa)||!obj(d.sa.wrong)||!Array.isArray(d.sa.solved)||!Array.isArray(d.sa.history))return false;
  let n=0;function walk(x,depth){if(++n>100000||depth>20)return false;if(x&&typeof x==='object')for(const k of Object.keys(x)){if(['__proto__','constructor','prototype'].includes(k)||!walk(x[k],depth+1))return false;}return true;}
  return walk(d,0)&&Object.values(d.myNotes).every(v=>typeof v==='string');
}
function cloudSetStatus(s){CLOUD.status=s;const b=document.getElementById('cloud-launch');if(b){b.textContent=CLOUD.auth?'☁️ '+(CLOUD.conflict?'충돌 확인':CLOUD.busy?'저장 중':'동기화'):'☁️ 로그인';b.title=s;}const e=document.getElementById('cloud-status');if(e)e.textContent=s;cloudRender();}
function cloudSaveMeta(){if(CLOUD.meta)localStorage.setItem(CLOUD_KEYS.meta,JSON.stringify(CLOUD.meta));}
function cloudMeta(){if(!CLOUD.meta||CLOUD.meta.username!==CLOUD.auth?.username)CLOUD.meta={username:CLOUD.auth?.username,base:null,baseline:null,pending:true};return CLOUD.meta;}
function cloudBackup(remote){
  const records=JSON.parse(localStorage.getItem(CLOUD_KEYS.backup)||'[]');
  records.unshift({at:new Date().toISOString(),username:CLOUD.auth?.username,local:cloudSnapshot(),remote:remote||null});
  localStorage.setItem(CLOUD_KEYS.backup,JSON.stringify(records.slice(0,2)));
}
function cloudSchedule(ms=2000){clearTimeout(CLOUD.timer);if(CLOUD.auth&&!CLOUD.paused)CLOUD.timer=setTimeout(cloudSync,ms);}
function cloudStartPoll(){clearInterval(CLOUD.poll);CLOUD.poll=null;if(CLOUD.auth)CLOUD.poll=setInterval(()=>{if(!document.hidden)cloudSchedule(10);},30000);}
function cloudChanged(){
  if(CLOUD.applying)return;
  if(CLOUD.auth){try{const m=cloudMeta();m.pending=cloudText()!==m.baseline;cloudSaveMeta();cloudSetStatus(navigator.onLine===false?'기기에 저장됨 · 인터넷 연결 대기':'기기에 저장됨 · 클라우드 저장 대기');cloudSchedule();}catch{CLOUD.paused=true;cloudSetStatus('동기화 대기정보 저장 실패 · 파일 백업을 해주세요');}}
}
async function cloudRequest(path,method='GET',body,token=CLOUD.auth?.token){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);
  try{
    const r=await fetch(CLOUD_API+path,{method,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:ctrl.signal,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    let data={};try{data=await r.json();}catch{}
    if(!r.ok){const e=new Error(data.error||'network_error');e.status=r.status;throw e;}
    return data;
  }finally{clearTimeout(timer);}
}
function cloudPlaying(){return ['screen-quiz','screen-sa-quiz'].includes(document.querySelector('.screen.active')?.id);}
function cloudApply(data,version){
  if(!cloudValid(data))throw new Error('서버 기록 형식이 올바르지 않습니다');
  cloudBackup(data); // Failure must prevent replacement, not destroy local records.
  CLOUD.applying=true;
  try{
    STORE.wrong=data.wrong;STORE.solved=data.solved;STORE.history=data.history;STORE.myNotes=data.myNotes;STORE.sa=normalizeSA(data.sa);STORE._dirty=false;
    _persistToLS();_persistSA();
    if(typeof UNDO!=='undefined'){UNDO.stack=[];UNDO.redo=[];}
    updateSyncBadge();updateHomeStats();renderExamGrid(null);
    const active=document.querySelector('.screen.active')?.id;
    if(active==='screen-wrongnote')renderWrongNote();
    if(active==='screen-sa')saRenderHub();
    if(active==='screen-sa-wrong')saRenderWrong();
    if(active==='screen-sa-memo')saRenderMemo();
    if(typeof undoRefreshUI==='function')undoRefreshUI();
    const m=cloudMeta();m.base=version;m.baseline=cloudText();m.pending=false;cloudSaveMeta();
  }finally{CLOUD.applying=false;}
}
function cloudConflict(remote){CLOUD.conflict=remote;CLOUD.paused=true;cloudSetStatus('두 기록이 다릅니다 · 현재 기기 기록을 보존했습니다. 동기화 메뉴에서 선택하세요.');}
function cloudCommit(version,captured){const m=cloudMeta();m.base=version;m.baseline=captured;m.pending=cloudText()!==captured;cloudSaveMeta();if(!m.pending){STORE._dirty=false;updateSyncBadge();}CLOUD.retry=15000;cloudSetStatus(m.pending?'추가 변경 저장 대기':'동기화 완료 · '+new Date().toLocaleTimeString());if(m.pending)cloudSchedule();}
function cloudError(e){
  if(e.status===401){CLOUD.auth=null;CLOUD.busy=false;CLOUD.epoch++;cloudStartPoll();sessionStorage.removeItem(CLOUD_KEYS.auth);localStorage.removeItem(CLOUD_KEYS.auth);cloudSetStatus('로그인이 만료됐습니다 · 기기 기록은 유지됩니다');}
  else if(e.status===413||e.status===400){CLOUD.paused=true;cloudSetStatus('기록 형식 또는 크기 문제 · 기기 기록 유지, 파일 백업을 해주세요');}
  else{cloudSetStatus(e.status===429?'접속 시도 제한 · 잠시 후 다시 시도하세요':'기기에 저장됨 · 클라우드 연결 대기');cloudSchedule(CLOUD.retry);CLOUD.retry=Math.min(60000,CLOUD.retry*2);}
}
async function cloudSync(){
  if(!CLOUD.auth||CLOUD.busy||CLOUD.paused)return;
  if(navigator.onLine===false){cloudSetStatus('기기에 저장됨 · 인터넷 연결 대기');return;}
  CLOUD.busy=true;const epoch=CLOUD.epoch;cloudSetStatus('클라우드 확인 중…');
  try{
    const remote=await cloudRequest('/state');if(epoch!==CLOUD.epoch)return;
    if(!Number.isSafeInteger(remote.version)||remote.version<0||(remote.data!==null&&!cloudValid(remote.data)))throw new Error('invalid_server_state');
    const current=cloudText(),m=cloudMeta(),same=remote.data!==null&&JSON.stringify({_version:3,wrong:remote.data.wrong,solved:remote.data.solved,history:remote.data.history,myNotes:remote.data.myNotes,sa:remote.data.sa})===current;
    if(m.base===null){
      if(same){cloudCommit(remote.version,current);return;}
      if(!cloudHasData(cloudSnapshot())){
        if(remote.data!==null){if(cloudPlaying()){cloudSetStatus('다른 기기 기록 있음 · 풀이 종료 후 다시 동기화하세요');return;}cloudApply(remote.data,remote.version);}
        else cloudCommit(remote.version,current);
        cloudSetStatus('동기화 완료');return;
      }
      cloudConflict(remote);return;
    }
    const dirty=current!==m.baseline;m.pending=dirty;cloudSaveMeta();
    if(remote.version!==m.base){
      if(same){cloudCommit(remote.version,current);return;}
      if(dirty){cloudConflict(remote);return;}
      if(cloudPlaying()){cloudSetStatus('다른 기기 기록 있음 · 풀이 종료 후 다시 동기화하세요');return;}
      if(remote.data!==null){cloudApply(remote.data,remote.version);cloudSetStatus('다른 기기 기록을 불러왔습니다 · 이전 되돌리기 이력 초기화');}
      else cloudConflict(remote);
      return;
    }
    if(!dirty){cloudSetStatus('동기화 완료');return;}
    const captured=current,r=await cloudRequest('/state','PUT',{baseVersion:m.base,data:JSON.parse(captured)});
    if(epoch!==CLOUD.epoch)return;
    cloudCommit(r.version,captured);
  }catch(e){if(epoch!==CLOUD.epoch)return;if(e.status===409){try{const r=await cloudRequest('/state');if(epoch===CLOUD.epoch)cloudConflict(r);}catch(err){if(epoch===CLOUD.epoch)cloudError(err);}}else cloudError(e);}
  finally{if(epoch===CLOUD.epoch){CLOUD.busy=false;cloudSetStatus(CLOUD.status);}}
}
async function cloudChoose(which){
  if(!CLOUD.auth||CLOUD.busy)return;
  if(cloudPlaying()){cloudSetStatus('문제 풀이를 종료한 뒤 기록을 선택해 주세요');return;}
  if(!confirm(which==='local'?'현재 기기의 기록으로 클라우드를 갱신할까요? 두 기록의 백업을 기기에 보관합니다.':'클라우드 기록으로 이 기기를 바꿀까요? 현재 기록은 기기 백업에 보관합니다.'))return;
  CLOUD.busy=true;const epoch=CLOUD.epoch;
  try{
    const remote=await cloudRequest('/state');if(epoch!==CLOUD.epoch)return;
    if(which==='remote'){
      if(remote.data===null)throw new Error('empty_remote');
      cloudApply(remote.data,remote.version);
    }else{
      cloudBackup(remote.data);const captured=cloudText();
      const r=await cloudRequest('/state','PUT',{baseVersion:remote.version,data:JSON.parse(captured)});if(epoch!==CLOUD.epoch)return;
      cloudCommit(r.version,captured);
    }
    CLOUD.conflict=null;CLOUD.paused=false;cloudSetStatus('선택한 기록으로 동기화 완료');cloudSchedule();
  }catch(e){if(epoch!==CLOUD.epoch)return;if(e.status===409){try{const r=await cloudRequest('/state');if(epoch===CLOUD.epoch)cloudConflict(r);}catch{cloudSetStatus('다른 기기가 다시 저장했습니다 · 기록을 다시 선택해 주세요');}}else{cloudSetStatus('기록 변경 실패 · 현재 기록은 유지됩니다. 파일 백업 후 다시 시도하세요');}}
  finally{if(epoch===CLOUD.epoch){CLOUD.busy=false;cloudSetStatus(CLOUD.status);}}
}
async function cloudLogin(){
  if(CLOUD.busy)return;
  if(location.protocol==='file:'){cloudSetStatus('클라우드 동기화는 GitHub 웹사이트에서 이용해 주세요. 파일 학습·저장은 그대로 가능합니다.');return;}
  const name=document.getElementById('cloud-user').value.trim().toLowerCase(),pin=document.getElementById('cloud-pin').value,remember=document.getElementById('cloud-remember').checked;
  document.getElementById('cloud-pin').value='';
  if(!/^[a-z0-9_-]{3,32}$/.test(name)||!/^\d{6}$/.test(pin)){cloudSetStatus('아이디와 숫자 6자리 PIN을 확인해 주세요');return;}
  CLOUD.busy=true;cloudSetStatus('로그인 중…');
  try{
    const r=await cloudRequest('/login','POST',{username:name,pin,remember},null);
    CLOUD.epoch++;CLOUD.auth={token:r.token,username:r.username,expiresAt:r.expiresAt};CLOUD.paused=false;CLOUD.conflict=null;
    sessionStorage.removeItem(CLOUD_KEYS.auth);localStorage.removeItem(CLOUD_KEYS.auth);
    (remember?localStorage:sessionStorage).setItem(CLOUD_KEYS.auth,JSON.stringify(CLOUD.auth));
    cloudStartPoll();cloudMeta();cloudSaveMeta();cloudSetStatus('로그인 완료 · 기록 확인 중');
  }catch(e){cloudSetStatus(e.status===401?'아이디 또는 PIN이 맞지 않습니다':e.status===429?'로그인 시도 제한 · 15분 후 다시 시도하세요':'로그인 연결 실패 · 기기 기록은 유지됩니다');}
  finally{CLOUD.busy=false;cloudSetStatus(CLOUD.status);}
  if(CLOUD.auth)await cloudSync();
}
async function cloudLogout(){
  if(CLOUD.auth&&cloudMeta().pending&&!confirm('아직 전송하지 않은 변경이 있습니다. 기기 기록을 유지한 채 로그아웃할까요?'))return;
  const token=CLOUD.auth?.token;CLOUD.epoch++;CLOUD.auth=null;CLOUD.busy=false;CLOUD.conflict=null;CLOUD.paused=false;clearTimeout(CLOUD.timer);cloudStartPoll();
  sessionStorage.removeItem(CLOUD_KEYS.auth);localStorage.removeItem(CLOUD_KEYS.auth);cloudSetStatus('로그아웃 · 기기 기록 유지');
  if(token)try{await cloudRequest('/logout','POST',{},token);}catch{}
}
function cloudRender(){
  const login=document.getElementById('cloud-login-form'),controls=document.getElementById('cloud-controls'),conflict=document.getElementById('cloud-conflict');if(!login)return;
  login.hidden=!!CLOUD.auth;controls.hidden=!CLOUD.auth;conflict.hidden=!CLOUD.conflict;
  document.getElementById('cloud-account').textContent=CLOUD.auth?.username||'';
  for(const e of document.querySelectorAll('#cloud-dialog button[data-network]'))e.disabled=CLOUD.busy;
  document.getElementById('cloud-use-remote').disabled=CLOUD.busy||!CLOUD.conflict?.data;
}
function cloudOpen(){const d=document.getElementById('cloud-dialog');if(!d.open){if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');}cloudRender();}
function cloudClose(){const d=document.getElementById('cloud-dialog');if(typeof d.close==='function')d.close();else d.removeAttribute('open');}
function cloudDownloadBackup(){cloudOriginalFileSave();}
async function cloudRestoreBackup(){
  if(CLOUD.busy)return;const backups=JSON.parse(localStorage.getItem(CLOUD_KEYS.backup)||'[]');const last=backups.find(x=>x.local&&cloudValid(x.local));
  if(!last){cloudSetStatus('기기에 보관된 교체 전 백업이 없습니다');return;}
  if(cloudPlaying()){cloudSetStatus('문제 풀이 종료 후 복원해 주세요');return;}
  if(!confirm('교체 전 기기 백업을 복원할까요? 클라우드에는 자동 덮어쓰지 않고 선택을 기다립니다.'))return;
  if(!CLOUD.auth){showToast('로그인 후 복원을 선택해 주세요');return;}
  cloudApply(last.local,cloudMeta().base||0);cloudMeta().baseline=null;cloudMeta().pending=true;cloudSaveMeta();CLOUD.paused=true;CLOUD.conflict={data:null};cloudSetStatus('기기 백업 복원됨 · 클라우드 갱신 여부를 선택하세요');
}
(function initCloud(){
  if(!document.head||!document.querySelector('.nav-tabs'))return; // Offline core still works in minimal/embedded hosts.
  const style=document.createElement('style');style.textContent='#cloud-dialog{margin:auto;width:min(94vw,560px);max-height:90vh;overflow:auto;border:1px solid #b8c6d5;border-radius:12px;padding:20px;color:#20384d;background:white}#cloud-dialog::backdrop{background:#0008}#cloud-dialog header{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}#cloud-dialog p{font-size:.85rem;line-height:1.6;margin:10px 0}#cloud-dialog label{display:block;margin:10px 0}#cloud-dialog input:not([type=checkbox]){width:100%;padding:10px;border:1px solid #b8c6d5;border-radius:6px}#cloud-dialog button{margin:4px 3px;padding:8px 12px;border:1px solid #9bb0c5;border-radius:6px;cursor:pointer}#cloud-dialog [hidden]{display:none!important}#cloud-status{padding:10px;background:#edf4fa;border-radius:6px}#cloud-conflict{border:2px solid #e9b352;padding:10px;margin:10px 0}.cloud-hint{color:#5d6e80}';document.head.appendChild(style);
  const d=document.createElement('dialog');d.id='cloud-dialog';d.setAttribute('aria-labelledby','cloud-title');
  d.innerHTML='<header><b id="cloud-title">☁️ 학습기록 동기화</b><button type="button" onclick="cloudClose()">닫기 ✕</button></header><p id="cloud-status">로그인하지 않음</p><form id="cloud-login-form" onsubmit="event.preventDefault();cloudLogin()"><label>아이디<input id="cloud-user" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="32" required></label><label>숫자 6자리 PIN<input id="cloud-pin" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><label><input id="cloud-remember" type="checkbox"> 이 기기에서 로그인 유지(최대 30일)</label><button data-network type="submit">로그인</button><p class="cloud-hint">공용 기기에서는 로그인 유지를 선택하지 마세요. PIN은 저장하지 않으며, 로그인 유지 시 접속용 토큰이 이 브라우저에 보관됩니다.</p></form><section id="cloud-controls" hidden><p>연결 계정: <b id="cloud-account"></b></p><button data-network type="button" onclick="CLOUD.paused=!!CLOUD.conflict;cloudSync()">지금 동기화</button><button type="button" onclick="cloudLogout()">로그아웃</button></section><section id="cloud-conflict" hidden><b>기록을 자동으로 덮어쓰지 않았습니다</b><p>어느 기록을 사용할지 선택하세요. 선택 전 두 기록을 이 기기에 백업합니다. 자동 병합은 하지 않습니다. 현재 풀이 중이면 먼저 종료해 주세요.</p><button data-network type="button" onclick="cloudChoose(\'local\')">이 기기 기록으로 클라우드 갱신</button><button data-network type="button" id="cloud-use-remote" onclick="cloudChoose(\'remote\')">클라우드 기록 불러오기</button></section><hr><button type="button" onclick="cloudDownloadBackup()">JSON 파일 백업</button><button type="button" onclick="cloudRestoreBackup()">교체 전 기기 백업 복원</button><p class="cloud-hint">연결하지 않아도 기존 기기 저장·파일 백업은 그대로 작동합니다. 인터넷이 끊기면 기기에 저장하고 재연결 후 전송합니다. 다른 기기 기록을 불러오면 이전 되돌리기 이력은 초기화됩니다.</p>';
  document.body.appendChild(d);d.addEventListener('cancel',e=>{e.preventDefault();cloudClose();});
  const b=document.createElement('button');b.id='cloud-launch';b.type='button';b.className='nav-tab';b.textContent='☁️ 로그인';b.style.cssText='border:0;background:transparent';b.addEventListener('click',cloudOpen);document.querySelector('.nav-tabs').appendChild(b);
  for(const name of ['_persistToLS','_persistSA']){const old=window[name];window[name]=function(...args){const out=old.apply(this,args);try{cloudChanged();}catch{}return out;};}
  const fileSave=window.saveDataFile;window.saveDataFile=function(...args){if(CLOUD.auth){cloudOpen();cloudSchedule(0);return;}return fileSave.apply(this,args);};
  try{CLOUD.meta=JSON.parse(localStorage.getItem(CLOUD_KEYS.meta)||'null');const auth=JSON.parse(sessionStorage.getItem(CLOUD_KEYS.auth)||localStorage.getItem(CLOUD_KEYS.auth)||'null');if(auth&&typeof auth.token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(auth.token)&&auth.expiresAt>Date.now()/1000)CLOUD.auth=auth;}catch{CLOUD.auth=null;CLOUD.meta=null;}
  window.addEventListener('online',()=>cloudSchedule(100));window.addEventListener('focus',()=>cloudSchedule(300));document.addEventListener('visibilitychange',()=>{if(!document.hidden)cloudSchedule(300);});
  cloudStartPoll();
  cloudSetStatus(CLOUD.auth?'로그인 복원 · 동기화 대기':'로그인하지 않음');if(CLOUD.auth)cloudSchedule(500);
})();
