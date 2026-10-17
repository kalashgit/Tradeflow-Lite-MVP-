/* TradeFlow R04 Research Briefs — source-first ICP research specifications.
 * Local and offline. This module does not scrape, enrich, purchase or generate leads.
 * Only imported and independently verified records become opportunities.
 */
(function(global){
'use strict';
let api=null,mode='list',currentId='',filter='';
const PREFIX='tf-research-brief:';
// Exact Opportunity import CSV schema, checked in tests.
const OPPORTUNITY_COLUMNS=['record_id','source_record_id','project_name','trade','opportunity_type','project_description','city','region','latitude','longitude','source_url','source_date','discovered_at','verified_at','evidence_status','status','organization_name','contact_url','evidence_notes','contact_person','contact_phone','contact_email','contact_source_url','icp_profile_id','address','postal_code','country','map_location_status','map_error','map_address_result','photo_url','place_photo_url','official_photo_url','project_photo_url'];
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

const CLASSES=[
 {key:'verified_request',label:'Verified demand',tone:'green'},
 {key:'potential_opportunity',label:'Potential opportunity',tone:'cyan'},
 {key:'project_signal',label:'Project signals',tone:'amber'},
 {key:'business_prospect',label:'Business prospects',tone:'violet'}
];
let statusFilter='All',reviewOnly=false;
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||'').slice(0,10))&&
 !Number.isNaN(Date.parse(String(v).slice(0,10)+'T12:00:00Z'))&&
 new Date(String(v).slice(0,10)+'T12:00:00Z').toISOString().slice(0,10)===String(v).slice(0,10);
const safeSource=v=>/^https:\/\/[^\s<>"']+$/i.test(String(v||'').trim());
function linkedItems(brief,data){
 const indexed=new Map((data.opportunities||[]).map(o=>[o.id,o]));
 return (Array.isArray(brief.researchItems)?brief.researchItems:[]).filter(x=>x&&x.opportunityId)
  .map(x=>({...x,record:indexed.get(x.opportunityId)})).filter(x=>x.record);
}
function validEvidence(opp){
 if(!opp||!CLASSES.some(x=>x.key===opp.opportunity_type))return false;
 if(!safeSource(opp.source_url)||!validDate(opp.source_date))return false;
 if(opp.opportunity_type==='verified_request')return opp.evidence_status==='verified'&&validDate(opp.verified_at);
 return opp.evidence_status==='verified'||opp.evidence_status==='source_supported';
}
function effectiveDecision(item){
 if(item.decision==='rejected')return 'rejected';
 if(item.decision==='approved'&&validEvidence(item.record))return 'approved';
 return 'pending';
}
function briefMetrics(brief,data){
 const items=linkedItems(brief,data);
 const approved=items.filter(x=>effectiveDecision(x)==='approved');
 const rejected=items.filter(x=>effectiveDecision(x)==='rejected');
 const pending=items.filter(x=>effectiveDecision(x)==='pending');
 const classifications=Object.fromEntries(CLASSES.map(x=>[x.key,approved.filter(v=>v.record.opportunity_type===x.key).length]));
 const reviewed=approved.length+rejected.length;
 return {items,approved,rejected,pending,reviewed,linked:items.length,verified:classifications.verified_request,
  classifications};
}
function stageOf(brief,data){
 const m=briefMetrics(brief,data);
 if(brief.reviewStage==='completed'&&m.linked>0&&m.reviewed>0&&m.pending.length===0)return 'Completed';
 return m.linked>0?'In review':'Draft';
}
function researchOverview(data){
 const briefs=records(data),counts=Object.fromEntries(CLASSES.map(x=>[x.key,0]));
 const unique=new Map();
 for(const brief of briefs)for(const item of linkedItems(brief,data))if(!unique.has(item.opportunityId))unique.set(item.opportunityId,item);
 let approved=0,rejected=0,pending=0;
 for(const item of unique.values()){
  const d=effectiveDecision(item);
  if(d==='approved'){approved++;if(Object.prototype.hasOwnProperty.call(counts,item.record.opportunity_type))counts[item.record.opportunity_type]++}
  else if(d==='rejected')rejected++;
  else pending++;
 }
 return {briefs,linked:unique.size,reviewed:approved+rejected,approved,rejected,pending,verified:counts.verified_request,
  classifications:counts,classified:approved};
}
function svgIcon(kind){
 const paths={
  brief:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  chart:'<path d="M4 20V12m6 8V8m6 12V4m4 16H2"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 3"/>',
  people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5"/>',
  map:'<path d="M12 22s8-7 8-14a8 8 0 0 0-16 0c0 7 8 14 8 14Z"/><circle cx="12" cy="9" r="2.5"/>',
  search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  import:'<path d="M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>'
 };
 return '<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[kind]||paths.brief)+'</svg>';
}
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

function metricCard(label,value,kind,description){
 return '<article class="tf-rb-v2-metric"><span class="tf-rb-v2-metric-icon">'+svgIcon(kind)+'</span>'+
 '<div><small>'+e(label)+'</small><strong>'+value+'</strong><span>'+e(description)+'</span></div></article>';
}
function list(data){
 const summary=researchOverview(data),pf=profileData(data);
 const briefs=summary.briefs.slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
 const visible=briefs.filter(x=>statusFilter==='All'||stageOf(x,data)===statusFilter);
 const labels=[['All','All'],['Draft','Draft'],['In review','In review'],['Completed','Completed']];
 const chart=CLASSES.map(x=>({ ...x,count:summary.classifications[x.key]||0 }));
 const total=chart.reduce((n,x)=>n+x.count,0);
 return '<section class="tf-rb-page tf-rb-v2">'+
 '<header class="tf-rb-v2-heading"><div><span class="tf-rb-kicker">TRADEFLOW / OPPORTUNITY INTELLIGENCE</span>'+
 '<h1>Research Briefs</h1><p>Turn targeted research into evidence-backed opportunities.</p></div>'+
 '<span class="tf-rb-v2-hero-icon">'+svgIcon('search')+'</span></header>'+
 '<div class="tf-rb-v2-metrics">'+
 metricCard('Research briefs',String(briefs.length),'brief','Saved research definitions')+
 metricCard('Records reviewed',String(summary.reviewed),'database','Linked records with QC decisions')+
 metricCard('Verified demand',String(summary.verified),'chart','Approved with verified evidence')+
 metricCard('Awaiting verification',String(summary.pending),'clock','Linked records requiring review')+'</div>'+
 '<section class="tf-rb-v2-panel"><div class="tf-rb-v2-panelhead"><h2>Opportunity classifications</h2><span>Approved: '+total+'</span></div>'+
 '<div class="tf-rb-v2-breakdown" role="img" aria-label="Reviewed approved opportunity classification breakdown">'+
 (total?chart.filter(x=>x.count).map(x=>'<span class="tf-rb-v2-segment '+x.tone+'" style="width:'+(x.count/total*100).toFixed(4)+'%"></span>').join(''):
 '<span class="tf-rb-v2-segment none" style="width:100%"></span>')+'</div>'+
 '<div class="tf-rb-v2-classgrid">'+chart.map(x=>'<div class="tf-rb-v2-class"><span><i class="tf-rb-v2-dot '+x.tone+'"></i>'+e(x.label)+'</span>'+
 '<strong>'+x.count+'</strong><small>'+(total?Math.round(x.count/total*100)+'%':'No approved records')+'</small></div>').join('')+'</div>'+
 '<p class="tf-rb-v2-caption">Only approved, independently sourced records attached to briefs are included. Unlinked Opportunities are excluded; classification is not proof a contractor is currently hiring.</p></section>'+
 '<section class="tf-rb-v2-briefs"><div class="tf-rb-v2-section-head"><h2>Research briefs</h2>'+
 '<button type="button" data-research-action="filter" data-filter="All">View all →</button></div>'+
 '<div class="tf-rb-v2-filters" role="group" aria-label="Research brief review status">'+labels.map(([value,label])=>
 '<button type="button" data-research-action="filter" data-filter="'+value+'" aria-pressed="'+(statusFilter===value)+'" class="'+(statusFilter===value?'active':'')+'">'+label+'</button>').join('')+'</div>'+
 (visible.length?'<div class="tf-rb-v2-list">'+visible.map(row=>{
  const m=briefMetrics(row,data),stage=stageOf(row,data);
  const count=m.approved.length,request=Number(row.requestedCount)||0;
  return '<button type="button" class="tf-rb-v2-row" data-research-action="open" data-id="'+e(row.id)+'">'+
  '<span class="tf-rb-v2-row-icon">'+svgIcon('brief')+'</span>'+
  '<span class="tf-rb-v2-row-copy"><strong>'+e(row.title)+'</strong><small>'+e(row.geography)+' · '+request+' requested</small>'+
  '<span>'+m.linked+' linked · '+m.reviewed+' reviewed'+(count?' · '+count+' approved':'')+'</span></span>'+
  '<span class="tf-rb-v2-status '+(stage==='Completed'?'complete':stage==='In review'?'review':'draft')+'">'+e(stage)+'</span>'+
  '<span class="tf-rb-v2-chevron">›</span></button>';
 }).join('')+'</div>':'<div class="tf-rb-v2-empty"><strong>'+(briefs.length?'No briefs match this filter':'No research briefs yet')+'</strong>'+
 '<p>'+(briefs.length?'Switch filters to find saved briefs.':'Create a research brief to define your sources, buyer criteria and verification rules. No search will run automatically.')+'</p></div>')+
 '</section>'+
 '<section class="tf-rb-v2-tools"><div class="tf-rb-v2-section-head"><h2>Research tools</h2><span>Connected workspaces</span></div>'+
 '<div class="tf-rb-v2-tools-grid">'+
 '<button data-tab="growth" type="button"><span>'+svgIcon('people')+'</span><strong>Target profiles</strong><small>'+pf.icps.length+' saved ICPs · buyer personas</small></button>'+
 '<button data-tab="opportunities" type="button"><span>'+svgIcon('map')+'</span><strong>Opportunities</strong><small>Open saved project records</small></button>'+
 '<button data-research-action="review-queue" type="button"><span>'+svgIcon('search')+'</span><strong>Evidence review</strong><small>Inspect linked sources &amp; QC</small></button>'+
 '<button data-tab="opportunities" type="button"><span>'+svgIcon('import')+'</span><strong>Import results</strong><small>Use Opportunities CSV importer</small></button></div></section>'+
 '<button class="tf-rb-v2-create" type="button" data-research-action="new">＋ Create research brief</button>'+
 '<p class="tf-rb-v2-caption">Briefs are local specifications. Counts come only from existing linked Opportunities and recorded quality-review decisions. TradeFlow has not automatically searched, purchased leads or verified external sites.</p></section>';
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
  format:'tradeflow-research-brief',version:1,id:row.id,generatedAt:iso(),researchStatus:row.reviewStage==='completed'?'quality_review_complete':(row.researchItems||[]).length?'results_under_review':'not_started',title:row.title,
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
  linkedOpportunityReviews:(row.researchItems||[]).map(x=>({opportunityId:x.opportunityId,decision:x.decision,reviewNotes:x.reviewNotes||'',reviewedAt:x.reviewedAt||''})),
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
 const p=row.snapshot||{},icp=p.icp,persona=p.persona,stats=briefMetrics(row,data),stage=stageOf(row,data);
 const linkedIds=new Set((Array.isArray(row.researchItems)?row.researchItems:[]).map(x=>x.opportunityId));
 const occupied=new Set(records(data).filter(x=>x.id!==row.id).flatMap(x=>(x.researchItems||[]).map(y=>y.opportunityId)));
 const available=(data.opportunities||[]).filter(x=>x.id&&!linkedIds.has(x.id)&&!occupied.has(x.id));
 const requested=Number(row.requestedCount)||0;
 const progress=requested?Math.min(100,Math.round(stats.reviewed/requested*100)):0;
 const choices=available.slice(0,300).map(x=>'<option value="'+e(x.id)+'">'+e(x.project_name||x.organization_name||x.id)+' · '+e([x.city,x.region].filter(Boolean).join(', ')||'Location not supplied')+'</option>').join('');
 const rules=CLASSES.map(x=>'<span class="tf-rb-v2-legend"><i class="tf-rb-v2-dot '+x.tone+'"></i>'+e(x.label)+'</span>').join('');
 return '<section class="tf-rb-page tf-rb-v2">'+back()+
 '<header class="tf-rb-v2-heading"><div><span class="tf-rb-kicker">TRADEFLOW / RESEARCH DEFINITION</span><h1>'+e(row.title)+'</h1>'+
 '<p>'+e(row.geography)+' · '+requested+' target records · '+e(stage)+'</p></div><span class="tf-rb-v2-hero-icon">'+svgIcon('brief')+'</span></header>'+
 '<section class="tf-rb-v2-panel"><div class="tf-rb-v2-panelhead"><h2>Research progress</h2><span class="tf-rb-v2-status '+(stage==='Completed'?'complete':stage==='In review'?'review':'draft')+'">'+e(stage)+'</span></div>'+
 '<div class="tf-rb-v2-progressstats"><div><small>LINKED RESULTS</small><strong>'+stats.linked+'</strong></div>'+
 '<div><small>REVIEWED</small><strong>'+stats.reviewed+'</strong></div>'+
 '<div><small>APPROVED</small><strong>'+stats.approved.length+'</strong></div>'+
 '<div><small>PENDING</small><strong>'+stats.pending.length+'</strong></div></div>'+
 '<div class="tf-rb-v2-progressbar"><span style="width:'+progress+'%"></span></div>'+
 '<p class="tf-rb-v2-caption">'+stats.reviewed+' reviewed decisions against a requested target of '+requested+
 '. This measures local quality-control activity, not automatically discovered or purchased leads. Rejected: '+stats.rejected.length+'.</p>'+
 (stage==='Completed'?'<button type="button" class="tf-rb-secondary" data-research-action="review-reopen" data-id="'+e(row.id)+'">Reopen review</button>':
 stats.linked&&stats.pending.length===0&&stats.reviewed?'<button type="button" class="tf-rb-primary" data-research-action="review-complete" data-id="'+e(row.id)+'">Mark quality review complete</button>':'')+
 '</section>'+
 '<article class="tf-rb-card"><div class="tf-rb-detail-head"><div><small>BRIEF ONLY · RESEARCH NOT EXECUTED</small><h2>Research specification</h2></div><span class="tf-rb-pill">'+e(stage)+'</span></div>'+
 '<div class="tf-rb-kv"><span>Target geography</span><strong>'+e(row.geography)+'</strong>'+
 '<span>Requested records</span><strong>'+requested+'</strong>'+
 '<span>Ideal customer profile</span><strong>'+e(icp?.name||'Not selected')+'</strong>'+
 '<span>Buyer persona</span><strong>'+e(persona?.name||'Not selected')+'</strong>'+
 '<span>Classification focus</span><strong>'+e(options.find(x=>x[0]===row.focus)?.[1]||'All types')+'</strong>'+
 '<span>Buying signals</span><strong>'+e(row.signals||'Not specified')+'</strong>'+
 '<span>Exclusions</span><strong>'+e(row.exclusions||'Not specified')+'</strong>'+
 '<span>Verification requirements</span><strong>'+e(row.verification||'Original source and status review required')+'</strong></div>'+
 '<div class="tf-rb-actions"><button class="tf-rb-primary" type="button" data-research-action="export" data-id="'+e(row.id)+'">Export JSON brief</button>'+
 '<button class="tf-rb-secondary" type="button" data-research-action="template" data-id="'+e(row.id)+'">Download blank CSV template</button>'+
 '<button class="tf-rb-secondary" type="button" data-research-action="copy" data-id="'+e(row.id)+'">Copy instructions</button>'+
 '<button class="tf-rb-secondary" type="button" data-research-action="task" data-id="'+e(row.id)+'">Create review Task</button>'+
 '<button class="tf-rb-secondary" type="button" data-research-action="edit" data-id="'+e(row.id)+'">Edit</button>'+
 '<button class="tf-rb-danger" type="button" data-research-action="delete" data-id="'+e(row.id)+'">Delete</button></div>'+
 '<details><summary>See machine-readable specification</summary><pre>'+e(JSON.stringify(spec(row),null,2))+'</pre></details>'+
 '<p class="tf-rb-disclosure">These instructions do not run searches. You can import sourced results through Opportunities, attach their saved records below, and document your human evidence review.</p></article>'+
 '<section class="tf-rb-v2-panel"><div class="tf-rb-v2-panelhead"><h2>Link saved opportunities</h2><span>'+available.length+' unassigned</span></div>'+
 (available.length?'<form class="tf-rb-v2-attach" id="tfResearchAttachForm" data-id="'+e(row.id)+'">'+
 '<label class="tf-rb-field"><span>Select an existing saved opportunity</span><select name="opportunityId" required>'+choices+'</select></label>'+
 '<button type="submit" class="tf-rb-primary">Attach to brief</button></form>':
 '<p class="tf-rb-v2-caption">No unassigned saved Opportunities are available. Import sourced records first.</p>')+
 (available.length>300?'<p class="tf-rb-v2-caption">Showing the first 300 unassigned Opportunities in this selector. Use Opportunities to manage the larger collection.</p>':'')+
 '<button class="tf-rb-secondary" type="button" data-tab="opportunities">Open Opportunities / import results →</button>'+
 '<p class="tf-rb-v2-caption">Attaching is a manual association, not a claim that TradeFlow researched or independently verified the record. A record can be attached to only one research brief.</p></section>'+
 '<section class="tf-rb-v2-panel"><div class="tf-rb-v2-panelhead"><h2>Evidence review</h2><span>'+stats.items.length+' records</span></div>'+
 '<div class="tf-rb-v2-legend-grid">'+rules+'</div>'+
 (stats.items.length?stats.items.map((item,index)=>{
  const op=item.record,state=effectiveDecision(item),source=safeSource(op.source_url)?String(op.source_url).trim():'';
  const cls=CLASSES.find(x=>x.key===op.opportunity_type);
  const adequate=validEvidence(op);
  return '<article class="tf-rb-v2-evidence"><div class="tf-rb-v2-evidence-head"><span class="tf-rb-v2-index">'+(index+1)+'</span>'+
  '<div><strong>'+e(op.project_name||op.organization_name||op.id)+'</strong>'+
  '<small>'+e(op.city||'Location unknown')+' · '+e(cls?.label||'Not classified')+'</small></div>'+
  '<span class="tf-rb-v2-status '+(state==='approved'?'complete':state==='rejected'?'rejected':'review')+'">'+e(state==='pending'?'Pending QC':state==='approved'?'Approved':'Rejected')+'</span></div>'+
  '<div class="tf-rb-v2-evidence-details"><span>Source: '+(source?'<a href="'+e(source)+'" target="_blank" rel="noopener noreferrer">Open original ↗</a>':'Missing / invalid URL')+'</span>'+
  '<span>Source date: '+e(op.source_date||'Missing')+'</span>'+
  '<span>Evidence: '+e(op.evidence_status||'Unresolved')+'</span>'+
  (item.reviewedAt?'<span>Decision saved: '+e(String(item.reviewedAt).slice(0,10))+'</span>':'')+'</div>'+
  (!adequate?'<p class="tf-rb-v2-evidence-warning">This record cannot be approved until its original HTTPS source, date, classification and evidence status are complete in Opportunities.'+
   (op.opportunity_type==='verified_request'?' Verified demand also requires a verified date.':'')+'</p>':'')+
  '<details class="tf-rb-v2-qc"><summary>'+(state==='pending'?'Review record':'View / update QC decision')+' →</summary>'+
  '<form id="tfResearchReviewForm" data-id="'+e(row.id)+'" data-opportunity-id="'+e(op.id)+'">'+
  choose('decision','Quality-control decision',[['pending','Awaiting review'],['approved','Approve source-supported record'],['rejected','Reject record']],state)+
  area('reviewNotes','Verification notes / rejection reason',item.reviewNotes||'',650,'Describe what you checked and why the record should be approved or rejected.')+
  '<label class="tf-rb-v2-confirm"><input type="checkbox" name="reviewConfirmed" value="yes" required> I reviewed this record and its available evidence myself.</label>'+
  '<div class="tf-rb-actions"><button type="submit" class="tf-rb-primary">Save review decision</button>'+
  '<button type="button" class="tf-rb-danger" data-research-action="detach" data-id="'+e(row.id)+'" data-opportunity-id="'+e(op.id)+'">Detach record</button></div></form></details></article>';
 }).join(''):'<div class="tf-rb-v2-empty"><strong>No linked results</strong><p>Start with the Opportunities importer, then associate relevant records with this brief and review their evidence.</p></div>')+
 '</section><p class="tf-rb-v2-caption">Reviews and associations are saved locally alongside this brief. Source records are not modified. External sites are not checked automatically, and approved records must not be presented as confirmed purchasing intent without supporting evidence.</p></section>';
}
function render(data){return mode==='edit'?form(data):mode==='detail'?detail(data):list(data)}

async function attachOpportunity(event){
 event.preventDefault();
 const form=event.target,briefId=clean(form.dataset?.id,160),fd=new FormData(form);
 const opId=clean(fd.get('opportunityId'),160);
 try{
  const brief=await api.get('settings',briefId),opp=await api.get('opportunities',opId);
  if(!brief||brief.kind!=='research_brief'||!opp)throw Error('The brief or opportunity no longer exists.');
  const settings=await api.all('settings');
  const linked=(Array.isArray(brief.researchItems)?brief.researchItems:[]);
  if(linked.some(x=>x.opportunityId===opId))throw Error('Already linked to this research brief.');
  if(linked.length>=200)throw Error('A brief supports up to 200 linked records.');
  if(records({settings}).some(x=>x.id!==briefId&&(x.researchItems||[]).some(y=>y.opportunityId===opId)))
   throw Error('This opportunity is already assigned to another research brief.');
  const updated={...brief,researchItems:[...linked,{opportunityId:opId,decision:'pending',reviewNotes:'',reviewedAt:''}],
   reviewStage:'in_review',updatedAt:iso()};
  await api.put('settings',updated);
  currentId=briefId;mode='detail';api.notify('Existing opportunity linked; evidence awaits review.');
 }catch(err){alert('Could not link opportunity: '+err.message)}
}
async function reviewOpportunity(event){
 event.preventDefault();
 const form=event.target,briefId=clean(form.dataset?.id,160),opId=clean(form.dataset?.opportunityId,160),fd=new FormData(form);
 try{
  const brief=await api.get('settings',briefId),opp=await api.get('opportunities',opId);
  if(!brief||brief.kind!=='research_brief'||!opp)throw Error('The brief or opportunity no longer exists.');
  const items=Array.isArray(brief.researchItems)?brief.researchItems:[];
  if(!items.some(x=>x.opportunityId===opId))throw Error('Opportunity is not linked to this brief.');
  const decision=clean(fd.get('decision'),20),notes=clean(fd.get('reviewNotes'),650);
  if(!['pending','approved','rejected'].includes(decision))throw Error('Choose a supported quality-control decision.');
  if(fd.get('reviewConfirmed')!=='yes')throw Error('Confirm that you personally reviewed the available evidence.');
  if(decision!=='pending'&&notes.length<12)throw Error('Include at least 12 characters of evidence or rejection notes.');
  if(decision==='approved'&&!validEvidence(opp)){
   throw Error('Cannot approve: check the original HTTPS source URL, source date, classification and evidence status in Opportunities first.');
  }
  const updatedItems=items.map(x=>x.opportunityId===opId?{...x,decision,reviewNotes:notes,reviewedAt:decision==='pending'?'':iso()}:x);
  await api.put('settings',{...brief,researchItems:updatedItems,reviewStage:'in_review',updatedAt:iso()});
  currentId=briefId;mode='detail';api.notify(decision==='approved'?'Reviewed and approved with saved evidence':decision==='rejected'?'Research record rejected':'Record returned to pending QC');
 }catch(err){alert('Could not save quality review: '+err.message)}
}
async function onSubmit(event){
 if(!api)return;
 if(event.target.id==='tfResearchAttachForm')return attachOpportunity(event);
 if(event.target.id==='tfResearchReviewForm')return reviewOpportunity(event);
 if(event.target.id!=='tfResearchBriefForm')return;
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
   snapshot:{icp:icp?{...icp}:null,persona:persona?{...persona}:null},
   researchItems:Array.isArray(old?.researchItems)?old.researchItems:[],reviewStage:old?.reviewStage||'draft',
   updatedAt:now,createdAt:old?.createdAt||now};
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
  if(action==='filter'){
   statusFilter=['All','Draft','In review','Completed'].includes(btn.dataset.filter)?btn.dataset.filter:'All';
   mode='list';currentId='';api.render();return;
  }
  if(action==='review-queue'){
   const data={settings:await api.all('settings'),opportunities:await api.all('opportunities')};
   const candidates=records(data);
   const next=candidates.find(b=>briefMetrics(b,data).pending.length>0)||candidates.find(b=>briefMetrics(b,data).linked>0);
   if(!next){api.notify('No linked records for review. Attach imported Opportunities to a research brief first.');return}
   currentId=next.id;mode='detail';api.render();return;
  }
  if(action==='list'){mode='list';currentId='';api.render();return}
  if(action==='new'){mode='edit';currentId='';api.render();return}
  if(action==='edit'){mode='edit';currentId=id;api.render();return}
  if(action==='open'){mode='detail';currentId=id;api.render();return}
  if(!id||!id.startsWith(PREFIX))return;
  const row=await api.get('settings',id);
  if(!row||row.kind!=='research_brief')return;
  if(action==='detach'){
   const opId=clean(btn.dataset.opportunityId,160),items=Array.isArray(row.researchItems)?row.researchItems:[];
   if(!items.some(x=>x.opportunityId===opId))return;
   if(!confirm('Detach this opportunity from the research brief? The original opportunity will not be deleted.'))return;
   await api.put('settings',{...row,researchItems:items.filter(x=>x.opportunityId!==opId),
     reviewStage:'in_review',updatedAt:iso()});
   currentId=id;mode='detail';api.notify('Opportunity detached; source record preserved');return;
  }
  if(action==='review-complete'){
   const data={settings:await api.all('settings'),opportunities:await api.all('opportunities')};
   const m=briefMetrics(row,data);
   if(m.linked===0||m.reviewed===0||m.pending.length)throw Error('Review all linked records before closing quality control.');
   if(!confirm('Mark the human quality review complete? This does NOT claim automatic research ran or the requested target was met.'))return;
   await api.put('settings',{...row,reviewStage:'completed',updatedAt:iso()});
   currentId=id;mode='detail';api.notify('Local quality review marked complete');return;
  }
  if(action==='review-reopen'){
   await api.put('settings',{...row,reviewStage:'in_review',updatedAt:iso()});
   currentId=id;mode='detail';api.notify('Research quality review reopened');return;
  }
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
global.TradeFlowResearch={configure,render,_test:{records,profileData,spec,escape:e,options,filterPersonas,personaChoice,csvTemplate,opportunityColumns:OPPORTUNITY_COLUMNS,researchOverview,briefMetrics,stageOf,validEvidence,effectiveDecision}};
})(typeof window!=='undefined'?window:globalThis);
