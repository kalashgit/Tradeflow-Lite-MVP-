'use strict';
const {test,before}=require('node:test'),assert=require('node:assert/strict');
const academy=require('../public/academy-catalog.json');
const osha=require('../public/osha-electrical-safety-pack.json');
const {openPack}=require('../public/offline-knowledge-pack.js');
let assembleKnowledgeContext;
before(async()=>({assembleKnowledgeContext}=await import('../src/knowledge-context-packet.js')));
const businessId='company_001',principal={verified:true,issuer:'verified.example',subject:'owner_001'};
const row=(type,id,fields={})=>({record_type:type,id,revision:2,updated_at:'2026-11-09T10:00:00Z',
 payload:JSON.stringify({id,businessId,...fields})});
function fixture(rows,role='owner'){
 let current=role;
 return {setRole:x=>{current=x},db:{prepare(sql){return {bind(...args){return {
  first:async()=>({role:current}),
  all:async()=>{assert.equal(args[0],businessId);assert.equal(args[1],businessId);
   assert.match(sql,/status='active' AND role=\?/);
   return {results:structuredClone(rows)}}
 }}}}}};
}
test('authenticated synthetic fixture gets read-only business evidence and exact knowledge passage',async()=>{
 const f=fixture([row('jobs','renovation_1',{title:'Commercial renovation',status:'Completed'}),
  row('jobCosts','labor_1',{jobId:'renovation_1',category:'Labor',laborHours:42,amount:3150,currency:'USD'})]);
 const verified=await openPack(osha);
 const result=await assembleKnowledgeContext({db:f.db,principal,businessId,jobId:'renovation_1',purpose:'labor_estimation',knowledgePack:verified,
  knowledgeRefs:['knowledge:construction-lockout-tags@1']});
 assert.equal(result.business.records.length,2);
 assert.equal(result.business.records[1].record.laborHours,42);
 assert.equal(result.business.records[1].revision,2);
 assert.equal(result.knowledge.evidence[0].claimSupported,true);
 assert.equal(result.knowledge.evidence[0].classification,'retrieved_source_passage');
 assert.equal(result.executionAuthority,false);
 assert.equal(result.businessEvidenceStatus,'membership_scoped_snapshot'); // Test fixtures are not live company history.
 assert.ok(result.unknowns.some(x=>/Estimated versus actual labor hours/.test(x)));
 assert.ok(result.unknowns.some(x=>/Approved labor estimating guidance/.test(x)));
 assert.equal(Object.isFrozen(result.business.records),true);
 assert.equal(result.business.records[0].record.customerEmail,undefined);
});
test('Academy metadata never counts as estimating guidance',async()=>{
 const f=fixture([row('jobs','renovation_1',{title:'Commercial renovation'})]);
 const r=await assembleKnowledgeContext({db:f.db,principal,businessId,academy,
  knowledgeRefs:['academy:tf-academy-001@1']});
 assert.deepEqual(r.knowledge.unsupportedClaims,['academy:tf-academy-001@1']);
 assert.ok(r.unknowns.includes('No approved source passage is available for this question'));
 assert.equal(r.unknowns.some(x=>/Estimated versus actual labor hours/.test(x)),false);
 await assert.rejects(assembleKnowledgeContext({db:f.db,principal,businessId,purpose:'execute_payment'}),/Unsupported knowledge context purpose/);
});
test('missing records, invalid identity and actor role revocation fail closed',async()=>{
 const f=fixture([row('jobs','renovation_1',{})]);
 await assert.rejects(assembleKnowledgeContext({db:f.db,principal:{...principal,verified:false},businessId}),{status:401});
 await assert.rejects(assembleKnowledgeContext({db:f.db,principal,businessId,jobId:'foreign_job'}),{status:404});
 f.setRole('revoked');
 await assert.rejects(assembleKnowledgeContext({db:f.db,principal,businessId}),{status:403});
});
test('cross-tenant row and invented citation cannot enter the context packet',async()=>{
 const foreign=fixture([row('jobs','renovation_1',{businessId:'company_999'})]);
 await assert.rejects(assembleKnowledgeContext({db:foreign.db,principal,businessId}),{status:503});
 const f=fixture([]),verified=await openPack(osha);
 await assert.rejects(assembleKnowledgeContext({db:f.db,principal,businessId,knowledgePack:verified,
  knowledgeRefs:['knowledge:invented-guidance@1']}),/not found/);
});
test('synthetic passages cannot be promoted into authenticated company evidence',async()=>{
 const demo=require('./fixtures/offline-knowledge-demo.json'),synthetic=await openPack(demo),f=fixture([]);
 await assert.rejects(assembleKnowledgeContext({db:f.db,principal,businessId,knowledgePack:synthetic,
  knowledgeRefs:['knowledge:'+demo.passages[0].id+'@1']}),/Synthetic knowledge cannot/);
});
