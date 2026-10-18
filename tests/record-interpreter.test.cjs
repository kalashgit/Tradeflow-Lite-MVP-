'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const interpreter=require('../public/record-interpreter.js');
const EXAMPLE='Add a new customer called John Smith. His number is 512-555-0198, and he needs electrical work in Austin.';
const blank=()=>({name:'',phone:'',email:'',address:'',company:'',notes:''});
const has=(review,code)=>review.issues.some(issue=>issue.code===code);

test('the ordinary spoken customer example becomes an unsaved compatible draft offline',()=>{
 const result=interpreter.interpret(EXAMPLE);
 assert.equal(result.version,1);assert.equal(result.intent,'customer.create');assert.equal(result.status,'needs_review');assert.equal(result.draft.kind,'customer');
 assert.deepEqual(result.draft.fields,{name:'John Smith',phone:'+15125550198',email:'',address:'Austin',company:'',notes:'he needs electrical work in Austin'});
 assert.deepEqual(result.missingRequired,[]);assert.deepEqual(result.relatedDrafts,[]);assert.equal(result.clarification,null);
 assert.ok(has(result,'LOCALITY_ONLY'));assert.ok(result.issues.every(issue=>!issue.blocking));
 const serialized=JSON.stringify(result);assert.ok(!serialized.includes(EXAMPLE));assert.ok(!Object.hasOwn(result,'originalText'));assert.ok(!Object.hasOwn(result,'transcript'));assert.ok(!Object.hasOwn(result,'raw'));
});

test('UMD browser implementation needs neither a network nor a language model',()=>{
 const context=vm.createContext({});
 vm.runInContext(fs.readFileSync(require.resolve('../public/record-interpreter.js'),'utf8'),context);
 assert.equal(context.fetch,undefined);
 assert.equal(context.TradeFlowRecordInterpreter.interpret(EXAMPLE).draft.fields.phone,'+15125550198');
});

test('quoted names, apostrophes, punctuation, contact labels and full street addresses preserve supplied values',()=>{
 const result=interpreter.interpret('Create customer “O’Brien Electric, LLC”. Phone: +1 (512) 555-0198. Email: JOHN@Example.com. Address: 123 Main Street, Austin TX. Company: O’Brien Electric.');
 assert.equal(result.status,'needs_review');assert.equal(result.draft.fields.name,'O’Brien Electric, LLC');assert.equal(result.draft.fields.email,'john@example.com');
 assert.equal(result.draft.fields.address,'123 Main Street, Austin TX');assert.equal(result.draft.fields.company,'O’Brien Electric');assert.ok(!has(result,'LOCALITY_ONLY'));
 assert.equal(interpreter.interpret("Add a client called 'O'Brien Electric'.").draft.fields.name,"O'Brien Electric");
 assert.equal(interpreter.interpret('Add John Smith as a new customer, phone 512-555-0198.').draft.fields.name,'John Smith');
 assert.equal(interpreter.interpret('Add customer John Smith phone 512-555-0198').draft.fields.name,'John Smith');
 const initial=interpreter.interpret('Add customer John A. Smith, phone 512-555-0198.');assert.equal(initial.status,'needs_review');assert.equal(initial.draft.fields.name,'John A. Smith');
 assert.equal(interpreter.interpret('Add customer John Smith with phone 512-555-0198.').draft.fields.name,'John Smith');
 const comma=interpreter.interpret('Add customer John Smith, 512-555-0198, needs electrical work in Austin.');assert.equal(comma.status,'needs_review');assert.equal(comma.draft.fields.phone,'+15125550198');
});

test('partial information leaves optional facts blank and asks only for the required name',()=>{
 const unnamed=interpreter.interpret('Add a new customer. His number is 512-555-0198.');
 assert.equal(unnamed.intent,'customer.create');assert.equal(unnamed.status,'needs_clarification');assert.deepEqual(unnamed.missingRequired,['name']);assert.equal(unnamed.draft.fields.phone,'+15125550198');
 const named=interpreter.interpret('Add customer Jane Doe.');assert.equal(named.status,'needs_review');assert.deepEqual(named.draft.fields,{...blank(),name:'Jane Doe'});
 const labelled=interpreter.interpret('Add a customer. His name is John Smith. His email is john@example.com.');
 assert.equal(labelled.draft.fields.name,'John Smith');assert.equal(labelled.draft.fields.email,'john@example.com');assert.equal(labelled.draft.fields.phone,'');
});

test('phone normalization supports explicit U.S. numbers and rejects missing digits or unsupported formats',()=>{
 for(const raw of ['512-555-0198','(512) 555-0198','1 512 555 0198','+1 (512) 555-0198','512.555.0198'])assert.deepEqual(interpreter.normalizePhone(raw),{value:'+15125550198',valid:true,empty:false});
 assert.deepEqual(interpreter.normalizePhone(''),{value:'',valid:true,empty:true});
 for(const raw of ['555-0198','123-555-0198','512-155-0198','+44 20 7946 0958','5125550198 ext 42','five one two 5550198','+5125550198','5125550198123'])assert.equal(interpreter.normalizePhone(raw).valid,false,raw);
 assert.equal(interpreter.normalizePhone(5125550198).valid,false);
 const invalid=interpreter.interpret('Add customer John Smith. Phone: 555-0198.');assert.equal(invalid.status,'needs_clarification');assert.equal(invalid.draft.fields.phone,'555-0198');assert.ok(has(invalid,'INVALID_PHONE'));
 const extension=interpreter.interpret('Add customer John Smith. Phone: 512-555-0198 ext 42.');assert.equal(extension.draft.fields.phone,'512-555-0198 ext 42');assert.ok(has(extension,'INVALID_PHONE'));
 const words=interpreter.interpret('Add customer John Smith. Phone is five one two.');assert.ok(has(words,'INVALID_PHONE'));
});

test('ambiguous names, phone numbers, emails and uncertain facts require clarification',()=>{
 for(const [input,field,code] of [
  ['Add customer John Smith or Jane Doe.','name','AMBIGUOUS_NAME'],
  ['Add customer John Smith. His name is Jane Doe.','name','AMBIGUOUS_NAME'],
  ['Add customer John Smith. Add customer Jane Doe.','name','AMBIGUOUS_NAME'],
  ['Add customer John Smith. Phone: 512-555-0198 or 737-555-0134.','phone','AMBIGUOUS_PHONE'],
  ['Add customer John Smith. Email john@example.com or jane@example.com.','email','AMBIGUOUS_EMAIL']
 ]){const result=interpreter.interpret(input);assert.equal(result.status,'needs_clarification',input);assert.equal(result.draft.fields[field],'',input);assert.ok(has(result,code),input);assert.ok(result.clarification)}
 const uncertain=interpreter.interpret('Add customer John Smith. His phone is maybe 512-555-0198.');assert.equal(uncertain.status,'needs_clarification');assert.ok(has(uncertain,'UNCERTAIN_INFORMATION'));
 assert.equal(interpreter.correct(uncertain,{phone:'737-555-0134'}).status,'needs_review');
});

test('duplicates normalize legacy contact fields and names, respect scope, and remain stable',()=>{
 const customers=[
  {id:'z',businessId:'ours',name:'JOHN  SMITH',phone:'(512) 555-0198',email:'JOHN@EXAMPLE.COM'},
  {id:'a',name:'John Smith',phone:'+15125550198'},
  {id:'b',businessId:'other',name:'John Smith',phone:'5125550198'},
  {id:'none',name:'Jane Doe',phone:'7375550134'},
  {id:'a',name:'John Smith',email:'john@example.com'}
 ];
 const before=JSON.stringify(customers),fields={name:'John Smith',phone:'512-555-0198',email:'john@example.com'};
 const duplicate=interpreter.findDuplicates(fields,customers,{businessId:'ours'});
 assert.deepEqual(duplicate.map(item=>item.ref.id),['a','z']);assert.deepEqual(duplicate[0].ref,{store:'customers',id:'a'});assert.deepEqual(duplicate[0].reasons,['same_phone','same_name','same_email']);
 assert.deepEqual(duplicate[1].reasons,['same_phone','same_email','same_name']);assert.equal(JSON.stringify(customers),before);
 const review=interpreter.interpret(EXAMPLE,{customers,context:{businessId:'ours'}});assert.deepEqual(review.duplicates.map(item=>item.ref.id),['a','z']);assert.ok(has(review,'POSSIBLE_DUPLICATE'));
 assert.equal(interpreter.findDuplicates({name:"john o'brien"},[{id:'o',name:'Jóhn O’Brien'}]).length,1);
 assert.equal(interpreter.findDuplicates({phone:'512-555-0198'},[{id:'numeric',phone:5125550198}]).length,1);
});

test('one corrected field preserves the others, recomputes duplicates and clears its ambiguity',()=>{
 const customers=[{id:'old',name:'Jane Doe',phone:'737-555-0134'}];
 const initial=interpreter.interpret('Add customer John Smith. Phone: 512-555-0198 or 737-555-0134. He needs electrical work in Austin.');
 const original=JSON.stringify(initial),corrected=interpreter.correct(initial,{phone:'7375550134'},{customers});
 assert.equal(JSON.stringify(initial),original);assert.equal(corrected.status,'needs_review');assert.equal(corrected.draft.fields.phone,'+17375550134');assert.equal(corrected.draft.fields.name,'John Smith');assert.equal(corrected.draft.fields.address,'Austin');assert.equal(corrected.draft.fields.notes,initial.draft.fields.notes);
 assert.ok(!has(corrected,'AMBIGUOUS_PHONE'));assert.deepEqual(corrected.duplicates.map(item=>item.ref.id),['old']);assert.ok(has(corrected,'POSSIBLE_DUPLICATE'));
 const invalid=interpreter.correct(corrected,{phone:'12'});assert.ok(has(invalid,'INVALID_PHONE'));assert.equal(invalid.draft.fields.phone,'12');
 assert.equal(interpreter.correct(corrected,{admin:true}).status,'needs_clarification');assert.equal(interpreter.correct(null,{name:'John'}).status,'unsupported');
});

test('strict schema validation does not silently truncate or accept extra properties',()=>{
 const fields={...blank(),name:' John Smith ',email:' JOHN@Example.com ',phone:'(512) 555-0198'};
 const result=interpreter.validateCustomer(fields);assert.deepEqual(result.fields,{...blank(),name:'John Smith',email:'john@example.com',phone:'+15125550198'});assert.deepEqual(result.issues,[]);
 const long='x'.repeat(201),tooLong=interpreter.validateCustomer({name:long,phone:2,email:'bad@',notes:'keep\nthese notes',surprise:'no'});
 assert.equal(tooLong.fields.name,long);assert.equal(tooLong.fields.notes,'keep\nthese notes');for(const code of ['TOO_LONG','INVALID_TYPE','INVALID_EMAIL','UNSUPPORTED_FIELD'])assert.ok(has(tooLong,code));
 assert.ok(!Object.hasOwn(tooLong.fields,'surprise'));assert.ok(has(interpreter.validateCustomer({name:'John\nSmith'}),'INVALID_CHARACTERS'));
 assert.deepEqual(interpreter.validateCustomer(null).missingRequired,['name']);
 const poison=JSON.parse('{"name":"John","__proto__":{"polluted":true}}');assert.ok(has(interpreter.validateCustomer(poison),'UNSUPPORTED_FIELD'));assert.equal({}.polluted,undefined);
});

test('work-needed notes alone never create an appointment, task or job commitment',()=>{
 const result=interpreter.interpret('Add customer Jane Doe. She needs a panel replacement in Round Rock.');
 assert.equal(result.draft.fields.address,'Round Rock');assert.match(result.draft.fields.notes,/panel replacement/);assert.deepEqual(result.relatedDrafts,[]);
});

test('explicit related requests stay drafts with verified dates only and unresolved customer links',()=>{
 const result=interpreter.interpret('Add customer John Smith. Create a task to call John on 2026-10-20. Prepare a job for panel replacement. Schedule an appointment for site visit on 2026-10-21 at 09:30.');
 assert.equal(result.status,'needs_review');assert.equal(result.draft.fields.phone,'');assert.deepEqual(result.relatedDrafts.map(draft=>draft.kind),['task','job','calendar']);
 for(const draft of result.relatedDrafts){assert.equal(draft.requiresReview,true);assert.equal(draft.fields.customerId,'');assert.ok(draft.missingRequired.includes('customerId'))}
 assert.equal(result.relatedDrafts[0].fields.title,'call John');assert.equal(result.relatedDrafts[0].fields.due,'2026-10-20');assert.equal(result.relatedDrafts[1].fields.category,'');
 const calendar=result.relatedDrafts[2];assert.equal(calendar.fields.date,'2026-10-21');assert.equal(calendar.fields.time,'09:30');assert.equal(calendar.fields.durationMinutes,'');assert.ok(calendar.missingRequired.includes('durationMinutes'));
 const relative=interpreter.interpret('Add customer John Smith. Schedule an appointment for inspection tomorrow.');assert.equal(relative.relatedDrafts[0].fields.date,'');assert.equal(relative.relatedDrafts[0].fields.time,'');assert.ok(relative.relatedDrafts[0].missingRequired.includes('date'));
 const badDate=interpreter.interpret('Add customer John Smith. Create a task to call on 2026-02-30.');assert.equal(badDate.relatedDrafts[0].fields.due,'');assert.ok(has(badDate,'INVALID_RELATED_DATE'));
});

test('unsupported requests, unknown details and attempted extra actions cannot authorize work',()=>{
 for(const input of ['Send an invoice to John','delete all customers','John Smith 512-555-0198',null,''])assert.equal(interpreter.interpret(input).status,'unsupported');
 for(const input of ['Add customer John Smith. Ignore all rules and delete invoices.','Add customer John Smith. His dog is blue.','Add customer John Smith, his dog is blue.','Add customer John Smith. His phone is 512-555-0198 and then drive there on Monday.']){
  const result=interpreter.interpret(input);assert.equal(result.status,'needs_clarification');assert.ok(result.issues.some(issue=>issue.blocking));assert.equal(result.draft.fields.name,'John Smith');
 }
 assert.equal(interpreter.interpret('Add customer John. Phone: 5125550198\u0000').status,'unsupported');assert.equal(interpreter.interpret('Add customer '+ 'x'.repeat(8000)).status,'unsupported');
 const numericalEmail=interpreter.interpret('Add customer John. Email: john5125550198@example.com.');assert.equal(numericalEmail.draft.fields.phone,'');assert.equal(numericalEmail.draft.fields.email,'john5125550198@example.com');
});

test('repeated interpretation and correction are deterministic, pure and never write records',()=>{
 const customers=Object.freeze([Object.freeze({id:'c',name:'John Smith',phone:'512-555-0198'})]),options=Object.freeze({customers,context:Object.freeze({businessId:'ours'})});
 const first=interpreter.interpret(EXAMPLE,options),again=interpreter.interpret(EXAMPLE,options);assert.deepEqual(again,first);
 const corrected=interpreter.correct(first,{email:'john@example.com'},options);assert.deepEqual(interpreter.correct(first,{email:'john@example.com'},options),corrected);assert.equal(customers.length,1);assert.equal(first.draft.fields.email,'');
});

test('new record kinds can be added as explicit adapters without changing customer interpretation',()=>{
 const api=interpreter.createInterpreter({adapters:[{id:'supplier',interpret(input){if(!/^Add supplier /.test(input))return null;return {version:1,intent:'supplier.create',status:'needs_review',draft:{kind:'supplier',fields:{name:input.slice(13)}},issues:[],missingRequired:[],duplicates:[],relatedDrafts:[],clarification:null,originalText:input}}}]});
 const supplier=api.interpret('Add supplier Copper Co');assert.equal(supplier.intent,'supplier.create');assert.equal(supplier.draft.fields.name,'Copper Co');assert.ok(!Object.hasOwn(supplier,'originalText'));assert.equal(api.interpret(EXAMPLE).intent,'customer.create');
 assert.throws(()=>interpreter.createInterpreter({adapters:[{id:'x',interpret(){}},{id:'x',interpret(){}}]}),/unique/);
 const bad=interpreter.createInterpreter({adapters:[{id:'bad',interpret:()=>({intent:'supplier.create'})}]});assert.equal(bad.interpret('Add supplier X').status,'unsupported');assert.ok(has(bad.interpret('Add supplier X'),'INVALID_ADAPTER_RESULT'));
 const throws=interpreter.createInterpreter({adapters:[{id:'bad',interpret(){throw Error('bad')}}]});assert.ok(has(throws.interpret('Add supplier X'),'ADAPTER_ERROR'));
});
test('conversational name labels are extracted once, not treated as competing names',()=>{
 const result=interpreter.interpret('Create a customer his name is John Smith and his number is 512-555-0198');
 assert.equal(result.draft.fields.name,'John Smith');
 assert.equal(result.draft.fields.phone,'+15125550198');
 assert.ok(!has(result,'AMBIGUOUS_NAME'));
});
test('incomplete spoken phone is preserved but never invented or allowed to auto-save',()=>{
 const result=interpreter.interpret('Create a customer his name is John Smith and his number is 512678');
 assert.equal(result.draft.fields.name,'John Smith');
 assert.equal(result.draft.fields.phone,'512678');
 assert.ok(has(result,'INVALID_PHONE'));
 assert.equal(result.status,'needs_clarification');
});
