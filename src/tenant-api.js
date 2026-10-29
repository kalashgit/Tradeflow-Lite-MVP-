import {verifyBearerToken} from './oidc-verifier.js';
import {authorizeBusiness,tenantRecordQuery,AuthorizationError,requireBusinessId} from './tenant-security.js';
const json=(payload,status=200)=>Response.json(payload,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Authorization'}});
export async function tenantApi(request,env,options={}){
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/api/v1/'))return null;
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 // The pilot intentionally exposes no record writes, membership changes, or user provisioning.
 if(!env.TF_OIDC_ISSUER||!env.TF_OIDC_AUDIENCE||!env.TF_OIDC_JWKS_URL||!env.TF_DB)
  return json({error:'Secure business API is not configured'},503);
 try{
  const principal=await verifyBearerToken(request,env,options);
  if(url.pathname==='/api/v1/me'){
   const items=await env.TF_DB.prepare(
    'SELECT b.id AS business_id,b.name AS business_name,m.role FROM business_memberships m JOIN businesses b ON b.id=m.business_id WHERE m.issuer=? AND m.subject=? AND m.status=? ORDER BY b.name LIMIT 100'
   ).bind(principal.issuer,principal.subject,'active').all();
   return json({businesses:items.results||[]});
  }
  const match=/^\/api\/v1\/businesses\/([^/]+)\/records\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if(!match)return json({error:'Not found'},404);
  const businessId=requireBusinessId(match[1]);
  const authorization=await authorizeBusiness({db:env.TF_DB,principal,businessId,permission:'records:read'});
  const query=tenantRecordQuery({authorization,table:match[2],recordId:match[3]});
  const item=await env.TF_DB.prepare(query.sql).bind(...query.params).first();
  if(!item||item.deleted_at)return json({error:'Not found'},404);
  return json({id:match[3],type:match[2],revision:item.revision,updatedAt:item.updated_at,record:JSON.parse(item.payload)});
 }catch(error){
  if(error instanceof AuthorizationError)return json({error:error.message},error.status);
  return json({error:'Request could not be completed'},503);
 }
}
