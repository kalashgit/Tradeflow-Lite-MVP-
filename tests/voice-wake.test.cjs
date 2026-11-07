'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createController,wakePhrase}=require('../public/voice-command.js');

test('wake phrase matches TradeFlow only, not ordinary speech',()=>{
 assert.equal(wakePhrase('Hey TradeFlow'),true);
 assert.equal(wakePhrase('Okay, trade flow'),true);
 assert.equal(wakePhrase('What is my trade workflow?'),false);
});
test('orb start presents greeting and invokes speech exactly once',()=>{
 let greeting='',count=0;
 const controller=createController({document:{addEventListener(){}},repaint(){},greet:text=>{greeting=text;count++}});
 controller.start();
 assert.equal(greeting,'Hello, what do you need?');
 assert.equal(count,1);
 assert.match(controller.view(),/Hello, what do you need/);
});
test('wake listening is opt-in, only opens the assistant and never executes recognized commands',()=>{
 const old=globalThis.SpeechRecognition;let recognizer,commands=0,greetings=0;
 class Recognition{constructor(){recognizer=this}start(){this.started=true}abort(){this.aborted=true}}
 globalThis.SpeechRecognition=Recognition;
 try{
  const controller=createController({document:{addEventListener(){}},repaint(){},greet(){greetings++},commands:{execute(){commands++}}});
  assert.equal(recognizer,undefined);
  assert.equal(controller.enableWake(),true);assert.equal(recognizer.started,true);
  recognizer.onresult({results:[{isFinal:true,0:{transcript:'Hey TradeFlow, add a customer'}}]});
  assert.equal(recognizer.aborted,true);
  assert.equal(controller.isWakeActive(),false);
  assert.match(controller.view(),/add a customer/);
  assert.equal(greetings,1);assert.equal(commands,0);
 }finally{if(old===undefined)delete globalThis.SpeechRecognition;else globalThis.SpeechRecognition=old}
});
test('page visibility loss stops the wake microphone',()=>{
 const old=globalThis.SpeechRecognition;let recognizer,hidden=false,visibility;
 class Recognition{constructor(){recognizer=this}start(){}abort(){this.aborted=true}}
 globalThis.SpeechRecognition=Recognition;
 try{
  const controller=createController({document:{get hidden(){return hidden},addEventListener(name,fn){if(name==='visibilitychange')visibility=fn}},repaint(){}});
  controller.enableWake();hidden=true;visibility();
  assert.equal(recognizer.aborted,true);assert.equal(controller.isWakeActive(),false);
 }finally{if(old===undefined)delete globalThis.SpeechRecognition;else globalThis.SpeechRecognition=old}
});
