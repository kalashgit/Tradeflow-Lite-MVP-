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
  customer:{interpret:async()=>({intent:'customer.create',status:'needs_clarification',draft:{fields:{name:'John Smith',phone:'512678'}},issues:[{code:'INVALID_PHONE'}],duplicates:[],relatedDrafts:[]}),openReview:async text=>{review=text}}});
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

test('Stop finalizes speech even when recognizer sends onend without final onresult',async()=>{
 const previous=globalThis.SpeechRecognition;
 let recognizer,received='';
 class FakeSpeech{constructor(){recognizer=this}start(){}stop(){this.onend?.()}abort(){}}
 globalThis.SpeechRecognition=FakeSpeech;
 try{
  const events={};
  const controller=voice.createController({document:{addEventListener:(type,fn)=>(events[type]??=[]).push(fn)},repaint:async()=>{},
   snapshot:async()=>({}),now:()=>new Date(),commands:{},
   customer:{interpret:async()=>({intent:'customer.create',status:'needs_clarification',draft:{fields:{name:'Maria Black',phone:'512678'}},issues:[{code:'INVALID_PHONE'}],duplicates:[],relatedDrafts:[]}),openReview:async text=>{received=text}}});
  controller.start();
  const click=async action=>events.click[0]({target:{closest:()=>({dataset:{voice:action}})},preventDefault(){}});
  await click('mic');
  recognizer.onresult({results:[[{transcript:'Hey TradeFlow, add customer Maria Black, phone 512-555-0198'}]]});
  await click('mic');
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(received,/Maria Black/);
 }finally{
  if(previous===undefined)delete globalThis.SpeechRecognition;else globalThis.SpeechRecognition=previous;
 }
});

test("tomorrow’s schedule includes calendar appointments and jobs without double counting linked jobs",()=>{
 const d={jobs:[{id:'j1',title:'Electrical inspection',date:'2026-10-19',status:'Planned'},{id:'j2',title:'Service call',date:'2026-10-19',status:'Planned'}],
 calendarEntries:[{id:'e1',sourceKind:'job',sourceId:'j1',title:'Inspection scheduled',date:'2026-10-19',time:'09:00',status:'Scheduled'},{id:'e2',title:'Site walkthrough',date:'2026-10-19',time:'15:00',status:'Scheduled'}]};
 const records=[...d.jobs.map(j=>({...j,kind:'job'})),...d.calendarEntries.map(e=>({...e,kind:'event'}))];
 const items=voice.tomorrowWork(d,'2026-10-19',()=>records);
 assert.equal(items.length,3);assert.ok(items.some(x=>x.title==='Inspection scheduled'));
 assert.ok(!items.some(x=>x.title==='Electrical inspection'));assert.ok(items.some(x=>x.title==='Service call'));
});
test('open tomorrow calendar command navigates to day view without modifying records',async()=>{
 let date='',writes=0;
 const controller=voice.createController({document:{addEventListener:()=>{}},repaint:async()=>{},snapshot:async()=>({jobs:[],customers:[],calendarEntries:[]}),
 now:()=>new Date(2026,9,18),calendarRecords:()=>[],openCalendar:async target=>{date=target},
 commands:{prepare:async()=>{writes++}},customer:{openReview:async()=>{writes++}}});
 controller.start();await controller.submit('Show tomorrow calendar');
 assert.equal(date,'2026-10-19');assert.equal(writes,0);
});

test('detects business intent despite filler words and a speech typo',()=>{
 assert.equal(voice.intent('Hey, what jibs do I have tomorrow').kind,'tomorrow');
 assert.equal(voice.intent('Could you list my appointments tmrw').kind,'tomorrow');
 assert.equal(voice.intent('Please make me a new client his name is John').kind,'customer');
 assert.deepEqual(voice.intent('Need an estimate for John Smith'),{kind:'quote',person:'John Smith'});
 assert.equal(voice.intent('what was the number 512678').kind,'unknown');
});
test('direct customer creation requires complete, unambiguous details and uses approved audited command',async()=>{
 const calls=[];const review={intent:'customer.create',status:'needs_review',draft:{fields:{name:'John Smith',phone:'+15125550198'}},issues:[],duplicates:[],relatedDrafts:[]};
 const controller=voice.createController({document:{addEventListener:()=>{}},repaint:async()=>{},snapshot:async()=>({}),now:()=>new Date(),
  customer:{interpret:async()=>review,prepareCustomer:async()=>{calls.push('prepare');return {id:'id1',status:'needs_review'}},openReview:async()=>{throw Error('Should not open form')}},
  commands:{approve:async id=>{calls.push('approve:'+id);return {status:'approved'}},execute:async id=>{calls.push('execute:'+id);return {status:'succeeded',result:{id:'c1'}}}}});
 controller.start();await controller.submit('Hey TradeFlow, create a customer his name is John Smith and his number is 512-555-0198');
 assert.deepEqual(calls,['prepare','approve:id1','execute:id1']);
 assert.match(controller.view(),/Customer added: John Smith/);
});
test('incomplete phone or duplicate never triggers automatic write',async()=>{
 const calls=[];const review={intent:'customer.create',status:'needs_clarification',draft:{fields:{name:'John Smith',phone:'512678'}},issues:[{code:'INVALID_PHONE',blocking:true}],duplicates:[],relatedDrafts:[]};
 const controller=voice.createController({document:{addEventListener:()=>{}},repaint:async()=>{},snapshot:async()=>({}),now:()=>new Date(),
  customer:{interpret:async()=>review,openReview:async()=>{calls.push('review')},prepareCustomer:async()=>{calls.push('prepare')}},
  commands:{approve:async()=>{calls.push('approve')},execute:async()=>{calls.push('execute')}}});
 controller.start();await controller.submit('Create customer John Smith number 512678');
 assert.deepEqual(calls,['review']);
});
test('possible duplicate requires review, even if fields are otherwise valid',async()=>{
 const calls=[];const review={intent:'customer.create',status:'needs_review',draft:{fields:{name:'John Smith',phone:'+15125550198'}},issues:[{code:'POSSIBLE_DUPLICATE'}],duplicates:[{ref:{id:'c1'}}],relatedDrafts:[]};
 const controller=voice.createController({document:{addEventListener:()=>{}},repaint:async()=>{},snapshot:async()=>({}),now:()=>new Date(),
  customer:{interpret:async()=>review,openReview:async()=>{calls.push('review')},prepareCustomer:async()=>{calls.push('prepare')}},
  commands:{approve:async()=>{calls.push('approve')},execute:async()=>{calls.push('execute')}}});
 controller.start();await controller.submit('Create customer John Smith number 512-555-0198');
 assert.deepEqual(calls,['review']);
});
