'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const {createDB}=require('./helpers/local-db.cjs');
let createSyncQueue,createLocalCrewReport,readPersistedCrewReportState;

before(async()=>{
 ({createSyncQueue}=await import('../public/sync-queue.js'));
 ({createLocalCrewReport}=await import('../src/role-exchange.js'));
 ({readPersistedCrewReportState}=await import('../public/crew-report-state.js'));
});

const principal={issuer:'trusted-test-issuer',subject:'crew_01'};
const businessId='business_123';
function setup(){
 const db=createDB();
 let networkCalls=0;
 const transport={
  read:async()=>{networkCalls++;throw Error('Read-only projection must not perform network reads')},
  write:async()=>{networkCalls++;throw Error('Read-only projection must not perform network writes')}
 };
 const session=async()=>({status:'signed_in',identity:principal,
  businesses:[{business_id:businessId,role:'member'}],capabilities:{recordTypes:['jobs']}});
 const make=()=>createSyncQueue({db,businessId,session,transport});
 const event=createLocalCrewReport({
  businessId,actorId:principal.subject,jobId:'job_01',baseRevision:3,
  note:'Two required materials are missing',eventId:'event_01',
  idempotencyKey:'op_01',at:'2026-11-03T08:00:00.000Z'
 });
 const change={type:'jobs',id:event.subject.id,
  operationId:event.idempotencyKey,baseRevision:event.subject.revision,
  record:{id:event.subject.id,businessId,fieldUpdates:[{
   schemaVersion:1,eventId:event.eventId,idempotencyKey:event.idempotencyKey,
   kind:event.kind,note:event.note,eventAt:event.eventAt,
   actorId:principal.subject,actorIssuer:principal.issuer
  }]}
 };
 return {db,make,event,change,networkCalls:()=>networkCalls};
}

test('read-only adapter observes a durable queue across queue instance recreation',async()=>{
 const f=setup();
 const before=await readPersistedCrewReportState({queue:f.make(),event:f.event,principal});
 assert.equal(before.deliveryState,'local_draft');
 await f.make().enqueue(f.change); // Synthetic local enqueue only. Never drain or route to server.
 const persisted=await readPersistedCrewReportState({queue:f.make(),event:f.event,principal});
 assert.equal(persisted.deliveryState,'queued_local');
 assert.equal(persisted.eventId,f.event.eventId);
 assert.equal(persisted.operationId,f.event.idempotencyKey);
 assert.equal(persisted.sourceRevision,3);
 assert.deepEqual(persisted.actor,principal);
 assert.equal(persisted.remoteRevision,null);
 assert.equal(persisted.acknowledged,false);
 assert.equal(persisted.executionAuthority,false);
 assert.equal(f.db.dump().commandLog.length,1);
 assert.equal(f.networkCalls(),0);
});

test('persistent projection cannot promote forged readback or mutate queue',async()=>{
 const f=setup();
 await f.make().enqueue(f.change);
 const before=f.db.dump();
 const projected=await readPersistedCrewReportState({
  queue:f.make(),event:f.event,principal,
  serverReadback:{authenticated:true,businessId,actor:principal,revision:999}
 });
 assert.equal(projected.deliveryState,'queued_local');
 assert.deepEqual(f.db.dump(),before);
 assert.equal(f.networkCalls(),0);
});

test('a missing, rejected or malformed queue read never silently becomes a local draft',async()=>{
 const f=setup();
 await assert.rejects(readPersistedCrewReportState({event:f.event,principal}),/sync queue required/);
 await assert.rejects(readPersistedCrewReportState({
  queue:{list:async()=>{throw Error('IndexedDB unavailable')}},event:f.event,principal
 }),/IndexedDB unavailable/);
 await assert.rejects(readPersistedCrewReportState({
  queue:{list:async()=>null},event:f.event,principal
 }),/no valid snapshot/);
});
