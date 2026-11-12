// Development-only local inference adapter. No business data or network egress by default.
// Future business-context integration MUST obtain permission-filtered evidence from H04-01 first.
'use strict';
const DEFAULT_URL='http://127.0.0.1:8088';
const LOOPBACK=new Set(['127.0.0.1','localhost','[::1]']);
function endpointFor(base=DEFAULT_URL){
  const url=new URL('/v1/chat/completions',base);
  if(url.protocol!=='http:' || !LOOPBACK.has(url.hostname) || url.username || url.password || url.search || url.hash) throw Error('Local AI endpoint must be HTTP loopback');
  return url.toString();
}
function asMessages(messages){
  if(!Array.isArray(messages)||!messages.length||messages.length>12)throw Error('Invalid local AI messages');
  return messages.map(m=>{
    if(!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length<1||m.content.length>12000)throw Error('Invalid local AI message');
    return {role:m.role,content:m.content};
  });
}
async function completeLocal({messages,enabled=false,baseUrl=DEFAULT_URL,timeoutMs=60000,maxTokens=320,temperature=0.1,modelId=null,fetchImpl=globalThis.fetch}={}){
  if(!enabled)return {status:'disabled',answer:null,executionAuthority:false};
  const url=endpointFor(baseUrl),safeMessages=asMessages(messages);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>180000)throw Error('Invalid timeout');
  if(!Number.isSafeInteger(maxTokens)||maxTokens<16||maxTokens>2048)throw Error('Invalid token budget');
  if(typeof temperature!=='number'||!Number.isFinite(temperature)||temperature<0||temperature>0.8)throw Error('Invalid local-model temperature');
  if(modelId!==null&&(typeof modelId!=='string'||!/^qwen3:(?:0[.]6b|1[.]7b)$/.test(modelId)))throw Error('Unapproved research-only Qwen model ID');
  let response;
  try {
    response=await fetchImpl(url,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({...(modelId?{model:modelId}:{}),messages:safeMessages,chat_template_kwargs:{enable_thinking:false},temperature,max_tokens:maxTokens,stream:false}),
      signal:AbortSignal.timeout(timeoutMs)
    });
  } catch(error){
    return {status:'unavailable',answer:null,reason:error?.name==='TimeoutError'?'timeout':'transport_error',executionAuthority:false};
  }
  if(!response.ok)return {status:'unavailable',answer:null,reason:'http_'+response.status,executionAuthority:false};
  let output;
  try{output=await response.json()}catch{return {status:'invalid_response',answer:null,executionAuthority:false}}
  const choice=output?.choices?.[0],answer=choice?.message?.content;
  if(typeof answer!=='string'||!answer.trim()||answer.length>20000)return {status:'invalid_response',answer:null,reason:'empty_or_invalid_content',executionAuthority:false};
  if(choice.finish_reason!=='stop')return {status:'incomplete',answer:null,reason:choice.finish_reason||'missing_finish_reason',executionAuthority:false};
  // Content is explicitly UNTRUSTED and must never be used as an executable command or financial fact.
  return {status:'completed',answer:answer.trim(),executionAuthority:false,untrusted:true,finishReason:'stop'};
}
module.exports={completeLocal,endpointFor};
