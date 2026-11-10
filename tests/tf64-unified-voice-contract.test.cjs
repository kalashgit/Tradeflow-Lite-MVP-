const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const voice=require('../public/voice-command.js');

function harness(sendConversation){
 const handlers={};
 const doc={addEventListener:(type,handler)=>(handlers[type]??=[]).push(handler),querySelector:()=>({focus(){}})};
 const controller=voice.createController({document:doc,repaint:async()=>{},sendConversation});
 const submit=text=>handlers.submit[0]({target:{id:'tfVoiceForm',querySelector:()=>({value:text})},preventDefault(){}});
 const click=value=>handlers.click[0]({target:{closest:selector=>selector==='[data-voice-workspace]'?null:{dataset:{voice:value}}},preventDefault(){}});
 return {controller,submit,click,handlers};
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,20));

test('compact bubble has same 6000-character bound as actual Worker; no silent clipping',async()=>{
 const seen=[];const f=harness(async (...args)=>{seen.push(args);return true});f.controller.start();
 assert.match(f.controller.view(),/maxlength="6000"/);
 f.submit('a'.repeat(6000));await flush();
 assert.equal(seen.length,1);assert.equal(seen[0][0].length,6000);
 f.submit('b'.repeat(6001));await flush();
 assert.equal(seen.length,1);assert.match(f.controller.state().message,/6,000 characters/);
 const worker=fs.readFileSync('src/index.js','utf8');
 assert.match(worker,/6000/);
});

test('final recognized speech is sent once with voice modality and explicit submit',async()=>{
 const old=globalThis.SpeechRecognition;
 const seen=[];let recognizer;
 globalThis.SpeechRecognition=class {
  constructor(){recognizer=this}
  start(){}
  stop(){this.onend?.()}
  abort(){}
 };
 try{
  const f=harness(async (...args)=>{seen.push(args);return true});f.controller.start();f.click('mic');
  recognizer.onresult({results:[{0:{transcript:'What is our cash exposure?'}}]});
  f.click('mic');await flush();
  assert.equal(seen.length,0,'transcription alone must not submit a turn');
  assert.equal(f.controller.state().draftModality,'voice');
  f.submit('What is our cash exposure?');await flush();
  assert.equal(seen.length,1);assert.deepEqual(seen[0][1],{modality:'voice'});
  f.submit('Typed follow up');await flush();
  assert.equal(seen.length,2);assert.deepEqual(seen[1][1],{modality:'text'});
 }finally{if(old===undefined)delete globalThis.SpeechRecognition;else globalThis.SpeechRecognition=old}
});

test('failed conversation remains draft and never claims a successful send',async()=>{
 const f=harness(async()=>false);f.controller.start();f.submit('Keep this unsent');await flush();
 assert.equal(f.controller.state().draft,'');
 assert.match(f.controller.state().message,/not sent/);
});

test('adapter routes to existing scoped AI thread, not a second assistant or executor',()=>{
 const app=fs.readFileSync('public/app.js','utf8');
 assert.match(app,/sendConversation:async \(instruction,\{modality='text'\}/);
 assert.match(app,/tfAISend\(instruction,\{modality,speakReply:modality==='voice'\}\)/);
 assert.match(app,/tfActiveChatThreadId===beforeThread/);
 assert.match(app,/TradeFlowVoice\.startListening\(\)/);
 assert.doesNotMatch(app,/<<<<<<<|>>>>>>>/);
});
