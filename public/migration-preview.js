import './local-recovery.js';
import {planOfflineReplay} from './offline-conflicts.js';
// Read-only by design: no imports, tenant writes, membership creation or local edits.
export async function previewLocalMigration({snapshot,stores,businessId,session,remoteByKey={}}){
 if(!session||session.status!=='signed_in'||!session.businesses?.some(b=>b.business_id===businessId&&b.role==='owner'))throw Error('Verified owner session required to preview target business');
 const checked=await globalThis.TradeFlowLocalRecovery.validateBackup(snapshot,stores),supported=['customers','quotes','jobs','invoices'];
 const localOnly=['settings','events','commandLog','pins','calendarPreferences','calendarAudit','routePlans'];
 const unsupported=Object.entries(checked.stores).filter(([s,rows])=>rows.length&&!supported.includes(s)&&!localOnly.includes(s)).map(([store,rows])=>({store,count:rows.length}));
 const relabel=[],changes=[];
 for(const type of supported)for(const record of checked.stores[type]||[]){
  if(record.businessId&&record.businessId!==businessId)relabel.push({type,id:record.id,sourceBusinessId:record.businessId});
  changes.push({businessId,type,id:record.id,baseRevision:0,record});
 }
 const findings=planOfflineReplay(changes,remoteByKey),relationships=globalThis.TradeFlowLocalRecovery.summarize(checked.stores,checked.stores).missingReferences;
 return {readOnly:true,businessId,backupChecksum:checked.checksumVerified?snapshot.integrity.sha256:null,
  records:findings.map(f=>({type:f.change.type,id:f.change.id,status:f.status,reason:f.reason})),unsupported,missingReferences:relationships,requiresBusinessRelabel:relabel,
  readyForReview:checked.checksumVerified&&unsupported.length===0&&relationships.length===0&&relabel.length===0&&findings.every(f=>f.status==='ready'),
  approvalRequired:true,libraryFilesIncluded:false,
  limitations:['This preview does not migrate records.','Provider/browser login and independent owner provisioning must be verified.','Related unsupported records and Library files need a separate explicit mapping.']};
}
