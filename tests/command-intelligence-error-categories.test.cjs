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
 for(const verb of ['Schedule','Scheduling']){const r=run(`${verb} a sight visit tomorrow at 09:00 for 60 minutes`);assert.equal(r.intent,'calendar.prepare');assert.equal(r.status,'recognized');assert.equal(r.parameters.time,'09:00')}
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
