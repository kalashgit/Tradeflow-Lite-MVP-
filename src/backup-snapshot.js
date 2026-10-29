import {RECORD_TYPES} from '../public/record-model.js';
/* Portable, explicit TradeFlow tenant snapshot format.
 * Integrity hashes detect accidental damage, not adversarial tampering.
 * Export and validation are pure: no network, D1 or IndexedDB writes.
 */
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
function validItem(r,businessId){
 return !!r&&r.businessId===businessId&&
  RECORD_TYPES.includes(r.type)&&
  typeof r.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(r.id)&&
  Number.isSafeInteger(r.revision)&&r.revision>0&&
  r.record&&typeof r.record==='object'&&!Array.isArray(r.record);
}
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
async function hash(value){
 const bytes=new TextEncoder().encode(canonical(value));
 return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
}
export async function createSnapshot(businessId,records,createdAt=new Date().toISOString()){
 if(typeof businessId!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(businessId)||
  !Array.isArray(records)||records.length>10000||!Number.isFinite(Date.parse(createdAt)))
  throw Error('Invalid snapshot metadata');
 const seen=new Set();
 for(const r of records){
  if(!validItem(r,businessId))throw Error('Invalid tenant record');
  const key=r.type+':'+r.id;
  if(seen.has(key))throw Error('Duplicate record in snapshot');
  seen.add(key);
 }
 const payload={format:'tradeflow-tenant-snapshot',version:1,businessId,createdAt,records};
 if(new TextEncoder().encode(canonical(payload)).byteLength>10000000)throw Error('Snapshot too large');
 return {...payload,sha256:await hash(payload)};
}
export async function validateSnapshot(snapshot,expectedBusinessId){
 if(!snapshot||snapshot.format!=='tradeflow-tenant-snapshot'||snapshot.version!==1||
  snapshot.businessId!==expectedBusinessId||typeof snapshot.sha256!=='string')
  throw Error('Snapshot identity mismatch');
 const {sha256,...payload}=snapshot;
 const checked=await createSnapshot(payload.businessId,payload.records,payload.createdAt);
 if(checked.sha256!==sha256)throw Error('Snapshot checksum mismatch');
 return {businessId:payload.businessId,recordCount:payload.records.length,records:payload.records};
}
