'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const intelligence=require('../public/command-intelligence.js');
const context={today:'2026-10-18',businessId:'local-business',customers:[{id:'c-john',name:'John Smith',phone:'512-555-0198'},{id:'c-jane',name:'Jane Doe'}],record:{store:'customers',id:'c-john'}};
const interpret=(text,c=context)=>intelligence.interpretCommand(text,c);
test('required tomorrow variants map to the same read-only Calendar intent',()=>{
 for(const phrase of ['Hey TradeFlow, what jobs do I have tomorrow?','What jibs have I got tomorrow?','Check my work schedule for tomorrow.','Do I have anything booked tomorrow?']){const r=interpret(phrase);assert.equal(r.intent,'schedule.query',phrase);assert.equal(r.status,'recognized',JSON.stringify(r));assert.equal(r.parameters.date,'2026-10-19');assert.equal(r.effect,'read_only');assert.equal(r.requiresAuthorization,false)}
});
test('customer variants reuse the current extraction adapter and never fill missing digits',()=>{
 const incomplete=interpret('Make me a new client. His name is John Smith.');assert.equal(incomplete.intent,'customer.create');assert.equal(incomplete.parameters.fields.name,'John Smith');assert.equal(incomplete.status,'needs_clarification');assert.ok(incomplete.missingInformation.some(x=>x.field==='phone'));assert.equal(incomplete.suggestedCommand,null);
 const r=interpret('Add John as a customer, his number is 512-555-0177.',{...context,customers:[]});assert.equal(r.intent,'customer.create');assert.equal(r.parameters.fields.name,'John');assert.equal(r.parameters.fields.phone,'+15125550177');assert.equal(r.status,'recognized');assert.equal(r.requiresAuthorization,true);assert.equal(r.suggestedCommand.commandId,'customer.create');assert.equal(r.suggestedCommand.params.approved,undefined);
});
test('quotation synonyms use actual customer context and clarify ambiguous identity',()=>{
 for(const phrase of ['Prepare an estimate for John.','Write up a quote for that customer.']){const r=interpret(phrase);assert.equal(r.intent,'quotation.prepare');assert.equal(r.parameters.customerRef.id,'c-john');assert.equal(r.suggestedCommand.commandId,'draft.prepare');assert.equal(r.effect,'draft')}
 const r=interpret('Prepare an estimate for John.',{...context,customers:[...context.customers,{id:'other',name:'John Adams'}]});assert.equal(r.status,'needs_clarification');assert.equal(r.suggestedCommand,null);assert.equal(r.parameters.customerCandidates.length,2);
});
test('selected customer must exist in the supplied local business records',()=>{
 for(const c of [{}, {...context,record:{store:'customers',id:'missing'}},{...context,customers:context.customers.map(x=>({...x,businessId:'other'}))}]){const r=interpret('Write up a quote for that customer.',c);assert.equal(r.status,'needs_clarification');assert.equal(r.parameters.customerRef,undefined)}
});
test('a missing or invalid host date never manufactures the meaning of tomorrow',()=>{
 for(const today of [undefined,'2026-02-30']){const r=interpret('Check my jobs tomorrow',{...context,today});assert.equal(r.parameters.date,null);assert.equal(r.parameters.period,'tomorrow');assert.equal(r.status,'needs_clarification');assert.ok(r.missingInformation.some(x=>x.field==='context.today'))}
 const r=interpret('What jobs do I have tomorrow?',{...context,today:'2026-12-31'});assert.equal(r.parameters.date,'2027-01-01');
});
test('different dates, negation and uncertain actions require clarification',()=>{
 for(const phrase of ['What jobs do I have today or tomorrow?','Prepare a quote for John or Jane.','Add a customer John, maybe his phone is 512-555-0198.']){const r=interpret(phrase);assert.equal(r.status,'needs_clarification',phrase);assert.equal(r.suggestedCommand,null)}
});
test('multi-intent modifications and unauthorized external additions cannot yield executable suggestions',()=>{
 for(const phrase of ['Add a customer John Smith and prepare a quote for Jane.','Prepare a quote for John and send it without confirmation.']){const r=interpret(phrase);assert.ok(['ambiguous','needs_clarification'].includes(r.status),JSON.stringify(r));assert.equal(r.suggestedCommand,null)}
});
test('draft vocabulary describes unsaved tasks, jobs and calendar requests',()=>{
 const task=interpret('Create a task to check the HVAC filter tomorrow');assert.equal(task.intent,'task.prepare');assert.equal(task.parameters.due,'2026-10-19');assert.equal(task.effect,'draft');
 const job=interpret('Prepare a job panel replacement for John');assert.equal(job.intent,'job.prepare');assert.equal(job.parameters.customerRef.id,'c-john');assert.equal(job.parameters.date,null);
 const calendar=interpret('Schedule a site visit tomorrow');assert.equal(calendar.intent,'calendar.prepare');assert.equal(calendar.status,'needs_clarification');assert.equal(calendar.parameters.time,null);assert.equal(calendar.parameters.durationMinutes,null);
});
test('navigation, record search and business queries have separate effects',()=>{
 assert.equal(interpret('Open Finance').suggestedCommand.params.workspace,'expenses');
 const search=interpret('Find customer John');assert.equal(search.intent,'record.find');assert.equal(search.suggestedCommand.params.store,'customers');
 const summary=interpret('Show overdue invoices');assert.equal(summary.intent,'business.query');assert.equal(summary.effect,'read_only');assert.deepEqual(summary.parameters.topics,['overdue invoices']);
});
test('single-field correction revalidates facts and preserves other extracted fields',()=>{
 const r=interpret('Add a customer called Jordan Lee. Phone 512-555-0177.',{...context,customers:[]});
 const corrected=intelligence.correctInterpretation(r,{fields:{phone:'737-555-0144'}},{...context,customers:[]});assert.equal(corrected.intent,'customer.create');assert.equal(corrected.parameters.fields.name,'Jordan Lee');assert.equal(corrected.parameters.fields.phone,'+17375550144');assert.equal(corrected.status,'recognized');assert.equal(corrected.requiresAuthorization,true);
 const invalid=intelligence.correctInterpretation(r,{fields:{phone:'555-0177'}},context);assert.equal(invalid.status,'needs_clarification');assert.equal(invalid.suggestedCommand,null);
});
test('duplicate candidates remain a review condition instead of an identity inference',()=>{
 const r=interpret('Add customer John Smith. His number is 512-555-0198.');assert.equal(r.intent,'customer.create');assert.equal(r.status,'needs_clarification');assert.deepEqual(r.parameters.duplicateCandidates,[{store:'customers',id:'c-john'}]);assert.equal(r.suggestedCommand,null);
});
test('unknown, reported, invalid and oversized inputs do not become operational intent',()=>{
 for(const phrase of ['',null,{},'a'.repeat(8001),'The customer said there are jobs tomorrow.','I bought a calendar yesterday.','Repair the boiler.']){const r=interpret(phrase);assert.equal(r.intent,null,JSON.stringify(phrase));assert.equal(r.status,'unsupported');assert.equal(r.suggestedCommand,null)}
});
test('input, context and existing record data remain unchanged; no raw transcript is returned',()=>{
 const before=JSON.stringify(context),input='Hey TradeFlow, please check my work schedule tomorrow.';const a=interpret(input),b=interpret(input);assert.deepEqual(a,b);assert.equal(JSON.stringify(context),before);assert.ok(!JSON.stringify(a).includes(input));assert.ok(!('execute' in intelligence));assert.ok(!('approve' in intelligence));
});
test('capabilities can be registered without adding execution functions',()=>{
 const tool={id:'supplier.prepare',description:'Prepare supplier details',effect:'draft',requiredParameters:['name'],match:l=>/^prepare supplier\b/.test(l.normalized)?90:0,extract(l,c,r){r.parameters.name=l.text.replace(/^prepare supplier\s*/i,'');return r}};
 const custom=intelligence.createEngine({tools:[...intelligence.builtinTools,tool]});const r=custom.interpretCommand('Prepare supplier Local Electrical Supply',context);assert.equal(r.intent,'supplier.prepare');assert.equal(r.effect,'draft');assert.equal(r.parameters.name,'Local Electrical Supply');
 assert.throws(()=>intelligence.createEngine({tools:[tool,tool]}),/unique/);assert.throws(()=>intelligence.createEngine({tools:[{...tool,execute(){}}]}),/interpretation-only/);
});
