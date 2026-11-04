/* TF-KNOW-P01B: read-only incremental projection from an EXISTING
 * committed local job-cost event and the EXISTING labor detector.
 * No new watcher, command executor, queue, LLM call, or business fact store.
 */
import {canonical,digest,freeze} from './intelligence-evidence.js';
import {projectEvidencePointers} from './knowledge-fabric-contracts.js';

const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const stamp=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x));
const validDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 !Number.isNaN(Date.parse(x+'T12:00:00Z'))&&
 new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
export const LABOR_PROJECTION_KIND='tradeflow.knowledge.labor-observation.v1';

export async function projectLocalLaborSourceChange({
 event,context,scope,engine,asOf,today,previous=null
}={}){
 if(scope?.mode!=='local'||scope.businessId!=='local-business'||scope.actor!=='local-owner'||
    event?.kind!=='domain.event'||event.evidence!=='local_record_commit'||
    event.businessId!==scope.businessId||event.actor!==scope.actor||
    !['pending','processed'].includes(event.status)||
    !event.type?.startsWith('job_cost.')||event.ref?.store!=='jobCosts'||
    !validId(event.ref.id)||typeof event.id!=='string'||!event.id||
    typeof event.correlationId!=='string'||!event.correlationId||
    !stamp(event.at)||!stamp(asOf)||!validDay(today)||
    typeof engine?.evaluate!=='function'||
    !Array.isArray(engine.detectorIds)||
    !engine.detectorIds.includes('job.labor_hours_variance_review'))
  throw Error('Current locally committed cost event and existing labor detector required');

 const scopeBinding=canonical({businessId:scope.businessId,actor:scope.actor});
 if(previous!==null&&(previous.kind!==LABOR_PROJECTION_KIND||
    previous.businessId!==scope.businessId||
    previous.scopeBinding!==scopeBinding))
  throw Error('Previous finding belongs to another actor, business or contract');
 // This recalculates visible source hashes using the existing evidence
 // validator, and does not authenticate a cloud actor or remote delivery.
 const pointers=await projectEvidencePointers({context,scope,observedAt:asOf});
 const source=context.records.filter(r=>r.type==='jobCosts'&&r.id===event.ref.id);
 if(source.length!==1||!validId(source[0].record.jobId))
  return freeze({kind:LABOR_PROJECTION_KIND,businessId:scope.businessId,
   scopeBinding,sourceEventId:event.id,correlationId:event.correlationId,
   status:'source_unavailable_or_withheld',finding:null,sources:[],
   invalidatedPrevious:previous!==null,modelCalls:0,
   readbackVerified:false,executionAuthority:false});

 const jobId=source[0].record.jobId;
 if(context.records.filter(r=>r.type==='jobs'&&r.id===jobId).length!==1)
  return freeze({kind:LABOR_PROJECTION_KIND,businessId:scope.businessId,
   scopeBinding,jobId,sourceEventId:event.id,correlationId:event.correlationId,
   status:'source_unavailable_or_withheld',finding:null,sources:[],
   invalidatedPrevious:previous!==null,modelCalls:0,
   readbackVerified:false,executionAuthority:false});

 const relevant=context.records.filter(r=>r.type==='jobs'&&r.id===jobId||
   r.type==='jobCosts'&&(r.id===event.ref.id||
    r.record.jobId===jobId&&r.record.category==='Labor'&&
    ['estimate','actual'].includes(r.record.type)));
 const keys=new Set(relevant.map(r=>r.type+':'+r.id));
 const sources=pointers.filter(p=>keys.has(p.recordType+':'+p.recordId));
 const sourceBinding=await digest({schemaVersion:1,scopeBinding,jobId,sources:sources.map(p=>({
  type:p.recordType,id:p.recordId,revision:p.recordRevision,
  contentDigest:p.contentDigest,verification:p.verification
 }))});
 // Never synthesize financial/labor detector outputs or invoke a model here.
 // A supplied engine is still only a read-only source of candidate findings.
 const snapshot={};
 for(const r of context.records){
  (snapshot[r.type]||=[]).push({id:r.id,businessId:scope.businessId,...r.record});
 }
 let evaluated;
 try{evaluated=engine.evaluate(snapshot,{businessId:scope.businessId,today,now:asOf})}
 catch{return freeze({kind:LABOR_PROJECTION_KIND,businessId:scope.businessId,
  scopeBinding,jobId,sourceEventId:event.id,correlationId:event.correlationId,
  sourceBinding,status:'detector_unavailable',sources,finding:null,
  invalidatedPrevious:previous!==null,modelCalls:0,
  readbackVerified:false,executionAuthority:false})}
 const matching=Array.isArray(evaluated?.findings)?
  evaluated.findings.filter(f=>f?.detectorId==='job.labor_hours_variance_review'&&
    f.recordRefs?.some(r=>r.store==='jobs'&&r.id===jobId)):[];
 if(matching.length>1)throw Error('Ambiguous current labor detector results');
 const found=matching[0]||null;
 const amounts=found?.evidence;
 const validFinding=found&&found.status==='ready_for_review'&&
  Number.isFinite(amounts?.estimatedLaborHours)&&amounts.estimatedLaborHours>0&&
  Number.isFinite(amounts?.recordedLaborHours)&&
  amounts.recordedLaborHours>amounts.estimatedLaborHours;
 const finding=validFinding?{
  detectorId:'job.labor_hours_variance_review',findingId:found.id,
  jobId,estimatedLaborHours:amounts.estimatedLaborHours,
  recordedLaborHours:amounts.recordedLaborHours,
  differenceHours:amounts.recordedLaborHours-amounts.estimatedLaborHours,
  confidence:'manually_entered_labor',sourceBinding,
  timesheetVerified:false,payrollVerified:false,profitVerified:false,
  proposedAction:null,executionAuthority:false
 }:null;
 const replayChanged=previous?.sourceEventId===event.id&&
  previous.sourceBinding!==sourceBinding;
 const unchanged=previous?.sourceBinding===sourceBinding;
 return freeze({kind:LABOR_PROJECTION_KIND,schemaVersion:1,
  businessId:scope.businessId,scopeBinding,jobId,
  sourceEventId:event.id,correlationId:event.correlationId,
  sourceBinding,sources,
  status:replayChanged?'replayed_event_against_changed_source':
   unchanged?'unchanged':finding?'candidate_finding':'no_current_recorded_overrun',
  finding:replayChanged?null:finding,
  invalidatedPrevious:previous!==null&&!unchanged,
  derivedFrom:'existing_job_labor_detector',
  evidenceMode:'device_local_only',requiresFreshEvent:!!replayChanged,
  modelCalls:0,readbackVerified:false,executionAuthority:false
 });
}
