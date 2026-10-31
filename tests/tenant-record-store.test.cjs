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
   assert.deepEqual(args.slice(11,14),['business_001',auth.issuer,auth.subject]);
   assert.deepEqual(args.slice(14,17),[JSON.stringify(JSON.parse(args[4])),'business_001','job_01']);
   assert.equal(args.at(-1),args[3]-1);
   assert.match(sql,/business_memberships/);
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
test('record identity and viewer permissions cannot be supplied as business data',async()=>{
 await assert.rejects(save(mockDb(null),{...auth,role:'viewer'},'jobs','job_01',{revision:0,record:{}}),{status:403});
 for(const record of [{id:'other'},{businessId:'business_999'}])await assert.rejects(save(mockDb(null),auth,'jobs','job_01',{revision:0,record}),{status:400});
});
test('linked records must exist in the same business and share one customer; revisions guard commit',async()=>{
 const links={customers:{payload:'{"id":"c1"}',revision:1},quotes:{payload:'{"customerId":"c2"}',revision:2}};
 let sqlUsed='';const db={prepare(sql){return {bind(...params){return {first:async()=>{
  if(sql.startsWith('SELECT payload')){assert.equal(params[0],auth.businessId);return links[params[1]]||null}
  sqlUsed=sql;return {revision:1,updated_at:'now'};
 }}}}}};
 await assert.rejects(save(db,auth,'jobs','job_01',{revision:0,record:{customerId:'c1',quoteId:'q1'}}),{status:400});
 links.quotes={payload:'{"customerId":"c1"}',revision:2};
 await save(db,auth,'jobs','job_01',{revision:0,record:{customerId:'c1',quoteId:'q1'}});
 assert.match(sqlUsed,/AND revision=\? AND deleted_at IS NULL/);assert.match(sqlUsed,/business_memberships/);
 delete links.quotes;await assert.rejects(save(db,auth,'jobs','job_01',{revision:0,record:{quoteId:'q1'}}),{status:400});
});

test('server rejects a queued request intended for a different authenticated actor before reading or writing',async()=>{
 const db={prepare(){throw Error('Actor mismatch must fail before database access')}};
 for(const expectedActor of [null,{issuer:auth.issuer,subject:'other_actor'},{issuer:'other_issuer',subject:auth.subject}]){
  await assert.rejects(save(db,auth,'jobs','job_01',{revision:0,record:{name:'Stale actor request'},expectedActor}),{status:403});
 }
 const result=await save(mockDb({revision:1,updated_at:'now'}),auth,'jobs','job_01',{revision:0,record:{name:'Correct actor'},expectedActor:{issuer:auth.issuer,subject:auth.subject}});assert.equal(result.revision,1);
});

test('crew writes reject ordinary members below the API and keep commit-time role guard for stale owners',async()=>{
 let used='';const db={prepare(sql){used=sql;return {bind(){return {first:async()=>({revision:1,updated_at:'now'})}}}}};
 await assert.rejects(save(db,{...auth,role:'member'},'crew','crew_001',{revision:0,record:{name:'Self-appointed owner',role:'owner'}}),{status:403});assert.equal(used,'');
 await save(db,auth,'crew','crew_001',{revision:0,record:{name:'Electrician',role:'Foreman'}});assert.match(used,/role IN \('owner','admin'\)/);
});
