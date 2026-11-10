'use strict';
const {normalizeRule,consistentCandidates}=require('./world.cjs');
const DEFAULT_BASE='http://127.0.0.1:8088';
const HOSTS=new Set(['localhost','127.0.0.1','[::1]']);
function localEndpoint(base=DEFAULT_BASE,route='/v1/chat/completions'){
 const url=new URL(base);
 if(url.protocol!=='http:'||!HOSTS.has(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/' )throw Error('AION requires an HTTP loopback-only llama.cpp base URL');
 return new URL(route,url).toString();
}
function oracleProvider(){return {kind:'oracle-simulator',async infer({observations}){
  const surviving=consistentCandidates(observations);
  if(!surviving.length)throw Error('Oracle: inconsistent observations');
  return {rule:normalizeRule(surviving[0]),rationale:'Deterministic candidate elimination (not AI inference)'};
 }};}
function qwenProvider({baseUrl=process.env.AION_MODEL_URL||DEFAULT_BASE,model=process.env.AION_MODEL_ID||undefined,fetchImpl=globalThis.fetch,timeoutMs=90000}={}){
 const endpoint=localEndpoint(baseUrl);
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>180000)throw Error('Invalid timeout');
 async function health(){
  try{const response=await fetchImpl(localEndpoint(baseUrl,'/health'),{signal:AbortSignal.timeout(3000)});return {ready:response.ok,status:response.status};}
  catch{return {ready:false,status:null};}
 }
 async function request(messages,maxTokens=256){
  const request={messages,temperature:0,max_tokens:maxTokens,stream:false,chat_template_kwargs:{enable_thinking:false}};
  if(model)request.model=model;
  const res=await fetchImpl(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(timeoutMs)});
  if(!res.ok)throw Error('Qwen inference HTTP '+res.status);
  const payload=await res.json();
  const choice=payload?.choices?.[0];
  if(choice?.finish_reason!=='stop'||typeof choice.message?.content!=='string'||!choice.message.content.trim())throw Error('Qwen returned an incomplete/empty response');
  return choice.message.content.trim();
 }
 async function probe(){
  const check=await health();
  if(!check.ready)throw Error('Local llama.cpp not ready (HTTP '+(check.status||'unreachable')+')');
  const answer=await request([{role:'system',content:'Return only JSON, with no markdown: {"pong":true}.'},{role:'user',content:'Ping'}],64);
  let parsed;try{parsed=JSON.parse(answer)}catch{throw Error('Qwen probe returned non-JSON output')}
  if(parsed.pong!==true)throw Error('Qwen probe produced an invalid answer');
  return {kind:'live-qwen',ready:true,validatedCompletion:true};
 }
 async function infer({observations,previousRule}){
  const system='You are discovering an unknown Boolean mechanism with exactly 3 binary switches A,B,C. The output is 0 or 1. Its true rule uses EXACTLY TWO DISTINCT switches and one operator: and, or, xor. Choose a rule consistent with EVERY observation. If evidence cannot distinguish rules, propose the most plausible rule but state uncertainty. Previous hypothesis may be wrong. Output EXACT JSON: {"op":"and|or|xor","inputs":["A","B"],"rationale":"brief evidence-based explanation"}. Do not add markdown.';
  const prompt={observations,previousHypothesis:previousRule||null};
  const answer=await request([{role:'system',content:system},{role:'user',content:JSON.stringify(prompt)}],256);
  let parsed;try{parsed=JSON.parse(answer)}catch{throw Error('Qwen hypothesis was not valid JSON')}
  const rule=normalizeRule(parsed);
  return {rule,rationale:typeof parsed.rationale==='string'?parsed.rationale.slice(0,400):''};
 }
 return {kind:'live-qwen',health,probe,infer};
}
module.exports={localEndpoint,oracleProvider,qwenProvider};
