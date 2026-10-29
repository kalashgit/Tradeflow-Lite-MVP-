'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const auth={businessId:'business_001',role:'owner',subject:'person_001',issuer:'issuer_001'};
const row={business_id:'business_001',record_type:'jobs',id:'job_01',revision:2,payload:'{"name":"A"}'};
function db(rows){
 return {prepare(sql){
  assert.match(sql,/WHERE business_id = \? AND deleted_at IS NULL/);
  assert.match(sql,/LIMIT 10001/);
  return {bind(id){assert.equal(id,auth.businessId);return {all:async()=>({results:rows})}}};
 }};
}
test('owner export produces verifiable scoped snapshot',async()=>{
 const {exportTenantSnapshot}=await import('../src/tenant-export.js');
 const {validateSnapshot}=await import('../src/backup-snapshot.js');
 const snap=await exportTenantSnapshot(db([row]),auth,'2026-10-29T00:00:00.000Z');
 const checked=await validateSnapshot(snap,auth.businessId);
 assert.equal(checked.recordCount,1);assert.equal(checked.records[0].record.name,'A');
});
test('nonowners and mismatched tenant rows fail closed',async()=>{
 const {exportTenantSnapshot}=await import('../src/tenant-export.js');
 await assert.rejects(exportTenantSnapshot(db([row]),{...auth,role:'admin'}),{status:403});
 await assert.rejects(exportTenantSnapshot(db([{...row,business_id:'business_002'}]),auth),{status:503});
});
test('invalid payload, truncated database, excess records rejected',async()=>{
 const {exportTenantSnapshot}=await import('../src/tenant-export.js');
 await assert.rejects(exportTenantSnapshot(db([{...row,payload:'not-json'}]),auth),{status:503});
 await assert.rejects(exportTenantSnapshot(db(Array.from({length:10001},()=>row)),auth),{status:413});
 await assert.rejects(exportTenantSnapshot({prepare:()=>({bind:()=>({all:async()=>({})})})},auth),{status:503});
});
