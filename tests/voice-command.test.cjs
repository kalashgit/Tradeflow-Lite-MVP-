'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const voice=require('../public/voice-command.js');
test('routes conversational commands to distinct local intents',()=>{
 assert.equal(voice.intent('Hey TradeFlow, make a new customer John Smith, phone 512-555-0198').kind,'customer');
 assert.equal(voice.intent('Hey TradeFlow, what jobs do I have tomorrow?').kind,'tomorrow');
 assert.deepEqual(voice.intent('Hey TradeFlow, prepare a quotation for John Smith'),{kind:'quote',person:'John Smith'});
 assert.equal(voice.intent('Hey TradeFlow, pay all invoices').kind,'unknown');
});
test('calculates tomorrow in local time across year boundary',()=>{
 assert.equal(voice.tomorrowDate(new Date(2026,11,31)),'2027-01-01');
});
test('assistant answers job question without preparing a write',async()=>{
 const handlers={};let writes=0;
 const controller=voice.createController({document:{addEventListener:(k,f)=>(handlers[k]??=[]).push(f)},repaint:async()=>{},
  snapshot:async()=>({jobs:[{id:'job1',title:'Panel upgrade',date:'2026-10-19',customerId:'c1'}],customers:[{id:'c1',name:'John'}]}),
  now:()=>new Date(2026,9,18),commands:{prepare:async()=>{writes++}},customer:{openReview:async()=>{writes++}}});
 controller.start();await controller.submit('Hey TradeFlow, what jobs do I have tomorrow?');
 assert.match(controller.view(),/Panel upgrade/);assert.equal(writes,0);
});
test('customer intent opens review without writing',async()=>{
 let review='',writes=0;
 const controller=voice.createController({document:{addEventListener:()=>{}},repaint:async()=>{},snapshot:async()=>({}),
  now:()=>new Date(),commands:{prepare:async()=>{writes++}},
  customer:{openReview:async text=>{review=text}}});
 controller.start();await controller.submit('Hey TradeFlow, add a new customer John Smith phone 512-555-0198');
 assert.match(review,/customer John Smith/);assert.equal(writes,0);
});
test('quote intent requires exact customer and only opens an unsaved draft',async()=>{
 let prepared,executed=0;
 const controller=voice.createController({document:{addEventListener:()=>{}},repaint:async()=>{},
  snapshot:async()=>({customers:[{id:'c1',name:'John Smith'}]}),now:()=>new Date(),
  customer:{openReview:async()=>{}},commands:{
   prepare:async cmd=>{prepared=cmd;return {status:'ready',id:'draft1'}},
   execute:async()=>{executed++;return {status:'succeeded'}}
  }});
 controller.start();await controller.submit('Hey TradeFlow, prepare a quotation for John Smith');
 assert.deepEqual(prepared.params,{kind:'quote',ref:{store:'customers',id:'c1'}});
 assert.equal(executed,1);
});
