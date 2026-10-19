import {DurableObject} from 'cloudflare:workers';
import {ResearchCoordinator,SqliteResearchStore,publicRun,JobError,activeStatuses} from './discovery-jobs.mjs';
import {createConfiguredProvider,handleDiscoveryRequest} from './discovery-api.mjs';
export class DiscoveryWorkspace extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.store=new SqliteResearchStore(ctx.storage.sql);this.coordinator=new ResearchCoordinator({store:this.store,provider:{check:async()=>createConfiguredProvider(env).check(),search:(criteria,query)=>this.request('search',{criteria,query,candidateLimit:20}),enrich:(criteria,candidate)=>this.request('enrich',{criteria,candidate})}})}
 async request(path,input){const response=await handleDiscoveryRequest(new Request('https://research.internal/api/discovery/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,code:this.env.TF_AI_PREVIEW_TOKEN||this.env.TF_DISCOVERY_ACCESS_TOKEN})}),this.env);const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error?.message||'Research provider request failed.'),result.error||{});return result}
 async dispatch(action,input){
  const offset=Number(input.offset||0),limit=Number(input.limit||20);if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw new JobError('Invalid pagination.');
  let run;
  if(action==='create'){if((this.env.DISCOVERY_PROVIDER||'tavily')==='tavily'&&!this.env.TAVILY_API_KEY)throw new JobError('Research provider is not configured.',503);run=this.coordinator.create({...input,criteria:{...input.criteria,provider:input.criteria?.provider||this.env.DISCOVERY_PROVIDER||'tavily'}})}
  else if(action==='list')return {runs:this.store.list(offset,limit),offset,limit};
  else if(action==='get')run=this.coordinator.mustGet(input.id);
  else if(action==='cancel')run=this.coordinator.cancel(input.id);
  else if(action==='retry')run=this.coordinator.retry(input.id,input.candidateId);
  else if(action==='review')run=this.coordinator.review(input.id,input.candidateId,input.decision||{});
  else throw new JobError('Unknown research action.');
  if(action!=='get')await this.schedule();return {run:publicRun(run,offset,limit)};
 }
 async schedule(){const next=this.store.next();if(next){const due=Math.max(Date.now()+1000,next.nextAttemptAt),alarm=await this.ctx.storage.getAlarm();if(!alarm||alarm>due)await this.ctx.storage.setAlarm(due)}else await this.ctx.storage.deleteAlarm()}
 async alarm(){
  // Watchdog is persisted before network I/O; eviction cannot strand a running stage.
  await this.ctx.storage.setAlarm(Date.now()+120000);
  try{await this.coordinator.step()}finally{await this.schedule()}
 }
}
