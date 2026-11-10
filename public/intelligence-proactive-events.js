/* TF-MI-LEARN-01 Phase B — source-trusted event-to-detection interface.
 *
 * Trust is DERIVED from where evidence came from, never from a flag on the payload:
 *  - a local domain event (public/business-events.js, evidence:'local_record_commit') can only ever
 *    produce a `local_pending` trigger, whatever its status/evidence fields claim;
 *  - comparing two authenticated, validated intelligence snapshots for the same identity produces
 *    `authorized_reconciliation` triggers (on open / reconnect);
 *  - `server_commit` triggers require D01's durable authenticated change cursor, which does not exist
 *    yet. This module reports that dependency as BLOCKED instead of fabricating one.
 */
import {validateEvidence,canonical} from './intelligence-evidence.js';
import {createTrigger,PROACTIVE_TRIGGER_KIND} from './intelligence-proactive-cases.js';

const STORE_TO_TYPE=Object.freeze({customers:'customers',quotes:'quotes',jobs:'jobs',tasks:'tasks',invoices:'invoices',payments:'payments',calendarEntries:'calendarEntries',jobCosts:'jobCosts',opportunities:'opportunities',suppliers:'suppliers',supplyOrders:'supplyOrders',crew:'crew',expenses:'expenses'});
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);

export const SERVER_COMMIT_CURSOR=Object.freeze({status:'blocked',dependency:'D01 authenticated durable change cursor (issue #79 Phase B)',
 note:'No client, model or local flag may mint a server_commit trigger. Until D01 lands, server-confirmed observation is limited to authorized reconciliation of validated snapshots.'});

// Local IndexedDB domain event -> local_pending trigger. The event's own status/evidence fields are ignored for trust.
export function triggerFromDomainEvent(event,{tenantId,detectedAt=new Date().toISOString()}={}){
 if(!event||event.kind!=='domain.event'||typeof event.type!=='string'||!event.ref||!STORE_TO_TYPE[event.ref.store]||!id(event.ref.id)||typeof event.id!=='string'||!event.id)throw Error('Unsupported domain event');
 if(!id(tenantId)||event.businessId!==tenantId)throw Error('Domain event tenant does not match the evaluated scope');
 const trigger=createTrigger({source:'local_pending',tenantId,eventId:event.id,recordRef:{type:STORE_TO_TYPE[event.ref.store],id:event.ref.id,revision:null,updatedAt:typeof event.at==='string'?event.at:detectedAt},detectedAt});
 return Object.freeze({...trigger,change:/\.created$/.test(event.type)?'created':'updated',domainEventType:event.type,
  claimedEvidence:typeof event.evidence==='string'?event.evidence.slice(0,40):null,claimedStatus:typeof event.status==='string'?event.status.slice(0,20):null,
  trustNote:'Local commit; not an authenticated server fact. Claimed evidence/status fields were not used for trust.'});
}

// Two validated authenticated snapshots for the same identity -> reconciliation triggers for changed records.
export async function deriveReconciliationTriggers({previous,current,scope,now=new Date().toISOString()}={}){
 if(!scope||scope.mode!=='cloud')throw Error('Authorized reconciliation requires a cloud scope');
 const [a,b]=await Promise.all([validateEvidence(previous,scope),validateEvidence(current,scope)]);
 if(a.local||b.local)throw Error('Local snapshots cannot be reconciled as authenticated evidence');
 if(canonical(previous.identity)!==canonical(current.identity)||previous.businessId!==current.businessId||previous.permission?.role!==current.permission?.role)throw Error('Snapshots belong to different identities, tenants or roles');
 const key=r=>r.type+':'+r.id;
 const before=new Map(previous.records.map(r=>[key(r),r])),after=new Map(current.records.map(r=>[key(r),r]));
 const triggers=[];
 const make=(r,change,revision)=>Object.freeze({...createTrigger({source:'authorized_reconciliation',tenantId:scope.businessId,eventId:'reconcile:'+r.type+':'+r.id+':'+revision+':'+change,recordRef:{type:r.type,id:r.id,revision,updatedAt:r.updatedAt},detectedAt:now}),change});
 for(const [k,r]of after){const old=before.get(k);if(!old)triggers.push(make(r,'created',r.revision));else if(old.revision!==r.revision){if(r.revision<old.revision)throw Error('Current snapshot carries an older revision than the previous one; refusing to reconcile');triggers.push(make(r,'updated',r.revision))}}
 for(const [k,r]of before)if(!after.has(k))triggers.push(make(r,'removed',r.revision));
 triggers.sort((x,y)=>x.eventId.localeCompare(y.eventId));
 return Object.freeze({kind:'tradeflow.intelligence.proactive.reconciliation.v1',tenantId:scope.businessId,comparedAt:now,previousCount:previous.records.length,currentCount:current.records.length,triggers:Object.freeze(triggers),serverCommitCursor:SERVER_COMMIT_CURSOR,executionAuthority:false});
}

// Classify any trigger-like object by what it can prove. Caller-supplied labels never upgrade trust.
export function classifyTrigger(trigger){
 if(trigger?.kind!==PROACTIVE_TRIGGER_KIND||trigger.executionAuthority!==false)return {evidenceClass:'rejected',reason:'not_a_proactive_trigger'};
 const expected={server_commit:'server_session',authorized_reconciliation:'authorized_service',local_pending:'local_only'}[trigger.source];
 if(!expected||trigger.actorScope!==expected||trigger.confirmed!==(trigger.source!=='local_pending'))return {evidenceClass:'rejected',reason:'trust_labels_inconsistent_with_source'};
 if(trigger.source==='local_pending')return {evidenceClass:'local_unconfirmed',reason:'pending_offline_or_local_commit'};
 if(trigger.source==='authorized_reconciliation')return {evidenceClass:'authorized_current_record',reason:'validated_snapshot_difference'};
 return {evidenceClass:'authorized_current_record',reason:'server_commit_requires_d01_cursor',dependency:SERVER_COMMIT_CURSOR};
}
