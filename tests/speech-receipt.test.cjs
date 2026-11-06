const {test}=require('node:test');
const assert=require('node:assert/strict');
let signSpeechReceipt,verifySpeechReceipt;
const secret='private-non-browser-secret-over-16-chars';
test('load private signing helper',async()=>{
 ({signSpeechReceipt,verifySpeechReceipt}=await import('../src/speech-receipt.js'));
 assert.equal(typeof signSpeechReceipt,'function');
});
test('signed receipt binds exact response text and expires',async()=>{
 const time=Date.UTC(2026,10,6,19,0,0);
 const text='Three quotations are awaiting approval.';
 const receipt=await signSpeechReceipt(text,secret,time);
 assert.match(receipt,/^[0-9]{10,13}\.[A-Za-z0-9_-]{43}$/);
 assert.equal(await verifySpeechReceipt(text,receipt,secret,time+60000),true);
 assert.equal(await verifySpeechReceipt(text+'.',receipt,secret,time+60000),false);
 assert.equal(await verifySpeechReceipt(text,receipt,'wrong-key-not-the-original',time),false);
 assert.equal(await verifySpeechReceipt(text,receipt,secret,time+31*60*1000),false);
 assert.equal(await verifySpeechReceipt(text,receipt,secret,time-31*60*1000),false);
});
test('missing server signing key cannot mint browser-authorized speech',async()=>{
 assert.equal(await signSpeechReceipt('Hello','preview-code'),null);
 assert.equal(await verifySpeechReceipt('Hello','',secret),false);
});
