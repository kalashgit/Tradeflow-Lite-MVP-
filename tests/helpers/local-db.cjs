'use strict';
// Small transactional test host. Browser verification also exercises real IndexedDB.
const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const STORES=['customers','quotes','jobs','tasks','events','expenses','settings','opportunities','pins','payments','invoices','jobCosts','marketingCampaigns','crew','routePlans','suppliers','supplyOrders','commandLog','calendars','calendarEntries','calendarProposals','calendarPreferences','calendarAudit'];
function createDB(initial={}){
 const state=Object.fromEntries(STORES.map(s=>[s,new Map((initial[s]||[]).map(x=>[x.id,copy(x)]))]));
 const waiting=[];let active=false;
 const db={version:9,failPutOnce:false,failPutAt:0,objectStoreNames:STORES.slice(),dump:()=>Object.fromEntries(STORES.map(s=>[s,[...state[s].values()].map(copy)]))};
 function start(){if(active||!waiting.length)return;active=true;const tx=waiting.shift();tx.start()}
 db.transaction=(names,mode)=>{
  names=typeof names==='string'?[names]:Array.from(names);
  if(names.some(s=>!state[s]))throw Error('Missing object store');
  const operations=[];let working,ended=false,started=false;
  const finish=error=>{if(ended)return;ended=true;if(!error&&mode==='readwrite')for(const s of names)state[s]=working[s];active=false;if(error){tx.error=error;tx.onabort?.()}else tx.oncomplete?.();setImmediate(start)};
  const tx={error:null,abort(){setImmediate(()=>finish(tx.error||Error('Aborted')))},start(){started=true;working=Object.fromEntries(names.map(s=>[s,new Map([...state[s]].map(([k,v])=>[k,copy(v)]))]));pump()},objectStore(s){if(!names.includes(s))throw Error('Store outside transaction');const request=(action)=>{const r={};operations.push(()=>{try{r.result=copy(action());r.onsuccess?.()}catch(e){tx.error=e;r.onerror?.();finish(e)}});return r};return {
   get:id=>request(()=>working[s].get(id)),getAll:()=>request(()=>[...working[s].values()].sort((a,b)=>a.id.localeCompare(b.id))),
   put:r=>request(()=>{if(mode!=='readwrite')throw Error('Read only');if(db.failPutOnce){db.failPutOnce=false;throw Error('Simulated audit/storage failure')}if(db.failPutAt>0&&--db.failPutAt===0)throw Error('Simulated Nth transaction write failure');working[s].set(r.id,copy(r));return r.id}),
   clear:()=>request(()=>working[s].clear()),delete:id=>request(()=>working[s].delete(id))
  }}};
  function pump(){setImmediate(()=>{if(ended)return;if(tx.error){finish(tx.error);return}const op=operations.shift();if(op){op();if(!ended)pump()}else finish()})}
  waiting.push(tx);setImmediate(start);return tx;
 };
 return db;
}
async function snapshot(db){return new Promise((resolve,reject)=>{const t=db.transaction(STORES,'readonly'),data={};for(const s of STORES){const r=t.objectStore(s).getAll();r.onsuccess=()=>{data[s]=r.result}}t.oncomplete=()=>resolve(data);t.onabort=()=>reject(t.error)})}
async function put(db,store,record){return new Promise((resolve,reject)=>{const t=db.transaction([store],'readwrite');t.objectStore(store).put(record);t.oncomplete=resolve;t.onabort=()=>reject(t.error)})}
module.exports={createDB,snapshot,put,STORES};
