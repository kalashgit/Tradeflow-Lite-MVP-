'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
let summarizeSyncIntents;
require('node:test').before(async()=>({summarizeSyncIntents}=await import('../public/sync-queue.js')));
const businessId='business_001',entry=(id,status,extra={})=>({
 id:'sync:'+businessId+':'+id,kind:'sync.change',businessId,
 status,change:{type:'customers',id:'customer_'+id,operationId:id},...extra
});
test('local sync intentions are not external success, including sending and unresolved retries',()=>{
 const rows=[entry('queued','pending'),entry('flight','sending'),entry('conflict','conflict'),
  entry('failed','failed'),entry('unknown','unexpected'),entry('unproven','applied',{result:'unverified'})];
 const summary=summarizeSyncIntents(rows,businessId);
 assert.equal(summary.allRemotelyVerified,false);assert.equal(summary.pendingOrUnverified,6);
 assert.deepEqual(summary.items.map(r=>r.state),['queued_local','syncing_unverified','conflict_needs_review',
  'failed_needs_review','indeterminate','indeterminate']);
 assert.ok(summary.items.every(r=>!r.externalCommitted));
 assert.equal(summary.counts.indeterminate,2);
 assert.equal(summary.items.find(r=>r.operationId==='conflict').requiresOwnerReview,true);
});
test('only read-back verified writes and already-current states count as remotely committed',()=>{
 const summary=summarizeSyncIntents([entry('first','applied',{result:'verified_write',remoteRevision:1}),
  entry('second','applied',{result:'already_current',remoteRevision:4})],businessId);
 assert.equal(summary.allRemotelyVerified,true);assert.equal(summary.pendingOrUnverified,0);
 assert.equal(summary.counts.committed_verified,2);assert.ok(summary.items.every(r=>r.externalCommitted));
 assert.deepEqual(summary.items.map(r=>r.remoteRevision),[1,4]);
});
test('projection filters other businesses, command receipts, and never mutates input',()=>{
 const source=[entry('first','pending'),{...entry('second','applied',{result:'verified_write'}),businessId:'business_999'},
  {...entry('third','applied',{result:'verified_write'}),kind:'pilot.command'}];
 const before=JSON.stringify(source),s=summarizeSyncIntents(source,businessId);
 assert.equal(s.items.length,1);assert.equal(s.items[0].state,'queued_local');
 assert.equal(JSON.stringify(source),before);assert.equal(Object.isFrozen(s.counts),true);
 assert.throws(()=>summarizeSyncIntents(null,businessId));
});
test('empty snapshot reports no verified sync instead of suggesting everything committed',()=>{
 const s=summarizeSyncIntents([],businessId);
 assert.equal(s.allRemotelyVerified,false);assert.equal(s.pendingOrUnverified,0);
});
