/* TF-KNOW-P01C/D / HYB-02 — authenticated cloud case revalidation.
 * Read-only, internal and not routed. Server-authorized tenant records are
 * the only source of truth. The in-process binding is an optional content
 * integrity guard over the ALLOWLISTED evidence projection, not a session,
 * permission, raw-record signature or executable command.
 */
import {readIntelligenceContext} from './intelligence-context.js';
import {readJobScopedIntelligenceContext} from './job-scoped-intelligence-context.js';
import {inspectIntelligenceCase,CASE_KIND} from '../public/intelligence-case.js';
import {canonical,digest,validateEvidence,freeze} from '../public/intelligence-evidence.js';
import {requireVerifiedPrincipal} from './tenant-security.js';

const issuedBindings=new WeakSet();
export const CLOUD_CASE_CONTENT_BINDING_KIND='tradeflow.intelligence.cloud-case-content-binding.v1';
const status=name=>freeze({status:name,executionAuthority:false,
 sourceContentVerified:false,rawRecordBytesVerified:false,commandExecuted:false});
const refs=records=>{
 if(!Array.isArray(records)||records.length>200)throw Error('Invalid current source collection');
 const seen=new Set(),result=[];
 for(const r of records){
  if(typeof r?.type!=='string'||typeof r?.id!=='string'||
     !Number.isSafeInteger(r.revision)||r.revision<1||
     r.provenance!=='tenant_record')throw Error('Invalid cloud source');
  const key=r.type+':'+r.id;
  if(seen.has(key))throw Error('Duplicate cloud source');
  seen.add(key);
  result.push({type:r.type,id:r.id,revision:r.revision,contentHash:null,
   provenance:'tenant_record'});
 }
 return result.sort((a,b)=>(a.type+':'+a.id).localeCompare(b.type+':'+b.id));
};
const contentDigest=async records=>digest(records.map(r=>({
 type:r.type,id:r.id,revision:r.revision,updatedAt:r.updatedAt,
 provenance:r.provenance,record:r.record
})).sort((a,b)=>(a.type+':'+a.id).localeCompare(b.type+':'+b.id)));

function trustedBinding(binding,caseFile,scope,principal,threadId){
 return binding&&issuedBindings.has(binding)&&
  binding.kind===CLOUD_CASE_CONTENT_BINDING_KIND&&
  binding.caseId===caseFile.id&&
  binding.sourceBinding===caseFile.sourceBinding&&
  binding.scopeSignature===caseFile.scopeSignature&&
  binding.businessId===scope.businessId&&binding.jobId===(scope.jobId||null)&&
  binding.jobAccessScope===(scope.role==='member'?scope.jobAccessScope:null)&&
  binding.threadId===threadId&&
  binding.actor?.issuer===principal.issuer&&binding.actor.subject===principal.subject&&
  binding.executionAuthority===false&&binding.readOnly===true&&
  /^sha256:[a-f0-9]{64}$/.test(binding.projectedContentDigest||'');
}
async function revalidate({db,principal,caseFile,decision,scope,
 threadId=null,asOf=new Date().toISOString()}={}){
 if(caseFile?.kind!==CASE_KIND||caseFile.sourceMode!=='authenticated_tenant_snapshot'||
    scope?.mode!=='cloud'||!scope.businessId||!scope.identity||!db?.prepare)
  return {result:status('invalid_case_or_scope')};
 let verified;
 try{verified=requireVerifiedPrincipal(principal)}
 catch{return {result:status('access_unverified')}}
 if(verified.issuer!==scope.identity.issuer||
    verified.subject!==scope.identity.subject||
    caseFile.businessId!==scope.businessId||
    caseFile.actorId!==verified.subject||
    (caseFile.jobId||null)!==(scope.jobId||null))
  return {result:status('scope_changed')};
 const initial=inspectIntelligenceCase({
  caseFile,decision,scope,threadId,asOf,accessGranted:true
 });
 if(initial.status!=='current')return {result:status(initial.status)};
 // Members require a decision made for the same explicitly scoped job
 // grant. A company-membership snapshot is not a field-job permission.
 if(scope.role==='member'&&(
   !scope.jobId||!['crew','office'].includes(scope.jobAccessScope)||
   !decision?.scope||canonical(decision.scope)!==canonical(scope)
  ))return {result:status('scoped_member_context_unavailable')};
 if(!['owner','admin','member'].includes(scope.role))
  return {result:status('scoped_member_context_unavailable')};
 let current;
 try{
  current=scope.role==='member'?await readJobScopedIntelligenceContext({
   db,principal,businessId:scope.businessId,jobId:scope.jobId,
   grantScope:scope.jobAccessScope
  }):await readIntelligenceContext({
   db,principal,businessId:scope.businessId,
   ...(scope.jobId?{jobId:scope.jobId}:{})
  });
  await validateEvidence(current,scope);
 }catch{return {result:status('access_or_evidence_unverified')}}
 let present;
 try{present=refs(current.records)}
 catch{return {result:status('invalid_current_sources')}}
 if(canonical(present)!==canonical(caseFile.sources))
  return {result:status('stale_evidence')};
 return {result:freeze({
  status:'current_revision_verified',businessId:scope.businessId,
  sourceCount:present.length,sourceRevisions:present.map(x=>({
   type:x.type,id:x.id,revision:x.revision
  })),executionAuthority:false,sourceContentVerified:false,
  rawRecordBytesVerified:false,commandExecuted:false
 }),current,verified};
}

// Mint a server-process-private snapshot only from a CURRENT, authenticated
// owner/admin case. Holding this object or its hash never grants read/write.
export async function captureCloudCaseContentBinding(options={}){
 const {result,current,verified}=await revalidate(options);
 if(result.status!=='current_revision_verified')
  return freeze({status:result.status,binding:null,executionAuthority:false});
 const {caseFile,scope,threadId=null,asOf=new Date().toISOString()}=options;
 const binding=freeze({
  kind:CLOUD_CASE_CONTENT_BINDING_KIND,schemaVersion:1,
  caseId:caseFile.id,sourceBinding:caseFile.sourceBinding,
  scopeSignature:caseFile.scopeSignature,businessId:scope.businessId,
  actor:{issuer:verified.issuer,subject:verified.subject},
  jobId:scope.jobId||null,jobAccessScope:scope.role==='member'?scope.jobAccessScope:null,
  threadId,observedAt:asOf,
  projectedContentDigest:'sha256:'+await contentDigest(current.records),
  sourceCount:current.records.length,
  evidenceScope:'allowlisted_projection',readOnly:true,
  executionAuthority:false,persistence:'in_process_only'
 });
 issuedBindings.add(binding);
 return freeze({status:'captured_current_projection',binding,executionAuthority:false});
}

// With no trusted binding this preserves the original revision-only result.
// With a same-process binding, comparing CURRENT allowlisted content also
// rejects same-revision edits and same-revision timestamp changes.
export async function inspectCurrentCloudCase(options={}){
 const {result,current,verified}=await revalidate(options);
 if(result.status!=='current_revision_verified')return result;
 if(options.contentBinding===undefined)return result;
 const {caseFile,scope,threadId=null,contentBinding}=options;
 if(!trustedBinding(contentBinding,caseFile,scope,verified,threadId))
  return status('content_binding_untrusted');
 let currentDigest;
 try{currentDigest='sha256:'+await contentDigest(current.records)}
 catch{return status('content_digest_unavailable')}
 if(currentDigest!==contentBinding.projectedContentDigest||
    current.records.length!==contentBinding.sourceCount)
  return status('projected_source_content_changed');
 return freeze({
  ...result,status:'current_projected_content_verified',
  sourceContentVerified:true,rawRecordBytesVerified:false,
  contentScope:'allowlisted_evidence_projection'
 });
}
