/* TF-RM-03-G03 — internal read-only office view of a committed crew blocker.
 * Uses existing job_access_grants and tenant_records. No route, new store,
 * command execution, receipt fabrication or field-role expansion.
 */
import {authorizeBusiness,AuthorizationError,requireBusinessId} from './tenant-security.js';
import {recordIdentity} from '../public/record-model.js';

const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const copy=x=>JSON.parse(JSON.stringify(x));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};

// Job payload and office access are read under one server-owned SQL predicate.
// The reporter's crew assignment is NOT an office access grant.
export const OFFICE_BLOCKER_READ_SQL=String.raw`SELECT t.payload,t.revision,t.deleted_at
FROM tenant_records t
JOIN business_memberships m ON m.business_id=t.business_id
 AND m.issuer=? AND m.subject=? AND m.status='active'
LEFT JOIN job_access_grants g ON g.business_id=t.business_id
 AND g.job_id=t.id AND g.issuer=m.issuer AND g.subject=m.subject
 AND g.scope='office' AND g.status='active'
WHERE t.business_id=? AND t.record_type='jobs' AND t.id=?
 AND t.deleted_at IS NULL
 AND (m.role IN ('owner','admin')
      OR (m.role='member' AND g.grant_revision IS NOT NULL))
LIMIT 1`;

export async function readOfficeCrewBlocker({db,principal,businessId,jobId,eventId}={}){
 if(!db||typeof db.prepare!=='function'||!validId(jobId)||!validId(eventId))
  throw new AuthorizationError('Existing job and blocker event required',400);
 requireBusinessId(businessId);
 const auth=await authorizeBusiness({db,principal,businessId,permission:'records:read'});
 if(!['owner','admin','member'].includes(auth.role))
  throw new AuthorizationError('Office job access required',403);
 let row;
 try{
  row=await db.prepare(OFFICE_BLOCKER_READ_SQL)
   .bind(auth.issuer,auth.subject,auth.businessId,jobId).first();
 }catch{
  // Missing job-grant schema and SQL failures are not reasons to read broadly.
  throw new AuthorizationError('Office job authorization unavailable',503);
 }
 if(!row||row.deleted_at||!Number.isSafeInteger(row.revision)||row.revision<1)
  throw new AuthorizationError('Office job access or current job unavailable',403);
 let job;
 try{job=JSON.parse(row.payload);recordIdentity({
  businessId:auth.businessId,type:'jobs',id:jobId,record:job
 })}catch{
  throw new AuthorizationError('Authenticated job payload invalid',503);
 }
 if(!Array.isArray(job.fieldUpdates)||job.fieldUpdates.length>40)
  throw new AuthorizationError('Job report history unavailable',409);
 // A reused event ID or idempotency key means the source is ambiguous.
 const candidates=job.fieldUpdates.filter(x=>x?.eventId===eventId);
 if(candidates.length!==1)throw new AuthorizationError('Unique crew blocker event unavailable',404);
 const report=candidates[0];
 if(!report||report.schemaVersion!==1||report.kind!=='job_blocker_reported'||
    !validId(report.eventId)||!validId(report.idempotencyKey)||
    !validId(report.actorId)||typeof report.actorIssuer!=='string'||
    !report.actorIssuer.trim()||typeof report.note!=='string'||
    !report.note.trim()||report.note.length>500||
    typeof report.eventAt!=='string'||!Number.isFinite(Date.parse(report.eventAt))||
    job.fieldUpdates.some(x=>x!==report&&x?.idempotencyKey===report.idempotencyKey))
  throw new AuthorizationError('Crew report evidence invalid or duplicated',409);
 return freeze({
  schemaVersion:1,businessId:auth.businessId,jobId,eventId:report.eventId,
  correlationId:report.eventId,operationId:report.idempotencyKey,
  observedJobRevision:row.revision,viewer:copy({issuer:auth.issuer,subject:auth.subject}),
  reportedBy:copy({issuer:report.actorIssuer,subject:report.actorId}),
  note:report.note,eventAt:report.eventAt,kind:report.kind,
  deliveryState:'server_readback_observed',sourceVerified:true,
  // A job field can be owner-edited. A present event is not an independent
  // event-author signature or an actual report-to-office acknowledgment.
  actorAttributionVerified:false,officeAcknowledged:false,crewAcknowledged:false,
  actionReceiptRef:null,executionAuthority:false
 });
}
