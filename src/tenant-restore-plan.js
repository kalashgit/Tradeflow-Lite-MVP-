import {validateSnapshot} from './backup-snapshot.js';
import {AuthorizationError} from './tenant-security.js';

/** A read-only recovery preview. Never call write/restore from this function. */
export async function planTenantRestore(db,authorization,snapshot){
 if(!authorization||authorization.role!=='owner'||!authorization.businessId)
  throw new AuthorizationError('Owner permission required',403);
 if(!db||typeof db.prepare!=='function')
  throw new AuthorizationError('Recovery database unavailable',503);
 let parsed;
 try{parsed=await validateSnapshot(snapshot,authorization.businessId)}
 catch{throw new AuthorizationError('Invalid or mismatched backup',400)}
 if(parsed.recordCount>200)
  throw new AuthorizationError('Dry-run batch exceeds 200 records',413);
 const entries=[];
 for(const r of parsed.records){
  const existing=await db.prepare(
   'SELECT revision,deleted_at,payload FROM tenant_records WHERE business_id=? AND record_type=? AND id=? LIMIT 1'
  ).bind(authorization.businessId,r.type,r.id).first();
  if(!existing){entries.push({type:r.type,id:r.id,action:'create_candidate',backupRevision:r.revision});continue}
  if(existing.deleted_at){
   entries.push({type:r.type,id:r.id,action:'manual_review',reason:'Remote tombstone',currentRevision:existing.revision,backupRevision:r.revision});continue;
  }
  let same=false;
  try{same=JSON.stringify(JSON.parse(existing.payload))===JSON.stringify(r.record)}catch{}
  entries.push({type:r.type,id:r.id,action:same?'already_present':'manual_review',
   reason:same?undefined:'Different existing record',currentRevision:existing.revision,backupRevision:r.revision});
 }
 return {dryRun:true,businessId:authorization.businessId,total:entries.length,
  createCandidates:entries.filter(e=>e.action==='create_candidate').length,
  alreadyPresent:entries.filter(e=>e.action==='already_present').length,
  manualReview:entries.filter(e=>e.action==='manual_review').length,
  entries};
}
