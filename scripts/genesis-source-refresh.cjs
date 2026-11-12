#!/usr/bin/env node
// AION GKB-01: explicitly invoked, bounded single-source refresh staging.
//
// Returns ONLY metadata and SHA-256 evidence about one allowlisted official
// external web source. Does not copy/redistribute its page, execute page
// instructions, train Qwen, publish learned notes, or mutate TradeFlow records.
// Production integration would require independent authenticity and legal
// source-rights review; caller owns network egress permissions and rate limits.
'use strict';
const {createHash}=require('node:crypto');
const {SOURCES}=require('../src/genesis-external-knowledge.cjs');

const MAX_BYTES=1024*1024;
const MIME=/^(text\/html|text\/plain|application\/xhtml\+xml)(?:\s*;|$)/i;
function validateSource(sourceId){
 if(typeof sourceId!=='string'||!Object.prototype.hasOwnProperty.call(SOURCES,sourceId))
  throw Error('Unknown source ID');
 const source=SOURCES[sourceId];
 if(source.rights==='metadata_only')
  throw Error('Metadata-only rights source cannot be auto-fetched');
 const url=new URL(source.url);
 if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid canonical HTTPS source');
 return {source,url};
}
async function stageRefresh(sourceId,{fetchImpl=globalThis.fetch,
  priorSha=null,maxBytes=MAX_BYTES,timeoutMs=10000}={}){
 const {source,url}=validateSource(sourceId);
 if(typeof fetchImpl!=='function')throw Error('A bounded fetch transport is required');
 if(priorSha!==null&&(typeof priorSha!=='string'||!/^[a-f0-9]{64}$/.test(priorSha)))
  throw Error('Invalid prior reviewed SHA');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<128||maxBytes>MAX_BYTES||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<250||timeoutMs>30000)
  throw Error('Invalid source fetch budget');

 // Fetch is a *reader*, never an arbitrary tool invocation, and redirects
 // are disallowed. Caller must also enforce its own outbound network policy.
 const response=await fetchImpl(url.href,{method:'GET',redirect:'error',
  credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(timeoutMs),
  headers:{Accept:'text/html,text/plain;q=0.8'}});
 if(!response||response.ok!==true||response.status!==200)
  throw Error('Source not available for bounded review');
 const final=response.url?new URL(response.url):url;
 if(final.href!==url.href)throw Error('Source redirected or changed canonical URL');
 const contentType=response.headers?.get?.('content-type')||'';
 if(!MIME.test(contentType))throw Error('Unsupported document MIME');
 const advertised=Number(response.headers?.get?.('content-length'));
 if(Number.isFinite(advertised)&&advertised>maxBytes)
  throw Error('Source too large');

 const digest=createHash('sha256');let size=0,reader=response.body?.getReader?.();
 if(!reader)throw Error('Streaming source body required');
 try{
  for(;;){
   const {value,done}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))throw Error('Invalid streamed source body');
   size+=value.byteLength;
   if(size>maxBytes)throw Error('Source exceeded max bytes');
   digest.update(value);
  }
 }catch(e){await reader.cancel().catch(()=>{});throw e}
 finally{reader.releaseLock()}
 if(size<32)throw Error('Suspiciously short source');
 const sha256=digest.digest('hex');
 return Object.freeze({
  schema:'AIONSourceRefreshStaging/1',sourceId,canonicalUrl:url.href,
  publisher:source.publisher,jurisdiction:source.jurisdiction,
  sourceReviewedOn:source.reviewedOn,
  sourceRisk:source.risk,rights:source.rights,
  sha256,bytes:size,
  priorSha,changed:priorSha===null?'uncompared':priorSha!==sha256,
  stagedAt:new Date().toISOString(),
  rawPageStored:false,canPromote:false,reviewRequired:true,
  suggestedNextStep:'Human/independent source review of effective date, content delta, jurisdiction and rights before authoring an updated original note.'
 });
}
if(require.main===module){
 const sourceId=process.argv.find(x=>x.startsWith('--source='))?.slice(9);
 const priorSha=process.argv.find(x=>x.startsWith('--prior-sha='))?.slice(12)||null;
 if(!sourceId){console.error('Usage: node scripts/genesis-source-refresh.cjs --source=osha-contractors [--prior-sha=<sha256>]');process.exitCode=2}
 else stageRefresh(sourceId,{priorSha}).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
}
module.exports={stageRefresh,validateSource,MAX_BYTES};
