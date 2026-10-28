/* TradeFlow Operational Intelligence v1. Evidence from local records only.
 * Detectors cannot navigate, write, send, charge, or execute proposed commands.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowIntelligence=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const list=(d,key)=>Array.isArray(d[key])?d[key]:[];
const state=x=>String(x||'').trim().toLowerCase();
const ref=(store,id)=>({store,id});
const key=r=>r.store+':'+r.id;
const id=(type,refs)=>type+':'+refs.map(key).sort().map(encodeURIComponent).join('|');
const days=(a,b)=>Math.floor((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000);
const action=(commandId,params)=>({commandId,params});
const open=r=>action('record.open',{ref:r});
const builtins=[
 {id:'task.overdue',evaluate(d,c){
  return list(d,'tasks').filter(t=>!c.commands.terminal(t)&&c.commands.isDate(t.due)&&t.due<c.today).map(t=>{
   const r=ref('tasks',t.id),blocked=(Array.isArray(t.dependencies)?t.dependencies:[]).some(dep=>!list(d,'tasks').some(x=>x.id===dep&&['done','completed'].includes(state(x.status))));
   return {type:this.id,refs:[r],explanation:'Task deadline '+t.due+' has passed and the task is not marked complete.',confidence:'record_based',limitations:['Completion and deadlines are owner-entered local records.'],priority:{tier:1,score:Math.min(90,days(c.today,t.due))+(['critical','urgent','p1'].includes(state(t.priority))?100:0)},constraints:blocked?['prerequisite_work_unresolved']:[],action:open(r),evidence:{due:t.due,status:t.status||'unknown'}};
  });
 }},
 {id:'calendar.conflict',evaluate(d,c){
  if(!c.calendar?.conflicts)throw Error('Calendar conflict adapter is unavailable');
  // Normalize the already-used owner aliases; hidden layers remain part of conflict checks.
  const normalized={...d};for(const s of ['tasks','jobs','calendarEntries'])normalized[s]=list(d,s).map(x=>({...x,assignedTo:x.assignedTo||x.assigneeId||x.ownerId||'local-owner'}));
  const end=new Date(c.today+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+c.horizonDays-1);
  const until=end.toISOString().slice(0,10);
  const source=x=>ref(x.kind==='event'?'calendarEntries':x.kind==='task'?'tasks':'jobs',x.id);
  return c.calendar.conflicts(normalized,{from:c.today,until}).map(issue=>({
   type:this.id,refs:[source(issue.a),source(issue.b)],explanation:'Two booked commitments overlap on '+issue.date+' for the same recorded resource.',confidence:'record_based',limitations:['Checks recorded times and durations within the planning horizon; no travel-time or external-calendar assumptions.','Unassigned legacy commitments use the local-owner resource.'],priority:{tier:issue.date===c.today?0:1,score:100-Math.min(90,Math.max(0,days(issue.date,c.today)))},constraints:[],action:action('view.filter',{workspace:'calendar',filter:'conflicts'}),evidence:{date:issue.date,entries:[{ref:source(issue.a),time:issue.a.time,durationMinutes:issue.a.duration},{ref:source(issue.b),time:issue.b.time,durationMinutes:issue.b.duration}]}
  }));
 }},
 {id:'invoice.overdue',evaluate(d,c){
  if(!c.revenue?.totals||!c.revenue?.collected)throw Error('Invoice financial adapter is unavailable');
  const result=[];
  for(const inv of list(d,'invoices')){
   if(state(inv.status)!=='issued'||!c.commands.isDate(inv.dueDate)||inv.dueDate>=c.today)continue;
   const payments=list(d,'payments').filter(p=>p.invoiceId===inv.id),currency=inv.currency||'USD';
   let invalid=!Array.isArray(inv.lines)||!inv.lines.length||inv.lines.some(x=>!Number.isFinite(Number(x.qty))||Number(x.qty)<=0||!Number.isFinite(Number(x.unitPrice))||Number(x.unitPrice)<0)||!Number.isFinite(Number(inv.taxRate||0))||Number(inv.taxRate||0)<0||Number(inv.taxRate||0)>100||payments.some(p=>!Number.isFinite(Number(p.amount))||Number(p.amount)<0||(p.currency&&p.currency!==currency)||(p.customerId&&p.customerId!==inv.customerId));
   const balance=invalid?null:c.revenue.totals(inv).total-c.revenue.collected(inv,payments);
   if(!Number.isFinite(balance)||!Number.isFinite(balance*100))invalid=true;
   const remaining=invalid?null:Math.round(balance*100)/100;
   if(!invalid&&remaining<=.005)continue;
   const r=ref('invoices',inv.id);
   result.push({type:this.id,refs:[r],explanation:invalid?'An issued invoice is past its due date, but its amount or payment links need review.':'An issued invoice is past its due date with a recorded unpaid balance.',confidence:invalid?'limited':'record_based',limitations:['Payments are local ledger entries, not bank or provider-confirmed settlements.','Currency is preserved from the invoice; legacy invoice screens use USD.'],priority:{tier:1,score:Math.min(90,days(c.today,inv.dueDate))},constraints:invalid?['financial_record_invalid']:[],action:open(r),evidence:{dueDate:inv.dueDate,remaining,currency,paymentRefs:payments.map(p=>ref('payments',p.id))}});
  }
  return result;
 }},
 {id:'quotation.accepted_handoff',evaluate(d,c){
  return list(d,'quotes').filter(q=>state(q.status)==='accepted'&&!list(d,'jobs').some(j=>j.quoteId===q.id)).map(q=>{
   const r=ref('quotes',q.id);
   return {type:this.id,refs:[r],explanation:'An accepted quotation has no job linked by quoteId. Review the handoff before creating a job.',confidence:'record_based',limitations:['Quote acceptance is locally recorded. Unlinked work cannot be inferred from matching titles.'],priority:{tier:2,score:70},constraints:!q.customerId?['customer_required']:[],action:open(r),evidence:{status:q.status,linkedJobCount:0}};
  });
 }},
 {id:'quotation.stale_open',evaluate(d,c){
  return list(d,'quotes').filter(q=>c.commands.staleQuote(q,c.today,c.staleQuoteDays)).map(q=>{
   const r=ref('quotes',q.id);
   return {type:this.id,refs:[r],explanation:'A sent quotation has no recorded follow-up or contact within '+c.staleQuoteDays+' days. A follow-up may be useful.',confidence:'limited',limitations:['Unrecorded calls, emails or customer conversations are unknown. This is a configurable review heuristic, not proof of lost interest.'],priority:{tier:2,score:30},constraints:[],action:action('draft.prepare',{kind:'task',ref:r,title:'Follow up quotation: '+String(q.title||'Quotation').slice(0,120)}),evidence:{sentDate:q.sentDate,staleQuoteDays:c.staleQuoteDays,lastFollowUpAt:q.lastFollowUpAt||null,lastContactAt:q.lastContactAt||null}};
  });
 }}
];
// Optional contractor optimization detectors. Each finding is read-only and
// refers exclusively to locally recorded evidence, never presumed outcomes.
const optimizationDetectors=[
 {id:'job.billing_review',evaluate(d,c){
  const issued=list(d,'invoices').filter(i=>state(i.status)!=='void');
  return list(d,'jobs').filter(j=>state(j.status)==='completed'&&j.billingReviewWaived!==true&&
   !issued.some(i=>i.jobId===j.id)).map(j=>{
    const r=ref('jobs',j.id);
    return {type:this.id,refs:[r],explanation:'Completed job has no locally recorded invoice linked to it. Review whether billing is required.',confidence:'limited',
     limitations:['An invoice may exist in an external accounting system or billing may not apply.','This is a billing review, not evidence that revenue was lost.'],
     priority:{tier:1,score:25},constraints:[],action:open(r),evidence:{status:j.status,linkedInvoiceCount:0}};
  });
 }},
 {id:'job.crew_assignment_review',evaluate(d,c){
  const crew=list(d,'crew'),jobs=list(d,'jobs');
  if(!crew.length)return [];
  const ids=new Set(crew.map(x=>x.id));
  const end=new Date(c.today+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+7);
  const last=end.toISOString().slice(0,10);
  return jobs.filter(j=>!['completed','cancelled','canceled'].includes(state(j.status))&&
   c.commands.isDate(j.date)&&j.date>=c.today&&j.date<=last&&(!j.crewId||!ids.has(j.crewId))).map(j=>{
    const r=ref('jobs',j.id);
    return {type:this.id,refs:[r],explanation:'Scheduled job has no valid crew assignment in the local Dispatch roster.',confidence:'record_based',
      limitations:['Crew assignments in an external scheduling system are not visible.','An unassigned job may be intentionally unallocated.'],
      priority:{tier:1,score:30},constraints:[],action:open(r),evidence:{scheduledDate:j.date,crewId:j.crewId||null}};
  });
 }}
];
function createEngine({commands,calendar,revenue,detectors=builtins}={}){
 if(!commands?.validateReferences||!commands?.staleQuote)throw Error('The shared command validation adapter is required');
 const modules=detectors.slice();if(new Set(modules.map(x=>x.id)).size!==modules.length||modules.some(x=>!x.id||typeof x.evaluate!=='function'))throw Error('Detectors need unique identifiers and an evaluate function');
 function evaluate(data={},options={}){
  const now=options.now||new Date().toISOString(),date=new Date(now);if(isNaN(date.getTime()))throw Error('Valid evaluation timestamp required');
  const today=options.today||commands.dateText(date);if(!commands.isDate(today))throw Error('Valid local evaluation date required');
  const pref=list(data,'calendarPreferences').find(x=>x.id==='local-owner')||{};
  const staleQuoteDays=Number.isFinite(options.staleQuoteDays)?Math.max(1,Math.min(365,options.staleQuoteDays)):14;
  const horizonDays=Math.max(1,Math.min(90,Number(pref.horizonDays)||14));
  const scope={actor:options.actor||'local-owner',businessId:options.businessId||'local-business'};
  const snapshot=clone(data);for(const store of Object.keys(snapshot))if(Array.isArray(snapshot[store]))snapshot[store]=snapshot[store].filter(r=>!r.businessId||r.businessId===scope.businessId);
  freeze(snapshot);
  const context={commands,calendar,revenue,today,now:date.toISOString(),staleQuoteDays,horizonDays,...scope},findings=new Map(),diagnostics=[];
  for(const detector of modules){
   let found;
   try{found=detector.evaluate(snapshot,context);if(!Array.isArray(found))throw Error('Detector must return a findings array')}
   catch(error){diagnostics.push({detectorId:detector.id,status:'unavailable',message:error.message});continue}
   for(const raw of found){
    if(raw.type!==detector.id||!Array.isArray(raw.refs)||!raw.refs.length||raw.refs.some(r=>!r||typeof r.store!=='string'||typeof r.id!=='string'||!r.id)||typeof raw.explanation!=='string'||!raw.priority||!Number.isFinite(raw.priority.tier)||!Number.isFinite(raw.priority.score)||!['record_based','limited'].includes(raw.confidence)){
     diagnostics.push({detectorId:detector.id,status:'invalid_finding',message:'Incomplete finding rejected'});continue;
    }
    let validated=[],constraints=[...(raw.constraints||[])];
    try{validated=commands.validateReferences(snapshot,raw.refs,scope)}catch(error){constraints.push('invalid_record_relationship');diagnostics.push({detectorId:detector.id,status:'record_needs_review',message:error.message})}
    const refs=[...new Map([...raw.refs,...validated.map(x=>x.ref)].map(r=>[key(r),r])).values()].sort((a,b)=>key(a).localeCompare(key(b)));
    const blocked=constraints.length>0;
    const priority={tier:blocked?3:Math.max(0,Math.min(2,raw.priority.tier)),band:blocked?'review':raw.priority.tier===0?'urgent':raw.priority.tier===1?'high':'normal',score:Math.max(0,Math.min(1000,raw.priority.score)),constraints:[...new Set(constraints)]};
    const finding={id:id(raw.type,raw.refs),detectorId:detector.id,recordRefs:refs,evaluatedAt:context.now,explanation:raw.explanation,confidence:blocked?'limited':raw.confidence,limitations:[...(raw.limitations||[]),...(blocked?['Resolve the recorded constraint before an operational action.']:[])],priority,proposedAction:constraints.includes('invalid_record_relationship')?null:raw.action||null,status:blocked?'blocked':'ready_for_review',evidence:clone(raw.evidence||{})};
    const old=findings.get(finding.id);
    if(!old||finding.status==='blocked')findings.set(finding.id,finding);
   }
  }
  // Hard eligibility/resource/relationship constraints always precede numeric score.
  const ranked=[...findings.values()].sort((a,b)=>a.priority.tier-b.priority.tier||b.priority.score-a.priority.score||a.id.localeCompare(b.id));
  return {version:1,evaluatedAt:context.now,today,findings:ranked,diagnostics,coverage:{horizonDays,staleQuoteDays,detectors:modules.map(x=>x.id),localRecordsOnly:true}};
 }
 return Object.freeze({evaluate,detectorIds:Object.freeze(modules.map(x=>x.id))});
}
return Object.freeze({version:1,createEngine,builtinDetectors:Object.freeze(builtins.map(x=>Object.freeze(x))),optimizationDetectors:Object.freeze(optimizationDetectors.map(x=>Object.freeze(x)))});
});
