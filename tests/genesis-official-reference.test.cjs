'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {safetyReferences,referenceIndex}=require('../src/genesis-official-reference.cjs');
const {converseGenesis}=require('../src/genesis-adviser.cjs');
test('existing OSHA references are loaded only from the checksum-verified offline pack',async()=>{
 const index=await referenceIndex();
 assert.equal(index.manifest.id,'osha-electrical-safety-us-v1');
 assert.equal(index.manifest.audience,'redistributable_reference');
 assert.equal(index.manifest.passageCount,6);
});
test('electrical safety retrieval returns bounded official OSHA paraphrases and source URLs',async()=>{
 const matches=await safetyReferences('What does OSHA say about electrical construction lockout and tagging?');
 assert.ok(matches.length>=1);
 assert.ok(matches.length<=3);
 assert.ok(matches.every(x=>x.sourceUrl.startsWith('https://www.osha.gov/')));
 assert.ok(matches.every(x=>x.sourceType==='verified_offline_osha_paraphrase'));
 assert.ok(matches.every(x=>x.id.startsWith('tf-osha-')));
 assert.ok(matches.every(x=>/Not permission to work energized/.test(x.limitations)));
});
test('finance-only questions do not pull OSHA safety references unnecessarily',async()=>{
 assert.deepEqual(await safetyReferences('How should I improve cash-flow and CEO strategy?'),[]);
 assert.rejects(()=>safetyReferences('OSHA',{limit:4}),/bound/);
});
test('live Qwen prompt includes original contractor playbook AND real official safety reference metadata',async()=>{
 let captured;
 const result=await converseGenesis({
  messages:[{role:'user',content:'What does OSHA say about lockout tagging electrical circuits?'}],
  enabled:true,mode:'live',fetchImpl:async(_,opt)=>{
   captured=JSON.parse(opt.body);
   return {ok:true,json:async()=>({choices:[{message:{content:'A qualified electrician should verify the site-specific isolation and tagging procedure against the applicable standard.'},finish_reason:'stop'}]})};
  }
 });
 assert.equal(result.status,'completed');
 assert.ok(result.knowledgeSources.some(x=>x.kind==='verified_offline_osha_paraphrase'));
 const packet=JSON.parse(captured.messages.findLast(x=>x.role==='user').content);
 assert.ok(packet.referenceData.selection.some(x=>x.sourceUrl?.startsWith('https://www.osha.gov/')));
 assert.equal(result.companyRecordsRead,0);
 assert.equal(result.executionAuthority,false);
});
