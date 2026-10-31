'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const commands=require('../public/command-registry.js'),intelligence=require('../public/operational-intelligence.js');
const window={},document={addEventListener(){}};const box={window,document,Date,Intl,console,setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync('public/calendar.js','utf8'),box);vm.runInNewContext(fs.readFileSync('public/revenue.js','utf8'),box);
const engine=intelligence.createEngine({commands,calendar:window.TradeFlowCalendar,revenue:window.TradeFlowRevenue.financials});
const OPTIONS={now:'2026-10-18T12:00:00.000Z',today:'2026-10-18'};
const evaluate=d=>engine.evaluate(d,OPTIONS);
const invoice=(id,extra={})=>({id,customerId:'c1',status:'Issued',dueDate:'2026-10-10',currency:'USD',lines:[{qty:1,unitPrice:100}],taxRate:0,...extra});
function records(){return {customers:[{id:'c1',name:'Local customer'}],tasks:[{id:'t1',title:'Overdue',status:'Open',due:'2026-10-10',customerId:'c1',priority:'High'},{id:'done',status:'Done',due:'2026-10-01'},{id:'today',status:'Open',due:'2026-10-18'},{id:'bad-date',status:'Open',due:'2026-02-30'}],jobs:[{id:'j1',title:'Work A',date:'2026-10-18',scheduleTime:'09:00',durationMinutes:60,assignedTo:'owner',customerId:'c1'},{id:'j2',title:'Work B',date:'2026-10-18',scheduleTime:'09:30',durationMinutes:60,assignedTo:'owner',customerId:'c1'}],calendarEntries:[],quotes:[{id:'q1',status:'Accepted',customerId:'c1',title:'Accepted work'},{id:'q2',status:'Sent',sentDate:'2026-09-20',customerId:'c1',title:'Open quote'},{id:'q3',status:'Draft',sentDate:'2026-09-01',customerId:'c1'}],invoices:[invoice('i1')],payments:[]}}
test('all five detectors return stable evidence contracts without changing input',()=>{
 const data=records(),before=JSON.stringify(data),result=evaluate(data);
 assert.equal(result.findings.length,5);assert.equal(result.diagnostics.length,0);assert.equal(JSON.stringify(data),before);
 assert.equal(new Set(result.findings.map(x=>x.detectorId)).size,5);
 for(const f of result.findings){assert.ok(f.id&&f.recordRefs.length&&f.explanation&&f.confidence&&f.limitations.length&&f.priority&&f.proposedAction&&f.status);assert.equal(f.evaluatedAt,OPTIONS.now);assert.equal(f.status,'ready_for_review')}
 const reversed=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,Array.isArray(v)?v.slice().reverse():v]));assert.deepEqual(evaluate(reversed).findings.map(x=>x.id),result.findings.map(x=>x.id));
 assert.deepEqual(evaluate(data).findings,result.findings);
});
test('completion, future dates, invalid dates and confirmed handoffs are hard exclusions',()=>{
 const data=records();data.jobs.push({id:'linked-job',quoteId:'q1',customerId:'c1',status:'Planned'});data.quotes.push({id:'recent',status:'Sent',sentDate:'2026-10-17',customerId:'c1'},{id:'contacted',status:'Sent',sentDate:'2026-09-01',lastContactAt:'2026-10-17T09:00:00Z',customerId:'c1'});
 const f=evaluate(data).findings;assert.equal(f.filter(x=>x.detectorId==='task.overdue').length,1);assert.equal(f.filter(x=>x.detectorId==='quotation.accepted_handoff').length,0);assert.equal(f.filter(x=>x.detectorId==='quotation.stale_open').length,1);
 const configured=engine.evaluate(data,{...OPTIONS,staleQuoteDays:60});assert.equal(configured.findings.filter(x=>x.detectorId==='quotation.stale_open').length,0);
});
test('calendar conflicts preserve resources and include hidden layers, but exclude cancelled bookings',()=>{
 const d={customers:[],tasks:[],jobs:[],calendarPreferences:[{id:'local-owner',hiddenLayerIds:['personal'],horizonDays:7}],calendarEntries:[{id:'a',title:'Private',date:'2026-10-19',time:'10:00',durationMinutes:60,calendarId:'personal',ownerId:'crew-a'},{id:'b',date:'2026-10-19',time:'10:30',durationMinutes:60,ownerId:'crew-b'}]};
 assert.equal(evaluate(d).findings.length,0,'Separate crew are not a resource conflict');d.calendarEntries[1].ownerId='crew-a';assert.equal(evaluate(d).findings.length,1,'Hidden booked layers still consume capacity');d.calendarEntries[1].status='Cancelled';assert.equal(evaluate(d).findings.length,0);
});
test('overdue invoices include partial payments, exclude paid/draft/void and retain currency',()=>{
 const d=records();d.invoices=[invoice('partial'),invoice('paid'),invoice('draft',{status:'Draft'}),invoice('void',{status:'Void'}),invoice('future',{dueDate:'2026-10-25'})];d.payments=[{id:'p1',invoiceId:'partial',customerId:'c1',currency:'USD',amount:30,manual:true},{id:'p2',invoiceId:'paid',customerId:'c1',currency:'USD',amount:100}];
 const invoices=evaluate(d).findings.filter(x=>x.detectorId==='invoice.overdue');assert.equal(invoices.length,1);assert.equal(invoices[0].evidence.remaining,70);assert.equal(invoices[0].evidence.currency,'USD');assert.equal(invoices[0].evidence.paymentRefs[0].id,'p1');assert.ok(invoices[0].limitations.some(x=>x.includes('not bank')));
 assert.equal(window.TradeFlowRevenue.financials.displayState(d.invoices[0],d.payments,'2026-10-18'),'Overdue');
 window.TradeFlowRevenue.filterView('Unpaid');const html=window.TradeFlowRevenue.render('invoices',d);assert.ok(html.includes('data-id="partial"'));assert.ok(!html.includes('data-id="paid"'));window.TradeFlowRevenue.filterView('All');
});
test('financial inconsistencies and broken relationships block actions before ranking',()=>{
 const d=records();d.invoices=[invoice('mismatch')];d.payments=[{id:'p',invoiceId:'mismatch',customerId:'another',amount:20,currency:'EUR'}];d.tasks.push({id:'blocked',title:'High priority dependency',due:'2025-01-01',status:'Open',priority:'Critical',dependencies:['missing']});d.quotes[0].customerId='missing';
 const result=evaluate(d),invoiceFinding=result.findings.find(x=>x.detectorId==='invoice.overdue');assert.equal(invoiceFinding.status,'blocked');assert.equal(invoiceFinding.evidence.remaining,null);assert.equal(invoiceFinding.priority.tier,3);
 const accepted=result.findings.find(x=>x.detectorId==='quotation.accepted_handoff');assert.equal(accepted.status,'blocked');assert.equal(accepted.proposedAction,null);assert.ok(accepted.recordRefs.some(x=>x.id==='q1'));
 const blocked=result.findings.find(x=>x.recordRefs.some(r=>r.id==='blocked'));assert.equal(blocked.priority.tier,3);assert.ok(blocked.priority.score>100);
 assert.equal(result.findings[0].detectorId,'calendar.conflict','Today resource conflict precedes high numeric task scores');assert.ok(result.findings.indexOf(blocked)>result.findings.findIndex(x=>x.recordRefs.some(r=>r.id==='t1')));
 const overflow=records();overflow.invoices=[invoice('overflow',{lines:[{qty:1e300,unitPrice:1e300}]})];const bad=evaluate(overflow).findings.find(x=>x.detectorId==='invoice.overdue');assert.equal(bad.status,'blocked');assert.equal(bad.evidence.remaining,null);
});
test('duplicate findings collapse and duplicate record IDs are never silently trusted',()=>{
 const d=records();d.tasks.push({...d.tasks[0]});const result=evaluate(d);const f=result.findings.filter(x=>x.detectorId==='task.overdue');assert.equal(f.length,1);assert.equal(f[0].status,'blocked');
 const detector={id:'custom',evaluate:()=>[1,2].map(()=>({type:'custom',refs:[{store:'tasks',id:'t1'}],explanation:'Review local task',confidence:'record_based',limitations:['Local only'],priority:{tier:2,score:1},action:{commandId:'record.open',params:{ref:{store:'tasks',id:'t1'}}}}))};
 const custom=intelligence.createEngine({commands,detectors:[detector]}).evaluate(records(),OPTIONS);assert.equal(custom.findings.length,1);
});
test('modular interface isolates failures, validates outputs and reports missing adapters honestly',()=>{
 const incomplete=intelligence.createEngine({commands}).evaluate(records(),OPTIONS);assert.equal(incomplete.diagnostics.filter(x=>x.status==='unavailable').length,2);
 const detectors=[{id:'bad',evaluate:()=>[{}]},{id:'mutate',evaluate:d=>{d.tasks[0].status='Done';return []}}];const data=records();const r=intelligence.createEngine({commands,detectors}).evaluate(data,OPTIONS);assert.equal(r.findings.length,0);assert.equal(r.diagnostics.length,2);assert.equal(data.tasks[0].status,'Open');
 assert.throws(()=>intelligence.createEngine({commands,detectors:[detectors[0],detectors[0]]}),/unique identifiers/);
});
test('foreign business records are excluded and no fabricated outcomes or executable authority appear',()=>{
 const data=records();for(const s of Object.keys(data))if(Array.isArray(data[s]))data[s]=data[s].map(x=>({...x,businessId:'another-business'}));assert.equal(evaluate(data).findings.length,0);
 const finding=evaluate(records()).findings.find(x=>x.detectorId==='quotation.stale_open');assert.equal(finding.confidence,'limited');const resolved=commands.resolve(finding.proposedAction,records(),{today:'2026-10-18'});assert.equal(resolved.effect,'draft');assert.equal(resolved.approval,'review_on_save');
});

test('invoice follow-up task never clears overdue finding without recorded payment resolution',()=>{
 const data=records();
 const initial=evaluate(data).findings.filter(f=>f.detectorId==='invoice.overdue');
 assert.equal(initial.length,1);
 data.tasks.push({id:'invoice-followup',invoiceId:'i1',customerId:'c1',
  taskKind:'invoice_follow_up',title:'Review unpaid invoice',status:'Open',due:'2026-10-19'});
 const afterTask=evaluate(data).findings.filter(f=>f.detectorId==='invoice.overdue');
 assert.equal(afterTask.length,1,'Internal task does not equal payment or customer contact');
 data.payments.push({id:'payment-i1',invoiceId:'i1',customerId:'c1',amount:100,currency:'USD'});
 const afterPayment=evaluate(data).findings.filter(f=>f.detectorId==='invoice.overdue');
 assert.equal(afterPayment.length,0,'Recorded full balance resolves local-ledger warning');
});
