'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const engine=require('../public/command-intelligence');
const context={today:'2026-10-18',customers:[]};
const run=text=>engine.interpretCommand(text,context);
function permutations(items){return items.length===1?[items]:items.flatMap((item,index)=>permutations(items.filter((_,i)=>i!==index)).map(tail=>[item,...tail]));}
const phones=['5125550177','512-555-0177','(512) 555-0177','512.555.0177','512 555 0177','+1 512-555-0177','1 (512) 555-0177'];
const names=['Avery Jones',"Sam O'Neill",'Taylor Lee-Jones','John A. Smith'];
test('2,016 generated customer variants preserve entities across reordered clauses, fillers and phone formats',()=>{
 let checked=0;
 for(const name of names)for(const phone of phones)for(const order of permutations(['Add customer',`His name is ${name}`,`His number is ${phone}`]))for(const lead of ['', 'Hey TradeFlow, ', 'Could you please ', 'Um, '])for(const join of ['. ', '; ', '. Uh, ']){
  const phrase=lead+order.join(join)+'.',r=run(phrase);
  assert.equal(r.intent,'customer.create',phrase);assert.equal(r.status,'recognized',phrase+' '+JSON.stringify(r.clarification));
  assert.equal(r.parameters.fields.name,name,phrase);assert.equal(r.parameters.fields.phone,'+15125550177',phrase);
  for(const field of ['email','address','company','notes'])assert.equal(r.parameters.fields[field],'',phrase);
  assert.equal(r.requiresAuthorization,true);assert.equal(r.suggestedCommand.params.approved,undefined);checked++;
 }
 assert.equal(checked,2016);
});
test('structural word repetitions preserve meaning without deduplicating identity or digits',()=>{
 for(const action of ['Add add customer','Create create client','Make make a new customer']){
  const r=run(action+'. His name name is is Avery Jones. His number number is is 512-555-0177.');
  assert.equal(r.status,'recognized',JSON.stringify(r));assert.equal(r.parameters.fields.name,'Avery Jones');assert.equal(r.parameters.fields.phone,'+15125550177');
 }
 for(const phrase of ['What what jobs jobs do I have have tomorrow?','Check check my schedule tomorrow.','Show show my work tomorrow.']){const r=run(phrase);assert.equal(r.intent,'schedule.query');assert.equal(r.status,'recognized',phrase);assert.equal(r.parameters.date,'2026-10-19')}
 for(const phone of ['512 555 555 0177','512-555-017','512-555-01777']){const r=run('Add customer Avery Jones. Phone '+phone+'.');assert.equal(r.status,'needs_clarification');assert.ok(r.parameters.fields.phone===''||r.parameters.fields.phone===phone);assert.equal(r.suggestedCommand,null)}
 for(const name of ['Avery Avery Jones','John John Smith']){const r=run('Add customer '+name+'. Phone 512-555-0177.');assert.equal(r.parameters.fields.name,'');assert.equal(r.status,'needs_clarification');assert.equal(r.suggestedCommand,null)}
});
test('contradictory identities never silently choose a name across labels and clause orders',()=>{
 for(const [first,second] of [['Avery Jones','Jane Doe'],['Jane Doe','Avery Jones']])for(const identity of [`His name is ${second}`,`Her name is ${second}`,`They are named ${second}`,`The customer is called ${second}`,`Also known as ${second}`])for(const join of ['. ','; ',' and ']){
  const phrase=`Add customer ${first}${join}${identity}. Phone 512-555-0177.`,r=run(phrase);
  assert.equal(r.parameters.fields.name,'',phrase);assert.equal(r.status,'needs_clarification',phrase);assert.equal(r.suggestedCommand,null,phrase);
 }
});
test('missing or ambiguous fields stay absent; explicit corrections resolve only the specified field',()=>{
 for(const phrase of ['Add customer.','Create a new client. His number is 512-555-0177.']){const r=run(phrase);assert.equal(r.parameters.fields.name,'');assert.equal(r.status,'needs_clarification');assert.equal(r.suggestedCommand,null)}
 for(const phrase of ['Add customer Avery Jones.','Add customer Avery Jones. Phone 555-0177.']){const r=run(phrase);assert.equal(r.parameters.fields.phone,phrase.includes('555-0177')?'555-0177':'');assert.equal(r.status,'needs_clarification');assert.equal(r.suggestedCommand,null)}
 const previous=run('Add customer. His name is Avery Jones. His name is Jane Doe. Phone 512-555-0177.');
 const corrected=engine.correctInterpretation(previous,{fields:{name:'Jane Doe'}},context);
 assert.equal(corrected.parameters.fields.name,'Jane Doe');assert.equal(corrected.parameters.fields.phone,'+15125550177');assert.equal(corrected.status,'recognized');assert.equal(previous.parameters.fields.name,'');
});
test('contractor task scopes compose independently of trade terminology',()=>{
 for(const verb of ['Create','Make','Prepare','Draft'])for(const scope of ['check the HVAC filter','inspect the breaker panel','flush the water heater','check the plumbing shutoff']){
  const r=run(`${verb} a task to ${scope} tomorrow`);assert.equal(r.intent,'task.prepare');assert.equal(r.status,'recognized');assert.equal(r.parameters.title,scope);assert.equal(r.parameters.due,'2026-10-19');assert.equal(r.effect,'draft');
 }
});
