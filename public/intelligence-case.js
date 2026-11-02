/* HYB-02: bounded, derived Master Intelligence case. Business records and
 * command receipts remain authoritative; a case cannot execute any operation.
 */
import {canonical,copy,freeze} from './intelligence-evidence.js';
export const CASE_KIND='tradeflow.intelligence.case.v1';
export const CASE_TTL_MS=10*60*1000;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function signature(scope){
 if(!scope||!id(scope.businessId)||!['local','cloud'].includes(scope.mode))throw Error('Explicit Intelligence case scope required');
 if(scope.mode==='local'&&scope.actor!=='local-owner')throw Error('Local owner scope required');
 if(scope.mode==='cloud'&&(!['owner','admin','member','viewer'].includes(scope.role)||!scope.identity?.issuer||!scope.identity?.subject))throw Error('Verified cloud identity and role required');
 return canonical({mode:scope.mode,businessId:scope.businessId,actor:scope.mode==='local'?scope.actor:null,
  role:scope.mode==='cloud'?scope.role:null,identity:scope.mode==='cloud'?scope.identity:null,
  jobId:scope.jobId||null,today:scope.today||null});
}
function sourcesOf(decision,mode){
 const rows=decision?.workflow?.records;
 if(!Array.isArray(rows)||rows.length>200)throw Error('Bounded source records required');
 const seen=new Set(),sources=[];
 for(const r of rows){
  if(!id(r?.type)||!id(r?.id))throw Error('Invalid Intelligence case source reference');
  const key=r.type+':'+r.id;if(seen.has(key))throw Error('Duplicate Intelligence case source');seen.add(key);
  if(mode==='local'&&(r.revision!==null||r.provenance!=='local_device_record'||!hash(r.contentHash)))throw Error('Local source fingerprint unavailable');
  if(mode==='cloud'&&(!Number.isSafeInteger(r.revision)||r.revision<1||r.provenance!=='tenant_record'))throw Error('Authenticated source revision unavailable');
  sources.push({type:r.type,id:r.id,revision:r.revision,contentHash:mode==='local'?r.contentHash:null,provenance:r.provenance});
 }
 return sources.sort((a,b)=>(a.type+':'+a.id).localeCompare(b.type+':'+b.id));
}
export function createIntelligenceCase({decision,scope,threadId=null,asOf=new Date().toISOString()}={}){
 if(decision?.kind!=='tradeflow.decision.v1'||!hash(decision.binding)||!['ready_for_review','evidence_needs_review'].includes(decision.status))throw Error('Validated reviewed decision binding required');
 if(threadId!==null&&(!id(threadId)||threadId.length>100))throw Error('Invalid conversation thread');
 const sig=signature(scope),time=Date.parse(asOf);
 if(!Number.isFinite(time)||!/^\d{4}-\d{2}-\d{2}T/.test(asOf))throw Error('Case observation time invalid');
 const mode=scope.mode,expectedMode=mode==='local'?'device_local_unverified_identity':'authenticated_cloud_read';
 if(decision.evidenceMode!==expectedMode)throw Error('Evidence mode does not match Intelligence case scope');
 const sources=sourcesOf(decision,mode),keys=new Set(sources.map(s=>s.type+':'+s.id));
 if(!Array.isArray(decision.observations)||decision.observations.length>200||!Array.isArray(decision.proposals)||decision.proposals.length>20||!Array.isArray(decision.unknowns)||decision.unknowns.length>100)throw Error('Case investigation exceeds safe bounds');
 const findings=[];
 for(const o of decision.observations){
  if(typeof o?.id!=='string'||!o.id||typeof o.detectorId!=='string'||!Array.isArray(o.refs)||o.refs.some(r=>!keys.has(r?.type+':'+r?.id)))throw Error('Case findings lack permitted source references');
  findings.push({id:o.id,detectorId:o.detectorId,sourceRefs:o.refs.map(r=>({type:r.type,id:r.id})),
   priorityBand:typeof o.priority?.band==='string'?o.priority.band:'review'});
 }
 const proposals=decision.proposals.map(p=>{
  if(typeof p?.commandId!=='string'||!/^[a-z][a-z0-9_.-]{0,99}$/.test(p.commandId)||typeof p.id!=='string'||!p.id||p.requiresApproval!==true||p.externalEffects!==false)throw Error('Only existing explicitly reviewable internal proposals are permitted');
  return {proposalId:p.id,commandId:p.commandId,status:'proposed_not_authorized',receiptRef:null};
 });
 const unknowns=[...new Set(decision.unknowns.filter(u=>typeof u?.code==='string'&&u.code.length<=100).map(u=>u.code))];
 const status=decision.status==='evidence_needs_review'?'needs_evidence':proposals.length?'owner_review_available':findings.length?'observations_only':'no_eligible_exception';
 return freeze({kind:CASE_KIND,version:1,id:'case_'+decision.binding.slice(0,28)+(threadId?'_'+threadId.slice(0,12):''),
  sourceBinding:decision.binding,scopeSignature:sig,businessId:scope.businessId,actorId:mode==='local'?scope.actor:scope.identity.subject,
  sourceMode:mode==='local'?'device_local_unverified':'authenticated_tenant_snapshot',jobId:scope.jobId||null,threadId,
  openedAt:new Date(time).toISOString(),expiresAt:new Date(time+CASE_TTL_MS).toISOString(),trigger:'owner_requested_review',
  status,sources,findings,unknowns,proposals,acknowledgment:'not_applicable',outcome:'not_verified',executionAuthority:false,
  persistence:'in_memory_derived',modelCalls:0});
}
export function inspectIntelligenceCase({caseFile,decision,scope,threadId=null,asOf=new Date().toISOString(),accessGranted=false}={}){
 // This is a freshness guard, not a business authorization service.
 if(caseFile?.kind!==CASE_KIND||caseFile.executionAuthority!==false)return {status:'invalid_case'};
 if(accessGranted!==true)return {status:'access_unverified'};
 let sig;try{sig=signature(scope)}catch{return {status:'scope_changed'}}
 if(caseFile.scopeSignature!==sig)return {status:'scope_changed'};
 if(caseFile.threadId!==threadId)return {status:'thread_changed'};
 const now=Date.parse(asOf),opened=Date.parse(caseFile.openedAt),expires=Date.parse(caseFile.expiresAt);
 if(!Number.isFinite(now)||!Number.isFinite(opened)||!Number.isFinite(expires)||expires-opened!==CASE_TTL_MS||now<opened)return {status:'invalid_time'};
 if(now>=expires)return {status:'expired'};
 if(decision?.kind!=='tradeflow.decision.v1'||!hash(decision.binding)||caseFile.sourceBinding!==decision.binding)return {status:'stale_evidence'};
 let current;try{current=sourcesOf(decision,scope.mode)}catch{return {status:'stale_evidence'}}
 if(canonical(current)!==canonical(caseFile.sources))return {status:'stale_evidence'};
 return {status:'current',executionAuthority:false};
}
