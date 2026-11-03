/* TF-RM-03-G01: read-only crew report delivery state projection.
 * Consumes existing sync.change commandLog rows and independently authenticated
 * server readback. Does not enqueue, drain, retry, authorize or write records.
 */
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const actor=x=>x&&typeof x.issuer==='string'&&x.issuer.length>0&&typeof x.subject==='string'&&x.subject.length>0;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const frozen=x=>Object.freeze(x);
export function projectCrewReportState({event,queueRows,principal,serverReadback=null}={}){
 if(!event||event.schemaVersion!==1||event.kind!=='job_blocker_reported'||
  event.direction!=='role_to_core'||!id(event.eventId)||!id(event.idempotencyKey)||
  !id(event.businessId)||!id(event.actorId)||event.subject?.type!=='jobs'||
  !id(event.subject.id)||!Number.isSafeInteger(event.subject.revision)||
  event.subject.revision<1||!Array.isArray(queueRows)||!actor(principal)||
  principal.subject!==event.actorId)throw Error('Invalid report or actor scope');
 const correlationId=event.eventId;
 const matches=queueRows.filter(r=>r?.kind==='sync.change'&&
  r.businessId===event.businessId&&r.change?.type==='jobs'&&
  r.change?.id===event.subject.id&&r.change?.operationId===event.idempotencyKey);
 if(matches.length>1)throw Error('Ambiguous queued operation');
 const row=matches[0]||null;
 const base={schemaVersion:1,eventId:event.eventId,correlationId,
  operationId:event.idempotencyKey,businessId:event.businessId,
  jobId:event.subject.id,sourceRevision:event.subject.revision,
  actor:frozen({issuer:principal.issuer,subject:principal.subject}),
  remoteRevision:null,acknowledged:false,actionReceiptRef:null,executionAuthority:false};
 if(!row)return frozen({...base,deliveryState:'local_draft',requiresReview:false});
 if(!equal(row.actor||row.approvedBy||null,principal)||
  row.change.baseRevision!==event.subject.revision||
  row.change.record?.businessId&&row.change.record.businessId!==event.businessId)
  return frozen({...base,deliveryState:'identity_or_revision_mismatch',requiresReview:true});
 if(row.writeUncertain===true)return frozen({...base,deliveryState:'delivery_uncertain',requiresReview:true});
 if(row.status==='conflict'||row.status==='failed')
  return frozen({...base,deliveryState:row.status==='conflict'?'conflict_needs_review':'failed_needs_review',requiresReview:true});
 if(row.status==='pending'||row.status==='sending')
  return frozen({...base,deliveryState:row.status==='pending'?'queued_local':'sending_unverified',requiresReview:false});
 if(row.status!=='applied'||!['verified_write','already_current'].includes(row.result)||
  !Number.isSafeInteger(row.remoteRevision)||row.remoteRevision<=event.subject.revision||
  row.verification!=='record_readback')
  return frozen({...base,deliveryState:'delivery_uncertain',requiresReview:true});
 // A generic record sync receipt is insufficient to prove THIS event was delivered.
 // Require authenticated, tenant-scoped, exact tuple readback supplied by caller.
 const proof=serverReadback;
 const updates=proof?.record?.fieldUpdates;
 const found=Array.isArray(updates)?updates.filter(u=>u?.eventId===event.eventId||
  u?.idempotencyKey===event.idempotencyKey):[];
 const valid=proof?.authenticated===true&&proof.businessId===event.businessId&&
  proof.type==='jobs'&&proof.id===event.subject.id&&
  proof.revision===row.remoteRevision&&found.length===1&&
  found[0].eventId===event.eventId&&found[0].idempotencyKey===event.idempotencyKey&&
  found[0].actorId===principal.subject&&found[0].actorIssuer===principal.issuer&&
  found[0].kind===event.kind&&found[0].note===event.note;
 return frozen({...base,remoteRevision:row.remoteRevision,
  deliveryState:valid?'readback_verified':'delivery_uncertain',requiresReview:!valid});
}
