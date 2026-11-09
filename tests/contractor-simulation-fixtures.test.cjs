'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fixture=require('../automation/simulator/businesses.v1.json');
test('simulator uses three bounded synthetic contractors',()=>{
 assert.equal(fixture.schemaVersion,1);
 assert.equal(fixture.synthetic,true);
 assert.deepEqual(fixture.businesses.map(b=>b.employees),[5,12,20]);
 assert.equal(new Set(fixture.businesses.map(b=>b.id)).size,3);
 for(const b of fixture.businesses){
  assert.match(b.name,/SYNTHETIC/);
  assert.ok(b.expectedSignals.length>0);
  assert.ok(b.expectedDecisions.length>0);
  const ids=new Set();
  for(const kind of ['customers','quotes','jobs','invoices','payments','calendarEntries','opportunities']){
   for(const x of b[kind]||[]){assert.ok(!ids.has(x.id),'duplicate local id '+x.id);ids.add(x.id)}
  }
  const cust=new Set(b.customers.map(x=>x.id));
  const jobs=new Set(b.jobs.map(x=>x.id));
  for(const q of b.quotes)assert.ok(cust.has(q.customerId));
  for(const j of b.jobs)assert.ok(cust.has(j.customerId));
  for(const i of b.invoices){
   assert.ok(cust.has(i.customerId));
   if(i.jobId)assert.ok(jobs.has(i.jobId));
  }
  const invoiceIds=new Set(b.invoices.map(x=>x.id));
  for(const p of b.payments)assert.ok(invoiceIds.has(p.invoiceId));
 }
});
test('fixtures cover core contractor pain point signals without asserting simulated outcomes',()=>{
 const signals=new Set(fixture.businesses.flatMap(b=>b.expectedSignals));
 for(const x of ['quote_followup_due','overdue_invoice_balance','job_budget_overrun','labor_overrun','change_order_approval_required','crew_schedule_conflict','bid_readiness_incomplete'])assert.ok(signals.has(x));
 assert.ok(fixture.safetyRules.some(x=>x.includes('Never send')));
 assert.ok(fixture.safetyRules.some(x=>x.includes('production')));
});
