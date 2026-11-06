/* Sign only genuine AI replies for private TTS; no client can mint arbitrary speech text.
   The signing key remains server-side and is distinct from the browser preview code. */
const encoder=new TextEncoder();
const receiptPattern=/^[0-9]{10,13}\.[A-Za-z0-9_-]{43}$/;
const MAX_AGE_MS=30*60*1000;
function binaryBase64Url(bytes){
  let chars='';
  for(const b of bytes)chars+=String.fromCharCode(b);
  return btoa(chars).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function signature(secret,text,expires){
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return binaryBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode('tradeflow-tts-reply-v1\n'+expires+'\n'+text))));
}
function validText(text){return typeof text==='string'&&!!text.trim()&&text.length<=2500}
function secretValid(secret){return typeof secret==='string'&&secret.length>=16}
export async function signSpeechReceipt(text,secret,now=Date.now()){
  if(!secretValid(secret)||!validText(text))return null;
  const expires=Math.floor((now+MAX_AGE_MS)/1000);
  return expires+'.'+await signature(secret,text,expires);
}
export async function verifySpeechReceipt(text,receipt,secret,now=Date.now()){
  if(!validText(text)||!secretValid(secret)||typeof receipt!=='string'||!receiptPattern.test(receipt))return false;
  const [expiry,mac]=receipt.split('.');
  const expiryMs=Number(expiry)*1000;
  if(!Number.isSafeInteger(expiryMs)||expiryMs<=now||expiryMs>now+MAX_AGE_MS+1000)return false;
  const expected=await signature(secret,text,expiry);
  const a=encoder.encode(mac),b=encoder.encode(expected);
  if(a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0;
}
