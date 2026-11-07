import {mayWriteRecord,MANAGED_RECORD_TYPES} from '../public/record-permissions.js';
import {linksForRecord,FINANCIAL_RECORD_TYPES} from '../public/record-model.js';
import {AuthorizationError,tenantRecordQuery} from './tenant-security.js';
import {assertTrustedJobGrant} from './job-access.js';

export const RECORD_WRITE_SQL =`INSERT INTO tenant_records
 (business_id,record_type,id,revision,payload,updated_by_issuer,updated_by_subject)
 SELECT ?,?,?,?,?,?,? WHERE (?=0 OR EXISTS (SELECT 1 FROM tenant_records WHERE business_id=? AND record_type=? AND id=?))
 AND EXISTS (SELECT 1 FROM business_memberships WHERE business_id=? AND issuer=? AND subject=? AND status='active' AND role IN ('owner','admin','member') /* financial-guard */)
 /* relationship-guards */
 ON CONFLICT(business_id,record_type,id) DO UPDATE SET
 payload=excluded.payload,
 revision=tenant_records.revision+1,
 updated_at=datetime('now'),
 updated_by_issuer=excluded.updated_by_issuer,
 updated_by_subject=excluded.updated_by_subject
 WHERE tenant_records.revision=? AND tenant_records.deleted_at IS NULL
 RETURNING revision,updated_at`;

// Evaluated inside the same statement as membership, revision and audit. A
// member may edit an ordinary job but cannot assign/reassign its crew.
export const JOB_ASSIGNMENT_GUARD_SQL =`AND (role IN ('owner','admin') OR
 COALESCE(json_extract(?, '$.crewId'),'')=COALESCE((SELECT json_extract(payload,'$.crewId')
 FROM tenant_records WHERE business_id=? AND record_type='jobs' AND id=?),''))`;


// Evaluated by SQLite in the same statement as the member role and job CAS.
// Only an in-process verified job-scope grant may supply these bound predicates.
export const JOB_GRANT_CAS_SQL=`AND EXISTS (
 SELECT 1 FROM job_access_grants g
 JOIN business_memberships m ON m.business_id=g.business_id
  AND m.issuer=g.issuer AND m.subject=g.subject
 JOIN tenant_records j ON j.business_id=g.business_id
  AND j.record_type='jobs' AND j.id=g.job_id
 WHERE g.business_id=? AND g.job_id=? AND g.issuer=? AND g.subject=?
  AND g.scope=? AND g.status='active' AND g.grant_revision=?
  AND m.status='active' AND m.role='member'
  AND j.deleted_at IS NULL AND j.revision=?
)`;

export function validateRecordWrite(body) {
 if (!body || typeof body!=='object' || Array.isArray(body) ||
     !Number.isSafeInteger(body.revision) || body.revision<0 || body.revision>2147483646 ||
     !body.record || typeof body.record!=='object' || Array.isArray(body.record))
   throw new AuthorizationError('Record and nonnegative expected revision required',400);
 const payload=JSON.stringify(body.record);
 if (!payload || new TextEncoder().encode(payload).byteLength>30000)
   throw new AuthorizationError('Record too large',413);
 return {expectedRevision:body.revision,payload};
}

export async function writeTenantRecord(db,authorization,recordType,recordId,body,{jobAccessProof}={}) {
 const {params}=tenantRecordQuery({authorization,table:recordType,recordId});
 if (!authorization?.subject || !authorization?.issuer || !['owner','admin','member'].includes(authorization.role))
   throw new AuthorizationError('Authenticated membership required',403);
 const financial=FINANCIAL_RECORD_TYPES.includes(recordType);
 if(!mayWriteRecord(authorization.role,recordType))throw new AuthorizationError(financial?'Financial record permission required':'Crew administration permission required',403);
 if(body?.expectedActor!==undefined&&(!body.expectedActor||body.expectedActor.issuer!==authorization.issuer||body.expectedActor.subject!==authorization.subject))
  throw new AuthorizationError('Request actor changed; review again',403);
 const {expectedRevision,payload}=validateRecordWrite(body);
 const scopedJob=jobAccessProof!==undefined;
 const verifiedGrant=scopedJob?assertTrustedJobGrant(jobAccessProof,authorization,recordId,jobAccessProof.scope):null;
 if(scopedJob&&(recordType!=='jobs'||expectedRevision!==verifiedGrant.jobRevision))
  throw new AuthorizationError('Scoped job revision changed; review before saving',409);
 if(body.record.id!==undefined&&body.record.id!==recordId||body.record.businessId!==undefined&&body.record.businessId!==authorization.businessId)
  throw new AuthorizationError('Record identity does not match request',400);
 const relationshipArgs=[],guards=[],customers=new Set(body.record.customerId?[body.record.customerId]:[]);
 for(const [field,type]of linksForRecord(body.record)){
  if(!body.record[field])continue;
  const query=tenantRecordQuery({authorization,table:type,recordId:body.record[field]});
  if(type===recordType&&body.record[field]===recordId)throw new AuthorizationError('Self-reference is invalid',400);
  const linked=await db.prepare(query.sql).bind(...query.params).first();
  if(!linked||linked.deleted_at)throw new AuthorizationError('Linked record is unavailable in this business',400);
  let record;try{record=JSON.parse(linked.payload)}catch{throw new AuthorizationError('Linked record is invalid',503)}
  if(record.customerId)customers.add(record.customerId);
  if(!Number.isSafeInteger(linked.revision)||linked.revision<1)throw new AuthorizationError('Linked revision invalid',503);
  guards.push('AND EXISTS (SELECT 1 FROM tenant_records WHERE business_id=? AND record_type=? AND id=? AND revision=? AND deleted_at IS NULL)');
  relationshipArgs.push(...query.params,linked.revision);
 }
 if(customers.size>1)throw new AuthorizationError('Linked records belong to different customers',400);
 const managed=financial||MANAGED_RECORD_TYPES.includes(recordType);
 const permissionGuard=managed?"AND role IN ('owner','admin')":recordType==='jobs'?
  JOB_ASSIGNMENT_GUARD_SQL+(verifiedGrant?" AND role='member'":''):'';
 const permissionArgs=recordType==='jobs'?[payload,authorization.businessId,recordId]:[];
 const grantParams=verifiedGrant?[
  verifiedGrant.businessId,verifiedGrant.jobId,
  verifiedGrant.actor.issuer,verifiedGrant.actor.subject,
  verifiedGrant.scope,verifiedGrant.grantRevision,verifiedGrant.jobRevision
 ]:[];
 const sql=RECORD_WRITE_SQL.replace('/* relationship-guards */',
  [verifiedGrant?JOB_GRANT_CAS_SQL:'',...guards].filter(Boolean).join('\n'))
  .replace('/* financial-guard */',permissionGuard);


 const row=await db.prepare(sql).bind(...params,expectedRevision+1,payload,
   authorization.issuer,authorization.subject,expectedRevision,...params,authorization.businessId,authorization.issuer,authorization.subject,...permissionArgs,...grantParams,...relationshipArgs,expectedRevision).first();
 if (!row)throw new AuthorizationError('Revision or membership conflict; reload before saving',409);
 return {revision:row.revision,updatedAt:row.updated_at};
}
