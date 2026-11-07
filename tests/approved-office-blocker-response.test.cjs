'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let approvedOfficeBlockerResponse;
before(async()=>({approvedOfficeBlockerResponse}=await import(
 '../src/approved-office-blocker-response.js'
)));
const businessId='business_123',jobId='job_01',reportEventId='blocker_01';
const principal={verified:true,issuer:'https://login.example',subject:'office_01'};
const payload=()=>({approved:true,eventId:'response_01',
 idempotencyKey:'respond_once_01',expectedJobRevision:4,
 text:'Please confirm the supplier arrival date'});
const request=(body=payload(),opts={})=>new Request(
 'https://tradeflow.example.test/api/v1/businesses/business_123/intelligence/jobs/job_01/blockers/blocker_01/respond',
 {method:opts.method||'POST',headers:{
  Origin:opts.origin===undefined?'https://tradeflow.example.test':opts.origin,
  'Content-Type':opts.type||'application/json',
  'X-TradeFlow-Approval':opts.header||'confirmed'
 },body:JSON.stringify(body)}
);
const setup=(response='readback_verified')=>{
 const calls=[];
 const execute=async args=>{
  calls.push(args);
  return {kind:'tradeflow.role_exchange.result.v1',
   businessId,jobId,eventId:'response_01',status:response,
   sourceRevision:4,observedRevision:5,
   readbackVerified:response==='readback_verified',
   recordWriteReceipt:response==='readback_verified'?{
    kind:'tenant_job_write_readback.v1',revision:5
   }:null,executionAuthority:false};
 };
 const run=(req=request(),more={})=>approvedOfficeBlockerResponse({
  request:req,db:{prepare(){}},principal,businessId,jobId,reportEventId,
  execute,...more
 });
 return {calls,run};
};
test('explicit approved office command delegates to existing domain executor and keeps genuine readback receipt',async()=>{
 const f=setup();
 const res=await f.run();assert.equal(res.status,200);
 const data=await res.json();
 assert.equal(data.status,'readback_verified');
 assert.equal(data.approvalStatus,'explicit_user_request_received');
 assert.equal(data.requiresRecheck,false);
 assert.equal(data.recordWriteReceipt.kind,'tenant_job_write_readback.v1');
 assert.equal(data.executionAuthority,false);
 assert.deepEqual(f.calls[0],{
  db:{prepare:f.calls[0].db.prepare},principal,businessId,jobId,
  reportEventId,eventId:'response_01',idempotencyKey:'respond_once_01',
  expectedJobRevision:4,text:payload().text
 });
 assert.equal(res.headers.get('Cache-Control'),'no-store');
});
test('unverified response and idempotency uncertainty cannot masquerade as a receipt',async()=>{
 for(const [outcome,status] of [
  ['server_committed_unverified',202],
  ['duplicate_unverified',409],
  ['response_exists_unverified',409]
 ]){
  const f=setup(outcome),res=await f.run(),body=await res.json();
  assert.equal(res.status,status);
  assert.equal(body.requiresRecheck,true);
  assert.equal(body.recordWriteReceipt,null);
 }
});
test('missing human approval, CSRF headers and malformed bodies never reach the executor',async()=>{
 const failures=[
  [request({...payload(),approved:false}),400],
  [request(payload(),{origin:'https://attacker.example'}),403],
  [request(payload(),{header:'ignored'}),403],
  [request(payload(),{type:'text/plain'}),415],
  [request({...payload(),expectedJobRevision:0}),400],
  [request({...payload(),eventId:'../../other'}),400],
  [request({...payload(),idempotencyKey:''}),400],
  [request({...payload(),text:'  '}),400],
  [request({...payload(),role:'owner'}),400],
  [request({...payload(),text:'x'.repeat(501)}),400]
 ];
 for(const [req,status] of failures){
  const f=setup();
  await assert.rejects(f.run(req),{status});
  assert.equal(f.calls.length,0);
 }
});
test('foreign identity, missing database and wrong job IDs fail before command execution',async()=>{
 const f=setup();
 await assert.rejects(f.run(request(),{principal:{...principal,verified:false}}),{status:401});
 await assert.rejects(f.run(request(),{jobId:'../foreign'}),{status:400});
 await assert.rejects(f.run(request(),{db:null}),{status:503});
 assert.equal(f.calls.length,0);
});
test('unknown executor receipts fail closed',async()=>{
 const f=setup();
 await assert.rejects(f.run(request(),{execute:async()=>({
  kind:'tradeflow.role_exchange.result.v1',businessId:'business_999',
  jobId,eventId:'response_01',status:'readback_verified'
 })}),{status:503});
});
