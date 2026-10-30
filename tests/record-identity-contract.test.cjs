'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
let recordIdentity,validRecordRevision,classifyOfflineChange,planOfflineReplay;
require('node:test').before(async()=>{
 ({recordIdentity,validRecordRevision}=await import('../public/record-model.js'));
 ({classifyOfflineChange,planOfflineReplay}=await import('../public/offline-conflicts.js'));
});
const base={businessId:'business_001',type:'customers',id:'c1',baseRevision:0,
 record:{id:'c1',name:'Synthetic customer'}};
test('record identity preserves legacy local records and binds a canonical business-scoped key',()=>{
 const id=recordIdentity(base);
 assert.deepEqual({...id},{businessId:'business_001',type:'customers',id:'c1',key:'business_001:customers:c1'});
 assert.equal(Object.isFrozen(id),true);
 assert.equal(validRecordRevision(0),true);assert.equal(validRecordRevision(2),true);
});
test('identity contract fails closed on changed company, record ID, type or unsafe revision',()=>{
 for(const invalid of [
  {...base,record:{...base.record,id:'other'}},
  {...base,record:{...base.record,businessId:'business_999'}},
  {...base,type:'commandLog'},
  {...base,businessId:'bad/scope'},
  {...base,id:'../escape'},
  {...base,record:[]}
 ])assert.throws(()=>recordIdentity(invalid),/identity/);
 for(const revision of [-1,1.25,NaN,Infinity])assert.equal(validRecordRevision(revision),false);
});
test('offline replay cannot label foreign or malformed local intentions as pending or ready',()=>{
 const invalid=[{...base,record:{...base.record,id:'other'}},
  {...base,record:{...base.record,businessId:'business_999'}},
  {...base,type:'commandLog'},{...base,baseRevision:-1}];
 for(const entry of invalid){
  assert.equal(classifyOfflineChange(entry,null).status,'invalid');
  assert.equal(planOfflineReplay([entry],{})[0].status,'invalid');
 }
 assert.equal(planOfflineReplay([base],{})[0].status,'pending','Valid unsynced intent remains pending');
 assert.equal(classifyOfflineChange(base,null).status,'ready','Valid new record may be proposed for server verification');
});
