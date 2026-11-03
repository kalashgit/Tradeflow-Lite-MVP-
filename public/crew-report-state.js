/* TF-RM-03-G01: read-only crew report delivery state projection.
 * Consumes existing sync.change commandLog rows and independently authenticated
 * server readback. Does not enqueue, drain, retry, authorize or write records.
 */
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const actor=x=>x&&typeof x.issuer==='string'&&x.issuer.length>0&&typeof x.subject==='string'&&x.subject.length>0;
const equal=(a,b)=>a?.issuer===b?.issuer&&a?.subject===b?.subject;
const frozen=x=>Object.freeze(x);
// Require the queued record itself to contain the exact report; an operation ID
// alone cannot correlate a generic job edit with a crew-originated event.
const exactReport=(updates,event,principal)=>{
 if(!Array.isArray(updates))return false;
 const matches=updates.filter(u=>u?.eventId===event.eventId||u?.idempotencyKey===event.idempotencyKey);
 return matches.length===1&&matches[0].eventId===event.eventId&&
  matches[0].idempotencyKey===event.idempotencyKey&&
  matches[0].actorId===principal.subject&&matches[0].actorIssuer===principal.issuer&&
  matches[0].kind===event.kind&&matches[0].note===event.note&&
  matches[0].eventAt===event.eventAt;
};
export function projectCrewReportState({event,queueRows,principal,serverReadback=null}={}){
 if(!event||event.schemaVersion!==1||event.kind!=='job_blocker_reported'||
  event.direction!=='role_to_core'||!id(event.eventId)||!id(event.idempotencyKey)||
  !id(event.businessId)||!id(event.actorId)||event.subject?.type!=='jobs'||
  !id(event.subject.id)||!Number.isSafeInteger(event.subject.revision)||
  event.subject.revision<1||typeof event.eventAt!=='string'||
  !Number.isFinite(Date.parse(event.eventAt))||typeof event.note!=='string'||
  !event.note.trim()||event.note.length>500||!Array.isArray(queueRows)||!actor(principal)||
  principal.subject!==event.actorId)throw Error('Invalid report or actor scope');
 const correlationId=event.eventId;
 // Operation IDs belong to the existing business queue, not to an individual
 // record type. A reused ID for another job/type is a collision, not a draft.
 const matches=queueRows.filter(r=>r?.kind==='sync.change'&&
  r.businessId===event.businessId&&r.change?.operationId===event.idempotencyKey);
 if(matches.length>1)throw Error('Ambiguous queued operation');
 const row=matches[0]||null;
 const base={schemaVersion:1,eventId:event.eventId,correlationId,
  operationId:event.idempotencyKey,businessId:event.businessId,
  jobId:event.subject.id,sourceRevision:event.subject.revision,
  actor:frozen({issuer:principal.issuer,subject:principal.subject}),
  remoteRevision:null,acknowledged:false,actionReceiptRef:null,executionAuthority:false};
 if(!row){
  const draft=event.deliveryState==='local_draft';
  return frozen({...base,deliveryState:draft?'local_draft':'delivery_uncertain',
   requiresReview:!draft});
 }
 if(row.change.type!=='jobs'||row.change.id!==event.subject.id||
  row.id!=='sync:'+event.businessId+':'+event.idempotencyKey)
  return frozen({...base,deliveryState:'identity_or_revision_mismatch',requiresReview:true});
 // Fresh pending queue rows are intentionally actor-unbound until first claim.
 // Never imply server attribution from such a local snapshot.
 const bound=row.approvedBy||row.actor;
 if((bound&&!equal(bound,principal))||
  (row.actor&&row.approvedBy&&!equal(row.actor,row.approvedBy))||
  (row.verifiedBy&&!equal(row.verifiedBy,principal))||
  row.change.baseRevision!==event.subject.revision||
  row.change.record?.businessId&&row.change.record.businessId!==event.businessId)
  return frozen({...base,deliveryState:'identity_or_revision_mismatch',requiresReview:true});
 // Fail closed when the queued job snapshot does not contain this precise event.
 if(!exactReport(row.change.record?.fieldUpdates,event,principal))
  return frozen({...base,deliveryState:'identity_or_revision_mismatch',requiresReview:true});
 if(row.writeUncertain===true)return frozen({...base,deliveryState:'delivery_uncertain',requiresReview:true});
 if(row.status==='conflict'||row.status==='failed')
  return frozen({...base,deliveryState:row.status==='conflict'?'conflict_needs_review':'failed_needs_review',requiresReview:true});
 if(row.status==='pending'||row.status==='sending')
  return frozen({...base,deliveryState:row.status==='pending'?'queued_local':'sending_unverified',requiresReview:false});
 if(row.status!=='applied'||!equal(bound,principal)||
  !equal(row.verifiedBy,principal)||
  !['verified_write','already_current'].includes(row.result)||
  !Number.isSafeInteger(row.remoteRevision)||row.remoteRevision<=event.subject.revision||
  row.verification!=='record_readback')
  return frozen({...base,deliveryState:'delivery_uncertain',requiresReview:true});
 // A generic record sync receipt is insufficient to prove THIS event was delivered.
 // Require authenticated, tenant-scoped, exact tuple readback supplied by caller.
 const proof=serverReadback;
 const updates=proof?.record?.fieldUpdates;
 const valid=proof?.authenticated===true&&proof.actor?.issuer===principal.issuer&&
  proof.actor?.subject===principal.subject&&proof.businessId===event.businessId&&
  proof.type==='jobs'&&proof.id===event.subject.id&&
  Number.isSafeInteger(proof.revision)&&proof.revision>=row.remoteRevision&&
  exactReport(updates,event,principal);
 return frozen({...base,remoteRevision:row.remoteRevision,
  deliveryState:valid?'readback_verified':'delivery_uncertain',requiresReview:!valid});
}
