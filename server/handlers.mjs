import {json,body,sameOrigin,identity,hash,equal,validateSnapshot,summarize,attemptCredentials,adminConfigured,sessionCookie,isAdmin,allKeys} from './core.mjs';
export function handler(action,getStore){return async req=>{
  try{
    if(!sameOrigin(req))return json({error:'Cross-site request blocked'},403);
    if(['start','save','login','logout'].includes(action)&&req.method!=='POST')return json({error:'POST required'},405,{'Allow':'POST'});
    if(action==='index'&&req.method!=='GET')return json({error:'GET required'},405,{'Allow':'GET'});
    if(action==='logout')return json({ok:true},200,{'Set-Cookie':sessionCookie(true)});
    if(action==='login'){
      if(!adminConfigured())return json({error:'Instructor access is not configured. Set the two admin environment variables.'},503);
      const data=await body(req,2000);
      if(typeof data.password!=='string'||!equal(data.password,process.env.HW7_ADMIN_PASSWORD))return json({error:'Incorrect instructor password'},401);
      return json({ok:true},200,{'Set-Cookie':sessionCookie()});
    }
    if(['index','status'].includes(action)&&!isAdmin(req))return json({error:'Instructor login required'},401);
    if(action==='status')return json({ok:true});
    const store=getStore();
    if(action==='start'){
      const data=await body(req,2000);const person=identity(data);
      if(process.env.HW7_COURSE_CODE&&!equal(data.courseCode||'',process.env.HW7_COURSE_CODE))return json({error:'Incorrect course access code'},403);
      const c=attemptCredentials(),startedAt=new Date().toISOString();
      await store.setJSON(`session/${c.attemptId}`,{...person,attemptId:c.attemptId,tokenHash:hash(c.token),startedAt},{onlyIfNew:true});
      return json({...c,startedAt},201);
    }
    if(action==='save'){
      const data=await body(req);const snapshot=validateSnapshot(data);
      const session=await store.get(`session/${data.attemptId}`,{type:'json'});
      if(!session||!equal(hash(data.token),session.tokenHash))return json({error:'Invalid attempt token'},403);
      const updatedAt=new Date().toISOString();
      // Immutable, sequenced snapshots make retrying idempotent and prevent late writes from replacing newer work.
      const key=`snapshot/${data.attemptId}/${String(snapshot.sequence).padStart(6,'0')}`;
      const result=await store.setJSON(key,{...snapshot,updatedAt},{onlyIfNew:true});
      // One immutable record per section; the first server-recorded completion time is kept.
      const finished=[...new Set(snapshot.events.filter(e=>e.type==='scene-complete'&&e.scene).map(e=>e.scene))];
      await Promise.all(finished.map(scene=>store.setJSON(`complete/${data.attemptId}/${scene}`,{scene,completedAt:updatedAt},{onlyIfNew:true})));
      return json({ok:true,sequence:snapshot.sequence,updatedAt,duplicate:result.modified===false});
    }
    if(action==='index'){
      const url=new URL(req.url),id=url.searchParams.get('attempt');
      if(id&&!/^[0-9a-f-]{36}$/i.test(id))return json({error:'Invalid attempt ID'},400);
      const headers=id?[`session/${id}`]:await allKeys(store,'session/');
      const records=[];
      // Serial per-attempt reads avoid bursting unbounded requests for a class-sized index.
      for(const key of headers){
        const session=await store.get(key,{type:'json'});if(!session)continue;
        const keys=(await allKeys(store,`snapshot/${session.attemptId}/`)).sort();
        const snapshots=[];
        const readKeys=id?keys:keys.slice(-1);
        for(let i=0;i<readKeys.length;i+=10)snapshots.push(...await Promise.all(readKeys.slice(i,i+10).map(k=>store.get(k,{type:'json'}))));
        const present=snapshots.filter(Boolean),latest=present.at(-1);
        const seen=new Set(),events=present.flatMap(s=>s.events).filter(e=>{if(seen.has(e.id))return false;seen.add(e.id);return true;});
        const completionKeys=await allKeys(store,`complete/${session.attemptId}/`);
        const completions=(await Promise.all(completionKeys.map(k=>store.get(k,{type:'json'})))).filter(Boolean);
        const completedAt=Object.fromEntries(completions.map(c=>[c.scene,c.completedAt]));
        const {tokenHash,...person}=session;
        records.push({...person,updatedAt:latest?.updatedAt||session.startedAt,summary:summarize(latest?.state,events,completedAt),...(id?{state:latest?.state||null,events}:{} )});
      }
      return json({attempts:records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))});
    }
    return json({error:'Unknown action'},404);
  }catch(e){const status=e.status||(/Invalid|Unknown|Enter|Missing|Text/.test(e.message)?400:500);return json({error:status===500?'The attempt log is temporarily unavailable':e.message},status);}
};}
