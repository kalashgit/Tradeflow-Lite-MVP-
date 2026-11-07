/* TF-RM-03 / TF-MI — reviewed office response transport. This port
 * may only be invoked from a user-approved host control. The server repeats
 * authenticated role, active grant, current job revision and event checks.
 * Network uncertainty MUST NOT be retried with a fresh operation key.
 */
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
export function createApprovedOfficeResponseSender({fetcher=(...args)=>fetch(...args)}={}){
 if(typeof fetcher!=='function')throw Error('Approved action transport required');
 return async function sendApprovedOfficeResponse({
  businessId,jobId,reportEventId,eventId,idempotencyKey,
  expectedJobRevision,text,approvedByUser=false
 }={}){
  if(approvedByUser!==true||![businessId,jobId,reportEventId,eventId,
    idempotencyKey].every(id)||!Number.isSafeInteger(expectedJobRevision)||
    expectedJobRevision<1||typeof text!=='string'||!text.trim()||text.length>500)
   throw Error('Explicit review and current scoped action required');
  const path='/api/v1/businesses/'+businessId+'/intelligence/jobs/'+jobId+
   '/blockers/'+reportEventId+'/respond';
  let response;
  try{
   response=await fetcher(path,{
    method:'POST',credentials:'same-origin',redirect:'manual',cache:'no-store',
    headers:{'Content-Type':'application/json',Accept:'application/json',
     'X-TradeFlow-Approval':'confirmed'},
    body:JSON.stringify({approved:true,eventId,idempotencyKey,
     expectedJobRevision,text:text.trim()}),
    signal:AbortSignal.timeout(10000)
   });
  }catch{
   return Object.freeze({status:'outcome_unknown_recheck_server',
    eventId,jobId,serverCommitted:false,readbackVerified:false,
    automaticRetryAllowed:false,requiresRecheck:true,receipt:null});
  }
  if(response?.type==='opaqueredirect'||!response||
     ![200,202,409].includes(response.status)||
     !/^application\/json\b/i.test(response.headers?.get?.('Content-Type')||'')){
   throw Error('Authenticated office response rejected; verify job state');
  }
  let result;
  try{result=await response.json()}catch{throw Error('Office response lacked valid server result')}
  if(result?.kind!=='tradeflow.role_exchange.result.v1'||
     result.businessId!==businessId||result.jobId!==jobId||
     result.eventId!==eventId||
     result.approvalStatus!=='explicit_user_request_received')
   throw Error('Office response receipt scope mismatch');
  const verified=response.status===200&&result.status==='readback_verified'&&
   result.readbackVerified===true&&
   result.recordWriteReceipt?.kind==='tenant_job_write_readback.v1'&&
   result.recordWriteReceipt.businessId===businessId&&
   result.recordWriteReceipt.jobId===jobId&&
   result.recordWriteReceipt.eventId===eventId;
  return Object.freeze({
   status:verified?'server_readback_verified':'outcome_requires_recheck',
   eventId,jobId,serverCommitted:verified,
   readbackVerified:verified,requiresRecheck:!verified,
   automaticRetryAllowed:false,
   receipt:verified?Object.freeze(result.recordWriteReceipt):null,
   actualCrewNotified:false,externalEffectsVerified:false
  });
 };
}
