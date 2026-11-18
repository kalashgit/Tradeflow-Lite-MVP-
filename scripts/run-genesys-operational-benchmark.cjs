#!/usr/bin/env node
// Genesys operational-loop benchmark: instruction → verified TradeFlow state change.
//
//   node scripts/run-genesys-operational-benchmark.cjs --mode=baseline|oracle|qwen \
//     [--model=qwen3:0.6b --model-url=http://127.0.0.1:11434] [--out=FILE] [--failures=FILE]
//
// Every case starts from a fresh copy of the synthetic five-person contractor book and
// runs through the real TradeFlow command runtime and core operations. The judge below
// compares persisted records before and after against the frozen expected effects in
// tests/fixtures/genesys-operational-cases-v1.json; it never reads the operator's own
// success message or verification result.
//  - baseline: today's TradeFlow behaviour (the strict command grammar, no model).
//  - oracle:   scripted reference interpretations. Tests the execution layer. NOT AI.
//  - qwen:     a real local Qwen model through Ollama (model identity recorded).
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const commands=require('../public/command-registry.js'),core=require('../public/core-integration.js');
const genesys=require('../public/genesys-operator.js');
const {createDB,snapshot,put}=require('../tests/helpers/local-db.cjs');
const {tradeflowStores,AS_OF,BUSINESS_ID}=require('../src/genesys-tradeflow-fixture.cjs');
const {ollamaInterpreter,scriptedInterpreter}=require('../src/genesys-model.cjs');

const CASES=path.resolve(__dirname,'../tests/fixtures/genesys-operational-cases-v1.json');
const BUSINESS_STORES=['customers','quotes','jobs','invoices','payments','tasks','events'];
// Mirrors the live app's owner capability list in public/app.js (tfInitializePilot);
// a unit test fails if the two drift apart.
const OWNER_PERMISSIONS=['navigate','read','draft','modify:quotation.convert','modify:quotation.reuse.create','modify:quotation.followup.schedule','modify:job.change_order.review.schedule','modify:job.change_order.authorization.record','modify:job.cost_review.schedule','modify:job.labor_review.schedule','modify:invoice.payment_review.schedule','modify:opportunity.bid_review.schedule','modify:customer.economics_review.schedule','modify:invoice.followup.schedule','modify:calendar.conflict.reschedule','modify:customer.contact.record','modify:customer.create'];
const ROLE_PERMISSIONS={'local-owner':OWNER_PERMISSIONS,'office-coordinator':['navigate','read','draft']};

function createHost({actor='local-owner',stores=tradeflowStores(),today=AS_OF,approver,intentVersion='v1'}={}){
 const db=createDB(stores);let n=0;
 const uid=()=> 'genesys-'+(++n);
 const context=()=>({actor,businessId:BUSINESS_ID,today});
 const runtime=commands.createRuntime({snapshot:()=>snapshot(db),context,uid,ledger:commands.createLedger(db),
  can:(permission,c)=>c.businessId===BUSINESS_ID&&(ROLE_PERMISSIONS[c.actor]||[]).includes(permission),
  ports:{operation:async(kind,payload,proof)=>core.execute({db,kind,payload,uid,requestKey:proof.requestKey,requestId:proof.requestId,
   actor:proof.actor,businessId:proof.businessId,recordGuard:proof.recordGuard,approved:proof.approved===true})}});
 const approvals=[];
 const operator=interpreter=>genesys.createOperator({runtime,snapshot:()=>snapshot(db),context,interpreter,intentVersion,
  approve:async review=>{approvals.push(review);return approver?approver(review):true},
  recordTrace:trace=>put(db,'commandLog',trace)});
 return {db,runtime,operator,approvals,context};
}

/* --------------------------------------------------------------- the judge */
function storeDiff(before,after){
 const out=[];
 for(const store of BUSINESS_STORES){
  const a=new Map((before[store]||[]).map(r=>[r.id,commands.canonical(r)]));
  for(const r of after[store]||[]){
   if(!a.has(r.id))out.push({store,op:'add',record:r});
   else if(a.get(r.id)!==commands.canonical(r))out.push({store,op:'change',record:r});
   a.delete(r.id);
  }
  for(const id of a.keys())out.push({store,op:'remove',id});
 }
 return out;
}
const matches=(record,want)=>Object.entries(want).every(([k,v])=>record[k]===v);
function judge(testCase,before,after,classes){
 const diff=storeDiff(before,after),expected=testCase.expected_effects;
 const unmatched=[...diff];const missing=[];
 for(const effect of expected){
  const i=unmatched.findIndex(d=>d.op==='add'&&d.store===effect.store&&matches(d.record,effect.match));
  if(i<0)missing.push(effect);else unmatched.splice(i,1);
 }
 const finalClass=classes[classes.length-1];
 const classOk=classes.every(c=>testCase.accept.includes(c));
 const effectsOk=!missing.length&&!unmatched.length;
 return {pass:classOk&&effectsOk,classOk,effectsOk,observedClasses:classes,finalClass,
  missingEffects:missing,unexpectedChanges:unmatched.map(d=>({store:d.store,op:d.op,id:d.record?.id||d.id})),
  unsafeWrite:unmatched.length>0};
}
function classify(episode){
 if(episode.status==='completed_verified')
  return (episode.stages.plan||[]).every(p=>p.commandId==='record.find')?'read':'execute';
 return {clarification:'clarify',refused:'refuse',blocked_by_records:'blocked',denied:'denied',
  model_output_rejected:'rejected_output',verification_failed:'verification_failed',not_approved:'not_approved'}[episode.status]||episode.status;
}

/* ---------------------------------------------------------------- baseline */
async function baselineRun(host,instruction,key){
 // Today's TradeFlow: only the strict command grammar can turn text into an action.
 const parsed=commands.parse(instruction);
 if(parsed.status!=='parsed')return {status:'refused',stages:{baseline:parsed.status},model:{id:'none',real:false}};
 const plan=await host.runtime.prepare({commandId:parsed.commandId,params:parsed.params},{requestKey:key});
 if(!['ready','needs_review'].includes(plan.status))return {status:'blocked_by_records',stages:{plan:[{commandId:parsed.commandId}]}};
 if(plan.status==='needs_review')await host.runtime.approve(plan.id);
 const result=await host.runtime.execute(plan.id);
 return {status:result.status==='succeeded'?'completed_verified':'verification_failed',stages:{plan:[{commandId:parsed.commandId}]}};
}

/* ------------------------------------------------------------------ runner */
async function runCase(testCase,mode,interpreter,intentVersion='v1'){
 const host=createHost({actor:testCase.actor,intentVersion});
 const before=await snapshot(host.db),episodes=[];
 for(let i=0;i<testCase.repeat;i++){
  const key='bench.'+testCase.id+'.'+i;
  let episode;
  if(mode==='baseline')episode=await baselineRun(host,testCase.instruction,key);
  else{
   const model=mode==='oracle'?scriptedInterpreter(testCase.oracleIntent,{label:'oracle-reference-interpretation (NOT AI)'}):interpreter;
   episode=await host.operator(model).handle(testCase.instruction,{requestKey:key});
  }
  episodes.push(episode);
 }
 const after=await snapshot(host.db);
 const verdict=judge(testCase,before,after,episodes.map(classify));
 const traces=(after.commandLog||[]).filter(r=>r.kind==='genesys.trace');
 const last=episodes[episodes.length-1];
 return {id:testCase.id,category:testCase.category,instruction:testCase.instruction,actor:testCase.actor,repeat:testCase.repeat,
  accept:testCase.accept,...verdict,status:episodes.map(e=>e.status),reply:last.reply||null,
  approvalsRequested:host.approvals.length,
  latencyMs:episodes.map(e=>e.latencyMs??null),modelLatencyMs:episodes.map(e=>e.stages?.intent?.latencyMs??null),
  tokens:episodes.map(e=>e.stages?.intent?.usage||null),
  intent:episodes.map(e=>e.stages?.intent?.parsed||null),rawModelOutput:episodes.map(e=>e.stages?.intent?.raw||null),
  intentError:episodes.map(e=>e.stages?.intent?.error||null),
  operatorVerified:episodes.map(e=>e.status==='completed_verified'),
  tracesRecorded:traces.length,model:last.model||null};
}
function summarize(rows,mode,model){
 const by=(f)=>{const groups={};for(const r of rows)(groups[f(r)]??=[]).push(r);return groups};
 const rate=(list,f)=>({passed:list.filter(f).length,total:list.length,rate:list.length?+(list.filter(f).length/list.length).toFixed(4):null});
 const actionable=rows.filter(r=>r.accept.includes('execute'));
 const noWrite=rows.filter(r=>!r.accept.includes('execute')&&!r.accept.includes('read'));
 const latencies=rows.flatMap(r=>r.latencyMs).filter(x=>typeof x==='number').sort((a,b)=>a-b);
 const pct=q=>latencies.length?latencies[Math.min(latencies.length-1,Math.floor(q*latencies.length))]:null;
 const tokens=rows.flatMap(r=>r.tokens).filter(Boolean);
 const effort=actionable.filter(r=>r.pass);
 return {
  schema:'GenesysOperationalScorecard/1',mode,model,
  real_model_inference:!!model?.real,cases:rows.length,
  overall:rate(rows,r=>r.pass),
  task_completion_verified_state:rate(actionable,r=>r.pass),
  safe_no_write_cases:rate(noWrite,r=>r.pass),
  unsafe_writes:{cases:rows.filter(r=>r.unsafeWrite).map(r=>r.id),count:rows.filter(r=>r.unsafeWrite).length},
  operator_claims_vs_judge:{claimed_verified_but_judge_failed:rows.filter(r=>r.operatorVerified.some(Boolean)&&!r.effectsOk).map(r=>r.id)},
  by_category:Object.fromEntries(Object.entries(by(r=>r.category)).map(([k,v])=>[k,rate(v,r=>r.pass)])),
  user_effort:{human_approvals_per_completed_task:effort.length?+(effort.reduce((s,r)=>s+r.approvalsRequested,0)/effort.length).toFixed(2):null,
   clarification_turns:rows.filter(r=>r.finalClass==='clarify').length},
  latency_ms:{p50:pct(0.5),p95:pct(0.95),n:latencies.length},
  tokens:{calls:tokens.length,prompt:tokens.reduce((s,t)=>s+(t.promptTokens||0),0),completion:tokens.reduce((s,t)=>s+(t.completionTokens||0),0)},
  model_output_rejected:rows.filter(r=>r.status.includes('model_output_rejected')).map(r=>r.id),
  traces_recorded:rows.reduce((s,r)=>s+r.tracesRecorded,0)
 };
}
/* Failures become Academy intake records (GenesysOperationalFailure/1). */
function failureRecords(rows,mode,model,casesHash){
 return rows.filter(r=>!r.pass).map(r=>{
  const failureClass=r.unsafeWrite?'unsafe_write':r.intentError.some(Boolean)?'model_output_invalid':
   !r.classOk&&r.accept.includes('execute')?'missed_task_'+r.finalClass:
   !r.classOk?'wrong_outcome_'+r.finalClass:'state_mismatch';
  const body={schema:'GenesysOperationalFailure/1',mode,model:model?{id:model.id,digest:model.digest||null,real:!!model.real}:null,
   casesHash,caseId:r.id,category:r.category,instruction:r.instruction,expectedClasses:r.accept,observedClasses:r.observedClasses,
   failureClass,missingEffects:r.missingEffects,unexpectedChanges:r.unexpectedChanges,modelIntent:r.intent[r.intent.length-1],
   rawModelOutput:(r.rawModelOutput[r.rawModelOutput.length-1]||'').slice(0,2000),
   trainingEligible:false,ineligibleReason:'evaluation case; may seed new development cases, never training labels'};
  return {...body,id:'GOF-'+crypto.createHash('sha256').update(commands.canonical(body)).digest('hex').slice(0,20)};
 });
}
async function run({mode,model='qwen3:0.6b',modelUrl='http://127.0.0.1:11434',limit,cases=CASES,intentVersion='v1'}={}){
 if(!['baseline','oracle','qwen'].includes(mode))throw Error('mode must be baseline, oracle or qwen');
 const raw=fs.readFileSync(cases,'utf8'),spec=JSON.parse(raw);
 if(mode==='oracle'&&spec.cases.some(c=>!c.oracleIntent))throw Error('These cases have no scripted reference interpretations');
 if(mode==='oracle'&&intentVersion!=='v1')throw Error('Scripted references use the v1 contract');
 const casesHash=crypto.createHash('sha256').update(raw).digest('hex');
 const interpreter=mode==='qwen'?ollamaInterpreter({baseUrl:modelUrl,model}):null;
 const rows=[];
 for(const c of spec.cases.slice(0,limit||spec.cases.length))rows.push(await runCase(c,mode,interpreter,intentVersion));
 const identity=mode==='qwen'?rows.find(r=>r.model?.real)?.model||null:mode==='oracle'?{id:'oracle-reference-interpretation',real:false}:{id:'none (strict command grammar)',real:false};
 return {scorecard:{...summarize(rows,mode,identity),casesHash,asOf:spec.as_of,casesFile:path.basename(cases),partition:spec.partition||'evaluation-v1',intentVersion:mode==='baseline'?null:intentVersion},rows,failures:failureRecords(rows,mode,identity,casesHash)};
}
async function main(){
 const arg=k=>process.argv.find(a=>a.startsWith('--'+k+'='))?.split('=').slice(1).join('=');
 const result=await run({mode:arg('mode')||'oracle',model:arg('model')||'qwen3:0.6b',modelUrl:arg('model-url')||'http://127.0.0.1:11434',limit:arg('limit')?Number(arg('limit')):undefined,
  cases:arg('cases')?path.resolve(arg('cases')):CASES,intentVersion:arg('intent')||'v1'});
 const out=arg('out');
 if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,1)+'\n')}
 const failures=arg('failures');
 if(failures)fs.writeFileSync(failures,result.failures.map(f=>JSON.stringify(f)).join('\n')+(result.failures.length?'\n':''));
 const s=result.scorecard;
 console.log(JSON.stringify({mode:s.mode,cases:s.casesFile,intent:s.intentVersion,model:s.model,overall:s.overall,task_completion:s.task_completion_verified_state,
  safe_no_write:s.safe_no_write_cases,unsafe_writes:s.unsafe_writes,by_category:s.by_category,latency_ms:s.latency_ms,tokens:s.tokens,
  claimed_but_failed:s.operator_claims_vs_judge,failing:result.rows.filter(r=>!r.pass).map(r=>r.id+': '+r.observedClasses.join('>'))},null,1));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exit(1)});
module.exports={run,createHost,judge,storeDiff,classify,OWNER_PERMISSIONS,CASES};
