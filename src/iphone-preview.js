/** Owner-only Cloudflare Access iPhone preview. No customer DB, secrets or operational APIs.
 * Only general conversational inference and static frontend are enabled.
 * Cloudflare Access must reject unauthenticated requests BEFORE deployment.
 */
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/ai/health'){
   if(request.method!=='GET')return json({error:'GET required'},405);
   return json({online:!!env.AI,mode:'private-online-chat',dataAccess:false});
  }
  if(url.pathname==='/api/ai/chat'){
   if(request.method!=='POST')return json({error:'POST required'},405);
   if(!env.AI)return json({error:'AI model binding unavailable'},503);
   if(!/^application\/json\b/i.test(request.headers.get('Content-Type')||''))return json({error:'JSON required'},415);
   if(Number(request.headers.get('Content-Length')||0)>14000)return json({error:'Message too large'},413);
   let body;
   try{body=await request.json()}catch{return json({error:'Invalid JSON'},400)}
   if(body?.business!==null&&body?.business!==undefined)return json({error:'Business records cannot be uploaded to this isolated preview'},400);
   const raw=body?.messages;
   if(!Array.isArray(raw)||raw.length===0||raw.length>8)return json({error:'Send 1–8 messages'},400);
   const messages=raw.map(x=>({role:x?.role,content:x?.content}));
   if(messages.some(x=>!['user','assistant'].includes(x.role)||typeof x.content!=='string'||!x.content.trim()||x.content.length>2500))return json({error:'Invalid message'},400);
   if(messages[messages.length-1].role!=='user')return json({error:'Last message must be from user'},400);
   const system='You are TradeFlow Intelligence, a useful conversational assistant for small US electrical contractors. Respond naturally and helpfully. You can discuss business operations, quotations, schedules, costs and electrical industry concepts. This is a private development demo with no access to customer records, live business tools, or production data. Never claim to access records or have completed actions. Avoid inventing figures, approvals or code-compliance claims. Safety-related electrical questions should recommend verification against current jurisdictional rules and qualified professionals.';
   try{
    const result=await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast',{messages:[{role:'system',content:system},...messages],max_tokens:500,temperature:0.45});
    const answer=result?.response||result?.choices?.[0]?.message?.content||'';
    if(typeof answer!=='string'||!answer.trim())return json({error:'AI returned no response'},502);
    return json({reply:answer.trim().slice(0,2500),model:'cloudflare-workers-ai',mode:'private-online-chat'});
   }catch{return json({error:'AI model temporarily unavailable. Please retry.'},502)}
  }
  if(url.pathname.startsWith('/api/'))return json({error:'This private preview does not enable business record APIs'},503);
  return env.ASSETS.fetch(request);
 }
};
