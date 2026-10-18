'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const speech=require('../public/speech-mutation-engine');
const tools=[
 {id:'schedule.query',effect:'read_only',language:{mode:'query',allowContextTail:true,actionConcepts:['query'],objects:['jobs','job','work','appointments'],contexts:['calendar']}},
 {id:'quotation.prepare',effect:'draft',language:{actionConcepts:['prepare'],objects:['quote','quotation','estimate'],fields:[{name:'customerRef',type:'record',store:'customers',markers:['for'],required:true}]}},
 {id:'customer.create',effect:'proposes_modification',language:{actionConcepts:['create'],objects:['customer','client'],fields:[{name:'fields.name',type:'name',position:'afterObject',markers:['name is','named','called'],required:true},{name:'fields.phone',type:'phone',markers:['phone','number'],required:true}]}},
 {id:'warranty.inspect',effect:'read_only',language:{actions:['inspect','review'],objects:['warranty','guarantee'],fields:[{name:'recordId',type:'identifier',markers:['number'],required:true}],contexts:['jobs']}},
 {id:'expense.prepare',effect:'draft',language:{actionConcepts:['prepare'],objects:['expense'],fields:[{name:'amount',type:'money',markers:['amount'],required:true},{name:'address',type:'address',markers:['address']}]}},
];
const engine=speech.createEngine({tools}),context={today:'2026-10-21',sourcePage:'calendar',customers:[{id:'j',name:'John Smith'},{id:'coats',name:'Coats Sail'}]};
const rank=(t,c=context)=>engine.rankCandidates(t,c),top=(t,c)=>rank(t,c).candidates[0];
test('edit distance, phonetics and segmentation produce evidence rather than global aliases',()=>{
 assert.equal(speech.similarity('jobz','jobs').method,'edit_distance');assert.equal(speech.similarity('jibs','jobs').method,'edit_distance');assert.equal(speech.similarity('coats','quotes').method,'phonetic');assert.equal(speech.similarity('in voice','invoice').method,'segmentation');assert.equal(speech.similarity('John','jobs'),null);
});
test('query object recovery requires an exact action anchor and business context',()=>{
 for(const noun of ['jobz','jobbs','jibs','jops']){const r=rank(`What ${noun} do I have tomorrow?`);assert.equal(r.candidates[0].intent,'schedule.query');assert.equal(r.status,'recognized',JSON.stringify(r));assert.ok(r.candidates[0].contextEvidence.exactAnchor)}
 const weak=rank('What jobz do I have?',{});assert.equal(weak.status,'needs_clarification');assert.equal(weak.candidates[0].accepted,false);
 assert.equal(rank('Someone mentioned jobz tomorrow').status,'unsupported');
});
test('phonetic draft candidates keep customer identity exact and require review',()=>{
 const r=top('Prepare a coat for John Smith');assert.equal(r.intent,'quotation.prepare');assert.equal(r.accepted,false);assert.deepEqual(r.parameters.customerRef,{store:'customers',id:'j'});assert.ok(r.issues.some(x=>x.code==='UNCERTAIN_SPEECH_CANDIDATE'));assert.equal(r.normalizedTranscript,'Prepare a quote for John Smith');
 assert.deepEqual(top('Prepare an estimit for Coats Sail').parameters.customerRef,{store:'customers',id:'coats'});
});
test('new tools register vocabulary and typed parameters without custom parsing functions',()=>{
 const r=top('Uh, could you please inspect a guarantee number W-0017');assert.equal(r.intent,'warranty.inspect');assert.equal(r.parameters.recordId,'W-0017');assert.equal(r.accepted,true);
 const reordered=speech.createEngine({tools:[...tools].reverse()}).rankCandidates('Inspect warranty number W-0017',context);assert.equal(reordered.candidates[0].intent,'warranty.inspect');
 assert.throws(()=>speech.createEngine({tools:[...tools,tools[0]]}),/uniquely/);assert.throws(()=>speech.createEngine({tools:[{...tools[0],execute(){}}]}),/execution/);
});
test('critical values retain source spelling and digits rather than fuzzy matching identities',()=>{
 const r=top("Create customer Coats Sail. Phone 512-555-0149");assert.equal(r.parameters.fields.name,'Coats Sail');assert.equal(r.parameters.fields.phone,'+15125550149');assert.ok(r.evidence.some(e=>e.raw==='512-555-0149'));assert.ok(!r.normalizedTranscript.includes('John'));
 const missing=top('Create customer Michael. Phone 512');assert.equal(missing.accepted,false);assert.equal(missing.parameters.fields.phone,'512');
 const name=top('Prepare quote for Jon Smith');assert.equal(name.parameters.customerRef,null);assert.ok(name.issues.some(i=>i.code==='RECORD_NOT_FOUND'));
});
test('negation, conditions, quoted instructions, questions and noise block acceptance',()=>{
 for(const input of ["Don't create customer Michael. Phone 5125550147",'Create customer Michael. Phone 5125550147 if approved','How do I create customer Michael','The customer said create customer Michael','Create customer [noise] Michael']){const r=rank(input);assert.notEqual(r.status,'recognized',input);assert.ok(r.safety.length,input);assert.ok(r.candidates.every(c=>!c.accepted))}
 assert.equal(rank('Could you create customer Michael. Phone 5125550147').status,'recognized');
});
test('self-corrections and contradictory names or amounts require review with original evidence',()=>{
 const corrected=top('Create customer Mark—sorry, Michael. Phone 5125550147');assert.equal(corrected.parameters.fields.name,'Michael');assert.equal(corrected.accepted,false);assert.ok(corrected.issues.some(x=>x.code==='EXPLICIT_CORRECTION_REVIEW'));
 const names=top('Create customer Mark Anderson, Michael Anderson. Phone 5125550147');assert.equal(names.accepted,false);assert.ok(names.issues.some(x=>x.code==='CONFLICTING_CRITICAL_VALUES'));
 const amounts=top('Prepare expense amount $350 or $530');assert.equal(amounts.parameters.amount,null);assert.equal(amounts.accepted,false);
 const exact=top('Prepare expense amount $350.25 address 123 Main St, Unit 4');assert.deepEqual(exact.parameters.amount,{raw:'$350.25',decimal:'350.25'});assert.equal(exact.parameters.address,'123 Main St, Unit 4');
});
test('equal plausible registered tools remain ambiguous independent of registration order',()=>{
 const a={id:'a',effect:'read_only',language:{actions:['inspect'],objects:['permit']}},b={...a,id:'b'};
 for(const tools of [[a,b],[b,a]]){const r=speech.createEngine({tools}).rankCandidates('Inspect permit');assert.equal(r.status,'ambiguous');assert.equal(r.candidates[0].accepted,false)}
});
test('input and context are unchanged; invalid and oversized inputs fail closed',()=>{
 const before=JSON.stringify(context);rank('Prepare a coat for John Smith');assert.equal(JSON.stringify(context),before);
 for(const t of [null,'','x'.repeat(8001)])assert.equal(rank(t).status,'unsupported');assert.equal(engine.rankCandidates('Inspect warranty',null).status,'unsupported');
 assert.equal(typeof engine.execute,'undefined');
});

test('critical spans and safety inspection preserve dates, times, amounts, conditions and quoted commands',()=>{
 const text='Prepare expense amount $350 or $530 if approved on 2026-10-23 at 09:00 or 10:00';const inspection=speech.inspectTranscript(text);assert.ok(inspection.safety.some(i=>i.code==='CONFLICTING_AMOUNTS'));assert.ok(inspection.safety.some(i=>i.code==='CONFLICTING_TIMES'));assert.ok(inspection.safety.some(i=>i.code==='CONDITION_PRESERVED'));for(const span of inspection.criticalSpans)assert.equal(text.slice(span.start,span.end),span.raw);
 assert.notEqual(rank("'Create customer Michael. Phone 5125550147'").status,'recognized');
 assert.equal(top('Prepare expense amount $350oops').accepted,false);
});
test('unparsed qualifiers and conflicting identifiers are clarified rather than discarded',()=>{
 const r=top('Inspect warranty number W-0017 or W-0020');assert.equal(r.accepted,false);assert.ok(r.issues.some(i=>i.code==='CONFLICTING_CRITICAL_VALUES'));
 const minimal=speech.createEngine({tools:[{id:'permit.inspect',effect:'read_only',language:{actions:['inspect'],objects:['permit']}}]});assert.equal(minimal.rankCandidates('Inspect permit after lunch').status,'needs_clarification');assert.equal(minimal.rankCandidates('Inspect permit').status,'recognized');
});
test('typed field paths cannot mutate inherited objects or conflict with another field',()=>{
 const before=Object.prototype.toString.polluted,definition={id:'test',effect:'read_only',language:{actions:['inspect'],objects:['permit'],fields:[{name:'toString.polluted',type:'text',markers:['value']}]}};
 const r=speech.createEngine({tools:[definition]}).rankCandidates('Inspect permit value test');assert.equal(r.candidates[0].parameters.toString.polluted,'test');assert.equal(Object.prototype.toString.polluted,before);
 for(const fields of [[{name:'__proto__.polluted',type:'text'}],[{name:'a',type:'text'},{name:'a.b',type:'text'}]])assert.throws(()=>speech.createEngine({tools:[{...definition,language:{...definition.language,fields}}]}));
});
test('288 generated future-tool variations generalize through metadata, not example lookups',()=>{
 let checked=0;const future={id:'permit.inspect',effect:'read_only',language:{actions:['inspect','review'],objects:['permit','authorization'],contexts:['jobs'],fields:[{name:'recordId',type:'identifier',markers:['number'],required:true}]}};
 const engine=speech.createEngine({tools:[future]});for(const lead of ['', 'Uh, ', 'Could you please ', 'Hey TradeFlow, '])for(const verb of ['inspect','review'])for(const noun of ['permit','authorization','permitt'])for(const id of ['P-0017','P-0001','P-0018','W-0130'])for(const casing of [x=>x,x=>x.toUpperCase(),x=>x.toLowerCase()]){const r=engine.rankCandidates(casing(lead+verb+' '+noun+' number '+id),{sourcePage:'jobs'});assert.equal(r.candidates[0].intent,'permit.inspect');assert.equal(r.candidates[0].parameters.recordId,casing(id));assert.equal(r.status,'recognized',JSON.stringify(r));checked++}assert.equal(checked,288);
});

test('generic structural repetition and filler do not deduplicate names, phone digits or IDs',()=>{
 for(const phrase of ['Inspect inspect a new new warranty number W-0017','Could you just like inspect a warranty number W-0017','Review a, you know, guarantee number W-0017']){const r=rank(phrase,{sourcePage:'jobs'});assert.equal(r.status,'recognized',JSON.stringify(r));assert.equal(r.candidates[0].parameters.recordId,'W-0017')}
 const name=top('Create customer John John Smith. Phone 5125550147');assert.equal(name.accepted,false);assert.equal(name.parameters.fields.name,'John John Smith');
 const phone=top('Create customer Michael. Phone 512 555 555 0147');assert.equal(phone.accepted,false);assert.equal(phone.parameters.fields.phone,'512 555 555 0147');
});

test('initials, quoted names, malformed phone prefixes and unsupported dates remain exact',()=>{
 const r=top('Create customer John A. Smith. Phone 5125550147');assert.equal(r.parameters.fields.name,'John A. Smith');
 const quoted=top('Create customer "Smith, John". Phone 5125550147');assert.equal(quoted.parameters.fields.name,'Smith, John');
 for(const phone of ['++15125550147','1+5125550147','+5125550147']){const value=top('Create customer Michael. Phone '+phone);assert.equal(value.accepted,false);assert.equal(value.parameters.fields.phone,phone)}
 const e=speech.createEngine({tools:[{id:'test.date',effect:'draft',language:{actions:['prepare'],objects:['appointment'],fields:[{name:'date',type:'date',markers:['date'],required:true}]}}]});assert.equal(e.rankCandidates('Prepare appointment date 2026-02-30').candidates[0].accepted,false);
});
