import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {handler} from '../server/handlers.mjs';
import {scenes} from '../server/core.mjs';
process.env.HW7_ADMIN_PASSWORD='test-only-long-password';
process.env.HW7_ADMIN_SESSION_SECRET='test-only-session-secret-32-characters';
function setup(){
  const map=new Map(),store={async setJSON(k,v,o){if(o?.onlyIfNew&&map.has(k))return{modified:false};map.set(k,structuredClone(v));return{modified:true};},async get(k){return structuredClone(map.get(k)||null);},async *list({prefix}){const keys=[...map.keys()].filter(k=>k.startsWith(prefix));for(let i=0;i<keys.length;i+=2)yield{blobs:keys.slice(i,i+2).map(key=>({key}))};}};
  const call=(action,data,options={})=>handler(action,()=>store)(new Request('https://hw7.example/.netlify/functions/'+action+(options.query||''),{method:options.method||(data?'POST':'GET'),headers:{...(data?{'Content-Type':'application/json'}:{}),...options.headers},...(data?{body:JSON.stringify(data)}:{})}));
  return{call,map};
}
const sceneState=()=>({phase:'label',order:[0],ans:{},st:{},miss:{},clue:{},checks:[],pr:null,prove:null});
const payload=(c,n,events=[])=>({...c,sequence:n,state:{cur:0,sc:{vertebra:sceneState()}},events});
test('students create unique attempts and cannot read any records',async()=>{
 const {call}=setup();const a=await(await call('start',{name:'Sample Student',email:'sample@school.edu'})).json();const b=await(await call('start',{name:'Sample Student',email:'sample@school.edu'})).json();assert.notEqual(a.attemptId,b.attemptId);assert.equal((await call('index')).status,401);assert.equal((await call('save',undefined,{method:'GET'})).status,405);assert.equal((await call('start',undefined,{method:'GET'})).status,405);
});
test('capability tokens restrict writes, and retries are immutable',async()=>{
 const {call,map}=setup();const c=await(await call('start',{name:'Sample Student',email:'sample@school.edu'})).json();assert.equal((await call('save',payload({...c,token:'0'.repeat(64)},1))).status,403);
 assert.equal((await call('save',payload(c,1))).status,200);let p=payload(c,1);p.state.sc.vertebra.phase='done';const r=await(await call('save',p)).json();assert.equal(r.duplicate,true);assert.equal(map.get(`snapshot/${c.attemptId}/000001`).state.sc.vertebra.phase,'label');
});
test('late snapshots do not replace newer work and events stay indexed',async()=>{
 const {call}=setup();const c=await(await call('start',{name:'Sample Student',email:'sample@school.edu'})).json();
 const event={id:randomUUID(),type:'practical',scene:'vertebra',round:1,results:[{correct:false}],at:new Date().toISOString()};
 let p=payload(c,2,[event]);p.state.sc.vertebra.phase='done';p.state.sc.vertebra.pr={rounds:1,items:[0],firstResults:[{correct:false}]};p.state.exportedAt=new Date().toISOString();
 await call('save',p);await call('save',payload(c,1,[event]));
 const login=await call('login',{password:process.env.HW7_ADMIN_PASSWORD});const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 const index=await(await call('index',undefined,{headers:{cookie}})).json();assert.equal(index.attempts[0].summary.completed,1);assert.equal(index.attempts[0].summary.exported,true);assert.equal(index.attempts[0].summary.firstTotal,1);assert.equal(index.attempts[0].tokenHash,undefined);
 const details=await(await call('index',undefined,{headers:{cookie},query:'?attempt='+c.attemptId})).json();assert.equal(details.attempts[0].events.length,1);assert.equal(details.attempts[0].events[0].id,event.id);assert.equal(details.attempts[0].state.sc.vertebra.phase,'done');
});
test('unknown scenes, bad counts, image uploads, and oversized bodies are rejected',async()=>{
 const {call}=setup();const c=await(await call('start',{name:'Sample Student',email:'sample@school.edu'})).json();
 let p=payload(c,1);p.state.sc.fake=sceneState();assert.equal((await call('save',p)).status,400);
 p=payload(c,1);p.state.sc.vertebra.checks=[{c:999,n:scenes[0].tags.length}];assert.equal((await call('save',p)).status,400);
 p=payload(c,1);p.state.sc.vertebra.snap={url:'data:image/jpeg;abc'};assert.equal((await call('save',p)).status,400);
 p=payload(c,1);p.state.extra='a'.repeat(260000);assert.equal((await call('save',p)).status,413);
});
test('admin password, signed session, and origin checks protect the index',async()=>{
 const {call}=setup();assert.equal((await call('login',{password:'wrong'})).status,401);
 assert.equal((await call('index',undefined,{headers:{cookie:'hw7_admin=forged.bad'}})).status,401);
 assert.equal((await call('login',{password:process.env.HW7_ADMIN_PASSWORD},{headers:{origin:'https://other.example'}})).status,403);
 assert.equal((await call('start',{name:'Sample Student',email:'sample@school.edu'},{headers:{'sec-fetch-site':'cross-site'}})).status,403);
});
test('optional course code is checked only on the server',async()=>{
 const {call}=setup();process.env.HW7_COURSE_CODE='test-course-code';
 try{assert.equal((await call('start',{name:'Sample Student',email:'sample@school.edu'})).status,403);assert.equal((await call('start',{name:'Sample Student',email:'sample@school.edu',courseCode:'test-course-code'})).status,201);}finally{delete process.env.HW7_COURSE_CODE;}
});
test('section completion times are recorded by the server and indexed',async()=>{
 const {call,map}=setup();const c=await(await call('start',{name:'Sample Student',email:'sample@school.edu'})).json();
 const done={id:randomUUID(),type:'scene-complete',scene:'vertebra',at:new Date().toISOString()};
 let p=payload(c,1,[done]);p.state.sc.vertebra.phase='done';await call('save',p);
 const first=map.get(`complete/${c.attemptId}/vertebra`).completedAt;assert.ok(first);
 await new Promise(r=>setTimeout(r,5));p=payload(c,2,[{...done,id:randomUUID()}]);p.state.sc.vertebra.phase='done';await call('save',p);
 assert.equal(map.get(`complete/${c.attemptId}/vertebra`).completedAt,first);
 const cookie=(await call('login',{password:process.env.HW7_ADMIN_PASSWORD})).headers.get('set-cookie').split(';')[0];
 const s=(await(await call('index',undefined,{headers:{cookie}})).json()).attempts[0].summary;
 assert.equal(s.detail.find(d=>d.id==='vertebra').completedAt,first);assert.equal(s.detail.find(d=>d.id==='atlas').completedAt,null);assert.equal(s.allCompletedAt,null);
});
test('built-in password works without environment variables and the session lasts 30 days',async()=>{
 const saved={p:process.env.HW7_ADMIN_PASSWORD,s:process.env.HW7_ADMIN_SESSION_SECRET};delete process.env.HW7_ADMIN_PASSWORD;delete process.env.HW7_ADMIN_SESSION_SECRET;
 try{
  const {call,map}=setup();assert.equal((await call('login',{password:'wrong'})).status,401);assert.equal((await call('login',{password:saved.p})).status,401);
  const pw=process.env.HW7_TEST_BUILTIN_PASSWORD;
  if(pw){const login=await call('login',{password:pw});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/Max-Age=2592000/);
   const cookie=login.headers.get('set-cookie').split(';')[0];assert.equal((await call('index',undefined,{headers:{cookie}})).status,200);assert.equal((await call('status',undefined,{headers:{cookie}})).status,200);
   assert.ok(map.get('config/admin-session-secret').secret.length>=32);}
  assert.equal((await call('index',undefined,{headers:{cookie:'hw7_admin=forged.bad'}})).status,401);
 }finally{process.env.HW7_ADMIN_PASSWORD=saved.p;process.env.HW7_ADMIN_SESSION_SECRET=saved.s;}
});
