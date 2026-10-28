/* TradeFlow Notifications v1 — compact, local and actionable.
   No push service: notices are derived solely from saved records when the app renders.
   The red dot reflects genuinely unread entries, not a hardcoded indicator. */
(function(global){
'use strict';
const KEY='tf-notifications-v1';
const MAX_SEEN=650;
const DAY=86400000;
const routes=new Set(['dashboard','growth','missions','tasks','calendar','opportunities','quotes','jobs','customers','expenses','invoices','research','marketing','settings','dispatch']);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=v=>String(v==null?'':v).trim().slice(0,160);
const dateToday=now=>{const d=new Date(now);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const parseTime=v=>{let n=new Date(v).getTime();return Number.isFinite(n)?n:0};
const fingerprint=s=>{let x=2166136261;for(let i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,16777619)}return (x>>>0).toString(36)};
let api=null,open=false,working=false,lastData=null,obligationEditor=false;
const obligationTypes=Object.freeze({license:'License or certification',insurance:'Insurance certificate',bid:'Bid deadline',supplier_quote:'Supplier quote expiration',retainage:'Retainage follow-up',service_agreement:'Service agreement renewal',closeout:'Project closeout',other:'Other deadline'});
function intelligenceItems(report,data={}){
 if(!report||!Array.isArray(report.findings))return [];
 const labels={'calendar.conflict':['Scheduling conflict','calendar'],'invoice.overdue':['Overdue invoice','invoices'],'quotation.accepted_handoff':['Accepted quote needs job','quotes'],'quotation.stale_open':['Quotation follow-up review','quotes'],'job.billing_review':['Completed job billing review','jobs'],'job.unapproved_change_review':['Proposed extra work needs approval','jobs'],'job.material_readiness_review':['Materials not ready for upcoming job','jobs'],'job.closeout_evidence_review':['Completed job closeout needs review','jobs'],'job.crew_credential_review':['Crew credential requires verification','jobs'],'job.crew_assignment_review':['Crew assignment review','dispatch'],'opportunity.bid_deadline':['Upcoming bid submission deadline','opportunities'],'customer.reactivation_review':['Past customer relationship review','customers']};
 return report.findings.filter(f=>labels[f.detectorId]&&Array.isArray(f.recordRefs)&&f.recordRefs.length&&
  !(f.detectorId==='quotation.stale_open'&&(data.tasks||[]).some(t=>t.quoteId===f.recordRefs[0].id&&
    !['done','completed','cancelled','canceled'].includes(String(t.status||'').toLowerCase())&&validDate(t.due)))).map(f=>{
  const [title,route]=labels[f.detectorId];
  return {id:'priority:intelligence:'+safe(f.id),group:'priority',title,detail:safe(f.explanation),route,sort:f.priority?.tier===0?'0':f.detectorId==='invoice.overdue'?'1':'2',at:0,recordRef:f.recordRefs.length===1?{...f.recordRefs[0]}:null};
 });
}
function loadState(d){return (d.settings||[]).find(x=>x.id===KEY)||null}
function recent(d,now,days=21){const t=parseTime(d);return t&&t<=now+60000&&t>now-days*DAY}
function sourceEvents(d,now){
 const out=[];
 for(const item of d.events||[]){
  if(!item||!recent(item.date,now))continue;
  const title=safe(item.text);
  if(!title)continue;
  const id='activity:event:'+(item.id||fingerprint(title+'|'+item.date));
  const route=/quot|estimat/i.test(title)?'quotes':/customer|client/i.test(title)?'customers':
   /job|dispatch|crew/i.test(title)?'jobs':/opportunit|lead|prospect/i.test(title)?'opportunities':
   /invoice|payment|expense|income|revenue/i.test(title)?'expenses':/calendar|appointment|scheduled/i.test(title)?'calendar':
   /task|mission/i.test(title)?'tasks':'dashboard';
  out.push({id,group:'activity',title,detail:'Saved activity',route,at:parseTime(item.date),date:item.date});
 }
 // Opportunity batches have real import timestamps but might not produce general app events.
 const batches=new Map();
 for(const item of d.opportunities||[]){
  const at=parseTime(item.imported_at);
  if(!recent(item.imported_at,now))continue;
  const minute=String(item.imported_at).slice(0,16);
  if(!minute)continue;
  const prev=batches.get(minute)||{count:0,at:0};
  prev.count++;prev.at=Math.max(prev.at,at);
  batches.set(minute,prev);
 }
 for(const [minute,batch] of batches){
  out.push({id:'activity:import:'+minute,group:'activity',title:batch.count+' opportunit'+(batch.count===1?'y':'ies')+' imported',
   detail:'Review source evidence',route:'opportunities',at:batch.at,date:new Date(batch.at).toISOString()});
 }
 return out.sort((a,b)=>b.at-a.at).slice(0,9);
}
function generate(d,now=Date.now(),report=null){
 const day=dateToday(now),items=[],tasks=d.tasks||[],quotes=d.quotes||[],opportunities=d.opportunities||[];
 // Priority: due work must be real and unfinished. The ID changes only for a new deadline.
 for(const task of tasks){
  if(!task||['done','completed','cancelled','canceled'].includes(String(task.status||'').toLowerCase())||task.missionOrigin==='growth'||!validDate(task.due))continue;
  const obligation=task.taskType==='business_obligation',limit=new Date(day+'T12:00:00Z');
  limit.setUTCDate(limit.getUTCDate()+(obligation?14:0));
  if(task.due>limit.toISOString().slice(0,10))continue;
  const kind=obligation?(obligationTypes[task.obligationType]||'Business deadline'):'';
  items.push({id:'priority:task:'+safe(task.id||fingerprint(task.title))+'|'+task.due,
   group:'priority',title:obligation?kind:safe(task.title)||'Task due',detail:obligation?safe(task.title)+' · '+(task.due<day?'Overdue: ':'Due: ')+task.due:task.due<day?'Overdue · '+task.due:'Due today',route:'tasks',sort:task.due,at:0,recordRef:task.id?{store:'tasks',id:task.id}:null});
 }
 for(const item of opportunities){
  if(!item||['Won','Lost'].includes(item.status)||!validDate(item.followup_date)||item.followup_date>day)continue;
  items.push({id:'priority:op:'+safe(item.id||item.record_id)+'|'+item.followup_date,
   group:'priority',title:'Opportunity follow-up',detail:safe(item.project_name||item.organization_name)||'Review contact and next step',
   route:'opportunities',sort:item.followup_date,at:0,recordRef:item.id?{store:'opportunities',id:item.id}:null});
 }
 for(const quote of quotes){
  if(!quote||!['Sent','Pending','Awaiting'].includes(quote.status))continue;
  if(tasks.some(t=>t.quoteId===quote.id&&!['done','completed','cancelled','canceled'].includes(String(t.status||'').toLowerCase())&&validDate(t.due)))continue;
  const due=quote.followup_date||quote.followupDate;
  if(!validDate(due)||due>day)continue;
  items.push({id:'priority:quote:'+safe(quote.id)+'|'+due,group:'priority',title:'Quote follow-up',
   detail:safe(quote.title||quote.reference||'Sent quotation'),route:'quotes',sort:due,at:0,recordRef:quote.id?{store:'quotes',id:quote.id}:null});
 }
 const s=(d.settings||[]).find(x=>x.id==='growth-profiles-v1')||{},icps=Array.isArray(s.icps)?s.icps:[],personas=Array.isArray(s.personas)?s.personas:[];
 const active=icps.find(x=>x.id===s.activeIcpId)||icps[0];
 for(const task of tasks){
  if(!task||task.missionOrigin!=='growth'||['Done','Cancelled'].includes(task.status))continue;
  items.push({id:'growth:mission:'+safe(task.id),group:'growth',title:safe(task.title)||'Growth mission',
   detail:'Mission · Open in Missions',route:'missions',sort:task.createdAt||task.due||'',at:parseTime(task.createdAt)});
 }
 if(!icps.length){
  items.push({id:'growth:setup-icp:v1',group:'growth',title:'Set target customers',detail:'Define your ideal customer profile',route:'growth',sort:'',at:0});
 }else if(!personas.some(x=>!x.icpId||x.icpId===active?.id)){
  items.push({id:'growth:setup-persona:'+safe(active?.id||'default'),group:'growth',title:'Define a buyer persona',
   detail:'Identify who makes purchasing decisions',route:'growth',sort:'',at:0});
 }
 // Cap each section, but do not hide the newest notifications just because an older one exists.
 items.push(...intelligenceItems(report,d));
 const priority=items.filter(x=>x.group==='priority').sort((a,b)=>String(a.sort).localeCompare(String(b.sort))).slice(0,14);
 const growth=items.filter(x=>x.group==='growth').sort((a,b)=>String(b.sort).localeCompare(String(a.sort))).slice(0,7);
 return [...priority,...growth,...sourceEvents(d,now)];
}
function itemsWithRead(d,now=Date.now()){
 const state=loadState(d),ids=new Set(Array.isArray(state?.seen)?state.seen:[]),started=parseTime(state?.startedAt);
 let report=null;try{report=api?.intelligence?.(d)||null}catch(error){console.warn('Notifications intelligence unavailable',error)}
 const values=generate(d,now,report);
 return values.map(x=>({...x,unread:!ids.has(x.id)&&!(x.group==='activity'&&(!started||!x.at||x.at<=started))}));
}
function formatTime(n,now){
 if(!n)return '';
 const m=Math.max(0,Math.round((now-n)/60000));
 if(m<2)return 'Just now';
 if(m<60)return m+'m';
 const h=Math.floor(m/60);if(h<24)return h+'h';
 const d=Math.floor(h/24);return d+'d';
}
const groupNames={priority:'PRIORITY',growth:'GROWTH INTELLIGENCE',activity:'ACTIVITY'};
function groupIcon(name){
 if(name==='priority')return '<path d="M12 3v9m0 5v.5"/><path d="M5.5 4h13l3 17h-19z"/>';
 if(name==='growth')return '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>';
 return '<path d="M4 4v16M4 12h5l3-5 3 10 3-5h3"/>';
}
function icon(type){
 return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+groupIcon(type)+'</svg>';
}
function obligationForm(d){
 const related=[['','No linked record'],...['jobs','customers','quotes','opportunities','invoices','suppliers'].flatMap(store=>(d[store]||[]).slice(0,120).map(x=>[store+':'+x.id,store.slice(0,-1)+' · '+String(x.title||x.name||x.project_name||x.reference||x.id).slice(0,75)]))];
 return '<form class="tf-notif-obligation" id="tfNotifObligationForm" aria-label="Add business deadline">'+
 '<label>Related business record<select name="relation">'+related.map(([id,label])=>'<option value="'+esc(id)+'">'+esc(label)+'</option>').join('')+'</select></label>'+
 '<label>Deadline type<select name="kind" required>'+Object.entries(obligationTypes).map(([id,label])=>'<option value="'+id+'">'+esc(label)+'</option>').join('')+'</select></label>'+
 '<label>What needs doing?<input name="title" maxlength="150" required placeholder="e.g. Renew insurance certificate"></label>'+
 '<label>Verified due date<input name="due" type="date" required></label>'+
 '<label>Responsible person (optional)<input name="owner" maxlength="90" placeholder="Office manager"></label>'+
 '<label>Notes / evidence reference (optional)<input name="notes" maxlength="300" placeholder="Policy number, source or link"></label>'+
 '<p>Enter a confirmed date. TradeFlow does not calculate legal deadlines or renew credentials automatically. Open obligations appear here within 14 days of their due date.</p>'+
 '<div class="tf-notif-obligation-actions"><button type="button" data-notif-action="obligation-cancel">Cancel</button><button type="submit">Save deadline</button></div></form>';
}
function panel(d,items,now){
 const unread=items.filter(x=>x.unread).length;
 const sections=['priority','growth','activity'].map(section=>{
  const group=items.filter(x=>x.group===section);
  if(!group.length)return '';
  return '<section class="tf-notif-group" aria-label="'+groupNames[section]+'"><h3>'+icon(section)+groupNames[section]+
   '<span>'+group.length+'</span></h3>'+
   group.map(x=>'<button type="button" class="tf-notif-item'+(x.unread?' unread':'')+'" data-notif-action="go" data-notif-id="'+esc(x.id)+
    '" aria-label="'+esc(x.title+' — '+x.detail)+'"><span class="tf-notif-status" aria-hidden="true"></span><span class="tf-notif-copy"><strong>'+esc(x.title)+
    '</strong><small>'+esc(x.detail)+'</small></span><span class="tf-notif-side">'+(x.at&&x.group==='activity'?'<time>'+formatTime(x.at,now)+'</time>':'')+
    '<span class="tf-notif-arrow" aria-hidden="true">›</span></span></button>').join('')+'</section>';
 }).filter(Boolean).join('');
 return '<section id="tfNotificationsPanel" class="tf-notif-panel" role="dialog" aria-modal="false" aria-label="Notifications" tabindex="-1">'+
  '<header class="tf-notif-panel-head"><div><span>TRADEFLOW / INTELLIGENCE</span><h2>Notifications'+(unread?' <em>'+unread+' new</em>':'')+'</h2></div>'+
  '<button type="button" class="tf-notif-dismiss" data-notif-action="close" aria-label="Close notifications">×</button></header>'+
  '<div class="tf-notif-panel-body">'+(sections||'<div class="tf-notif-empty"><strong>All clear</strong><p>No notifications need your attention.</p></div>')+'</div>'+
  (obligationEditor?obligationForm(d):'<button type="button" class="tf-notif-add-obligation" data-notif-action="obligation-new">+ Track a deadline or renewal</button>')+
  '<footer class="tf-notif-panel-footer">'+(unread?'<button type="button" data-notif-action="read-all">Mark all read</button>':'<span>Up to date</span>')+
  '<small>On-device activity · No push alerts</small></footer></section>';
}
function home(d,bellIcon){
 lastData=d;
 const items=itemsWithRead(d),unread=items.filter(x=>x.unread).length;
 return '<div class="tf-notif-anchor"><button class="tf-home-alert" type="button" data-notif-action="toggle" aria-label="Notifications'+(unread?', '+unread+' unread':'')+
  '" aria-controls="tfNotificationsPanel" aria-expanded="'+(open?'true':'false')+'">'+bellIcon+
  (unread?'<i aria-hidden="true"></i>':'')+'</button>'+
  (open?panel(d,items,Date.now()):'')+'</div>';
}
async function bootstrap(d){
 if(!api)return;
 if(loadState(d))return;
 const state={id:KEY,seen:[],startedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 await api.put('settings',state);
 (d.settings||(d.settings=[])).push(state);
}
function nextState(old,seen){
 return {id:KEY,startedAt:old?.startedAt||new Date().toISOString(),
  seen:[...new Set(seen)].slice(-MAX_SEEN),updatedAt:new Date().toISOString()};
}
async function mark(ids){
 if(!api||!ids.length)return;
 const current=await api.get('settings',KEY);
 const values=itemsWithRead(lastData||{settings:[]});
 const eligible=new Set(values.map(x=>x.id));
 const updates=ids.filter(id=>eligible.has(id));
 if(!updates.length)return;
 await api.put('settings',nextState(current,[...(current?.seen||[]),...updates]));
}
function close(){
 if(!open)return;
 open=false;obligationEditor=false;
}
function show(){open=true;obligationEditor=false;return api?.render?.()}
async function handleSubmit(event){
 if(event.target?.id!=='tfNotifObligationForm')return;
 event.preventDefault();event.stopImmediatePropagation();
 if(working||!api?.uid||!api?.put)return;
 working=true;
 try{
  const form=new FormData(event.target),kind=String(form.get('kind')||''),title=String(form.get('title')||'').trim(),due=String(form.get('due')||'');
  const owner=String(form.get('owner')||'').trim(),notes=String(form.get('notes')||'').trim();
  const relation=String(form.get('relation')||''),separator=relation.indexOf(':'),store=separator<0?'':relation.slice(0,separator),relatedId=separator<0?'':relation.slice(separator+1);
  if(relation&&(!['jobs','customers','quotes','opportunities','invoices','suppliers'].includes(store)||!relatedId||
    !(lastData?.[store]||[]).some(x=>x.id===relatedId)))throw Error('The related record is missing. Refresh and review the deadline.');
  if(!Object.hasOwn(obligationTypes,kind)||!title||title.length>150||!validDate(due)||owner.length>90||notes.length>300)throw Error('Provide a valid deadline type, description and date.');
  const row={id:api.uid(),title,due,status:'Open',taskType:'business_obligation',obligationType:kind,assignedTo:owner,notes,relatedStore:store,relatedRecordId:relatedId,createdAt:new Date().toISOString()};
  await api.put('tasks',row);
  obligationEditor=false;
  await api.render();
 }catch(error){alert('Deadline not saved: '+String(error.message||error))}
 finally{working=false}
}
async function handleClick(event){
 const button=event.target.closest?.('[data-notif-action]');
 if(!button){
  if(open&&!event.target.closest?.('.tf-notif-anchor')){close();}
  return;
 }
 event.preventDefault();
 event.stopImmediatePropagation();
 if(!api||working)return;
 const action=button.dataset.notifAction;
 try{
  if(action==='toggle'){
   open=!open;await api.render();
   if(open)document.querySelector('#tfNotificationsPanel')?.focus({preventScroll:true});
   return;
  }
  if(action==='obligation-new'){obligationEditor=true;open=true;await api.render();return}
  if(action==='obligation-cancel'){obligationEditor=false;await api.render();return}
  if(action==='close'){
   close();await api.render();document.querySelector('.tf-home-alert')?.focus({preventScroll:true});return;
  }
  if(action==='read-all'){
   working=true;
   await mark(itemsWithRead(lastData||{settings:[]}).filter(x=>x.unread).map(x=>x.id));
   await api.render();return;
  }
  if(action==='go'){
   const id=button.dataset.notifId;
   const item=itemsWithRead(lastData||{settings:[]}).find(x=>x.id===id);
   if(!item)return;
   working=true;
   await mark([item.id]);close();
   if(item.recordRef&&api.openRecord){await api.openRecord(item.recordRef)}
   else await api.navigate(routes.has(item.route)?item.route:'dashboard');
   return;
  }
 }catch(err){alert('Notifications could not be updated: '+String(err?.message||err))}
 finally{working=false}
}
function onKey(event){
 if(event.key!=='Escape'||!open)return;
 event.preventDefault();
 close();
 api?.render().then(()=>document.querySelector('.tf-home-alert')?.focus({preventScroll:true}));
}
function configure(bridge){
 api=bridge;
 document.addEventListener('click',handleClick,true);
 document.addEventListener('submit',handleSubmit,true);
 document.addEventListener('keydown',onKey);
}
global.TradeFlowNotifications={configure,bootstrap,home,close,show,_test:{generate,intelligenceItems,obligationTypes,itemsWithRead,loadState,formatTime,dateToday,groupNames,KEY,nextState}};
})(typeof window!=='undefined'?window:globalThis);
