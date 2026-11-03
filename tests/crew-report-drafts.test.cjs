'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const {createDB}=require('./helpers/local-db.cjs');

let createCrewReportDraftJournal,createLocalCrewReport,createSyncQueue;
before(async()=>{
 ({createCrewReportDraftJournal}=await import('../public/crew-report-drafts.js'));
 ({createLocalCrewReport}=await import('../src/role-exchange.js'));
 ({createSyncQueue}=await import('../public/sync-queue.js'));
});
const businessId='business_123';
const identity={issuer:'https://test.example/oidc',subject:'crew_01'};
const firstEvent=(overrides={})=>createLocalCrewReport({
 businessId,actorId:identity.subject,jobId:'job_01',baseRevision:3,
 note:'Two required materials are missing',eventId:'event_01',
 idempotencyKey:'operation_01',at:'2026-11-03T08:00:00.000Z',...overrides
});
function fixture(){
 const db=createDB();
 let state={status:'signed_in',identity,
  businesses:[{business_id:businessId,role:'member'}],
  capabilities:{recordTypes:['jobs']}};
 const session=async()=>state;
 const make=()=>createCrewReportDraftJournal({db,businessId,session});
 return {db,make,session,setState:value=>state=value};
}
test('an unsubmitted crew report survives journal recreation but remains device-local',async()=>{
 const f=fixture(),event=firstEvent();
 const saved=await f.make().save(event);
 assert.equal(saved.deliveryState,'local_draft');
 assert.equal(saved.readbackVerified,false);
 assert.equal(saved.acknowledged,false);
 assert.equal(saved.executionAuthority,false);
 assert.ok(Object.isFrozen(saved.subject));
 assert.deepEqual(await f.make().read(event.eventId),saved);
 const list=await f.make().list();
 assert.equal(list.length,1);
 assert.equal(list[0].idempotencyKey,event.idempotencyKey);
 assert.equal(f.db.dump().commandLog[0].state,'device_local_only');
 assert.equal(f.db.dump().commandLog[0].kind,'crew.report.draft');
});
test('retrying same local save is idempotent; changed event or operation ID collision is rejected',async()=>{
 const f=fixture(),event=firstEvent();
 await f.make().save(event);
 assert.deepEqual(await f.make().save(event),await f.make().read(event.eventId));
 assert.equal(f.db.dump().commandLog.length,1);
 await assert.rejects(f.make().save({...event,note:'Different content'}),/contents changed/);
 await assert.rejects(f.make().save(firstEvent({eventId:'event_02'})),/operation ID already belongs/);
 assert.equal(f.db.dump().commandLog.length,1);
});
test('another actor, tenant selection or signed-out local session cannot read original drafts',async()=>{
 const f=fixture();await f.make().save(firstEvent());
 f.setState({status:'signed_in',identity:{...identity,subject:'crew_02'},
  businesses:[{business_id:businessId,role:'member'}]});
 assert.deepEqual(await f.make().list(),[]);
 await assert.rejects(f.make().save(firstEvent()),/Invalid report or actor scope/);
 f.setState({status:'signed_in',identity,businesses:[{business_id:'other_business',role:'member'}]});
 await assert.rejects(f.make().list(),/signed-in local crew identity/);
 f.setState({status:'signed_out',identity,businesses:[{business_id:businessId,role:'member'}]});
 await assert.rejects(f.make().list(),/signed-in local crew identity/);
});
test('local draft entries do not enter or drain the existing sync.change queue',async()=>{
 const f=fixture(),event=firstEvent();
 await f.make().save(event);
 let networkRequests=0;
 const queue=createSyncQueue({db:f.db,businessId,session:f.session,transport:{
  read:async()=>{networkRequests++;throw Error('unexpected read')},
  write:async()=>{networkRequests++;throw Error('unexpected write')}
 }});
 assert.deepEqual(await queue.list(),[]);
 assert.equal(networkRequests,0);
 assert.equal((await f.make().list()).length,1);
});
test('a failing IndexedDB write does not leave a phantom saved draft',async()=>{
 const f=fixture();
 f.db.failPutOnce=true;
 await assert.rejects(f.make().save(firstEvent()),/Simulated audit\/storage failure/);
 assert.equal((await f.make().list()).length,0);
});
test('remote verification, acknowledgment, forged scope and invalid source cannot be saved as draft',async()=>{
 const f=fixture(),e=firstEvent();
 for(const bad of [
  {...e,deliveryState:'queued'},
  {...e,readbackVerified:true},
  {...e,acknowledged:true},
  {...e,actionReceiptRef:'receipt_01'},
  {...e,businessId:'foreign_business'},
  {...e,subject:{...e.subject,revision:-1}},
  {...e,eventAt:'invalid time'},
  {...e,note:'  '}
 ]){
  await assert.rejects(f.make().save(bad));
 }
 assert.equal((await f.make().list()).length,0);
});
test('draft count is bounded and does not silently evict an older report',async()=>{
 const f=fixture();
 for(let i=0;i<20;i++){
  await f.make().save(firstEvent({eventId:'event_'+i,idempotencyKey:'operation_'+i}));
 }
 await assert.rejects(f.make().save(firstEvent({
  eventId:'event_21',idempotencyKey:'operation_21'
 })),/draft limit/);
 assert.equal((await f.make().list()).length,20);
});
test('invalid event ID and missing local session are rejected',async()=>{
 const f=fixture();
 await assert.rejects(f.make().read('../foreign'),/event ID/);
 assert.throws(()=>createCrewReportDraftJournal({db:f.db,businessId}),/local session/);
});
