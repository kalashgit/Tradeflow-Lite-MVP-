/* Isolated browser-test host. Synthetic provider fixtures never enter deployed assets. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {handleDiscoveryRequest} from '../src/discovery-api.mjs';
export const accessCode='browser-test-owner-code-only';
export const providerKey='browser-test-provider-key-only';
export async function startTestServer({port=4180}={}){
 const metrics={searches:[],extractions:[]},env={TF_AI_PREVIEW_TOKEN:accessCode,TAVILY_API_KEY:providerKey};
 const fixture=(state,mode)=>{const roofing=state==='CO',name=roofing?'Fixture Colorado Roofing':'Fixture Ohio Plumbing',trade=roofing?'roofing':'plumbing',place=roofing?'Denver, Colorado':'Columbus, Ohio',base=roofing?'https://roofing-fixture.example.org/':'https://plumbing-fixture.example.org/',url=mode==='opportunities'?base+'bid-notice':base;
 return {url,title:name+(mode==='opportunities'?' Bid Notice':''),content:'# '+name+'\nLicensed residential and commercial '+trade+' contractor serving '+place+'.\nOur services include '+trade+' maintenance and repair.\nPhone: '+(roofing?'(303) 555-0198':'(614) 555-0198')+'\nEmail: business@'+new URL(base).hostname+'\n'+(roofing?'123 Main St, Denver, CO 80202':'123 Main St, Columbus, OH 43215')+(mode==='opportunities'?'\nInvitation to bid on '+trade+' replacement. Bids due 2026-12-30.':'\n[Chat on WhatsApp](https://wa.me/16145550198)')};};
 const provider=async(url,options)=>{const body=JSON.parse(options.body);if(url.endsWith('/search')){metrics.searches.push(body);const state=body.query.includes('Colorado')?'CO':'OH',mode=body.query.includes('contractor business')?'prospects':'opportunities',row=fixture(state,mode);return Response.json({results:[{url:'https://existing-fixture.example.org/',title:'Already saved',content:'Existing source'},row,{...row,url:row.url+'?utm_source=duplicate'}]})}
  metrics.extractions.push(body.urls);return Response.json({results:body.urls.map(url=>{const state=url.includes('roofing')?'CO':'OH',mode=url.includes('bid-notice')?'opportunities':'prospects';return {url,raw_content:fixture(state,mode).content}})})};
 const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1:'+port);if(url.pathname.startsWith('/api/discovery/')){const chunks=[];for await(const c of req)chunks.push(c);const request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});const response=await handleDiscoveryRequest(request,env,{fetcher:provider});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return}
  const relative=url.pathname==='/'?'index.html':url.pathname.slice(1);if(relative.includes('..')){res.writeHead(400);res.end();return}const file=path.join(process.cwd(),'public',relative);const data=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data);
 }catch(error){res.writeHead(500);res.end('Test host error')}});
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));return {server,metrics,env,root:'http://127.0.0.1:'+port,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})};
}
