'use strict';
// Research-only AION -> EXISTING TradeFlow command contract, never a production host.
const commands=require('../../../public/command-registry.js');
const copy=x=>structuredClone(x);
const mapping=Object.freeze({
 overdue_receivable:{commandId:'invoice.followup.schedule',store:'invoices'},
 job_overrun:{commandId:'job.cost_review.schedule',store:'jobs'},
 stale_quote:{commandId:'quotation.followup.schedule',store:'quotes'},
 change_order:{commandId:'job.change_order.review.schedule',store:'jobs',extra:'changeOrders'},
 crew_conflict:{commandId:'view.filter',workspace:'calendar',filter:'conflicts'},
 bid_readiness:{commandId:'opportunity.bid_review.schedule',store:'opportunities'},
 cash_pressure:{commandId:'workspace.open',workspace:'expenses'},
 supplier_eta:{commandId:'intelligence.review'},
 safety_prestart:{commandId:'intelligence.review'},
 customer_retention:{commandId:'intelligence.review'},
 growth_capacity:{commandId:'intelligence.review'},
});
for(const [name,spec] of Object.entries(mapping)){
 if(!commands.definitions.some(c=>c.id===spec.commandId))throw Error('Unsupported mapped TradeFlow command '+name);
}
function synthetic(snapshot){
 if(!snapshot||!Number.isInteger(snapshot.day)||snapshot.day<0||snapshot.day>6||
    !/^TF-SIM-(05|12|20)$/.test(snapshot.worldId||'')||
    snapshot.business?.id!==snapshot.worldId||!snapshot.business?.name?.includes('SYNTHETIC')||
    snapshot.externalExecutionPermitted!==false||
    !String(snapshot.recordProvenance).includes('synthetic fixture')||
    !Array.isArray(snapshot.signals))throw Error('Only trusted synthetic snapshots are allowed');
 return snapshot;
}
function signalFor(snapshot,id){
 if(typeof id!=='string'||!Object.hasOwn(mapping,id))throw Error('Unregistered model action');
 const found=snapshot.signals.filter(s=>s.id===id);
 if(found.length!==1||found[0].executionAuthority!==false||
    found[0].inputAuthority!=='synthetic_fixture_or_scenario_only'||
    !Array.isArray(found[0].evidenceRefs)||!found[0].evidenceRefs.length||
    found[0].evidenceRefs.some(ref=>typeof ref!=='string'||ref.length>180))
    throw Error('Missing or untrusted signal evidence');
 return found[0];
}
function refFor(signal,store){
 const parts=signal.evidenceRefs.filter(x=>x.startsWith(store+':'));
 if(parts.length!==1)throw Error('Ambiguous '+store+' reference');
 const id=parts[0].slice(store.length+1);
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw Error('Invalid record identifier');
 return {store,id};
}
function commandFor(snapshot,signal){
 const spec=mapping[signal.id],params={};
 if(spec.store)params.ref=refFor(signal,spec.store);
 if(spec.extra)params.changeOrderId=refFor(signal,spec.extra).id;
 if(spec.workspace)params.workspace=spec.workspace;
 if(spec.filter)params.filter=spec.filter;
 const contract=commands.definitions.find(c=>c.id===spec.commandId);
 if(contract.effect==='modification'){
   params.due=new Date(Date.UTC(2026,10,12+snapshot.day)).toISOString().slice(0,10);
 }
 return {commandId:spec.commandId,params,effect:contract.effect};
}
function evidenceFingerprint(signal){return JSON.stringify(signal.evidenceRefs.slice().sort())}
function createAionCapabilityBridge({runtime,getTrustedSnapshot,verifyOwnerGesture}={}){
 if(!runtime||['prepare','execute','approve','reject'].some(k=>typeof runtime[k]!=='function')||
    typeof getTrustedSnapshot!=='function')throw Error('Host runtime and trusted read required');
 const pending=new Map(),seen=new Set(),audit=[];
 const current=async()=>synthetic(await getTrustedSnapshot());
 async function review(){
   const snap=await current();
   const prepared=await runtime.prepare({commandId:'intelligence.review',params:{}});
   if(prepared.status!=='ready')return {status:'unavailable',reason:prepared.error?.code||prepared.status};
   const out=await runtime.execute(prepared.id);
   audit.push({kind:'read_only_review',world:snap.worldId,status:out.status});
   return {status:out.status,commandId:'intelligence.review',readOnly:true,result:out.result??null};
 }
 async function propose(signalId){
   const snap=await current(),signal=signalFor(snap,signalId),request=commandFor(snap,signal);
   const key=[snap.worldId,snap.day,signalId].join('_');
   if(seen.has(key))return {status:'already_proposed',signalId};
   const plan=await runtime.prepare({commandId:request.commandId,params:request.params},
                                    {requestKey:'aion_'+key});
   if(!['ready','needs_review'].includes(plan.status))
     return {status:'unavailable',signalId,reason:plan.error?.code||plan.status};
   if(plan.commandId!==request.commandId||plan.effect!==request.effect)
     return {status:'contract_mismatch',signalId};
   seen.add(key);
   audit.push({kind:'prepared',signalId,world:snap.worldId,day:snap.day,
               commandId:request.commandId,evidenceRefs:copy(signal.evidenceRefs),
               status:plan.status,id:plan.id});
   if(request.effect==='modification'){
     if(plan.status!=='needs_review')return {status:'contract_mismatch',signalId};
     pending.set(plan.id,{world:snap.worldId,day:snap.day,signalId,
                          evidence:evidenceFingerprint(signal),commandId:request.commandId});
     return {status:'owner_review_required',signalId,commandRequestId:plan.id,
             commandId:request.commandId,evidenceRefs:copy(signal.evidenceRefs),
             executionAuthority:false,ownerApprovalRequired:true};
   }
   const out=await runtime.execute(plan.id);
   audit.push({kind:'read_only_action',signalId,commandId:request.commandId,status:out.status});
   return {status:out.status,signalId,commandId:request.commandId,
           result:out.result??null,executionAuthority:false};
 }
 async function ownerApprove(id){
   const item=pending.get(id);
   if(!item)return {status:'denied',reason:'NOT_PENDING'};
   const snap=await current();
   let signal;
   try{signal=signalFor(snap,item.signalId)}catch{
     pending.delete(id);
     await runtime.reject(id);
     audit.push({kind:'stale_rejected',id,signalId:item.signalId,reason:'SIGNAL_REVOKED'});
     return {status:'stale',reason:'SIGNAL_REVOKED'};
   }
   if(item.world!==snap.worldId||item.day!==snap.day||item.evidence!==evidenceFingerprint(signal)){
     pending.delete(id);
     await runtime.reject(id);
     audit.push({kind:'stale_rejected',id,signalId:item.signalId,reason:'EVIDENCE_CHANGED'});
     return {status:'stale',reason:'EVIDENCE_CHANGED'};
   }
   // The model cannot supply or forge a gesture; the host callback is separate.
   if(typeof verifyOwnerGesture!=='function')return {status:'denied',reason:'OWNER_UI_REQUIRED'};
   const receipt=await verifyOwnerGesture({requestId:id,commandId:item.commandId,
                                          businessId:item.world,evidenceRefs:copy(signal.evidenceRefs)});
   if(receipt?.approved!==true||receipt?.requestId!==id||receipt?.businessId!==item.world||
      receipt?.source!=='trusted_owner_ui'){
     pending.delete(id);
     await runtime.reject(id);
     audit.push({kind:'declined',id,signalId:item.signalId});
     return {status:'owner_declined',executionAuthority:false};
   }
   // Existing TradeFlow runtime revalidates approval, role, record versions,
   // request keys and operation receipts. No direct model-to-writer path.
   const approved=await runtime.approve(id);
   pending.delete(id);
   if(approved.status!=='approved')return {status:'unavailable',reason:approved.error?.code||approved.status};
   const out=await runtime.execute(id);
   audit.push({kind:'approved_command',id,signalId:item.signalId,
               commandId:item.commandId,status:out.status});
   return {status:out.status,commandId:item.commandId,signalId:item.signalId,
           result:out.result??null,ownerApprovalVerified:true,executionAuthority:false};
 }
 return Object.freeze({review,propose,ownerApprove,
   history:()=>copy(audit),pending:()=>[...pending.keys()],
   capabilities:()=>Object.entries(mapping).map(([signalId,c])=>{
     const d=commands.definitions.find(x=>x.id===c.commandId);
     return {signalId,commandId:c.commandId,effect:d.effect,approval:d.approval};
   })
 });
}
module.exports={createAionCapabilityBridge};
