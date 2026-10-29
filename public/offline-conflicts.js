/* Offline replay policy: never silently merge conflicting contractor records.
 * This module is pure and does not send data over the network or touch IndexedDB.
 * Callers must persist the queue themselves and obtain an authenticated session.
 */
export const OFFLINE_OUTCOME=Object.freeze({
 ACCEPT:'ready',CONFLICT:'conflict',PENDING:'pending',INVALID:'invalid'
});
const keyPart=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(s);
export function classifyOfflineChange(change,remote){
 if(!change||!keyPart(change.businessId)||!keyPart(change.id)||
   !['customers','jobs','quotes','invoices'].includes(change.type)||
   !Number.isSafeInteger(change.baseRevision)||change.baseRevision<0||
   !change.record||typeof change.record!=='object'||Array.isArray(change.record))
  return {status:OFFLINE_OUTCOME.INVALID};
 if(!remote)return change.baseRevision===0?{status:OFFLINE_OUTCOME.ACCEPT,expectedRevision:0}:
  {status:OFFLINE_OUTCOME.PENDING,reason:'Remote state unavailable'};
 if(remote.businessId!==change.businessId||remote.type!==change.type||remote.id!==change.id)
  return {status:OFFLINE_OUTCOME.INVALID,reason:'Remote identity does not match'};
 if(!Number.isSafeInteger(remote.revision)||remote.revision<0)
  return {status:OFFLINE_OUTCOME.INVALID,reason:'Invalid remote revision'};
 if(remote.deletedAt)
  return {status:OFFLINE_OUTCOME.CONFLICT,reason:'Record was deleted remotely'};
 if(remote.revision!==change.baseRevision)
  return {status:OFFLINE_OUTCOME.CONFLICT,reason:'Remote record changed',localRevision:change.baseRevision,remoteRevision:remote.revision};
 return {status:OFFLINE_OUTCOME.ACCEPT,expectedRevision:remote.revision};
}
export function planOfflineReplay(queue,remoteByKey){
 if(!Array.isArray(queue)||queue.length>1000||!remoteByKey||typeof remoteByKey!=='object')
  throw Error('Invalid offline queue');
 const seen=new Set();
 return queue.map(change=>{
  const identity=change&&keyPart(change.businessId)&&keyPart(change.type)&&keyPart(change.id)?
   [change.businessId,change.type,change.id].join(':'):null;
  if(!identity)return {change,status:OFFLINE_OUTCOME.INVALID};
  if(seen.has(identity))return {change,status:OFFLINE_OUTCOME.CONFLICT,reason:'More than one unsent edit for record; review in order'};
  seen.add(identity);
  const remote=Object.prototype.hasOwnProperty.call(remoteByKey,identity)?remoteByKey[identity]:undefined;
  // undefined means no server fetch; null means confirmed not found.
  const outcome=remote===undefined?
   {status:OFFLINE_OUTCOME.PENDING,reason:'Remote state not fetched'}:
   classifyOfflineChange(change,remote);
  return {change,...outcome};
 });
}
