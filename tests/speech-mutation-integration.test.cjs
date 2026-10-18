'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const intelligence=require('../public/command-intelligence');
const context={today:'2026-10-21',sourcePage:'calendar',customers:[{id:'j',name:'John Smith'}]};
test('new spelling candidates reuse existing Calendar and customer extraction adapters',()=>{
 const query=intelligence.interpretCommand('What jobz do I have tomorrow?',context);assert.equal(query.intent,'schedule.query');assert.equal(query.status,'recognized');assert.equal(query.parameters.date,'2026-10-22');assert.equal(query.interpretationPath,'contextual_candidates');
 const customer=intelligence.interpretCommand('Add custmer Avery Jones. Phone 512-555-0149.',{customers:[],sourcePage:'customers'});assert.equal(customer.intent,'customer.create');assert.equal(customer.status,'needs_clarification');assert.equal(customer.parameters.fields.name,'Avery Jones');assert.equal(customer.parameters.fields.phone,'+15125550149');assert.equal(customer.suggestedCommand,null);
});
test('uncertain actions and draft phonetics remain review-only even with verified records',()=>{
 for(const text of ['Prepair a quote for John Smith','Prepare an estemate for John Smith','Prepare a coat for John Smith']){const r=intelligence.interpretCommand(text,context);assert.equal(r.intent,'quotation.prepare');assert.equal(r.parameters.customerRef.id,'j');assert.equal(r.status,'needs_clarification');assert.equal(r.suggestedCommand,null);assert.ok(r.clarification.reasonCodes.includes('UNCERTAIN_SPEECH_CANDIDATE'))}
});
test('declarative future tools supply fields and compound steps without match/extract callbacks',()=>{
 const engine=intelligence.createEngine({tools:[{id:'permit.inspect',effect:'read_only',language:{actions:['inspect','review'],objects:['permit','authorization'],contexts:['jobs'],fields:[{name:'recordId',type:'identifier',markers:['number'],required:true}]}}]});
 const r=engine.interpretCommand('Inspect permitt number P-0017',{sourcePage:'jobs'});assert.equal(r.status,'recognized');assert.equal(r.parameters.recordId,'P-0017');assert.equal(r.suggestedCommand,null);
 const multi=engine.interpretCommand('Inspect permit number P-0017 and review authorization number P-0018',{sourcePage:'jobs'});assert.equal(multi.status,'ambiguous');assert.equal(multi.proposedPlan.executable,false);assert.equal(multi.proposedPlan.steps.length,2);assert.equal(multi.proposedPlan.steps[0].parameters.recordId,'P-0017');assert.equal(multi.proposedPlan.steps[1].parameters.recordId,'P-0018');assert.equal(multi.suggestedCommand,null);
});
test('critical values cannot disappear through a legacy adapter or field-only correction',()=>{
 const r=intelligence.interpretCommand('Prepare a quote for John Smith. Amount $350.',context);assert.equal(r.status,'needs_clarification');assert.ok(r.criticalEvidence.some(e=>e.type==='money'&&e.raw==='$350'));assert.equal(r.suggestedCommand,null);
 const conflict=intelligence.interpretCommand('Prepare a quote for John Smith. Amount $350 or $530.',context);assert.ok(conflict.clarification.reasonCodes.includes('CONFLICTING_AMOUNTS'));assert.equal(conflict.suggestedCommand,null);
 const time=intelligence.interpretCommand('What jobs do I have tomorrow at 09:00?',context);assert.equal(time.status,'needs_clarification');assert.ok(time.criticalEvidence.some(e=>e.type==='time'&&e.raw==='09:00'));
});
test('ambiguous tool definitions and questions never acquire execution permission',()=>{
 const a={id:'one',effect:'proposes_modification',language:{actions:['prepare'],objects:['permit']}},b={...a,id:'two'},e=intelligence.createEngine({tools:[a,b]});
 const tied=e.interpretCommand('Prepare permit');assert.equal(tied.status,'ambiguous');assert.equal(tied.suggestedCommand,null);
 for(const text of ['How do I prepare permit','Can I prepare permit','The customer said prepare permit',"Don't prepare permit",'Prepare permit if approved']){const r=e.interpretCommand(text);assert.notEqual(r.status,'recognized');assert.equal(r.suggestedCommand,null)}
 assert.equal(typeof e.execute,'undefined');assert.equal(typeof e.rankCommandCandidates,'function');
});
test('candidate fallback does not promote incidental entity vocabulary into another action',()=>{
 const r=intelligence.interpretCommand('Create customer Coats Sail. Phone 5125550149.',{customers:[]});assert.equal(r.intent,'customer.create');assert.equal(r.parameters.fields.name,'Coats Sail');assert.equal(r.status,'recognized');
 const rank=intelligence.rankCommandCandidates('What jobz do I have tomorrow?',context);assert.equal(rank.candidates[0].intent,'schedule.query');assert.ok(rank.candidates[0].normalizations.every(n=>['structural_action','structural_object'].includes(n.scope)));
});
