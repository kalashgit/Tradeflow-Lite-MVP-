'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let createApprovedOfficeResponseSender;
before(async()=>({createApprovedOfficeResponseSender}=await import(
 '../public/approved-office-response-sender.js'
)));
const params={businessId:'business_123',jobId:'job_01',
 reportEventId:'blocker_01',eventId:'response_01',
 idempotencyKey:'op_01',expectedJobRevision:4,
 text:'Confirm delivery date',approvedByUser:true};
function verified(){
 return {kind:'tradeflow.role_exchange.result.v1',businessId:params.businessId,
 jobId:params.jobId,eventId:params.eventId,status:'readback_verified',
 approvalStatus:'explicit_user_request_received',readbackVerified:true,
 recordWriteReceipt:{kind:'tenant_job_write_readback.v1',
  businessId:params.businessId,jobId:params.jobId,eventId:params.eventId,
  revision:5}};
}
test('reviewed user action submits same-origin bounded approval and accepts only genuine server receipt',async()=>{
 let count=0;
 const send=createApprovedOfficeResponseSender({fetcher:async(url,options)=>{
  count++;
  assert.match(url,/^\/api\/v1\/businesses\/business_123\/intelligence\/jobs\/job_01\/blockers\/blocker_01\/respond$/);
  assert.equal(options.method,'POST');
  assert.equal(options.credentials,'same-origin');
  assert.equal(options.redirect,'manual');
  assert.equal(options.headers['X-TradeFlow-Approval'],'confirmed');
  assert.equal(options.cache,'no-store');
  assert.deepEqual(JSON.parse(options.body),{
   approved:true,eventId:params.eventId,idempotencyKey:params.idempotencyKey,
   expectedJobRevision:params.expectedJobRevision,text:params.text
  });
  return new Response(JSON.stringify(verified()),{status:200,
   headers:{'Content-Type':'application/json'}});
 }});
 const r=await send(params);
 assert.equal(count,1);assert.equal(r.status,'server_readback_verified');
 assert.equal(r.readbackVerified,true);
 assert.equal(r.receipt.revision,5);
 assert.equal(r.actualCrewNotified,false);
 assert.equal(r.automaticRetryAllowed,false);
});
test('network unknown, server unverified write and duplicate conflict cannot fabricate receipt',async()=>{
 const down=createApprovedOfficeResponseSender({fetcher:async()=>{throw Error('offline')}});
 const unknown=await down(params);
 assert.equal(unknown.status,'outcome_unknown_recheck_server');
 assert.equal(unknown.receipt,null);
 assert.equal(unknown.automaticRetryAllowed,false);
 for(const [status,result] of [
  [202,{...verified(),status:'server_committed_unverified',readbackVerified:false,recordWriteReceipt:null}],
  [409,{...verified(),status:'duplicate_unverified',readbackVerified:false,recordWriteReceipt:null}],
  [200,{...verified(),recordWriteReceipt:null}]
 ]){
  const send=createApprovedOfficeResponseSender({fetcher:async()=>new Response(
   JSON.stringify(result),{status,headers:{'Content-Type':'application/json'}})});
  const projected=await send(params);
  assert.equal(projected.readbackVerified,false);
  assert.equal(projected.receipt,null);
  assert.equal(projected.requiresRecheck,true);
 }
});
test('missing user approval and invalid identity never make a network call',async()=>{
 let count=0;
 const send=createApprovedOfficeResponseSender({fetcher:async()=>{count++;throw Error('should not run')}});
 for(const bad of [
  {...params,approvedByUser:false},
  {...params,jobId:'../../other'},
  {...params,idempotencyKey:''},
  {...params,expectedJobRevision:0},
  {...params,text:'  '},
  {...params,text:'x'.repeat(501)}
 ])await assert.rejects(send(bad));
 assert.equal(count,0);
});
test('cross-job or event receipt mismatch never claims verified',async()=>{
 for(const bad of [
  {...verified(),jobId:'job_02'},
  {...verified(),eventId:'other'},
  {...verified(),recordWriteReceipt:{...verified().recordWriteReceipt,
   businessId:'business_999'}}
 ]){
  const send=createApprovedOfficeResponseSender({fetcher:async()=>new Response(
   JSON.stringify(bad),{status:200,headers:{'Content-Type':'application/json'}})});
  if(bad.jobId!=='job_01'||bad.eventId!=='response_01')
   await assert.rejects(send(params));
  else assert.equal((await send(params)).readbackVerified,false);
 }
});
