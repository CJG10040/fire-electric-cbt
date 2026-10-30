// Personal CBT sync API. No public signup, recovery, admin API or logging of credentials.
const ORIGIN='https://cjg10040.github.io';
const enc=new TextEncoder();
const bytesTo64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const from64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const random=n=>bytesTo64(crypto.getRandomValues(new Uint8Array(n)));
async function digest(s){return bytesTo64(await crypto.subtle.digest('SHA-256',enc.encode(s)));}
async function hmac(secret,text){const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return crypto.subtle.sign('HMAC',k,enc.encode(text));}
async function passwordHash(password,salt,pepper){
  // Worker WebCrypto PBKDF2 iteration maximum is 100000. Server-only pepper protects DB-only leaks.
  const pre=await hmac(pepper,password);
  const k=await crypto.subtle.importKey('raw',pre,'PBKDF2',false,['deriveBits']);
  return bytesTo64(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:from64(salt),iterations:100000},k,256));
}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
function response(status,data,origin){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(origin===ORIGIN?{'Access-Control-Allow-Origin':ORIGIN}:{})}});}
async function jsonBody(req,max){
  if(!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw {status:415,code:'json_required'};
  if(Number(req.headers.get('Content-Length')||0)>max)throw {status:413,code:'too_large'};
  const reader=req.body?.getReader(); if(!reader)throw {status:400,code:'invalid_json'};
  let size=0,chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw {status:413,code:'too_large'};}chunks.push(value);}
  const out=new Uint8Array(size);let p=0;for(const c of chunks){out.set(c,p);p+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(out));}catch{throw {status:400,code:'invalid_json'};}
}
function validData(d){
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
  if(!obj(d)||d._version!==3||!obj(d.wrong)||!obj(d.myNotes)||!Array.isArray(d.solved)||!Array.isArray(d.history)||!obj(d.sa)||!obj(d.sa.wrong)||!Array.isArray(d.sa.solved)||!Array.isArray(d.sa.history))return false;
  let seen=0;
  function walk(x,depth){if(++seen>100000||depth>20)return false;if(x&&typeof x==='object')for(const k of Object.keys(x)){if(['__proto__','prototype','constructor'].includes(k)||!walk(x[k],depth+1))return false;}return true;}
  return walk(d,0);
}
async function rate(db,key,now){
  const row=await db.prepare('INSERT INTO login_limits (key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN expires_at<=? THEN 1 ELSE hits+1 END, expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING hits').bind(key,now+900,now,now,now+900).first();
  return row.hits<=5;
}
export default {async fetch(req,env){
  const origin=req.headers.get('Origin')||'';
  const reply=(s,d)=>response(s,d,origin);
  try{
    if(origin&&origin!==ORIGIN)return reply(403,{error:'origin_not_allowed'});
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}});
    const path=new URL(req.url).pathname, now=Math.floor(Date.now()/1000);
    if(path==='/health'&&req.method==='GET')return reply(200,{ok:true,service:'cbt-sync',version:1});
    if(path==='/login'&&req.method==='POST'){
      const b=await jsonBody(req,2048);
      const username=typeof b.username==='string'?b.username.toLowerCase():'';
      if(!/^[a-z0-9_-]{3,32}$/.test(username)||typeof b.pin!=='string'||!/^\d{6}$/.test(b.pin))return reply(400,{error:'invalid_credentials'});
      const ip=req.headers.get('CF-Connecting-IP')||'unknown';
      const ipkey=bytesTo64(await hmac(env.AUTH_PEPPER,'ip:'+ip));
      const userkey=bytesTo64(await hmac(env.AUTH_PEPPER,'user:'+username));
      const limits=await Promise.all([rate(env.DB,ipkey,now),rate(env.DB,userkey,now)]);
      if(limits.some(x=>!x))return reply(429,{error:'too_many_attempts',retryAfter:900});
      const user=await env.DB.prepare('SELECT salt,passhash FROM users WHERE username=?').bind(username).first();
      const candidate=await passwordHash(b.pin,user?.salt||'AAAAAAAAAAAAAAAAAAAAAA',env.AUTH_PEPPER);
      if(!user||!equal(candidate,user.passhash))return reply(401,{error:'invalid_credentials'});
      const token=random(32),expires=now+(b.remember===true?30*86400:12*3600);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now),
        env.DB.prepare('DELETE FROM login_limits WHERE expires_at<=?').bind(now),
        env.DB.prepare('INSERT INTO sessions (token_hash,username,expires_at) VALUES (?,?,?)').bind(await digest(token),username,expires)
      ]);
      return reply(200,{token,username,expiresAt:expires});
    }
    if(!((path==='/state'&&['GET','PUT'].includes(req.method))||(path==='/logout'&&req.method==='POST')))return reply(404,{error:'not_found'});
    const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))return reply(401,{error:'login_required'});
    const hash=await digest(token);
    const session=await env.DB.prepare('SELECT username FROM sessions WHERE token_hash=? AND expires_at>?').bind(hash,now).first();
    if(!session)return reply(401,{error:'login_required'});
    if(path==='/logout'){
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run();return reply(200,{ok:true});
    }
    if(req.method==='GET'){
      const row=await env.DB.prepare('SELECT version,data,updated_at FROM snapshots WHERE username=?').bind(session.username).first();
      return reply(200,{version:row?.version||0,data:row?.data?JSON.parse(row.data):null,updatedAt:row?.updated_at||null});
    }
    const b=await jsonBody(req,1000000);
    if(!Number.isSafeInteger(b.baseVersion)||b.baseVersion<0||!validData(b.data))return reply(400,{error:'invalid_state'});
    const row=await env.DB.prepare('UPDATE snapshots SET data=?,version=version+1,updated_at=? WHERE username=? AND version=? RETURNING version,updated_at').bind(JSON.stringify(b.data),new Date().toISOString(),session.username,b.baseVersion).first();
    if(!row)return reply(409,{error:'version_conflict'});
    return reply(200,{version:row.version,updatedAt:row.updated_at});
  }catch(e){return reply(e.status||503,{error:e.code||'temporarily_unavailable'});}
}};
