'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const capture=require('../public/customer-capture.js');
const interpreter=require('../public/record-interpreter.js');

function controller(){
 const handlers={},doc={
  addEventListener:(event,listener)=>{(handlers[event]??=[]).push(listener)},
  querySelector:selector=>selector.includes('listen')?{textContent:'',setAttribute(){}}:null
 };
 let prepared=0;
 const app=capture.createController({
  document:doc,snapshot:async()=>({customers:[]}),context:()=>({businessId:'local-business'}),
  interpreter,commands:{prepare:async()=>{prepared++;return {status:'needs_review',id:'test'}}},
  repaint:async()=>{},show:async()=>{},close:async()=>{},notify:()=>{},hashSource:async()=>'',
  openRecord:async()=>{},prepareLinked:async()=>{},confirm:()=>true
 });
 return {app,handlers,prepared:()=>prepared};
}
test('voice input is opt-in and cannot save without confirmation',async()=>{
 const previous=globalThis.SpeechRecognition;
 let engine=null;
 class Recognition{
  constructor(){engine=this}
  start(){this.started=true}
  stop(){this.stopped=true;this.onend?.()}
  abort(){}
 }
 globalThis.SpeechRecognition=Recognition;
 try{
  const x=controller();await x.app.start();
  assert.match(x.app.view(),/Speak a customer command/);
  const button={dataset:{customerAction:'listen'}};
  const event={target:{closest:()=>button},preventDefault(){}};
  await x.handlers.click[0](event);
  assert.equal(engine.started,true);
  engine.onresult({results:[[{transcript:'Add customer Alex Green, phone 512-555-0198'}]]});
  // Speech stays in listening mode until the user stops or the browser ends recognition.
  await x.handlers.click[0](event);
  assert.equal(engine.stopped,true);
  // Extraction and UI repaint are asynchronous; wait for the review state, not one event-loop tick.
  for(let attempt=0;attempt<25&&!x.app.view().includes('Review customer');attempt++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.match(x.app.view(),/Review customer/);
  assert.match(x.app.view(),/Alex Green/);
  assert.equal(x.prepared(),0);
 }finally{
  if(previous===undefined)delete globalThis.SpeechRecognition;
  else globalThis.SpeechRecognition=previous;
 }
});
test('Siri URL-fragment handoff goes only to local review, never auto execute',()=>{
 const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
 assert.match(app,/tfReceiveSiriCustomer/);
 assert.match(app,/location\.hash/);
 assert.match(app,/history\.replaceState/);
 assert.match(app,/TradeFlowCustomerEntry\.openReview\(instruction,\{source:'transcript'\}\)/);
});
