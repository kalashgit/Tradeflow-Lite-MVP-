'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/ai-offline-voice.js'),'utf8');
function load(scope={}){scope.globalThis=scope;vm.runInNewContext(source,scope);return scope.TradeFlowAIOfflineVoice}

test('offline speech refuses browsers without verified local-only recognition',async()=>{
 const statuses=[];let finals=0;
 const voice=load().create({onStatus:x=>statuses.push(x),onFinal:()=>finals++});
 assert.equal((await voice.start()).started,false);
 assert.match(statuses[0],/not supported/);
 assert.equal(finals,0);
});
test('legacy Web Speech API cannot silently use a cloud recognizer',async()=>{
 class Legacy{start(){throw Error('must not start')}}
 const voice=load({SpeechRecognition:Legacy}).create();
 assert.equal((await voice.start()).started,false);
});
test('downloadable but missing local model never starts microphone',async()=>{
 let started=0;
 class Speech{processLocally=false;start(){started++}}
 Speech.available=async()=> 'downloadable';
 const voice=load({SpeechRecognition:Speech}).create();
 assert.equal((await voice.start()).started,false);assert.equal(started,0);
});
test('on-device recognizer saves only final transcripts',async()=>{
 let instance;const finals=[];
 class Speech{processLocally=false;start(){instance=this}stop(){}}
 Speech.available=async options=>{assert.equal(options.processLocally,true);return 'available'};
 const voice=load({SpeechRecognition:Speech}).create({onFinal:x=>finals.push(x)});
 assert.equal((await voice.start()).started,true);
 assert.equal(instance.processLocally,true);
 instance.onresult({results:[{isFinal:false,0:{transcript:'partial'}}]});
 assert.equal(finals.length,0);
 instance.onresult({results:[{isFinal:true,0:{transcript:'Check tomorrow’s jobs'}}]});
 assert.deepEqual(finals,['Check tomorrow’s jobs']);
 assert.equal(voice.isListening(),false);
});
test('cancelled voice session ignores stale results',async()=>{
 let instance;const finals=[];
 class Speech{processLocally=false;start(){instance=this}stop(){}}
 Speech.available=async()=> 'available';
 const voice=load({SpeechRecognition:Speech}).create({onFinal:x=>finals.push(x)});
 await voice.start();voice.stop();instance.onresult({results:[{isFinal:true,0:{transcript:'stale'}}]});
 assert.deepEqual(finals,[]);
});
