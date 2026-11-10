'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const commands=require('../../../public/command-registry.js');
const core=require('../../../public/core-integration.js');
const {createDB,snapshot:readDB,put}=require('../../../tests/helpers/local-db.cjs');
const {createAionCapabilityBridge}=require('./aion-capability-bridge.cjs');
const fixture=require('../../../automation/simulator/businesses.v1.json');
const generated=path.join(__dirname,'..','aion-tools-evidence.json');
function contract(){
 const doc=JSON.parse(fs.readFileSync(generated,'utf8'));
 assert.equal(doc.synthetic,true);
 assert.equal(doc.realTenant,false);
 assert.equal(doc.cases.length,21);
 return doc;
}
function makeHost({businessId='TF-SIM-05',day=0,approved=true,grants,malformedEvidence=false}={}){
 const doc=contract();
 const source=fixture.businesses.find(b=>b.id===businessId);
 const caseRow=doc.cases.find(x=>x.businessId===businessId&&x.day===day);
 assert.ok(source&&caseRow);
 const data={
  customers:source.customers.map(x=>({...x,businessId})),
  quotes:source.quotes.map(x=>({...x,businessId})),
  jobs:source.jobs.map(x=>({...x,businessId})),
  invoices:source.invoices.map(x=>({...x,businessId,reference:x.id,currency:'USD',taxRate:0,
                                  lines:[{description:'Synthetic invoice line',qty:1,unitPrice:x.amount}]})),
  payments:source.payments.map(x=>({...x,businessId,currency:'USD',
                    customerId:source.invoices.find(i=>i.id===x.invoiceId)?.customerId})),
  calendarEntries:(source.calendarEntries||[]).map(x=>({...x,businessId})),
  opportunities:(source.opportunities||[]).map(x=>({...x,businessId}))
 };
 const db=createDB(data);
 const called=[],approvalRequests=[];
 let n=0,requested=0,permissionSet=grants||new Set([
  'read','navigate','draft','modify:invoice.followup.schedule',
  'modify:quotation.followup.schedule','modify:job.cost_review.schedule',
  'modify:opportunity.bid_review.schedule','modify:job.change_order.review.schedule'
 ]);
 const runtime=commands.createRuntime({
  snapshot:()=>readDB(db),
  context:()=>({actor:'synthetic-owner',businessId,today:'2026-11-10',sourcePage:'invoices',
                primaryTrade:'Electrical'}),
  uid:()=> 'aion-test-'+(++n),
  now:()=> '2026-11-10T15:00:00.000Z',
  ledger:commands.createLedger(db),
  can:permission=>permissionSet.has(permission),
  ports:{
   review:async()=>{called.push({kind:'review'});return {synthetic:true,readOnly:true}},
   navigate:async(workspace)=>{called.push({kind:'navigate',workspace});return {workspace}},
   filter:async(workspace,filter)=>{called.push({kind:'filter',workspace,filter});return {workspace,filter}},
   prepareDraft:async draft=>{called.push({kind:'draft'});return draft},
   operation:async(kind,payload,proof)=>{
     called.push({kind:'operation',command:kind,approved:proof.approved});
     return core.execute({db,kind,payload,requestKey:proof.requestKey,
       recordGuard:proof.recordGuard,actor:proof.actor,businessId:proof.businessId,
       approved:proof.approved,uid:()=> 'aion-task-'+(++requested)});
   }
  }
 });
 let syntheticSnapshot=structuredClone(caseRow.snapshot);
 if(malformedEvidence){
   const row=syntheticSnapshot.signals.find(s=>s.id==='overdue_receivable');
   if(row)row.evidenceRefs=['invoices:forged-id'];
 }
 const bridge=createAionCapabilityBridge({
   runtime,getTrustedSnapshot:()=>structuredClone(syntheticSnapshot),
   verifyOwnerGesture:async claim=>{
     approvalRequests.push(claim);
     return approved?{approved:true,requestId:claim.requestId,businessId:claim.businessId,
                      source:'trusted_owner_ui'}:{approved:false,requestId:claim.requestId,
                                                  businessId:claim.businessId,source:'trusted_owner_ui'};
   }
 });
 return {bridge,runtime,db,called,approvalRequests,
   get evidence(){return structuredClone(syntheticSnapshot)},
   mutateEvidence:fn=>fn(syntheticSnapshot)
 };
}
test('AION plans are grounded in 21 real synthetic Twin snapshots, not fabricated model actions',()=>{
 const doc=contract();
 assert.deepEqual([...new Set(doc.cases.map(x=>x.businessId))].sort(),['TF-SIM-05','TF-SIM-12','TF-SIM-20']);
 assert.ok(doc.cases.every(x=>x.snapshot.recordProvenance.includes('synthetic fixture')));
 assert.ok(doc.cases.some(x=>x.aionRecommendations.includes('overdue_receivable')));
});
test('AION proactively invokes the ACTUAL TradeFlow read and workspace commands',async()=>{
 const h=makeHost();
 const review=await h.bridge.review();
 assert.equal(review.status,'succeeded');
 const navigation=await h.bridge.propose('cash_pressure');
 assert.equal(navigation.status,'succeeded');
 assert.equal(navigation.commandId,'workspace.open');
 assert.deepEqual(h.called.filter(x=>x.kind==='navigate').map(x=>x.workspace),['expenses']);
 assert.ok(h.bridge.history().some(x=>x.kind==='read_only_action'));
 assert.equal((await readDB(h.db)).tasks.length,0);
});
test('AION prepares existing TradeFlow overdue invoice command but cannot execute without owner UI',async()=>{
 const h=makeHost();
 const draft=await h.bridge.propose('overdue_receivable');
 assert.equal(draft.status,'owner_review_required');
 assert.equal(draft.commandId,'invoice.followup.schedule');
 assert.deepEqual(draft.evidenceRefs.includes('invoices:i-101'),true);
 const blocked=await h.runtime.execute(draft.commandRequestId);
 assert.notEqual(blocked.status,'succeeded');
 assert.equal((await readDB(h.db)).tasks.length,0);
 const result=await h.bridge.ownerApprove(draft.commandRequestId);
 assert.equal(result.status,'succeeded',JSON.stringify(result));
 assert.equal(result.ownerApprovalVerified,true);
 assert.equal(h.called.filter(x=>x.kind==='operation').length,1);
 const state=await readDB(h.db);
 assert.equal(state.tasks.length,1);
 assert.equal(state.tasks[0].taskKind,'invoice_follow_up');
 assert.equal(state.tasks[0].invoiceId,'i-101');
 assert.equal(state.invoices[0].status,'Issued');
 assert.equal(state.payments.length,1);
 assert.equal(h.approvalRequests.length,1);
 assert.equal((await h.bridge.ownerApprove(draft.commandRequestId)).status,'denied');
 assert.equal((await h.bridge.propose('overdue_receivable')).status,'already_proposed');
 assert.equal((await readDB(h.db)).tasks.length,1);
});
test('denied owner gesture leaves no task, invoice change or outside communication',async()=>{
 const h=makeHost({approved:false});
 const draft=await h.bridge.propose('overdue_receivable');
 const result=await h.bridge.ownerApprove(draft.commandRequestId);
 assert.equal(result.status,'owner_declined');
 assert.equal(h.called.filter(x=>x.kind==='operation').length,0);
 assert.equal((await readDB(h.db)).tasks.length,0);
 assert.equal((await readDB(h.db)).invoices[0].status,'Issued');
});
test('stale invoice/payment evidence is checked again by existing command runtime',async()=>{
 const h=makeHost();
 const draft=await h.bridge.propose('overdue_receivable');
 await put(h.db,'payments',{id:'late-payment',businessId:'TF-SIM-05',invoiceId:'i-101',
    customerId:'c-101',amount:100,currency:'USD'});
 const result=await h.bridge.ownerApprove(draft.commandRequestId);
 assert.notEqual(result.status,'succeeded');
 assert.equal((await readDB(h.db)).tasks.length,0);
 assert.equal(h.called.filter(x=>x.kind==='operation').length,0);
});
test('model prompt or forged reference cannot select unauthorized TradeFlow commands',async()=>{
 const h=makeHost({malformedEvidence:true});
 await assert.rejects(()=>h.bridge.propose('wire_business_money'),/Unregistered/);
 const bad=await h.bridge.propose('overdue_receivable');
 assert.equal(bad.status,'unavailable');
 assert.equal(h.called.filter(x=>x.kind==='operation').length,0);
});
test('permission restrictions still apply when AION recommends an allowed capability',async()=>{
 const h=makeHost({grants:new Set(['read','navigate'])});
 const blocked=await h.bridge.propose('overdue_receivable');
 assert.equal(blocked.status,'unavailable');
 assert.equal(h.called.filter(x=>x.kind==='operation').length,0);
});
test('AION can launch actual calendar conflict view without rescheduling crews',async()=>{
 const h=makeHost({businessId:'TF-SIM-20'});
 const result=await h.bridge.propose('crew_conflict');
 assert.equal(result.status,'succeeded');
 assert.equal(result.commandId,'view.filter');
 assert.deepEqual(h.called.filter(x=>x.kind==='filter').map(x=>[x.workspace,x.filter]),
   [['calendar','conflicts']]);
 assert.equal(h.called.filter(x=>x.kind==='operation').length,0);
});
test('AION rejects stale or revoked signals when owner returns to an old approval',async()=>{
 const h=makeHost();
 const d=await h.bridge.propose('overdue_receivable');
 h.mutateEvidence(snapshot=>{snapshot.signals=snapshot.signals.filter(s=>s.id!=='overdue_receivable')});
 assert.equal((await h.bridge.ownerApprove(d.commandRequestId)).status,'stale');
 assert.equal((await readDB(h.db)).tasks.length,0);
});
test('capability schema is identical to existing TradeFlow registry with explicit approvals',()=>{
 const h=makeHost(),c=h.bridge.capabilities();
 for(const item of c){
   const existing=commands.definitions.find(d=>d.id===item.commandId);
   assert.ok(existing);
   assert.equal(item.effect,existing.effect);
   assert.equal(item.approval,existing.approval);
 }
 assert.ok(c.some(x=>x.commandId==='invoice.followup.schedule'&&x.approval==='explicit'));
});
