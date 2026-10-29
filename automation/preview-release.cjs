'use strict';
// Public release provenance includes file digests only. Never read environment secrets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const digest=body=>crypto.createHash('sha256').update(body).digest('hex');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)])}
function manifest(){
 const commit=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(process.env.GITHUB_SHA&&process.env.GITHUB_SHA!==commit)throw Error('Checkout differs from workflow commit');
 return {format:'tradeflow-preview-release',version:1,commit,worker:'tradeflow-library-pilot-preview',
  assets:Object.fromEntries(files('public').sort().filter(p=>p!=='public/release.json').map(p=>[p.slice(7),digest(fs.readFileSync(p))])),
  serverSource:digest(Buffer.concat(files('src').sort().map(p=>Buffer.concat([Buffer.from(p+'\0'),fs.readFileSync(p)]))))};
}
async function main(){
 if(process.argv[2]==='build'){fs.writeFileSync('public/release.json',JSON.stringify(manifest()));console.log('Recorded source '+manifest().commit);return}
 if(process.argv[2]!=='verify')throw Error('Use build or verify URL');
 const base=new URL(process.argv[3]);
 if(base.origin!=='https://tradeflow-library-pilot-preview.bartoszszarafinski.workers.dev')throw Error('Only isolated pilot preview can be verified');
 const expected=manifest();
 const response=await fetch(new URL('/release.json?verify='+Date.now(),base),{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Release manifest unavailable');
 const actual=await response.json();
 if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Live release does not match exact source');
 // Bound network concurrency and verify every shipped asset, not just stale version markers.
 const pending=Object.entries(expected.assets);let index=0;
 await Promise.all(Array.from({length:4},async()=>{while(index<pending.length){
  const [name,sha256]=pending[index++];
  const url=new URL('/'+name,base);url.searchParams.set('verify',expected.commit);
  const res=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!res.ok||digest(Buffer.from(await res.arrayBuffer()))!==sha256)throw Error('Live asset mismatch: '+name);
 }}));
 console.log('VERIFIED '+expected.commit+'; '+pending.length+' live asset digests match');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
