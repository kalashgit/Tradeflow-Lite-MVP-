/* TF-RM-03-E / HYB-04 — internal office Intelligence review of a persisted
 * crew blocker. Not routed. The same D1 SELECT independently checks CURRENT
 * office grant, membership and job nondeletion before returning job evidence.
 * The advisory is deterministic, unsaved and without execution permission.
 */
import {authorizeBusiness,AuthorizationError} from './tenant-security.js';
import {recordIdentity} from '../public/record-model.js';

const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const validStamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};

// A preflight read of a grant followed by a generic job read is NOT sufficient:
// the grant could be revoked between statements. This one SELECT is the
// authorization decision and the evidence read.
export const OFFICE_BLOCKER_READ_SQL=String.raw`SELECT
 t.payload AS job_payload,t.revision AS job_revision,
 m.role AS viewer_role,g.grant_revision AS office_grant_revision
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

function validStoredBlocker(x){
 return x&&x.schemaVersion===1&&x.kind==='job_blocker_reported'&&
  id(x.eventId)&&id(x.idempotencyKey)&&id(x.actorId)&&
  typeof x.actorIssuer==='string'&&x.actorIssuer.trim().length>0&&
  validStamp(x.eventAt)&&typeof x.note==='string'&&
  x.note.trim().length>0&&x.note.length<=500;
}

const validOfficeResponse=e=>e&&e.schemaVersion===1&&
 e.kind==='job_blocker_office_response'&&id(e.eventId)&&id(e.idempotencyKey)&&
 id(e.reportEventId)&&id(e.actorId)&&typeof e.actorIssuer==='string'&&
 e.actorIssuer.trim().length>0&&validStamp(e.eventAt)&&
 typeof e.text==='string'&&e.text.trim().length>0&&e.text.length<=500;
const validCrewAcknowledgment=e=>e&&e.schemaVersion===1&&
 e.kind==='job_blocker_response_acknowledged'&&
 id(e.eventId)&&id(e.idempotencyKey)&&id(e.reportEventId)&&
 id(e.responseEventId)&&id(e.actorId)&&
 typeof e.actorIssuer==='string'&&e.actorIssuer.trim().length>0&&
 validStamp(e.eventAt)&&e.status==='received';

/* Only durable job records are evidence. A client-supplied crew report,
 * claimed role, callback or local chat string is never a read source.
 * A stored event does not alone cryptographically prove historical authorship.
 */
export async function reviewOfficeJobBlocker({
 db,principal,businessId,jobId,eventId,threadId=null,expectedJobRevision=null
}={}){
 if(!id(jobId)||!id(eventId)||(threadId!==null&&!id(threadId))||
    (expectedJobRevision!==null&&(!Number.isSafeInteger(expectedJobRevision)||expectedJobRevision<1)))
  throw new AuthorizationError('Valid job, event and optional thread/revision required',400);
 const auth=await authorizeBusiness({db,principal,businessId,permission:'records:read'});
 let row;
 try{
  row=await db.prepare(OFFICE_BLOCKER_READ_SQL)
   .bind(auth.issuer,auth.subject,auth.businessId,jobId).first();
 }catch{
  throw new AuthorizationError('Office job evidence store unavailable',503);
 }
 if(!row||!Number.isSafeInteger(row.job_revision)||row.job_revision<1)
  throw new AuthorizationError('Current office job access required',403);
 const companyWide=row.viewer_role==='owner'||row.viewer_role==='admin';
 if(!companyWide&&(row.viewer_role!=='member'||
    !Number.isSafeInteger(row.office_grant_revision)||row.office_grant_revision<1))
  throw new AuthorizationError('Active office job grant required',403);
 if(expectedJobRevision!==null&&row.job_revision!==expectedJobRevision)
  throw new AuthorizationError('Job evidence changed; refresh before review',409);
 let job;
 try{
  job=JSON.parse(row.job_payload);
  recordIdentity({businessId:auth.businessId,type:'jobs',id:jobId,record:job});
 }catch{
  throw new AuthorizationError('Invalid authenticated job evidence',503);
 }
 const updates=job.fieldUpdates===undefined?[]:job.fieldUpdates;
 if(!Array.isArray(updates)||updates.length>40)
  throw new AuthorizationError('Job report history requires review',409);
 const matches=updates.filter(x=>x?.eventId===eventId);
 if(matches.length!==1||!validStoredBlocker(matches[0]))
  throw new AuthorizationError('Unique persisted blocker report unavailable',404);
 const report=matches[0];
 if(updates.some(x=>x!==report&&x?.idempotencyKey===report.idempotencyKey))
  throw new AuthorizationError('Conflicting report idempotency key',409);
 const replies=updates.filter(e=>e?.kind==='job_blocker_office_response'&&e.reportEventId===eventId);
 if(replies.length>1||replies.length===1&&!validOfficeResponse(replies[0]))
  throw new AuthorizationError('Office response evidence ambiguous',409);
 const officeReply=replies[0]||null;
 const acknowledgments=updates.filter(e=>e?.kind==='job_blocker_response_acknowledged'&&
   e.reportEventId===eventId);
 if(acknowledgments.length>1||acknowledgments.length===1&&
    (!officeReply||!validCrewAcknowledgment(acknowledgments[0])||
     acknowledgments[0].responseEventId!==officeReply.eventId))
  throw new AuthorizationError('Crew acknowledgment evidence ambiguous',409);
 const crewAck=acknowledgments[0]||null;
 // Event history is persisted evidence, but it is not historical proof of
 // original actor authentication. No fake delivery or completion assertion.
 const reply=`A crew blocker is recorded for job ${jobId}: “${report.note}”`+
  (officeReply?` An office response is recorded: “${officeReply.text}”`:
   ' The office response has not been recorded.')+
  (crewAck?' A crew acknowledgment event is recorded.':
   ' No crew acknowledgment event has been verified.')+
  ' The report does not establish schedule impact, materials availability, or resolution.';
 const title=officeReply?'Review crew acknowledgment':'Review reported job blocker';
 return freeze({
  kind:'tradeflow.intelligence.job_blocker_review.v1',
  status:'advisory_review_ready',intent:'job_blocker_review',
  businessId:auth.businessId,jobId,threadId,
  threadBindingVerified:false,
  memory:{status:'not_saved',scope:'this_review_only'},
  source:{type:'jobs',id:jobId,revision:row.job_revision,
   access:'authenticated_office_job_read',
   grantRevision:companyWide?null:row.office_grant_revision},
  report:{eventId:report.eventId,reportedAt:report.eventAt,
   reportedNote:report.note,
   reportedActor:{issuer:report.actorIssuer,subject:report.actorId},
   persistedEventPresent:true,actorAttributionVerified:false,
   acknowledgment:crewAck?'persisted_event_unattributed':'unverified'},
  roleExchange:{
   officeResponse:officeReply?{
    eventId:officeReply.eventId,reportedAt:officeReply.eventAt,
    text:officeReply.text,persistedEventPresent:true,
    actorAttributionVerified:false
   }:{status:'not_recorded'},
   crewAcknowledgment:crewAck?{
    eventId:crewAck.eventId,reportedAt:crewAck.eventAt,
    persistedEventPresent:true,actorAttributionVerified:false
   }:{status:'not_recorded'},
   externallyDelivered:false
  },
  response:{text:reply,basis:'persisted_job_report',unknowns:[
   'schedule_impact','material_requirements','resolution_status'
  ]},
  suggestedNextAction:crewAck?null:{
   status:'proposal_only',requiresHumanReview:true,
   commandId:'draft.prepare',
   params:{kind:'task',ref:{store:'jobs',id:jobId},
    title,fields:{title}},
   boundToSourceRevision:row.job_revision
  },
  executionAuthority:false,actionReceiptRef:null,
  externalEffects:false
 });
}
