/* TradeFlow Local Scheduler v1.
 * Deterministic, offline, approval-only planning; no model calls or network.
 * Existing business records are authoritative. Suggestions are never writes.
 */
(function(global){
'use strict';
const DAY=86400000;
const complete=new Set(['Done','Completed','Cancelled','Canceled']);
function dateOnly(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00');return !isNaN(d)&&dateOnly(d)===s}
function shift(s,days){const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+days);return dateOnly(d)}
function validTime(t){return typeof t==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)}
function timeNum(t){return validTime(t)?Number(t.slice(0,2))*60+Number(t.slice(3)):NaN}
function timeString(v){return String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0')}
function clamp(v,min,max){v=Number(v);return Number.isFinite(v)?Math.max(min,Math.min(max,Math.round(v))):min}
function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}
function priority(p){let x=String(p||'').toLowerCase();return ({critical:0,p1:0,urgent:0,high:1,p2:1,normal:2,medium:2,p3:2,low:3,p4:3,optional:4,p5:4})[x]??2}
function resource(x){return String(x.assignedTo||x.assigneeId||x.resourceId||'local-owner')}
function settings(d){
 const p=(d.calendarPreferences||[]).find(x=>x.id==='local-owner')||{};
 const a=validTime(p.workStart)?timeNum(p.workStart):480;
 const b=validTime(p.workEnd)?timeNum(p.workEnd):1020;
 return {horizonDays:clamp(p.horizonDays??14,1,90),start:a,end:b>a?b:1020,
  workDays:Array.isArray(p.workDays)?p.workDays.filter(x=>Number.isInteger(x)&&x>=0&&x<=6):[1,2,3,4,5],
  snapMinutes:[5,10,15,30,60].includes(Number(p.snapMinutes))?Number(p.snapMinutes):15,
  bufferMinutes:clamp(p.bufferMinutes??0,0,120),
  minBlockMinutes:clamp(p.minBlockMinutes??45,15,240),
  breaks:Array.isArray(p.breaks)?p.breaks.filter(x=>validTime(x.start)&&validTime(x.end)&&timeNum(x.end)>timeNum(x.start)):[]};
}
function normalizedBusy(d,dayStart,dayEnd,prefs){
 const busy=[],unknown=[];
 const entries=[];
 for(const x of d.calendarEntries||[]){
  if(complete.has(x.status)||x.status==='Dismissed')continue;
  entries.push({id:'event:'+x.id,date:x.date||String(x.startAt||'').slice(0,10),time:x.time||(x.startAt?String(x.startAt).slice(11,16):''),duration:x.durationMinutes,assignedTo:resource(x),title:x.title||'Event'});
 }
 const linkedTasks=new Set((d.calendarEntries||[]).filter(x=>x.sourceKind==='task'&&!complete.has(x.status)).map(x=>String(x.sourceId)));
 for(const x of d.tasks||[]){
  if(complete.has(x.status)||!x.scheduleTime||linkedTasks.has(String(x.id)))continue;
  entries.push({id:'task:'+x.id,date:x.due,time:x.scheduleTime,duration:x.durationMinutes,assignedTo:resource(x),title:x.title||'Task'});
 }
 for(const x of d.jobs||[]){
  if(complete.has(x.status)||!x.scheduleTime)continue;
  entries.push({id:'job:'+x.id,date:x.date,time:x.scheduleTime,duration:x.durationMinutes,assignedTo:resource(x),title:x.title||'Job'});
 }
 for(const x of entries){
  if(!validDate(x.date)||x.date<dayStart||x.date>dayEnd||!validTime(x.time))continue;
  const len=Number(x.duration);
  if(!Number.isFinite(len)||len<=0){unknown.push(x);continue}
  busy.push({date:x.date,start:timeNum(x.time),end:timeNum(x.time)+len,who:x.assignedTo,id:x.id});
 }
 for(let date=dayStart;date<=dayEnd;date=shift(date,1)){
  for(const br of prefs.breaks)busy.push({date,start:timeNum(br.start),end:timeNum(br.end),who:'*',id:'break'});
 }
 return {busy,unknown};
}
function snapshotSignature(d,task,prefs){
 // Include all scheduling inputs, including other users' confirmed reservations and
 // dismissed proposals. Hash a normalized snapshot for optimistic revalidation.
 const projection={
  task:{id:task.id,title:task.title,due:task.due,priority:task.priority,estimate:task.durationMinutes,completed:task.completedMinutes,
   min:task.minBlockMinutes,split:task.splittable,earliest:task.earliestStart,dependencies:task.dependsOn,assigned:resource(task),status:task.status},
  schedules:(d.calendarEntries||[]).map(x=>[x.id,x.date,x.time,x.durationMinutes,x.status,x.sourceId,x.sourceKind,resource(x)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
  jobs:(d.jobs||[]).map(x=>[x.id,x.date,x.scheduleTime,x.durationMinutes,x.status,resource(x)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
  tasks:(d.tasks||[]).map(x=>[x.id,x.due,x.scheduleTime,x.durationMinutes,x.status,resource(x)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
  preferences:prefs
 };
 return hash(JSON.stringify(projection));
}
function analyze(data,opts){
 const d=data||{},options=opts||{},now=options.now?new Date(options.now):new Date(),today=dateOnly(now),prefs=settings(d);
 const endDate=shift(today,prefs.horizonDays-1),calendar=normalizedBusy(d,today,endDate,prefs),busy=calendar.busy;
 const risks=[],proposals=[],frozen=(d.calendarProposals||[]).filter(x=>x.status==='dismissed');
 if(!prefs.workDays.length)return {proposals,risks:[{reason:'No working days configured'}],preferences:prefs};
 const existing=(d.tasks||[]).filter(t=>!complete.has(t.status));
 const scheduled=(d.calendarEntries||[]).filter(x=>x.sourceKind==='task'&&!complete.has(x.status));
 const unscheduled=existing.filter(x=>!validTime(x.scheduleTime));
 unscheduled.sort((a,b)=>priority(a.priority)-priority(b.priority)||
  String(a.due||'9999').localeCompare(String(b.due||'9999'))||String(a.id).localeCompare(String(b.id)));
 const dayMinutes=now.getHours()*60+now.getMinutes(),snap=prefs.snapMinutes;
 const minNow=Math.ceil(dayMinutes/snap)*snap;
 function freeIntervals(date,who){
  const all=busy.filter(x=>x.date===date&&(x.who===who||x.who==='*'))
   .map(x=>({start:x.start-prefs.bufferMinutes,end:x.end+prefs.bufferMinutes}))
   .sort((a,b)=>a.start-b.start);
  const result=[],minimum=date===today?Math.max(prefs.start,minNow):prefs.start;
  let cursor=minimum;
  for(const entry of all){
   if(entry.end<=cursor)continue;
   const end=Math.min(prefs.end,entry.start);
   if(end>cursor)result.push({start:cursor,end});
   cursor=Math.max(cursor,entry.end);
   if(cursor>=prefs.end)break;
  }
  if(cursor<prefs.end)result.push({start:cursor,end:prefs.end});
  return result.map(x=>({start:Math.ceil(x.start/snap)*snap,end:Math.floor(x.end/snap)*snap})).filter(x=>x.end>x.start);
 }
 for(const task of unscheduled){
  const total=Number(task.durationMinutes);
  if(!Number.isFinite(total)||total<15||total>60*500){risks.push({taskId:task.id,reason:'Estimated duration needed (at least 15 minutes)'});continue}
  const who=resource(task),dependencyIds=Array.isArray(task.dependsOn)?task.dependsOn:[];
  if(dependencyIds.some(id=>{const dep=(d.tasks||[]).find(x=>String(x.id)===String(id));return !dep||!complete.has(dep.status)})){
   risks.push({taskId:task.id,reason:'Prerequisite task has not been completed'});continue;
  }
  const confirmed=scheduled.filter(x=>String(x.sourceId)===String(task.id));
  let already=clamp(task.completedMinutes||0,0,total);
  // Completed sessions count only when separately reported as complete.
  const doneMinutes=confirmed.filter(x=>x.status==='Completed').reduce((n,x)=>n+(Number(x.actualMinutes)||Number(x.durationMinutes)||0),0);
  already=Math.max(already,Math.min(total,doneMinutes));
  const futureBooked=confirmed.filter(x=>x.status!=='Completed'&&x.date>=today&&
   (x.date>today||timeNum(x.time)+Number(x.durationMinutes||0)>dayMinutes)).reduce((n,x)=>n+Math.max(0,Number(x.durationMinutes)||0),0);
  const remaining=Math.max(0,total-already-futureBooked);
  if(!remaining)continue;
  if(calendar.unknown.some(x=>x.assignedTo===who)){
   risks.push({taskId:task.id,reason:'Existing commitment has no duration; availability cannot be verified'});continue;
  }
  const deadline=validDate(task.due||'')?task.due:endDate;
  const maxDate=deadline<endDate?deadline:endDate;
  const earliest=validDate(task.earliestStart||'')?task.earliestStart:today;
  if(maxDate<today||earliest>maxDate){risks.push({taskId:task.id,reason:'No schedulable dates before the deadline'});continue}
  const splittable=task.splittable===true;
  const minBlock=splittable?clamp(task.minBlockMinutes||prefs.minBlockMinutes,15,240):remaining;
  const maxBlock=splittable?clamp(task.maxBlockMinutes||remaining,minBlock,remaining):remaining;
  const slots=[],accepted=[];
  let left=remaining;
  // Prefer uninterrupted placement when possible. Otherwise split across whole
  // free intervals, maintaining the user's minimum useful work block.
  outer:for(let date=earliest<today?today:earliest;date<=maxDate;date=shift(date,1)){
   if(!prefs.workDays.includes(new Date(date+'T12:00:00').getDay()))continue;
   for(const gap of freeIntervals(date,who)){
    const available=gap.end-gap.start;
    if(available<minBlock)continue;
    let length=splittable?Math.min(maxBlock,left,available):remaining;
    length=Math.floor(length/snap)*snap;
    if(length<minBlock)continue;
    if(splittable&&left-length>0&&left-length<minBlock){
     const adjusted=Math.floor((left-minBlock)/snap)*snap;
     if(adjusted>=minBlock&&adjusted<=available)length=adjusted;
     else if(left<=available&&left<=maxBlock)length=left;
     else continue;
    }
    if(length<minBlock||length>available||length>left)continue;
    slots.push({date,time:timeString(gap.start),durationMinutes:length,assignedTo:who});
    accepted.push({date,start:gap.start,end:gap.start+length,who,id:'proposal:'+String(task.id)});
    left-=length;
    if(left<=0)break outer;
   }
  }
  if(left>0){
   risks.push({taskId:task.id,reason:'Not enough permitted free time before the deadline ('+left+' min unallocated)'});
   continue;
  }
  const fingerprint=snapshotSignature(d,task,prefs);
  const proposalKey='task:'+task.id+':'+fingerprint;
  if(frozen.some(x=>x.proposalKey===proposalKey))continue;
  const id='plan:'+hash(proposalKey+'|'+JSON.stringify(slots));
  const reason=splittable&&slots.length>1?'Split into '+slots.length+' sessions before the deadline':
   'Schedule '+remaining+' minutes in verified working hours';
  proposals.push({id,proposalKey,fingerprint,taskId:task.id,taskTitle:String(task.title||'Task'),
   priority:String(task.priority||'Normal'),deadline:validDate(task.due||'')?task.due:'',remainingMinutes:remaining,
   slots,reason,requiresApproval:true});
  busy.push(...accepted);
 }
 return {proposals,risks,preferences:prefs,generatedFor:today};
}
global.TradeFlowScheduler={analyze,settings,_test:{dateOnly,validDate,shift,validTime,timeNum,timeString,hash}};
})(typeof window!=='undefined'?window:globalThis);
