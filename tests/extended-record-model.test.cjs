const test=require('node:test'),assert=require('node:assert/strict');
const {createDB,STORES}=require('./helpers/local-db.cjs'),local=require('../public/local-recovery.js');
let model,security,backup,preview,queue;
require('node:test').before(async()=>{model=await import('../public/record-model.js');security=await import('../src/tenant-security.js');backup=await import('../src/backup-snapshot.js');preview=await import('../public/migration-preview.js');queue=await import('../public/sync-queue.js')});
test('shared catalogue maps all business stores while leaving local journals/preferences local',()=>{
 assert.equal(model.RECORD_TYPES.length,20);assert.deepEqual([...model.RECORD_TYPES,...model.LOCAL_ONLY_STORES].sort(),STORES.slice().sort());
 assert.equal(model.serverRecordTypes({}).length,4);assert.equal(model.serverRecordTypes({TF_EXTENDED_RECORDS_ENABLED:'true'}).length,20);
 for(const type of model.RECORD_TYPES)assert.equal(security.tenantRecordQuery({authorization:{businessId:'business_001'},table:type,recordId:'r1'}).params[1],type);
 assert.throws(()=>security.tenantRecordQuery({authorization:{businessId:'business_001'},table:'business_memberships',recordId:'r1'}));
});
test('tenant snapshots preserve every supported business record type and reject local credential/journal stores',async()=>{
 const records=model.RECORD_TYPES.map(type=>({businessId:'business_001',type,id:'r1',revision:1,record:{custom:'preserved'}}));
 const snapshot=await backup.createSnapshot('business_001',records);assert.equal((await backup.validateSnapshot(snapshot,'business_001')).recordCount,20);
 await assert.rejects(backup.createSnapshot('business_001',[{...records[0],type:'settings'}]));
});
test('migration preview follows actual server capability and checks extended supplier/calendar relationships',async()=>{
 const db=createDB({customers:[{id:'c1'}],jobs:[{id:'j1',customerId:'c1'}],invoices:[{id:'i1',customerId:'c1',jobId:'j1'}],payments:[{id:'p1',customerId:'c1',invoiceId:'i1',amount:25}],suppliers:[{id:'s1'}],supplyOrders:[{id:'so1',supplierId:'s1'}],calendars:[{id:'cal1'}],calendarEntries:[{id:'entry1',calendarId:'cal1',customerId:'c1'}]});
 const snapshot=await local.createBackup(db,STORES),session={status:'signed_in',businesses:[{business_id:'business_001',role:'owner'}]};
 const gated=await preview.previewLocalMigration({snapshot,stores:STORES,businessId:'business_001',session});assert.ok(gated.unsupported.some(r=>r.store==='payments'));assert.equal(gated.readyForReview,false);
 session.capabilities={recordTypes:model.RECORD_TYPES};const remote={};for(const type of model.RECORD_TYPES)for(const r of snapshot.stores[type])remote['business_001:'+type+':'+r.id]=null;
 const ready=await preview.previewLocalMigration({snapshot,stores:STORES,businessId:'business_001',session,remoteByKey:remote});assert.equal(ready.readyForReview,true);assert.equal(ready.unsupported.length,0);
 const bad=structuredClone(snapshot);delete bad.integrity;bad.stores.calendarEntries[0].calendarId='missing';const blocked=await preview.previewLocalMigration({snapshot:bad,stores:STORES,businessId:'business_001',session,remoteByKey:remote});assert.equal(blocked.readyForReview,false);assert.ok(blocked.missingReferences.some(r=>r.target==='calendars'));
});
test('extended queue records stay pending until server schema is ready; members cannot write financial records',async()=>{
 for(const [role,capabilities,wanted]of [['owner',undefined,'server_schema_required'],['member',{recordTypes:model.RECORD_TYPES},'authorization_required']]){
  const db=createDB();let calls=0;
  const q=queue.createSyncQueue({db,businessId:'business_001',session:async()=>({status:'signed_in',businesses:[{business_id:'business_001',role}],capabilities}),transport:{read:async()=>{calls++;throw Error('Must not execute')},write:async()=>{calls++;throw Error('Must not execute')}}});
  await q.enqueue({type:'payments',id:'p1',baseRevision:0,operationId:'test-payment',record:{id:'p1',amount:25}});
  assert.equal((await q.drain()).status,wanted);assert.equal(calls,0);assert.equal((await q.list())[0].status,'pending');
 }
});
