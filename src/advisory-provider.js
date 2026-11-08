// Provider-neutral, server-only advisory boundary. This module is deliberately
// not wired to an HTTP endpoint or a production provider.
const IDENTIFIER=/^[A-Za-z0-9_-]{1,100}$/;
const MAX_INPUT_BYTES=16000;
const MAX_EVIDENCE_RECORDS=200;
const DEFAULT_TIMEOUT_MS=5000;
const MAX_TIMEOUT_MS=10000;

export class AdvisoryProviderError extends Error {
 constructor(message,code='advisory_unavailable'){super(message);this.name='AdvisoryProviderError';this.code=code}
}

export function prepareAdvisoryRequest({context,question,enabled=false}={}){
 if(enabled!==true)throw new AdvisoryProviderError('External advisory is disabled');
 if(!context||context.kind!=='tradeflow.intelligence.context.v1'||context.readOnly!==true||context.executionAuthority!==false)
  throw new AdvisoryProviderError('Authorized read-only context required','invalid_context');
 if(!IDENTIFIER.test(context.businessId||'')||!context.identity?.issuer||!context.identity?.subject||!Array.isArray(context.records))
  throw new AdvisoryProviderError('Context identity is unavailable','invalid_context');
 if(typeof question!=='string'||!question.trim()||question.length>500)
  throw new AdvisoryProviderError('Invalid advisory question','invalid_question');
 if(context.scope?.jobId!==undefined&&!IDENTIFIER.test(context.scope.jobId))
  throw new AdvisoryProviderError('Invalid advisory scope','invalid_context');
 if(context.records.length>MAX_EVIDENCE_RECORDS)
  throw new AdvisoryProviderError('Too many evidence references','input_too_large');
 const unique=new Set();
 // Explicit allowlist: never forward the entire tenant snapshot, bearer token,
 // customer details, provider credentials, free-form record text, or PII.
 const evidence=context.records.map(item=>{
  if(!item||!IDENTIFIER.test(item.type||'')||!IDENTIFIER.test(item.id||'')||!Number.isSafeInteger(item.revision)||item.revision<1)
   throw new AdvisoryProviderError('Invalid evidence provenance','invalid_context');
  const key=`${item.type}:${item.id}`;
  if(unique.has(key))throw new AdvisoryProviderError('Ambiguous duplicate evidence','invalid_context');
  unique.add(key);
  return {type:item.type,id:item.id,revision:item.revision};
 });
 const payload={protocol:'tradeflow.advisory.v1',scope:context.scope?.jobId?{jobId:context.scope.jobId}:{company:true},
  question:question.trim(),evidence,limitations:['Evidence identifiers only; no record contents supplied.','Advisory output is untrusted and cannot authorize or execute commands.']};
 if(new TextEncoder().encode(JSON.stringify(payload)).length>MAX_INPUT_BYTES)throw new AdvisoryProviderError('Advisory input exceeds limit','input_too_large');
 return Object.freeze(payload);
}

export async function requestAdvisory({context,question,enabled=false,transport,timeoutMs=DEFAULT_TIMEOUT_MS}={}){
 const payload=prepareAdvisoryRequest({context,question,enabled});
 if(typeof transport!=='function')throw new AdvisoryProviderError('No server advisory transport configured');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>MAX_TIMEOUT_MS)
  throw new AdvisoryProviderError('Invalid advisory timeout','invalid_timeout');
 const controller=new AbortController();
 let timer;
 let response;
 try{
  response=await Promise.race([
   Promise.resolve().then(()=>transport(payload,{signal:controller.signal})),
   new Promise((_,reject)=>{
    timer=setTimeout(()=>{controller.abort();reject(new AdvisoryProviderError('Advisory timed out','advisory_timeout'))},timeoutMs);
   })
  ]);
 }catch(error){
  if(error instanceof AdvisoryProviderError&&error.code==='advisory_timeout')throw error;
  throw new AdvisoryProviderError('Advisory transport unavailable');
 }finally{
  clearTimeout(timer);
 }
 if(!response||typeof response.text!=='string'||new TextEncoder().encode(response.text).length>4000)
  throw new AdvisoryProviderError('Invalid advisory response','invalid_response');
 return {kind:'tradeflow.advisory.untrusted.v1',text:response.text,readOnly:true,executionAuthority:false,
  requiresHumanReview:true,verifiedBusinessOutcome:false};
}
