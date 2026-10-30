import {authorizeBusiness,AuthorizationError} from './tenant-security.js';
import {linksForRecord,recordIdentity} from '../public/record-model.js';
// A bounded, single-query company snapshot. Recheck membership before returning;
// client/model-supplied role, record lists and account identity are never inputs.
export const CONTEXT_READ_SQL =`SELECT record_type,id,revision,updated_at,payload
 FROM tenant_records WHERE business_id=? AND deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM business_memberships WHERE business_id=? AND issuer=?
 AND subject=? AND status='active' AND role=?)
 AND record_type IN (/* permitted-types */)
 ORDER BY record_type,id LIMIT 201`;
const fields={
 customers:['name','company'],opportunities:['title','name','status','category'],
 jobs:['title','status','customerId','quoteId','opportunityId','crewId','date','scheduledDate'],
 crew:['name','role','status'],tasks:['title','status','due','jobId','customerId','quoteId','invoiceId'],
 quotes:['title','status','customerId','jobId','opportunityId','amount','currency'],
 jobCosts:['jobId','category','type','amount','currency','laborHours'],
 invoices:['number','status','customerId','jobId','quoteId','dueDate','currency','taxRate'],
 payments:['invoiceId','customerId','jobId','amount','currency','date']
};
const limited=new Set(['customers','opportunities','jobs','crew','tasks']);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
function sanitize(type,record){
 const scalar=v=>{if(typeof v==='string'){if(v.length>240)throw new AuthorizationError('Context field exceeds safe bounds; review source record',413);return v}if(typeof v==='number'&&Number.isFinite(v)||v===null)return v;return undefined};
 const out={};for(const field of fields[type]){const value=scalar(record[field]);if(value!==undefined)out[field]=value;}
 // Preserve invalid/missing numeric fields for the existing detectors to flag;
 // never drop bad lines and make an invoice appear smaller or valid.
 if(type==='invoices'&&Array.isArray(record.lines)){
  if(record.lines.length>100)throw new AuthorizationError('Invoice context exceeds safe line limit',413);
  out.lines=record.lines.map(l=>({qty:scalar(l?.qty),unitPrice:scalar(l?.unitPrice)}));
 }
 return out;
}

export async function readIntelligenceContext({db,principal,businessId,jobId,now=()=>new Date().toISOString()}){
 if(jobId!==undefined&&!id(jobId))throw new AuthorizationError('Invalid job identifier',400);
 const auth=await authorizeBusiness({db,principal,businessId,permission:'records:read'});
 const privileged=['owner','admin'].includes(auth.role),allowed=Object.keys(fields).filter(t=>privileged||limited.has(t));
 const response=await db.prepare(CONTEXT_READ_SQL.replace('/* permitted-types */',allowed.map(()=>'?').join(','))).bind(auth.businessId,auth.businessId,auth.issuer,auth.subject,auth.role,...allowed).all();
 if(!Array.isArray(response?.results)||response.results.length>200)throw new AuthorizationError('Context exceeds the bounded snapshot; use a smaller dataset',413);
 const byKey=new Map();
 for(const row of response.results){
  if(!allowed.includes(row.record_type))continue;
  let record;try{record=JSON.parse(row.payload);recordIdentity({businessId:auth.businessId,type:row.record_type,id:row.id,record})}catch{throw new AuthorizationError('Context record identity or payload is invalid',503)}
  if(!Number.isSafeInteger(row.revision)||row.revision<1||typeof row.updated_at!=='string')throw new AuthorizationError('Context provenance is unavailable',503);
  const key=row.record_type+':'+row.id;if(byKey.has(key))throw new AuthorizationError('Duplicate context identity',503);
  byKey.set(key,{type:row.record_type,id:row.id,revision:row.revision,updatedAt:row.updated_at,record});
 }
 let selected=[...byKey.values()];
 if(jobId!==undefined){
  const job=byKey.get('jobs:'+jobId);if(!job)throw new AuthorizationError('Job unavailable',404);
  const included=new Set(['jobs:'+jobId]);for(const r of selected)if(r.record.jobId===jobId)included.add(r.type+':'+r.id);
  let previous=-1;while(previous!==included.size){previous=included.size;for(const key of [...included])for(const [field,type]of linksForRecord(byKey.get(key).record)){const ref=type+':'+byKey.get(key).record[field];if(byKey.has(ref))included.add(ref)}}
  selected=selected.filter(r=>included.has(r.type+':'+r.id));
 }
 const latest=await authorizeBusiness({db,principal,businessId,permission:'records:read'});
 if(latest.role!==auth.role)throw new AuthorizationError('Membership changed during context review',403);
 const keys=new Set(selected.map(r=>r.type+':'+r.id)),missingReferences=[],relationshipWarnings=[];
 for(const r of selected)for(const [field,type]of linksForRecord(r.record))if(!keys.has(type+':'+r.record[field]))missingReferences.push({from:{type:r.type,id:r.id,revision:r.revision},field,status:'withheld_or_unavailable'});
 for(const r of selected)for(const [field,type]of linksForRecord(r.record)){const parent=byKey.get(type+':'+r.record[field]);if(keys.has(type+':'+r.record[field])&&r.record.customerId&&parent?.record.customerId&&r.record.customerId!==parent.record.customerId)relationshipWarnings.push({from:{type:r.type,id:r.id,revision:r.revision},field,code:'customer_link_mismatch',action:'review_required'})}
 return {kind:'tradeflow.intelligence.context.v1',businessId:auth.businessId,identity:{issuer:auth.issuer,subject:auth.subject},scope:jobId?{jobId}:{company:true},generatedAt:now(),readOnly:true,
  permission:{role:auth.role,allowedRecordTypes:allowed},records:selected.map(r=>({type:r.type,id:r.id,revision:r.revision,updatedAt:r.updatedAt,provenance:'tenant_record',contentTrust:'untrusted_record_content',record:sanitize(r.type,r.record)})),
  missingReferences,relationshipWarnings,limitations:['Bounded current record snapshot, not a historical or complete business audit.','Crew display roles do not grant account permissions.','Recorded payments and labor are not independently verified settlement, payroll or collection.','Missing links may be withheld by permission or unavailable; do not invent their contents.'],
  executionAuthority:false,providerSettlementVerified:false};
}
