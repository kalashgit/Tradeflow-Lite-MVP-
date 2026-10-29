'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const example={businessId:'business_001',type:'jobs',id:'job_1',baseRevision:4,record:{name:'Draft'}};
test('replay conflict and deleted record',async()=>{
 const {classifyOfflineChange}=await import('../src/offline-conflicts.js');
 assert.equal(classifyOfflineChange(example,{...example,revision:4}).status,'ready');
 assert.equal(classifyOfflineChange(example,{...example,revision:5}).status,'conflict');
 assert.equal(classifyOfflineChange(example,{...example,revision:4,deletedAt:'today'}).status,'conflict');
 assert.equal(classifyOfflineChange(example,null).status,'pending');
});
test('unknown remote and duplicate local revisions stay unsent',async()=>{
 const {planOfflineReplay}=await import('../src/offline-conflicts.js');
 assert.equal(planOfflineReplay([example],{})[0].status,'pending');
 const key='business_001:jobs:job_1';
 assert.deepEqual(planOfflineReplay([example,example],{[key]:{...example,revision:4}}).map(x=>x.status),['ready','conflict']);
});
test('tenant mismatch fails validation',async()=>{
 const {classifyOfflineChange}=await import('../src/offline-conflicts.js');
 assert.equal(classifyOfflineChange(example,{...example,businessId:'another_001',revision:4}).status,'invalid');
});
