/* TradeFlow Scheduling Engine V1 — local, deterministic and provider-independent.
 * All results are proposals. No writes, network access, AI calls, or hidden changes.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowScheduler=api;
})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const dateText=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const dateAdd=(text,n)=>{const d=new Date(text+'T12:00:00');d.setDate(d.getDate()+n);return dateText(d)};
const isDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00'))&&dateText(new Date(s+'T12:00:00'))===s;
const minutes=s=>typeof s==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)?Number(s.slice(0,2))*60+Number(s.slice(3)):null;
const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const number=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
function preferences(d){
 const p=(d.calendarPreferences||[]).find(x=>x.id==='local-owner')||{};
 const horizon=Math.min(90,Math.max(1,Math.floor(number(p.horizonDays,14))||14));
 const start=minutes(p.workdayStart||'08:00'),end=minutes(p.workdayEnd||'17:00');
 return {horizonDays:horizon,workdayStart:start===null?480:start,workdayEnd:end===null?1020:end,
  workingDays:Array.isArray(p.workingDays)?p.workingDays.filter(x=>Number.isInteger(x)&&x>=0&&x<=6):[1,2,3,4,5],
  bufferMinutes:Math.max(0,Math.min(90,number(p.bufferMinutes,15)))};
}
function fingerprint(task){
 return [task.id||'',task.updatedAt||'',task.due||'',task.durationMinutes||'',task.completedMinutes||'',task.splittable?'yes':'no',task.minBlockMinutes||''].join('~');
}
function resource(record){return String(record.assignedTo||record.assigneeId||record.ownerId||'local-owner')}
function buildBusy(d,buffer){
 const busy={};
 function push(date,start,length,who){
  if(!isDay(date)||start===null||!(length>0))return;
  const key=who+'|'+date;
  (busy[key]||(busy[key]=[])).push([Math.max(0,start-buffer),Math.min(1440,start+length+buffer)]);
 }
 for(const task of (d.tasks||[])){
  if(['Done','Completed','Cancelled'].includes(task.status))continue;
  push(task.due,minutes(task.scheduleTime),number(task.durationMinutes),resource(task));
 }
 for(const job of (d.jobs||[])){
  if(['Completed','Cancelled'].includes(job.status))continue;
  push(job.date,minutes(job.scheduleTime),number(job.durationMinutes),resource(job));
 }
 for(const entry of (d.calendarEntries||[])){
  if(['Cancelled','Completed','Done'].includes(entry.status))continue;
  const date=entry.date||(entry.startAt?String(entry.startAt).slice(0,10):'');
  const time=entry.time||(entry.startAt?String(entry.startAt).slice(11,16):'');
  push(date,minutes(time),number(entry.durationMinutes),resource(entry));
 }
 return busy;
}
function gaps(intervals,from,to){
 const arr=[...(intervals||[])].sort((a,b)=>a[0]-b[0]),result=[];
 let pointer=from;
 for(const item of arr){
  const a=Math.max(from,item[0]),b=Math.min(to,item[1]);
  if(b<=pointer)continue;
  if(a>pointer)result.push([pointer,a]);
  pointer=Math.max(pointer,b);
  if(pointer>=to)break;
 }
 if(pointer<to)result.push([pointer,to]);
 return result;
}
function rank(task){
 const p=String(task.priority||'normal').toLowerCase();
 return ['critical','p1','urgent'].includes(p)?0:['high','p2'].includes(p)?1:p==='normal'?2:p==='low'?3:4;
}
function allocate(task,available,pref,startDate,minimumToday=0){
 const endDate=isDay(task.due)?task.due:dateAdd(startDate,pref.horizonDays-1);
 const earliest=isDay(task.earliestStart)?task.earliestStart:startDate;
 if(endDate<earliest)return null;
 const completed=Math.max(0,number(task.completedMinutes));
 const length=Math.max(0,number(task.durationMinutes)-completed);
 if(length<15)return null;
 const isSplit=task.splittable===true||task.splittable==='true';
 const minBlock=Math.max(15,Math.min(length,number(task.minBlockMinutes,30)||30));
 const who=resource(task),candidates=[];
 for(let n=0;n<pref.horizonDays;n++){
  const date=dateAdd(startDate,n);
  if(date<earliest||date>endDate)continue;
  const dow=new Date(date+'T12:00:00').getDay();
  if(!pref.workingDays.includes(dow))continue;
  const holes=gaps(available[who+'|'+date],date===startDate?Math.max(pref.workdayStart,minimumToday):pref.workdayStart,pref.workdayEnd);
  for(const [start,end] of holes)if(end-start>=Math.min(length,minBlock))candidates.push({date,start,end,who});
 }
 if(!isSplit){
  const found=candidates.find(x=>x.end-x.start>=length);
  return found?[{date:found.date,time:clock(found.start),durationMinutes:length,assignedTo:who}]:null;
 }
 // Prefer a single uninterrupted block before dividing a task into sessions.
 const whole=candidates.find(x=>x.end-x.start>=length);
 if(whole)return [{date:whole.date,time:clock(whole.start),durationMinutes:length,assignedTo:who}];
 const ordered=candidates.slice().sort((a,b)=>(b.end-b.start)-(a.end-a.start)||a.date.localeCompare(b.date)||a.start-b.start);
 const chosen=[];let left=length;
 for(const slot of ordered){
  if(left<=0)break;
  const size=Math.min(left,slot.end-slot.start);
  if(size<minBlock)continue;
  if(left-size>0&&left-size<minBlock){
   const adjustment=minBlock-(left-size);
   if(size-adjustment>=minBlock){chosen.push({...slot,durationMinutes:size-adjustment});left-=size-adjustment;continue}
  }
  chosen.push({...slot,durationMinutes:size});left-=size;
 }
 if(left>0)return null;
 return chosen.sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start).map(x=>({date:x.date,time:clock(x.start),durationMinutes:x.durationMinutes,assignedTo:x.who}));
}
function analyze(d,options={}){
 const pref=preferences(d),startDate=isDay(options.today)?options.today:dateText(new Date());
 const clockNow=new Date(),today=dateText(clockNow);
 const minimumToday=startDate===today?Math.ceil((clockNow.getHours()*60+clockNow.getMinutes())/15)*15:0;
 const busy=buildBusy(d,pref.bufferMinutes),risks=[],proposals=[];
 const taskMap=new Map((d.tasks||[]).map(x=>[x.id,x]));
 const sessions=(d.calendarEntries||[]).filter(x=>x.sourceKind==='task'&&x.sourceId&&!['Cancelled','Completed'].includes(x.status));
 const dismissed=new Set((d.calendarProposals||[]).filter(x=>x.status==='dismissed').map(x=>x.proposalKey));
 const optionsList=(d.tasks||[]).filter(t=>!['Done','Completed','Cancelled'].includes(t.status)&&!t.scheduleTime)
  .sort((a,b)=>rank(a)-rank(b)||String(a.due||'9999').localeCompare(String(b.due||'9999'))||String(a.id).localeCompare(String(b.id)));
 for(const task of optionsList.slice(0,250)){
  const original=number(task.durationMinutes),taken=sessions.filter(s=>s.sourceId===task.id).reduce((sum,x)=>sum+number(x.durationMinutes),0);
  if(!original||original<15){risks.push({taskId:task.id,reason:'Task needs an estimated duration'});continue}
  const remaining=Math.max(0,original-number(task.completedMinutes)-taken);
  if(remaining<15)continue;
  if(isDay(task.due)&&task.due<startDate){risks.push({taskId:task.id,reason:'Task deadline has passed'});continue}
  const deps=Array.isArray(task.dependencies)?task.dependencies:[];
  if(deps.some(id=>taskMap.has(id)&&!['Done','Completed'].includes(taskMap.get(id).status))){risks.push({taskId:task.id,reason:'Waiting for prerequisite work'});continue}
  const proposalKey='task:'+task.id+':'+fingerprint(task)+':'+taken;
  if(dismissed.has(proposalKey))continue;
  const pending={...task,durationMinutes:remaining,completedMinutes:0};
  const slots=allocate(pending,busy,pref,startDate,minimumToday);
  if(!slots){risks.push({taskId:task.id,reason:'No feasible work block before deadline within planning horizon'});continue}
  const id='plan:'+task.id+':'+slots.map(s=>s.date+'-'+s.time+'-'+s.durationMinutes).join('|');
  proposals.push({id,proposalKey,taskId:task.id,taskTitle:String(task.title||'Task'),sourceKind:'task',
   fingerprint:fingerprint(task),reason:slots.length>1?'Split flexible work across '+slots.length+' available sessions':'Allocate a free work session',
   slots,remainingMinutes:remaining,deadline:task.due||'',priority:task.priority||'Normal'});
  for(const slot of slots){
   const n=minutes(slot.time),who=slot.assignedTo,key=who+'|'+slot.date;
   (busy[key]||(busy[key]=[])).push([Math.max(0,n-pref.bufferMinutes),Math.min(1440,n+slot.durationMinutes+pref.bufferMinutes)]);
  }
 }
 return {proposals,risks,preferences:pref,planningStart:startDate,planningEnd:dateAdd(startDate,pref.horizonDays-1)};
}
return Object.freeze({analyze,preferences,buildBusy,gaps,allocate,minutes,clock,fingerprint});
});
