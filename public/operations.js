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
 '<button type="button" data-tab="dispatch" class="'+(current==='dispatch'?'active':'')+'">Crew &amp; Dispatch</button>'+
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

let assignmentJobId='',crewExpanded=false,unassignedExpanded=false,assignmentPickerOpen=false;
const svg=(path)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="23" height="23" aria-hidden="true">'+path+'</svg>';
const icons={
 calendar:svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>'),
 job:svg('<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 13h18"/>'),
 crew:svg('<circle cx="8.5" cy="8" r="3"/><path d="M2.5 20v-1a6 6 0 0 1 12 0v1M17 5a3 3 0 0 1 0 6m0 4c3 0 5 2 5 5"/>'),
 alert:svg('<path d="m12 3 10 18H2L12 3Z"/><path d="M12 10v4m0 3h.01"/>'),
 pin:svg('<path d="M12 22s8-7 8-14a8 8 0 0 0-16 0c0 7 8 14 8 14Z"/><circle cx="12" cy="9" r="2.5"/>')
};
const validTime=v=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v||'');
function scheduledDate(j){return trim(j.date||j.scheduledDate||'',10)}
function scheduledTime(j){return trim(j.startTime||j.time||'',5)}
function duration(j){const n=Number(j.durationMinutes||j.estimatedDurationMinutes||0);return Number.isInteger(n)&&n>0&&n<=1440?n:null}
function intervalsOverlap(a,b){return a.start<b.end&&b.start<a.end}
function minutes(s){return Number(s.slice(0,2))*60+Number(s.slice(3,5))}
function jobWindow(j){
 const start=scheduledTime(j),len=duration(j);
 if(!validTime(start)||!len)return null;
 return {start:minutes(start),end:minutes(start)+len};
}
function isActive(job){return !['Completed','Cancelled','Canceled'].includes(job.status||'')}
function conflictsFor(job,jobs){
 if(!isActive(job)||!job.crewId||!validDate(scheduledDate(job)))return [];
 const time=jobWindow(job);if(!time)return [];
 return (jobs||[]).filter(other=>other.id!==job.id&&isActive(other)&&other.crewId===job.crewId&&scheduledDate(other)===scheduledDate(job)&&jobWindow(other)&&intervalsOverlap(time,jobWindow(other)));
}
function crewDay(crew,day,jobs){
 const assigned=(jobs||[]).filter(x=>isActive(x)&&x.crewId===crew.id&&scheduledDate(x)===day);
 const leave=Array.isArray(crew.daysOff)?crew.daysOff.includes(day):false;
 const weekday=new Date(day+'T12:00:00').getDay();
 const hasWorkDays=Array.isArray(crew.workDays)&&crew.workDays.length>0;
 const scheduled=hasWorkDays?crew.workDays.map(Number).includes(weekday):false;
 const availability=leave?'Off duty':!hasWorkDays?'Unknown':scheduled?(assigned.length?'Assigned':'Available'):'Off duty';
 return {jobs:assigned.length,availability,leave,explicit:hasWorkDays};
}
function dispatchSummary(d,day){
 const jobs=(d.jobs||[]).filter(x=>isActive(x)&&scheduledDate(x)===day);
 const crew=d.crew||[],validIds=new Set(crew.map(x=>x.id));
 const assigned=jobs.filter(x=>validIds.has(x.crewId)),unassigned=jobs.filter(x=>!validIds.has(x.crewId));
 const states=crew.map(x=>crewDay(x,day,d.jobs||[]));
 const available=states.filter(x=>x.availability==='Available').length;
 const known=states.filter(x=>x.availability!=='Unknown').length;
 const conflicts=assigned.flatMap(job=>conflictsFor(job,d.jobs||[]).map(other=>[job.id,other.id].sort().join(':')));
 return {jobs,assigned,unassigned,crew,states,available,known,conflicts:[...new Set(conflicts)]};
}
function initials(name){return trim(name||'',100).split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'—'}
function dayLabel(day){return new Date(day+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
function shiftDay(day,n){const x=new Date(day+'T12:00:00');x.setDate(x.getDate()+n);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
function memberBadge(crew,day,jobs){
 const info=crewDay(crew,day,jobs);
 const tone=info.availability==='Available'?'available':info.availability==='Off duty'?'off':info.availability==='Assigned'?'working':'unknown';
 return '<span class="tf-d-v2-badge '+tone+'">'+esc(info.availability)+'</span>';
}
function crewEditor(members){
 const edit=members.find(x=>x.id===crewEditId)||{};
 const days=Array.isArray(edit.workDays)?edit.workDays.map(Number):[];
 return '<form id="tfOpsCrewForm" class="tf-ops-panel tf-d-v2-editor"><h3>'+esc(edit.id?'Edit crew member':'Add crew member')+'</h3>'+
 '<label>Team member name<input name="name" maxlength="90" required value="'+esc(edit.name||'')+'" placeholder="Name or display name"></label>'+
 '<label>Role / primary skill<input name="role" maxlength="90" value="'+esc(edit.role||'')+'" placeholder="Electrician, apprentice, project manager"></label>'+
 '<label>Skills / certifications (comma separated)<input name="skills" maxlength="240" value="'+esc((edit.skills||[]).join(', '))+'" placeholder="Panel upgrades, HVAC controls"></label>'+
 '<label>Service area<input name="serviceArea" maxlength="140" value="'+esc(edit.serviceArea||'')+'" placeholder="Austin metro"></label>'+
 '<fieldset class="tf-d-v2-week"><legend>Normal working days (optional)</legend>'+
 ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day,index)=>'<label><input type="checkbox" name="workDay'+index+'" '+(days.includes(index)?'checked':'')+'><span>'+day+'</span></label>').join('')+'</fieldset>'+
 '<p class="tf-ops-note">If working days are not defined, availability displays Unknown rather than assuming the worker is free.</p>'+
 '<label>Days off (YYYY-MM-DD, comma separated)<input name="daysOff" maxlength="420" value="'+esc((edit.daysOff||[]).join(', '))+'" placeholder="2026-10-20, 2026-10-21"></label>'+
 '<label>Notes (optional)<textarea name="notes" maxlength="350" rows="2">'+esc(edit.notes||'')+'</textarea></label>'+
 '<div class="tf-ops-actions"><button type="submit" class="tf-ops-primary">Save member</button><button type="button" data-ops-action="crew-cancel" class="tf-ops-secondary">Cancel</button></div>'+
 '<p class="tf-ops-note">Records stay local. No live location tracking, employee account, or automatic notification is created.</p></form>';
}
function assignmentForm(d){
 const job=(d.jobs||[]).find(j=>j.id===assignmentJobId);
 if(!job)return '';
 const members=d.crew||[],date=scheduledDate(job)||activeDate,start=scheduledTime(job),len=duration(job);
 return '<form id="tfOpsAssignForm" data-id="'+esc(job.id)+'" class="tf-ops-panel tf-d-v2-editor">'+
 '<h3>Assign &amp; schedule job</h3><p>'+esc(job.title||'Untitled job')+'</p>'+
 '<label>Crew member<select name="crewId">'+optionCrew(members,job.crewId||'')+'</select></label>'+
 '<div class="tf-ops-two"><label>Service date<input type="date" required name="date" value="'+esc(date)+'"></label>'+
 '<label>Start time (optional)<input type="time" name="startTime" value="'+esc(start)+'"></label></div>'+
 '<label>Estimated duration (minutes)<input type="number" name="durationMinutes" min="15" max="1440" step="15" value="'+esc(len||'')+'" placeholder="120"></label>'+
 '<p class="tf-ops-note">Time-based conflicts are checked only when dates, start times and durations are recorded. Changes are local and will appear in saved Jobs and Calendar views.</p>'+
 '<div class="tf-ops-actions"><button type="submit" class="tf-ops-primary">Save assignment</button><button type="button" data-ops-action="assign-close" class="tf-ops-secondary">Cancel</button></div></form>';
}
function roster(d){
 const crew=d.crew||[],jobs=d.jobs||[],summary=dispatchSummary(d,activeDate);
 const sorted=summary.jobs.slice().sort((a,b)=>scheduledTime(a).localeCompare(scheduledTime(b))||String(a.title||'').localeCompare(String(b.title||'')));
 const unscheduled=jobs.filter(j=>isActive(j)&&!scheduledDate(j));
 const memberMap=new Map(crew.map(c=>[c.id,c]));
 const metric=(label,value,desc,icon,tone)=>'<div class="tf-d-v2-metric"><span class="tf-d-v2-metric-icon '+(tone||'')+'">'+icons[icon]+'</span>'+
 '<span class="tf-d-v2-metric-text"><small>'+label+'</small><strong>'+value+'</strong><em>'+desc+'</em></span></div>';
 let out='<section class="tf-ops-page tf-dispatch-v2">'+
 '<header class="tf-d-v2-heading"><div><span class="tf-ops-kicker">TRADEFLOW / BUSINESS OPERATIONS</span><h1>Crew &amp; Dispatch</h1>'+
 '<p>Coordinate people, jobs and schedules in one place.</p></div><span class="tf-d-v2-hero">'+icons.crew+'</span></header>'+
 '<div class="tf-d-v2-metrics">'+
 metric('Scheduled '+(activeDate===today()?'today':'jobs'),String(summary.jobs.length),'Jobs on '+dayLabel(activeDate),'calendar')+
 metric('Assigned jobs',String(summary.assigned.length),'Scheduled on selected day','job')+
 metric('Unassigned',String(summary.unassigned.length),'Scheduled without valid crew','alert','amber')+
 metric('Available crew',summary.available+' / '+crew.length,summary.known+' members with known status','crew')+'</div>'+
 '<section class="tf-d-v2-panel"><div class="tf-d-v2-head"><h2>Daily dispatch</h2><div class="tf-d-v2-date">'+
 '<button data-ops-action="day-prev" type="button" aria-label="Previous day">‹</button>'+
 '<label class="tf-d-v2-date-field"><span class="tf-d-v2-date-label">Dispatch date</span><input type="date" id="tfOpsDispatchDate" value="'+esc(activeDate)+'" aria-label="Dispatch date"></label>'+
 '<button data-ops-action="day-next" type="button" aria-label="Next day">›</button></div>'+
 '<button data-tab="calendar" type="button" class="tf-d-v2-link">Calendar ↗</button></div>'+
 (sorted.length?'<div class="tf-d-v2-schedule">'+sorted.map(job=>{
  const member=memberMap.get(job.crewId),conflicts=conflictsFor(job,jobs),time=scheduledTime(job),len=duration(job);
  const badge=conflicts.length?'Time conflict':member?esc(job.status||'Assigned'):'Unassigned';
  const tone=conflicts.length?'conflict':member?'working':'unassigned';
  return '<button type="button" class="tf-d-v2-visit" data-ops-action="assign-open" data-id="'+esc(job.id)+'">'+
  '<span class="tf-d-v2-when"><strong>'+esc(time||'—:—')+'</strong><small>'+(len?Math.floor(len/60)+'h '+(len%60?len%60+'m':''):'Time not set')+'</small></span>'+
  '<span class="tf-d-v2-visit-line '+tone+'"></span>'+
  '<span class="tf-d-v2-visit-main"><strong>'+esc(job.title||'Untitled job')+'</strong><small>'+icons.pin+esc(address(job,d)||'Address not recorded')+'</small></span>'+
  '<span class="tf-d-v2-assignee"><span class="tf-d-v2-avatar">'+esc(member?initials(member.name):'—')+'</span><span class="tf-d-v2-assignee-info"><strong>'+esc(member?.name||'Unassigned')+'</strong>'+
  '<em class="tf-d-v2-badge '+tone+'">'+esc(badge)+'</em></span></span><span class="tf-d-v2-chevron">›</span></button>';
 }).join('')+'</div>':'<div class="tf-ops-empty">No scheduled jobs for '+esc(dayLabel(activeDate))+'. Add a date to a saved Job to see it here.</div>')+
 '<p class="tf-d-v2-caption">Time conflicts are identified from saved job schedules. No live GPS, traffic, travel estimates or crew notifications.</p></section>'+
 '<section class="tf-d-v2-section"><div class="tf-d-v2-head"><h2>Team roster</h2>'+
 '<button type="button" class="tf-d-v2-link" data-ops-action="crew-toggle">'+(crewExpanded?'Show less':'View all')+' →</button></div>'+
 (crew.length?'<div class="tf-d-v2-roster">'+(crewExpanded?crew:crew.slice(0,3)).map(member=>{
  const info=crewDay(member,activeDate,jobs);
  return '<button type="button" class="tf-d-v2-member" data-ops-action="crew-edit" data-id="'+esc(member.id)+'">'+
  '<span class="tf-d-v2-avatar">'+esc(initials(member.name))+'</span><strong>'+esc(member.name)+'</strong>'+
  '<small>'+esc(member.role||'Crew member')+'</small>'+memberBadge(member,activeDate,jobs)+
  '<span class="tf-d-v2-member-foot">'+info.jobs+' job'+(info.jobs===1?'':'s')+' on selected day ↗</span></button>';
 }).join('')+'</div>':'<div class="tf-ops-empty">No crew members recorded. Add your team to begin assigning work.</div>')+
 '<button type="button" class="tf-ops-secondary tf-d-v2-small-action" data-ops-action="crew-new">+ Crew member</button></section>'+
 '<section class="tf-d-v2-section"><div class="tf-d-v2-head"><h2>Unassigned jobs</h2><button type="button" class="tf-d-v2-link" data-ops-action="unassigned-toggle">'+(unassignedExpanded?'Show less':'View all')+' →</button></div>'+
 '<p class="tf-d-v2-section-sub">'+summary.unassigned.length+' scheduled for '+esc(dayLabel(activeDate))+' without crew'+(unscheduled.length?' · '+unscheduled.length+' without a date':'')+'</p>'+
 ((summary.unassigned.length||unscheduled.length)?'<div class="tf-d-v2-unassigned-list">'+
 (unassignedExpanded?[...summary.unassigned,...unscheduled]:[...summary.unassigned,...unscheduled].slice(0,3)).map(job=>
 '<button type="button" class="tf-d-v2-unassigned" data-ops-action="assign-open" data-id="'+esc(job.id)+'"><span class="tf-d-v2-unassigned-icon">'+icons.job+'</span>'+
 '<span class="tf-d-v2-unassigned-copy"><strong>'+esc(job.title||'Untitled job')+'</strong><small>'+esc(scheduledDate(job)||'Not scheduled')+' · '+esc(scheduledTime(job)||'Time pending')+'</small>'+
 '<small>'+esc(address(job,d)||'Address not recorded')+'</small></span><span class="tf-d-v2-unassigned-cta">Assign →</span></button>').join('')+
 '</div>':'<div class="tf-ops-empty">No unassigned jobs in this view.</div>')+'</section>'+
 (crewFormOpen?crewEditor(crew):'')+(assignmentJobId?assignmentForm(d):'')+
 (assignmentPickerOpen?'<section class="tf-ops-panel"><h3>Select a job to assign</h3><div class="tf-d-v2-picker">'+jobs.filter(isActive).slice(0,150).map(j=>
 '<button type="button" data-ops-action="assign-open" data-id="'+esc(j.id)+'">'+esc(j.title||'Untitled job')+' · '+esc(scheduledDate(j)||'Unscheduled')+'</button>').join('')+
 '</div><button type="button" data-ops-action="assign-close" class="tf-ops-secondary">Close</button></section>':'')+
 '<button type="button" data-ops-action="assign-pick" class="tf-d-v2-primary">＋ Assign job</button>'+
 '<p class="tf-d-v2-caption">Local-first planning. Availability only becomes known after working days are entered. Updating dispatch saves to Jobs; Calendar can display those scheduled jobs. Future AI voice and silent recommendations will use the same records but are not yet active.</p></section>';
 return out;
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
  if(action==='day-prev'||action==='day-next'){activeDate=shiftDay(activeDate,action==='day-prev'?-1:1);api.render();return}
  if(action==='crew-toggle'){crewExpanded=!crewExpanded;api.render();return}
  if(action==='unassigned-toggle'){unassignedExpanded=!unassignedExpanded;api.render();return}
  if(action==='assign-pick'){assignmentPickerOpen=true;assignmentJobId='';api.render();return}
  if(action==='assign-open'){assignmentJobId=id;assignmentPickerOpen=false;api.render();return}
  if(action==='assign-close'){assignmentJobId='';assignmentPickerOpen=false;api.render();return}
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
   const rawSkills=v('skills',240),skills=rawSkills?rawSkills.split(',').map(x=>trim(x,50)).filter(Boolean).slice(0,15):[];
   const serviceArea=v('serviceArea',140),rawDays=v('daysOff',420);
   const daysOff=rawDays?rawDays.split(',').map(x=>trim(x,10)).filter(Boolean):[];
   if(daysOff.length>35||daysOff.some(x=>!validDate(x)))throw Error('Enter valid comma-separated days off (YYYY-MM-DD).');
   const workDays=[0,1,2,3,4,5,6].filter(index=>fd.get('workDay'+index)==='on');

   if(!name)throw Error('Enter a crew member name.');
   const exists=crewEditId?await api.get('crew',crewEditId):null;
   if(crewEditId&&!exists)throw Error('Crew member no longer exists.');
   if(!exists&&(await api.all('crew')).length>=100)throw Error('Maximum 100 crew members.');
   await api.put('crew',{...exists,id:exists?.id||api.uid(),name,role,notes,skills,serviceArea,workDays,daysOff,updatedAt:new Date().toISOString()});
   crewFormOpen=false;crewEditId='';api.notify('Crew member saved');return;
  }
  if(form.id==='tfOpsAssignForm'){
   const job=await api.get('jobs',id);if(!job)throw Error('Job no longer exists.');
   const crewId=v('crewId',120),date=v('date',10),startTime=v('startTime',5),rawDuration=v('durationMinutes',6);
   if(!validDate(date))throw Error('Choose a valid scheduled date.');
   if(startTime&&!validTime(startTime))throw Error('Invalid start time.');
   const durationMinutes=rawDuration?Number(rawDuration):null;
   if(durationMinutes!==null&&(!Number.isInteger(durationMinutes)||durationMinutes<15||durationMinutes>1440))throw Error('Choose duration between 15 and 1,440 minutes.');
   if(startTime&&durationMinutes===null)throw Error('Add an estimated duration when specifying a start time.');
   if(durationMinutes!==null&&!startTime)throw Error('Add a start time when specifying a duration.');
   const crew=crewId?await api.get('crew',crewId):null;
   if(crewId&&!crew)throw Error('Choose an existing crew member.');
   const updated={...job,crewId,date,startTime,durationMinutes,updatedAt:new Date().toISOString()};
   const conflicts=conflictsFor(updated,await api.all('jobs'));
   if(conflicts.length)throw Error('Time conflict with '+conflicts.map(x=>x.title||'another job').slice(0,3).join(', ')+'. Adjust the schedule or choose another crew member.');
   if(crew){
    const info=crewDay(crew,date,[updated]);
    if(info.availability==='Off duty'&&!confirm('This crew member is marked off duty on '+date+'. Assign anyway?'))return;
   }
   await api.put('jobs',updated);
   assignmentJobId='';assignmentPickerOpen=false;
   api.notify('Job assignment and schedule saved locally');return;
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
function onChange(ev){
 if(!api||ev.target?.id!=='tfOpsDispatchDate')return;
 if(!validDate(ev.target.value))return;
 activeDate=ev.target.value;api.render();
}
function configure(bridge){api=bridge;document.addEventListener('click',onClick);document.addEventListener('submit',onSubmit);document.addEventListener('change',onChange)}
global.TradeFlowOperations={configure,render,_test:{routeUrl,accountingCsv,validDate,esc,address,validTime,scheduledDate,scheduledTime,jobWindow,conflictsFor,crewDay,dispatchSummary,shiftDay}};
})(typeof window!=='undefined'?window:globalThis);
