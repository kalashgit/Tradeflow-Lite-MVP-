import {readIntelligenceContext} from './intelligence-context.js';
import {recordWritePermission} from '../public/record-permissions.js';
import {schemaCapabilities} from './schema-capabilities.js';
import {RECORD_TYPES,LEGACY_RECORD_TYPES} from '../public/record-model.js';
import {planTenantRestore} from './tenant-restore-plan.js';
import {exportTenantSnapshot} from './tenant-export.js';
import {writeTenantRecord} from './tenant-record-store.js';
import {verifyBearerToken} from './oidc-verifier.js';
import {authorizeBusiness,tenantRecordQuery,AuthorizationError,requireBusinessId} from './tenant-security.js';
const json=(payload,status=200)=>Response.json(payload,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Authorization'}});
export async function tenantApi(request,env,options={}){
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/api/v1/'))return null;
 if(!['GET','PUT','POST'].includes(request.method))return json({error:'Method not allowed'},405);
 if(request.method==='PUT' && !/^\/api\/v1\/businesses\/[^/]+\/records\/[^/]+\/[^/]+$/.test(url.pathname))return json({error:'Method not allowed'},405);
 if(request.method==='POST' && !/^\/api\/v1\/businesses\/[^/]+\/backup\/dry-run$/.test(url.pathname))return json({error:'Method not allowed'},405);
 // No membership changes, self-provisioning, automatic backup storage, or restore.
 if(!env.TF_OIDC_ISSUER||!env.TF_OIDC_AUDIENCE||!env.TF_OIDC_JWKS_URL||!env.TF_DB)
  return json({error:'Secure business API is not configured'},503);
 try{
  const principal=await verifyBearerToken(request,env,options);
  if(url.pathname==='/api/v1/session/login'){
   if(request.method!=='GET')return json({error:'Method not allowed'},405);
   // Access handles login before this route; only a verified assertion can return to the app.
   return new Response(null,{status:303,headers:{Location:'/?account=connected','Cache-Control':'no-store'}});
  }
  if(url.pathname==='/api/v1/me'){
   if(request.method!=='GET')return json({error:'Method not allowed'},405);
   const items=await env.TF_DB.prepare(
    'SELECT b.id AS business_id,b.name AS business_name,m.role FROM business_memberships m JOIN businesses b ON b.id=m.business_id WHERE m.issuer=? AND m.subject=? AND m.status=? ORDER BY b.name LIMIT 100'
   ).bind(principal.issuer,principal.subject,'active').all();
   return json({identity:{issuer:principal.issuer,subject:principal.subject},businesses:items.results||[],capabilities:await schemaCapabilities(env)});
  }
  const contextRoute=/^\/api\/v1\/businesses\/([^/]+)\/intelligence\/context$/.exec(url.pathname);
  if(contextRoute){
   if(request.method!=='GET')return json({error:'Method not allowed'},405);
   if([...url.searchParams.keys()].some(key=>key!=='jobId')||url.searchParams.getAll('jobId').length>1)return json({error:'Unsupported context parameter'},400);
   return json(await readIntelligenceContext({db:env.TF_DB,principal,businessId:requireBusinessId(contextRoute[1]),...(url.searchParams.has('jobId')?{jobId:url.searchParams.get('jobId')}:{})}));
  }
  const preview=/^\/api\/v1\/businesses\/([^/]+)\/backup\/dry-run$/.exec(url.pathname);
  if(preview){
   if(request.method!=='POST')return json({error:'Method not allowed'},405);
   if(env.TF_BACKUP_DRY_RUN_ENABLED!=='true')return json({error:'Recovery dry-run is not enabled'},503);
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return json({error:'JSON required'},415);
   if(!request.body)return json({error:'Backup body required'},400);
   const authorization=await authorizeBusiness({db:env.TF_DB,principal,businessId:requireBusinessId(preview[1]),permission:'members:manage'});
   let size=0,parts=[];const reader=request.body.getReader();
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1000000)return json({error:'Backup too large for dry-run'},413);parts.push(value)}}finally{reader.releaseLock()}
   const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength}
   let snapshot;try{snapshot=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{return json({error:'Invalid backup JSON'},400)}
   return json(await planTenantRestore(env.TF_DB,authorization,snapshot));
  }
  const backup=/^\/api\/v1\/businesses\/([^/]+)\/backup$/.exec(url.pathname);
  if(backup){
   if(env.TF_BACKUP_EXPORT_ENABLED!=='true')return json({error:'Backup export is not enabled'},503);
   const businessId=requireBusinessId(backup[1]);
   const permission=await authorizeBusiness({db:env.TF_DB,principal,businessId,permission:'members:manage'});
   const snapshot=await exportTenantSnapshot(env.TF_DB,permission);
   return new Response(JSON.stringify(snapshot),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="tradeflow-tenant-backup.json"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Authorization'}});
  }
  // Explicit, read-only cloud catalogue for a future reviewed device retrieval.
  // Stable ID cursor and bounded pages; never silently claim a complete snapshot.
  const catalogue=/^\/api\/v1\/businesses\/([^/]+)\/records\/([^/]+)$/.exec(url.pathname);
  if(catalogue){
   if(request.method!=='GET')return json({error:'Method not allowed'},405);
   const businessId=requireBusinessId(catalogue[1]),type=catalogue[2];
   if(!RECORD_TYPES.includes(type)||!LEGACY_RECORD_TYPES.includes(type)&&!(await schemaCapabilities(env)).recordTypes.includes(type))
    return json({error:'Record type is unavailable in the current server schema'},400);
   const authorization=await authorizeBusiness({db:env.TF_DB,principal,businessId,permission:'records:read'});
   const cursor=url.searchParams.get('after')||'';
   if(cursor&&!/^[A-Za-z0-9_-]{1,100}$/.test(cursor))return json({error:'Invalid record cursor'},400);
   if([...url.searchParams.keys()].some(key=>key!=='after'))return json({error:'Unsupported catalogue parameter'},400);
   const page=await env.TF_DB.prepare(
    'SELECT id,revision,updated_at,payload FROM tenant_records WHERE business_id=? AND record_type=? AND id>? AND deleted_at IS NULL ORDER BY id LIMIT 51'
   ).bind(authorization.businessId,type,cursor).all();
   const rows=page.results||[];
   if(!Array.isArray(rows)||rows.length>51)return json({error:'Invalid record catalogue result'},503);
   const items=rows.slice(0,50).map(row=>({id:row.id,revision:row.revision,updatedAt:row.updated_at,record:JSON.parse(row.payload)}));
   return json({businessId,type,items,nextCursor:rows.length>50?items[items.length-1].id:null});
  }
  const match=/^\/api\/v1\/businesses\/([^/]+)\/records\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if(!match)return json({error:'Not found'},404);
  const businessId=requireBusinessId(match[1]);
  if(!RECORD_TYPES.includes(match[2])||!LEGACY_RECORD_TYPES.includes(match[2])&&!(await schemaCapabilities(env)).recordTypes.includes(match[2]))return json({error:'Record type is unavailable in the current server schema'},400);
  const authorization=await authorizeBusiness({db:env.TF_DB,principal,businessId,permission:request.method==='PUT'?recordWritePermission(match[2]):'records:read'});
  if(request.method==='PUT'){
   if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))return json({error:'JSON required'},415);
   if(!request.body)return json({error:'JSON body required'},400);
   let raw='';const stream=request.body.pipeThrough(new TextDecoderStream());
   for await(const part of stream){raw+=part;if(raw.length>32000)return json({error:'Request too large'},413)}
   let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
   const saved=await writeTenantRecord(env.TF_DB,authorization,match[2],match[3],body);
   return json({id:match[3],type:match[2],...saved},saved.revision===1?201:200);
  }
  const query=tenantRecordQuery({authorization,table:match[2],recordId:match[3]});
  const item=await env.TF_DB.prepare(query.sql).bind(...query.params).first();
  if(!item||item.deleted_at)return json({error:'Not found'},404);
  return json({id:match[3],type:match[2],revision:item.revision,updatedAt:item.updated_at,record:JSON.parse(item.payload)});
 }catch(error){
  if(error instanceof AuthorizationError)return json({error:error.message},error.status);
  return json({error:'Request could not be completed'},503);
 }
}
