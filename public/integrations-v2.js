/* TradeFlow Integration Hub V2.
   Honest offline integration catalog, provider permission previews and useful manual handoffs.
   No simulated OAuth, fake connection statuses, secret storage or background sync. */
(function(root){
'use strict';
let bridge=null,category='All',currentId='',searchTerm='';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const VALID_DATE=/^\d{4}-\d{2}-\d{2}$/;
const VALID_TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const PROVIDERS=[
 {id:'google-calendar',name:'Google Calendar',icon:'googlecalendar',category:'Operations',
 description:'Bring appointment and job calendars together.',
 data:['Read approved calendar events','Propose job and visit updates'],permissions:['Calendar event access','Optional event changes with approval'],
 website:'https://calendar.google.com',priority:1},
 {id:'quickbooks',name:'QuickBooks Online',icon:'quickbooks',category:'Finance',
 description:'Align customers, invoices and bookkeeping.',
 data:['Read selected customers, invoices and payments','Reconcile authorized financial changes'],permissions:['Company accounting data access','Explicit approval for write actions'],
 website:'https://quickbooks.intuit.com',priority:2},
 {id:'stripe',name:'Stripe',icon:'stripe',category:'Finance',
 description:'Payment links and confirmed payment records.',
 data:['Read authorized payment statuses','Link verified payments to TradeFlow invoices'],permissions:['Stripe account authorization','Verified payment events'],
 website:'https://stripe.com',priority:3},
 {id:'gmail',name:'Gmail',icon:'gmail',category:'Communication',
 description:'Use authorized customer email workflows.',
 data:['Prepare drafts for customers and suppliers','Read selected replies when authorized'],permissions:['Scoped mailbox access','Explicit approval for sending'],
 website:'https://mail.google.com',priority:4},
 {id:'outlook',name:'Microsoft Outlook',icon:'microsoft',category:'Communication',
 description:'Email and Microsoft business calendars.',
 data:['Prepare business messages','Read selected inbox and calendar context'],permissions:['Microsoft account authorization','Mail and/or calendar access'],
 website:'https://outlook.office.com',priority:5},
 {id:'google-ads',name:'Google Ads',icon:'googleads',category:'Marketing',
 description:'Connect marketing spend to enquiries and jobs.',
 data:['Read campaign performance and spend','Associate tagged enquiries with jobs'],permissions:['Advertising account read access','Separate approval for campaign changes'],
 website:'https://ads.google.com',priority:6},
 {id:'google-analytics',name:'Google Analytics',icon:'googleanalytics',category:'Marketing',
 description:'Understand website conversion and acquisition.',
 data:['Read selected traffic and conversion metrics','Show clearly labeled attribution in Marketing Studio'],permissions:['Analytics property read access'],website:'https://analytics.google.com',priority:7},
 {id:'google-business',name:'Google Business Profile',icon:'google',category:'Marketing',
 description:'Local search presence, updates and reviews.',
 data:['Read authorized profile and review data','Prepare public updates or review replies'],permissions:['Business Profile access','Approval before publishing'],
 website:'https://business.google.com',priority:8},
 {id:'meta-ads',name:'Meta Business',icon:'meta',category:'Marketing',
 description:'Facebook and Instagram campaign reporting.',
 data:['Read selected advertising metrics','Associate campaign activity with local results'],permissions:['Business portfolio authorization','Approval before spending or posting'],
 website:'https://business.facebook.com',priority:9},
 {id:'zapier',name:'Zapier',icon:'zapier',category:'Automation',
 description:'Connect approved triggers to other applications.',
 data:['Send explicitly configured workflow events','Receive authenticated updates'],permissions:['Authenticated workspace','Scoped triggers and action permissions'],
 website:'https://zapier.com',priority:10},
 {id:'make',name:'Make',icon:'make',category:'Automation',
 description:'Coordinate approved workflows across services.',
 data:['Send selected workflow events','Receive verified integration callbacks'],permissions:['Authenticated scenarios','Verified webhook signatures'],
 website:'https://www.make.com',priority:11},
 {id:'resend',name:'Resend',icon:'resend',category:'Communication',
 description:'Delivery infrastructure for authorized business email.',
 data:['Send approved email messages','Record delivery and failure statuses'],permissions:['Verified sending domain','Email consent and suppression controls'],
 website:'https://resend.com',priority:12},
 {id:'cloudflare',name:'Cloudflare',icon:'cloudflare',category:'AI & Cloud',
 description:'Optional customer-controlled hosting infrastructure.',
 data:['Configure approved cloud resources','Run authorized hosted workflows'],permissions:['Tenant-scoped cloud access','Protected secrets and audited deployments'],
 website:'https://www.cloudflare.com',priority:13},
 {id:'anthropic',name:'Anthropic',icon:'anthropic',category:'AI & Cloud',
 description:'Bring-your-own AI model provider, when supported.',
 data:['Analyze user-approved TradeFlow context','Generate recommendations and prepared actions'],permissions:['User-selected model access','Explicit rules for data shared with AI'],
 website:'https://www.anthropic.com',priority:14}
];
const CATEGORIES=['All','Operations','Finance','Communication','Marketing','Automation','AI & Cloud','Connected'];
function getProvider(id){return PROVIDERS.find(x=>x.id===id)||null}
function logo(p){const branded=root.TradeFlowBrandIcons?.icon?.(p.icon,p.name);
 return branded||'<span class="tf-int-monogram" aria-hidden="true">'+esc(p.name.slice(0,2).toUpperCase())+'</span>'}
function glyph(path){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true">'+path+'</svg>'}
const ICONS={
 plug:glyph('<path d="M12 22v-5M8 3v6m8-6v6M5 9h14v3a7 7 0 0 1-14 0V9Z"/>'),
 search:glyph('<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>'),
 shield:glyph('<path d="m12 2 9 4v6c0 5-4 8-9 10-5-2-9-5-9-10V6l9-4Z"/><path d="m8 12 2.5 2.5L16 9"/>'),
 file:glyph('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>'),
 calendar:glyph('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>'),
 check:glyph('<path d="m5 12 4 4L19 6"/>')
};
function badge(text,kind=''){return '<span class="tf-int-pill '+kind+'">'+esc(text)+'</span>'}
function appCard(p){
 return '<article class="tf-int-app-card" data-int-search="'+esc([p.name,p.category,p.description,p.id].join(' ').toLowerCase())+'">'+
 '<span class="tf-int-brand">'+logo(p)+'</span>'+
 '<div class="tf-int-app-copy"><strong>'+esc(p.name)+'</strong><small>'+esc(p.description)+'</small>'+
 '<span class="tf-int-app-meta">'+esc(p.category)+' · OAuth connector planned</span></div>'+
 '<button type="button" data-int-action="detail" data-id="'+esc(p.id)+'" class="tf-int-details">Details <span>›</span></button></article>';
}
function catalog(){
 const matches=category==='Connected'?[]:PROVIDERS.filter(p=>category==='All'||p.category===category);
 return '<section class="tf-int-v2"><button type="button" data-tab="settings" class="tf-int-back">‹ More</button>'+
 '<header class="tf-int-heading"><div><span class="tf-int-kicker">TRADEFLOW / CONNECTIONS</span><h1>Integrations</h1>'+
 '<p>Bring your business tools together. Keep full control of what you connect.</p></div>'+
 '<span class="tf-int-hero">'+ICONS.plug+'</span></header>'+
 '<div class="tf-int-metrics"><article><small>Connected accounts</small><strong>0</strong><span>No provider OAuth active</span></article>'+
 '<article><small>Provider catalog</small><strong>'+PROVIDERS.length+'</strong><span>Browse planned connections</span></article></div>'+
 '<div class="tf-int-search">'+ICONS.search+'<label for="tfIntSearch" class="tf-int-visually-hidden">Search integrations</label>'+
 '<input id="tfIntSearch" type="search" value="'+esc(searchTerm)+'" placeholder="Search integrations..." autocomplete="off"></div>'+
 '<div class="tf-int-filterbar" role="group" aria-label="Integration categories">'+CATEGORIES.map(c=>
 '<button type="button" data-int-action="category" data-category="'+esc(c)+'" class="'+(category===c?'active':'')+
 '" aria-pressed="'+(category===c)+'">'+esc(c)+'</button>').join('')+'</div>'+
 '<section class="tf-int-list"><div class="tf-int-sectionhead"><h2>'+esc(category==='All'?'Explore integrations':category==='Connected'?'Your connections':category)+'</h2>'+
 '<span>'+matches.length+' provider'+(matches.length===1?'':'s')+'</span></div>'+
 '<div class="tf-int-cards">'+matches.map(appCard).join('')+'</div>'+
 '<div id="tfIntSearchEmpty" class="tf-int-empty" '+(matches.length?'hidden':'')+'>'+
 (category==='Connected'?'No connected accounts yet. Official OAuth connectors are not enabled.':'No matching integrations. Try another category or search.')+'</div></section>'+
 '<section class="tf-int-local"><div class="tf-int-sectionhead"><h2>Available without connecting</h2>'+badge('Working now','ready')+'</div>'+
 '<p>TradeFlow already supports these local handoffs. They do not synchronize accounts automatically.</p>'+
 '<div class="tf-int-local-grid">'+
 '<button type="button" data-int-action="finance-export"><span>'+ICONS.file+'</span><strong>Export Finance CSV</strong><small>Download recorded income and expenses</small></button>'+
 '<button type="button" data-int-action="calendar-export"><span>'+ICONS.calendar+'</span><strong>Export job calendar</strong><small>Download timed jobs as an .ics file</small></button>'+
 '<button type="button" data-tab="invoices"><span>'+ICONS.check+'</span><strong>Native Mail drafts</strong><small>Open Invoices to prepare an email</small></button></div></section>'+
 '<div class="tf-int-disclosure">'+ICONS.shield+'<p><strong>Safe connections come first.</strong> External account authorization is not available yet. TradeFlow never asks for your provider password, access token, or API secret here. When released, connections will use official authorization and user-approved data permissions.</p></div>'+
 '</section>';
}
function details(p){
 return '<section class="tf-int-v2"><button class="tf-int-back" type="button" data-int-action="back">‹ All integrations</button>'+
 '<div class="tf-int-detail-head"><span class="tf-int-brand large">'+logo(p)+'</span>'+
 '<div><span class="tf-int-kicker">'+esc(p.category).toUpperCase()+' / INTEGRATION</span><h1>'+esc(p.name)+'</h1><p>'+esc(p.description)+'</p></div></div>'+
 '<div class="tf-int-connection-status">'+ICONS.shield+'<div><strong>Not connected · Secure authorization required</strong>'+
 '<small>TradeFlow has not requested provider permissions, synced records or accessed this account.</small></div></div>'+
 '<section class="tf-int-detail-panel"><h2>What this integration is designed to do</h2><ul>'+p.data.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></section>'+
 '<section class="tf-int-detail-panel"><h2>Permissions to review before connecting</h2><ul>'+p.permissions.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>'+
 '<p>Illustrative planned permission categories. Exact official scopes will appear during the provider authorization process after connector implementation.</p></section>'+
 '<section class="tf-int-detail-panel"><h2>Connection readiness</h2><div class="tf-int-steps">'+
 '<div><span>1</span><strong>Official provider registration</strong><small>TradeFlow must register and receive approved connector credentials.</small></div>'+
 '<div><span>2</span><strong>Secure OAuth broker</strong><small>Encrypted, tenant-isolated tokens and a tested callback / refresh / disconnect flow.</small></div>'+
 '<div><span>3</span><strong>Permissioned synchronization</strong><small>Verified mapping, retry handling, activity history and user-approved write actions.</small></div></div></section>'+
 '<div class="tf-int-detail-actions"><button type="button" class="tf-int-connect-disabled" disabled aria-disabled="true">Connect unavailable</button>'+
 '<button type="button" class="tf-int-action-secondary" data-int-action="setup-task" data-id="'+esc(p.id)+'">Create setup task</button>'+
 '<a class="tf-int-action-link" href="'+esc(p.website)+'" target="_blank" rel="noopener noreferrer">Visit official provider ↗</a></div>'+
 '<p class="tf-int-footnote">Creating a setup task does not connect '+esc(p.name)+'. Do not paste passwords or API keys into task descriptions.</p></section>';
}
function render(){const provider=getProvider(currentId);return provider?details(provider):catalog()}
function quoteCsv(value){
 let str=String(value==null?'':value);
 if(/^[=+@]/.test(str)||/^-[^\d.]/.test(str))str="'"+str;
 return '"'+str.replace(/"/g,'""')+'"';
}
function financeCsv(payments,expenses){
 const rows=[['record_type','source_id','date','description','amount_eur','customer_id','job_id','currency']];
 for(const p of payments||[])rows.push(['received_payment',p.id,p.date||'',p.source||p.title||'Income',Number(p.amount)||0,p.customerId||'',p.jobId||'','EUR']);
 for(const e of expenses||[])rows.push(['expense',e.id,e.date||'',e.vendor||e.title||e.category||'Expense',Number(e.amount)||0,'',e.relatedId||e.jobId||'','EUR']);
 return rows.map(r=>r.map(quoteCsv).join(',')).join('\r\n')+'\r\n';
}
function validDate(v){if(!VALID_DATE.test(v||''))return false;const d=new Date(v+'T12:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===v}
function icsEscape(v){return String(v==null?'':v).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,')}
function icsLine(v){const parts=[];const line=String(v);for(let i=0;i<line.length;i+=70)parts.push(i?(' '+line.slice(i,i+70)):line.slice(i,i+70));return parts.join('\r\n')}
function calendarIcs(jobs,stamp='20261017T000000Z'){
 const items=(jobs||[]).filter(j=>validDate(j.date||j.scheduledDate)&&VALID_TIME.test(j.startTime||j.time||'')&&
 Number.isInteger(Number(j.durationMinutes||j.estimatedDurationMinutes))&&Number(j.durationMinutes||j.estimatedDurationMinutes)>=1&&Number(j.durationMinutes||j.estimatedDurationMinutes)<=1440&&j.status!=='Cancelled');
 const header=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TradeFlow//Local Export//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
 for(const j of items){
  const date=j.date||j.scheduledDate,t=j.startTime||j.time;
  const len=Number(j.durationMinutes||j.estimatedDurationMinutes);
  const utc=new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7))-1,Number(date.slice(8,10)),Number(t.slice(0,2)),Number(t.slice(3,5))+len));
  const end=[utc.getUTCFullYear(),String(utc.getUTCMonth()+1).padStart(2,'0'),String(utc.getUTCDate()).padStart(2,'0')].join('')+'T'+String(utc.getUTCHours()).padStart(2,'0')+String(utc.getUTCMinutes()).padStart(2,'0')+'00';
  const start=date.replace(/-/g,'')+'T'+t.replace(':','')+'00';
  header.push('BEGIN:VEVENT','UID:job-'+String(j.id||'unknown').replace(/[^A-Za-z0-9._-]/g,'_')+'@tradeflow.local','DTSTAMP:'+stamp,'DTSTART:'+start,
   'DTEND:'+end,'SUMMARY:'+icsEscape(j.title||'TradeFlow job'),'DESCRIPTION:'+icsEscape('Exported from TradeFlow. Local snapshot; not a live sync.'),
   ...(j.address?['LOCATION:'+icsEscape(j.address)]:[]),'END:VEVENT');
 }
 return {count:items.length,content:header.concat(['END:VCALENDAR']).map(icsLine).join('\r\n')+'\r\n'};
}
function download(name,text,mime){
 const blob=new Blob([text],{type:mime}),url=URL.createObjectURL(blob);
 const anchor=document.createElement('a');anchor.href=url;anchor.download=name;
 document.body.appendChild(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function onClick(event){
 if(!bridge)return;
 const b=event.target.closest?.('[data-int-action]');if(!b)return;
 event.preventDefault();
 const action=b.dataset.intAction,id=b.dataset.id;
 try{
  if(action==='detail'){if(!getProvider(id))return;currentId=id;bridge.render();return}
  if(action==='back'){currentId='';bridge.render();return}
  if(action==='category'){category=CATEGORIES.includes(b.dataset.category)?b.dataset.category:'All';currentId='';bridge.render();return}
  if(action==='setup-task'){
   const provider=getProvider(id);if(!provider)return;
   const tasks=await bridge.all('tasks');
   const present=tasks.find(x=>x.integrationProviderId===provider.id);
   if(present){bridge.notify('Setup task already exists in Tasks.');return}
   await bridge.put('tasks',{id:bridge.uid(),title:'Review '+provider.name+' connection setup',
    description:'TradeFlow '+provider.name+' integration is not active yet. Review required official OAuth approval, scope consent, and secure connection service before attempting to connect. Never paste passwords, tokens or API keys into Tasks.',
    due:today(),status:'Open',integrationProviderId:provider.id,createdAt:new Date().toISOString()});
   bridge.notify(provider.name+' setup task saved locally.');return;
  }
  if(action==='finance-export'){
   const payments=await bridge.all('payments'),expenses=await bridge.all('expenses');
   if(!payments.length&&!expenses.length){bridge.notify('No local transactions are available to export.');return}
   if(!confirm('Download recorded financial transactions as a CSV file? This may contain sensitive business information.'))return;
   download('tradeflow-finance-'+today()+'.csv',financeCsv(payments,expenses),'text/csv;charset=utf-8');
   bridge.notify('Local financial CSV downloaded; no accounting account was connected.');return;
  }
  if(action==='calendar-export'){
   const data=calendarIcs(await bridge.all('jobs'),new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'').slice(0,15)+'Z');
   if(!data.count){bridge.notify('No timed jobs to export. Add a scheduled date, start time and duration first.');return}
   if(!confirm('Export '+data.count+' timed job'+(data.count===1?'':'s')+' as an .ics calendar snapshot? These records may contain job titles and addresses. This does not synchronize a calendar account.'))return;
   download('tradeflow-jobs-'+today()+'.ics',data.content,'text/calendar;charset=utf-8');
   bridge.notify('Local calendar file downloaded; no live calendar account was connected.');return;
  }
 }catch(error){alert('Integration action failed: '+error.message)}
}
function applySearch(){
 const cards=typeof document.querySelectorAll==='function'?document.querySelectorAll('.tf-int-app-card'):[];
 let visible=0;
 for(const card of cards){const label=String(card.dataset?.intSearch||'');
  card.hidden=!!searchTerm&&!label.includes(searchTerm);if(!card.hidden)visible++;
 }
 const empty=typeof document.getElementById==='function'?document.getElementById('tfIntSearchEmpty'):null;
 if(empty)empty.hidden=visible>0;
}
function onInput(event){
 if(event.target?.id!=='tfIntSearch')return;
 searchTerm=String(event.target.value||'').toLowerCase().trim().slice(0,100);applySearch();
}
function configure(api){bridge=api;document.addEventListener('click',onClick);document.addEventListener('input',onInput)}
root.TradeFlowIntegrations={configure,render,_test:{providers:PROVIDERS,categories:CATEGORIES,financeCsv,calendarIcs,validDate,getProvider,appCard}};
})(typeof window!=='undefined'?window:globalThis);
