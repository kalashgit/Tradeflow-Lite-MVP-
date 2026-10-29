import {createSnapshot} from './backup-snapshot.js';
import {AuthorizationError} from './tenant-security.js';

// Explicit, owner-only read export. No implicit backup storage or restore.
// Export is bounded so the Worker cannot accidentally stream arbitrary tenant data.
export async function exportTenantSnapshot(db,authorization,createdAt) {
 if(!authorization||authorization.role!=='owner'||!authorization.businessId)
  throw new AuthorizationError('Owner permission required',403);
 if(!db||typeof db.prepare!=='function')
  throw new AuthorizationError('Backup database unavailable',503);
 const result=await db.prepare(
  'SELECT business_id,record_type,id,revision,payload FROM tenant_records WHERE business_id = ? AND deleted_at IS NULL ORDER BY record_type,id LIMIT 10001'
 ).bind(authorization.businessId).all();
 if(!result||!Array.isArray(result.results))
  throw new AuthorizationError('Backup read failed',503);
 if(result.results.length>10000)
  throw new AuthorizationError('Backup exceeds record limit',413);
 const records=result.results.map(r=>{
  if(r.business_id!==authorization.businessId)throw new AuthorizationError('Tenant export mismatch',503);
  let record;
  try{record=JSON.parse(r.payload)}catch{throw new AuthorizationError('Invalid stored record',503)}
  return {businessId:r.business_id,type:r.record_type,id:r.id,revision:r.revision,record};
 });
 try{return await createSnapshot(authorization.businessId,records,createdAt)}
 catch{throw new AuthorizationError('Unable to construct backup',503)}
}
