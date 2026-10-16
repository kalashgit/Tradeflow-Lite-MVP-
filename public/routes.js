/* TradeFlow Routing & Integrations R05 — local stop sequencing and integration readiness.
   Route heuristic uses straight-line distance; NOT road travel time, live crew GPS, OAuth or dispatch. */
(function(global){
'use strict';
let api=null,selectedDate='',viewMode='routes';
const PLAN_ID='tf-routes-v1';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function day(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
selectedDate=day();
function validDate(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T12:00:00');return !isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v}
function coords(obj){
 if(!obj)return null;
 let lat=Number(obj.latitude),lon=Number(obj.longitude);
 const direct=obj.latitude!==undefined&&obj.latitude!==null&&obj.latitude!==''&&obj.longitude!==undefined&&obj.longitude!==null&&obj.longitude!=='';
 if(direct&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180)return {lat,lon};
 const v=obj.coordinates;
 if(v&&typeof v==='object'){lat=Number(v.latitude??v.lat);lon=Number(v.longitude??v.lon??v.lng)}
 else if(typeof v==='string'){
  const pair=v.split(',');if(pair.length!==2)return null;lat=Number(pair[0]);lon=Number(pair[1]);
 }else return null;
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return null;
 return {lat,lon};
}
function haversine(a,b){
 const rad=Math.PI/180,dl=(b.lat-a.lat)*rad,dn=(b.lon-a.lon)*rad;
 const w=Math.sin(dl/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dn/2)**2;
 return 6371*2*Math.asin(Math.min(1,Math.sqrt(w)));
}
function stops(d,date){
 const data=[];
 const add=(group,rec,label,detail)=>{
  const position=coords(rec);if(!position)return;
  data.push({key:group+':'+rec.id,id:rec.id,group,name:String(label||'Location'),detail:String(detail||''),lat:position.lat,lon:position.lon});
 };
 (d.jobs||[]).filter(x=>x.date===date&&x.status!=='Completed'&&x.status!=='Cancelled').slice(0,200).forEach(x=>
  add('job',x,x.title||'Job',x.address||'Scheduled job'));
 (d.tasks||[]).filter(x=>x.due===date&&x.status!=='Done').slice(0,200).forEach(x=>
  add('task',x,x.title||'Task',x.location||'Scheduled task'));
 (d.opportunities||[]).filter(x=>['Saved','Contacted','Interested','Quoted'].includes(x.status)&&x.map_enabled!==false).slice(0,200).forEach(x=>
  add('opportunity',x,x.project_name||'Opportunity',x.city||'Research record'));
 (d.pins||[]).slice(0,120).forEach(x=>add('pin',x,x.title||x.name||'Map pin',x.address||'Saved map location'));
 return data.slice(0,200);
}
function sequence(items,start){
 const pending=items.slice(),result=[];let pos=start|| (pending.length?{lat:pending[0].lat,lon:pending[0].lon}:null),km=0;
 while(pending.length){
  let closest=0,best=Infinity;
  for(let i=0;i<pending.length;i++){
   const d=pos?haversine(pos,pending[i]):0;
   if(d<best){best=d;closest=i}
  }
  const current=pending.splice(closest,1)[0];
  if(pos)km+=best;
  result.push(current);pos=current;
 }
 return {ordered:result,straightKm:Math.round(km*10)/10};
}
function stored(d){const r=(d.settings||[]).find(x=>x.id===PLAN_ID)||{};return {id:PLAN_ID,plans:Array.isArray(r.plans)?r.plans:[]}}
function plan(d,date=selectedDate){return stored(d).plans.find(x=>x.date===date)||{date,selected:[],ordered:[],updatedAt:''}}
function head(title,sub){return '<header class="tf-route-head"><span class="tf-route-kicker">TRADEFLOW / FIELD OPERATIONS</span><h1>'+esc(title)+'</h1><p>'+esc(sub)+'</p></header>'}
function navbar(tab){return '<nav class="tf-route-nav"><button type="button" class="'+(tab==='routes'?'active':'')+'" data-tab="routes">Route Planner</button><button type="button" class="'+(tab==='integrations'?'active':'')+'" data-tab="integrations">Integrations</button><button type="button" data-tab="map">Opportunity Map ↗</button></nav>'}
function stopRows(list,selected,ordered){
 const set=new Set(selected),order=new Map(ordered.map((key,i)=>[key,i+1]));
 return list.map(x=>'<label class="tf-route-candidate"><input type="checkbox" data-route-action="select" data-key="'+esc(x.key)+'" '+(set.has(x.key)?'checked':'')+'><span class="tf-route-place"><strong>'+esc(x.name)+'</strong><small>'+esc(x.group)+' · '+esc(x.detail)+'</small></span>'+
 (order.has(x.key)?'<span class="tf-route-number">'+order.get(x.key)+'</span>':'')+'</label>').join('');
}
function routePage(d,prefs){
 const target=plan(d),available=stops(d,selectedDate),byKey=new Map(available.map(x=>[x.key,x]));
 const chosen=target.selected.filter(x=>byKey.has(x)),ordered=target.ordered.filter(x=>byKey.has(x)&&chosen.includes(x));
 const rest=chosen.filter(x=>!ordered.includes(x)),position=ordered.concat(rest).map(x=>byKey.get(x));
 const home=coords({latitude:prefs.homeLat,longitude:prefs.homeLon}),distance=sequence(position,home).straightKm;
 const unlocated=(d.jobs||[]).filter(x=>x.date===selectedDate&&x.status!=='Completed'&&!coords(x)).length;
 const routeUrl=mapsUrl(position,home);
 return '<div class="tf-route-page"><button type="button" class="tf-route-back" data-tab="settings">‹ More</button>'+
 head('Route Planner','Build a practical stop order from saved locations. No road times or crew GPS are inferred.')+navbar('routes')+
 '<div class="tf-route-card tf-route-day"><label>Date<input type="date" id="tfRouteDate" value="'+esc(selectedDate)+'"></label>'+
 '<div><strong>'+chosen.length+' selected stop'+(chosen.length===1?'':'s')+'</strong><small>'+distance.toFixed(1)+' km straight-line connection estimate</small></div></div>'+
 '<div class="tf-route-statrow"><div><small>AVAILABLE LOCATIONS</small><strong>'+available.length+'</strong></div><div><small>SELECTED</small><strong>'+chosen.length+'</strong></div><div><small>JOBS MISSING COORDINATES</small><strong>'+unlocated+'</strong></div></div>'+
 '<div class="tf-route-title"><h2>Today’s stop order</h2><button class="tf-route-primary" type="button" data-route-action="optimize" '+(chosen.length<2?'disabled':'')+'>Suggest order</button></div>'+
 (position.length?'<div class="tf-route-card">'+position.map((x,i)=>'<div class="tf-route-ordered"><span class="tf-route-number">'+(i+1)+'</span><div><strong>'+esc(x.name)+'</strong><small>'+esc(x.group)+' · '+esc(x.detail)+'</small></div><button type="button" data-route-action="focus" data-key="'+esc(x.key)+'">Map ↗</button></div>').join('')+
 '<div class="tf-route-actions"><button type="button" class="tf-route-secondary" data-route-action="clear">Clear selected</button>'+
 (routeUrl?'<a class="tf-route-secondary" href="'+esc(routeUrl)+'" target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>':'')+'</div></div>':
 '<div class="tf-route-empty">Select stops below. For new client appointments, schedule a Job or Task and save its coordinates before building a route.</div>')+
 '<div class="tf-route-title"><h2>Available locations</h2><span class="tf-route-sub">Only saved positions shown</span></div>'+
 (available.length?'<div class="tf-route-card tf-route-candidates">'+stopRows(available,chosen,ordered)+'</div>':'<div class="tf-route-empty">No map-ready Jobs, Tasks, saved Opportunities or Pins. Add locations in Map or save job coordinates.</div>')+
 '<p class="tf-route-notice">“Suggest order” uses straight-line nearest-neighbor distance and is not a road-route optimizer. It does not account for traffic, road closures, service durations, fixed appointment windows or crew permissions. For real directions, review the external map before travel. Google Maps opens a limited subset when many stops are selected.</p></div>';
}
function mapsUrl(ordered,home){
 if(!ordered.length)return '';
 const points=ordered.slice(0,7).map(x=>x.lat.toFixed(6)+','+x.lon.toFixed(6));
 let origin=home?home.lat.toFixed(6)+','+home.lon.toFixed(6):points[0];
 const destination=points[points.length-1];
 const waypoints=(home?points.slice(0,-1):points.slice(1,-1));
 const params=new URLSearchParams({api:'1',origin,destination,travelmode:'driving'});
 if(waypoints.length)params.set('waypoints',waypoints.join('|'));
 return 'https://www.google.com/maps/dir/?'+params.toString();
}
const integrations=[
 ['QuickBooks Online','Accounting','Not connected','Two-way data reconciliation needs Intuit OAuth, scoped permissions, field-level ownership and conflict handling.'],
 ['Stripe Connect','Customer payments','Not connected','Online payments need contractor onboarding, verified entitlements and payment webhooks.'],
 ['Google Business Profile','SEO & reviews','Not connected','Business authorization, allowed review link use and publish confirmation needed.'],
 ['Google Ads','Search campaigns','Not connected','Approved ads account and explicit budget approvals before publishing or spending.'],
 ['Meta Marketing API','Social ads','Not connected','Facebook/Instagram business account authorization, permission scopes and spending consent.'],
 ['SMS / Email provider','Client communication','Not connected','Consent, opt-outs, authorized sender identity, templates and delivery logs required.'],
 ['Zapier / Make','Automation','Not connected','Company-scoped access and retries/idempotency required before exposing triggers.'],
 ['Road routing provider','Drive-time optimization','Not connected','Road network distances, time windows, traffic and assignment constraints require a dedicated provider.']
];
function integrationPage(){
 return '<div class="tf-route-page"><button type="button" class="tf-route-back" data-tab="settings">‹ More</button>'+
 head('Integrations','Track what TradeFlow can connect to in the future. Unverified credentials are never collected.')+navbar('integrations')+
 '<div class="tf-route-integration-banner"><strong>Connected accounts: 0</strong><p>No accounting, bank, ad, messaging or routing providers are connected. AI chat and public map tiles are separate preview services, not account integrations.</p></div>'+
 integrations.map(x=>'<article class="tf-route-integration"><div class="tf-route-integration-top"><div><small>'+esc(x[1])+'</small><h2>'+esc(x[0])+'</h2></div><span>'+esc(x[2])+'</span></div><p>'+esc(x[3])+'</p></article>').join('')+
 '<p class="tf-route-notice">Do not paste API keys, tokens, passwords or banking credentials into TradeFlow records. OAuth, tenant permissions, cloud data isolation, worker queues and audit logs must be implemented and tested before making any connection live.</p></div>';
}
async function putPlan(date,fn){
 const record=await api.get('settings',PLAN_ID)||{id:PLAN_ID,plans:[]};
 record.plans=Array.isArray(record.plans)?record.plans:[];
 const current=record.plans.find(x=>x.date===date)||{date,selected:[],ordered:[]};
 const next=fn({...current,selected:[...(current.selected||[])],ordered:[...(current.ordered||[])]});
 if(!next)return;
 next.updatedAt=new Date().toISOString();
 record.plans=record.plans.filter(x=>x.date!==date).concat([next]).slice(-90);
 await api.put('settings',record);
 api.render();
}
async function onClick(event){
 if(!api)return;
 const btn=event.target.closest?.('[data-route-action]');if(!btn)return;
 event.preventDefault();
 try{
 const action=btn.dataset.routeAction,key=btn.dataset.key,date=selectedDate;
 const d={jobs:await api.all('jobs'),tasks:await api.all('tasks'),opportunities:await api.all('opportunities'),pins:await api.all('pins'),settings:await api.all('settings')};
 const opts=stops(d,date);
 if(action==='focus'){
  const dest=opts.find(x=>x.key===key);if(dest)api.focusMap?.(dest.lon,dest.lat);
  return;
 }
 if(action==='select'){
  if(!opts.some(x=>x.key===key))return;
  await putPlan(date,p=>{
   p.selected=btn.checked?[...new Set(p.selected.concat([key]))].slice(0,25):p.selected.filter(x=>x!==key);
   p.ordered=p.ordered.filter(x=>p.selected.includes(x));return p;
  });return;
 }
 if(action==='clear'){await putPlan(date,p=>({...p,selected:[],ordered:[]}));return}
 if(action==='optimize'){
  const current=plan(d,date),items=current.selected.map(k=>opts.find(x=>x.key===k)).filter(Boolean);
  const prefs=api.getPrefs?.()||{},home=coords({latitude:prefs.homeLat,longitude:prefs.homeLon});
  const candidate=sequence(items,home);
  await putPlan(date,p=>({...p,ordered:candidate.ordered.map(x=>x.key)}));
  api.notify('Route order suggested by straight-line distance. Check roads in navigation.');return;
 }
 }catch(err){alert('Route action failed: '+err.message)}
}
function onChange(event){
 if(event.target.id!=='tfRouteDate')return;
 const value=event.target.value;if(!validDate(value))return;
 selectedDate=value;api?.render();
}
function configure(bridge){api=bridge;document.addEventListener('click',onClick);document.addEventListener('change',onChange)}
function render(tab,d,prefs){return tab==='routes'?routePage(d,prefs||{}):tab==='integrations'?integrationPage():''}
global.TradeFlowRoutes={configure,render,_test:{coords,haversine,stops,sequence,plan,mapsUrl,validDate}};
})(typeof window!=='undefined'?window:globalThis);
