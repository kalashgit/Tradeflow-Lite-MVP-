import {authorizeBusiness,authorizedTenantReadQuery,requireVerifiedPrincipal} from './tenant-security.js';
import {recordIdentity} from '../public/record-model.js';
import {evidenceTypes} from '../public/intelligence-evidence.js';
import {requestServerAdvisory} from './advisory-server.js';

// Server-only adapter: bind a verified host principal and the previously
// permission-filtered context. Never accept identity, role or grants from a
// model/client callback. No endpoint, provider or business writer is added.
export function createServerAdvisoryAuthorizer({db,principal,context}={}){
 // Pin every forwarded evidence reference at host construction. Never trust a
 // mutated context or a model-supplied evidence list after an async boundary.
 const evidence=Array.isArray(context?.records)?context.records.map(r=>({type:r?.type,id:r?.id,revision:r?.revision,updatedAt:r?.updatedAt})):null;
 const expected={businessId:context?.businessId,issuer:context?.identity?.issuer,
  subject:context?.identity?.subject,role:context?.permission?.role,
  jobId:context?.scope?.jobId,jobRevision:undefined};
 if(expected.jobId!==undefined){
  const matches=evidence?.filter(r=>r.type==='jobs'&&r.id===expected.jobId)||[];
  expected.jobRevision=matches.length===1?matches[0].revision:null;
 }
 return async request=>{
  try{
   const identity=requireVerifiedPrincipal(principal);
   if(!db||typeof db.prepare!=='function'||!context||
    context.kind!=='tradeflow.intelligence.context.v1'||context.readOnly!==true||
    context.executionAuthority!==false||!expected.role||
    identity.issuer!==expected.issuer||identity.subject!==expected.subject||
    context.businessId!==expected.businessId||
    context.identity?.issuer!==expected.issuer||context.identity?.subject!==expected.subject||
    context.permission?.role!==expected.role||context.scope?.jobId!==expected.jobId||
    request?.purpose!=='read_only_advisory'||request.businessId!==expected.businessId||
    request.principal?.issuer!==expected.issuer||request.principal?.subject!==expected.subject)
    return false;
   if(expected.jobId===undefined){
    if(context.scope?.company!==true||request.scope?.company!==true||request.scope?.jobId!==undefined)return false;
   }else{
    if(request.scope?.jobId!==expected.jobId||expected.jobRevision===null||
      !Number.isSafeInteger(expected.jobRevision)||expected.jobRevision<1||
      context.records?.filter(r=>r?.type==='jobs'&&r.id===expected.jobId).length!==1||
      context.records.find(r=>r?.type==='jobs'&&r.id===expected.jobId).revision!==expected.jobRevision)return false;
   }
   const auth=await authorizeBusiness({db,principal,businessId:expected.businessId,permission:'records:read'});
   if(auth.role!==expected.role)return false;
   // Revalidate every evidence reference, not only the selected job. The
   // existing SQL guard checks active tenant membership during each read;
   // the final role check catches a downgrade during the batch.
   if(!evidence||evidence.length>200||!Array.isArray(context.records)||
      context.records.length!==evidence.length)return false;
   const allowed=new Set(evidenceTypes(auth.role)),seen=new Set();
   for(let i=0;i<evidence.length;i++){
    const item=evidence[i],current=context.records[i],key=item.type+':'+item.id;
    if(!allowed.has(item.type)||!current||current.type!==item.type||
       current.id!==item.id||current.revision!==item.revision||
       current.updatedAt!==item.updatedAt||
       !Number.isSafeInteger(item.revision)||item.revision<1||seen.has(key))return false;
    seen.add(key);
    const query=authorizedTenantReadQuery({authorization:auth,table:item.type,recordId:item.id});
    const row=await db.prepare(query.sql).bind(...query.params).first();
    if(!row||row.deleted_at!=null||row.revision!==item.revision||
       typeof row.payload!=='string'||
       (typeof item.updatedAt==='string'&&row.updated_at!==item.updatedAt))return false;
    recordIdentity({businessId:expected.businessId,type:item.type,id:item.id,record:JSON.parse(row.payload)});
   }
   if(evidence.length){
    const latest=await authorizeBusiness({db,principal,businessId:expected.businessId,permission:'records:read'});
    if(latest.role!==auth.role)return false;
   }
   return true;
  }catch{return false;}
 };
}

// No client-supplied authorization override; mock-only transport gate remains.
export function requestAuthorizedServerAdvisory({db,principal,context,env,intent,transport}={}){
 return requestServerAdvisory({env,principal,context,intent,transport,
  authorize:createServerAdvisoryAuthorizer({db,principal,context})});
}
