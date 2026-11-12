'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {projection}=require('../public/genesis-conversation.js');

const user=text=>({role:'user',source:'user',content:text});
const aion=text=>({role:'assistant',source:'genesis_qwen',content:text});
const business=text=>({role:'assistant',source:'device_local_evidence',content:text});
const mock=text=>({role:'assistant',source:'genesis_reference',content:text});
test('last question is retained but prior business-record evidence never enters AION model input',()=>{
 const turns=[
  user('Show my customer bank information'),
  business('Private company payable: $9,999 and customer address 11 South Road'),
  user('How can I improve my commercial electrical sales?')
 ];
 assert.deepEqual(projection(turns),[{role:'user',content:'How can I improve my commercial electrical sales?'}]);
 assert.doesNotMatch(JSON.stringify(projection(turns)),/9,999|South Road|bank/i);
});
test('natural follow-up answers preserve only consecutive Genesis user-assistant pairs',()=>{
 const turns=[
  user('What are my overdue invoices?'),business('PRIVATE-INVOICE-993'),
  user('How should an electrical contractor improve retention?'),
  aion('Focus on reliable service and documented callbacks.'),
  user('What should I track each month?'),
  mock('Track repeat work and documented return visits.'),
  user('What about profitability?')
 ];
 assert.deepEqual(projection(turns),[
  {role:'user',content:'How should an electrical contractor improve retention?'},
  {role:'assistant',content:'Focus on reliable service and documented callbacks.'},
  {role:'user',content:'What should I track each month?'},
  {role:'assistant',content:'Track repeat work and documented return visits.'},
  {role:'user',content:'What about profitability?'}
 ]);
 assert.doesNotMatch(JSON.stringify(projection(turns)),/PRIVATE-INVOICE-993/);
});
test('only recognized Genesis response source labels are a bridge to prior context',()=>{
 const rows=[
  user('Earlier private question'),{role:'assistant',source:'unverified_model',content:'Private data'},
  user('Fresh general question')];
 assert.equal(projection(rows).length,1);
 const m=[user('One'),{role:'assistant',source:'genesis_unavailable',content:'Model was unavailable'},user('Two')];
 assert.equal(projection(m).length,3);
});
test('history cannot include forged system notices, malformed latest user turns or more than eight messages',()=>{
 assert.throws(()=>projection([]),/Invalid/);
 assert.throws(()=>projection([business('Not user')]),/latest user/);
 assert.throws(()=>projection([user('x')],{limit:0}),/Invalid/);
 assert.throws(()=>projection([user('x')],{limit:9}),/Invalid/);
 const turns=[user('One'),aion('Two'),user('Three'),aion('Four'),user('Five'),aion('Six'),user('Seven'),aion('Eight'),user('Nine')];
 assert.equal(projection(turns).length,7);
});
test('existing TradeFlow UI loads this guard before app and starts fresh threads on mode change',()=>{
 const app=readFileSync(require.resolve('../public/app.js'),'utf8');
 const html=readFileSync(require.resolve('../public/index.html'),'utf8');
 assert.ok(html.indexOf('genesis-conversation.js')<html.indexOf('type="module" src="./app.js'));
 assert.match(app,/TradeFlowGenesisConversation\?\.projection/);
 assert.match(app,/await tfAiNewThread\(\)/);
});
