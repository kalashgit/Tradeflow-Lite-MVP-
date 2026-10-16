/* TradeFlow Calendar Release 02 — local scheduling foundation.
   Uses existing Tasks and Jobs; never assumes live crew locations or online sync. */
(function(global){
'use strict';
var bridge=null,mode='week',selected='',draft=null;
function day(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
selected=day();
function e(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]})}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(new Date(v+'T12:00:00').getTime())&&new Date(v+'T12:00:00').toISOString().slice(0,10)===v}
function asDate(v){return new Date(v+'T12:00:00')}
function dateString(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function shift(v,n){var d=asDate(v);d.setDate(d.getDate()+n);return dateString(d)}
function monday(v){var d=asDate(v);d.setDate(d.getDate()-((d.getDay()+6)%7));return dateString(d)}
function label(v,opts){return asDate(v).toLocaleDateString('en-US',opts||{month:'short',day:'numeric',year:'numeric'})}
function records(d){
 var all=[];
 (d.tasks||[]).filter(function(t){return validDate(t.due||'')}).forEach(function(t){
  all.push({id:t.id,kind:'task',title:String(t.title||'Task'),date:t.due,time:t.scheduleTime||'',duration:Number(t.durationMinutes)||0,
  location:t.location||'',done:t.status==='Done',notes:t.description||''});
 });
 (d.jobs||[]).filter(function(j){return validDate(j.date||'')}).forEach(function(j){
  all.push({id:j.id,kind:'job',title:String(j.title||'Job'),date:j.date,time:j.scheduleTime||'',duration:Number(j.durationMinutes)||0,
  location:j.address||'',done:j.status==='Completed',notes:j.description||''});
 });
 return all.sort(function(a,b){return (a.date+' '+(a.time||'99:99')+' '+a.title).localeCompare(b.date+' '+(b.time||'99:99')+' '+b.title)});
}
function glyph(name){
 var paths={calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
 map:'<path d="M12 22s8-6 8-12a8 8 0 1 0-16 0c0 6 8 12 8 12Z"/><circle cx="12" cy="10" r="2.5"/>',
 task:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',
 job:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M9 7V4h6v3M3 12h18"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>'};
 return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.calendar)+'</svg>';
}
function item(x){
 return '<article class="tf-cal-item"><span class="tf-cal-item-icon">'+glyph(x.kind==='job'?'job':'task')+'</span><div class="tf-cal-item-data"><strong>'+e(x.title)+'</strong><small>'+e(x.kind==='job'?'Job':'Task')+' · '+e(x.time?x.time:'Time not assigned')+
 (x.duration?' · '+x.duration+' min':'')+(x.done?' · Completed':'')+'</small>'+
 (x.location?'<small>'+glyph('map')+' '+e(x.location)+'</small>':'')+'</div>'+
 '<button type="button" data-tab="'+(x.kind==='job'?'jobs':'tasks')+'" aria-label="Open '+e(x.title)+'">View ›</button></article>';
}
function dateEvents(list,date){
 var items=list.filter(function(x){return x.date===date});
 return '<section class="tf-cal-day-list"><header><h2>'+e(label(date,{weekday:'long',month:'short',day:'numeric'}))+'</h2><small>'+items.length+' scheduled record'+(items.length===1?'':'s')+'</small></header>'+
 (items.length?items.map(item).join(''):'<div class="tf-cal-empty">No Tasks or Jobs scheduled for this date.</div>')+'</section>';
}
function renderDay(list){return dateEvents(list,selected)}
function renderWeek(list){
 var start=monday(selected),days=Array.from({length:7},function(_,i){return shift(start,i)});
 return '<section class="tf-cal-week"><div class="tf-cal-week-grid">'+days.map(function(date){
  var todays=list.filter(function(x){return x.date===date}),picked=date===selected;
  return '<button type="button" class="tf-cal-day-button '+(picked?'active':'')+'" data-calendar-action="select-day" data-date="'+date+'"><span>'+e(label(date,{weekday:'short'}))+'</span><strong>'+asDate(date).getDate()+'</strong><small>'+(todays.length?todays.length+' planned':'—')+'</small></button>';
 }).join('')+'</div></section>'+dateEvents(list,selected);
}
function renderMonth(list){
 var d=asDate(selected),first=dateString(new Date(d.getFullYear(),d.getMonth(),1));
 var start=monday(first),cells=Array.from({length:42},function(_,i){return shift(start,i)});
 return '<section class="tf-cal-month"><div class="tf-cal-month-labels">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(function(x){return '<span>'+x+'</span>'}).join('')+'</div>'+
 '<div class="tf-cal-month-grid">'+cells.map(function(date){
  var current=date.slice(0,7)===selected.slice(0,7),cnt=list.filter(function(x){return x.date===date}).length;
  return '<button type="button" data-calendar-action="select-day" data-date="'+date+'" class="'+(current?'':'other ')+(date===selected?'active':'')+'"><span>'+asDate(date).getDate()+'</span>'+(cnt?'<small>'+cnt+'</small>':'')+'</button>';
 }).join('')+'</div></section>'+dateEvents(list,selected);
}
function appointmentForm(){
 return '<section class="tf-cal-formpanel" aria-label="New appointment"><div class="tf-cal-section-head"><div><h2>New appointment</h2><p>Saves as a Task, visible in both the calendar and Tasks.</p></div><button type="button" data-calendar-action="cancel">×</button></div>'+
 '<form id="tfCalendarForm"><label>Title *<input name="title" required maxlength="150" value="'+e(draft?.title||'')+'" placeholder="e.g. Site visit with property manager"></label>'+
 '<div class="tf-cal-twocol"><label>Date *<input type="date" name="date" required value="'+e(draft?.date||selected)+'"></label><label>Start time <input type="time" name="time" value="'+e(draft?.time||'')+'"></label></div>'+
 '<div class="tf-cal-twocol"><label>Estimated duration (minutes)<input type="number" min="15" max="1440" step="15" name="duration" value="'+e(draft?.duration||60)+'"></label>'+
 '<label>Assigned to (notes)<input name="assignedTo" maxlength="100" placeholder="e.g. Owner" value=""></label></div>'+
 '<label>Location / address<input name="location" maxlength="220" value="'+e(draft?.location||'')+'" placeholder="Optional"></label>'+
 '<label>Notes<textarea name="description" maxlength="1600" rows="3" placeholder="What to bring or prepare">'+e(draft?.notes||'')+'</textarea></label>'+
 '<div class="tf-cal-form-actions"><button class="tf-cal-primary" type="submit">Save appointment</button><button class="tf-cal-secondary" type="button" data-calendar-action="cancel">Cancel</button></div></form>'+
 '<p class="tf-cal-disclosure">There are no connected employee accounts, automatic invitations, GPS tracking, or route optimizations in this release.</p></section>';
}
function render(d){
 var list=records(d||{}),current=mode==='day'?renderDay(list):mode==='month'?renderMonth(list):renderWeek(list);
 var period=mode==='month'?label(selected,{month:'long',year:'numeric'}):mode==='week'?
 label(monday(selected),{month:'short',day:'numeric'})+' – '+label(shift(monday(selected),6),{month:'short',day:'numeric'}):label(selected);
 return '<main class="tf-cal-page"><header class="tf-cal-head"><button type="button" data-tab="settings" class="tf-cal-back">‹ More</button>'+
 '<div class="tf-cal-title"><span>TRADEFLOW / OPERATIONS</span><h1>Calendar</h1><p>Plan your work around real Tasks, Jobs and appointments.</p></div></header>'+
 '<div class="tf-cal-controls"><div class="tf-cal-modes">'+['day','week','month'].map(function(x){return '<button type="button" data-calendar-action="mode" data-mode="'+x+'" class="'+(mode===x?'active':'')+'">'+x[0].toUpperCase()+x.slice(1)+'</button>'}).join('')+
 '</div><button class="tf-cal-primary" type="button" data-calendar-action="new">+ Appointment</button></div>'+
 '<div class="tf-cal-period"><div><button type="button" data-calendar-action="prev" aria-label="Previous period">‹</button><strong>'+e(period)+'</strong><button type="button" data-calendar-action="next" aria-label="Next period">›</button></div>'+
 '<button type="button" data-calendar-action="today">Today</button></div>'+
 '<div class="tf-cal-content">'+(draft?appointmentForm():current)+'</div>'+
 '<div class="tf-cal-resources"><div><strong>Field operations</strong><p>Tasks and Jobs are synchronized within this device. Map pins and opportunity records remain available under Map and Opportunities.</p></div><button type="button" data-tab="map">Open Map →</button></div>'+
 '<p class="tf-cal-disclosure">Local scheduling foundation · Manual appointments · No connected team calendar or automated route planner yet.</p></main>';
}
function mount(context){
 bridge=context;
 if(typeof document!=='undefined'){
  document.addEventListener('click',click);
  document.addEventListener('submit',submit);
 }
}
async function click(evt){
 if(!bridge)return;
 var b=evt.target.closest&&evt.target.closest('[data-calendar-action]');if(!b)return;
 evt.preventDefault();
 var action=b.dataset.calendarAction;
 if(action==='mode'){mode=['day','week','month'].includes(b.dataset.mode)?b.dataset.mode:'week';draft=null;await bridge.render();return}
 if(action==='select-day'){if(validDate(b.dataset.date))selected=b.dataset.date;draft=null;await bridge.render();return}
 if(action==='today'){selected=day();draft=null;await bridge.render();return}
 if(action==='prev'||action==='next'){
  var delta=action==='next'?1:-1,d=asDate(selected);
  if(mode==='month'){var oldDay=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+delta);var last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(last,oldDay))}
  else d.setDate(d.getDate()+delta*(mode==='week'?7:1));
  selected=dateString(d);draft=null;await bridge.render();return;
 }
 if(action==='new'){draft={date:selected};await bridge.render();return}
 if(action==='cancel'){draft=null;await bridge.render();return}
 if(action==='opportunity'){
  var item=await bridge.get('opportunities',b.dataset.id);if(!item)return;
  selected=day();mode='day';draft={date:selected,title:'Contact / site visit: '+String(item.organization_name||item.project_name||'Opportunity').slice(0,115),
   location:[item.city,item.region].filter(Boolean).join(', '),notes:'Related opportunity: '+String(item.source_record_id||item.id).slice(0,100)+'\nVerify contact and meeting time before confirming.'};
  bridge.navigate('calendar');return;
 }
}
async function submit(evt){
 if(evt.target.id!=='tfCalendarForm'||!bridge)return;
 evt.preventDefault();
 var f=new FormData(evt.target),text=function(k,n){return String(f.get(k)||'').trim().slice(0,n||180)};
 var title=text('title',150),date=text('date',10),time=text('time',5),duration=Number(f.get('duration')||60);
 if(!title||!validDate(date)||time&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)||!Number.isInteger(duration)||duration<15||duration>1440){
  alert('Enter a title, valid date, optional time and duration (15–1440 minutes).');return;
 }
 try{
  await bridge.put('tasks',{id:bridge.uid(),title: title,due:date,status:'Open',scheduleTime:time,durationMinutes:duration,location:text('location',220),
   assignedTo:text('assignedTo',100),description:text('description',1600),kind:'appointment',createdAt:new Date().toISOString()});
  selected=date;draft=null;bridge.notify('Appointment saved to Tasks and Calendar');
 }catch(err){alert('Could not save appointment: '+err.message)}
}
global.TradeFlowCalendar={configure:mount,render:render,records:records,prepareOpportunity:function(item){
 selected=day();mode='day';draft={date:selected,title:'Contact: '+String(item.organization_name||item.project_name||'Opportunity').slice(0,140),
 location:[item.city,item.region].filter(Boolean).join(', ')};},_test:{validDate:validDate,shift:shift,monday:monday}};
})(typeof window!=='undefined'?window:globalThis);
