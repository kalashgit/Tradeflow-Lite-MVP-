/* Local-first research execution and review. Only accepted candidates enter Opportunities. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./lead-discovery-core.js'):root?.TradeFlowLeadDiscoveryCore);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowLeadDiscoveryRuntime=api})(typeof globalThis==='object'?globalThis:null,function(core){
'use strict';
const copy=v=>JSON.parse(JSON.stringify(v));
function createRepository(database){
 function transaction(id,change,includeOpportunities=false){return new Promise((resolve,reject)=>{
  let tx,error,answer;try{const db=typeof database==='function'?database():database;tx=db.transaction(includeOpportunities?['settings','opportunities']:['settings'],'readwrite');const settings=tx.objectStore('settings'),request=settings.get(id);let run,opportunities=[],pending=includeOpportunities?2:1;
   const ready=()=>{if(--pending)return;try{const result=change(run,opportunities);answer=result.answer;if(result.run)settings.put(result.run);for(const record of result.inserts||[]){if(!includeOpportunities)throw Error('Opportunity storage is unavailable.');tx.objectStore('opportunities').add(record)}}catch(e){error=e;tx.abort()}};
   request.onsuccess=()=>{run=request.result;ready()};if(includeOpportunities){const q=tx.objectStore('opportunities').getAll();q.onsuccess=()=>{opportunities=q.result;ready()}}
   tx.oncomplete=()=>resolve(copy(answer));tx.onerror=()=>reject(error||tx.error||Error('Could not save research.'));tx.onabort=()=>reject(error||tx.error||Error('Research transaction aborted.'));
  }catch(e){reject(e)}
 })}
 return Object.freeze({
  async create(run){return transaction(run.id,existing=>{if(existing)throw Error('Run already exists.');return {run,answer:run}})},
  async get(id){return transaction(id,run=>({answer:run||null}))},
  async list(){const db=typeof database==='function'?database():database;return new Promise((resolve,reject)=>{const tx=db.transaction('settings'),r=tx.objectStore('settings').getAll();r.onsuccess=()=>resolve(r.result.filter(x=>x.kind==='discovery_run'&&x.id.startsWith(core.RUN_PREFIX)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));r.onerror=()=>reject(r.error)})},
  async update(id,change){return transaction(id,run=>{if(!run||run.kind!=='discovery_run')throw Error('Research run was not found.');const next=change(copy(run));return {run:next,answer:next}})},
  async claim(id,owner,now){return this.update(id,run=>{if(run.lock&&run.lock.owner!==owner&&run.lock.until>now)throw Error('This research run is already active in another tab.');run.lock={owner,until:new Date(Date.parse(now)+120000).toISOString()};return run})},
  async review(id,candidateId,decision){return transaction(id,(run,opportunities)=>{
   if(!run||run.kind!=='discovery_run')throw Error('Research run was not found.');const entry=run.jobs.find(j=>j.candidate?.id===candidateId);if(!entry)throw Error('Candidate was not found.');
   if(entry.review?.status==='accepted'){const existing=opportunities.find(x=>x.id===entry.acceptedRecordId);if(!existing)throw Error('Accepted record is missing; review the run before retrying.');return {answer:{status:'accepted',id:existing.id,reused:true}}}
   if(decision.status==='rejected'){entry.review={status:'rejected',notes:core.clean(decision.notes,800),at:decision.at};run.updatedAt=decision.at;return {run,answer:{status:'rejected'}}}
   const candidate=entry.candidate,record=core.toOpportunity(candidate,decision,id),duplicates=core.duplicates(record,opportunities,run.criteria.mode);
   if(duplicates.length){entry.review={status:'duplicate',existingIds:duplicates,at:decision.at};run.updatedAt=decision.at;return {run,answer:{status:'duplicate',ids:duplicates}}}
   if(opportunities.some(x=>x.id===record.id))throw Error('Identifier collision: existing records have been preserved.');
   entry.review={status:'accepted',notes:core.clean(decision.notes,800),at:decision.at};entry.acceptedRecordId=record.id;run.updatedAt=decision.at;
   return {run,inserts:[record],answer:{status:'accepted',id:record.id}};
  },true)}
 });
}
function createHttpProvider({fetcher=fetch,accessCode=()=>'',origin=''}={}){
 async function request(path,body){const response=await fetcher(origin+'/api/discovery/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify({...body,code:accessCode()})}:{}),signal:AbortSignal.timeout(path==='enrich'?95000:50000)});let data;try{data=await response.json()}catch{throw Object.assign(Error('Research returned an unreadable response.'),{retryable:true})}if(!response.ok)throw Object.assign(Error(data.error?.message||'Research could not complete.'),{code:data.error?.code||'RESEARCH_FAILED',retryable:!!data.error?.retryable});return data}
 return Object.freeze({status:()=>request('status'),search:(criteria,query)=>request('search',{criteria,query}),enrich:(criteria,candidate)=>request('enrich',{criteria,candidate})});
}
function createRunner({repository,provider,snapshot,uid=()=>crypto.randomUUID(),now=()=>new Date().toISOString(),onChange=()=>{}}){
 const owner=uid(),active=new Map();
 function criteriaKey(c){const {batchSize,...rest}=c;return JSON.stringify(rest)}
 async function knownRecords(data,run){const history=await repository.list(),since=Date.parse(now())-86400000;return [...data.opportunities||[],...history.filter(r=>r.id!==run.id&&r.criteria.mode===run.criteria.mode&&criteriaKey(r.criteria)===criteriaKey(run.criteria)&&Date.parse(r.updatedAt)>=since).flatMap(r=>r.jobs.filter(j=>j.status==='completed'&&j.candidate&&j.review?.status!=='accepted').map(j=>({id:j.candidate.id,source_url:j.candidate.sourceUrl,website:j.candidate.website,opportunity_type:r.criteria.mode==='prospects'?'business_prospect':'project_signal',research_mode:r.criteria.mode})))];}
 async function emit(run){await onChange(run);return run}
 async function update(id,change){return emit(await repository.update(id,run=>{if(run.lock?.owner!==owner)throw Error('The run is no longer owned by this tab.');const next=change(run);next.updatedAt=now();next.lock={owner,until:new Date(Date.parse(now())+120000).toISOString()};return next}))}
 async function start(criteria){const normalized=core.validateCriteria(criteria),status=await provider.status();if(!status.configured)throw Error('A research provider has not been connected. Ask your workspace administrator to connect it.');if(!status.authorizationConfigured)throw Error('Research access has not been configured.');
  const stamp=now(),id=core.RUN_PREFIX+uid();await repository.create({id,kind:'discovery_run',version:1,criteria:normalized,provider:status.provider,status:'queued',createdAt:stamp,updatedAt:stamp,queries:core.buildQueries(normalized).map(query=>({query,status:'pending',attempts:0})),jobs:[],progress:{discovered:0,duplicateSkipped:0,enriched:0,failed:0},errors:[],limitations:[]});return process(id);
 }
 function process(id){if(active.has(id))return active.get(id);const pending=execute(id).finally(()=>active.delete(id));active.set(id,pending);return pending}
 async function execute(id){await repository.claim(id,owner,now());let run=await repository.get(id);
  try{
   for(let index=0;index<run.queries.length;index++){
    if(run.queries[index].status==='completed'||run.jobs.length>=run.criteria.batchSize)continue;
    run=await update(id,r=>{r.status='searching';r.queries[index].status='running';r.queries[index].attempts++;return r});
    try{const response=await provider.search(run.criteria,run.queries[index].query),data=await snapshot(),known=await knownRecords(data,run),remaining=run.queries.filter(q=>q.status!=='completed').length,quota=Math.max(1,Math.ceil((run.criteria.batchSize-run.jobs.length)/remaining));
     run=await update(id,r=>{const seen=new Set(r.jobs.map(x=>x.sourceKey));let added=0;for(const candidate of response.results||[]){const url=core.canonicalUrl(candidate.url);if(!url)continue;const sourceKey=core.identity(candidate,r.criteria.mode);if(seen.has(sourceKey)||core.duplicates(candidate,known,r.criteria.mode).length){r.progress.duplicateSkipped++;continue}if(r.jobs.length>=r.criteria.batchSize||added>=quota)break;seen.add(sourceKey);added++;r.jobs.push({id:uid(),sourceKey,source:{...candidate,url},status:'pending',attempts:0,review:{status:'pending'}})}r.queries[index].status='completed';r.progress.discovered=r.jobs.length;r.limitations=[...new Set([...r.limitations,...response.limitations||[]])];return r});
    }catch(error){run=await update(id,r=>{r.queries[index].status='failed';r.queries[index].error={message:String(error.message||error),retryable:!!error.retryable};r.errors.push({stage:'search',index,message:String(error.message||error),at:now()});return r});if(error.code==='ACCESS_REQUIRED'||error.code==='PROVIDER_AUTH_FAILED'||error.code==='PROVIDER_NOT_CONFIGURED')throw error}
   }
   for(let index=0;index<run.jobs.length;index++){
    if(run.jobs[index].status==='completed'||['accepted','rejected','duplicate'].includes(run.jobs[index].review?.status))continue;
    // Recheck the live CRM before paying to enrich a source discovered earlier.
    const current=await snapshot(),known=await knownRecords(current,run),duplicates=core.duplicates(run.jobs[index].source,known,run.criteria.mode);
    if(duplicates.length){run=await update(id,r=>{r.jobs[index].status='duplicate';r.jobs[index].review={status:'duplicate',existingIds:duplicates};r.progress.duplicateSkipped++;return r});continue}
    run=await update(id,r=>{r.status='enriching';r.jobs[index].status='running';r.jobs[index].attempts++;return r});
    try{const response=await provider.enrich(run.criteria,run.jobs[index].source);if(!response.candidate?.id||!Array.isArray(response.candidate.evidence))throw Error('The provider returned an invalid candidate.');run=await update(id,r=>{r.jobs[index].candidate=response.candidate;r.jobs[index].status='completed';r.jobs[index].error=null;r.progress.enriched=r.jobs.filter(j=>j.status==='completed').length;return r})}
    catch(error){run=await update(id,r=>{r.jobs[index].status='failed';r.jobs[index].error={message:String(error.message||error),retryable:!!error.retryable};r.errors.push({stage:'enrich',index,message:String(error.message||error),at:now()});return r});if(error.code==='ACCESS_REQUIRED'||error.code==='PROVIDER_AUTH_FAILED')throw error}
   }
   run=await update(id,r=>{r.progress.failed=r.jobs.filter(j=>j.status==='failed').length+r.queries.filter(q=>q.status==='failed').length;r.status=r.progress.failed?r.progress.enriched?'partial':'failed':'completed';r.completedAt=now();return r});
  }catch(error){run=await update(id,r=>{r.status='failed';r.error=String(error.message||error);return r})}
  finally{run=await repository.update(id,r=>{if(r.lock?.owner===owner)delete r.lock;return r});await emit(run)}return run;
 }
 return Object.freeze({start,resume:process,active:id=>active.has(id),review:(id,candidateId,decision)=>repository.review(id,candidateId,{...decision,at:now()})});
}
return Object.freeze({createRepository,createHttpProvider,createRunner});
});
