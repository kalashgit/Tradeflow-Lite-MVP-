/* TradeFlow Operations R05 — offline crew assignments, manually sequenced routes,
   review follow-up tasks and truthful integration readiness.
   No employee tracking, cloud sync, optimized ETAs or connected third-party accounts. */
(function(global){
'use strict';
let api=null,section='crew',crewFormOpen=false,crewEditId='',planOpen=false,planId='',activeDate='';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const trim=(v,n=200)=>String(v==null?'':v).trim().slice(0,n);
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(new Date(v+'T12:00:00Z').getTime())&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
activeDate=today();
function head(title,subtitle){
 return '<header class="tf-ops-heading"><span class="tf-ops-kicker">TRADEFLOW / BUSINESS OPERATIONS</span><h1>'+esc(title)+'</h1><p>'+esc(subtitle)+'</p></header>';
}
function tabbar(current){
 return '<nav class="tf-ops-nav" aria-label="Operations hub">'+
 '<button type="button" data-tab="dispatch" class="'+(current==='dispatch'?'active':'')+'">Crew & routes</button>'+
 '<button type="button" data-tab="integrations" class="'+(current==='integrations'?'active':'')+'">Integrations</button>'+
 '<button type="button" data-tab="calendar">Calendar ↗</button></nav>';
}
function optionCrew(members,id){
 return '<option value="">Unassigned</option>'+members.map(m=>'<option value="'+esc(m.id)+'"'+(m.id===id?' selected':'')+'>'+esc(m.name)+' · '+esc(m.role||'Crew')+'</option>').join('');
}
function address(job,d){
 const c=(d.customers||[]).find(x=>x.id===job.customerId);
 return trim(job.address||c?.address||'',400);
}
function jobLink(job,d){
 return '<span><strong>'+esc(job.title||'Untitled job')+'</strong><small>'+esc(job.date||'No scheduled date')+
 ' · '+esc(address(job,d)||'Address missing')+'</small></span>';
}
function roster(d){
 const members=d.crew||[],jobs=d.jobs||[],assigned=jobs.filter(x=>x.crewId&&members.some(c=>c.id===x.crewId)).length;
 let content='<div class="tf-ops-page"><button data-tab="settings" class="tf-ops-back" type="button">‹ More</button>'+
 head('Crew & Dispatch','Assign work locally, build itineraries and open directions in your maps app.')+tabbar('dispatch')+
 '<div class="tf-ops-stats"><div><small>CREW PROFILES</small><strong>'+members.length+'</strong></div><div><small>ASSIGNED JOBS</small><strong>'+assigned+'</strong></div><div><small>ROUTE PLANS</small><strong>'+(d.routePlans||[]).length+'</strong></div></div>'+
 '<div class="tf-ops-switch"><button data-ops-action="section" data-section="crew" type="button" class="'+(section==='crew'?'active':'')+'">Crew assignments</button>'+
 '<button data-ops-action="section" data-section="routes" type="button" class="'+(section==='routes'?'active':'')+'">Manual route plans</button></div>';
 if(section==='routes')return content+routes(d)+'</div>';
 content+='<div class="tf-ops-rowhead"><h2>Team roster</h2><button type="button" class="tf-ops-primary" data-ops-action="crew-new">+ Crew member</button></div>';
 if(crewFormOpen){
  const edit=members.find(x=>x.id===crewEditId)||{};
  content+='<form id="tfOpsCrewForm" class="tf-ops-panel"><h3>'+esc(edit.id?'Edit member':'New crew member')+'</h3>'+
   '<label>Team member name<input name="name" maxlength="90" required value="'+esc(edit.name||'')+'" placeholder="Name or display name"></label>'+
   '<label>Role / primary skill<input name="role" maxlength="90" value="'+esc(edit.role||'')+'" placeholder="Electrician, apprentice, project manager"></label>'+
   '<label>Notes (optional)<textarea name="notes" maxlength="350" rows="2" placeholder="Work preferences, capabilities">'+esc(edit.notes||'')+'</textarea></label>'+
   '<div class="tf-ops-actions"><button type="submit" class="tf-ops-primary">Save member</button>'+
   '<button type="button" data-ops-action="crew-cancel" class="tf-ops-secondary">Cancel</button></div>'+
   '<p class="tf-ops-note">Names stay in this device’s local TradeFlow records. No employee accounts or live location access exist.</p></form>';
 }
 content+=(members.length?members.map(x=>{
 const count=jobs.filter(j=>j.crewId===x.id).length;
 return '<article class="tf-ops-listitem"><div><strong>'+esc(x.name)+'</strong><small>'+esc(x.role||'Crew member')+
 ' · '+count+' assigned job'+(count===1?'':'s')+'</small></div><div class="tf-ops-actions"><button data-ops-action="crew-edit" data-id="'+esc(x.id)+'" type="button">Edit</button>'+
 '<button data-ops-action="crew-delete" data-id="'+esc(x.id)+'" type="button">Remove</button></div></article>';
 }).join(''):'<div class="tf-ops-empty">No team members yet. Add a display name to organize local job assignments.</div>');
 content+='<div class="tf-ops-rowhead"><h2>Job assignments</h2><button data-tab="jobs" type="button" class="tf-ops-secondary">Open Jobs ↗</button></div>';
 content+=(jobs.length?jobs.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))).slice(0,70).map(job=>
 '<form id="tfOpsAssignForm" data-id="'+esc(job.id)+'" class="tf-ops-listitem tf-ops-job"><div>'+jobLink(job,d)+'</div>'+
 '<label><span>Assigned to</span><select name="crewId">'+optionCrew(members,job.crewId||'')+'</select></label>'+
 '<button class="tf-ops-secondary" type="submit">Save</button></form>').join(''):
 '<div class="tf-ops-empty">No jobs yet. Create and schedule jobs to assign them to a crew member.</div>')+
 '<p class="tf-ops-note">This is a single-device planning board. Assigning a person here does not notify them or synchronize their phone.</p></div>';
 return content;
}
function routeStops(d,plan){
 const ids=Array.isArray(plan.jobIds)?plan.jobIds:[];
 const ordered=ids.map(id=>(d.jobs||[]).find(x=>x.id===id)).filter(Boolean);
 return ordered.map((job,i)=>{
  const a=address(job,d);
  return '<article class="tf-ops-stop"><div class="tf-ops-stopnumber">'+(i+1)+'</div><div class="tf-ops-stoptext"><strong>'+esc(job.title||'Job')+'</strong><small>'+
   esc(a||'Address missing — cannot use directions')+'</small></div>'+
   '<div class="tf-ops-stopcontrols">'+(i>0?'<button data-ops-action="stop-up" data-id="'+esc(job.id)+'" type="button" aria-label="Move '+esc(job.title||'job')+' earlier">↑</button>':'')+
   (i<ordered.length-1?'<button data-ops-action="stop-down" data-id="'+esc(job.id)+'" type="button" aria-label="Move '+esc(job.title||'job')+' later">↓</button>':'')+
   '<button data-ops-action="stop-remove" data-id="'+esc(job.id)+'" type="button" aria-label="Remove stop">×</button></div></article>';
 }).join('');
}
function routeUrl(d,plan){
 if(!plan||!Array.isArray(plan.jobIds))return '';
 const jobs=plan.jobIds.map(id=>(d.jobs||[]).find(j=>j.id===id)).filter(Boolean);
 if(jobs.length<2||jobs.length>4||jobs.some(x=>!address(x,d)))return '';
 const addrs=jobs.map(x=>address(x,d));
 const url=new URL('https://www.google.com/maps/dir/');
 url.searchParams.set('api','1');
 url.searchParams.set('origin',addrs[0]);
 url.searchParams.set('destination',addrs[addrs.length-1]);
 if(addrs.length>2)url.searchParams.set('waypoints',addrs.slice(1,-1).join('|'));
 url.searchParams.set('travelmode','driving');
 return url.toString();
}
function routes(d){
 const members=d.crew||[],jobs=d.jobs||[],plans=d.routePlans||[];
 let content='<div class="tf-ops-rowhead"><h2>Manual route plans</h2><button class="tf-ops-primary" type="button" data-ops-action="route-new">+ New route</button></div>';
 if(planOpen){
  content+='<form id="tfOpsPlanForm" class="tf-ops-panel"><h3>Plan a field-service itinerary</h3>'+
  '<label>Route name<input name="name" maxlength="110" required placeholder="Morning site visits"></label>'+
  '<div class="tf-ops-two"><label>Date<input name="date" type="date" required value="'+esc(activeDate)+'"></label>'+
  '<label>Crew member<select name="crewId">'+optionCrew(members,'')+'</select></label></div>'+
  '<div class="tf-ops-actions"><button type="submit" class="tf-ops-primary">Create route</button><button type="button" data-ops-action="route-cancel" class="tf-ops-secondary">Cancel</button></div>'+
  '<p class="tf-ops-note">Routes are manually sequenced. TradeFlow does not calculate driving time, traffic, fuel or optimal stop order.</p></form>';
 }
 if(planId){
  const plan=plans.find(p=>p.id===planId);
  if(plan){
   const selected=Array.isArray(plan.jobIds)?plan.jobIds:[];
   const remaining=jobs.filter(j=>!selected.includes(j.id));
   const url=routeUrl(d,plan),crew=members.find(x=>x.id===plan.crewId);
   content+='<section class="tf-ops-panel"><button data-ops-action="route-close" class="tf-ops-back" type="button">‹ All routes</button>'+
   '<div class="tf-ops-cardhead"><div><h3>'+esc(plan.name||'Route')+'</h3><p>'+esc(plan.date||'Unscheduled')+' · '+esc(crew?.name||'Unassigned')+'</p></div>'+
   '<span class="tf-ops-pill">Manually ordered</span></div>'+
   '<div class="tf-ops-stoplist">'+(selected.length?routeStops(d,plan):'<div class="tf-ops-empty">No stops selected yet. Add jobs in the intended visit order.</div>')+'</div>'+
   (remaining.length&&selected.length<4?'<form id="tfOpsStopForm" data-id="'+esc(plan.id)+'" class="tf-ops-addstop"><label>Add a job stop<select name="jobId">'+
    remaining.map(j=>'<option value="'+esc(j.id)+'">'+esc(j.title||'Job')+' · '+esc(address(j,d)||'No address')+'</option>').join('')+
    '</select></label><button class="tf-ops-secondary" type="submit">Add stop</button></form>':
    '<p class="tf-ops-note">'+(selected.length>=4?'Four-stop limit for reliable mobile direction links.':'All saved jobs are on this route.')+'</p>')+
   (url?'<a class="tf-ops-primary" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Open driving directions ↗</a>':
   '<p class="tf-ops-note">To open directions, choose 2–4 jobs and ensure all stops have valid addresses.</p>')+
   '<p class="tf-ops-note">Google Maps calculates its own directions. This list does not optimize crew or route order, and it does not track anyone.</p>'+
   '<button data-ops-action="route-delete" data-id="'+esc(plan.id)+'" class="tf-ops-danger" type="button">Delete route plan</button></section>';
   return content;
  }
  planId='';
 }
 content+=(plans.length?plans.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))).map(p=>{
 const member=members.find(x=>x.id===p.crewId);
 return '<button type="button" class="tf-ops-listitem tf-ops-route" data-ops-action="route-open" data-id="'+esc(p.id)+'"><span><strong>'+esc(p.name||'Route')+
 '</strong><small>'+esc(p.date||'Unscheduled')+' · '+esc(member?.name||'Unassigned')+' · '+(p.jobIds||[]).length+' stops</small></span><span>›</span></button>';
 }).join(''):'<div class="tf-ops-empty">No routes saved. Create a route and select existing jobs in the order you want to visit them.</div>')+
 '<div class="tf-ops-explain"><strong>Map and calendar remain separate views</strong><p>Save a visit in Calendar, create a route here, and use external navigation for driving. Automated dispatch and live crew locations require connected accounts and employee consent.</p>'+
 '<div class="tf-ops-actions"><button data-tab="map" class="tf-ops-secondary" type="button">Open Map ↗</button><button data-tab="calendar" class="tf-ops-secondary" type="button">Open Calendar ↗</button></div></div>';
 return content;
}
const connectors=[
 ['Accounting','QuickBooks Online','Not connected','Two-way synchronization requires Intuit OAuth, tenant isolation, change reconciliation and a secure server.'],
 ['Payments','Stripe / payment provider','Not connected','Online checkout, transfers and bank/card verification need authorized accounts and payment webhooks.'],
 ['Messaging','Email and SMS','Not connected','Automatic sends require authenticated provider credentials, consent controls, opt-outs and delivery logs.'],
 ['Marketing','Google and Meta advertising','Not connected','Publishing or changing ad spend requires a connected advertising account and approval.'],
 ['Scheduling','Dispatch and route optimization','Not connected','Automatic scheduling needs travel-time providers, crew constraints and agreed location permissions.'],
 ['Workforce','Live crew tracking','Not connected','Requires each worker’s informed permission and a secure, shared account model.']
];
function csv(v){const s=String(v==null?'':v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function accountingCsv(d){
 const rows=[['record_type','source_id','date','description','amount_eur','customer_id','job_id','currency']];
 for(const p of d.payments||[])rows.push(['received_payment',p.id,p.date||'',p.source||p.title||'Income',Number(p.amount)||0,p.customerId||'',p.jobId||'','EUR']);
 for(const e of d.expenses||[])rows.push(['expense',e.id,e.date||'',e.vendor||e.title||e.category||'Expense',Number(e.amount)||0,'',e.relatedId||'','EUR']);
 return rows.map(r=>r.map(csv).join(',')).join('\r\n');
}
function integrationPage(d){
 return '<section class="tf-ops-page"><button class="tf-ops-back" data-tab="settings" type="button">‹ More</button>'+
 head('Integrations','A clear status board for future connected services and manual exports.')+tabbar('integrations')+
 '<div class="tf-ops-explain"><strong>Account protection comes first</strong><p>TradeFlow currently stores your business records on this device. Third-party services cannot sync securely without account authentication, server-side authorization, and consent. Never enter banking credentials or API secrets into these local forms.</p></div>'+
 '<div class="tf-ops-rowhead"><h2>External services</h2><span class="tf-ops-pill">0 connected</span></div>'+
 connectors.map(([cat,title,status,desc])=>'<article class="tf-ops-listitem tf-ops-integration"><div><small>'+esc(cat.toUpperCase())+'</small><strong>'+esc(title)+'</strong><p>'+esc(desc)+'</p></div><span class="tf-ops-pill">'+esc(status)+'</span></article>').join('')+
 '<section class="tf-ops-panel"><h3>Manual accounting export</h3><p>Download a generic CSV of manually recorded income and expenses. This is not QuickBooks sync or a certified accounting export; review currencies, dates, categories and accuracy before importing elsewhere.</p>'+
 '<button class="tf-ops-secondary" data-ops-action="csv-export" type="button">Export recorded transactions CSV</button></section>'+
 '<section class="tf-ops-panel"><h3>Review follow-up helper</h3><p>Convert completed jobs into local review follow-up Tasks. No customer receives an unsolicited message; you decide whether to contact them.</p>'+
 '<button data-ops-action="review-tasks" type="button" class="tf-ops-secondary">Create review preparation Tasks</button></section>'+
 '<div class="tf-ops-explain"><strong>Next integration milestone</strong><p>Design secure business accounts, team permissions, encrypted storage, audit logs and a verified webhook queue before adding external sync. External connections shown above are only planned capabilities.</p></div></section>';
}
function render(tab,d){
 if(tab==='dispatch')return roster(d);
 if(tab==='integrations')return integrationPage(d);
 return '';
}
function exportCsv(d){
 const content=accountingCsv(d),blob=new Blob([content],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tradeflow-manual-finance-'+today()+'.csv';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function reviewTasks(){
 const jobs=await api.all('jobs'),existing=new Set((await api.all('tasks')).filter(t=>t.reviewJobId).map(t=>t.reviewJobId));let added=0;
 for(const job of jobs.filter(j=>j.status==='Completed')){
  if(existing.has(job.id))continue;
  const name=(await api.get('customers',job.customerId))?.name||'customer';
  const rec={id:api.uid(),title:'Review follow-up: '+trim(job.title||'Completed job',90),description:
    'Check whether '+trim(name,80)+' may appropriately receive a neutral, optional Google review request. Verify their preferences and use a genuine review link. Do not offer incentives, filter negative reviews or send automatically.',
    due:today(),status:'Open',reviewJobId:job.id,createdAt:new Date().toISOString()};
  await api.put('tasks',rec);existing.add(job.id);added++;
 }
 api.notify(added+' local review follow-up Task'+(added===1?'':'s')+' created');
}
async function onClick(ev){
 if(!api)return;
 const b=ev.target.closest?.('[data-ops-action]');if(!b)return;
 ev.preventDefault();
 const action=b.dataset.opsAction,id=b.dataset.id;
 try{
  if(action==='section'){section=b.dataset.section==='routes'?'routes':'crew';planId='';api.render();return}
  if(action==='crew-new'){crewFormOpen=true;crewEditId='';api.render();return}
  if(action==='crew-edit'){crewFormOpen=true;crewEditId=id;api.render();return}
  if(action==='crew-cancel'){crewFormOpen=false;crewEditId='';api.render();return}
  if(action==='crew-delete'){
   if((await api.all('jobs')).some(x=>x.crewId===id)||(await api.all('routePlans')).some(x=>x.crewId===id)){
    throw Error('Reassign linked jobs and route plans before deleting this member.');
   }
   if(!confirm('Delete this local team profile?'))return;
   await api.del('crew',id);api.notify('Crew member removed');return;
  }
  if(action==='route-new'){section='routes';planOpen=true;planId='';api.render();return}
  if(action==='route-cancel'){planOpen=false;api.render();return}
  if(action==='route-open'){section='routes';planId=id;planOpen=false;api.render();return}
  if(action==='route-close'){planId='';api.render();return}
  if(action==='route-delete'){
   if(!confirm('Delete this local route plan?'))return;
   await api.del('routePlans',id);planId='';api.notify('Route plan deleted');return;
  }
  if(['stop-up','stop-down','stop-remove'].includes(action)){
   const p=await api.get('routePlans',planId);if(!p)return;
   const stops=[...(p.jobIds||[])],index=stops.indexOf(id);
   if(index<0)return;
   if(action==='stop-remove')stops.splice(index,1);
   else{
    const other=index+(action==='stop-up'?-1:1);
    if(other<0||other>=stops.length)return;
    [stops[index],stops[other]]=[stops[other],stops[index]];
   }
   p.jobIds=stops;p.updatedAt=new Date().toISOString();
   await api.put('routePlans',p);api.render();return;
  }
  if(action==='csv-export'){
   const payments=await api.all('payments'),expenses=await api.all('expenses');
   if(!payments.length&&!expenses.length){api.notify('No recorded transactions to export');return}
   if(!confirm('Export a plain CSV of local transactions? Keep downloaded financial information private.'))return;
   exportCsv({payments,expenses});return;
  }
  if(action==='review-tasks'){await reviewTasks();return}
 }catch(error){alert('Operations action failed: '+error.message)}
}
async function onSubmit(ev){
 if(!api)return;
 const form=ev.target,id=form.dataset.id;
 if(!['tfOpsCrewForm','tfOpsAssignForm','tfOpsPlanForm','tfOpsStopForm'].includes(form.id))return;
 ev.preventDefault();
 const fd=new FormData(form),v=(key,n)=>trim(fd.get(key),n);
 try{
  if(form.id==='tfOpsCrewForm'){
   const name=v('name',90),role=v('role',90),notes=v('notes',350);
   if(!name)throw Error('Enter a crew member name.');
   const exists=crewEditId?await api.get('crew',crewEditId):null;
   if(crewEditId&&!exists)throw Error('Crew member no longer exists.');
   if(!exists&&(await api.all('crew')).length>=100)throw Error('Maximum 100 crew members.');
   await api.put('crew',{...exists,id:exists?.id||api.uid(),name,role,notes,updatedAt:new Date().toISOString()});
   crewFormOpen=false;crewEditId='';api.notify('Crew member saved');return;
  }
  if(form.id==='tfOpsAssignForm'){
   const job=await api.get('jobs',id);if(!job)throw Error('Job no longer exists.');
   const crewId=v('crewId',120);
   if(crewId&&!(await api.get('crew',crewId)))throw Error('Choose an existing crew member.');
   await api.put('jobs',{...job,crewId,updatedAt:new Date().toISOString()});
   api.notify('Job assignment saved locally');return;
  }
  if(form.id==='tfOpsPlanForm'){
   const name=v('name',110),date=v('date',10),crewId=v('crewId',120);
   if(!name||!validDate(date))throw Error('Enter a route name and valid date.');
   if(crewId&&!(await api.get('crew',crewId)))throw Error('Unknown crew member.');
   if((await api.all('routePlans')).length>=120)throw Error('Maximum 120 routes.');
   const plan={id:api.uid(),name,date,crewId,jobIds:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
   await api.put('routePlans',plan);planId=plan.id;planOpen=false;api.notify('Manual route plan created');return;
  }
  const plan=await api.get('routePlans',id);if(!plan)throw Error('Route plan unavailable.');
  const jobId=v('jobId',120);if(!(await api.get('jobs',jobId)))throw Error('Job not found.');
  const ids=[...(plan.jobIds||[])];if(ids.includes(jobId))throw Error('Job already on route.');
  if(ids.length>=4)throw Error('Route supports a maximum of 4 stops.');
  ids.push(jobId);plan.jobIds=ids;plan.updatedAt=new Date().toISOString();
  await api.put('routePlans',plan);api.notify('Route stop added');
 }catch(error){alert('Could not save: '+error.message)}
}
function configure(bridge){api=bridge;document.addEventListener('click',onClick);document.addEventListener('submit',onSubmit)}
global.TradeFlowOperations={configure,render,_test:{routeUrl,accountingCsv,validDate,esc,address}};
})(typeof window!=='undefined'?window:globalThis);
