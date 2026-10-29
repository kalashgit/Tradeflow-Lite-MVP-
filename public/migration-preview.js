import {RECORD_TYPES,LEGACY_RECORD_TYPES,LOCAL_ONLY_STORES,linksForRecord} from './record-model.js';
import './local-recovery.js';
import {planOfflineReplay} from './offline-conflicts.js';
// Read-only by design: no imports, tenant writes, membership creation or local edits.
export async function previewLocalMigration({snapshot,stores,businessId,session,remoteByKey={},allowLocalBusinessMapping=false}){
 if(!session||session.status!=='signed_in'||!session.businesses?.some(b=>b.business_id===businessId&&b.role==='owner'))throw Error('Verified owner session required to preview target business');
 const checked=await globalThis.TradeFlowLocalRecovery.validateBackup(snapshot,stores),supported=(session.capabilities?.recordTypes||LEGACY_RECORD_TYPES).filter(type=>RECORD_TYPES.includes(type));
 const localOnly=LOCAL_ONLY_STORES;
 const unsupported=Object.entries(checked.stores).filter(([s,rows])=>rows.length&&!supported.includes(s)&&!localOnly.includes(s)).map(([store,rows])=>({store,count:rows.length}));
 const relabel=[],changes=[],mappedLocalRecords=[],oversizedRecords=[];
 for(const type of supported)for(const source of checked.stores[type]||[]){
  let record=source;
  if(allowLocalBusinessMapping===true&&source.businessId==='local-business'){record={...source,businessId};mappedLocalRecords.push({type,id:record.id})}
  if(new TextEncoder().encode(JSON.stringify(record)).byteLength>30000)oversizedRecords.push({type,id:record.id});
  if(record.businessId&&record.businessId!==businessId)relabel.push({type,id:record.id,sourceBusinessId:record.businessId});
  changes.push({businessId,type,id:record.id,baseRevision:0,record});
 }
 const stable=x=>JSON.stringify(x&&typeof x==='object'?Array.isArray(x)?x.map(v=>JSON.parse(stable(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(stable(x[k]))])):x);
 const findings=planOfflineReplay(changes,remoteByKey).map(f=>{const remote=remoteByKey[f.change.businessId+':'+f.change.type+':'+f.change.id];return remote&&remote.businessId===businessId&&remote.type===f.change.type&&remote.id===f.change.id&&Number.isSafeInteger(remote.revision)&&remote.revision>0&&!remote.deletedAt&&stable(remote.record)===stable(f.change.record)?{...f,status:'already_present'}:f}),relationships=[];
 for(const [store,records]of Object.entries(checked.stores).filter(([store])=>!localOnly.includes(store)))for(const record of records)for(const [field,target]of linksForRecord(record))if(record[field]&&!checked.stores[target]?.some(r=>r.id===record[field]))relationships.push({store,id:record.id,field,target,idMissing:record[field]});
 return {readOnly:true,businessId,backupChecksum:checked.checksumVerified?snapshot.integrity.sha256:null,
  changes,oversizedRecords,mappedLocalRecords,records:findings.map(f=>({type:f.change.type,id:f.change.id,status:f.status,reason:f.reason})),unsupported,missingReferences:relationships,requiresBusinessRelabel:relabel,
  readyForReview:checked.checksumVerified&&unsupported.length===0&&relationships.length===0&&relabel.length===0&&oversizedRecords.length===0&&findings.every(f=>['ready','already_present'].includes(f.status)),
  approvalRequired:true,libraryFilesIncluded:false,
  limitations:['This preview does not migrate records.','Provider/browser login and independent owner provisioning must be verified.','Related unsupported records and Library files need a separate explicit mapping.']};
}
