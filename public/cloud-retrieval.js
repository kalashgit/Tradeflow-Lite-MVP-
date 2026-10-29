import {RECORD_TYPES,LEGACY_RECORD_TYPES} from './record-model.js';

// Read-only cloud-to-device planning. No IndexedDB transaction, writes or merge decisions.
// Calling code must obtain fresh local records and an authenticated session.
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(s);
const canonical=value=>JSON.stringify(value&&typeof value==='object'
 ?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v)))
 :Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))]))
 :value);
export async function previewCloudRetrieval({businessId,session,localStores,transport,maxRecords=200}){
 if(!validId(businessId)||!session||session.status!=='signed_in'||
  typeof session.identity?.issuer!=='string'||!session.identity.issuer||
  typeof session.identity?.subject!=='string'||!session.identity.subject||
  !session.businesses?.some(b=>b.business_id===businessId&&b.role==='owner'))
  throw Error('Verified business owner required for retrieval review');
 if(!localStores||typeof localStores!=='object'||!transport||typeof transport.list!=='function'||
  !Number.isSafeInteger(maxRecords)||maxRecords<1||maxRecords>200)
  throw Error('Invalid read-only retrieval setup');
 const types=session.capabilities?.recordTypes||LEGACY_RECORD_TYPES;
 if(!Array.isArray(types)||types.some(t=>!RECORD_TYPES.includes(t)))throw Error('Invalid server capabilities');
 const findings=[],seen=new Set();let total=0;
 for(const type of types){
  const local=localStores[type]||[];
  if(!Array.isArray(local))throw Error('Invalid local record store: '+type);
  const byId=new Map();
  for(const item of local){
   if(!item||!validId(item.id)||byId.has(item.id))throw Error('Duplicate or invalid local record');
   byId.set(item.id,item);
  }
  let after='';
  for(let page=0;page<5;page++){
   const response=await transport.list(type,after);
   if(response?.status!==200||!Array.isArray(response.items)||response.items.length>50)
    throw Error('Cloud catalogue unavailable or incomplete; no retrieval approved');
   for(const remote of response.items){
    if(!validId(remote?.id)||!Number.isSafeInteger(remote.revision)||remote.revision<1||
      !remote.record||typeof remote.record!=='object'||Array.isArray(remote.record)||
      remote.record.id&&remote.record.id!==remote.id||
      remote.record.businessId&&remote.record.businessId!==businessId)
      throw Error('Invalid cloud record identity');
    const key=type+':'+remote.id;
    if(seen.has(key)||(after&&remote.id<=after)||
      (response.items.indexOf(remote)>0&&remote.id<=response.items[response.items.indexOf(remote)-1].id))
      throw Error('Duplicate or unordered cloud catalogue');
    seen.add(key);
    if(++total>maxRecords)throw Error('Cloud retrieval exceeds bounded review limit');
    const existing=byId.get(remote.id);
    const status=existing===undefined?'new_on_device':canonical(existing)===canonical(remote.record)?'identical':'conflict';
    findings.push({type,id:remote.id,revision:remote.revision,status});
   }
   if(response.nextCursor===null)break;
   if(!validId(response.nextCursor)||!response.items.length||
      response.nextCursor!==response.items[response.items.length-1].id||
      page===4)throw Error('Cloud catalogue pagination is incomplete');
   after=response.nextCursor;
  }
 }
 return {
  readOnly:true,businessId,identity:{...session.identity},records:findings,
  counts:{newOnDevice:findings.filter(r=>r.status==='new_on_device').length,
   identical:findings.filter(r=>r.status==='identical').length,
   conflicts:findings.filter(r=>r.status==='conflict').length},
  approvalRequired:true,localWritesPerformed:false,
  limitations:['Cloud pages are not a transactional snapshot; re-read and verify revisions before any approved import.',
   'Local backup, owner confirmation, transactional rollback and manual conflict resolution are required before device writes.',
   'No background synchronization, external communication or customer approval occurs.']
 };
}
