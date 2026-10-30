// Provider-neutral, server-only advisory boundary. This module is deliberately
// not wired to an HTTP endpoint or a production provider.
const IDENTIFIER=/^[A-Za-z0-9_-]{1,100}$/;
const MAX_INPUT_BYTES=16000;

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
 // Explicit allowlist: never forward the entire tenant snapshot, bearer token,
 // customer details, provider credentials, free-form record text, or PII.
 const evidence=context.records.map(item=>{
  if(!IDENTIFIER.test(item.type||'')||!IDENTIFIER.test(item.id||'')||!Number.isSafeInteger(item.revision)||item.revision<1)
   throw new AdvisoryProviderError('Invalid evidence provenance','invalid_context');
  return {type:item.type,id:item.id,revision:item.revision};
 });
 const payload={protocol:'tradeflow.advisory.v1',scope:context.scope?.jobId?{jobId:context.scope.jobId}:{company:true},
  question:question.trim(),evidence,limitations:['Evidence identifiers only; no record contents supplied.','Advisory output is untrusted and cannot authorize or execute commands.']};
 if(JSON.stringify(payload).length>MAX_INPUT_BYTES)throw new AdvisoryProviderError('Advisory input exceeds limit','input_too_large');
 return Object.freeze(payload);
}

export async function requestAdvisory({context,question,enabled=false,transport}={}){
 const payload=prepareAdvisoryRequest({context,question,enabled});
 if(typeof transport!=='function')throw new AdvisoryProviderError('No server advisory transport configured');
 let response;
 try{response=await transport(payload)}catch{throw new AdvisoryProviderError('Advisory transport unavailable')}
 if(!response||typeof response.text!=='string'||response.text.length>4000)
  throw new AdvisoryProviderError('Invalid advisory response','invalid_response');
 return {kind:'tradeflow.advisory.untrusted.v1',text:response.text,readOnly:true,executionAuthority:false,
  requiresHumanReview:true,verifiedBusinessOutcome:false};
}
