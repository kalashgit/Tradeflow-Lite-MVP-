// Optional local Qwen GENERAL-ADVICE pathway. Uses no tenant, customer or synthetic business records.
// Never emits command intents. Response is untrusted general information, not an evidence-backed business conclusion.
'use strict';
const {completeLocal}=require('./local-ai-provider.cjs');
async function adviseGenerally({question,enabled=false,fetchImpl,timeoutMs=45000,baseUrl}={}){
 if(!enabled)return {status:'disabled',answer:null,executionAuthority:false};
 if(typeof question!=='string'||question.trim().length<3||question.length>500)throw Error('Invalid question');
 const system='You are TradeFlow, a general business strategy adviser to small US electrical contractors. This is GENERAL ADVICE, not an analysis of any actual company records. Answer the precise question directly with up to 4 concise, practical recommendations. For ideal-customer profiling, explain contribution margin after direct labor/materials, acquisition cost, quote win rate, payment reliability, repeat business, and capacity. Do NOT invent actual business metrics or claim to have accessed customer data. Do NOT imply any operations were performed. Return only a plain-language answer under 160 words.';
 const result=await completeLocal({enabled:true,messages:[{role:'system',content:system},{role:'user',content:question.trim()}],maxTokens:500,timeoutMs,...(fetchImpl?{fetchImpl}:{}),...(baseUrl?{baseUrl}:{})});
 if(result.status!=='completed')return {...result,answer:null,executionAuthority:false};
 return {status:'completed',answer:result.answer.slice(0,2000),refs:[],source:'general_advice',executionAuthority:false,untrusted:true,recordCount:0};
}
module.exports={adviseGenerally};
