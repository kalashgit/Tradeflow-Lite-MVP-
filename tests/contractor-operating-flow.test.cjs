const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fixture=require('./fixtures/contractor-operating-flow-v1.json');
const principal={verified:true,issuer:'verified.example',subject:'owner_001'};
function db(role='owner',mutate=x=>x){return {prepare(sql){assert.ok(sql.startsWith('SELECT'));return {bind(...args){return {first:async()=>({role}),all:async()=>({results:mutate(fixture.records).map(r=>({record_type:r.type,id:r.id,revision:r.revision,updated_at:fixture.asOf,payload:JSON.stringify({id:r.id,businessId:fixture.businessId,...r.record})}))})}}}}}}
test('seeded inquiry/quote/job/crew/cost/invoice/payment graph retains revisions and explicit missing collection evidence',async()=>{
 const {readIntelligenceContext}=await import('../src/intelligence-context.js');const before=JSON.stringify(fixture),context=await readIntelligenceContext({db:db(),principal,businessId:fixture.businessId,jobId:'job_01',now:()=>fixture.asOf});
 for(const type of ['opportunities','customers','quotes','jobs','crew','jobCosts','invoices','payments'])assert.ok(context.records.some(r=>r.type===type),type);
 assert.equal(context.missingReferences.length,0);assert.equal(context.records.find(r=>r.id==='job_01').revision,4);assert.equal(context.providerSettlementVerified,false);
 const payment=context.records.find(r=>r.id==='payment_01').record;assert.equal(payment.amount,3000);assert.equal(payment.settlementVerified,undefined);assert.equal(payment.provider,undefined);assert.ok(fixture.alternativeExplanations.length>=2);assert.equal(JSON.stringify(fixture),before);
});
test('existing intelligence detectors consume authorized graph without inventing settlement or automatically executing proposals',async()=>{
 const {readIntelligenceContext}=await import('../src/intelligence-context.js');const context=await readIntelligenceContext({db:db(),principal,businessId:fixture.businessId});
 const snapshot={};for(const row of context.records)(snapshot[row.type]||=[]).push({id:row.id,businessId:context.businessId,...row.record});
 const window={},box={window,document:{addEventListener(){}},Date,Intl,console,setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync('public/calendar.js','utf8'),box);vm.runInNewContext(fs.readFileSync('public/revenue.js','utf8'),box);
 const commands=require('../public/command-registry.js'),intelligence=require('../public/operational-intelligence.js');const engine=intelligence.createEngine({commands,detectors:[...intelligence.builtinDetectors,...intelligence.optimizationDetectors],calendar:window.TradeFlowCalendar,revenue:window.TradeFlowRevenue.financials});
 const findings=engine.evaluate(snapshot,{businessId:fixture.businessId,now:fixture.asOf,today:'2026-10-30'}).findings;
 assert.ok(findings.some(f=>f.detectorId==='job.budget_overrun_review'));assert.ok(findings.some(f=>f.detectorId==='job.labor_hours_variance_review'));assert.ok(!findings.some(f=>f.detectorId==='invoice.overdue'));assert.equal(context.executionAuthority,false);assert.equal(context.providerSettlementVerified,false);
});
test('same seeded job context for member never exposes costing, quotes, invoice amounts or payment records',async()=>{
 const {readIntelligenceContext}=await import('../src/intelligence-context.js');const context=await readIntelligenceContext({db:db('member'),principal,businessId:fixture.businessId,jobId:'job_01'});
 assert.ok(context.records.every(r=>!['quotes','invoices','payments','jobCosts'].includes(r.type)));assert.ok(context.missingReferences.some(r=>r.field==='quoteId'));assert.equal(context.executionAuthority,false);
});
