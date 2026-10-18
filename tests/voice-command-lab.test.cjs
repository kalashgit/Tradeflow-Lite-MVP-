'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const lab=require('../public/voice-command-lab.js'),engine=require('../public/command-intelligence.js');
function storage(){const values=new Map([['business-records','keep']]);let writes=0;return {getItem:k=>values.get(k)??null,setItem(k,v){writes++;values.set(k,v)},removeItem:k=>values.delete(k),values,get writes(){return writes}}}
function fixture(id='schedule',extra={}){return {id,name:'Tomorrow schedule',transcript:'What jibs have I got tomorrow?',context:{today:'2026-10-18',customers:[]},expected:{intent:'schedule.query',status:'recognized',effect:'read_only',parameters:{date:'2026-10-19'},clarificationRequired:false},...extra}}
test('interpreting and running fixtures do not persist transcripts or write other storage',()=>{
 const backing=storage(),store=lab.createFixtureStore(backing),record=fixture();assert.deepEqual(store.list(),[]);engine.interpretCommand(record.transcript,record.context);const report=lab.runRegression([record],engine);assert.equal(report.passed,1);assert.equal(backing.writes,0);assert.equal(backing.values.get('business-records'),'keep');assert.equal(store.mode,'persistent');
});
test('explicit saving and editing a fixture round-trip isolated local storage',()=>{
 const backing=storage(),store=lab.createFixtureStore(backing),original=fixture();store.upsert(original);assert.equal(backing.writes,1);original.context.today='2030-01-01';assert.equal(store.list()[0].context.today,'2026-10-18');store.upsert(fixture('schedule',{name:'Corrected fixture title'}));assert.equal(store.list().length,1);assert.equal(store.list()[0].name,'Corrected fixture title');assert.equal(backing.values.get('business-records'),'keep');assert.equal(lab.createFixtureStore(backing).list().length,1);
});
test('memory fallback is explicit and is not claimed as persistent storage',()=>{const store=lab.createFixtureStore();assert.equal(store.mode,'memory');store.upsert(fixture());assert.equal(store.list().length,1);assert.equal(lab.createFixtureStore().list().length,0)});
test('wrong expected outcomes are preserved as failing regression fixtures',()=>{
 const store=lab.createFixtureStore(),record=fixture('wrong',{expected:{intent:'task.prepare',status:'recognized',parameters:{date:'2026-10-20'}}});store.upsert(record);const before=store.exportJSON(),report=lab.runRegression(store.list(),engine);assert.equal(report.failed,1);assert.ok(report.cases[0].differences.some(x=>x.path==='$.intent'));assert.ok(report.cases[0].differences.some(x=>x.path==='$.parameters.date'));assert.equal(store.exportJSON(),before);
});
test('explicit customer field corrections are reproducible without changing records',()=>{
 const record=fixture('phone-correction',{transcript:'Add customer Avery Jones. Phone 555-0177.',context:{today:'2026-10-18',customers:[]},correction:{fields:{phone:'512-555-0177'}},expected:{intent:'customer.create',status:'recognized',effect:'proposes_modification',parameters:{fields:{name:'Avery Jones',phone:'+15125550177'}},clarificationRequired:false}});const before=JSON.stringify(record),report=lab.runRegression([record],engine);assert.equal(report.passed,1,JSON.stringify(report));assert.equal(JSON.stringify(record),before);
});
test('JSON export/import preserves transcript context, expected outcomes and corrections',()=>{
 const first=lab.createFixtureStore(),second=lab.createFixtureStore();first.upsert(fixture());first.upsert(fixture('different',{transcript:'Check my work tomorrow'}));second.importJSON(first.exportJSON());assert.deepEqual(second.list(),first.list());
});
test('bundled named contractor fixtures import explicitly and pass regression',()=>{
 const store=lab.createFixtureStore(),text=fs.readFileSync('tests/fixtures/command-intelligence-cases.json','utf8');assert.equal(store.list().length,0);store.importJSON(text);assert.equal(store.list().length,44);const report=lab.runRegression(store.list(),engine);assert.equal(report.failed,0,JSON.stringify(report.cases.filter(x=>!x.passed)));
});
test('conflicting fixture IDs and invalid imports preserve existing saved examples',()=>{
 const store=lab.createFixtureStore();store.upsert(fixture());const before=store.exportJSON();for(const text of [before,'bad JSON',JSON.stringify({version:2,fixtures:[]}),JSON.stringify({version:1,fixtures:[fixture('valid'),fixture('invalid',{expected:{intent:'schedule.query',status:'invented'}})]})])assert.throws(()=>store.importJSON(text));assert.equal(store.exportJSON(),before);
});
test('corrupt/old stored data is reported instead of being silently overwritten',()=>{
 const backing=storage();backing.values.set(lab.STORAGE_KEY,'not JSON');const store=lab.createFixtureStore(backing);assert.throws(()=>store.list(),/not valid JSON/);assert.throws(()=>store.upsert(fixture()));assert.equal(backing.values.get(lab.STORAGE_KEY),'not JSON');backing.values.set(lab.STORAGE_KEY,JSON.stringify({version:2,fixtures:[]}));assert.throws(()=>store.list(),/version/);assert.equal(backing.writes,0);
});
test('quota/access failures are surfaced and never reported as successful saves',()=>{
 const backing=storage();backing.setItem=()=>{throw Error('Quota exceeded')};const store=lab.createFixtureStore(backing);assert.throws(()=>store.upsert(fixture()),/Quota/);assert.equal(backing.values.has(lab.STORAGE_KEY),false);const blocked=lab.createFixtureStore({getItem(){throw Error('Access blocked')}});assert.throws(()=>blocked.list(),/Access blocked/);
});
test('fixture limits, unsafe keys, extra business data and non-JSON values are rejected',()=>{
 const circular=fixture();circular.context.circular=circular;
 for(const record of [fixture('',{}),fixture('long',{transcript:'x'.repeat(8001)}),fixture('bad-date',{context:{today:'2026-02-30'}}),fixture('unrelated',{context:{customers:[],apiKey:'private'}}),fixture('photo',{context:{customers:[{id:'c',name:'Test',photoData:'not a test context field'}]}}),fixture('function',{expected:{intent:'schedule.query',status:'recognized',parameters:{fn(){}}}}),fixture('invalid-correction',{correction:{fields:1}}),fixture('wrong-context',{context:false}),circular])assert.throws(()=>lab.validateFixture(record));
 assert.throws(()=>lab.validateFixture(JSON.parse('{"id":"bad","name":"bad","transcript":"check work","context":{"__proto__":{"polluted":true}},"expected":{"intent":null,"status":"unsupported"}}')),/Unsafe/);assert.equal({}.polluted,undefined);assert.throws(()=>lab.runRegression(Array.from({length:301},(_,i)=>fixture('f'+i)),engine),/300/);
});
test('deleting and clearing affects only the dedicated lab key',()=>{const backing=storage(),store=lab.createFixtureStore(backing);store.upsert(fixture());store.upsert(fixture('other'));store.remove('schedule');assert.equal(store.list().length,1);store.clear();assert.deepEqual(store.list(),[]);assert.equal(backing.values.get('business-records'),'keep')});
test('adapter failures are visible per case and do not abort the whole regression run',()=>{let count=0;const report=lab.runRegression([fixture('one'),fixture('two')],{interpretCommand(text,context){if(++count===1)throw Error('Adapter unavailable');return engine.interpretCommand(text,context)}});assert.equal(report.failed,1);assert.equal(report.passed,1);assert.equal(report.cases[0].error,'Adapter unavailable')});
test('lab is standalone and its worker scope/cache cannot replace the application shell',()=>{
 const html=fs.readFileSync('public/voice-command-lab.html','utf8'),js=fs.readFileSync('public/voice-command-lab.js','utf8'),sw=fs.readFileSync('public/voice-command-lab-sw.js','utf8');assert.ok(html.includes("scope:'./voice-command-lab.html'"));assert.ok(!html.includes('src="./app.js'));assert.ok(!html.includes('src="./voice-command.js'));for(const name of ['indexedDB','getUserMedia','SpeechRecognition','TradeFlowPilot','commands.execute'])assert.ok(!js.includes(name),name);assert.ok(sw.includes("key.startsWith('tradeflow-command-lab-')"));assert.ok(!sw.includes("tradeflow-lite-"));assert.ok(!sw.includes('localStorage'));assert.ok(html.includes('do not retrain Apple'));
});

test('metrics separate intent, parameter extraction, explicit corrections and unmeasured stages',()=>{
 const corrected=fixture('corrected',{transcript:'Add customer Avery Jones. Phone 555-0177.',correction:{fields:{phone:'512-555-0177'}},expected:{intent:'customer.create',status:'recognized',parameters:{fields:{name:'Avery Jones',phone:'+15125550177'}}}});
 const wrong=fixture('wrong-metric',{expected:{intent:'task.prepare',status:'recognized',parameters:{date:'2026-10-20'}}});
 const report=lab.runRegression([fixture(),wrong,corrected],engine),m=report.metrics;
 assert.deepEqual(m.intent,{evaluated:3,correct:2,accuracy:2/3});assert.equal(m.fieldExtraction.evaluated,2);assert.equal(m.fieldExtraction.correct,1);assert.equal(m.correctedFields.evaluated,2);assert.equal(m.correctedFields.correct,2);
 assert.equal(m.transcription.status,'not_measured');assert.equal(m.transcription.accuracy,null);assert.equal(m.execution.status,'not_measured');assert.equal(m.execution.accuracy,null);
 const empty=lab.runRegression([],engine).metrics;assert.equal(empty.intent.accuracy,null);assert.equal(empty.fieldExtraction.accuracy,null);
 const failed=lab.runRegression([fixture()],{interpretCommand(){throw Error('Failure')}}).metrics;assert.equal(failed.intent.correct,0);assert.equal(failed.fieldExtraction.correct,0);
});
test('transcription provenance survives explicit import/export without claiming measured recognition accuracy',()=>{
 const store=lab.createFixtureStore();store.importJSON(fs.readFileSync('tests/fixtures/command-intelligence-transcription-cases.json','utf8'));
 const before=store.exportJSON(),report=lab.runRegression(store.list(),engine);assert.equal(report.failed,0,JSON.stringify(report.cases.filter(x=>!x.passed)));
 assert.deepEqual(report.metrics.fixtureProvenance,{user_supplied:1,user_reported:0,synthetic:3,unspecified:0});assert.equal(report.metrics.transcription.accuracy,null);assert.equal(report.metrics.intent.correct,4);assert.equal(report.metrics.fieldExtraction.correct,7);
 const second=lab.createFixtureStore();second.importJSON(before);assert.deepEqual(second.list(),store.list());assert.equal(store.exportJSON(),before);assert.match(store.list()[0].provenance.source,/no audio/);
});
test('provenance rejects raw audio, unsupported claims and malformed references',()=>{
 for(const provenance of [{kind:'synthetic',source:'Mutation',audio:'base64'},{kind:'device_verified',source:'No reference'},{kind:'user_reported',source:''},{kind:'user_supplied',source:'Example',intendedText:42}])assert.throws(()=>lab.validateFixture(fixture('bad-provenance',{provenance})));
 const accepted=lab.validateFixture(fixture('reported',{provenance:{kind:'user_reported',source:'Developer pasted intended and recognized text',intendedText:'What jobs have I got tomorrow?'}}));assert.equal(accepted.provenance.kind,'user_reported');
});

test('all 20 supplied error categories import with explicit provenance and safe expected outcomes',()=>{
 const store=lab.createFixtureStore();store.importJSON(fs.readFileSync('tests/fixtures/command-intelligence-error-categories.json','utf8'));const report=lab.runRegression(store.list(),engine);assert.equal(report.total,20);assert.equal(report.failed,0,JSON.stringify(report.cases.filter(c=>!c.passed)));assert.deepEqual(report.metrics.fixtureProvenance,{user_supplied:7,user_reported:0,synthetic:13,unspecified:0});assert.equal(report.metrics.transcription.accuracy,null);assert.equal(report.metrics.execution.accuracy,null);
 const plan=report.cases.find(c=>c.id==='category-multi-command').actual;assert.equal(plan.proposedPlan.executable,false);assert.equal(plan.suggestedCommand,null);
});
test('business timezone and explicit weekday policy round-trip in local fixtures',()=>{
 const store=lab.createFixtureStore();store.upsert(fixture('weekday',{transcript:'Check my jobs next Friday',context:{now:'2026-10-22T01:00:00Z',businessTimeZone:'America/Chicago',nextWeekdayPolicy:'upcoming'},expected:{intent:'schedule.query',status:'recognized',parameters:{date:'2026-10-23'}}}));const second=lab.createFixtureStore();second.importJSON(store.exportJSON());assert.deepEqual(second.list(),store.list());assert.equal(lab.runRegression(second.list(),engine).failed,0);
 for(const context of [{businessTimeZone:'Invalid/Zone'},{nextWeekdayPolicy:'guess'},{now:42}])assert.throws(()=>lab.validateFixture(fixture('invalid-date-context',{context})));
});
