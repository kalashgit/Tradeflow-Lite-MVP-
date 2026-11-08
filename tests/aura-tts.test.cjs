const {test}=require('node:test');
const assert=require('node:assert/strict');

const load=()=>import('../src/aura-tts.js');
const req=(body,headers={'Content-Type':'application/json'})=>new Request('https://example.test/api/ai/speech',{method:'POST',headers,body:JSON.stringify(body)});
const environment=(run)=>({TF_AURA_TTS_ENABLED:'true',TF_AI_PREVIEW_TOKEN:'private-code',AI:{run}});

test('disabled speech never invokes model',async()=>{
 const {auraTts}=await load();let calls=0;
 const response=await auraTts(req({code:'private-code',text:'Hello'}),{...environment(()=>{calls++}),TF_AURA_TTS_ENABLED:'false'});
 assert.equal(response.status,503);assert.equal(calls,0);
});
test('wrong code and invalid input never invoke model',async()=>{
 const {auraTts}=await load();let calls=0;const env=environment(()=>{calls++});
 assert.equal((await auraTts(req({code:'wrong',text:'Hello'}),env)).status,401);
 assert.equal((await auraTts(req({code:'private-code',text:'x'.repeat(1201)}),env)).status,400);
 assert.equal((await auraTts(req({code:'private-code',text:'Hello',speaker:'fake'}),env)).status,400);
 assert.equal(calls,0);
});
test('authorized synthesis returns streamed audio and no-store headers',async()=>{
 const {auraTts}=await load();let args;
 const env=environment(async(...input)=>{args=input;return new Response(new Uint8Array([0x49,0x44,0x33]),{status:200})});
 const response=await auraTts(req({code:'private-code',text:' Hello ',speaker:'orion'}),env);
 assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'audio/mpeg');
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[0x49,0x44,0x33]);
 assert.equal(args[0],'@cf/deepgram/aura-1');assert.deepEqual(args[1],{text:'Hello',speaker:'orion',encoding:'mp3'});
});
test('provider errors are hidden and fail closed',async()=>{
 const {auraTts}=await load();
 const response=await auraTts(req({code:'private-code',text:'Hello'}),environment(()=>{throw Error('secret internal')}));
 assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/secret internal/);
});
