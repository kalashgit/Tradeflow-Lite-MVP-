const {test}=require('node:test');
const assert=require('node:assert/strict');
const secret='nonproduction-test-secret-never-use-in-deployment';
let session,worker;
test('preview auth module loads',async()=>{
 session=await import('../src/preview-session.js');
 worker=(await import('../src/index.js')).default;
});
test('signed preview cookie authenticates only the matching secret',async()=>{
 const cookie=(await session.previewCookie(secret)).split(';')[0];
 assert.match(cookie,/^tf_ai_preview_session=/);
 assert.ok((await session.previewCookie(secret)).includes('HttpOnly; Secure; SameSite=Strict'));
 assert.equal(await session.hasPreviewSession(new Request('https://example.test/api/ai/chat',{headers:{Cookie:cookie}}),secret),true);
 assert.equal(await session.hasPreviewSession(new Request('https://example.test/api/ai/chat',{headers:{Cookie:cookie}}),'other-secret'),false);
 const tampered=cookie.replace(/\.([A-Za-z0-9_-])/,(_,char)=>'.'+(char==='A'?'B':'A'));
 assert.equal(await session.hasPreviewSession(new Request('https://example.test/api/ai/chat',{headers:{Cookie:tampered}}),secret),false);
});
test('verification establishes a session, and logout clears it',async()=>{
 const env={TF_AI_PREVIEW_TOKEN:secret,AI:{run:async()=>({response:'I can help with estimates and schedules.'})}};
 const verify=await worker.fetch(new Request('https://example.test/api/ai/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:secret})}),env);
 assert.equal(verify.status,200);
 const cookie=verify.headers.get('Set-Cookie').split(';')[0];
 const check=await worker.fetch(new Request('https://example.test/api/ai/session',{headers:{Cookie:cookie}}),env);
 assert.equal((await check.json()).authorized,true);
 const message=await worker.fetch(new Request('https://example.test/api/ai/chat',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({code:'preview-session',messages:[{role:'user',content:'Hello'}]})}),env);
 assert.equal(message.status,200);assert.match((await message.json()).reply,/estimates/);
 const denied=await worker.fetch(new Request('https://example.test/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'preview-session',messages:[{role:'user',content:'Hello'}]})}),env);
 assert.equal(denied.status,401);
 const logout=await worker.fetch(new Request('https://example.test/api/ai/logout',{method:'POST'}),env);
 assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
});
