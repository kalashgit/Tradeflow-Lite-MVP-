/* Existing local backup format, validated and restored atomically. No network or tenant migration. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowLocalRecovery=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const canonical=x=>JSON.stringify(x===null||typeof x!=='object'?x:Array.isArray(x)?x.map(sorted):sorted(x));
function sorted(x){if(!x||typeof x!=='object')return x;if(Array.isArray(x))return x.map(sorted);return Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])]))}
const copy=x=>JSON.parse(JSON.stringify(x));
async function checksum(x){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(x)))),b=>b.toString(16).padStart(2,'0')).join('')}
function optional(store,version){return version<4&&!['customers','quotes','jobs','tasks','events','expenses','settings'].includes(store)||store==='pins'||store==='payments'&&version<5||['invoices','jobCosts'].includes(store)&&version<6||['marketingCampaigns','crew','routePlans'].includes(store)&&version<7||['suppliers','supplyOrders','commandLog'].includes(store)&&version<8||['calendars','calendarEntries','calendarProposals','calendarPreferences','calendarAudit'].includes(store)&&version<9}
function normalize(data,stores){
 if(!data||data.format!=='tradeflow-lite'||!Number.isInteger(data.version)||data.version<1||data.version>9||!data.stores||Array.isArray(data.stores)||typeof data.stores!=='object')throw Error('Invalid or unsupported local backup');
 if(Object.keys(data.stores).some(s=>!stores.includes(s)))throw Error('Backup contains an unknown store; refusing silent data loss');
 const normalized={};let total=0;
 for(const store of stores){
  const rows=data.stores[store]??(optional(store,data.version)?[]:null);
  if(!Array.isArray(rows))throw Error('Missing backup store: '+store);
  const ids=new Set();
  for(const row of rows){
   if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id.trim()||row.id.length>200||ids.has(row.id))throw Error('Invalid or duplicate record in '+store);
   ids.add(row.id);
  }
  total+=rows.length;if(total>100000)throw Error('Backup exceeds record limit');
  normalized[store]=copy(rows);
 }
 return normalized;
}
async function validateBackup(data,stores){
 const normalized=normalize(data,stores);
 if(data.integrity){
  const {integrity,...payload}=data;
  if(integrity.algorithm!=='SHA-256'||typeof integrity.sha256!=='string'||await checksum(payload)!==integrity.sha256)throw Error('Backup checksum mismatch');
 }
 return {stores:normalized,checksumVerified:!!data.integrity};
}
function readStores(db,stores){return new Promise((resolve,reject)=>{
 const result={},tx=db.transaction(stores,'readonly');
 tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error||Error('Backup read failed'));
 for(const store of stores){const req=tx.objectStore(store).getAll();req.onsuccess=()=>result[store]=req.result}
})}
async function createBackup(db,stores){
 const payload={format:'tradeflow-lite',version:9,exportedAt:new Date().toISOString(),stores:await readStores(db,stores)};
 normalize(payload,stores);
 return {...payload,integrity:{algorithm:'SHA-256',sha256:await checksum(payload)}};
}
function summarize(incoming,current){
 const counts={creates:0,updates:0,deletes:0,unchanged:0},warnings=[];
 for(const [store,rows]of Object.entries(incoming)){
  const old=new Map((current[store]||[]).map(r=>[r.id,r]));
  for(const row of rows){if(!old.has(row.id))counts.creates++;else{counts[canonical(old.get(row.id))===canonical(row)?'unchanged':'updates']++;old.delete(row.id)}}
  counts.deletes+=old.size;
 }
 const links={customerId:'customers',quoteId:'quotes',jobId:'jobs',invoiceId:'invoices'};
 for(const [store,rows]of Object.entries(incoming))for(const row of rows)for(const [field,target]of Object.entries(links)){
  if(row[field]&&incoming[target]&&!incoming[target].some(r=>r.id===row[field]))warnings.push({store,id:row.id,field,target,idMissing:row[field]});
 }
 return {...counts,missingReferences:warnings};
}
function replaceAtomically(db,stores,incoming,expected){return new Promise((resolve,reject)=>{
 const tx=db.transaction(stores,'readwrite'),actual={};let remaining=stores.length,reason;
 tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(reason||tx.error||Error('Restore transaction failed'));
 for(const store of stores){const req=tx.objectStore(store).getAll();req.onsuccess=()=>{
  actual[store]=req.result;if(--remaining)return;
  try{
   if(canonical(actual)!==canonical(expected))throw Error('Records changed during review. No data replaced; review again.');
   for(const s of stores){const object=tx.objectStore(s);object.clear();for(const row of incoming[s])object.put(row)}
  }catch(error){reason=error;tx.abort()}
 }}
})}
async function vault(indexedDB,operation){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tradeflow-recovery-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 try{return await operation(db)}finally{db.close()}
}
async function saveRecovery(indexedDB,snapshot){return vault(indexedDB,db=>new Promise((resolve,reject)=>{
 const tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots');
 tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('Recovery copy could not be saved'));
 store.put({id:'pre-restore',snapshot});
}))}
async function latestRecovery(indexedDB){return vault(indexedDB,db=>new Promise((resolve,reject)=>{
 const tx=db.transaction('snapshots','readonly'),req=tx.objectStore('snapshots').get('pre-restore');
 tx.oncomplete=()=>resolve(req.result?.snapshot||null);tx.onabort=tx.onerror=()=>reject(tx.error);
}))}
async function restoreBackup({db,stores,snapshot,approve,saveRecovery:save}){
 const checked=await validateBackup(snapshot,stores),before=await createBackup(db,stores),plan=summarize(checked.stores,before.stores);
 if(!await approve({...plan,checksumVerified:checked.checksumVerified}))return {status:'cancelled'};
 // Persist the full rollback point before opening any destructive transaction. Failure means no replacement.
 await save(before);
 await replaceAtomically(db,stores,checked.stores,before.stores);
 return {status:'restored',plan};
}
return Object.freeze({validateBackup,createBackup,readStores,summarize,replaceAtomically,restoreBackup,saveRecovery,latestRecovery});
});
