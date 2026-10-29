const test=require('node:test'),assert=require('node:assert/strict');
const events=require('../public/business-events.js'),core=require('../public/core-integration.js'),commands=require('../public/command-registry.js'),intel=require('../public/operational-intelligence.js');
const {createDB,snapshot}=require('./helpers/local-db.cjs');
const fixture=()=>createDB({customers:[{id:'c1',name:'Test customer'}],quotes:[{id:'q1',title:'Accepted work',customerId:'c1',status:'Accepted'}]});
async function rows(db){return (await snapshot(db)).commandLog.filter(r=>r.kind==='domain.event')}
function runtime(db,{allowed=true}={}){
 let sequence=0,permit=allowed;
 const engine=intel.createEngine({commands,detectors:intel.builtinDetectors.filter(d=>d.id==='quotation.accepted_handoff')});
 const rt=commands.createRuntime({snapshot:()=>snapshot(db),context:()=>({actor:'local-owner',businessId:'local-business',sourcePage:'jobs',today:'2026-10-29'}),uid:()=>crypto.randomUUID(),ledger:commands.createLedger(db),can:()=>permit,ports:{review:async()=>engine.evaluate(await snapshot(db),{today:'2026-10-29',now:'2026-10-29T12:00:00.000Z'})}});
 return {rt,allow:()=>permit=true,deny:()=>permit=false,engine};
}
test('GUI status writes and journal event commit atomically with real record references',async()=>{
 const db=fixture();await events.write(db,'quotes',{id:'q1',title:'Accepted work',customerId:'c1',status:'Sent'});
 const journal=await rows(db);assert.equal(journal.length,1);assert.equal(journal[0].type,'quotation.sent');assert.deepEqual(journal[0].ref,{store:'quotes',id:'q1'});
 const before=await snapshot(db);db.failPutOnce=true;await assert.rejects(events.write(db,'quotes',{id:'q1',status:'Declined'}));assert.deepEqual(await snapshot(db),before);
});
test('core accepted-quote conversion emits one job-created event despite repeat execution',async()=>{
 const db=fixture(),request={db,kind:'quotation.convert',payload:{quoteId:'q1'},uid:()=>crypto.randomUUID(),requestKey:'conversion-1'};
 await core.execute(request);await core.execute(request);await core.execute({...request,requestKey:'conversion-2'});
 assert.equal((await snapshot(db)).jobs.length,1);const journal=await rows(db);assert.equal(journal.length,1);assert.equal(journal[0].type,'job.created');assert.equal(journal[0].correlationId,'conversion-1');
});
test('actual record commit triggers authorized review and clears the existing handoff finding',async()=>{
 const db=fixture(),r=runtime(db);assert.equal(r.engine.evaluate(await snapshot(db),{today:'2026-10-29'}).findings.length,1);
 await core.execute({db,kind:'quotation.convert',payload:{quoteId:'q1'},uid:()=>crypto.randomUUID(),requestKey:'conversion'});
 const result=await events.drain({db,events:await rows(db),commands:r.rt});assert.equal(result.processed,1);
 const journal=await rows(db);assert.equal(journal[0].status,'processed');assert.deepEqual(journal[0].result.findingIds,[]);assert.equal(journal[0].result.ruleId,'operational-review');
 await events.drain({db,events:await rows(db),commands:r.rt});assert.equal((await rows(db))[0].attempts,1);
});
test('parallel consumers lease events and cannot execute the same review twice',async()=>{
 const db=fixture(),r=runtime(db);await events.write(db,'customers',{id:'c1',name:'Updated'});const pending=await rows(db);
 await Promise.all([events.drain({db,events:pending,commands:r.rt}),events.drain({db,events:pending,commands:runtime(db).rt})]);
 const journal=await rows(db);assert.equal(journal[0].attempts,1);assert.equal(journal[0].status,'processed');
});
test('permission denial, retry, rule suspension and unsupported automatic mutations are explicit',async()=>{
 const db=fixture(),r=runtime(db,{allowed:false});let time=Date.now();await events.write(db,'customers',{id:'c1',name:'Updated'});
 await events.drain({db,events:await rows(db),commands:r.rt,now:()=>time});assert.equal((await rows(db))[0].status,'pending');
 r.allow();time+=61000;await events.drain({db,events:await rows(db),commands:r.rt,now:()=>time});assert.equal((await rows(db))[0].status,'processed');
 const suspended=await events.drain({db,events:[],commands:r.rt,rule:{enabled:false}});assert.equal(suspended.status,'suspended');
 await assert.rejects(events.drain({db,events:[],commands:r.rt,rule:{id:'operational-review',enabled:true,effect:'modification'}}),/read-only/);
});
test('business review is a read-only audited action and permission is rechecked at execution',async()=>{
 const db=fixture(),r=runtime(db),plan=await r.rt.prepare('review business');assert.equal(plan.effect,'read');assert.equal(plan.status,'ready');r.deny();
 assert.equal((await r.rt.execute(plan.id)).status,'denied');assert.equal((await snapshot(db)).jobs.length,0);
 assert.equal(commands.parse('review operations').commandId,'intelligence.review');
});
test('malformed or mismatched event contracts are quarantined without starving later valid events',async()=>{
 const db=fixture(),r=runtime(db);await events.write(db,'customers',{id:'c1',name:'Updated'});
 const valid=(await rows(db))[0],bad={...valid,id:'invalid-event',type:'quotation.accepted'};
 await assert.rejects(Promise.resolve().then(()=>events.validate(bad)),/Invalid/);
 const tx=db.transaction('commandLog','readwrite');tx.objectStore('commandLog').put(bad);await new Promise(resolve=>tx.oncomplete=resolve);
 await events.drain({db,events:[bad,valid],commands:r.rt});const journal=await rows(db);
 assert.equal(journal.find(e=>e.id==='invalid-event').status,'failed');assert.equal(journal.find(e=>e.id===valid.id).status,'processed');
});
