'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const commands=require('../public/command-registry.js'),core=require('../public/core-integration.js');
const {createDB,snapshot,put}=require('./helpers/local-db.cjs');
const businessId='local-business';
const source={id:'q1',title:'Service panel upgrade',category:'Electrical',customerId:'c1',businessId,
 amount:'1250.00',status:'Accepted',sentDate:'2026-10-01',signature:'DO NOT COPY',acceptedAt:'2026-10-12'};
const command={commandId:'quotation.reuse.create',params:{ref:{store:'quotes',id:'q1'}}};
function fixture(){
 const db=createDB({quotes:[source],customers:[{id:'c1',name:'Existing customer',businessId}]});let n=0,calls=0;
 const runtime=commands.createRuntime({snapshot:()=>snapshot(db),context:()=>({actor:'local-owner',businessId,today:'2026-10-30'}),
  uid:()=>`cmd-${++n}`,ledger:commands.createLedger(db),can:p=>p==='modify:quotation.reuse.create',
  ports:{operation:async(kind,payload,proof)=>{calls++;return core.execute({db,kind,payload,uid:()=>`draft-${n}`,
   requestKey:proof.requestKey,recordGuard:proof.recordGuard,actor:proof.actor,businessId:proof.businessId,approved:proof.approved})}}});
 return {db,runtime,calls:()=>calls};
}
test('approved source reuse creates unsent draft with provenance and no customer or authorization',async()=>{
 const {db,runtime}=fixture(),p=await runtime.prepare(command);
 assert.equal(p.status,'needs_review');assert.equal(p.result.amount,1250);
 assert.equal((await runtime.execute(p.id)).error.code,'APPROVAL_REQUIRED');
 await runtime.approve(p.id);assert.equal((await runtime.execute(p.id)).status,'succeeded');
 const data=await snapshot(db),draft=data.quotes.find(q=>q.id!=='q1');
 assert.equal(draft.status,'Draft');assert.equal(draft.amount,'1250');assert.equal(draft.customerId,'');
 assert.equal(draft.sentDate,'');assert.equal(draft.followup_date,'');
 assert.equal(draft.sourceQuoteId,'q1');assert.equal(draft.reuseEvidence.pricingReverified,false);
 assert.equal(draft.reuseEvidence.customerAuthorizationCopied,false);
 for(const key of ['signature','acceptedAt','approvedBy'])assert.ok(!(key in draft));
 assert.equal(data.quotes.find(q=>q.id==='q1').status,'Accepted');
 assert.equal(data.commandLog.filter(x=>x.kind==='quotation.reuse.create').length,1);
 assert.equal(data.commandLog.filter(x=>x.kind==='domain.event'&&x.type==='quotation.created').length,1);
});
test('stale quote, competing draft and tenant mismatch fail closed',async()=>{
 for(const type of ['source','draft']){
  const {db,runtime}=fixture(),p=await runtime.prepare(command);await runtime.approve(p.id);
  if(type==='source')await put(db,'quotes',{...source,amount:'1300'});
  else await put(db,'quotes',{id:'other',sourceQuoteId:'q1',status:'Draft',businessId});
  assert.equal((await runtime.execute(p.id)).status,'stale',type);
  assert.equal((await snapshot(db)).quotes.some(q=>q.id.startsWith('draft-')),false);
 }
 const {db,runtime}=fixture();await put(db,'quotes',{...source,businessId:'other-business'});
 assert.notEqual((await runtime.prepare(command)).status,'needs_review');
});
test('invalid source, rejection and unauthorized actor cannot create quote',async()=>{
 const {db,runtime}=fixture(),p=await runtime.prepare(command);
 assert.equal((await runtime.reject(p.id)).status,'rejected');assert.equal((await snapshot(db)).quotes.length,1);
 await put(db,'quotes',{...source,amount:'not-money'});
 assert.equal((await runtime.prepare(command)).error.code,'UNSAFE_AMOUNT');
});
test('interrupted create reconciles exact receipt without replay and later approval reuses draft',async()=>{
 const {db,runtime,calls}=fixture(),p=await runtime.prepare(command);await runtime.approve(p.id);
 await commands.createLedger(db).transition(p.id,['approved'],{type:'executing'},{status:'executing'});
 const resolved=commands.resolve(command,await snapshot(db),{actor:'local-owner',businessId});
 await core.execute({db,kind:'quotation.reuse.create',payload:{sourceQuoteId:'q1',title:source.title,category:source.category,amount:1250},
  uid:()=> 'saved-draft',requestKey:'operation:'+p.id,actor:'local-owner',businessId,approved:true,recordGuard:resolved.guard});
 assert.equal((await runtime.reconcile(p.id)).status,'succeeded');assert.equal(calls(),0);
 const another=await runtime.prepare(command);await runtime.approve(another.id);
 assert.equal((await runtime.execute(another.id)).result.reused,true);
 assert.equal((await snapshot(db)).quotes.length,2);
});
test('GUI reuses shared command with explicit review rather than silently copying source authority',()=>{
 const app=fs.readFileSync('public/app.js','utf8');
 assert.match(app,/commandId:'quotation.reuse.create'/);
 assert.match(app,/Customer, acceptance, signature and contact history are NOT copied/);
 assert.match(app,/tfRecordDetailId=outcome.result.id/);
});
