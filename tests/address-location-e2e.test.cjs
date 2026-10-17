'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const core=require('../public/core-integration.js'),resolver=require('../public/address-resolution.js');
const start=app.indexOf('async function tfFindMapPoint('),end=app.indexOf('function parseSavedCoordinates(value)',start);
assert.ok(start>0&&end>start,'Address repair function boundary present');
const source=app.slice(start,end);
const hqAddress='6801 River Place Blvd, Austin, TX 78726';
const supplierAddress='123 Warehouse Way, Austin, TX 78701';
const hqHit={lat:'30.450',lon:'-97.800',display_name:'6801 River Place Boulevard, Austin, Texas, 78726',
 address:{house_number:'6801',road:'River Place Boulevard',city:'Austin',postcode:'78726'}};
const supplierHit={lat:'30.270',lon:'-97.740',display_name:'123 Warehouse Way, Austin, Texas, 78701',
 address:{house_number:'123',road:'Warehouse Way',city:'Austin',postcode:'78701'}};
const data={
 settings:[{id:'business',businessAddress:hqAddress}],
 suppliers:[{id:'sup1',name:'Test Warehouse',address:supplierAddress}],
 supplyOrders:[{id:'ord1',supplierId:'sup1',description:'Materials',status:'Ordered',destinationKind:'business',destinationAddress:hqAddress}],
 customers:[],jobs:[]
};
const requests=[];
const context=vm.createContext({
 window:{TradeFlowCore:core,TradeFlowAddress:resolver},
 navigator:{onLine:true},
 mapGeocodeCache:new Map(),
 mapNominatim:async url=>{
  const query=new URL(url).searchParams.get('q')||'';
  requests.push(query);
  if(query.includes('6801'))return [hqHit];
  if(query.includes('123 Warehouse'))return [supplierHit];
  return [];
 },
 all:async store=>data[store]||[],
 get:async(store,id)=>data[store].find(x=>x.id===id),
 put:async(store,record)=>{
  const rows=data[store]||[],i=rows.findIndex(x=>x.id===record.id);
  if(i<0)rows.push(record);else rows[i]=record;
  data[store]=rows;
 },
 prefs:{company:'Test Company'},mapLastView:{center:[-97.7,30.2],zoom:10},
 confirm:()=>{throw Error('Exact match should not prompt')},console
});
vm.runInContext(source,context,{timeout:2500});
(async()=>{
 const result=await context.tfResolveSupplyLocations({max:3});
 assert.equal(result.located,2,'Existing saved HQ and supplier addresses are both resolved');
 assert.equal(result.unresolved,0);
 assert.equal(data.settings[0].homeLat,30.45);
 assert.equal(data.settings[0].homeLon,-97.8);
 assert.equal(data.settings[0].mapLocationStatus,'needs_review','Lookup remains reviewable');
 assert.equal(data.suppliers[0].latitude,30.27);
 assert.equal(data.suppliers[0].longitude,-97.74);
 assert.equal(data.suppliers[0].address,supplierAddress,'Address is preserved');
 assert.equal(data.settings[0].businessAddress,hqAddress,'Original HQ address is preserved');
 assert.equal(context.prefs.homeLat,30.45,'In-memory map center updated with stored coordinates');
 const links=core.supplierLinks(data,context.prefs);
 assert.equal(links.mappedOrderCount,1,'Existing order now has geographical supply line');
 const previewNetwork=core.supplierLinks({...data,supplyOrders:[]},context.prefs);
 assert.equal(previewNetwork.connectedSupplierCount,1,'Supplier maps to HQ before any order is created');
 assert.equal(previewNetwork.mappedOrderCount,0,'Connection is not a shipment');
 assert.equal(previewNetwork.geojson.features[0].properties.status,'Network');
 assert.ok(app.includes("if(hq)locations.unshift("),'HQ marker no longer requires supplier existence');
 assert.ok(app.includes("tfHeadquartersMapMarker()"),'Dedicated headquarters marker rendered');
 assert.ok(app.includes("businessLocate"),'Locate HQ button available on profile or map');
 assert.ok(app.includes("mapHQ?{center:[mapHQ.lon,mapHQ.lat]"),'Opening Map prefers saved headquarters coordinate');
 assert.equal(links.geojson.features[0].geometry.type,'LineString');
 assert.ok(requests.length<=4,'Rate-limited lookup is bounded');
 const rerun=await context.tfResolveSupplyLocations({max:3});
 assert.equal(rerun.checked,0,'Existing coordinates are reused on subsequent checks');
 // Do not turn a wrong building into an unreviewed address match.
 const uncertain=resolver.select('6801 River Place Blvd, Austin, TX 78726',[{...hqHit,address:{...hqHit.address,house_number:'6802'}}]);
 assert.equal(uncertain.confidence,'needs_review');
 // Saved HQ address must survive lookup failures and offline mode.
 data.settings[0]={...data.settings[0],homeLat:null,homeLon:null};
 context.navigator.onLine=false;
 const offline=await context.tfResolveSupplyLocations({onlyBusiness:true,max:1});
 assert.equal(offline.located,0);
 assert.equal(offline.offline,1);
 assert.equal(data.settings[0].businessAddress,hqAddress);
 assert.equal(core.position({latitude:data.settings[0].homeLat,longitude:data.settings[0].homeLon}),null);
 assert.ok(app.includes('tfMapNetworkFocus')&&app.includes('liveMap.fitBounds('),'View network frames geographic supply links');
 assert.ok(fs.readFileSync('public/suppliers.js','utf8').includes("bridge.navigate('map',{network:true})"),'Supply screen activates network focus');
 console.log('PASS: saved HQ and supplier addresses resolve into linked map data, reuse coordinates, avoid wrong-building match, and survive offline failure.');
})().catch(error=>{console.error(error);process.exitCode=1});
