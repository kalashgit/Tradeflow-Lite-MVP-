/* TF-KNOW-P01: pure, versioned projections over TradeFlow's existing
 * authorized evidence. Not a new truth store, role grant, command executor,
 * knowledge approval, remote authentication proof or background worker.
 */
import {canonical,digest,freeze,validateEvidence} from './intelligence-evidence.js';

const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const timestamp=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x));
const allowedKinds=new Set(['procedure','external_fact','business_goal','owner_preference',
 'learning_hypothesis','customer_commitment','domain_rule']);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const actorOf=scope=>scope?.mode==='cloud'?
 {mode:'cloud',issuer:scope.identity?.issuer,subject:scope.identity?.subject,role:scope.role}:
 {mode:'local',actor:scope?.actor};
const safeCopy=x=>JSON.parse(JSON.stringify(x));
const validPointer=p=>p?.schemaVersion===1&&p.sourceKind==='tradeflow_record'&&
 id(p.businessId)&&id(p.recordType)&&id(p.recordId)&&
 (p.recordRevision===null||Number.isSafeInteger(p.recordRevision)&&p.recordRevision>=1)&&
 /^sha256:[a-f0-9]{64}$/.test(p.contentDigest||'')&&
 timestamp(p.observedAt)&&
 ['tenant_record_projection','device_local_projection'].includes(p.verification)&&
 p.executionAuthority===false&&p.sourceUri===null;

export async function projectEvidencePointers({context,scope,observedAt}={}){
 if(!timestamp(observedAt))throw Error('Explicit evidence observation timestamp required');
 // Structural validation is NOT authentication. The caller must obtain cloud
 // context from the existing server-authorized reader immediately beforehand.
 const checked=await validateEvidence(context,scope);
 const actor=actorOf(scope),businessId=scope.businessId;
 const pointers=[];
 for(const r of context.records){
  const visibleHash=await digest(r.record);
  if(checked.local&&r.evidenceHash!==visibleHash)
   throw Error('Device-local evidence projection changed');
  pointers.push({
   schemaVersion:1,businessId,sourceKind:'tradeflow_record',
   recordType:r.type,recordId:r.id,recordRevision:r.revision,
   sourceUri:null,sourceUpdatedAt:r.updatedAt||null,observedAt,
   validThrough:null,contentDigest:'sha256:'+visibleHash,
   verification:checked.local?'device_local_projection':'tenant_record_projection',
   visibility:checked.local?'device_local_only':'permission_filtered',
   actorScope:safeCopy(actor),executionAuthority:false
  });
 }
 return freeze(pointers.sort((a,b)=>
  (a.recordType+':'+a.recordId).localeCompare(b.recordType+':'+b.recordId)));
}

// Candidate knowledge is derived, not a published SOP, owner preference or
// operational fact. A review/consent and persistence policy must be separate.
export function proposeKnowledgeItem({id:knowledgeId,kind,claim,subject,sourcePointers,
 observedAt,expiresAt=null}={}){
 if(!id(knowledgeId)||!allowedKinds.has(kind)||
    typeof claim!=='string'||!claim.trim()||claim.length>500||
    !id(subject?.entityType)||!id(subject?.id)||
    !timestamp(observedAt)||expiresAt!==null&&
    (!timestamp(expiresAt)||Date.parse(expiresAt)<=Date.parse(observedAt))||
    !Array.isArray(sourcePointers)||!sourcePointers.length||sourcePointers.length>12||
    !sourcePointers.every(validPointer))
  throw Error('Bounded, sourced knowledge candidate required');
 const first=sourcePointers[0],scope=first.actorScope;
 const keys=new Set();
 for(const p of sourcePointers){
  if(p.businessId!==first.businessId||canonical(p.actorScope)!==canonical(scope)||
     p.verification!==first.verification||p.visibility!==first.visibility||
     keys.has(p.recordType+':'+p.recordId))
   throw Error('Knowledge candidate sources must have one actor and business scope');
  keys.add(p.recordType+':'+p.recordId);
 }
 if(!keys.has(subject.entityType+':'+subject.id))
  throw Error('Knowledge subject must be represented by current source evidence');
 return freeze({
  schemaVersion:1,id:knowledgeId,businessId:first.businessId,scope:'actor_candidate',
  actorScope:safeCopy(scope),kind,
  subject:{entityType:subject.entityType,id:subject.id},claim:claim.trim(),
  sourceRefs:sourcePointers.map(p=>safeCopy(p)),status:'candidate',
  review:{approvedBy:null,approvedAt:null},observedAt,
  effectiveFrom:null,expiresAt,confidence:'unverified',supersedes:null,
  sensitivity:'internal',revision:1,persistence:'not_saved',
  publishable:false,executionAuthority:false
 });
}

export async function inspectKnowledgeCandidate({item,context,scope,asOf}={}){
 const result=status=>freeze({status,executionAuthority:false});
 if(!item||item.schemaVersion!==1||item.status!=='candidate'||
    item.executionAuthority!==false||item.publishable!==false||
    item.persistence!=='not_saved'||!Array.isArray(item.sourceRefs)||
    !item.sourceRefs.length||item.sourceRefs.length>12)
  return result('invalid_candidate');
 if(!timestamp(asOf))return result('invalid_time');
 if(item.expiresAt!==null&&timestamp(item.expiresAt)&&Date.parse(asOf)>=Date.parse(item.expiresAt))
  return result('expired');
 if(item.businessId!==scope?.businessId||
    canonical(item.actorScope)!==canonical(actorOf(scope)))return result('scope_changed');
 try{
  const pointers=await projectEvidencePointers({context,scope,observedAt:asOf});
  const current=new Map(pointers.map(p=>[p.recordType+':'+p.recordId,p]));
  for(const expected of item.sourceRefs){
   if(!validPointer(expected))return result('invalid_candidate');
   const now=current.get(expected.recordType+':'+expected.recordId);
   if(!now)return result('source_unavailable_or_withheld');
   if(expected.businessId!==now.businessId||
      expected.recordRevision!==now.recordRevision||
      expected.contentDigest!==now.contentDigest||
      expected.verification!==now.verification||
      canonical(expected.actorScope)!==canonical(now.actorScope))
    return result('stale_source');
  }
 }catch{return result('access_or_evidence_unverified')}
 return result('candidate_current_not_approved');
}
