'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const ui=require('../public/map-experience.js');
const core=require('../public/core-integration.js');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const css=fs.readFileSync('public/map-experience.css','utf8');
const from={lat:30.2672,lon:-97.7431},to={lat:30.3500,lon:-97.6500};
const url=ui.routeURL(from,to);
assert.ok(url.startsWith('https://router.project-osrm.org/route/v1/driving/-97.743100,30.267200;-97.650000,30.350000'));
assert.ok(url.includes('overview=full&geometries=geojson'));
assert.throws(()=>ui.routeURL(null,to),/both route points/i);
assert.throws(()=>ui.routeURL(from,to,'http://router.example'),/HTTPS/);
const real={code:'Ok',routes:[{distance:18920,duration:1680,geometry:{type:'LineString',coordinates:[[-97.7431,30.2672],[-97.71,30.31],[-97.65,30.35]]}}]};
let calls=0;
(async()=>{
 const route=await ui.fetchRoadRoute(from,to,{fetcher:async (request,options)=>{
  calls++;assert.ok(request.includes('/route/v1/driving/'));assert.equal(options.credentials,'omit');return {ok:true,json:async()=>real}
 }});
 assert.equal(calls,1);
 assert.equal(route.geojson.features[0].geometry.type,'LineString');
 assert.equal(route.distanceMeters,18920);
 assert.equal(route.durationSeconds,1680);
 assert.match(route.provider,/demo/);
 assert.equal(ui.formatTime(1680),'28 min');
 assert.equal(ui.formatDistance(18920),'11.8 mi');
 await assert.rejects(()=>ui.fetchRoadRoute(from,to,{fetcher:async()=>({ok:true,json:async()=>({code:'NoRoute',routes:[]})})}),/No drivable route/);
 await assert.rejects(()=>ui.fetchRoadRoute(from,to,{fetcher:async()=>({ok:true,json:async()=>({code:'Ok',routes:[{distance:5,duration:3,geometry:{type:'LineString',coordinates:[[181,95],[4,5]]}}]})})}),/invalid road geometry/);
 await assert.rejects(()=>ui.fetchRoadRoute(from,to,{fetcher:async()=>({ok:false,status:429})}),/unavailable/);
 const card=ui.markup({record:{mapKind:'supplier',name:'ABC Supply',address:'Some Street, Austin, Texas',phone:'+1 512 123 1234',website:'https://abc.example.com',businessHours:'Mon–Fri, 8 AM–5 PM',category:'Electrical',preferred:true,photoUrl:'https://abc.example.com/photo.jpg',latitude:to.lat,longitude:to.lon}});
 for(const expected of ['tf-exp-thumb','tf-exp-photo','tf-exp-chip-supplier','Preferred','Electrical','tf-exp-handle','data-exp-action="route"','data-exp-action="share"','Directions','Some Street','512 123','abc.example.com','Mon–Fri']){
  assert.ok(card.includes(expected),'Live business card contains '+expected);
 }
 assert.ok(!card.includes('28 min'), 'Do not display a made-up driving ETA');
 assert.ok(!card.includes('12345 US-290'), 'Do not copy the image mockup supplier address');
 const dangerous=ui.markup({record:{name:'<script>alert(1)</script>',website:'javascript:alert(1)',photoUrl:'javascript:alert(1)',latitude:30.2,longitude:-97.7}});
 assert.ok(!dangerous.includes('<script>')&&!dangerous.includes('src="javascript:'));
 assert.ok(!dangerous.includes('href="javascript:'));
 assert.ok(dangerous.includes('&lt;script&gt;'));
 const supplier=core.prepare('supplier.save',{name:'User Supplier',address:'Main St',photoUrl:'https://example.com/building.jpg',category:'Electrical supplies',preferred:'on',businessHours:'Mon–Fri'},{
  suppliers:[],supplyOrders:[],settings:[],customers:[],jobs:[],opportunities:[]
 },()=>'s1',()=>'2026-10-17T10:00:00Z').writes[0].record;
 assert.equal(supplier.photoUrl,'https://example.com/building.jpg');
 assert.equal(supplier.category,'Electrical supplies');assert.equal(supplier.preferred,true);
 assert.throws(()=>core.prepare('supplier.save',{name:'Malicious Photo',photoUrl:'javascript:alert(1)'},{suppliers:[]},()=>'2'),/Business photo must/);
 for(const part of ["window.TradeFlowMapExperience?.configure","window.TradeFlowMapExperience.open({record","data-action=\"mapMyLocation\"","data-action=\"mapClearRoute\""]){
  assert.ok(app.includes(part),'Connected map experience: '+part);
 }
 assert.match(html,/href="\.\/map-experience\.css(?:\?[^\"]+)?"/);
 assert.match(html,/src="\.\/map-experience\.js(?:\?[^\"]+)?"/);
 assert.ok(sw.includes("'./map-experience.js'")&&sw.includes("'./map-experience.css'"));
 assert.ok(css.includes('backdrop-filter:blur(17px)')&&css.includes('data-stage=half')&&css.includes('data-stage=peek'));
 assert.ok(css.includes('.tf-exp-photo')&&css.includes('.tf-exp-directions'));
 const source=fs.readFileSync('public/map-experience.js','utf8');
 assert.ok(source.includes("'#a547ec'"),'Purple GTA-style solid road route');
 assert.ok(source.includes('No drivable route found')&&source.includes('no live traffic'));
 assert.ok(source.includes('pointerdown')&&source.includes('pointerup'),'Drag sheet between states');
 assert.ok(source.includes("sheet.style.height=clamp(drag.height-delta"),'Sheet resizes from docked bottom edge while following finger');
 assert.ok(source.includes("sheet.addEventListener('pointerdown',startDrag)"),'Entire compact sheet accepts pointer gestures');
 assert.ok(source.includes('sheet.dataset.stage=window.matchMedia')&&source.includes("?'peek':'full'"),'Mobile location sheet starts compact');
 assert.ok(source.includes("Dismissing a location card must not erase"),'Road route persists when sheet is dismissed');
 assert.ok(source.includes("const page={supplier:'suppliers'"),'Existing record buttons navigate instead of duplicating records');
 assert.ok(source.includes('getPrefs')&&source.includes('Set your headquarters'),'Road routing has a defined origin');
 assert.ok(!source.includes('fakeEstimatedDriveTime'),'Never invent route metrics');
 console.log('PASS M01 TradeFlow location sheet, validated road routing, photo safety, local supplier metadata, assets and responsive UI wiring');
})().catch(err=>{console.error(err);process.exitCode=1});
