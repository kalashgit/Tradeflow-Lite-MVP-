/* TF-R01-02B/C — server-owned, read-only job access foundation.
 * This is a development contract, not a routed field API or write permission.
 * Job grants are separate from the display-only jobs.crewId field.
 */
import {authorizeBusiness,AuthorizationError} from './tenant-security.js';

const issuedJobGrants=new WeakSet();

const jobIdValid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const validScope=value=>value==='crew'||value==='office';

// Current membership, current job and current grant are checked in ONE read.
// Do not reuse this read as mutation-time authority: consequential writes must
// check active grant revision inside the SAME SQL statement as their job CAS.
export const JOB_SCOPED_READ_SQL=String.raw`SELECT t.revision AS job_revision,g.grant_revision,m.role
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

export async function readJobAccess({db,principal,businessId,jobId,scope}={}){
 if(!jobIdValid(jobId)||!validScope(scope))
  throw new AuthorizationError('Valid job and access scope required',400);
 const auth=await authorizeBusiness({db,principal,businessId,permission:'records:read'});
 let row;
 try{
  row=await db.prepare(JOB_SCOPED_READ_SQL)
   .bind(auth.issuer,auth.subject,scope,auth.businessId,jobId).first();
 }catch(error){
  // A missing schema does not degrade to company-wide permission.
  throw new AuthorizationError('Job authorization store unavailable',503);
 }
 if(!row||!Number.isSafeInteger(row.job_revision)||row.job_revision<1)
  throw new AuthorizationError('Assigned job unavailable',403);
 const companyWide=row.role==='owner'||row.role==='admin';
 if(!companyWide&&(row.role!=='member'||!Number.isSafeInteger(row.grant_revision)||row.grant_revision<1))
  throw new AuthorizationError('Active job grant required',403);
 const proof=Object.freeze({
  schemaVersion:1,businessId:auth.businessId,jobId,
  actor:Object.freeze({issuer:auth.issuer,subject:auth.subject}),
  scope,jobRevision:row.job_revision,
  grantRevision:companyWide?null:row.grant_revision,
  accessClass:companyWide?'company_member':'assigned_job',
  readVerified:true,writeAuthorized:false
 });
 issuedJobGrants.add(proof);
 return proof;
}

// Only same-process server-issued grants can parameterize the scoped CAS.
// This is not a request-body token or a durable authorization credential.
export function assertTrustedCrewGrant(proof,authorization,jobId){
 if(!proof||!issuedJobGrants.has(proof)||
    proof.accessClass!=='assigned_job'||proof.scope!=='crew'||
    proof.actor?.issuer!==authorization?.issuer||
    proof.actor?.subject!==authorization?.subject||
    proof.businessId!==authorization?.businessId||
    proof.jobId!==jobId||authorization?.role!=='member'||
    !Number.isSafeInteger(proof.grantRevision)||proof.grantRevision<1||
    !Number.isSafeInteger(proof.jobRevision)||proof.jobRevision<1)
  throw new AuthorizationError('Fresh authenticated crew job grant required',403);
 return proof;
}
