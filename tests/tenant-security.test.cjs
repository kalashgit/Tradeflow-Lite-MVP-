'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let authorizeBusiness,tenantRecordQuery,requireVerifiedPrincipal;
require('node:test').before(async()=>({authorizeBusiness,tenantRecordQuery,requireVerifiedPrincipal}=await import('../src/tenant-security.js')));
const identity={verified:true,issuer:'https://issuer.example',subject:'person_001'};
const fakeDB=(role,status='active')=>({prepare(sql){assert.match(sql,/business_id = \? AND issuer = \? AND subject = \?/);return {bind(...args){assert.deepEqual(args,['business_001',identity.issuer,identity.subject,'active']);return {async first(){return status==='active'?{role}:null}}}}}});
test('rejects unverified and client-asserted subjects',async()=>{assert.throws(()=>requireVerifiedPrincipal({subject:'person_001',issuer:identity.issuer}),/Authentication required/);await assert.rejects(authorizeBusiness({db:fakeDB('owner'),principal:{...identity,verified:false},businessId:'business_001',permission:'records:read'}),/Authentication required/)});
test('membership is mandatory even with a verified principal',async()=>{await assert.rejects(authorizeBusiness({db:fakeDB('owner','removed'),principal:identity,businessId:'business_001',permission:'records:read'}),/Forbidden/)});
test('viewer cannot write, owner can manage members',async()=>{await assert.rejects(authorizeBusiness({db:fakeDB('viewer'),principal:identity,businessId:'business_001',permission:'records:write'}),/Forbidden/);const auth=await authorizeBusiness({db:fakeDB('owner'),principal:identity,businessId:'business_001',permission:'members:manage'});assert.equal(auth.businessId,'business_001')});
test('record query always scopes by authorized business and allowlisted table',async()=>{const auth=await authorizeBusiness({db:fakeDB('member'),principal:identity,businessId:'business_001',permission:'records:read'});const q=tenantRecordQuery({authorization:auth,table:'jobs',recordId:'job_42'});assert.match(q.sql,/FROM tenant_records WHERE business_id = \? AND record_type = \? AND id = \?/);assert.equal(q.params[0],'business_001');assert.equal(q.params[1],'jobs');assert.throws(()=>tenantRecordQuery({authorization:auth,table:'business_memberships',recordId:'job_42'}),/Unknown record type/)});
test('fails closed without authorization store and on unknown permissions',async()=>{await assert.rejects(authorizeBusiness({principal:identity,businessId:'business_001',permission:'records:read'}),/unavailable/);await assert.rejects(authorizeBusiness({db:fakeDB('owner'),principal:identity,businessId:'business_001',permission:'dangerous:delete'}),/Unknown permission/)});
test('new financial records require owner or admin permission, never membership alone',async()=>{
 await assert.rejects(authorizeBusiness({db:fakeDB('member'),principal:identity,businessId:'business_001',permission:'records:finance:write'}),/Forbidden/);
 assert.equal((await authorizeBusiness({db:fakeDB('admin'),principal:identity,businessId:'business_001',permission:'records:finance:write'})).role,'admin');
});

test('company membership controls crew administration; a member cannot promote a roster label to authority',async()=>{
 await assert.rejects(authorizeBusiness({db:fakeDB('member'),principal:identity,businessId:'business_001',permission:'records:crew:write'}),{status:403});
 for(const role of ['owner','admin'])assert.equal((await authorizeBusiness({db:fakeDB(role),principal:identity,businessId:'business_001',permission:'records:crew:write'})).role,role);
});
