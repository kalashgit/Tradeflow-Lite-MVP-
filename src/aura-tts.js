// Optional private-preview speech synthesis. No business commands or audio storage.
const SPEAKERS = new Set(['angus','asteria','arcas','orion','orpheus','athena','luna','zeus','perseus','helios','hera','stella']);
const json = (error,status) => Response.json({error},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

export async function auraTts(request,env){
 if(request.method!=='POST')return json('POST required',405);
 if(env.TF_AURA_TTS_ENABLED!=='true')return json('Speech output is disabled',503);
 if(!env.TF_AI_PREVIEW_TOKEN||!env.AI)return json('Private speech provider unavailable',503);
 if(!/^application\/json\b/i.test(request.headers.get('Content-Type')||''))return json('JSON required',415);
 if(Number(request.headers.get('Content-Length')||0)>7000)return json('Request too large',413);
 let body;
 try{body=await request.json()}catch{return json('Invalid JSON',400)}
 if(typeof body?.code!=='string'||body.code!==env.TF_AI_PREVIEW_TOKEN)return json('Incorrect preview access code',401);
 const {text,speaker='angus'}=body;
 if(typeof text!=='string'||!text.trim()||text.length>1200||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))return json('Speech text must be 1–1200 characters',400);
 if(!SPEAKERS.has(speaker))return json('Unsupported speaker',400);
 try{
  const response=await env.AI.run('@cf/deepgram/aura-1',{text:text.trim(),speaker,encoding:'mp3'},{returnRawResponse:true});
  if(!(response instanceof Response)||!response.ok||!response.body)return json('Speech provider unavailable',502);
  return new Response(response.body,{status:200,headers:{'Content-Type':'audio/mpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
 }catch{return json('Speech provider unavailable',502)}
}
