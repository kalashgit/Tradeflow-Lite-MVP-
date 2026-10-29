const test=require('node:test'),assert=require('node:assert/strict');
const recovery=require('../public/local-recovery.js');
const {createDB,put,STORES}=require('./helpers/local-db.cjs');
const seeded=()=>createDB({customers:[{id:'c1',name:'Existing',custom:'preserve'}],jobs:[{id:'j1',customerId:'c1',quoteId:'q1'}],quotes:[{id:'q1',customerId:'c1'}],payments:[{id:'p1',customerId:'c1',jobId:'j1',amount:500}],settings:[{id:'business',company:'Owner'}]});
test('local backup is a coherent checksum-protected schema-9 snapshot and keeps custom fields/links',async()=>{
 const db=seeded(),backup=await recovery.createBackup(db,STORES),checked=await recovery.validateBackup(backup,STORES);
 assert.equal(backup.version,9);assert.equal(db.version,9);assert.equal(checked.checksumVerified,true);
 assert.equal(checked.stores.customers[0].custom,'preserve');assert.equal(checked.stores.payments[0].jobId,'j1');
 backup.stores.payments[0].amount=700;await assert.rejects(recovery.validateBackup(backup,STORES),/checksum/);
});
test('invalid or duplicate IDs, missing required stores and unknown stores cannot silently destroy data',async()=>{
 const db=seeded(),before=db.dump(),backup=await recovery.createBackup(db,STORES);delete backup.integrity;
 for(const mutate of [b=>b.stores.customers.push({...b.stores.customers[0]}),b=>delete b.stores.customers,b=>b.stores.extra=[],b=>b.stores.jobs[0].id='']){
  const bad=structuredClone(backup);mutate(bad);
  await assert.rejects(recovery.restoreBackup({db,stores:STORES,snapshot:bad,approve:()=>{throw Error('Should not ask')},saveRecovery:()=>{throw Error('Should not write')}}));
  assert.deepEqual(db.dump(),before);
 }
 const emptyLegacy={format:'tradeflow-lite',version:1,stores:{}};await assert.rejects(recovery.validateBackup(emptyLegacy,STORES),/Missing/);
});
test('review includes creates/deletions/relationships and cancellation leaves all stores untouched',async()=>{
 const db=seeded(),backup=await recovery.createBackup(db,STORES);delete backup.integrity;
 backup.stores.customers=[{id:'c2',name:'New'}];let plan;
 const before=db.dump(),result=await recovery.restoreBackup({db,stores:STORES,snapshot:backup,approve:p=>{plan=p;return false},saveRecovery:()=>{throw Error('Cancelled')}});
 assert.equal(result.status,'cancelled');assert.equal(plan.creates,1);assert.equal(plan.deletes,1);assert.ok(plan.missingReferences.length>=1);assert.equal(plan.checksumVerified,false);assert.deepEqual(db.dump(),before);
});
test('safety backup must persist before replacement and permits verified rollback',async()=>{
 const db=seeded(),incoming=await recovery.createBackup(db,STORES);delete incoming.integrity;incoming.stores.customers[0].name='Restored';
 const before=db.dump();let rollback;
 await assert.rejects(recovery.restoreBackup({db,stores:STORES,snapshot:incoming,approve:()=>true,saveRecovery:async()=>{throw Error('Quota exceeded')}}),/Quota/);assert.deepEqual(db.dump(),before);
 assert.equal((await recovery.restoreBackup({db,stores:STORES,snapshot:incoming,approve:()=>true,saveRecovery:async b=>{rollback=b;assert.deepEqual(db.dump(),before)}})).status,'restored');
 assert.equal(db.dump().customers[0].name,'Restored');
 await recovery.restoreBackup({db,stores:STORES,snapshot:rollback,approve:()=>true,saveRecovery:async()=>{}});
 assert.deepEqual(db.dump(),before);assert.equal(db.version,9);
});
test('a concurrent device-tab edit between review and apply aborts without overwriting either edit',async()=>{
 const db=seeded(),backup=await recovery.createBackup(db,STORES);
 await assert.rejects(recovery.restoreBackup({db,stores:STORES,snapshot:backup,approve:()=>true,saveRecovery:async()=>put(db,'customers',{id:'c1',name:'New concurrent edit'})}),/changed during review/);
 assert.equal(db.dump().customers[0].name,'New concurrent edit');assert.equal(db.dump().payments[0].amount,500);
});
test('interrupted replacement transaction rolls back every clear and write',async()=>{
 const db=seeded(),backup=await recovery.createBackup(db,STORES),before=db.dump();
 db.failPutOnce=true;
 await assert.rejects(recovery.restoreBackup({db,stores:STORES,snapshot:backup,approve:()=>true,saveRecovery:async()=>{}}),/storage failure/);
 assert.deepEqual(db.dump(),before);
});
test('legacy backups retain explicitly present stores and initialize only historically absent stores',async()=>{
 const backup=await recovery.createBackup(seeded(),STORES);delete backup.integrity;
 for(let version=1;version<=8;version++){
  const legacy=structuredClone(backup);legacy.version=version;
  if(version<9)for(const s of ['calendars','calendarEntries','calendarProposals','calendarPreferences','calendarAudit'])delete legacy.stores[s];
  const checked=await recovery.validateBackup(legacy,STORES);
  assert.equal(checked.checksumVerified,false);assert.equal(checked.stores.customers[0].custom,'preserve');assert.deepEqual(checked.stores.calendarEntries,[]);
 }
});
