'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let save,validate;
test('load record write helpers',async()=>{
 ({writeTenantRecord:save,validateRecordWrite:validate}=await import('../src/tenant-record-store.js'));
 assert.equal(validate({revision:0,record:{title:'a'}}).expectedRevision,0);
});
const auth={businessId:'business_001',issuer:'https://id.example',subject:'person_001',role:'owner'};
function mockDb(output){
 return {prepare(sql){
  assert.match(sql,/ON CONFLICT\(business_id,record_type,id\)/);
  assert.match(sql,/tenant_records\.revision=\?/);
  assert.match(sql,/updated_by_subject/);
  return {bind(...args){
   assert.deepEqual(args.slice(0,3),['business_001','jobs','job_01']);
   assert.deepEqual(args.slice(-4),['business_001','jobs','job_01',args[3]-1]);
   return {first:async()=>output};
  }};
 }};
}
test('new record commits expected revision 0 with business and attribution',async()=>{
 const result=await save(mockDb({revision:1,updated_at:'now'}),auth,'jobs','job_01',{revision:0,record:{name:'First'}});
 assert.equal(result.revision,1);
});
test('existing record updates using expected revision',async()=>{
 const result=await save(mockDb({revision:5,updated_at:'now'}),auth,'jobs','job_01',{revision:4,record:{name:'Update'}});
 assert.equal(result.revision,5);
});
test('stale updates fail closed with 409',async()=>{
 await assert.rejects(save(mockDb(null),auth,'jobs','job_01',{revision:2,record:{name:'Stale'}}),{status:409});
});
test('invalid record types, revisions and shapes are rejected',async()=>{
 const db=mockDb(null);
 for(const body of [{revision:-1,record:{}},{revision:1,record:null},{revision:1,record:[]},{revision:1.5,record:{} }]){
  await assert.rejects(save(db,auth,'jobs','job_01',body),{status:400});
 }
 await assert.rejects(save(db,auth,'users','job_01',{revision:0,record:{}}),{status:400});
});
test('rejects large payloads',async()=>{
 await assert.rejects(save(mockDb(null),auth,'jobs','job_01',{revision:0,record:{text:'x'.repeat(31000)}}),{status:413});
});
