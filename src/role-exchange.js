/* TF-RM-03 / v1: read-only, authenticated job-bound crew ⇄ office projection.
 * Adapts the existing tenant record and command receipts. No new store, sync engine,
 * message transport, action permission or autonomous business write.
 */
import {authorizeBusiness,authorizedTenantReadQuery,AuthorizationError} from './tenant-security.js';
import {recordIdentity} from '../public/record-model.js';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const copy=x=>JSON.parse(JSON.stringify(x));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const validEvent=e=>e&&e.schemaVersion===1&&id(e.eventId)&&id(e.businessId)&&id(e.actorId)&&e.direction==='role_to_core'&&e.kind==='job_blocker_reported'&&e.subject?.type==='jobs'&&id(e.subject.id)&&Number.isSafeInteger(e.subject.revision)&&e.subject.revision>=1&&stamp(e.eventAt)&&typeof e.note==='string'&&e.note.trim().length>=1&&e.note.length<=500&&id(e.idempotencyKey);
function readback(job,e){
 const updates=Array.isArray(job?.fieldUpdates)?job.fieldUpdates:[];
 const matches=updates.filter(u=>u?.eventId===e.eventId);
 return matches.length===1&&matches[0].actorId===e.actorId&&matches[0].idempotencyKey===e.idempotencyKey&&matches[0].note===e.note&&matches[0].kind===e.kind;
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
