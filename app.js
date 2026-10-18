const DB='tradeflow-lite-v1', STORES=['customers','quotes','jobs','tasks','events','expenses','settings'];let db,tab='dashboard',query='',modal=null,toast='';let prefs={company:'TradeFlow Lite',accent:'#087f91',categories:['Electrical','Plumbing','Construction','Renovation','Other']};
const $=s=>document.querySelector(s);const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');const euro=n=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(Number(n)||0);const today=()=>new Date().toISOString().slice(0,10);const uid=()=>crypto.randomUUID();
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,2);r.onupgradeneeded=()=>{for(const s of STORES)if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s,{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function tx(store,mode,cb){return new Promise((res,rej)=>{const t=db.transaction(store,mode),s=t.objectStore(store),r=cb(s);t.oncomplete=()=>res(r?.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})}const all=s=>tx(s,'readonly',x=>x.getAll());const put=(s,v)=>tx(s,'readwrite',x=>x.put(v));const del=(s,id)=>tx(s,'readwrite',x=>x.delete(id));const get=(s,id)=>tx(s,'readonly',x=>x.get(id));
async function event(text){await put('events',{id:uid(),text,date:new Date().toISOString()})}function notify(text){toast=text;render();setTimeout(()=>{toast='';render()},3500)}
const names={expenses:'Finance',dashboard:'Home',customers:'Customers',quotes:'Opportunities',jobs:'Jobs',tasks:'Tasks',settings:'More',map:'Map'};const icons={expenses:'💼',dashboard:'⌂',customers:'👥',quotes:'📡',jobs:'🧭',tasks:'✓',settings:'⚙',map:'🗺'};const mobileTabMeta={dashboard:{label:'Home',icon:'⌂'},map:{label:'Map',icon:'🗺'},quotes:{label:'Opportunities',icon:'📡'},expenses:{label:'Finance',icon:'💼'},settings:{label:'More',icon:'⚙'}};const financeState={period:'All',metric:'Revenue'};const mapState={instance:null,markers:[],pendingMarker:null,pendingPopup:null,lastTapAt:0,geocodeCache:new Map()};const DEFAULT_MAP_CENTER={lng:-6.2603,lat:53.3498};function safeAddress(value){return String(value||'Address unavailable').trim()||'Address unavailable';}function reverseGeocode(lat,lng){const key=`${lat.toFixed(5)},${lng.toFixed(5)}`;const cached=mapState.geocodeCache.get(key);if(cached)return Promise.resolve(cached);return fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,{headers:{'Accept-Language':'en'}}).then(r=>r.ok?r.json():null).then(data=>data&&data.display_name?{display_name:data.display_name,lat:Number(data.lat),lng:Number(data.lon)}:null).catch(()=>null).then(result=>{mapState.geocodeCache.set(key,result);return result;});}function getFinanceSeries(d,period='All'){const ranges={'1W':7,'1M':30,'3M':90,'6M':180,'1Y':365,'All':3650};const days=Number(ranges[period]||3650);const end=new Date();end.setHours(0,0,0,0);const start=new Date(end);start.setDate(end.getDate()-days+1);const bucket=new Map();for(let i=0;i<=days;i++){const date=new Date(start);date.setDate(start.getDate()+i);bucket.set(date.toISOString().slice(0,10),{date:new Date(date),revenue:0,expenses:0,profit:0,quoted:0});}for(const q of d.quotes||[]){const dateStr=q.sentDate||q.date||'';if(!dateStr||new Date(dateStr).toString()==='Invalid Date')continue;const dateKey=new Date(dateStr);if(dateKey<start||dateKey>end)continue;const key=dateKey.toISOString().slice(0,10);if(!bucket.has(key))continue;const amount=Number(q.amount||0);bucket.get(key).quoted += amount;if(String(q.status).toLowerCase()==='accepted'){bucket.get(key).revenue += amount;bucket.get(key).profit += amount;}}for(const ex of d.expenses||[]){const dateStr=ex.date||'';if(!dateStr||new Date(dateStr).toString()==='Invalid Date')continue;const dateKey=new Date(dateStr);if(dateKey<start||dateKey>end)continue;const key=dateKey.toISOString().slice(0,10);if(!bucket.has(key))continue;const amount=Number(ex.amount||0);bucket.get(key).expenses += amount;bucket.get(key).profit -= amount;}const values=Array.from(bucket.values());const maxVal=Math.max(1,...values.map(x=>Math.max(x.revenue,x.expenses,x.quoted,Math.abs(x.profit))));return {points:values,maxVal};}function buildFinanceChartSvg(data,metric='Revenue',period='All'){const points=data.points||[];if(!points.length){return `<div class="empty">No financial history yet. Add quotes or expenses to populate this chart.</div>`;}const margin={top:12,right:12,bottom:28,left:12};const width=760,height=220;const keyMap={Revenue:'revenue',Expenses:'expenses',Profit:'profit','Quoted Pipeline':'quoted'};const metricKey=keyMap[metric]||'revenue';const values=points.map(p=>Number(p[metricKey]||0));const maxVal=Math.max(1,...values);const coords=values.map((v,i)=>{const x=margin.left + (i/(Math.max(1,values.length-1)))*(width-margin.left-margin.right);const y=height-margin.bottom-((v/maxVal)*(height-margin.top-margin.bottom));return [x,y];});const line=coords.map((c,i)=>`${i===0?'M':'L'} ${c[0]} ${c[1]}`).join(' ');const area=`${line} L ${coords[coords.length-1][0]} ${height-margin.bottom} L ${coords[0][0]} ${height-margin.bottom} Z`;const lastValue=values[values.length-1]||0;const pointsHtml=coords.map((c,i)=>`<circle cx="${c[0]}" cy="${c[1]}" r="${i===coords.length-1?4.5:2.2}" fill="#22c0b3" opacity="${i===coords.length-1?1:0.9}" />`).join('');return `<div class="chart-shell"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${metric} chart for ${period}"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#22c0b3" stop-opacity="0.45"/><stop offset="100%" stop-color="#22c0b3" stop-opacity="0.04"/></linearGradient></defs><path d="${area}" fill="url(#chartFill)"/><path d="${line}" fill="none" stroke="#22c0b3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${pointsHtml}</svg></div><div class="chart-summary"><span class="muted sub">Latest ${metric}</span><strong>${euro(lastValue)}</strong></div>`;}function clearMapMarkers(){if(mapState.markers.length){for(const marker of mapState.markers)marker.remove();mapState.markers=[]}}function createTemporaryMapMarker(map,lng,lat,address){if(mapState.pendingMarker){mapState.pendingMarker.remove();mapState.pendingMarker=null;}if(mapState.pendingPopup){mapState.pendingPopup.remove();mapState.pendingPopup=null;}const markerEl=document.createElement('div');markerEl.className='tradeflow-map-marker tradeflow-map-marker-temp';markerEl.innerHTML='<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16 2C9.1 2 3.5 7.6 3.5 14.5c0 9.7 12.5 15.8 12.5 15.8S28.5 24.2 28.5 14.5C28.5 7.6 22.9 2 16 2zm0 15.2a5.2 5.2 0 110-10.4 5.2 5.2 0 010 10.4z" fill="#0d6f80"/><circle cx="16" cy="12.5" r="2.8" fill="#f3fbff"/></svg>';const marker=new maplibregl.Marker({element:markerEl,anchor:'bottom'}).setLngLat([lng,lat]);marker.addTo(map);mapState.pendingMarker=marker;const popup=new maplibregl.Popup({closeOnClick:false,offset:18}).setLngLat([lng,lat]).setHTML(`<div class="map-action-panel"><div class="map-action-title">TradeFlow location</div><div class="map-action-coords">${lat.toFixed(5)}, ${lng.toFixed(5)}</div><div class="map-action-address">${esc(address||'Address unavailable')}</div><div class="map-action-foot">Address is approximate. Map data © OpenStreetMap contributors.</div><div class="map-action-buttons"><button type="button" class="btn small" data-map-action="save-location" data-lat="${lat}" data-lng="${lng}" data-address="${esc(address||'Address unavailable')}">Save location</button><button type="button" class="btn secondary small" data-map-action="create-opportunity" data-lat="${lat}" data-lng="${lng}" data-address="${esc(address||'Address unavailable')}">Create opportunity</button><button type="button" class="btn secondary small" data-map-action="link-customer" data-lat="${lat}" data-lng="${lng}" data-address="${esc(address||'Address unavailable')}">Link customer</button><button type="button" class="btn secondary small" data-map-action="link-job" data-lat="${lat}" data-lng="${lng}" data-address="${esc(address||'Address unavailable')}">Link job</button></div></div>`);popup.addTo(map);mapState.pendingPopup=popup;}async function handleMapAction(action,meta){if(!action)return;const lat=Number(meta.lat),lng=Number(meta.lng);if(action==='save-location'){await put('events',{id:uid(),text:`Saved map location ${lat.toFixed(5)}, ${lng.toFixed(5)}`,date:new Date().toISOString()});notify('Location saved');return;}if(action==='create-opportunity'){const amount=Number(prompt('Estimated value (€)', '0'));const title=prompt('Opportunity name', 'New opportunity')||'New opportunity';const next={id:uid(),customerId:'',title,category:'Other',amount:Number.isFinite(amount)?amount:0,status:'Draft',sentDate:today(),address:safeAddress(meta.address),coordinates:JSON.stringify({lat,lng})};await put('quotes',next);await event(`Created opportunity from map: ${next.title}`);notify('Opportunity created');return;}if(action==='link-customer'){const customer=(await all('customers'))[0];if(!customer){alert('Create a customer first.');tab='customers';render();return;}customer.address=safeAddress(meta.address);customer.coordinates=JSON.stringify({lat,lng});await put('customers',customer);await event(`Linked map location to ${customer.name}`);notify('Customer linked');return;}if(action==='link-job'){const job=(await all('jobs'))[0];if(!job){alert('Create a job first.');tab='jobs';render();return;}job.address=safeAddress(meta.address);job.coordinates=JSON.stringify({lat,lng});await put('jobs',job);await event(`Linked map location to ${job.title}`);notify('Job linked');return;}}async function renderMapData(d){const mapEl=document.getElementById('tradeflow-map');if(!mapEl)return;if(!window.maplibregl){mapEl.innerHTML='<div class="map-fallback"><strong>Map unavailable</strong><p>Offline map tiles are not cached in this browser. The CRM stays local and fully usable.</p></div>';return;}const map=mapState.instance||new maplibregl.Map({container:'tradeflow-map',style:'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json',center:[DEFAULT_MAP_CENTER.lng,DEFAULT_MAP_CENTER.lat],zoom:7,pitch:0,attributionControl:true});mapState.instance=map;if(!map._tradeflowReady){map.addControl(new maplibregl.NavigationControl({showCompass:true}), 'top-right');map.addControl(new maplibregl.ScaleControl({maxWidth:100,unit:'metric'}), 'bottom-left');map._tradeflowReady=true}map.resize();const customerList=(d.customers||[]).filter(c=>c&&c.address);const markers=[];clearMapMarkers();for(const customer of customerList){const coords=(customer.coordinates&&JSON.parse(customer.coordinates));let lng=DEFAULT_MAP_CENTER.lng,lat=DEFAULT_MAP_CENTER.lat;if(coords&&Number.isFinite(coords.lng)&&Number.isFinite(coords.lat)){lng=Number(coords.lng);lat=Number(coords.lat);}else {const resolved=await geocodeAddress(customer.address);if(!resolved)continue;lng=resolved.lng;lat=resolved.lat;}const markerEl=document.createElement('div');markerEl.className='tradeflow-map-marker';markerEl.innerHTML='<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16 2C9.1 2 3.5 7.6 3.5 14.5c0 9.7 12.5 15.8 12.5 15.8S28.5 24.2 28.5 14.5C28.5 7.6 22.9 2 16 2zm0 15.2a5.2 5.2 0 110-10.4 5.2 5.2 0 010 10.4z" fill="#22c0b3"/><circle cx="16" cy="12.5" r="2.8" fill="#10263d"/></svg>';const popup=new maplibregl.Popup({offset:18}).setHTML(`<strong>${esc(customer.name||'Customer')}</strong><br>${esc(customer.address||'Address unavailable')}<br><small>Approximate location</small>`);const marker=new maplibregl.Marker({element:markerEl,anchor:'bottom'}).setLngLat([lng,lat]).setPopup(popup);marker.addTo(map);markers.push(marker);}mapState.markers=markers;const empty=document.getElementById('map-empty');if(empty)empty.hidden=markers.length>0;if(markers.length){const bounds=new maplibregl.LngLatBounds();for(const marker of markers)bounds.extend(marker.getLngLat());map.fitBounds(bounds,{padding:{top:30,right:30,bottom:30,left:30},maxZoom:11});}else{map.setCenter([DEFAULT_MAP_CENTER.lng,DEFAULT_MAP_CENTER.lat]);map.setZoom(6);}map.on('click',async e=>{const now=Date.now();if(mapState.lastTapAt && now-mapState.lastTapAt<350){return;}mapState.lastTapAt=now;const lat=e.lngLat.lat;const lng=e.lngLat.lng;const reverse=await reverseGeocode(lat,lng);const address=reverse&&reverse.display_name?reverse.display_name:'Address unavailable';createTemporaryMapMarker(map,lng,lat,address);});}async function render(){prefs={...prefs,...(await get('settings','business')||{})};document.documentElement.style.setProperty('--brand-accent',prefs.accent);const data=Object.fromEntries(await Promise.all(STORES.map(async s=>[s,await all(s)])));const nav=Object.keys(names).map(k=>`<button class="nav ${tab===k?'active':''}" data-tab="${k}">${icons[k]} &nbsp; ${names[k]}</button>`).join('');const mobileNav=Object.entries(mobileTabMeta).map(([k,v])=>`<button data-tab="${k}" class="${tab===k?'active':''}"><span class="navicon" aria-hidden="true">${v.icon}</span><span>${v.label}</span></button>`).join('');$('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand">${esc(prefs.company)} <small style="font-size:10px;color:#a4bdc8">LITE</small></div>${nav}</aside><div class="main"><header class="top"><strong>${names[tab]}</strong><span class="muted sub">Offline-first · Data stays on this device</span></header><main class="content">${toast?`<div class="notice" role="status">${esc(toast)}</div>`:''}${view(data)}</main><nav class="mobilebar">${mobileNav}</nav></div></div>${modal?formModal(data):''}`;if(tab==='map')requestAnimationFrame(()=>renderMapData(data));}function view(d){if(tab==='dashboard'){const pending=d.quotes.filter(x=>x.status==='Sent'),open=d.jobs.filter(x=>x.status!=='Completed'),due=d.tasks.filter(x=>x.status!=='Done'&&x.due<=today());const total=d.quotes.reduce((a,x)=>a+Number(x.amount||0),0);const accepted=d.quotes.filter(x=>x.status==='Accepted').reduce((a,x)=>a+Number(x.amount||0),0);const financeData=getFinanceSeries(d,financeState.period);const chartSvg=buildFinanceChartSvg(financeData,financeState.metric,financeState.period);return `<div class="notice">Local-first demo · Records remain on this device. Export a backup regularly.</div><div class="home-actions"><button class="btn secondary small" data-tab="customers">Customers</button><button class="btn secondary small" data-tab="quotes">Quotes</button><button class="btn secondary small" data-tab="jobs">Jobs</button><button class="btn secondary small" data-tab="tasks">Tasks</button></div><div class="heroport"><span class="heroeyebrow">QUOTATION PORTFOLIO</span><div class="herolabel">Total quoted value</div><div class="herovalue">${euro(total)}</div><div class="herosub">${d.quotes.length} quotations · ${euro(accepted)} accepted</div><div class="spark">${[18,28,23,37,34,48,45,61,58,74,70,87].map(v=>`<span style="height:${v}%"></span>`).join('')}</div><div class="herowarning">Quotes are not payments received; this is pipeline data only.</div></div><div class="cards">${[['Customers',d.customers.length],['Pending quotes',pending.length],['Active jobs',open.length],['Tasks due',due.length]].map(x=>`<div class="card"><div class="muted sub">${x[0]}</div><div class="num">${x[1]}</div></div>`).join('')}</div><section class="panel"><div class="panelhead"><h3>Financial chart</h3><span class="muted sub">${financeState.period}</span></div><div class="segment-wrap"><div class="segmented">${['1W','1M','3M','6M','1Y','All'].map(p=>`<button type="button" class="segment ${financeState.period===p?'active':''}" data-finance-period="${p}">${p}</button>`).join('')}</div><div class="segmented">${['Revenue','Expenses','Profit','Quoted Pipeline'].map(m=>`<button type="button" class="segment ${financeState.metric===m?'active':''}" data-finance-metric="${m}">${m}</button>`).join('')}</div></div>${chartSvg}</section>${portfolio(d)}<section class="panel"><h3>Recent activity</h3>${d.events.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(x=>`<p class="sub">${esc(x.text)} <span class="muted">· ${new Date(x.date).toLocaleDateString()}</span></p>`).join('')||'<p class="muted">No activity yet</p>'}</section>`}if(tab==='map'){const serviceCount=(d.customers||[]).filter(c=>c&&c.address).length;return `<section class="panel map-panel"><div class="panelhead"><h3>Street map</h3><button class="btn secondary small" data-tab="customers">Manage customers</button></div><div class="map-meta"><span>${serviceCount} customer locations</span><span>${(d.jobs||[]).length} jobs</span></div><div id="tradeflow-map" class="map-canvas"></div><div id="map-empty" class="map-empty" ${serviceCount ? 'hidden' : ''}>No customer addresses yet. Add a customer or tap the map to create a temporary TradeFlow location.</div></section>`;}if(tab==='settings')return `<section class='panel'><h3>Personalize your business</h3><form id='settingsForm'><label class='field'>Business name<input class='input' name='company' required maxlength='70' value='${esc(prefs.company)}'></label><label class='field'>Accent color<input class='input' type='color' name='accent' value='${esc(prefs.accent)}'></label><label class='field'>Trade categories (one per line)<textarea class='input' name='categories' rows='5'>${esc(prefs.categories.join('\n'))}</textarea></label><button class='btn' type='submit'>Save branding</button></form></section><div class='panel'><h3>Backup and restore</h3><p class='muted'>Export all records as a JSON file. Store it securely. Restoring replaces records on this device.</p><div class='toolbar'><button class='btn' data-action='export'>Export backup</button><label class='btn secondary' for='restoreFile'>Restore backup</label><input id='restoreFile' type='file' accept='application/json,.json' hidden></div><div class='notice warning'>No cloud sync or encryption is provided. Use fictional data for demonstrations.</div></div>`;if(tab==='expenses')return `<div class="toolbar"><button class="btn" data-action="new">+ New expense</button></div><div class="tablewrap"><table><thead><tr>${['Expense','Trade','Amount','Date',''].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${d.expenses.length?d.expenses.map(x=>`<tr><td>${esc(x.title)}</td><td>${esc(x.category||'Other')}</td><td>${euro(x.amount)}</td><td>${esc(x.date||'—')}</td><td class="rowactions"><button class="btn secondary small" data-edit="${x.id}">Edit</button><button class="btn danger small" data-delete="${x.id}">Delete</button></td></tr>`).join(''):'<tr><td colspan="5"><div class="empty">No expenses yet</div></td></tr>'}</tbody></table></div>`;if(tab==='customers')return `<div class="toolbar"><button class="btn" data-action="new">+ New customer</button></div><div class="tablewrap"><table><thead><tr>${['Customer','Phone','Email','Address',''].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${d.customers.length?d.customers.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.phone||'—')}</td><td>${esc(x.email||'—')}</td><td>${esc(x.address||'—')}</td><td class="rowactions"><button class="btn secondary small" data-edit="${x.id}">Edit</button><button class="btn danger small" data-delete="${x.id}">Delete</button></td></tr>`).join(''):'<tr><td colspan="5"><div class="empty">No customers yet</div></td></tr>'}</tbody></table></div>`;if(tab==='quotes')return `<div class="toolbar"><button class="btn" data-action="new">+ New quote</button></div><div class="tablewrap"><table><thead><tr>${['Customer','Quote','Trade','Value','Status',''].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${d.quotes.length?d.quotes.map(x=>`<tr><td>${esc(d.customers.find(c=>c.id===x.customerId)?.name||'—')}</td><td>${esc(x.title)}</td><td>${esc(x.category||'Other')}</td><td>${euro(x.amount)}</td><td><span class="pill">${esc(x.status||'Draft')}</span></td><td class="rowactions"><button class="btn secondary small" data-edit="${x.id}">Edit</button>${x.status==='Accepted'?`<button class="btn secondary small" data-convert="${x.id}">Create job</button>`:''}<button class="btn danger small" data-delete="${x.id}">Delete</button></td></tr>`).join(''):'<tr><td colspan="6"><div class="empty">No quotations yet</div></td></tr>'}</tbody></table></div>`;if(tab==='jobs')return `<div class="toolbar"><button class="btn" data-action="new">+ New job</button></div><div class="tablewrap"><table><thead><tr>${['Customer','Job','Trade','Status','Date',''].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${d.jobs.length?d.jobs.map(x=>`<tr><td>${esc(d.customers.find(c=>c.id===x.customerId)?.name||'—')}</td><td>${esc(x.title)}</td><td>${esc(x.category||'Other')}</td><td><span class="pill">${esc(x.status||'Planned')}</span></td><td>${esc(x.date||'—')}</td><td class="rowactions"><button class="btn secondary small" data-edit="${x.id}">Edit</button><button class="btn danger small" data-delete="${x.id}">Delete</button></td></tr>`).join(''):'<tr><td colspan="6"><div class="empty">No jobs yet</div></td></tr>'}</tbody></table></div>`;if(tab==='tasks')return `<div class="toolbar"><button class="btn" data-action="new">+ New task</button></div><div class="tablewrap"><table><thead><tr>${['Task','Customer','Due','Status',''].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${d.tasks.length?d.tasks.map(x=>`<tr><td>${esc(x.title)}</td><td>${esc(d.customers.find(c=>c.id===x.customerId)?.name||'—')}</td><td>${esc(x.due||'—')}</td><td><span class="pill">${esc(x.status||'Open')}</span></td><td class="rowactions"><button class="btn secondary small" data-edit="${x.id}">Edit</button><button class="btn danger small" data-delete="${x.id}">Delete</button></td></tr>`).join(''):'<tr><td colspan="5"><div class="empty">No tasks yet</div></td></tr>'}</tbody></table></div>`;return `<div class="empty">No records in this view.</div>`;}function portfolio(d){
const cats=[...new Set([...prefs.categories,...d.quotes.map(x=>x.category||'Other'),...d.expenses.map(x=>x.category||'Other')])];
const stats=cats.map(c=>({c,quotes:d.quotes.filter(x=>(x.category||'Other')===c),expenses:d.expenses.filter(x=>(x.category||'Other')===c)}));
return `<section class="panel"><div class="panelhead"><h3>Trade performance</h3><span class="muted sub">By category</span></div><div class="tradegrid">${stats.map(x=>{const quoted=x.quotes.reduce((a,q)=>a+Number(q.amount||0),0),accepted=x.quotes.filter(q=>q.status==='Accepted').reduce((a,q)=>a+Number(q.amount||0),0),cost=x.expenses.reduce((a,e)=>a+Number(e.amount||0),0);return `<div class="tradebox"><div class="tradehead"><strong>${esc(x.c)}</strong><span>↗</span></div><div class="tradeamount">${euro(quoted)}</div><span class="muted sub">${x.quotes.length} quotes</span><div class="tradefoot"><span>Accepted <b>${euro(accepted)}</b></span><span>Expenses <b>${euro(cost)}</b></span></div></div>`}).join('')}</div><p class="muted sub">Quoted and accepted amounts are not payments received. Expenses are manually entered.</p></section>`}
function formModal(d){const obj=modal.id?d[tab].find(x=>x.id===modal.id)||{}:{};const customers=d.customers.map(c=>`<option value="${esc(c.id)}" ${obj.customerId===c.id?'selected':''}>${esc(c.name)}</option>`).join('');const defs={expenses:[['title','Expense description','text',true],['category','Trade category','category',true],['amount','Amount (€)','number',true],['date','Date','date',true]],customers:[['name','Customer name','text',true],['phone','Phone','tel'],['email','Email','email'],['address','Address','text']],quotes:[['customerId','Customer','customer',true],['title','Description','text',true],['category','Trade category','category',true],['amount','Estimated value (€)','number',true],['status','Status','select:Draft,Sent,Accepted,Declined'],['sentDate','Date sent','date']],jobs:[['customerId','Customer','customer',true],['title','Job description','text',true],['category','Trade category','category',true],['status','Status','select:Planned,In Progress,Completed'],['date','Scheduled date','date']],tasks:[['title','Task','text',true],['customerId','Customer','customer'],['due','Due date','date',true],['status','Status','select:Open,Done']]}[tab];return `<div class="dialog"><form class="modal" id="recordForm"><div class="modalhead"><h2>${modal.id?'Edit':'New'} ${tab.slice(0,-1)}</h2><button class="btn secondary small" type="button" data-action="close">✕</button></div><div class="formgrid">${defs.map(([key,label,type,required])=>`<label class="field">${label}${type==='category'?`<select class="input" name="${key}">${prefs.categories.map(v=>`<option value="${esc(v)}" ${obj[key]===v?'selected':''}>${esc(v)}</option>`).join('')}</select>`:type==='customer'?`<select class="input" name="${key}" ${required?'required':''}><option value="">Choose customer</option>${customers}</select>`:type.startsWith('select:')?`<select class="input" name="${key}">${type.slice(7).split(',').map(v=>`<option ${obj[key]===v?'selected':''}>${v}</option>`).join('')}</select>`:`<input class="input" name="${key}" type="${type}" ${required?'required':''} ${type==='number'?'min="0" step="0.01"':''} value="${esc(obj[key]??(type==='date'&&key==='due'?today():''))}">`}</label>`).join('')}</div><div class="actions"><button type="button" class="btn secondary" data-action="close">Cancel</button><button class="btn" type="submit">Save record</button></div></form></div>`}
async function saveForm(form){const f=Object.fromEntries(new FormData(form));if(tab==='customers'){f.email=f.email.trim().toLowerCase();const existing=(await all('customers')).find(c=>c.id!==modal.id&&((f.email&&c.email===f.email)||(f.phone&&c.phone===f.phone)));if(existing&&!confirm('A customer already has this email or phone. Save anyway?'))return}const id=modal.id||uid(),old=modal.id?await get(tab,id):{};await put(tab,{...old,...f,id,updatedAt:new Date().toISOString()});await event(`${modal.id?'Updated':'Created'} ${tab.slice(0,-1)}: ${f.name||f.title}`);if(tab==='quotes'&&f.status==='Sent'&&old.status!=='Sent'){const tasks=await all('tasks');if(!tasks.some(t=>t.quoteId===id)){await put('tasks',{id:uid(),title:`Follow up quote: ${f.title}`,customerId:f.customerId,due:new Date(Date.now()+3*86400000).toISOString().slice(0,10),status:'Open',quoteId:id});await event('Created quote follow-up task')}}modal=null;query='';notify('Record saved')}
async function exportData(){const data={format:'tradeflow-lite',version:2,exportedAt:new Date().toISOString(),stores:Object.fromEntries(await Promise.all(STORES.map(async s=>[s,await all(s)])))};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=`tradeflow-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function restore(file){let data;try{data=JSON.parse(await file.text());if(data.format!=='tradeflow-lite'||![1,2].includes(data.version)||!data.stores||!STORES.every(s=>Array.isArray(data.stores[s]||(data.version===1?[]:null))&&(data.stores[s]||[]).every(x=>x&&typeof x.id==='string')))throw Error('Invalid backup');if(!confirm('Replace ALL existing local records with this backup? This cannot be undone.'))return;const t=db.transaction(STORES,'readwrite');for(const s of STORES){const st=t.objectStore(s);st.clear();for(const item of (data.stores[s]||[]))st.put(item)}await new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error)});notify('Backup restored')}catch(e){alert(`Restore failed: ${e.message}`)}}
document.addEventListener('click',async e=>{const mapAction=e.target.closest('[data-map-action]');if(mapAction){handleMapAction(mapAction.dataset.mapAction,{lat:mapAction.dataset.lat,lng:mapAction.dataset.lng,address:mapAction.dataset.address});return;}const financePeriod=e.target.closest('[data-finance-period]');if(financePeriod){financeState.period=financePeriod.dataset.financePeriod;render();return;}const financeMetric=e.target.closest('[data-finance-metric]');if(financeMetric){financeState.metric=financeMetric.dataset.financeMetric;render();return;}const el=e.target.closest('[data-tab],[data-action],[data-edit],[data-delete],[data-convert]');if(!el)return;if(el.dataset.tab){tab=el.dataset.tab;query='';modal=null;render()}else if(el.dataset.action==='new'){if(['quotes','jobs','tasks'].includes(tab)&&(await all('customers')).length===0){alert('Create a customer first.');tab='customers';render();return}modal={};render()}else if(el.dataset.action==='close'){modal=null;render()}else if(el.dataset.action==='export')exportData();else if(el.dataset.edit){modal={id:el.dataset.edit};render()}else if(el.dataset.delete){if(!confirm('Delete this record? This cannot be undone.'))return;const id=el.dataset.delete;if(tab==='customers'){const refs=await Promise.all(['quotes','jobs','tasks'].map(all));if(refs.some(a=>a.some(x=>x.customerId===id))){alert('This customer has linked records. Remove or reassign those first.');return}}await del(tab,id);await event(`Deleted ${tab.slice(0,-1)}`);notify('Record deleted')}else if(el.dataset.convert){const q=await get('quotes',el.dataset.convert);if(q?.status!=='Accepted')return;const jobs=await all('jobs');if(jobs.some(j=>j.quoteId===q.id))return;await put('jobs',{id:uid(),quoteId:q.id,customerId:q.customerId,title:q.title,category:q.category||'Other',status:'Planned',date:''});await event(`Created job from accepted quotation: ${q.title}`);notify('Job created')}});document.addEventListener('submit',e=>{if(e.target.id==='settingsForm'){e.preventDefault();const f=new FormData(e.target),categories=String(f.get('categories')||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean).slice(0,30);if(!categories.length)return alert('Add at least one category');prefs={company:String(f.get('company')).trim(),accent:String(f.get('accent')),categories};put('settings',{id:'business',...prefs}).then(()=>notify('Branding saved'));return}if(e.target.id==='recordForm'){e.preventDefault();saveForm(e.target).catch(err=>alert(err.message))}});document.addEventListener('input',e=>{if(e.target.id==='search'){query=e.target.value;const pos=e.target.selectionStart;render().then(()=>{const i=$('#search');i?.focus();i?.setSelectionRange(pos,pos)})}});document.addEventListener('change',e=>{if(e.target.id==='restoreFile'&&e.target.files[0])restore(e.target.files[0])});
(async()=>{try{db=await openDB();await render();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn)}catch(e){$('#app').innerHTML=`<div class="content"><h2>Storage unavailable</h2><p>${esc(e.message)}</p><p>Try a normal browser tab outside private browsing.</p></div>`}})();

function nominatimJSON(url){
  const request=(mapState.nominatimQueue||Promise.resolve()).then(async()=>{
    const delay=Math.max(0,(mapState.nominatimNextRequestAt||0)-Date.now());
    if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    mapState.nominatimNextRequestAt=Date.now()+1100;
    const response=await fetch(url,{headers:{'Accept-Language':'en'}});
    if(!response.ok)throw new Error(`Geocoding request failed (${response.status})`);
    return response.json();
  });
  mapState.nominatimQueue=request.catch(()=>{});
  return request;
}
async function geocodeAddress(address){
  const value=String(address||'').trim();
  if(!value)return null;
  const key=value.toLowerCase();
  if(mapState.geocodeCache.has(key))return mapState.geocodeCache.get(key);
  try{
    const data=await nominatimJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(value)}`);
    const result=Array.isArray(data)&&data.length?{lng:Number(data[0].lon),lat:Number(data[0].lat),label:String(data[0].display_name||value)}:null;
    mapState.geocodeCache.set(key,result);
    return result;
  }catch{
    mapState.geocodeCache.set(key,null);
    return null;
  }
}
async function reverseGeocode(lat,lng){
  const key=`${lat.toFixed(5)},${lng.toFixed(5)}`;
  if(mapState.geocodeCache.has(key))return mapState.geocodeCache.get(key);
  try{
    const data=await nominatimJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
    const result=data&&data.display_name?{display_name:String(data.display_name),lat:Number(data.lat),lng:Number(data.lon)}:null;
    mapState.geocodeCache.set(key,result);
    return result;
  }catch{
    mapState.geocodeCache.set(key,null);
    return null;
  }
}
function parseMapCoordinates(value){
  if(!value)return null;
  let coordinates=value;
  if(typeof value==='string'){
    try{coordinates=JSON.parse(value)}catch{return null}
  }
  if(!coordinates||typeof coordinates!=='object')return null;
  const lat=Number(coordinates.lat),lng=Number(coordinates.lng);
  return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180?{lat,lng}:null;
}
function mapStatus(mapEl,message,visible=true){
  let status=mapEl.querySelector('.map-status');
  if(!status){
    status=document.createElement('div');
    status.className='map-status';
    status.setAttribute('role','status');
    mapEl.append(status);
  }
  status.textContent=message;
  status.hidden=!visible;
}
function createTemporaryMapMarker(map,lng,lat,address,data){
  if(mapState.pendingMarker)mapState.pendingMarker.remove();
  if(mapState.pendingPopup)mapState.pendingPopup.remove();
  const markerEl=document.createElement('div');
  markerEl.className='tradeflow-map-marker tradeflow-map-marker-temp';
  markerEl.innerHTML='<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16 2C9.1 2 3.5 7.6 3.5 14.5c0 9.7 12.5 15.8 12.5 15.8S28.5 24.2 28.5 14.5C28.5 7.6 22.9 2 16 2zm0 15.2a5.2 5.2 0 110-10.4 5.2 5.2 0 010 10.4z" fill="#0d6f80"/><circle cx="16" cy="12.5" r="2.8" fill="#f3fbff"/></svg>';
  mapState.pendingMarker=new maplibregl.Marker({element:markerEl,anchor:'bottom'}).setLngLat([lng,lat]).addTo(map);
  const customers=(data.customers||[]).map(customer=>`<option value="${esc(customer.id)}">${esc(customer.name||'Customer')}</option>`).join('');
  const jobs=(data.jobs||[]).map(job=>`<option value="${esc(job.id)}">${esc(job.title||'Job')}</option>`).join('');
  mapState.pendingPopup=new maplibregl.Popup({closeOnClick:false,offset:18}).setLngLat([lng,lat]).setHTML(`<div class="map-action-panel"><div class="map-action-title">TradeFlow location</div><div class="map-action-coords">${lat.toFixed(5)}, ${lng.toFixed(5)}</div><div class="map-action-address">${esc(address||'Address unavailable')}</div><div class="map-action-foot">Address is approximate. Reverse geocoding © OpenStreetMap contributors.</div><button type="button" class="btn small" data-map-action="save-location" data-lat="${lat}" data-lng="${lng}" data-address="${esc(address||'')}">Save location</button><button type="button" class="btn secondary small" data-map-action="create-opportunity" data-lat="${lat}" data-lng="${lng}" data-address="${esc(address||'')}">Create opportunity</button><label class="map-link-choice">Link customer<select class="input" data-link-customer><option value="">Choose a customer</option>${customers}</select><button type="button" class="btn secondary small" data-map-action="link-customer" data-lat="${lat}" data-lng="${lng}" data-address="${esc(address||'')}" ${customers?'':'disabled'}>Link selected customer</button></label><label class="map-link-choice">Link job<select class="input" data-link-job><option value="">Choose a job</option>${jobs}</select><button type="button" class="btn secondary small" data-map-action="link-job" data-lat="${lat}" data-lng="${lng}" data-address="${esc(address||'')}" ${jobs?'':'disabled'}>Link selected job</button></label></div>`).addTo(map);
}
async function handleMapAction(action,meta){
  const lat=Number(meta.lat),lng=Number(meta.lng),coordinates=JSON.stringify({lat,lng});
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
  try{
    if(action==='save-location'){
      await event(`Saved map location ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    }else if(action==='create-opportunity'){
      const title=prompt('Opportunity name','New opportunity');
      if(title===null)return;
      const amount=Number(prompt('Estimated value (€)','0'));
      await put('quotes',{id:uid(),customerId:'',title:title.trim()||'New opportunity',category:'Other',amount:Number.isFinite(amount)?amount:0,status:'Draft',sentDate:today(),...(meta.address?{address:meta.address}:{}),coordinates});
      await event(`Created opportunity from map: ${title.trim()||'New opportunity'}`);
    }else if(action==='link-customer'||action==='link-job'){
      const store=action==='link-customer'?'customers':'jobs';
      const id=action==='link-customer'?meta.customerId:meta.jobId;
      if(!id){alert(`Choose a ${action==='link-customer'?'customer':'job'} to link first.`);return;}
      const record=await get(store,id);
      if(!record){alert(`The selected ${action==='link-customer'?'customer':'job'} no longer exists. Refresh and try again.`);return;}
      record.coordinates=coordinates;
      if(meta.address)record.address=meta.address;
      await put(store,record);
      await event(`Linked map location to ${action==='link-customer'?record.name:record.title}`);
    }else return;
    if(mapState.pendingPopup)mapState.pendingPopup.remove();
    if(mapState.pendingMarker)mapState.pendingMarker.remove();
    mapState.pendingPopup=null;
    mapState.pendingMarker=null;
    notify(action==='save-location'?'Location saved':action==='create-opportunity'?'Opportunity created':action==='link-customer'?'Customer linked':'Job linked');
  }catch(error){
    alert(`Unable to complete map action: ${error.message}`);
  }
}
async function renderMapData(data){
  const mapEl=document.getElementById('tradeflow-map');
  if(!mapEl)return;
  if(!window.maplibregl){
    mapEl.innerHTML='<div class="map-fallback"><strong>Map unavailable</strong><p>MapLibre could not load. Check your connection; your CRM records remain available locally.</p></div>';
    return;
  }
  let center=[DEFAULT_MAP_CENTER.lng,DEFAULT_MAP_CENTER.lat],zoom=6;
  if(mapState.instance){
    const current=mapState.instance;
    const currentCenter=current.getCenter();
    center=[currentCenter.lng,currentCenter.lat];
    zoom=current.getZoom();
    if(current.getContainer()!==mapEl){
      current.remove();
      mapState.instance=null;
    }
  }
  let map=mapState.instance;
  if(!map){
    try{
      map=new maplibregl.Map({container:mapEl,style:'https://tiles.openfreemap.org/styles/dark',center,zoom,attributionControl:true});
      mapState.instance=map;
      map.addControl(new maplibregl.NavigationControl({showCompass:true}),'top-right');
      map.addControl(new maplibregl.ScaleControl({maxWidth:100,unit:'metric'}),'bottom-left');
      map.on('load',()=>mapStatus(mapEl,'',false));
      map.on('error',()=>mapStatus(mapEl,'Street map tiles are unavailable. Check your connection; CRM data remains local.'));
      map.on('click',async event=>{
        const target=event.originalEvent&&event.originalEvent.target;
        if(target&&target.closest&&target.closest('.maplibregl-marker,.maplibregl-popup'))return;
        if(event.originalEvent&&event.originalEvent.detail>1)return;
        const now=Date.now();
        if(mapState.lastTapAt&&now-mapState.lastTapAt<350)return;
        mapState.lastTapAt=now;
        const requestId=(mapState.mapClickId||0)+1;
        mapState.mapClickId=requestId;
        const lat=event.lngLat.lat,lng=event.lngLat.lng;
        const address=await reverseGeocode(lat,lng);
        if(mapState.mapClickId!==requestId)return;
        createTemporaryMapMarker(map,lng,lat,address&&address.display_name?address.display_name:'Address unavailable',data);
      });
    }catch(error){
      mapEl.innerHTML=`<div class="map-fallback"><strong>Map unavailable</strong><p>${esc(error.message||'Street map could not be initialized.')}</p><p>Your CRM records remain available locally.</p></div>`;
      return;
    }
    mapStatus(mapEl,'Loading street map…');
  }else map.resize();
  if(mapState.pendingMarker){mapState.pendingMarker.remove();mapState.pendingMarker=null;}
  if(mapState.pendingPopup){mapState.pendingPopup.remove();mapState.pendingPopup=null;}
  clearMapMarkers();
  const customerRecords=(data.customers||[]).filter(customer=>customer&&customer.address);
  for(const customer of customerRecords){
    let point=parseMapCoordinates(customer.coordinates);
    if(!point)point=await geocodeAddress(customer.address);
    if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lng)||point.lat<-90||point.lat>90||point.lng<-180||point.lng>180)continue;
    const element=document.createElement('div');
    element.className='tradeflow-map-marker';
    element.innerHTML='<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16 2C9.1 2 3.5 7.6 3.5 14.5c0 9.7 12.5 15.8 12.5 15.8S28.5 24.2 28.5 14.5C28.5 7.6 22.9 2 16 2zm0 15.2a5.2 5.2 0 110-10.4 5.2 5.2 0 010 10.4z" fill="#22c0b3"/><circle cx="16" cy="12.5" r="2.8" fill="#10263d"/></svg>';
    const marker=new maplibregl.Marker({element,anchor:'bottom'}).setLngLat([point.lng,point.lat]).setPopup(new maplibregl.Popup({offset:18}).setHTML(`<strong>${esc(customer.name||'Customer')}</strong><br>${esc(customer.address)}<br><small>Approximate location</small>`));
    marker.addTo(map);
    mapState.markers.push(marker);
  }
  const empty=document.getElementById('map-empty');
  if(empty)empty.hidden=mapState.markers.length>0;
  if(mapState.markers.length){
    const bounds=new maplibregl.LngLatBounds();
    for(const marker of mapState.markers)bounds.extend(marker.getLngLat());
    map.fitBounds(bounds,{padding:30,maxZoom:11});
  }
}
function getFinanceSeries(data,period='All'){
  const ranges={'1W':7,'1M':30,'3M':90,'6M':180,'1Y':365,'All':3650};
  const days=ranges[period]||3650,end=new Date();
  end.setHours(0,0,0,0);
  const start=new Date(end);
  start.setDate(end.getDate()-days+1);
  const buckets=new Map();
  for(let i=0;i<days;i++){
    const date=new Date(start);
    date.setDate(start.getDate()+i);
    buckets.set(date.toISOString().slice(0,10),{date,revenue:0,expenses:0,profit:0,quoted:0});
  }
  const add=(dateValue,key,amount)=>{
    if(!dateValue)return;
    const date=new Date(dateValue);
    if(Number.isNaN(date.getTime()))return;
    const day=date.toISOString().slice(0,10),bucket=buckets.get(day);
    if(bucket)bucket[key]+=Number.isFinite(Number(amount))?Number(amount):0;
  };
  for(const expense of data.expenses||[])add(expense.date,'expenses',expense.amount);
  for(const quote of data.quotes||[])add(quote.sentDate||quote.date,'quoted',quote.amount);
  const points=Array.from(buckets.values());
  for(const point of points)point.profit=point.revenue-point.expenses;
  return{points,hasRevenue:false,hasProfit:false,hasExpenses:points.some(point=>point.expenses!==0),hasQuotes:points.some(point=>point.quoted!==0)};
}
function buildFinanceChartSvg(series,metric='Revenue',period='All'){
  const key={'Revenue':'revenue','Expenses':'expenses','Profit':'profit','Quoted Pipeline':'quoted'}[metric]||'revenue';
  const points=series.points||[];
  const hasData=key==='revenue'?series.hasRevenue:key==='expenses'?series.hasExpenses:key==='profit'?series.hasProfit:series.hasQuotes;
  if(!hasData)return `<div class="empty">${key==='revenue'?'No actual revenue is recorded yet. Accepted quotes are not revenue.':key==='expenses'?'No expense history is recorded for this period.':key==='profit'?'Profit is unavailable until actual revenue records are supported. Accepted quotes are excluded.':'No quotes are recorded for this period.'}</div>`;
  const values=points.map(point=>Number(point[key]||0));
  const min=Math.min(0,...values),max=Math.max(0,...values),span=max-min||1;
  const width=760,height=220,margin={top:12,right:12,bottom:28,left:12};
  const baseY=height-margin.bottom-(0-min)/span*(height-margin.top-margin.bottom);
  const coords=values.map((value,index)=>[
    margin.left+index/Math.max(1,values.length-1)*(width-margin.left-margin.right),
    height-margin.bottom-(value-min)/span*(height-margin.top-margin.bottom)
  ]);
  const line=coords.map((point,index)=>`${index?'L':'M'} ${point[0]} ${point[1]}`).join(' ');
  const area=`${line} L ${coords[coords.length-1][0]} ${baseY} L ${coords[0][0]} ${baseY} Z`;
  const dots=coords.filter((_,index)=>index===coords.length-1||values[index]!==0).map(point=>`<circle cx="${point[0]}" cy="${point[1]}" r="3" fill="#22c0b3"/>`).join('');
  const summary=values.reduce((sum,value)=>sum+value,0);
  return `<div class="chart-shell"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(metric)} by date for ${esc(period)}"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#22c0b3" stop-opacity=".4"/><stop offset="100%" stop-color="#22c0b3" stop-opacity=".03"/></linearGradient></defs><path d="${area}" fill="url(#chartFill)"/><path d="${line}" fill="none" stroke="#22c0b3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg></div><div class="chart-summary"><span class="muted sub">${metric==='Quoted Pipeline'?'Quotes in period':'Net recorded amount in period'}</span><strong>${euro(summary)}</strong></div><p class="muted sub">Accepted quotes are shown only in Quoted Pipeline. No separate payment/revenue records are currently available.</p>`;
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-map-action]');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const panel=button.closest('.map-action-panel');
  await handleMapAction(button.dataset.mapAction,{
    lat:button.dataset.lat,lng:button.dataset.lng,address:button.dataset.address,
    customerId:panel&&panel.querySelector('[data-link-customer]')?.value,
    jobId:panel&&panel.querySelector('[data-link-job]')?.value
  });
},true);
