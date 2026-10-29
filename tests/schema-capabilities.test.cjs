const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
test('extended capability requires exact applied migration checksum, not just a feature flag',async()=>{
 const {schemaCapabilities}=await import('../src/schema-capabilities.js'),{EXTENDED_SCHEMA}=await import('../public/record-model.js');
 const env=sha=>({TF_EXTENDED_RECORDS_ENABLED:'true',TF_DB:{prepare:()=>({bind:id=>{assert.equal(id,EXTENDED_SCHEMA.id);return {first:async()=>sha?{sha256:sha}:null}}})}});
 assert.equal((await schemaCapabilities(env('wrong'))).recordTypes.length,4);assert.equal((await schemaCapabilities(env(null))).extendedRecords,false);
 const valid=await schemaCapabilities(env(EXTENDED_SCHEMA.sha256));assert.equal(valid.recordTypes.length,20);assert.equal(valid.schemaVersion,3);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync('migrations/0003_extended_business_records.sql')).digest('hex'),EXTENDED_SCHEMA.sha256);
 const broken=env(null);broken.TF_DB.prepare=()=>{throw Error('Missing migration ledger')};assert.equal((await schemaCapabilities(broken)).extendedRecords,false);
 assert.equal((await schemaCapabilities({})).recordTypes.length,4);
});
