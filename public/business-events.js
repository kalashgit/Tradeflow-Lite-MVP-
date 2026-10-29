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
   outcome={status:'processed',result:{findingIds:result.result.findings.map(f=>f.id),evaluatedAt:result.result.evaluatedAt,ruleId:rule.id}};
  }catch(error){outcome={status:row.attempts>=5?'failed':'pending',error:String(error.message).slice(0,200),nextAttemptAt:now()+Math.min(60000,1000*2**row.attempts)}}
  await transition(db,row.id,current=>{
   if(!current||current.lease!==lease)return {};
   const next={...current,...outcome,lease:null,leaseUntil:0,history:[...(current.history||[]).slice(-29),{status:outcome.status,at:new Date(now()).toISOString()}]};return {row:next,result:next};
  });
 }
 return {status:'evaluated',processed};
}
return Object.freeze({validate,make,recordCommitted,write,drain,eventTypes:Object.freeze([...allowed])});
});
