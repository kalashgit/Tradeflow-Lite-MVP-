'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {stageRefresh,validateSource}=require('../scripts/genesis-source-refresh.cjs');
const textBody='<html><body>Trusted public agency source metadata for external review, not a model instruction.</body></html>';
const response=()=>new Response(textBody,{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
test('refresh cannot read unregistered or proprietary metadata-only source URLs',()=>{
 assert.throws(()=>validateSource('evil'),/Unknown/);
 assert.throws(()=>validateSource('nfpa-nec'),/Metadata-only/);
 assert.equal(validateSource('osha-contractors').source.id,'osha-contractors');
});
test('one vetted public source produces metadata/sha only and does not publish text',async()=>{
 let called;
 const result=await stageRefresh('osha-contractors',{fetchImpl:async(url,opts)=>{
  called={url,opts};return response();
 }});
 assert.equal(called.url,'https://www.osha.gov/electrical-contractors/standards');
 assert.equal(called.opts.redirect,'error');
 assert.equal(called.opts.credentials,'omit');
 assert.equal(called.opts.method,'GET');
 assert.equal(result.sha256,createHash('sha256').update(textBody).digest('hex'));
 assert.equal(result.rawPageStored,false);
 assert.equal(result.canPromote,false);
 assert.equal(result.reviewRequired,true);
 assert.equal(result.changed,'uncompared');
 assert.equal(JSON.stringify(result).includes('Trusted public agency source metadata'),false);
});
test('known reviewed checksum makes unchanged/changed status explicit',async()=>{
 const original=createHash('sha256').update(textBody).digest('hex');
 const current=await stageRefresh('osha-contractors',{priorSha:original,fetchImpl:async()=>response()});
 assert.equal(current.changed,false);
 const changed=await stageRefresh('osha-contractors',{priorSha:'0'.repeat(64),fetchImpl:async()=>response()});
 assert.equal(changed.changed,true);
});
test('cannot fetch redirects, fail statuses, PDFs or tiny suspicious pages',async()=>{
 for(const [fn,pattern] of [
  [async()=>new Response(null,{status:302,headers:{location:'https://attacker.invalid'}}),/not available/],
  [async()=>new Response('lost',{status:404}),/not available/],
  [async()=>new Response(textBody,{headers:{'content-type':'application/pdf'}}),/MIME/],
  [async()=>new Response('x',{headers:{'content-type':'text/html'}}),/short/]
 ]){
  await assert.rejects(()=>stageRefresh('osha-contractors',{fetchImpl:fn}),pattern);
 }
});
test('streaming source size, budget and checksum are bounded',async()=>{
 await assert.rejects(()=>stageRefresh('osha-contractors',{maxBytes:128,
  fetchImpl:async()=>new Response(textBody.repeat(20),{headers:{'content-type':'text/html'}})}),/max bytes|too large/);
 await assert.rejects(()=>stageRefresh('osha-contractors',{maxBytes:100}),/budget/);
 await assert.rejects(()=>stageRefresh('osha-contractors',{timeoutMs:31000}),/budget/);
 await assert.rejects(()=>stageRefresh('osha-contractors',{priorSha:'bad'}),/SHA/);
});
