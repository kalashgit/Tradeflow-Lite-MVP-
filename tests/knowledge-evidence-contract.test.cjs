'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const academy=require('../public/academy-catalog.json');
const osha=require('../public/osha-electrical-safety-pack.json');
const {openPack}=require('../public/offline-knowledge-pack.js');
const {resolve,packet}=require('../public/knowledge-evidence-contract.js');
test('Academy metadata can be cited as a source listing, never as verified source content',()=>{
 const item=resolve('academy:tf-academy-001@1',{academy});
 assert.equal(item.classification,'source_metadata_only');assert.equal(item.claimSupported,false);
 assert.equal(item.passage,null);
 assert.deepEqual(packet(['academy:tf-academy-001@1'],{academy}).unsupportedClaims,['academy:tf-academy-001@1']);
});
test('verified OSHA passage has exact digest and provenance; unknown IDs fail closed',async()=>{
 const verified=await openPack(osha);
 const id=osha.passages[0].id,ref='knowledge:'+id+'@1';
 const item=resolve(ref,{pack:verified});
 assert.equal(item.classification,'retrieved_source_passage');
 assert.equal(item.sha256,osha.passages[0].sha256);
 assert.equal(item.claimSupported,true);
 assert.throws(()=>resolve('knowledge:made-up@1',{pack:verified}),/not found/);
 assert.throws(()=>resolve(ref,{pack:osha}),/Unsupported knowledge citation/);
});
test('invalid references and invented Academy passages are rejected',()=>{
 for(const ref of ['academy:tf-academy-999@1','academy:tf-academy-001@2','knowledge:missing@2','tenant:foreign:job'])
  assert.throws(()=>resolve(ref,{academy}),/unsupported|Unsupported/i);
 const altered=structuredClone(academy);altered.sources[0].ingestionStatus='full_text';
 assert.throws(()=>resolve('academy:tf-academy-001@1',{academy:altered}),/unsupported/);
 assert.throws(()=>packet(['academy:tf-academy-001@1','academy:tf-academy-001@1'],{academy}),/Invalid/);
});
test('synthetic reference cannot be promoted into a tenant business claim',async()=>{
 const demo=require('./fixtures/offline-knowledge-demo.json'),verified=await openPack(demo);
 const ref='knowledge:'+demo.passages[0].id+'@1';
 assert.throws(()=>resolve(ref,{pack:verified,scope:{businessId:'tenant-a'}}),/Synthetic knowledge/);
 assert.equal(resolve(ref,{pack:verified,scope:{businessId:'tenant-a',allowSynthetic:true}}).claimSupported,false);
});
test('private citation enforces business and actor scope without promoting unreviewed text',async()=>{
 const crypto=require('node:crypto'),scope={businessId:'tenant-a',actorId:'owner-a'};
 const text='Company estimating draft awaiting review';
 const raw={schema:'tradeflow.offline-knowledge.v1',id:'local-draft',version:'1',audience:'private_device',builtOn:'2026-11-09',
  sources:[{id:'draft',title:'Owner draft',publisher:'Owner',documentVersion:'1',reviewedOn:'2026-11-09',jurisdictions:['UNKNOWN'],rights:'user_supplied_private_use',rightsEvidence:'Explicit local test fixture',contentStatus:'available_excerpt',kind:'contractor_sop'}],
  passages:[{id:'draft-1',sourceId:'draft',heading:'Estimating',text,sha256:crypto.createHash('sha256').update(text).digest('hex')}]};
 const pack=await openPack(raw,{scope}),ref='knowledge:draft-1@1';
 assert.throws(()=>pack.citation('draft-1'),/scope/);
 assert.throws(()=>pack.citation('draft-1',{scope:{businessId:'tenant-b',actorId:'owner-a'}}),/scope mismatch/);
 assert.throws(()=>resolve(ref,{pack,scope:{businessId:'tenant-a',actorId:'employee-b'}}),/scope mismatch/);
 const item=resolve(ref,{pack,scope});
 assert.equal(item.classification,'private_unreviewed_passage');
 assert.equal(item.claimSupported,false);
 assert.deepEqual(packet([ref],{pack,scope}).unsupportedClaims,[ref]);
});
