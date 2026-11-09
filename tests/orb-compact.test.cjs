const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const voice=require('../public/voice-command.js');

function fixture(sendConversation){
 const events={};
 const controller=voice.createController({document:{addEventListener:(type,handler)=>(events[type]??=[]).push(handler)},repaint:async()=>{},sendConversation});
 const click=action=>events.click[0]({target:{closest:selector=>selector==='[data-voice-workspace]'?null:{dataset:{voice:action}}},preventDefault(){}});
 const form=text=>events.submit[0]({target:{id:'tfVoiceForm',querySelector:()=>({value:text})},preventDefault(){}});
 return {controller,click,form};
}
test('orb interaction is nonmodal, compact, accessible and preserves same send callback',async()=>{
 const sent=[];const f=fixture(async text=>sent.push(text));f.controller.start();
 const html=f.controller.view();
 assert.match(html,/tf-orb-bubble/);assert.match(html,/aria-live="polite"/);
 assert.doesNotMatch(html,/tf-voice-overlay|aria-modal="true"|What would you like to do/);
 f.form('one message');await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(sent,['one message']);f.controller.close();assert.equal(f.controller.view(),'');
});
test('unsupported recognition retains keyboard fallback and honest capability label',()=>{
 const old=globalThis.SpeechRecognition,webkit=globalThis.webkitSpeechRecognition;
 delete globalThis.SpeechRecognition;delete globalThis.webkitSpeechRecognition;
 try{const f=fixture();f.controller.startListening();assert.match(f.controller.view(),/Speech recognition is unavailable|Speech unavailable/);assert.equal(f.controller.state().listening,false)}
 finally{if(old!==undefined)globalThis.SpeechRecognition=old;if(webkit!==undefined)globalThis.webkitSpeechRecognition=webkit}
});
test('bubble stays adjacent to orb with mobile safe areas, reduced motion and original membrane',()=>{
 const css=fs.readFileSync('public/voice-command.css','utf8');const orb=fs.readFileSync('public/intelligence-orb-idle.css','utf8');
 assert.match(css,/\.tf-orb-bubble\{position:fixed/);assert.match(css,/env\(safe-area-inset-right\)/);assert.match(css,/@media\(max-width:430px\)/);assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/grid-template-columns:max-content minmax\(0,1fr\) max-content/);
 assert.match(css,/#tfVoiceForm \.tf-orb-actions button:last-child/);
 assert.match(orb,/tf-orb-is-active/);assert.match(orb,/\.tf-orb-concept-b-canvas/);
});
test('orb pointer double-event suppression never blocks keyboard activation',()=>{
 const app=fs.readFileSync('public/app.js','utf8');
 assert.match(app,/event\.detail!==0&&Date\.now\(\)<tfAiSkipClickUntil/);
});

test('recognition startup remains pending until browser confirms microphone activity',async()=>{
 const old=globalThis.SpeechRecognition,oldMeter=globalThis.TradeFlowFlowWaveAudio;
 let current,starts=0,aborts=0,meterStarts=0,meterStops=0;
 class DelayedSpeech{
  constructor(){current=this}
  start(){starts++}
  stop(){this.onend?.()}
  abort(){aborts++;this.onend?.()}
 }
 globalThis.SpeechRecognition=DelayedSpeech;
 globalThis.TradeFlowFlowWaveAudio={createMeter:()=>({start:()=>meterStarts++,stop:()=>meterStops++})};
 try{
  const f=fixture();f.controller.startListening();
  assert.equal(starts,1);assert.equal(f.controller.state().microphone,'requesting');
  assert.equal(f.controller.state().listening,false);assert.equal(meterStarts,0);
  assert.match(f.controller.view(),/Requesting microphone…/);
  assert.match(f.controller.view(),/aria-pressed="false" aria-label="Stop microphone"/);
  f.click('mic');
  assert.equal(f.controller.state().microphone,'idle');assert.equal(meterStarts,0);
  current.onstart?.();assert.equal(f.controller.state().listening,false,'late permission approval cannot revive capture');
  f.click('mic');assert.equal(starts,2);current.onstart?.();
  assert.equal(f.controller.state().microphone,'listening');assert.equal(meterStarts,1);
  assert.match(f.controller.view(),/aria-pressed="true" aria-label="Stop microphone"/);
  f.controller.close();assert.equal(f.controller.state().listening,false);
  assert.equal(f.controller.state().microphone,'idle');assert.ok(aborts>=1);assert.ok(meterStops>=1);
 }finally{
  if(old===undefined)delete globalThis.SpeechRecognition;else globalThis.SpeechRecognition=old;
  if(oldMeter===undefined)delete globalThis.TradeFlowFlowWaveAudio;else globalThis.TradeFlowFlowWaveAudio=oldMeter;
 }
});

test('denied microphone after interim transcription cannot submit stale speech or invent listening',async()=>{
 const old=globalThis.SpeechRecognition;
 let current,turns=0;
 globalThis.SpeechRecognition=class{constructor(){current=this}start(){}stop(){this.onend?.()}abort(){this.onend?.()}};
 try{
  const f=fixture(async()=>{turns++});f.controller.startListening();
  current.onresult({results:[[{transcript:'Transfer ten thousand dollars'}]]});
  current.onerror({error:'not-allowed'});
  assert.equal(f.controller.state().listening,false);assert.equal(f.controller.state().microphone,'idle');
  assert.equal(f.controller.state().draft,'');assert.match(f.controller.view(),/Microphone permission denied/);
  f.form('Typed fallback');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(turns,1,'denied speech creates zero turns, explicit typed send creates one');
 }finally{if(old===undefined)delete globalThis.SpeechRecognition;else globalThis.SpeechRecognition=old}
});

test('backgrounding microphone clears listening state and visibly updates status',()=>{
 const old=globalThis.SpeechRecognition;
 let active,aborts=0,repaints=0;
 globalThis.SpeechRecognition=class{constructor(){active=this}start(){this.onstart?.()}stop(){this.onend?.()}abort(){aborts++;this.onend?.()}};
 try{
  const events={},doc={hidden:false,addEventListener:(name,fn)=>events[name]=fn};
  const c=voice.createController({document:doc,repaint:()=>{repaints++}});c.startListening();
  assert.equal(c.state().listening,true);const before=repaints;
  doc.hidden=true;events.visibilitychange();
  assert.equal(c.state().microphone,'idle');assert.equal(c.state().listening,false);
  assert.equal(aborts,1);assert.ok(repaints>before);assert.doesNotMatch(c.view(),/data-voice-state="listening"/);
  active.onstart?.();assert.equal(c.state().listening,false);
 }finally{if(old===undefined)delete globalThis.SpeechRecognition;else globalThis.SpeechRecognition=old}
});
