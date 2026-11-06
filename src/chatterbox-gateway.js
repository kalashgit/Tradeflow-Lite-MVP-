/* Same-origin, preview-authorized gateway to a separately hosted private Chatterbox service.
   Audio is transient; no generated answer text or WAV is stored server-side. */
import {verifySpeechReceipt} from './speech-receipt.js';
const json=(message,status)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const profiles=new Set(['gentleman','matriarch']);
const jsonType=/^application\/json(?:\s*;|$)/i;
function endpoint(value){
  try{
    const url=new URL(value);
    if(url.username||url.password||url.search||url.hash)return null;
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','::1'].includes(url.hostname)))return null;
    url.pathname=url.pathname.replace(/\/$/,'')+'/v1/synthesize';
    return url.toString();
  }catch{return null}
}
export async function chatterboxGateway(request,env,{fetchImpl=fetch}={}){
  if(request.method!=='POST')return json('POST required',405);
  if(!env.TF_AI_PREVIEW_TOKEN)return json('Private preview unavailable',503);
  if(!env.TF_CHATTERBOX_URL||!env.TF_CHATTERBOX_TOKEN)return json('Chatterbox speech runtime not configured',503);
  const upstream=endpoint(env.TF_CHATTERBOX_URL);
  if(!upstream)return json('Invalid private Chatterbox endpoint',503);
  if(!jsonType.test(request.headers.get('Content-Type')||''))return json('JSON required',415);
  if(Number(request.headers.get('Content-Length')||0)>6500)return json('Speech request too large',413);
  let body;
  try{body=await request.json()}catch{return json('Invalid JSON',400)}
  if(typeof body?.code!=='string'||body.code!==env.TF_AI_PREVIEW_TOKEN)return json('Unauthorized',401);
  if(!profiles.has(body.profileId))return json('Unknown voice profile',400);
  if(typeof body.text!=='string'||!body.text.trim()||body.text.length>2500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.text))
    return json('Invalid speech text',400);
  if(!await verifySpeechReceipt(body.text,body.speechReceipt,env.TF_CHATTERBOX_TOKEN))return json('Assistant reply receipt invalid or expired',403);
  try{
    const response=await fetchImpl(upstream,{
      method:'POST',headers:{'Content-Type':'application/json','X-TradeFlow-TTS-Token':env.TF_CHATTERBOX_TOKEN},
      body:JSON.stringify({profileId:body.profileId,text:body.text}),
      signal:AbortSignal.timeout(60000),redirect:'error',cache:'no-store'
    });
    if(!response.ok)return json(response.status===503?'Speech model not ready':'Speech generation failed',503);
    if(!/^audio\/wav(?:\s*;|$)/i.test(response.headers.get('Content-Type')||''))return json('Invalid speech response',502);
    const declared=Number(response.headers.get('Content-Length')||0);
    if(declared>10*1024*1024)return json('Speech response too large',502);
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength<44||bytes.byteLength>10*1024*1024)return json('Invalid speech payload size',502);
    const head=new Uint8Array(bytes.slice(0,12));
    if(String.fromCharCode(...head.slice(0,4))!=='RIFF'||String.fromCharCode(...head.slice(8,12))!=='WAVE')return json('Invalid WAV payload',502);
    return new Response(bytes,{status:200,headers:{'Content-Type':'audio/wav','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}});
  }catch{return json('Private speech runtime unreachable',503)}
}
