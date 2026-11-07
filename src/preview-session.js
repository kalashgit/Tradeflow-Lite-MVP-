// Signed, scoped, HttpOnly preview session. No business authorization is conferred.
const COOKIE='tf_ai_preview_session';
const LIFE=7*24*60*60*1000;
const encoder=new TextEncoder();
const keyFor=secret=>crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
const bytesToBase64Url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const base64UrlToBytes=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));

export async function previewCookie(secret){
 const expiry=Date.now()+LIFE;
 const payload=expiry.toString(36)+'.'+crypto.randomUUID();
 const signature=bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC',await keyFor(secret),encoder.encode(payload))));
 return `${COOKIE}=${payload}.${signature}; Max-Age=${Math.floor(LIFE/1000)}; Path=/api/ai; HttpOnly; Secure; SameSite=Strict`;
}

export async function hasPreviewSession(request,secret){
 if(!secret)return false;
 const cookies=request.headers.get('Cookie')||'';
 const value=cookies.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!value||value.length>250)return false;
 const parts=value.split('.');if(parts.length!==3)return false;
 const [time,nonce,signature]=parts;
 const expiry=parseInt(time,36);
 if(!Number.isSafeInteger(expiry)||expiry<=Date.now()||expiry>Date.now()+LIFE||!/^[\da-f-]{36}$/i.test(nonce))return false;
 try{return await crypto.subtle.verify('HMAC',await keyFor(secret),base64UrlToBytes(signature),encoder.encode(time+'.'+nonce))}catch{return false}
}

export function clearPreviewCookie(){return `${COOKIE}=; Max-Age=0; Path=/api/ai; HttpOnly; Secure; SameSite=Strict`}
