import {createHash, createHmac, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import spec from '../public/scenes.json' with {type:'json'};
export const scenes = spec.scenes.map(s => ({id:s.id, tags:s.tags.map(t=>t.term), quick:s.id==='hyoid'}));
export const hash = s => createHash('sha256').update(String(s)).digest('hex');
export const equal = (a,b) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
export const json = (data,status=200,headers={}) => Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
export function sameOrigin(req) {
  const origin=req.headers.get('origin');
  return (!origin || origin===new URL(req.url).origin) && req.headers.get('sec-fetch-site')!=='cross-site';
}
export async function body(req,max=256000) {
  if(!req.headers.get('content-type')?.startsWith('application/json')) throw Object.assign(new Error('JSON required'),{status:415});
  if(Number(req.headers.get('content-length'))>max) throw Object.assign(new Error('Request too large'),{status:413});
  // Bound the stream as it arrives rather than allocating an arbitrary request.
  const reader=req.body?.getReader(); if(!reader) throw new Error('Missing body');
  const chunks=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Object.assign(new Error('Request too large'),{status:413});}chunks.push(value);}
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('Invalid JSON');}
}
function assert(ok,msg='Invalid attempt data') {if(!ok)throw new Error(msg);}
export function identity(data) {
  assert(data&&typeof data==='object');
  const name=typeof data.name==='string'?data.name.trim():'';
  const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
  assert(name.length>=3&&name.length<=100&&name.split(/\s+/).length>=2,'Enter your first and last name');
  assert(email.length<=160&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Enter a valid school email');
  return {name,email};
}
function bounded(v,depth=0) {
  assert(depth<16);
  if(typeof v==='string')assert(v.length<=6000&&!v.startsWith('data:image/'),'Text too long or image included');
  else if(typeof v==='number')assert(Number.isFinite(v)&&Math.abs(v)<=1e13);
  else if(Array.isArray(v)){assert(v.length<=1000);v.forEach(x=>bounded(x,depth+1));}
  else if(v&&typeof v==='object'){assert(Object.keys(v).length<=250);for(const [k,x] of Object.entries(v)){assert(!['__proto__','constructor','prototype'].includes(k));bounded(x,depth+1);}}
}
export function validateSnapshot(data) {
  assert(data&&/^[0-9a-f-]{36}$/i.test(data.attemptId)&&typeof data.token==='string'&&data.token.length===64);
  assert(Number.isInteger(data.sequence)&&data.sequence>=1&&data.sequence<=999999);
  const state=data.state;assert(state&&Number.isInteger(state.cur)&&state.cur>=0&&state.cur<scenes.length);
  assert(state.sc&&typeof state.sc==='object'&&!Array.isArray(state.sc));bounded(state);
  for(const [id,s] of Object.entries(state.sc)) {
    const scene=scenes.find(x=>x.id===id);assert(scene,'Unknown scene');
    assert(s&&[null,'label','practical','prove','done'].includes(s.phase));
    assert(Array.isArray(s.checks)&&s.checks.every(c=>Number.isInteger(c.c)&&Number.isInteger(c.n)&&c.n===scene.tags.length&&c.c>=0&&c.c<=c.n));
    for(const key of ['miss','clue','st','ans']){assert(s[key]&&typeof s[key]==='object');for(const [i,v] of Object.entries(s[key])){assert(/^\d+$/.test(i)&&Number(i)<scene.tags.length);if(key==='miss')assert(Number.isInteger(v)&&v>=0&&v<=10000);}}
    if(s.pr){assert(Array.isArray(s.pr.items)&&new Set(s.pr.items).size===s.pr.items.length&&s.pr.items.every(i=>Number.isInteger(i)&&i>=0&&i<scene.tags.length));assert(Number.isInteger(s.pr.rounds)&&s.pr.rounds>=0&&s.pr.rounds<=10000);}
    assert(!s.snap,'Evidence images must remain in the student PDF');
  }
  assert(Array.isArray(data.events)&&data.events.length<=100);bounded(data.events);
  for(const e of data.events){assert(/^[0-9a-f-]{36}$/i.test(e.id)&&['labels','practical','clue','reasoning','scene-complete','pdf-export','submission-open'].includes(e.type));assert(!e.scene||scenes.some(s=>s.id===e.scene));}
  return {sequence:data.sequence,state,events:data.events};
}
export function summarize(state={cur:0,sc:{}},events=[]) {
  let completed=0,started=0,labelChecks=0,practicalRounds=0,hints=0,reasoning=0;
  const detail=scenes.map(scene=>{
    const s=state.sc[scene.id]||{},pr=s.pr||{};
    const done=s.phase==='done';completed+=Number(done);started+=Number(!!s.phase);
    labelChecks+=(s.checks||[]).length;practicalRounds+=pr.rounds||0;
    hints+=Object.keys(s.clue||{}).length+Object.keys(pr.clue||{}).length;
    reasoning+=(s.prove||[]).filter(p=>(p.a||'').trim().length>=25).length;
    return {id:scene.id,phase:s.phase||'not-started',done,labelChecks:(s.checks||[]).length,practicalRounds:pr.rounds||0,reasoning:s.prove||[],missed:Object.entries(s.miss||{}).filter(([,n])=>n>0).map(([i,n])=>({term:scene.tags[i],count:n})),practicalMissed:Object.entries(pr.miss||{}).filter(([,n])=>n>0).map(([i,n])=>({term:scene.tags[i],count:n}))};
  });
  const first=Object.values(state.sc).flatMap(s=>s.pr?.firstResults||[]);
  return {completed,total:scenes.length,started,percent:Math.round(100*completed/scenes.length),current:scenes[state.cur]?.id,labelChecks,practicalRounds,hints,reasoning,firstCorrect:first.filter(x=>x.correct).length,firstTotal:first.length,exported:!!state.exportedAt,detail};
}
export const attemptCredentials=()=>({attemptId:randomUUID(),token:randomBytes(32).toString('hex')});
const cookieName='hw7_admin';
function secret(){const s=process.env.HW7_ADMIN_SESSION_SECRET;if(!s||s.length<32)throw Object.assign(new Error('Set an admin session secret of at least 32 characters'),{status:503});return s;}
export function adminConfigured(){return (process.env.HW7_ADMIN_PASSWORD||'').length>=16&&(process.env.HW7_ADMIN_SESSION_SECRET||'').length>=32;}
export function sessionCookie(clear=false){
  let value='';if(!clear){const payload=Buffer.from(JSON.stringify({exp:Date.now()+8*3600000,nonce:randomBytes(16).toString('hex')})).toString('base64url');value=payload+'.'+createHmac('sha256',secret()).update(payload).digest('base64url');}
  return `${cookieName}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/.netlify/functions/; Max-Age=${clear?0:28800}`;
}
export function isAdmin(req){
  if(!adminConfigured())return false;
  const token=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!token)return false;const [payload,sig]=token.split('.');if(!payload||!sig)return false;
  const expected=createHmac('sha256',secret()).update(payload).digest('base64url');if(!equal(sig,expected))return false;
  try{return JSON.parse(Buffer.from(payload,'base64url').toString()).exp>Date.now();}catch{return false;}
}
export async function allKeys(store,prefix){const keys=[];for await(const page of store.list({prefix,paginate:true}))keys.push(...page.blobs.map(b=>b.key));return keys;}
