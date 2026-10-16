'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const begin=app.indexOf('let opportunityMappingRunning=false;');
const end=app.indexOf('\nfunction opportunityView(d)',begin);
assert.ok(begin>0&&end>begin,'Mapping worker has a clear implementation');
const source=app.slice(begin,end);
assert.ok(app.includes("locateOpportunityBatch(await all('opportunities'),{automatic:true,all:true})"),'View on Map starts all eligible addresses');
assert.ok(app.includes("tab='map';await render();void locateOpportunityBatch"),'Map opens immediately before running lookup');
assert.ok(source.includes('const max=allRequested?queue.length'),'No arbitrary six-record cap for View on Map');
assert.ok(source.includes('map_location_status='+"'needs_review'"),'Geocoded results need manual review');
assert.ok(source.includes("map_location_status='unresolved'"),'Unmatched records not plotted');
assert.ok(source.includes('mapOpportunityDrawnIds')&&source.includes('source.setData'),'Map pins refresh without rebuilding the map');
assert.ok(source.includes('opportunityBulkMatch'),'Bulk mapping must validate the street number and street name');
assert.ok(!source.includes('await render()'),'Do not interrupt a user panning or exploring the map');
assert.ok(source.includes("get('settings',opportunityGeoCacheId)")&&source.includes("put('settings',{id:opportunityGeoCacheId,results})"),'Geocoding results are cached persistently');
assert.ok(app.includes('nextMapRequestAt=Date.now()+1100'),'Public provider requests remain serialized below one per second');
assert.ok(app.includes('id="tfMapLocationCounts"'),'Mapped/unmapped counts visible on map');
const opportunities=[];
for(let i=0;i<8;i++)opportunities.push({id:'mapped-'+i,address:(100+i)+' Old St',latitude:30.2+i*.001,longitude:-97.8,map_enabled:true});
for(let i=0;i<65;i++)opportunities.push({id:'candidate-'+i,address:(1000+i)+' Main St',city:'Austin',region:'Texas',latitude:null,longitude:null,map_enabled:false});
opportunities.push({id:'bad-address',city:'Austin',latitude:null,longitude:null,map_enabled:false});
let queryCalls=0,writeCalls=0,screenRenders=0,providerStatus=200;
const settings={};
const ctx=vm.createContext({
 Date,Math,Number,console,Map,Set,Promise,
 navigator:{onLine:true},
 document:{getElementById:()=>null,querySelector:()=>null},
 window:{maplibregl:null},tab:'opportunities',liveMap:null,mapOpportunityFeatureRecords:new Map(),
 opportunityMapped:r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)&&r.map_enabled!==false,
 opportunityLocationParts:r=>({street:r.address||r.city||'',city:r.city||'',region:r.region||'',zip:''}),
 opportunityAddressVariants:r=>r.address?[r.address,r.address+', '+(r.city||'Austin')+', Texas']:[],
 opportunityLocationPlausible:(x,r)=>x.display_name.startsWith(r.address),
 mapNominatim:async url=>{
  queryCalls++;
  if(providerStatus===429)throw Error('Geocoding unavailable (429)');
  if(providerStatus===404)return [];
  const street=new URL(url).searchParams.get('q').split(',')[0].trim();
  return [{lat:'30.26',lon:'-97.75',display_name:street+', Austin, Texas'}];
 },
 put:async (store,row)=>{
  writeCalls++;
  if(store==='settings')settings[row.id]=row;
 },
 get:async (store,id)=>store==='settings'?settings[id]:null,
 confirm:()=>{throw Error('Automatic mapping must not open a blocking confirmation')},
 alert:()=>{throw Error('Automatic mapping must not open alerts')},
 render:async()=>{screenRenders++},
 notify:()=>{screenRenders++}
});
vm.runInContext(source,ctx,{timeout:3000});
assert.equal(vm.runInContext('opportunityBulkMatch',ctx)({display_name:'Austin, Texas'},{address:'1001 Main St',city:'Austin',region:'Texas'}),false,'City-only result must not get a project pin');
assert.equal(vm.runInContext('opportunityBulkMatch',ctx)({display_name:'999 Other Street, Austin, Texas'},{address:'1001 Main St',city:'Austin',region:'Texas'}),false,'Different street number and name must not be accepted');
assert.equal(vm.runInContext('opportunityBulkMatch',ctx)({display_name:'1001 Main Street, Austin, Texas'},{address:'1001 Main St',city:'Austin',region:'Texas'}),true,'Exact project street match is eligible');
(async()=>{
 await vm.runInContext('locateOpportunityBatch',ctx)(opportunities,{automatic:true,all:true});
 assert.equal(opportunities.filter(r=>Number.isFinite(r.latitude)).length,73,'All 65 valid unmapped records should be geocoded');
 assert.equal(queryCalls,65,'One plausible address lookup per record, without six-record limit');
 assert.equal(writeCalls>=130,true,'Results and address cache are persisted');
 assert.equal(screenRenders,0,'Map is not remounted during bulk geocoding');
 const progress=vm.runInContext('opportunityMappingProgress',ctx);
 assert.equal(progress.checked,65);
 assert.equal(progress.located,65);
 assert.equal(progress.ineligible,1);
 assert.equal(progress.running,false);
 assert.equal(Object.keys(settings['tf-opportunity-geocode-cache-v1'].results).length,65);
 // Re-entering View on Map with old saved addresses uses the persistent cache.
 for(const record of opportunities.slice(8,11)){
  record.latitude=null;record.longitude=null;record.map_enabled=false;record.map_location_status='';
 }
 await vm.runInContext('locateOpportunityBatch',ctx)(opportunities,{automatic:true,all:true});
 assert.equal(queryCalls,65,'Already searched addresses must not be queried again');
 assert.equal(opportunities.slice(8,11).filter(r=>Number.isFinite(r.latitude)).length,3);
 // Failed matches never create fictional coordinates.
 const unmatched={id:'no-match',address:'999 Missing St',city:'Austin',latitude:null,longitude:null,map_enabled:false};
 providerStatus=404;
 await vm.runInContext('locateOpportunityBatch',ctx)([unmatched],{automatic:true,all:true});
 assert.equal(unmatched.map_location_status,'unresolved');
 assert.equal(unmatched.latitude,null);
 assert.equal(unmatched.map_enabled,false);
 // Rate limiting halts the worker safely; unprocessed records remain eligible for later.
 const suspended={id:'provider-block',address:'998 Block St',city:'Austin',latitude:null,longitude:null,map_enabled:false};
 providerStatus=429;
 await vm.runInContext('locateOpportunityBatch',ctx)([suspended],{automatic:true,all:true});
 const suspendedState=vm.runInContext('opportunityMappingProgress',ctx);
 assert.equal(suspendedState.reason,'provider');
 assert.equal(suspendedState.checked,0);
 assert.equal(suspended.map_location_status,undefined);
 assert.equal(screenRenders,0);
 console.log('PASS: View Map geocodes 65 eligible records in one non-blocking run, caches hits, retains unknowns, halts on provider limits');
})().catch(err=>{console.error(err);process.exitCode=1});
