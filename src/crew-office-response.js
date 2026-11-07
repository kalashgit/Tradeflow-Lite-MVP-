/* TF-RM-03-G05 — assigned technician's source-scoped response view.
 * INTERNAL / NOT ROUTED. Reads the existing authoritative job and current
 * crew grant in one SELECT; never sends messages, acknowledges or writes.
 */
import {authorizeBusiness,AuthorizationError} from './tenant-security.js';
import {recordIdentity} from '../public/record-model.js';
import {ROLE_EVENT_SOURCE_SQL} from './role-exchange-actions.js';

const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const validReport=x=>x?.schemaVersion===1&&x.kind==='job_blocker_reported'&&
 id(x.eventId)&&id(x.idempotencyKey)&&id(x.actorId)&&
 typeof x.actorIssuer==='string'&&!!x.actorIssuer.trim()&&
 stamp(x.eventAt)&&typeof x.note==='string'&&!!x.note.trim()&&x.note.length<=500;
const validReply=x=>x?.schemaVersion===1&&x.kind==='job_blocker_office_response'&&
 id(x.eventId)&&id(x.idempotencyKey)&&id(x.reportEventId)&&
 id(x.actorId)&&typeof x.actorIssuer==='string'&&!!x.actorIssuer.trim()&&
 stamp(x.eventAt)&&typeof x.text==='string'&&!!x.text.trim()&&x.text.length<=500;
const validAck=x=>x?.schemaVersion===1&&x.kind==='job_blocker_response_acknowledged'&&
 id(x.eventId)&&id(x.idempotencyKey)&&id(x.reportEventId)&&
 id(x.responseEventId)&&id(x.actorId)&&
 typeof x.actorIssuer==='string'&&!!x.actorIssuer.trim()&&
 x.status==='received'&&stamp(x.eventAt);
function unique(updates,rows,valid){
 if(rows.length!==1||!valid(rows[0]))
  throw new AuthorizationError('Referenced exchange event ambiguous or invalid',409);
 const event=rows[0];
 if(updates.some(x=>x!==event&&
     (x?.eventId===event.eventId||x?.idempotencyKey===event.idempotencyKey)))
  throw new AuthorizationError('Exchange event ID collision',409);
 return event;
}

export async function readAssignedCrewOfficeResponse({
 db,principal,businessId,jobId,reportEventId,expectedJobRevision=null
}={}){
 if(!db?.prepare||!id(jobId)||!id(reportEventId)||
   (expectedJobRevision!==null&&(!Number.isSafeInteger(expectedJobRevision)||
     expectedJobRevision<1)))
  throw new AuthorizationError('Valid job, report and optional revision required',400);
 const auth=await authorizeBusiness({db,principal,businessId,permission:'records:read'});
 if(auth.role!=='member')
  throw new AuthorizationError('Assigned technician membership required',403);
 let row;
 try{
  // This read rechecks active membership + crew grant and job deletion at the
  // actual SELECT. Never use a prior screenshot, client role or office grant.
  row=await db.prepare(ROLE_EVENT_SOURCE_SQL).bind(
   auth.issuer,auth.subject,'crew',auth.businessId,jobId
  ).first();
 }catch{
  throw new AuthorizationError('Crew job authorization store unavailable',503);
 }
 if(!row||row.reader_role!=='member'||!Number.isSafeInteger(row.grant_revision)||
    row.grant_revision<1||!Number.isSafeInteger(row.job_revision)||row.job_revision<1)
  throw new AuthorizationError('Current assigned crew job unavailable',403);
 if(expectedJobRevision!==null&&row.job_revision!==expectedJobRevision)
  throw new AuthorizationError('Job changed; refresh crew response view',409);
 let job;
 try{
  job=JSON.parse(row.job_payload);
  recordIdentity({businessId:auth.businessId,type:'jobs',id:jobId,record:job});
 }catch{throw new AuthorizationError('Crew job evidence invalid',503)}
 const updates=job.fieldUpdates;
 if(!Array.isArray(updates)||updates.length>40||
   updates.some(e=>!e||typeof e!=='object'||Array.isArray(e)))
  throw new AuthorizationError('Crew event history invalid',409);
 const report=unique(updates,updates.filter(e=>e?.eventId===reportEventId),validReport);
 // Even two assigned technicians on the same job are not interchangeable.
 if(report.actorId!==auth.subject||report.actorIssuer!==auth.issuer)
  throw new AuthorizationError('This report belongs to a different technician',403);
 const replies=updates.filter(e=>e?.kind==='job_blocker_office_response'&&
  e.reportEventId===reportEventId);
 if(replies.length>1)throw new AuthorizationError('Multiple office responses require review',409);
 const response=replies.length?unique(updates,replies,validReply):null;
 const acknowledgments=updates.filter(e=>e?.kind==='job_blocker_response_acknowledged'&&
  e.reportEventId===reportEventId);
 if(acknowledgments.length>1||acknowledgments.length&&!response)
  throw new AuthorizationError('Crew acknowledgement evidence ambiguous',409);
 const acknowledgment=acknowledgments.length?
  unique(updates,acknowledgments,validAck):null;
 if(acknowledgment&&(acknowledgment.responseEventId!==response.eventId||
     acknowledgment.actorId!==auth.subject||
     acknowledgment.actorIssuer!==auth.issuer))
  throw new AuthorizationError('Crew acknowledgment actor or response mismatch',409);
 return freeze({
  kind:'tradeflow.role_exchange.crew_response_view.v1',
  businessId:auth.businessId,jobId,reportEventId,
  viewer:freeze({issuer:auth.issuer,subject:auth.subject}),
  source:freeze({type:'jobs',id:jobId,revision:row.job_revision,
   crewGrantRevision:row.grant_revision,scope:'crew',
   readbackVerified:true}),
  report:freeze({eventId:report.eventId,note:report.note,
   recordedAt:report.eventAt,actorAttributionVerified:false}),
  state:acknowledgment?'acknowledgment_recorded':
   response?'office_response_recorded':'awaiting_office_response',
  officeResponse:response?freeze({eventId:response.eventId,
   recordedAt:response.eventAt,text:response.text,
   actorAttributionVerified:false,persistedEventPresent:true}):
   freeze({status:'not_recorded'}),
  crewAcknowledgment:acknowledgment?freeze({eventId:acknowledgment.eventId,
   recordedAt:acknowledgment.eventAt,actorAttributionVerified:false,
   persistedEventPresent:true}):freeze({status:'not_recorded'}),
  externalDeliveryVerified:false,materialsResolved:false,
  officeTaskReceipt:null,commandExecuted:false,executionAuthority:false
 });
}
