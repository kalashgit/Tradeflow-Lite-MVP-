#!/usr/bin/env node
// Development-only end-to-end test of the ACTUAL H04-01 readIntelligenceContext.
// Synthetic signed-in principal and mock read-only D1 adapter; no customer data.
// Real Qwen inference is opt-in and loopback only.
'use strict';
const {briefFromAuthorizedSource}=require('../src/local-ai-context-bridge.cjs');
const principal={issuer:'https://synthetic.example',subject:'synthetic_owner'};
const businessId='synthetic_business_01';
const records=[
 {record_type:'invoices',id:'synthetic_invoice_01',revision:1,updated_at:'2026-11-01T00:00:00Z',payload:JSON.stringify({id:'synthetic_invoice_01',businessId,status:'overdue',dueDate:'2026-10-17',currency:'USD',number:'SYN-1'})},
 {record_type:'jobs',id:'synthetic_job_01',revision:1,updated_at:'2026-11-01T00:00:00Z',payload:JSON.stringify({id:'synthetic_job_01',businessId,status:'in_progress'})}
];
let queries=0,writes=0;
const db={
 prepare(sql){
  if(!/^\s*SELECT\b/i.test(sql)){writes++;throw Error('No writes allowed in synthetic DB');}
  return {bind(...args){
   if(sql.includes('FROM tenant_records')){
    return {all:async()=>{
     queries++;
     if(args[0]!==businessId||args[1]!==businessId||args[2]!==principal.issuer||args[3]!==principal.subject||args[4]!=='owner')return {results:[]};
     return {results:records.filter(r=>args.slice(5).includes(r.record_type))};
    }};
   }
   return {first:async()=>({role:'owner'})};
  }};
 }
};
async function main(){
 const {readIntelligenceContext}=await import('../src/intelligence-context.js');
 const question='What should I review first to protect profitability and cash flow?';
 const result=await briefFromAuthorizedSource({db,principal,businessId,question,enabled:true,contextReader:readIntelligenceContext,timeoutMs:180000});
 if(result.status!=='completed'||!result.readReverified||result.executionAuthority!==false||!result.refs?.length||writes!==0||queries<2)throw Error('End-to-end source briefing failed: '+JSON.stringify({status:result.status,queries,writes}));
 console.log('TradeFlow development Qwen briefing PASS');
 console.log('Source: actual H04-01 readIntelligenceContext (synthetic D1, synthetic principal)');
 console.log('Read queries:',queries,'writes:',writes,'refs:',result.refs.join(', '));
 console.log('Model answer (UNTRUSTED; NOT a business action):',result.answer);
}
main().catch(e=>{console.error('Development briefing failed:',e.message);process.exitCode=1});
