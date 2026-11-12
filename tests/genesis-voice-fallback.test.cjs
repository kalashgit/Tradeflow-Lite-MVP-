'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');

function loadFallback(){
 const calls=[],events={};
 const synthesizer={
  speak(utterance){calls.push({event:'speak',utterance});},
  cancel(){calls.push({event:'cancel'});},
  getVoices(){return [{name:'Device English',lang:'en-US',localService:true}]}
 };
 class Utterance{
  constructor(text){this.text=text;this.lang='';this.rate=1;this.pitch=1;}
 }
 const window={
  speechSynthesis:synthesizer,SpeechSynthesisUtterance:Utterance,
  addEventListener(type,callback){events[type]=callback;}
 };
 const document={hidden:false,addEventListener(type,callback){events[type]=callback;}};
 vm.runInNewContext(readFileSync(require.resolve('../public/ai-speech.js'),'utf8'),
  {window,document,fetch:async()=>new Response('Aura unavailable',{status:503}),
   Audio:class{},AbortController,URL:{createObjectURL(){return 'blob:'},revokeObjectURL(){}},
   MutationObserver:class{}});
 return {speech:window.TradeFlowSpeech,document,events,calls};
}

test('AION spoken replies fall back to device speech only when requested',async()=>{
 const {speech,calls}=loadFallback();
 assert.equal(speech.auto,false);
 assert.equal(calls.length,0);
 assert.equal(await speech.speak('This is a natural spoken answer.','synthetic-code'),true);
 assert.equal(speech.state,'loading','queued device audio must not be treated as audible speech');
 const utterance=calls.find(e=>e.event==='speak').utterance;
 utterance.onstart();
 assert.equal(speech.state,'speaking');
 assert.equal(utterance.text,'This is a natural spoken answer.');
 assert.equal(utterance.lang,'en-US');
 assert.equal(utterance.rate,0.96);
 assert.equal(utterance.voice.name,'Device English');
 speech.stop();
 assert.equal(speech.state,'idle');
 assert.ok(calls.some(e=>e.event==='cancel'));
});

test('pagehide and visibilitychange stop the native iPhone speech fallback',async()=>{
 const ctx=loadFallback();
 await ctx.speech.speak('Testing speech.','code');
 ctx.document.hidden=true;ctx.events.visibilitychange();
 assert.equal(ctx.speech.state,'idle');
 const n=ctx.calls.filter(e=>e.event==='speak').length;
 assert.equal(n,1);
 const prior=ctx.calls.find(e=>e.event==='speak').utterance;
 await ctx.speech.speak('Another reply.','code');
 assert.equal(ctx.speech.state,'loading');
 prior.onstart(); // late audio callback from canceled previous generation
 assert.equal(ctx.speech.state,'loading');
 ctx.events.pagehide();
 assert.equal(ctx.speech.state,'idle');
});
test('no preview session code means no automatic audio',async()=>{
 const {speech,calls}=loadFallback();
 assert.equal(await speech.speak('Should not speak',''),false);
 assert.equal(calls.filter(e=>e.event==='speak').length,0);
});
