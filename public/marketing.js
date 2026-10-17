/* TradeFlow Marketing R04 — original offline marketing planner and review drafting.
   No automatic outbound, ad spending, scraping, recipient harvesting or external integrations. */
(function(global){
'use strict';
let api=null,mode='list',draftId='',filter='all';
const e=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clean=(v,n=500)=>String(v==null?'':v).trim().slice(0,n);
const today=()=>{const x=new Date();return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')};
const channels=['Email draft','SMS draft','Google Business Profile','Local SEO','Google Ads draft','Meta Ads draft','Review request','Referral request'];
const templates=[
 {key:'local-seo',title:'Improve local search visibility',channel:'Local SEO',
  subject:'Local SEO improvement checklist',message:'Review Google Business Profile information, services, service areas, business hours and relevant service-page content. Confirm each change before publishing.',cta:'Create a checklist task'},
 {key:'quote-followup',title:'Quotation follow-up message',channel:'Email draft',subject:'Following up on your quotation',
  message:'Hello,\n\nI wanted to check whether you had any questions about the quotation we shared. We would be happy to clarify the scope, timing, or next steps.\n\nThank you,\n[Business name]',cta:'Reply to arrange a call'},
 {key:'review-request',title:'Ask a customer for an honest review',channel:'Review request',subject:'Would you share your experience?',
  message:'Hello,\n\nThank you for choosing our business. If you have a moment, we would appreciate an honest review of your experience. Your feedback helps us improve and helps other customers make informed decisions.\n\n[Your review link]\n\nThank you,\n[Business name]',cta:'Share honest feedback'},
 {key:'referral',title:'Referral follow-up',channel:'Referral request',subject:'Thank you for working with us',
  message:'Hello,\n\nThank you again for working with our team. If someone you know needs our services, you are welcome to share our contact details. We appreciate your trust.\n\nBest regards,\n[Business name]',cta:'Share our business contact'},
 {key:'ads-outline',title:'Draft a targeted advertisement',channel:'Google Ads draft',subject:'Local trade services ad concept',
  message:'Service: [Your trade]\nService area: [City]\nWho we help: [Ideal customer]\nHeadline: Reliable [trade] services in [city]\nOffer: Request a clear quotation\nProof to verify: Licenses, insurance, project examples, customer reviews',cta:'Request a quotation'}
];
function profiles(d){const x=(d.settings||[]).find(z=>z.id==='growth-profiles-v1')||{};return {icps:Array.isArray(x.icps)?x.icps:[],personas:Array.isArray(x.personas)?x.personas:[],active:x.activeIcpId||''}}

const marketingChannels=['Google Search','Referrals','Email','Social','Paid Ads','Direct','Other'];
const SOURCE_KEY='marketing-attribution-v2';
let sourceCustomerId='',spendCampaignId='';
const number=v=>Number.isFinite(Number(v))?Number(v):0;
const euro=v=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(number(v));
function sourceData(d){
 const saved=(d.settings||[]).find(x=>x.id===SOURCE_KEY);
 return Array.isArray(saved?.entries)?saved.entries.filter(x=>x&&x.customerId):[];
}
function marketingSummary(d){
 const customers=d.customers||[],jobs=d.jobs||[],quotes=d.quotes||[],payments=d.payments||[],invoices=d.invoices||[],expenses=d.expenses||[];
 const customerIds=new Set(customers.map(c=>c.id));
 const entries=sourceData(d).filter(x=>customerIds.has(x.customerId));
 const byCustomer=new Map(entries.map(x=>[x.customerId,x]));
 const linkedJobs=jobs.filter(x=>byCustomer.has(x.customerId));
 const quoted=new Set(quotes.filter(x=>byCustomer.has(x.customerId)).map(x=>x.customerId));
 const booked=new Set(linkedJobs.map(x=>x.customerId));
 const invoiceCustomers=new Map(invoices.map(x=>[x.id,x.customerId]));
 const jobCustomers=new Map(jobs.map(x=>[x.id,x.customerId]));
 const trackedPayments=payments.filter(x=>{
  const owner=x.invoiceId?invoiceCustomers.get(x.invoiceId):x.customerId||jobCustomers.get(x.jobId||x.relatedId);
  return byCustomer.has(owner);
 });
 const paidCustomers=new Set(trackedPayments.map(x=>x.invoiceId?invoiceCustomers.get(x.invoiceId):x.customerId||jobCustomers.get(x.jobId||x.relatedId)));
 const cash=trackedPayments.reduce((sum,p)=>sum+Math.max(0,number(p.amount)),0);
 const spendEntries=expenses.filter(x=>x.marketingSpend===true&&number(x.amount)>0);
 const spend=spendEntries.reduce((sum,x)=>sum+number(x.amount),0);
 const channels=marketingChannels.map(name=>{
  const sourceCustomers=entries.filter(x=>x.channel===name);
  const ids=new Set(sourceCustomers.map(x=>x.customerId));
  const associatedJobs=jobs.filter(x=>ids.has(x.customerId));
  const cashFromChannel=trackedPayments.filter(x=>ids.has(x.invoiceId?invoiceCustomers.get(x.invoiceId):x.customerId||jobCustomers.get(x.jobId||x.relatedId))).reduce((sum,p)=>sum+Math.max(0,number(p.amount)),0);
  const recordedSpend=spendEntries.filter(x=>x.marketingChannel===name);
  return {name,customers:ids.size,jobs:associatedJobs.length,cash:cashFromChannel,
    spend:recordedSpend.reduce((sum,x)=>sum+number(x.amount),0),spendCount:recordedSpend.length};
 });
 return {tracked:byCustomer.size,linkedJobs:linkedJobs.length,quotedCustomers:quoted.size,bookedCustomers:booked.size,
   paidCustomers:paidCustomers.size,spend,cash,spendCount:spendEntries.length,entries,channels};
}
function marketingIcon(name){
 const paths={
  people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M17 14c2.5 0 4 2 4 6"/>',
  job:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 13h18"/>',
  ads:'<path d="M3 10v4l12 4V6L3 10Zm12-4 5-2v16l-5-2M6 15v5h4v-4"/>',
  chart:'<path d="M3 3v18h18M7 17v-5m5 5V8m5 9V5"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 8 9 6 9-6"/>',
  star:'<path d="m12 2 3.2 6.5 7.2 1.1-5.2 5.1 1.3 7.2-6.5-3.4-6.5 3.4 1.2-7.2-5.2-5.1 7.3-1.1z"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>'
 };
 return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.chart)+'</svg>';
}
function header(){return '<header class="tf-marketing-head"><span class="tf-marketing-kicker">TRADEFLOW / GROWTH</span><h1>Marketing Studio</h1><p>Plan and prepare campaigns. Nothing gets sent, published or billed without a separate service and your explicit action.</p></header>'}
function nav(){return '<button type="button" class="tf-marketing-back" data-tab="settings">‹ More</button>'}
function badge(status){return '<span class="tf-marketing-badge '+(status==='Ready'?'ready':'')+'">'+e(status||'Draft')+'</span>'}
function select(name,label,items,value){return '<label><span>'+e(label)+'</span><select name="'+e(name)+'">'+items.map(([v,l])=>'<option value="'+e(v)+'" '+(v===value?'selected':'')+'>'+e(l)+'</option>').join('')+'</select></label>'}
function editForm(d){
 const campaign=(d.marketingCampaigns||[]).find(x=>x.id===draftId)||{};
 const pf=profiles(d),choices=[['','Choose a target profile']].concat(pf.icps.map(x=>[x.id,x.name]));
 const personas=[['','No buyer persona']].concat(pf.personas.map(x=>[x.id,x.name]));
 return '<div class="tf-marketing-page">'+nav()+header()+
 '<button class="tf-marketing-back" type="button" data-marketing-action="list">‹ All campaign drafts</button>'+
 '<form id="tfMarketingForm" class="tf-marketing-card tf-marketing-form">'+
 '<h2>'+(campaign.id?'Edit marketing draft':'New marketing draft')+'</h2>'+
 '<label><span>Campaign name *</span><input name="title" required maxlength="100" value="'+e(campaign.title||'')+'" placeholder="e.g. Autumn commercial renovations"></label>'+
 select('channel','Channel',channels.map(x=>[x,x]),campaign.channel||channels[0])+
 select('icpId','Ideal customer profile',choices,campaign.icpId||pf.active)+
 select('personaId','Buyer persona',personas,campaign.personaId||'')+
 '<div class="tf-marketing-pair"><label><span>Planned date</span><input type="date" name="plannedDate" value="'+e(campaign.plannedDate||today())+'"></label>'+
 '<label><span>Planned budget (EUR; no spending)</span><input name="plannedBudget" type="number" min="0" step=".01" max="100000000" value="'+e(campaign.plannedBudget||0)+'"></label></div>'+
 '<label><span>Subject / headline</span><input name="subject" maxlength="200" value="'+e(campaign.subject||'')+'"></label>'+
 '<label><span>Message, plan or creative draft *</span><textarea name="message" rows="9" required maxlength="5000">'+e(campaign.message||'')+'</textarea></label>'+
 '<label><span>Desired call to action</span><input name="cta" maxlength="180" value="'+e(campaign.cta||'')+'"></label>'+
 select('status','Preparation status',[['Draft','Draft'],['Ready','Ready for manual review'],['Archived','Archived']],campaign.status||'Draft')+
 '<p class="tf-marketing-note">“Ready” means the content is prepared for manual review. It does not mean sent or approved by Google, Meta or an email provider. Do not enter customer personal data here unless permitted.</p>'+
 '<div class="tf-marketing-actions"><button type="submit" class="tf-marketing-primary">Save marketing draft</button><button type="button" class="tf-marketing-secondary" data-marketing-action="list">Cancel</button></div></form></div>';
}
function detail(d){
 const campaign=(d.marketingCampaigns||[]).find(x=>x.id===draftId);
 if(!campaign){mode='list';return list(d)}
 const pf=profiles(d),icp=pf.icps.find(x=>x.id===campaign.icpId),persona=pf.personas.find(x=>x.id===campaign.personaId);
 return '<div class="tf-marketing-page">'+nav()+header()+
 '<button class="tf-marketing-back" type="button" data-marketing-action="list">‹ All drafts</button>'+
 '<article class="tf-marketing-card"><div class="tf-marketing-cardhead"><div><small>'+e(campaign.channel)+'</small><h2>'+e(campaign.title)+'</h2></div>'+badge(campaign.status)+'</div>'+
 '<div class="tf-marketing-metadata"><span>ICP: '+e(icp?.name||'No ICP selected')+'</span><span>Persona: '+e(persona?.name||'None')+'</span><span>Planned: '+e(campaign.plannedDate||'Unscheduled')+'</span></div>'+
 (campaign.subject?'<div class="tf-marketing-brief"><small>SUBJECT</small><strong>'+e(campaign.subject)+'</strong></div>':'')+
 '<div class="tf-marketing-preview">'+e(campaign.message)+'</div>'+
 (campaign.cta?'<p class="tf-marketing-cta">Desired action: '+e(campaign.cta)+'</p>':'')+
 '<div class="tf-marketing-actions"><button class="tf-marketing-primary" type="button" data-marketing-action="copy" data-id="'+e(campaign.id)+'">Copy draft</button>'+
 '<button class="tf-marketing-secondary" type="button" data-marketing-action="edit" data-id="'+e(campaign.id)+'">Edit</button>'+
 '<button class="tf-marketing-secondary" type="button" data-marketing-action="task" data-id="'+e(campaign.id)+'">Add preparation Task</button>'+
 '<button class="tf-marketing-danger" type="button" data-marketing-action="delete" data-id="'+e(campaign.id)+'">Delete</button></div>'+
 '<p class="tf-marketing-note">Draft only. No message sent, no review requested, no website edited and no advertising budget spent.</p>'+
 '</article></div>';
}

function metricCard(label,value,detail,icon,kind){
 return '<div class="tf-ms-metric"><div class="tf-ms-metric-top"><span>'+e(label)+'</span><span class="tf-ms-icon '+(kind||'')+'">'+marketingIcon(icon)+'</span></div>'+
 '<strong>'+value+'</strong><small>'+e(detail)+'</small></div>';
}
function sourceForm(d){
 const customers=d.customers||[],campaigns=d.marketingCampaigns||[],existing=sourceData(d).find(x=>x.customerId===sourceCustomerId)||{};
 return '<div class="tf-marketing-page tf-marketing-v2"><button type="button" class="tf-marketing-back" data-marketing-action="list">‹ Marketing Studio</button>'+
 '<header class="tf-ms-heading"><div><span class="tf-marketing-kicker">TRADEFLOW / GROWTH</span><h1>Record customer source</h1><p>Manually associate an existing customer with their reported acquisition source. This is not automatically verified attribution.</p></div></header>'+
 '<form id="tfMarketingSourceForm" class="tf-marketing-card tf-marketing-form">'+
 select('customerId','Customer', [['','Choose customer']].concat(customers.map(x=>[x.id,x.name||'Unnamed customer'])),existing.customerId||sourceCustomerId)+
 select('channel','Reported source',marketingChannels.map(x=>[x,x]),existing.channel||'Google Search')+
 select('campaignId','Related TradeFlow campaign (optional)',[['','None / unknown']].concat(campaigns.map(x=>[x.id,x.title])),existing.campaignId||'')+
 '<label><span>Date recorded</span><input type="date" name="date" value="'+e(existing.date||today())+'" required></label>'+
 '<label><span>Source note (optional)</span><textarea name="note" maxlength="300" rows="3" placeholder="Customer mentioned finding us on Google">'+e(existing.note||'')+'</textarea></label>'+
 '<p class="tf-marketing-note">One manually reported source per customer. This does not prove the campaign caused a sale. Changing a source updates future dashboard summaries.</p>'+
 '<div class="tf-marketing-actions"><button class="tf-marketing-primary" type="submit">Save customer source</button><button class="tf-marketing-secondary" data-marketing-action="list" type="button">Cancel</button></div></form></div>';
}
function spendForm(d){
 const all=d.marketingCampaigns||[];
 return '<div class="tf-marketing-page tf-marketing-v2"><button type="button" class="tf-marketing-back" data-marketing-action="list">‹ Marketing Studio</button>'+
 '<header class="tf-ms-heading"><div><span class="tf-marketing-kicker">TRADEFLOW / FINANCE</span><h1>Record marketing spend</h1><p>Log a real marketing expense into Finance. Do not enter a planned budget as money spent.</p></div></header>'+
 '<form id="tfMarketingSpendForm" class="tf-marketing-card tf-marketing-form">'+
 '<label><span>Expense description</span><input name="title" required maxlength="120" placeholder="Google Ads invoice · October"></label>'+
 select('channel','Channel',marketingChannels.map(x=>[x,x]),'Paid Ads')+
 select('campaignId','Linked campaign (optional)',[['','No campaign']].concat(all.map(x=>[x.id,x.title])),spendCampaignId)+
 '<div class="tf-marketing-pair"><label><span>Amount paid (€)</span><input type="number" step=".01" min=".01" max="100000000" required name="amount"></label>'+
 '<label><span>Payment date</span><input type="date" name="date" value="'+today()+'" required></label></div>'+
 '<p class="tf-marketing-note">Creates one actual marketing expense in Finance. Do not add it again in Finance or costs will be duplicated. No ad platform is connected.</p>'+
 '<div class="tf-marketing-actions"><button type="submit" class="tf-marketing-primary">Record marketing expense</button><button type="button" data-marketing-action="list" class="tf-marketing-secondary">Cancel</button></div></form></div>';
}
function list(d){
 const campaigns=d.marketingCampaigns||[],pf=profiles(d),summary=marketingSummary(d);
 const shown=filter==='all'?campaigns:campaigns.filter(x=>x.status===filter);
 const recordCount=summary.channels.reduce((s,x)=>s+x.customers,0);
 const channels=summary.channels.filter(x=>x.customers>0||x.spendCount>0).sort((a,b)=>b.customers-a.customers||b.cash-a.cash);
 const maxChannel=Math.max(1,...channels.map(x=>x.customers));
 const steps=[['Source known',summary.tracked],['Quoted',summary.quotedCustomers],['With jobs',summary.bookedCustomers],['Paid',summary.paidCustomers]];
 let output='<section class="tf-marketing-page tf-marketing-v2">'+
 '<header class="tf-ms-heading"><div><span class="tf-marketing-kicker">TRADEFLOW / GROWTH</span><h1>Marketing Studio</h1><p>Connect marketing activity to customers, booked work and recorded cash.</p></div><span class="tf-ms-hero-icon">'+marketingIcon('chart')+'</span></header>'+
 '<div class="tf-ms-metrics">'+
 metricCard('Source-tracked customers',String(summary.tracked),'Manually recorded sources','people','cyan')+
 metricCard('Jobs linked',String(summary.linkedJobs),'Jobs of tracked customers','job','blue')+
 metricCard('Marketing spend',summary.spendCount?euro(summary.spend):'—',summary.spendCount?'Recorded in Finance':'No spend entered','ads','cyan')+
 metricCard('Cash linked',euro(summary.cash),'Received from tracked customers','chart','green')+
 '</div>'+
 '<section class="tf-ms-panel"><div class="tf-ms-panel-head"><h2>Customer → Revenue</h2><span>All recorded history</span></div>'+
 '<p class="tf-ms-helper">Unique customers with a manually recorded source, followed by their existing quotation, job and payment records.</p>'+
 '<div class="tf-ms-funnel">'+steps.map(([label,count],i)=>'<div class="tf-ms-funnel-step step-'+i+'"><strong>'+count+'</strong><small>'+e(label)+'</small></div>').join('')+'</div>'+
 (!summary.tracked?'<div class="tf-ms-empty-inline">No customer sources recorded yet. Start by tagging the acquisition source of an existing customer.</div>':
 '<p class="tf-ms-caption">These are associations, not proof that marketing caused the job or payment. Counts are customers, not campaign clicks.</p>')+
 '<div class="tf-ms-inline-actions"><button type="button" data-marketing-action="source-new">+ Record customer source</button><button type="button" data-marketing-action="spend-new">+ Record spend</button></div></section>'+
 '<section class="tf-ms-panel"><div class="tf-ms-panel-head"><h2>Channel performance</h2><span>Recorded sources</span></div>'+
 (channels.length?'<div class="tf-ms-channels">'+channels.map(c=>{
  const width=Math.max(3,Math.round(c.customers/maxChannel*100));
  return '<div class="tf-ms-channel"><div class="tf-ms-channel-title"><strong>'+e(c.name)+'</strong><span>'+c.customers+' customer'+(c.customers===1?'':'s')+'</span></div>'+
  '<div class="tf-ms-channel-track"><span style="width:'+(c.customers?width:0)+'%"></span></div>'+
  '<div class="tf-ms-channel-foot"><span>'+c.jobs+' linked job'+(c.jobs===1?'':'s')+'</span><span>'+euro(c.cash)+' cash linked'+(c.spendCount?' · '+euro(c.spend)+' spend':'')+'</span></div></div>';
 }).join('')+'</div>':'<div class="tf-ms-empty-inline">Channel results will appear after you record customer sources or marketing expenses.</div>')+
 '<p class="tf-ms-caption">Only manually recorded sources and spend are shown; no Google, Meta, calls or email accounts are connected.</p></section>'+
 '<section class="tf-ms-campaigns"><div class="tf-ms-panel-head"><h2>Campaigns</h2><button type="button" data-marketing-action="new">+ Create draft</button></div>'+
 '<div class="tf-ms-filters" role="group" aria-label="Campaign preparation status">'+[['all','All'],['Draft','Draft'],['Ready','Ready'],['Archived','Archived']].map(([id,label])=>'<button type="button" class="'+(filter===id?'active':'')+'" data-marketing-action="filter" data-filter="'+id+'" aria-pressed="'+(filter===id)+'">'+label+'</button>').join('')+'</div>'+
 (shown.length?'<div class="tf-ms-campaign-list">'+shown.slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).map(x=>
 '<button class="tf-ms-campaign-row" type="button" data-marketing-action="open" data-id="'+e(x.id)+'"><span class="tf-ms-campaign-icon">'+marketingIcon(x.channel==='Email draft'?'mail':'ads')+'</span>'+
 '<span class="tf-ms-campaign-text"><strong>'+e(x.title)+'</strong><small>'+e(x.channel)+' · '+e(x.plannedDate||'Unscheduled')+'</small></span>'+
 badge(x.status)+'<span class="tf-marketing-chevron">›</span></button>').join('')+'</div>':
 '<div class="tf-ms-empty-inline">'+(campaigns.length?'No campaigns in this preparation status.':'No campaigns created yet. Start from a template or create a new draft.')+'</div>')+
 '<p class="tf-ms-caption">Ready means prepared for review—not active, published, sent or delivering results.</p></section>'+
 '<section class="tf-ms-growth"><div class="tf-ms-panel-head"><h2>Growth tools</h2><span>Connected workspaces</span></div>'+
 '<div class="tf-ms-growth-grid">'+
 '<button data-tab="growth" type="button"><span>'+marketingIcon('target')+'</span><strong>Target customers</strong><small>'+pf.icps.length+' ICP profile'+(pf.icps.length===1?'':'s')+' · personas</small></button>'+
 '<button data-marketing-action="template" data-key="review-request" type="button"><span>'+marketingIcon('star')+'</span><strong>Reviews</strong><small>Prepare honest requests</small></button>'+
 '<button data-marketing-action="template" data-key="referral" type="button"><span>'+marketingIcon('people')+'</span><strong>Referrals</strong><small>Draft introductions</small></button>'+
 '<button data-tab="research" type="button"><span>'+marketingIcon('search')+'</span><strong>Research</strong><small>Source-backed briefs</small></button>'+
 '</div>'+
 '<details class="tf-ms-templates"><summary>Campaign templates <span>Browse '+templates.length+' →</span></summary><div>'+
 templates.map(x=>'<div class="tf-marketing-template"><div><strong>'+e(x.title)+'</strong><small>'+e(x.channel)+'</small></div><button type="button" data-marketing-action="template" data-key="'+e(x.key)+'">Use</button></div>').join('')+
 '</div></details></section>'+
 '<button type="button" class="tf-ms-create" data-marketing-action="new">＋ Create campaign</button>'+
 '<p class="tf-ms-caption">Local-first preparation and manually recorded attribution only. No automated outreach, publishing, provider analytics or verified marketing ROI is active.</p></section>';
 return output;
}
function render(tab,d){return tab==='marketing'?(mode==='edit'?editForm(d):mode==='detail'?detail(d):mode==='source'?sourceForm(d):mode==='spend'?spendForm(d):list(d)):''}
async function onClick(event){
 if(!api)return;const button=event.target.closest?.('[data-marketing-action]');if(!button)return;
 event.preventDefault();
 const action=button.dataset.marketingAction,id=button.dataset.id;
 try{
  if(action==='list'){mode='list';draftId='';api.render();return}
  if(action==='new'){mode='edit';draftId='';api.render();return}
  if(action==='source-new'){sourceCustomerId='';mode='source';api.render();return}
  if(action==='source-edit'){sourceCustomerId=id;mode='source';api.render();return}
  if(action==='spend-new'){spendCampaignId=id||'';mode='spend';api.render();return}
  if(action==='filter'){filter=['Draft','Ready','Archived'].includes(button.dataset.filter)?button.dataset.filter:'all';api.render();return}
  if(action==='edit'){draftId=id;mode='edit';api.render();return}
  if(action==='open'){draftId=id;mode='detail';api.render();return}
  if(action==='template'){
   const t=templates.find(x=>x.key===button.dataset.key);if(!t)return;
   const pf=(await api.all('settings')).find(x=>x.id==='growth-profiles-v1')||{};
   const now=new Date().toISOString();
   const copy={id:api.uid(),title:t.title,channel:t.channel,icpId:pf.activeIcpId||'',personaId:'',subject:t.subject,
    message:t.message,cta:t.cta,status:'Draft',plannedDate:today(),plannedBudget:0,createdAt:now,updatedAt:now};
   await api.put('marketingCampaigns',copy);draftId=copy.id;mode='edit';api.notify('Template saved as a local draft');return;
  }
  const record=await api.get('marketingCampaigns',id);if(!record)return;
  if(action==='delete'){if(!confirm('Delete this saved marketing draft?'))return;await api.del('marketingCampaigns',id);mode='list';draftId='';api.notify('Draft deleted');return}
  if(action==='copy'){
   if(!navigator.clipboard?.writeText){alert('Clipboard unavailable in this browser. Select and copy the draft manually.');return}
   await navigator.clipboard.writeText((record.subject?record.subject+'\n\n':'')+record.message);
   api.notify('Draft copied for manual review');return;
  }
  if(action==='task'){
   const key='marketing-'+record.id,existing=(await api.all('tasks')).some(x=>x.marketingCampaignId===record.id&&x.status!=='Done');
   if(existing){api.notify('Open preparation task already exists');return}
   await api.put('tasks',{id:api.uid(),title:'Review and prepare: '+record.title.slice(0,90),description:'Review this marketing draft, check consent/policies, then publish or send manually through an authorized service. No automatic sending is active.',
    status:'Open',due:record.plannedDate||today(),marketingCampaignId:record.id,createdAt:new Date().toISOString()});
   api.notify('Campaign preparation Task created');return;
  }
 }catch(error){alert('Marketing action failed: '+error.message)}
}
async function onSubmit(event){
 if(!api||event.target.id!=='tfMarketingForm')return;event.preventDefault();
 const form=event.target,fd=new FormData(form),get=(k,n)=>clean(fd.get(k),n);
 try{
  const title=get('title',100),channel=get('channel',50),message=get('message',5000),date=get('plannedDate',10),budget=Number(fd.get('plannedBudget')||0);
  if(!title||!message)throw Error('Campaign title and draft content are required.');
  if(!channels.includes(channel))throw Error('Unknown campaign channel.');
  if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid planning date.');
  if(!Number.isFinite(budget)||budget<0||budget>100000000)throw Error('Invalid planned budget.');
  const pf=(await api.all('settings')).find(x=>x.id==='growth-profiles-v1')||{};
  const icpId=get('icpId',120),personaId=get('personaId',120);
  if(icpId&&!(pf.icps||[]).some(x=>x.id===icpId))throw Error('ICP no longer exists.');
  if(personaId&&!(pf.personas||[]).some(x=>x.id===personaId))throw Error('Buyer persona no longer exists.');
  const prior=draftId?await api.get('marketingCampaigns',draftId):null;
  if(draftId&&!prior)throw Error('Marketing draft not found.');
  if(!draftId&&(await api.all('marketingCampaigns')).length>=200)throw Error('Maximum 200 local campaign drafts.');
  const now=new Date().toISOString();
  const campaign={...prior,id:prior?.id||api.uid(),title,channel,icpId,personaId,message,subject:get('subject',200),cta:get('cta',180),
   plannedDate:date,plannedBudget:Math.round(budget*100)/100,status:['Draft','Ready','Archived'].includes(get('status',20))?get('status',20):'Draft',
   updatedAt:now,createdAt:prior?.createdAt||now};
  await api.put('marketingCampaigns',campaign);draftId=campaign.id;mode='detail';api.notify('Marketing draft saved');
 }catch(err){alert('Could not save marketing draft: '+err.message)}
}

async function onMarketingDataSubmit(event){
 if(!api)return;
 const form=event.target;
 if(!['tfMarketingSourceForm','tfMarketingSpendForm'].includes(form.id))return;
 event.preventDefault();
 const fd=new FormData(form),field=(k,n)=>clean(fd.get(k),n);
 try{
  const channel=field('channel',60),date=field('date',10),campaignId=field('campaignId',120);
  if(!marketingChannels.includes(channel))throw Error('Choose a valid marketing channel.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(new Date(date+'T12:00:00Z').getTime())||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Enter a valid calendar date.');
  if(campaignId&&!(await api.all('marketingCampaigns')).some(x=>x.id===campaignId))throw Error('Campaign no longer exists.');
  if(form.id==='tfMarketingSourceForm'){
   const customerId=field('customerId',120);
   if(!(await api.all('customers')).some(x=>x.id===customerId))throw Error('Select a saved customer.');
   const saved=await api.get('settings',SOURCE_KEY)||{id:SOURCE_KEY,entries:[]};
   const entries=Array.isArray(saved.entries)?saved.entries.filter(x=>x.customerId!==customerId):[];
   if(entries.length>=2000)throw Error('Maximum 2,000 manually tracked customer sources.');
   entries.push({customerId,channel,date,campaignId,note:field('note',300),manual:true,updatedAt:new Date().toISOString()});
   await api.put('settings',{...saved,id:SOURCE_KEY,entries,updatedAt:new Date().toISOString()});
   sourceCustomerId='';mode='list';api.notify('Customer source recorded locally');return;
  }
  const amount=Number(fd.get('amount')),title=field('title',120);
  if(!title)throw Error('Describe the marketing expense.');
  if(!Number.isFinite(amount)||amount<=0||amount>100000000||Math.abs(amount*100-Math.round(amount*100))>1e-6)throw Error('Enter an amount with up to two decimal places.');
  await api.put('expenses',{id:api.uid(),title,category:'Marketing',amount:Math.round(amount*100)/100,date,
    marketingSpend:true,marketingChannel:channel,marketingCampaignId:campaignId,currency:'EUR',
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  spendCampaignId='';mode='list';api.notify('Marketing expense recorded in Finance');return;
 }catch(error){alert('Could not save marketing record: '+error.message)}
}
function configure(bridge){api=bridge;document.addEventListener('click',onClick);document.addEventListener('submit',onSubmit);document.addEventListener('submit',onMarketingDataSubmit)}
global.TradeFlowMarketing={configure,render,_test:{templates,esc:e,profiles}};
})(typeof window!=='undefined'?window:globalThis);
