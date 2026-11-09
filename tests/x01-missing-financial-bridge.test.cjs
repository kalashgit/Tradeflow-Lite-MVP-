'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
test('X01 owner question is explicitly missing verified evidence, not a job rank',async()=>{
 const {missingVerifiedPayrollJobEvidence:ask}=await import(pathToFileURL(path.resolve('public/x01-financial-bridge.js')));
 const r=ask('Which jobs threaten payroll in the next two weeks and what should I do first?');
 assert.equal(r.status,'missing_data');assert.equal(r.source,'financial_missing_data');
 assert.equal(r.executionAuthority,false);
 assert.match(r.content,/no verified bank|no verified bank availability/i);
 assert.match(r.content,/Receivables are not available cash/);
 assert.doesNotMatch(r.content,/job 1 is|risk score: 9/);
 assert.equal(ask('How can I manage my hiring pipeline?'),null);
 assert.equal(ask('a'.repeat(6001)),null);
 assert.equal(ask(null),null);
});
test('X01 bridges both modalities through existing scoped IndexedDB path, no extra financial writer',()=>{
 const app=fs.readFileSync('public/app.js','utf8');
 assert.match(app,/missingVerifiedPayrollJobEvidence\(content\)/);
 assert.match(app,/tfAiSaveTurn\(\{role:'user',content,modality,status:'committed',source:'user'\}\)/);
 assert.match(app,/source:'financial_missing_data'/);
 assert.match(app,/await tfAiUpdateChatUI\(\)/);
 assert.doesNotMatch(fs.readFileSync('public/x01-financial-bridge.js','utf8'),/indexedDB|fetch\(|localStorage|\.put\(|\.post\(/);
});

test('conversation store accepts missing-financial-evidence assistant source but rejects forged verified status',()=>{
 const store=require('../public/conversation-store.js');
 const base={id:'x01-financial-missing',role:'assistant',content:'FINANCIAL EVIDENCE MISSING',status:'committed',modality:'text',refs:[]};
 const saved=store.sanitizeTurn({...base,source:'financial_missing_data'});
 assert.equal(saved.source,'financial_missing_data');
 assert.equal(saved.role,'assistant');
 assert.equal(saved.refs.length,0);
 assert.throws(()=>store.sanitizeTurn({...base,source:'verified_tenant_record'}),/Only bounded/);
 assert.throws(()=>store.sanitizeTurn({...base,role:'user',source:'financial_missing_data'}),/Only bounded/);
});
