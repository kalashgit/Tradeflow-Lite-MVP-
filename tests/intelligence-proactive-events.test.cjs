'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const businessEvents=require('../public/business-events.js');
let ev,cases;
before(async()=>{ev=await import('../public/intelligence-proactive-events.js');cases=await import('../public/intelligence-proactive-cases.js')});
const NOW='2026-11-10T09:00:00.000Z';
const identity={issuer:'https://identity.example.test',subject:'owner_001'};
const scope=(over={})=>({mode:'cloud',businessId:'business_001',role:'owner',identity,...over});
const row=(type,id,revision,record)=>({type,id,revision,updatedAt:'2026-11-09T00:00:00Z',provenance:'tenant_record',contentTrust:'untrusted_record_content',record});
const snapshot=records=>({kind:'tradeflow.intelligence.context.v1',businessId:'business_001',identity,scope:{company:true},permission:{role:'owner'},readOnly:true,executionAuthority:false,records});
const base=()=>[row('invoices','inv_1',3,{status:'Issued',customerId:'c_1',jobId:'job_1',dueDate:'2026-11-05'}),row('jobs','job_1',2,{title:'Fitout',status:'Scheduled',customerId:'c_1'}),row('customers','c_1',1,{name:'P'})];

test('a real local domain event becomes a local_pending trigger regardless of what its status or evidence fields claim',()=>{
 const event=businessEvents.make({store:'invoices',record:{id:'inv_1',status:'Issued'},previous:{id:'inv_1',status:'Draft'},key:'gui:1',context:{businessId:'business_001',actor:'owner_001'},at:NOW});
 assert.equal(event.evidence,'local_record_commit');assert.equal(event.status,'pending');
 const t=ev.triggerFromDomainEvent(event,{tenantId:'business_001',detectedAt:NOW});
 assert.equal(t.source,'local_pending');assert.equal(t.actorScope,'local_only');assert.equal(t.confirmed,false);assert.equal(t.recordRef.revision,null);assert.equal(t.change,'updated');
 const forged={...event,evidence:'server_commit',status:'processed',verified:true,actorScope:'server_session'};
 const f=ev.triggerFromDomainEvent(forged,{tenantId:'business_001',detectedAt:NOW});
 assert.equal(f.source,'local_pending');assert.equal(f.actorScope,'local_only');assert.equal(f.claimedEvidence,'server_commit');
 assert.deepEqual(ev.classifyTrigger(f),{evidenceClass:'local_unconfirmed',reason:'pending_offline_or_local_commit'});
 assert.throws(()=>ev.triggerFromDomainEvent(event,{tenantId:'business_002'}),/tenant/);
 assert.throws(()=>ev.triggerFromDomainEvent({...event,kind:'model.claim'},{tenantId:'business_001'}),/Unsupported/);
 assert.throws(()=>ev.triggerFromDomainEvent({...event,ref:{store:'settings',id:'x'}},{tenantId:'business_001'}),/Unsupported/);
});
test('reconciling two validated authenticated snapshots yields created, updated and removed triggers with real revisions',async()=>{
 const previous=snapshot(base());
 const next=base();next[0]={...next[0],revision:4,record:{...next[0].record,status:'Overdue'}};next.push(row('quotes','q_1',1,{status:'Sent',customerId:'c_1',sentDate:'2026-10-01'}));
 const current=snapshot(next.filter(r=>r.id!=='job_1'));
 const r=await ev.deriveReconciliationTriggers({previous,current,scope:scope(),now:NOW});
 assert.deepEqual(r.triggers.map(t=>[t.recordRef.type+':'+t.recordRef.id,t.change,t.recordRef.revision,t.source,t.actorScope]),[
  ['invoices:inv_1','updated',4,'authorized_reconciliation','authorized_service'],['jobs:job_1','removed',2,'authorized_reconciliation','authorized_service'],['quotes:q_1','created',1,'authorized_reconciliation','authorized_service']]);
 assert.equal(r.serverCommitCursor.status,'blocked');
 assert.deepEqual(ev.classifyTrigger(r.triggers[0]),{evidenceClass:'authorized_current_record',reason:'validated_snapshot_difference'});
 const detection=await cases.detectInvoiceDueDateReview({context:current,scope:scope(),asOfDate:'2026-11-10',now:NOW,trigger:r.triggers[0]});
 assert.equal(detection.status,'evaluated');assert.equal(detection.evidenceTrust,'authorized_current_record');assert.equal(detection.cases[0].triggerId,r.triggers[0].eventId);
});
test('reconciliation refuses local snapshots, identity or role changes, foreign tenants and backwards revisions',async()=>{
 const previous=snapshot(base()),current=snapshot(base());
 await assert.rejects(ev.deriveReconciliationTriggers({previous,current,scope:{mode:'local',actor:'local-owner',businessId:'local-business'}}),/cloud scope/);
 await assert.rejects(ev.deriveReconciliationTriggers({previous,current:{...current,identity:{...identity,subject:'other'}},scope:scope()}),/identity|role changed/);
 await assert.rejects(ev.deriveReconciliationTriggers({previous,current:{...current,permission:{role:'admin'}},scope:scope()}),/identity|role/);
 await assert.rejects(ev.deriveReconciliationTriggers({previous,current,scope:scope({businessId:'business_002'})}),/invalid|changed/i);
 const older=base();older[0]={...older[0],revision:1};
 await assert.rejects(ev.deriveReconciliationTriggers({previous,current:snapshot(older),scope:scope()}),/older revision/);
 const viewerSnap={...snapshot(base().filter(r=>r.type==='jobs'||r.type==='customers')),permission:{role:'viewer'}};
 const vr=await ev.deriveReconciliationTriggers({previous:viewerSnap,current:viewerSnap,scope:scope({role:'viewer'})});
 assert.deepEqual(vr.triggers,[]);
});
test('server_commit remains a blocked dependency and forged trigger labels are rejected by classification and detection',async()=>{
 assert.equal(ev.SERVER_COMMIT_CURSOR.status,'blocked');
 const forged={kind:cases.PROACTIVE_TRIGGER_KIND,version:1,tenantId:'business_001',source:'server_commit',eventId:'e1',recordRef:{type:'invoices',id:'inv_1',revision:3,updatedAt:NOW},detectedAt:NOW,actorScope:'server_session',confirmed:true,executionAuthority:true};
 assert.equal(ev.classifyTrigger(forged).evidenceClass,'rejected');
 const relabelled={...forged,executionAuthority:false,actorScope:'local_only'};
 assert.equal(ev.classifyTrigger(relabelled).reason,'trust_labels_inconsistent_with_source');
 const detection=await cases.detectInvoiceDueDateReview({context:snapshot(base()),scope:scope(),asOfDate:'2026-11-10',now:NOW,trigger:relabelled});
 assert.equal(detection.status,'invalid');assert.equal(detection.reason,'trigger_rejected');
});
