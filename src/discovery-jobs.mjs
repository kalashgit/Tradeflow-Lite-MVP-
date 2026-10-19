/* Durable orchestration policy, independent of Cloudflare runtime for focused tests. */
import core from '../public/lead-discovery-core.js';
import config from '../public/lead-intelligence-config.js';
const active=new Set(['queued','checking','searching','enriching','retry_wait']);
export class JobError extends Error{constructor(message,status=400){super(message);this.status=status}}
export class ResearchCoordinator{
 constructor({store,provider,now=()=>Date.now(),uid=()=>crypto.randomUUID()}){Object.assign(this,{store,provider,now,uid})}
 stamp(){return new Date(this.now()).toISOString()}
 create(input){
  const criteria=core.validateCriteria(input.criteria),requestKey=core.clean(input.requestKey,100);if(!/^[\w:-]{8,100}$/.test(requestKey))throw new JobError('Supply an idempotency request key.');
  const existing=this.store.byKey(requestKey);if(existing){if(JSON.stringify(existing.criteria)!==JSON.stringify(criteria))throw new JobError('Request key already belongs to different criteria.',409);return existing}
  if(this.store.countActive()>=10)throw new JobError('Research queue is full. Finish or cancel a run before adding another.',429);
  const plans=config.plan(criteria),run={id:core.RUN_PREFIX+this.uid(),requestKey,kind:'discovery_run',version:2,execution:'durable',criteria,provider:criteria.provider,status:'queued',createdAt:this.stamp(),updatedAt:this.stamp(),nextAttemptAt:this.now(),queries:plans.queries.map(query=>({query,status:'pending',attempts:0})),jobs:[],progress:{discovered:0,enriched:0,failed:0,duplicateSkipped:0},usage:{searchRequests:0,enrichmentRequests:0,reportedCredits:0,creditsReported:false,currencyCost:null},errors:[],limitations:plans.limitations,known:[]};
  // Only dedupe identifiers from existing CRM records; no private notes or customer records sent.
  run.known=(input.known||[]).slice(0,3000).map(x=>({id:core.clean(x.id,150),url:core.canonicalUrl(x.source_url||x.url),website:core.canonicalUrl(x.website),name:core.clean(x.project_name||x.organization_name||x.name,180),address:core.clean(x.address,300),contact_phone:/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(x.contact_phone||'')?x.contact_phone:'',opportunity_type:x.opportunity_type,research_mode:x.research_mode}));
  this.store.save(run);return run;
 }
 cancel(id){const r=this.mustGet(id);if(active.has(r.status)){r.status='cancelled';r.cancelledAt=this.stamp();r.updatedAt=this.stamp();this.store.save(r)}return r}
 retry(id){const r=this.mustGet(id);if(active.has(r.status))return r;let changed=!r.providerChecked||!!r.budgetLimited;if(!r.providerChecked)r.attempts=0;delete r.budgetLimited;for(const q of [...r.queries,...r.jobs])if(q.status==='failed'&&q.error?.retryable){q.status='pending';q.attempts=0;changed=true}if(!changed)throw new JobError('No retryable unfinished work. Start a fresh search to refresh completed sources.');r.status='queued';r.nextAttemptAt=this.now();delete r.error;r.updatedAt=this.stamp();this.store.save(r);return r}
 mustGet(id){const r=this.store.get(id);if(!r)throw new JobError('Run not found.',404);return r}
 review(id,candidateId,decision){const r=this.mustGet(id),job=r.jobs.find(x=>x.candidate?.id===candidateId);if(!job)throw new JobError('Candidate not found.',404);if(job.review?.status==='accepted')return r;
  if(!['approved','rejected'].includes(decision.status))throw new JobError('Choose approve or reject.');
  if(decision.status==='approved')core.toOpportunity(job.candidate,{...decision,at:this.stamp()},id);
  job.review={status:decision.status==='approved'?'accepted':'rejected',notes:core.clean(decision.notes,800),name:core.clean(decision.name||job.candidate.name,180),at:this.stamp(),...(decision.status==='approved'?{persistence:'client_confirmed_existing_opportunities'}:{})};r.updatedAt=this.stamp();this.store.save(r);return r;
 }
 async step(){
  const run=this.store.next();if(!run)return null;if(run.nextAttemptAt>this.now())return run;
  let unit,stage,index;
  if(this.store.usageToday?.()>=500){run.status='failed';run.budgetLimited=true;run.error='Daily workspace research request limit reached (500). Retry tomorrow or reduce the next batch.';run.updatedAt=this.stamp();this.store.save(run);return run}
  if(!run.providerChecked){stage='check';unit=run;run.status='checking';unit.attempts=(unit.attempts||0)+1}
  else if((index=run.queries.findIndex(q=>q.status==='pending'||q.status==='running'))>=0&&run.jobs.length<run.criteria.batchSize){stage='search';unit=run.queries[index];unit.status='running';unit.attempts++;run.status='searching';run.usage.searchRequests++}
  else if((index=run.jobs.findIndex(j=>j.status==='pending'||j.status==='running'))>=0){stage='enrich';unit=run.jobs[index];unit.status='running';unit.attempts++;run.status='enriching';run.usage.enrichmentRequests++}
  else {run.progress.failed=[...run.queries,...run.jobs].filter(x=>x.status==='failed').length;run.status=run.progress.failed?(run.progress.enriched?'partial':'failed'):'completed';run.completedAt=this.stamp();run.updatedAt=this.stamp();this.store.save(run);return run}
  run.worker={stage,index,startedAt:this.stamp()};run.updatedAt=this.stamp();this.store.save(run);
  try{
   let result;
   if(stage==='check'){result=await this.provider.check(run.criteria);run.providerChecked=true;run.status='queued';run.connection={verifiedAt:this.stamp(),provider:run.provider}}
   if(stage==='search'){
    result=await this.provider.search(run.criteria,unit.query);unit.status='completed';unit.error=null;
    const known=[...run.known,...this.store.known(run.id,run.criteria.mode),...run.jobs.map(j=>({...j.source,id:j.id,mode:run.criteria.mode}))];
    const remaining=run.queries.filter(q=>q.status!=='completed').length+1,quota=Math.ceil((run.criteria.batchSize-run.jobs.length)/remaining);let added=0;
    for(const source of result.results||[]){if(run.jobs.length>=run.criteria.batchSize||added>=quota)break;if(!core.canonicalUrl(source.url))continue;if(core.duplicates(source,known,run.criteria.mode).length){run.progress.duplicateSkipped++;continue}const job={id:this.uid(),sourceKey:core.identity(source,run.criteria.mode),source,status:'pending',attempts:0,review:{status:'pending'}};run.jobs.push(job);known.push({...source,id:job.id,mode:run.criteria.mode});added++}
    run.progress.discovered=run.jobs.length;
   }
   if(stage==='enrich'){
    const known=[...run.known,...this.store.known(run.id,run.criteria.mode)];
    if(core.duplicates(unit.source,known,run.criteria.mode).length){unit.status='duplicate';run.progress.duplicateSkipped++;run.usage.enrichmentRequests--;result={}}
    else{result=await this.provider.enrich(run.criteria,unit.source);if(!result.candidate?.id||!result.candidate?.evidence?.length)throw Object.assign(new Error('Source returned no usable evidence.'),{retryable:true});unit.candidate=result.candidate;unit.status='completed';unit.error=null;run.progress.enriched=run.jobs.filter(j=>j.status==='completed').length}
   }
   if(Number.isFinite(result?.usage?.credits)){run.usage.reportedCredits+=result.usage.credits;run.usage.creditsReported=true}
  }catch(error){
   const safe={message:core.clean(error.message||'Research failed',250),code:core.clean(error.code||'PROVIDER_FAILURE',80),retryable:!!error.retryable,at:this.stamp()};run.errors.push({stage,index,...safe});run.errors=run.errors.slice(-100);unit.error=safe;
   if(safe.retryable&&unit.attempts<3){if(stage!=='check')unit.status='pending';run.status='retry_wait';run.nextAttemptAt=this.now()+Math.min(60000,5000*2**unit.attempts)}else{if(stage!=='check')unit.status='failed';if(stage==='check'||['ACCESS_REQUIRED','PROVIDER_AUTH_FAILED','PROVIDER_NOT_CONFIGURED'].includes(safe.code)){run.status='failed';run.error=safe.message;run.completedAt=this.stamp()}}
  }
  // A cancellation may interleave while awaiting the provider; never resurrect the run.
  const latest=this.store.get(run.id);if(latest?.status==='cancelled')return latest;
  // Preserve reviews made during provider I/O, including accepted user corrections.
  for(const job of run.jobs){const saved=latest?.jobs.find(x=>x.id===job.id);if(saved?.review?.status!=='pending'&&saved?.review)job.review=saved.review}
  run.updatedAt=this.stamp();if(run.status!=='retry_wait')run.nextAttemptAt=this.now()+1500;delete run.worker;this.store.save(run);return run;
 }
}
export class SqliteResearchStore{
 constructor(sql){this.sql=sql;sql.exec('CREATE TABLE IF NOT EXISTS research_runs (id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, created TEXT NOT NULL, status TEXT NOT NULL, due INTEGER NOT NULL, data TEXT NOT NULL)');sql.exec('CREATE TABLE IF NOT EXISTS research_jobs (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, ordinal INTEGER NOT NULL, data TEXT NOT NULL)');sql.exec('CREATE INDEX IF NOT EXISTS research_jobs_run ON research_jobs(run_id,ordinal)')}
 save(run){const {jobs,...meta}=run;this.sql.exec('INSERT INTO research_runs(id,request_key,created,status,due,data) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,due=excluded.due,data=excluded.data',run.id,run.requestKey,run.createdAt,run.status,run.nextAttemptAt,JSON.stringify(meta));for(const [ordinal,j]of jobs.entries())this.sql.exec('INSERT INTO research_jobs(id,run_id,ordinal,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE research_jobs.data<>excluded.data',j.id,run.id,ordinal,JSON.stringify(j))}
 get(id){const row=this.sql.exec('SELECT data FROM research_runs WHERE id=?',id).toArray()[0];return row?{...JSON.parse(row.data),jobs:this.sql.exec('SELECT data FROM research_jobs WHERE run_id=? ORDER BY ordinal',id).toArray().map(x=>JSON.parse(x.data))}:null}
 byKey(key){const row=this.sql.exec('SELECT id FROM research_runs WHERE request_key=?',key).toArray()[0];return row?this.get(row.id):null}
 countActive(){return this.sql.exec("SELECT COUNT(*) AS count FROM research_runs WHERE status IN ('queued','checking','searching','enriching','retry_wait')").toArray()[0].count}
 usageToday(){return this.sql.exec('SELECT data FROM research_runs WHERE created>=?',new Date().toISOString().slice(0,10)).toArray().reduce((sum,x)=>{const u=JSON.parse(x.data).usage;return sum+u.searchRequests+u.enrichmentRequests},0)}
 next(){const row=this.sql.exec("SELECT id FROM research_runs WHERE status IN ('queued','checking','searching','enriching','retry_wait') ORDER BY due,created LIMIT 1").toArray()[0];return row?this.get(row.id):null}
 list(offset=0,limit=20){return this.sql.exec('SELECT data FROM research_runs ORDER BY created DESC,id LIMIT ? OFFSET ?',limit,offset).toArray().map(x=>{const r=JSON.parse(x.data);delete r.known;return r})}
 known(exclude,mode){return this.sql.exec("SELECT j.data FROM research_jobs j JOIN research_runs r ON j.run_id=r.id WHERE r.id<>? AND r.created>=? ORDER BY r.created DESC LIMIT 3000",exclude,new Date(Date.now()-7*86400000).toISOString()).toArray().flatMap(x=>{const j=JSON.parse(x.data);return j.candidate?.mode===mode&&j.candidate.qualification?.eligible&&j.review?.status!=='rejected'?[j.candidate]:[]})}
}
export function publicRun(run,offset=0,limit=20){const {known,requestKey,...rest}=run;return {...rest,jobs:run.jobs.slice(offset,offset+limit),jobPagination:{offset,limit,total:run.jobs.length,hasMore:offset+limit<run.jobs.length}}}
export {active as activeStatuses};
