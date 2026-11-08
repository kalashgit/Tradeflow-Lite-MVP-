// Development-only bridge: existing H04-01 authoritative read → Qwen → fresh authorization read.
// No new HTTP route, no credentials in browser, no business mutations.
'use strict';
const {briefAuthorizedContext}=require('./local-ai-briefing.cjs');
function identityScope(context,principal,businessId,jobId){
 if(context?.kind!=='tradeflow.intelligence.context.v1'||context.businessId!==businessId||context.identity?.issuer!==principal.issuer||context.identity?.subject!==principal.subject||!context.permission?.role)throw Error('Authorized intelligence scope unavailable');
 return {businessId,identity:{issuer:principal.issuer,subject:principal.subject},role:context.permission.role,...(jobId?{jobId}:{})};
}
function fingerprint(context){
 return JSON.stringify(context.records.map(r=>[r.type,r.id,r.revision,r.updatedAt]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
async function briefFromAuthorizedSource({db,principal,businessId,jobId,question,enabled=false,contextReader,briefing=briefAuthorizedContext,...options}={}){
 if(!enabled)return {status:'disabled',answer:null,executionAuthority:false};
 if(!db||!principal||!businessId||typeof contextReader!=='function')throw Error('Authorized context reader and credentials required');
 // Production wiring supplies src/intelligence-context.js readIntelligenceContext.
 // Test-only contextReader injection must never be exposed to the UI or API.
 const args={db,principal,businessId,...(jobId?{jobId}:{})};
 const first=await contextReader(args);
 const scope=identityScope(first,principal,businessId,jobId);
 const result=await briefing({context:first,scope,question,enabled:true,...options});
 if(result.status!=='completed')return {...result,answer:null,executionAuthority:false};
 // Credential/role membership can change while the model is generating.
 // Require an entirely new authorized read and reject changed record revisions or scope.
 let latest;
 try{latest=await contextReader(args)}catch{return {status:'stale_or_revoked',answer:null,executionAuthority:false}};
 try{
  const current=identityScope(latest,principal,businessId,jobId);
  if(current.role!==scope.role||fingerprint(first)!==fingerprint(latest))return {status:'stale_or_revoked',answer:null,executionAuthority:false};
 }catch{return {status:'stale_or_revoked',answer:null,executionAuthority:false}}
 return {...result,readReverified:true,executionAuthority:false};
}
module.exports={briefFromAuthorizedSource};
