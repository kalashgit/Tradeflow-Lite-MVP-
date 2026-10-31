import {AdvisoryProviderError,requestAdvisory} from './advisory-provider.js';

// No network client, dynamic provider URL, credential store or public route.
// An authenticated server host can inject a mock transport for contract tests.
const INTENTS=Object.freeze({
 labor_variance:'Identify competing explanations for the observed labor variance and missing evidence.',
 cost_variance:'Identify competing explanations for the observed cost variance and missing evidence.',
 evidence_gaps:'Describe what evidence would be needed before any business decision.'
});

export function advisoryServerConfig(env={}){
 const enabled=env.TF_ADVISORY_ENABLED==='true';
 const provider=env.TF_ADVISORY_PROVIDER||'none';
 if(!enabled)return Object.freeze({enabled:false,provider:'none'});
 // A real provider requires a separately approved credential, scope, budget,
 // transport, egress and audit design. Do not use arbitrary URLs or secrets.
 if(provider!=='mock')throw new AdvisoryProviderError('Advisory provider is not approved');
 return Object.freeze({enabled:true,provider:'mock'});
}

export async function requestServerAdvisory({env,context,principal,intent,transport,authorize}={}){
 const config=advisoryServerConfig(env);
 if(!config.enabled)throw new AdvisoryProviderError('External advisory is disabled');
 if(typeof intent!=='string'||!Object.hasOwn(INTENTS,intent))
  throw new AdvisoryProviderError('Unsupported advisory intent','invalid_intent');
 if(!principal||context?.identity?.issuer!==principal.issuer||context?.identity?.subject!==principal.subject)
  throw new AdvisoryProviderError('Advisory principal mismatch','invalid_context');
 if(typeof authorize!=='function') throw new AdvisoryProviderError('Server authorization required','authorization_required');
 const requestInfo=Object.freeze({businessId:context.businessId,principal:Object.freeze({issuer:principal.issuer,subject:principal.subject}),scope:Object.freeze(context.scope?.jobId?{jobId:context.scope.jobId}:{company:true}),purpose:'read_only_advisory'});
 const ensureAuthorized=async()=>{let ok=false;try{ok=await authorize(requestInfo)}catch{}if(ok!==true)throw new AdvisoryProviderError('Advisory authorization unavailable','authorization_denied')};
 await ensureAuthorized();
 const result=await requestAdvisory({context,question:INTENTS[intent],enabled:true,transport});
 await ensureAuthorized();
 return result;
}
