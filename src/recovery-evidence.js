// H04-15e: metadata-only recovery evidence contract. No storage/network/secret access.
const HEX_64=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const MAX_MANIFEST_BYTES=8192;

export class RecoveryEvidenceError extends Error {
 constructor(message,code='invalid_recovery_evidence'){
  super(message);this.name='RecoveryEvidenceError';this.code=code;
 }
}
function requireObject(value,fields,name){
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw new RecoveryEvidenceError('Invalid '+name);
 for(const key of Object.keys(value)){
  if(!fields.includes(key))
   throw new RecoveryEvidenceError('Unknown '+name+' field','unexpected_field');
 }
 for(const key of fields){
  if(!Object.hasOwn(value,key))
   throw new RecoveryEvidenceError('Missing '+name+' field','missing_field');
 }
}
function requireId(value,name){
 if(typeof value!=='string'||!ID.test(value)||value.includes('..'))
  throw new RecoveryEvidenceError('Invalid '+name);
}
function requireHash(value,name){
 if(typeof value!=='string'||!HEX_64.test(value))
  throw new RecoveryEvidenceError('Invalid '+name);
}
function dateValue(value,name){
 if(typeof value!=='string'||!UTC.test(value)||!Number.isFinite(Date.parse(value)))
  throw new RecoveryEvidenceError('Invalid '+name);
 // ISO date validation must reject rollover dates such as February 30.
 const ms=Date.parse(value);
 if(new Date(ms).toISOString().slice(0,19)!==value.slice(0,19))
  throw new RecoveryEvidenceError('Invalid '+name);
 return ms;
}
function requirePositiveInteger(value,name){
 if(!Number.isSafeInteger(value)||value<1)
  throw new RecoveryEvidenceError('Invalid '+name);
}
// All fields are non-sensitive references and attestations, NOT credentials.
// The return value never authorizes a real backup, migration or restore.
export function assessRecoveryEvidence(manifest){
 let serialized;
 try{serialized=JSON.stringify(manifest)}catch{throw new RecoveryEvidenceError('Invalid manifest serialization')}
 if(!serialized||Buffer.byteLength(serialized,'utf8')>MAX_MANIFEST_BYTES)
  throw new RecoveryEvidenceError('Manifest size exceeded','manifest_too_large');
 requireObject(manifest,['kind','source','artifact','retention','integrity','drill'],'manifest');
 if(manifest.kind!=='tradeflow.recovery.evidence.v1')
  throw new RecoveryEvidenceError('Unsupported manifest protocol');
 const source=manifest.source;
 requireObject(source,['environment','databaseAlias','schemaHash','tenantCount'],'source');
 if(!['production','staging','development'].includes(source.environment))
  throw new RecoveryEvidenceError('Unknown source environment');
 requireId(source.databaseAlias,'database alias');
 requireHash(source.schemaHash,'schema hash');
 requirePositiveInteger(source.tenantCount,'tenant count');
 const artifact=manifest.artifact;
 requireObject(artifact,['backupId','createdAt','digestSha256','bytes','storageRef','encryptionAlgorithm','keyAlias'],'artifact');
 requireId(artifact.backupId,'backup ID');
 const created=dateValue(artifact.createdAt,'creation time');
 requireHash(artifact.digestSha256,'backup digest');
 requirePositiveInteger(artifact.bytes,'backup byte count');
 requireId(artifact.storageRef,'storage reference');
 if(artifact.encryptionAlgorithm!=='AES-256-GCM')
  throw new RecoveryEvidenceError('Unapproved encryption metadata');
 requireId(artifact.keyAlias,'key alias');
 const retention=manifest.retention;
 requireObject(retention,['policyId','deleteAfter'],'retention');
 requireId(retention.policyId,'retention policy');
 const deleteAfter=dateValue(retention.deleteAfter,'retention expiry');
 if(deleteAfter<=created)throw new RecoveryEvidenceError('Retention precedes backup');
 const integrity=manifest.integrity;
 requireObject(integrity,['receiptId','verifiedAt','tenantIsolationReceipt','foreignKeyReceipt'],'integrity');
 requireId(integrity.receiptId,'integrity receipt');
 const verified=dateValue(integrity.verifiedAt,'integrity time');
 requireId(integrity.tenantIsolationReceipt,'tenant integrity receipt');
 requireId(integrity.foreignKeyReceipt,'foreign key receipt');
 if(verified<created)throw new RecoveryEvidenceError('Verification precedes backup');
 const drill=manifest.drill;
 requireObject(drill,['receiptId','completedAt','environment','restoreDurationMs','digestMatched','rowsMatched','tenantIsolationPassed','foreignKeysPassed'],'drill');
 requireId(drill.receiptId,'drill receipt');
 const completed=dateValue(drill.completedAt,'drill completion');
 if(drill.environment!=='disposable')
  throw new RecoveryEvidenceError('Recovery drill must be disposable');
 requirePositiveInteger(drill.restoreDurationMs,'restore duration');
 if(completed<verified)throw new RecoveryEvidenceError('Drill predates verification');
 for(const field of ['digestMatched','rowsMatched','tenantIsolationPassed','foreignKeysPassed']){
  if(typeof drill[field]!=='boolean')throw new RecoveryEvidenceError('Invalid '+field);
 }
 const failedChecks=['digestMatched','rowsMatched','tenantIsolationPassed','foreignKeysPassed'].filter(k=>drill[k]!==true);
 return Object.freeze({
  kind:'tradeflow.recovery.assessment.v1',
  evidenceReadyForIndependentReview:failedChecks.length===0,
  failedChecks:Object.freeze(failedChecks),
  independentlyVerified:false,
  requiresHumanApproval:true,
  productionRestoreAuthorized:false,
  productionMigrationAuthorized:false
 });
}
