import {LEGACY_RECORD_TYPES,RECORD_TYPES,EXTENDED_SCHEMA} from '../public/record-model.js';
// Configuration alone cannot activate an unmigrated database.
export async function schemaCapabilities(env){
 const legacy=reason=>({recordTypes:LEGACY_RECORD_TYPES,extendedRecords:false,schemaVersion:2,reason});
 if(env.TF_EXTENDED_RECORDS_ENABLED!=='true')return legacy('extension_disabled');
 try{
  const row=await env.TF_DB.prepare('SELECT sha256 FROM tradeflow_schema_migrations WHERE id=? LIMIT 1').bind(EXTENDED_SCHEMA.id).first();
  if(row?.sha256!==EXTENDED_SCHEMA.sha256)return legacy('schema_upgrade_required');
  return {recordTypes:RECORD_TYPES,extendedRecords:true,schemaVersion:EXTENDED_SCHEMA.version};
 }catch{return legacy('schema_upgrade_required')}
}
