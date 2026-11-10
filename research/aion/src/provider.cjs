'use strict';
const {normalizeRule,consistentCandidates,prediction}=require('./world.cjs');
const {candidatesFor,evaluateRule}=require('./research-gates.cjs');
const DEFAULT_BASE='http://127.0.0.1:8088';
const HOSTS=new Set(['localhost','127.0.0.1','[::1]']);
const RUNTIMES=new Set(['llama.cpp','ollama']);
class ModelOutputError extends Error{constructor(reason){super('Qwen incomplete model output: '+reason);this.name='ModelOutputError';this.reason=reason;}}
function localEndpoint(base=DEFAULT_BASE,route='/v1/chat/completions'){
 const url=new URL(base);
 if(url.protocol!=='http:'||!HOSTS.has(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('AION requires an HTTP loopback-only model base URL');
 return new URL(route,url).toString();
}
function oracleProvider(){return {kind:'oracle-simulator',async infer({observations}){
 const surviving=consistentCandidates(observations);
 if(!surviving.length)throw Error('Oracle: inconsistent observations');
 return {rule:normalizeRule(surviving[0]),rationale:'Deterministic candidate elimination (not AI inference)'};
}};}
function qwenProvider({baseUrl=process.env.AION_MODEL_URL||DEFAULT_BASE,model=process.env.AION_MODEL_ID||undefined,runtime=process.env.AION_MODEL_RUNTIME||'llama.cpp',fetchImpl=globalThis.fetch,timeoutMs=90000,repair=process.env.AION_REPAIR_MODE==='feedback',formatMode=process.env.AION_FORMAT_MODE||'json'}={}){
 if(!RUNTIMES.has(runtime))throw Error('Unsupported model runtime: '+runtime);
 if(!['json','schema'].includes(formatMode))throw Error('Invalid format mode');
 if(runtime==='ollama'&&(!model||typeof model!=='string'))throw Error('Ollama requires AION_MODEL_ID');
 const endpoint=localEndpoint(baseUrl,runtime==='ollama'?'/api/chat':'/v1/chat/completions');
 const healthEndpoint=localEndpoint(baseUrl,runtime==='ollama'?'/api/version':'/health');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>180000)throw Error('Invalid timeout');
 async function health(){
  try{
   const response=await fetchImpl(healthEndpoint,{signal:AbortSignal.timeout(3000)});
   return {ready:response.ok,status:response.status,runtime};
  }catch{return {ready:false,status:null,runtime};}
 }
 function ruleSchema(variables){return {type:'object',properties:{op:{type:'string',enum:['and','or','xor']},inputs:{type:'array',items:{type:'string',enum:[...variables]},minItems:2,maxItems:2,uniqueItems:true},rationale:{type:'string'}},required:['op','inputs'],additionalProperties:false};}
 async function request(messages,maxTokens=256,responseSchema=null){
  const payload=runtime==='ollama'
   ? {model,messages,stream:false,think:false,format:formatMode==='schema'&&responseSchema?responseSchema:'json',options:{temperature:0,num_predict:maxTokens}}
   : {messages,temperature:0,max_tokens:maxTokens,stream:false,chat_template_kwargs:{enable_thinking:false},...(model?{model}:{})};
  const res=await fetchImpl(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(timeoutMs)});
  if(!res.ok)throw Error('Qwen '+runtime+' inference HTTP '+res.status);
  const output=await res.json();
  let answer;
  if(runtime==='ollama'){
   if(output?.done!==true||(output.done_reason&&output.done_reason!=='stop'))throw new ModelOutputError('ollama_finish_'+String(output?.done_reason||'not_done').slice(0,32));
   answer=output?.message?.content;
  }else{
   const choice=output?.choices?.[0];
   if(choice?.finish_reason!=='stop')throw new ModelOutputError('llama_finish_'+String(choice?.finish_reason||'missing').slice(0,32));
   answer=choice?.message?.content;
  }
  if(typeof answer!=='string'||!answer.trim()||answer.length>20000)throw new ModelOutputError('empty_or_oversized_content');
  return answer.trim();
 }
 async function probe(){
  const check=await health();
  if(!check.ready)throw Error('Local '+runtime+' server not ready (HTTP '+(check.status||'unreachable')+')');
  const answer=await request([{role:'system',content:'Return only JSON, with no markdown: {"pong":true}.'},{role:'user',content:'Ping'}],64);
  let parsed;try{parsed=JSON.parse(answer)}catch{throw Error('Qwen probe returned non-JSON output')}
  if(parsed.pong!==true)throw Error('Qwen probe produced an invalid answer');
  return {kind:'live-qwen',runtime,ready:true,validatedCompletion:true};
 }
 async function infer({observations,previousRule,allowedSwitches=['A','B','C']}){
  const variables=[...allowedSwitches];
  const grammar=candidatesFor(variables);
  const system='You are discovering an unknown Boolean mechanism with '+variables.length+' binary switches: '+variables.join(', ')+'. The output is 0 or 1. The rule uses EXACTLY TWO DISTINCT switches and one operator from AND, OR, XOR. Evaluate EVERY observation carefully. An earlier hypothesis may be wrong. Return a single JSON object with keys op (and/or/xor), inputs (array of exactly two different switches from the allowed names), rationale (brief explanation). Do not assume the first pair is correct. No markdown.';
  const prompt={observations,previousHypothesis:previousRule||null};
  const maxAttempts=repair?3:1;
  let rejected=null;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   const requestPrompt=rejected?{...prompt,verificationFeedback:rejected,instruction:'The previous proposal failed validation. Repair the specific errors using ONLY the observed experiments. Use an allowed operator and two distinct valid switches, and ensure your output matches the JSON rule format.'}:prompt;
   let answer,parsed,rule,invalidOutputKind;
   try{answer=await request([{role:'system',content:system},{role:'user',content:JSON.stringify(requestPrompt)}],384,ruleSchema(variables));}
   catch(error){if(error instanceof ModelOutputError)invalidOutputKind='incomplete_response';else throw error;}
   if(!invalidOutputKind){try{parsed=JSON.parse(answer)}catch{invalidOutputKind='invalid_json';}}
   if(!invalidOutputKind){
    try{
     if(variables.length===3&&variables.join(',')==='A,B,C')rule=normalizeRule(parsed);
     else {
      const ids=Array.isArray(parsed?.inputs)?[...parsed.inputs].sort().join(','):'';
      const match=grammar.find(candidate=>candidate.op===parsed?.op&&candidate.inputs.join(',')===ids);
      if(!match)throw Error('Unsupported rule');
      rule={op:match.op,inputs:[...match.inputs]};
     }
    }catch{invalidOutputKind='invalid_rule';}
   }
   if(invalidOutputKind){
    // Bad hypotheses are measured as errors, NEVER replaced by a secretly computed oracle rule.
    if(attempt===maxAttempts)return {rule:null,rationale:'',modelCalls:attempt,repairAttempts:attempt-1,invalidOutputKind,unresolvedContradictions:null};
    rejected={validationError:invalidOutputKind,requiredRule:{op:'and | or | xor',inputs:'two different switches chosen from '+variables.join(', ')}};
    continue;
   }
   const contradictions=observations.filter(o=>evaluateRule(rule,o.state,variables)!==o.result)
    .map(o=>({state:o.state,observed:o.result,predictedByRejectedRule:evaluateRule(rule,o.state,variables)}));
   if(!repair||contradictions.length===0||attempt===maxAttempts){
    return {rule,rationale:typeof parsed.rationale==='string'?parsed.rationale.slice(0,400):'',modelCalls:attempt,repairAttempts:attempt-1,unresolvedContradictions:contradictions.length};
   }
   rejected={rejectedRule:rule,contradictions};
  }
  throw Error('AION internal repair loop error');
 }
 return {kind:'live-qwen',runtime,health,probe,infer};
}
module.exports={localEndpoint,oracleProvider,qwenProvider};
