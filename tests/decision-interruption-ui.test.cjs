'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let createDecisionController;
test.before(async()=>({createDecisionController}=await import('../public/decision-ui.js')));
function harness({onPrepare,afterConfirm}={}){
 let clickHandler,approved=0,executed=0,rejected=[],prepared=0,continuations=0;
 const region={dataset:{decisionJob:'job_01'},innerHTML:'',contains:()=>true};
 const document={querySelectorAll:()=>[region],addEventListener:(type,listener)=>{if(type==='click')clickHandler=listener}};
 const decision={kind:'tradeflow.decision.v1',status:'ready_for_review',observations:[],inferences:[],unknowns:[],
  proposals:[{id:'proposal_01',label:'Prepare internal review',params:{due:'2026-11-03'}}]};
 let notify;const outcome=new Promise(ok=>notify=ok);
 const runtime={
  reject:async id=>{rejected.push(id);return {status:'rejected'}},
  approve:async()=>{approved++;return {status:'approved'}},
  execute:async()=>{executed++;return {status:'succeeded'}},
  reconcile:async()=>({status:'unverified'}),prepare:async()=>({status:'ready'})
 };
 const protocol={
  review:async()=>decision,
  prepare:async()=>{prepared++;return onPrepare?onPrepare():{status:'needs_review',id:'plan_01'}},
  continuation:async()=>{continuations++;return afterConfirm?afterConfirm():{status:'ready_for_runtime_checks'}},
  receipt:async()=>({status:'recorded_task_verified',recordRef:null})
 };
 const controller=createDecisionController({document,protocol,runtime,
  readScope:async()=>({today:'2026-11-03'}),readCurrent:async()=>({}),
  confirm:async()=>true,onOutcome:async event=>notify(event),uid:()=> 'attempt_01'});
 const click=(action,proposalId='proposal_01')=>{
  const button={dataset:{jobId:'job_01',decisionAction:action,proposalId},closest:()=>button};
  clickHandler({target:button,preventDefault(){}});
 };
 return {controller,region,click,outcome,get:()=>({approved,executed,rejected,prepared,continuations})};
}
test('HYB-04 pending review can be interrupted before its prepared command exists',async()=>{
 let finishPrepare;const pending=new Promise(resolve=>{finishPrepare=resolve});
 const f=harness({onPrepare:()=>pending});
 await f.controller.open('job_01');
 f.click('review');
 assert.match(f.region.innerHTML,/Cancel pending review/);
 f.click('cancel');
 assert.match(f.region.innerHTML,/Review cancellation requested/);
 finishPrepare({status:'needs_review',id:'plan_cancelled'});
 const result=await f.outcome;
 assert.equal(result.status,'cancelled');
 assert.deepEqual(f.get().rejected,['plan_cancelled']);
 assert.equal(f.get().approved,0);
 assert.equal(f.get().executed,0);
});
test('HYB-04 cancellation during post-confirmation source check prevents approval and execution',async()=>{
 let finishContinuation,entered;const started=new Promise(ok=>entered=ok);
 const pending=new Promise(ok=>{finishContinuation=ok});
 const f=harness({afterConfirm:()=>{entered();return pending}});
 await f.controller.open('job_01');
 f.click('review');await started;
 f.click('cancel');
 finishContinuation({status:'ready_for_runtime_checks'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(f.get().rejected,['plan_01']);
 assert.equal(f.get().approved,0);
 assert.equal(f.get().executed,0);
 assert.equal(f.get().continuations,1);
});
test('HYB-04 stale source after owner confirmation rejects existing plan without effect',async()=>{
 const f=harness({afterConfirm:()=>({status:'stale_case'})});
 await f.controller.open('job_01');f.click('review');
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(f.get().rejected,['plan_01']);
 assert.equal(f.get().approved,0);assert.equal(f.get().executed,0);
 assert.match(f.region.innerHTML,/stale_case/);
});
