import {classifyOfflineChange} from './offline-conflicts.js';
// Opt-in prerequisite only: the application does not enqueue or drain automatically.
const canonical=x=>JSON.stringify(x&&typeof x==='object'?Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):x);
const clone=x=>JSON.parse(JSON.stringify(x));
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const types=['customers','jobs','quotes','invoices'];
export function createSyncQueue({db,businessId,session,transport,now=Date.now,uid=()=>crypto.randomUUID()}){
 if(!/^[A-Za-z0-9_-]{8,80}$/.test(businessId)||!db||!session||!transport)throw Error('Explicit business, session and transport required');
 function mutate(fn){return new Promise((resolve,reject)=>{
  const tx=db.transaction('commandLog','readwrite'),store=tx.objectStore('commandLog'),req=store.getAll();let result,error;
  tx.oncomplete=()=>resolve(clone(result??null));tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Queue transaction failed'));
  req.onsuccess=()=>{try{result=fn(req.result.filter(r=>r.kind==='sync.change'&&r.businessId===businessId),store)}catch(e){error=e;tx.abort()}};
 })}
 async function list(){return new Promise((resolve,reject)=>{const tx=db.transaction('commandLog'),req=tx.objectStore('commandLog').getAll();tx.oncomplete=()=>resolve(req.result.filter(r=>r.kind==='sync.change'&&r.businessId===businessId));tx.onabort=tx.onerror=()=>reject(tx.error)})}
 function history(row,event){return [...(row.history||[]).slice(-39),{event,at:now()}]}
 async function authorized(){const current=await session();return current?.status==='signed_in'&&current.businesses?.some(b=>b.business_id===businessId&&['owner','admin','member'].includes(b.role))}
 function enqueue(change){
  if(!change||!types.includes(change.type)||!validId(change.id)||!validId(change.operationId)||!Number.isSafeInteger(change.baseRevision)||change.baseRevision<0||change.baseRevision>2147483646||!change.record||typeof change.record!=='object'||Array.isArray(change.record))throw Error('Invalid queued record');
  if(change.record.id&&change.record.id!==change.id||change.record.businessId&&change.record.businessId!==businessId)throw Error('Record identity mismatch');
  if(new TextEncoder().encode(JSON.stringify(change.record)).byteLength>30000)throw Error('Record too large');
  const input=clone(change),id='sync:'+businessId+':'+input.operationId;
  return mutate((rows,store)=>{
   const old=rows.find(r=>r.id===id);
   if(old){if(canonical(old.change)!==canonical(input))throw Error('Operation ID reused for different data');return old}
   if(rows.some(r=>r.change.type===input.type&&r.change.id===input.id&&r.status!=='applied'))throw Error('An unresolved edit already exists for this record');
   const row={id,kind:'sync.change',businessId,change:input,status:'pending',attempts:0,nextAttemptAt:0,createdAt:now(),history:[{event:'queued',at:now()}]};store.put(row);return row;
  });
 }
 async function claim(){return mutate((rows,store)=>{
  const row=rows.filter(r=>(r.status==='pending'||r.status==='sending'&&r.leaseUntil<=now())&&r.nextAttemptAt<=now()).sort((a,b)=>a.createdAt-b.createdAt)[0];if(!row)return null;
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
 async function drain({limit=10}={}){
  if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Drain limit must be 1–20');
  if(!await authorized())return {status:'authorization_required',processed:0};
  let processed=0;
  while(processed<limit){
   // Session and business permission checked anew for each operation; API is authoritative at write.
   if(!await authorized())return {status:'authorization_required',processed};
   const row=await claim();if(!row)break;processed++;
   try{
    const remote=await remoteRecord(row),change={...row.change,businessId};
    const same=remote&&!remote.deletedAt&&remote.revision===change.baseRevision+1&&canonical(remote.record)===canonical(change.record);
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
  if(!await authorized())throw Error('Authorized session required');
  const row=(await list()).find(r=>r.id===id);if(!row||!['conflict','failed'].includes(row.status))throw Error('No reviewable conflict');
  const remote=await remoteRecord(row);
  if(!remote||remote.deletedAt)throw Error('Missing/deleted remote record requires manual recovery');
  if(!await approve({local:clone(row.change.record),remote:clone(remote),proposed:clone(propose)}))return {status:'cancelled'};
  return mutate((rows,store)=>{
   const current=rows.find(r=>r.id===id);if(!current||canonical(current)!==canonical(row))throw Error('Conflict changed during review');
   if(!propose||typeof propose!=='object'||Array.isArray(propose)||propose.id&&propose.id!==row.change.id||propose.businessId&&propose.businessId!==businessId)throw Error('Invalid resolution');
   if(new TextEncoder().encode(JSON.stringify(propose)).byteLength>30000)throw Error('Resolution too large');
   const next={...current,status:'pending',change:{...current.change,baseRevision:remote.revision,record:clone(propose)},attempts:0,nextAttemptAt:0,history:history(current,'conflict_reviewed')};store.put(next);return next;
  });
 }
 return Object.freeze({enqueue,list,drain,resolve});
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
 return {read:(type,id)=>request(type,id),write:(type,id,body)=>request(type,id,body)};
}
