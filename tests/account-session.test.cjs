const test=require('node:test'),assert=require('node:assert/strict');
const account=require('../public/account-session.js');
const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('session uses HttpOnly Access cookies without token storage or automatic provisioning',async()=>{
 const session=await account.readSession(async(url,options)=>{
  assert.equal(url,'/api/v1/me');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'manual');assert.equal(options.cache,'no-store');
  return response(200,{identity:{issuer:'https://access.example',subject:'verified-user'},businesses:[]});
 });
 assert.equal(session.status,'unprovisioned');assert.match(account.statusText(session),/does not grant ownership/);
});
test('expired, forbidden and offline sessions cannot be mistaken for authorized membership',async()=>{
 assert.equal((await account.readSession(async()=>response(401,{}))).status,'signed_out');
 assert.equal((await account.readSession(async()=>({type:'opaqueredirect',status:0}))).status,'signed_out');
 assert.equal((await account.readSession(async()=>response(403,{}))).status,'forbidden');
 assert.equal((await account.readSession(async()=>{throw Error('Offline')})).status,'offline_or_unavailable');
 assert.equal((await account.readSession(async()=>response(200,{identity:{issuer:'x',subject:'y'},businesses:[{business_id:'business_001',role:'superuser'}]}))).status,'unavailable');
});
test('verified businesses are displayed as text, never evaluated as markup or grants',async()=>{
 const session=await account.readSession(async()=>response(200,{identity:{issuer:'https://access.example',subject:'person'},businesses:[{business_id:'business_001',business_name:'<script>unsafe</script>',role:'viewer'}]}));
 assert.equal(session.status,'signed_in');let text='';await account.refresh({querySelector:()=>({set textContent(v){text=v}})},async()=>response(200,{identity:session.identity,businesses:session.businesses}));assert.match(text,/<script>/);
 assert.match(account.view(),/\/api\/v1\/session\/login/);assert.match(account.view(),/\/cdn-cgi\/access\/logout/);
});
