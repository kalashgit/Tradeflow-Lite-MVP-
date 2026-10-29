const DB='tradeflow-lite-v1', STORES=['customers','quotes','jobs','tasks','events','expenses','settings','opportunities','pins','payments','invoices','jobCosts','marketingCampaigns','crew','routePlans','suppliers','supplyOrders','commandLog','calendars','calendarEntries','calendarProposals','calendarPreferences','calendarAudit'];let db,tab='dashboard',query='',modal=null,toast='';let tfMotionNext='',tfRecordListContext=null;let prefs={company:'TradeFlow Lite',accent:'#10cfe1',primaryTrade:'',categories:[]};
const $=s=>document.querySelector(s);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const euro=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);const today=()=>new Date().toISOString().slice(0,10);const uid=()=>crypto.randomUUID();
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,9);r.onupgradeneeded=()=>{for(const s of STORES)if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s,{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function tx(store,mode,cb){return new Promise((res,rej)=>{const t=db.transaction(store,mode),s=t.objectStore(store),r=cb(s);t.oncomplete=()=>res(r?.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})}const all=s=>tx(s,'readonly',x=>x.getAll());const put=(s,v)=>tx(s,'readwrite',x=>x.put(v));const del=(s,id)=>tx(s,'readwrite',x=>x.delete(id));const get=(s,id)=>tx(s,'readonly',x=>x.get(id));
async function tfExecuteCommand(kind,payload,requestKey){const data=Object.fromEntries(await Promise.all(STORES.map(async store=>[store,await all(store)])));return window.TradeFlowCore.execute({db,kind,payload,data,uid,requestKey});}
async function event(text){await put('events',{id:uid(),text,date:new Date().toISOString()})}let tfToastSequence=0;
function notify(text){
 const sequence=++tfToastSequence;
 toast=text;
 const update=render();
 setTimeout(()=>{
  if(sequence!==tfToastSequence)return;
  toast='';
  document.querySelector('.notice')?.remove();
 },3500);
 return update;
}
const names={library:'Library',map:'Map',opportunities:'Opportunities',expenses:'Expenses',dashboard:'Overview',customers:'Customers',quotes:'Quotations',invoices:'Invoices',profitability:'Job Costing',jobs:'Jobs',tasks:'Tasks',settings:'Settings',growth:'Growth Intelligence',marketing:'Marketing Studio',research:'Research Briefs',routes:'Route Planner',integrations:'Integrations',dispatch:'Crew & Dispatch',missions:'Business Missions',calendar:'Calendar',ai:'TradeFlow AI',suppliers:'Suppliers'};const icons={library:'▱',map:'⌖',opportunities:'◎',expenses:'$',dashboard:'⌂',customers:'♧',quotes:'▤',invoices:'▤',profitability:'$',jobs:'▣',tasks:'✓',settings:'☷',growth:'◎',marketing:'◎',research:'◎',routes:'⌖',integrations:'☷',dispatch:'▦',missions:'✓',calendar:'▦',ai:'✦',suppliers:'▣'};
async function renderLegacy(){prefs={...prefs,...(await get('settings','business')||{})};applyTradeFlowAccent(prefs.accent);const data=Object.fromEntries(await Promise.all(STORES.map(async s=>[s,await all(s)])));const nav=Object.keys(names).map(k=>`<button class="nav ${tab===k?'active':''}" data-tab="${k}">${icons[k]} &nbsp; ${names[k]}</button>`).join('');$('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand">${esc(prefs.company)} <small style="font-size:10px;color:#a4bdc8">LITE</small></div>${nav}</aside><div class="main"><header class="top ${tab==='opportunities'?'tf-opportunity-topless':''}"><strong>${names[tab]}</strong><span class="muted sub">Offline-first · Data stays on this device</span></header><main class="content${tfActiveMotion&&tab!=='map'?' tf-motion-'+tfActiveMotion:''}">${toast?`<div class="notice" role="status">${esc(toast)}</div>`:''}${view(data)}</main><nav class="mobilebar">${Object.keys(names).map(k=>`<button data-tab="${k}" class="${tab===k?'active':''}"><span class="navicon" aria-hidden="true">${icons[k]}</span><span>${names[k]}</span></button>`).join('')}</nav></div></div>${modal?formModal(data):''}`;if(tab==='map')setTimeout(()=>initializeMap(data),0);}
const tfMoreIcons={"customers":"<svg viewBox=\"0 0 24 24\" width=\"23\" height=\"23\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"9\" cy=\"8\" r=\"3\"/><path d=\"M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5\"/></svg>","quotes":"<svg viewBox=\"0 0 24 24\" width=\"23\" height=\"23\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"5\" y=\"3\" width=\"14\" height=\"18\" rx=\"2\"/><path d=\"M9 8h6M9 12h6M9 16h4\"/></svg>","jobs":"<svg viewBox=\"0 0 24 24\" width=\"23\" height=\"23\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 17h18v3H3zM5 16a7 7 0 0 1 14 0M10 6V4h4v2\"/></svg>","tasks":"<svg viewBox=\"0 0 24 24\" width=\"23\" height=\"23\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"4\" y=\"4\" width=\"16\" height=\"17\" rx=\"2\"/><path d=\"m8 12 3 3 5-6\"/></svg>","expenses":"<svg viewBox=\"0 0 24 24\" width=\"23\" height=\"23\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 20v-6M9 20V9M14 20v-4M19 20V4\"/></svg>","opportunities":"<svg viewBox=\"0 0 24 24\" width=\"23\" height=\"23\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"11\" cy=\"13\" r=\"8\"/><circle cx=\"11\" cy=\"13\" r=\"4\"/><path d=\"m11 13 10-10m-5 0h5v5\"/></svg>","map":"<svg viewBox=\"0 0 24 24\" width=\"23\" height=\"23\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15\"/></svg>","preferences":"<svg viewBox=\"0 0 24 24\" width=\"23\" height=\"23\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"m10 2-.5 2.2-2 1-2.1-1-2 3.5 1.7 1.5v2.4L3.4 13l2 3.5 2.1-1 2 1L10 19h4l.5-2.5 2-1 2.1 1 2-3.5-1.7-1.4V9.2l1.7-1.5-2-3.5-2.1 1-2-1L14 2z\"/></svg>","help":"<svg viewBox=\"0 0 24 24\" width=\"23\" height=\"23\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01\"/></svg>"};

/* Cash-based finance center. Existing expense records are retained in expenses;
   income uses its own IndexedDB store so quotes never count as received cash. */
const tfExpenseCategories=['Materials','Tools & Equipment','Subcontractors','Fuel','Vehicle','Software & Subscriptions','Marketing','Office','Insurance','Other'];

const tfFinanceCategoryArtwork={
 'Materials':['orange','<path d="m5 19 9-9M12 5l7 7M14 3l7 7M3 14l7 7"/>'],
 'Tools & Equipment':['blue','<path d="M21 7a6 6 0 0 1-8 5.66l-8 8a2 2 0 0 1-2.83-2.83l8-8A6 6 0 0 1 17 3l-4 4 4 4z"/>'],
 'Subcontractors':['amber','<circle cx="9" cy="8" r="3"/><path d="M2 20v-2.5a6 6 0 0 1 12 0V20H2zM17 5.5a3 3 0 0 1 0 5.7M17 14a5 5 0 0 1 5 5v1h-5"/>'],
 'Fuel':['coral','<rect x="3" y="4" width="11" height="17" rx="2"/><path d="M6 8h5M14 9l3 3v5a2 2 0 0 0 4 0V8l-3-3M5 21h11"/>'],
 'Vehicle':['purple','<path d="m5 16 1.7-7a2 2 0 0 1 2-1.5h6.6a2 2 0 0 1 2 1.5l1.7 7M4 16h16v4H4zM7 20v2M17 20v2M7 16h.01M17 16h.01"/>'],
 'Software & Subscriptions':['violet','<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'],
 'Marketing':['teal','<path d="M3 10v4h4l11 5V5L7 10H3zM7 14l2 7h3M18 9a4 4 0 0 1 0 6"/>'],
 'Office':['aqua','<path d="M4 21V6l8-3 8 3v15M9 21v-5h6v5M8 9h1M15 9h1M8 12h1M15 12h1M3 21h18"/>'],
 'Insurance':['sky','<path d="M12 2 4 5v6c0 5.5 3.5 9 8 11 4.5-2 8-5.5 8-11V5zM9 12l2 2 4-4"/>'],
 'Other':['neutral','<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>']
};
const tfFinanceChevron='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
const tfFinanceBackIcon='<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
function tfFinanceCategoryIcon(category){
 const [tone,art]=tfFinanceCategoryArtwork[category]||tfFinanceCategoryArtwork.Other;
 return '<span class="tf-cash-cat-icon tf-cash-tone-'+tone+'"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+art+'</svg></span>';
}
function tfFinanceScrollStart(){
 requestAnimationFrame(()=>{
  window.scrollTo({top:0,left:0,behavior:'instant'});
  const main=document.querySelector('.main'),content=document.querySelector('.content');
  if(main)main.scrollTop=0;
  if(content)content.scrollTop=0;
 });
}

const tfPaymentMethods=['Bank transfer','Cash','Card','Cheque','Other'];
let tfFinanceScreen='overview',tfFinancePeriod='month',tfFinanceFilter='all',tfFinanceSearch='',tfFinanceEdit=null,tfFinanceDraft=null,tfFinanceMenu='';
const tfCashRows=d=>[
 ...(d.payments||[]).map(x=>({...x,kind:'income'})),
 ...(d.expenses||[]).map(x=>({...x,kind:'expense'}))
].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
function tfFinanceInRange(date,period){
 if(!date)return false;
 const now=new Date(),day=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 const selected=new Date(String(date).slice(0,10)+'T12:00:00');
 if(Number.isNaN(selected.getTime()))return false;
 if(period==='all')return true;
 if(period==='year')return selected.getFullYear()===now.getFullYear();
 if(period==='month')return selected.getMonth()===now.getMonth()&&selected.getFullYear()===now.getFullYear();
 if(period==='week'){const start=new Date(day);start.setDate(day.getDate()-6);return selected>=start&&selected<=new Date(day.getTime()+86400000)}
 return true;
}
function tfFinanceTotals(rows){return rows.reduce((t,r)=>{const v=Number(r.amount)||0;if(r.kind==='income')t.income+=v;else t.expenses+=v;t.net=t.income-t.expenses;return t},{income:0,expenses:0,net:0})}
function tfFinanceChart(rows){
 const days=14,now=new Date(),buckets=[];
 for(let i=days-1;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');buckets.push({date:key,income:0,expense:0})}
 for(const r of rows){const bucket=buckets.find(x=>x.date===r.date);if(bucket)bucket[r.kind==='income'?'income':'expense']+=Number(r.amount)||0}
 const peak=Math.max(1,...buckets.map(x=>Math.max(x.income,x.expense)));
 const bars=buckets.map((v,i)=>{const x=13+i*22;const inc=Math.max(0,v.income/peak*58),exp=Math.max(0,v.expense/peak*58);return '<rect x="'+x+'" y="'+(85-inc)+'" width="7" height="'+inc+'" rx="1.5" fill="#00f060"/><rect x="'+(x+9)+'" y="85" width="7" height="'+exp+'" rx="1.5" fill="#ff344f"/>'}).join('');
 return '<svg class="tf-cash-svg" viewBox="0 0 335 157" preserveAspectRatio="none" role="img" aria-label="Income above the baseline and expenses below it during the last 14 days"><path d="M12 38H326M12 61H326M12 85H326M12 113H326M12 143H326" stroke="#244454" stroke-width=".7"/>'+bars+'<text x="12" y="154" fill="#9ab4c2" font-size="9">'+buckets[0].date.slice(5)+'</text><text x="325" y="154" fill="#9ab4c2" font-size="9" text-anchor="end">'+buckets[days-1].date.slice(5)+'</text></svg>';
}
function tfFinanceMonthlyList(records){
 const groups=new Map();
 for(const row of records){const key=String(row.date||'').slice(0,7)||'Unknown date';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
 if(!records.length)return '<p class="tf-cash-empty">No matching transactions.</p>';
 return [...groups.entries()].map(([month,entries])=>{
  const totals=tfFinanceTotals(entries);
  const d=new Date(month+'-01T12:00:00'),label=Number.isNaN(d.getTime())?month:d.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  return '<section class="tf-cash-month"><div class="tf-cash-monthhead"><strong>'+esc(label)+'</strong><span><b class="positive">'+euro(totals.income)+'</b> <b class="negative">'+euro(totals.expenses)+'</b><small>Net '+euro(totals.net)+'</small></span></div>'+entries.map(tfFinanceRow).join('')+'</section>';
 }).join('');
}
function tfFinanceRow(r){
 const income=r.kind==='income',name=r.title||r.source||r.vendor||r.category||(income?'Payment received':'Expense');
 return '<button type="button" class="tf-cash-row" data-action="tfFinanceEdit" data-id="'+esc(r.id)+'" data-kind="'+r.kind+'"><span class="tf-cash-direction '+(income?'in':'out')+'">'+(income?'<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19 19 5M9 5h10v10"/></svg>':'<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5 19 19M19 9v10H9"/></svg>')+'</span><span class="tf-cash-rowbody"><strong>'+esc(name)+'</strong><small>'+esc(income?(r.source||'Income'):(r.vendor||r.category||'Expense'))+'</small></span><span class="tf-cash-right '+(income?'positive':'negative')+'"><strong>'+(income?'+':'−')+euro(r.amount)+'</strong><small>'+esc(r.date||'')+'</small></span></button>';
}
function tfFinanceView(d){
 const rows=tfCashRows(d),periodRows=rows.filter(x=>tfFinanceInRange(x.date,tfFinancePeriod)),sum=tfFinanceTotals(periodRows);
 const options=[['overview','Overview'],['income','Income'],['expenses','Expenses'],['reports','Reports']];
 const head='<header class="tf-cash-head"><h1>Finance</h1><p>Track income, expenses and cash flow.</p></header>';
 const financeTools='<div class="tf-finance-tool-row"><button type="button" class="tf-op5-action primary" data-action="tfFinanceMenu" data-menu="import" aria-expanded="'+(tfFinanceMenu==='import')+'"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></svg>Import <span aria-hidden="true">⌄</span></button><button type="button" class="tf-op5-action" data-action="tfFinanceMenu" data-menu="export" aria-expanded="'+(tfFinanceMenu==='export')+'"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3"/></svg>Export <span aria-hidden="true">⌄</span></button></div>'+
 (tfFinanceMenu?'<section class="tf-finance-tool-menu" aria-label="'+(tfFinanceMenu==='import'?'Finance import options':'Finance export options')+'"><div class="tf-finance-tool-head"><strong>'+(tfFinanceMenu==='import'?'Import CSV':'Export CSV')+'</strong><button type="button" data-action="tfFinanceMenuClose" aria-label="Close finance menu">×</button></div><div class="tf-finance-tool-options">'+(tfFinanceMenu==='import'?'<button type="button" data-action="tfImportStart" data-target="payments">Income CSV</button><button type="button" data-action="tfImportStart" data-target="expenses">Expenses CSV</button>':'<button type="button" data-action="tfFinanceCSVExport" data-kind="all">All transactions CSV</button><button type="button" data-action="tfFinanceCSVExport" data-kind="income">Income CSV</button><button type="button" data-action="tfFinanceCSVExport" data-kind="expense">Expenses CSV</button>')+'</div></section>':'');

 if(tfFinanceScreen==='category'){
  const selected=(tfFinanceDraft&&tfFinanceDraft.category)||(tfFinanceEdit&&tfFinanceEdit.category)||'Materials';
  return '<section class="tf-cash tf-cash-category-screen"><header class="tf-cash-formhead tf-cash-category-header"><button type="button" data-action="tfFinanceBack" aria-label="Back to expense">'+tfFinanceBackIcon+'</button><h2>Select category</h2></header><div class="tf-cash-categories" role="group" aria-label="Expense category">'+tfExpenseCategories.map(c=>{
   const active=selected===c;
   return '<button type="button" class="tf-cash-cat-row'+(active?' is-selected':'')+'" data-action="tfFinanceCategory" data-category="'+esc(c)+'" aria-pressed="'+active+'">'+tfFinanceCategoryIcon(c)+'<span class="tf-cash-cat-name">'+esc(c)+'</span><span class="tf-cash-chevron">'+(active?'<span class="tf-cash-selected-check" aria-label="Selected">✓</span>':tfFinanceChevron)+'</span></button>';
  }).join('')+'</div></section>';
 }
 if(tfFinanceScreen==='add-income'||tfFinanceScreen==='add-expense'){
  const income=tfFinanceScreen==='add-income',edit=tfFinanceEdit||{},record=tfFinanceDraft||edit,select=(name,items,value)=>'<select class="tf-cash-input" name="'+name+'">'+items.map(x=>'<option value="'+esc(x[0])+'" '+(value===x[0]?'selected':'')+'>'+esc(x[1])+'</option>').join('')+'</select>';
  const customerOptions=[['','No customer'],...d.customers.map(x=>[x.id,x.name||'Customer'])];
  const relatedOptions=[['','No linked record'],...(income?d.opportunities:d.jobs).map(x=>[x.id,x.project_name||x.title||'Job'])];
  return '<section class="tf-cash"><header class="tf-cash-formhead"><button type="button" data-action="tfFinanceBack" aria-label="Back to Finance">'+tfFinanceBackIcon+'</button><h2>'+(tfFinanceEdit?'Edit ':'Add ')+(income?'income':'expense')+'</h2></header><form id="tfFinanceForm" class="tf-cash-form"><label>Amount ($)<input class="tf-cash-input tf-cash-amount" type="number" name="amount" inputmode="decimal" min=".01" step=".01" required placeholder="0.00" value="'+esc(record.amount||'')+'"></label><label class="tf-cash-date-field">Date<span class="tf-cash-date-shell"><input class="tf-cash-input tf-cash-date-input" name="date" type="date" required value="'+esc(record.date||today())+'"></span></label>'+
  (income?'<label>Source / Customer<input class="tf-cash-input" name="source" maxlength="120" placeholder="Payment received from..." value="'+esc(record.source||'')+'"></label><label>Existing customer (optional)'+select('customerId',customerOptions,record.customerId||'')+'</label><label>Related opportunity (optional)'+select('relatedId',relatedOptions,record.relatedId||'')+'</label>':
  '<label>Category<button type="button" class="tf-cash-category-btn" data-action="tfFinanceChooseCategory">'+tfFinanceCategoryIcon(record.category||'Materials')+'<span class="tf-cash-category-name">'+esc(record.category||'Materials')+'</span><span class="tf-cash-category-arrow">'+tfFinanceChevron+'</span></button><input type="hidden" name="category" value="'+esc(record.category||'Materials')+'"></label><label>Vendor / Supplier<input class="tf-cash-input" name="vendor" maxlength="120" placeholder="Who did you pay?" value="'+esc(record.vendor||'')+'"></label><label>Related job (optional)'+select('relatedId',relatedOptions,record.relatedId||'')+'</label>')+
 '<label>Payment method'+select('method',tfPaymentMethods.map(x=>[x,x]),record.method||'Bank transfer')+'</label><label>Notes (optional)<textarea class="tf-cash-input" name="notes" rows="3" maxlength="1500" placeholder="Add notes...">'+esc(record.notes||'')+'</textarea></label>'+tfFinancePhotoSection(record,income?'payments':'expenses')+'<button type="submit" class="tf-cash-primary">Save '+(income?'income':'expense')+'</button>'+(tfFinanceEdit?'<button type="button" class="tf-cash-delete" data-action="tfFinanceDelete">Delete transaction</button>':'')+'</form></section>';
 }
 const nav='<nav class="tf-cash-tabs" aria-label="Finance sections">'+options.map(([key,name])=>'<button type="button" class="'+(tfFinanceScreen===key?'active':'')+'" data-action="tfFinanceTab" data-screen="'+key+'">'+name+'</button>').join('')+'</nav>';
 const period='<label class="tf-cash-period"><span class="tf-cash-period-label">Reporting period</span><select id="tfFinancePeriod">'+[['month','This month'],['week','Last 7 days'],['year','This year'],['all','All time']].map(([k,v])=>'<option value="'+k+'" '+(tfFinancePeriod===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>';
 const summary='<section class="tf-cash-summary">'+period+'<div class="tf-cash-numbers"><div class="positive"><strong>'+euro(sum.income)+'</strong><small>Income</small></div><div class="negative"><strong>'+euro(sum.expenses)+'</strong><small>Expenses</small></div><div class="balance '+(sum.net<0?'negative':'positive')+'"><strong>'+euro(sum.net)+'</strong><small>Net cash flow</small></div></div></section>';
 const filterRows=periodRows.filter(x=>(tfFinanceScreen==='income'?x.kind==='income':tfFinanceScreen==='expenses'?x.kind==='expense':true)&&[x.title,x.source,x.vendor,x.category,x.notes,x.date].join(' ').toLowerCase().includes(tfFinanceSearch.toLowerCase()));
 const history='<section class="tf-cash-history"><div class="tf-cash-sectionhead"><h2>Transactions</h2><button type="button" data-action="tfFinanceTab" data-screen="transactions">View all ›</button></div>'+filterRows.slice(0,tfFinanceScreen==='overview'?5:200).map(tfFinanceRow).join('')+(filterRows.length?'':'<p class="tf-cash-empty">No transactions recorded for this period.</p>')+'</section>';
 const actions='<div class="tf-cash-actions"><button type="button" class="tf-cash-primary" data-action="tfFinanceNew" data-kind="income">+ New income</button><button type="button" class="tf-cash-outline" data-action="tfFinanceNew" data-kind="expense">+ New expense</button></div>';
 if(tfFinanceScreen==='transactions')return '<section class="tf-cash"><header class="tf-cash-formhead"><button type="button" data-action="tfFinanceBack" aria-label="Back to Finance">'+tfFinanceBackIcon+'</button><h2>Transactions</h2></header><div class="tf-cash-filtertabs">'+[['all','All'],['income','Income'],['expense','Expenses']].map(([v,l])=>'<button type="button" class="'+(tfFinanceFilter===v?'active':'')+'" data-action="tfFinanceFilter" data-kind="'+v+'">'+l+'</button>').join('')+'</div><input id="tfFinanceSearch" class="tf-cash-input" placeholder="Search transactions..." value="'+esc(tfFinanceSearch)+'"><div class="tf-cash-history">'+tfFinanceMonthlyList(rows.filter(x=>(tfFinanceFilter==='all'||x.kind===tfFinanceFilter)&&[x.title,x.source,x.vendor,x.category,x.notes].join(' ').toLowerCase().includes(tfFinanceSearch.toLowerCase())))+'</div></section>';
 if(tfFinanceScreen==='reports')return '<section class="tf-cash">'+financeTools+head+nav+summary+'<section class="tf-cash-chart"><h2>Cash flow</h2>'+tfFinanceChart(periodRows)+'</section><p class="tf-cash-disclaimer">Cash-basis tracking: recorded payments minus recorded expenses. Not a tax return or accrual-profit report.</p>'+actions+'</section>';
 return '<section class="tf-cash">'+financeTools+head+nav+summary+(tfFinanceScreen==='overview'?'<section class="tf-cash-chart"><div class="tf-cash-sectionhead"><h2>Cash flow</h2><small>Last 14 days</small></div>'+tfFinanceChart(rows)+'</section>':'')+history+actions+'</section>';
}
function tfFinanceCapture(){const form=document.getElementById('tfFinanceForm');return form?Object.fromEntries(new FormData(form)):null}


/* Universal Import V1: local CSV/TSV with explicit review before writing. */
let tfImportDraft=null,tfImportSaving=false;
const tfImportDefs={
 customers:{label:'Customers',fields:[['name','Customer name',true,['customer','customername','fullname','name','client','clientname','contact','contactname']],['firstName','First name',false,['firstname','givenname']],['lastName','Last name',false,['lastname','surname','familyname']],['phone','Phone',false,['phone','phonenumber','telephone','mobile','cell','contactnumber']],['email','Email',false,['email','emailaddress','contactemail']],['address','Address',false,['address','streetaddress','location','customeraddress','billingaddress']],['company','Company',false,['company','business','businessname','organization','organisation']],['notes','Notes',false,['notes','comments','description']]]},
 quotes:{label:'Quotations',fields:[['title','Description',true,['title','description','quote','quotation','quotetitle','quotedescription','project','scope']],['customerId','Customer name or ID',true,['customer','customername','client','clientname','customerid','clientid']],['category','Trade category',false,['trade','category','tradecategory','type']],['amount','Estimated value',false,['amount','value','estimatedvalue','quoteamount','quotevalue','total','price']],['status','Status',false,['status','stage']],['sentDate','Date sent',false,['datesent','sentdate','date','quotedate']]]},
 jobs:{label:'Jobs',fields:[['title','Job description',true,['job','jobtitle','jobdescription','title','description','project','projectname','scope']],['customerId','Customer name or ID',true,['customer','customername','client','clientname','customerid','clientid']],['category','Trade',false,['trade','category','tradecategory']],['status','Status',false,['status','stage','jobstatus']],['date','Scheduled date',false,['scheduleddate','date','startdate','jobdate','schedule']],['scheduleTime','Start time',false,['time','starttime','scheduledtime','appointmenttime']],['durationMinutes','Duration (minutes)',false,['durationminutes','minutes','duration']],['address','Site address',false,['address','siteaddress','jobaddress','location','workaddress']],['latitude','Latitude',false,['latitude','lat']],['longitude','Longitude',false,['longitude','lon','lng']],['googleMapsUrl','Google Maps pin link',false,['googlemapsurl','mapslink','googlemaplink']]]},
 tasks:{label:'Tasks',fields:[['title','Task title',true,['task','tasktitle','title','description','action','todo']],['customerId','Customer name or ID',false,['customer','customername','client','clientname','customerid','clientid']],['due','Due date',false,['due','duedate','deadline','date']],['status','Status',false,['status','stage']]]},
 expenses:{label:'Expenses',fields:[['amount','Amount paid',true,['amount','paid','value','cost','total','expenseamount','debit']],['date','Payment date',true,['date','paymentdate','paiddate','transactiondate','expensedate']],['title','Description',false,['description','title','expense','memo','details']],['category','Category',false,['category','type','expensecategory','trade']],['vendor','Supplier',false,['vendor','supplier','merchant','payee','paidto']],['method','Payment method',false,['paymentmethod','method','paymenttype']],['notes','Notes',false,['notes','comments']]]},
 payments:{label:'Income',fields:[['amount','Amount received',true,['amount','payment','paid','received','total','income','credit','revenue']],['date','Payment date',true,['date','paymentdate','receiveddate','transactiondate']],['source','Payer / source',false,['source','customer','client','payer','from','description']],['method','Payment method',false,['paymentmethod','method','paymenttype']],['notes','Notes',false,['notes','comments','memo']]]}
};
const tfImportNorm=v=>String(v??'').toLowerCase().trim().replace(/[^a-z0-9]/g,'');
const tfImportClean=v=>String(v??'').trim().slice(0,1000);
function tfImportDate(v){
 const text=String(v??'').trim();
 if(!text)return '';
 let yyyy,mm,dd;
 const iso=text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s.*)?$/);
 if(iso){yyyy=+iso[1];mm=+iso[2];dd=+iso[3]}
 else{
  const us=text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
  if(us){mm=+us[1];dd=+us[2];yyyy=+us[3]}
  else if(/^\d{5}$/.test(text)){const date=new Date(Date.UTC(1899,11,30)+Number(text)*86400000);return date.toISOString().slice(0,10)}
  else return null;
 }
 const d=new Date(Date.UTC(yyyy,mm-1,dd));
 return d.getUTCFullYear()===yyyy&&d.getUTCMonth()+1===mm&&d.getUTCDate()===dd?
 yyyy+'-'+String(mm).padStart(2,'0')+'-'+String(dd).padStart(2,'0'):null;
}
function tfImportAmount(v){
 let t=String(v??'').trim().replace(/[€$£\s]/g,'');
 if(!t)return null;
 if(/^\(.*\)$/.test(t))t='-'+t.slice(1,-1);
 if(t.includes(',')&&t.includes('.'))t=t.lastIndexOf(',')>t.lastIndexOf('.')?t.replace(/\./g,'').replace(',','.'):t.replace(/,/g,'');
 else if(t.includes(',')&&/,\d{1,2}$/.test(t))t=t.replace(',','.');
 else t=t.replace(/,/g,'');
 const n=Number(t);
 return Number.isFinite(n)&&n>=0&&n<=1e9?Math.round(n*100)/100:null;
}
function tfImportDelimited(text,delimiter){
 if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const char=text[i];
  if(quoted){if(char==='"'&&text[i+1]==='"'){field+='"';i++}else if(char==='"')quoted=false;else field+=char}
  else if(char==='"'&&!field)quoted=true;
  else if(char===delimiter){row.push(field);field=''}
  else if(char==='\r'||char==='\n'){if(char==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field=''}
  else field+=char;
 }
 if(quoted)throw Error('The file contains an unclosed quoted field.');
 if(field!==''||row.length){row.push(field);if(row.some(v=>v.trim()))rows.push(row)}
 return rows;
}
function tfImportDelimiter(text){
 let line='',quoted=false;for(let i=0;i<Math.min(text.length,8000);i++){const c=text[i];if(c==='"')quoted=!quoted;if((c==='\n'||c==='\r')&&!quoted)break;line+=c}
 const counts=[',','\t',';'].map(c=>{let n=0,inQuotes=false;for(let i=0;i<line.length;i++){if(line[i]==='"')inQuotes=!inQuotes;else if(line[i]===c&&!inQuotes)n++}return {c,n}});
 counts.sort((a,b)=>b.n-a.n);return counts[0].n?counts[0].c:',';
}
function tfImportAutoMap(headers,target){
 const mapping={},defs=tfImportDefs[target].fields;
 const selected=new Set();
 for(const [key,, ,aliases] of defs){
  const index=headers.findIndex((h,i)=>!selected.has(i)&&aliases.includes(tfImportNorm(h)));
  mapping[key]=index>=0?String(index):'';
  if(index>=0)selected.add(index);
 }
 return mapping;
}
function tfImportDupKey(target,record){
 const val=x=>tfImportNorm(x);
 if(target==='customers')return record.email?'e:'+val(record.email):record.phone?'p:'+String(record.phone).replace(/\D/g,''):'n:'+val(record.name)+'|'+val(record.address);
 if(target==='quotes')return [record.customerId,record.title,record.amount,record.sentDate].map(val).join('|');
 if(target==='jobs')return [record.customerId,record.title,record.date,record.scheduleTime||''].map(val).join('|');
 if(target==='tasks')return [record.title,record.customerId,record.due].map(val).join('|');
 if(target==='expenses')return [record.amount,record.date,record.vendor||'',record.title||''].map(val).join('|');
 if(target==='payments')return [record.amount,record.date,record.source||'',record.method||''].map(val).join('|');
 return '';
}
function tfImportResolveCustomer(value,customers){
 const input=String(value??'').trim(),name=tfImportNorm(input);
 if(!input)return '';
 const found=customers.find(c=>c.id===input||tfImportNorm(c.name)===name||tfImportNorm(c.email)===name);
 return found?.id||null;
}
function tfImportToRecord(values,target,customers){
 const v=key=>tfImportClean(values[key]),r={};
 if(target==='customers'){
  r.name=v('name')||[v('firstName'),v('lastName')].filter(Boolean).join(' ');
  if(!r.name)return {error:'Missing customer name'};
  r.phone=v('phone');r.email=v('email').toLowerCase();r.address=v('address');r.company=v('company');r.notes=v('notes');
  if(r.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))return {error:'Invalid email address'};
 }else if(target==='quotes'||target==='jobs'){
  r.title=v('title');if(!r.title)return {error:'Missing description'};
  const customer=v('customerId');
  if(!customer)return {error:'Missing customer — import customers first'};
  r.customerId=tfImportResolveCustomer(customer,customers);
  if(!r.customerId)return {error:'Customer not found: '+customer.slice(0,45)};
  r.category=v('category')||prefs.primaryTrade||'Other';
  if(target==='quotes'){
   const amount=v('amount')?tfImportAmount(v('amount')):0;if(amount===null)return {error:'Invalid quotation amount'};r.amount=String(amount);
   r.status=['Draft','Sent','Accepted','Declined'].find(x=>tfImportNorm(x)===tfImportNorm(v('status')))||'Draft';
   r.sentDate=tfImportDate(v('sentDate'));if(r.sentDate===null)return {error:'Invalid date sent'};
  }else{
   r.status=['Planned','In Progress','Completed'].find(x=>tfImportNorm(x)===tfImportNorm(v('status')))||'Planned';
   r.date=tfImportDate(v('date'));if(r.date===null)return {error:'Invalid scheduled date'};
   const customerRecord=customers.find(c=>c.id===r.customerId);
   const linkage=window.TradeFlowJobIntakeLinks?.augment(r,values,customerRecord);
   if(!linkage)return {error:'Job linkage engine unavailable'};
   if(linkage.error)return {error:linkage.error};
   Object.assign(r,linkage.record);
  }
 }else if(target==='tasks'){
  r.title=v('title');if(!r.title)return {error:'Missing task title'};
  if(v('customerId')){r.customerId=tfImportResolveCustomer(v('customerId'),customers);if(!r.customerId)return {error:'Customer not found: '+v('customerId').slice(0,45)}}
  r.due=tfImportDate(v('due'));if(r.due===null)return {error:'Invalid due date'};
  r.status=['Open','Done'].find(x=>tfImportNorm(x)===tfImportNorm(v('status')))||'Open';
 }else if(target==='expenses'||target==='payments'){
  const amount=tfImportAmount(v('amount'));if(amount===null||amount<=0)return {error:'Amount must be positive'};
  r.amount=amount;
  r.date=tfImportDate(v('date'));if(!r.date)return {error:'Missing or invalid payment date'};
  if(target==='expenses'){
   r.title=v('title')||v('category')||'Expense';r.category=v('category')||'Other';
   r.vendor=v('vendor');r.method=v('method')||'Bank transfer';r.notes=v('notes');
  }else{
   r.title='Payment received';r.source=v('source');r.method=v('method')||'Bank transfer';
   r.notes=v('notes');r.trade=prefs.primaryTrade||'Other';
  }
 }else return {error:'Unknown destination'};
 return {record:r};
}
function tfImportPreview(data){
 if(!tfImportDraft?.rows)return {items:[],valid:0,duplicate:0,invalid:0};
 const {target,rows,mapping}=tfImportDraft;
 const existing=new Set((data[target]||[]).map(r=>tfImportDupKey(target,r)));
 const imported=new Set(),items=[];let valid=0,duplicate=0,invalid=0;
 for(let i=0;i<rows.length;i++){
  const fields={};
  for(const [key,index] of Object.entries(mapping)){
   if(index!=='')fields[key]=rows[i][Number(index)]||'';
  }
  const converted=tfImportToRecord(fields,target,data.customers||[]);
  let status='valid',message='',record=converted.record;
  if(converted.error){status='invalid';message=converted.error;invalid++}
  else{
   const key=tfImportDupKey(target,record);
   if(existing.has(key)||imported.has(key)){status='duplicate';message='Possible duplicate — skipped';duplicate++}
   else{imported.add(key);valid++}
  }
  items.push({index:i+2,status,message,record});
 }
 return {items,valid,duplicate,invalid};
}
async function tfImportReadFile(file){
 if(!tfImportDraft)return;
 if(file.size>4*1024*1024)throw Error('Maximum file size is 4 MB.');
 if(!/\.(csv|tsv|txt)$/i.test(file.name))throw Error('This first version accepts CSV or TSV. In Excel, use Save As → CSV.');
 const text=await file.text(),rows=tfImportDelimited(text,tfImportDelimiter(text));
 if(rows.length<2)throw Error('Include one header row and at least one data row.');
 if(rows.length>2001)throw Error('Import up to 2,000 records at a time.');
 const headers=rows.shift().map((x,i)=>tfImportClean(x)||'Column '+(i+1));
 if(headers.length>120)throw Error('Too many spreadsheet columns (maximum 120).');
 tfImportDraft={...tfImportDraft,filename:file.name,headers,rows,mapping:tfImportAutoMap(headers,tfImportDraft.target)};
 await render();
}
function tfUniversalImportView(data){
 if(!tfImportDraft)return '';
 const {target,headers,filename,mapping}=tfImportDraft,schema=tfImportDefs[target];
 if(!schema)return '';
 const hasFile=!!headers,preview=hasFile?tfImportPreview(data):null;
 const nav='<div class="tf-import-head"><div><small>TRADEFLOW / IMPORT</small><h2>Import '+esc(schema.label)+'</h2></div><button type="button" data-action="tfImportClose" aria-label="Close import">×</button></div>';
 const fileArea='<label class="tf-import-picker" for="tfUniversalFile"><span>Choose CSV / TSV file</span><small>'+esc(filename||'Export from Excel, Google Sheets or your old system as CSV.')+'</small></label><input id="tfUniversalFile" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" hidden>';
 if(!hasFile)return '<div class="tf-import-overlay"><section class="tf-import-panel" role="dialog" aria-modal="true" aria-label="Import '+esc(schema.label)+'">'+nav+'<p>Transfer existing records without retyping. Files stay on this device. Nothing is saved until you review and confirm.</p>'+fileArea+'<div class="tf-import-foot"><button type="button" data-action="tfImportClose">Cancel</button></div></section></div>';
 const options='<option value="">— Do not import —</option>'+headers.map((h,i)=>'<option value="'+i+'">'+esc(h)+'</option>').join('');
 const fields=schema.fields.map(([key,label,required])=>'<label class="tf-import-field"><span>'+esc(label)+(required?' *':'')+'</span><select data-import-map="'+esc(key)+'">'+options.replace('value="'+esc(mapping[key])+'"','value="'+esc(mapping[key])+'" selected')+'</select></label>').join('');
 const sample=preview.items.slice(0,12).map(item=>{
  const title=item.record?.name||item.record?.title||item.record?.source||item.record?.vendor||'Row '+item.index;
  return '<div class="tf-import-sample '+item.status+'"><span class="tf-import-status">'+(item.status==='valid'?'Ready':item.status==='duplicate'?'Duplicate':'Review')+'</span><span><strong>'+esc(title)+'</strong><small>'+esc(item.message||('Spreadsheet row '+item.index))+'</small></span></div>';
 }).join('');
 const stats='<div class="tf-import-stats"><span><strong>'+preview.valid+'</strong> ready</span><span><strong>'+preview.duplicate+'</strong> duplicates</span><span><strong>'+preview.invalid+'</strong> need review</span></div>';
 return '<div class="tf-import-overlay"><section class="tf-import-panel" role="dialog" aria-modal="true" aria-label="Review '+esc(schema.label)+' import">'+nav+fileArea+'<p class="tf-import-hint">Match your spreadsheet columns, then review what will be saved. Existing records are never overwritten. Dates accept YYYY-MM-DD or U.S. MM/DD/YYYY.</p><div class="tf-import-fields">'+fields+'</div>'+stats+'<div class="tf-import-reviewbar"><h3>Preview</h3><button type="button" data-action="tfImportReport" '+(preview.invalid+preview.duplicate===0?'disabled':'')+'>Download skipped-row report</button></div><div class="tf-import-samples">'+sample+'</div><div class="tf-import-foot"><button type="button" data-action="tfImportClose">Cancel</button><button type="button" class="tf-import-confirm" data-action="tfImportSave" '+(!preview.valid||tfImportSaving?'disabled':'')+'>Import '+preview.valid+' records</button></div><p class="tf-import-hint">Unmatched customers, invalid fields and duplicates are skipped. Review any rejected rows in your source file.</p></section></div>';
}
async function tfImportSave(data){
 if(tfImportSaving||!tfImportDraft?.rows)return;
 const target=tfImportDraft.target,preview=tfImportPreview(data),accepted=preview.items.filter(x=>x.status==='valid');
 if(!accepted.length)return alert('No valid, new records to import.');
 if(!confirm('Import '+accepted.length+' '+tfImportDefs[target].label.toLowerCase()+'? '+(preview.invalid+preview.duplicate)+' rows will be skipped.'))return;
 tfImportSaving=true;
 try{
  const time=new Date().toISOString();
  await new Promise((resolve,reject)=>{
   const transaction=db.transaction(target,'readwrite'),store=transaction.objectStore(target);
   transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
   for(const item of accepted)store.put({...item.record,id:uid(),updatedAt:time,importSource:tfImportDraft.filename,...(tfImportDraft.sourceDocumentId?{sourceDocumentId:tfImportDraft.sourceDocumentId}: {})});
  });
  await event('Imported '+accepted.length+' '+tfImportDefs[target].label.toLowerCase());
  tfImportDraft=null;notify(accepted.length+' records imported · '+(preview.invalid+preview.duplicate)+' skipped');
 }catch(error){alert('Import failed: '+error.message)}
 finally{tfImportSaving=false}
}

/* Photo Intake: capture / choose a photo offline, then review and save it with a record.
   Image data is deliberately NOT sent to a server. AI extraction is not yet connected. */
let tfCapture=null,tfCaptureBusy=false,tfPhotoPending=null,tfAIQuestion='priorities';
const tfPhotoTargetTitle={customers:'Customer',jobs:'Job',quotes:'Quotation',tasks:'Task',payments:'Income',expenses:'Expense'};
const tfSafeImage=v=>typeof v==='string'&&/^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(v)&&v.length<680000?v:'';
function tfCaptureStart(target,id=''){
 if(!tfPhotoTargetTitle[target])return;
 tfCapture={target,recordId:id||'',dataUrl:'',filename:''};
}
async function tfCompressPhoto(file){
 if(!file||file.size>15*1024*1024)throw Error('Choose a photo smaller than 15 MB.');
 if(!/^image\//.test(file.type))throw Error('Please choose an image, not a document.');
 const objectUrl=URL.createObjectURL(file);
 try{
  const img=new Image();
  img.src=objectUrl;
  if(img.decode){await img.decode()}else await new Promise((res,rej)=>{img.onload=res;img.onerror=rej});
  const width=img.naturalWidth||img.width,height=img.naturalHeight||img.height;
  if(!width||!height)throw Error('This photo cannot be opened. Try a JPEG or PNG.');
  const scale=Math.min(1,1440/Math.max(width,height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Photo processing is unavailable in this browser.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  let output='';
  for(const quality of [.77,.65,.52,.4,.3]){
   output=canvas.toDataURL('image/jpeg',quality);
   if(output.length<=560000)break;
  }
  if(!tfSafeImage(output))throw Error('This image is too large. Crop the paper and try again.');
  return output;
 }finally{URL.revokeObjectURL(objectUrl)}
}
function tfCaptureView(){
 if(!tfCapture)return '';
 const {target,dataUrl,filename,recordId}=tfCapture;
 const title=tfPhotoTargetTitle[target]||'Record';
 const preview=tfSafeImage(dataUrl);
 return '<div class="tf-photo-overlay"><section class="tf-photo-panel" role="dialog" aria-modal="true" aria-labelledby="tfPhotoTitle"><header class="tf-photo-head"><div><small>TRADEFLOW / PHOTO INTAKE</small><h2 id="tfPhotoTitle">'+(recordId?'Attach to ':'New ')+esc(title.toLowerCase())+' photo</h2></div><button type="button" data-action="tfPhotoClose" aria-label="Close photo intake">×</button></header><p>Photograph an existing paper record or select a picture. Review the image, then enter its information manually. Saved photos stay in this browser and are included in your backups.</p><div class="tf-photo-options"><label for="tfPhotoCamera">'+tfPhotoIcon()+'<strong>Take photo</strong></label><input id="tfPhotoCamera" type="file" accept="image/*" capture="environment" hidden><label for="tfPhotoGallery">'+tfPhotoIcon()+'<strong>Choose photo</strong></label><input id="tfPhotoGallery" type="file" accept="image/*" hidden></div>'+(preview?'<div class="tf-photo-preview"><img src="'+preview+'" alt="Captured document preview"><small>'+esc(filename||'Photo ready')+' · Compressed for local storage</small></div>':'<div class="tf-photo-placeholder">No photo selected yet</div>')+'<div class="tf-photo-ai-lock"><span>✦</span><div><strong>AI document reading · Pro</strong><small>Automatic text extraction is not available yet. No image is uploaded or analyzed by AI.</small></div><button type="button" data-action="tfAIProInfo">Locked</button></div><div class="tf-photo-actions"><button type="button" data-action="tfPhotoClose">Cancel</button><button type="button" class="tf-photo-confirm" data-action="tfPhotoContinue" '+(!preview||tfCaptureBusy?'disabled':'')+'>'+(recordId?'Save photo':'Continue to '+esc(title.toLowerCase()))+'</button></div></section></div>';
}
function tfPhotoIcon(){return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/></svg>'}
function tfRecordPhotoSection(row,target){
 const data=tfSafeImage(row?.photoData);
 if(!data)return '';
 return '<section class="tf-record-dossier-box tf-photo-saved"><h3>'+tfPhotoIcon()+' Attached paper record</h3><img alt="Photo attached to this record" src="'+data+'"><div class="tf-photo-saved-actions"><button type="button" data-action="tfPhotoStart" data-target="'+target+'" data-id="'+esc(row.id)+'">Replace photo</button><button type="button" data-action="tfPhotoRemove" data-target="'+target+'" data-id="'+esc(row.id)+'">Remove photo</button></div></section>';
}
function tfFinancePhotoSection(record,target){
 const saved=tfSafeImage(tfPhotoPending?.target===target?tfPhotoPending.dataUrl:record?.photoData);
 if(!saved)return '';
 return '<div class="tf-photo-finance-attached"><strong>Attached paper record</strong><img src="'+saved+'" alt="Photo attached to financial record"><small>Kept locally with this record and included in JSON backup.</small></div>';
}

/* TradeFlow AI preview: chat remains in memory, private code stays in sessionStorage,
   and only opted-in aggregate context crosses the network. */
let tfChatMessages=[],tfChatBusy=false,tfChatError='',tfChatWithSummary=false,tfAiStatus='';
function tfAiKey(){try{return sessionStorage.getItem('tf-ai-preview-code')||''}catch(e){return ''}}
function tfAiContext(data){
 const month=today().slice(0,7),payments=data.payments||[],expenses=data.expenses||[];
 return {
  primary_trade:String(prefs.primaryTrade||'not set').slice(0,80),
  active_jobs:(data.jobs||[]).filter(x=>x.status!=='Completed'&&x.status!=='Cancelled').length,
  open_tasks:(data.tasks||[]).filter(x=>x.status!=='Done').length,
  quotations_sent:(data.quotes||[]).filter(x=>x.status==='Sent').length,
  opportunities:(data.opportunities||[]).length,
  month_income:payments.filter(x=>String(x.date||'').startsWith(month)).reduce((n,x)=>n+(Number(x.amount)||0),0),
  month_expenses:expenses.filter(x=>String(x.date||'').startsWith(month)).reduce((n,x)=>n+(Number(x.amount)||0),0)
 };
}
function tfAIChatView(data){
 const unlocked=!!tfAiKey();
 const chat=tfChatMessages.length?tfChatMessages.slice(-16).map(m=>'<div class="tf-ai-bubble '+(m.role==='user'?'tf-ai-mine':'tf-ai-theirs')+'"><small>'+(m.role==='user'?'YOU':'TRADEFLOW AI')+'</small><p>'+esc(m.content)+'</p></div>').join(''):'<div class="tf-ai-welcome"><span class="tf-ai-sparkle">✦</span><h3>What can I help you solve?</h3><p>Ask a business question, prepare a quotation, or explore your next decision.</p></div>';
 const examples=[['Quote strategy','How should I price a small electrical service job?'],['Profitability','How can I improve profit margins?'],['Business planning','What should I focus on this week?']];
 const gate=unlocked?'<div class="tf-ai-preview-gate"><span>Preview code saved for this browser session</span><button type="button" data-action="tfAiLock">Disconnect</button><button type="button" data-action="tfAiTestConnection">Check AI connection</button>'+(tfAiStatus?'<small role="status">'+esc(tfAiStatus)+'</small>':'')+'</div>':'<form id="tfAiUnlockForm" class="tf-ai-preview-gate"><label for="tfAiPreviewCode">Private preview access</label><div><input id="tfAiPreviewCode" name="code" type="password" minlength="12" maxlength="200" autocomplete="off" placeholder="Enter access code" required><button type="submit">Verify & unlock</button></div><small>Your code is checked against the Cloudflare Worker before unlocking.</small></form><div class="tf-ai-preview-gate"><button type="button" data-action="tfAiTestConnection">Check AI connection</button>'+(tfAiStatus?'<small role="status">'+esc(tfAiStatus)+'</small>':'')+'</div>';
 return '<section class="tf-ai-chat-box" aria-label="TradeFlow AI chat preview"><div class="tf-ai-chat-top"><div class="tf-ai-chat-symbol">✦</div><div><h2>TradeFlow AI <span>PREVIEW</span></h2><p>Business intelligence assistant</p></div><button type="button" class="tf-ai-clear" data-action="tfAiClear" '+(tfChatBusy?'disabled':'')+' aria-label="Clear conversation">Clear</button></div>'+gate+'<div class="tf-ai-chat-thread" id="tfAiThread" role="log" aria-live="polite">'+chat+(tfChatBusy?'<div class="tf-ai-typing">✦ Thinking…</div>':'')+'</div>'+(tfChatError?'<p class="tf-ai-chat-error" role="alert">'+esc(tfChatError)+'</p>':'')+'<div class="tf-ai-chat-suggestions">'+examples.map(([name,prompt])=>'<button type="button" data-action="tfAiPrompt" data-prompt="'+esc(prompt)+'" '+(unlocked&&!tfChatBusy?'':'disabled')+'>'+esc(name)+'</button>').join('')+'</div><form id="tfAiChatForm" class="tf-ai-chat-composer"><label class="tf-ai-prompt-label" for="tfAiPrompt">Your question</label><div class="tf-ai-compose-row"><textarea id="tfAiPrompt" name="prompt" rows="2" maxlength="1200" required '+(unlocked&&!tfChatBusy?'':'disabled')+' placeholder="'+(unlocked?'Ask TradeFlow AI...':'Unlock private preview to chat')+'"></textarea><button type="submit" '+(unlocked&&!tfChatBusy?'':'disabled')+' aria-label="Send question">➤</button></div><label class="tf-ai-context"><input type="checkbox" id="tfAiContext" '+(tfChatWithSummary?'checked':'')+' '+(!unlocked||tfChatBusy?'disabled':'')+'> Include anonymous business totals and record counts</label></form><p class="tf-ai-privacy">Online AI only when unlocked. Your contacts, photos, project details and complete records are never uploaded. Messages are sent for inference but not saved in TradeFlow.</p></section>';
}

/* TradeFlow Intelligence node: screen-aware preview UI, no silent data access/actions. */
let tfAiPanelOpen=false,tfAiPanelDraft='';
const tfAiScreenTitles={library:'Library',dashboard:'Home',map:'Opportunity Map',opportunities:'Opportunities',expenses:'Finance',customers:'Customers',quotes:'Quotations',jobs:'Jobs',tasks:'Tasks',settings:'More',preferences:'Settings',ai:'Intelligence'};
const tfAiScreenPrompts={
 dashboard:[['Priorities','Help me plan the top three priorities for my electrical contracting business this week.'],['Grow','Suggest practical ways to find more suitable electrical jobs.']],
 map:[['Qualify a project','How should I evaluate a construction project signal before pursuing electrical work?'],['Find opportunities','Which publicly available sources are useful for finding electrical subcontracting opportunities?']],
 opportunities:[['Next steps','Help me qualify a possible electrical project and determine next steps.'],['Pipeline','How should I organize my project opportunity pipeline?']],
 expenses:[['Cash flow','Explain a practical cash-flow review for a small electrical contractor.'],['Costs','What expenses should I monitor to protect job margins?']],
 customers:[['Customer care','Help me prepare a professional customer follow-up message.'],['Retention','Suggest ways to build repeat commercial electrical customers.']],
 quotes:[['Quotation','Give me a checklist for a clear commercial electrical quotation.'],['Follow-ups','Draft a polite follow-up for a quotation awaiting a decision.']],
 jobs:[['Plan work','Help me plan a safe, organized week of electrical contracting jobs.'],['Checklist','Suggest a generic pre-job planning checklist for electrical projects.']],
 tasks:[['Prioritize','How can I prioritize my outstanding contracting business tasks?'],['Workflow','Suggest a practical daily task review system.']],
 settings:[['Capabilities','Explain what a useful trade-business command center should help with.'],['Plan','Help me create an achievable business improvement plan.']],
 preferences:[['Business plan','Suggest a simple business planning routine for a small electrical contractor.']]
};
function tfAiCurrentPrompts(){return tfAiScreenPrompts[tab]||tfAiScreenPrompts.dashboard}
function tfAiOverlayView(){
 if(modal||tfCapture||tfImportDraft)return '';
 const onFull=tab==='ai',isOpen=tfAiPanelOpen&&!onFull,unlocked=!!tfAiKey();
 const emblem='<span class="tf-brand-mark" aria-hidden="true"><span class="tf-brand-top"></span><span class="tf-brand-stem"></span><span class="tf-brand-accent"></span></span>';
 const orb='<button type="button" class="tf-ai-orb" title="Tap to talk to TradeFlow" data-action="tfAiToggle" aria-label="Talk to TradeFlow" aria-expanded="false" aria-controls="tfAiOverlayRoot"><span class="tf-ai-orb-icon">'+emblem+'</span><span class="tf-ai-orb-signal" aria-hidden="true"></span></button>';
 if(!isOpen)return orb;
 const msgs=tfChatMessages.slice(-4).map(m=>'<div class="tf-ai-mini-message '+(m.role==='user'?'mine':'assistant')+'"><small>'+(m.role==='user'?'YOU':'TRADEFLOW AI')+'</small><p>'+esc(m.content)+'</p></div>').join('');
 const promptButtons=tfAiCurrentPrompts().map(([title,prompt])=>'<button type="button" data-action="tfAiPanelPrompt" data-prompt="'+esc(prompt)+'" '+(tfChatBusy?'disabled':'')+'>'+esc(title)+'</button>').join('');
 const gate=!unlocked?'<form id="tfAiUnlockForm" class="tf-ai-mini-gate"><label for="tfAiPreviewCode">Private AI preview access</label><div><input id="tfAiPreviewCode" name="code" type="password" minlength="12" maxlength="200" autocomplete="off" placeholder="Enter your existing code" required><button type="submit">Unlock</button></div><small>Use the same private preview code. No account is created.</small></form>':'';
 return orb+'<section class="tf-ai-mini-panel" id="tfAiPanel" role="dialog" aria-modal="false" aria-labelledby="tfAiPanelTitle"><header class="tf-ai-mini-head"><span class="tf-ai-mini-grip" aria-hidden="true"></span><div class="tf-ai-mini-mark">'+emblem+'</div><div><small>TRADEFLOW / INTELLIGENCE</small><h2 id="tfAiPanelTitle">AI command panel</h2></div><button type="button" class="tf-ai-mini-close" data-action="tfAiClose" aria-label="Close AI panel">×</button></header><div class="tf-ai-mini-context"><span class="tf-ai-mini-live" aria-hidden="true"></span>Viewing '+esc(tfAiScreenTitles[tab]||'TradeFlow')+' <span>· Preview</span></div><div class="tf-ai-mini-thread" id="tfAiMiniThread" role="log" aria-live="polite">'+(msgs||'<div class="tf-ai-mini-empty">How can I help you on this screen?</div>')+(tfChatBusy?'<div class="tf-ai-mini-thinking">✦ Thinking…</div>':'')+'</div>'+(tfChatError?'<p class="tf-ai-mini-error" role="alert">'+esc(tfChatError)+'</p>':'')+gate+'<div class="tf-ai-mini-suggestions">'+promptButtons+'</div><form id="tfAiQuickForm" class="tf-ai-mini-compose"><label for="tfAiQuickPrompt">Ask TradeFlow AI</label><div><textarea id="tfAiQuickPrompt" name="prompt" rows="2" maxlength="1200" placeholder="'+(unlocked?'Ask a question or describe a task…':'Unlock the preview to send a message')+'" '+(unlocked&&!tfChatBusy?'':'disabled')+' required>'+esc(tfAiPanelDraft)+'</textarea><button type="submit" aria-label="Send to TradeFlow AI" '+(unlocked&&!tfChatBusy?'':'disabled')+'>➤</button></div><label class="tf-ai-mini-optin"><input type="checkbox" id="tfAiQuickContext" '+(tfChatWithSummary?'checked':'')+' '+(unlocked&&!tfChatBusy?'':'disabled')+'> Share anonymous business totals</label></form><footer class="tf-ai-mini-foot"><span>Screen name is shared; records stay private unless totals are enabled.</span><button type="button" data-action="tfAiOpenFull">Expand ↗</button></footer><label class="tf-ai-haptic-setting"><input type="checkbox" switch id="tfAiHaptics" '+(tfUiHapticsEnabled?'checked':'')+'> Tactile feedback <small>(supported devices)</small></label></section>';
}
function tfAiRefreshOverlay(){
 const host=document.getElementById('tfAiOverlayRoot');
 if(!host)return;
 host.innerHTML=tfAiOverlayView();
 const log=host.querySelector('#tfAiMiniThread');
 if(log)log.scrollTop=log.scrollHeight;
}
async function tfAiUpdateChatUI(){
 if(tab==='ai'){await render();const log=document.getElementById('tfAiThread');if(log)log.scrollTop=log.scrollHeight}
 else tfAiRefreshOverlay();
}
function tfAiClosePanel(){if(!tfAiPanelOpen)return;tfAiPanelOpen=false;tfAiRefreshOverlay()}
/* Haptics are progressive enhancement: iOS Safari doesn't provide arbitrary web vibration.
   The native switch may provide its own system feedback; an eventual iOS native wrapper
   would use UIFeedbackGenerator/Core Haptics for custom event feedback. */
let tfUiHapticsEnabled=true;
try{tfUiHapticsEnabled=localStorage.getItem('tf-ui-haptics')!=='off'}catch(e){}
function tfUiHaptic(kind='selection'){
 if(!tfUiHapticsEnabled||typeof navigator.vibrate!=='function')return false;
 try{return navigator.vibrate(kind==='success'?[13,55,13]:kind==='warning'?[20,50,20]:9)===true}catch(e){return false}
}
/* The AI control behaves like a small physical switch: short tap opens, press/hold
   expands after 430 ms, large finger movement cancels the hold. No data is changed. */
let tfAiHoldTimer=0,tfAiHoldOrigin=null,tfAiSkipClickUntil=0,tfAiDrag=null;
function tfAiCancelHold(){
 if(tfAiHoldTimer)clearTimeout(tfAiHoldTimer);
 tfAiHoldTimer=0;
 if(tfAiHoldOrigin?.node)tfAiHoldOrigin.node.classList.remove('tf-ai-liquid-pressed');
 tfAiHoldOrigin=null;
}
document.addEventListener('pointerdown',event=>{
 const orb=event.target.closest?.('.tf-ai-orb');
 if(!orb||(event.pointerType==='mouse'&&event.button!==0))return;
 tfAiCancelHold();
 tfAiHoldOrigin={node:orb,x:event.clientX,y:event.clientY,id:event.pointerId};
 orb.classList.add('tf-ai-liquid-pressed');
 // Start recognition from the actual pointer gesture; waiting for a hold timer can lose browser user activation.
 // The following synthetic click is suppressed, so it cannot toggle recognition off again.
 if(window.TradeFlowVoice?.startListening){tfAiSkipClickUntil=Date.now()+1000;tfAiPanelOpen=false;tfUiHaptic('selection');window.TradeFlowVoice.startListening();}
 return;
},true);
document.addEventListener('pointermove',event=>{
 if(tfAiHoldOrigin&&event.pointerId===tfAiHoldOrigin.id&&Math.hypot(event.clientX-tfAiHoldOrigin.x,event.clientY-tfAiHoldOrigin.y)>12)tfAiCancelHold();
 if(tfAiDrag&&event.pointerId===tfAiDrag.id){
  const d=event.clientY-tfAiDrag.y;
  tfAiDrag.dy=d>0?d:0;
  if(tfAiDrag.dy>0&&tfAiDrag.panel.isConnected){
   tfAiDrag.panel.style.transition='none';
   tfAiDrag.panel.style.transform='translate3d(0,'+Math.min(130,tfAiDrag.dy*.75)+'px,0)';
  }
 }
},{capture:true,passive:true});
document.addEventListener('pointerdown',event=>{
 const header=event.target.closest?.('.tf-ai-mini-head');
 if(!header||event.target.closest?.('button'))return;
 const panel=header.closest('.tf-ai-mini-panel');
 if(panel)tfAiDrag={panel,y:event.clientY,id:event.pointerId,dy:0};
},true);
function tfAiStopPointer(event){
 tfAiCancelHold();
 if(!tfAiDrag||event.pointerId!==tfAiDrag.id)return;
 const state=tfAiDrag;tfAiDrag=null;
 if(state.dy>90){tfUiHaptic('selection');tfAiClosePanel();return}
 if(!state.panel.isConnected)return;
 state.panel.style.transition='transform 220ms cubic-bezier(.2,.8,.2,1)';
 state.panel.style.transform='';
 setTimeout(()=>{if(state.panel.isConnected)state.panel.style.transition=''},240);
}
document.addEventListener('pointerup',tfAiStopPointer,true);
document.addEventListener('pointercancel',tfAiStopPointer,true);
document.addEventListener('click',event=>{
 if(Date.now()<tfAiSkipClickUntil&&event.target.closest?.('.tf-ai-orb')){
  event.preventDefault();event.stopImmediatePropagation();
 }
},true);
document.addEventListener('input',event=>{if(event.target.id==='tfAiQuickPrompt')tfAiPanelDraft=event.target.value;const form=event.target.closest?.('#tfOdContactWorkflowForm');if(form&&['contact_phone','contact_email'].includes(event.target.name))window.TradeFlowDossier?.syncQuickLinks(form)});
document.addEventListener('change',event=>{
 if(event.target.id==='tfAiQuickContext')tfChatWithSummary=event.target.checked;
 if(event.target.id==='tfAiHaptics'){
  tfUiHapticsEnabled=!!event.target.checked;
  try{localStorage.setItem('tf-ui-haptics',tfUiHapticsEnabled?'on':'off')}catch(e){}
 }
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&tfAiPanelOpen){tfAiClosePanel();document.querySelector('.tf-ai-orb')?.focus()}});
document.addEventListener('click',event=>{
 if(!tfAiPanelOpen||event.target.closest?.('#tfAiPanel,.tf-ai-orb'))return;
 tfAiClosePanel();
},true);

async function tfAiHealthCheck(){
 const response=await fetch('/api/ai/health',{method:'GET',cache:'no-store'});
 const body=await response.json().catch(()=>null);
 if(!response.ok||!body?.online)throw Error('AI endpoint unreachable (HTTP '+response.status+')');
 tfAiStatus=!body.secretConfigured?'Endpoint reachable, but TF_AI_PREVIEW_TOKEN has not been saved in Cloudflare.':!body.aiBound?'Endpoint reachable, but the AI binding is missing.':'Endpoint online. AI binding and access-code configuration detected.';
 return body;
}
async function tfAiDescribeError(err){
 const name=String(err?.name||'');
 const message=String(err?.message||err||'Unknown request error');
 if(name!=='TypeError'&&!/type error|failed to fetch|load failed|networkerror/i.test(message))return message.slice(0,240);
 try{
  await tfAiHealthCheck();
  return 'The AI server is reachable, but a request failed before receiving a response ('+message.slice(0,100)+'). Reload in Safari and try again.';
 }catch(probeError){
  return 'Network error: the browser could not reach /api/ai/chat or /api/ai/health ('+message.slice(0,60)+'). Open the preview directly in Safari, disable content blockers/VPN if applicable, and retry.';
 }
}
async function tfAISend(text){
 const content=String(text||'').trim().slice(0,1200);
 if(!content||tfChatBusy||!tfAiKey())return;
 const screen=tab;
 tfChatError='';
 tfChatMessages.push({role:'user',content});
 tfChatBusy=true;
 await tfAiUpdateChatUI();
 try{
  let business=null;
  if(tfChatWithSummary){const data=Object.fromEntries(await Promise.all(['jobs','tasks','quotes','opportunities','payments','expenses'].map(async s=>[s,await all(s)])));business=tfAiContext(data)}
  const response=await fetch('/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:tfAiKey(),messages:tfChatMessages.slice(-8),business,screen}),cache:'no-store'});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(String(payload.error||'AI service not available')+' (HTTP '+response.status+')');
  if(typeof payload.reply!=='string'||!payload.reply.trim())throw Error('The model returned an empty response');
  tfChatMessages.push({role:'assistant',content:payload.reply.trim().slice(0,2500)});
 }catch(err){tfChatError=await tfAiDescribeError(err)}
 finally{tfChatBusy=false;await tfAiUpdateChatUI()}
}
document.addEventListener('submit',async e=>{
 if(e.target.id==='tfAiUnlockForm'){
  e.preventDefault();
  const code=String(new FormData(e.target).get('code')||'');
  if(code.trim().length<12)return alert('Enter the private access code (at least 12 characters).');
  try{
   const response=await fetch('/api/ai/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code}),cache:'no-store'});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.authorized)throw Error((result.error||'Cannot verify this access code')+' (HTTP '+response.status+')');
   try{sessionStorage.setItem('tf-ai-preview-code',code)}catch(err){throw Error('This browser does not allow session storage.')}
   tfChatError='';tfAiStatus='Access verified. AI connection available.';
  }catch(err){tfChatError=await tfAiDescribeError(err);tfAiStatus='Access verification unsuccessful.';}
  await tfAiUpdateChatUI();return;
 }
 if(e.target.id==='tfAiQuickForm'){
  e.preventDefault();
  if(tfChatBusy||!tfAiKey())return;
  tfChatWithSummary=!!e.target.querySelector('#tfAiQuickContext')?.checked;
  const prompt=String(new FormData(e.target).get('prompt')||'');
  tfAiPanelDraft='';
  await tfAISend(prompt);
  return;
 }
 if(e.target.id==='tfAiChatForm'){
  e.preventDefault();
  if(tfChatBusy)return;
  tfChatWithSummary=!!e.target.querySelector('#tfAiContext')?.checked;
  await tfAISend(String(new FormData(e.target).get('prompt')||''));
 }
});

const tfAIIcon='<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3M10 11h4m-2-2v4"/></svg>';
function tfAIView(d){
 const openJobs=d.jobs.filter(x=>x.status!=='Completed'&&x.status!=='Cancelled'),pending=d.tasks.filter(x=>x.status!=='Done');
 const date=today(),overdue=pending.filter(x=>x.due&&x.due<date);
 const dueSoon=pending.filter(x=>x.due&&x.due>=date&&x.due<=new Date(Date.now()+7*86400000).toISOString().slice(0,10));
 const quotesWaiting=d.quotes.filter(x=>x.status==='Sent');
 const month=date.slice(0,7);
 const income=d.payments.filter(x=>String(x.date||'').startsWith(month)).reduce((n,x)=>n+Number(x.amount||0),0);
 const expenses=d.expenses.filter(x=>String(x.date||'').startsWith(month)).reduce((n,x)=>n+Number(x.amount||0),0);
 const leads=(d.opportunities||[]).filter(x=>!['Won','Lost'].includes(x.status||''));
 const n=(value,singular,plural)=>value+' '+(value===1?singular:plural);
 const responses={
 priorities:['Your next actions',[
  n(overdue.length,'task is','tasks are')+' overdue.',
  n(dueSoon.length,'task is','tasks are')+' due within 7 days.',
  n(quotesWaiting.length,'quotation is','quotations are')+' marked Sent and may need a follow-up.',
  n(openJobs.length,'job is','jobs are')+' still active.'
 ]],
 cash:['This month’s cash position',[
  'Recorded income: '+euro(income)+'.',
  'Recorded expenses: '+euro(expenses)+'.',
  'Net cash flow: '+euro(income-expenses)+'.',
  'Only recorded payments count as received income; quotations are not payments.'
 ]],
 pipeline:['Your current pipeline',[
  n(leads.length,'opportunity is','opportunities are')+' still in the research or sales pipeline.',
  n(quotesWaiting.length,'quotation has','quotations have')+' status Sent.',
  n(openJobs.length,'job remains','jobs remain')+' active.',
  'Review each opportunity’s evidence before treating it as verified demand.'
 ]],
 tasks:['Task review',[
  n(overdue.length,'task is','tasks are')+' past its due date.',
  n(dueSoon.length,'task is','tasks are')+' due in the next week.',
  n(pending.length,'task remains','tasks remain')+' incomplete.',
  'Open Tasks to change assignments and completion statuses.'
 ]]
 };
 const [answer,lines]=responses[tfAIQuestion]||responses.priorities;
 return '<section class="tf-ai-screen">'+tfAIChatView(d)+'<header class="tf-ai-heading">'+tfAIIcon+'<div><h1>TradeFlow Intelligence</h1><p>Your local business briefing.</p></div></header><div class="tf-ai-tags"><span>OFFLINE</span><span>NO AI API CALLS</span><span>LOCAL DATA ONLY</span></div><section class="tf-ai-panel"><div class="tf-ai-section-head"><h2>Ask your headquarters</h2><small>Choose a briefing</small></div><div class="tf-ai-questions">'+[['priorities','My priorities'],['cash','Cash flow'],['pipeline','Pipeline'],['tasks','Tasks']].map(([key,label])=>'<button type="button" data-action="tfAIQuestion" data-question="'+key+'" class="'+(tfAIQuestion===key?'active':'')+'">'+label+'</button>').join('')+'</div><div class="tf-ai-answer"><h3>'+esc(answer)+'</h3><ul>'+lines.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div><p class="tf-ai-disclosure">These are rule-based summaries of records on this device, not generative AI or financial advice. Figures depend on the records you entered.</p></section><section class="tf-ai-pro"><div class="tf-ai-pro-head"><span>✦</span><div><h2>TradeFlow AI Pro</h2><p>Advanced capabilities planned</p></div><span class="tf-ai-locked">LOCKED</span></div><div class="tf-ai-pro-lines"><div>Document and handwriting extraction</div><div>AI-assisted follow-up drafts</div><div>Business recommendations</div></div><button type="button" data-action="tfAIProInfo">About future Pro access</button><p>Not for sale or active yet. Pro will require verified account entitlements and a secure server connection.</p></section></section>';
}


/* First-run offline workspace setup. This does not create an online user account. */
let tfOnboardingTrade='';
const tfTradeCatalog=[
 ['Electrical','<path d="m13 2-9 11h7l-1 9 10-12h-7z"/>'],
 ['Plumbing','<path d="M12 3c-4 5-7 8-7 12a7 7 0 0 0 14 0c0-4-3-7-7-12z"/><path d="M9 17a3 3 0 0 0 3 3"/>'],
 ['HVAC','<circle cx="12" cy="12" r="2"/><path d="M12 10c-3-7 7-9 7-3 0 2-2 4-5 5M14 12c7-3 9 7 3 7-2 0-4-2-5-5M12 14c3 7-7 9-7 3 0-2 2-4 5-5M10 12c-7 3-9-7-3-7 2 0 4 2 5 5"/>'],
 ['Construction','<path d="M3 18h18M5 18v-3a7 7 0 0 1 14 0v3M10 8V5h4v3M8 18v-3M16 18v-3"/>'],
 ['Renovation','<path d="m14 5 5 5M3 21l6-2L20 8a3 3 0 0 0-4-4L5 15z"/>'],
 ['Carpentry','<path d="M3 20h18M5 15l8-8M12 3l9 9M7 17l10-10M3 5h5v5"/>'],
 ['Roofing','<path d="m2 12 10-9 10 9M5 11v10h14V11M9 21v-7h6v7"/>'],
 ['Painting','<rect x="3" y="4" width="15" height="6" rx="2"/><path d="M18 7h3v5h-9v3M12 15v6"/>'],
 ['Landscaping','<path d="M20 4c-10 0-16 4-16 12a5 5 0 0 0 5 5c8 0 12-6 11-17zM5 19c5-6 9-8 13-10"/>'],
 ['Cleaning','<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>'],
 ['Automotive','<path d="m5 16 1-6h12l1 6M4 16h16v4H4zM8 20v2M16 20v2M5 10l2-5h10l2 5M7 16h.01M17 16h.01"/>'],
 ['Real Estate','<path d="M4 21V4l9-2v19M13 7h7v14M2 21h20M8 6v2M8 11v2M8 16v2M17 11v2M17 16v2"/>'],
 ['Flooring','<path d="M3 5h18v14H3zM3 12h18M9 5v7M16 12v7M6 12v7M19 5v7"/>'],
 ['Handyman','<path d="M21 7a6 6 0 0 1-8 5.7l-8 8a2 2 0 0 1-3-3l8-8A6 6 0 0 1 17 3l-4 4 4 4z"/>'],
 ['Other','<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>']
];
function tfTradeIcon(trade,size=25){
 const code=tfTradeCatalog.find(([name])=>name.toLowerCase()===String(trade||'').trim().toLowerCase())?.[1]||'<path d="M3 7h18v14H3zM9 7V4h6v3M3 12h18M11 12v2h2v-2"/>';
 return '<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+code+'</svg>';
}
function tfTradeChoices(){
 return [...new Set([prefs.primaryTrade,...tfTradeCatalog.map(x=>x[0]),...(Array.isArray(prefs.categories)?prefs.categories:[])].map(x=>String(x||'').trim()).filter(Boolean))];
}
function tfTradeMatch(record,trade){
 const attached=String(record?.trade||'').trim();
 if(attached)return attached===trade;
 const category=String(record?.category||'').trim();
 if(category&&tfTradeCatalog.some(([name])=>name===category))return category===trade;
 // Operational expense categories such as Materials are not themselves trades.
 // Untagged financial entries are included in the primary business totals.
 return true;
}
function tfOnboardingNeeded(savedSettings){
 return !String(savedSettings?.primaryTrade||'').trim();
}
function tfOnboardingView(data){
 const existing=['customers','quotes','jobs','tasks','payments','expenses','opportunities'].some(key=>(data[key]||[]).length);
 const selection=tfOnboardingTrade||'';
 return '<main class="tf-setup-screen"><section class="tf-setup-wrap"><header class="tf-setup-brand"><span class="tf-setup-logo" aria-hidden="true">T<span></span></span><span>TRADEFLOW</span></header><div class="tf-setup-intro"><span class="tf-setup-step">YOUR BUSINESS / SETUP 01</span><h1>Welcome to your headquarters.</h1><p>Set up your workspace around the work you actually do. No account or subscription is needed for local setup.</p></div><form id="tfSetupForm" class="tf-setup-form"><fieldset class="tf-setup-trades"><legend>What type of business do you run? <span>Required</span></legend><p>Choose your primary trade. You can change it anytime in Settings.</p><div class="tf-setup-grid">'+tfTradeCatalog.map(([trade])=>'<button type="button" class="tf-setup-trade'+(selection===trade?' is-selected':'')+'" data-action="tfTradeChoose" data-trade="'+esc(trade)+'" aria-pressed="'+(selection===trade)+'"><span class="tf-setup-trade-icon">'+tfTradeIcon(trade,24)+'</span><span>'+esc(trade)+'</span><span class="tf-setup-selected-check" aria-hidden="true">✓</span></button>').join('')+'</div><input type="hidden" name="primaryTrade" value="'+esc(selection)+'" required><label class="tf-setup-other" id="tfSetupOther" '+(selection==='Other'?'':'hidden')+'>Describe your trade<input id="tfSetupOtherName" name="customTrade" type="text" maxlength="50" placeholder="e.g. Pool servicing" value=""></label></fieldset><div class="tf-setup-details"><label>Business name <span>Optional</span><input name="company" type="text" maxlength="70" value="'+esc(prefs.company==='TradeFlow Lite'?'':prefs.company)+'" placeholder="Your company name"></label><label>Service city / region <span>Optional</span><input name="serviceArea" type="text" maxlength="120" value="'+esc(prefs.serviceArea||'')+'" placeholder="e.g. Austin, Texas"></label><label>Business headquarters address <span>Recommended</span><input name="businessAddress" type="text" autocomplete="street-address" maxlength="300" value="'+esc(prefs.businessAddress||'')+'" placeholder="123 Main St, Austin, TX 78701"></label><small>TradeFlow will use this address as your Map headquarters. If it cannot locate it automatically, you can confirm the pin on the Map.</small></div>'+(existing?'<p class="tf-setup-legacy"><strong>Your existing records are safe.</strong> This setup will not delete or overwrite customers, jobs, finances, or opportunities.</p>':'')+'<button class="tf-setup-submit" type="submit">Open my headquarters <span aria-hidden="true">→</span></button><p class="tf-setup-footnote">Offline-first · Business information is stored on this device. Back up under Settings.</p></form></section></main>';
}

function view(d){if(tab==='library')return window.TradeFlowLibrary?.render()||'<p>Library unavailable. Reload TradeFlow.</p>';if(tab==='research')return window.TradeFlowResearch?.render(d)||'<p class="muted">Research Briefs unavailable. Reload the preview.</p>';if(tab==='dispatch')return window.TradeFlowOperations?.render(tab,d)||'<p class="muted">Crew Dispatch unavailable. Reload the preview.</p>';if(tab==='integrations')return window.TradeFlowIntegrations?.render(d)||'<p class="muted">Integration Hub unavailable. Reload the preview.</p>';if(tab==='routes')return window.TradeFlowRoutes?.render(tab,d,prefs)||'<p class="muted">Route tools unavailable. Reload the preview.</p>';if(tab==='marketing')return window.TradeFlowMarketing?.render(tab,d)||'<p class="muted">Marketing Studio unavailable. Reload the preview.</p>';if(['invoices','profitability'].includes(tab))return window.TradeFlowRevenue?.render(tab,d)||'<p class="muted">Revenue tools unavailable. Reload the preview.</p>';if(tab==='calendar')return window.TradeFlowCalendar?.render(d)||'<p class="muted">Calendar unavailable. Reload the preview.</p>';if(['growth','missions','growthAutomation','growthOptimization','growthCommunication','growthIntelligence'].includes(tab))return window.TradeFlowGrowth?.renderPage(tab,d,prefs)||'<p class="muted">Growth tools unavailable. Reload the preview.</p>';if(tab==='expenses')return tfFinanceView(d);if(tab==='map')return mapView(d);if(tab==='dashboard'){
const activeJobs=d.jobs.filter(x=>x.status!=='Completed'&&x.status!=='Cancelled');
const dueTasks=d.tasks.filter(x=>x.status!=='Done'&&x.due&&x.due<=today());
const greeting=new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening';
const trade=String(prefs.primaryTrade||'').trim()||'Business';
const monthPrefix=new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0');
const tradeQuotes=d.quotes.filter(x=>(!x.category||x.category===trade)&&String(x.sentDate||x.date||'').startsWith(monthPrefix));
const tradeExpenses=d.expenses.filter(x=>tfTradeMatch(x,trade)&&String(x.date||'').startsWith(monthPrefix));
const quoted=tradeQuotes.reduce((sum,x)=>sum+Number(x.amount||0),0);
const accepted=tradeQuotes.filter(x=>x.status==='Accepted');
const expenses=tradeExpenses.reduce((sum,x)=>sum+Number(x.amount||0),0);const recordedTradeRevenue=d.payments.filter(x=>tfTradeMatch(x,trade)&&String(x.date||'').startsWith(monthPrefix)).reduce((sum,x)=>sum+Number(x.amount||0),0);
const decided=tradeQuotes.filter(q=>['Accepted','Declined'].includes(q.status));
const conversion=decided.length?Math.round(100*accepted.length/decided.length):null;
const icons=[tfHomeIcons.customers,tfHomeIcons.quotes,tfHomeIcons.jobs,tfHomeIcons.tasks];
const stats=[['Customers',d.customers.length,'customers'],['Quotations',d.quotes.length,'quotes'],['Active jobs',activeJobs.length,'jobs'],['Tasks due',dueTasks.length,'tasks']];
const period=homePeriod;
const chart=buildHomeRevenueChart(d,period);
const activity=[...d.events].filter(x=>x.date).sort((x,y)=>String(y.date).localeCompare(String(x.date))).slice(0,4);
return `<section class="tf-home tf-home-v2">

<div class="tf-home-intro"><h1>Good ${greeting}.</h1><p>Your business at a glance.</p><button class="tf-home-library-shortcut" type="button" data-tab="library"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V3m0 0L7 8m5-5 5 5M4 16v4h16v-4"/></svg><span>Import</span></button></div>
<div class="tf-home-stats">${stats.map(([label,value,target],i)=>`<button type="button" class="tf-home-stat" data-tab="${target}"><span class="tf-stat-icon">${icons[i]}</span><strong>${value}</strong><span>${label}</span></button>`).join('')}</div>
<section class="tf-home-finance" aria-label="Revenue overview"><div class="tf-home-charthead"><span class="tf-home-kicker">Revenue</span><select id="tfHomePeriod" class="tf-home-period" aria-label="Chart time range">${[['1W','This week'],['1M','This month'],['3M','3 months'],['6M','6 months'],['1Y','This year'],['All','All time']].map(([value,label])=>`<option value="${value}" ${period===value?'selected':''}>${label}</option>`).join('')}</select></div><strong class="tf-home-revenue">${euro(chart.total)}</strong><div class="tf-home-growth">${chart.hasRevenue?'Recorded revenue':'No payments recorded yet'}</div>
<div class="tf-home-chart">${chart.html}</div></section>
<section class="tf-home-trade"><div class="tf-home-sectionhead"><h2>${esc(trade)} performance</h2><span>This month</span></div><div class="tf-home-trade-body"><div class="tf-home-trade-label"><span class="tf-home-trade-icon">${tfTradeIcon(trade,29)}</span><div><strong>${esc(trade)}</strong><small>Your primary trade</small></div></div><div class="tf-home-trade-metrics"><div><strong>${euro(recordedTradeRevenue)}</strong><small>Revenue</small></div><div><strong>${euro(quoted)}</strong><small>Quoted</small></div><div><strong>${euro(expenses)}</strong><small>Expenses</small></div></div></div><div class="tf-home-progress"><span style="width:${conversion??0}%"></span></div><div class="tf-home-progress-caption">${conversion===null?'No decided quotations':conversion+'% of decided quotations accepted ('+decided.length+' decided)'} <button type="button" data-tab="quotes" aria-label="View quotations">›</button></div></section>
<section class="tf-home-activity"><div class="tf-home-sectionhead"><h2>Recent activity</h2><button type="button" data-tab="tasks">View tasks ›</button></div><div class="tf-home-timeline">${activity.length?activity.map(x=>{const type=/quote|quotation/i.test(x.text)?'quotes':/customer/i.test(x.text)?'customers':/job/i.test(x.text)?'jobs':/expense|payment|income/i.test(x.text)?'cash':'tasks';return `<div class="tf-home-event"><span class="tf-home-event-icon">${tfHomeIcons[type]||tfHomeIcons.tasks}</span><span class="tf-home-event-text">${esc(x.text)}</span><time>${new Date(x.date).toLocaleDateString('en-US',{day:'numeric',month:'short'})}</time></div>`}).join(''):'<div class="tf-home-empty">Your customer, quote and job activity will appear here.</div>'}</div></section>
</section>`}
if(tab==='opportunities')return opportunityView(d);if(tab==='suppliers')return window.TradeFlowSupply?.render(d,prefs)||'<p>Suppliers unavailable. Reload the app.</p>';if(tab==='ai')return tfAIView(d);if(tab==='preferences')return `<section class="tf-settings-v2"><header class="tf-settings-heading"><button type="button" data-tab="settings" aria-label="Back to More">‹</button><div><h2>Settings</h2><p>Manage your business and app preferences.</p></div></header><div class="tf-settings-brand"><span class="tf-brand-mark" aria-hidden="true"><span class="tf-brand-top"></span><span class="tf-brand-stem"></span><span class="tf-brand-accent"></span></span><div><strong>TRADEFLOW</strong><small>${esc(prefs.company)}</small></div><button type="button" data-action="settingsPanel" data-panel="profile" class="tf-settings-brand-edit">✎ Edit</button></div><section class="tf-settings-group"><h3>BUSINESS</h3><button type="button" class="tf-settings-row" data-action="settingsPanel" data-panel="account"><span class="tf-settings-rowcopy"><strong>Account access</strong><small>Sign in and check business membership</small></span><span class="tf-settings-rowarrow">›</span></button><button type="button" class="tf-settings-row" data-action="settingsPanel" data-panel="profile"><span class="tf-settings-rowicon"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5"/></svg></span><span class="tf-settings-rowcopy"><strong>Business profile</strong><small>Name, location, contact details</small></span><span class="tf-settings-rowarrow">›</span></button><button type="button" class="tf-settings-row" data-action="settingsPanel" data-panel="defaults"><span class="tf-settings-rowicon"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20v-6M9 20V9M14 20v-4M19 20V4"/></svg></span><span class="tf-settings-rowcopy"><strong>Default settings</strong><small>Currency, tax, measurement units</small></span><span class="tf-settings-rowarrow">›</span></button><button type="button" class="tf-settings-row" data-action="settingsPanel" data-panel="team"><span class="tf-settings-rowicon"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5"/></svg></span><span class="tf-settings-rowcopy"><strong>Team</strong><small>Team management (future)</small></span><span class="tf-settings-rowarrow">›</span></button></section><section class="tf-settings-group"><h3>DATA & STORAGE</h3><button type="button" class="tf-settings-row" data-action="settingsPanel" data-panel="backup"><span class="tf-settings-rowicon"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/></svg></span><span class="tf-settings-rowcopy"><strong>Backup & restore</strong><small>Export or restore your data</small></span><span class="tf-settings-rowarrow">›</span></button><button type="button" class="tf-settings-row" data-action="settingsPanel" data-panel="storage"><span class="tf-settings-rowicon"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg></span><span class="tf-settings-rowcopy"><strong>Storage</strong><small>Local data and usage</small></span><span class="tf-settings-rowarrow">›</span></button></section><section class="tf-settings-group"><h3>APPEARANCE</h3><button type="button" class="tf-settings-row" data-action="settingsPanel" data-panel="appearance"><span class="tf-settings-rowicon"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="m10 2-.5 2.2-2 1-2.1-1-2 3.5 1.7 1.5v2.4L3.4 13l2 3.5 2.1-1 2 1L10 19h4l.5-2.5 2-1 2.1 1 2-3.5-1.7-1.4V9.2l1.7-1.5-2-3.5-2.1 1-2-1L14 2z"/></svg></span><span class="tf-settings-rowcopy"><strong>App appearance</strong><small>Theme, accent color, display</small></span><span class="tf-settings-rowarrow">›</span></button></section><section class="tf-settings-group"><h3>SUPPORT</h3><button type="button" class="tf-settings-row" data-action="settingsPanel" data-panel="help"><span class="tf-settings-rowicon"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01"/></svg></span><span class="tf-settings-rowcopy"><strong>Help & support</strong><small>Guides and assistance</small></span><span class="tf-settings-rowarrow">›</span></button><button type="button" class="tf-settings-row" data-action="settingsPanel" data-panel="about"><span class="tf-settings-rowicon"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg></span><span class="tf-settings-rowcopy"><strong>About</strong><small>App version and privacy</small></span><span class="tf-settings-rowarrow">›</span></button></section><section id="tfSettingsPanel" class="tf-settings-panel" hidden></section></section>`;if(tab==='settings')return `<section class="tf-more-screen" aria-label="More menu"><nav class="tf-more-menu" aria-label="Library"><button class="tf-more-item" type="button" data-tab="library"><span class="tf-more-itemicon" aria-hidden="true"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3zM3 11h18"/></svg></span><span>Library</span><span class="tf-more-chevron" aria-hidden="true">›</span></button></nav>${window.TradeFlowGrowth?.moreQuickLinks(d)||""}<nav class="tf-more-menu" aria-label="Business navigation">${[['opportunities','Opportunities'],['customers','Customers'],['quotes','Quotations'],['jobs','Jobs'],['tasks','Tasks'],['calendar','Calendar'],['suppliers','Suppliers'],['invoices','Invoices'],['profitability','Job Costing'],['marketing','Marketing Studio'],['research','Research Briefs'],['dispatch','Crew & Dispatch'],['integrations','Integrations'],['growth','Target Customers & Buyer Personas'],['ai','TradeFlow AI'],['preferences','Settings'],['help','Help & Support']].map(([target,label],i)=>`${i===5?'<div class="tf-more-divider"></div>':''}<button class="tf-more-item" type="button" ${target==='help'?'data-action="moreHelp"':`data-tab="${target}"`}><span class="tf-more-itemicon" aria-hidden="true">${target==='ai'?tfAIIcon:target==='calendar'?tfRecordIcon('calendar',23):(target==='dispatch'||target==='suppliers'?tfRecordIcon('jobs',23):(tfMoreIcons[target]||tfMoreIcons.quotes))}</span><span>${label}</span><span class="tf-more-chevron" aria-hidden="true">›</span></button>`).join('')}</nav><div id="tfMoreHelp" class="tf-more-subpanel" hidden><h3>Help & Support</h3><p>Records are stored locally. Map tiles and address lookup require internet. Research signals must be verified before outreach.</p></div></section>`;if(tab==='legacySettings')return `<div class="panel"><h3>Backup and restore</h3><p class="muted">Export all records as a JSON file. Store it somewhere secure. Restoring replaces all records on this device.</p><div class="toolbar"><button class="btn" data-action="export">Export backup</button><label class="btn secondary" for="restoreFile">Restore backup</label><input id="restoreFile" type="file" accept="application/json,.json" hidden></div><div class="notice warning">No account, cloud sync or encryption at rest is provided. Anyone with access to this browser profile may be able to access its records. Use fictional records for your initial demo.</div></div>`;
return tfRecordHubView(d)}

/* Compact record command cards and context panels, shared across the four record types. */
let tfRecordDetailId=null;
let tfCalendarLinkedReturn=false;
/* Keep the list exactly where the user left it when viewing a record.
   The record ID and on-screen offset provide a fallback if the list changes. */
function tfRecordListTarget(recordId){
 const buttons=document.querySelectorAll('[data-action="tfRecordOpen"][data-id]');
 for(const button of buttons)if(button.dataset.id===recordId)return button;
 return null;
}
function tfRememberRecordList(recordId){
 const main=document.querySelector('.main'),content=document.querySelector('.content');
 const card=tfRecordListTarget(recordId)?.closest('.tf-record-card');
 return {
  tab,query,recordId,
  windowY:window.scrollY||window.pageYOffset||document.scrollingElement?.scrollTop||0,
  mainY:main?.scrollTop||0,
  contentY:content?.scrollTop||0,
  cardTop:card?.getBoundingClientRect().top??null
 };
}
function tfReturnToRecordList(context){
 if(!context||context.tab!==tab||tfRecordDetailId)return;
 const main=document.querySelector('.main'),content=document.querySelector('.content');
 window.scrollTo(0,context.windowY);
 if(main)main.scrollTop=context.mainY;
 if(content)content.scrollTop=context.contentY;
 const button=tfRecordListTarget(context.recordId);
 const card=button?.closest('.tf-record-card');
 if(card&&Number.isFinite(context.cardTop)){
  const difference=card.getBoundingClientRect().top-context.cardTop;
  if(Math.abs(difference)>3){
   if(context.contentY>0&&content?.scrollHeight>content?.clientHeight)content.scrollTop+=difference;
   else if(context.mainY>0&&main?.scrollHeight>main?.clientHeight)main.scrollTop+=difference;
   else if(document.scrollingElement?.scrollHeight>window.innerHeight)window.scrollBy(0,difference);
  }
 }
 // Restore keyboard and screen-reader context without making the browser scroll.
 try{button?.focus({preventScroll:true})}catch(e){}
}

const tfRecordTypes={
 customers:{label:'Customers',singular:'customer',hint:'Manage your customers and contacts.',icon:'customers'},
 quotes:{label:'Quotations',singular:'quotation',hint:'Estimates, proposals and approvals.',icon:'quotes'},
 jobs:{label:'Jobs',singular:'job',hint:'Track projects from scheduling to completion.',icon:'jobs'},
 tasks:{label:'Tasks',singular:'task',hint:'Your next actions in one place.',icon:'tasks'}
};
const tfRecordIcons={
 camera:'<path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/>',
 customers:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 4 5v1"/>',
 quotes:'<path d="M5 3h10l4 4v14H5zM15 3v5h4M9 12h6M9 16h6"/>',
 jobs:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M9 7V4h6v3M3 12h18M11 12v2h2v-2"/>',
 tasks:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',
 phone:'<path d="M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2C9 21 3 15 3 5a2 2 0 0 1 2-2"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
 map:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',
 note:'<path d="M5 3h10l4 4v14H5zM15 3v5h4M9 13h6M9 17h4"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
 arrow:'<path d="m9 5 7 7-7 7"/>',
 edit:'<path d="m15 5 4 4M4 20l5-1 11-11a2.12 2.12 0 0 0-4-4L5 15z"/>',
 plus:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
 check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 cash:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>'
};
function tfRecordIcon(key,size=22){return '<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(tfRecordIcons[key]||tfRecordIcons.note)+'</svg>'}
const tfRecordStatus=(x,type)=>type==='customers'?'':String(x.status||'').trim();
const dummySafeCustomerName=(id,customers)=>customers.find(x=>x.id===id)?.name||'';
const tfRecordPerson=(d,id)=>d.customers.find(c=>c.id===id)?.name||'Unlinked customer';
const tfRecordDay=v=>{if(!v)return '';const date=new Date(String(v).slice(0,10)+'T12:00:00');return Number.isNaN(date.getTime())?String(v):date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})};
function tfRecordCompact(d,x,type){
 const title=type==='customers'?x.name:x.title||('Untitled '+tfRecordTypes[type].singular);
 const who=type==='customers'?[x.phone,x.email].filter(Boolean).join(' · '):tfRecordPerson(d,x.customerId);
 const date=type==='jobs'?x.date:type==='quotes'?x.sentDate:x.due;
 const amount=type==='quotes'&&x.amount!==undefined?euro(x.amount):'';
 const status=tfRecordStatus(x,type);
 const extra=[type==='customers'?(x.address||x.company||''):date?tfRecordDay(date):'',amount].filter(Boolean).join(' · ');
 const info=[who,extra].filter(Boolean).join(' · ');
 return '<article class="tf-record-card"><span class="tf-record-card-icon" aria-hidden="true">'+tfRecordIcon(type,25)+'</span><button class="tf-record-card-main" type="button" data-action="tfRecordOpen" data-id="'+esc(x.id)+'" aria-label="View '+esc(title)+'"><strong>'+esc(title)+'</strong><small>'+esc(info||'View details')+'</small>'+(status?'<span class="tf-record-card-pill '+(['Completed','Accepted','Done'].includes(status)?'tf-status-good':'')+'">'+esc(status)+'</span>':'')+'</button><button class="tf-record-card-quick" type="button" data-action="tfRecordEdit" data-id="'+esc(x.id)+'" aria-label="Edit '+esc(title)+'">'+tfRecordIcon('edit',19)+'</button><button class="tf-record-card-chevron" type="button" data-action="tfRecordOpen" data-id="'+esc(x.id)+'" aria-label="View details">'+tfRecordIcon('arrow',20)+'</button></article>';
}
function tfRecordInfoRow(icon,label,value,action=''){
 if(!value)return '';
 return '<div class="tf-record-info-row"><span class="tf-record-info-symbol">'+tfRecordIcon(icon,21)+'</span><div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>'+(action?'<span class="tf-record-info-tail">'+tfRecordIcon('arrow',17)+'</span>':'')+'</div>';
}
function tfCustomerContactForm(d,customerId){
 const quotes=(d.quotes||[]).filter(q=>q.customerId===customerId);
 return '<section class="tf-record-dossier-box"><h3>Log a customer interaction</h3>'+
 '<form id="tfContactLogForm" data-customer-id="'+esc(customerId)+'">'+
 '<label>Contact method<select name="method" required>'+['Phone','Email','Meeting','Site visit','Other'].map(x=>'<option value="'+x+'">'+x+'</option>').join('')+'</select></label>'+
 '<label>Related quotation (optional)<select name="quoteId"><option value="">Customer-level contact</option>'+
 quotes.map(q=>'<option value="'+esc(q.id)+'">'+esc(String(q.title||q.id).slice(0,100))+'</option>').join('')+'</select></label>'+
 '<label>Outcome / notes<textarea name="notes" required maxlength="1000" rows="2" placeholder="What happened and what is the agreed next step?"></textarea></label>'+
 '<button type="submit" class="tf-record-dossier-primary">Save contact log</button>'+
 '</form><small>Manual record only. TradeFlow cannot verify that a call or email was delivered.</small></section>';
}
function tfCustomerRecordedEconomics(d,customerId){
 const amountValue=value=>{
  if(typeof value==='number')return Number.isFinite(value)&&value>=0?value:null;
  if(typeof value==='string'&&value.length<=20&&/^\d+(?:\.\d{1,2})?$/.test(value.trim())){const n=Number(value);return Number.isFinite(n)&&n>=0?n:null}
  return null;
 };
 const jobs=(d.jobs||[]).filter(x=>x.customerId===customerId);
 const ids=new Set(jobs.map(x=>x.id));
 const invoices=(d.invoices||[]).filter(x=>x.customerId===customerId&&x.status!=='Void');
 const invoiceIds=new Set(invoices.map(x=>x.id));
 const invoiceCustomer=new Map((d.invoices||[]).map(i=>[i.id,i.customerId]));
 const candidatePayments=(d.payments||[]).filter(p=>p.invoiceId?invoiceIds.has(p.invoiceId):
   p.customerId===customerId||ids.has(p.jobId||p.relatedId));
 const candidateCosts=(d.jobCosts||[]).filter(x=>ids.has(x.jobId)&&x.type==='actual');
 const candidateExpenses=(d.expenses||[]).filter(x=>ids.has(x.jobId||x.relatedId));
 const validCurrency=x=>!x.currency||x.currency==='USD';
 const payments=candidatePayments.filter(p=>validCurrency(p)&&amountValue(p.amount)!==null&&
   (!p.customerId||p.customerId===customerId)&&(!p.invoiceId||invoiceCustomer.get(p.invoiceId)===customerId));
 const costs=candidateCosts.filter(x=>validCurrency(x)&&amountValue(x.amount)!==null);
 const expenses=candidateExpenses.filter(x=>validCurrency(x)&&amountValue(x.amount)!==null);
 const sum=rows=>rows.reduce((n,x)=>n+(amountValue(x.amount)??0),0);
 const received=sum(payments),recordedCosts=sum(costs)+sum(expenses);
 const excludedCount=candidatePayments.length-payments.length+candidateCosts.length-costs.length+candidateExpenses.length-expenses.length;
 const orphanInvoicePayments=(d.payments||[]).some(p=>p.customerId===customerId&&p.invoiceId&&
   !invoiceIds.has(p.invoiceId));
 const linkedJobsWithoutCost=jobs.some(j=>!costs.some(x=>x.jobId===j.id)&&!expenses.some(x=>x.jobId===j.id||x.relatedId===j.id));
 const amount=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
 const hasPotentialGaps=excludedCount>0||orphanInvoicePayments||linkedJobsWithoutCost||jobs.length>0&&(!costs.length&&!expenses.length);
 return '<section class="tf-record-dossier-box"><h3>Recorded customer economics</h3>'+
  '<p>Received payments: <strong>'+esc(amount(received))+'</strong></p>'+
  '<p>Linked recorded job costs and expenses: <strong>'+esc(amount(recordedCosts))+'</strong></p>'+
  '<p>Recorded cash contribution before unrecorded expenses: <strong>'+esc(amount(received-recordedCosts))+'</strong></p>'+
  '<small>'+(hasPotentialGaps?'Records may be incomplete or inconsistent. ':'')+
  (excludedCount?' '+excludedCount+' linked non-USD, invalid, or mismatched record(s) excluded. ':'')+
  'These are locally recorded USD figures, not verified bank receipts, final profit, or customer lifetime value. Unlinked overhead and supplier commitments are excluded.</small></section>';
}
function tfCustomerRelationshipHistory(d,customerId){
 const rows=[];
 const append=(kind,items,dateField,label)=>{for(const x of items||[]){
  if(x.customerId!==customerId)continue;
  const when=String(x[dateField]||x.updatedAt||x.createdAt||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(when))continue;
  rows.push({kind,date:when,label:String(label(x)||'').slice(0,120)});
 }};
 append('Quotation',d.quotes,'sentDate',x=>(x.title||'Quotation')+' · '+(x.status||'Draft'));
 append('Job',d.jobs,'date',x=>(x.title||'Job')+' · '+(x.status||'Planned'));
 append('Invoice',d.invoices,'issuedDate',x=>(x.reference||'Invoice')+' · '+(x.status||'Draft'));
 append('Task',d.tasks,'due',x=>(x.title||'Task')+' · '+(x.status||'Open'));
 for(const e of d.events||[]){
  if(e.kind!=='customer_contact'||e.customerId!==customerId)continue;
  const when=String(e.date||'').slice(0,10);
  if(/^\d{4}-\d{2}-\d{2}$/.test(when))rows.push({kind:'Contact · '+String(e.method||'Other').slice(0,30),date:when,label:String(e.notes||'Contact recorded').slice(0,140)});
 }
 const invoiceIds=new Set((d.invoices||[]).filter(x=>x.customerId===customerId).map(x=>x.id));
 const jobIds=new Set((d.jobs||[]).filter(x=>x.customerId===customerId).map(x=>x.id));
 for(const payment of d.payments||[]){
  if(payment.customerId!==customerId&&!invoiceIds.has(payment.invoiceId)&&!jobIds.has(payment.jobId))continue;
  const when=String(payment.date||'').slice(0,10);
  if(/^\d{4}-\d{2}-\d{2}$/.test(when))rows.push({kind:'Payment',date:when,label:'Recorded receipt · '+euro(payment.amount)});
 }
 rows.sort((a,b)=>b.date.localeCompare(a.date)||a.kind.localeCompare(b.kind));
 return '<section class="tf-record-dossier-box"><h3>Recorded relationship history</h3>'+
 (rows.length?rows.slice(0,12).map(x=>'<p><strong>'+esc(x.date)+' · '+esc(x.kind)+'</strong> — '+esc(x.label)+'</p>').join(''):'<p>No dated linked activity has been recorded yet.</p>')+
 '<small>Drawn from local TradeFlow records only; calls, emails and external systems are not synchronized.</small></section>';
}
function tfRecordDetailView(d,record,type){
 const title=type==='customers'?record.name:record.title||'Untitled';
 const status=tfRecordStatus(record,type);
 let sections='';
 if(type==='customers'){
  const phone=String(record.phone||'').trim(),email=String(record.email||'').trim(),address=String(record.address||'').trim();
  const actions=[
   phone?'<a href="tel:'+encodeURIComponent(phone)+'">'+tfRecordIcon('phone',23)+'<span>Call</span></a>':'',
   email?'<a href="mailto:'+encodeURIComponent(email)+'">'+tfRecordIcon('mail',23)+'<span>Email</span></a>':'',
   address?'<a href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(address)+'" target="_blank" rel="noopener noreferrer">'+tfRecordIcon('map',23)+'<span>Directions</span></a>':''
  ].filter(Boolean);
  sections+=(actions.length?'<div class="tf-record-contact-actions">'+actions.join('')+'</div>':'');
  sections+='<section class="tf-record-dossier-box">'+tfRecordInfoRow('phone','Phone',phone)+tfRecordInfoRow('mail','Email',email)+tfRecordInfoRow('map','Address',address)+tfRecordInfoRow('jobs','Company',record.company||'')+'</section>';
  if(record.notes)sections+='<section class="tf-record-dossier-box"><h3>'+tfRecordIcon('note',20)+' Notes</h3><p>'+esc(record.notes)+'</p></section>';
  const related=[['jobs','Jobs',d.jobs.filter(x=>x.customerId===record.id).length],['quotes','Quotations',d.quotes.filter(x=>x.customerId===record.id).length],['tasks','Tasks',d.tasks.filter(x=>x.customerId===record.id).length],['payments','Payments',d.payments.filter(x=>x.customerId===record.id).length]];
  sections+='<section class="tf-record-dossier-box"><h3>Linked records</h3><div class="tf-record-related-grid">'+related.map(([key,name,count])=>'<button type="button" data-action="tfRecordRelated" data-type="'+key+'" data-id="'+esc(record.id)+'">'+tfRecordIcon(key==='payments'?'cash':key,19)+'<span>'+name+'<small>'+count+' records</small></span>'+tfRecordIcon('arrow',17)+'</button>').join('')+'</div></section>';
  sections+=tfCustomerRelationshipHistory(d,record.id);
  sections+=tfCustomerRecordedEconomics(d,record.id);
  sections+=tfCustomerContactForm(d,record.id);
 }else{
  const person=record.customerId?tfRecordPerson(d,record.customerId):'';
  sections+='<section class="tf-record-dossier-box">'+tfRecordInfoRow('customers','Customer',person)+tfRecordInfoRow('jobs','Trade',record.category||'')+(type==='quotes'?tfRecordInfoRow('cash','Estimated value',euro(record.amount))+tfRecordInfoRow('calendar','Date sent',tfRecordDay(record.sentDate)):type==='jobs'?tfRecordInfoRow('calendar','Scheduled',tfRecordDay(record.date)):tfRecordInfoRow('calendar','Due date',tfRecordDay(record.due)))+tfRecordInfoRow('check','Status',status||'Not set')+'</section>';
  if(type==='quotes')sections+='<button type="button" class="tf-record-dossier-primary" data-action="tfQuoteReuse" data-id="'+esc(record.id)+'">Use as a starting point for a new quote</button>';
  if(type==='quotes'&&record.status==='Accepted'&&!d.jobs.some(j=>j.quoteId===record.id))
   sections+='<button type="button" class="tf-record-dossier-primary" data-convert="'+esc(record.id)+'">Create job from accepted quote</button>';
  if(type==='tasks'&&record.status!=='Done')sections+='<button type="button" class="tf-record-dossier-primary" data-action="tfRecordComplete" data-id="'+esc(record.id)+'">Mark task complete</button>';
  if(type==='jobs'&&record.status!=='Completed')sections+='<button type="button" class="tf-record-dossier-primary" data-action="tfRecordComplete" data-id="'+esc(record.id)+'">Mark job completed</button>';
 }
 if(type==='jobs'&&record.status==='Completed'&&!(d.invoices||[]).some(i=>i.jobId===record.id&&i.status!=='Void'))sections+='<button type="button" class="tf-record-dossier-primary" data-action="tfJobInvoiceDraft" data-id="'+esc(record.id)+'">Prepare invoice draft for completed job</button>';
 if(type==='jobs')sections+=window.TradeFlowJobForms?.panel(record)||'';
 sections+=tfRecordPhotoSection(record,type);if(!tfSafeImage(record.photoData))sections+='<button type="button" class="tf-record-attach-btn" data-action="tfPhotoStart" data-target="'+type+'" data-id="'+esc(record.id)+'">'+tfRecordIcon('camera',19)+' Add photo from camera or gallery</button>';
 return '<section class="tf-record-dossier" aria-label="'+esc(type)+' details"><header class="tf-record-dossier-head"><button type="button" data-action="tfRecordClose" aria-label="Back to '+(tfCalendarLinkedReturn?'Calendar':esc(tfRecordTypes[type].label))+'">‹ <span>'+(tfCalendarLinkedReturn?'Calendar':esc(tfRecordTypes[type].label))+'</span></button></header><div class="tf-record-dossier-identity"><span class="tf-record-card-icon">'+tfRecordIcon(type,28)+'</span><div><h2>'+esc(title)+'</h2>'+((record.category&&type!=='customers')||status?'<div class="tf-record-dossier-badges">'+(record.category&&type!=='customers'?'<span>'+esc(record.category)+'</span>':'')+(status?'<span>'+esc(status)+'</span>':'')+'</div>':'')+'</div></div>'+sections+'<div class="tf-record-dossier-footer"><button type="button" class="tf-record-dossier-primary" data-action="tfRecordEdit" data-id="'+esc(record.id)+'">'+tfRecordIcon('edit',20)+' Edit '+esc(tfRecordTypes[type].singular)+'</button><button type="button" class="tf-record-dossier-delete" data-delete="'+esc(record.id)+'">Delete</button></div></section>';
}
function tfRecordHubView(d){
 const type=tab,spec=tfRecordTypes[type];if(!spec)return '';
 const records=d[type]||[],filtered=tfPilotFilter?.workspace===type&&window.TradeFlowCommands?window.TradeFlowCommands.filterRecords(type,tfPilotFilter.filter,d,{today:tfPilotContext().today}):records,found=filtered.filter(x=>[...Object.entries(x).filter(([key])=>key!=='photoData').map(([,value])=>value),tfRecordPerson(d,x.customerId)].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 const detail=tfRecordDetailId&&records.find(x=>x.id===tfRecordDetailId);
 if(detail)return tfRecordDetailView(d,detail,type);
 const heading='<header class="tf-record-hub-header"><h1>'+esc(spec.label)+' <span>'+records.length+'</span></h1><p>'+spec.hint+'</p></header>';
 const search='<label class="tf-record-search">'+'<span class="tf-record-search-glass" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></span>'+ '<input id="search" type="search" placeholder="Search '+esc(spec.label.toLowerCase())+'..." value="'+esc(query)+'" aria-label="Search '+esc(spec.label)+'"></label>';
 const actions='<div class="tf-record-hub-actions">'+'<button class="tf-record-create" type="button" data-action="new">+ New '+esc(spec.singular)+'</button><button class="tf-record-import" type="button" data-action="tfImportStart" data-target="'+type+'">'+tfRecordIcon('quotes',18)+' Import CSV</button><button class="tf-record-photo" type="button" data-action="tfPhotoStart" data-target="'+type+'">'+tfPhotoIcon()+' Photo</button></div>';
 return '<section class="tf-record-hub">'+heading+search+actions+'<div class="tf-record-list">'+(found.length?found.map(x=>tfRecordCompact(d,x,type)).join(''):'<div class="tf-record-empty">No '+esc(spec.label.toLowerCase())+' found. Add your first '+esc(spec.singular)+'.</div>')+'</div></section>';
}
function portfolio(d){
const cats=[...new Set([...prefs.categories,...d.quotes.map(x=>x.category||'Other'),...d.expenses.map(x=>x.category||'Other')])];
const stats=cats.map(c=>({c,quotes:d.quotes.filter(x=>(x.category||'Other')===c),expenses:d.expenses.filter(x=>(x.category||'Other')===c)}));
return `<section class="panel"><div class="panelhead"><h3>Trade performance</h3><span class="muted sub">By category</span></div><div class="tradegrid">${stats.map(x=>{const quoted=x.quotes.reduce((a,q)=>a+Number(q.amount||0),0),accepted=x.quotes.filter(q=>q.status==='Accepted').reduce((a,q)=>a+Number(q.amount||0),0),cost=x.expenses.reduce((a,e)=>a+Number(e.amount||0),0);return `<div class="tradebox"><div class="tradehead"><strong>${esc(x.c)}</strong><span>↗</span></div><div class="tradeamount">${euro(quoted)}</div><span class="muted sub">${x.quotes.length} quotes</span><div class="tradefoot"><span>Accepted <b>${euro(accepted)}</b></span><span>Expenses <b>${euro(cost)}</b></span></div></div>`}).join('')}</div><p class="muted sub">Quoted and accepted amounts are not payments received. Expenses are manually entered.</p></section>`}
function formModal(d){
 const obj=modal.id?d[tab].find(x=>x.id===modal.id)||{}:{...modal.draftDefaults,customerId:modal.draftDefaults?.customerId||modal.prefillCustomerId||''};
 const customers=d.customers.map(c=>'<option value="'+esc(c.id)+'" '+(obj.customerId===c.id?'selected':'')+'>'+esc(c.name)+'</option>').join('');
 const defs={
 customers:[['name','Customer name','text',true],['phone','Phone','tel',!modal.id],['email','Email','email'],['address','Address','text'],['company','Company','text'],['notes','Notes','textarea']],
 quotes:[['customerId','Customer','customer',true],['title','Description','text',true],['category','Trade category','category',true],['amount','Estimated value ($)','number',true],['status','Status','select:Draft,Sent,Accepted,Declined'],['sentDate','Date sent','date'],['followup_date','Next follow-up','date']],
 jobs:[['customerId','Customer','customer',true],['title','Job description','text',true],['category','Trade category','category',true],['status','Status','select:Planned,In Progress,Completed'],['date','Scheduled date','date'],['materialsStatus','Material readiness','select:Unknown,Ready,Not Ready'],['materialsNotes','Materials / missing items','textarea'],['closeoutStatus','Closeout documentation','select:Unknown,Pending,Complete,Waived'],['closeoutEvidence','Closeout evidence / waiver reference','textarea']],
 tasks:[['title','Task title','text',true],['customerId','Customer','customer'],['due','Due date','date',true],['status','Status','select:Open,Done']],
 expenses:[['title','Expense description','text',true],['category','Trade category','category',true],['amount','Amount ($)','number',true],['date','Date','date',true]]
 }[tab];
 const glyphs={
 name:'<circle cx="12" cy="8" r="3.2"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
 phone:'<path d="M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2C9 21 3 15 3 5a2 2 0 0 1 2-2"/>',
 email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
 address:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
 customerId:'<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
 title:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
 category:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M9 7V4h6v3M3 12h18M11 12v2h2v-2"/>',
 amount:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v5c0 2 16 2 16 0V5M4 10v5c0 2 16 2 16 0v-5M4 15v4c0 2 16 2 16 0v-4"/>',
 status:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
 date:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3v3H8z"/>',
 sentDate:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3v3H8z"/>',
 due:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3v3H8z"/>'
 };
 const svg=key=>'<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(glyphs[key]||glyphs.title)+'</svg>';
 const titleNames={customers:'customer',quotes:'quote',jobs:'job',tasks:'task',expenses:'expense'};
 const placeholders={name:'Enter customer name...',phone:'Enter phone number...',email:'Enter email address...',address:'Enter address...',title:tab==='tasks'?'Enter task title...':tab==='jobs'?'Enter job description...':'Enter description...',amount:'Enter estimated value...'};
 const fields=defs.map(([key,label,type,required])=>{
  const value=obj[key]??(type==='date'&&key==='due'?today():'');
  let control='';
  if(type==='category')control='<select class="input" name="'+key+'">'+[...new Set([obj[key],...tfTradeChoices()])].filter(Boolean).map(v=>'<option value="'+esc(v)+'" '+(obj[key]===v?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select>';
  else if(type==='customer')control='<select class="input" name="'+key+'" '+(required?'required':'')+'><option value="">Choose customer</option>'+customers+'</select>';
  else if(type.startsWith('select:'))control='<select class="input" name="'+key+'">'+type.slice(7).split(',').map(v=>'<option value="'+esc(v)+'" '+(obj[key]===v?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select>';
  else if(type==='textarea')control='<textarea class="input" name="'+key+'" rows="3" placeholder="Add notes...">'+esc(value)+'</textarea>';
  else control='<input class="input" name="'+key+'" type="'+type+'" '+(required?'required':'')+' '+(type==='number'?'min="0" step="0.01"':'')+' value="'+esc(value)+'" '+(type!=='date'?'placeholder="'+esc(placeholders[key]||'')+'"':'')+'>';
  return '<label class="field tf-record-field"><span class="tf-record-label">'+esc(label)+'</span><span class="tf-record-control '+(type==='date'?'tf-record-date':'')+'"><span class="tf-record-icon">'+svg(key)+'</span>'+control+'</span></label>';
 }).join('');
 return '<div class="dialog tf-record-dialog"><form class="modal tf-record-modal" id="recordForm"><div class="modalhead tf-record-modalhead"><h2>'+(modal.id?'Edit':'New')+' '+titleNames[tab]+'</h2><button class="tf-record-close" type="button" data-action="close" aria-label="Close form"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6 18 18M18 6 6 18"/></svg></button></div><div class="formgrid tf-record-grid">'+fields+'</div>'+(tfSafeImage(tfPhotoPending?.target===tab?tfPhotoPending.dataUrl:obj.photoData)?'<div class="tf-photo-form-preview"><strong>Attached photo</strong><img src="'+tfSafeImage(tfPhotoPending?.target===tab?tfPhotoPending.dataUrl:obj.photoData)+'" alt="Photo ready to save with this record"><small>Saved with the record after you submit.</small></div>':'')+'<div class="actions tf-record-actions"><button type="button" class="tf-record-cancel" data-action="close">Cancel</button><button class="tf-record-save" type="submit">Save record</button></div></form></div>';
}
function tfReusableQuoteFields(source){
 const value=Number(source?.amount);
 return {
  title:String(source?.title||'').slice(0,160),
  category:String(source?.category||'').slice(0,90),
  amount:source?.amount!=null&&source?.amount!==''&&Number.isFinite(value)&&value>=0?String(value):'',
  customerId:'',status:'Draft',sentDate:'',followup_date:''
 };
}
async function tfSyncQuoteFollowUp(id,quote,previous={}){
 const tasks=(await all('tasks')).filter(t=>t.quoteId===id);
 const automatic=tasks.find(t=>t.followupAuto===true||String(t.title||'').startsWith('Follow up quote: '));
 const validDate=x=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(x||''))return false;const parsed=new Date(x+'T12:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===x};
 const terminal=['Accepted','Declined'].includes(quote.status);
 if(terminal&&automatic&&automatic.status!=='Done'){
  await put('tasks',{...automatic,status:'Done',completedReason:'quotation_closed',updatedAt:new Date().toISOString()});return;
 }
 if(quote.status!=='Sent')return;
 const due=validDate(quote.followup_date)?quote.followup_date:
   validDate(previous.followup_date)?previous.followup_date:
   (()=>{const x=new Date();x.setDate(x.getDate()+3);return window.TradeFlowCommands?.dateText?.(x)||x.toISOString().slice(0,10)})();
 if(!automatic){
  if(tasks.some(t=>!['Done','Cancelled'].includes(t.status)))return;
  await put('tasks',{id:uid(),title:'Follow up quote: '+String(quote.title||'Quotation').slice(0,120),customerId:quote.customerId,
    due,status:'Open',quoteId:id,followupAuto:true,createdAt:new Date().toISOString()});return;
 }
 if(['Done','Cancelled'].includes(automatic.status))return;
 const updated={...automatic,title:'Follow up quote: '+String(quote.title||'Quotation').slice(0,120),customerId:quote.customerId,
  due:validDate(quote.followup_date)?due:automatic.due,updatedAt:new Date().toISOString()};
 if(updated.due!==automatic.due||updated.title!==automatic.title||updated.customerId!==automatic.customerId)await put('tasks',updated);
}
async function saveForm(form){const f={...modal.draftDefaults,...Object.fromEntries(new FormData(form))};if(modal.commandDraft){try{window.TradeFlowCommands.validateDraft({...modal.commandDraft,fields:f},await tfPilotSnapshot(),tfPilotContext())}catch(error){alert('Draft needs review: '+error.message);return}}if(tab==='customers'){if(!modal.id&&!String(f.phone||'').trim()){alert('Customer phone number is required.');return}f.email=f.email.trim().toLowerCase();const existing=(await all('customers')).find(c=>c.id!==modal.id&&((f.email&&c.email===f.email)||(f.phone&&c.phone===f.phone)));if(existing&&!confirm('A customer already has this email or phone. Save anyway?'))return}if(tab==='jobs'&&f.closeoutStatus==='Complete'&&String(f.closeoutEvidence||'').trim().length<12){alert('Document the actual closeout evidence before marking documentation complete.');return}
if(tab==='jobs'&&f.closeoutStatus==='Waived'&&String(f.closeoutEvidence||'').trim().length<12){alert('Record who waived closeout documentation and why.');return}
const id=modal.id||uid(),old=modal.id?await get(tab,id):{};if(tfPhotoPending?.target===tab)f.photoData=tfPhotoPending.dataUrl;await put(tab,{...old,...f,id,updatedAt:new Date().toISOString()});tfPhotoPending=null;await event(`${modal.id?'Updated':'Created'} ${tab.slice(0,-1)}: ${f.name||f.title}`);if(tab==='quotes')await tfSyncQuoteFollowUp(id,f,old);modal=null;query='';notify('Record saved')}
document.addEventListener('submit',async function(e){
 if(e.target?.id!=='tfContactLogForm')return;
 e.preventDefault();e.stopImmediatePropagation();
 const customerId=String(e.target.dataset.customerId||'');
 const customer=await get('customers',customerId);
 if(!customer){alert('Customer is no longer available. Refresh before saving.');return}
 const values=new FormData(e.target),method=String(values.get('method')||''),
  quoteId=String(values.get('quoteId')||''),notes=String(values.get('notes')||'').trim();
 if(!['Phone','Email','Meeting','Site visit','Other'].includes(method)||notes.length<3||notes.length>1000){alert('Choose a contact method and enter the actual outcome.');return}
 const quote=quoteId?await get('quotes',quoteId):null;
 if(quoteId&&(!quote||quote.customerId!==customerId)){alert('Related quotation no longer matches this customer.');return}
 const timestamp=new Date().toISOString();
 await put('events',{id:uid(),kind:'customer_contact',text:'Customer contact recorded',customerId,
  quoteId,method,notes,date:timestamp});
 if(quote){await put('quotes',{...quote,lastContactAt:timestamp,updatedAt:timestamp})}
 await notify('Contact logged against customer record');
});
function tfDownloadBackup(data){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=`tradeflow-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function exportData(){try{tfDownloadBackup(await window.TradeFlowLocalRecovery.createBackup(db,STORES))}catch(error){alert('Backup failed: '+error.message)}}
async function restore(file){try{
 if(file.size>64*1024*1024)throw Error('Backup exceeds 64 MB');
 const snapshot=JSON.parse(await file.text());
 const result=await window.TradeFlowLocalRecovery.restoreBackup({db,stores:STORES,snapshot,
  approve:plan=>confirm(`Restore preview: ${plan.creates} new, ${plan.updates} changed, ${plan.deletes} removed, ${plan.unchanged} unchanged.\n${plan.checksumVerified?'Checksum verified.':'Legacy backup: no checksum available.'} ${plan.missingReferences.length} missing linked references.\nReplace local records? A pre-restore recovery copy will be retained on this device.`),
  saveRecovery:before=>window.TradeFlowLocalRecovery.saveRecovery(indexedDB,before)});
 if(result.status==='restored')await notify('Backup restored. Previous records are available as a recovery backup.');
}catch(error){alert('Restore failed: '+error.message)}}
async function tfDownloadRecovery(){try{const backup=await window.TradeFlowLocalRecovery.latestRecovery(indexedDB);if(!backup){alert('No pre-restore recovery copy exists on this device.');return}tfDownloadBackup(backup)}catch(error){alert('Recovery backup failed: '+error.message)}}
document.addEventListener('click',e=>{if(e.target.closest?.('[data-action="downloadRecovery"]')){e.preventDefault();void tfDownloadRecovery()}});
document.addEventListener('click',async e=>{const el=e.target.closest('[data-tab],[data-action],[data-edit],[data-delete],[data-convert]');if(!el)return;
 if(el.dataset.action==='loadAustinElectricalStarter'){
  const data={opportunities:await all('opportunities')};
  const added=await tfSeedAustinStarter(data,prefs,true);
  await render();
  notify(added?added+' Austin electrical research leads added': 'Austin electrical starter leads are already saved');
  return;
 }
 if(el.dataset.action==='tfTradeChoose'){
  const chosen=String(el.dataset.trade||'');
  if(!tfTradeCatalog.some(([name])=>name===chosen))return;
  tfOnboardingTrade=chosen;
  const root=document.querySelector('.tf-setup-screen');if(!root)return;
  for(const button of root.querySelectorAll('[data-action="tfTradeChoose"]')){
   const active=button.dataset.trade===chosen;
   button.classList.toggle('is-selected',active);
   button.setAttribute('aria-pressed',String(active));
  }
  const hidden=root.querySelector('input[name="primaryTrade"]');
  if(hidden)hidden.value=chosen;
  const other=root.querySelector('#tfSetupOther');
  if(other)other.hidden=chosen!=='Other';
  if(chosen==='Other')root.querySelector('#tfSetupOtherName')?.focus();
  return;
 }

 if(el.dataset.action==='tfPhotoStart'){
  tfFinanceMenu='';const target=el.dataset.target;
  if(!tfPhotoTargetTitle[target])return;
  if(['jobs','quotes'].includes(target)&&!(await all('customers')).length){alert('Add or import a customer before creating a '+tfPhotoTargetTitle[target].toLowerCase()+'.');return}
  tfCaptureStart(target,el.dataset.id||'');await render();return;
 }
 if(el.dataset.action==='tfPhotoClose'){tfCapture=null;await render();return}
 if(el.dataset.action==='tfPhotoContinue'){
  if(tfCaptureBusy||!tfCapture||!tfSafeImage(tfCapture.dataUrl))return;
  const {target,recordId,dataUrl}=tfCapture;
  if(recordId){
   const old=await get(target,recordId);
   if(!old){alert('The record is no longer available.');return}
   try{await put(target,{...old,photoData:dataUrl,photoUpdatedAt:new Date().toISOString(),updatedAt:new Date().toISOString()})}
   catch(err){alert('Could not save photo. Storage may be full: '+err.message);return}
   tfCapture=null;notify('Photo saved with record');return;
  }
  tfPhotoPending={target,dataUrl};
  tfCapture=null;modal=null;tfRecordDetailId=null;
  if(['payments','expenses'].includes(target)){
   tab='expenses';tfFinanceScreen=target==='payments'?'add-income':'add-expense';tfFinanceEdit=null;tfFinanceDraft=null;
  }else{tab=target;modal={}}
  await render();document.querySelector('.content')?.scrollTo(0,0);return;
 }
 if(el.dataset.action==='tfPhotoRemove'){
  const target=el.dataset.target,id=el.dataset.id;
  if(!tfPhotoTargetTitle[target]||!id||!confirm('Remove the saved photo from this record?'))return;
  const old=await get(target,id);if(!old)return;
  const copy={...old};delete copy.photoData;delete copy.photoUpdatedAt;copy.updatedAt=new Date().toISOString();
  try{await put(target,copy);notify('Photo removed')}catch(err){alert('Could not remove photo: '+err.message)}
  return;
 }
 if(el.dataset.action==='tfAiToggle'){
  tfAiCancelHold();
  tfAiPanelOpen=false;
  tfUiHaptic('selection');
  if(window.TradeFlowVoice?.startListening)window.TradeFlowVoice.startListening();
  else notify('Voice assistant is loading. Please refresh this preview.');
  return;
 }
 if(el.dataset.action==='tfAiClose'){tfUiHaptic('selection');tfAiClosePanel();return}
 if(el.dataset.action==='tfAiPanelPrompt'){
  tfAiPanelDraft=String(el.dataset.prompt||'').slice(0,1200);
  const input=document.getElementById('tfAiQuickPrompt');
  if(input&&!input.disabled){input.value=tfAiPanelDraft;input.focus()}
  return;
 }
 if(el.dataset.action==='tfAiOpenFull'){
  tfUiHaptic('selection');
  tfAiPanelOpen=false;
  tfMotionNext='tab';tab='ai';modal=null;
  await render();
  const input=document.getElementById('tfAiPrompt');
  if(input&&tfAiPanelDraft)input.value=tfAiPanelDraft;
  input?.focus();
  return;
 }
 if(el.dataset.action==='tfAiPrompt'){const field=document.getElementById('tfAiPrompt');if(field){field.value=el.dataset.prompt||'';field.focus()}return}
 if(el.dataset.action==='tfAiTestConnection'){try{tfChatError='';await tfAiHealthCheck()}catch(err){tfAiStatus='Connection failed: '+String(err.message||err).slice(0,160)}await tfAiUpdateChatUI();return}
 if(el.dataset.action==='tfAiClear'){tfChatMessages=[];tfChatError='';await tfAiUpdateChatUI();return}
 if(el.dataset.action==='tfAiLock'){try{sessionStorage.removeItem('tf-ai-preview-code')}catch(e){}tfChatMessages=[];tfChatError='';tfAiStatus='';await tfAiUpdateChatUI();return}
 if(el.dataset.action==='tfAIQuestion'){tfAIQuestion=el.dataset.question||'priorities';await render();return}
 if(el.dataset.action==='tfAIProInfo'){alert('AI document extraction and advanced AI are planned Pro features. They are not available for purchase yet. No cloud AI service is connected, and no photographs leave this device.');return}

 if(el.dataset.action==='tfRecordOpen'){
  tfRecordListContext=tfRememberRecordList(el.dataset.id);
  tfMotionNext='forward';tfRecordDetailId=el.dataset.id;query='';
  await render();
  window.scrollTo(0,0);
  document.querySelector('.main')?.scrollTo(0,0);
  document.querySelector('.content')?.scrollTo(0,0);
  return;
 }
 if(el.dataset.action==='tfRecordClose'){
  if(tfCalendarLinkedReturn){tfCalendarLinkedReturn=false;tfRecordListContext=null;tfMotionNext='back';tfRecordDetailId=null;tab='calendar';query='';await render();return}
  const previous=tfRecordListContext;
  tfMotionNext='back';tfRecordDetailId=null;query=previous?.query||'';
  await render();
  tfRecordListContext=null;
  // On return to the list, keep the newly opened page at its top.
  return;
 }
 if(el.dataset.action==='tfRecordEdit'){modal={id:el.dataset.id};await render();return}
 if(el.dataset.action==='tfQuoteReuse'){
   const source=await get('quotes',el.dataset.id);
   if(!source)return;
   tfResetWorkspace('quotes');
   modal={draftDefaults:tfReusableQuoteFields(source)};
   await render();
   notify('New draft prepared. Choose the customer and recheck scope and pricing before saving.');
   return;
 }
 if(el.dataset.action==='tfJobInvoiceDraft'){
   const job=await get('jobs',el.dataset.id);
   if(!job||job.status!=='Completed')return;
   if((await all('invoices')).some(inv=>inv.jobId===job.id&&inv.status!=='Void')){notify('An invoice is already linked. Review it in Invoices.');return}
   tfResetWorkspace('invoices');window.TradeFlowRevenue?.newForJob?.(job.id);await render();return;
 }
 if(el.dataset.action==='tfRecordComplete'){
   if(!['jobs','tasks'].includes(tab))return;
   const item=await get(tab,el.dataset.id);if(!item)return;
   item.status=tab==='jobs'?'Completed':'Done';item.updatedAt=new Date().toISOString();
   await put(tab,item);
   const previous=tfRecordListContext;tfRecordListContext=null;
   tfRecordDetailId=null;query=previous?.query||query;
   await notify(tab==='jobs'?'Job completed':'Task completed');
   // On return to the list, keep the newly opened page at its top.
   return;
 }
 if(el.dataset.action==='tfRecordRelated'){
   if(el.dataset.type==='payments'){tab='expenses';tfFinanceScreen='transactions';tfFinanceFilter='income';tfFinanceSearch='';}
   else{tab=el.dataset.type;query=dummySafeCustomerName(el.dataset.id,await all('customers')); }
   tfRecordDetailId=null;modal=null;await render();return;
 }

 if(el.dataset.action==='tfImportStart'){tfFinanceMenu='';const target=el.dataset.target;if(!tfImportDefs[target])return;tfImportDraft={target,filename:'',headers:null,rows:null,mapping:{}};await render();return}
 if(el.dataset.action==='tfImportClose'){tfImportDraft=null;await render();return}
 if(el.dataset.action==='tfImportReport'){
  if(!tfImportDraft?.rows)return;
  const target=tfImportDraft.target,data={customers:await all('customers'),[target]:await all(target)};
  const review=tfImportPreview(data),skipped=review.items.filter(x=>x.status!=='valid');
  if(!skipped.length)return;
  const csv=['source_row,status,reason',...skipped.map(x=>[x.index,x.status,x.message].map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(','))].join('\n');
  downloadFile('tradeflow-import-review-'+target+'-'+today()+'.csv',csv,'text/csv;charset=utf-8');
  return;
 }

 if(el.dataset.action==='tfImportSave'){const target=tfImportDraft?.target;if(!target)return;await tfImportSave({customers:await all('customers'),[target]:await all(target)});return}
 if(tab==='expenses'&&el.dataset.action&&el.dataset.action.startsWith('tfFinance')){
 const action=el.dataset.action;
 if(action==='tfFinanceTab'){tfFinanceScreen=el.dataset.screen;tfFinanceSearch='';await render();tfFinanceScrollStart();return}
 if(action==='tfFinanceFilter'){tfFinanceFilter=el.dataset.kind;render();return}
 if(action==='tfFinanceMenu'){tfFinanceMenu=tfFinanceMenu===el.dataset.menu?'':el.dataset.menu;await render();return}
 if(action==='tfFinanceMenuClose'){tfFinanceMenu='';await render();return}
 if(action==='tfFinanceCSVExport'){
  const kind=el.dataset.kind,records=tfCashRows({payments:await all('payments'),expenses:await all('expenses')}).filter(r=>kind==='all'||r.kind===kind);
  const fields=['kind','date','amount','source','vendor','category','method','notes','id'];
  const csv=[fields.join(','),...records.map(r=>fields.map(f=>csvCell(r[f])).join(','))].join('\r\n');
  downloadFile('tradeflow-finance-'+kind+'-'+today()+'.csv',csv,'text/csv;charset=utf-8');
  tfFinanceMenu='';await render();return
 }
 if(action==='tfFinanceNew'){tfFinanceMenu='';tfFinanceEdit=null;tfFinanceDraft=null;tfFinanceScreen=el.dataset.kind==='income'?'add-income':'add-expense';await render();tfFinanceScrollStart();return}
 if(action==='tfFinanceBack'){if(tfFinanceScreen==='category'){tfFinanceScreen='add-expense'}else{tfFinanceScreen='overview';tfFinanceEdit=null;tfFinanceDraft=null;tfPhotoPending=null}await render();tfFinanceScrollStart();return}
 if(action==='tfFinanceChooseCategory'){tfFinanceDraft=tfFinanceCapture()||{};tfFinanceScreen='category';await render();tfFinanceScrollStart();return}
 if(action==='tfFinanceCategory'){tfFinanceDraft={...(tfFinanceDraft||{}),category:el.dataset.category};tfFinanceScreen='add-expense';await render();tfFinanceScrollStart();return}
 if(action==='tfFinanceEdit'){
  const store=el.dataset.kind==='income'?'payments':'expenses';
  const record=await get(store,el.dataset.id);
  if(!record)return;
  tfFinanceEdit=record;tfFinanceDraft=null;
  tfFinanceScreen=el.dataset.kind==='income'?'add-income':'add-expense';await render();tfFinanceScrollStart();return
 }
 if(action==='tfFinanceDelete'){
  if(!tfFinanceEdit||!confirm('Delete this transaction permanently?'))return;
  await del(tfFinanceScreen==='add-income'?'payments':'expenses',tfFinanceEdit.id);
  tfFinanceEdit=null;tfFinanceDraft=null;tfFinanceScreen='overview';notify('Transaction deleted');return
 }
}
if(el.dataset.action==='settingsPanel'){showSettingsPanel(el.dataset.panel);return}if(el.dataset.action==='moreSettings'||el.dataset.action==='moreHelp'){const target=document.getElementById(el.dataset.action==='moreSettings'?'tfMoreSettings':'tfMoreHelp');const other=document.getElementById(el.dataset.action==='moreSettings'?'tfMoreHelp':'tfMoreSettings');if(target){const opening=target.hidden;target.hidden=!opening;if(other)other.hidden=true;if(opening)target.scrollIntoView({behavior:'smooth',block:'nearest'})}return}if(el.dataset.action==='mapFilters'){const controls=document.getElementById('tfMapControls');if(controls)controls.hidden=!controls.hidden;return}if(el.dataset.action==='mapMode'){prefs.mapMode=el.dataset.mode;await put('settings',{id:'business',...prefs});const d=Object.fromEntries(await Promise.all(STORES.map(async store=>[store,await all(store)])));initializeMap(d);return}if(el.dataset.action==='mapSearch'){searchMapAddress();return}
if(el.dataset.action==='mapClearRoute'){window.TradeFlowMapExperience?.clearRoute();notify('Road route cleared');return}
if(el.dataset.action==='mapMyLocation'){
 if(!navigator.geolocation){notify('Your device does not support location services');return}
 navigator.geolocation.getCurrentPosition(({coords})=>{
  showCurrentPosition(coords)
 },()=>{const status=document.getElementById('mapStatus');if(status)status.textContent='Current location unavailable or permission denied'},{
  enableHighAccuracy:true,timeout:12000,maximumAge:30000
 });return
}if(el.dataset.action==='businessLocate'){
 const mapped=window.TradeFlowCore?.position({latitude:prefs.homeLat,longitude:prefs.homeLon});
 if(mapped){mapLastView={center:[mapped.lon,mapped.lat],zoom:15};tab='map';await render();return}
 if(!prefs.businessAddress){alert('Save a business address in Profile first.');return}
 const result=await tfResolveSupplyLocations({onlyBusiness:true,max:1,interactive:true});
 const point=window.TradeFlowCore?.position({latitude:prefs.homeLat,longitude:prefs.homeLon});
 if(point){mapLastView={center:[point.lon,point.lat],zoom:15};tab='map';await render();notify('Headquarters pinned · verify the position');return}
 alert(result.lastError||'Address could not be mapped precisely. Open Map, select the location and choose Set as business HQ.');
 return;
}if(el.dataset.action==='mapViewHQ'){
 const point=window.TradeFlowCore?.position({latitude:prefs.homeLat,longitude:prefs.homeLon});
 if(point){liveMap?.flyTo({center:[point.lon,point.lat],zoom:15});return}
 await tfResolveSupplyLocations({onlyBusiness:true,max:1,interactive:true});
 const now=window.TradeFlowCore?.position({latitude:prefs.homeLat,longitude:prefs.homeLon});
 if(now){mapLastView={center:[now.lon,now.lat],zoom:15};await render()}return;
}if(el.dataset.action==='mapHome'){setMapHome();return}if(el.dataset.action==='mapPinDelete'){if(confirm('Delete this saved map pin?')){await del('pins',el.dataset.id);render()}return}if(el.dataset.action==='mapPinView'){focusMapPin(el.dataset.id);return}if(el.dataset.action==='opportunityReviewClose'){opportunityImportDraft=null;render();return}if(el.dataset.action==='opportunityReviewTab'){opportunityImportTab=el.dataset.filter;render();return}if(el.dataset.action==='opportunityReviewSave'){await saveOpportunityImportDraft();return}if(el.dataset.action==='opportunityMapAll'){mapLastView=null;tab='map';await render();/* Map opens immediately using existing coordinates; address lookup requires a separate user action. */return}if(el.dataset.action==='opportunityMapRemaining'){await locateOpportunityBatch(await all('opportunities'));return}if(el.dataset.action==='opportunityLocate'){
 const r=await get('opportunities',el.dataset.id);if(!r)return;
 const locations=window.TradeFlowLocationQuality,variants=locations?.variants(r)||[];
 const suppliedPin=[r.google_maps_url,r.googleMapsUrl,r.map_url,r.mapUrl].filter(Boolean).map(url=>window.TradeFlowAddress?.googlePinCoordinates(url)).find(Boolean);
 if(suppliedPin){
  if(!confirm('Use the explicitly selected Google Maps point for this opportunity? It still needs owner verification.'))return;
  r.latitude=suppliedPin.lat;r.longitude=suppliedPin.lon;r.map_enabled=true;r.map_location_status='needs_review';
  r.map_location_source='owner-provided-google-point';r.map_location_checked_at=new Date().toISOString();
  await put('opportunities',r);mapLastView={center:[suppliedPin.lon,suppliedPin.lat],zoom:16};tab='map';await render();
  notify('Google Maps point loaded — verify the property location.');return;
 }
 if(!variants.length){alert('This record has no complete street address. Review its address before locating it.');return}
 if(!confirm('Look up this address? One user-triggered online request. Review the resulting pin before trusting it.'))return;
 if(navigator.onLine===false){alert('Address lookup requires an internet connection.');return}
 try{
  const key='tf-address:'+variants[0].toLowerCase().replace(/\s+/g,' ');
  const persisted=(await get('settings',opportunityGeoCacheId))||{id:opportunityGeoCacheId,results:{}};
  const stored=persisted.results&&typeof persisted.results==='object'?persisted.results:{};
  let matches=mapGeocodeCache.get(key)||stored[key];
  if(!Array.isArray(matches)){
   matches=await mapNominatim('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q='+encodeURIComponent(variants[0]));
   matches=Array.isArray(matches)?matches.slice(0,5).map(hit=>({lat:hit.lat,lon:hit.lon,display_name:String(hit.display_name||'').slice(0,350),address:hit.address||{}})):[];
   stored[key]=matches;
   const keys=Object.keys(stored);for(const stale of keys.slice(0,Math.max(0,keys.length-400)))delete stored[stale];
   await put('settings',{id:opportunityGeoCacheId,results:stored});
  }
  mapGeocodeCache.set(key,matches);
  const picked=locations.choose(r,matches);
  if(picked.status!=='matched_needs_review'){
   r.map_location_status=picked.status==='approximate'?'approximate':'unresolved';
   r.map_error=picked.reason||'Location needs review';
   r.map_address_result='';
   await put('opportunities',r);
   alert('No safe property-level match. Record preserved without an exact pin: '+r.map_error);
   return;
  }
  r.latitude=picked.lat;r.longitude=picked.lon;r.map_enabled=true;r.map_location_status='needs_review';
  r.map_address_result=picked.label;r.map_location_source='address-lookup';r.map_location_checked_at=new Date().toISOString();
  delete r.map_error;
  await put('opportunities',r);mapLastView={center:[picked.lon,picked.lat],zoom:15};tab='map';
  await render();notify('Street address matched — verify the physical property pin.');
 }catch(err){alert('Location lookup unavailable: '+String(err?.message||err))}
 return;
 }if(el.dataset.action==='opportunityMapFilters'){opportunityFilter=opportunityFilter==='unmapped'?'all':'unmapped';opportunityDetailId=null;render();return}if(el.dataset.action==='opportunityImportToggle'){const box=document.getElementById('opportunityImportTools');if(box)box.hidden=!box.hidden;return}if(el.dataset.action==='opportunityFilter'){opportunityFilter=el.dataset.filter;opportunityDetailId=null;render();return}if(el.dataset.action==='opportunityDetail'){opportunityDetailId=el.dataset.id;opportunityDetailScreen='dossier';await render();document.querySelector('.tf-od-screen')?.scrollIntoView({block:'start',behavior:'instant'});return}if(el.dataset.action==='opportunityWorkflow'){opportunityDetailId=el.dataset.id||opportunityDetailId;opportunityDetailScreen='workflow';await render();document.querySelector('.tf-od-screen')?.scrollIntoView({block:'start',behavior:'instant'});return}if(el.dataset.action==='opportunityBack'){if(opportunityDetailScreen==='workflow'){opportunityDetailScreen='dossier'}else{opportunityDetailId=null;opportunityDetailScreen='dossier'}await render();return}if(el.dataset.action==='opportunityClose'){opportunityDetailId=null;opportunityDetailScreen='dossier';render();return}if(el.dataset.action==='opportunityMap'){const r=await get('opportunities',el.dataset.id);if(r&&opportunityMapped(r)){mapLastView={center:[r.longitude,r.latitude],zoom:15};tab='map';render()}return}if(el.dataset.action==='importOpportunities'){document.getElementById('opportunityFile')?.click();return}if(el.dataset.action==='exportOpportunities'){exportOpportunities();return}if(el.dataset.action==='opportunityStatus'){const r=await get('opportunities',el.dataset.id);if(r){r.status=el.dataset.status;await put('opportunities',r);notify('Opportunity updated')}return}if(el.dataset.tab){await tfNavigateWorkspace(el.dataset.tab)}else if(el.dataset.action==='new'){if(['quotes','jobs','tasks'].includes(tab)&&(await all('customers')).length===0){alert('Create a customer first.');tab='customers';render();return}modal={};render()}else if(el.dataset.action==='close'){modal=null;tfPhotoPending=null;render()}else if(el.dataset.action==='export')exportData();else if(el.dataset.edit){modal={id:el.dataset.edit};render()}else if(el.dataset.delete){if(!confirm('Delete this record? This cannot be undone.'))return;const id=el.dataset.delete;if(tab==='customers'){const refs=await Promise.all(['quotes','jobs','tasks'].map(all));if(refs.some(a=>a.some(x=>x.customerId===id))){alert('This customer has linked records. Remove or reassign those first.');return}}await del(tab,id);tfRecordDetailId=null;await event(`Deleted ${tab.slice(0,-1)}`);notify('Record deleted')}else if(el.dataset.convert){const q=await get('quotes',el.dataset.convert);if(q?.status!=='Accepted')return;const jobs=await all('jobs');if(jobs.some(j=>j.quoteId===q.id))return;const outcome=await tfReviewQuotationHandoff(q);if(!outcome)return;if(!outcome.reused)await event(`Created job from accepted quotation: ${q.title}`);notify(outcome.reused?'Linked job already exists':'Job created')}});
document.addEventListener('change',e=>{if(e.target.id==='tfFinancePeriod'){tfFinancePeriod=e.target.value;render();return}});
document.addEventListener('input',e=>{if(e.target.id==='tfFinanceSearch'){tfFinanceSearch=e.target.value;const cursor=e.target.selectionStart;render().then(()=>{const input=document.getElementById('tfFinanceSearch');if(input){input.focus();input.setSelectionRange(cursor,cursor)}})}});
document.addEventListener('change',e=>{if(e.target.id==='tfImportMapChoice'&&opportunityImportDraft)opportunityImportDraft.mapLocations=e.target.checked});
document.addEventListener('submit',async e=>{
 if(e.target.id!=='tfSetupForm')return;
 e.preventDefault();
 const f=new FormData(e.target);
 let trade=String(f.get('primaryTrade')||'').trim();
 if(!trade)return alert('Choose your primary trade to continue.');
 if(!tfTradeCatalog.some(([name])=>name===trade))return alert('Please choose a trade from the options.');
 const custom=String(f.get('customTrade')||'').trim().slice(0,50);
 if(trade==='Other'&&custom)trade=custom;
 const company=String(f.get('company')||'').trim().slice(0,70)||'TradeFlow Lite';
 const serviceArea=String(f.get('serviceArea')||'').trim().slice(0,120);
 const address=String(f.get('businessAddress')||'').trim().slice(0,300);
 const button=e.target.querySelector('button[type=submit]');
 if(button?.disabled)return;
 if(button)button.disabled=true;
 try{
  const settings={...prefs,id:'business',company,serviceArea,businessAddress:address,homeLat:null,homeLon:null,mapLocationStatus:address?'unmapped':'no_address',mapAddressResult:'',primaryTrade:trade,
   categories:[...new Set([trade,...(Array.isArray(prefs.categories)?prefs.categories:[])])],
   onboardingComplete:true};
  await put('settings',settings);
  prefs=settings;tfOnboardingTrade='';tfMotionNext='tab';
  await render();
  if(address){
   // Address is saved immediately. Online geocoding is best-effort, never blocks setup.
   void tfResolveSupplyLocations({onlyBusiness:true,max:1}).then(async report=>{
    if(report.located){const saved=await get('settings','business');if(saved)prefs=saved;await render();notify('Headquarters located · verify the Map pin');}
    else if(report.offline||report.unresolved)notify('Headquarters address saved · confirm the pin on Map when online');
   }).catch(()=>{});
  }
 }catch(err){if(button)button.disabled=false;alert('Workspace setup could not be saved: '+err.message)}
});
document.addEventListener('submit',async e=>{if(e.target.id==='tfFinanceForm'){
 e.preventDefault();
 const fd=new FormData(e.target),income=tfFinanceScreen==='add-income',amount=Number(fd.get('amount')),date=String(fd.get('date')||'');
 if(!Number.isFinite(amount)||amount<=0||amount>1000000000)return alert('Enter a valid positive amount.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(new Date(date+'T12:00:00').getTime()))return alert('Select a valid date.');
 const old=tfFinanceEdit||{},values={
  id:old.id||uid(),amount:Math.round(amount*100)/100,date,
  method:String(fd.get('method')||'Bank transfer'),
  notes:String(fd.get('notes')||'').trim().slice(0,1500),
  updatedAt:new Date().toISOString()
 };
 if(income){values.title='Payment received';values.source=String(fd.get('source')||'').trim().slice(0,120);values.customerId=String(fd.get('customerId')||'');values.relatedId=String(fd.get('relatedId')||'');values.trade=old.trade||prefs.primaryTrade||'Other'}
 else{values.title=String(fd.get('category')||'Other');values.category=values.title;values.vendor=String(fd.get('vendor')||'').trim().slice(0,120);values.relatedId=String(fd.get('relatedId')||'')}
 if(tfPhotoPending?.target===(income?'payments':'expenses'))values.photoData=tfPhotoPending.dataUrl;
 await put(income?'payments':'expenses',{...old,...values});tfPhotoPending=null;
 await event((income?'Income':'Expense')+' recorded: '+euro(amount));
 tfFinanceScreen='overview';tfFinanceEdit=null;tfFinanceDraft=null;tfFinanceSearch='';
 notify(income?'Income recorded':'Expense recorded');return;
}
if(e.target.id==='settingsForm'){e.preventDefault();const f=new FormData(e.target),company=String(f.get('company')||'').trim(),address=String(f.get('businessAddress')||'').trim(),trade=String(f.get('primaryTrade')||'').trim().slice(0,50),serviceArea=String(f.get('serviceArea')||'').trim().slice(0,120);if(!company)return alert('Enter a business name');if(!trade)return alert('Choose or enter a primary trade');const changed=address!==String(prefs.businessAddress||'');
const hasHome=!!window.TradeFlowCore?.position({latitude:prefs.homeLat,longitude:prefs.homeLon});
const home=changed?{homeLat:null,homeLon:null,mapLocationStatus:address?'unmapped':'no_address',mapAddressResult:''}:{};
prefs={...prefs,company,serviceArea,primaryTrade:trade,categories:[...new Set([trade,...(Array.isArray(prefs.categories)?prefs.categories:[])])],onboardingComplete:true,contactName:String(f.get('contactName')||'').trim(),contactEmail:String(f.get('contactEmail')||'').trim(),contactPhone:String(f.get('contactPhone')||'').trim(),businessAddress:address,...home};
await put('settings',{id:'business',...prefs});
if(changed)mapLastView=null;
if(address&&(changed||!hasHome)){
 const resolved=await tfResolveSupplyLocations({onlyBusiness:true,max:1});
 notify(resolved.located?'Business profile saved · Address plotted (review pin)':'Business profile saved · Location needs review in Suppliers');
}else notify('Business profile saved');
return}if(e.target.id==='appearanceForm'){e.preventDefault();prefs.accent=String(new FormData(e.target).get('accent')||'#10cfe1');prefs.accentCustomized=true;await put('settings',{id:'business',...prefs});notify('Appearance saved');return}if(e.target.id==='tfOdContactWorkflowForm'){e.preventDefault();const id=e.target.dataset.id;const record=await get('opportunities',id);if(!record)return;const fd=new FormData(e.target);
const status=String(fd.get('status')||'New');if(!['New','Saved','Contacted','Interested','Quoted','Won','Lost'].includes(status))return;
const email=String(fd.get('contact_email')||'').trim().slice(0,250),phone=String(fd.get('contact_phone')||'').trim().slice(0,70);
const publicSource=String(fd.get('contact_source_url')||'').trim().slice(0,450);
if(email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)){alert('Enter a valid email or leave the field empty.');return}
if(publicSource&&!window.TradeFlowDossier?.secure(publicSource)){alert('Contact source must be a valid HTTPS URL.');return}
const icp=String(fd.get('icp_profile_id')||'');
const bidDecision=String(fd.get('bid_decision')||'Unreviewed'),bidRationale=String(fd.get('bid_rationale')||'').trim();
const bidChecks={};for(const field of ['bidInvitationVerified','bidScopeReviewed','bidCapacityChecked']){
 const answer=String(fd.get(field)||'Unknown');if(!['Unknown','Yes','No'].includes(answer)){alert('Invalid bid readiness response.');return}
 bidChecks[field]=answer;
}

const bidDeadline=String(fd.get('bid_deadline')||''),bidDeadlineEvidence=String(fd.get('bid_deadline_evidence')||'').trim();
const outcomeReason=String(fd.get('bid_outcome_reason')||''),outcomeNotes=String(fd.get('bid_outcome_notes')||'').trim();
if(!['','Price','Capacity','Scope','Relationship','Withdrawn','Not shared','Other'].includes(outcomeReason)||outcomeNotes.length>600){alert('Review the bid outcome reason and notes.');return}
if(!['Won','Lost'].includes(status)&&outcomeReason){alert('A bid outcome reason can only be recorded for Won or Lost opportunities.');return}
if(['Won','Lost'].includes(status)&&outcomeReason==='Other'&&outcomeNotes.length<12){alert('Specify the documented outcome reason or choose Reason not provided.');return}
const verifiedBidDate=x=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;const date=new Date(x+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===x};
if((bidDeadline&&!verifiedBidDate(bidDeadline))||bidDeadlineEvidence.length>600||(bidDeadline&&bidDeadlineEvidence.length<12)){alert('Enter a real verified bid deadline and a factual source/reference.');return}
if(!bidDeadline&&bidDeadlineEvidence){alert('Provide the deadline date or clear the deadline evidence.');return}
if(!['Unreviewed','Pursue','Hold','Decline'].includes(bidDecision)||bidRationale.length>1200){alert('Review the bid decision and rationale.');return}
if(bidDecision!=='Unreviewed'&&bidRationale.length<12){alert('Add a brief factual reason for the bid decision.');return}
const profiles=await get('settings','growth-profiles-v1')||{};
if(icp&&!(profiles.icps||[]).some(x=>x.id===icp)){alert('Select an existing ideal customer profile.');return}
Object.assign(record,{status,followup_date:String(fd.get('followup_date')||''),sales_notes:String(fd.get('sales_notes')||'').slice(0,4000),contact_person:String(fd.get('contact_person')||'').trim().slice(0,120),contact_phone:phone,contact_email:email,contact_source_url:publicSource,icp_profile_id:icp,bid_decision:bidDecision,bid_rationale:bidRationale,...bidChecks,bid_deadline:bidDeadline,bid_deadline_evidence:bidDeadlineEvidence,bid_outcome_reason:outcomeReason,bid_outcome_notes:outcomeNotes,workflow_updated_at:new Date().toISOString()});
await put('opportunities',record);await render();notify('Contact & workflow saved');return}
if(e.target.id==='opportunityWorkflowForm'){e.preventDefault();const id=e.target.dataset.id;const record=await get('opportunities',id);if(!record)return;const fd=new FormData(e.target);record.status=String(fd.get('status')||'New');record.followup_date=String(fd.get('followup_date')||'');record.sales_notes=String(fd.get('sales_notes')||'').slice(0,4000);record.workflow_updated_at=new Date().toISOString();await put('opportunities',record);opportunityDetailId=null;await render();notify('Opportunity workflow saved');return}if(e.target.id==='recordForm'){e.preventDefault();saveForm(e.target).catch(err=>alert(err.message))}});document.addEventListener('input',e=>{if(e.target.id==='mapAddress'){showLocalMapSuggestions(e.target.value);scheduleSmartMapSuggestions(e.target.value);return}if(e.target.id==='opportunitySearch'){opSearch=e.target.value;render().then(()=>{const i=$('#opportunitySearch');i?.focus();i?.setSelectionRange(opSearch.length,opSearch.length)});return}if(e.target.id==='search'){query=e.target.value;const pos=e.target.selectionStart;render().then(()=>{const i=$('#search');i?.focus();i?.setSelectionRange(pos,pos)})}});document.addEventListener('change',e=>{if(e.target.matches('[data-import-id]')&&opportunityImportDraft){if(e.target.checked)opportunityImportDraft.selected.add(e.target.dataset.importId);else opportunityImportDraft.selected.delete(e.target.dataset.importId);const btn=document.querySelector('.tf-import-save');if(btn){btn.textContent='Save '+opportunityImportDraft.selected.size+' Records';btn.disabled=!opportunityImportDraft.selected.size}}});
document.addEventListener('change',async e=>{
 if(!['tfPhotoCamera','tfPhotoGallery'].includes(e.target.id))return;
 const file=e.target.files?.[0];
 if(!file||!tfCapture||tfCaptureBusy)return;
 const current=tfCapture;
 tfCaptureBusy=true;
 try{
  const dataUrl=await tfCompressPhoto(file);
  if(tfCapture===current){current.dataUrl=dataUrl;current.filename=file.name||'Photo';}
 }catch(err){alert('Photo could not be processed: '+err.message)}
 finally{tfCaptureBusy=false;if(tfCapture===current)await render()}
});
document.addEventListener('change',async e=>{
 if(e.target.id==='tfUniversalFile'&&e.target.files?.[0]){
  try{await tfImportReadFile(e.target.files[0])}
  catch(err){alert('Import: '+err.message)}
  return;
 }
 if(e.target.matches('[data-import-map]')&&tfImportDraft){
  const panel=document.querySelector('.tf-import-panel'),scroll=panel?.scrollTop||0;
  tfImportDraft.mapping[e.target.dataset.importMap]=e.target.value;
  await render();
  const refreshed=document.querySelector('.tf-import-panel');if(refreshed)refreshed.scrollTop=scroll;
 }
});
document.addEventListener('change',e=>{if(e.target.id==='restoreFile'&&e.target.files[0])restore(e.target.files[0]);if(e.target.id==='opportunityFile'&&e.target.files[0])importOpportunities(e.target.files[0]).catch(err=>alert(err.message))});

let opSearch='';
const opFields=['record_id','source_record_id','project_name','trade','opportunity_type','project_description','city','region','latitude','longitude','source_url','source_date','discovered_at','verified_at','evidence_status','status','organization_name','contact_url','evidence_notes','contact_person','contact_phone','contact_email','contact_source_url','icp_profile_id','address','postal_code','country','map_location_status','map_error','map_address_result','photo_url','place_photo_url','official_photo_url','project_photo_url'];
function parseCSV(text){const delimiter=arguments[1]||',';if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++}else if(c==='"')quoted=false;else field+=c}else if(c==='"')quoted=true;else if(c===delimiter){row.push(field);field=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field=''}else field+=c}if(quoted)throw Error('Unclosed CSV quotation mark');if(field||row.length){row.push(field);rows.push(row)}return rows}
function csvCell(v){const t=String(v??'');return /[",\r\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t}
function downloadFile(filename,content,mime){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:mime}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
async function exportOpportunities(){const data=await all('opportunities');downloadFile('tradeflow-opportunities-'+today()+'.csv',[opFields.join(','),...data.map(r=>opFields.map(f=>csvCell(r[f])).join(','))].join('\r\n'),'text/csv')}
async function exportOpportunityCRM(){
 const records=await all('opportunities');
 const fields=['project_name','organization_name','contact_person','contact_phone','contact_email','city','region','status','followup_date','sales_notes','source_url','evidence_status'];
 const cell=value=>{const str=String(value??'');return csvCell(/^[\s]*[=+@-]/.test(str)?"'"+str:str)};
 downloadFile('tradeflow-crm-'+today()+'.csv',[fields.join(','),...records.map(r=>fields.map(f=>cell(r[f])).join(','))].join('\r\n'),'text/csv');
}
function convertE06Audit(rows){
 const headers=rows[0].map(x=>String(x||'').trim().toLowerCase()),position=new Map(headers.map((name,i)=>[name,i]));
 for(const required of ['qc_decision','record_id','entity_or_project','original_source_url','source_date','research_date']){
  if(!position.has(required))throw Error('QC audit missing required column: '+required);
 }
 const value=(row,name)=>String(row[position.get(name)]??'').trim();
 const validDate=v=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const date=new Date(v+'T00:00:00.000Z');
  return !Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===v;
 };
 const validUrl=u=>{
  try{const v=new URL(u);return v.protocol==='https:'&&!!v.hostname&&!v.username&&!v.password}
  catch{return false}
 };
 const converted=[opFields],allowed=new Set(['APPROVED','ACCEPTED']);
 let excluded=0;
 for(const row of rows.slice(1)){
  const qc=value(row,'qc_decision').toUpperCase();
  // Only explicit approved audit rows are candidates; rejected/unresolved never enter an import preview.
  if(!allowed.has(qc)){excluded++;continue}
  const id=value(row,'record_id'),name=value(row,'entity_or_project'),url=value(row,'original_source_url'),
   sourceDate=value(row,'source_date'),researchDate=value(row,'research_date'),verification=value(row,'source_verification');
  // Research date MUST NOT be substituted for a missing original source publication date.
  if(!id||id.length>150||!name||!validUrl(url)||!validDate(sourceDate)||!validDate(researchDate)||
     /\b(unverified|not\s+verified|unsupported|invalid|failed|fake|missing\s+source)\b/i.test(verification)){
   excluded++;continue;
  }
  const kind=value(row,'submitted_classification').toLowerCase(),location=value(row,'location'),notes=value(row,'reviewer_notes');
  const classification=kind.includes('verified')&&kind.includes('demand')||kind.includes('verified_request')?'verified_request':
    kind.includes('potential')?'potential_opportunity':
    kind.includes('business')||kind.includes('prospect')?'business_prospect':'project_signal';
  const record={record_id:id,source_record_id:id,project_name:name,trade:value(row,'trade')||'Electrical',
   opportunity_type:classification,project_description:(notes||location),city:location,region:value(row,'region')||'Texas',
   latitude:'',longitude:'',source_url:url,source_date:sourceDate,discovered_at:researchDate,verified_at:researchDate,
   evidence_status:'source_supported',status:'New',organization_name:name,contact_url:'',
   evidence_notes:'E06 QC: '+qc+'; '+verification+'; '+notes,
   contact_person:'',contact_phone:'',contact_email:'',contact_source_url:'',icp_profile_id:''};
  converted.push(opFields.map(f=>record[f]||''));
 }
 converted.qcExcluded=excluded;
 return converted;
}
async function importOpportunities(file){if(file.size>5*1024*1024)throw Error('File exceeds 5 MB');const rows=parseCSV(await file.text(),/\.tsv$/i.test(file.name)?'\t':',');if(rows.length<2)throw Error('CSV must contain a header and at least one record');if(rows.length>5001)throw Error('Import a maximum of 5,000 records at a time');let auditExcluded=0;if(rows[0].map(v=>v.trim().toLowerCase()).includes('qc_decision')){const converted=convertE06Audit(rows);auditExcluded=converted.qcExcluded;rows.splice(0,rows.length,...converted)}const headers=rows.shift().map(v=>v.trim().toLowerCase());for(const f of ['record_id','project_name','opportunity_type','source_url'])if(!headers.includes(f))throw Error('Missing required column: '+f);const allowedTypes=['project_signal','potential_opportunity','verified_request','business_prospect'];const existing=await all('opportunities'),ids=new Set(existing.map(x=>x.id)),sources=new Set(existing.filter(x=>x.source_record_id).map(x=>x.source_url+'|'+x.source_record_id));let added=0,duplicates=0,rejected=auditExcluded;const staged=[];const validUrl=u=>{try{const v=new URL(u);return ['https:','http:'].includes(v.protocol)}catch{return false}};
for(const cells of rows){if(cells.length!==headers.length){rejected++;continue}const raw=Object.fromEntries(headers.map((h,i)=>[h,(cells[i]||'').trim()]));const id=raw.record_id,lat=raw.latitude?Number(raw.latitude):null,lon=raw.longitude?Number(raw.longitude):null;if(!id||id.length>150||!raw.project_name||!['verified','source_supported','unresolved'].includes(raw.evidence_status)||!allowedTypes.includes(raw.opportunity_type)||!validUrl(raw.source_url)||!raw.source_url.startsWith('https://')||!raw.source_date||!raw.verified_at||(raw.latitude&&(!Number.isFinite(lat)||Math.abs(lat)>90))||(raw.longitude&&(!Number.isFinite(lon)||Math.abs(lon)>180))||(raw.latitude&&!raw.longitude)||(!raw.latitude&&raw.longitude)){rejected++;continue}const sourceKey=raw.source_url+'|'+raw.source_record_id;if(ids.has(id)||(raw.source_record_id&&sources.has(sourceKey))){duplicates++;continue}ids.add(id);if(raw.source_record_id)sources.add(sourceKey);staged.push({...Object.fromEntries(opFields.map(f=>[f,raw[f]||''])),id,photo_url:raw.photo_url||raw.official_photo_url||raw.project_photo_url||raw.place_photo_url||raw.image_url||'',address:raw.address||raw.street_address||raw.site_address||raw.project_address||raw.full_address||raw.street||raw.location||'',postal_code:raw.postal_code||raw.zip||raw.zip_code||raw.postcode||'',country:raw.country||raw.country_code||'US',latitude:lat,longitude:lon,trade:raw.trade||'Electrical',evidence_status:raw.evidence_status||'unreviewed',status:'New',imported_at:new Date().toISOString()})}
if(!staged.length){alert('No eligible new records. Duplicates: '+duplicates+'; invalid: '+rejected);return}
opportunityImportDraft={records:staged,duplicates,rejected,selected:new Set(staged.map(x=>x.id)),mapLocations:true};opportunityImportTab='all';await render();return}
let opportunityImportDraft=null,opportunityImportTab='all';
function opportunityReviewModal(){
const draft=opportunityImportDraft;if(!draft)return '';
const records=draft.records.filter(x=>opportunityImportTab==='all'||(opportunityImportTab==='review'?x.evidence_status!=='verified':['Saved','Contacted','Interested','Quoted','Won','Lost'].includes(x.status)));
const selected=draft.selected.size;
return `<div class="tf-import-backdrop"><section class="tf-import-dialog" role="dialog" aria-modal="true" aria-label="Review import"><header class="tf-import-head"><div class="tf-import-symbol">◇</div><div><h2>REVIEW IMPORT</h2><p>Check and confirm extracted records.</p></div><button type="button" data-action="opportunityReviewClose" aria-label="Close review">×</button></header>
<div class="tf-import-tabs"><button class="${opportunityImportTab==='all'?'active':''}" data-action="opportunityReviewTab" data-filter="all">All (${draft.records.length})</button><button class="${opportunityImportTab==='review'?'active':''}" data-action="opportunityReviewTab" data-filter="review">Needs review (${draft.records.filter(x=>x.evidence_status!=='verified').length})</button><button class="${opportunityImportTab==='saved'?'active':''}" data-action="opportunityReviewTab" data-filter="saved">Pipeline (${draft.records.filter(x=>['Saved','Contacted','Interested','Quoted','Won','Lost'].includes(x.status)).length})</button></div>
<div class="tf-import-tablewrap"><table class="tf-import-table"><thead><tr><th>Name</th><th>Type</th><th>Address</th><th>Evidence</th><th>Include</th></tr></thead><tbody>${records.map(x=>`<tr><td><strong>${esc(x.project_name)}</strong></td><td>${esc(x.opportunity_type.replaceAll('_',' '))}</td><td>${esc([x.city,x.region].filter(Boolean).join(', ')||'Not provided')}</td><td><span class="tf-import-evidence ${x.evidence_status==='verified'?'ok':'warn'}">${x.evidence_status==='verified'?'✓':'⚠'} ${esc(x.evidence_status)}</span></td><td><input type="checkbox" data-import-id="${esc(x.id)}" ${draft.selected.has(x.id)?'checked':''} aria-label="Include ${esc(x.project_name)}"></td></tr>`).join('')}</tbody></table></div><p class="tf-import-note">${draft.duplicates} duplicates and ${draft.rejected} invalid rows excluded. Evidence status is not a sales-confidence score.</p>
<p class="tf-import-note">Coordinates plot on save. Street addresses enter limited background lookup after review.</p><div class="tf-import-actions"><button class="tf-import-edit" type="button" data-action="opportunityReviewClose">Cancel</button><button class="tf-import-save" type="button" data-action="opportunityReviewSave" ${selected?'':'disabled'}>Save ${selected} Records</button></div></section></div>`;
}
async function saveOpportunityImportDraft(){const draft=opportunityImportDraft;if(!draft)return;const selected=draft.records.filter(x=>draft.selected.has(x.id));if(!selected.length)return;const transaction=db.transaction('opportunities','readwrite');for(const r of selected)transaction.objectStore('opportunities').put({...r,map_enabled:opportunityHasLocation(r)});await new Promise((resolve,reject)=>{transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error)});opportunityImportDraft=null;await event('Imported '+selected.length+' opportunities');await notify('Imported '+selected.length+' records');/* No automatic third-party bulk geocoding on import. */}
const opportunityHasLocation=x=>typeof x.latitude==='number'&&typeof x.longitude==='number'&&Number.isFinite(x.latitude)&&Number.isFinite(x.longitude)&&Math.abs(x.latitude)<=90&&Math.abs(x.longitude)<=180;
const opportunityMapped=x=>opportunityHasLocation(x)&&x.map_enabled!==false;
const opportunityStage=x=>{const status=String(x.status||'New').toLowerCase().trim();if(['won','completed','finished','job won'].includes(status))return 'won';if(['lost','rejected'].includes(status))return 'lost';if(['in progress','active','interested','working'].includes(status))return 'active';if(['follow-up','followup','follow up'].includes(status)||(x.followup_date&&x.followup_date<=new Date().toISOString().slice(0,10)&&!['quoted','won','lost'].includes(status)))return 'followup';if(['quoted','quote sent','proposal'].includes(status))return 'quoted';if(['contacted','replied'].includes(status))return 'contacted';if(status==='saved')return 'saved';return 'new'};
const opportunityStageName=x=>({won:'Won / job',quoted:'Quoted',active:'In progress',contacted:'Contacted',followup:'Follow-up',saved:'Saved',lost:'Lost',new:'New lead'})[opportunityStage(x)];
/* One shared SVG vocabulary for opportunity cards and map pins. */
const opportunityStageSvg=x=>{const stage=opportunityStage(x),path=({
 won:'<circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-6"/>',
 quoted:'<path d="M7 3.5h8l4 4V20H7z"/><path d="M15 3.5v4h4M10 12h6M10 15h4"/><path d="m14 18 1.4 1.4L18 17"/>',
 active:'<path d="M3 17h18v3H3zM5 16a7 7 0 0 1 14 0M10 8V5h4v3"/>',
 contacted:'<path d="M4 5h16v12H8l-4 4zM8 9h8M8 13h5"/>',
 followup:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
 saved:'<path d="M6 3h12v18l-6-4-6 4z"/>',
 lost:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
 new:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'
})[stage];return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>'};
let opportunityDetailId=null,opportunityDetailScreen='dossier',opportunityFilter='all';

function opportunityLocationParts(r){
 const normalized=window.TradeFlowEngine?.normalizeAddress(r);
 if(normalized?.parsed)return {street:normalized.street,city:normalized.city,region:normalized.region,zip:normalized.postalCode};
 const rawAddress=String(r.address||r.street_address||r.site_address||r.project_address||'').trim();
 const rawCity=String(r.city||'').trim(),rawRegion=String(r.region||r.state||'').trim();
 const combined=rawAddress||rawCity;
 const clean=x=>String(x||'').replace(/\s+/g,' ').replace(/,?\s*(?:United States of America|United States|USA)\s*$/i,'').trim().replace(/,\s*,/g,',');
 // Research imports sometimes store an entire street address in their "city" field.
 let city=rawCity;
 if(!rawAddress&&/^\s*\d+[A-Za-z]?\s+\S/.test(rawCity)){
  const sections=rawCity.split(',').map(x=>x.trim()).filter(Boolean);
  const locality=sections.find((x,i)=>i>0&&/[A-Za-z]/.test(x)&&!/^\d{5}(?:-\d{4})?$/.test(x));
  city=locality?locality.replace(/\b(?:TX|CA|NY|FL|WA|IL|AZ|CO|GA|NC|OH|PA|MI|NJ)\b.*$/i,'').replace(/\b\d{5}(?:-\d{4})?\b/g,'').trim():'';
 }
 const zip=String(r.postal_code||r.zip||r.zip_code||'').trim()||(combined.match(/\b\d{5}(?:-\d{4})?\b/)||[])[0]||'';
 return {street:clean(combined),city:clean(city),region:clean(rawRegion),zip};
}
function opportunityAddressVariants(r){
 const {street,city,region,zip}=opportunityLocationParts(r);
 const variants=[];
 const add=x=>{x=String(x||'').replace(/\s+/g,' ').trim();if(x&&!variants.some(v=>v.toLowerCase()===x.toLowerCase()))variants.push(x)};
 add(street);
 // Avoid appending duplicate city/region/ZIP to already complete site addresses.
 if(street){
  const suffix=[city,region,zip].filter(x=>x&&!street.toLowerCase().includes(x.toLowerCase()));
  if(suffix.length)add([street,...suffix].join(', '));
  const trailing=street.match(/^(.+?)\s+(\d+[A-Za-z]?)$/);
  if(trailing)add([trailing[2]+' '+trailing[1],city,region].filter(Boolean).join(', '));
  const leading=street.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  if(leading)add([leading[2]+' '+leading[1],city,region].filter(Boolean).join(', '));
 }
 if(!street&&r.project_name)add([r.project_name,city,region].filter(Boolean).join(', '));
 return variants.slice(0,4);
}
function opportunityLocationPlausible(hit,r){
 const result=String(hit.display_name||'').toLowerCase();
 const {street,city,region,zip}=opportunityLocationParts(r);
 const expectedCity=city.toLowerCase();
 if(zip&&result.includes(zip.slice(0,5)))return true;
 if(expectedCity&&result.includes(expectedCity))return true;
 // Nominatim often uses a neighboring municipality or locality; compare street names
 // but only when a street number and the state/region are present.
 const streetPart=street.split(',')[0].trim();
 const number=(streetPart.match(/^\d+[A-Za-z]?/)||[])[0];
 const words=streetPart.replace(/^\d+[A-Za-z]?\s*/,'').toLowerCase().split(/\s+/).filter(w=>w.length>3&&!/^(street|road|drive|lane|avenue|boulevard)$/.test(w));
 return Boolean(number&&words.length&&result.includes(number.toLowerCase())&&words.some(w=>result.includes(w))&&(!region||result.includes(region.toLowerCase())||result.includes('texas')));
}
/* One user-triggered mapping run; no 6-record cap when opening the opportunity map.
   Public Nominatim: a single, rate-limited request queue, persistent local query cache,
   stop on provider limits, no background cron, never assume a missing coordinate.
   https://operations.osmfoundation.org/policies/nominatim/ */
let opportunityMappingRunning=false;
let opportunityMappingProgress=null;
const opportunityGeoCacheId='tf-opportunity-geocode-cache-v2';
function opportunityBulkMatch(hit,record){
 const parsed=window.TradeFlowEngine?.normalizeAddress(record);
 const fallback=opportunityLocationParts(record);
 const source=parsed?.parsed?parsed:{
  streetNumber:(fallback.street.match(/^(\d+[A-Za-z]?)\s+/)||[])[1]||'',
  streetName:fallback.street.split(',')[0].replace(/^\d+[A-Za-z]?\s+/,'').trim(),
  city:fallback.city,region:fallback.region,postalCode:fallback.zip};
 const details=hit?.address||{},display=String(hit?.display_name||'').toLowerCase();
 const number=String(details.house_number||details.houseNumber||'').trim();
 const road=String(details.road||details.pedestrian||details.residential||details.street||details.footway||'').trim();
 const city=String(details.city||details.town||details.village||details.municipality||details.suburb||'').trim();
 const region=String(details.state_code||details.state||'').trim();
 const postcode=String(details.postcode||'').trim();
 const normalize=t=>String(t||'').toLowerCase().normalize('NFKC').replace(/\b(street|st)\b/g,'st').replace(/\b(road|rd)\b/g,'rd').replace(/\b(avenue|ave)\b/g,'ave').replace(/\b(boulevard|blvd)\b/g,'blvd').replace(/\b(drive|dr)\b/g,'dr').replace(/\b(lane|ln)\b/g,'ln').replace(/\b(court|ct)\b/g,'ct').replace(/[^a-z0-9]+/g,' ').trim();
 const sourceNumber=normalize(source.streetNumber);
 if(!sourceNumber||!display)return false;
 const matchesNumber=number?normalize(number)===sourceNumber:
  new RegExp('(?:^|[^0-9a-z])'+sourceNumber+'(?=$|[^0-9a-z])').test(display);
 if(!matchesNumber)return false;
 const expectedStreet=normalize(source.streetName),returnedStreet=normalize(road||display);
 const coreTokens=expectedStreet.split(' ').filter(w=>w.length>=2&&!['st','rd','ave','blvd','dr','ln','ct','way','n','s','e','w'].includes(w));
 if(!coreTokens.length||!coreTokens.every(w=>returnedStreet.split(' ').includes(w)))return false;
 if(source.postalCode&&postcode&&String(source.postalCode).slice(0,5)!==postcode.slice(0,5))return false;
 const expectedState=window.TradeFlowEngine?.stateCode(source.region)||String(source.region||'').toUpperCase();
 const returnedState=window.TradeFlowEngine?.stateCode(region)||String(region||'').toUpperCase();
 if(expectedState&&returnedState&&expectedState!==returnedState)return false;
 const stateOk=!expectedState||returnedState===expectedState||
  display.includes(String(source.region||'').toLowerCase())||(expectedState==='TX'&&display.includes('texas'));
 const localityOk=city?normalize(city)===normalize(source.city)||display.includes(String(source.city||'').toLowerCase()):
  !!source.city&&display.includes(String(source.city).toLowerCase());
 const postalOk=source.postalCode&&postcode&&postcode.slice(0,5)===String(source.postalCode).slice(0,5);
 return Boolean((localityOk&&stateOk)||postalOk);
}
function opportunityGeocodeCandidate(r){
 if(!r||opportunityMapped(r))return false;
 const location=opportunityLocationParts(r);
 return /^\s*\d+[A-Za-z]?\s+[^\s,]+/.test(location.street||'')&&opportunityAddressVariants(r).length>0;
}
function opportunityGeoStatusText(){
 const p=opportunityMappingProgress;
 if(!p)return '';
 if(p.running)return 'Locating '+p.checked+' / '+p.total+' addresses · '+p.located+' found';
 if(p.reason==='offline')return 'Address lookup paused — offline. Open View on Map when online to resume.';
 if(p.reason==='provider')return 'Address lookup paused by provider. Retry later using View on Map.';
 if(p.reason==='error')return 'Address lookup stopped; saved results remain available.';
 if(!p.total)return p.ineligible?'No usable street addresses for '+p.ineligible+' unmapped records.':'All available opportunity locations are mapped.';
 return 'Address lookup complete: '+p.located+' found · '+p.unmatched+' unmatched · '+p.ineligible+' need addresses';
}
function updateOpportunityGeocodeStatus(){
 const p=opportunityMappingProgress,status=opportunityGeoStatusText();
 const progress=document.getElementById('tfMapProgress');
 if(progress){progress.hidden=!status;progress.textContent=status}
 const mapStatus=document.getElementById('mapStatus');
 if(mapStatus&&p)mapStatus.textContent=status;
 if(p&&p.records){
  const mapped=p.records.filter(opportunityMapped).length;
  const mapCount=document.getElementById('tfMapLocationCounts');
  if(mapCount)mapCount.textContent=mapped+' mapped · '+(p.records.length-mapped)+' unmapped';
  const card=document.querySelector('.tf-op5-map-count');
  if(card){const strong=card.querySelector('strong'),small=card.querySelector('span');
   if(strong)strong.textContent=mapped+' mapped';
   if(small)small.textContent=(p.records.length-mapped)+' unmapped';
  }
 }
}
function opportunityBackgroundMapResult(record){
 if(!opportunityMapped(record))return;
 mapOpportunityFeatureRecords.set(String(record.id),record);
 if(tab!=='map'||!liveMap||!window.maplibregl)return;
 const id=String(record.id);
 if(!mapOpportunityDrawnIds.has(id)){
  const markerEl=opportunityMapMarker(record);
  const marker=new maplibregl.Marker({element:markerEl,anchor:'bottom'})
   .setLngLat([record.longitude,record.latitude]).addTo(liveMap);
  markerEl.addEventListener('click',e=>{e.stopPropagation();showExistingMapLocation(record)});
  mapMarkers.push(marker);mapOpportunityDrawnIds.add(id);
  if(Array.isArray(mapSuggestionRecords))mapSuggestionRecords.push({label:record.project_name||record.organization_name||'Opportunity',type:'opportunity',latitude:record.latitude,longitude:record.longitude});
 }
 const source=liveMap.getSource?.('tf-intelligence');
 if(source&&source.setData)source.setData({type:'FeatureCollection',features:[...mapOpportunityFeatureRecords.values()].filter(opportunityMapped).map(x=>({
  type:'Feature',geometry:{type:'Point',coordinates:[x.longitude,x.latitude]},
  properties:{id:String(x.id),name:String(x.project_name||'Opportunity'),kind:String(x.opportunity_type||'project_signal')}
 }))});
}
async function locateOpportunityBatch(records,options={}){
 // Opening the map never waits for this job. Repeated taps cannot create duplicate workers.
 if(opportunityMappingRunning)return;
 const automatic=!!options.automatic,allRequested=!!options.all;
 const pending=(records||[]).filter(x=>opportunityGeocodeCandidate(x)&&
   (x.map_location_status!=='unresolved'||!automatic||allRequested)&&
   (x.map_location_status!=='lookup_error'||allRequested||!automatic));
 const seen=new Set(),queue=pending.filter(x=>{const id=String(x.id);if(seen.has(id))return false;seen.add(id);return true});
 const max=automatic?0:Math.min(5,queue.length); // Manual, bounded, one-time review batches only.
 const ineligible=(records||[]).filter(x=>!opportunityMapped(x)&&!opportunityGeocodeCandidate(x)).length;
 // Explicitly distinguish truly missing addresses from parseable locations and review-needed text.
 for(const record of records||[]){
  if(opportunityMapped(record)||opportunityGeocodeCandidate(record))continue;
  const raw=[record.address,record.street_address,record.site_address,record.project_address,record.city,record.location].some(x=>String(x||'').trim());
  record.map_location_status=raw?'address_review':'no_address';
  record.map_error=raw?'Address needs review: cannot identify a complete street number and name':'No address provided';
  await put('opportunities',record);
 }
 if(!max){
  opportunityMappingProgress={running:false,checked:0,total:0,located:0,unmatched:0,errors:0,ineligible,records};
  updateOpportunityGeocodeStatus();return;
 }
 if(!automatic&&!confirm('Locate '+max+' opportunities? Address lookup uses the internet; verify all resulting pins.'))return;
 if(navigator.onLine===false){
  opportunityMappingProgress={running:false,checked:0,total:max,located:0,unmatched:0,errors:0,ineligible,reason:'offline',records};
  updateOpportunityGeocodeStatus();return;
 }
 opportunityMappingRunning=true;
 const progress=opportunityMappingProgress={running:true,checked:0,total:max,located:0,unmatched:0,errors:0,ineligible,records,reason:''};
 updateOpportunityGeocodeStatus();
 let stopped=false;
 // Cache API responses across sessions; do not repeatedly query the public service for the same address.
 const cached=(await get('settings',opportunityGeoCacheId))||{id:opportunityGeoCacheId,results:{}};
 const results=cached.results&&typeof cached.results==='object'?cached.results:{};
 try{
  for(const record of queue.slice(0,max)){
   if(navigator.onLine===false){progress.reason='offline';stopped=true;break}
   try{
    let hit=null;
    const variants=opportunityAddressVariants(record);
    // Prefer street + locality; don't rely on a broad street-name-only result.
    const prioritized=[...variants.slice(1),...variants.slice(0,1)].slice(0,3);
    for(const address of prioritized){
     const key=address.trim().toLowerCase().replace(/\s+/g,' ');
     let matches;
     if(Object.prototype.hasOwnProperty.call(results,key))matches=results[key];
     else{
      matches=await mapNominatim('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q='+encodeURIComponent(address));
      results[key]=(Array.isArray(matches)?matches:[]).slice(0,5).map(x=>({lat:x.lat,lon:x.lon,display_name:String(x.display_name||'').slice(0,350),address:x.address||{}}));
      // Bound cache size on smaller phones and persist it after each successful lookup.
      const keys=Object.keys(results);for(const stale of keys.slice(0,Math.max(0,keys.length-400)))delete results[stale];
      await put('settings',{id:opportunityGeoCacheId,results});
     }
     hit=(Array.isArray(matches)?matches:[]).find(x=>window.TradeFlowLocationQuality?.assess(record,x)?.status==='matched_needs_review');
     if(hit)break;
    }
    const lat=Number(hit?.lat),lon=Number(hit?.lon);
    if(!hit||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){
     record.map_location_status='unresolved';
     record.map_error='No confidently matching street address';
     progress.unmatched++;
    }else{
     record.latitude=lat;record.longitude=lon;record.map_enabled=true;
     record.map_location_status='needs_review';
     record.map_location_source='address-lookup';record.map_location_checked_at=new Date().toISOString();
     record.map_address_result=String(hit.display_name||'');
     delete record.map_error;
     progress.located++;
    }
    await put('opportunities',record);
    if(opportunityMapped(record))opportunityBackgroundMapResult(record);
   }catch(err){
    const failure=String(err?.message||err||'Lookup failed');
    // Respect provider suspension; never retry in a tight loop.
    if(/429|403|503|rate|limit/i.test(failure)){progress.reason='provider';stopped=true;break}
    progress.errors++;
    record.map_location_status='lookup_error';record.map_error=failure.slice(0,160);
    await put('opportunities',record);
   }
   progress.checked++;
   updateOpportunityGeocodeStatus();
  }
 }catch(err){
  progress.reason='error';
  console.warn('Opportunity address mapping interrupted',err);
 }finally{
  opportunityMappingRunning=false;
  progress.running=false;
  if(stopped&&!progress.reason)progress.reason='error';
  updateOpportunityGeocodeStatus();
 }
 // Do not call render() here: that would destroy and recreate the map while someone explores it.
}

function opportunityView(d){
const data=d.opportunities||[],term=opSearch.trim().toLowerCase();
const filtered=data.filter(x=>{if(opportunityFilter==='saved'&&!['Saved','Contacted','Interested','Quoted','Won','Lost'].includes(x.status))return false;if(opportunityFilter==='review'&&x.evidence_status==='verified')return false;if(opportunityFilter==='unmapped'&&opportunityMapped(x))return false;return [x.project_name,x.city,x.region,x.project_description,x.organization_name,x.opportunity_type,x.source_record_id].join(' ').toLowerCase().includes(term)});
const detail=data.find(x=>x.id===opportunityDetailId);
if(detail&&window.TradeFlowDossier)return (opportunityDetailScreen==='workflow'?window.TradeFlowDossier.workflow(detail,d):window.TradeFlowDossier.dossier(detail))+opportunityReviewModal();
const counts=[['All',data.length,'all'],['Pipeline',data.filter(x=>['Saved','Contacted','Interested','Quoted','Won','Lost'].includes(x.status)).length,'saved'],['Needs review',data.filter(x=>x.evidence_status!=='verified').length,'review'],['Not mapped',data.filter(x=>!opportunityMapped(x)).length,'unmapped']];
const urlSafe=u=>{try{return new URL(u).protocol==='https:'}catch{return false}};
const details=detail?`<section class="tf-op-detail panel tf-op3-dossier"><div class="panelhead"><h3>Opportunity dossier</h3><button class="btn secondary small" data-action="opportunityClose">Close ×</button></div><h2>${esc(detail.project_name)}</h2><p class="muted">${esc([detail.city,detail.region].filter(Boolean).join(', '))}</p><div class="tf-op-badges"><span class="pill">${esc((detail.opportunity_type||'project_signal').replaceAll('_',' '))}</span><span class="pill">${esc(detail.evidence_status||'unreviewed')}</span></div><p>${esc(detail.project_description||'No project description provided.')}</p><p class="muted sub">Research classification describes a signal, not an open bid or verified purchasing request.</p><div class="tf-op-evidence"><strong>Original evidence</strong><p class="sub">Record: ${esc(detail.source_record_id||detail.id)}</p><p class="sub">Source date: ${esc(detail.source_date||'Not supplied')}</p><p class="sub">Notes: ${esc(detail.evidence_notes||'None supplied')}</p>${urlSafe(detail.source_url)?`<a class="btn secondary small" target="_blank" rel="noopener noreferrer" href="${esc(detail.source_url)}">Open original source ↗</a>`:''}</div>${window.TradeFlowGrowth?.contactPanel(detail,d)||""}<form id="opportunityWorkflowForm" data-id="${esc(detail.id)}"><label class="field">Sales workflow<select class="input" name="status">${['New','Saved','Contacted','Interested','Quoted','Won','Lost'].map(st=>`<option value="${st}" ${detail.status===st?'selected':''}>${st}</option>`).join('')}</select></label><label class="field">Next follow-up<input class="input" type="date" name="followup_date" value="${esc(detail.followup_date||'')}"></label><label class="field">Contact / company notes<textarea class="input" name="sales_notes" rows="3" placeholder="Who to contact, next steps, phone or email...">${esc(detail.sales_notes||'')}</textarea></label><button class="btn" type="submit">Save workflow</button></form>${Number.isFinite(detail.latitude)&&Number.isFinite(detail.longitude)?`<button class="btn secondary small" data-action="opportunityMap" data-id="${esc(detail.id)}">View location on map →</button>` :`<button class="btn secondary small" data-action="opportunityLocate" data-id="${esc(detail.id)}">⌖ Locate address on map</button><p class="muted sub">Address lookup is approximate. Verify the result.</p>`}</section>`:'';

return `<section class="tf-op-workspace tf-op-v3 tf-op5"><header class="tf-op5-topbar" aria-label="Opportunity actions"><div class="tf-op5-top-actions">
<button type="button" class="tf-op5-action primary" data-op-ux="import"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></svg>Import</button>
<button type="button" class="tf-op5-action" data-op-ux="export"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3"/></svg>Export</button>
</div></header><input id="opportunityFile" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden>
<div class="tf-op3-stats"><div><strong>${data.length}</strong><small>Records</small></div>
<div><strong>${data.filter(opportunityMapped).length}</strong><small>Mapped (${data.length?Math.round(data.filter(opportunityMapped).length/data.length*100):0}%)</small></div>
<div><strong>${data.filter(x=>x.followup_date&&x.status!=='Won'&&x.status!=='Lost').length}</strong><small>Follow-ups</small></div></div>
<section class="tf-op3-mapcard"><div class="tf-op3-mapheading"><span class="tf-op3-mapicon">⌖</span>
<div><strong>Opportunity Map</strong><small>Visualize your projects and leads</small></div>
<div class="tf-op5-map-count"><strong>${data.filter(opportunityMapped).length} mapped</strong><span>${data.filter(x=>!opportunityMapped(x)).length} unmapped</span></div>
</div>
<div class="tf-op3-mapactions"><button type="button" data-action="opportunityMapAll">▧ &nbsp; View on Map &nbsp; →</button></div>
<p id="tfMapProgress" class="tf-op5-map-progress" role="status" hidden></p></section>
<div class="tf-op3-chips">${counts.map(([label,n,key])=>`<button type="button" class="${opportunityFilter===key?'active':''}" data-action="opportunityFilter" data-filter="${key}">${label}</button>`).join('')}<button type="button" data-tab="suppliers" aria-label="Open supplier network">Suppliers ↗</button></div>
<div class="tf-op3-search"><span>⌕</span><input id="opportunitySearch" placeholder="Search projects, companies, cities..." value="${esc(opSearch)}" aria-label="Search opportunities"></div>
${details}<div class="tf-op3-list">${filtered.slice(0,200).map(x=>`<article class="tf-op3-row"><button type="button" class="tf-op3-open" data-action="opportunityDetail" data-id="${esc(x.id)}"><span class="tf-op3-status tf-stage-${opportunityStage(x)}">${opportunityStageSvg(x)}</span><span class="tf-op3-copy"><strong>${esc(x.project_name)}</strong><small>${esc([x.city,x.region].filter(Boolean).join(', ')||'Location unavailable')} · ${esc(opportunityStageName(x))}</small></span></button>${opportunityMapped(x)?`<button class="tf-op3-pin" type="button" data-action="opportunityMap" data-id="${esc(x.id)}" aria-label="View ${esc(x.project_name)} on map">⌖</button>` :`<button class="tf-op3-pin tf-op3-locate" type="button" data-action="opportunityLocate" data-id="${esc(x.id)}" aria-label="Locate ${esc(x.project_name)} on map">⊕</button>`}<span class="tf-op3-chevron">›</span></article>`).join('')||`<div class="tf-op-empty"><h3>${data.length?'No matching opportunities':'No research records imported yet'}</h3><p>${data.length?'Try another filter or search.':'Import a research CSV to begin.'}</p><button class="btn secondary small" data-action="loadAustinElectricalStarter">Load 25 Austin electrical leads</button> <button class="btn secondary small" data-op-ux="import">Import records</button></div>`}</div>${filtered.length>200?'<p class="muted sub">Showing first 200 records; refine search for more.</p>':''}</section>${opportunityReviewModal()}`;
}

window.TradeFlowSupply?.configure({get,put,all,render,notify,uid,execute:tfExecuteCommand,resolveLocations:tfResolveSupplyLocations,navigate:async function(next,options={}){if(next==='map'&&options.network)tfMapNetworkFocus=true;tab=next;modal=null;tfRecordDetailId=null;tfAiPanelOpen=false;await render()}});
window.TradeFlowJobForms?.configure({get,put,render,uid});

/* Atomic local calendar approval: recompute from authoritative records while
 * the IndexedDB write transaction holds the scheduling stores. */
function tfApproveCalendarProposal(requested){
 if(!window.TradeFlowScheduler||!requested?.id)return Promise.reject(Error('Scheduler unavailable'));
 const names=['tasks','jobs','calendarEntries','calendarProposals','calendarPreferences','calendarAudit'];
 return new Promise((resolve,reject)=>{
  let t;try{t=db.transaction(names,'readwrite')}catch(error){reject(error);return}
  let errorMessage='',written=0,complete=false;
  t.onerror=()=>{if(!complete){complete=true;reject(t.error||Error(errorMessage||'Calendar transaction failed'))}};
  t.onabort=()=>{if(!complete){complete=true;reject(Error(errorMessage||'Calendar approval aborted'))}};
  t.oncomplete=()=>{complete=true;resolve({sessionsCreated:written})};
  const snapshot={},readNames=names.filter(x=>x!=='calendarAudit');
  let pending=readNames.length;
  for(const name of readNames){
   const request=t.objectStore(name).getAll();
   request.onsuccess=()=>{
    snapshot[name]=request.result||[];
    if(--pending!==0)return;
    try{
     const canonical=window.TradeFlowScheduler.analyze(snapshot).proposals.find(p=>p.id===requested.id);
     if(!canonical||canonical.fingerprint!==requested.fingerprint||JSON.stringify(canonical.slots)!==JSON.stringify(requested.slots)){
      errorMessage='The schedule changed; recalculate this proposal';t.abort();return;
     }
     const task=snapshot.tasks.find(x=>x.id===canonical.taskId);
     if(!task||['Done','Completed','Cancelled'].includes(task.status)){
      errorMessage='The task is no longer schedulable';t.abort();return;
     }
     const now=new Date().toISOString(),created=[];
     for(const [index,slot] of canonical.slots.entries()){
      const id=uid();
      const record={id,title:String(task.title||'Scheduled task'),date:slot.date,time:slot.time,durationMinutes:slot.durationMinutes,
       calendarId:task.calendarId||'tasks',sourceKind:'task',sourceId:task.id,assignedTo:slot.assignedTo,
       customerId:task.customerId||'',jobId:task.jobId||'',location:task.location||'',status:'Scheduled',
       ownerId:'local-owner',businessId:'local-business',version:1,createdAt:now,updatedAt:now};
      t.objectStore('calendarEntries').put(record);created.push(id);written++;
     }
     t.objectStore('calendarProposals').put({id:'approved:'+canonical.proposalKey,proposalKey:canonical.proposalKey,taskId:task.id,
      status:'approved',sessionIds:created,approvedAt:now,ownerId:'local-owner'});
     t.objectStore('calendarAudit').put({id:uid(),kind:'proposal.approved',proposalId:canonical.id,
      sourceKind:'task',sourceId:task.id,sessionIds:created,actor:'local-owner',createdAt:now});
    }catch(err){errorMessage=err.message||'Invalid proposal';t.abort()}
   };
  }
 });
}

function tfCompleteCalendarSession(sessionId){
 return new Promise((resolve,reject)=>{
  const t=db.transaction(['calendarEntries','tasks','calendarAudit'],'readwrite');
  let error='';
  t.onerror=()=>reject(t.error||Error(error||'Could not complete session'));
  t.onabort=()=>reject(Error(error||'Session completion aborted'));
  t.oncomplete=()=>resolve();
  const getSession=t.objectStore('calendarEntries').get(sessionId);
  getSession.onsuccess=()=>{
   const session=getSession.result;
   if(!session){error='Session not found';t.abort();return}
   if(session.status==='Completed')return; // idempotent
   const now=new Date().toISOString();
   const updated={...session,status:'Completed',updatedAt:now,version:(Number(session.version)||0)+1};
   t.objectStore('calendarEntries').put(updated);
   const audit={id:uid(),kind:'calendar.session.completed',sourceKind:session.sourceKind||'event',
    sourceId:session.sourceId||session.id,sessionId,actor:'local-owner',createdAt:now};
   t.objectStore('calendarAudit').put(audit);
   if(session.sourceKind!=='task'||!session.sourceId)return;
   const getTask=t.objectStore('tasks').get(session.sourceId);
   getTask.onsuccess=()=>{
    const task=getTask.result;
    if(!task||['Done','Completed','Cancelled'].includes(task.status))return;
    const total=Number(task.durationMinutes)||0;
    const earned=Number(session.actualMinutes)>0?Number(session.actualMinutes):(Number(session.durationMinutes)||0);
    const nextMinutes=Math.max(0,(Number(task.completedMinutes)||0)+earned);
    t.objectStore('tasks').put({...task,completedMinutes:total?Math.min(total,nextMinutes):nextMinutes,
     status:total&&nextMinutes>=total?'Done':task.status,updatedAt:now});
   };
  };
 });
}

/* Pilot foundation adapters: one local snapshot, existing screens/forms, no AI tools. */
let tfPilotFilter=null;
function tfPilotContext(){
 const calendar=tab==='calendar'?window.TradeFlowCalendar?.currentContext?.():null;
 const record=tfRecordDetailId&&['customers','quotes','jobs','tasks'].includes(tab)?{store:tab,id:tfRecordDetailId}:
  tab==='opportunities'&&opportunityDetailId?{store:'opportunities',id:opportunityDetailId}:
  tab==='invoices'?window.TradeFlowRevenue?.currentRecord?.():tab==='suppliers'?window.TradeFlowSupply?.currentRecord?.():calendar?.record||null;
 return {actor:'local-owner',businessId:'local-business',sourcePage:tab,record:record||null,today:window.TradeFlowCommands.dateText(new Date()),primaryTrade:prefs.primaryTrade||'',calendarDate:calendar?.date||null,filter:tfPilotFilter};
}
function tfPilotSnapshot(){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORES,'readonly'),data={};
  for(const store of STORES){const request=tx.objectStore(store).getAll();request.onsuccess=()=>{data[store]=request.result}}
  tx.oncomplete=()=>resolve(data);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
function tfResetWorkspace(next){
 tfLastOpenedPageKey=null; // Reopening even the current workspace starts at the top.
 tfCalendarLinkedReturn=false;tfAiPanelOpen=false;if(tab!==next)tfMotionNext=next==='map'?'':'tab';
 tab=next;query='';tfRecordListContext=null;modal=null;tfRecordDetailId=null;tfPhotoPending=null;tfCapture=null;tfPilotFilter=null;
}
async function tfNavigateWorkspace(next){tfResetWorkspace(next);await render();return {workspace:next}}
async function tfPilotOpenRecord(ref){
 const record=await get(ref.store,ref.id);if(!record)throw Error('Record no longer exists');
 if(['customers','quotes','jobs','tasks'].includes(ref.store)){tfResetWorkspace(ref.store);tfRecordDetailId=ref.id}
 else if(ref.store==='opportunities'){tfResetWorkspace('opportunities');opportunityDetailId=ref.id;opportunityDetailScreen='dossier'}
 else if(ref.store==='invoices'){tfResetWorkspace('invoices');window.TradeFlowRevenue.focusRecord(ref.id)}
 else if(ref.store==='suppliers'){tfResetWorkspace('suppliers');window.TradeFlowSupply.focusRecord(ref.id)}
 else if(ref.store==='calendarEntries'){tfResetWorkspace('calendar');window.TradeFlowCalendar.focusRecord(ref.id,record.date||String(record.startAt||'').slice(0,10))}
 else throw Error('That record has no supported screen');
 await render();return {ref};
}
async function tfPilotApplyFilter(workspace,filter){
 tfResetWorkspace(workspace);
 if(['tasks','quotes'].includes(workspace))tfPilotFilter={workspace,filter};
 else if(workspace==='invoices')window.TradeFlowRevenue.filterView({all:'All',overdue:'Overdue',unpaid:'Unpaid',draft:'Draft'}[filter]);
 else if(workspace==='calendar')window.TradeFlowCalendar.focusIntelligence(filter);
 else throw Error('Unsupported view filter');
 await render();return {workspace,filter};
}
async function tfPilotPrepareDraft(prepared){
 tfResetWorkspace(prepared.kind==='task'?'tasks':'quotes');
 modal={draftDefaults:prepared.fields,commandDraft:prepared};
 await render();return {kind:prepared.kind,fields:prepared.fields,sourceRef:prepared.sourceRef,requiresReview:true,persisted:false};
}
function tfInitializePilot(){
 if(!window.TradeFlowCommands||!window.TradeFlowIntelligence)return;
 const commands=window.TradeFlowCommands;
 const intelligence=window.TradeFlowIntelligence.createEngine({commands,calendar:window.TradeFlowCalendar,revenue:window.TradeFlowRevenue?.financials,detectors:[...window.TradeFlowIntelligence.builtinDetectors,...window.TradeFlowIntelligence.optimizationDetectors]});
 const runtime=commands.createRuntime({snapshot:tfPilotSnapshot,context:tfPilotContext,uid,
  ledger:commands.createLedger(()=>db),can:(permission,c)=>c.actor==='local-owner'&&c.businessId==='local-business'&&['navigate','read','draft','modify:quotation.convert','modify:customer.create'].includes(permission),
  ports:{navigate:tfNavigateWorkspace,openRecord:tfPilotOpenRecord,filter:tfPilotApplyFilter,prepareDraft:tfPilotPrepareDraft,
   operation:async(kind,payload,proof)=>window.TradeFlowCore.execute({db,kind,payload,uid,requestKey:proof.requestKey,requestId:proof.requestId,actor:proof.actor,businessId:proof.businessId,recordGuard:proof.recordGuard,sourceText:kind==='customer.create'?window.TradeFlowCustomerCapture?.sourceForRequest(proof.requestId):undefined})}
 });
 // Header evaluation does not copy image payloads or the growing command journal.
 const intelligenceStores=['customers','quotes','jobs','tasks','invoices','payments','opportunities','suppliers','crew','events','jobCosts','expenses','supplyOrders','calendarEntries','calendars','calendarPreferences'];
 const evaluateSnapshot=(data,options={})=>intelligence.evaluate(Object.fromEntries(intelligenceStores.map(store=>[store,(data[store]||[]).map(({photoData,...record})=>record)])),{...tfPilotContext(),...options});
 if(window.TradeFlowCustomerCapture){window.TradeFlowCustomerEntry=window.TradeFlowCustomerCapture.createController({document,snapshot:tfPilotSnapshot,context:tfPilotContext,interpreter:window.TradeFlowRecordInterpreter,commands:runtime,hashSource:window.TradeFlowCore.hashSource,repaint:render,show:render,close:render,notify,confirm:message=>window.confirm(message),openRecord:tfPilotOpenRecord,prepareLinked:async(draft,id)=>{if(draft.kind==='task'||draft.kind==='job'){tfResetWorkspace(draft.kind==='task'?'tasks':'jobs');modal={draftDefaults:{...draft.fields,customerId:id}};await render();return}tfResetWorkspace('calendar');await render();notify('Calendar draft needs a date, time and duration. Review the customer information before creating an event.');}});}
  async function runMapVoiceAction(request){
   if(!request||typeof request.kind!=='string')return {handled:false};
   await tfNavigateWorkspace('map');
   if(request.kind==='open')return {handled:true,close:true};
   let selector='';
   if(request.kind==='location')selector='[data-action="mapMyLocation"]';
   else if(request.kind==='layers')selector='[data-action="mapFilters"]';
   else if(request.kind==='clearRoute')selector='[data-action="mapClearRoute"]';
   else if(request.kind==='headquarters')selector='[data-action="mapViewHQ"],[data-action="businessLocate"]';
   else if(request.kind==='mode'&&['standard','terrain','intelligence'].includes(request.mode))selector='[data-action="mapMode"][data-mode="'+request.mode+'"]';
   else if(request.kind==='search'&&request.query){
    const field=document.getElementById('mapAddress');
    if(!field)throw Error('Map search field is unavailable');
    field.value=request.query;
    selector='[data-action="mapSearch"]';
   }else return {handled:false};
   const control=document.querySelector(selector);
   if(!control)throw Error(request.kind==='headquarters'?'Set a business address before using headquarters navigation.':'This map control is unavailable.');
   control.click();
   return {handled:true,close:true};
  }
  async function runLaunchWorkspaceCommand(request){
   if(request?.area==='calendar'){
    if(request.action==='filter'){
     const plan=await runtime.prepare({commandId:'view.filter',params:{workspace:'calendar',filter:request.filter}});
     if(plan.status!=='ready')throw Error(plan.error?.message||'Calendar filter unavailable');
     const result=await runtime.execute(plan.id);
     if(result.status!=='succeeded')throw Error(result.error?.message||'Calendar filter failed');
     return {handled:true};
    }
    if(request.action==='date'){
     const day=new Date();day.setDate(day.getDate()+(request.offset===1?1:0));
     const date=day.getFullYear()+'-'+String(day.getMonth()+1).padStart(2,'0')+'-'+String(day.getDate()).padStart(2,'0');
     if(!window.TradeFlowCalendar?.focusDate)throw Error('Calendar date navigation unavailable');
     window.TradeFlowCalendar.focusDate(date);
     await tfNavigateWorkspace('calendar');
     return {handled:true};
    }
    if(request.action==='open'){await tfNavigateWorkspace('calendar');return {handled:true}}
   }
   if(request?.area==='finance'){
    if(request.action==='incomeMonth'){tfFinanceScreen='income';tfFinancePeriod='month'}
    else if(request.action==='screen'&&['overview','income','expenses','reports'].includes(request.screen))tfFinanceScreen=request.screen;
    else if(request.action==='period'&&['month','week','year','all'].includes(request.period))tfFinancePeriod=request.period;
    else return {handled:false};
    await tfNavigateWorkspace('expenses');
    return {handled:true};
   }
   if(request?.area==='invoices'&&request.action==='filter'&&['unpaid','overdue','draft'].includes(request.filter)){
    const plan=await runtime.prepare({commandId:'view.filter',params:{workspace:'invoices',filter:request.filter}});
    if(plan.status!=='ready')throw Error(plan.error?.message||'Invoice filter unavailable');
    const outcome=await runtime.execute(plan.id);
    if(outcome.status!=='succeeded')throw Error(outcome.error?.message||'Invoice filter failed');
    return {handled:true};
   }
   return {handled:false};
  }
  async function runLaunchMoreCommand(request){
   if(request?.action==='jobLocation'){
    const data=await tfPilotSnapshot(),name=String(request.person||'').toLowerCase();
    const customers=(data.customers||[]).filter(c=>String(c.name||'').toLowerCase().includes(name));
    const customerIds=new Set(customers.map(c=>c.id));
    const matched=(data.jobs||[]).filter(j=>customerIds.has(j.customerId)||String(j.title||'').toLowerCase().includes(name));
    if(!matched.length)return {handled:true,message:'No job found for “'+request.person+'” in this device. Save or select a matching job first.'};
    if(matched.length>1)return {handled:true,message:matched.length+' matching jobs found. Open a specific job to see its location.'};
    const job=matched[0],customer=customers.find(c=>c.id===job.customerId);
    const address=String(job.address||job.location||job.siteAddress||customer?.address||'').trim();
    return {handled:true,message:address?'Saved job location for '+String(job.title||'job')+': '+address:'The matching job has no saved location. Open the job to add or review its address.'};
   }
   if(request?.action==='businessAlerts'){
    await tfNavigateWorkspace('dashboard');
    await window.TradeFlowNotifications?.show?.();
    return {handled:true};
   }
   if(request?.action==='optimizationReview'){
    const types={
     budget:['job.budget_overrun_review'],
     labor:['job.labor_hours_variance_review'],
     payments:['invoice.payment_integrity_review'],
     bids:['opportunity.bid_readiness_review'],
     materials:['job.material_readiness_review'],
     closeout:['job.closeout_evidence_review'],
     credentials:['job.crew_credential_review']
    };
    const filters=types[request.category];
    if(!filters)return {handled:true,message:'This business review is not supported.'};
    const report=window.TradeFlowPilot?.evaluateSnapshot(await tfPilotSnapshot());
    if(!report)return {handled:true,message:'Local business intelligence is unavailable. Reload TradeFlow.'};
    const findings=(report.findings||[]).filter(f=>filters.includes(f.detectorId));
    const message=findings.length?
      findings.length+' recorded review item(s):\n'+findings.slice(0,5).map(f=>'• '+f.explanation).join('\n')+
      (findings.length>5?'\nShowing first five. Open Notifications to review the records.':''):
      'No matching issues were found in the currently supported local records. This does not verify external accounts or unrecorded activities.';
    return {handled:true,message};
   }
   if(request?.action==='businessRisks'){
    const report=window.TradeFlowPilot?.evaluateSnapshot(await tfPilotSnapshot());
    if(!report)return {handled:true,message:'Business intelligence is not available on this device. Reload TradeFlow.'};
    const findings=report.findings||[];
    const intro=findings.length?findings.length+' recorded business issue(s) need review. ':'No current issues detected in the supported local records. ';
    const details=findings.slice(0,6).map(f=>'• '+f.explanation+(f.status==='blocked'?' (record needs review)':'')).join('\n');
    return {handled:true,message:intro+(details?'\n'+details:'')+(findings.length>6?'\nShowing the first six.':'')+'\nThis is an on-device review, not a verification of external accounts or communications.'};
   }
   if(request?.action==='activeJobs'){
    const data=await tfPilotSnapshot();
    const active=(data.jobs||[]).filter(j=>!['done','completed','cancelled','canceled','closed'].includes(String(j.status||'').toLowerCase()));
    return {handled:true,message:active.length?active.length+' active job(s) on this device:\n'+active.slice(0,6).map(j=>'• '+String(j.title||j.name||'Untitled job')).join('\n')+(active.length>6?'\nShowing first six.':''):'No active jobs recorded on this device.'};
   }
   if(request?.action==='completeTask'){
    const ref=tfPilotContext().record;
    if(ref?.store!=='tasks')return {handled:true,message:'Open a specific task first, then say “Mark this task done.”'};
    const task=await get('tasks',ref.id);
    if(!task)return {handled:true,message:'The selected task is no longer available.'};
    if(['done','completed'].includes(String(task.status||'').toLowerCase()))return {handled:true,message:'This task is already complete.'};
    if(!window.confirm('Mark task “'+String(task.title||'Untitled task').slice(0,120)+'” done?'))return {handled:true,message:'No changes saved.'};
    await put('tasks',{...task,status:'Done',updatedAt:new Date().toISOString()});
    await render();
    return {handled:true,message:'Task marked done and saved.'};
   }
   if(request?.action==='taskDraft'){
    const fields={title:request.title};
    if(request.when){
     const d=new Date();if(request.when==='tomorrow')d.setDate(d.getDate()+1);
     fields.due=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    }
    const plan=await runtime.prepare({commandId:'draft.prepare',params:{kind:'task',fields}});
    if(plan.status!=='ready')throw Error(plan.error?.message||'Could not prepare task draft');
    const result=await runtime.execute(plan.id);
    if(result.status!=='succeeded')throw Error(result.error?.message||'Could not open task draft');
    return {handled:true};
   }
   const params=request?.action==='open'?{workspace:request.workspace}:
    request?.action==='filter'?{workspace:request.workspace,filter:request.filter}:
    request?.action==='find'||request?.action==='openRecord'?{...(request.store?{store:request.store}:{}),query:request.query}:
    request?.action==='draft'?{kind:request.kind}:null;
   const commandId=({'open':'workspace.open','filter':'view.filter','find':'record.find','openRecord':'record.open','draft':'draft.prepare'})[request?.action];
   if(!commandId||!params)throw Error('Unsupported workspace voice request');
   const plan=await runtime.prepare({commandId,params});
   if(plan.status!=='ready')throw Error(plan.error?.message||(plan.status==='ambiguous'?'Multiple records match; use a more specific name.':'Command requires additional information.'));
   const result=await runtime.execute(plan.id);
   if(result.status!=='succeeded')throw Error(result.error?.message||'Command did not complete.');
   if(request.action==='find'){
    const matches=result.result?.matches||[];
    const labels=matches.slice(0,5).map(x=>'• '+x.label+' ('+x.ref.store+')');
    return {handled:true,message:matches.length?
     matches.length+' matching '+(request.store||'business')+' record(s) in this device:\n'+labels.join('\n')+(matches.length>5?'\nShowing first five. Refine your search.':''):
     'No matching '+(request.store||'business')+' records in this device.'};
   }
   return {handled:true};
  }
  async function runLibraryVoiceAction(request){
  if(!window.TradeFlowLibrary)throw Error('Library unavailable');
  if(request.action==='open'||request.action==='upload'||request.action==='scan'||request.action==='showFiles'){
    await tfNavigateWorkspace('library');
    if(request.action==='showFiles'&&request.target)window.TradeFlowLibrary.chooseFolder(({'jobs':'Jobs & Projects','customers':'Customers','quotes':'Quotations & Invoices'})[request.target]||'');
    // Browser file pickers require a direct user gesture: show Import or Scan buttons instead.
    if(request.action==='upload'||request.action==='scan')notify('Tap '+(request.action==='scan'?'Scan document':'Import files')+' to choose a file.');
    return {status:'navigate'};
  }
  if(request.action==='reviewSavedFile'){
    await tfNavigateWorkspace('library');
    return await window.TradeFlowLibrary.runCommand(request);
  }
  return {status:'unsupported'};
 }
 if(window.TradeFlowVoiceCommand){window.TradeFlowVoice=window.TradeFlowVoiceCommand.createController({document,snapshot:tfPilotSnapshot,commands:runtime,customer:window.TradeFlowCustomerEntry,mapCommand:runMapVoiceAction,workspaceCommand:runLaunchWorkspaceCommand,moreCommand:runLaunchMoreCommand,libraryCommand:runLibraryVoiceAction,navigate:tfNavigateWorkspace,mapError:notify,calendarRecords:data=>window.TradeFlowCalendar?.records?.(data)||[],openCalendar:async date=>{window.TradeFlowCalendar?.focusDate?.(date);tfResetWorkspace('calendar');await render()},now:()=>new Date(),repaint:render});}
  window.TradeFlowPilot=Object.freeze({version:1,commands:runtime,context:tfPilotContext,evaluateSnapshot,
  evaluate:async options=>evaluateSnapshot(await tfPilotSnapshot(),options)});
}
async function tfPilotNavigateCommand(workspace){
 if(!window.TradeFlowPilot)return tfNavigateWorkspace(workspace);
 const command=await window.TradeFlowPilot.commands.prepare({commandId:'workspace.open',params:{workspace}});
 const result=command.status==='ready'?await window.TradeFlowPilot.commands.execute(command.id):command;
 if(result.status!=='succeeded')notify(result.error?.message||'Command could not complete');
}
async function tfReviewQuotationHandoff(quote){
 const commands=window.TradeFlowPilot?.commands;
 if(!commands){notify('Command foundation unavailable. Reload the preview.');return null}
 const plan=await commands.prepare({commandId:'quotation.convert',params:{ref:{store:'quotes',id:quote.id}}});
 if(plan.status!=='needs_review'){notify(plan.error?.message||'Quotation needs review');return null}
 if(!confirm('Create a linked job from accepted quotation “'+String(quote.title||'Quotation')+'”? Review the customer and scope before continuing. Nothing will be sent externally.')){await commands.reject(plan.id);return null}
 const approved=await commands.approve(plan.id);
 if(approved.status!=='approved'){notify(approved.error?.message||'Quotation changed; review again');return null}
 const outcome=await commands.execute(plan.id);
 if(outcome.status!=='succeeded'){notify(outcome.error?.message||'Job could not be created');return null}
 return outcome.result;
}

window.TradeFlowCalendar?.configure({
 get,put,all,del,render,notify,uid,commitScheduleProposal:tfApproveCalendarProposal,completeSession:tfCompleteCalendarSession,
 navigate:async function(next){tab=next;modal=null;tfRecordDetailId=null;tfAiPanelOpen=false;await render()},
 openRecord:async function(kind,id){
  if(!id)return;
  if(['task','job'].includes(kind)){
   tfCalendarLinkedReturn=true;tab=kind==='task'?'tasks':'jobs';modal=null;tfRecordDetailId=id;query='';tfAiPanelOpen=false;tfMotionNext='forward';await render();return;
  }
  if(kind==='opportunity'){
   tab='opportunities';modal=null;tfAiPanelOpen=false;await render();
   const row=[...document.querySelectorAll('[data-action="opportunityDetail"]')].find(x=>x.dataset.id===id);
   row?.click();return;
  }
  if(kind==='quote'){tfCalendarLinkedReturn=true;tab='quotes';modal=null;tfRecordDetailId=id;await render();return}
  tab='calendar';await render();
 }
});
window.TradeFlowOperations?.configure({get,put,all,del,render,notify,uid,navigate:async function(next){tab=next;modal=null;tfAiPanelOpen=false;await render()}});
window.TradeFlowRoutes?.configure({get,put,all,render,notify,uid,getPrefs:()=>prefs,focusMap:async function(lon,lat){mapLastView={center:[lon,lat],zoom:15};tab='map';await render()}});
window.TradeFlowIntegrations?.configure({get,put,all,render,notify,uid});
window.TradeFlowMapExperience?.configure({
 getMap:()=>liveMap,getPrefs:()=>prefs,
 onAction:async(action,selected)=>{const point=selected?.point;if(!point)return;await handleMapAction(action,{lat:point.lat,lng:point.lon,address:selected.address})},
 navigate:async next=>{window.TradeFlowMapExperience?.close();tab=next;modal=null;tfRecordDetailId=null;await render()}
});
window.TradeFlowResearch?.configure({get,put,all,del,render,notify,uid,navigate:async function(next){tab=next;modal=null;tfAiPanelOpen=false;await render()}});
window.TradeFlowMarketing?.configure({get,put,all,del,render,notify,uid,navigate:async function(next){tab=next;modal=null;tfAiPanelOpen=false;await render()}});
window.TradeFlowRevenue?.configure({get,put,all,del,render,notify,uid,navigate:async function(next){tab=next;modal=null;tfAiPanelOpen=false;await render()}});
window.TradeFlowNotifications?.configure({
 get,put,render,uid,intelligence:data=>window.TradeFlowPilot?.evaluateSnapshot(data)||null,openRecord:tfPilotOpenRecord,navigate:async function(next){tab=next;query='';modal=null;tfRecordDetailId=null;tfAiPanelOpen=false;await render()}
});
window.TradeFlowOpportunityUX?.configure({
 get,put,all,render,uid,notify,exportCSV:exportOpportunities,exportCRM:exportOpportunityCRM,
 trade:()=>prefs.primaryTrade||'Electrical',
 onImported:records=>{/* Imported records remain unmapped until the owner starts location review. */}
});
window.TradeFlowGrowth?.configure({
 get,put,all,render,notify,uid,
 navigate:async function(next){tab=next;modal=null;tfRecordDetailId=null;tfAiPanelOpen=false;await render()},
 openAI:async function(prompt){tab='ai';modal=null;tfAiPanelOpen=false;await render();const input=document.getElementById('tfAiPrompt');if(input){input.value=prompt;input.focus()}}
});
async function tfReceiveSiriCustomer(){
 const prefix='#tf-customer=',raw=window.location.hash;
 if(!raw.startsWith(prefix))return;
 // Fragments are not sent in HTTP requests. Remove the transient text from the visible URL immediately.
 try{history.replaceState(history.state,'',window.location.pathname+window.location.search)}catch{}
 const text=(()=>{try{return decodeURIComponent(raw.slice(prefix.length))}catch{return ''}})();
 if(!text.trim()||text.length>4000){notify('The Siri customer command was empty or too long.');return}
 const instruction=/^(?:please\s+)?(?:add|create|save|register)\b/i.test(text.trim())?text:'Add customer '+text;
 if(!window.TradeFlowCustomerEntry){notify('Customer voice entry is not ready.');return}
 await window.TradeFlowCustomerEntry.openReview(instruction,{source:'transcript'});
}
window.addEventListener('hashchange',()=>{void tfReceiveSiriCustomer()});
(async()=>{try{db=await openDB();tfInitializePilot();const accountReturn=new URL(location.href).searchParams.get('account')==='connected';if(accountReturn)tab='preferences';await render();if(accountReturn){history.replaceState(null,'',location.pathname);showSettingsPanel('account')}await tfReceiveSiriCustomer();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn)}catch(e){$('#app').innerHTML=`<div class="content"><h2>Storage unavailable</h2><p>${esc(e.message)}</p><p>Try a normal browser tab outside private browsing.</p></div>`}})();

// V0.5: online MapLibre street tiles are optional. Records, pins and CRM stay in IndexedDB.
let tfMapNetworkFocus=false;
let currentPositionMarker=null,liveMap=null, mapMarkers=[], mapOpportunityDrawnIds=new Set(), mapOpportunityFeatureRecords=new Map(), pendingMapMarker=null, pendingMapPopup=null, mapRequestQueue=Promise.resolve(), nextMapRequestAt=0, financeState={period:'All',metric:'Revenue'}, mapLastView=null, lastMapTap=0, mapClickRequest=0, mapGeocodeCache=new Map();
const mapCenter=()=>window.TradeFlowCore?.position({latitude:prefs.homeLat,longitude:prefs.homeLon})||{lat:30.2672,lon:-97.7431};
function showCurrentPosition(coords){
 if(tab!=='map'||!liveMap||!window.maplibregl)return;
 const lat=coords.latitude,lon=coords.longitude;
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
 if(!currentPositionMarker){
  const el=document.createElement('div');el.className='tf-map-current-position';el.setAttribute('role','img');el.setAttribute('aria-label','Your current GPS position');
  el.innerHTML='<span class="tf-map-position-accuracy"></span><span class="tf-map-position-arrow"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2 36 35 20 28 4 35Z"/></svg></span>';
  currentPositionMarker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([lon,lat]).addTo(liveMap);
 }
 currentPositionMarker.setLngLat([lon,lat]);
 const node=currentPositionMarker.getElement();
 const heading=Number(coords.heading);
 const arrow=node.querySelector('.tf-map-position-arrow');
 if(arrow)arrow.style.transform=Number.isFinite(heading)&&heading>=0?'rotate('+heading+'deg)':'';
 node.classList.toggle('has-heading',Number.isFinite(heading)&&heading>=0);
 const accuracy=node.querySelector('.tf-map-position-accuracy');
 if(accuracy)accuracy.title=Number.isFinite(coords.accuracy)?'GPS accuracy approximately '+Math.round(window.TradeFlowUS.feet(coords.accuracy))+' feet':'GPS accuracy unknown';
 liveMap.flyTo({center:[lon,lat],zoom:Math.max(liveMap.getZoom(),15),essential:true});
 const status=document.getElementById('mapStatus');if(status)status.textContent='Your device position · not saved'+(Number.isFinite(coords.accuracy)?' · ±'+Math.round(coords.accuracy)+' m':'');
}
function opportunityMapMarker(x){const el=document.createElement('button');el.type='button';el.className='tf-map-stage tf-stage-'+opportunityStage(x);const pending=window.TradeFlowLocationQuality?.status(x)!=='verified';if(pending){el.style.outline='2px solid #ef5c67';el.style.outlineOffset='2px'}el.innerHTML=opportunityStageSvg(x);el.setAttribute('aria-label',(x.project_name||'Opportunity')+' — '+opportunityStageName(x)+(pending?' — location needs verification':''));el.title=pending?'Location needs verification':'Verified location';return el}
function mapView(d){const pins=d.pins||[],located=(d.opportunities||[]).filter(x=>opportunityMapped(x)),hq=window.TradeFlowCore?.position({latitude:prefs.homeLat,longitude:prefs.homeLon}),network=window.TradeFlowCore?.supplierLinks(d,prefs);return `<section class="tf-map-screen" aria-label="TradeFlow tactical map"><div id="territoryMap" class="territory-map" role="region" aria-label="Interactive street map"></div><div class="tf-map-top"><div class="tf-map-search-wrap"><div class="tf-map-search"><span aria-hidden="true">⌕</span><input id="mapAddress" autocomplete="off" placeholder="Search places, addresses, projects..." aria-label="Search map"><button type="button" data-action="mapSearch" aria-label="Search address"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></button></div><div id="tfMapSuggestions" class="tf-map-suggestions" role="listbox" hidden></div></div>${prefs.businessAddress?`<button type="button" class="tf-map-hq-shortcut" data-action="${hq?"mapViewHQ":"businessLocate"}">${hq?"⌂ Headquarters":"⌖ Locate business pin"}</button>`:""}<div class="tf-map-actions-float" aria-label="Map tools">
<button type="button" data-action="mapMyLocation" aria-label="Show my current position" title="My location"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-linecap="round"><path d="m3 11 18-8-8 18-2.7-7.3z"/></svg></button>
<button type="button" data-action="mapFilters" aria-label="Map layers and appearance" title="Map layers"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linejoin="round"><path d="m12 2 9 5-9 5-9-5zm-9 10 9 5 9-5M3 17l9 5 9-5"/></svg></button>
<button type="button" data-action="mapClearRoute" aria-label="Clear current route" title="Clear road route"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M5 5 19 19M19 5 5 19"/></svg></button>
</div><div id="tfMapControls" class="tf-map-controls" hidden><div class="tf-map-modes" role="group" aria-label="Map style"><button type="button" class="btn small" data-action="mapMode" data-mode="intelligence">Intelligence</button><button type="button" class="btn secondary small" data-action="mapMode" data-mode="standard">Standard</button><button type="button" class="btn secondary small" data-action="mapMode" data-mode="terrain">Terrain / 3D</button></div><button class="btn secondary small" data-action="mapHome">Set current view as home</button><div class="tf-map-legend"><span>⌖ Verified locations</span><span>◉ Clusters</span><span>◇ Project signals</span><span>⌂ Headquarters</span><span>▣ Suppliers · geographic connections, not road routes</span></div></div></div><div class="tf-map-footer"><span id="mapStatus" role="status">Loading map…</span><span id="tfMapLocationCounts">${located.length} mapped · ${(d.opportunities||[]).length-located.length} unmapped · ${network?.connectedSupplierCount||0} suppliers connected · ${network?.mappedOrderCount||0} order links · ${hq?"HQ mapped":prefs.businessAddress?"HQ needs pin":"HQ not configured"}</span></div></section>`}
async function loadMapLibre(){if(window.maplibregl)return;await new Promise((resolve,reject)=>{const css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';document.head.appendChild(css);const script=document.createElement('script');script.src='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';script.onload=resolve;script.onerror=()=>reject(Error('Map library could not load. Internet is required for first use.'));document.head.appendChild(script)})}
async function initializeMap(d){if(tab!=='map'||!document.getElementById('territoryMap'))return;try{window.TradeFlowMapExperience?.close();if(liveMap){const c=liveMap.getCenter();mapLastView={center:[c.lng,c.lat],zoom:liveMap.getZoom()};liveMap.remove();liveMap=null;currentPositionMarker=null}mapMarkers=[];mapOpportunityDrawnIds=new Set();await loadMapLibre();if(tab!=='map')return;const activeOpportunityRecords=await all('opportunities');if(tab!=='map')return;const mapped=activeOpportunityRecords.filter(opportunityMapped);mapOpportunityFeatureRecords=new Map(mapped.map(x=>[String(x.id),x]));const mapHQ=window.TradeFlowCore?.position({latitude:prefs.homeLat,longitude:prefs.homeLon});
const center=mapLastView||(mapHQ?{center:[mapHQ.lon,mapHQ.lat],zoom:11}:mapped.length?
{center:[mapped[0].longitude,mapped[0].latitude],zoom:11}:{center:[mapCenter().lon,mapCenter().lat],zoom:11});liveMap=new maplibregl.Map({container:'territoryMap',center:center.center,zoom:center.zoom,style:prefs.mapMode==='standard'?'https://tiles.openfreemap.org/styles/liberty':'https://tiles.openfreemap.org/styles/dark',attributionControl:true});liveMap.addControl(new maplibregl.NavigationControl({showCompass:false,visualizePitch:false}),'top-left');if(prefs.mapMode==='terrain')liveMap.setPitch(55);document.querySelectorAll('[data-action="mapMode"]').forEach(b=>{const active=b.dataset.mode===(prefs.mapMode||'intelligence');b.classList.toggle('secondary',!active)});liveMap.addControl(new maplibregl.ScaleControl({maxWidth:100,unit:'metric'}),'bottom-left');const status=document.getElementById('mapStatus');if(status)status.textContent='Loading street map…';liveMap.on('load',()=>{const current=document.getElementById('mapStatus');if(current)current.textContent=opportunityMappingProgress?opportunityGeoStatusText():`${mapMarkers.length} locations plotted. ${!(d.opportunities||[]).some(opportunityMapped)?'Unmapped records need a valid street address.':''}`});liveMap.on('error',()=>{const current=document.getElementById('mapStatus');if(current)current.textContent='Street map tiles are unavailable. Check your connection; saved records remain available locally.'});liveMap.on('load',()=>{if(prefs.mapMode!=='intelligence')return;const records=[...mapOpportunityFeatureRecords.values()].filter(opportunityMapped);const features=records.map(x=>({type:'Feature',geometry:{type:'Point',coordinates:[x.longitude,x.latitude]},properties:{id:String(x.id),name:String(x.project_name||'Opportunity'),kind:String(x.opportunity_type||'project_signal')}}));if(!features.length)return;liveMap.addSource('tf-intelligence',{type:'geojson',data:{type:'FeatureCollection',features},cluster:true,clusterRadius:55,clusterMaxZoom:13});liveMap.addLayer({id:'tf-zone-glow',type:'circle',source:'tf-intelligence',filter:['has','point_count'],paint:{'circle-color':prefs.accent||'#22c0b3','circle-radius':['step',['get','point_count'],24,5,32,20,44],'circle-opacity':0.13,'circle-blur':0.55}});liveMap.addLayer({id:'tf-clusters',type:'circle',source:'tf-intelligence',filter:['has','point_count'],paint:{'circle-color':'#102b3c','circle-stroke-color':prefs.accent||'#22c0b3','circle-stroke-width':2,'circle-radius':['step',['get','point_count'],17,5,23,20,30]}});liveMap.addLayer({id:'tf-cluster-count',type:'symbol',source:'tf-intelligence',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-size':13},paint:{'text-color':'#e8ffff'}});liveMap.on('click','tf-clusters',e=>{const f=e.features&&e.features[0];if(!f)return;liveMap.easeTo({center:f.geometry.coordinates,zoom:Math.min(liveMap.getZoom()+2,17)});});liveMap.on('mouseenter','tf-clusters',()=>{liveMap.getCanvas().style.cursor='pointer'});liveMap.on('mouseleave','tf-clusters',()=>{liveMap.getCanvas().style.cursor=''})});liveMap.on('load',()=>{
 const network=window.TradeFlowCore?.supplierLinks(d,prefs);
 if(tfMapNetworkFocus){
  tfMapNetworkFocus=false;
  const points=(network?.geojson.features||[]).flatMap(f=>{
   const c=f.geometry?.coordinates||[];return c.length?[c[0],c[c.length-1]]:[];
  }).filter(point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite));
  if(points.length){
   let west=180,east=-180,south=90,north=-90;
   for(const [lon,lat] of points){west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat)}
   if(west===east){west-=.01;east+=.01}
   if(south===north){south-=.01;north+=.01}
   liveMap.fitBounds([[west,south],[east,north]],{padding:65,maxZoom:12,duration:0});
  }else{
   const status=document.getElementById('mapStatus');
   if(status)status.textContent='No mapped supply connections yet. Locate both ends via More → Suppliers.';
  }
 }
 if(!network?.geojson.features.length)return;
 liveMap.addSource('tf-supplier-lines',{type:'geojson',data:network.geojson});
 liveMap.addLayer({id:'tf-supplier-glow',type:'line',source:'tf-supplier-lines',paint:{'line-color':'#3c87b3','line-width':6,'line-opacity':.08,'line-blur':1}});
 liveMap.addLayer({id:'tf-supplier-lines',type:'line',source:'tf-supplier-lines',
   paint:{'line-color':['match',['get','status'],'Delivered','#31ef91','In transit','#ffca40','Ordered','#00d9e8','Network','#44d5ff','#b987fc'],
     'line-width':2.8,'line-opacity':.86,'line-dasharray':[1.5,1]}});
});
// Long-press placement: hold to pick up a pin, drag to refine, release to inspect.
// Preserve map gestures on ordinary touches and invalidate stale address lookups.
{
 const canvas=liveMap.getCanvas(),mapForPress=liveMap;
 let holdTimer=null,startPoint=null,placing=false,placedPoint=null,suppressClickUntil=0;
 let dragWasEnabled=false;
 const clearHold=()=>{if(holdTimer!==null)clearTimeout(holdTimer);holdTimer=null;startPoint=null};
 const restorePan=()=>{if(placing&&dragWasEnabled)mapForPress.dragPan.enable();placing=false};
 const coordsAt=t=>{const rect=canvas.getBoundingClientRect();return mapForPress.unproject([t.clientX-rect.left,t.clientY-rect.top])};
 const updatePin=t=>{
  const geo=coordsAt(t);
  if(!Number.isFinite(geo.lat)||!Number.isFinite(geo.lng))return;
  placedPoint={lat:geo.lat,lon:geo.lng};
  pendingMapMarker?.setLngLat([geo.lng,geo.lat]);
 };
 const finishHold=e=>{
  if(placing){
   e.preventDefault();suppressClickUntil=Date.now()+750;lastMapTap=Date.now();
   const p=placedPoint;
   restorePan();clearHold();
   if(!p||liveMap!==mapForPress)return;
   const request=++mapClickRequest;
   showTemporaryMapLocation(mapForPress,d,p.lat,p.lon,'');
   void reverseMapAddress(p.lat,p.lon).then(address=>{
    if(request!==mapClickRequest||liveMap!==mapForPress||!pendingMapMarker||!address)return;
    window.TradeFlowMapExperience?.updateAddress?.(address);
    document.querySelectorAll('#tfLocationSheet [data-address]').forEach(el=>{el.dataset.address=address});
   }).catch(()=>{});
  }else clearHold();
 };
 canvas.addEventListener('touchstart',e=>{
  if(placing){if(e.touches.length!==1){restorePan();clearHold()}return}
  clearHold();if(e.touches.length!==1)return;
  const t=e.touches[0];startPoint={x:t.clientX,y:t.clientY};
  holdTimer=setTimeout(()=>{
   if(!startPoint||liveMap!==mapForPress)return;
   const p=startPoint;holdTimer=null;
   const rect=canvas.getBoundingClientRect();const geo=mapForPress.unproject([p.x-rect.left,p.y-rect.top]);
   if(!Number.isFinite(geo.lat)||!Number.isFinite(geo.lng))return;
   placing=true;dragWasEnabled=mapForPress.dragPan.isEnabled();
   if(dragWasEnabled)mapForPress.dragPan.disable();
   placedPoint={lat:geo.lat,lon:geo.lng};
   pendingMapMarker?.remove();
   const el=tradeFlowMarker('var(--tf-accent)');el.classList.add('tradeflow-map-marker-temp','tf-map-placing');
   pendingMapMarker=new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([geo.lng,geo.lat]).addTo(mapForPress);
   if(navigator.vibrate)navigator.vibrate(12);
  },460);
 },{passive:true});
 canvas.addEventListener('touchmove',e=>{
  if(placing){
   e.preventDefault();if(e.touches.length!==1){restorePan();clearHold();pendingMapMarker?.remove();pendingMapMarker=null;return}
   updatePin(e.touches[0]);return;
  }
  if(!startPoint||e.touches.length!==1){clearHold();return}
  const t=e.touches[0];if(Math.hypot(t.clientX-startPoint.x,t.clientY-startPoint.y)>10)clearHold();
 },{passive:false});
 canvas.addEventListener('touchend',finishHold,{passive:false});
 canvas.addEventListener('touchcancel',()=>{if(placing){restorePan();pendingMapMarker?.remove();pendingMapMarker=null}suppressClickUntil=Date.now()+750;clearHold()},{passive:true});
 liveMap.on('contextmenu',e=>{e.preventDefault?.();lastMapTap=Date.now();const request=++mapClickRequest;showTemporaryMapLocation(mapForPress,d,e.lngLat.lat,e.lngLat.lng,'');void reverseMapAddress(e.lngLat.lat,e.lngLat.lng).then(address=>{if(request===mapClickRequest&&address){window.TradeFlowMapExperience?.updateAddress?.(address);document.querySelectorAll('#tfLocationSheet [data-address]').forEach(el=>{el.dataset.address=address})}}).catch(()=>{})});
 liveMap.on('click',async e=>{if(Date.now()<suppressClickUntil)return;const target=e.originalEvent&&e.originalEvent.target;if(target&&target.closest&&target.closest('.maplibregl-marker,.maplibregl-popup'))return;if(e.originalEvent&&e.originalEvent.detail>1)return;const now=Date.now();if(now-lastMapTap<350)return;lastMapTap=now;const request=++mapClickRequest,lat=e.lngLat.lat,longitude=e.lngLat.lng;
  showTemporaryMapLocation(mapForPress,d,lat,longitude,'');
  const address=await reverseMapAddress(lat,longitude).catch(()=>null);
  if(request===mapClickRequest&&address){window.TradeFlowMapExperience?.updateAddress?.(address);document.querySelectorAll('#tfLocationSheet [data-address]').forEach(el=>{el.dataset.address=address})}
 });
}const opportunities=activeOpportunityRecords.filter(opportunityMapped);const locations=[...(d.pins||[]).map(x=>({...x,mapKind:'pin'})),...opportunities.map(x=>({...x,longitude:x.longitude,mapKind:'opportunity'}))];for(const customer of d.customers||[]){let point=parseSavedCoordinates(customer.coordinates);/* Never block map load with external customer-address geocoding. */if(point)locations.push({id:customer.id,title:customer.name||'Customer',address:customer.address,latitude:point.latitude,longitude:point.longitude,mapKind:'customer'})}for(const job of d.jobs||[]){const point=parseSavedCoordinates(job.coordinates);if(point)locations.push({id:job.id,title:job.title||'Job',address:job.address,latitude:point.latitude,longitude:point.longitude,mapKind:'job',intakeMapStatus:job.intakeMapStatus||'',intakeMapSource:job.intakeMapSource||''})}for(const supplier of d.suppliers||[]){const point=window.TradeFlowCore?.position(supplier);if(point)locations.push({...supplier,id:supplier.id,title:supplier.name||'Supplier',address:supplier.address,latitude:point.lat,longitude:point.lon,mapKind:'supplier'})}
const hq=window.TradeFlowCore?.position({latitude:prefs.homeLat,longitude:prefs.homeLon});
if(hq)locations.unshift({id:'tradeflow-hq',title:prefs.company||'Business headquarters',address:prefs.businessAddress,phone:prefs.contactPhone||'',website:prefs.businessWebsite||'',businessHours:prefs.businessHours||'',photoUrl:prefs.businessPhotoUrl||'',latitude:hq.lat,longitude:hq.lon,mapKind:'headquarters'});mapSuggestionRecords=locations.filter(x=>Number.isFinite(x.latitude)&&Number.isFinite(x.longitude)).map(x=>({label:x.title||x.project_name||x.name||x.address||'Location',type:x.mapKind,latitude:x.latitude,longitude:x.longitude}));for(const x of locations.slice(0,600)){if(!Number.isFinite(x.latitude)||!Number.isFinite(x.longitude)||Math.abs(x.latitude)>90||Math.abs(x.longitude)>180)continue;const color=x.mapKind==='opportunity'?'var(--tf-accent)':'#22c0b3',markerEl=x.mapKind==='opportunity'?opportunityMapMarker(x):x.mapKind==='supplier'?tfSupplierMapMarker():x.mapKind==='headquarters'?tfHeadquartersMapMarker():tradeFlowMarker(color),title=x.title||x.project_name||'Map location',detail=x.address||x.city||x.opportunity_type||'Saved location',marker=new maplibregl.Marker({element:markerEl,anchor:'bottom'}).setLngLat([x.longitude,x.latitude]).addTo(liveMap);markerEl.addEventListener('click',e=>{e.stopPropagation();showExistingMapLocation(x)});mapMarkers.push(marker);if(x.mapKind==='opportunity')mapOpportunityDrawnIds.add(String(x.id))}updateOpportunityGeocodeStatus()}catch(err){const status=document.getElementById('mapStatus');if(status)status.textContent=`Map unavailable: ${err.message}. Your records remain available locally.`}}
async function searchMapAddressLegacy(){const q=document.getElementById('mapAddress')?.value.trim();if(!q)return;const status=document.getElementById('mapStatus');if(status)status.textContent='Searching…';try{const response=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(q),{headers:{'Accept':'application/json'}});if(!response.ok)throw Error('Search unavailable');const results=await response.json();if(!results.length)throw Error('No matching location');liveMap?.flyTo({center:[Number(results[0].lon),Number(results[0].lat)],zoom:14});if(status)status.textContent='Location found. Tap the map to save a pin.'}catch(err){if(status)status.textContent=err.message}}
function showSettingsPanel(which){const box=document.getElementById('tfSettingsPanel');if(!box)return;if(which==='close'){box.hidden=true;return}const headings={account:'Account access',profile:'Business profile',defaults:'Default settings',team:'Team',backup:'Backup & restore',storage:'Storage',appearance:'App appearance',about:'About & privacy',help:'Help & support'};let content='';if(which==='account')content=window.TradeFlowAccountSession.view();if(which==='profile')content=`<form id="settingsForm" class="tf-settings-form"><label>Business name<input name="company" required maxlength="70" value="${esc(prefs.company)}"></label><label>Primary trade<input name="primaryTrade" list="tfBusinessTrades" required maxlength="50" value="${esc(prefs.primaryTrade||'')}" placeholder="Choose or enter your trade"></label><datalist id="tfBusinessTrades">${tfTradeCatalog.map(([name])=>`<option value="${esc(name)}"></option>`).join('')}</datalist><label>Service city / region<input name="serviceArea" maxlength="120" value="${esc(prefs.serviceArea||'')}" placeholder="e.g. Austin, Texas"></label><label>Contact name<input name="contactName" maxlength="100" value="${esc(prefs.contactName||'')}"></label><label>Email<input type="email" name="contactEmail" value="${esc(prefs.contactEmail||'')}"></label><label>Phone<input type="tel" name="contactPhone" value="${esc(prefs.contactPhone||'')}"></label><label>Business address<input name="businessAddress" value="${esc(prefs.businessAddress||'')}" placeholder="Street address or full Google Maps place link"></label>
<p>${window.TradeFlowCore?.position({latitude:prefs.homeLat,longitude:prefs.homeLon})?'⌂ Headquarters pin ready · check it on the Map':prefs.businessAddress?'Address saved · pin needs location confirmation':'Add your headquarters address to create its Map pin'}. You can paste a full Google Maps place link or select the exact pin on Map.</p>
${prefs.businessAddress?'<button class="tf-settings-save" type="button" data-action="businessLocate">⌖ Locate / view headquarters</button>':''}
<button class="tf-settings-save" type="submit">Save changes</button></form>`;if(which==='appearance')content=`<form id="appearanceForm" class="tf-settings-form"><label>Accent color<input type="color" name="accent" value="${esc(prefs.accent)}"></label><button class="tf-settings-save" type="submit">Save changes</button></form>`;if(which==='backup')content=`<p>Your records live on this device. Restoring a backup replaces existing records.</p><div class="tf-settings-backup"><button data-action="export" type="button">Export backup</button><button data-action="downloadRecovery" type="button">Download pre-restore recovery backup</button><label for="restoreFile">Restore backup</label><input id="restoreFile" type="file" accept="application/json,.json" hidden></div><p>No automatic cloud sync or encryption is provided.</p>`;if(which==='defaults')content='<p>Currency, tax, and measurement settings are planned. Existing financial values remain unchanged.</p>';if(which==='team')content='<p>Team accounts are not available in this offline-only version.</p>';if(which==='storage')content='<p>Business records are stored in this browser on your device. Export a backup before clearing browser data.</p>';if(which==='help')content='<p>TradeFlow works offline for saved records. Map tiles and address lookup require internet. Review research evidence before contacting prospects. Export regular backups under Data & Storage.</p>';if(which==='about')content='<p>TradeFlow Lite stores business records locally in this browser. Back up regularly. Maps and address lookup require an internet connection.</p>';box.innerHTML=`<div class="tf-settings-panelhead"><h3>${headings[which]||'Settings'}</h3><button type="button" data-action="settingsPanel" data-panel="close" aria-label="Close">×</button></div>${content}`;box.hidden=false;box.scrollIntoView({behavior:'smooth',block:'start'});if(which==='account')void window.TradeFlowAccountSession.refresh()}
document.addEventListener('click',e=>{if(e.target.closest?.('[data-account-refresh]'))void window.TradeFlowAccountSession.refresh()});
async function setMapHome(){if(!liveMap)return alert('Open the map while online first.');const c=liveMap.getCenter();prefs.homeLat=Number(c.lat.toFixed(6));prefs.homeLon=Number(c.lng.toFixed(6));await put('settings',{id:'business',...prefs});notify('Home map location saved')}
async function focusMapPin(id){const x=await get('pins',id);if(x&&liveMap)liveMap.flyTo({center:[x.longitude,x.latitude],zoom:15})}
function mapNominatim(url){const request=mapRequestQueue.then(async()=>{const delay=Math.max(0,nextMapRequestAt-Date.now());if(delay)await new Promise(resolve=>setTimeout(resolve,delay));nextMapRequestAt=Date.now()+1100;const response=await fetch(url,{headers:{'Accept-Language':'en'}});if(!response.ok)throw Error(`Geocoding unavailable (${response.status})`);return response.json()});mapRequestQueue=request.catch(()=>{});return request}
/* A location is map-ready only when actual coordinates have been resolved.
   Lookups are one-off, user-initiated or triggered by saving a changed address;
   no bulk crawling or unconfirmed city-level fallback is permitted. */
async function tfFindMapPoint(address,interactive=false){
 const resolver=window.TradeFlowAddress,raw=String(address||'').trim();
 if(!resolver||!raw)return {status:'missing_address'};
 const google=resolver.googlePinCoordinates(raw);
 if(google)return {status:'located',lat:google.lat,lon:google.lon,label:'Google Maps selected point',quality:'review'};
 if(navigator.onLine===false)return {status:'offline'};
 if(/^https?:\/\//i.test(raw))return {status:'unsupported_map_link'};
 let review=null;
 for(const query of resolver.queries(raw)){
  try{
   const url='https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q='+encodeURIComponent(query);
   const key='tf-address:'+query.toLowerCase().replace(/\s+/g,' ');
   let hits=mapGeocodeCache.get(key);
   if(!hits){hits=await mapNominatim(url);if(Array.isArray(hits)&&hits.length)mapGeocodeCache.set(key,hits.slice(0,5))}
   const choice=resolver.select(raw,hits);
   if(choice?.confidence==='high')return {status:'located',...choice,quality:'review'};
   if(choice&&!review)review=choice;
  }catch(error){return {status:'lookup_error',reason:String(error?.message||error).slice(0,180)}}
 }
 if(review&&interactive&&confirm('Possible location for '+raw+':\n'+review.display+'\n\nUse this suggested point? You can verify and move it on the map.')){
  return {status:'located',...review,quality:'review'};
 }
 return review?{status:'needs_review',suggested:review.display}:{status:'not_found'};
}
let tfSupplyLocationRepairRunning=false;
async function tfResolveSupplyLocations(options={}){
 if(tfSupplyLocationRepairRunning)return {busy:true};
 tfSupplyLocationRepairRunning=true;
 const report={located:0,unresolved:0,offline:0,checked:0,remaining:0};
 try{
  const limit=Math.max(1,Math.min(3,Number(options.max)||3)),data=Object.fromEntries(await Promise.all(['settings','suppliers','supplyOrders','customers','jobs'].map(async s=>[s,await all(s)])));
  const settings=data.settings.find(s=>s.id==='business')||{},queue=[];
  const add=(store,id,address)=>{if(String(address||'').trim())queue.push({store,id,address:String(address).trim()})};
  const wantBusiness=!!options.onlyBusiness||!!options.includeBusiness||(!options.skipBusiness&&!options.supplierIds&&!options.orderIds);
  if(wantBusiness&&!window.TradeFlowCore.position({latitude:settings.homeLat,longitude:settings.homeLon}))add('settings','business',settings.businessAddress);
  const suppliers=options.onlyBusiness||(!options.supplierIds&&options.orderIds)?[]:data.suppliers.filter(s=>!options.supplierIds||options.supplierIds.includes(s.id));
  for(const supplier of suppliers)if(!window.TradeFlowCore.position(supplier))add('suppliers',supplier.id,supplier.address);
  const orders=options.onlyBusiness||(options.supplierIds&&!options.orderIds)?[]:data.supplyOrders.filter(o=>!options.orderIds||options.orderIds.includes(o.id));
  const added=new Set();
  for(const order of orders){
   if(order.status==='Cancelled')continue;
   if(order.destinationKind==='custom'&&!window.TradeFlowCore.position(order))add('supplyOrders',order.id,order.destinationAddress);
   if(order.destinationKind==='customer'||order.destinationKind==='job'){
    const store=order.destinationKind==='customer'?'customers':'jobs',target=data[store].find(x=>x.id===order.destinationId);
    if(target&&!window.TradeFlowCore.position(target)&&!added.has(store+':'+target.id)){added.add(store+':'+target.id);add(store,target.id,target.address)}
   }
  }
  report.remaining=Math.max(0,queue.length-limit);
  for(const item of queue.slice(0,limit)){
   const result=await tfFindMapPoint(item.address,!!options.interactive);
   report.checked++;
   if(result.status==='offline'||result.status==='lookup_error'){report.offline++;report.lastError=result.reason||result.status;continue}
   if(result.status!=='located'){report.unresolved++;report.lastError=result.status==='unsupported_map_link'?'Use a street address or choose a pin on Map. Short Google Maps links do not contain usable coordinates.':result.suggested?'Location needs confirmation: '+result.suggested:'No specific building-level match';continue}
   const old=await get(item.store,item.id);
   if(!old)continue;
   const expected=item.store==='settings'?'businessAddress':item.store==='supplyOrders'?'destinationAddress':'address';
   if(String(old[expected]||'').trim()!==item.address)continue; // Prevent stale lookup overwriting a changed address.
   const update={...old,updatedAt:new Date().toISOString(),mapLocationStatus:'needs_review',mapAddressResult:result.label||result.display||item.address};
   if(item.store==='settings'){
    update.homeLat=result.lat;update.homeLon=result.lon;
    prefs={...prefs,homeLat:result.lat,homeLon:result.lon};
   }else if(item.store==='suppliers'||item.store==='supplyOrders'){
    update.latitude=result.lat;update.longitude=result.lon;
   }else{
    update.coordinates=JSON.stringify({lat:result.lat,lng:result.lon});
   }
   await put(item.store,update);
   if(item.store==='settings')mapLastView=null;
   report.located++;
  }
  return report;
 }finally{tfSupplyLocationRepairRunning=false}
}
function parseSavedCoordinates(value){if(!value)return null;let point=value;if(typeof value==='string'){try{point=JSON.parse(value)}catch{return null}}if(!point||typeof point!=='object')return null;const latitude=Number(point.lat??point.latitude),longitude=Number(point.lng??point.lon??point.longitude);return Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180?{latitude,longitude}:null}
async function geocodeMapAddress(address){const key=String(address||'').trim().toLowerCase();if(!key)return null;if(mapGeocodeCache.has(key))return mapGeocodeCache.get(key);try{const results=await mapNominatim(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`),point=results&&results[0]?{lat:Number(results[0].lat),lon:Number(results[0].lon),label:String(results[0].display_name||address)}:null;mapGeocodeCache.set(key,point);return point}catch{mapGeocodeCache.set(key,null);return null}}
async function reverseMapAddress(latitude,longitude){const key=`reverse:${latitude.toFixed(5)},${longitude.toFixed(5)}`;if(mapGeocodeCache.has(key))return mapGeocodeCache.get(key);try{const result=await mapNominatim(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`),address=result&&result.display_name?String(result.display_name):null;mapGeocodeCache.set(key,address);return address}catch{mapGeocodeCache.set(key,null);return null}}
function tfHeadquartersMapMarker(){const el=document.createElement('div');el.className='tradeflow-map-marker-headquarters';el.setAttribute('role','img');el.setAttribute('aria-label','Business headquarters');el.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V9l8-5 8 5v11M2 20h20M9 20v-7h6v7M8 10h.01M16 10h.01"/></svg>';
const tokens=String(prefs.company||'Headquarters').trim().split(/\s+/).filter(Boolean);
const letters=(tokens.length>1?tokens.slice(0,2).map(word=>word.slice(0,1)).join(''):tokens[0]?.slice(0,2)||'HQ').toLocaleUpperCase();
const label=document.createElement('span');label.className='tf-map-hq-initials';label.textContent=letters;el.appendChild(label);
el.setAttribute('aria-label',String(prefs.company||'Business')+' headquarters');return el}
function tfSupplierMapMarker(){const el=document.createElement('div');el.className='tradeflow-map-marker-supplier';el.setAttribute('aria-label','Supplier location');el.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 20V9l6-5 6 5v11M15 9l4-3 2 3v11M2 20h20M7 20v-6h4v6"/></svg>';return el}
function tradeFlowMarker(color='#22c0b3'){const element=document.createElement('div');element.className='tradeflow-map-marker';element.innerHTML=`<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16 2C9.1 2 3.5 7.6 3.5 14.5c0 9.7 12.5 15.8 12.5 15.8S28.5 24.2 28.5 14.5C28.5 7.6 22.9 2 16 2zm0 15.2a5.2 5.2 0 110-10.4 5.2 5.2 0 010 10.4z" fill="${color}"/><circle cx="16" cy="12.5" r="2.8" fill="#10263d"/></svg>`;return element}
function closeTradeFlowSheet(){window.TradeFlowMapExperience?.close();document.getElementById('tfLocationSheet')?.remove();document.getElementById('tfSheetShade')?.remove()}
function openTradeFlowSheet(html){closeTradeFlowSheet();const shade=document.createElement('div');shade.id='tfSheetShade';shade.className='tf-sheet-shade';shade.addEventListener('click',closeTradeFlowSheet);const sheet=document.createElement('section');sheet.id='tfLocationSheet';sheet.className='tf-location-sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-label','Location details');sheet.innerHTML='<div class="tf-sheet-grip"></div><button class="tf-sheet-close" type="button" aria-label="Close location details">×</button>'+html;document.body.append(shade,sheet);sheet.querySelector('.tf-sheet-close').addEventListener('click',closeTradeFlowSheet);let touchStart=null;sheet.addEventListener('touchstart',e=>{if(e.target.closest('button,a,select,input,details'))return;touchStart=e.touches[0]?.clientY??null},{passive:true});sheet.addEventListener('touchend',e=>{if(touchStart===null)return;const delta=(e.changedTouches[0]?.clientY??touchStart)-touchStart;if(delta>95)closeTradeFlowSheet();else if(delta< -95)sheet.classList.add('tf-sheet-expanded');touchStart=null},{passive:true})}
function tfLocationCard(name,address,latitude,longitude,extra='',attrs=''){
const shortAddress=String(address||'').split(',').slice(0,3).join(',').trim()||'Coordinates selected';
const directions='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(latitude+','+longitude);
return `<div class="tf-sheet-eyebrow">SELECTED LOCATION</div><h2>${esc(name||'Map location')}</h2><p class="tf-sheet-address">${esc(shortAddress)}</p><p class="tf-sheet-coords">${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}</p><div class="tf-sheet-primary"><a class="tf-sheet-primary-action" href="${directions}" target="_blank" rel="noopener"><span>➤</span>Directions</a><button type="button" class="tf-sheet-primary-action" data-map-action="save" ${attrs}><span>♧</span>Save</button><button type="button" class="tf-sheet-primary-action" data-map-action="opportunity" ${attrs}><span>＋</span>Create</button></div>${extra?'<details class="tf-sheet-more"><summary>More actions</summary>'+extra+'</details>':''}`;
}
function showTemporaryMapLocation(map,data,latitude,longitude,address){
if(pendingMapMarker)pendingMapMarker.remove();
const element=tradeFlowMarker('var(--tf-accent)');element.classList.add('tradeflow-map-marker-temp');
pendingMapMarker=new maplibregl.Marker({element,anchor:'bottom'}).setLngLat([longitude,latitude]).addTo(map);
const customers=(data.customers||[]).map(x=>`<option value="${esc(x.id)}">${esc(x.name||'Customer')}</option>`).join('');
const jobs=(data.jobs||[]).map(x=>`<option value="${esc(x.id)}">${esc(x.title||'Job')}</option>`).join('');
const suppliers=(data.suppliers||[]).map(x=>`<option value="${esc(x.id)}">${esc(x.name||'Supplier')}</option>`).join('');
const attrs=`data-lat="${latitude}" data-lng="${longitude}" data-address="${esc(address||'')}"`;
const more=`<div class="tf-sheet-link-grid"><button type="button" class="btn secondary small" data-map-action="business" ${attrs}>Set as business HQ</button><label>Link customer<select class="input" data-link-customer><option value="">Choose customer</option>${customers}</select></label><button class="btn secondary small" data-map-action="customer" ${attrs}>Link</button><label>Link job<select class="input" data-link-job><option value="">Choose job</option>${jobs}</select></label><button class="btn secondary small" data-map-action="job" ${attrs}>Link</button><label>Link supplier<select class="input" data-link-supplier><option value="">Choose supplier</option>${suppliers}</select></label><button class="btn secondary small" data-map-action="supplier" ${attrs}>Link</button></div>`;
const name=String(address||'').split(',')[0]||'Dropped pin';
if(window.TradeFlowMapExperience){window.TradeFlowMapExperience.open({record:{name,address,latitude,longitude,mapKind:'temporary'},extra:more,attrs});return}
openTradeFlowSheet(tfLocationCard(name,address,latitude,longitude,more,attrs));
}
function showExistingMapLocation(record){
const name=record.title||record.project_name||record.name||'Location',address=record.address||record.city||'Saved map location';
const attrs=`data-lat="${record.latitude}" data-lng="${record.longitude}" data-address="${esc(address)}"`;
const more=`${record.mapKind==='opportunity'&&record.map_location_status!=='verified'?'<p class="muted sub" style="color:#f28d91">● Location requires verification; map point may not be exact.</p>':''}${record.mapKind==="headquarters"?'<button type="button" class="btn secondary small" data-tab="preferences">Business profile →</button>':""}${record.source_url&&/^https:\/\//.test(record.source_url)?`<a class="btn secondary small" href="${esc(record.source_url)}" target="_blank" rel="noopener">View original source ↗</a>`:''}${record.mapKind==='opportunity'?'<p class="muted sub">Research signal — not a confirmed open bid.</p>':''}${record.mapKind==='job'&&record.intakeMapStatus==='provided_unverified'?'<p class="muted sub">Imported coordinates supplied by the owner — location not independently verified.</p>':''}`;
if(window.TradeFlowMapExperience){window.TradeFlowMapExperience.open({record:{...record,name,address},extra:more,attrs});return}
openTradeFlowSheet(tfLocationCard(name,address,record.latitude,record.longitude,more,attrs));
}
async function handleMapAction(action,metadata){const latitude=Number(metadata.lat),longitude=Number(metadata.lng),coordinates=JSON.stringify({lat:latitude,lng:longitude});if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return;try{if(action==='save'){const title=prompt('Name this location','Saved location');if(title===null||!title.trim())return;await put('pins',{id:uid(),title:title.trim().slice(0,120),type:'Manual pin',latitude,longitude,address:metadata.address||'',createdAt:new Date().toISOString()})}else if(action==='opportunity'){const title=prompt('Opportunity name','New opportunity');if(title===null)return;const amount=Number(prompt('Estimated value ($)','0'));const record={id:uid(),project_name:title.trim()||'New opportunity',organization_name:'',opportunity_type:'business_prospect',status:'New',evidence_status:'unverified',verification_status:'user_created',source_type:'manual_map_pin',project_description:'Manually created from map; demand has not been verified.',latitude,longitude,map_location_status:'manual_confirmed',map_address_result:metadata.address||'',address:metadata.address||'',estimated_value:Number.isFinite(amount)?amount:0,createdAt:new Date().toISOString(),research_date:today()};await put('opportunities',record);opportunityBackgroundMapResult(record);await event(`Created opportunity from map: ${record.project_name}`)}else if(action==='business'){prefs.homeLat=latitude;prefs.homeLon=longitude;prefs.mapLocationStatus='needs_review';prefs.mapAddressResult=metadata.address||'Manually selected map point';if(!prefs.businessAddress)prefs.businessAddress=metadata.address||'';await put('settings',{id:'business',...prefs});mapLastView=null;await event('Updated business headquarters location')}else if(action==='supplier'){const id=metadata.supplierId;if(!id){alert('Choose a supplier to link first.');return}const record=await get('suppliers',id);if(!record){alert('Supplier record missing.');return}await put('suppliers',{...record,latitude,longitude,address:metadata.address||record.address,updatedAt:new Date().toISOString()});await event('Linked supplier map position: '+record.name)}else if(action==='customer'||action==='job'){const store=action==='customer'?'customers':'jobs',id=action==='customer'?metadata.customerId:metadata.jobId;if(!id){alert(`Choose a ${action} to link first.`);return}const record=await get(store,id);if(!record){alert(`The selected ${action} no longer exists. Refresh and try again.`);return}record.coordinates=coordinates;if(metadata.address)record.address=metadata.address;await put(store,record);await event(`Linked map location to ${action==='customer'?record.name:record.title}`)}else return;closeTradeFlowSheet();window.TradeFlowMapExperience?.close();if(pendingMapMarker)pendingMapMarker.remove();pendingMapPopup=null;pendingMapMarker=null;notify(action==='save'?'Location saved':action==='opportunity'?'Opportunity created':action==='customer'?'Customer linked':action==='supplier'?'Supplier linked':action==='business'?'Business headquarters located':'Job linked')}catch(error){alert(`Unable to complete map action: ${error.message}`)}}
let mapSuggestionRecords=[];
let tfSmartMapTimer=null,tfSmartMapSequence=0;
function tfMapNormalize(s){return String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.,;:]+/g,' ').replace(/\s+/g,' ').trim()}
function tfMapPhotonLabel(feature){const p=feature.properties||{};return [p.name,p.housenumber,p.street,p.city||p.town||p.village,p.state,p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ')}
function scheduleSmartMapSuggestions(query){
 clearTimeout(tfSmartMapTimer);const seq=++tfSmartMapSequence,q=tfMapNormalize(query);
 if(q.length<3)return;
 tfSmartMapTimer=setTimeout(async()=>{
  const box=document.getElementById('tfMapSuggestions'),field=document.getElementById('mapAddress');
  if(!box||!field||tfMapNormalize(field.value)!==q)return;
  try{
   const url='https://photon.komoot.io/api/?limit=6&q='+encodeURIComponent(query.trim());
   const response=await fetch(url,{headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Suggestions unavailable');
   const payload=await response.json();
   if(seq!==tfSmartMapSequence||!document.getElementById('tfMapSuggestions'))return;
   const seen=new Set(),remote=(payload.features||[]).map(x=>({label:tfMapPhotonLabel(x),type:'Suggested address',longitude:Number(x.geometry?.coordinates?.[0]),latitude:Number(x.geometry?.coordinates?.[1])})).filter(x=>{
    const key=tfMapNormalize(x.label);if(!key||seen.has(key)||!Number.isFinite(x.latitude)||!Number.isFinite(x.longitude))return false;seen.add(key);return true
   }).slice(0,6);
   const local=mapSuggestionRecords.filter(x=>tfMapNormalize(x.label).includes(q)).slice(0,3);
   showMapSuggestionChoices(query,[...local,...remote],remote.length?'Choose a suggested location · confirm on map':'No online suggestions');
  }catch{if(seq===tfSmartMapSequence)showMapSuggestionChoices(query,mapSuggestionRecords.filter(x=>tfMapNormalize(x.label).includes(q)).slice(0,5),'Online suggestions unavailable · use full search')}
 },750);
}
function showMapSuggestionChoices(query,matches,hint){
 const box=document.getElementById('tfMapSuggestions'),field=document.getElementById('mapAddress');
 if(!box||!field||tfMapNormalize(field.value)!==tfMapNormalize(query))return;
 box._matches=matches;
 box.innerHTML=matches.map((x,i)=>`<button type="button" role="option" data-map-suggestion="${i}"><span>⌖</span><span>${esc(x.label)}<small>${esc(x.type==='Suggested address'?'Address suggestion · verify pin':x.type+' · saved record')}</small></span></button>`).join('')+
 `<button type="button" data-action="mapSearch"><span>⌕</span><span>Search more locations<small>${esc(hint)} · or tap the map to place a pin</small></span></button>`;
 box.hidden=false;
}
function showLocalMapSuggestions(text){const box=document.getElementById('tfMapSuggestions');if(!box)return;const q=String(text||'').trim().toLowerCase();if(q.length<2){box.hidden=true;return}const matches=mapSuggestionRecords.filter(x=>tfMapNormalize(x.label).includes(tfMapNormalize(q))).slice(0,6);showMapSuggestionChoices(text,matches,'Searching online for nearby matches')}
document.addEventListener('click',event=>{const button=event.target.closest('[data-map-suggestion]');if(!button)return;event.stopImmediatePropagation();const box=document.getElementById('tfMapSuggestions'),match=box?._matches?.[Number(button.dataset.mapSuggestion)];if(!match)return;++tfSmartMapSequence;clearTimeout(tfSmartMapTimer);box.hidden=true;document.getElementById('mapAddress').value=match.label;document.getElementById('mapAddress').blur();liveMap?.flyTo({center:[match.longitude,match.latitude],zoom:Math.min(14,Math.max(11,liveMap.getZoom?.()||12)),essential:true});const status=document.getElementById('mapStatus');if(status)status.textContent='Suggested location shown · verify the pin and tap map to assign it'});
async function searchMapAddress(){const query=document.getElementById('mapAddress')?.value.trim();if(!query)return;const suggestions=document.getElementById('tfMapSuggestions');if(suggestions)suggestions.hidden=true;const status=document.getElementById('mapStatus');if(status)status.textContent='Searching…';try{const variants=[query,tfMapNormalize(query)].filter((v,i,a)=>v&&a.indexOf(v)===i);let results=[];
for(const q of variants){results=await mapNominatim(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`);if(results.length)break}
if(!results.length){showMapSuggestionChoices(query,[],'No exact match · try a shorter street name, city, or place a pin');if(status)status.textContent='No exact match · try a shorter street name or tap the map to place a pin';return}
const matches=results.map(x=>({label:String(x.display_name||query),type:'Search result',longitude:Number(x.lon),latitude:Number(x.lat)})).filter(x=>Number.isFinite(x.latitude)&&Number.isFinite(x.longitude));
showMapSuggestionChoices(query,matches,'Select the correct result');
if(status)status.textContent=matches.length+' possible locations · select one to preview'}catch(error){if(status)status.textContent=`${error.message}. Coordinates can still be used by tapping the map.`}}
function getFinanceSeries(data,period='All'){
 const now=new Date(),end=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
 let start=new Date(end);
 const ranges={'1W':7,'3M':90,'6M':180,'1Y':365,'All':3650};
 if(period==='1M')start=new Date(now.getFullYear(),now.getMonth(),1,12);
 else start.setDate(start.getDate()-(ranges[period]||3650)+1);
 const dayKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 const buckets=new Map();
 for(let date=new Date(start);date<=end;date.setDate(date.getDate()+1)){const key=dayKey(date);buckets.set(key,{date:new Date(date),revenue:0,expenses:0,profit:0,quoted:0})}
 const add=(dateValue,key,amount)=>{const date=String(dateValue||'').slice(0,10);const bucket=buckets.get(date);if(bucket&&Number.isFinite(Number(amount)))bucket[key]+=Number(amount)};
 for(const expense of data.expenses||[])add(expense.date,'expenses',expense.amount);
 for(const payment of data.payments||[])add(payment.date,'revenue',payment.amount);
 for(const quote of data.quotes||[])add(quote.sentDate||quote.date,'quoted',quote.amount);
 const points=[...buckets.values()];for(const p of points)p.profit=p.revenue-p.expenses;
 return {points,hasRevenue:points.some(p=>p.revenue!==0),hasExpenses:points.some(p=>p.expenses!==0),hasProfit:points.some(p=>p.profit!==0),hasQuotes:points.some(p=>p.quoted!==0)};
}
function buildFinanceChartSvg(series,metric='Revenue',period='All'){const key={'Revenue':'revenue','Expenses':'expenses','Profit':'profit','Quoted Pipeline':'quoted'}[metric]||'revenue',points=series.points||[],hasData=key==='revenue'?series.hasRevenue:key==='expenses'?series.hasExpenses:key==='profit'?series.hasProfit:series.hasQuotes;const emptyNote=!hasData?(key==='revenue'?'No actual payments recorded yet. Quotes are not revenue.':key==='profit'?'Profit requires recorded revenue; expense-only figures are not profit.':key==='expenses'?'No expenses in this period.':'No quotes in this period.'):'';const values=points.map(point=>Number(point[key]||0)),minimum=Math.min(0,...values),maximum=Math.max(0,...values),span=maximum-minimum||1,width=760,height=220,margin={top:12,right:12,bottom:28,left:12},baseY=height-margin.bottom-(0-minimum)/span*(height-margin.top-margin.bottom),coordinates=values.map((value,index)=>[margin.left+index/Math.max(1,values.length-1)*(width-margin.left-margin.right),height-margin.bottom-(value-minimum)/span*(height-margin.top-margin.bottom)]),line=coordinates.map((point,index)=>`${index?'L':'M'} ${point[0]} ${point[1]}`).join(' '),area=`${line} L ${coordinates[coordinates.length-1][0]} ${baseY} L ${coordinates[0][0]} ${baseY} Z`,dots=coordinates.filter((point,index)=>index===coordinates.length-1||values[index]!==0).map(point=>`<circle cx="${point[0]}" cy="${point[1]}" r="3" fill="#22c0b3"/>`).join(''),total=values.reduce((sum,value)=>sum+value,0),firstDate=points[0]?.date.toLocaleDateString('en-US',{month:'short',year:'2-digit'})||'',lastDate=points[points.length-1]?.date.toLocaleDateString('en-US',{month:'short',year:'2-digit'})||'';return `${emptyNote?`<p class="muted sub" role="status">${emptyNote}</p>`:""}<div class="chart-shell"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(metric)} by date for ${esc(period)}"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#22c0b3" stop-opacity=".4"/><stop offset="100%" stop-color="#22c0b3" stop-opacity=".03"/></linearGradient></defs><path d="${area}" fill="url(#chartFill)"/><path d="${line}" fill="none" stroke="#22c0b3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}<text x="${margin.left}" y="${height-5}" fill="#c6d7df" font-size="11">${esc(firstDate)}</text><text x="${width-margin.right}" y="${height-5}" fill="#c6d7df" font-size="11" text-anchor="end">${esc(lastDate)}</text></svg></div><div class="chart-summary"><span class="muted sub">${metric==='Quoted Pipeline'?'Quote value in period':'Net recorded amount in period'}</span><strong>${euro(total)}</strong></div><p class="muted sub">Only expenses and quote amounts are stored today; accepted quotes are not revenue. Revenue entries are not yet supported.</p>`}
const tfHomeIcons={
cash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></svg>',
customers:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="7" r="3.2"/><circle cx="17" cy="8" r="2.7"/><path d="M2 20v-2.4c0-4.1 3.3-6.4 7-6.4s7 2.3 7 6.4V20H2zm15-7.8c3.2.2 5 2.1 5 5V20h-4v-2.4c0-2-.4-3.7-1-5.4z"/></svg>',
quotes:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 2h10l5 5v15H5zM15 2v6h5M8 12h9M8 16h9M8 19h6"/></svg>',
jobs:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 16a9 9 0 0 1 6-8V4h6v4a9 9 0 0 1 6 8v2H3zm-1 3h20v3H2zM11 3h2v9h-2z"/></svg>',
tasks:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>',
bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M10 21h4"/></svg>',
bolt:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 1 3 14h8l-1 9 11-14h-8z"/></svg>'
};
let homePeriod='1M';
function buildHomeRevenueChart(d,period){
const series=getFinanceSeries(d,period),raw=series.points;
const count=period==='1W'?7:period==='1M'?10:12;
const groupSize=Math.max(1,Math.ceil(raw.length/count));
const groups=[];for(let i=0;i<raw.length;i+=groupSize)groups.push(raw.slice(i,i+groupSize));
const sampled=groups.map(g=>({date:g[g.length-1].date,value:g.reduce((n,p)=>n+Number(p.revenue||0),0)}));
const values=sampled.map(p=>p.value),total=values.reduce((x,y)=>x+y,0),max=Math.max(1,...values),w=720,h=245,left=8,right=8,top=24,bottom=36;
const coords=sampled.map((p,i)=>({x:left+i/Math.max(1,sampled.length-1)*(w-left-right),y:top+(1-p.value/max)*(h-top-bottom)}));
const curve=coords.map((p,i)=>{if(!i)return 'M '+p.x+' '+p.y;const prev=coords[i-1],mid=(prev.x+p.x)/2;return ' C '+mid+' '+prev.y+' '+mid+' '+p.y+' '+p.x+' '+p.y}).join('');
const area=curve+' L '+coords[coords.length-1].x+' '+(h-bottom)+' L '+coords[0].x+' '+(h-bottom)+' Z';
const labels=sampled.map((p,i)=>({x:coords[i].x,text:p.date.toLocaleDateString('en-US',{day:'numeric',month:'short'})}));
const hasRevenue=total>0;
const html=`<div class="tf-revenue-plot" data-chart-values="${esc(JSON.stringify(sampled.map((p,i)=>({x:coords[i].x,y:coords[i].y,value:p.value,date:p.date.toLocaleDateString('en-US',{day:'numeric',month:'short'})}))))}"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Interactive revenue chart. Drag to inspect recorded amounts."><defs><linearGradient id="tfHomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--tf-accent)" stop-opacity=".58"/><stop offset="1" stop-color="var(--tf-accent)" stop-opacity=".02"/></linearGradient><filter id="tfHomeGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${[0,1,2,3].map(i=>`<line x1="8" x2="712" y1="${top+i*(h-top-bottom)/3}" y2="${top+i*(h-top-bottom)/3}" stroke="#3c7183" stroke-opacity=".22"/>`).join('')}<path d="${area}" fill="url(#tfHomeFill)"/><path d="${curve}" fill="none" stroke="var(--tf-accent)" stroke-width="2.8" filter="url(#tfHomeGlow)"/><line class="tf-chart-crosshair" y1="${top}" y2="${h-bottom}" stroke="var(--tf-accent)" stroke-width="1.3" stroke-dasharray="6 5" visibility="hidden"/><circle class="tf-chart-dot" r="6" fill="#efffff" stroke="var(--tf-accent)" stroke-width="3" visibility="hidden"/>${labels.filter((_,i)=>i===0||i===labels.length-1||period==='1W').map(p=>`<text x="${p.x}" y="${h-6}" text-anchor="${p.x<30?'start':p.x>680?'end':'middle'}" fill="#a2c0d0" font-size="13">${esc(p.text)}</text>`).join('')}</svg><div class="tf-chart-tooltip" hidden><strong></strong><small></small></div></div>`;
return {html,total,hasRevenue};
}
document.addEventListener('change',e=>{if(e.target.id==='tfHomePeriod'){homePeriod=e.target.value;render()}});
function tfHomeChartPointer(e){const plot=e.target.closest('.tf-revenue-plot');if(!plot)return;const points=JSON.parse(plot.dataset.chartValues||'[]');if(!points.length)return;const rect=plot.getBoundingClientRect(),x=Math.max(0,Math.min(720,(e.clientX-rect.left)/rect.width*720));const point=points.reduce((best,p)=>Math.abs(p.x-x)<Math.abs(best.x-x)?p:best,points[0]);const line=plot.querySelector('.tf-chart-crosshair'),dot=plot.querySelector('.tf-chart-dot'),tip=plot.querySelector('.tf-chart-tooltip');line.setAttribute('x1',point.x);line.setAttribute('x2',point.x);line.setAttribute('visibility','visible');dot.setAttribute('cx',point.x);dot.setAttribute('cy',point.y);dot.setAttribute('visibility','visible');tip.hidden=false;tip.querySelector('strong').textContent=euro(point.value);tip.querySelector('small').textContent=point.date;tip.style.left=Math.max(15,Math.min(rect.width-15,point.x/720*rect.width))+'px'}
document.addEventListener('pointerdown',e=>{if(e.target.closest('.tf-revenue-plot'))tfHomeChartPointer(e)});
document.addEventListener('pointermove',e=>{if(e.buttons&&e.target.closest('.tf-revenue-plot'))tfHomeChartPointer(e)});
function tfHomeChartEnd(e){const plot=e.target.closest('.tf-revenue-plot');if(!plot)return;plot.querySelector('.tf-chart-crosshair')?.setAttribute('visibility','hidden');plot.querySelector('.tf-chart-dot')?.setAttribute('visibility','hidden');const tip=plot.querySelector('.tf-chart-tooltip');if(tip)tip.hidden=true}
document.addEventListener('pointerup',tfHomeChartEnd);
document.addEventListener('tf-library-changed',()=>{if(tab==='library')render().catch(console.warn)});
window.addEventListener('tf-library-import',async event=>{const {file,target}=event.detail||{};if(!file||!tfImportDefs[target])return;tfImportDraft={target,filename:'',headers:null,rows:null,mapping:{},sourceDocumentId:event.detail?.sourceDocumentId||''};try{await tfImportReadFile(file)}catch(error){tfImportDraft=null;alert('Import: '+error.message)}});
document.addEventListener('pointercancel',tfHomeChartEnd);
const tfNavIcons={"dashboard":"<svg viewBox=\"0 0 24 24\" width=\"23\" height=\"23\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"m3 10 9-7 9 7v10H3z\"/><path d=\"M9 20v-7h6v7\"/></svg>","map":"<svg viewBox=\"0 0 24 24\" width=\"23\" height=\"23\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z\"/><path d=\"M9 3v15M15 6v15\"/></svg>","opportunities":"<svg viewBox=\"0 0 24 24\" width=\"23\" height=\"23\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"1.5\"/><path d=\"m12 12 8-8\"/></svg>","expenses":"<svg viewBox=\"0 0 24 24\" width=\"23\" height=\"23\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 20V12M9 20V6M14 20v-9M19 20V3\"/></svg>","settings":"<svg viewBox=\"0 0 24 24\" width=\"23\" height=\"23\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"5\" cy=\"6\" r=\"1\"/><circle cx=\"5\" cy=\"12\" r=\"1\"/><circle cx=\"5\" cy=\"18\" r=\"1\"/><path d=\"M10 6h11M10 12h11M10 18h11\"/></svg>"};
function applyTradeFlowAccent(value){
 // Local-first appearance engine: derive contrast-safe UI tokens for any user accent.
 const applied=window.TradeFlowAppearance?.apply(value);
 if(applied)return applied;
 const root=document.documentElement,accent=/^#[0-9a-fA-F]{6}$/.test(value||'')?value:'#10cfe1';
 root.style.setProperty('--tf-accent',accent);
 root.style.setProperty('--tf-accent-contrast','#041b29');
 return {accent};
}
let tfIntelligenceExpanded=false;
function tfIntelligenceStats(d){
 const localDate=(()=>{const x=new Date();return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')})();
 const active=(d.tasks||[]).filter(x=>x.status!=='Done'&&x.status!=='Completed'&&x.status!=='Cancelled');
 const urgent=active.filter(x=>['p1','p2','high','critical','urgent'].includes(String(x.priority||'').toLowerCase())&&x.due&&x.due<=localDate).length;
 const report=window.TradeFlowPilot?.evaluateSnapshot(d);
 const overdue=report?report.findings.filter(x=>x.detectorId==='task.overdue').length:active.filter(x=>x.due&&x.due<localDate).length;
 const conflicts=report?report.findings.filter(x=>x.detectorId==='calendar.conflict').length:window.TradeFlowCalendar?.conflicts?.(d)?.length||0;
 const proposals=window.TradeFlowScheduler?.analyze(d).proposals.length||0;
 return {urgent,overdue,conflicts,proposals};
}
function tfUnifiedHeader(d){
 const wordmark='<span class="tf-home-logo" aria-hidden="true"><svg viewBox="0 0 46 40"><path fill="#f0faff" d="M1 3h43l-5 9H27v25H17V12H6z"/><path fill="var(--tf-accent)" d="M28 15h15v10H28z"/></svg></span><span class="tf-unified-wordmark">TRADEFLOW</span>';
 const stats=tfIntelligenceStats(d);
 const concise=stats.conflicts?stats.conflicts+' scheduling conflict'+(stats.conflicts===1?'':'s'):stats.urgent?stats.urgent+' priority task'+(stats.urgent===1?'':'s')+' today':stats.overdue?stats.overdue+' overdue task'+(stats.overdue===1?'':'s'):stats.proposals?stats.proposals+' scheduling proposal'+(stats.proposals===1?'':'s'):'No urgent actions';
 const arrow='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 5 7 7-7 7"/></svg>';
 const chips=[
  {key:'tasks',name:'Priority tasks',count:stats.urgent||stats.overdue,icon:'☷',kind:'task'},
  {key:'conflicts',name:'Conflicts',count:stats.conflicts,icon:'!',kind:'conflict'},
  {key:'proposals',name:'Proposals',count:stats.proposals,icon:'✧',kind:'proposal'}
 ].map(x=>'<button type="button" class="tf-intel-chip tf-intel-'+x.kind+'" data-intel-action="'+x.key+'" aria-label="'+x.count+' '+x.name+'"><span class="tf-intel-symbol">'+x.icon+'</span><span class="tf-intel-number">'+x.count+'</span><span class="tf-intel-name">'+x.name+'</span>'+arrow+'</button>').join('');
 return '<header class="tf-unified-header" aria-label="TradeFlow app header"><div class="tf-unified-inner">'+
  '<button type="button" class="tf-unified-brand" data-intel-action="toggle" aria-label="Toggle TradeFlow intelligence actions" aria-expanded="'+tfIntelligenceExpanded+'">'+wordmark+'</button>'+
  '<div class="tf-intel-space"><button type="button" class="tf-intel-summary" data-intel-action="toggle" aria-expanded="'+tfIntelligenceExpanded+'" aria-label="Business intelligence: '+esc(concise)+'. '+(tfIntelligenceExpanded?'Collapse':'Expand')+' actions" '+(tfIntelligenceExpanded?'hidden':'')+'><span>'+esc(concise)+'</span>'+arrow+'</button>'+
  '<div class="tf-intel-actions" aria-label="Business intelligence actions" '+(tfIntelligenceExpanded?'':'hidden')+'>'+chips+'<button type="button" data-intel-action="toggle" class="tf-intel-collapse" aria-label="Collapse intelligence actions">‹</button></div></div>'+
  (window.TradeFlowNotifications?.home(d,tfHomeIcons.bell)||'<button type="button" class="tf-home-alert" data-tab="tasks" aria-label="Notifications">'+tfHomeIcons.bell+'</button>')+
  '</div></header>';
}
document.addEventListener('click',async function(e){
 const control=e.target.closest?.('[data-intel-action]');if(!control)return;
 e.preventDefault();e.stopImmediatePropagation();
 const action=control.dataset.intelAction;
 if(action==='toggle'){
  tfIntelligenceExpanded=!tfIntelligenceExpanded;
  const header=control.closest('.tf-unified-header');
  const summary=header?.querySelector('.tf-intel-summary'),actions=header?.querySelector('.tf-intel-actions');
  if(summary){summary.hidden=tfIntelligenceExpanded;summary.setAttribute('aria-expanded',String(tfIntelligenceExpanded))}
  if(actions)actions.hidden=!tfIntelligenceExpanded;
  (tfIntelligenceExpanded?actions?.querySelector('.tf-intel-chip'):summary)?.focus({preventScroll:true});
  return;
 }
 if(action==='tasks'){await tfPilotNavigateCommand('tasks');return}
 if(action==='conflicts'||action==='proposals'){
  tab='calendar';modal=null;window.TradeFlowCalendar?.focusIntelligence?.(action);await render();
 }
});

// A newly opened workspace or record view always begins at the top.
// Data-refresh renders within the same view retain their current scroll position.
let tfLastOpenedPageKey=null;
function tfOpenedPageKey(){
 return [tab,
  ['customers','quotes','jobs','tasks'].includes(tab)?tfRecordDetailId||'list':'',
  tab==='opportunities'?String(opportunityDetailId||'list')+':'+String(opportunityDetailScreen||''):'',
  tab==='expenses'?tfFinanceScreen:'',
  tab==='calendar'?window.TradeFlowCalendar?.currentContext?.()?.date||'':''
 ].join('|');
}
function tfScrollOpenedPageToTop(){
 const move=()=>{
  window.scrollTo(0,0);
  if(document.scrollingElement)document.scrollingElement.scrollTop=0;
  for(const selector of ['.main','.content']){
   const element=document.querySelector(selector);
   if(element)element.scrollTop=0;
  }
 };
 move();
 requestAnimationFrame(move);
}
async function tfSeedAustinStarter(data,profile,force=false){
 const pack=window.TradeFlowAustinStarter;
 if(!pack||( !force&&!pack.matches(profile)))return 0;
 const known=new Set((data.opportunities||[]).flatMap(x=>[String(x.id||''),String(x.originalRecordId||''),String(x.original_record_id||'')]));
 let count=0;
 for(const record of pack.records(profile,force)){
  if(known.has(record.id)||known.has(record.originalRecordId))continue;
  await put('opportunities',record);
  data.opportunities.push(record);
  known.add(record.id);known.add(record.originalRecordId);count++;
 }
 return count;
}
async function render(){if(tab!=='map')window.TradeFlowMapExperience?.close();const tfActiveMotion=tfMotionNext;tfMotionNext='';const savedSettings=await get('settings','business')||{};prefs={...prefs,...savedSettings};if(!savedSettings.accentCustomized&&String(prefs.accent||'').toLowerCase()==='#087f91')prefs.accent='#10cfe1';applyTradeFlowAccent(prefs.accent);const data=Object.fromEntries(await Promise.all(STORES.map(async store=>[store,await all(store)])));window.TradeFlowStarterMatches=window.TradeFlowStarterOpportunities?.select(data.opportunities,prefs,25)||[];if(tfOnboardingNeeded(savedSettings)){$('#app').innerHTML=tfOnboardingView(data);return}try{await tfSeedAustinStarter(data,prefs)}catch(error){console.warn('Starter opportunity import failed',error)}await window.TradeFlowNotifications?.bootstrap(data);const nav=Object.keys(names).map(key=>`<button class="nav ${tab===key?'active':''}" data-tab="${key}">${icons[key]} &nbsp; ${names[key]}</button>`).join(''),mobile=[['dashboard','Home',tfNavIcons.dashboard],['map','Map',tfNavIcons.map],['calendar','Calendar',tfRecordIcon('calendar',23)],['expenses','Finance',tfNavIcons.expenses],['settings','More',tfNavIcons.settings]].map(([key,label,icon])=>`<button data-tab="${key}" class="${tab===key?'active':''}"><span class="navicon" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('');$('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand">${esc(prefs.company)} <small style="font-size:10px;color:#a4bdc8">LITE</small></div>${nav}</aside><div class="main">${tfUnifiedHeader(data)}<main class="content">${toast?`<div class="notice" role="status">${esc(toast)}</div>`:''}${view(data)}</main><nav class="mobilebar">${mobile}</nav></div></div>${modal?formModal(data):''}${tfImportDraft?tfUniversalImportView(data):''}${tfCapture?tfCaptureView():''}${window.TradeFlowCustomerEntry?.view?.()||''}${window.TradeFlowVoice?.view?.()||''}<div id="tfAiOverlayRoot">${tfAiOverlayView()}</div>`;const nextPageKey=tfOpenedPageKey();
 if(nextPageKey!==tfLastOpenedPageKey){
  tfLastOpenedPageKey=nextPageKey;
  tfScrollOpenedPageToTop();
 }
 if(tab==='map')setTimeout(()=>initializeMap(data),0)}
// Touch acknowledgement uses transform/opacity only. Never delays an action or a data write.
const tfPressTarget='button:not(:disabled),a[href],label[for]';
let tfPressedControl=null;
document.addEventListener('pointerdown',event=>{
 if(tfPressedControl)tfPressedControl.classList.remove('tf-touch-pressed');
 const control=event.target.closest?.(tfPressTarget);
 tfPressedControl=null;
 if(!control||control.closest('.maplibregl-map'))return;
 tfPressedControl=control;
 control.classList.add('tf-touch-pressed');
},{capture:true,passive:true});
for(const eventName of ['pointerup','pointercancel']){
 document.addEventListener(eventName,()=>{
  const control=tfPressedControl;
  tfPressedControl=null;
  if(!control)return;
  setTimeout(()=>control.classList.remove('tf-touch-pressed'),eventName==='pointerup'?75:0);
 },{capture:true,passive:true});
}
window.addEventListener('blur',()=>{
 if(tfPressedControl)tfPressedControl.classList.remove('tf-touch-pressed');
 tfPressedControl=null;
});
document.addEventListener('click',async event=>{const button=event.target.closest('[data-map-action]');if(button){event.preventDefault();event.stopImmediatePropagation();const panel=button.closest('.tf-location-sheet');await handleMapAction(button.dataset.mapAction,{lat:button.dataset.lat,lng:button.dataset.lng,address:button.dataset.address,customerId:panel?.querySelector('[data-link-customer]')?.value,jobId:panel?.querySelector('[data-link-job]')?.value,supplierId:panel?.querySelector('[data-link-supplier]')?.value});return}const period=event.target.closest('[data-finance-period]');if(period){event.preventDefault();event.stopImmediatePropagation();financeState.period=period.dataset.financePeriod;render();return}const metric=event.target.closest('[data-finance-metric]');if(metric){event.preventDefault();event.stopImmediatePropagation();financeState.metric=metric.dataset.financeMetric;render()}},true)
