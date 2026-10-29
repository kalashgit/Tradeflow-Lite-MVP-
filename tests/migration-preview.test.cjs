const test=require('node:test'),assert=require('node:assert/strict');
const local=require('../public/local-recovery.js'),{createDB,STORES}=require('./helpers/local-db.cjs');
test('migration preview requires a verified target owner and checksum, never moves records',async()=>{
 const {previewLocalMigration:preview}=await import('../public/migration-preview.js');
 const db=createDB({customers:[{id:'c1',name:'Local'}]}),before=db.dump(),snapshot=await local.createBackup(db,STORES),session={status:'signed_in',businesses:[{business_id:'business_001',role:'owner'}]};
 await assert.rejects(preview({snapshot,stores:STORES,businessId:'business_001',session:{status:'signed_out'}}),/owner/);
 const pending=await preview({snapshot,stores:STORES,businessId:'business_001',session});assert.equal(pending.readyForReview,false);assert.equal(pending.records[0].status,'pending');
 const ready=await preview({snapshot,stores:STORES,businessId:'business_001',session,remoteByKey:{'business_001:customers:c1':null}});assert.equal(ready.readyForReview,true);assert.equal(ready.approvalRequired,true);assert.equal(ready.readOnly,true);assert.deepEqual(db.dump(),before);
});
test('unmapped related records and conflicting remote records block migration readiness',async()=>{
 const {previewLocalMigration:preview}=await import('../public/migration-preview.js'),db=createDB({customers:[{id:'c1',businessId:'another_business'}],payments:[{id:'p1',customerId:'missing'}]}),snapshot=await local.createBackup(db,STORES);
 const result=await preview({snapshot,stores:STORES,businessId:'business_001',session:{status:'signed_in',businesses:[{business_id:'business_001',role:'owner'}]},remoteByKey:{'business_001:customers:c1':{businessId:'business_001',type:'customers',id:'c1',revision:2}}});
 assert.equal(result.readyForReview,false);assert.equal(result.unsupported[0].store,'payments');assert.ok(result.missingReferences.length);assert.ok(result.requiresBusinessRelabel.length);assert.equal(result.records[0].status,'conflict');
});
