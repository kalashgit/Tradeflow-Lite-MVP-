/* TF-RM-03 / v1: read-only, authenticated job-bound crew ⇄ office projection.
 * Adapts the existing tenant record and command receipts. No new store, sync engine,
 * message transport, action permission or autonomous business write.
 */
import {authorizeBusiness,authorizedTenantReadQuery,AuthorizationError} from './tenant-security.js';
import {recordIdentity} from '../public/record-model.js';
import {writeTenantRecord} from './tenant-record-store.js';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const copy=x=>JSON.parse(JSON.stringify(x));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const validEvent=e=>e&&e.schemaVersion===1&&id(e.eventId)&&id(e.businessId)&&id(e.actorId)&&e.direction==='role_to_core'&&e.kind==='job_blocker_reported'&&e.subject?.type==='jobs'&&id(e.subject.id)&&Number.isSafeInteger(e.subject.revision)&&e.subject.revision>=1&&stamp(e.eventAt)&&typeof e.note==='string'&&e.note.trim().length>=1&&e.note.length<=500&&id(e.idempotencyKey);
function readback(job,e){
 const updates=Array.isArray(job?.fieldUpdates)?job.fieldUpdates:[];
 const matches=updates.filter(u=>u?.eventId===e.eventId);
 return matches.length===1&&matches[0].actorId===e.actorId&&matches[0].idempotencyKey===e.idempotencyKey&&matches[0].note===e.note&&matches[0].kind===e.kind&&
  matches[0].eventAt===e.eventAt;
}
export function createLocalCrewReport({businessId,actorId,jobId,baseRevision,note,eventId,idempotencyKey,at}={}){
 const e={schemaVersion:1,eventId,businessId,actorId,direction:'role_to_core',kind:'job_blocker_reported',subject:{type:'jobs',id:jobId,revision:baseRevision},note,eventAt:at,idempotencyKey};
 if(!validEvent(e))throw Error('Invalid crew report fields or source revision');
 return freeze({...e,deliveryState:'local_draft',serverRevision:null,readbackVerified:false,acknowledged:false,actionReceiptRef:null});
}
export async function projectRoleExchange({db,principal,businessId,jobId,event,assignmentCheck,readReceipt}={}){
 if(!db||!principal||!id(jobId)||!id(businessId)||typeof assignmentCheck!=='function')throw new AuthorizationError('Verified job and assignment service required',403);
 // This must happen before accessing a business record; body-supplied roles do not authorize.
 const auth=await authorizeBusiness({db,principal,businessId,permission:'records:read'});
 const query=authorizedTenantReadQuery({authorization:auth,table:'jobs',recordId:jobId});
 const row=await db.prepare(query.sql).bind(...query.params).first();
 if(!row||row.deleted_at||!Number.isSafeInteger(row.revision)||row.revision<1)throw new AuthorizationError('Authorized current job unavailable',404);
 let job;try{job=JSON.parse(row.payload)}catch{throw new AuthorizationError('Invalid current job record',503)}
 recordIdentity({businessId,type:'jobs',id:jobId,record:job});
 if(!event||!validEvent(event)||event.businessId!==businessId||event.subject.id!==jobId)throw new AuthorizationError('Report scope or source invalid',403);
 // Independent server-owned assignment verifier. The job's crew name/display field
 // and client event.actorId are NOT proof of a crew user's identity.
 const assignment=await assignmentCheck({authorization:auth,jobId,job,actorId:event.actorId});
 if(assignment!==true)throw new AuthorizationError('Crew assignment or office job access not verified',403);
 const isCrew=event.actorId===auth.subject;
 if(isCrew&&auth.role!=='member'&&auth.role!=='owner'&&auth.role!=='admin')throw new AuthorizationError('Crew report cannot be read by this role',403);
 if(!isCrew&&!['owner','admin','member'].includes(auth.role))throw new AuthorizationError('Office access unavailable',403);
 const persisted=readback(job,event);
 const fresh=persisted&&row.revision>=event.subject.revision;
 // Owner-entered job data cannot prove remote delivery unless read from the
 // authenticated server query above and the exact event tuple exists in its payload.
 const deliveryState=fresh?'readback_verified':event.deliveryState==='local_draft'?'local_draft':'unverified';
 let receipt=null;
 if(fresh&&event.actionReceiptRef&&typeof readReceipt==='function'){
  const candidate=await readReceipt({authorization:auth,jobId,reference:event.actionReceiptRef});
  if(candidate?.verified===true&&candidate.jobId===jobId&&candidate.businessId===businessId&&candidate.eventId===event.eventId)receipt={ref:event.actionReceiptRef,status:'verified_internal_action'};
 }
 return freeze({schemaVersion:1,businessId,jobId,actorId:auth.subject,role:auth.role,direction:isCrew?'role_to_core':'core_to_role',eventId:event.eventId,
  source:{type:'jobs',id:jobId,requestedRevision:event.subject.revision,observedRevision:row.revision},
  note:copy(event.note),deliveryState,acknowledgment:'unverified',action:receipt||{status:'not_verified'},sourceVerified:fresh,
  // No push/email/provider/deliberative call; read-only projection.
  actorAttributionVerified:false,executionAuthority:false});
}

/* TF-RM-03 / v1.1 — Internal, NOT ROUTED authenticated submission adapter.
 *
 * R01-02 job-scoped user grants and an atomic assignment predicate are not
 * approved or present in the live schema. Thus verifyAssignment MUST be a
 * server-owned authenticated assignment service; this is a synthetic contract,
 * not a field API or claim of commit-time staff assignment security.
 * Never pass client-provided role, crewId or a callback from an HTTP payload.
 */
const attestedAssignment=(proof,auth,jobId,revision)=>proof?.verified===true&&
 proof.source==='server_verified_job_assignment'&&
 proof.issuer===auth.issuer&&proof.subject===auth.subject&&
 proof.businessId===auth.businessId&&proof.jobId===jobId&&proof.jobRevision===revision;
const boundedUpdates=x=>Array.isArray(x)&&x.length<=40&&
 x.every(v=>v&&typeof v==='object'&&!Array.isArray(v));
const submissionResult=(e,status,revision,{attribution=false,readback=false}={})=>freeze({
 schemaVersion:1,businessId:e.businessId,jobId:e.subject.id,eventId:e.eventId,
 status,deliveryState:status,sourceRevision:e.subject.revision,
 observedServerRevision:revision,readbackVerified:readback,
 writeAttributionVerified:attribution,
 assignmentCheckedBeforeWrite:true,assignmentAtCommitVerified:false,
 acknowledged:false,actionReceiptRef:null,executionAuthority:false
});
export async function submitAssignedCrewBlocker({db,principal,businessId,jobId,event,verifyAssignment}={}){
 if(!db||typeof db.prepare!=='function'||!id(businessId)||!id(jobId)||
    typeof verifyAssignment!=='function')
  throw new AuthorizationError('Verified assignment service and job scope required',403);
 if(!validEvent(event)||event.businessId!==businessId||event.subject.id!==jobId||
    !['local_draft','queued'].includes(event.deliveryState))
  throw new AuthorizationError('Invalid or untrusted crew report',400);
 const auth=await authorizeBusiness({db,principal,businessId,permission:'records:write'});
 if(auth.role!=='member'||event.actorId!==auth.subject)
  throw new AuthorizationError('Authenticated crew actor or membership mismatch',403);
 const readQuery=authorizedTenantReadQuery({authorization:auth,table:'jobs',recordId:jobId});
 const row=await db.prepare(readQuery.sql).bind(...readQuery.params).first();
 if(!row||row.deleted_at||!Number.isSafeInteger(row.revision)||row.revision<1)
  throw new AuthorizationError('Current authorized job unavailable',404);
 let job;try{job=JSON.parse(row.payload)}catch{
  throw new AuthorizationError('Invalid server job payload',503);
 }
 recordIdentity({businessId,type:'jobs',id:jobId,record:job});
 if(!boundedUpdates(job.fieldUpdates||[]))
  throw new AuthorizationError('Unbounded or malformed job field history',409);
 const check=()=>verifyAssignment({
  authorization:auth,jobId,revision:row.revision,job:freeze(copy(job))
 });
 const proof=await check();
 if(!attestedAssignment(proof,auth,jobId,row.revision))
  throw new AuthorizationError('Server-owned job assignment not verified',403);
 // Replays and idempotency collisions are NOT authenticated write receipts.
 const duplicates=job.fieldUpdates.filter(u=>u?.eventId===event.eventId||
  u?.idempotencyKey===event.idempotencyKey);
 if(duplicates.length)return submissionResult(event,'duplicate_unverified',row.revision);
 if(row.revision!==event.subject.revision)
  throw new AuthorizationError('Stale job source revision; do not replay blindly',409);
 if(job.fieldUpdates?.length>=40)
  throw new AuthorizationError('Job field update history limit requires review',409);
 // Recheck before CAS; real commit-time assignment enforcement still requires
 // an approved server-owned actor→job predicate in the same SQL statement.
 const prewrite=await check();
 if(!attestedAssignment(prewrite,auth,jobId,row.revision))
  throw new AuthorizationError('Job assignment changed before submission',403);
 const update={
  schemaVersion:1,eventId:event.eventId,idempotencyKey:event.idempotencyKey,
  kind:event.kind,note:event.note,eventAt:event.eventAt,
  actorId:auth.subject,actorIssuer:auth.issuer
 };
 const next={...job,fieldUpdates:[...(job.fieldUpdates||[]),update]};
 const saved=await writeTenantRecord(db,auth,'jobs',jobId,{
  revision:row.revision,record:next,
  expectedActor:{issuer:auth.issuer,subject:auth.subject}
 });
 // A successful CAS response is NOT an independently confirmed readback.
 // Losing the follow-up read is an uncertain delivery, never a retry signal.
 const uncertain=()=>submissionResult(event,'server_committed_unverified',saved.revision);
 try{
  const auditSql=readQuery.sql.replace(
   'SELECT payload, revision, updated_at, deleted_at FROM tenant_records',
   'SELECT payload, revision, updated_at, deleted_at, updated_by_issuer, updated_by_subject FROM tenant_records');
  const written=await db.prepare(auditSql).bind(...readQuery.params).first();
  if(!written||written.deleted_at||written.revision!==saved.revision||
     written.revision!==row.revision+1||
     written.updated_by_issuer!==auth.issuer||written.updated_by_subject!==auth.subject)
   return uncertain();
  const latest=JSON.parse(written.payload);
  recordIdentity({businessId,type:'jobs',id:jobId,record:latest});
  const records=Array.isArray(latest.fieldUpdates)?latest.fieldUpdates:[];
  const matched=records.filter(u=>u?.eventId===event.eventId||
    u?.idempotencyKey===event.idempotencyKey);
  if(matched.length!==1||JSON.stringify(matched[0])!==JSON.stringify(update))
   return uncertain();
  return submissionResult(event,'readback_verified',written.revision,{
   attribution:true,readback:true
  });
 }catch{return uncertain()}
}
