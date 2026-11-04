/* TF-KNOW-P01E — one assigned job's cloud intelligence evidence.
 * A current member role + explicit crew/office grant is enforced INSIDE
 * the same D1 SELECT as the job and its directly job-linked task rows.
 * Not a generic tenant reader, job writer, grant creator or API route.
 */
import {authorizeBusiness,AuthorizationError} from './tenant-security.js';
import {readJobAccess} from './job-access.js';
import {recordIdentity} from '../public/record-model.js';
import {projectEvidenceRecord,freeze} from '../public/intelligence-evidence.js';

const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
export const SCOPED_JOB_INTELLIGENCE_SQL=String.raw`SELECT
 r.record_type,r.id,r.revision,r.updated_at,r.payload,
 j.revision AS scoped_job_revision,g.grant_revision AS job_grant_revision
FROM tenant_records j
JOIN business_memberships m ON m.business_id=j.business_id
 AND m.issuer=? AND m.subject=? AND m.status='active' AND m.role='member'
JOIN job_access_grants g ON g.business_id=j.business_id AND g.job_id=j.id
 AND g.issuer=m.issuer AND g.subject=m.subject
 AND g.scope=? AND g.status='active'
JOIN tenant_records r ON r.business_id=j.business_id AND r.deleted_at IS NULL
WHERE j.business_id=? AND j.record_type='jobs' AND j.id=?
 AND j.deleted_at IS NULL
 AND ((r.record_type='jobs' AND r.id=j.id)
  OR (r.record_type='tasks' AND json_extract(r.payload,'$.jobId')=j.id))
ORDER BY r.record_type,r.id LIMIT 201`;

export async function readJobScopedIntelligenceContext({
 db,principal,businessId,jobId,grantScope,now=()=>new Date().toISOString()
}={}){
 if(!db?.prepare||!id(jobId)||!['crew','office'].includes(grantScope))
  throw new AuthorizationError('Assigned job and explicit grant scope required',400);
 const auth=await authorizeBusiness({db,principal,businessId,permission:'records:read'});
 if(auth.role!=='member')throw new AuthorizationError('Assigned member role required',403);
 let rows;
 try{
  const result=await db.prepare(SCOPED_JOB_INTELLIGENCE_SQL)
   .bind(auth.issuer,auth.subject,grantScope,auth.businessId,jobId).all();
  rows=result?.results;
 }catch{throw new AuthorizationError('Job-scoped intelligence store unavailable',503)}
 if(!Array.isArray(rows)||!rows.length)
  throw new AuthorizationError('Active job access unavailable',403);
 if(rows.length>200)throw new AuthorizationError('Job-scoped intelligence exceeds safe bounds',413);
 const jobRevision=rows[0].scoped_job_revision,grantRevision=rows[0].job_grant_revision;
 if(!Number.isSafeInteger(jobRevision)||jobRevision<1||
    !Number.isSafeInteger(grantRevision)||grantRevision<1)
  throw new AuthorizationError('Scoped job grant revision unavailable',503);
 const seen=new Set(),records=[];
 for(const row of rows){
  if(row.scoped_job_revision!==jobRevision||row.job_grant_revision!==grantRevision||
     !['jobs','tasks'].includes(row.record_type)||!id(row.id)||
     !Number.isSafeInteger(row.revision)||row.revision<1||
     typeof row.updated_at!=='string'||typeof row.payload!=='string'||
     new TextEncoder().encode(row.payload).byteLength>30000)
   throw new AuthorizationError('Invalid scoped evidence provenance',503);
  const key=row.record_type+':'+row.id;
  if(seen.has(key))throw new AuthorizationError('Duplicate scoped evidence',503);
  seen.add(key);
  let record;
  try{
   record=JSON.parse(row.payload);
   recordIdentity({businessId:auth.businessId,type:row.record_type,id:row.id,record});
  }catch{throw new AuthorizationError('Invalid scoped record identity',503)}
  if(row.record_type==='tasks'&&record.jobId!==jobId)
   throw new AuthorizationError('Foreign job-linked task withheld',503);
  if(row.record_type==='jobs'&&row.id!==jobId)
   throw new AuthorizationError('Unrelated job withheld',503);
  let projected;
  try{projected=projectEvidenceRecord(row.record_type,record)}
  catch{throw new AuthorizationError('Evidence field exceeds safe bounds',413)}
  records.push({type:row.record_type,id:row.id,revision:row.revision,
   updatedAt:row.updated_at,provenance:'tenant_record',
   contentTrust:'untrusted_record_content',record:projected});
 }
 if(!seen.has('jobs:'+jobId))throw new AuthorizationError('Current job source missing',503);
 // The single SQL read checked both grant and membership. A subsequent
 // grant read guards post-read revocation/revision races before projection.
 // This is still read-only, NOT durable authorization for an action.
 const latest=await readJobAccess({
  db,principal,businessId:auth.businessId,jobId,scope:grantScope
 });
 if(latest.accessClass!=='assigned_job'||latest.jobRevision!==jobRevision||
    latest.grantRevision!==grantRevision)
  throw new AuthorizationError('Scoped access changed during evidence read',403);
 const observedAt=now();
 if(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt)))
  throw new AuthorizationError('Invalid evidence observation time',503);
 return freeze({
  kind:'tradeflow.intelligence.context.v1',businessId:auth.businessId,
  identity:{issuer:auth.issuer,subject:auth.subject},scope:{jobId},
  generatedAt:observedAt,readOnly:true,executionAuthority:false,
  permission:{role:'member',allowedRecordTypes:['jobs','tasks'],
   grantScope,grantRevision},records,
  missingReferences:[],relationshipWarnings:[],
  limitations:[
   'Only the assigned job and directly linked internal tasks are included.',
   'Other company records and private financial records are withheld.',
   'A job grant or role change invalidates this read for future use.',
   'This does not authorize any write or verify device notification.'
  ],
  providerSettlementVerified:false
 });
}
