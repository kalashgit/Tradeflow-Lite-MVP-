'use strict';
// Phase B O3 (crew/material readiness) and O4 (quotation follow-up) contract tests.
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const registry=require('../public/command-registry.js');
let ops,cases;
before(async()=>{ops=await import('../public/intelligence-proactive-operations.js');cases=await import('../public/intelligence-proactive-cases.js')});

const issuer='https://identity.example.test',business='business_001',NOW='2026-11-10T09:00:00.000Z',AS_OF='2026-11-10';
const identity=(subject='owner_001')=>({issuer,subject});
const scope=(over={})=>({mode:'cloud',businessId:business,role:'owner',identity:identity(),...over});
const row=(type,id,revision,record)=>({type,id,revision,updatedAt:'2026-11-09T00:00:00Z',provenance:'tenant_record',contentTrust:'untrusted_record_content',record});
const blocker=(eventId='evt_1',extra={})=>({eventId,kind:'job_blocker_reported',actorId:'crew_user_1',at:'2026-11-10T07:30:00Z',...extra});
function records(){
 return [
  row('jobs','job_1',3,{title:'Fitout',status:'Scheduled',customerId:'c_1',crewId:'crew_1',date:'2026-11-10',startTime:'08:00',durationMinutes:240,fieldUpdates:[blocker()]}),
  row('jobs','job_2',1,{title:'Service',status:'Scheduled',customerId:'c_1',crewId:'crew_1',date:'2026-11-10',startTime:'10:00',durationMinutes:120}),
  row('crew','crew_1',1,{name:'Team A',role:'Electrician',status:'Active'}),
  row('customers','c_1',1,{name:'Private customer',contactRestriction:'do_not_contact'}),
  row('customers','c_2',1,{name:'Open customer'}),
  row('supplyOrders','po_1',2,{jobId:'job_1',supplierId:'sup_1',status:'Ordered',documentStatus:'Issued',plannedDate:'2026-11-08',poNumber:'PO-1'}),
  row('supplyOrders','po_2',1,{jobId:'job_1',supplierId:'sup_1',status:'Planned',documentStatus:'Draft'}),
  row('quotes','q_1',2,{title:'Panel',status:'Sent',customerId:'c_1',sentDate:'2026-10-20',amount:4200,currency:'USD'}),
  row('quotes','q_2',1,{title:'EV',status:'Sent',customerId:'c_2'}),
  row('quotes','q_3',1,{title:'Recent',status:'Sent',customerId:'c_2',sentDate:'2026-11-05'}),
  row('quotes','q_4',1,{title:'Won',status:'Accepted',customerId:'c_2',sentDate:'2026-09-01'})
 ];
}
const context=(over={})=>({kind:'tradeflow.intelligence.context.v1',businessId:business,identity:identity(over.subject),scope:{company:true},permission:{role:over.role||'owner'},readOnly:true,executionAuthority:false,records:over.records||records()});
const readiness=(over={})=>ops.detectCrewMaterialReadiness({context:context(),scope:scope(),asOfDate:AS_OF,now:NOW,...over});
const followUp=(over={})=>ops.detectQuoteFollowUp({context:context(),scope:scope(),asOfDate:AS_OF,now:NOW,...over});
const byDetector=(r,d)=>r.cases.filter(c=>c.detectorId===d);

test('unacknowledged field blocker on a job scheduled today is an urgent review case whose note is withheld',async()=>{
 const r=await readiness();
 assert.equal(r.status,'evaluated');assert.equal(r.modelInvoked,false);
 const [c]=byDetector(r,'job.field_blocker_unacknowledged');
 assert.equal(c.subjectKey,'jobs:job_1|blocker:evt_1');assert.equal(c.conclusion,'needs_review');assert.equal(c.severity,'urgent');
 assert.deepEqual(c.subjectRefs.map(x=>x.type+':'+x.id),['crew:crew_1','jobs:job_1']);
 assert.equal(c.evidence.acknowledgment,'none_recorded');assert.equal(c.evidence.noteWithheld,true);assert.equal(c.evidence.reporterAttributionVerified,false);
 assert.match(c.recommendation,/No supplier order, delivery date or crew reassignment/);
 assert.ok(c.unknowns.includes('material_stock_unknown'));
 const p=cases.prepareInternalProposal({caseFile:c,commandCatalog:registry.definitions});
 assert.equal(p.status,'proposed_not_authorized');assert.equal(p.commandId,'draft.prepare');assert.deepEqual(p.params.ref,{store:'jobs',id:'job_1'});
 assert.equal(p.crewReassignment,'not_proposed');assert.equal(p.supplierOrder,'not_proposed');assert.equal(p.receiptRef,null);assert.equal(p.executed,false);
});

test('an acknowledgment record resolves the blocker subject and supersedes the open case; status changes alone do not',async()=>{
 const first=await readiness();
 let state=cases.reconcileCases({existing:[],evaluation:ops.splitEvaluation(first).find(e=>e.detectorId==='job.field_blocker_unacknowledged'),now:NOW});
 assert.equal(state.active.length,1);
 const completed=records();completed[0]={...completed[0],revision:4,record:{...completed[0].record,status:'In Progress'}};
 const stillOpen=await readiness({context:context({records:completed})});
 assert.equal(byDetector(stillOpen,'job.field_blocker_unacknowledged').length,1);
 const acked=records();acked[0]={...acked[0],revision:5,record:{...acked[0].record,fieldUpdates:[blocker(),{eventId:'evt_2',kind:'job_blocker_acknowledged',actorId:'office_1',at:'2026-11-10T08:00:00Z',acknowledgesEventId:'evt_1'}]}};
 const resolved=await readiness({context:context({records:acked})});
 assert.equal(byDetector(resolved,'job.field_blocker_unacknowledged').length,0);
 assert.deepEqual(resolved.resolvedSubjects,[{subjectKey:'jobs:job_1|blocker:evt_1',reason:'acknowledged'}]);
 state=cases.reconcileCases({existing:state.active,evaluation:ops.splitEvaluation(resolved).find(e=>e.detectorId==='job.field_blocker_unacknowledged'),now:NOW});
 assert.deepEqual(state.active,[]);assert.equal(state.superseded[0].supersedeReason,'resolved:acknowledged');
 // an acknowledgment that references a different event does not resolve the blocker
 const wrongAck=records();wrongAck[0]={...wrongAck[0],record:{...wrongAck[0].record,fieldUpdates:[blocker(),{eventId:'evt_9',kind:'job_blocker_acknowledged',actorId:null,at:null,acknowledgesEventId:'evt_other'}]}};
 assert.equal(byDetector(await readiness({context:context({records:wrongAck})}),'job.field_blocker_unacknowledged').length,1);
});

test('same-crew double booking is a conflict only when both recorded windows overlap; missing times are missing data',async()=>{
 const r=await readiness();
 const [c]=byDetector(r,'job.crew_double_booking');
 assert.equal(c.conclusion,'needs_review');assert.equal(c.severity,'urgent');assert.equal(c.evidence.overlapDetermined,true);
 assert.equal(cases.prepareInternalProposal({caseFile:c,commandCatalog:registry.definitions}).reason,'no_internal_command_for_schedule_change');
 const apart=records();apart[1]={...apart[1],record:{...apart[1].record,startTime:'13:00'}};
 assert.equal(byDetector(await readiness({context:context({records:apart})}),'job.crew_double_booking').length,0);
 const untimed=records();untimed[1]={...untimed[1],record:{...untimed[1].record,startTime:undefined,durationMinutes:undefined}};
 const [u]=byDetector(await readiness({context:context({records:untimed})}),'job.crew_double_booking');
 assert.equal(u.conclusion,'missing_data');assert.deepEqual(u.missingData,['schedule_times_unrecorded']);assert.equal(u.evidence.overlapDetermined,null);
 const otherDay=records();otherDay[1]={...otherDay[1],record:{...otherDay[1].record,date:'2026-11-12'}};
 assert.equal(byDetector(await readiness({context:context({records:otherDay})}),'job.crew_double_booking').length,0);
 assert.ok(r.unknowns.includes('crew_availability_unrecorded'));
});

test('material orders: passed planned date is review, no planned date and multiple same-supplier orders are missing data; nothing is ordered',async()=>{
 const r=await readiness();
 const material=byDetector(r,'job.material_order_review');
 assert.deepEqual(material.map(c=>[c.subjectKey,c.conclusion]),[['jobs:job_1|supplyOrders:po_1','needs_review'],['jobs:job_1|supplyOrders:po_2','missing_data'],['jobs:job_1|supplier:sup_1|orders:po_1,po_2','missing_data']]);
 assert.equal(material[0].evidence.deliveryVerified,false);assert.equal(material[2].evidence.duplicateConfirmed,false);
 for(const c of material)assert.equal(cases.prepareInternalProposal({caseFile:c,commandCatalog:registry.definitions}).reason,'no_internal_command_for_material_review');
 assert.equal(material[1].evidence.plannedDate,null);assert.ok(!('estimatedDelivery' in material[1].evidence));
 const delivered=records();delivered[5]={...delivered[5],record:{...delivered[5].record,status:'Delivered'}};
 const after=byDetector(await readiness({context:context({records:delivered})}),'job.material_order_review');
 assert.deepEqual(after.map(c=>c.subjectKey),['jobs:job_1|supplyOrders:po_2']);
});

test('member sees job blockers but not purchase orders; viewer is denied; foreign tenant and smuggled fields fail closed',async()=>{
 const memberRecords=records().filter(r=>['jobs','crew','customers'].includes(r.type));
 const member=await readiness({context:context({role:'member',subject:'office_1',records:memberRecords}),scope:scope({role:'member',identity:identity('office_1')})});
 assert.equal(member.status,'evaluated');assert.ok(member.unknowns.includes('material_orders_not_visible_to_role'));
 assert.equal(byDetector(member,'job.material_order_review').length,0);assert.equal(byDetector(member,'job.field_blocker_unacknowledged').length,1);
 const viewer=await readiness({context:context({role:'viewer',subject:'v_1',records:memberRecords}),scope:scope({role:'viewer',identity:identity('v_1')})});
 assert.equal(viewer.status,'denied');assert.equal(viewer.reason,'role_not_permitted_for_detector');assert.ok(!JSON.stringify(viewer).includes('job_1'));
 const foreign=await readiness({scope:scope({businessId:'business_002'})});assert.equal(foreign.status,'denied');
 const smuggled=records();smuggled[0]={...smuggled[0],record:{...smuggled[0].record,fieldUpdates:[{...blocker(),note:'SECRET'}]}};
 assert.equal((await readiness({context:context({records:smuggled})})).status,'denied');
 assert.equal((await readiness({asOfDate:'2026-02-30'})).status,'invalid');
 assert.equal((await readiness({horizonDays:99})).reason,'invalid_horizon');
});

test('quote follow-up: due after fourteen days, contact restriction respected, internal task only',async()=>{
 const r=await followUp();
 const due=r.cases.find(c=>c.subjectKey==='quotes:q_1');
 assert.equal(due.conclusion,'needs_review');assert.equal(due.severity,'attention');assert.equal(due.evidence.daysSinceLastTouch,21);
 assert.equal(due.evidence.contactRestricted,true);assert.match(due.recommendation,/No outreach of any kind/);
 assert.deepEqual(due.evidence.communication,{drafted:false,approved:false,sent:false,acknowledged:false});
 assert.ok(!JSON.stringify(r).includes('Private customer'));
 const p=cases.prepareInternalProposal({caseFile:due,commandCatalog:registry.definitions,due:'2026-11-12'});
 assert.equal(p.status,'proposed_not_authorized');assert.equal(p.commandId,'quotation.followup.schedule');assert.equal(p.customerContact,'not_proposed');
 assert.deepEqual(p.params,{ref:{store:'quotes',id:'q_1'},due:'2026-11-12'});assert.equal(p.executed,false);
 assert.deepEqual(r.resolvedSubjects,[{subjectKey:'quotes:q_3',reason:'follow_up_not_yet_due'}]);
 assert.equal(r.cases.some(c=>c.subjectKey==='quotes:q_4'),false);
});

test('sent status without a trustworthy sent date is a data-quality missing_data case, never an overdue follow-up',async()=>{
 const r=await followUp();
 const c=r.cases.find(x=>x.subjectKey==='quotes:q_2');
 assert.equal(c.conclusion,'missing_data');assert.deepEqual(c.missingData,['sent_timestamp']);assert.equal(c.evidence.followUpDue,null);
 assert.match(c.recommendation,/Record the actual sent date/);
 assert.equal(cases.prepareInternalProposal({caseFile:c,commandCatalog:registry.definitions,due:'2026-11-12'}).reason,'evidence_incomplete');
 for(const bad of ['2026-02-30','10/20/2026','2026-10-20T00:00:00Z']){
  const rec=records();rec[7]={...rec[7],record:{...rec[7].record,sentDate:bad}};
  const x=(await followUp({context:context({records:rec})})).cases.find(k=>k.subjectKey==='quotes:q_1');
  assert.equal(x.conclusion,'missing_data',bad);assert.deepEqual(x.missingData,['sent_timestamp']);
 }
 const badStamp=records();badStamp[7]={...badStamp[7],record:{...badStamp[7].record,lastFollowUpAt:'yesterday'}};
 const y=(await followUp({context:context({records:badStamp})})).cases.find(k=>k.subjectKey==='quotes:q_1');
 assert.deepEqual(y.missingData,['follow_up_timestamp_invalid']);
});

test('recorded follow-up or contact resets the clock; owner follow-up date forces review; roles are enforced',async()=>{
 const touched=records();touched[7]={...touched[7],record:{...touched[7].record,lastFollowUpAt:'2026-11-08T15:00:00Z'}};
 const r=await followUp({context:context({records:touched})});
 assert.equal(r.cases.some(c=>c.subjectKey==='quotes:q_1'),false);
 const owner=records();owner[9]={...owner[9],record:{...owner[9].record,followup_date:'2026-11-09'}};
 const o=(await followUp({context:context({records:owner})})).cases.find(c=>c.subjectKey==='quotes:q_3');
 assert.equal(o.conclusion,'needs_review');assert.ok(o.priorityReasons.includes('owner_follow_up_date_reached'));assert.equal(o.evidence.contactRestriction,'unrecorded');
 const member=await followUp({context:context({role:'member',records:records().filter(x=>x.type!=='quotes'&&x.type!=='supplyOrders')}),scope:scope({role:'member'})});
 assert.equal(member.status,'denied');
 assert.equal((await followUp({followUpDays:0})).reason,'invalid_follow_up_window');
 const noCustomer=records();noCustomer[7]={...noCustomer[7],record:{...noCustomer[7].record,customerId:'ghost'}};
 const n=(await followUp({context:context({records:noCustomer})})).cases.find(c=>c.subjectKey==='quotes:q_1');
 assert.equal(n.conclusion,'missing_data');assert.ok(n.missingData.includes('customer_withheld_or_unavailable'));
});

test('replayed evaluations dedupe and local-pending triggers downgrade every readiness and quote case',async()=>{
 const first=await followUp();
 let state=cases.reconcileCases({existing:[],evaluation:first,now:NOW});
 for(let i=0;i<50;i++)state=cases.reconcileCases({existing:state.active,evaluation:await followUp(),now:NOW});
 assert.equal(state.active.length,first.cases.length);assert.equal(state.newCaseIds.length,0);
 const trigger=cases.createTrigger({source:'local_pending',tenantId:business,eventId:'domain:gui:1:jobs:job_1',recordRef:{type:'jobs',id:'job_1',revision:null,updatedAt:NOW},detectedAt:NOW});
 const pending=await readiness({trigger});
 assert.equal(pending.evidenceTrust,'local_unconfirmed');
 for(const c of pending.cases){assert.equal(c.conclusion,'missing_data');assert.ok(c.missingData.includes('server_confirmation_pending'));assert.equal(cases.prepareInternalProposal({caseFile:c,commandCatalog:registry.definitions}).status,'unsupported_capability')}
});
