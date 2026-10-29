/* Cloudflare Access session readout. No tokens in JS storage, no membership provisioning. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowAccountSession=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function readSession(fetcher=fetch){
 try{
  const response=await fetcher('/api/v1/me',{credentials:'same-origin',redirect:'manual',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
  if(response.type==='opaqueredirect'||[0,301,302,303,307,308,401].includes(response.status))return {status:'signed_out',businesses:[]};
  if(response.status===403)return {status:'forbidden',businesses:[]};
  if(!response.ok||!response.headers.get('Content-Type')?.includes('application/json'))return {status:'unavailable',businesses:[]};
  const data=await response.json();
  if(!data?.identity||typeof data.identity.issuer!=='string'||typeof data.identity.subject!=='string'||!Array.isArray(data.businesses)||data.businesses.length>100)return {status:'unavailable',businesses:[]};
  if(data.businesses.some(b=>!/^[A-Za-z0-9_-]{8,80}$/.test(b.business_id)||!['owner','admin','member','viewer'].includes(b.role)))return {status:'unavailable',businesses:[]};
  return {status:data.businesses.length?'signed_in':'unprovisioned',identity:data.identity,businesses:data.businesses};
 }catch{return {status:'offline_or_unavailable',businesses:[]}}
}
function statusText(session){
 const text={signed_out:'Sign in with the authorized Cloudflare Access account.',forbidden:'This account is not authorized for the pilot. No business access was granted.',unavailable:'The account service is unavailable. Local records remain on this device.',offline_or_unavailable:'Could not check your account. Connect to the internet and retry.',unprovisioned:'Signed in successfully. No business membership has been provisioned. Signing in does not grant ownership.'};
 return session.status==='signed_in'?'Signed in. Authorized businesses: '+session.businesses.map(b=>b.business_name+' ('+b.role+')').join(', '):text[session.status]||'Account status unknown.';
}
function view(){return '<p data-account-status role="status">Checking account…</p><p><a class="btn secondary" href="/api/v1/session/login">Sign in</a> <button type="button" data-account-refresh>Refresh account</button> <a class="btn secondary" href="/cdn-cgi/access/logout">Sign out</a></p><p>Account sign-in does not upload, migrate or synchronize local records. Business access must be independently provisioned.</p>'}
async function refresh(doc=document,fetcher=fetch){const el=doc.querySelector('[data-account-status]');if(!el)return;el.textContent='Checking account…';const session=await readSession(fetcher);if(el.isConnected!==false)el.textContent=statusText(session);return session}
return Object.freeze({readSession,statusText,view,refresh,escape});
});
