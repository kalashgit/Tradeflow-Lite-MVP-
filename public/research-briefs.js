/* TradeFlow R04 Research Briefs — source-first ICP research specifications.
 * Local and offline. This module does not scrape, enrich, purchase or generate leads.
 * Only imported and independently verified records become opportunities.
 */
(function(global){
'use strict';
let api=null,mode='list',currentId='',filter='';
const PREFIX='tf-research-brief:';
// Exact Opportunity import CSV schema, checked in tests.
const OPPORTUNITY_COLUMNS=['record_id','source_record_id','project_name','trade','opportunity_type','project_description','city','region','latitude','longitude','source_url','source_date','discovered_at','verified_at','evidence_status','status','organization_name','contact_url','evidence_notes','contact_person','contact_phone','contact_email','contact_source_url','icp_profile_id','address','postal_code','country','map_location_status','map_error','map_address_result'];
const e=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=(v,n=500)=>String(v==null?'':v).trim().slice(0,n);
const iso=()=>new Date().toISOString();
const options=[
 ['all','All types — individually classified'],
 ['verified_request','Verified demand only'],
 ['potential_opportunity','Potential opportunities'],
 ['project_signal','Documented project signals'],
 ['business_prospect','Business prospects']
];
function profileData(data){
 const p=(data.settings||[]).find(x=>x.id==='growth-profiles-v1')||{};
 return {icps:Array.isArray(p.icps)?p.icps:[],personas:Array.isArray(p.personas)?p.personas:[],active:p.activeIcpId||''};
}
function records(data){return (data.settings||[]).filter(x=>typeof x.id==='string'&&x.id.startsWith(PREFIX)&&x.kind==='research_brief');}
function choose(name,label,list,value){
 return '<label class="tf-rb-field"><span>'+e(label)+'</span><select name="'+e(name)+'"'+(name==='icpId'?' id="tfResearchIcp"':'')+'>'+list.map(([id,title])=>'<option value="'+e(id)+'"'+(id===value?' selected':'')+'>'+e(title)+'</option>').join('')+'</select></label>';
}
function personaChoice(personas,icpId,current){
 return '<label class="tf-rb-field"><span>Buyer persona</span><select name="personaId" id="tfResearchPersona">'+
 '<option value="">No buyer persona</option>'+
 personas.map(x=>{
  const disabled=!!(icpId&&x.icpId&&x.icpId!==icpId);
  return '<option value="'+e(x.id)+'" data-icp-id="'+e(x.icpId||'')+'"'+
   (x.id===current&&!disabled?' selected':'')+(disabled?' disabled hidden':'')+'>'+e(x.name)+'</option>';
 }).join('')+'</select></label>';
}
function filterPersonas(icpSelect,personaSelect){
 if(!icpSelect||!personaSelect)return;
 for(const option of Array.from(personaSelect.options||[])){
  const owner=option.dataset?.icpId||'',eligible=!option.value||!icpSelect.value||!owner||owner===icpSelect.value;
  option.disabled=!eligible;option.hidden=!eligible;
  if(!eligible&&option.selected)personaSelect.value='';
 }
}
function input(name,label,value,max,placeholder,required=false){
 return '<label class="tf-rb-field"><span>'+e(label)+(required?' *':'')+'</span><input type="text" name="'+e(name)+'" maxlength="'+max+'" value="'+e(value||'')+'" placeholder="'+e(placeholder||'')+'"'+(required?' required':'')+'></label>';
}
function area(name,label,value,max,placeholder){
 return '<label class="tf-rb-field"><span>'+e(label)+'</span><textarea name="'+e(name)+'" maxlength="'+max+'" rows="3" placeholder="'+e(placeholder||'')+'">'+e(value||'')+'</textarea></label>';
}
function header(desc){
 return '<header class="tf-rb-heading"><span class="tf-rb-kicker">TRADEFLOW / ACQUISITION INTELLIGENCE</span><h1>Research Briefs</h1><p>'+e(desc)+'</p></header>';
}
function back(){return '<button class="tf-rb-back" type="button" data-research-action="list">‹ All research briefs</button>'}
function tiles(data){
 const briefs=records(data),active=briefs.filter(x=>x.status==='brief_only');
 return '<div class="tf-rb-stats"><div><small>BRIEFS</small><strong>'+briefs.length+'</strong></div><div><small>NOT STARTED</small><strong>'+active.length+'</strong></div><div><small>ICP PROFILES</small><strong>'+profileData(data).icps.length+'</strong></div></div>';
}
function list(data){
 const briefs=records(data).slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
 const target=profileData(data);
 return '<section class="tf-rb-page"><button class="tf-rb-back" type="button" data-tab="settings">‹ More</button>'+
 header('Create a precise lead-research request before paying for discovery or enrichment.')+
 tiles(data)+
 '<div class="tf-rb-sectionhead"><div><h2>Your research briefs</h2><p>Define buyer fit, geography, source requirements and verification.</p></div>'+
 '<button class="tf-rb-primary" type="button" data-research-action="new">+ New brief</button></div>'+
 (target.icps.length?'':'<div class="tf-rb-notice"><strong>Start with your target customer</strong><p>Create an ICP and buyer persona, then return to build an evidence-backed research specification.</p><button class="tf-rb-secondary" data-tab="growth" type="button">Create ICP ↗</button></div>')+
 (briefs.length?briefs.map(x=>'<button class="tf-rb-listrow" type="button" data-research-action="open" data-id="'+e(x.id)+'">'+
 '<span><strong>'+e(x.title)+'</strong><small>'+e(x.geography)+' · '+Number(x.requestedCount||0)+' requested · Draft only</small></span>'+
 '<span aria-hidden="true">›</span></button>').join(''):'<div class="tf-rb-empty"><strong>No research briefs yet</strong><p>Save a research brief with verification rules; export it to work with a researcher. Creating it will not produce any leads.</p></div>')+
 '<div class="tf-rb-notice"><strong>Keep the evidence attached</strong><p>TradeFlow accepts sourced, reviewed opportunity records, with demand classification and contact provenance. This module does not contact or charge prospects, claim live availability, or run paid research.</p>'+
 '<button type="button" class="tf-rb-secondary" data-tab="opportunities">View Opportunities ↗</button></div></section>';
}
function form(data){
 const targets=profileData(data),old=records(data).find(x=>x.id===currentId)||{};
 const selected=old.icpId||targets.active||'',icp=targets.icps.find(x=>x.id===selected);
 // Render all personas but disable those unrelated to the chosen ICP.
 // When ICP changes, filtering happens on the existing form without losing edits.
 return '<section class="tf-rb-page">'+back()+header(old.id?'Update a research brief without changing already imported evidence.':'Define exactly which prospects to research and how to verify them.')+
 '<form id="tfResearchBriefForm" class="tf-rb-card tf-rb-form">'+
 input('title','Research title',old.title,120,'e.g. Austin commercial electrical renovations',true)+
 choose('icpId','Ideal customer profile',[['','Select saved ICP']].concat(targets.icps.map(x=>[x.id,x.name])),selected)+
 personaChoice(targets.personas,selected,old.personaId||'')+
 '<div class="tf-rb-two">'+input('geography','Research area',old.geography||icp?.area||'',120,'Austin, Texas',true)+
 '<label class="tf-rb-field"><span>Requested records *</span><input type="number" min="1" max="200" step="1" required name="requestedCount" value="'+e(old.requestedCount||25)+'"></label></div>'+
 choose('focus','Focus / classification',options,old.focus||'all')+
 area('signals','Demand and project signals to look for',old.signals||icp?.signals||'',1300,'Documented permits, procurement requests, active projects')+
 area('exclusions','Exclude irrelevant prospects',old.exclusions||icp?.exclusions||'',1000,'Outside service area, wrong scope, duplicate organizations')+
 area('verification','Additional quality requirements',old.verification||'',1100,'Original URL, source date, evidence status and verification date')+
 '<div class="tf-rb-actions"><button class="tf-rb-primary" type="submit">Save research brief</button><button class="tf-rb-secondary" type="button" data-research-action="list">Cancel</button></div>'+
 '<p class="tf-rb-disclosure">The currently selected ICP and persona are captured as a snapshot when saved. New edits to the original profiles do not silently rewrite an existing research assignment.</p>'+
 '</form></section>';
}
function csvTemplate(){return OPPORTUNITY_COLUMNS.join(',')+'\r\n'}
function spec(row){
 const snapshot=row.snapshot||{},icp=snapshot.icp||null,persona=snapshot.persona||null;
 return {
  format:'tradeflow-research-brief',version:1,id:row.id,generatedAt:iso(),researchStatus:'not_started',title:row.title,
  requestedRecords:Number(row.requestedCount),researchGeography:row.geography,
  targets:{idealCustomerProfile:icp,buyerPersona:persona},
  categoryFocus:row.focus,signals:row.signals,exclusions:row.exclusions,verificationNotes:row.verification,
  acceptedClassificationValues:['verified_request','potential_opportunity','project_signal','business_prospect'],
  classificationRules:{
   verified_request:'Sourced request demonstrably asking for electrical/trade services; provide original solicitation and current status.',
   potential_opportunity:'Sourced project with plausible trade scope but no confirmed request for a supplier.',
   project_signal:'Documented activity without confirmed work available to bid.',
   business_prospect:'Relevant organization; no evidence of current project demand.'
  },
  requiredColumns:OPPORTUNITY_COLUMNS,
  publishedRecordRequirements:[
   'Use HTTPS original source URLs and real dates, not guessed metadata.',
   'Keep source evidence attached; record date checked and demand classification separately.',
   'Public business contact details only where appropriately sourced; leave unavailable fields blank.',
   'Do not invent phone numbers, email addresses, coordinates, budget, open bids or purchasing intent.',
   'Deduplicate on canonical record ID and source record before research and during intake.',
   'Do not import unverified records as verified demand. Use the existing TradeFlow QC/import flow.',
   'Research and enrichment must respect access terms, local laws, privacy and outreach permission.',
   'A research brief alone is not a paid fulfillment, verified prospect, or customer order.'
  ],
  output:'Use TradeFlow opportunity CSV schema after independent verification. Submit for human approval; never auto-publish raw results.'
 };
}
function detail(data){
 const row=records(data).find(x=>x.id===currentId);
 if(!row){mode='list';return list(data)}
 const p=row.snapshot||{},icp=p.icp,persona=p.persona;
 return '<section class="tf-rb-page">'+back()+header('Review and export this research assignment. No paid search has run.')+
 '<article class="tf-rb-card"><div class="tf-rb-detail-head"><div><small>RESEARCH DEFINITION</small><h2>'+e(row.title)+'</h2></div><span class="tf-rb-pill">BRIEF ONLY</span></div>'+
 '<div class="tf-rb-kv"><span>Target geography</span><strong>'+e(row.geography)+'</strong>'+
 '<span>Requested records</span><strong>'+Number(row.requestedCount)+'</strong>'+
 '<span>Ideal customer profile</span><strong>'+e(icp?.name||'Not selected')+'</strong>'+
 '<span>Buyer persona</span><strong>'+e(persona?.name||'Not selected')+'</strong>'+
 '<span>Classification focus</span><strong>'+e(row.focus||'all')+'</strong>'+
 '<span>Buying signals</span><strong>'+e(row.signals||'Not specified')+'</strong>'+
 '<span>Exclusions</span><strong>'+e(row.exclusions||'Not specified')+'</strong>'+
 '</div>'+
 '<div class="tf-rb-actions"><button class="tf-rb-primary" type="button" data-research-action="export" data-id="'+e(row.id)+'">Export JSON brief</button>'+
 '<button class="tf-rb-secondary" type="button" data-research-action="template" data-id="'+e(row.id)+'">Download blank CSV template</button>'+
 '<button class="tf-rb-secondary" type="button" data-research-action="copy" data-id="'+e(row.id)+'">Copy instructions</button>'+
 '<button class="tf-rb-secondary" type="button" data-research-action="task" data-id="'+e(row.id)+'">Create review Task</button>'+
 '<button class="tf-rb-secondary" type="button" data-research-action="edit" data-id="'+e(row.id)+'">Edit</button>'+
 '<button class="tf-rb-danger" type="button" data-research-action="delete" data-id="'+e(row.id)+'">Delete</button></div>'+
 '<details><summary>See machine-readable specification</summary><pre>'+e(JSON.stringify(spec(row),null,2))+'</pre></details>'+
 '<p class="tf-rb-disclosure">Exporting these instructions does not run research. Only human-reviewed, evidence-backed results should be imported into Opportunities. Contact data must be appropriately sourced.</p></article>'+
 '<div class="tf-rb-notice"><strong>Next: quality-controlled opportunities</strong><p>After an actual research worker returns supported records, use the Opportunities CSV importer. Verify classification, sources, date, duplicates and contact provenance before publishing.</p><button type="button" class="tf-rb-secondary" data-tab="opportunities">Open Opportunities →</button></div>'+
 '</section>';
}
function render(data){return mode==='edit'?form(data):mode==='detail'?detail(data):list(data)}
async function onSubmit(event){
 if(!api||event.target.id!=='tfResearchBriefForm')return;
 event.preventDefault();
 const values=new FormData(event.target),get=(key,max)=>clean(values.get(key),max);
 try{
  const title=get('title',120),geography=get('geography',120),count=Number(values.get('requestedCount'));
  if(!title||!geography||title.length>120||geography.length>120)throw Error('Name and geography are required.');
  if(!Number.isInteger(count)||count<1||count>200)throw Error('Choose 1 to 200 requested records.');
  const focus=get('focus',50);if(!options.some(x=>x[0]===focus))throw Error('Invalid classification filter.');
  const settings=await api.all('settings'),p=profileData({settings});
  const icpId=get('icpId',120),personaId=get('personaId',120);
  const icp=p.icps.find(x=>x.id===icpId),persona=p.personas.find(x=>x.id===personaId);
  if(icpId&&!icp)throw Error('The selected ICP no longer exists.');
  if(personaId&&(!persona||!!icpId&&!!persona.icpId&&persona.icpId!==icpId))throw Error('The buyer persona does not match this ICP.');
  const old=currentId?await api.get('settings',currentId):null;
  if(currentId&&!old)throw Error('This brief was deleted.');
  if(!old&&settings.filter(x=>typeof x.id==='string'&&x.id.startsWith(PREFIX)).length>=100)throw Error('Maximum 100 research briefs.');
  const now=iso(),row={id:old?.id||PREFIX+api.uid(),kind:'research_brief',status:'brief_only',title,geography,requestedCount:count,focus,
   icpId,personaId,signals:get('signals',1300),exclusions:get('exclusions',1000),verification:get('verification',1100),
   snapshot:{icp:icp?{...icp}:null,persona:persona?{...persona}:null},updatedAt:now,createdAt:old?.createdAt||now};
  await api.put('settings',row);
  currentId=row.id;mode='detail';api.notify('Research brief saved — no search executed');
 }catch(err){alert('Could not save brief: '+err.message)}
}
function download(filename,data,mime='application/json'){
 const blob=new Blob([data],{type:mime}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function onClick(event){
 if(!api)return;
 const btn=event.target.closest?.('[data-research-action]');if(!btn)return;
 event.preventDefault();
 const action=btn.dataset.researchAction,id=btn.dataset.id;
 try{
  if(action==='list'){mode='list';currentId='';api.render();return}
  if(action==='new'){mode='edit';currentId='';api.render();return}
  if(action==='edit'){mode='edit';currentId=id;api.render();return}
  if(action==='open'){mode='detail';currentId=id;api.render();return}
  if(!id||!id.startsWith(PREFIX))return;
  const row=await api.get('settings',id);
  if(!row||row.kind!=='research_brief')return;
  if(action==='delete'){
   if(!confirm('Delete this saved research brief? No opportunity records will be changed.'))return;
   await api.del('settings',id);currentId='';mode='list';api.notify('Research brief deleted');return;
  }
  if(action==='template'){
   download('tradeflow-opportunities-template-'+row.id.slice(PREFIX.length)+'.csv',csvTemplate(),'text/csv;charset=utf-8');
   api.notify('Blank CSV template downloaded. No leads were generated.');return;
  }
  if(action==='copy'||action==='export'){
   const json=JSON.stringify(spec(row),null,2);
   if(action==='copy'){
    if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable; use the Export button.');
    await navigator.clipboard.writeText(json);api.notify('Research instructions copied');return;
   }
   download('tradeflow-research-brief-'+row.id.slice(PREFIX.length)+'.json',json);return;
  }
  if(action==='task'){
   const existing=(await api.all('tasks')).some(x=>x.researchBriefId===id&&x.status!=='Done');
   if(existing){api.notify('Review Task already exists for this research brief');return}
   await api.put('tasks',{id:api.uid(),title:'Review research quality: '+row.title.slice(0,100),
    description:'Obtain real sourced records, verify original URLs, dates, classifications and business contact provenance; deduplicate and review before import. No automated research is running.',
    status:'Open',due:new Date().toISOString().slice(0,10),researchBriefId:id,createdAt:iso()});
   api.notify('Verification review Task created');return;
  }
 }catch(err){alert('Research action failed: '+err.message)}
}
function onChange(event){
 if(event.target?.id!=='tfResearchIcp')return;
 filterPersonas(event.target,document.getElementById('tfResearchPersona'));
}
function configure(bridge){
 api=bridge;
 document.addEventListener('click',onClick);
 document.addEventListener('submit',onSubmit);
 document.addEventListener('change',onChange);
}
global.TradeFlowResearch={configure,render,_test:{records,profileData,spec,escape:e,options,filterPersonas,personaChoice,csvTemplate,opportunityColumns:OPPORTUNITY_COLUMNS}};
})(typeof window!=='undefined'?window:globalThis);
