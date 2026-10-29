import {AuthorizationError} from './tenant-security.js';
const unauthorized=()=>new AuthorizationError('Authentication required',401);
function decodeBase64Url(value){
 if(typeof value!=='string'||!value||!/^[A-Za-z0-9_-]+$/.test(value))throw unauthorized();
 const encoded=value.replace(/-/g,'+').replace(/_/g,'/');
 const bytes=Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')),c=>c.charCodeAt(0));
 return bytes;
}
function jsonPart(part){
 try{return JSON.parse(new TextDecoder().decode(decodeBase64Url(part)))}catch{throw unauthorized()}
}
export async function verifyBearerToken(request,env,{fetchJwks=fetch,now=Date.now()}={}){
 const issuer=env.TF_OIDC_ISSUER,audience=env.TF_OIDC_AUDIENCE,jwksUrl=env.TF_OIDC_JWKS_URL;
 if(!issuer||!audience||!jwksUrl)throw new AuthorizationError('Identity verification unavailable',503);
 let trustedIssuer,keysUrl;
 try{
  trustedIssuer=new URL(issuer);keysUrl=new URL(jwksUrl);
  if(trustedIssuer.protocol!=='https:'||keysUrl.protocol!=='https:'||trustedIssuer.username||trustedIssuer.password||
   keysUrl.username||keysUrl.password||keysUrl.origin!==trustedIssuer.origin||trustedIssuer.search||trustedIssuer.hash||
   !jwksUrl.startsWith(issuer.replace(/\/$/,'')+'/'))throw Error('Invalid trusted issuer');
 }catch{throw new AuthorizationError('Identity configuration invalid',503)}
 const accessAssertion=request.headers.get('Cf-Access-Jwt-Assertion');
 const authorization=accessAssertion?'Bearer '+accessAssertion:(request.headers.get('Authorization')||'');
 const match=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(authorization);
 if(!match||match[1].length>8192)throw unauthorized();
 const parts=match[1].split('.');
 if(parts.length!==3)throw unauthorized();
 const header=jsonPart(parts[0]),claims=jsonPart(parts[1]);
 if(header.alg!=='RS256'||header.typ&&header.typ!=='JWT'||typeof header.kid!=='string'||header.kid.length>128||
  !/^[A-Za-z0-9._-]+$/.test(header.kid))throw unauthorized();
 const seconds=Math.floor(now/1000);
 if(claims.iss!==issuer||!(claims.aud===audience||Array.isArray(claims.aud)&&claims.aud.includes(audience))||
  (Array.isArray(claims.aud)&&claims.aud.length>1&&claims.azp!==audience)||
  !Number.isInteger(claims.exp)||claims.exp<=seconds||claims.exp>seconds+86400||
  !Number.isInteger(claims.iat)||claims.iat>seconds+60||
  claims.nbf!==undefined&&(!Number.isInteger(claims.nbf)||claims.nbf>seconds+60)||
  typeof claims.sub!=='string'||!/^[A-Za-z0-9:_|.@-]{3,200}$/.test(claims.sub))throw unauthorized();
 let response;
 try{response=await fetchJwks(jwksUrl,{redirect:'error',signal:AbortSignal.timeout(4000)})}catch{throw new AuthorizationError('Identity keys unavailable',503)}
 if(!response.ok)throw new AuthorizationError('Identity keys unavailable',503);
 let jwks;
 try{const raw=await response.text();if(raw.length>64000)throw Error('Oversize');jwks=JSON.parse(raw)}catch{throw new AuthorizationError('Identity keys invalid',503)}
 if(!Array.isArray(jwks.keys))throw new AuthorizationError('Identity keys invalid',503);
 const matches=jwks.keys.filter(k=>k.kid===header.kid&&k.kty==='RSA'&&(k.alg===undefined||k.alg==='RS256')&&
  (k.use===undefined||k.use==='sig')&&typeof k.n==='string'&&typeof k.e==='string'&&!k.d);
 if(matches.length!==1)throw unauthorized();
 try{
  const key=await crypto.subtle.importKey('jwk',matches[0],{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodeBase64Url(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  if(!valid)throw unauthorized();
 }catch{throw unauthorized()}
 return Object.freeze({verified:true,issuer:claims.iss,subject:claims.sub});
}
