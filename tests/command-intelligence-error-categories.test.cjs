'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),engine=require('../public/command-intelligence');
const context={today:'2026-10-18',customers:[{id:'john',name:'John Smith'}]};
const run=(t,c=context)=>engine.interpretCommand(t,c);
test('contextual domain recovery composes with verbs, filler and customer references',()=>{
 for(const lead of ['', 'Uh, hey, could you just ', 'Please '])for(const action of ['Prepare','Draft','Make'])for(const noun of ['quote','quotes','coats','coat','estimate','estimit']){
  const r=run(`${lead}${action} an ${noun} for John.`);assert.equal(r.intent,'quotation.prepare');assert.equal(r.parameters.customerRef.id,'john');assert.equal(r.effect,'draft');
 }
 for(const t of ['I bought coats for John','Look at the sail','A sight to behold','in voice mode'])assert.equal(run(t).intent,null,t);
 assert.equal(run('Add customer Coats Sail. Phone 512-555-0177.',{customers:[]}).parameters.fields.name,'Coats Sail');
});
test('split and merged vocabulary remains confined to supported business grammar',()=>{
 assert.deepEqual(run('Find in voice 123').parameters,{query:'123',store:'invoices'});
 assert.deepEqual(run('Find in voices 123').parameters,{query:'123',store:'invoices'});
 assert.deepEqual(run('Show sail totals').parameters.topics,['sales']);
 for(const verb of ['Schedule','Scheduling']){const r=run(`${verb} a sight visit tomorrow at 09:00 for 60 minutes`);assert.equal(r.intent,'calendar.prepare');assert.equal(r.status,'needs_clarification');assert.equal(r.parameters.time,'09:00')}
 const r=run('Create a task to followup on the HVAC estimate tomorrow');assert.equal(r.intent,'task.prepare');assert.ok(r.normalizations.some(n=>n.from==='followup'));
});
test('phone digit words normalize by field type without filling truncated or ambiguous digits',()=>{
 const words=['five one two five five five zero one seven seven','five-one-two-five-five-five-oh-one-seven-seven','one five one two five five five zero one seven seven'];
 for(const name of ['Avery Jones','Michael Anderson'])for(const label of ['phone','his number is','mobile:'])for(const phone of words){const r=run(`Create customer ${name} ${label} ${phone}`,{customers:[]});assert.equal(r.status,'recognized',JSON.stringify(r));assert.equal(r.parameters.fields.name,name);assert.equal(r.parameters.fields.phone,'+15125550177')}
 for(const phone of ['five one two','five one two five five five zero one seven','five one two double five five zero one seven seven']){const r=run(`Add customer Avery Jones. Phone ${phone}.`,{customers:[]});assert.equal(r.status,'needs_clarification');assert.equal(r.suggestedCommand,null)}
 const identity=run('Add customer One Two. Phone 5125550177.',{customers:[]});assert.equal(identity.parameters.fields.name,'One Two');
});
test('explicit name correction produces the corrected draft and requires review',()=>{
 for(const marker of ['—sorry, ','--I mean ',' , sorry ']){
  const r=run('Add customer Mark'+marker+'Michael. Phone 512-555-0177.',{customers:[]});assert.equal(r.parameters.fields.name,'Michael');assert.equal(r.status,'needs_clarification');assert.ok(r.clarification.reasonCodes.includes('CORRECTION_REVIEW'));assert.equal(r.suggestedCommand,null);
  const corrected=engine.correctInterpretation(r,{fields:{name:'Michael'}},{customers:[]});assert.equal(corrected.status,'recognized');
 }
 const r=run('Add customer Mark Anderson, Michael Anderson. Phone 512-555-0177.',{customers:[]});assert.equal(r.parameters.fields.name,'');assert.equal(r.status,'needs_clarification');assert.equal(r.suggestedCommand,null);
});
test('negation, truncated phrases and noise never become executable suggestions',()=>{
 for(const t of ["Don't send that invoice",'Add Michael, his phone…','Create a job [unrelated speech] for John','Add customer Avery Jones. Phone 5125550177. [background speech]']){const r=run(t);assert.equal(r.suggestedCommand,null,t);assert.notEqual(r.status,'recognized',t)}
});

test('business timezone resolves relative dates without consulting the device clock',()=>{
 const c={customers:[],now:'2026-10-19T01:30:00Z',businessTimeZone:'America/Chicago'};
 assert.equal(run('What jobs do I have tomorrow?',c).parameters.date,'2026-10-19');
 assert.equal(run('What jobs do I have tomorrow?',{...c,businessTimeZone:'Asia/Tokyo'}).parameters.date,'2026-10-20');
 const conflicting=run('What jobs do I have tomorrow?',{...c,today:'2026-10-19'});assert.equal(conflicting.parameters.date,null);assert.equal(conflicting.status,'needs_clarification');
 for(const extra of [{businessTimeZone:'Unknown/Zone'},{now:'2026-02-30T01:30:00Z'},{now:'2026-10-19T01:30:00'}]){const r=run('What jobs do I have tomorrow?',{...c,...extra});assert.equal(r.parameters.date,null);assert.equal(r.status,'needs_clarification')}
});
test('next weekday exposes alternate meanings until an explicit business policy resolves them',()=>{
 const c={today:'2026-10-21',businessTimeZone:'America/Chicago',customers:[]};
 const ambiguous=run('What jobs do I have next Friday?',c);assert.equal(ambiguous.intent,'schedule.query');assert.equal(ambiguous.status,'needs_clarification');assert.deepEqual(ambiguous.parameters.dateCandidates,['2026-10-23','2026-10-30']);assert.equal(ambiguous.parameters.date,null);
 assert.equal(run('What jobs do I have next Friday?',{...c,nextWeekdayPolicy:'upcoming'}).parameters.date,'2026-10-23');
 assert.equal(run('What jobs do I have next Friday?',{...c,nextWeekdayPolicy:'following_week'}).parameters.date,'2026-10-30');
 for(const c2 of [{...c,businessTimeZone:undefined},{...c,nextWeekdayPolicy:'guess'}])assert.equal(run('What jobs do I have next Friday?',c2).status,'needs_clarification');
 assert.equal(run('What jobs do I have tomorrow or next Friday?',c).parameters.date,null);
});
test('weekday resolution handles DST, year boundaries, all weekdays and both policies',()=>{
 for(const today of ['2026-03-06','2026-10-30','2026-12-31'])for(const day of ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])for(const policy of ['upcoming','following_week']){
  const r=run(`Check my work schedule next ${day}`,{today,businessTimeZone:'America/New_York',nextWeekdayPolicy:policy,customers:[]});assert.equal(r.status,'recognized',JSON.stringify(r));assert.ok(r.parameters.date>today);assert.equal(new Date(r.parameters.date+'T12:00:00Z').getUTCDay(),['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(day));
 }
});
test('multiple operations produce unexecuted draft plans with unresolved dependencies',()=>{
 const r=run('Create the job and schedule it');assert.equal(r.status,'ambiguous');assert.equal(r.suggestedCommand,null);assert.equal(r.proposedPlan.executable,false);assert.equal(r.proposedPlan.steps.length,2);assert.equal(r.proposedPlan.steps[0].intent,'job.prepare');assert.equal(r.proposedPlan.steps[1].intent,'calendar.prepare');assert.deepEqual(r.proposedPlan.steps[1].dependsOn,['step-1']);assert.equal(r.proposedPlan.steps[1].bindings.jobRef.state,'unresolved');assert.equal(r.proposedPlan.steps[1].parameters.date,null);
 const other=run('Prepare a quote for John and send it');assert.equal(other.status,'ambiguous');assert.equal(other.proposedPlan.executable,false);assert.equal(other.proposedPlan.steps[1].intent,null);assert.equal(other.suggestedCommand,null);
 const contextual=run('Create a task to follow up on the estimate tomorrow');assert.equal(contextual.proposedPlan,undefined);assert.equal(contextual.intent,'task.prepare');
});
test('ambiguous contact identity is resolved only from supplied records and never places a call',()=>{
 const r=run('Call John',{customers:[{id:'one',name:'John Smith'},{id:'two',name:'John Adams'},{id:'three',name:'John Jones'}]});assert.equal(r.intent,'customer.contact');assert.equal(r.status,'needs_clarification');assert.equal(r.parameters.customerRef,undefined);assert.equal(r.parameters.customerCandidates.length,3);assert.equal(r.suggestedCommand,null);
 const unique=run('Call John');assert.equal(unique.parameters.customerRef.id,'john');assert.equal(unique.status,'needs_clarification');assert.equal(unique.suggestedCommand,null);
});

test('648 mixed mutations compose phone words, repetition, fillers and reordered fields',()=>{
 const permutations=items=>items.length===1?[items]:items.flatMap((item,index)=>permutations(items.filter((_,i)=>i!==index)).map(tail=>[item,...tail]));let checked=0;
 for(const name of ['Avery Jones',"Sam O'Neill"])for(const verb of ['Add add customer','Create create client','Make make a new customer'])for(const phone of ['five one two five five five zero one seven seven','five-one-two-five-five-five-oh-one-seven-seven','one five one two five five five zero one seven seven'])for(const order of permutations([verb,`His name name is is ${name}`,`His number number is is ${phone}`]))for(const lead of ['', 'Uh, hey, could you just ', 'Please '])for(const separator of ['. ', '; ']){
  const phrase=lead+order.join(separator),r=run(phrase,{customers:[]});assert.equal(r.status,'recognized',phrase+' '+JSON.stringify(r.clarification));assert.equal(r.parameters.fields.name,name);assert.equal(r.parameters.fields.phone,'+15125550177');assert.equal(r.requiresAuthorization,true);checked++;
 }
 assert.equal(checked,648);
});
test('query recovery does not mistake voice mode or entity names for invoice records',()=>{
 const r=run('Find in voice mode');assert.equal(r.parameters.store,undefined);assert.equal(r.parameters.query,'in voice mode');
 const identity=run('Add customer In Voice. Phone 5125550177.',{customers:[]});assert.equal(identity.parameters.fields.name,'In Voice');
 const negated=run("Don't send that invoice");assert.ok(negated.clarification.reasonCodes.includes('NEGATED_OR_UNCERTAIN'));
 const partial=run('Add Michael, his phone…');assert.ok(partial.clarification.reasonCodes.includes('TRUNCATED_TRANSCRIPT'));
});
