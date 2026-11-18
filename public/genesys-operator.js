/* AION Genesys operational loop v1 — natural language to verified TradeFlow operations.
 *
 *   instruction → intent (untrusted model output) → evidence (persisted records)
 *   → plan (registered commands only) → safety (permission, preconditions, approval)
 *   → execution (existing TradeFlow command runtime) → verification (persisted state)
 *   → evidence recording (commandLog trace) → evaluation (separate benchmark)
 *
 * The model can only PROPOSE. It never selects record identifiers, computes dates,
 * grants permission, approves, or reports success. Every write goes through the
 * existing TradeFlowCommands runtime (prepare → explicit approval → execute), and
 * success is claimed only after the persisted records are re-read and checked.
 */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./command-registry.js'):root?.TradeFlowCommands);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowGenesys=api})(typeof globalThis==='object'?globalThis:null,function(commands){
'use strict';
const VERSION='genesys-operator/1';
const MAX_INSTRUCTION=1000,MAX_STEPS=3;
const clone=x=>JSON.parse(JSON.stringify(x));
const normalize=x=>String(x??'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const isDate=x=>commands.isDate(x);
const rows=(d,s)=>Array.isArray(d?.[s])?d[s]:[];
const open=t=>!['done','completed','cancelled','canceled'].includes(String(t.status||'').toLowerCase());

/* Actions the model may propose. Each maps to exactly one registered command. */
const ACTIONS=Object.freeze({
 invoice_followup:{commandId:'invoice.followup.schedule',needs:['customer','due'],
  describe:'Create an internal task to follow up an OVERDUE unpaid invoice. Does not contact anyone.'},
 quote_followup:{commandId:'quotation.followup.schedule',needs:['customer','due'],
  describe:'Create an internal task to follow up a SENT quotation that has no reply.'},
 log_contact:{commandId:'customer.contact.record',needs:['customer','method','outcome'],
  describe:'Record that the owner already contacted a customer (phone, email, meeting, site visit).'},
 find_records:{commandId:'record.find',needs:['customer'],
  describe:'Look up a customer and their records. Read only.'}
});
const METHODS=Object.freeze({phone:'Phone',call:'Phone',email:'Email',meeting:'Meeting',site_visit:'Site visit',other:'Other'});
const OUTCOMES=Object.freeze(['reached','attempted']);
const WEEKDAYS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const WEEKDAYS_ES={domingo:'sunday',lunes:'monday',martes:'tuesday',miercoles:'wednesday',jueves:'thursday',viernes:'friday',sabado:'saturday',hoy:'today',manana:'tomorrow'};

/* ---------------------------------------------------------------- intent */
const INTENT_SCHEMA=Object.freeze({
 type:'object',additionalProperties:false,required:['steps','question','unsupported'],
 properties:{
  steps:{type:'array',maxItems:MAX_STEPS,items:{type:'object',additionalProperties:false,
   required:['action','customer','due','method','outcome','notes'],
   properties:{action:{type:'string',enum:Object.keys(ACTIONS)},customer:{type:'string'},
    due:{type:'string'},method:{type:'string',enum:['',...Object.keys(METHODS)]},
    outcome:{type:'string',enum:['',...OUTCOMES]},notes:{type:'string'}}}},
  question:{type:'string'},unsupported:{type:'string'}
 }
});
function intentMessages({instruction,today,customers=[]}){
 const actions=Object.entries(ACTIONS).map(([name,a])=>'- '+name+': '+a.describe).join('\n');
 const system=[
  'You convert one instruction from the owner of a small electrical contracting business into JSON.',
  'You may ONLY use these actions:',actions,
  'Rules:',
  '- Copy the customer name and the date words exactly as the owner wrote them (e.g. "Friday", "tomorrow", "in 3 days"). Never invent a date.',
  '- If the owner asks for something these actions cannot do (sending messages, marking invoices paid, deleting, payments, refunds, changing prices), put it in "unsupported" and do not map it to another action.',
  '- If a required detail is missing or unclear, leave that field empty and ask in "question".',
  '- For log_contact, outcome is "reached" if they spoke with the customer, "attempted" if they left a message or got no answer.',
  '- Use one step per requested action, at most '+MAX_STEPS+'.',
  'Reply with JSON only: {"steps":[{"action":"","customer":"","due":"","method":"","outcome":"","notes":""}],"question":"","unsupported":""}'
 ].join('\n');
 const user='Today is '+today+' ('+WEEKDAYS[new Date(today+'T12:00:00Z').getUTCDay()]+').\n'+
  'Known customers: '+(customers.length?customers.join('; '):'none')+'\n'+
  'Instruction: '+instruction;
 return [{role:'system',content:system},{role:'user',content:user}];
}
function fail(code,message){const e=Error(message);e.code=code;return e}
function parseIntent(raw){
 if(typeof raw!=='string'||!raw.trim()||raw.length>6000)throw fail('INVALID_MODEL_OUTPUT','Model output is empty or too long.');
 let text=raw.trim();
 const fenced=text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);if(fenced)text=fenced[1];
 const think=text.match(/<\/think>\s*([\s\S]*)$/i);if(think)text=think[1].trim();
 let value;try{value=JSON.parse(text)}catch{throw fail('INVALID_MODEL_OUTPUT','Model output is not valid JSON.')}
 if(!value||typeof value!=='object'||Array.isArray(value))throw fail('INVALID_MODEL_OUTPUT','Model output must be an object.');
 const keys=Object.keys(value);
 if(keys.some(k=>!['steps','question','unsupported'].includes(k)))throw fail('INVALID_MODEL_OUTPUT','Model output has unknown fields.');
 const str=(x,max)=>{if(x===undefined||x===null)return '';if(typeof x!=='string'||x.length>max)throw fail('INVALID_MODEL_OUTPUT','Model field is not a bounded string.');return x.trim()};
 const steps=value.steps===undefined?[]:value.steps;
 if(!Array.isArray(steps)||steps.length>MAX_STEPS)throw fail('INVALID_MODEL_OUTPUT','Model steps must be a short list.');
 const parsed=steps.map(step=>{
  if(!step||typeof step!=='object'||Array.isArray(step)||Object.keys(step).some(k=>!['action','customer','due','method','outcome','notes'].includes(k)))
   throw fail('INVALID_MODEL_OUTPUT','Model step has unknown fields.');
  const action=str(step.action,40);
  if(!ACTIONS[action])throw fail('UNREGISTERED_ACTION','Model proposed an action that is not registered.');
  const method=str(step.method,20).toLowerCase(),outcome=str(step.outcome,20).toLowerCase();
  if(method&&!METHODS[method])throw fail('INVALID_MODEL_OUTPUT','Unknown contact method.');
  if(outcome&&!OUTCOMES.includes(outcome))throw fail('INVALID_MODEL_OUTPUT','Unknown contact outcome.');
  return {action,customer:str(step.customer,120),due:str(step.due,60),method,outcome,notes:str(step.notes,600)};
 });
 return {steps:parsed,question:str(value.question,400),unsupported:str(value.unsupported,400)};
}

/* Deterministic host date resolution; the model only copies the owner's words. */
function resolveDue(expression,today){
 if(!isDate(today))throw Error('Host date is required');
 let e=normalize(String(expression||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''));if(!e)return null;
 e=e.replace(/^(?:el|para el|el proximo|este) /,'').split(' ').map(w=>WEEKDAYS_ES[w]||w).join(' ');
 if(isDate(String(expression).trim()))return String(expression).trim();
 const base=new Date(today+'T12:00:00Z');
 const shift=n=>{const d=new Date(base);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 if(e==='today')return today;
 if(e==='tomorrow')return shift(1);
 let m=e.match(/^in (\d{1,2}) (day|days|week|weeks)$/);if(m)return shift(Number(m[1])*(m[2].startsWith('week')?7:1));
 if(e==='next week')return shift(((8-base.getUTCDay())%7)||7);
 m=e.match(/^(?:on |by |this |next |coming )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
 if(m){const diff=(WEEKDAYS.indexOf(m[1])-base.getUTCDay()+7)%7;return shift(diff||7)}
 if(/^(?:by |at )?(?:the )?end of (?:the |this )?week$/.test(e)){const diff=5-base.getUTCDay();return diff>=0?shift(diff):null}
 return null;
}

/* --------------------------------------------------------------- evidence */
const STOP=new Set(['mock','the','inc','llc','co','company','and','of']);
const tokens=x=>normalize(x).split(' ').filter(t=>t&&!STOP.has(t));
function matchCustomers(data,phrase,context){
 const want=tokens(phrase);if(!want.length)return [];
 const scope=context.businessId||'local-business';
 return rows(data,'customers').filter(c=>!c.businessId||c.businessId===scope).filter(c=>{
  const have=new Set(tokens(c.name||c.company||''));
  return want.every(t=>have.has(t)||[...have].some(h=>h.startsWith(t)&&t.length>=4));
 }).map(c=>({store:'customers',id:c.id,label:c.name||c.id}));
}
function candidates(data,action,customerId,context,due){
 // Records of the requested kind for this customer, each judged by the
 // registered command's own precondition rules, not by the model.
 const store=action==='invoice_followup'?'invoices':'quotes';
 return rows(data,store).filter(r=>r.customerId===customerId).map(r=>{
  const verdict=commands.resolve({commandId:ACTIONS[action].commandId,params:{ref:{store,id:r.id},due}},data,context);
  return {ref:{store,id:r.id},label:r.reference||r.number||r.title||r.id,status:r.status||'',
   dueDate:r.dueDate||r.sentDate||'',eligible:['ready','needs_review'].includes(verdict.status),
   reason:verdict.error?.code||null};
 });
}

/* ------------------------------------------------------------ verification */
const UNCHANGED={
 'invoice.followup.schedule':['invoices','payments','customers','quotes','events'],
 'quotation.followup.schedule':['invoices','payments','customers','quotes','events'],
 'customer.contact.record':['invoices','payments','customers'],
 'record.find':['invoices','payments','customers','quotes','events','tasks','jobs']
};
const same=(a,b)=>commands.canonical(a)===commands.canonical(b);
function verifyStep(before,after,step,outcome){
 // Reads persisted state; the runtime's "succeeded" label is not evidence.
 const checks=[];const ok=(name,pass,detail)=>checks.push({name,pass:!!pass,...(detail?{detail}:{})});
 const p=step.params,commandId=step.commandId,result=outcome?.result||{};
 for(const store of UNCHANGED[commandId]||[])ok('unchanged:'+store,same(rows(before,store),rows(after,store)));
 if(commandId==='record.find'){ok('no_writes',same(rows(before,'tasks'),rows(after,'tasks')))}
 else{
  const receipts=rows(after,'commandLog').filter(r=>r.id===result.commandKey&&r.kind===commandId);
  ok('receipt_persisted',receipts.length===1&&receipts[0].resultId===result.id);
 }
 if(commandId==='invoice.followup.schedule'||commandId==='quotation.followup.schedule'){
  const link=commandId==='invoice.followup.schedule'?'invoiceId':'quoteId';
  const kind=commandId==='invoice.followup.schedule'?'invoice_follow_up':'quotation_follow_up';
  const task=rows(after,'tasks').filter(t=>t.id===result.id);
  ok('task_persisted',task.length===1);
  ok('task_linked',task[0]&&task[0][link]===p.ref.id&&task[0].taskKind===kind&&open(task[0]));
  if(!result.reused)ok('task_due_matches',task[0]&&task[0].due===p.due);
  const openLinked=rows(after,'tasks').filter(t=>t[link]===p.ref.id&&t.taskKind===kind&&open(t));
  ok('no_duplicate_open_task',openLinked.length===1);
  const created=rows(after,'tasks').length-rows(before,'tasks').length;
  ok('task_count_delta',created===(result.reused?0:1),{created});
 }
 if(commandId==='customer.contact.record'){
  const ev=rows(after,'events').filter(e=>e.id===result.id);
  ok('contact_persisted',ev.length===1);
  ok('contact_matches',ev[0]&&ev[0].kind==='customer_contact'&&ev[0].customerId===p.ref.id&&ev[0].method===p.method&&ev[0].outcome===p.outcome);
  ok('contact_not_provider_verified',ev[0]&&ev[0].providerVerified===false);
 }
 return {verified:checks.every(c=>c.pass),checks};
}

/* --------------------------------------------------------------- operator */
function createOperator(options){
 const {runtime,snapshot,context,interpreter,approve,recordTrace,now=()=>new Date().toISOString(),hash}=options||{};
 if(!runtime||typeof snapshot!=='function'||typeof context!=='function'||typeof approve!=='function')throw Error('Operator needs a runtime, snapshot, context and a human approval port');
 const digest=hash||(async value=>{if(globalThis.crypto?.subtle){const b=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(commands.canonical(value)));return [...new Uint8Array(b)].map(n=>n.toString(16).padStart(2,'0')).join('')}return require('node:crypto').createHash('sha256').update(commands.canonical(value)).digest('hex')});
 async function handle(instruction,{requestKey,interpreter:override}={}){
  const started=Date.now(),c=await context(),episode={version:VERSION,instruction:String(instruction||''),
   actor:c.actor||'local-owner',businessId:c.businessId||'local-business',today:c.today,startedAt:now(),stages:{}};
  const finish=async(status,extra={})=>{
   Object.assign(episode,extra,{status,finishedAt:now(),latencyMs:Date.now()-started});
   if(typeof recordTrace==='function'){
    const id='genesys:trace:'+(await digest({instruction:episode.instruction,requestKey:requestKey||null,startedAt:episode.startedAt})).slice(0,32);
    try{await recordTrace({id,kind:'genesys.trace',...clone(episode)});episode.traceId=id}
    catch(error){episode.traceError=String(error.message||error)}
   }
   return clone(episode);
  };
  if(typeof instruction!=='string'||!instruction.trim()||instruction.length>MAX_INSTRUCTION)
   return finish('invalid',{reply:'Please give one instruction of up to '+MAX_INSTRUCTION+' characters.'});
  if(!isDate(c.today))return finish('invalid',{reply:'The host date is unavailable.'});
  const before=await snapshot();
  // 1. Intent understanding (untrusted).
  const model=override||interpreter;
  if(!model||typeof model.interpret!=='function')return finish('unavailable',{reply:'No language model is configured.'});
  const customers=rows(before,'customers').filter(x=>!x.businessId||x.businessId===episode.businessId).map(x=>String(x.name||x.id)).slice(0,60);
  const messages=intentMessages({instruction,today:c.today,customers});
  let inference;
  try{inference=await model.interpret(messages,{schema:INTENT_SCHEMA})}
  catch(error){return finish('unavailable',{reply:'The language model did not answer.',stages:{intent:{error:String(error.message||error)}}})}
  episode.model=clone(inference.model||{id:'unknown',real:false});
  episode.stages.intent={raw:String(inference.text||'').slice(0,4000),latencyMs:inference.latencyMs??null,usage:inference.usage||null};
  let intent;
  try{intent=parseIntent(inference.text)}
  catch(error){episode.stages.intent.error=error.code||'INVALID_MODEL_OUTPUT';
   return finish('model_output_rejected',{reply:'I could not interpret that safely. Please rephrase it.'})}
  episode.stages.intent.parsed=intent;
  if(intent.unsupported)return finish('refused',{reply:'I cannot do this in TradeFlow: '+intent.unsupported+'. Nothing was changed.'});
  if(!intent.steps.length)return finish('clarification',{reply:intent.question||'What would you like me to do?'});
  // 2–4. Evidence, planning and safety, for every step before anything executes.
  const planned=[],questions=[],blocked=[];
  for(const [index,s] of intent.steps.entries()){
   const def=ACTIONS[s.action],evidence={step:index,action:s.action};
   const matches=matchCustomers(before,s.customer,c);evidence.customerMatches=matches;
   if(matches.length!==1){questions.push(matches.length?'Which customer do you mean: '+matches.map(m=>m.label).join(' or ')+'?':
    'I could not find a customer matching "'+(s.customer||'(none given)')+'".');continue}
   const customerRef={store:'customers',id:matches[0].id},customerLabel=matches[0].label;let params,commandId=def.commandId;
   if(s.action==='find_records'){params={query:matches[0].label,store:'customers'}}
   else if(s.action==='log_contact'){
    if(!s.method||!s.outcome){questions.push('How did you contact '+customerLabel+' (phone, email, meeting, site visit) and did you reach them?');continue}
    const notes=(s.notes&&s.notes.length>=3?s.notes:instruction).slice(0,1000);
    params={ref:customerRef,method:METHODS[s.method],outcome:s.outcome,notes};
   }else{
    const due=resolveDue(s.due,c.today);
    if(!due||due<c.today){questions.push('When should the follow-up for '+customerLabel+' be due?');continue}
    const found=candidates(before,s.action,customerRef.id,c,due);evidence.candidates=found;
    const eligible=found.filter(x=>x.eligible);
    if(eligible.length>1){questions.push('Which one for '+customerLabel+': '+eligible.map(x=>x.label).join(' or ')+'?');continue}
    if(!eligible.length){blocked.push({step:index,action:s.action,customer:customerLabel,
     reason:found.length?found.map(x=>x.label+': '+(x.reason||'not eligible')).join('; '):'no matching records'});continue}
    params={ref:eligible[0].ref,due};
   }
   evidence.params=clone(params);
   const check=commands.resolve({commandId,params},before,c);
   if(!['ready','needs_review'].includes(check.status)){blocked.push({step:index,action:s.action,customer:customerLabel,reason:check.error?.code||check.status});continue}
   evidence.guardRefs=(check.guard||[]).filter(g=>g.ref).map(g=>g.ref);
   planned.push({index,action:s.action,commandId,params,evidence});
  }
  episode.stages.evidence=planned.map(p=>p.evidence);
  if(questions.length)return finish('clarification',{reply:questions.join(' '),blocked});
  if(blocked.length)return finish('blocked_by_records',{reply:'The records do not allow this: '+blocked.map(b=>b.customer+' — '+b.reason).join('; ')+'. Nothing was changed.',blocked});
  const prepared=[];
  for(const p of planned){
   const key=requestKey?requestKey+'.'+p.index:undefined;
   const plan=await runtime.prepare({commandId:p.commandId,params:p.params},key?{requestKey:key}:{});
   if(!['ready','needs_review'].includes(plan.status)){
    for(const q of prepared)if(q.plan.status==='needs_review')await runtime.reject(q.plan.id);
    return finish(plan.status==='denied'?'denied':'blocked_by_records',{reply:'This action is not allowed: '+(plan.error?.message||plan.status)+' Nothing was changed.',
     stages:{...episode.stages,plan:{commandId:p.commandId,status:plan.status,error:plan.error||null}}});
   }
   prepared.push({...p,plan});
  }
  episode.stages.plan=prepared.map(p=>({commandId:p.commandId,planId:p.plan.id,status:p.plan.status,approval:p.plan.approval,params:p.params}));
  // 5. Human approval of the exact prepared operations (never inferred from text).
  const review=prepared.filter(p=>p.plan.status==='needs_review');
  let decision=true;
  if(review.length)decision=await approve(review.map(p=>({planId:p.plan.id,commandId:p.commandId,params:clone(p.params),
   summary:summarize(p,before)})));
  episode.stages.approval={required:review.length,granted:decision===true};
  if(decision!==true){for(const p of review)await runtime.reject(p.plan.id);return finish('not_approved',{reply:'Not approved. Nothing was changed.'})}
  for(const p of review){const a=await runtime.approve(p.plan.id);if(a.status!=='approved')return finish('blocked_by_records',{reply:'Approval failed: '+(a.error?.message||a.status)})}
  // 6–7. Execution through the existing runtime, then verification of persisted state.
  const results=[];
  for(const p of prepared){
   const pre=await snapshot();
   const outcome=await runtime.execute(p.plan.id);
   const post=await snapshot();
   const verification=outcome.status==='succeeded'?verifyStep(pre,post,p,outcome):{verified:false,checks:[{name:'runtime_status',pass:false,detail:outcome.status}]};
   results.push({commandId:p.commandId,planId:p.plan.id,runtimeStatus:outcome.status,error:outcome.error||null,result:outcome.result??null,verification});
   if(!verification.verified)break;
  }
  episode.stages.execution=results;
  const verified=results.length===prepared.length&&results.every(r=>r.verification.verified);
  return finish(verified?'completed_verified':'verification_failed',{
   reply:verified?'Done and checked in your records: '+prepared.map(p=>summarize(p,before)).join('; ')+'.':
    'I could not confirm the result in your records. Please check before retrying.'});
 }
 return Object.freeze({handle,version:VERSION});
}
function summarize(p,data){
 const name=id=>(rows(data,'customers').find(c=>c.id===id)||{}).name||id;
 const rec=p.params.ref&&rows(data,p.params.ref.store).find(r=>r.id===p.params.ref.id);
 if(p.commandId==='invoice.followup.schedule')return 'follow-up task for invoice '+(rec?.reference||rec?.number||p.params.ref.id)+' ('+name(rec?.customerId)+') due '+p.params.due;
 if(p.commandId==='quotation.followup.schedule')return 'follow-up task for quote '+(rec?.title||p.params.ref.id)+' ('+name(rec?.customerId)+') due '+p.params.due;
 if(p.commandId==='customer.contact.record')return p.params.method+' contact with '+name(p.params.ref.id)+' recorded as '+p.params.outcome;
 return 'lookup of '+(p.params.query||'records');
}
return Object.freeze({version:VERSION,ACTIONS,INTENT_SCHEMA,intentMessages,parseIntent,resolveDue,matchCustomers,verifyStep,createOperator});
});
