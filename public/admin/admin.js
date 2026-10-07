'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let records=[];
const date=s=>new Date(s).toLocaleString();
const names={vertebra:'Typical Vertebra',adjacent:'Adjacent Vertebrae',cervical:'Typical Cervical Vertebra',atlas:'C1: Atlas',axis:'C2: Axis',regions:'Cervical vs Thoracic vs Lumbar',sacrum:'Sacrum',thorax:'Thoracic Cage',sternum:'Sternum',rib:'Rib',coxal:'Coxal Bone',pelvis:'Bony Pelvis',hyoid:'Quick ID: Hyoid'};
async function api(name,options={}){const r=await fetch('/.netlify/functions/'+name,options);let data;try{data=await r.json();}catch{throw new Error('Dashboard unavailable. Check deployment and Functions settings.');}if(!r.ok){const e=new Error(data.error||'Request failed');e.status=r.status;throw e;}return data;}
const post=(name,data)=>api(name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
function showLogin(){ $('#login').hidden=false;$('#dashboard').hidden=true;$('#detail').hidden=true;records=[];$('#attempts').replaceChildren();}
async function load(){
  $('#status').textContent='Loading attempts...';
  try{const data=await api('attempt-index');records=data.attempts;$('#login').hidden=true;$('#dashboard').hidden=false;render();$('#status').textContent='Updated '+new Date().toLocaleTimeString();}
  catch(e){if(e.status===401)showLogin();$('#status').textContent=e.message;}
}
function render(){
  const students=new Set(records.map(r=>r.email)),complete=records.filter(r=>r.summary.completed===13).length;
  $('#metrics').innerHTML=[['Students with attempts',students.size],['Total attempts',records.length],['Completed attempts',complete],['PDF export events',records.filter(r=>r.summary.exported).length]].map(([label,n])=>`<div>${label}<b>${n}</b></div>`).join('');
  const misses=new Map();for(const r of records)for(const s of r.summary.detail)for(const m of [...s.missed,...s.practicalMissed])misses.set(m.term,(misses.get(m.term)||0)+m.count);
  const firstCorrect=records.reduce((a,r)=>a+r.summary.firstCorrect,0),firstTotal=records.reduce((a,r)=>a+r.summary.firstTotal,0);
  const top=[...misses].sort((a,b)=>b[1]-a[1]).slice(0,10);
  $('#patterns').innerHTML=`<p>First-round Practical Check accuracy across logged attempts: <b>${firstTotal?Math.round(100*firstCorrect/firstTotal)+'%':'No checks yet'}</b> (${firstCorrect}/${firstTotal} items). Repeat attempts are included.</p>`+(top.length?`<p>Most missed structures (labeling and Practical Checks combined):</p><ol>${top.map(([t,n])=>`<li>${esc(t.replaceAll('_',' '))}: ${n} misses</li>`).join('')}</ol>`:'<p>No missed structures logged yet.</p>');
  renderAttempts();
}
function completedList(s){const done=s.detail.filter(d=>d.done).sort((a,b)=>String(a.completedAt).localeCompare(String(b.completedAt)));return done.length?`<ul class="done">${done.map(d=>`<li>${esc(names[d.id])}: ${d.completedAt?esc(date(d.completedAt)):'time not recorded'}</li>`).join('')}</ul>`:'None yet';}
function renderAttempts(){
  const filter=$('#filter').value.toLowerCase().trim(),grouped=new Map();
  for(const r of records){if(filter&&!`${r.name} ${r.email}`.toLowerCase().includes(filter))continue;if(!grouped.has(r.email))grouped.set(r.email,[]);grouped.get(r.email).push(r);}
  $('#attempts').innerHTML=[...grouped].map(([email,attempts])=>`<details open><summary>${esc(attempts[0].name)} (${esc(email)}) / ${attempts.length} attempt${attempts.length===1?'':'s'}</summary><div class="scroll"><table><thead><tr><th>Attempt started</th><th>Progress</th><th>Sections completed (date/time)</th><th>Current scene</th><th>Checks / rounds</th><th>Clues</th><th>First round</th><th>PDF generated</th><th>Last recorded</th><th>Details</th></tr></thead><tbody>${attempts.map(r=>{const s=r.summary;return `<tr><td>${esc(date(r.startedAt))}<br><small>${esc(r.attemptId.slice(0,8))}</small></td><td>${s.completed}/13 (${s.percent}%)${s.allCompletedAt?`<br><small>All done ${esc(date(s.allCompletedAt))}</small>`:''}</td><td>${completedList(s)}</td><td>${esc(names[s.current]||'Not started')}</td><td>${s.labelChecks} / ${s.practicalRounds}</td><td>${s.hints}</td><td>${s.firstTotal?Math.round(100*s.firstCorrect/s.firstTotal)+'%':'n/a'}</td><td>${s.exported?'Yes':'No'}</td><td>${esc(date(r.updatedAt))}</td><td><button data-id="${esc(r.attemptId)}">Open</button></td></tr>`;}).join('')}</tbody></table></div></details>`).join('')||'<p>No matching attempts.</p>';
  document.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>detail(b.dataset.id));
}
async function detail(id){
  try{const {attempts}=await api('attempt-index?attempt='+encodeURIComponent(id));const r=attempts[0];if(!r)throw new Error('Attempt not found');const el=$('#detail');el.hidden=false;
    el.innerHTML=`<h2>${esc(r.name)}: attempt details</h2><p>${esc(r.email)}<br>Attempt ID: ${esc(r.attemptId)}<br>Started: ${esc(date(r.startedAt))}<br>Last recorded: ${esc(date(r.updatedAt))}</p><p><b>${r.summary.completed}/13 items complete.</b> ${r.summary.exported?'PDF generation was logged.':'No PDF generation event was logged.'} Check D2L for the actual submission.</p><h3>Sections</h3><div class="scroll"><table><thead><tr><th>Section</th><th>Status</th><th>Completed</th></tr></thead><tbody>${r.summary.detail.map(s=>`<tr><td>${esc(names[s.id])}</td><td>${esc(s.done?'Completed':s.phase)}</td><td>${s.completedAt?esc(date(s.completedAt)):'—'}</td></tr>`).join('')}</tbody></table></div>${r.summary.detail.map(s=>`<details><summary>${esc(names[s.id])}: ${esc(s.phase)}${s.completedAt?' / completed '+esc(date(s.completedAt)):''}</summary><p>Label checks: ${s.labelChecks}. Practical rounds: ${s.practicalRounds}.</p>${s.reasoning.map(p=>`<p><b>${esc(p.q)}</b><br>${esc(p.a)}</p>`).join('')}</details>`).join('')}<details><summary>All recorded assessment events (${r.events.length})</summary>${r.events.map(e=>`<div><p><b>${esc(e.type)}: ${esc(names[e.scene]||'Assignment')}</b> / ${esc(date(e.at))}</p><pre>${esc(JSON.stringify(e,null,2))}</pre></div>`).join('')}</details><button id="closeDetail">Close detail view</button>`;
    $('#closeDetail').onclick=()=>el.hidden=true;el.scrollIntoView({behavior:'smooth'});
  }catch(e){$('#status').textContent=e.message;if(e.status===401)showLogin();}
}
$('#loginForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await post('admin-login',{password:$('#password').value});$('#password').value='';await load();}catch(err){$('#status').textContent=err.message;}finally{b.disabled=false;}};
$('#logout').onclick=async()=>{await post('admin-logout',{});showLogin();$('#status').textContent='Signed out.';};
$('#refresh').onclick=load;$('#filter').oninput=renderAttempts;
$('#csv').onclick=()=>{
  const safe=s=>{s=String(s??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const ids=Object.keys(names);
  const rows=[['Name','Email','Attempt ID','Started','Last recorded','Complete items','All sections completed at','Label checks','Practical rounds','Clues','PDF generated',...ids.map(id=>names[id]+' completed at')],...records.map(r=>[r.name,r.email,r.attemptId,r.startedAt,r.updatedAt,r.summary.completed,r.summary.allCompletedAt||'',r.summary.labelChecks,r.summary.practicalRounds,r.summary.hints,r.summary.exported,...ids.map(id=>r.summary.detail.find(d=>d.id===id)?.completedAt||'')])];
  const url=URL.createObjectURL(new Blob([rows.map(r=>r.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='HW7-attempt-index.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
};
load();
