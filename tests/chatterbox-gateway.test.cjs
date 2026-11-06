const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Buffer}=require('node:buffer');
let gateway,signSpeechReceipt;
const env={TF_AI_PREVIEW_TOKEN:'test-preview-code',TF_CHATTERBOX_URL:'https://private-voice.example.test',TF_CHATTERBOX_TOKEN:'internal-tts-secret'};
const req=(body,method='POST')=>new Request('https://preview.example.test/api/ai/tts',{method,headers:{'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(body):undefined});
const wav=()=>{const b=Buffer.alloc(44);b.write('RIFF',0);b.write('WAVE',8);return b};
const good={code:env.TF_AI_PREVIEW_TOKEN,profileId:'gentleman',text:'One quotation remains open.'};
test('load gateway module',async()=>{({chatterboxGateway:gateway}=await import('../src/chatterbox-gateway.js'));({signSpeechReceipt}=await import('../src/speech-receipt.js'));assert.equal(typeof gateway,'function')});
const signed=async()=>({...good,speechReceipt:await signSpeechReceipt(good.text,env.TF_CHATTERBOX_TOKEN)});
test('requires private credentials and rejects bad/missing payloads',async()=>{
 assert.equal((await gateway(req(good),{})).status,503);
 assert.equal((await gateway(req({...good,code:'wrong'}),env)).status,401);
 assert.equal((await gateway(req({...good,profileId:'__proto__'}),env)).status,400);
 assert.equal((await gateway(req({...good,text:'a'.repeat(2501)}),env)).status,400);
 assert.equal((await gateway(req(good),{...env,TF_CHATTERBOX_URL:'http://evil.example.test'})).status,503);
});
test('only sends explicit authorized assistant text and profile to private service',async()=>{
 let destination,params;
 const result=await gateway(req({...await signed(),profileId:'matriarch'}),env,{fetchImpl:async(url,init)=>{
  destination=url;params=init;return new Response(wav(),{headers:{'Content-Type':'audio/wav'}});
 }});
 assert.equal(result.status,200);
 assert.equal(result.headers.get('Cache-Control'),'no-store, private');
 assert.equal(destination,'https://private-voice.example.test/v1/synthesize');
 assert.equal(params.headers['X-TradeFlow-TTS-Token'],env.TF_CHATTERBOX_TOKEN);
 assert.deepEqual(JSON.parse(params.body),{profileId:'matriarch',text:good.text});
 assert.equal((await result.arrayBuffer()).byteLength,44);
});
test('rejects unsigned, altered and expired assistant text before upstream call',async()=>{
 const receipt=await signed();
 let calls=0;
 const fake=async()=>{calls++;return new Response(wav(),{headers:{'Content-Type':'audio/wav'}})};
 assert.equal((await gateway(req(good),env,{fetchImpl:fake})).status,403);
 assert.equal((await gateway(req({...receipt,text:'A fabricated financial claim.'}),env,{fetchImpl:fake})).status,403);
 assert.equal((await gateway(req({...receipt,speechReceipt:'1764000000.'+'a'.repeat(43)}),env,{fetchImpl:fake})).status,403);
 assert.equal(calls,0);
});
test('never forwards malformed or failed upstream audio as success',async()=>{
 const failed=await gateway(req(await signed()),env,{fetchImpl:async()=>new Response('down',{status:503})});
 assert.equal(failed.status,503);
 const wrong=await gateway(req(good),env,{fetchImpl:async()=>new Response('plain text',{headers:{'Content-Type':'text/plain'}})});
 assert.equal(wrong.status,502);
 const spoofed=await gateway(req(good),env,{fetchImpl:async()=>new Response(Buffer.alloc(44),{headers:{'Content-Type':'audio/wav'}})});
 assert.equal(spoofed.status,502);
});
