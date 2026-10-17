/* TradeFlow Map Experience M01
 * Non-modal iPhone-friendly location sheet, record actions and road routing preview.
 * Provider: OSRM public demo, testing only; production must use licensed/self-hosted router.
 * No fabricated travel time, business photo, hours or verified business details.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowMapExperience=api;
})(typeof globalThis==='object'?globalThis:null,function(){
 'use strict';
 const ROUTE_ID='tf-road-route',ROUTER='https://router.project-osrm.org';
 let bridge=null,opened=null,sheet=null,requestController=null,routeSerial=0,startOverride=null,drag=null;
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function pos(o){
  if(!o)return null;
  const lat=o.lat??o.latitude,lon=o.lon??o.lng??o.longitude;
  if(lat===null||lat===undefined||lat===''||lon===null||lon===undefined||lon==='')return null;
  const a=Number(lat),b=Number(lon);
  return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a)<=90&&Math.abs(b)<=180?{lat:a,lon:b}:null;
 }
 function safeWeb(u){
  const raw=String(u||'').trim();
  if(!raw)return '';
  try{const url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);return url.protocol==='https:'||url.protocol==='http:'?url.href:''}catch{return ''}
 }
 function photo(u){
  const s=String(u||'').trim();
  if(s.startsWith('https://')&&s.length<2500)return s;
  if(/^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(s)&&s.length<350000)return s;
  return '';
 }
 function compact(v,limit=200){return String(v??'').trim().slice(0,limit)}
 function coordinatesOk(p){return Array.isArray(p)&&p.length>=2&&Number.isFinite(Number(p[0]))&&Number.isFinite(Number(p[1]))&&Math.abs(Number(p[0]))<=180&&Math.abs(Number(p[1]))<=90}
 function routeURL(origin,destination,endpoint=ROUTER){
  if(!pos(origin)||!pos(destination))throw Error('Both route points must be located first');
  if(!/^https:\/\//.test(endpoint))throw Error('Routing provider must use HTTPS');
  const a=pos(origin),b=pos(destination);
  const encode=p=>Number(p.lon).toFixed(6)+','+Number(p.lat).toFixed(6);
  return endpoint.replace(/\/$/,'')+'/route/v1/driving/'+encode(a)+';'+encode(b)+'?overview=full&geometries=geojson&steps=false';
 }
 async function fetchRoadRoute(origin,destination,options={}){
  const fetcher=options.fetcher||fetch;
  const url=routeURL(origin,destination,options.endpoint||ROUTER);
  const response=await fetcher(url,{signal:options.signal,credentials:'omit',cache:'no-store',headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('Road routing provider unavailable ('+response.status+')');
  const payload=await response.json();
  if(payload.code!=='Ok'||!Array.isArray(payload.routes)||!payload.routes.length)throw Error('No drivable route found');
  const r=payload.routes[0],geometry=r.geometry,pts=geometry?.coordinates||[];
  if(geometry?.type!=='LineString'||pts.length<2||pts.length>30000||!pts.every(coordinatesOk))throw Error('Routing provider returned invalid road geometry');
  if(!Number.isFinite(r.distance)||!Number.isFinite(r.duration)||r.distance<0||r.duration<0)throw Error('Routing provider returned invalid travel estimates');
  return {geojson:{type:'FeatureCollection',features:[{type:'Feature',properties:{kind:'road_route_provider_result'},geometry:{type:'LineString',coordinates:pts}}]},
    distanceMeters:r.distance,durationSeconds:r.duration,provider:'OSRM demo (estimated, no live traffic)'};
 }
 const fmtDist=meters=>meters<160?Math.round(meters)+' m':(meters/1609.344).toFixed(1)+' mi';
 const fmtTime=seconds=>Math.round(seconds/60)<60?Math.max(1,Math.round(seconds/60))+' min':Math.floor(Math.round(seconds/60)/60)+' h '+String(Math.round(seconds/60)%60).padStart(2,'0')+' min';
 function recordKind(r){
  const k=String(r.mapKind||r.kind||r.type||'').toLowerCase();
  return ['supplier','headquarters','customer','job','opportunity','pin','temporary'].includes(k)?k:'location';
 }
 const icon={
  supplier:'<path d="M3 21V9l6-4 6 4v12M15 9l4-3 2 3v12M2 21h20M7 21v-7h4v7"/>',
  headquarters:'<path d="M3 21V9l9-6 9 6v12M2 21h20M9 21v-8h6v8"/>',
  job:'<path d="M5 9h14v12H5zM9 9V5h6v4M3 13h18"/>',
  customer:'<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
  opportunity:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  default:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>'
 };
 function svg(kind,size=24){return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+(icon[kind]||icon.default)+'</svg>'}
 const navIcon='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m3 11 18-8-8 18-2.7-7.3z"/></svg>';
 function sheetData(input){
  const r=input?.record||input||{},type=recordKind(r),point=pos(r);
  const website=safeWeb(r.website||r.websiteUrl||r.site||'');
  const name=compact(r.title||r.project_name||r.name||'Selected location',120);
  const address=compact(r.address||r.businessAddress||r.city||'',360);
  const img=photo(r.photoUrl||r.photoData||r.imageUrl);
  const phone=compact(r.phone||r.contactPhone,64);
  const hours=compact(r.businessHours||r.openingHours||r.hours,160);
  return {record:r,type,point,website,name,address,img,phone,hours,
   category:compact(r.category||r.trade||'',70),preferred:r.preferred===true,
   extra:input?.extra||'',attrs:input?.attrs||'',temp:type==='temporary'};
 }
 function markup(input){
  const d=sheetData(input),p=d.point,type=d.type;
  const linkURL=p?'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(p.lat+','+p.lon):'';
  const photoMarkup=d.img?'<img class="tf-exp-photo" src="'+escape(d.img)+'" alt="User-provided image for '+escape(d.name)+'" loading="lazy" referrerpolicy="no-referrer">':'';
  const tags='<span class="tf-exp-chip tf-exp-chip-'+escape(type)+'">'+escape(type==='headquarters'?'Headquarters':type.charAt(0).toUpperCase()+type.slice(1))+'</span>'+
   (d.category?'<span class="tf-exp-chip">'+escape(d.category)+'</span>':'')+
   (d.preferred?'<span class="tf-exp-chip tf-exp-preferred">Preferred</span>':'');
  const contacts=[
   ['Address',d.address,svg('default',19),d.address?'<button type="button" class="tf-exp-copy" data-exp-action="copy-address" aria-label="Copy address">⧉</button>':''],
   ['Phone',d.phone,'<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 16v4a2 2 0 0 1-2 2C9 22 2 15 2 5a3 3 0 0 1 3-3h4l2 5-3 2a15 15 0 0 0 7 7l2-3z"/></svg>',d.phone?'<a class="tf-exp-copy" href="tel:'+escape(d.phone.replace(/[^+0-9]/g,''))+'" aria-label="Call business">↗</a>':''],
   ['Website',d.website,'<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18"/></svg>',d.website?'<a class="tf-exp-copy" href="'+escape(d.website)+'" target="_blank" rel="noopener noreferrer" aria-label="Open website">↗</a>':''],
   ['Hours',d.hours,'<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></svg>','']
  ].filter(row=>!!row[1]).map(([label,value,image,action])=>'<div class="tf-exp-contact">'+image+'<div><small>'+escape(label)+'</small><span>'+escape(label==='Website'?value.replace(/^https?:\/\//,'').replace(/\/$/,''):value)+'</span></div>'+action+'</div>').join('');
  const coord=p?Number(p.lat).toFixed(5)+', '+Number(p.lon).toFixed(5):'Coordinates missing';
  return '<div class="tf-exp-layout">'+
   '<button class="tf-exp-handle" type="button" data-exp-action="stage" aria-label="Drag or tap to resize location sheet" aria-expanded="true"><span></span></button>'+
   '<button class="tf-exp-close" type="button" data-exp-action="close" aria-label="Close location card">×</button>'+
   '<div class="tf-exp-head">'+
     '<div class="tf-exp-thumb tf-exp-thumb-'+escape(type)+'">'+svg(type,32)+photoMarkup+'</div>'+
     '<div class="tf-exp-heading"><div class="tf-exp-titleline"><span class="tf-exp-typeicon tf-exp-type-'+escape(type)+'">'+svg(type,23)+'</span><h2>'+escape(d.name)+'</h2></div>'+
      '<p>'+escape(d.address||coord)+'</p><div class="tf-exp-tags">'+tags+'</div>'+
      '<span class="tf-exp-peek-route" id="tfExpPeekRoute"></span>'+
     '</div></div>'+
   '<div class="tf-exp-body">'+
     '<div class="tf-exp-actions">'+
       '<button type="button" class="tf-exp-action tf-exp-directions" data-exp-action="route">'+navIcon+'<span>Directions<small id="tfExpRouteCaption">Preview driving route</small></span></button>'+
       '<button type="button" class="tf-exp-action" data-exp-action="save"><span class="tf-exp-action-symbol">♧</span><span>'+escape(type==='supplier'?'Supplier':type==='headquarters'?'Profile':type==='opportunity'?'Opportunity':type==='customer'?'Customer':type==='job'?'Job':type==='pin'?'Saved':'Save')+'</span></button>'+
       '<button type="button" class="tf-exp-action" data-exp-action="create"><span class="tf-exp-action-symbol">＋</span><span>Create</span></button>'+
       '<button type="button" class="tf-exp-action" data-exp-action="share"><span class="tf-exp-action-symbol">↥</span><span>Share</span></button>'+
       '<button type="button" class="tf-exp-action" data-exp-action="full"><span class="tf-exp-action-symbol">•••</span><span>More</span></button>'+
     '</div>'+
     '<p class="tf-exp-route-status" id="tfExpRouteStatus" role="status" aria-live="polite"></p>'+
     '<div class="tf-exp-contacts">'+contacts+'</div>'+
     '<div class="tf-exp-deep">'+
      '<div class="tf-exp-extra-details"><span>Location</span><strong>'+escape(coord)+'</strong></div>'+
      '<div class="tf-exp-extra-details"><span>Business information</span><strong>'+escape(contacts?'From saved TradeFlow records':'No contact information supplied')+'</strong></div>'+
      '<div class="tf-exp-extra-actions">'+
       '<button type="button" data-exp-action="set-origin">'+svg('default',17)+' Use as route start</button>'+
       '<button type="button" data-exp-action="use-hq">'+svg('headquarters',17)+' Use headquarters as start</button>'+
       '<a href="'+escape(linkURL)+'" target="_blank" rel="noopener noreferrer">'+navIcon+' Open external navigation</a>'+
      '</div>'+
      (d.extra?'<details class="tf-exp-linked"><summary>Link to records / more actions</summary>'+d.extra+'</details>':'')+
      (d.img?'<p class="tf-exp-photo-source">Business image supplied in TradeFlow record; verify rights and location.</p>':'<p class="tf-exp-photo-source">No verified business photo supplied. Add one to the supplier record to display it here.</p>')+
      '<p class="tf-exp-provider-note">Road routing is a preview service. Estimates exclude live traffic.</p>'+
     '</div>'+
   '</div></div>';
 }
 function updateAddress(address){
  if(!opened||!sheet)return false;
  const value=compact(address,360);
  if(!value)return false;
  opened.address=value;
  opened.record.address=value;
  const summary=sheet.querySelector('.tf-exp-heading>p');
  if(summary)summary.textContent=value;
  const addressRow=[...sheet.querySelectorAll('.tf-exp-contact')].find(row=>row.querySelector('small')?.textContent==='Address');
  if(addressRow){const span=addressRow.querySelector('span');if(span)span.textContent=value}
  sheet.querySelectorAll('[data-address]').forEach(el=>{el.dataset.address=value});
  return true;
 }
 function configure(next){bridge=next||{}}
 function selectedOrigin(){
  if(startOverride)return startOverride;
  const prefs=bridge?.getPrefs?.()||{};
  return pos({lat:prefs.homeLat,lon:prefs.homeLon});
 }
 function mapFit(){
  const map=bridge?.getMap?.();if(!map||!opened||!sheet)return;
  const point=opened.point;if(!point)return;
  const s=sheet.dataset.stage||'half';
  const y=s==='peek'?80:s==='half'?Math.min(160,Math.round(sheet.getBoundingClientRect().height/2)):Math.min(240,Math.round(sheet.getBoundingClientRect().height/3));
  try{map.easeTo({center:[point.lon,point.lat],offset:[0,-y],duration:280})}catch{}
 }
 function setStage(stage,focus=true){
  if(!sheet)return;
  const next=['peek','half','full'].includes(stage)?stage:'half';
  sheet.dataset.stage=next;
  const h=sheet.querySelector('.tf-exp-handle');
  if(h)h.setAttribute('aria-expanded',String(next!=='peek'));
  if(focus)mapFit();
 }
 function copyText(s){
  if(typeof navigator!=='undefined'&&navigator.clipboard?.writeText)return navigator.clipboard.writeText(s);
  const element=document.createElement('textarea');element.value=s;document.body.appendChild(element);element.select();document.execCommand('copy');element.remove();return Promise.resolve();
 }
 function routingColor(){return '#a547ec'} // GTA-style purple, no neon halo
 function clearRoute(){
  ++routeSerial;
  requestController?.abort();requestController=null;
  const map=bridge?.getMap?.();
  if(map&&map.getLayer?.(ROUTE_ID))map.removeLayer(ROUTE_ID);
  if(map&&map.getLayer?.(ROUTE_ID+'-case'))map.removeLayer(ROUTE_ID+'-case');
  if(map&&map.getSource?.(ROUTE_ID))map.removeSource(ROUTE_ID);
 }
 function putRouteOnMap(result,origin,destination){
  const map=bridge?.getMap?.();if(!map)return;
  const src=map.getSource?.(ROUTE_ID);
  if(src?.setData)src.setData(result.geojson);
  else{
   map.addSource(ROUTE_ID,{type:'geojson',data:result.geojson});
   map.addLayer({id:ROUTE_ID+'-case',type:'line',source:ROUTE_ID,layout:{'line-cap':'round','line-join':'round'},
     paint:{'line-color':'#32133e','line-width':8,'line-opacity':.85}});
   map.addLayer({id:ROUTE_ID,type:'line',source:ROUTE_ID,layout:{'line-cap':'round','line-join':'round'},
     paint:{'line-color':routingColor(),'line-width':5.2,'line-opacity':1}});
  }
  try{
   const west=Math.min(origin.lon,destination.lon),east=Math.max(origin.lon,destination.lon),south=Math.min(origin.lat,destination.lat),north=Math.max(origin.lat,destination.lat);
   const height=sheet?.getBoundingClientRect().height||0;
   map.fitBounds([[west,south],[east,north]],{padding:{top:120,bottom:Math.min(Math.max(130,height+35),Math.max(160,window.innerHeight*.55)),left:45,right:45},maxZoom:14,duration:430});
  }catch{}
 }
 function updateRouteStatus(txt,good=false){
  if(!sheet)return;
  const status=sheet.querySelector('#tfExpRouteStatus');if(status){status.textContent=txt;status.classList.toggle('is-good',good)}
 }
 async function route(){
  if(!opened)return;
  const origin=selectedOrigin(),destination=opened.point;
  if(!origin){setStage('half');updateRouteStatus('Set your headquarters on the Map or choose a route start first.');return}
  if(!destination){updateRouteStatus('Select an accurately mapped location first.');return}
  if(Math.abs(origin.lat-destination.lat)+Math.abs(origin.lon-destination.lon)<.00002){updateRouteStatus('Start and destination are the same. Choose another location.');return}
  clearRoute();
  const ticket=++routeSerial;requestController=new AbortController();
  setStage('half',false);updateRouteStatus('Calculating road route…');
  try{
   const result=await fetchRoadRoute(origin,destination,{signal:requestController.signal,endpoint:bridge?.getRouteEndpoint?.()||ROUTER});
   if(ticket!==routeSerial||!sheet)return;
   putRouteOnMap(result,origin,destination);
   const label=fmtTime(result.durationSeconds)+' · '+fmtDist(result.distanceMeters);
   updateRouteStatus(label+' · Estimated, no live traffic · OSRM demo',true);
   const caption=sheet.querySelector('#tfExpRouteCaption'),peek=sheet.querySelector('#tfExpPeekRoute');
   if(caption)caption.textContent=label;if(peek)peek.textContent=label;
  }catch(error){
   if(ticket!==routeSerial||error.name==='AbortError')return;
   updateRouteStatus('Road route unavailable. Use external navigation instead.');
  }
 }
 function clear(){
  // Dismissing a location card must not erase an already calculated driving route.
  ++routeSerial;requestController?.abort();requestController=null;
  sheet?.remove();document.getElementById('tfSheetShade')?.remove();opened=null;sheet=null;
 }
 function open(input){
  clear();opened=sheetData(input);
  if(typeof document==='undefined')return opened;
  sheet=document.createElement('section');
  sheet.id='tfLocationSheet';sheet.className='tf-location-sheet tf-experience-sheet';
  sheet.setAttribute('role','region');sheet.setAttribute('aria-label','Location details for '+opened.name);
  sheet.dataset.stage=window.matchMedia?.('(max-width:650px)')?.matches?'half':'full';
  sheet.innerHTML=markup(input);
  document.body.appendChild(sheet);
  const caption=sheet.querySelector('#tfExpRouteCaption');
  const origin=selectedOrigin(),headquarters=bridge?.getPrefs?.()?.company||'headquarters';
  if(caption)caption.textContent=origin?(startOverride?'From '+startOverride.label:'From '+headquarters):'Set route start';
  // The entire top region (including both edges) is a grab surface, except controls.
  const grabSurfaces=[sheet.querySelector('.tf-exp-handle'),sheet.querySelector('.tf-exp-head')].filter(Boolean);
  const stageHeight=()=>sheet.getBoundingClientRect().height;
  const maxHeight=()=>Math.max(220,window.innerHeight-170);
  const clearDrag=()=>{sheet.style.removeProperty('height');sheet.classList.remove('tf-exp-dragging');drag=null};
  const beginDrag=event=>{
   if(event.button!==undefined&&event.button!==0)return;
   if(event.target.closest('button:not(.tf-exp-handle),a,input,select,textarea,[data-exp-action="close"]'))return;
   drag={start:event.clientY,height:stageHeight(),stage:sheet.dataset.stage,pointerId:event.pointerId,moved:false};
   try{event.currentTarget.setPointerCapture(event.pointerId)}catch{}
  };
  const moveDrag=event=>{
   if(!drag||drag.pointerId!==event.pointerId)return;
   const delta=event.clientY-drag.start;
   if(Math.abs(delta)>7)drag.moved=true;
   if(!drag.moved)return;
   event.preventDefault();
   // Resize from the fixed bottom edge, never translate the card off its dock.
   sheet.classList.add('tf-exp-dragging');
   sheet.style.height=Math.max(110,Math.min(maxHeight(),drag.height-delta))+'px';
  };
  const finishDrag=event=>{
   if(!drag||drag.pointerId!==event.pointerId)return;
   const delta=event.clientY-drag.start,moved=drag.moved,origin=drag.stage;
   clearDrag();
   const order=['peek','half','full'],i=Math.max(0,order.indexOf(origin));
   if(delta< -45)setStage(order[Math.min(i+1,2)]);
   else if(delta>45)setStage(order[Math.max(0,i-1)]);
   else if(!moved&&event.currentTarget.classList.contains('tf-exp-handle'))setStage(order[(i+1)%3]);
  };
  for(const surface of grabSurfaces){
   surface.addEventListener('pointerdown',beginDrag);
   surface.addEventListener('pointermove',moveDrag);
   surface.addEventListener('pointerup',finishDrag);
   surface.addEventListener('pointercancel',clearDrag);
   surface.addEventListener('lostpointercapture',()=>{if(drag)clearDrag()});
  }
  sheet.addEventListener('click',async e=>{
   const el=e.target.closest('[data-exp-action]');if(!el||el.classList.contains('tf-exp-handle'))return;
   const action=el.dataset.expAction;
   if(action==='close'){clear();return}
   if(action==='full'){setStage('full');return}
   if(action==='route'){await route();return}
   if(action==='copy-address'){await copyText(opened.address);updateRouteStatus('Address copied.');return}
   if(action==='set-origin'){if(opened.point){startOverride={...opened.point,label:opened.name};updateRouteStatus('Route start set: '+opened.name+'. Select another location to get directions.');clearRoute()}return}
   if(action==='use-hq'){startOverride=null;updateRouteStatus('Route start reset to headquarters.');clearRoute();return}
   if(action==='save'){
    const page={supplier:'suppliers',headquarters:'preferences',opportunity:'opportunities',customer:'customers',job:'jobs'}[opened.type];
    if(page){await bridge?.navigate?.(page);clear();return}
    if(opened.type==='pin'){updateRouteStatus('This location is already saved.');return}
    await bridge?.onAction?.('save',opened);return
   }
   if(action==='create'){await bridge?.onAction?.('opportunity',opened);return}
   if(action==='share'){
    const url='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(opened.point?opened.point.lat+','+opened.point.lon:opened.address);
    const share={title:opened.name,text:opened.address,url};
    try{if(navigator.share)await navigator.share(share);else{await copyText(url);updateRouteStatus('Location link copied.')}}catch(error){if(error?.name!=='AbortError')updateRouteStatus('Sharing unavailable.')}
   }
  });
  setStage(sheet.dataset.stage,false);
  // Allow the map to remain interactive behind the non-modal sheet.
  if(window.requestAnimationFrame)window.requestAnimationFrame(()=>mapFit());
  return opened;
 }
 return Object.freeze({configure,open,updateAddress,close:clear,setStage,route,clearRoute,routeURL,fetchRoadRoute,markup,sheetData,formatDistance:fmtDist,formatTime:fmtTime});
});
