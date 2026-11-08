/* Transactional local domain events. Default consumer is an authorized read-only review. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowBusinessEvents=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const families={customers:'customer',quotes:'quotation',jobs:'job',tasks:'task',invoices:'invoice',payments:'payment',calendarEntries:'calendar',jobCosts:'job_cost',opportunities:'opportunity',suppliers:'supplier',supplyOrders:'purchase_order',crew:'crew',expenses:'expense'};
const states={quotes:{sent:'sent',accepted:'accepted',declined:'declined'},jobs:{planned:'scheduled',started:'started','in progress':'started',completed:'completed',done:'completed'},invoices:{issued:'issued',paid:'recorded_paid'},tasks:{done:'completed',completed:'completed'}};
const allowed=new Set(Object.entries(families).flatMap(([store,family])=>['created','updated','committed',...Object.values(states[store]||{})].map(s=>family+'.'+s)));
const clone=x=>JSON.parse(JSON.stringify(x)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function validate(event){
 if(!event||event.kind!=='domain.event'||!allowed.has(event.type)||typeof event.id!=='string'||!event.id||!event.correlationId||!event.businessId||!event.actor||!Number.isFinite(Date.parse(event.at))||!families[event.ref?.store]||typeof event.ref.id!=='string'||!event.ref.id||!event.type.startsWith(families[event.ref.store]+'.')||typeof event.actor!=='string'||typeof event.businessId!=='string')throw Error('Invalid business event');
 return event;
}
function make({store,record,previous,key,context={},at=new Date().toISOString(),knownCreate=false}){
 if(!families[store])return null;
 const family=families[store],state=String(record.status||'').toLowerCase(),oldState=String(previous?.status||'').toLowerCase();
 const suffix=knownCreate||previous===null?'created':previous===undefined?'committed':state!==oldState&&states[store]?.[state]||'updated';
 return validate({id:'domain:'+key+':'+store+':'+record.id,kind:'domain.event',version:1,type:family+'.'+suffix,
  ref:{store,id:record.id},businessId:context.businessId||'local-business',actor:context.actor||'local-owner',at,correlationId:key,
  evidence:'local_record_commit',status:'pending',attempts:0,nextAttemptAt:0,history:[{status:'pending',at}]});
}
function recordCommitted(tx,store,record,key,context={},previous,knownCreate=false){
 const event=make({store,record,key,context,previous,knownCreate});if(event)tx.objectStore('commandLog').put(event);return event;
}
function write(db,store,record,context={}){
 if(!families[store])return null;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction([store,'commandLog'],'readwrite'),target=tx.objectStore(store),req=target.get(record.id);let error;
  tx.oncomplete=()=>resolve(record.id);tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Record/event transaction failed'));
  req.onsuccess=()=>{try{
   target.put(record);
   if(!equal(req.result,record))recordCommitted(tx,store,record,'gui:'+crypto.randomUUID(),context,req.result??null);
  }catch(e){error=e;tx.abort()}};
 });
}
function transition(db,id,fn){return new Promise((resolve,reject)=>{
 const tx=db.transaction('commandLog','readwrite'),store=tx.objectStore('commandLog'),req=store.get(id);let result,error;
 tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Event journal failed'));
 req.onsuccess=()=>{try{const decision=fn(req.result);result=decision?.result;if(decision?.row)store.put(decision.row)}catch(e){error=e;tx.abort()}};
})}
// Observation metadata only. Business writes remain in the existing approved command engine.
// Stable, bounded LOCAL source binding. Not a cryptographic authentication token,
// not approval and never a replacement for the shared command's execution guard.
function laborCostBinding(records,jobId,businessId='local-business'){
 if(!Array.isArray(records)||typeof jobId!=='string'||!jobId||typeof businessId!=='string'||!businessId)return null;
 const relevant=records.filter(c=>c?.jobId===jobId&&c.category==='Labor'&&['estimate','actual'].includes(c.type)&&c.laborHours!=null);
 if(!relevant.length||relevant.length>40)return null;
 const seen=new Set(),entries=[];
 for(const c of relevant){
  if(typeof c.id!=='string'||!c.id||c.id.length>128||seen.has(c.id)||
   c.businessId&&c.businessId!==businessId||!Number.isFinite(c.laborHours)||c.laborHours<=0)return null;
  seen.add(c.id);
  const scalar=value=>value==null?null:
   typeof value==='number'&&Number.isFinite(value)?value:
   typeof value==='string'&&value.length<=128?value:undefined;
  const amount=scalar(c.amount),currency=scalar(c.currency),revision=scalar(c.revision),updatedAt=scalar(c.updatedAt);
  if([amount,currency,revision,updatedAt].some(x=>x===undefined))return null;
  entries.push([c.id,c.type,c.laborHours,amount,currency,revision,updatedAt,c.businessId||businessId]);
 }
 entries.sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));
 const proof=JSON.stringify(entries);
 if(proof.length>4096)return null;
 const estimated=relevant.filter(c=>c.type==='estimate').reduce((sum,c)=>sum+c.laborHours,0);
 const recorded=relevant.filter(c=>c.type==='actual').reduce((sum,c)=>sum+c.laborHours,0);
 if(!Number.isFinite(estimated)||!Number.isFinite(recorded))return null;
 return {proof,estimated,recorded,count:entries.length};
}
/* HYB-01: a source-linked derived case from an EXISTING committed event.
 * It lives solely inside that event's journal result, not in a new authority.
 * The local event actor label is not cloud-authenticated identity.
 */
function jobCaseBinding(job,businessId){
 if(!job||typeof job.id!=='string'||!job.id||job.businessId&&job.businessId!==businessId)return null;
 const scalar=x=>x==null?null:typeof x==='string'&&x.length<=120?x:typeof x==='number'&&Number.isFinite(x)?x:undefined;
 const values=[job.id,job.businessId||businessId,scalar(job.revision),scalar(job.updatedAt),scalar(job.status),scalar(job.crewId)];
 return values.some(v=>v===undefined)?null:JSON.stringify(values);
}
function currentLaborEvidence({jobId,jobs=[],jobCosts=[],businessId='local-business'}){
 if(!Array.isArray(jobs)||!Array.isArray(jobCosts))return null;
 const matches=jobs.filter(j=>j?.id===jobId);
 if(matches.length!==1)return null;
 const jobProof=jobCaseBinding(matches[0],businessId),costProof=laborCostBinding(jobCosts,jobId,businessId);
 return jobProof&&costProof?{jobProof,costProof}:null;
}
function makeReactiveLaborCase({event,jobs,jobCosts,findings,at,businessId='local-business'}){
 if(event?.kind!=='domain.event'||event.businessId!==businessId||event.actor!=='local-owner'||event.ref?.store!=='jobCosts'||!event.type?.startsWith('job_cost.'))return null;
 const candidate=Array.isArray(jobCosts)?jobCosts.filter(c=>c?.id===event.ref.id):[];
 if(candidate.length!==1||candidate[0].businessId&&candidate[0].businessId!==businessId||typeof candidate[0].jobId!=='string')return null;
 const jobId=candidate[0].jobId,evidence=currentLaborEvidence({jobId,jobs,jobCosts,businessId});
 if(!evidence)return null;
 const match=Array.isArray(findings)?findings.find(f=>f?.jobId===jobId&&f.sourceCostBinding===evidence.costProof.proof&&f.executionAuthority===false&&f.detectorId==='job.labor_hours_variance_review'):null;
 const overrun=evidence.costProof.recorded>evidence.costProof.estimated;
 const status=overrun?(match?'owner_review_available':'evaluation_unverified'):'no_recorded_overrun';
 return {kind:'tradeflow.intelligence.reactive-labor-case.v1',schemaVersion:1,eventId:event.id,correlationId:event.correlationId,
  businessId,actor:'local-owner',sourceMode:'device_local_unverified',sourceRef:{store:'jobCosts',id:event.ref.id},
  jobId,jobProof:evidence.jobProof,sourceCostBinding:evidence.costProof.proof,
  evaluatedAt:at,status,findingId:match?.id||null,
  estimatedLaborHours:evidence.costProof.estimated,recordedLaborHours:evidence.costProof.recorded,
  proposedCommandId:match?'job.labor_review.schedule':null,approvalRequired:true,
  timesheetVerified:false,payrollVerified:false,outcomeVerified:false,executionAuthority:false};
}
function inspectReactiveLaborCase({event,records,businessId='local-business',actor='local-owner'}={}){
 if(!event||event.kind!=='domain.event'||event.status!=='processed'||event.businessId!==businessId||event.actor!==actor||actor!=='local-owner')return {status:'access_or_event_unverified'};
 const saved=event.result?.reactiveLaborCase;
 if(!saved||saved.kind!=='tradeflow.intelligence.reactive-labor-case.v1'||saved.executionAuthority!==false||saved.businessId!==businessId||saved.eventId!==event.id||saved.actor!==actor)return {status:'case_unavailable'};
 if(saved.status==='owner_review_available'){
  const matched=(event.result?.laborFindings||[]).filter(f=>f?.id===saved.findingId&&f.jobId===saved.jobId&&f.sourceCostBinding===saved.sourceCostBinding&&f.executionAuthority===false);
  if(matched.length!==1||saved.proposedCommandId!=='job.labor_review.schedule'||saved.approvalRequired!==true)return {status:'case_unavailable'};
 }else if(saved.status!=='no_recorded_overrun'&&saved.status!=='evaluation_unverified'||saved.status==='no_recorded_overrun'&&(saved.findingId!==null||saved.proposedCommandId!==null)){
  return {status:'case_unavailable'};
 }
 if(!records||!Array.isArray(records.jobs)||!Array.isArray(records.jobCosts))return {status:'source_unavailable'};
 const found=records.jobCosts.filter(x=>x?.id===event.ref?.id);
 if(found.length!==1||found[0].businessId&&found[0].businessId!==businessId||found[0].jobId!==saved.jobId)return {status:'source_unavailable'};
 const current=currentLaborEvidence({jobId:saved.jobId,jobs:records.jobs,jobCosts:records.jobCosts,businessId});
 if(!current)return {status:'source_unavailable'};
 if(current.jobProof!==saved.jobProof||current.costProof.proof!==saved.sourceCostBinding||saved.estimatedLaborHours!==current.costProof.estimated||saved.recordedLaborHours!==current.costProof.recorded)return {status:'stale_source'};
 if(saved.status==='owner_review_available'&&!(current.costProof.recorded>current.costProof.estimated))return {status:'stale_source'};
 if(saved.status==='no_recorded_overrun'&&current.costProof.recorded>current.costProof.estimated)return {status:'stale_source'};
 return {status:'current',findingId:saved.findingId,reviewStatus:saved.status,executionAuthority:false};
}
function readLaborSnapshot(db){
 return new Promise((resolve,reject)=>{
  let tx;try{tx=db.transaction(['jobs','jobCosts'],'readonly')}catch(e){reject(e);return}
  const requests={};for(const store of ['jobs','jobCosts'])requests[store]=tx.objectStore(store).getAll();
  tx.oncomplete=()=>resolve({jobs:requests.jobs.result||[],jobCosts:requests.jobCosts.result||[]});
  tx.onerror=tx.onabort=()=>reject(tx.error||Error('Labor case source snapshot unavailable'));
 });
}
function readLaborCosts(db){
 return new Promise((resolve,reject)=>{
  let tx,request;
  try{tx=db.transaction('jobCosts','readonly');request=tx.objectStore('jobCosts').getAll()}catch(error){reject(error);return}
  tx.oncomplete=()=>resolve(request.result||[]);
  tx.onerror=tx.onabort=()=>reject(tx.error||Error('Read-only job-cost snapshot unavailable'));
 });
}
function laborFindingSummaries(findings,costRecords=null,businessId='local-business'){
 const eligible=[];
 for(const finding of findings){
  if(finding?.detectorId!=='job.labor_hours_variance_review'||finding.status!=='ready_for_review')continue;
  const refs=finding.recordRefs;
  const jobs=Array.isArray(refs)?refs.filter(ref=>ref?.store==='jobs'&&typeof ref.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(ref.id)):[];
  const planned=finding.evidence?.estimatedLaborHours,recorded=finding.evidence?.recordedLaborHours;
  if(jobs.length!==1||!Number.isFinite(planned)||!Number.isFinite(recorded)||planned<=0||recorded<=planned)continue;
  if(typeof finding.id!=='string'||finding.id.length>160)continue;
  const binding=Array.isArray(costRecords)?laborCostBinding(costRecords,jobs[0].id,businessId):null;
  if(Array.isArray(costRecords)&&(!binding||Math.abs(binding.estimated-planned)>0.000001||Math.abs(binding.recorded-recorded)>0.000001))continue;
  eligible.push({
   id:finding.id,jobId:jobs[0].id,detectorId:'job.labor_hours_variance_review',
   sourceCostBinding:binding?.proof||null,sourceCostCount:binding?.count||0,
   estimatedLaborHours:planned,recordedLaborHours:recorded,varianceHours:recorded-planned,
   evidenceKind:'manually_recorded_hours',timesheetVerified:false,payrollVerified:false,
   recommendation:'Review recorded hours and scope before preparing an internal labor review task.',
   proposedCommandId:'job.labor_review.schedule',executionAuthority:false
  });
 }
 eligible.sort((a,b)=>a.jobId.localeCompare(b.jobId)||a.id.localeCompare(b.id));
 return {items:eligible.slice(0,20),truncated:eligible.length>20};
}
async function drain({db,events,commands,businessId='local-business',rule={id:'operational-review',enabled:true,effect:'read'},now=Date.now,limit=10}){
 if(rule.enabled!==true)return {status:'suspended',processed:0};
 if(rule.effect!=='read'||rule.id!=='operational-review'||!commands||!Array.isArray(events)||!Number.isInteger(limit)||limit<1||limit>20)throw Error('Only the registered read-only review rule can execute automatically');
 let processed=0;
 for(const candidate of events.filter(e=>e.kind==='domain.event'&&e.businessId===businessId&&['pending','processing'].includes(e.status)).slice(0,1000)){
  if(processed>=limit)break;
  const lease=crypto.randomUUID();
  const row=await transition(db,candidate.id,current=>{
   if(!current||current.businessId!==businessId||!['pending','processing'].includes(current.status)||current.nextAttemptAt>now()||current.status==='processing'&&current.leaseUntil>now())return {};
   try{validate(current)}catch{return {row:{...current,status:'failed',error:'Invalid event envelope'}}}
   const next={...current,status:'processing',lease,leaseUntil:now()+30000,attempts:current.attempts+1};return {row:next,result:clone(next)};
  });
  if(!row)continue;processed++;
  let outcome;
  try{
   const plan=await commands.prepare({commandId:'intelligence.review',params:{}},{requestKey:'review:'+row.id+':'+row.attempts});
   if(plan.status!=='ready')throw Error(plan.error?.message||'Review not authorized');
   const result=await commands.execute(plan.id);
   if(result.status!=='succeeded'||!Array.isArray(result.result?.findings))throw Error(result.error?.message||'Review result unavailable');
   const current=await readLaborSnapshot(db);
   const labor=laborFindingSummaries(result.result.findings,current.jobCosts,businessId);
   const reactiveLaborCase=makeReactiveLaborCase({event:row,jobs:current.jobs,jobCosts:current.jobCosts,findings:labor.items,at:result.result.evaluatedAt,businessId});
   outcome={status:'processed',result:{findingIds:result.result.findings.map(f=>f.id),evaluatedAt:result.result.evaluatedAt,ruleId:rule.id,laborFindings:labor.items,laborFindingsTruncated:labor.truncated,...(reactiveLaborCase?{reactiveLaborCase}:{})}};
  }catch(error){outcome={status:row.attempts>=5?'failed':'pending',error:String(error.message).slice(0,200),nextAttemptAt:now()+Math.min(60000,1000*2**row.attempts)}}
  await transition(db,row.id,current=>{
   if(!current||current.lease!==lease)return {};
   const next={...current,...outcome,lease:null,leaseUntil:0,history:[...(current.history||[]).slice(-29),{status:outcome.status,at:new Date(now()).toISOString()}]};return {row:next,result:next};
  });
 }
 return {status:'evaluated',processed};
}
return Object.freeze({validate,make,recordCommitted,write,drain,eventTypes:Object.freeze([...allowed]),laborFindingSummaries,laborCostBinding,makeReactiveLaborCase,inspectReactiveLaborCase});
});
