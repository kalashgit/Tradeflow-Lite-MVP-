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
function list(d){
 const all=d.marketingCampaigns||[],show=filter==='all'?all:all.filter(x=>x.status===filter),pf=profiles(d);
 return '<div class="tf-marketing-page">'+nav()+header()+
 '<div class="tf-marketing-info"><strong>Acquiring new customers?</strong> Start with a verified research specification before drafting outreach. <button type="button" data-tab="research">Open Research Briefs ↗</button></div>'+
 '<div class="tf-marketing-metrics"><div><small>CAMPAIGNS</small><strong>'+all.length+'</strong></div><div><small>DRAFTS</small><strong>'+all.filter(x=>x.status==='Draft').length+'</strong></div><div><small>READY FOR REVIEW</small><strong>'+all.filter(x=>x.status==='Ready').length+'</strong></div></div>'+
 '<div class="tf-marketing-sectionhead"><div><h2>Campaign workspace</h2><p>Design around your target customer and buyer persona.</p></div><button type="button" class="tf-marketing-primary" data-marketing-action="new">+ New draft</button></div>'+
 (!pf.icps.length?'<div class="tf-marketing-info">Set an Ideal Customer Profile under Growth Intelligence before planning a targeted campaign. <button type="button" data-tab="growth">Set ICP ↗</button></div>':'')+
 '<div class="tf-marketing-filter" role="group" aria-label="Campaign status">'+[['all','All'],['Draft','Draft'],['Ready','Ready'],['Archived','Archived']].map(([id,label])=>'<button class="'+(filter===id?'active':'')+'" type="button" data-marketing-action="filter" data-filter="'+id+'">'+label+'</button>').join('')+'</div>'+
 (show.length?show.slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).map(x=>
  '<button type="button" class="tf-marketing-listrow" data-marketing-action="open" data-id="'+e(x.id)+'"><span><strong>'+e(x.title)+'</strong><small>'+e(x.channel)+' · '+e(x.plannedDate||'No date')+'</small></span>'+badge(x.status)+'<span class="tf-marketing-chevron">›</span></button>').join('')
  :'<div class="tf-marketing-empty">No marketing drafts in this view. Save a campaign draft or start from a template.</div>')+
 '<div class="tf-marketing-sectionhead"><div><h2>Recommended starting points</h2><p>Templates to edit, not automatically generated or executed campaigns.</p></div></div>'+
 templates.map(x=>'<article class="tf-marketing-template"><div><strong>'+e(x.title)+'</strong><small>'+e(x.channel)+'</small></div><button type="button" data-marketing-action="template" data-key="'+e(x.key)+'">Create draft</button></article>').join('')+
 '<p class="tf-marketing-note">No automatic ads, email/SMS sending, Google profile edits, web crawling or billing are active here. Marketing work is stored only on this device until future account services exist.</p></div>';
}
function render(tab,d){return tab==='marketing'?(mode==='edit'?editForm(d):mode==='detail'?detail(d):list(d)):''}
async function onClick(event){
 if(!api)return;const button=event.target.closest?.('[data-marketing-action]');if(!button)return;
 event.preventDefault();
 const action=button.dataset.marketingAction,id=button.dataset.id;
 try{
  if(action==='list'){mode='list';draftId='';api.render();return}
  if(action==='new'){mode='edit';draftId='';api.render();return}
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
function configure(bridge){api=bridge;document.addEventListener('click',onClick);document.addEventListener('submit',onSubmit)}
global.TradeFlowMarketing={configure,render,_test:{templates,esc:e,profiles}};
})(typeof window!=='undefined'?window:globalThis);
