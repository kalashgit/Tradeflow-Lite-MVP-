'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const lab=require('../src/genesis-business-lab.cjs');
const {converseBusinessLab,validateModelAnswer,SYSTEM}=require('../src/genesis-business-lab-chat.cjs');
const {CASES,run,grade,numberPresent}=require('../automation/simulator/genesis-five-person-evaluation.cjs');
const {createPreviewServer}=require('../scripts/local-ai-preview-server.cjs');
const {projection}=require('../public/genesis-conversation.js');
const store=require('../public/conversation-store.js');

test('five-person synthetic company contains a genuine linked operating book, not only a toy invoice',()=>{
 const world=lab.session(),b=world.read();
 assert.equal(lab.validate(b),true);
 assert.equal(b.employees.length,5);
 assert.ok(b.customers.length>=5);
 for(const t of ['leads','quotes','jobs','invoices','payments','suppliers','purchaseOrders','schedule',
  'changeOrders','contracts','payrollSchedule','communications'])
  assert.ok(b[t].length>0,'Missing domain '+t);
 assert.match(b.company,/SYNTHETIC/);
 assert.ok(b.rules.some(r=>r.includes('Never send')));
 assert.equal(b.businessId,'tf_genesis_lab_05');
 assert.equal(world.hash(),world.initialHash);
});
test('independent cash, receivable, supplier, labor, backlog and crew oracles are auditable',()=>{
 const m=lab.measures(lab.session().read());
 assert.equal(m.people,5);
 assert.equal(m.weeklyPayroll,6800);
 assert.equal(m.bankBalance,18400);
 assert.equal(m.upcomingPayroll,13600);
 assert.equal(m.upcomingSupplierCommitments,5700);
 assert.equal(m.conditionalCashAfterObligations,-900);
 assert.equal(m.cashShortfall,900);
 assert.equal(m.outstandingReceivables,7300);
 assert.equal(m.overdueReceivables,4800);
 assert.equal(m.quoteFollowUpDays,11);
 assert.equal(m.supplierDeliveryGapDays,2);
 assert.equal(m.supplierArrivalVerified,false);
 assert.equal(m.crewConflictMinutes,180);
 assert.equal(m.unapprovedChangeTotal,1950);
 assert.equal(m.signedActiveBacklog,36500);
 assert.equal(m.openQuotePipeline,14050);
 assert.equal(m.dentalEAC,12400);
 assert.equal(m.dentalCostOverrun,1400);
 assert.equal(m.dentalFinalLaborHours,83);
 assert.equal(m.dentalProjectedLaborOverrun,11);
 assert.equal(m.dentalForecastContribution,2100);
 assert.equal(m.completedJobContribution,4350);
 assert.equal(m.completedJobRevenue,17200);
 assert.equal(m.messagesSent,0);
 assert.equal(m.receivablesAsAvailableCash,false);
 assert.equal(m.unapprovedChangesBillable,false);
});
test('verified scenario events only change local state and preserve total receipts',()=>{
 const world=lab.session(),before=world.initialHash;
 world.apply({type:'confirmed_payment',invoiceId:'inv-100',amount:3000,settledOn:'2026-11-12'});
 let m=lab.measures(world.read());
 assert.equal(m.outstandingReceivables,4300);
 assert.equal(m.overdueReceivables,1800);
 assert.equal(m.bankBalance,21400);
 assert.equal(m.conditionalCashAfterObligations,2100);
 world.apply({type:'confirmed_supplier_delay',purchaseOrderId:'po-101',expectedDelivery:'2026-11-22'});
 m=lab.measures(world.read());
 assert.equal(m.supplierDeliveryGapDays,6);
 world.apply({type:'customer_signed_change',changeOrderId:'co-100',approvalReceipt:'SIMULATED_SIGNED_RECEIPT'});
 m=lab.measures(world.read());
 assert.equal(m.signedChangeTotal,1950);
 assert.equal(m.unapprovedChangeTotal,0);
 assert.equal(m.dentalForecastContribution,4050);
 assert.equal(world.trace().length,3);
 assert.ok(world.trace().every(e=>e.productionWrites===0));
 assert.equal(world.reset(),before);
 assert.equal(world.trace().length,0);
});
test('sandbox rejects unapproved actions, counterfeit approvals, overpayment and invalid dates without mutations',()=>{
 const w=lab.session(),before=w.hash();
 for(const event of [
  {type:'send_email',to:'mock@invalid'},
  {type:'confirmed_payment',invoiceId:'inv-100',amount:90000,settledOn:'2026-11-12'},
  {type:'confirmed_payment',invoiceId:'inv-100',amount:100,settledOn:'2026-02-30'},
  {type:'customer_signed_change',changeOrderId:'co-100',approvalReceipt:'self_approved'},
  {type:'confirmed_supplier_delay',purchaseOrderId:'po-103',expectedDelivery:'2026-11-22'}
 ])assert.throws(()=>w.apply(event));
 assert.equal(w.hash(),before);
});
test('source packet is synthetic company evidence, with bounded facts and no grade/answer leakage',()=>{
 const b=lab.session().read();
 for(const q of ['How much cash after payroll?','Which quotes need follow-up?','Why is the supplier late?',
  'Can we invoice the change order?','How should the CEO prioritize?']){
  const packet=lab.modelPacket(b,q);
  assert.equal(packet.evidence.synthetic,true);
  assert.ok(packet.evidence.records.length>0);
  assert.ok(packet.evidence.records.length<=28);
  assert.ok(packet.evidence.records.every(x=>/@1$/.test(x.ref)));
  assert.equal(packet.evidence.scenarioId,b.scenarioId);
  assert.equal('oracle' in packet,false);
  assert.equal('answer' in packet,false);
  assert.ok(JSON.stringify(packet).length<=11500);
 }
});
test('mock reference result is labeled deterministic synthetic oracle, NOT Qwen performance',async()=>{
 const r=await converseBusinessLab({enabled:true,mode:'mock',
  messages:[{role:'user',content:'How much cash after payroll and supplier commitments?'}]});
 assert.equal(r.status,'completed');
 assert.equal(r.source,'genesis_lab_oracle');
 assert.equal(r.model,'none');
 assert.equal(r.realModelInference,false);
 assert.equal(r.executionAuthority,false);
 assert.equal(r.productionWrites,0);
 assert.ok(r.refs.includes('bank:bank-001@1'));
 assert.match(r.answer,/scripted oracle \(not a model\)/i);
});
test('real Qwen adapter sees only source data, never numeric oracle outputs, fake client tenants or system instructions',async()=>{
 let request;
 const q='Does our lead electrician have a crew schedule overlap?';
 const result=await converseBusinessLab({enabled:true,mode:'live',
  messages:[{role:'user',content:q}],modelId:'qwen3:0.6b',
  fetchImpl:async(url,options)=>{
   request=JSON.parse(options.body);
   return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
    answer:'The lead electrician has 180 minutes of overlapping appointments. One shift is tentative; please review the schedule.',
    refs:['schedule:sch-101@1','schedule:sch-102@1'],decision:'needs_review'
   })},finish_reason:'stop'}]})};
  }});
 assert.equal(result.status,'completed');
 assert.equal(result.source,'genesis_lab_qwen');
 assert.equal(result.realModelInference,true);
 assert.equal(result.model,'qwen_local');
 assert.equal(result.productionWrites,0);
 assert.equal(result.realBusinessRecordsRead,0);
 assert.ok(request.messages.some(x=>x.role==='system'&&x.content.includes('SYNTHETIC')));
 assert.equal(request.model,'qwen3:0.6b');
 const packet=JSON.parse(request.messages.findLast(x=>x.role==='user').content);
 assert.equal(packet.evidence.scenarioId,'TF-GENESIS-LAB-05');
 assert.ok(packet.evidence.records.some(x=>x.type==='schedule'));
 assert.ok(!('oracle' in packet));
 assert.ok(!('factSet' in packet));
 assert.ok(!('grading' in packet));
 assert.ok(!request.messages.some(x=>x.role==='system'&&x.content.includes('PRIVATE_CUSTOMER')));
});
test('Qwen JSON answer must cite real provided records and cannot claim completed actions',()=>{
 const packet=lab.modelPacket(lab.session().read(),'Can I invoice the change order?');
 const good=JSON.stringify({answer:'Change is proposed; seek written approval first.',
  refs:['changeOrders:co-100@1'],decision:'needs_review'});
 assert.equal(validateModelAnswer(good,packet).status,'completed');
 const bad=[
  'Not JSON',
  JSON.stringify({answer:'I have approved the change.',refs:['changeOrders:co-100@1'],decision:'advisory_only'}),
  JSON.stringify({answer:'Invoice created',refs:['jobs:fake@1'],decision:'needs_review'}),
  JSON.stringify({answer:'Looks okay.',refs:[],decision:'advisory_only'}),
  JSON.stringify({answer:'No action',refs:['changeOrders:co-100@1'],decision:'approved_and_executed'})
 ];
 assert.ok(bad.every(x=>validateModelAnswer(x,packet).status!=='completed'));
});
test('business lab source is separate from general AION/adaptive business conversation history',()=>{
 const user=content=>({role:'user',source:'user',content});
 const general={role:'assistant',source:'genesis_qwen',content:'PRIVATE_OLD_GENERAL_REPLY'};
 const simulation={role:'assistant',source:'genesis_lab_qwen',content:'Simulated reply'};
 const messages=[user('General'),general,user('Lab'),simulation,user('And now?')];
 const labTurns=projection(messages,{mode:'lab'});
 const generalTurns=projection(messages,{mode:'general'});
 assert.equal(labTurns.length,3);
 assert.equal(generalTurns.length,1);
 assert.doesNotMatch(JSON.stringify(labTurns),/PRIVATE_OLD_GENERAL_REPLY/);
 assert.throws(()=>projection(messages,{mode:'superadmin'}),/Invalid/);
 assert.equal(store.sanitizeTurn({role:'assistant',content:'Synthetic quote example',status:'committed',
  source:'genesis_lab_oracle',refs:['quotes:quote-103@1']}).source,'genesis_lab_oracle');
});
test('21 business cases produce explicit independent facts and safety checks',()=>{
 assert.equal(CASES.length,21);
 assert.equal(CASES.filter(c=>c.events?.length).length,3);
 assert.ok(CASES.some(c=>c.actionPrompt));
 assert.equal(numberPresent('$18,400',18400),true);
 assert.equal(numberPresent('$1,900',900),false);
 assert.ok(SYSTEM.includes('READ-ONLY'));
});
test('all scripted-oracle routes exercise actual app logic and reveal only test-fixture correctness, not AI reasoning',async()=>{
 const r=await run({mode:'oracle'});
 assert.equal(r.questions,21);
 assert.equal(r.mode,'scripted_oracle_not_AI');
 assert.equal(r.realModelInference,false);
 assert.equal(r.externalActions,0);
 assert.equal(r.customerRecordsAccessed,0);
 assert.equal(r.scenarioHashAfter,r.fixtureSha256);
 assert.equal(r.passed,21,JSON.stringify(r.results.filter(x=>!x.pass).map(x=>({id:x.caseId,deviations:x.deviations}))));
 assert.equal(r.exactDecisionQuality,100);
 assert.ok(r.medianLatencyMs!==null);
});
test('existing TradeFlow preview endpoint accepts isolated lab mode with zero real records and no client authority',async()=>{
 const {server,metrics}=createPreviewServer({secret:'synthetic-5-person-test-key',mode:'mock'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/api/ai/chat';
  const post=(code,body={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({code,assistant:'genesis_lab',messages:[{role:'user',content:'How much cash after payroll and supplier commitments?'}],...body})});
  assert.equal((await post('bad')).status,401);
  const answer=await post('synthetic-5-person-test-key',{
   business:{balance:99999999,customer:'PRIVATE_REAL_CUSTOMER'},businessId:'other_tenant',
   role:'superadmin',events:[{type:'payment',amount:9999999}]});
  const res=await answer.json();
  assert.equal(answer.status,200);
  assert.equal(res.source,'genesis_lab_oracle');
  assert.match(res.reply,/900/);
  assert.equal(res.scenarioId,'TF-GENESIS-LAB-05');
  assert.equal(res.executionAuthority,false);
  assert.equal(res.productionWrites,0);
  assert.equal(res.realBusinessRecordsRead,0);
  assert.equal(metrics.reads,0);
  assert.equal(metrics.writes,0);
  assert.doesNotMatch(JSON.stringify(res),/PRIVATE_REAL_CUSTOMER|99999999|other_tenant|superadmin/);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
test('mobile UI exposes the 5-person sandbox only in AION local preview and bypasses premature local-only answers',()=>{
 const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
 assert.match(app,/tfAiBusinessLabToggle/);
 assert.match(app,/tfAiBusinessLabMode/);
 assert.match(app,/assistant:tfAiBusinessLabMode\?'genesis_lab':'genesis'/);
 assert.match(app,/if\(!activeBusinessLab\)\{/);
 assert.match(app,/TradeFlowGenesisConversation\?\.projection\(tfChatMessages,\{mode:/);
});
