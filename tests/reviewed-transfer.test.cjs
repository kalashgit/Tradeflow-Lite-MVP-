const test=require('node:test'),assert=require('node:assert/strict');
const {createDB,STORES,put}=require('./helpers/local-db.cjs');
let prepareTransfer,createSyncQueue,types;
require('node:test').before(async()=>{({prepareTransfer}=await import('../public/migration-ui.js'));({createSyncQueue}=await import('../public/sync-queue.js'));types=(await import('../public/record-model.js')).RECORD_TYPES});
function fixture(){
 const db=createDB({customers:[{id:'c1',name:'Synthetic owner data',businessId:'local-business'}],jobs:[{id:'j1',customerId:'c1'}],invoices:[{id:'i1',jobId:'j1',customerId:'c1'}],payments:[{id:'p1',invoiceId:'i1',customerId:'c1',amount:25}]}),remote=new Map(),written=[];
 let identity={issuer:'https://verified.example',subject:'owner_001'};
 const session=async()=>({status:'signed_in',identity,businesses:[{business_id:'business_001',business_name:'Target business',role:'owner'}],capabilities:{recordTypes:types}});
 const transport={read:async(type,id)=>remote.has(type+':'+id)?{status:200,record:structuredClone(remote.get(type+':'+id))}:{status:404},write:async(type,id,body)=>{
  if(type==='jobs')assert.ok(remote.has('customers:c1'));if(type==='invoices')assert.ok(remote.has('jobs:j1'));if(type==='payments')assert.ok(remote.has('invoices:i1'));
  if(remote.has(type+':'+id))return {status:409};written.push(type);remote.set(type+':'+id,{businessId:'business_001',type,id,revision:1,record:structuredClone(body.record)});return {status:201};
 }};
 const prepare=mapping=>session().then(s=>prepareTransfer({db,stores:STORES,businessId:'business_001',session:s,transport,allowLocalBusinessMapping:mapping}));
 const queue=()=>createSyncQueue({db,businessId:'business_001',session,transport});
 const stage=(q,plan,extra={})=>q.stageMigration({changes:plan.changes,expectedStores:plan.expectedStores,expectedIdentity:plan.identity,approve:()=>true,backupConfirmed:true,backupChecksum:plan.snapshot.integrity.sha256,...extra});
 return {db,remote,written,session,transport,prepare,queue,stage,changeIdentity:()=>identity={...identity,subject:'another_owner'}};
}
test('review never uploads and requires explicit local-business mapping',async()=>{
 const f=fixture(),blocked=await f.prepare(false);assert.equal(blocked.review.readyForReview,false);assert.equal(blocked.review.requiresBusinessRelabel.length,1);assert.equal(f.written.length,0);
 const plan=await f.prepare(true);assert.equal(plan.review.readyForReview,true);assert.equal(plan.review.mappedLocalRecords.length,1);assert.equal(f.db.dump().customers[0].businessId,'local-business');assert.equal(f.written.length,0);
});
test('reviewed staging and filtered execution preserve dependencies and original records across repeat submission',async()=>{
 const f=fixture(),plan=await f.prepare(true),before=f.db.dump(),q=f.queue();
 await q.enqueue({type:'customers',id:'unreviewed',baseRevision:0,operationId:'unreviewed-op',record:{id:'unreviewed'}});
 const staged=await f.stage(q,plan);assert.equal(staged.status,'staged');await q.drain({limit:10,operationIds:staged.operationIds});
 assert.deepEqual(f.written,['customers','jobs','invoices','payments']);assert.ok(!f.remote.has('customers:unreviewed'));
 for(const store of STORES.filter(s=>s!=='commandLog'))assert.deepEqual(f.db.dump()[store],before[store]);
 assert.equal(f.remote.get('customers:c1').record.businessId,'business_001');assert.ok(f.db.dump().commandLog.some(r=>r.kind==='sync.review'&&r.backupChecksum===plan.snapshot.integrity.sha256));
 const again=await f.prepare(true);assert.ok(again.review.records.every(r=>r.status==='already_present'));
 const replay=await f.stage(q,again);await q.drain({limit:10,operationIds:replay.operationIds});assert.equal(f.written.length,4);
});
test('missing backup, cancelled approval, changed principal and concurrent local edits prevent staging',async()=>{
 const f=fixture(),plan=await f.prepare(true),q=f.queue();
 await assert.rejects(f.stage(q,plan,{backupConfirmed:false}),/backup/);assert.equal((await f.stage(q,plan,{approve:()=>false})).status,'cancelled');assert.equal((await q.list()).length,0);
 await assert.rejects(f.stage(q,plan,{approve:()=>{f.changeIdentity();return true}}),/session changed/);assert.equal((await q.list()).length,0);
 const g=fixture(),review=await g.prepare(true);await put(g.db,'customers',{id:'c1',name:'Edited while reviewing',businessId:'local-business'});
 await assert.rejects(g.stage(g.queue(),review),/changed during review/);assert.equal(g.db.dump().customers[0].name,'Edited while reviewing');assert.equal(g.written.length,0);
});
test('staging transaction failure rolls back queue records and review receipt together',async()=>{
 const f=fixture(),plan=await f.prepare(true);f.db.failPutOnce=true;await assert.rejects(f.stage(f.queue(),plan));assert.equal(f.db.dump().commandLog.length,0);assert.equal(f.written.length,0);
});
test('parallel drains cannot send dependent children while the parent is in flight',async()=>{
 const f=fixture(),plan=await f.prepare(true),q=f.queue(),staged=await f.stage(q,plan);
 const both=await Promise.all([q.drain({limit:1,operationIds:staged.operationIds}),f.queue().drain({limit:1,operationIds:staged.operationIds})]);
 assert.ok(both.reduce((n,x)=>n+x.processed,0)<=2);await q.drain({limit:10,operationIds:staged.operationIds});assert.deepEqual(f.written,['customers','jobs','invoices','payments']);
});
test('oversized records and cyclic links block transfer without truncation or writes',async()=>{
 const f=fixture();await put(f.db,'customers',{id:'c1',name:'Photo',photoData:'x'.repeat(31000)});const oversized=await f.prepare(true);assert.equal(oversized.review.readyForReview,false);assert.equal(oversized.review.oversizedRecords.length,1);assert.equal(f.db.dump().customers[0].photoData.length,31000);
 const g=fixture();await put(g.db,'quotes',{id:'q1',customerId:'c1',jobId:'j1'});await put(g.db,'jobs',{id:'j1',customerId:'c1',quoteId:'q1'});const cyclic=await g.prepare(true);assert.equal(cyclic.review.readyForReview,false);assert.match(cyclic.review.dependencyError,/cycle/);assert.equal(g.written.length,0);
});
test('already-current later revisions are reconciled without another write',async()=>{
 const f=fixture();const target={...f.db.dump().customers[0],businessId:'business_001'};f.remote.set('customers:c1',{businessId:'business_001',type:'customers',id:'c1',revision:3,record:target});
 const plan=await f.prepare(true),q=f.queue(),staged=await f.stage(q,plan);await q.drain({limit:10,operationIds:staged.operationIds});assert.ok(!f.written.includes('customers'));assert.equal((await q.list()).find(r=>r.change.type==='customers').result,'already_current');
});
test('unprovisioned sessions cannot prepare a transfer',async()=>{
 await assert.rejects(prepareTransfer({db:{},stores:STORES,businessId:'business_001',session:{status:'unprovisioned',businesses:[]},transport:{}}),/provisioned business owner/);
});
test('multiple owned destinations require selection and viewer sessions never expose transfer controls',async()=>{
 const {createMigrationController}=await import('../public/migration-ui.js');
 const root={innerHTML:'',isConnected:true},host={document:{addEventListener(){}},session:async()=>({status:'signed_in',identity:{issuer:'https://verified.example',subject:'owner_001'},businesses:[{business_id:'business_001',business_name:'First',role:'owner'},{business_id:'business_002',business_name:'Second',role:'owner'}]})};
 await createMigrationController(host).open(root);assert.match(root.innerHTML,/Choose destination business/);assert.match(root.innerHTML,/data-transfer-action="prepare" disabled/);
 host.session=async()=>({status:'signed_in',businesses:[{business_id:'business_001',business_name:'Viewer business',role:'viewer'}]});await createMigrationController(host).open(root);assert.doesNotMatch(root.innerHTML,/data-transfer-action="prepare"/);
});

test('existing Settings controller shows read-only cloud comparison without device writes',async()=>{
 const {createMigrationController}=await import('../public/migration-ui.js');
 const db=createDB({customers:[{id:'c1',name:'Device customer',businessId:'business_001'}]});
 const before=db.dump(),root={innerHTML:'',isConnected:true},calls=[];
 const session=async()=>({status:'signed_in',identity:{issuer:'https://verified.example',subject:'owner_001'},
  businesses:[{business_id:'business_001',business_name:'Target business',role:'owner'}],
  capabilities:{recordTypes:['customers','jobs']}});
 const transport=()=>({async list(type,after){
  calls.push([type,after]);return {status:200,items:type==='customers'?
   [{id:'c1',revision:2,record:{id:'c1',name:'Changed cloud customer',businessId:'business_001'}},
    {id:'c2',revision:1,record:{id:'c2',name:'New cloud customer',businessId:'business_001'}}]:[],nextCursor:null};
 }});
 const controller=createMigrationController({document:{addEventListener(){}},session,transport,db:()=>db,stores:STORES});
 await controller.open(root);
 assert.match(root.innerHTML,/cloud-review/);
 await controller.reviewCloud();
 assert.match(root.innerHTML,/1 missing on this device/);
 assert.match(root.innerHTML,/1 conflicts/);
 assert.match(root.innerHTML,/No local data was changed/);
 assert.deepEqual(calls,[['customers',''],['jobs','']]);
 assert.deepEqual(db.dump(),before);
});
test('viewer never sees cloud comparison action in existing Settings',async()=>{
 const {createMigrationController}=await import('../public/migration-ui.js');
 const root={innerHTML:'',isConnected:true};
 const ctrl=createMigrationController({document:{addEventListener(){}},
  session:async()=>({status:'signed_in',businesses:[{business_id:'business_001',role:'viewer'}]})});
 await ctrl.open(root);
 assert.doesNotMatch(root.innerHTML,/data-transfer-action="cloud-review"/);
});

test('Settings transfer canonical comparison tolerates optional undefined local record fields',async()=>{
 const f=fixture(),plan=await f.prepare(true),q=f.queue();
 plan.expectedStores.customers[0].optional=undefined;
 const staged=await f.stage(q,plan);
 assert.equal(staged.status,'staged');
 assert.equal((await q.list()).length,4);
});

test('Settings comparison refuses expired owner session after remote scan without mutating data',async()=>{
 const {createMigrationController}=await import('../public/migration-ui.js');
 const db=createDB({customers:[{id:'c1',name:'On device',businessId:'business_001'}]}),before=db.dump(),root={innerHTML:'',isConnected:true};
 let signed=true;
 const session=async()=>signed?{status:'signed_in',identity:{issuer:'https://verified.example',subject:'owner_001'},businesses:[{business_id:'business_001',role:'owner'}],capabilities:{recordTypes:['customers']}}:{status:'signed_out',businesses:[]};
 const ctrl=createMigrationController({document:{addEventListener(){}},session,db:()=>db,stores:STORES,transport:()=>({async list(){signed=false;return {status:200,items:[],nextCursor:null}}})});
 await ctrl.open(root);await ctrl.reviewCloud();
 assert.match(root.innerHTML,/Owner session changed/);
 assert.doesNotMatch(root.innerHTML,/Read-only cloud comparison complete/);
 assert.deepEqual(db.dump(),before);
});

test('transfer stages only the immutable reviewed snapshot despite mutation inside approval',async()=>{
 const f=fixture(),plan=await f.prepare(true),original=structuredClone(plan.changes),q=f.queue();
 await f.stage(q,plan,{approve:()=>{plan.changes[0].record.name='Unreviewed mutation';plan.changes.reverse();plan.expectedStores.customers[0].name='Changed expectation';return true}});
 const rows=await q.list();for(const c of original)assert.deepEqual(rows.find(r=>r.change.operationId===c.operationId).change,c);
 assert.notEqual(f.db.dump().customers[0].name,'Unreviewed mutation');assert.equal(f.written.length,0);
});
