'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const record={businessId:'business_001',type:'jobs',id:'job_01',revision:2,record:{amount:99,name:'Example'}};
test('snapshot round trip and integrity checks',async()=>{
 const {createSnapshot,validateSnapshot}=await import('../src/backup-snapshot.js');
 const snap=await createSnapshot('business_001',[record],'2026-10-29T00:00:00.000Z');
 assert.equal((await validateSnapshot(snap,'business_001')).recordCount,1);
 await assert.rejects(validateSnapshot(snap,'business_002'),/identity mismatch/);
 const altered=structuredClone(snap);altered.records[0].record.amount=100;
 await assert.rejects(validateSnapshot(altered,'business_001'),/checksum mismatch/);
});
test('reject mixed businesses, duplicate IDs and oversized backup',async()=>{
 const {createSnapshot}=await import('../src/backup-snapshot.js');
 await assert.rejects(createSnapshot('business_001',[{...record,businessId:'business_002'}]),/Invalid tenant record/);
 await assert.rejects(createSnapshot('business_001',[record,record]),/Duplicate record/);
 await assert.rejects(createSnapshot('business_001',[{...record,record:{text:'x'.repeat(10000001)}}]),/too large/);
});
