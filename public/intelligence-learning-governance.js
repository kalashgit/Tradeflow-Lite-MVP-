/* TF-MI-LEARN-01 Phase B — governed learning records.
 *
 * Builds on Phase A learning candidates (tradeflow.intelligence.learning.v1). A governed record
 * separates: original recommendation, user feedback/correction, verified receipts, outcome
 * measurement, unknowns, sensitivity/access, approval state, applicability and policy effect.
 * It is in-memory only (no schema or retention approved). It can annotate ranking/explanation
 * inside bounded rules; it can never grant authority, change permissions or become a universal rule.
 */
import {LEARNING_KIND,PROACTIVE_CASE_KIND} from './intelligence-proactive-cases.js';
import {digest,canonical} from './intelligence-evidence.js';

export const GOVERNED_LEARNING_KIND='tradeflow.intelligence.learning.governed.v1';
export const LEARNING_ACCESS_ROLES=Object.freeze(['owner','admin']);
const EVIDENCE_CLASSES=new Set(['user_feedback','verified_receipt','synthetic_simulation']);
const iso=x=>{const t=Date.parse(x);if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(x)||!Number.isFinite(t))throw Error('ISO timestamp required');return t};
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const roleOf=scope=>scope?.mode==='local'?'owner':scope?.role;
const actorOf=scope=>scope?.mode==='local'?scope.actor:scope?.identity?.subject;

export async function governLearningCandidate({candidate,caseFile,now=new Date().toISOString(),evidenceClass='user_feedback',receiptRefs=[]}={}){
 if(candidate?.kind!==LEARNING_KIND||candidate.executionAuthority!==false||candidate.scope!=='tenant_only')throw Error('Phase A tenant-only learning candidate required');
 if(caseFile?.kind!==PROACTIVE_CASE_KIND||caseFile.caseId!==candidate.supportingCaseIds?.[0]||caseFile.tenantId!==candidate.tenantId)throw Error('Learning must reference the exact supporting case of the same tenant');
 if(!EVIDENCE_CLASSES.has(evidenceClass))throw Error('Unknown evidence class');
 if(!Array.isArray(receiptRefs)||receiptRefs.some(r=>typeof r!=='string'||!/^[A-Za-z0-9:_@.-]{1,160}$/.test(r)))throw Error('Receipt references must be bounded identifiers');
 if(evidenceClass==='verified_receipt'&&!receiptRefs.length)throw Error('verified_receipt requires at least one receipt reference');
 const at=iso(now);
 const learningId='glearn_'+(await digest(canonical({tenantId:candidate.tenantId,lessonId:candidate.lessonId}))).slice(0,24);
 return freeze({kind:GOVERNED_LEARNING_KIND,version:1,learningId,lessonId:candidate.lessonId,tenantId:candidate.tenantId,
  actor:{subject:candidate.provenance.actorSubject,role:candidate.provenance.actorRole},
  subject:{detectorId:caseFile.detectorId,subjectKey:caseFile.subjectKey??null,caseId:caseFile.caseId,dedupeKey:caseFile.dedupeKey},
  sourceRefs:caseFile.subjectRefs.map(r=>({type:r.type,id:r.id,revision:r.revision})),
  originalRecommendation:{conclusion:caseFile.conclusion,severity:caseFile.severity,recommendation:caseFile.recommendation,proposals:caseFile.proposals.map(p=>p.proposalId??p.commandId)},
  feedback:{value:candidate.feedback,note:candidate.note,recordedAt:candidate.provenance.recordedAt},
  receipts:{refs:[...receiptRefs],verified:evidenceClass==='verified_receipt'},
  measurement:{...candidate.measurement,evidenceClass,realBusinessImprovement:evidenceClass==='verified_receipt'?null:null,limitations:[...candidate.measurement.limitations,...(evidenceClass==='synthetic_simulation'?['Synthetic simulation is not evidence of real business improvement.']:[]),'Outcome measurement requires independent verification.']},
  unknowns:[...new Set([...caseFile.unknowns,'long_term_outcome_unobserved'])],missingEvidence:[...caseFile.missingData],
  createdAt:new Date(at).toISOString(),expiresAt:candidate.expiresAt,
  sensitivity:'tenant_confidential',access:{tenantId:candidate.tenantId,roles:[...LEARNING_ACCESS_ROLES]},
  approvalState:'unreviewed',applicability:{tenantId:candidate.tenantId,detectorId:caseFile.detectorId,subjectKey:caseFile.subjectKey??null,generalizes:false,futureSituations:['same_tenant_same_detector_same_subject_explanation_and_ranking_only']},
  policyEffect:'none',authorityChange:false,permissionEffect:'none',financialCertaintyEffect:'none',
  invalidation:{status:'valid',reason:null,at:null},corrections:[],supersedes:null,executionAuthority:false});
}
export function readLearning({record,scope}={}){
 if(record?.kind!==GOVERNED_LEARNING_KIND||record.executionAuthority!==false)return {status:'invalid'};
 if(!scope||scope.businessId!==record.tenantId)return {status:'denied',reason:'foreign_tenant'};
 if(!LEARNING_ACCESS_ROLES.includes(roleOf(scope)))return {status:'denied',reason:'role_not_permitted'};
 return {status:'ok',record};
}
export async function correctLearning({record,scope,feedback,note='',now=new Date().toISOString()}={}){
 const access=readLearning({record,scope});if(access.status!=='ok')throw Error('Correction denied: '+(access.reason||access.status));
 if(!['accepted','corrected','rejected','withdrawn'].includes(feedback))throw Error('Unsupported correction');
 if(typeof note!=='string'||note.length>500)throw Error('Correction note too long');
 const at=iso(now);
 const learningId='glearn_'+(await digest(canonical({tenantId:record.tenantId,lessonId:record.lessonId,version:record.version+1}))).slice(0,24);
 return freeze({...record,learningId,version:record.version+1,supersedes:record.learningId,approvalState:'unreviewed',
  feedback:{value:feedback,note:{text:note,trust:'user_supplied_untrusted'},recordedAt:new Date(at).toISOString(),correctedBy:actorOf(scope)},
  corrections:[...record.corrections,{at:new Date(at).toISOString(),by:actorOf(scope),from:record.feedback.value,to:feedback}],
  invalidation:feedback==='withdrawn'?{status:'withdrawn',reason:'user_withdrew_feedback',at:new Date(at).toISOString()}:record.invalidation});
}
export function invalidateLearningOnRevision({record,currentRefs,now=new Date().toISOString()}={}){
 if(record?.kind!==GOVERNED_LEARNING_KIND)throw Error('Governed learning record required');
 if(!Array.isArray(currentRefs))throw Error('Current record references required');
 const current=new Map(currentRefs.map(r=>[r.type+':'+r.id,r]));
 const stale=record.sourceRefs.find(r=>{const live=current.get(r.type+':'+r.id);return !live||(r.revision!==null&&live.revision!==r.revision)});
 if(!stale)return record;
 return freeze({...record,invalidation:{status:'invalidated',reason:'source_revision_changed:'+stale.type+':'+stale.id,at:new Date(iso(now)).toISOString()}});
}
export function learningStatus({record,now=new Date().toISOString()}={}){
 if(record?.kind!==GOVERNED_LEARNING_KIND||record.executionAuthority!==false)return 'invalid';
 if(record.invalidation.status!=='valid')return record.invalidation.status;
 if(iso(now)>=Date.parse(record.expiresAt))return 'expired';
 return 'active';
}
// Explanation of what supports a learning record; never a permission or a fact about the business.
export function explainLearning(record){
 if(record?.kind!==GOVERNED_LEARNING_KIND)throw Error('Governed learning record required');
 return Object.freeze({learningId:record.learningId,tenantId:record.tenantId,
  supportedBy:[`owner feedback "${record.feedback.value}" on ${record.subject.detectorId} for ${record.subject.subjectKey}`,...record.sourceRefs.map(r=>`${r.type}:${r.id}@${r.revision??'local'}`)],
  receipts:record.receipts.verified?record.receipts.refs:['none verified'],
  measurement:`${record.measurement.metric}: sample ${record.measurement.sampleCount}, baseline ${record.measurement.baseline??'unknown'}, after ${record.measurement.after??'unknown'} (${record.measurement.evidenceClass})`,
  unknowns:record.unknowns,appliesTo:record.applicability.futureSituations,doesNot:['grant execution authority','change permissions','assert financial certainty','apply to other customers, jobs or businesses','modify business records'],
  status:record.invalidation.status});
}
// Bounded aggregation: counts per subject; refuses to promote a correlation into a universal rule.
export function aggregateLearning({records=[],tenantId,now=new Date().toISOString()}={}){
 if(!tenantId)throw Error('Tenant required');
 const active=records.filter(r=>r?.kind===GOVERNED_LEARNING_KIND&&r.tenantId===tenantId&&learningStatus({record:r,now})==='active');
 const bySubject=new Map();
 for(const r of active){const k=r.subject.detectorId+'|'+r.subject.subjectKey;const row=bySubject.get(k)||{detectorId:r.subject.detectorId,subjectKey:r.subject.subjectKey,feedback:{accepted:0,corrected:0,rejected:0},sampleCount:0};row.feedback[r.feedback.value]=(row.feedback[r.feedback.value]||0)+1;row.sampleCount++;bySubject.set(k,row)}
 const byDetector=new Map();for(const row of bySubject.values()){const d=byDetector.get(row.detectorId)||{detectorId:row.detectorId,subjects:0,rejected:0};d.subjects++;d.rejected+=row.feedback.rejected;byDetector.set(row.detectorId,d)}
 return Object.freeze({tenantId,activeRecords:active.length,subjects:[...bySubject.values()],
  detectors:[...byDetector.values()].map(d=>Object.freeze({...d,universalRuleEligible:false,reason:'observed correlation; universal rules require independent review and separately validated bounded rules',suggestedNextStep:d.subjects>=3&&d.rejected>=3?'request_independent_review_of_detector_threshold':'keep_collecting_per_subject_feedback'})),
  policyEffect:'none',executionAuthority:false});
}
