'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {briefAuthorizedContext,makePacket}=require('../src/local-ai-briefing.cjs');
const scope={businessId:'business_001',role:'owner',identity:{issuer:'https://example.test',subject:'owner_01'}};
const context={kind:'tradeflow.intelligence.context.v1',businessId:scope.businessId,identity:scope.identity,scope:{company:true},readOnly:true,executionAuthority:false,permission:{role:'owner'},
 records:[{type:'invoices',id:'inv_01',revision:3,updatedAt:'2026-11-01T00:00:00Z',provenance:'tenant_record',contentTrust:'untrusted_record_content',record:{status:'overdue',dueDate:'2026-10-01',currency:'USD',number:'123',lines:[{qty:2,unitPrice:200}],customerName:'PRIVATE'}}]};
test('disabled by default; no model call',async()=>{let calls=0;const result=await briefAuthorizedContext({context,scope,question:'What now?',fetchImpl:()=>{calls++}});assert.equal(result.status,'disabled');assert.equal(calls,0)});
test('projection drops names and unapproved content',()=>{const payload=makePacket(context,scope);assert.deepEqual(payload.records,[{ref:'invoices:inv_01@3',facts:{status:'overdue',dueDate:'2026-10-01',currency:'USD'}}]);assert.ok(!JSON.stringify(payload).includes('PRIVATE'))});
test('role and tenant mismatches fail closed',()=>{assert.throws(()=>makePacket(context,{...scope,businessId:'other'}));assert.throws(()=>makePacket(context,{...scope,role:'member'}));assert.throws(()=>makePacket({...context,records:[{...context.records[0],type:'jobCosts'}]},{...scope,role:'member'}));assert.throws(()=>makePacket({...context,records:[context.records[0],context.records[0]]},scope))});
test('valid model JSON references only supplied record revision',async()=>{
 const result=await briefAuthorizedContext({context,scope,question:'Prioritize invoices',enabled:true,fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({answer:'Review the overdue invoice; receipt is unverified.',refs:['invoices:inv_01@3']})},finish_reason:'stop'}]})})});
 assert.equal(result.status,'completed');assert.deepEqual(result.refs,['invoices:inv_01@3']);assert.equal(result.executionAuthority,false)
});
test('hallucinated ref, malformed JSON and truncation cannot return a briefing',async()=>{
 for(const [content,finish] of [['{"answer":"Do it","refs":["invoices:fake@1"]}','stop'],['not JSON','stop'],['{"answer":"partial"}','length']]){
  const result=await briefAuthorizedContext({context,scope,question:'Prioritize invoices',enabled:true,fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content},finish_reason:finish}]})})});
  assert.notEqual(result.status,'completed');assert.equal(result.answer,null);
 }
});
