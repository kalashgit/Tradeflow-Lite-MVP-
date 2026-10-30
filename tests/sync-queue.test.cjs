const test=require('node:test'),assert=require('node:assert/strict');
const {createDB}=require('./helpers/local-db.cjs');
let createSyncQueue,createTenantTransport;
require('node:test').before(async()=>({createSyncQueue,createTenantTransport}=await import('../public/sync-queue.js')));
const businessId='business_001',change={type:'customers',id:'c1',operationId:'request_1',baseRevision:0,record:{id:'c1',name:'Test customer'}};
function fixture(){
 const db=createDB(),remote=new Map();let writes=0,time=100000,status='signed_in',failure=0,lost=false;
 const session=async()=>({status,businesses:[{business_id:businessId,role:'owner'}]});
 const transport={read:async(type,id)=>remote.has(type+id)?{status:200,record:structuredClone(remote.get(type+id))}:{status:404},write:async(type,id,body)=>{
  if(failure)return {status:failure};const key=type+id,old=remote.get(key);
  if((old?.revision||0)!==body.revision)return {status:409};
  writes++;remote.set(key,{businessId,type,id,revision:body.revision+1,record:structuredClone(body.record)});
  if(lost){lost=false;throw Error('Acknowledgment lost')}return {status:201};
 }};
 const make=()=>createSyncQueue({db,businessId,session,transport,now:()=>time});
 return {db,remote,make,transport,queue:make(),writes:()=>writes,advance:()=>time+=61000,deny:()=>status='signed_out',allow:()=>status='signed_in',failure:n=>failure=n,loseAck:()=>lost=true};
}
test('queue survives runtime recreation, serializes duplicate requests and verifies persisted result',async()=>{
 const f=fixture();await Promise.all([f.queue.enqueue(change),f.queue.enqueue(change)]);assert.equal((await f.make().list()).length,1);
 assert.equal((await f.make().drain()).status,'drained');assert.equal(f.writes(),1);assert.equal((await f.make().list())[0].status,'applied');
 await f.make().drain();assert.equal(f.writes(),1);assert.equal(f.db.version,9);
 await assert.rejects(f.queue.enqueue({...change,record:{id:'c1',name:'Different request'}}),/Operation ID/);
});
test('lost response reconciles actual remote record without repeating a write',async()=>{
 const f=fixture();await f.queue.enqueue(change);f.loseAck();assert.equal((await f.queue.drain()).status,'retry_pending');
 f.advance();await f.make().drain();assert.equal(f.writes(),1);assert.equal((await f.queue.list())[0].result,'already_current');
});
test('stale changes retain both versions until explicit conflict review; resolution can be cancelled',async()=>{
 const f=fixture();await f.queue.enqueue(change);f.remote.set('customersc1',{businessId,type:'customers',id:'c1',revision:2,record:{id:'c1',name:'Other device'}});
 await f.queue.drain();let row=(await f.queue.list())[0];assert.equal(row.status,'conflict');assert.equal(f.writes(),0);
 assert.equal((await f.queue.resolve(row.id,change.record,()=>false)).status,'cancelled');assert.equal((await f.queue.list())[0].status,'conflict');
 await f.queue.resolve(row.id,{id:'c1',name:'Reviewed merge'},proposal=>{assert.equal(proposal.remote.record.name,'Other device');return true});
 await f.queue.drain();row=(await f.queue.list())[0];assert.equal(row.status,'applied');assert.equal(f.remote.get('customersc1').revision,3);assert.equal(f.writes(),1);
});
test('expired sessions, forbidden responses and rate limits preserve work without uncontrolled retries',async()=>{
 for(const status of [401,403,429,503]){
  const f=fixture();await f.queue.enqueue(change);f.failure(status);await f.queue.drain();assert.equal(f.writes(),0);assert.equal((await f.queue.list())[0].status,'pending');
  assert.equal((await f.queue.drain()).processed,0);f.advance();f.failure(0);await f.queue.drain();assert.equal(f.writes(),1);
 }
 const f=fixture();await f.queue.enqueue(change);f.deny();assert.equal((await f.queue.drain()).status,'authorization_required');assert.equal(f.writes(),0);
});
test('concurrent tab drains cannot claim one operation twice',async()=>{
 const f=fixture();await f.queue.enqueue(change);await Promise.all([f.queue.drain(),f.make().drain()]);assert.equal(f.writes(),1);assert.equal((await f.queue.list())[0].status,'applied');
});
test('invalid or cross-business queued and remote identities fail closed',async()=>{
 const f=fixture();assert.throws(()=>f.queue.enqueue({...change,record:{id:'other'}}),/identity/);
 assert.throws(()=>f.queue.enqueue({...change,baseRevision:-1}),/Invalid/);
 await f.queue.enqueue(change);f.remote.set('customersc1',{businessId:'business_999',type:'customers',id:'c1',revision:1,record:change.record});
 await f.queue.drain();assert.equal(f.writes(),0);assert.equal((await f.queue.list())[0].status,'pending');
});
test('failed verification never reports success and retry count is bounded',async()=>{
 const f=fixture();await f.queue.enqueue(change);f.failure(503);
 for(let i=0;i<7;i++){await f.queue.drain();f.advance()}
 const row=(await f.queue.list())[0];assert.equal(row.status,'failed');assert.equal(row.attempts,5);assert.equal(f.writes(),0);
});
test('same-origin transport rejects login redirects and mismatched successful payloads',async()=>{
 const transport=createTenantTransport(businessId,async(url,options)=>{assert.ok(url.startsWith('/api/v1/businesses/'+businessId));assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'manual');return {status:0,type:'opaqueredirect'}});
 assert.equal((await transport.read('customers','c1')).status,401);
 const bad=createTenantTransport(businessId,async()=>Response.json({id:'c2',type:'customers',revision:1,record:{}}));await assert.rejects(bad.read('customers','c1'),/identity mismatch/);
});

test('read-only catalogue transport validates tenant, cursor, revisions and redirect boundaries',async()=>{
 const expected={businessId,type:'jobs',items:[{id:'job_001',revision:3,record:{name:'Test job'}}],nextCursor:null};
 let calls=0;
 const transport=createTenantTransport(businessId,async(url,options)=>{
  calls++;assert.equal(options.method,'GET');assert.equal(options.credentials,'same-origin');
  assert.equal(url,'/api/v1/businesses/'+businessId+'/records/jobs?after=job_000');
  return Response.json(expected);
 });
 const result=await transport.list('jobs','job_000');
 assert.equal(result.status,200);assert.equal(result.items[0].revision,3);assert.equal(result.nextCursor,null);
 assert.equal(calls,1);
 await assert.rejects(transport.list('jobs','../../wrong'),/Invalid catalogue/);
 const redirect=createTenantTransport(businessId,async()=>({status:302,type:'opaqueredirect'}));
 assert.equal((await redirect.list('jobs')).status,401);
 const crossTenant=createTenantTransport(businessId,async()=>Response.json({...expected,businessId:'business_999'}));
 await assert.rejects(crossTenant.list('jobs'),/catalogue response invalid/);
 const truncated=createTenantTransport(businessId,async()=>Response.json({...expected,nextCursor:'job_999'}));
 await assert.rejects(truncated.list('jobs'),/catalogue response invalid/);
});

test('optional undefined fields do not crash canonical queue idempotency and remain omitted in persisted snapshots',async()=>{
 const f=fixture(),withOptional={...change,record:{id:'c1',name:'Test customer',optional:undefined,details:{priority:1,note:undefined}}};
 const again={...change,record:{details:{priority:1},name:'Test customer',id:'c1'}};
 await f.queue.enqueue(withOptional);
 await f.queue.enqueue(again);
 assert.equal((await f.queue.list()).length,1);
 assert.equal((await f.queue.drain()).status,'drained');
 assert.equal(f.writes(),1);
 assert.equal((await f.queue.list())[0].status,'applied');
});

test('conflict review fails closed when membership is revoked during approval',async()=>{
 const f=fixture();await f.queue.enqueue(change);
 f.remote.set('customersc1',{businessId,type:'customers',id:'c1',revision:2,record:{id:'c1',name:'Another device'}});
 await f.queue.drain();
 const row=(await f.queue.list())[0];assert.equal(row.status,'conflict');
 await assert.rejects(f.queue.resolve(row.id,{id:'c1',name:'Approved'},async()=>{f.deny();return true}),/Authorized session changed/);
 assert.equal((await f.queue.list())[0].status,'conflict');assert.equal(f.writes(),0);
});
test('conflict review refuses stale remote revision changed while owner considers proposal',async()=>{
 const f=fixture();await f.queue.enqueue(change);
 f.remote.set('customersc1',{businessId,type:'customers',id:'c1',revision:2,record:{id:'c1',name:'Remote original'}});
 await f.queue.drain();
 const row=(await f.queue.list())[0];
 await assert.rejects(f.queue.resolve(row.id,{id:'c1',name:'Approved'},async()=>{
  f.remote.set('customersc1',{businessId,type:'customers',id:'c1',revision:3,record:{id:'c1',name:'Remote updated'}});
  return true;
 }),/Remote record changed during conflict review/);
 assert.equal((await f.queue.list())[0].status,'conflict');assert.equal(f.writes(),0);
});
test('conflict review refuses same-revision remote changes without evidence of consistency',async()=>{
 const f=fixture();await f.queue.enqueue(change);
 f.remote.set('customersc1',{businessId,type:'customers',id:'c1',revision:2,record:{id:'c1',name:'Original'}});
 await f.queue.drain();
 const row=(await f.queue.list())[0];
 await assert.rejects(f.queue.resolve(row.id,{id:'c1',name:'Approved'},async()=>{
  f.remote.set('customersc1',{businessId,type:'customers',id:'c1',revision:2,record:{id:'c1',name:'Tampered'}});
  return true;
 }),/Remote record changed during conflict review/);
 assert.equal((await f.queue.list())[0].status,'conflict');assert.equal(f.writes(),0);
});

test('conflict review persists original approved proposal despite callback mutation',async()=>{
 const f=fixture();await f.queue.enqueue(change);
 f.remote.set('customersc1',{businessId,type:'customers',id:'c1',revision:2,record:{id:'c1',name:'External'}});
 await f.queue.drain();const row=(await f.queue.list())[0];
 const proposal={id:'c1',name:'Reviewed',details:{category:'electrical'}};
 await f.queue.resolve(row.id,proposal,async evidence=>{
  assert.equal(evidence.proposed.name,'Reviewed');
  proposal.name='Unreviewed';proposal.details.category='other';
  evidence.proposed.name='Modified evidence';
  return true;
 });
 const retained=(await f.queue.list())[0];
 assert.equal(retained.change.record.name,'Reviewed');
 assert.equal(retained.change.record.details.category,'electrical');
 assert.equal(retained.status,'pending');
 assert.equal(f.writes(),0);
});
test('foreign-business or changed record identity is rejected before requesting conflict approval',async()=>{
 const f=fixture();await f.queue.enqueue(change);
 f.remote.set('customersc1',{businessId,type:'customers',id:'c1',revision:2,record:{id:'c1',name:'External'}});
 await f.queue.drain();const row=(await f.queue.list())[0];let approvalCalls=0;
 for(const proposed of [{id:'other',name:'Wrong'},{id:'c1',businessId:'business_999',name:'Foreign'}]){
  await assert.rejects(f.queue.resolve(row.id,proposed,async()=>{approvalCalls++;return true}),/identity/);
 }
 assert.equal(approvalCalls,0);assert.equal((await f.queue.list())[0].status,'conflict');
});
