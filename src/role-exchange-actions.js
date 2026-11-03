/* TF-RM-03-F — internal job-bound office response and crew acknowledgment.
 * Append typed events to the authoritative job through writeTenantRecord CAS.
 * No HTTP route, transport, notification, automatic AI action or new store.
 */
import {authorizeBusiness,AuthorizationError} from './tenant-security.js';
import {readJobAccess} from './job-access.js';
import {recordIdentity} from '../public/record-model.js';
import {writeTenantRecord} from './tenant-record-store.js';

const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const time=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const validBase=(x)=>id(x.eventId)&&id(x.idempotencyKey)&&
 Number.isSafeInteger(x.expectedJobRevision)&&x.expectedJobRevision>=1;
const validBlocker=e=>e&&e.schemaVersion===1&&e.kind==='job_blocker_reported'&&
 id(e.eventId)&&id(e.idempotencyKey)&&id(e.actorId)&&
 typeof e.actorIssuer==='string'&&e.actorIssuer.length>0&&time(e.eventAt)&&
 typeof e.note==='string'&&e.note.trim().length>0&&e.note.length<=500;
const validResponse=e=>e&&e.schemaVersion===1&&e.kind==='job_blocker_office_response'&&
 id(e.eventId)&&id(e.idempotencyKey)&&id(e.reportEventId)&&
 id(e.actorId)&&typeof e.actorIssuer==='string'&&e.actorIssuer.length>0&&
 time(e.eventAt)&&typeof e.text==='string'&&e.text.trim().length>0&&e.text.length<=500;

// Membership, scope grant and nondeleted job guard the payload together.
// A separate scoped proof followed by a generic record read could leak a
// revoked job to an in-flight request; this read cannot.
export const ROLE_EVENT_SOURCE_SQL=String.raw`SELECT
 t.payload AS job_payload,t.revision AS job_revision,
 t.updated_by_issuer,t.updated_by_subject,
 m.role AS reader_role,g.grant_revision
FROM tenant_records t
JOIN business_memberships m ON m.business_id=t.business_id
 AND m.issuer=? AND m.subject=? AND m.status='active'
LEFT JOIN job_access_grants g ON g.business_id=t.business_id
 AND g.job_id=t.id AND g.issuer=m.issuer AND g.subject=m.subject
 AND g.scope=? AND g.status='active'
WHERE t.business_id=? AND t.record_type='jobs' AND t.id=?
 AND t.deleted_at IS NULL
 AND (m.role IN ('owner','admin')
      OR (m.role='member' AND g.grant_revision IS NOT NULL))
LIMIT 1`;

async function readCurrent({db,auth,jobId,scope}){
 let row;
 try{
  row=await db.prepare(ROLE_EVENT_SOURCE_SQL)
   .bind(auth.issuer,auth.subject,scope,auth.businessId,jobId).first();
 }catch{
  throw new AuthorizationError('Scoped role exchange store unavailable',503);
 }
 if(!row||!Number.isSafeInteger(row.job_revision)||row.job_revision<1)
  throw new AuthorizationError('Current assigned job unavailable',403);
 const wide=row.reader_role==='owner'||row.reader_role==='admin';
 if(!wide&&(row.reader_role!=='member'||!Number.isSafeInteger(row.grant_revision)||row.grant_revision<1))
  throw new AuthorizationError('Active scoped grant required',403);
 let job;
 try{
  job=JSON.parse(row.job_payload);
  recordIdentity({businessId:auth.businessId,type:'jobs',id:jobId,record:job});
 }catch{throw new AuthorizationError('Invalid scoped job evidence',503)}
 const updates=job.fieldUpdates===undefined?[]:job.fieldUpdates;
 if(!Array.isArray(updates)||updates.length>40||
    updates.some(u=>!u||typeof u!=='object'||Array.isArray(u)))
  throw new AuthorizationError('Job event history requires review',409);
 return {row,job,updates};
}
function one(updates,eventId,valid){
 const matching=updates.filter(e=>e?.eventId===eventId);
 if(matching.length!==1||!valid(matching[0]))
  throw new AuthorizationError('Referenced job event unavailable or ambiguous',409);
 const e=matching[0];
 if(updates.some(x=>x!==e&&x?.idempotencyKey===e.idempotencyKey))
  throw new AuthorizationError('Referenced event idempotency collision',409);
 return e;
}
function replyStatus(kind,auth,jobId,eventId,status,sourceRevision,observedRevision,receipt=null){
 return freeze({
  kind:'tradeflow.role_exchange.result.v1',eventKind:kind,businessId:auth.businessId,
  jobId,eventId,status,sourceRevision,observedRevision,
  recordWriteReceipt:receipt,
  serverCommitted:status==='readback_verified'||status==='server_committed_unverified',
  readbackVerified:status==='readback_verified',
  acknowledged:kind==='job_blocker_response_acknowledged'&&status==='readback_verified',
  transported:false,notified:false,externalEffects:false,executionAuthority:false
 });
}
async function append({db,principal,businessId,jobId,scope,kind,
 eventId,idempotencyKey,expectedJobRevision,reportEventId,responseEventId,text}){
 if(!db?.prepare||!id(jobId)||!validBase({eventId,idempotencyKey,expectedJobRevision})||
  !id(reportEventId)||scope==='office'&&(typeof text!=='string'||!text.trim()||text.length>500)||
  scope==='crew'&&!id(responseEventId))
  throw new AuthorizationError('Valid scoped event, revision and linkage required',400);
 const auth=await authorizeBusiness({db,principal,businessId,permission:'records:write'});
 if(scope==='crew'&&auth.role!=='member')
  throw new AuthorizationError('Assigned technician membership required',403);
 const access=await readJobAccess({db,principal,businessId,jobId,scope});
 if(scope==='crew'&&access.accessClass!=='assigned_job')
  throw new AuthorizationError('Explicit crew assignment required',403);
 const {row,job,updates}=await readCurrent({db,auth,jobId,scope});
 const duplicate=updates.filter(u=>u?.eventId===eventId||u?.idempotencyKey===idempotencyKey);
 if(duplicate.length)return replyStatus(kind,auth,jobId,eventId,'duplicate_unverified',
  expectedJobRevision,row.job_revision);
 if(row.job_revision!==expectedJobRevision||access.jobRevision!==expectedJobRevision||
    (access.accessClass==='assigned_job'&&access.grantRevision!==row.grant_revision))
  throw new AuthorizationError('Job or scoped grant changed; review again',409);
 if(updates.length>=40)throw new AuthorizationError('Job event history is full',409);
 one(updates,reportEventId,validBlocker);
 if(kind==='job_blocker_office_response'){
  if(updates.some(e=>e?.kind==='job_blocker_office_response'&&e.reportEventId===reportEventId))
   return replyStatus(kind,auth,jobId,eventId,'response_exists_unverified',
    expectedJobRevision,row.job_revision);
 }else{
  const response=one(updates,responseEventId,validResponse);
  if(response.reportEventId!==reportEventId)
   throw new AuthorizationError('Response does not match the referenced blocker',409);
  if(updates.some(e=>e?.kind==='job_blocker_response_acknowledged'&&e.responseEventId===responseEventId))
   return replyStatus(kind,auth,jobId,eventId,'already_acknowledged_unverified',
    expectedJobRevision,row.job_revision);
 }
 const event={
  schemaVersion:1,kind,eventId,idempotencyKey,
  actorId:auth.subject,actorIssuer:auth.issuer,
  eventAt:new Date().toISOString(),reportEventId,
  ...(scope==='office'?{text}:{responseEventId,status:'received'})
 };
 // Same authoritative record; source revision changes atomically. The
 // scoped proof can be used only by this server process and its active grant
 // is rechecked inside writeTenantRecord's SQL CAS.
 const saved=await writeTenantRecord(db,auth,'jobs',jobId,{
  revision:expectedJobRevision,record:{...job,fieldUpdates:[...updates,event]},
  expectedActor:{issuer:auth.issuer,subject:auth.subject}
 },access.accessClass==='assigned_job'?{jobAccessProof:access}:{});
 const uncertain=()=>replyStatus(kind,auth,jobId,eventId,
  'server_committed_unverified',expectedJobRevision,saved.revision);
 try{
  const observed=await readCurrent({db,auth,jobId,scope});
  if(observed.row.job_revision!==saved.revision||
     saved.revision!==expectedJobRevision+1||
     observed.row.updated_by_issuer!==auth.issuer||
     observed.row.updated_by_subject!==auth.subject)
   return uncertain();
  const rows=observed.updates.filter(u=>u?.eventId===eventId||u?.idempotencyKey===idempotencyKey);
  if(rows.length!==1||JSON.stringify(rows[0])!==JSON.stringify(event))
   return uncertain();
  return replyStatus(kind,auth,jobId,eventId,'readback_verified',
   expectedJobRevision,saved.revision,{
    kind:'tenant_job_write_readback.v1',businessId:auth.businessId,
    jobId,eventId,revision:saved.revision,
    actor:{issuer:auth.issuer,subject:auth.subject},
    status:'verified_internal_record_write'
   });
 }catch{return uncertain()}
}

export function respondToCrewBlocker(options={}){
 return append({...options,scope:'office',kind:'job_blocker_office_response'});
}
export function acknowledgeOfficeBlockerResponse(options={}){
 return append({...options,scope:'crew',kind:'job_blocker_response_acknowledged'});
}
