'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const intelligence=require('../public/operational-intelligence.js'),commands=require('../public/command-registry.js');
const app=fs.readFileSync('public/app.js','utf8'),form=fs.readFileSync('public/opportunity-dossier.js','utf8'),notifications=fs.readFileSync('public/notifications.js','utf8');
const engine=intelligence.createEngine({commands,detectors:intelligence.optimizationDetectors});
const opts={today:'2026-10-28',now:'2026-10-28T12:00:00.000Z'};
const data=()=>({opportunities:[{id:'a',status:'New',bid_deadline:'2026-10-30',bid_deadline_evidence:'Confirmed invitation version 2, issued by GC'}]});
test('confirmed bid deadline surfaces with a record reference and no fabricated submission',()=>{
 const result=engine.evaluate(data(),opts),f=result.findings.find(x=>x.detectorId==='opportunity.bid_deadline');
 assert.ok(f);assert.equal(f.recordRefs[0].store,'opportunities');assert.equal(f.evidence.bidDeadline,'2026-10-30');
 assert.ok(f.limitations.some(x=>x.includes('background push')));assert.equal(f.confidence,'limited');
});
test('unverified, malformed, future or closed bid deadlines are excluded',()=>{
 for(const update of [{bid_deadline_evidence:''},{bid_deadline:'2026-02-30'},{bid_deadline:'2026-11-20'},{status:'Won'},{status:'Lost'}]){
  const d=data();Object.assign(d.opportunities[0],update);
  assert.equal(engine.evaluate(d,opts).findings.some(f=>f.detectorId==='opportunity.bid_deadline'),false,JSON.stringify(update));
 }
});
test('bid deadline is separate from follow-up with required owner evidence',()=>{
 assert.ok(form.includes('name="bid_deadline"'));
 assert.ok(form.includes('name="bid_deadline_evidence"'));
 assert.ok(form.includes('name="followup_date"'));
 assert.ok(app.includes('bid_deadline:bidDeadline,bid_deadline_evidence:bidDeadlineEvidence'));
 assert.ok(app.includes('bidDeadlineEvidence.length<12'));
 assert.ok(notifications.includes("'opportunity.bid_deadline':['Upcoming bid submission deadline','opportunities']"));
});
