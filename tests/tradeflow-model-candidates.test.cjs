'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../config/tradeflow-ai-model-candidates.json');
const info=JSON.parse(fs.readFileSync(file,'utf8'));
test('model candidates cover LLM, ASR, VAD and TTS, with no auto-activation',()=>{
 const kinds=new Set(info.providers.map(x=>x.kind));
 for(const kind of ['llm','asr','vad','tts'])assert.ok(kinds.has(kind),kind+' missing');
 assert.equal(info.status,'evaluation_candidates_only');
 assert.equal(info.defaultSpeechMode,'disabled');
 assert.equal(info.defaultAudioRetention,'none');
 assert.equal(info.rules.noAutomaticCloudFallback,true);
});
test('unverified model weights cannot be activated or silently redistributed',()=>{
 const ids=new Set();
 for(const provider of info.providers){
  assert.ok(!ids.has(provider.id));ids.add(provider.id);
  assert.equal(provider.enabled,false);
  assert.equal(provider.licenseReviewed,false);
  assert.equal(provider.weightsRef,null);
  assert.equal(provider.weightsSha256,null);
  assert.match(provider.runtime,/llama\.cpp|sherpa-onnx|whisper\.cpp/);
 }
});
test('benchmark specification tracks both latency and accuracy with real hardware required',()=>{
 const metrics=new Set(info.evaluation.requiredMetrics);
 for(const metric of ['asr_wer_domain','llm_groundedness','tts_first_chunk_ms','barge_in_stop_ms','peak_ram_mib'])assert.ok(metrics.has(metric));
 assert.equal(info.evaluation.hardwareProfileRequired,true);
});
