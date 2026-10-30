import {RECORD_TYPES,LEGACY_RECORD_TYPES,FINANCIAL_RECORD_TYPES,recordIdentity} from './record-model.js';
import {classifyOfflineChange} from './offline-conflicts.js';
// Opt-in prerequisite only: the application does not enqueue or drain automatically.
const canonical=x=>JSON.stringify(x,(key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,value[k]])):value);
const clone=x=>JSON.parse(JSON.stringify(x));
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const types=RECORD_TYPES;
export function createSyncQueue({db,businessId,session,transport,now=Date.now,uid=()=>crypto.randomUUID()}){
 if(!/^[A-Za-z0-9_-]{8,80}$/.test(businessId)||!db||!session||!transport)throw Error('Explicit business, session and transport required');
 function mutate(fn,extraStores=[]){return new Promise((resolve,reject)=>{
  const names=['commandLog',...extraStores],tx=db.transaction(names,'readwrite'),store=tx.objectStore('commandLog');let result,error,pending=names.length;const data={};
  tx.oncomplete=()=>resolve(clone(result??null));tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Queue transaction failed'));
  for(const name of names){const req=tx.objectStore(name).getAll();req.onsuccess=()=>{data[name]=req.result;if(--pending)return;try{result=fn(data.commandLog.filter(r=>r.kind==='sync.change'&&r.businessId===businessId),store,Object.fromEntries(extraStores.map(s=>[s,data[s]])))}catch(e){error=e;tx.abort()}}}
 })}
 async function list(){return new Promise((resolve,reject)=>{const tx=db.transaction('commandLog'),req=tx.objectStore('commandLog').getAll();tx.oncomplete=()=>resolve(req.result.filter(r=>r.kind==='sync.change'&&r.businessId===businessId));tx.onabort=tx.onerror=()=>reject(tx.error)})}
 function history(row,event){return [...(row.history||[]).slice(-39),{event,at:now()}]}
 async function authorized(){const current=await session();return current?.status==='signed_in'&&current.businesses?.some(b=>b.business_id===businessId&&['owner','admin','member'].includes(b.role))}
 function enqueue(change){
  if(!change||!types.includes(change.type)||!validId(change.id)||!validId(change.operationId)||!Number.isSafeInteger(change.baseRevision)||change.baseRevision<0||change.baseRevision>2147483646||!change.record||typeof change.record!=='object'||Array.isArray(change.record))throw Error('Invalid queued record');
  if(change.dependsOn!==undefined&&(!Array.isArray(change.dependsOn)||change.dependsOn.some(id=>!validId(id)||id===change.operationId)||new Set(change.dependsOn).size!==change.dependsOn.length))throw Error('Invalid operation dependencies');
  recordIdentity({businessId,type:change.type,id:change.id,record:change.record});
  if(new TextEncoder().encode(JSON.stringify(change.record)).byteLength>30000)throw Error('Record too large');
  const input=clone(change),id='sync:'+businessId+':'+input.operationId;
  return mutate((rows,store)=>{
   const old=rows.find(r=>r.id===id);
   if(old){if(canonical(old.change)!==canonical(input))throw Error('Operation ID reused for different data');return old}
   if(rows.some(r=>r.change.type===input.type&&r.change.id===input.id&&r.status!=='applied'))throw Error('An unresolved edit already exists for this record');
   const row={sequence:Math.max(0,...rows.map(r=>r.sequence||0))+1,id,kind:'sync.change',businessId,change:input,status:'pending',attempts:0,nextAttemptAt:0,createdAt:now(),history:[{event:'queued',at:now()}]};store.put(row);return row;
  });
 }
 async function claim(operationIds){return mutate((rows,store)=>{
  const row=rows.filter(r=>(!operationIds||operationIds.includes(r.change.operationId))&&(r.change.dependsOn||[]).every(id=>rows.some(p=>p.change.operationId===id&&p.status==='applied'))&&(r.status==='pending'||r.status==='sending'&&r.leaseUntil<=now())&&r.nextAttemptAt<=now()).sort((a,b)=>a.createdAt-b.createdAt||(a.sequence||0)-(b.sequence||0))[0];if(!row)return null;
  const next={...row,status:'sending',lease:uid(),leaseUntil:now()+30000,attempts:row.attempts+1,history:history(row,'attempt')};store.put(next);return next;
 })}
 async function update(row,changes){return mutate((rows,store)=>{
  const active=rows.find(r=>r.id===row.id);if(!active||active.lease!==row.lease)return null;
  const next={...active,...changes,lease:null,leaseUntil:0,history:history(active,changes.status)};store.put(next);return next;
 })}
 async function remoteRecord(row){
  const response=await transport.read(row.change.type,row.change.id);
  if(response.status===404)return null;
  if(response.status!==200){const error=Error('Remote read failed');error.status=response.status;throw error}
  const remote=response.record;
  if(!remote||remote.businessId!==businessId||remote.type!==row.change.type||remote.id!==row.change.id||!Number.isSafeInteger(remote.revision)||remote.revision<1||!remote.record)throw Error('Remote identity or revision mismatch');
  return remote;
 }
 async function drain({limit=10,operationIds}={}){
  if(operationIds!==undefined&&(!Array.isArray(operationIds)||operationIds.length>200||operationIds.some(id=>!validId(id))))throw Error('Invalid approved operation selection');
  if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Drain limit must be 1–20');
  if(!await authorized())return {status:'authorization_required',processed:0};
  let processed=0;
  while(processed<limit){
   // Session and business permission checked anew for each operation; API is authoritative at write.
   if(!await authorized())return {status:'authorization_required',processed};
   const row=await claim(operationIds);if(!row)break;processed++;
   try{
    const current=await session(),supported=Array.isArray(current?.capabilities?.recordTypes)?current.capabilities.recordTypes:LEGACY_RECORD_TYPES;
    if(!supported.includes(row.change.type)){await update(row,{status:'pending',reason:'Server schema upgrade required',nextAttemptAt:now()+60000});return {status:'server_schema_required',processed}}
    if(FINANCIAL_RECORD_TYPES.includes(row.change.type)&&!current.businesses.some(b=>b.business_id===businessId&&['owner','admin'].includes(b.role))){await update(row,{status:'pending',reason:'Financial record permission required',nextAttemptAt:now()+60000});return {status:'authorization_required',processed}}
    const remote=await remoteRecord(row),change={...row.change,businessId};
    const same=remote&&!remote.deletedAt&&remote.revision>change.baseRevision&&canonical(remote.record)===canonical(change.record);
    if(same){await update(row,{status:'applied',result:'already_current',remoteRevision:remote.revision});continue}
    const decision=classifyOfflineChange(change,remote);
    if(decision.status!=='ready'){await update(row,{status:decision.status==='conflict'?'conflict':'failed',reason:decision.reason||'Invalid remote state',remoteRevision:remote?.revision||null});continue}
    if(!await authorized()){await update(row,{status:'pending',reason:'Session changed before execution'});return {status:'authorization_required',processed}}
    const response=await transport.write(change.type,change.id,{revision:change.baseRevision,record:change.record});
    if(response.status===409){await update(row,{status:'conflict',reason:'Record changed before write'});continue}
    if(![200,201].includes(response.status)){const error=Error('Remote write failed');error.status=response.status;throw error}
    // A successful HTTP response alone is insufficient: read back the committed record.
    const verified=await remoteRecord(row);
    if(!verified||verified.deletedAt||verified.revision!==change.baseRevision+1||canonical(verified.record)!==canonical(change.record))throw Error('Write result could not be verified');
    await update(row,{status:'applied',result:'verified_write',remoteRevision:verified.revision});
   }catch(error){
    const auth=[401,403].includes(error.status),terminal=row.attempts>=5;
    await update(row,{status:terminal?'failed':'pending',reason:auth?'Authentication or business permission required':String(error.message).slice(0,200),nextAttemptAt:now()+Math.min(60000,1000*2**Math.min(6,row.attempts))});
    // No further writes after authentication errors, transport failures or rate limiting.
    return {status:auth?'authorization_required':'retry_pending',processed};
   }
  }
  return {status:'drained',processed};
 }
 async function resolve(id,propose,approve){
  const reviewedSession=await session();
  const canReview=(s,type)=>s?.status==='signed_in'&&s.businesses?.some(b=>b.business_id===businessId&&
   (FINANCIAL_RECORD_TYPES.includes(type)?['owner','admin']:['owner','admin','member']).includes(b.role));
  if(!canReview(reviewedSession,null))throw Error('Authorized session required');
  const row=(await list()).find(r=>r.id===id);if(!row||!['conflict','failed'].includes(row.status))throw Error('No reviewable conflict');
  if(!canReview(reviewedSession,row.change?.type))throw Error('Financial record review requires owner or admin');
  const remote=await remoteRecord(row);
  if(!remote||remote.deletedAt)throw Error('Missing/deleted remote record requires manual recovery');
  // Snapshot and validate the exact proposed record before awaiting approval.
  // A caller may mutate its original object while a modal is open.
  if(!propose||typeof propose!=='object'||Array.isArray(propose))throw Error('Invalid resolution');
  const reviewedProposal=clone(propose);
  recordIdentity({businessId,type:row.change.type,id:row.change.id,record:reviewedProposal});
  if(new TextEncoder().encode(JSON.stringify(reviewedProposal)).byteLength>30000)throw Error('Resolution too large');
  // An async review may outlive revocation or a competing cloud edit.
  if(!await approve({local:clone(row.change.record),remote:clone(remote),proposed:clone(reviewedProposal)}))return {status:'cancelled'};
  const currentSession=await session();
  if(!canReview(currentSession,row.change.type))throw Error('Authorized session changed during conflict review');
  // Where identity is supplied, a different signed-in principal cannot inherit a review.
  const ownerId=s=>s?.identity?.issuer&&s?.identity?.subject?
   s.identity.issuer+':'+s.identity.subject:null;
  if(ownerId(reviewedSession)!==ownerId(currentSession))throw Error('Reviewing principal changed during conflict review');
  const latest=await remoteRecord(row);
  if(!latest||latest.deletedAt||latest.revision!==remote.revision||
    canonical(latest.record)!==canonical(remote.record))
   throw Error('Remote record changed during conflict review; restart review');
  return mutate((rows,store)=>{
   const current=rows.find(r=>r.id===id);if(!current||canonical(current)!==canonical(row))throw Error('Conflict changed during review');
   const next={...current,status:'pending',change:{...current.change,baseRevision:remote.revision,record:reviewedProposal},attempts:0,nextAttemptAt:0,history:history(current,'conflict_reviewed')};store.put(next);return next;
  });
 }
 async function stageMigration({changes,expectedStores,expectedIdentity,approve,backupConfirmed,backupChecksum}){
  if(backupConfirmed!==true||!/^[a-f0-9]{64}$/.test(backupChecksum||'')||typeof approve!=='function')throw Error('Saved backup confirmation and explicit approval required');
  if(!Array.isArray(changes)||changes.length>200||changes.length===0||Object.keys(expectedStores||{}).sort().join(',')!==types.slice().sort().join(','))throw Error('Invalid migration batch');
  const current=await session(),sameOwner=s=>s?.status==='signed_in'&&s.identity?.issuer===expectedIdentity?.issuer&&s.identity?.subject===expectedIdentity?.subject&&s.businesses?.some(b=>b.business_id===businessId&&b.role==='owner');
  if(typeof expectedIdentity?.issuer!=='string'||!expectedIdentity.issuer||typeof expectedIdentity?.subject!=='string'||!expectedIdentity.subject||!sameOwner(current))throw Error('Verified owner session changed');
  const supported=current.capabilities?.recordTypes||LEGACY_RECORD_TYPES;
  for(const c of changes){if(!types.includes(c.type)||!supported.includes(c.type)||!validId(c.id)||!validId(c.operationId)||c.baseRevision!==0||!c.record||typeof c.record!=='object'||Array.isArray(c.record)||c.record.id&&c.record.id!==c.id||c.record.businessId&&c.record.businessId!==businessId||new TextEncoder().encode(JSON.stringify(c.record)).byteLength>30000||c.dependsOn!==undefined&&(!Array.isArray(c.dependsOn)||c.dependsOn.some(id=>!validId(id))))throw Error('Invalid reviewed change')}
  if(new Set(changes.map(c=>c.operationId)).size!==changes.length||new Set(changes.map(c=>c.type+':'+c.id)).size!==changes.length)throw Error('Duplicate migration change');
  if(await approve({businessId,count:changes.length,identity:clone(expectedIdentity)})!==true)return {status:'cancelled'};
  if(!sameOwner(await session()))throw Error('Verified owner session changed');
  return mutate((rows,store,actual)=>{
   if(canonical(actual)!==canonical(expectedStores))throw Error('Local records changed during review; prepare a new review');
   const known=new Set(rows.filter(r=>r.status==='applied').map(r=>r.change.operationId)),pending=changes.slice();
   while(pending.length){const index=pending.findIndex(c=>(c.dependsOn||[]).every(id=>known.has(id)));if(index<0)throw Error('Cyclic or unapproved migration dependency');known.add(pending.splice(index,1)[0].operationId)}
   const reviewId='sync-review:'+businessId+':'+uid();store.put({id:reviewId,kind:'sync.review',businessId,approvedBy:clone(expectedIdentity),backupChecksum,operationIds:changes.map(c=>c.operationId),createdAt:now()});
   const staged=[];let sequence=Math.max(0,...rows.map(r=>r.sequence||0));
   for(const change of changes){
    const input=clone(change),id='sync:'+businessId+':'+input.operationId,old=rows.find(r=>r.id===id);
    if(old){const strip=c=>{const v=clone(c);delete v.dependsOn;return v};if(canonical(strip(old.change))!==canonical(strip(input)))throw Error('Operation changed since review');if((old.change.dependsOn||[]).some(id=>!known.has(id)))throw Error('Previous transfer dependency requires review');let reused=old;if(['failed','conflict'].includes(old.status)){reused={...old,status:'pending',attempts:0,nextAttemptAt:0,lease:null,leaseUntil:0,history:history(old,'migration_reapproved')};store.put(reused)}staged.push(reused);continue}
    if(rows.some(r=>r.change.type===input.type&&r.change.id===input.id&&r.status!=='applied'))throw Error('Another unresolved edit exists for this record');
    const row={id,kind:'sync.change',businessId,change:input,status:'pending',sequence:++sequence,attempts:0,nextAttemptAt:0,createdAt:now(),approvedBy:clone(expectedIdentity),backupChecksum,history:[{event:'migration_reviewed',at:now()}]};store.put(row);rows.push(row);staged.push(row);
   }
   return {status:'staged',reviewId,operationIds:staged.map(r=>r.change.operationId)};
  },types);
 }
 return Object.freeze({enqueue,list,drain,resolve,stageMigration});
}
// Pure read-only projection: never equate local queue persistence with remote commit.
export function summarizeSyncIntents(rows,businessId){
 if(!Array.isArray(rows)||typeof businessId!=='string'||!/^[-_A-Za-z0-9]{8,80}$/.test(businessId))
  throw Error('Explicit business and queue snapshot required');
 const states=Object.freeze({
  pending:'queued_local',sending:'syncing_unverified',conflict:'conflict_needs_review',
  failed:'failed_needs_review',applied:'committed_verified'
 });
 const items=rows.filter(r=>r?.kind==='sync.change'&&r.businessId===businessId).map(row=>{
  let state=states[row.status]||'indeterminate';
  let validEnvelope=true;
  try{recordIdentity({businessId,type:row.change?.type,id:row.change?.id,record:row.change?.record})}
  catch{validEnvelope=false}
  if(!validEnvelope||row.change?.operationId==null)state='indeterminate';
  if(state==='committed_verified'&&(!['already_current','verified_write'].includes(row.result)||
    !Number.isSafeInteger(row.remoteRevision)||row.remoteRevision<1))state='indeterminate';
  const ref=row.change&&typeof row.change==='object'?{
   type:row.change.type,id:row.change.id,operationId:row.change.operationId}:null;
  return Object.freeze({id:row.id,...ref,state,remoteRevision:Number.isSafeInteger(row.remoteRevision)?row.remoteRevision:null,
   requiresOwnerReview:['conflict_needs_review','failed_needs_review','indeterminate'].includes(state),
   externalCommitted:state==='committed_verified'});
 });
 const counts={queued_local:0,syncing_unverified:0,conflict_needs_review:0,failed_needs_review:0,
  committed_verified:0,indeterminate:0};
 for(const item of items)counts[item.state]++;
 return Object.freeze({businessId,items:Object.freeze(items),counts:Object.freeze(counts),
  pendingOrUnverified:items.length-counts.committed_verified,
  allRemotelyVerified:items.length>0&&counts.committed_verified===items.length});
}

// Same-origin transport never follows an Access redirect into an HTML login response.
export function createTenantTransport(businessId,fetcher=fetch){
 if(!/^[A-Za-z0-9_-]{8,80}$/.test(businessId))throw Error('Invalid business');
 async function request(type,id,body){
  if(!types.includes(type)||!validId(id))throw Error('Invalid record identity');
  const response=await fetcher('/api/v1/businesses/'+businessId+'/records/'+type+'/'+id,{method:body?'PUT':'GET',credentials:'same-origin',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000),headers:body?{'Content-Type':'application/json',Accept:'application/json'}:{Accept:'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(response.type==='opaqueredirect'||[0,302,303,307].includes(response.status))return {status:401};
  if(!response.ok)return {status:response.status};
  const data=await response.json();
  if(data.id!==id||data.type!==type)throw Error('Server response identity mismatch');
  return {status:response.status,record:body?null:{businessId,type,id,revision:data.revision,record:data.record,deletedAt:data.deletedAt}};
 }
 async function list(type,after=''){
  if(!types.includes(type)||after&&!validId(after))throw Error('Invalid catalogue request');
  const url='/api/v1/businesses/'+businessId+'/records/'+type+(after?'?after='+encodeURIComponent(after):'');
  const response=await fetcher(url,{method:'GET',credentials:'same-origin',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
  if(response.type==='opaqueredirect'||[0,301,302,303,307,308].includes(response.status))return {status:401};
  if(!response.ok)return {status:response.status};
  const data=await response.json();
  if(data.businessId!==businessId||data.type!==type||!Array.isArray(data.items)||data.items.length>50||
   data.items.some(row=>!validId(row?.id)||!Number.isSafeInteger(row.revision)||row.revision<1||!row.record||typeof row.record!=='object'||Array.isArray(row.record))||
   data.nextCursor!==null&&(!validId(data.nextCursor)||data.items.length===0||data.nextCursor!==data.items[data.items.length-1].id))
   throw Error('Server catalogue response invalid');
  return {status:response.status,items:data.items,nextCursor:data.nextCursor};
 }
 return {read:(type,id)=>request(type,id),write:(type,id,body)=>request(type,id,body),list};
}
