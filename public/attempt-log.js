/* No localStorage, sessionStorage, IndexedDB, or student read endpoint. */
window.AttemptLog=(()=>{
  let credentials=null,getState=null,timer=null,retry=null,pending=null,events=[],sequence=0,version=0,sentVersion=0,busy=false;
  const status=text=>{const el=document.getElementById('logStatus');if(el)el.textContent=text;};
  async function request(path,payload,keepalive=false){
    const response=await fetch('/.netlify/functions/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive});
    let data;try{data=await response.json();}catch{throw new Error('Attempt logging is unavailable. Check your connection and try again.');}
    if(!response.ok)throw new Error(data.error||'Attempt logging is unavailable');return data;
  }
  function snapshot(){
    const state=getState();const sc={};
    for(const [id,s] of Object.entries(state.sc)){const {snap,msg,...rest}=s;sc[id]=rest;}
    return {cur:state.cur,sc,exportedAt:state.exportedAt||null};
  }
  function buildPending(){
    if(pending||!credentials||!getState||sentVersion===version)return;
    pending={payload:{...credentials,sequence:++sequence,state:snapshot(),events:events.splice(0,100)},version};
    // Snapshot the payload now, so in-flight edits cannot change the request under the same sequence number.
    pending.payload=JSON.parse(JSON.stringify(pending.payload));
  }
  async function flush(keepalive=false){
    if(busy||!credentials)return;
    clearTimeout(timer);buildPending();if(!pending)return;
    busy=true;status('Recording progress...');
    try{
      await request('attempt-save',pending.payload,keepalive);sentVersion=pending.version;pending=null;
      status('Progress recorded for instructor. D2L submission still required.');
      if(events.length){version++;} // Drain event overflow without dropping any events.
      if(sentVersion!==version)timer=setTimeout(flush,1200);
    }catch(e){status('Progress not yet recorded. Keep this page open; retrying.');clearTimeout(retry);retry=setTimeout(flush,10000);}
    finally{busy=false;}
  }
  function save(){if(!credentials)return;version++;status('Progress pending. Keep this page open.');clearTimeout(timer);timer=setTimeout(flush,1200);}
  function event(type,scene,details={}){if(!credentials)return;events.push({id:crypto.randomUUID(),type,scene,at:new Date().toISOString(),...details});save();}
  async function begin(person,stateGetter){
    credentials=await request('attempt-start',person);getState=stateGetter;status('New attempt started. Previous attempts cannot be reopened.');return credentials;
  }
  window.addEventListener('online',()=>flush());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush(true);});
  window.addEventListener('pagehide',()=>flush(true));
  window.addEventListener('pageshow',e=>{if(e.persisted){credentials=null;location.reload();}});
  window.addEventListener('beforeunload',e=>{if(credentials){e.preventDefault();e.returnValue='';}});
  return {begin,save,event,flush};
})();
