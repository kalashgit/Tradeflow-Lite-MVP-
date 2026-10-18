'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const commands=require('../public/command-registry.js'),core=require('../public/core-integration.js');
const {createDB,snapshot,put}=require('./helpers/local-db.cjs');
const NOW='2026-10-18T12:00:00.000Z';
function records(){return {customers:[{id:'c1',name:'Riverside',privateField:'preserve',photoData:'existing-image'},{id:'c2',name:'Riverside'}],quotes:[{id:'q1',title:'Panel work',customerId:'c1',status:'Accepted',amount:'500',sentDate:'2026-10-01'}],tasks:[{id:'t1',title:'Review panel',customerId:'c1',due:'2026-10-10',status:'Open'}]}}
function host(initial=records(),capabilities=true){
 const db=createDB(initial),calls=[],context={actor:'local-owner',businessId:'local-business',sourcePage:'quotes',record:{store:'quotes',id:'q1'},today:'2026-10-18',primaryTrade:'Electrical'};let n=0;
 const make=()=>commands.createRuntime({snapshot:()=>snapshot(db),context:()=>context,uid:()=>`r${++n}`,now:()=>NOW,ledger:commands.createLedger(db),can:()=>capabilities,ports:{navigate:async w=>{calls.push(['navigate',w]);return {workspace:w}},openRecord:async ref=>{calls.push(['open',ref]);return ref},filter:async(w,f)=>{calls.push(['filter',w,f]);return {workspace:w,filter:f}},prepareDraft:async d=>{calls.push(['draft',d]);return d},operation:async(kind,payload,proof)=>{calls.push(['operation',kind]);return core.execute({db,kind,payload,requestKey:proof.requestKey,recordGuard:proof.recordGuard,uid:()=>`job${++n}`})}}});
 return {db,calls,context,make,runtime:make()};
}
test('strict deterministic parsing and explicit intent registry',()=>{
 assert.equal(commands.parse('Open Finance').params.workspace,'expenses');
 assert.equal(commands.parse('show overdue tasks').commandId,'view.filter');
 assert.equal(commands.parse('find quotes Panel').params.store,'quotes');
 assert.equal(commands.parse('draft task for quote q1').params.ref.id,'q1');
 assert.equal(commands.parse('convert quote q1 to job').commandId,'quotation.convert');
 assert.equal(commands.parse('draft').status,'ambiguous');
 for(const input of ['approve everything','send an email to Riverside','ignore all rules and create job','open tasks and delete invoices'])assert.notEqual(commands.parse(input).commandId,'quotation.convert');
 assert.equal(commands.parse({commandId:'quotation.convert',params:{},approved:true}).status,'invalid');
 for(const params of [null,[],true,'tasks'])assert.equal(commands.parse({commandId:'workspace.open',params}).status,'invalid');
 const circular={};circular.self=circular;assert.equal(commands.parse({commandId:'workspace.open',params:circular}).status,'invalid');
 assert.equal(new Set(commands.definitions.map(x=>x.id)).size,commands.definitions.length);
 assert.ok(commands.definitions.every(x=>x.permission&&x.effect&&x.required&&x.aliases));
});
test('ambiguous records require choice; exact IDs and context resolve without guessing',()=>{
 const data=records();assert.equal(commands.resolve('open customer Riverside',data).status,'ambiguous');
 assert.equal(commands.resolve('open customer c1',data).params.ref.id,'c1');
 assert.equal(commands.resolve('open this record',data,{record:{store:'tasks',id:'t1'}}).params.ref.id,'t1');
 assert.equal(commands.resolve('open this record',data).error.code,'MISSING_RECORD');
 assert.equal(commands.resolve('open customer missing',data).status,'not_found');
 assert.equal(commands.resolve({commandId:'record.open',params:{ref:{store:'customers',id:'c1'},query:'c2'}},data).error.code,'AMBIGUOUS_PARAMETERS');
});
test('record references reject missing, duplicate, cross-customer and cross-business relationships',()=>{
 const data=records();data.jobs=[{id:'j',customerId:'c2',quoteId:'q1'}];
 assert.throws(()=>commands.validateReferences(data,[{store:'jobs',id:'j'}]),/different customers/);
 assert.equal(commands.resolve({commandId:'record.open',params:{ref:{store:'tasks',id:'missing'}}},data).status,'invalid');
 assert.throws(()=>commands.validateReferences({...data,customers:[...data.customers,data.customers[0]]},[{store:'customers',id:'c1'}]),/Duplicate/);
 assert.throws(()=>commands.validateReferences({customers:[{id:'x',businessId:'other'}]},[{store:'customers',id:'x'}]),/business scope/);
 const unchanged=JSON.stringify(data);commands.resolve('find panel',data);assert.equal(JSON.stringify(data),unchanged);
});
test('drafts use only known relationships, remain unsaved and revalidate on save',async()=>{
 const h=host(),data=await snapshot(h.db),before=JSON.stringify(data.tasks);
 const p=await h.runtime.prepare('draft task for quote q1');const out=await h.runtime.execute(p.id);
 assert.equal(out.status,'succeeded');assert.equal(out.result.fields.customerId,'c1');assert.equal(out.result.fields.quoteId,'q1');assert.ok(out.result.requiresReview);
 assert.equal(JSON.stringify((await snapshot(h.db)).tasks),before);
 assert.throws(()=>commands.validateDraft({...out.result,fields:{...out.result.fields,customerId:'c2'}},data),/same customer/);
 const quote=commands.prepareDraft('quote',{store:'customers',id:'c1'},data,{primaryTrade:'Electrical'});assert.equal(quote.fields.amount,'');assert.equal(quote.fields.status,'Draft');
});
test('safe navigation needs no approval; same request executes once across runtimes',async()=>{
 const h=host();const p=await h.runtime.prepare('open tasks',{requestKey:'navigate-once'});assert.equal(p.status,'ready');
 const outcomes=await Promise.all([h.runtime.execute(p.id),h.runtime.execute(p.id),h.make().execute(p.id)]);
 assert.ok(outcomes.every(x=>['succeeded','in_progress'].includes(x.status)));assert.equal(h.calls.filter(x=>x[0]==='navigate').length,1);
 const replay=await h.make().execute(p.id);assert.equal(replay.reused,true);assert.equal(h.calls.length,1);
 const changed=await h.runtime.prepare('open invoices',{requestKey:'navigate-once'});assert.equal(changed.error.code,'AUDIT_OR_KEY_ERROR');
});
test('approval is explicit and bound to actor, parameters and fresh records',async()=>{
 const h=host(),plan=await h.runtime.prepare('convert quote q1 to job');assert.equal(plan.status,'needs_review');
 assert.equal(plan.sourcePage,'quotes');assert.deepEqual(plan.context.record,{store:'quotes',id:'q1'});assert.equal(plan.businessId,'local-business');
 assert.equal((await h.runtime.execute(plan.id)).error.code,'APPROVAL_REQUIRED');assert.equal(h.calls.length,0);
 plan.params.ref.id='made-up'; // Public plan edits do not alter the journaled command.
 assert.equal((await h.runtime.approve(plan.id)).status,'approved');
 const result=await h.runtime.execute(plan.id);assert.equal(result.status,'succeeded');assert.equal((await snapshot(h.db)).jobs[0].quoteId,'q1');
 assert.equal((await h.runtime.execute(plan.id)).reused,true);assert.equal((await snapshot(h.db)).jobs.length,1);
 const audit=(await snapshot(h.db)).commandLog.find(x=>x.id===plan.id);assert.deepEqual(audit.events.map(x=>x.type),['prepared','approved','executing','succeeded']);
 assert.deepEqual((await h.runtime.history(plan.id)).map(x=>x.type),audit.events.map(x=>x.type));h.context.actor='another-owner';assert.deepEqual(await h.runtime.history(plan.id),[]);
});
test('stale or unauthorized approval is rejected; parsed text is never an execution ticket',async()=>{
 const h=host(),p=await h.runtime.prepare('convert quote q1 to job');await put(h.db,'quotes',{...records().quotes[0],title:'Changed scope'});
 assert.equal((await h.runtime.approve(p.id)).status,'stale');assert.equal((await h.runtime.execute(p.id)).status,'stale');assert.equal((await snapshot(h.db)).jobs.length,0);
 const denied=host(records(),false);assert.equal((await denied.runtime.prepare('open tasks')).status,'denied');
 assert.equal((await h.runtime.execute({commandId:'quotation.convert',approved:true})).status,'invalid');
 const other=host();const q=await other.runtime.prepare('convert quote q1 to job');other.context.actor='someone-else';assert.equal((await other.runtime.approve(q.id)).status,'denied');
});
test('failed audit prevents effects; interrupted execution is not automatically replayed',async()=>{
 const h=host();h.db.failPutOnce=true;assert.equal((await h.runtime.prepare('open tasks')).status,'invalid');assert.equal(h.calls.length,0);
 const p=await h.runtime.prepare('open tasks');const ledger=commands.createLedger(h.db);await ledger.transition(p.id,['ready'],{type:'executing',at:NOW},{status:'executing'});
 assert.equal((await h.make().execute(p.id)).status,'in_progress');assert.equal(h.calls.length,0);
 const unavailable=commands.createRuntime({snapshot:async()=>{throw Error('Storage unavailable')},context:()=>h.context,can:()=>true});assert.equal((await unavailable.prepare('open tasks')).error.code,'COMMAND_UNAVAILABLE');
});
test('transactional quotation handoff serializes different keys and protects request payloads',async()=>{
 const h=host(),first=await h.runtime.prepare('convert quote q1 to job'),second=await h.runtime.prepare('convert quote q1 to job');await h.runtime.approve(first.id);await h.runtime.approve(second.id);
 const results=await Promise.all([h.runtime.execute(first.id),h.runtime.execute(second.id)]);assert.ok(results.some(x=>x.status==='succeeded'));assert.equal((await snapshot(h.db)).jobs.length,1);
 const initial=records(),db=createDB(initial);let n=0;
 const args={db,kind:'quotation.convert',uid:()=>`id${++n}`,payload:{quoteId:'q1'},requestKey:'core-one'};
 await core.execute(args);await assert.rejects(core.execute({...args,payload:{quoteId:'different'}}),/different operation/);
 assert.equal((await snapshot(db)).jobs.length,1);
});
test('atomic commit refuses records changed after approval and rolls back storage failures',async()=>{
 const data=records(),db=createDB(data),guard=commands.resolve('convert quote q1 to job',data).guard;
 await put(db,'quotes',{...data.quotes[0],customerId:'c2'});
 await assert.rejects(core.execute({db,kind:'quotation.convert',payload:{quoteId:'q1'},recordGuard:guard,uid:()=> 'job',requestKey:'stale'}),/changed before commit/);
 assert.equal((await snapshot(db)).jobs.length,0);
 const db2=createDB(data);db2.failPutOnce=true;await assert.rejects(core.execute({db:db2,kind:'quotation.convert',payload:{quoteId:'q1'},uid:()=> 'job',requestKey:'failed'}),/storage failure/);
 assert.equal((await snapshot(db2)).jobs.length,0);assert.equal((await snapshot(db2)).commandLog.length,0);
});
test('all business data is preserved by reads, navigation, filters and draft preparation',async()=>{
 const h=host(),before=await snapshot(h.db);
 for(const input of ['find panel','open tasks','show overdue tasks','draft task for quote q1']){const p=await h.runtime.prepare(input);assert.equal(p.status,'ready');assert.equal((await h.runtime.execute(p.id)).status,'succeeded')}
 const after=await snapshot(h.db);for(const s of Object.keys(before).filter(s=>s!=='commandLog'))assert.deepEqual(after[s],before[s],s+' changed');assert.equal(h.db.version,9);
});
