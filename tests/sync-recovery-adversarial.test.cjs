const {test,before}=require('node:test'),assert=require('node:assert/strict');
const {createDB}=require('./helpers/local-db.cjs');
let createSyncQueue,summarizeSyncIntents;before(async()=>({createSyncQueue,summarizeSyncIntents}=await import('../public/sync-queue.js')));
const businessId='business_001',change={type:'customers',id:'c1',operationId:'recovery_1',baseRevision:0,record:{id:'c1',name:'Reviewed'}};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function fixture(){let time=1000,subject='owner_001',role='owner',status='signed_in',remote=null,writes=0;
 const db=createDB(),session=async()=>({status,identity:{issuer:'verified.example',subject},businesses:[{business_id:businessId,role}],capabilities:{recordTypes:['customers','jobCosts']}});
 const transport={read:async()=>remote?{status:200,record:structuredClone(remote)}:{status:404},write:async(type,id,body)=>{writes++;if((remote?.revision||0)!==body.revision)return {status:409};remote={businessId,type,id,record:structuredClone(body.record),revision:body.revision+1};return {status:201}}};
 const make=()=>createSyncQueue({db,businessId,session,transport,now:()=>time});
 return {db,session,transport,make,advance:()=>time+=31000,actor:s=>subject=s,role:r=>role=r,deny:()=>status='signed_out',writes:()=>writes,remote:()=>remote};
}
test('actor change during remote read cannot execute or inherit the queued intent after reload',async()=>{
 const f=fixture(),q=f.make();await q.enqueue(change);const read=f.transport.read;f.transport.read=async(...args)=>{f.actor('other_owner');return read(...args)};
 assert.equal((await q.drain()).status,'authorization_required');assert.equal(f.writes(),0);
 f.transport.read=read;assert.equal((await f.make().drain()).status,'authorization_required');assert.equal(f.writes(),0);
 f.actor('owner_001');await f.make().drain();assert.equal(f.writes(),1);assert.equal((await q.list())[0].verifiedBy.subject,'owner_001');
});
test('financial downgrade during cloud read prevents write even if generic member access remains',async()=>{
 const f=fixture(),q=f.make();await q.enqueue({...change,type:'jobCosts'});f.transport.read=async()=>{f.role('member');return {status:404}};
 assert.equal((await q.drain()).status,'authorization_required');assert.equal(f.writes(),0);
});
test('expired lease and takeover fence a stalled worker before network execution',async()=>{
 const f=fixture(),q=f.make(),entered=deferred(),release=deferred(),read=f.transport.read;let first=true;
 await q.enqueue(change);f.transport.read=async(...args)=>{if(first){first=false;entered.resolve();await release.promise;return {status:404}}return read(...args)};
 const stalled=q.drain();await entered.promise;f.advance();await f.make().drain();assert.equal(f.writes(),1);release.resolve();assert.equal((await stalled).status,'lease_lost');
 const row=(await q.list())[0];assert.equal(row.status,'applied');assert.equal(row.remoteRevision,1);assert.equal(f.writes(),1);
});
test('crash after claim remains uncommitted until an expired lease is recovered',async()=>{
 const f=fixture(),q=f.make(),entered=deferred(),release=deferred();await q.enqueue(change);const original=f.transport.read;let first=true;
 f.transport.read=async(...args)=>{if(first){first=false;entered.resolve();await release.promise;throw Error('Crashed worker')}return original(...args)};
 const crashed=q.drain();await entered.promise;assert.equal((await f.make().drain()).processed,0);
 assert.equal(summarizeSyncIntents(await q.list(),businessId).items[0].externalCommitted,false);
 f.advance();await f.make().drain();release.resolve();await crashed;assert.equal(f.writes(),1);assert.equal((await q.list())[0].status,'applied');
});
test('lost acknowledgement persists uncertainty and reconciles once without another network write',async()=>{
 const f=fixture(),q=f.make();await q.enqueue(change);const write=f.transport.write;
 f.transport.write=async(...args)=>{await write(...args);throw Error('Lost acknowledgement')};await q.drain();
 let row=(await q.list())[0];assert.equal(row.writeUncertain,true);assert.equal(summarizeSyncIntents([row],businessId).items[0].state,'indeterminate');assert.equal(f.writes(),1);
 f.advance();await f.make().drain();row=(await q.list())[0];assert.equal(row.result,'already_current');assert.equal(row.writeUncertain,false);assert.equal(row.verification,'record_readback');assert.equal(f.writes(),1);
});
test('revocation after write cannot produce a verified local receipt from an old principal',async()=>{
 const f=fixture(),q=f.make();await q.enqueue(change);const write=f.transport.write;
 f.transport.write=async(...args)=>{const response=await write(...args);f.deny();return response};assert.equal((await q.drain()).status,'authorization_required');
 const row=(await q.list())[0];assert.notEqual(row.status,'applied');assert.equal(row.writeUncertain,true);assert.equal(f.writes(),1);
});
test('truthy interpreted text is not conflict approval',async()=>{
 const f=fixture(),q=f.make();await q.enqueue(change);await f.transport.write('customers','c1',{revision:0,record:{id:'c1',name:'Another device'}});await q.drain();const row=(await q.list())[0];
 assert.equal((await q.resolve(row.id,change.record,()=> 'approved by model')).status,'cancelled');assert.equal((await q.list())[0].status,'conflict');assert.equal(f.writes(),1);
});
test('network write carries the pinned actor for authoritative server comparison',async()=>{
 const f=fixture(),q=f.make();await q.enqueue(change);const write=f.transport.write;
 f.transport.write=async(type,id,body)=>{assert.deepEqual(body.expectedActor,{issuer:'verified.example',subject:'owner_001'});return write(type,id,body)};await q.drain();assert.equal(f.writes(),1);
});
test('member role cannot drain crew-roster work even with misleading display roles',async()=>{
 const f=fixture(),q=f.make();await q.enqueue({...change,type:'crew',record:{id:'c1',role:'owner'}});f.role('member');
 assert.equal((await q.drain()).status,'authorization_required');assert.equal(f.writes(),0);assert.notEqual((await q.list())[0].status,'applied');
});
