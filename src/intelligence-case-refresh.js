/* TF-KNOW-P01C / HYB-02 — authenticated cloud case revalidation.
 * Read-only: re-reads current tenant records through the existing server
 * context authority. This is not an HTTP route, grant, command or cache.
 *
 * IMPORTANT: a cloud case v1 stores source revisions, not a cryptographic
 * digest of each original cloud record. 'current_revision_verified' is
 * therefore only a revision/access claim, not an unchanged-bytes claim.
 */
import {readIntelligenceContext} from './intelligence-context.js';
import {inspectIntelligenceCase,CASE_KIND} from '../public/intelligence-case.js';
import {canonical,validateEvidence,freeze} from '../public/intelligence-evidence.js';
import {requireVerifiedPrincipal} from './tenant-security.js';

const status=(name)=>freeze({status:name,executionAuthority:false,
 sourceContentVerified:false,commandExecuted:false});
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

export async function inspectCurrentCloudCase({
 db,principal,caseFile,decision,scope,threadId=null,
 asOf=new Date().toISOString()
}={}){
 if(caseFile?.kind!==CASE_KIND||caseFile.sourceMode!=='authenticated_tenant_snapshot'||
    scope?.mode!=='cloud'||!scope.businessId||!scope.identity||!db?.prepare)
  return status('invalid_case_or_scope');
 let verified;
 try{verified=requireVerifiedPrincipal(principal)}
 catch{return status('access_unverified')}
 if(verified.issuer!==scope.identity.issuer||
    verified.subject!==scope.identity.subject||
    caseFile.businessId!==scope.businessId||
    caseFile.actorId!==verified.subject||
    (caseFile.jobId||null)!==(scope.jobId||null))
  return status('scope_changed');
 // Never read cloud records just to discover that an expired, interrupted or
 // unrelated case was rejected. This preliminary guard grants no access.
 const initial=inspectIntelligenceCase({
  caseFile,decision,scope,threadId,asOf,accessGranted:true
 });
 if(initial.status!=='current')return status(initial.status);
 let current;
 try{
  current=await readIntelligenceContext({
   db,principal,businessId:scope.businessId,
   ...(scope.jobId?{jobId:scope.jobId}:{})
  });
  await validateEvidence(current,scope);
 }catch{return status('access_or_evidence_unverified')}
 // A current signed-in principal is not sufficient if a role changed or a
 // job disappeared, or a linked record was added/removed since case creation.
 let present;
 try{present=refs(current.records)}
 catch{return status('invalid_current_sources')}
 if(canonical(present)!==canonical(caseFile.sources))return status('stale_evidence');
 return freeze({
  status:'current_revision_verified',businessId:scope.businessId,
  sourceCount:present.length,sourceRevisions:present.map(x=>({
   type:x.type,id:x.id,revision:x.revision
  })),executionAuthority:false,sourceContentVerified:false,
  commandExecuted:false
 });
}
