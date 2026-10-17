'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('public/routes.js','utf8'),html=fs.readFileSync('public/index.html','utf8'),
 app=fs.readFileSync('public/app.js','utf8'),sw=fs.readFileSync('public/sw.js','utf8');
const win={},listeners={},document={addEventListener(k,h){(listeners[k]||(listeners[k]=[])).push(h)}};
vm.runInNewContext(source,{window:win,document,Date,Math,Set,Map,URLSearchParams,console,alert:()=>{throw Error('unexpected alert')},confirm:()=>true},{timeout:3000});
const mod=win.TradeFlowRoutes;assert.ok(mod?.configure&&mod?.render);
assert.equal(mod._test.validDate('2026-02-30'),false);
assert.equal(mod._test.validDate('2026-10-16'),true);
assert.equal(mod._test.coords({coordinates:'30.25,-97.75'}).lon,-97.75);
assert.equal(mod._test.coords({latitude:30.25,longitude:-97.75}).lat,30.25);
assert.equal(mod._test.coords({latitude:99,longitude:0}),null);
const a={lat:30.25,lon:-97.75},b={lat:30.26,lon:-97.75};
assert.ok(mod._test.haversine(a,b)>1&&mod._test.haversine(a,b)<1.2);
const items=[{key:'far',lat:30.45,lon:-97.75},{key:'near',lat:30.26,lon:-97.75}];
assert.equal(mod._test.sequence(items,a).ordered[0].key,'near');
const data={jobs:[{id:'j1',title:'Job A',date:'2026-10-16',status:'Planned',latitude:30.26,longitude:-97.75}],
 tasks:[],opportunities:[{id:'o1',project_name:'GC office',status:'Saved',city:'Austin',latitude:30.45,longitude:-97.75}],pins:[],
 settings:[]};
const stops=mod._test.stops(data,'2026-10-16');assert.equal(stops.length,2);
assert.ok(mod._test.mapsUrl(stops,a).startsWith('https://www.google.com/maps/dir/?api=1'));
const store=JSON.parse(JSON.stringify(data));
let calls=0,where=null;
mod.configure({get:async(s,id)=>store[s]?.find(x=>x.id===id),all:async s=>store[s]||[],
 put:async(s,x)=>{const rows=store[s];let index=rows.findIndex(y=>y.id===x.id);if(index<0)rows.push(x);else rows[index]=x},
 render(){calls++},notify(){calls++},getPrefs:()=>({homeLat:30.25,homeLon:-97.75}),
 focusMap(lon,lat){where={lon,lat}}});
assert.ok(mod.render('routes',store,{homeLat:30.25,homeLon:-97.75}).includes('Route Planner'));
assert.ok(mod.render('integrations',store,{}).includes('Not connected'));
assert.ok(mod.render('integrations',store,{}).includes('QuickBooks Online'));
const click=listeners.click[0],evt=(a,key,checked=false)=>({preventDefault(){},target:{closest:()=>({dataset:{routeAction:a,key},checked})}});
listeners.change[0]({target:{id:'tfRouteDate',value:'2026-10-16'}});
(async()=>{
 await click(evt('select','job:j1',true));
 await click(evt('select','opportunity:o1',true));
 assert.equal(store.settings[0].plans[0].selected.length,2);
 await click(evt('optimize'));
 assert.equal(store.settings[0].plans[0].ordered[0],'job:j1');
 await click(evt('focus','job:j1'));
 assert.ok(where?.lon===-97.75);
 const result=mod.render('routes',store,{homeLat:30.25,homeLon:-97.75});
 assert.ok(result.includes('2 selected stops')&&result.includes('straight-line'));
 assert.ok(result.includes('Open in Google Maps'));
 assert.ok(html.includes('routes.js')&&html.includes('routes.css')&&sw.includes('routes.js'));
 assert.ok(app.includes("tab==='routes'")&&app.includes("tab==='integrations'"));
 console.log('PASS: Routes R05 saved stop ordering, map handoff, honest straight-line labeling and unconnected integrations');
 require('./integrations-v2.test.cjs');
})().catch(err=>{console.error(err);process.exitCode=1});
