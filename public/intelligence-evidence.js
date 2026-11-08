import {recordIdentity,linksForRecord} from './record-model.js';
export const EVIDENCE_FIELDS=Object.freeze({
 customers:['name','company'],opportunities:['title','name','status','category'],
 jobs:['title','status','customerId','quoteId','opportunityId','crewId','date','scheduledDate'],
 crew:['name','role','status'],tasks:['title','status','taskKind','due','jobId','customerId','quoteId','invoiceId'],
 quotes:['title','status','customerId','jobId','opportunityId','amount','currency'],
 jobCosts:['jobId','customerId','category','type','amount','currency','laborHours'],
 expenses:['jobId','customerId','relatedId','amount','currency','category'],
 invoices:['number','status','customerId','jobId','quoteId','dueDate','currency','taxRate'],
 payments:['invoiceId','customerId','jobId','amount','currency','date']
});
Object.values(EVIDENCE_FIELDS).forEach(Object.freeze);
export const canonical=value=>JSON.stringify(value,(key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,v[k]])):v);
export const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)))),b=>b.toString(16).padStart(2,'0')).join('');
export const copy=x=>JSON.parse(JSON.stringify(x));
export function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x}
export function evidenceTypes(role){return ['owner','admin'].includes(role)?Object.keys(EVIDENCE_FIELDS):['member','viewer'].includes(role)?['customers','opportunities','jobs','crew','tasks']:[]}
export function projectEvidenceRecord(type,record){
 if(!EVIDENCE_FIELDS[type])throw Error('Unsupported evidence type');
 const bound=message=>{const error=Error(message);error.status=413;throw error};
 const scalar=v=>{if(typeof v==='string'){if(v.length>240)bound('Context field exceeds safe bounds; review source record');return v}if(typeof v==='number'&&Number.isFinite(v)||v===null)return v};
 const out={};for(const field of EVIDENCE_FIELDS[type]){const v=scalar(record[field]);if(v!==undefined)out[field]=v}
 if(type==='invoices'&&Array.isArray(record.lines)){if(record.lines.length>100)bound('Invoice context exceeds safe line limit');out.lines=record.lines.map(l=>({qty:scalar(l?.qty),unitPrice:scalar(l?.unitPrice)}))}
 return out;
}
export function evidenceLinks(records){
 const byKey=new Map(records.map(r=>[r.type+':'+r.id,r])),missing=[],warnings=[],edges=[];
 for(const r of records)if(r.type==='expenses'&&r.record.relatedId&&!r.record.jobId)warnings.push({from:{type:r.type,id:r.id},field:'relatedId',code:'legacy_expense_link_needs_review'});
 for(const r of records)for(const [field,type]of linksForRecord(r.record)){
  const target=byKey.get(type+':'+r.record[field]);edges.push({from:{type:r.type,id:r.id},field,to:{type,id:r.record[field]},available:!!target});
  if(!target)missing.push({from:{type:r.type,id:r.id},field,status:'withheld_or_unavailable'});
  else if(r.record.customerId&&target.record.customerId&&r.record.customerId!==target.record.customerId)warnings.push({from:{type:r.type,id:r.id},field,code:'customer_link_mismatch'});
 }
 return {missing,warnings,edges};
}
// Explicit device-local compatibility, never an authenticated company identity.
export async function localEvidence(snapshot,scope){
 if(scope?.mode!=='local'||scope.actor!=='local-owner'||scope.businessId!=='local-business')throw Error('Explicit device-local owner scope required');
 let selected=[];for(const type of evidenceTypes('owner'))for(const raw of snapshot[type]||[]){if(raw.businessId&&raw.businessId!==scope.businessId)continue;selected.push({type,id:raw.id,record:raw})}
 if(scope.jobId){const included=new Set(['jobs:'+scope.jobId]),map=new Map(selected.map(r=>[r.type+':'+r.id,r]));if(!map.has('jobs:'+scope.jobId))throw Error('Job unavailable in this scope');
  for(const r of selected)if(r.record.jobId===scope.jobId||r.type==='expenses'&&r.record.relatedId===scope.jobId)included.add(r.type+':'+r.id);
  let count=-1;while(count!==included.size){count=included.size;for(const key of [...included])for(const [field,type]of linksForRecord(map.get(key).record)){const ref=type+':'+map.get(key).record[field];if(map.has(ref))included.add(ref)}}
  selected=selected.filter(r=>included.has(r.type+':'+r.id));
 }
 if(selected.length>200)throw Error('Decision evidence exceeds 200 records; no partial summary');
 const records=[];for(const entry of selected){const {type,id,record:raw}=entry;recordIdentity({businessId:scope.businessId,type,id,record:raw});const {photoData,...source}=raw,record=projectEvidenceRecord(type,raw);if(new TextEncoder().encode(canonical(source)).byteLength>30000)throw Error('Source record exceeds bounded decision evidence');
  records.push({type,id,revision:null,contentHash:await digest(source),evidenceHash:await digest(record),provenance:'local_device_record',record});
 }
 return {kind:'tradeflow.intelligence.local-context.v1',businessId:scope.businessId,identity:{actor:scope.actor},authentication:'device_local_only',scope:scope.jobId?{jobId:scope.jobId}:{company:true},readOnly:true,executionAuthority:false,records};
}
export async function validateEvidence(context,scope){
 if(!context||context.businessId!==scope?.businessId||context.readOnly!==true||context.executionAuthority!==false||!Array.isArray(context.records)||context.records.length>200)throw Error('Evidence scope or authority invalid');
 const local=context.kind==='tradeflow.intelligence.local-context.v1';
 if(local){if(scope.mode!=='local'||scope.actor!=='local-owner'||scope.businessId!=='local-business'||context.identity?.actor!==scope.actor)throw Error('Local owner scope changed')}
 else if(context.kind!=='tradeflow.intelligence.context.v1'||scope.mode!=='cloud'||!evidenceTypes(scope.role).length||context.permission?.role!==scope.role||!scope.identity?.issuer||!scope.identity.subject||canonical(context.identity)!==canonical(scope.identity))throw Error('Verified company identity or role changed');
 if(scope.jobId?context.scope?.jobId!==scope.jobId:context.scope?.company!==true)throw Error('Evidence job scope changed');
 const keys=new Set(),types=evidenceTypes(local?'owner':scope.role);
 for(const r of context.records){const ref=recordIdentity({businessId:scope.businessId,type:r.type,id:r.id,record:r.record});if(keys.has(ref.key)||!types.includes(r.type))throw Error('Duplicate or unauthorized evidence');keys.add(ref.key);
  if(canonical(projectEvidenceRecord(r.type,r.record))!==canonical(r.record))throw Error('Evidence includes unapproved fields');
  if(local){if(r.revision!==null||r.provenance!=='local_device_record'||!/^[a-f0-9]{64}$/.test(r.contentHash||'')||r.evidenceHash!==await digest(r.record))throw Error('Local evidence fingerprint invalid')}
  else if(!Number.isSafeInteger(r.revision)||r.revision<1||r.provenance!=='tenant_record'||r.contentTrust!=='untrusted_record_content'||typeof r.updatedAt!=='string')throw Error('Cloud evidence provenance invalid');
 }
 return {local,links:evidenceLinks(context.records)};
}
