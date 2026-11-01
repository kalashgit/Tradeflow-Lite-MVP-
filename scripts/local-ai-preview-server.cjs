#!/usr/bin/env node
// TradeFlow AI conversation: isolated synthetic development preview host.
// Reuses existing public/app.js /api/ai/verify, /api/ai/chat and /api/ai/health.
// ONLY synthetic authorized H04-01 context. No real D1, account login, cloud auth,
// production deployment, model-executed commands or financial writes.
'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const crypto=require('node:crypto');
const {briefFromAuthorizedSource}=require('../src/local-ai-context-bridge.cjs');
const STATIC_ROOT=path.resolve(__dirname,'../public');
const principal=Object.freeze({verified:true,issuer:'https://synthetic.preview.invalid',subject:'synthetic_owner'});
const businessId='synthetic_demo_business';
const now='2026-11-01T00:00:00Z';
const rows=Object.freeze([
 {record_type:'invoices',id:'synthetic_invoice_01',revision:1,updated_at:now,payload:JSON.stringify({id:'synthetic_invoice_01',businessId,status:'overdue',dueDate:'2026-10-17',currency:'USD',number:'SYN-001'})},
 {record_type:'quotes',id:'synthetic_quote_01',revision:2,updated_at:now,payload:JSON.stringify({id:'synthetic_quote_01',businessId,status:'Sent',amount:7500,currency:'USD'})},
 {record_type:'jobs',id:'synthetic_job_01',revision:1,updated_at:now,payload:JSON.stringify({id:'synthetic_job_01',businessId,status:'In Progress'})},
 {record_type:'jobCosts',id:'synthetic_cost_01',revision:1,updated_at:now,payload:JSON.stringify({id:'synthetic_cost_01',businessId,jobId:'synthetic_job_01',type:'actual',category:'Labor',laborHours:52,amount:1300,currency:'USD'})}
]);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.woff2':'font/woff2'};
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(body))};
function authorized(code,secret){
 if(typeof code!=='string')return false;
 const a=crypto.createHash('sha256').update(code).digest(),b=crypto.createHash('sha256').update(secret).digest();
 return crypto.timingSafeEqual(a,b);
}
async function bodyJson(req){
 const limit=20000,chunks=[];let n=0;
 for await(const chunk of req){n+=chunk.length;if(n>limit)throw Object.assign(Error('Request too large'),{status:413});chunks.push(chunk)}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(Error('Invalid JSON'),{status:400})}
}
function syntheticDb(metrics){
 return {prepare(sql){
  if(!/^\s*SELECT\b/i.test(sql)){metrics.writes++;throw Error('Synthetic store cannot write')}
  return {bind(...params){
   if(sql.includes('FROM tenant_records'))return {all:async()=>{
    metrics.reads++;
    const [b1,b2,issuer,subject,role,...types]=params;
    if(b1!==businessId||b2!==businessId||issuer!==principal.issuer||subject!==principal.subject||role!=='owner')return {results:[]};
    return {results:rows.filter(x=>types.includes(x.record_type))};
   }};
   if(sql.includes('FROM business_memberships'))return {first:async()=>{
    const [id,issuer,subject,status]=params;
    return id===businessId&&issuer===principal.issuer&&subject===principal.subject&&status==='active'?{role:'owner'}:null;
   }};
   throw Error('Unexpected SQL in synthetic preview');
  }};
 }};
}
function deterministicModelFetch(url,options){
 const request=JSON.parse(options.body);
 const input=request.messages.find(x=>x.role==='user');
 const parsed=JSON.parse(input.content);
 const refs=parsed.evidence.records.map(x=>x.ref);
 const invoice=refs.find(x=>x.startsWith('invoices:')),cost=refs.find(x=>x.startsWith('jobCosts:')),quote=refs.find(x=>x.startsWith('quotes:'));
 const chosen=[invoice,cost,quote].filter(Boolean).slice(0,2);
 const answer='Synthetic demo: Review the overdue invoice for cash timing, then investigate recorded job labor costs. Collection, actual contribution profit and the final labor variance are not verified. No action was taken.';
 return Promise.resolve({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({answer,refs:chosen})},finish_reason:'stop'}]})});
}
function createPreviewServer({secret,mode='mock',localFetch,metrics={reads:0,writes:0}}={}){
 if(typeof secret!=='string'||secret.length<12)throw Error('Development preview token must be at least 12 characters');
 if(!['mock','live','unavailable'].includes(mode))throw Error('Invalid preview model mode');
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  try{
   if(url.pathname.startsWith('/api/ai/')){
    if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'Cross-origin request denied'});
    if(url.pathname==='/api/ai/health'&&req.method==='GET')return send(res,200,{online:true,secretConfigured:true,aiBound:true,syntheticDemo:true,modelMode:mode});
    if((url.pathname==='/api/ai/verify'||url.pathname==='/api/ai/chat')&&req.method==='POST'){
     if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))return send(res,415,{error:'JSON required'});
     const data=await bodyJson(req);
     if(!authorized(data.code,secret))return send(res,401,{authorized:false,error:'Invalid preview code'});
     if(url.pathname==='/api/ai/verify')return send(res,200,{authorized:true,syntheticDemo:true,modelMode:mode});
     const question=Array.isArray(data.messages)?[...data.messages].reverse().find(m=>m?.role==='user')?.content:null;
     if(typeof question!=='string'||question.trim().length<3||question.length>500)return send(res,400,{error:'Question must contain 3–500 characters'});
     // Intentionally ignore the browser's "business", "screen" and claimed identity fields.
     // This server has ONLY a fixed synthetic tenant/principal and cannot open real records.
     if(mode==='unavailable')return send(res,200,{reply:'The model is unavailable. Synthetic business records were not changed. Retry when Qwen is available.',refs:[],source:'unavailable',syntheticDemo:true,executionAuthority:false});
     const {readIntelligenceContext}=await import('../src/intelligence-context.js');
     const result=await briefFromAuthorizedSource({
      db:syntheticDb(metrics),principal,businessId,question:question.trim(),enabled:true,synthetic:true,
      contextReader:readIntelligenceContext,timeoutMs:45000,
      ...(mode==='mock'?{fetchImpl:localFetch||deterministicModelFetch}:localFetch?{fetchImpl:localFetch}:{})
     });
     if(result.status!=='completed')return send(res,200,{reply:'The local model could not complete a verified briefing ('+result.status+'). No business action was taken.',refs:[],source:'unavailable',syntheticDemo:true,executionAuthority:false});
     return send(res,200,{reply:result.answer,refs:result.refs,source:mode==='mock'?'synthetic_mock':'local_qwen',syntheticDemo:true,executionAuthority:false,readReverified:result.readReverified});
    }
    return send(res,404,{error:'No such development AI endpoint'});
   }
   if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Method not allowed'});
   if(url.pathname.startsWith('/api/'))return send(res,404,{error:'Not available in synthetic preview'});
   let file;
   try{file=path.resolve(STATIC_ROOT,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname))}
   catch{return send(res,400,{error:'Invalid path'})}
   if(!file.startsWith(STATIC_ROOT+path.sep)||path.relative(STATIC_ROOT,file).split(path.sep).some(x=>x.startsWith('.')))return send(res,403,{error:'Forbidden'});
   const content=await fs.readFile(file).catch(()=>null);
   if(!content)return send(res,404,{error:'Not found'});
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream',...headers});
   res.end(req.method==='HEAD'?null:content);
  }catch(error){send(res,error?.status||503,{error:error?.status?error.message:'Development preview request could not be completed'})}
 });
 return {server,metrics};
}
if(require.main===module){
 const secret=process.env.TF_AI_DEV_PREVIEW_TOKEN||crypto.randomBytes(24).toString('base64url');
 const mode=process.env.TF_AI_DEV_MODEL||'mock';
 const port=Number(process.env.TF_AI_DEV_PORT||4188);
 const {server}=createPreviewServer({secret,mode});
 server.listen(port,'127.0.0.1',()=>{
  console.log('TradeFlow SYNTHETIC AI development preview — no real accounts or business writes.');
  console.log('Preview: http://127.0.0.1:'+port+' | Mode: '+mode+' | local only');
  console.log('Private temporary access code (do not commit or share publicly): '+secret);
  console.log('Open Codespaces port forwarding as PRIVATE for iPhone testing.');
 });
}
module.exports={createPreviewServer};
