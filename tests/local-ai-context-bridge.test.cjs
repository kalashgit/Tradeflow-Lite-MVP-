'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {briefFromAuthorizedSource}=require('../src/local-ai-context-bridge.cjs');
const principal={issuer:'https://synthetic.invalid',subject:'owner_01'},businessId='business_001';
const snapshot=()=>({kind:'tradeflow.intelligence.context.v1',businessId,identity:{...principal},scope:{company:true},readOnly:true,executionAuthority:false,permission:{role:'owner'},
 records:[{type:'invoices',id:'synthetic_invoice',revision:2,updatedAt:'2026-11-01T01:00:00Z',provenance:'tenant_record',contentTrust:'untrusted_record_content',record:{status:'overdue',dueDate:'2026-10-17',currency:'USD'}}]});
const db={},args={db,principal,businessId,question:'What should I prioritize?',enabled:true};
const model=async()=>({status:'completed',answer:'Review the overdue invoice.',refs:['invoices:synthetic_invoice@2'],executionAuthority:false});
test('disabled mode does not read business data or invoke AI',async()=>{
 let calls=0;const result=await briefFromAuthorizedSource({...args,enabled:false,contextReader:async()=>{calls++},briefing:async()=>{calls++}});
 assert.equal(result.status,'disabled');assert.equal(calls,0);
});
test('valid source is read before and after response, with no writes',async()=>{
 let reads=0;const result=await briefFromAuthorizedSource({...args,contextReader:async()=>{reads++;return snapshot()},briefing:model});
 assert.equal(result.status,'completed');assert.equal(result.readReverified,true);assert.equal(result.executionAuthority,false);assert.equal(reads,2);
});
test('role revocation after inference discards AI answer',async()=>{
 let reads=0;const result=await briefFromAuthorizedSource({...args,contextReader:async()=>{const s=snapshot();if(++reads===2)s.permission.role='member';return s},briefing:model});
 assert.equal(result.status,'stale_or_revoked');assert.equal(result.answer,null);
});
test('changed evidence revision after inference discards AI answer',async()=>{
 let reads=0;const result=await briefFromAuthorizedSource({...args,contextReader:async()=>{const s=snapshot();if(++reads===2)s.records[0].revision=3;return s},briefing:model});
 assert.equal(result.status,'stale_or_revoked');assert.equal(result.answer,null);
});
test('read failure after inference rejects instead of trusting old context',async()=>{
 let reads=0;const result=await briefFromAuthorizedSource({...args,contextReader:async()=>{if(++reads===2)throw Error('membership revoked');return snapshot()},briefing:model});
 assert.equal(result.status,'stale_or_revoked');
});
test('incomplete AI result never produces a briefing and avoids second source read',async()=>{
 let reads=0;const result=await briefFromAuthorizedSource({...args,contextReader:async()=>{reads++;return snapshot()},briefing:async()=>({status:'incomplete',answer:null,executionAuthority:false})});
 assert.equal(result.status,'incomplete');assert.equal(reads,1);
});
