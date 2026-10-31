import {recordIdentity} from './record-model.js';
// Optional ports.review adapter for the EXISTING command registry. No model,
// database writer, automatic navigation, or additional execution engine.
export function createCloudReviewPort({businessId,jobId,session,fetcher=fetch,onContext=()=>{}}){
 if(!/^[A-Za-z0-9_-]{8,80}$/.test(businessId)||jobId!==undefined&&!/^[A-Za-z0-9_-]{1,100}$/.test(jobId)||typeof session!=='function')throw Error('Explicit business, session and optional job required');
 const actor=s=>s?.identity?.issuer&&s.identity.subject?JSON.stringify([s.identity.issuer,s.identity.subject]):null;
 const role=s=>s?.status==='signed_in'?s.businesses?.find(b=>b.business_id===businessId&&['owner','admin','member','viewer'].includes(b.role))?.role:null;
 return async()=>{
  const started=await session();if(!actor(started)||!role(started))throw Error('Verified business membership required');
  const response=await fetcher('/api/v1/businesses/'+businessId+'/intelligence/context'+(jobId?'?jobId='+encodeURIComponent(jobId):''),{method:'GET',credentials:'same-origin',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
  if(response.type==='opaqueredirect'||!response.ok)throw Error('Authorized cloud context unavailable; no action executed');
  const data=await response.json(),current=await session();
  if(actor(current)!==actor(started)||role(current)!==role(started)||!role(current))throw Error('Account or role changed; discard cloud context');
  if(data?.kind!=='tradeflow.intelligence.context.v1'||data.businessId!==businessId||actor({identity:data.identity})!==actor(started)||data.permission?.role!==role(current)||data.readOnly!==true||data.executionAuthority!==false||!Array.isArray(data.records)||data.records.length>200||jobId&&data.scope?.jobId!==jobId||!jobId&&data.scope?.company!==true)throw Error('Cloud context identity or contract invalid');
  const keys=new Set();for(const r of data.records){const ref=recordIdentity({businessId,type:r.type,id:r.id,record:r.record});if(keys.has(ref.key)||!Number.isSafeInteger(r.revision)||r.revision<1||r.provenance!=='tenant_record'||r.contentTrust!=='untrusted_record_content'||typeof r.updatedAt!=='string')throw Error('Cloud context record provenance invalid');keys.add(ref.key)}
  // Context remains ephemeral in the authorized caller, not in the durable
  // command receipt. Only a non-sensitive read summary enters that ledger.
  await onContext(data);
  return {readOnly:true,source:'permission_filtered_cloud_context',recordCount:data.records.length,scope:data.scope,executionAuthority:false};
 };
}
