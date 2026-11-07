/* TF-RM-03 / TF-MI approval endpoint adapter. An explicitly confirmed
 * office response uses the EXISTING job-scoped domain executor and its real
 * D1 compare-and-swap/readback receipt. Not a generic chat task executor.
 *
 * HTTP authentication is performed by tenantApi/verifyBearerToken upstream.
 * Origin+custom-header protects signed-in cookie sessions against casual CSRF;
 * these are not role grants or independent proof of human cognition.
 */
import {respondToCrewBlocker} from './role-exchange-actions.js';
import {AuthorizationError,requireBusinessId,requireVerifiedPrincipal} from './tenant-security.js';

const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const json=(data,status=200)=>Response.json(data,{status,headers:{
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Authorization'
}});
export async function approvedOfficeBlockerResponse({
 request,db,principal,businessId,jobId,reportEventId,
 execute=respondToCrewBlocker
}={}){
 if(!request||request.method!=='POST')
  throw new AuthorizationError('Explicit response POST required',405);
 if(!db?.prepare||typeof execute!=='function')
  throw new AuthorizationError('Authorized write execution unavailable',503);
 requireVerifiedPrincipal(principal);
 requireBusinessId(businessId);
 if(!id(jobId)||!id(reportEventId))
  throw new AuthorizationError('Job and blocker event required',400);
 const origin=new URL(request.url).origin;
 if(request.headers.get('Origin')!==origin||
    request.headers.get('X-TradeFlow-Approval')!=='confirmed')
  throw new AuthorizationError('Same-origin explicit approval required',403);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))
  throw new AuthorizationError('JSON approval body required',415);
 const size=Number(request.headers.get('Content-Length')||0);
 if(size>1800)throw new AuthorizationError('Approval request too large',413);
 let raw='';
 if(!request.body)throw new AuthorizationError('Approval body required',400);
 const reader=request.body.getReader();
 try{
  const decoder=new TextDecoder();
  while(true){
   const {done,value}=await reader.read();if(done)break;
   raw+=decoder.decode(value,{stream:true});
   if(raw.length>1800)throw new AuthorizationError('Approval request too large',413);
  }
  raw+=decoder.decode();
 }finally{reader.releaseLock()}
 let body;
 try{body=JSON.parse(raw)}catch{throw new AuthorizationError('Invalid approval JSON',400)}
 if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['approved','eventId','idempotencyKey',
      'expectedJobRevision','text'].includes(k))||
    body.approved!==true||!id(body.eventId)||!id(body.idempotencyKey)||
    !Number.isSafeInteger(body.expectedJobRevision)||body.expectedJobRevision<1||
    typeof body.text!=='string'||!body.text.trim()||body.text.length>500)
  throw new AuthorizationError('Current job revision and explicit reviewed response required',400);
 const result=await execute({
  db,principal,businessId,jobId,reportEventId,
  eventId:body.eventId,idempotencyKey:body.idempotencyKey,
  expectedJobRevision:body.expectedJobRevision,text:body.text.trim()
 });
 if(result?.kind!=='tradeflow.role_exchange.result.v1'||
    result.businessId!==businessId||result.jobId!==jobId||
    result.eventId!==body.eventId||
    !['readback_verified','server_committed_unverified','duplicate_unverified',
      'response_exists_unverified'].includes(result.status))
  throw new AuthorizationError('Write result could not be verified',503);
 const status=result.status==='readback_verified'?200:
  result.status==='server_committed_unverified'?202:409;
 return json({...result,
  approvalStatus:'explicit_user_request_received',
  requiresRecheck:result.status!=='readback_verified'},status);
}
