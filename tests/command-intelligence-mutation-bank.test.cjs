'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {readBank,evaluate}=require('../scripts/evaluate-command-mutations.cjs'),engine=require('../public/command-intelligence');
test('supplied bank contains 282 unique synthetic records and remains separate from runtime rules',()=>{
 const rows=readBank();assert.equal(rows.length,282);assert.equal(new Set(rows.map(r=>r.id)).size,282);assert.ok(rows.every(r=>r.source.startsWith('synthetic_')));
 const runtime=fs.readFileSync(path.join(__dirname,'../public/command-intelligence.js'),'utf8');assert.ok(!runtime.includes('Universal_Mutation_Bank'));assert.ok(!runtime.includes('MUT-'));assert.ok(!runtime.includes('observed_or_generated'));
});
test('every mutation receives a transparent evaluation classification without assuming canonical equivalence',()=>{
 const report=evaluate();assert.equal(report.total,282);assert.equal(report.cases.length,282);assert.equal(Object.values(report.counts).reduce((a,b)=>a+b,0),282);assert.equal(report.lexical.total,202);assert.equal(report.lexical.templated,100);assert.equal(report.counts.no_context_template,102);assert.equal(report.transcription.status,'not_measured');assert.equal(report.execution.status,'not_measured');
 assert.ok(report.counts.semantic_difference>0);assert.ok(report.counts.clarification_or_recovery_gap>0);assert.ok(report.counts.baseline_outside_supported_intents>0);
});
test('all 31 designated bank safety gates require clarification and suppress actionable suggestions',()=>{
 const report=evaluate();assert.equal(report.safety.evaluated,31);assert.equal(report.safety.passed,31);assert.equal(report.safety.failed,0,JSON.stringify(report.cases.filter(c=>c.classification==='safety_gap')));
 const cutoff=report.cases.find(c=>c.id==='MUT-0267');assert.equal(cutoff.actual.clarificationRequired,true);
});
test('mutated phone values are preserved rather than corrected to bank canonical digits',()=>{
 const report=evaluate(),changed=report.cases.find(c=>c.id==='MUT-0240');assert.equal(changed.actual.parameters.fields.phone,'+15125550149');assert.equal(changed.baseline.parameters.fields.phone,'+15125550147');assert.notEqual(changed.classification,'contextual_agreement');
 const short=report.cases.find(c=>c.id==='MUT-0239');assert.equal(short.actual.clarificationRequired,true);
});
test('conditional text and trailing prepositions block proposals even for otherwise complete drafts',()=>{
 const c={customers:[],today:'2026-10-21'};
 for(const t of ['Create customer Avery Jones. Phone 5125550147 if the customer confirms.','Create customer Avery Jones. Phone 5125550147. Send it only when approved.','Show my jobs to']){const r=engine.interpretCommand(t,c);assert.equal(r.clarification.required,true);assert.equal(r.suggestedCommand,null)}
 for(const t of ['Show jobs at three in the afternoon','Show jobs in the morning','Open Calendar after lunch']){const r=engine.interpretCommand(t,c);assert.equal(r.clarification.required,true);assert.equal(r.suggestedCommand,null)}
 const previous=engine.interpretCommand('Create customer Avery Jones. Phone 5125550147 if approved.',c);assert.equal(engine.correctInterpretation(previous,{fields:{name:'Avery Jones'}},c).status,'needs_clarification');
});
