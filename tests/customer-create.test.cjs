'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const commands=require('../public/command-registry.js'),core=require('../public/core-integration.js');
const {createDB,snapshot,put}=require('./helpers/local-db.cjs');
const NOW='2026-10-18T12:00:00.000Z';
const SOURCE='Add a new customer called John Smith. His number is 512-555-0198, and he needs electrical work in Austin.';
const fields=(changes={})=>({name:'John Smith',phone:'512-555-0198',email:'',address:'Austin',company:'',notes:'Needs electrical work.',...changes});
const request=(values=fields(),extra={})=>({commandId:'customer.create',params:{fields:values,...extra}});
function host(initial={}){
 const db=createDB(initial),calls=[],context={actor:'local-owner',businessId:'local-business',sourcePage:'customers',record:null,today:'2026-10-18'};
 let sequence=0,sourceText,allowed=true;
 const make=()=>commands.createRuntime({snapshot:()=>snapshot(db),context:()=>context,uid:()=>`customer-request-${++sequence}`,now:()=>NOW,ledger:commands.createLedger(db),can:permission=>allowed&&['read','navigate','draft','modify:customer.create'].includes(permission),ports:{
  openRecord:async ref=>ref,
  operation:async(kind,payload,proof)=>{calls.push({kind,payload,proof});return core.execute({db,kind,payload,uid:()=>`customer-${++sequence}`,requestKey:proof.requestKey,requestId:proof.requestId,recordGuard:proof.recordGuard,...(sourceText===undefined?{}:{sourceText})})}
 }});
 return {db,calls,context,make,runtime:make(),retain:value=>{sourceText=value},permission:value=>{allowed=value}};
}
async function save(h,values=fields(),extra={}){
 const plan=await h.runtime.prepare(request(values,extra));assert.equal(plan.status,'needs_review',JSON.stringify(plan));
 const approved=await h.runtime.approve(plan.id);assert.equal(approved.status,'approved',JSON.stringify(approved));
 const result=await h.runtime.execute(plan.id);assert.equal(result.status,'succeeded',JSON.stringify(result));
 return {plan,result};
}
function createdId(result){return result.result.id||result.result.ref?.id||result.result.customerId}
test('customer creation is a registered modification requiring explicit approval, not text authorization',async()=>{
 const def=commands.definitions.find(x=>x.id==='customer.create');assert.ok(def);assert.equal(def.effect,'modification');assert.equal(def.permission,'modify:customer.create');assert.equal(def.approval,'explicit');
 const h=host(),plan=await h.runtime.prepare(request());assert.equal(plan.status,'needs_review',JSON.stringify(plan));
 assert.equal((await snapshot(h.db)).customers.length,0);assert.equal((await h.runtime.execute(plan.id)).error.code,'APPROVAL_REQUIRED');assert.equal(h.calls.length,0);
 assert.equal((await h.runtime.execute({commandId:'customer.create',params:{fields:fields()},approved:true})).status,'invalid');
 assert.equal(commands.parse({...request(),approved:true}).status,'invalid');
 plan.params.fields.name='Unreviewed edit';
 assert.equal((await h.runtime.approve(plan.id)).status,'approved');const result=await h.runtime.execute(plan.id);assert.equal(result.status,'succeeded',JSON.stringify(result));
 const customer=(await snapshot(h.db)).customers[0];assert.equal(customer.name,'John Smith');assert.equal(customer.phone,'+15125550198');assert.equal(createdId(result),customer.id);
 assert.deepEqual((await h.runtime.history(plan.id)).map(x=>x.type),['prepared','approved','executing','succeeded']);
});
test('customer data is normalized without filling unsupported or absent information',async()=>{
 const h=host();await save(h,fields({name:'  Jane Doe  ',phone:'',email:' JANE@EXAMPLE.COM ',address:'',company:'',notes:''}));
 const row=(await snapshot(h.db)).customers[0];assert.equal(row.name,'Jane Doe');assert.equal(row.email,'jane@example.com');
 for(const key of ['phone','address','company','notes'])assert.equal(row[key],'',key);
 for(const key of ['appointment','scheduledAt','date','latitude','longitude'])assert.equal(row[key],undefined,key);
});
test('invalid names, phone numbers and unregistered fields cannot reach persistence',async()=>{
 const h=host();
 for(const values of [fields({name:''}),fields({name:'   '}),fields({phone:'12345'}),fields({phone:'512-555-0198 or 512-555-0199'}),fields({phone:'512-555-0198 ext unknown'}),fields({email:'not-an-email'}),fields({phone:5125550198}),{...fields(),appointments:['tomorrow']},{...fields(),id:'overwrite-id'}]){
  const plan=await h.runtime.prepare(request(values));assert.ok(!['ready','needs_review','approved','succeeded'].includes(plan.status),JSON.stringify(plan));
 }
 assert.equal((await snapshot(h.db)).customers.length,0);assert.equal(h.calls.length,0);
});
test('likely duplicates include normalized legacy phones and name-only matches, with exact acknowledgement',async()=>{
 const initial={customers:[{id:'phone-match',name:'Different name',phone:'+1 (512) 555-0198',custom:'keep'},{id:'name-match',name:' JOHN   SMITH ',phone:''},{id:'unrelated',name:'Elsewhere',phone:'737-555-0123'}]};
 const h=host(initial),blocked=await h.runtime.prepare(request());
 if(blocked.id){await h.runtime.approve(blocked.id);assert.notEqual((await h.runtime.execute(blocked.id)).status,'succeeded')}
 assert.equal((await snapshot(h.db)).customers.length,3);
 for(const reviewedDuplicateIds of [['phone-match'],['name-match'],['name-match','phone-match','unrelated']]){
  const plan=await h.runtime.prepare(request(fields(),{reviewedDuplicateIds}));
  if(plan.id){await h.runtime.approve(plan.id);assert.notEqual((await h.runtime.execute(plan.id)).status,'succeeded')}
 }
 const {result}=await save(h,fields(),{reviewedDuplicateIds:['name-match','phone-match']});
 assert.equal((await snapshot(h.db)).customers.length,4);assert.ok(createdId(result));
 assert.deepEqual((await snapshot(h.db)).customers.find(x=>x.id==='phone-match'),initial.customers[0]);
});
test('a newly matching customer invalidates review while unrelated records do not',async()=>{
 const h=host(),plan=await h.runtime.prepare(request());assert.equal(plan.status,'needs_review');await h.runtime.approve(plan.id);
 await put(h.db,'customers',{id:'racing-duplicate',name:'John Smith',phone:'+15125550198'});
 const stale=await h.runtime.execute(plan.id);assert.equal(stale.status,'stale',JSON.stringify(stale));assert.equal((await snapshot(h.db)).customers.length,1);
 const fresh=host(),review=await fresh.runtime.prepare(request());assert.equal(review.status,'needs_review');await fresh.runtime.approve(review.id);
 await put(fresh.db,'customers',{id:'new-unrelated',name:'Another customer',phone:'737-555-0123'});
 const succeeded=await fresh.runtime.execute(review.id);assert.equal(succeeded.status,'succeeded',JSON.stringify(succeeded));assert.equal((await snapshot(fresh.db)).customers.length,2);
});
test('a changed duplicate record requires reviewing its current details again',async()=>{
 const h=host({customers:[{id:'duplicate',name:'John Smith',phone:''}]});
 const plan=await h.runtime.prepare(request(fields(),{reviewedDuplicateIds:['duplicate']}));assert.equal(plan.status,'needs_review');
 await put(h.db,'customers',{id:'duplicate',name:'John Smith',phone:'737-555-0123',notes:'Details corrected after review'});
 assert.equal((await h.runtime.approve(plan.id)).status,'stale');assert.equal((await snapshot(h.db)).customers.length,1);
});
test('same request submissions replay safely across runtimes and retain one audit lifecycle',async()=>{
 const h=host(),plan=await h.runtime.prepare(request(),{requestKey:'repeat-customer'});assert.equal(plan.status,'needs_review');await h.runtime.approve(plan.id);
 const outcomes=await Promise.all([h.runtime.execute(plan.id),h.runtime.execute(plan.id),h.make().execute(plan.id)]);
 assert.ok(outcomes.every(x=>['succeeded','in_progress'].includes(x.status)),JSON.stringify(outcomes));
 const replay=await h.make().execute(plan.id);assert.equal(replay.status,'succeeded');assert.equal(replay.reused,true);
 assert.equal((await snapshot(h.db)).customers.length,1);assert.equal(h.calls.length,1);assert.equal((await h.runtime.history(plan.id)).filter(x=>x.type==='executing').length,1);
 const again=await h.runtime.prepare(request());if(again.id){await h.runtime.approve(again.id);assert.notEqual((await h.runtime.execute(again.id)).status,'succeeded')}
 assert.equal((await snapshot(h.db)).customers.length,1);
});
test('different approved request keys cannot race into duplicate customer creation',async()=>{
 const h=host(),first=await h.runtime.prepare(request()),second=await h.runtime.prepare(request());assert.equal(first.status,'needs_review');assert.equal(second.status,'needs_review');
 await h.runtime.approve(first.id);await h.runtime.approve(second.id);
 const outcomes=await Promise.all([h.runtime.execute(first.id),h.make().execute(second.id)]);assert.ok(outcomes.some(x=>x.status==='succeeded'),JSON.stringify(outcomes));
 assert.equal((await snapshot(h.db)).customers.length,1);
});
test('Core serializes customer inserts and binds each idempotency key to the reviewed payload',async()=>{
 const db=createDB();let n=0;
 const args={db,kind:'customer.create',payload:{fields:fields(),reviewedDuplicateIds:[]},uid:()=>`direct-${++n}`,requestKey:'direct-customer'};
 const outcomes=await Promise.all([core.execute(args),core.execute(args)]);assert.equal(outcomes[0].id,outcomes[1].id);assert.ok(outcomes.some(x=>x.reused));assert.equal((await snapshot(db)).customers.length,1);
 await assert.rejects(async()=>core.execute({...args,payload:{fields:fields({name:'Jane Doe',phone:'737-555-0123'}),reviewedDuplicateIds:[]}}),/different|bound|payload|request key/i);
 await assert.rejects(async()=>core.execute({...args,requestKey:'new-customer-key'}),/duplicate|review|changed/i);assert.equal((await snapshot(db)).customers.length,1);
});
test('Core rechecks the likely duplicate set atomically instead of trusting an earlier snapshot',async()=>{
 const db=createDB(),resolved=commands.resolve(request(),await snapshot(db),{businessId:'local-business'});assert.equal(resolved.status,'needs_review');
 await put(db,'customers',{id:'newly-matching',name:'Someone else',phone:'+15125550198'});
 await assert.rejects(async()=>core.execute({db,kind:'customer.create',payload:{fields:fields(),reviewedDuplicateIds:[]},recordGuard:resolved.guard,uid:()=> 'must-not-insert',requestKey:'atomic-stale'}),/duplicate|review|changed/i);
 assert.equal((await snapshot(db)).customers.length,1);assert.equal((await snapshot(db)).commandLog.length,0);
});
test('source text is not persisted by default and cannot enter structured command parameters',async()=>{
 const h=host();await save(h);const data=await snapshot(h.db);
 assert.ok(!JSON.stringify(data).includes(SOURCE));assert.equal(data.settings.filter(x=>String(x.id).startsWith('customer-source:')).length,0);
 for(const extra of [{sourceText:SOURCE},{originalText:SOURCE},{transcript:SOURCE}]){const result=await h.runtime.prepare(request(fields(),extra));assert.equal(result.status,'invalid',JSON.stringify(result))}
 assert.equal((await snapshot(h.db)).customers.length,1);
});
test('optional source retention is hash bound, local, separately removable and never in audit',async()=>{
 assert.equal(typeof core.hashSource,'function');const sourceHash=await core.hashSource(SOURCE);assert.match(sourceHash,/^[a-f0-9]{64}$/);
 const h=host();h.retain(SOURCE);const {result}=await save(h,fields(),{sourceHash}),id=createdId(result),data=await snapshot(h.db);
 const retained=data.settings.find(x=>x.id==='customer-source:'+id);assert.ok(retained);assert.equal(retained.customerId,id);assert.equal(retained.sourceHash,sourceHash);assert.equal(retained.text,SOURCE);assert.ok(retained.createdAt);
 assert.ok(!JSON.stringify(data.commandLog).includes(SOURCE));assert.ok(!JSON.stringify(data.customers).includes(SOURCE));
 const removal=await h.runtime.prepare({commandId:'customer.source.delete',params:{ref:{store:'customers',id}}});assert.equal(removal.status,'needs_review',JSON.stringify(removal));
 assert.equal((await h.runtime.execute(removal.id)).status,'needs_review');assert.ok((await snapshot(h.db)).settings.find(x=>x.id===retained.id));
 await h.runtime.approve(removal.id);const removed=await h.runtime.execute(removal.id);assert.equal(removed.status,'succeeded',JSON.stringify(removed));assert.equal((await snapshot(h.db)).settings.find(x=>x.id===retained.id),undefined);
 assert.equal((await snapshot(h.db)).customers.length,1);assert.equal((await h.runtime.execute(removal.id)).reused,true);assert.ok(!JSON.stringify((await snapshot(h.db)).commandLog).includes(SOURCE));
});
test('mismatched retained text and failed transactions cannot partially save records or metadata',async()=>{
 const sourceHash=await core.hashSource(SOURCE),db=createDB();
 await assert.rejects(async()=>core.execute({db,kind:'customer.create',payload:{fields:fields(),reviewedDuplicateIds:[],sourceHash},sourceText:'A different unreviewed instruction.',uid:()=> 'wrong-source',requestKey:'wrong-source'}),/hash|source|match|original wording|retain/i);
 assert.equal((await snapshot(db)).customers.length,0);assert.equal((await snapshot(db)).settings.length,0);assert.equal((await snapshot(db)).commandLog.length,0);
 const rollback=createDB();rollback.failPutOnce=true;
 await assert.rejects(async()=>core.execute({db:rollback,kind:'customer.create',payload:{fields:fields(),reviewedDuplicateIds:[],sourceHash},sourceText:SOURCE,uid:()=> 'rolled-back',requestKey:'failed-storage'}),/storage failure/i);
 const after=await snapshot(rollback);assert.equal(after.customers.length,0);assert.equal(after.settings.length,0);assert.equal(after.commandLog.length,0);
 const metadataFailure=createDB(),transaction=metadataFailure.transaction;
 metadataFailure.transaction=(...args)=>{const tx=transaction(...args),objectStore=tx.objectStore;tx.objectStore=name=>{const store=objectStore(name);return name==='settings'?{...store,put(){throw Error('Source metadata storage failure')}}:store};return tx};
 await assert.rejects(async()=>core.execute({db:metadataFailure,kind:'customer.create',payload:{fields:fields(),reviewedDuplicateIds:[],sourceHash},sourceText:SOURCE,uid:()=> 'metadata-rollback',requestKey:'failed-metadata'}),/metadata storage failure/i);
 const metadataAfter=await snapshot(metadataFailure);assert.equal(metadataAfter.customers.length,0);assert.equal(metadataAfter.settings.length,0);assert.equal(metadataAfter.commandLog.length,0);
});
test('customer creation and source removal preserve existing records, foreign data and schema version 9',async()=>{
 const initial={customers:[{id:'existing',name:'Existing owner',phone:'737-555-0123',custom:{retain:true},photoData:'retain-image'},{id:'foreign',name:'John Smith',phone:'+15125550198',businessId:'other'}],quotes:[{id:'q',customerId:'existing',status:'Accepted',custom:'retain'}],jobs:[{id:'j',customerId:'existing',quoteId:'q',status:'Planned'}],tasks:[{id:'t',customerId:'existing',due:'2026-10-20',status:'Open'}],settings:[{id:'business',company:'Keep business',accent:'#F05080'},{id:'private-setting',values:{keep:1}}],commandLog:[{id:'legacy-command',kind:'legacy',recordIds:['existing']}],calendarEntries:[{id:'event',title:'Existing appointment',date:'2026-10-20',time:'09:00'}]};
 const h=host(initial),before=await snapshot(h.db);await save(h);const after=await snapshot(h.db);
 for(const store of Object.keys(before).filter(s=>!['customers','commandLog'].includes(s)))assert.deepEqual(after[store],before[store],store+' changed');
 for(const row of before.customers)assert.deepEqual(after.customers.find(x=>x.id===row.id),row);for(const row of before.commandLog)assert.deepEqual(after.commandLog.find(x=>x.id===row.id),row);
 assert.equal(h.db.version,9);assert.deepEqual(h.db.objectStoreNames,Object.keys(before));
 h.permission(false);assert.equal((await h.runtime.prepare(request(fields({name:'Denied customer',phone:'512-555-0199'})))).status,'denied');
});