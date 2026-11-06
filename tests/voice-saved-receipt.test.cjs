const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeTurn}=require('../public/conversation-store.js');
const receipt='1794000000.'+'a'.repeat(43);
test('only server-originated assistant turns can retain a speech receipt',()=>{
 const saved=sanitizeTurn({role:'assistant',content:'A verified server output.',status:'committed',modality:'text',source:'unverified_model',speechReceipt:receipt});
 assert.equal(saved.speechReceipt,receipt);
 assert.throws(()=>sanitizeTurn({role:'user',content:'Hello',status:'committed',source:'user',speechReceipt:receipt}),/Speech receipt/);
 assert.throws(()=>sanitizeTurn({role:'assistant',content:'Local analysis',status:'committed',source:'device_local_evidence',speechReceipt:receipt}),/Speech receipt/);
 assert.throws(()=>sanitizeTurn({role:'assistant',content:'Hello',status:'committed',source:'unverified_model',speechReceipt:'bad'}),/Speech receipt/);
});
test('unsigned historical local turns remain readable and writable',()=>{
 const saved=sanitizeTurn({role:'assistant',content:'Historical answer',status:'committed',source:'unverified_model'});
 assert.equal(saved.speechReceipt,undefined);
});
