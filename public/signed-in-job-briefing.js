/* TF-MI-CONV-01B — source-backed owner briefing into the EXISTING
 * device-local conversation stores, scoped to a signed-in cloud identity.
 * This is an opt-in integration port, NOT a wired UI route, cloud chat sync,
 * AI model, notification service, business write or command executor.
 */
import {createCloudReviewPort} from './cloud-intelligence.js';
import {digest,validateEvidence,freeze} from './intelligence-evidence.js';

const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(x);
const validDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 !Number.isNaN(Date.parse(x+'T12:00:00Z'))&&
 new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
const clean=x=>String(x||'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,90);
const state=x=>String(x||'').trim().toLowerCase().replace(/[_-]+/g,' ');
const active=x=>['active','open','scheduled','in progress','underway'].includes(state(x));
const terminal=x=>['done','completed','cancelled','canceled','closed','void'].includes(state(x));
const fingerprint=s=>JSON.stringify([s.identity.issuer,s.identity.subject,
 s.businesses.find(b=>b.business_id===s._businessId).role]);
const recordKey=r=>r.type+':'+r.id;

export function isActiveJobsWeekQuestion(question){
 if(typeof question!=='string'||question.length>300||question.trim().length<8)return false;
 const q=question.toLowerCase();
 return /\b(jobs?|projects?)\b/.test(q)&&
  /\b(active|open|current|ongoing|in progress)\b/.test(q)&&
  /\b(this week|due|upcoming|scheduled)\b/.test(q)&&
  !/\b(delete|send|pay|charge|approve|execute|cancel|ignore|override)\b/.test(q);
}

function businessSession(value,businessId){
 if(value?.status!=='signed_in'||!value.identity||
  typeof value.identity.issuer!=='string'||!value.identity.issuer.trim()||
  typeof value.identity.subject!=='string'||!value.identity.subject.trim()||
  !Array.isArray(value.businesses))throw Error('Current signed-in company identity required');
 const role=value.businesses.find(b=>b.business_id===businessId)?.role;
 if(!['owner','admin'].includes(role))
  throw Error('Owner or admin cloud briefing access required');
 return {...value,_businessId:businessId};
}

function week(today){
 const at=Date.parse(today+'T12:00:00Z');
 const weekday=new Date(at).getUTCDay();
 const monday=new Date(at-(weekday===0?6:weekday-1)*86400000);
 const sunday=new Date(monday.getTime()+6*86400000);
 return [monday.toISOString().slice(0,10),sunday.toISOString().slice(0,10)];
}
function sourceDigest(context){
 return digest(context.records.map(r=>({
  type:r.type,id:r.id,revision:r.revision,updatedAt:r.updatedAt,record:r.record,
  provenance:r.provenance
 })).sort((a,b)=>recordKey(a).localeCompare(recordKey(b))));
}
function compose(context,today,definitions){
 const jobs=context.records.filter(r=>r.type==='jobs');
 const tasks=context.records.filter(r=>r.type==='tasks');
 const jobById=new Map(jobs.map(j=>[j.id,j]));
 const open=jobs.filter(r=>active(r.record.status));
 const unknown=jobs.filter(r=>!active(r.record.status)&&!terminal(r.record.status));
 const [from,to]=week(today),due=[];
 for(const task of tasks){
  const d=task.record.due;
  if(typeof d==='string'&&validDay(d)&&d>=from&&d<=to&&!terminal(task.record.status)){
   const job=jobById.get(task.record.jobId);
   due.push({date:d,kind:'due',entry:task,
    label:'Task "'+clean(task.record.title||task.id)+'"'+(job?' for job "'+clean(job.record.title||job.id)+'"':'')});
  }
 }
 for(const j of jobs){
  const d=j.record.scheduledDate;
  if(typeof d==='string'&&validDay(d)&&d>=from&&d<=to&&!terminal(j.record.status))
   due.push({date:d,kind:'scheduled',entry:j,label:'Job "'+clean(j.record.title||j.id)+'"'});
 }
 due.sort((a,b)=>a.date.localeCompare(b.date)||recordKey(a.entry).localeCompare(recordKey(b.entry)));
 const shown=due.slice(0,5);
 const lines=[
  'Authorized cloud record briefing (not independently verified field schedules):',
  'Jobs explicitly marked active: '+open.length+'.'+
   (unknown.length?' '+unknown.length+' additional job(s) have an unrecognized or missing status.':''),
  'Recorded dates for '+from+' to '+to+':'
 ];
 if(!due.length)lines.push('- No incomplete tasks with a recorded due date or job scheduled dates found in these fields.');
 for(const d of shown)
  lines.push('- '+d.label+': '+(d.kind==='scheduled'?'scheduled':'due')+' '+d.date+'.');
 if(due.length>shown.length)lines.push('- '+(due.length-shown.length)+' more dated items; open Tasks and Jobs to review the full list.');
 lines.push('Material arrivals, crew availability and quotation deadlines cannot be confirmed from these fields. Dates and statuses are entered business records, not independently verified delivery.');
 const refs=[...new Set([...open,...shown.map(x=>x.entry)].map(r=>
  r.type+':'+r.id+'@'+r.revision))].slice(0,8);
 const registry=Array.isArray(definitions)?definitions:[];
 const find=(id,effect,approval)=>registry.find(d=>d?.id===id&&d.effect===effect&&d.approval===approval);
 const proposals=[];
 if(find('workspace.open','navigation','none'))
  proposals.push({commandId:'workspace.open',params:{workspace:'jobs'},
   status:'proposed_not_executed',effect:'navigation',approval:'none'});
 if(due.length&&find('draft.prepare','draft','review_on_save'))
  proposals.push({commandId:'draft.prepare',params:{kind:'task',title:'Review this week’s job commitments'},
   status:'proposed_not_executed',effect:'draft',approval:'review_on_save'});
 return {content:lines.join('\n'),refs,proposals,activeJobCount:open.length,
  unknownStatusCount:unknown.length,datedItemCount:due.length,week:{from,to}};
}

export function createSignedInJobBriefingPort({
 db,businessId,session,fetcher=fetch,store,definitions,
 readActiveThread,today
}={}){
 if(typeof businessId!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(businessId)||
  typeof session!=='function'||typeof fetcher!=='function'||
  typeof readActiveThread!=='function'||typeof today!=='function'||
  !db||!store||!['scopeKey','listThreads','listTurns','appendTurn'].every(k=>typeof store[k]==='function'))
  throw Error('Existing signed-in session, same-origin retrieval and conversation store required');

 async function current(){
  const start=businessSession(await session(),businessId);
  const scope={kind:'verified_account',businessId,
   actorId:'acct_'+await digest([start.identity.issuer,start.identity.subject])};
  return {start,scope};
 }
 async function reviewThread(scope,threadId,userTurnId,question){
  if(!validId(threadId)||!validId(userTurnId))throw Error('Saved source conversation IDs required');
  const rows=await store.listThreads(db,scope);
  if(!Array.isArray(rows)||!rows.some(r=>r.id===threadId&&r.deletedAt==null&&
   r.scopeKey===store.scopeKey(scope)))throw Error('Selected account conversation is unavailable');
  if(await readActiveThread()!==threadId)throw Error('Conversation changed before evidence review');
  const turns=await store.listTurns(db,scope,threadId);
  const last=turns[turns.length-1];
  if(last?.id!==userTurnId||last.role!=='user'||last.source!=='user'||
     last.status!=='committed'||last.content!==question.trim())
   throw Error('Current saved user question is required');
 }
 async function verifySession(start,threadId){
  const next=businessSession(await session(),businessId);
  if(fingerprint(next)!==fingerprint(start))throw Error('Account role or identity changed');
  if(await readActiveThread()!==threadId)throw Error('Conversation switched while reading records');
 }
 async function readCloud(start,scope,threadId){
  let context;
  const reader=createCloudReviewPort({businessId,session,fetcher,
   onContext:payload=>{context=payload}});
  await reader();
  await verifySession(start,threadId);
  if(!context)throw Error('Current cloud evidence unavailable');
  await validateEvidence(context,{
   mode:'cloud',businessId,identity:{issuer:start.identity.issuer,subject:start.identity.subject},
   role:start.businesses.find(b=>b.business_id===businessId).role
  });
  return context;
 }
 return freeze({
  async scope(){
   const {scope}=await current();
   return freeze(scope);
  },
  async answer({threadId,userTurnId,question}={}){
   if(!isActiveJobsWeekQuestion(question))throw Error('Only active jobs and this-week question supported');
   const date=today();
   if(!validDay(date))throw Error('Valid local calendar date required');
   const {start,scope}=await current();
   await reviewThread(scope,threadId,userTurnId,question);
   // Two independent authenticated reads. Source revisions AND allowlisted
   // record fields must remain unchanged before the result is saved.
   const first=await readCloud(start,scope,threadId);
   const firstHash=await sourceDigest(first);
   const second=await readCloud(start,scope,threadId);
   if(firstHash!==await sourceDigest(second))
    throw Error('Cloud records changed during briefing; review current sources');
   await verifySession(start,threadId);
   await reviewThread(scope,threadId,userTurnId,question);
   const briefing=compose(second,date,definitions);
   const id='cloud_'+await digest([store.scopeKey(scope),threadId,userTurnId]);
   const turn=await store.appendTurn(db,scope,threadId,{
    id,role:'assistant',content:briefing.content,modality:'text',
    source:'authenticated_cloud_evidence',status:'committed',refs:briefing.refs
   });
   await verifySession(start,threadId);
   // 'authenticated_cloud_evidence' is a transcript display label. History
   // remains device-local and is NOT a signed server receipt or cloud sync.
   return freeze({
    kind:'tradeflow.intelligence.signed-in-job-briefing.v1',
    status:'saved_device_local',threadId,replyTurnId:turn.id,
    scope,sourceRead:'authenticated_same_origin',
    readbackCount:2,sourceContentChecked:true,
    persistence:'device_local_only',syncState:'not_synced',
    ...briefing,executionAuthority:false,commandExecuted:false,
    actionReceiptRef:null,proposalOnly:true
   });
  }
 });
}
