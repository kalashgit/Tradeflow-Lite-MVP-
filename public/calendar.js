/* TradeFlow Calendar R03 — connected, local-first scheduling workspace.
 * Legacy Task / Job records are read, not copied or migrated. New standalone events
 * have their own records. The activity log 'events' store is deliberately untouched.
 */
(function(global){
'use strict';
var bridge=null,mode=(typeof window!=='undefined'&&window.matchMedia?.('(max-width:700px)')?.matches)?'day':'week',selected='',draft=null,activeKey='',layerDrawer=false,queueVisible=false,calendarDraft=false,intelligenceFocus='',lastData=null;
var hiddenLayers=new Set(),preferencesHydrated=false,scheduleSettingsOpen=false;
var calendarViewport={top:0,left:0};
function rememberViewport(){const node=typeof document!=='undefined'?document.querySelector?.('.tf-cal-timeline'):null;if(node)calendarViewport={top:node.scrollTop,left:node.scrollLeft}}
function restoreViewport(){if(typeof document==='undefined')return;const work=()=>{const node=document.querySelector?.('.tf-cal-timeline');if(node){node.scrollTop=calendarViewport.top;node.scrollLeft=calendarViewport.left}};if(typeof requestAnimationFrame==='function')requestAnimationFrame(work);else work()}

var baseLayers=[
 {id:'jobs',name:'Jobs / Site Work',color:'#16c784',kind:'job'},
 {id:'clients',name:'Customer Appointments',color:'#208be6',kind:'appointment'},
 {id:'proposals',name:'Proposals',color:'#974bf0',kind:'proposal'},
 {id:'tasks',name:'Tasks',color:'#ff9f1c',kind:'task'},
 {id:'personal',name:'Personal',color:'#e64a99',kind:'personal'},
 {id:'internal',name:'Team / Meetings',color:'#91a8c2',kind:'internal'}
];
function day(){var d=new Date();return dateString(d)}
selected=day();
function e(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]})}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(new Date(v+'T12:00:00').getTime())&&new Date(v+'T12:00:00').toISOString().slice(0,10)===v}
function asDate(v){return new Date(v+'T12:00:00')}
function dateString(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function shift(v,n){var d=asDate(v);d.setDate(d.getDate()+n);return dateString(d)}
function monday(v){var d=asDate(v);d.setDate(d.getDate()-((d.getDay()+6)%7));return dateString(d)}
function label(v,opts){return asDate(v).toLocaleDateString('en-US',opts||{month:'short',day:'numeric',year:'numeric'})}
function validTime(v){return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v||'')}
function minutes(v){return validTime(v)?Number(v.slice(0,2))*60+Number(v.slice(3)):null}
function clock(v){var m=minutes(v);if(m===null)return 'Time not assigned';var h=Math.floor(m/60);return (h%12||12)+':'+String(m%60).padStart(2,'0')+' '+(h>=12?'PM':'AM')}
function plusTime(v,delta){var n=minutes(v);if(n===null)return '';n+=Number(delta)||0;return String(Math.floor(n/60)%24).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
function recordCategory(x,type){
 var category=String(x.calendarCategory||x.category||x.eventType||x.kind||'').toLowerCase();
 if(category==='personal')return 'personal';
 if(type==='job')return 'jobs';
 if(category.includes('propos')||category.includes('quotation')||category==='quote')return 'proposals';
 if(category.includes('visit')||category.includes('site'))return 'jobs';
 if(category.includes('appointment')||category.includes('customer')||category.includes('call'))return 'clients';
 if(category.includes('meeting')||category.includes('internal')||category==='event')return 'internal';
 return 'tasks';
}
function defaultLayer(type){return type==='job'?'jobs':type==='task'?'tasks':'internal'}
function entryFromSource(x,type){
 var date=type==='job'?x.date:x.due;
 var at=x.scheduleTime||'',category=recordCategory(x,type);
 return {key:type+':'+x.id,id:x.id,kind:type,sourceKind:type,sourceId:x.id,calendarId:x.calendarId||category,
 title:String(x.title||x.name||'Untitled '+type),date:validDate(date||'')?date:'',time:validTime(at)?at:'',
 duration:Number(x.durationMinutes)||0,location:String(x.location||x.address||''),notes:String(x.description||x.notes||''),
 done:x.status==='Done'||x.status==='Completed',priority:x.priority||'',assignedTo:x.assignedTo||x.assigneeId||'',
 customerId:x.customerId||'',jobId:type==='job'?x.id:x.jobId||'',status:x.status||'',linked:true};
}
function entryFromCalendar(x){
 var rawDate=x.date||(x.startAt?String(x.startAt).slice(0,10):'');
 var time=x.time||((x.startAt&&/T\d\d:\d\d/.test(x.startAt))?String(x.startAt).slice(11,16):'');
 return {key:'event:'+x.id,id:x.id,kind:'event',sourceKind:x.sourceKind||'event',sourceId:x.sourceId||x.id,
 calendarId:x.calendarId||'internal',title:String(x.title||'Event'),date:validDate(rawDate)?rawDate:'',
 time:validTime(time)?time:'',duration:Number(x.durationMinutes)||0,location:String(x.location||''),
 notes:String(x.notes||''),done:x.status==='Done'||x.status==='Completed',
 priority:x.priority||'',assignedTo:x.assignedTo||'',customerId:x.customerId||'',jobId:x.jobId||'',status:x.status||'',
 linked:!!(x.sourceId&&x.sourceKind&&x.sourceKind!=='event')};
}
function records(d){
 var entries=[];
 (d.tasks||[]).forEach(function(t){entries.push(entryFromSource(t,'task'))});
 (d.jobs||[]).forEach(function(j){entries.push(entryFromSource(j,'job'))});
 (d.calendarEntries||[]).forEach(function(x){entries.push(entryFromCalendar(x))});
 var linked=new Set((d.calendarEntries||[]).filter(function(x){return x.sourceId&&['task','job'].includes(x.sourceKind)&&x.status!=='Cancelled'}).map(function(x){return x.sourceKind+':'+x.sourceId}));
 // Linked task sessions are authoritative for their own time slots; retain one
 // source record in planning so deadline and remaining work cannot disappear.
 entries=entries.filter(function(x){return !(x.kind==='task'&&x.time&&linked.has(x.key))});
 return entries.sort(function(a,b){return (a.date+' '+(a.time||'99:99')+' '+a.title).localeCompare(b.date+' '+(b.time||'99:99')+' '+b.title)});
}
function conflicts(d,options){
 const opts=options||{},prefs=(d.calendarPreferences||[]).find(function(x){return x.id==='local-owner'})||{};
 const days=Math.max(1,Math.min(90,Number(prefs.horizonDays)||14));
 const first=opts.from||day(),last=opts.until||shift(first,days-1);
 const groups=new Map(),issues=[];
 for(const x of records(d)){
  if(!x.date||!x.time||x.duration<=0||x.done||x.status==='Cancelled'||x.date<first||x.date>last)continue;
  const owner=String(x.assignedTo||'local-owner'),key=x.date+'|'+owner;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(x);
 }
 for(const group of groups.values()){
  group.sort(function(a,b){return minutes(a.time)-minutes(b.time)});
  for(let i=0;i<group.length;i++){
   const a=group[i],endA=minutes(a.time)+a.duration;
   for(let j=i+1;j<group.length;j++){
    const b=group[j];if(minutes(b.time)>=endA)break;
    if(a.key!==b.key&&minutes(b.time)+b.duration>minutes(a.time))
     issues.push({id:a.key+'|'+b.key,date:a.date,a:a,b:b});
   }
  }
 }
 return issues;
}
function layers(d){
 return baseLayers.concat((d.calendars||[]).filter(function(x){return !baseLayers.some(function(b){return b.id===x.id})&&x.archived!==true}).map(function(x){
  return {id:x.id,name:String(x.name||'Calendar'),color:String(x.color||'#18c9e4'),kind:'custom'};
 }));
}
function categoryColor(x,ds){var l=layers(ds).find(function(y){return y.id===x.calendarId});return l?.color||'#8fb8cb'}
function eventList(d){return records(d).filter(function(x){return !hiddenLayers.has(x.calendarId)})}
function glyph(name){
 var paths={calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',map:'<path d="M12 22s8-6 8-12a8 8 0 1 0-16 0c0 6 8 12 8 12Z"/><circle cx="12" cy="10" r="2.5"/>',
 task:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',job:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M9 7V4h6v3M3 12h18"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
 brief:'<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0 1 16 0"/>',link:'<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>'};
 return '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.calendar)+'</svg>';
}
function itemIcon(x){return glyph(x.calendarId==='jobs'?'map':x.calendarId==='clients'?'user':x.calendarId==='proposals'?'brief':x.kind==='task'?'task':'calendar')}
function eventButton(x,compact){
 var color=categoryColor(x,lastData||{});
 var text=x.time?clock(x.time)+(x.duration?' – '+clock(plusTime(x.time,x.duration)):' · duration not set'):'Not timed';
 var id=e(x.key);
 return '<button type="button" class="tf-cal-event tf-cal-layer-'+e(x.calendarId)+(x.done?' tf-cal-event-done':'')+(compact?' is-compact':'')+'" data-calendar-action="event" data-key="'+id+'" style="--event-color:'+e(color)+'" aria-label="'+e(x.title)+' '+e(text)+'">'+
  '<span class="tf-cal-event-icon">'+itemIcon(x)+'</span><span class="tf-cal-event-details"><strong>'+e(x.title)+'</strong><small>'+e(text)+'</small>'+
  (!compact&&x.location?'<small>'+e(x.location)+'</small>':'')+'</span></button>';
}
function timeBounds(list,dateList){
 var timed=list.filter(function(x){return x.time&&dateList.includes(x.date)});
 var earlier=timed.map(function(x){return Math.floor(minutes(x.time)/60)}),later=timed.map(function(x){return Math.ceil((minutes(x.time)+(x.duration||30))/60)});
 return {first:Math.max(0,Math.min(7,...earlier)),last:Math.min(24,Math.max(19,...later))};
}
function timedColumns(d,days,forceDay){
 var list=eventList(d),bounds=timeBounds(list,days),hours=Array.from({length:bounds.last-bounds.first},function(_,i){return i+bounds.first});
 var count=hours.length*64;
 var axes='<div class="tf-cal-time-axis"><div class="tf-cal-all-day-axis">All day</div>'+hours.map(function(h){return '<div class="tf-cal-time-label">'+(h%12||12)+(h>=12?' PM':' AM')+'</div>'}).join('')+'</div>';
 var cols=days.map(function(date){
  var items=list.filter(function(x){return x.date===date}),timed=items.filter(function(x){return x.time}),allDay=items.filter(function(x){return !x.time&&(x.kind==='event'||x.kind==='job')});
  // Overlaps use side-by-side slots rather than hiding another event behind a card.
  var placed=timed.map(function(x,i){var start=minutes(x.time),finish=start+(x.duration||30);var rivals=timed.filter(function(y){return minutes(y.time)<finish&&minutes(y.time)+(y.duration||30)>start});var lane=rivals.findIndex(function(y){return y.key===x.key});var lanes=Math.max(1,rivals.length);return {item:x,lane:Math.max(0,lane),lanes:lanes}});
  return '<div class="tf-cal-day-column"><div class="tf-cal-day-heading"><button data-calendar-action="select-day" data-date="'+date+'" class="'+(selected===date?'active':'')+'">'+e(label(date,{weekday:'short'}))+' <strong>'+asDate(date).getDate()+'</strong></button><small>'+items.length+' item'+(items.length===1?'':'s')+'</small></div>'+
   '<div class="tf-cal-all-day">'+allDay.slice(0,2).map(function(x){return eventButton(x,true)}).join('')+'</div>'+
   '<div class="tf-cal-day-track" style="height:'+count+'px">'+placed.map(function(p){
    var x=p.item,top=(minutes(x.time)-bounds.first*60)/60*64,ht=Math.max(29,(x.duration||30)/60*64-3);
    var left=100*p.lane/p.lanes,w=100/p.lanes;
    return '<div class="tf-cal-event-position" style="top:'+top+'px;height:'+ht+'px;left:'+left+'%;width:'+w+'%">'+eventButton(x,false)+'</div>';
   }).join('')+'</div></div>';
 }).join('');
 return '<div class="tf-cal-timeline" aria-label="Time-based calendar"><div class="tf-cal-timeline-inner '+(forceDay?'tf-cal-single-day':'')+'">'+axes+'<div class="tf-cal-timeline-days" style="--visible-days:'+days.length+'">'+cols+'</div></div></div>';
}
function renderDay(list){return timedColumns(lastData||{},[selected],true)}
function renderWeek(list){
 var start=monday(selected),days=Array.from({length:7},function(_,i){return shift(start,i)});
 return timedColumns(lastData||{},days,false);
}
function renderMonth(list){
 var d=asDate(selected),first=dateString(new Date(d.getFullYear(),d.getMonth(),1)),start=monday(first),cells=Array.from({length:42},function(_,i){return shift(start,i)});
 return '<section class="tf-cal-month-layout"><div class="tf-cal-month-labels">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(function(x){return '<span>'+x+'</span>'}).join('')+'</div><div class="tf-cal-month-grid">'+cells.map(function(date){
  var current=date.slice(0,7)===selected.slice(0,7),items=list.filter(function(x){return x.date===date});
  return '<button type="button" data-calendar-action="select-day" data-date="'+date+'" class="'+(current?'':'other ')+(date===selected?'active':'')+'"><span>'+asDate(date).getDate()+'</span>'+items.slice(0,2).map(function(x){return '<small style="--event-color:'+e(categoryColor(x,lastData||{}))+'">'+e(x.title)+'</small>'}).join('')+(items.length>2?'<em>+'+(items.length-2)+'</em>':'')+'</button>';
 }).join('')+'</div></section>';
}
function miniMonth(date){
 var d=asDate(date),first=dateString(new Date(d.getFullYear(),d.getMonth(),1)),start=monday(first),cells=Array.from({length:42},function(_,i){return shift(start,i)});
 return '<div class="tf-cal-mini-head"><strong>'+e(label(date,{month:'long',year:'numeric'}))+'</strong><span><button type="button" data-calendar-action="mini-prev" aria-label="Previous month">‹</button><button type="button" data-calendar-action="mini-next" aria-label="Next month">›</button></span></div>'+
 '<div class="tf-cal-mini-grid">'+['M','T','W','T','F','S','S'].map(function(n){return '<small>'+n+'</small>'}).join('')+
 cells.map(function(v){return '<button type="button" data-calendar-action="select-day" data-date="'+v+'" class="'+(v===selected?'active ':'')+(v.slice(0,7)!==selected.slice(0,7)?'other':'')+'">'+asDate(v).getDate()+'</button>'}).join('')+'</div>';
}
function sidebar(d){
 return '<div class="tf-cal-sidebar-inner">'+miniMonth(selected)+
 '<div class="tf-cal-layer-top"><strong>My calendars</strong><button type="button" data-calendar-action="new-calendar" aria-label="Create calendar">+</button></div>'+
 layers(d).map(function(layer){
  return '<label class="tf-cal-layer"><input type="checkbox" data-calendar-layer="'+e(layer.id)+'" '+(!hiddenLayers.has(layer.id)?'checked':'')+'><span class="tf-cal-layer-dot" style="background:'+e(layer.color)+'"></span><span>'+e(layer.name)+'</span></label>';
 }).join('')+
 (calendarDraft?'<form id="tfCalNewCalendarForm" class="tf-cal-new-layer"><input name="name" maxlength="70" required placeholder="Calendar name" aria-label="Calendar name"><button type="submit">Create</button></form>':
 '<button type="button" class="tf-cal-new-layer-btn" data-calendar-action="new-calendar">+ New calendar</button>')+
 '<div class="tf-cal-schedule-controls"><button type="button" data-calendar-action="schedule-settings" aria-expanded="'+scheduleSettingsOpen+'">'+glyph('clock')+' Scheduling preferences</button></div>'+
 (scheduleSettingsOpen?scheduleSettingsForm(d):'')+'</div>';
}
function scheduleSettingsForm(d){
 var prefs=(d.calendarPreferences||[]).find(function(x){return x.id==='local-owner'})||{},settings=schedulingPlan(d).preferences;
 var days=Array.isArray(prefs.workingDays)?prefs.workingDays:[1,2,3,4,5];
 return '<form id="tfCalendarSettingsForm" class="tf-cal-settings-form"><label>Planning horizon (days)<input type="number" name="horizonDays" min="1" max="90" value="'+e(settings.horizonDays||14)+'"></label>'+
 '<div class="tf-cal-twocol"><label>Workday start<input type="time" name="workdayStart" value="'+e(prefs.workdayStart||'08:00')+'"></label><label>Workday end<input type="time" name="workdayEnd" value="'+e(prefs.workdayEnd||'17:00')+'"></label></div>'+
 '<label>Schedule buffer (minutes)<input type="number" name="bufferMinutes" min="0" max="90" step="5" value="'+e(prefs.bufferMinutes??15)+'"></label>'+
 '<label>Default minimum focus block (minutes)<input type="number" name="minBlockMinutes" min="15" max="240" step="5" value="'+e(prefs.minBlockMinutes??45)+'"></label>'+
 '<div class="tf-cal-settings-days"><span>Working days</span>'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(function(name,i){return '<label><input type="checkbox" name="day" value="'+i+'" '+(days.includes(i)?'checked':'')+'><span>'+name+'</span></label>'}).join('')+'</div>'+
 '<button class="tf-cal-primary" type="submit">Save preferences</button></form>';
}
function unscheduledWork(d){
 const allocated=new Map();
 (d.calendarEntries||[]).filter(function(x){return x.sourceKind==='task'&&x.sourceId&&!['Cancelled','Completed'].includes(x.status)}).forEach(function(x){
  allocated.set(x.sourceId,(allocated.get(x.sourceId)||0)+(Number(x.durationMinutes)||0));
 });
 return eventList(d).filter(function(x){
  if(x.time||x.done||!['task','job'].includes(x.kind))return false;
  if(x.kind==='job')return true;
  var task=(d.tasks||[]).find(function(t){return t.id===x.id});
  var remaining=(Number(task?.durationMinutes)||0)-(Number(task?.completedMinutes)||0)-(allocated.get(x.id)||0);
  return !task?.durationMinutes||remaining>0;
 });
}
function queue(d){
 var list=unscheduledWork(d);
 return '<div class="tf-cal-queue"><header><strong>Unscheduled work</strong><span>'+list.length+' tasks</span></header>'+
 (list.length?list.slice(0,18).map(function(x){return '<button type="button" data-calendar-action="event" data-key="'+e(x.key)+'" class="tf-cal-queue-row"><span class="tf-cal-queue-mark">'+glyph('task')+'</span><span><strong>'+e(x.title)+'</strong><small>'+(x.date?'Due '+e(label(x.date)):'No deadline')+'</small></span><span>›</span></button>'}).join(''):'<p class="tf-cal-queue-empty">No unscheduled tasks. New Tasks appear here automatically.</p>')+'</div>';
}
function activeEvent(d){return records(d).find(function(x){return x.key===activeKey})}
function eventPreview(d){
 var x=activeEvent(d);if(!x)return '';
 var linked=x.kind==='task'||x.kind==='job'||x.linked;
 var color=categoryColor(x,d);
 var time=x.time?clock(x.time)+(x.duration?' – '+clock(plusTime(x.time,x.duration)):' · duration not set'):'Unscheduled';
 var kindLabel=x.kind==='task'?'Task':x.kind==='job'?'Job':'Event';
 return '<div class="tf-cal-quick-backdrop" data-calendar-action="close-card"></div><aside class="tf-cal-quick-card" role="dialog" aria-label="Calendar event details" style="--event-color:'+e(color)+'">'+
 '<div class="tf-cal-quick-title"><div><span class="tf-cal-quick-category">'+e(kindLabel)+' · '+e((layers(d).find(function(y){return y.id===x.calendarId})||{}).name||x.calendarId)+'</span><h2>'+e(x.title)+'</h2></div><button type="button" data-calendar-action="close-card" aria-label="Close preview">×</button></div>'+
 '<div class="tf-cal-quick-line">'+glyph('clock')+'<span>'+e(x.date?label(x.date,{weekday:'short',month:'short',day:'numeric',year:'numeric'}):'No date')+' · '+e(time)+'</span></div>'+
 (x.location?'<div class="tf-cal-quick-line">'+glyph('map')+'<span>'+e(x.location)+'</span></div>':'')+
 (x.assignedTo?'<div class="tf-cal-quick-line">'+glyph('user')+'<span>'+e(x.assignedTo)+'</span></div>':'')+
 (x.notes?'<p class="tf-cal-quick-notes">'+e(x.notes)+'</p>':'')+
 '<button type="button" class="tf-cal-open-record" data-calendar-action="'+(linked?'open-record':'edit-event')+'" data-key="'+e(x.key)+'">'+
 (linked?'↗ Open '+kindLabel+' Record':'Edit Event')+'</button>'+
 '<div class="tf-cal-quick-actions"><button type="button" data-calendar-action="reschedule" data-key="'+e(x.key)+'">'+glyph('calendar')+' Reschedule</button>'+
 (!x.done&&x.kind!=='event'?'<button type="button" data-calendar-action="complete" data-key="'+e(x.key)+'">✓ Complete</button>':x.done?'<span class="tf-cal-completed">✓ Completed</span>':'')+'</div></aside>';
}

function schedulingPlan(d){
 return global.TradeFlowScheduler?.analyze(d)||{proposals:[],risks:[],preferences:{horizonDays:14}};
}
function renderSchedulingReview(d,report){
 var proposals=report.proposals||[];
 return '<section class="tf-cal-review" aria-label="Scheduling proposals"><header class="tf-cal-review-head"><div><span>LOCAL SCHEDULING · APPROVAL REQUIRED</span><h2>Scheduling proposals</h2><p>Suggested placements are not saved until you approve them.</p></div><button type="button" data-calendar-action="back-calendar">Back to calendar →</button></header>'+
 (proposals.length?proposals.map(function(p){
  return '<article class="tf-cal-proposal"><div class="tf-cal-proposal-top"><span class="tf-cal-proposal-icon">'+glyph('task')+'</span><div><strong>'+e(p.taskTitle)+'</strong><small>'+e(p.priority)+' priority · '+p.remainingMinutes+' minutes'+(p.deadline?' · due '+e(label(p.deadline)):'')+'</small></div></div>'+
  '<p>'+e(p.reason)+'</p><div class="tf-cal-suggested-slots">'+p.slots.map(function(t){return '<span>'+e(label(t.date,{weekday:'short',month:'short',day:'numeric'}))+' · '+e(clock(t.time))+' · '+t.durationMinutes+' min</span>'}).join('')+'</div>'+
  '<div class="tf-cal-proposal-actions"><button type="button" class="tf-cal-proposal-approve" data-calendar-action="approve-proposal" data-proposal-id="'+e(p.id)+'">✓ Approve</button><button type="button" data-calendar-action="dismiss-proposal" data-proposal-id="'+e(p.id)+'">Dismiss</button></div></article>';
 }).join(''):'<div class="tf-cal-review-empty">No feasible unscheduled-task proposals right now. Tasks need an estimated duration, a permitted availability window and completed prerequisites.</div>')+
 ((report.risks||[]).length?'<section class="tf-cal-review-risks"><h3>Needs attention</h3>'+report.risks.slice(0,12).map(function(x){
   var t=(d.tasks||[]).find(function(y){return y.id===x.taskId});
   return '<div>'+e(t?.title||'Task')+' — '+e(x.reason)+'</div>';
  }).join('')+'</section>':'')+'</section>';
}
function renderConflictReview(d,issues){
 return '<section class="tf-cal-review" aria-label="Scheduling conflicts"><header class="tf-cal-review-head"><div><span>CONFLICT REVIEW</span><h2>Scheduling conflicts</h2><p>Only recorded overlapping commitments are shown. Resolve conflicts in linked records.</p></div><button type="button" data-calendar-action="back-calendar">Back to calendar →</button></header>'+
 (issues.length?issues.map(function(x){return '<article class="tf-cal-proposal tf-cal-conflict-record"><strong>'+e(label(x.date))+'</strong><p>'+e(x.a.title)+' overlaps '+e(x.b.title)+'</p><button type="button" data-calendar-action="event" data-key="'+e(x.a.key)+'">Open first event →</button></article>'}).join(''):'<p class="tf-cal-review-empty">No overlapping recorded commitments were found.</p>')+'</section>';
}
function appointmentForm(){
 return '<section class="tf-cal-formpanel" aria-label="Create or edit calendar entry"><div class="tf-cal-section-head"><div><h2>'+e(draft?.id?'Edit schedule':'New calendar entry')+'</h2><p>Connected tasks and events update across TradeFlow.</p></div><button type="button" data-calendar-action="cancel">×</button></div>'+
 '<form id="tfCalendarForm"><label>Title *<input name="title" required maxlength="150" value="'+e(draft?.title||'')+'" placeholder="e.g. Site visit with property manager"></label>'+
 '<label>Type<select name="kind"><option value="event" '+(draft?.kind!=='task'?'selected':'')+'>Calendar event</option><option value="task" '+(draft?.kind==='task'?'selected':'')+'>Task / appointment</option></select></label>'+
 '<div class="tf-cal-twocol"><label>Date *<input type="date" name="date" required value="'+e(draft?.date||selected)+'"></label><label>Start time<input type="time" name="time" value="'+e(draft?.time||'')+'"></label></div>'+
 '<div class="tf-cal-twocol"><label>Duration (minutes)<input type="number" min="15" max="1440" step="15" name="duration" value="'+e(draft?.duration||60)+'"></label>'+
 '<label>Calendar<select name="calendarId">'+layers(lastData||{}).map(function(l){return '<option value="'+e(l.id)+'" '+((draft?.calendarId||'internal')===l.id?'selected':'')+'>'+e(l.name)+'</option>'}).join('')+'</select></label></div>'+
 '<label>Location<input name="location" maxlength="220" value="'+e(draft?.location||'')+'" placeholder="Optional"></label>'+
 '<label>Notes<textarea name="description" maxlength="1600" rows="3">'+e(draft?.notes||'')+'</textarea></label>'+
 '<details class="tf-cal-task-options"><summary>Optional task planning</summary><div class="tf-cal-task-options-fields"><label>Priority<select name="priority">'+['Normal','High','Critical','Low','Optional'].map(function(p){return '<option value="'+p+'" '+((draft?.priority||'Normal')===p?'selected':'')+'>'+p+'</option>'}).join('')+'</select></label><label class="tf-cal-split-check"><input type="checkbox" name="splittable" value="yes" '+(draft?.splittable?'checked':'')+'> Allow flexible split sessions</label><label>Minimum session (minutes)<input type="number" name="minBlockMinutes" min="15" max="240" step="5" value="'+e(draft?.minBlockMinutes||45)+'"></label></div></details>'+
 '<div class="tf-cal-form-actions"><button class="tf-cal-primary" type="submit">Save</button><button class="tf-cal-secondary" type="button" data-calendar-action="cancel">Cancel</button></div></form></section>';
}
function render(d){
 lastData=d||{};
 if(!preferencesHydrated){var pref=(lastData.calendarPreferences||[]).find(function(p){return p.id==='local-owner'});hiddenLayers=new Set(pref?.hiddenLayerIds||[]);preferencesHydrated=true}
 var list=eventList(lastData),period=mode==='month'?label(selected,{month:'long',year:'numeric'}):mode==='week'?label(monday(selected),{month:'short',day:'numeric'})+' – '+label(shift(monday(selected),6),{month:'short',day:'numeric',year:'numeric'}):label(selected,{weekday:'short',month:'short',day:'numeric',year:'numeric'});
 var current=mode==='day'?renderDay(list):mode==='month'?renderMonth(list):renderWeek(list);
 var issues=conflicts(lastData),report=schedulingPlan(lastData);
 if(intelligenceFocus==='proposals')current=renderSchedulingReview(lastData,report);
 if(intelligenceFocus==='conflicts')current=renderConflictReview(lastData,issues);
 return '<main class="tf-cal-page" aria-label="Calendar"><aside class="tf-cal-sidebar">'+sidebar(lastData)+'</aside><section class="tf-cal-work">'+
 '<div class="tf-cal-toolbar"><div class="tf-cal-date-tools"><button type="button" data-calendar-action="prev" aria-label="Previous">‹</button><button type="button" data-calendar-action="next" aria-label="Next">›</button><button type="button" data-calendar-action="today">Today</button><strong>'+e(period)+'</strong></div>'+
 '<div class="tf-cal-toolbar-right"><div class="tf-cal-modes">'+['day','week','month'].map(function(x){return '<button type="button" data-calendar-action="mode" data-mode="'+x+'" class="'+(mode===x?'active':'')+'">'+x[0].toUpperCase()+x.slice(1)+'</button>'}).join('')+'</div>'+
 (report.proposals.length?'<button type="button" class="tf-cal-proposals-link" data-calendar-action="review-proposals">'+report.proposals.length+' proposals</button>':'')+'<button class="tf-cal-primary" type="button" data-calendar-action="new">+ Event</button><button class="tf-cal-layer-toggle" type="button" data-calendar-action="layers" aria-label="Calendar filters">'+glyph('calendar')+'</button></div></div>'+
 (issues.length&&intelligenceFocus!=='conflicts'?'<div class="tf-cal-conflict-banner"><span>⚠ '+issues.length+' overlapping commitment'+(issues.length===1?'':'s')+' identified in the current records</span><button data-calendar-action="conflicts">Review</button></div>':'')+
 '<div class="tf-cal-mobile-queue-control"><button type="button" data-calendar-action="queue">'+(queueVisible?'Hide':'Show')+' unscheduled tasks · '+unscheduledWork(lastData).length+'</button></div>'+
 (draft?appointmentForm():current)+
 (intelligenceFocus?'':'<div class="tf-cal-queue-desktop">'+queue(lastData)+'</div>')+
 '</section>'+(layerDrawer?'<div class="tf-cal-drawer-shade" data-calendar-action="layers"></div><aside class="tf-cal-mobile-drawer"><div class="tf-cal-drawer-head"><strong>Calendar layers</strong><button data-calendar-action="layers">×</button></div>'+sidebar(lastData)+'</aside>':'')+
 (queueVisible?'<aside class="tf-cal-mobile-queue">'+queue(lastData)+'</aside>':'')+
 (activeKey?eventPreview(lastData):'')+'</main>';
}
function mount(context){
 bridge=context;
 if(typeof document!=='undefined'){
  document.addEventListener('click',click);
  document.addEventListener('change',change);
  document.addEventListener('submit',submit);
 }
}
async function change(evt){
 if(!bridge)return;
 const option=evt.target.closest?.('[data-calendar-pref]');
 if(option){
  const previous=await bridge.get('calendarPreferences','local-owner')||{id:'local-owner'};
  const horizon=Math.max(1,Math.min(90,Number(option.value)||14));
  await bridge.put('calendarPreferences',{...previous,horizonDays:horizon,updatedAt:new Date().toISOString()});
  await bridge.render();return;
 }
 var b=evt.target.closest?.('[data-calendar-layer]');if(!b)return;
 if(b.checked)hiddenLayers.delete(b.dataset.calendarLayer);else hiddenLayers.add(b.dataset.calendarLayer);
 const previous=await bridge.get('calendarPreferences','local-owner')||{id:'local-owner'};
 await bridge.put('calendarPreferences',{...previous,hiddenLayerIds:[...hiddenLayers],updatedAt:new Date().toISOString()});
 await bridge.render();
}
async function click(evt){
 if(!bridge)return;
 var b=evt.target.closest&&evt.target.closest('[data-calendar-action]');if(!b)return;
 evt.preventDefault();
 var action=b.dataset.calendarAction;
 if(action==='mode'){mode=['day','week','month'].includes(b.dataset.mode)?b.dataset.mode:'week';draft=null;activeKey='';await bridge.render();return}
 if(action==='select-day'){if(validDate(b.dataset.date))selected=b.dataset.date;draft=null;activeKey='';if(typeof window!=='undefined'&&window.matchMedia?.('(max-width:700px)')?.matches)mode='day';await bridge.render();return}
 if(action==='today'){selected=day();draft=null;activeKey='';await bridge.render();return}
 if(action==='prev'||action==='next'||action==='mini-next'||action==='mini-prev'){
  var delta=action.endsWith('next')||action==='next'?1:-1,d=asDate(selected);
  if(mode==='month'||action.startsWith('mini-')){var oldDay=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+delta);var last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(last,oldDay))}
  else d.setDate(d.getDate()+delta*(mode==='week'?7:1));
  selected=dateString(d);draft=null;activeKey='';await bridge.render();return;
 }
 if(action==='event'){
  activeKey=b.dataset.key;draft=null;rememberViewport();
  const root=typeof document!=='undefined'?document.querySelector?.('.tf-cal-page'):null;
  if(root&&typeof root.insertAdjacentHTML==='function'){
   root.querySelectorAll?.('.tf-cal-quick-backdrop,.tf-cal-quick-card').forEach(x=>x.remove());
   root.insertAdjacentHTML('beforeend',eventPreview(lastData||{}));return;
  }
  await bridge.render();restoreViewport();return;
 }
 if(action==='close-card'){
  activeKey='';
  const root=typeof document!=='undefined'?document.querySelector?.('.tf-cal-page'):null;
  if(root){root.querySelectorAll?.('.tf-cal-quick-backdrop,.tf-cal-quick-card').forEach(x=>x.remove());return}
  await bridge.render();restoreViewport();return;
 }
 if(action==='layers'){layerDrawer=!layerDrawer;await bridge.render();return}
 if(action==='queue'){queueVisible=!queueVisible;await bridge.render();return}
 if(action==='new-calendar'){calendarDraft=!calendarDraft;await bridge.render();return}
 if(action==='schedule-settings'){scheduleSettingsOpen=!scheduleSettingsOpen;await bridge.render();return}
 if(action==='new'){draft={date:selected,kind:'event',calendarId:'internal'};activeKey='';await bridge.render();return}
 if(action==='cancel'){draft=null;activeKey='';await bridge.render();return}
 if(action==='conflicts'){intelligenceFocus=intelligenceFocus==='conflicts'?'':'conflicts';await bridge.render();return}
 if(action==='back-calendar'){intelligenceFocus='';activeKey='';await bridge.render();return}
 if(action==='review-proposals'){intelligenceFocus='proposals';draft=null;activeKey='';await bridge.render();return}
 if(action==='approve-proposal'||action==='dismiss-proposal'){
  var plan=schedulingPlan(lastData||{}).proposals.find(function(x){return x.id===b.dataset.proposalId});
  if(!plan)return;
  if(action==='dismiss-proposal'){
   await bridge.put('calendarProposals',{id:'dismissed:'+plan.proposalKey,proposalKey:plan.proposalKey,status:'dismissed',taskId:plan.taskId,updatedAt:new Date().toISOString()});
   await bridge.render();return;
  }
  if(!bridge.commitScheduleProposal){alert('Scheduling approval is unavailable.');return}
  try{await bridge.commitScheduleProposal(plan);bridge.notify('Schedule approved — linked work sessions created')}
  catch(error){alert('Schedule changed. Review the latest proposal before approving: '+error.message)}
  return;
 }
 if(action==='open-record'){
  var record=activeEvent(lastData||{});if(!record)return;
  rememberViewport();
  if(bridge.openRecord){await bridge.openRecord(record.sourceKind,record.sourceId);return}
  await bridge.navigate(record.kind==='job'?'jobs':'tasks');return;
 }
 if(action==='reschedule'||action==='edit-event'){
  var record=activeEvent(lastData||{});if(!record)return;
  if(record.kind!=='event'&&record.sourceKind!=='task'){await bridge.openRecord?.(record.sourceKind,record.sourceId);return}
  draft={id:record.id,kind:record.kind==='task'?'task':'event',date:record.date||selected,time:record.time,duration:record.duration,
   title:record.title,location:record.location,notes:record.notes,calendarId:record.calendarId,priority:record.priority,splittable:record.splittable,minBlockMinutes:record.minBlockMinutes};activeKey='';await bridge.render();return;
 }
 if(action==='complete'){
  var record=activeEvent(lastData||{});if(!record)return;
  if(record.kind==='event'&&record.sourceKind==='task'&&bridge.completeSession){
   await bridge.completeSession(record.id);activeKey='';bridge.notify('Task session completed');return;
  }
  if(record.kind==='task'||record.kind==='job'){
   var original=await bridge.get(record.kind==='job'?'jobs':'tasks',record.id);if(!original)return;
   await bridge.put(record.kind==='job'?'jobs':'tasks',{...original,status:record.kind==='job'?'Completed':'Done',updatedAt:new Date().toISOString()});
  }else{
   var ev=await bridge.get('calendarEntries',record.id);if(!ev)return;
   await bridge.put('calendarEntries',{...ev,status:'Completed',updatedAt:new Date().toISOString()});
  }
  activeKey='';await bridge.render();return;
 }
 if(action==='opportunity'){
  var item=await bridge.get('opportunities',b.dataset.id);if(!item)return;
  selected=day();mode='day';draft={kind:'task',date:selected,title:'Contact / site visit: '+String(item.organization_name||item.project_name||'Opportunity').slice(0,115),
   location:[item.city,item.region].filter(Boolean).join(', '),notes:'Related opportunity: '+String(item.source_record_id||item.id).slice(0,100)};
  bridge.navigate('calendar');return;
 }
}
async function submit(evt){
 if(!bridge)return;
 if(evt.target.id==='tfCalendarSettingsForm'){
  evt.preventDefault();
  var form=new FormData(evt.target),horizon=Math.max(1,Math.min(90,Number(form.get('horizonDays'))||14)),
   start=String(form.get('workdayStart')||'08:00'),end=String(form.get('workdayEnd')||'17:00'),
   buffer=Math.max(0,Math.min(90,Number(form.get('bufferMinutes'))||0)),
   minBlock=Math.max(15,Math.min(240,Number(form.get('minBlockMinutes'))||45));
  if(!validTime(start)||!validTime(end)||minutes(end)<=minutes(start)){alert('End time must be after start time.');return}
  var checks=[...evt.target.querySelectorAll('input[name="day"]:checked')].map(function(x){return Number(x.value)});
  if(!checks.length){alert('Select at least one working day.');return}
  var saved=await bridge.get('calendarPreferences','local-owner')||{id:'local-owner'};
  await bridge.put('calendarPreferences',{...saved,horizonDays:horizon,workdayStart:start,workdayEnd:end,
   bufferMinutes:buffer,minBlockMinutes:minBlock,workingDays:checks,updatedAt:new Date().toISOString()});
  scheduleSettingsOpen=false;bridge.notify('Scheduling preferences updated');return;
 }
 if(evt.target.id==='tfCalNewCalendarForm'){
  evt.preventDefault();
  var f=new FormData(evt.target),name=String(f.get('name')||'').trim().slice(0,70);
  if(!name)return;
  await bridge.put('calendars',{id:bridge.uid(),name:name,color:'#18c9e4',ownerId:'local-owner',businessId:'local-business',createdAt:new Date().toISOString()});
  calendarDraft=false;layerDrawer=false;await bridge.render();return;
 }
 if(evt.target.id!=='tfCalendarForm')return;
 evt.preventDefault();
 var f=new FormData(evt.target),text=function(k,n){return String(f.get(k)||'').trim().slice(0,n||180)};
 var title=text('title',150),date=text('date',10),time=text('time',5),duration=Number(f.get('duration')||60),kind=text('kind',15)||'task',calendarId=text('calendarId',80)||'internal';
 if(!title||!validDate(date)||(time&&!validTime(time))||!Number.isInteger(duration)||duration<15||duration>1440){
  alert('Enter a title, valid date, optional time and duration (15–1440 minutes).');return;
 }
 try{
  var now=new Date().toISOString(),common={title:title,durationMinutes:duration,location:text('location',220),description:text('description',1600),calendarId:calendarId,updatedAt:now};
  if(kind==='task'){
   var old=draft?.id?await bridge.get('tasks',draft.id):null;
   await bridge.put('tasks',{...old,...common,id:old?.id||bridge.uid(),due:date,status:old?.status||'Open',scheduleTime:time,kind:old?.kind||'appointment',priority:text('priority',25)||old?.priority||'Normal',splittable:!!f.get('splittable'),minBlockMinutes:Math.max(15,Math.min(240,Number(f.get('minBlockMinutes'))||45)),createdAt:old?.createdAt||now});
  }else{
   var prior=draft?.id?await bridge.get('calendarEntries',draft.id):null;
   await bridge.put('calendarEntries',{...prior,id:prior?.id||bridge.uid(),title:title,date:date,time:time,durationMinutes:duration,location:common.location,notes:common.description,
    calendarId:calendarId,status:prior?.status||'Scheduled',ownerId:'local-owner',businessId:'local-business',version:(prior?.version||0)+1,updatedAt:now,createdAt:prior?.createdAt||now});
  }
  selected=date;draft=null;activeKey='';bridge.notify('Saved to Calendar');
 }catch(err){alert('Could not save: '+err.message)}
}
global.TradeFlowCalendar={configure:mount,render:render,records:records,conflicts:conflicts,prepareOpportunity:function(item){
 selected=day();mode='day';draft={kind:'task',date:selected,title:'Contact: '+String(item.organization_name||item.project_name||'Opportunity').slice(0,140),
 location:[item.city,item.region].filter(Boolean).join(', ')};},focusIntelligence:function(kind){intelligenceFocus=kind;draft=null;activeKey='';},restoreViewport:restoreViewport,_test:{validDate:validDate,shift:shift,monday:monday,validTime:validTime,clock:clock}};
})(typeof window!=='undefined'?window:globalThis);
