const {test,before}=require('node:test'),assert=require('node:assert/strict');
const commands=require('../public/command-registry.js'),{createDB,snapshot}=require('./helpers/local-db.cjs');
let createCloudReviewPort;before(async()=>({createCloudReviewPort}=await import('../public/cloud-intelligence.js')));
const businessId='business_001',identity={issuer:'verified.example',subject:'owner_001'};
const session=()=>({status:'signed_in',identity,businesses:[{business_id:businessId,role:'owner'}]});
const context=()=>({kind:'tradeflow.intelligence.context.v1',businessId,identity,scope:{company:true},permission:{role:'owner'},readOnly:true,executionAuthority:false,records:[{type:'jobs',id:'job_01',revision:3,provenance:'tenant_record',contentTrust:'untrusted_record_content',updatedAt:'2026-10-30T12:00:00Z',record:{title:'Private job details'}}]});
test('existing shared read command uses authorized cloud port with a minimal receipt and no business mutation',async()=>{
 const db=createDB(),before=db.dump();let calls=0,observed;
 const review=createCloudReviewPort({businessId,session,fetcher:async(url,options)=>{calls++;assert.ok(url.endsWith('/intelligence/context'));assert.equal(options.method,'GET');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'manual');return Response.json(context())},onContext:c=>observed=c});
 const rt=commands.createRuntime({uid:()=>crypto.randomUUID(),snapshot:()=>snapshot(db),context:()=>({actor:'owner_001',businessId,today:'2026-10-30'}),ledger:commands.createLedger(db),can:p=>p==='read',ports:{review}});
 const plan=await rt.prepare('review business');assert.equal(plan.effect,'read');const outcome=await rt.execute(plan.id);assert.equal(outcome.status,'succeeded');assert.equal(calls,1);assert.equal(observed.records[0].record.title,'Private job details');assert.equal(outcome.result.recordCount,1);
 const after=db.dump();for(const name of Object.keys(before).filter(k=>k!=='commandLog'))assert.deepEqual(after[name],before[name]);assert.ok(!JSON.stringify(after.commandLog).includes('Private job details'));
});
test('expired/mismatched actor or role, redirects, and forged response scope never reach context consumer',async()=>{
 for(const mode of ['actor','role','redirect','tenant','job','revision']){let calls=0,shown=0;const review=createCloudReviewPort({businessId,...(mode==='job'?{jobId:'job_01'}:{}),session:async()=>{calls++;const s=session();if(calls>1&&mode==='actor')s.identity={...identity,subject:'another_owner'};if(calls>1&&mode==='role')s.businesses=[{business_id:businessId,role:'viewer'}];return s},fetcher:async()=>{if(mode==='redirect')return {type:'opaqueredirect',ok:false};const c=context();if(mode==='tenant')c.businessId='business_999';if(mode==='revision')c.records[0].revision=0;return Response.json(c)},onContext:()=>shown++});await assert.rejects(review());assert.equal(shown,0,mode)}
});
test('signed-out/offline context reads fail honestly without fabricated cached intelligence',async()=>{
 let calls=0;const review=createCloudReviewPort({businessId,session:async()=>({status:'signed_out'}),fetcher:async()=>{calls++;throw Error('must not call')}});await assert.rejects(review(),/membership/);assert.equal(calls,0);
 const offline=createCloudReviewPort({businessId,session,fetcher:async()=>{throw Error('offline')}});await assert.rejects(offline(),/offline/);
});
