/* TradeFlow Growth Intelligence — Release 01.
   Original TradeFlow interface. Offline-first: data stored in existing settings and tasks.
   Suggestions are rule-based; there is no background AI worker or paid lead engine here. */
(function(global){
'use strict';
var bridge=null,editor='',editId='',section='icps';
var PROFILE_KEY='growth-profiles-v1';
function e(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function clean(v,max){return String(v==null?'':v).trim().slice(0,max||250)}
function settings(d){
 var r=(d.settings||[]).find(function(x){return x.id===PROFILE_KEY})||{};
 return {id:PROFILE_KEY,icps:Array.isArray(r.icps)?r.icps:[],personas:Array.isArray(r.personas)?r.personas:[],activeIcpId:r.activeIcpId||'',updatedAt:r.updatedAt||''};
}
function ico(name){
 var paths={target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',mission:'<rect x="4" y="4" width="16" height="17" rx="2"/><path d="m8 12 3 3 5-6"/>',library:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M8 5V3m8 2V3M3 11h18"/>',people:'<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M17 5a3 3 0 0 1 0 6M17 14c3 0 5 2 5 6"/>',arrow:'<path d="m9 5 7 7-7 7"/>',plus:'<path d="M12 5v14M5 12h14"/>',spark:'<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z"/>',mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 8 9 6 9-6"/>',phone:'<path d="M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2C9 21 3 15 3 5a2 2 0 0 1 2-2"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',book:'<path d="M4 4h14v17H4zM8 9h6M8 13h6"/>',check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'};
 return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.target)+'</svg>';
}
function back(tab){return '<button class="tf-growth-back" type="button" data-tab="'+e(tab||'settings')+'">‹ <span>Back to '+(tab==='dashboard'?'Home':'More')+'</span></button>'}
function head(title,desc){return '<header class="tf-growth-heading"><div><span class="tf-growth-kicker">TRADEFLOW / BUSINESS INTELLIGENCE</span><h1>'+e(title)+'</h1><p>'+e(desc)+'</p></div></header>'}
function link(tab,title,desc,icon){
 return '<button type="button" class="tf-growth-route" data-tab="'+e(tab)+'"><span class="tf-growth-route-icon">'+ico(icon)+'</span><span class="tf-growth-route-text"><strong>'+e(title)+'</strong><small>'+e(desc)+'</small></span><span class="tf-growth-chevron">›</span></button>';
}
function moreQuickLinks(d){
 // Four specialized capability routes only. Never mirror the primary More-menu tools.
 var groups=[
  ['Automation','mission','growthAutomation',['Lead discovery engine','Contact enrichment','Workflow runs','Scheduled research']],
  ['Optimization','target','growthOptimization',['Performance analysis','Business health checks','Growth recommendations','Conversion improvements']],
  ['Communication','people','growthCommunication',['Message templates','Scheduled communication','AI response drafting','Review requests']],
  ['Data Intelligence','library','growthIntelligence',['Opportunity signals','Buyer-fit analysis','Source monitoring','Data quality']]
 ];
 return '<section class="tf-growth-more-shortcuts tf-growth-four" aria-label="Business growth categories"><span class="tf-growth-kicker">BUSINESS GROWTH</span>'+
 groups.map(function(group){return '<details class="tf-growth-category"><summary><span class="tf-growth-category-icon">'+ico(group[1])+'</span><strong>'+e(group[0])+'</strong><span class="tf-growth-category-arrow" aria-hidden="true">›</span></summary><div class="tf-growth-category-links">'+group[3].map(function(feature){return '<div class="tf-growth-category-feature">'+e(feature)+'</div>'}).join('')+'<button class="tf-growth-category-open" type="button" data-tab="'+e(group[2])+'">Explore '+e(group[0])+' <span aria-hidden="true">›</span></button></div></details>'}).join('')+'</section>';
}
function businessCapabilityPage(tab,d){
 var specs={
  growthAutomation:{title:'Automation',description:'Design repeatable workflows while keeping customer data and execution under your control.',items:[['Lead discovery engine','Planned','Find opportunities from approved sources using saved targeting rules.'],['Contact enrichment','Planned','Retrieve sourced public business contact details.'],['Workflow runs','Planned','Configure repeatable actions with approvals and activity logs.'],['Scheduled research','Planned','Run research tasks on a connected cloud or device.']]},
  growthOptimization:{title:'Optimization',description:'See what your current business records show and identify areas worth improving.',items:[['Recorded conversion overview','Available','Review the ratio of quotations to customers as a basic local indicator.'],['Business health checks','Planned','Turn gaps in revenue, costs and delivery into prioritized recommendations.'],['Growth recommendations','Planned','Generate business-specific improvements from permitted data.'],['Conversion improvements','Planned','Evaluate quotation, prospecting and sales-stage efficiency.']]},
  growthCommunication:{title:'Communication',description:'Prepare better messages without confusing drafts with messages that were sent.',items:[['Message templates','Planned','Create reusable email and SMS templates for different customer situations.'],['Scheduled communication','Planned','Queue messages for review and approved delivery.'],['AI response drafting','Planned','Use the customer-selected AI to prepare replies.'],['Review requests','Planned','Send appropriate review invitations after completed work.']]},
  growthIntelligence:{title:'Data Intelligence',description:'Turn saved records and external evidence into reliable business signals.',items:[['Local opportunity overview','Available','See how many saved opportunities have a location and which need review.'],['Buyer-fit analysis','Planned','Assess fit using saved ICP and buying-persona criteria.'],['Source monitoring','Planned','Watch customer-approved sources for relevant changes.'],['Data quality','Planned','Track duplicates, missing contacts and verification confidence.']]}
 };
 var spec=specs[tab];if(!spec)return '';
 var ops=d.opportunities||[],customers=d.customers||[],quotes=d.quotes||[];
 var mapped=ops.filter(function(o){return Number.isFinite(Number(o.latitude))&&Number.isFinite(Number(o.longitude))&&String(o.latitude||'')!==''&&String(o.longitude||'')!==''}).length;
 var metrics=tab==='growthIntelligence'?[['Opportunities',ops.length],['Mapped',mapped],['Unmapped',Math.max(0,ops.length-mapped)]]:tab==='growthOptimization'?[['Customers',customers.length],['Quotations',quotes.length],['Jobs',(d.jobs||[]).length]]:null;
 return '<section class="tf-growth-page tf-growth-capability-page">'+back('settings')+head(spec.title,spec.description)+
  (metrics?'<section class="tf-growth-capability-metrics">'+metrics.map(function(x){return '<div><small>'+e(x[0])+'</small><strong>'+e(x[1])+'</strong></div>'}).join('')+'</section>':'')+
  '<section class="tf-growth-capability-list">'+spec.items.map(function(item){return '<article class="tf-growth-capability-card"><div><strong>'+e(item[0])+'</strong><span class="'+(item[1]==='Available'?'is-available':'is-planned')+'">'+e(item[1])+'</span></div><p>'+e(item[2])+'</p></article>'}).join('')+'</section>'+
  '<p class="tf-growth-capability-disclosure">Available metrics use records saved on this device. Planned services do not run, contact prospects or incur charges.</p></section>';
}
function homePanel(d){
 var s=settings(d),active=s.icps.find(function(x){return x.id===s.activeIcpId});
 var open=(d.tasks||[]).filter(function(t){return t.missionOrigin==='growth'&&t.status!=='Done'}).length;
 return '<section class="tf-growth-home-widget"><div><span class="tf-growth-kicker">GROWTH INTELLIGENCE</span><h2>Your next actions</h2><p>'+(open?e(open+' mission'+(open===1?'':'s')+' in progress.'):'Turn useful recommendations into tracked tasks.')+'</p></div><div class="tf-growth-home-actions"><button type="button" data-tab="missions">Missions →</button><button type="button" data-tab="calendar">Calendar →</button><button type="button" data-tab="growth">'+(active?'Target: '+e(active.name):'Set target customers')+' →</button></div></section>';
}
function tabs(s){
 return '<div class="tf-growth-tabs" role="group" aria-label="Target profile sections">'+
 '<button type="button" data-growth-action="section" data-section="icps" aria-pressed="'+(section==='icps')+'" class="'+(section==='icps'?'active':'')+'">Ideal customer profiles <span>'+s.icps.length+'</span></button>'+
 '<button type="button" data-growth-action="section" data-section="personas" aria-pressed="'+(section==='personas')+'" class="'+(section==='personas'?'active':'')+'">Buyer personas <span>'+s.personas.length+'</span></button></div>';
}
function field(label,name,value,opts){
 opts=opts||{};var isArea=opts.area,required=opts.required?' required':'',max=opts.max||160,hint=opts.hint||'';
 var common='name="'+name+'" maxlength="'+max+'"'+required;
 return '<label class="tf-growth-field"><span>'+e(label)+(opts.required?' *':'')+'</span>'+
 (isArea?'<textarea '+common+' rows="3" placeholder="'+e(opts.placeholder||'')+'">'+e(value||'')+'</textarea>':
 '<input type="'+(opts.type||'text')+'" '+common+' value="'+e(value||'')+'" placeholder="'+e(opts.placeholder||'')+'"'+(opts.min?' min="'+opts.min+'"':'')+'>')+
 (hint?'<small>'+e(hint)+'</small>':'')+'</label>';
}
function sel(label,name,value,options){
 return '<label class="tf-growth-field"><span>'+e(label)+'</span><select name="'+e(name)+'">'+options.map(function(x){return '<option value="'+e(x[0])+'"'+(x[0]===value?' selected':'')+'>'+e(x[1])+'</option>'}).join('')+'</select></label>';
}
function icpEdit(s,prefs){
 var row=s.icps.find(function(x){return x.id===editId})||{};
 return '<div class="tf-growth-page">'+back('growth')+head(row.id?'Edit ideal customer profile':'New ideal customer profile','Define the organizations or consumers you want TradeFlow to help you reach.')+
 '<form class="tf-growth-card tf-growth-form" id="tfGrowthIcpForm">'+
 field('Profile name','name',row.name,{required:true,max:80,placeholder:'e.g. Austin commercial property managers'})+
 field('Trade or service','trade',row.trade||prefs.primaryTrade,{required:true,max:80,placeholder:'Electrical'})+
 sel('Customer segment','segment',row.segment||'B2B',[['B2B','Businesses (B2B)'],['B2C','Consumers (B2C)'],['Both','Both']])+
 field('Service city / area','area',row.area||prefs.serviceArea,{required:true,max:120,placeholder:'e.g. Austin, TX'})+
 '<div class="tf-growth-two">'+
 field('Travel radius (miles)','radius',row.radius||'25',{type:'number',min:1,max:4})+
 field('Typical organization size','companySize',row.companySize,{max:80,placeholder:'e.g. 5–100 staff'})+'</div>'+
 field('Target organization / customer types','orgTypes',row.orgTypes,{area:true,max:500,placeholder:'General contractors, facility managers, property managers'})+
 field('Preferred job types','jobTypes',row.jobTypes,{area:true,max:500,placeholder:'Commercial renovations, tenant improvements, panel upgrades'})+
 field('Project value range','projectValue',row.projectValue,{max:120,placeholder:'e.g. $2k–$50k'})+
 field('Buying signals to research','signals',row.signals,{area:true,max:500,placeholder:'Issued permits, open tenders, building upgrades'})+
 field('Exclusions and poor-fit leads','exclusions',row.exclusions,{area:true,max:500,placeholder:'Large government-only tenders, distant service areas'})+
 sel('Validation status','validationStatus',row.validationStatus||'draft',[['draft','Draft hypothesis'],['supported','Supporting evidence collected'],['validated','Validated through direct customer evidence']])+
 '<div class="tf-growth-form-actions"><button class="tf-growth-primary" type="submit">Save ICP</button><button class="tf-growth-secondary" type="button" data-growth-action="cancel">Cancel</button></div>'+
 '<p class="tf-growth-disclosure">This is a targeting definition, not an automated lead search. Existing research results are not automatically relabeled.</p></form></div>';
}
function personaEdit(s){
 var row=s.personas.find(function(x){return x.id===editId})||{};
 var icpChoices=[['','No associated ICP']].concat(s.icps.map(function(x){return [x.id,x.name]}));
 return '<div class="tf-growth-page">'+back('growth')+head(row.id?'Edit buyer persona':'New buyer persona','Describe the person who decides whether to purchase or commission your service.')+
 '<form class="tf-growth-card tf-growth-form" id="tfGrowthPersonaForm">'+
 field('Persona name','name',row.name,{required:true,max:80,placeholder:'e.g. Busy property manager'})+
 sel('Linked ideal customer profile','icpId',row.icpId||s.activeIcpId||'',icpChoices)+
 field('Decision-maker role','role',row.role,{required:true,max:120,placeholder:'e.g. Facilities manager'})+
 field('Goals and buying motivations','motivations',row.motivations,{area:true,max:500,placeholder:'Reliable service, minimal disruption, cost predictability'})+
 field('Main pain points','painPoints',row.painPoints,{area:true,max:500,placeholder:'Contractors who miss appointments or leave vague quotes'})+
 field('Buying triggers','triggers',row.triggers,{area:true,max:500,placeholder:'Equipment failure, renovations, compliance upgrades'})+
 field('Objections and decision barriers','objections',row.objections,{area:true,max:500,placeholder:'Budget, insurance documentation, vendor approval'})+
 field('Preferred contact channels','channels',row.channels,{max:150,placeholder:'e.g. Work email and phone'})+
 sel('Validation status','validationStatus',row.validationStatus||'draft',[['draft','Draft hypothesis'],['supported','Supporting evidence collected'],['validated','Validated through direct customer evidence']])+
 '<div class="tf-growth-form-actions"><button class="tf-growth-primary" type="submit">Save buyer persona</button><button class="tf-growth-secondary" type="button" data-growth-action="cancel">Cancel</button></div>'+
 '<p class="tf-growth-disclosure">Personas are user-defined hypotheses. Verify them with real customer conversations.</p></form></div>';
}

function profileStats(d,s){
 var validIds=new Set(s.icps.map(function(x){return x.id}));
 var linked=(d.opportunities||[]).filter(function(o){return validIds.has(o.icp_profile_id)}).length;
 var unvalidated=s.icps.concat(s.personas).filter(function(x){return x.validationStatus!=='validated'}).length;
 return {icps:s.icps.length,personas:s.personas.length,linked:linked,toValidate:unvalidated};
}
function growthMetric(label,value,desc,icon){
 return '<article class="tf-target-metric"><span class="tf-target-metric-icon">'+ico(icon)+'</span><div><small>'+e(label)+'</small><strong>'+e(value)+'</strong><span>'+e(desc)+'</span></div></article>';
}
function targetCard(x,linked,s){
 var active=x.id===s.activeIcpId;
 return '<article class="tf-target-profile-card"><span class="tf-target-profile-icon">'+ico(x.segment==='B2C'?'people':'library')+'</span>'+
 '<div class="tf-target-profile-copy"><strong>'+e(x.name)+'</strong>'+
 '<p>'+e(x.orgTypes||x.area||'Organization types not entered')+'</p>'+
 '<div class="tf-target-chips"><span>'+e(x.trade||'Trade unspecified')+'</span><span>'+e(x.segment||'B2B')+'</span>'+
 (x.area?'<span>'+e(x.area)+'</span>':'')+'</div></div>'+
 '<div class="tf-target-card-actions"><button type="button" data-growth-action="edit" data-type="icp" data-id="'+e(x.id)+'" class="tf-target-view">View →</button>'+
 (!active?'<button type="button" data-growth-action="activate" data-id="'+e(x.id)+'" class="tf-target-minor">Activate</button>':'')+
 '<button type="button" data-growth-action="delete" data-type="icp" data-id="'+e(x.id)+'" class="tf-target-minor delete" aria-label="Delete '+e(x.name)+'">×</button></div>'+
 (active?'<span class="tf-target-profile-active">Active</span>':'')+
 '</article>';
}
function personaCard(x,s){
 var parent=s.icps.find(function(y){return y.id===x.icpId});
 return '<article class="tf-target-profile-card"><span class="tf-target-profile-icon">'+ico('people')+'</span>'+
 '<div class="tf-target-profile-copy"><strong>'+e(x.name)+'</strong><p>'+e(x.role||'Decision-maker role not recorded')+'</p>'+
 '<div class="tf-target-chips"><span>'+e(parent?.name||'No linked ICP')+'</span>'+
 '<span>'+e(x.validationStatus==='validated'?'Validated':x.validationStatus==='supported'?'Evidence recorded':'To validate')+'</span></div></div>'+
 '<div class="tf-target-card-actions"><button type="button" data-growth-action="edit" data-type="persona" data-id="'+e(x.id)+'" class="tf-target-view">View →</button>'+
 '<button type="button" data-growth-action="delete" data-type="persona" data-id="'+e(x.id)+'" class="tf-target-minor delete" aria-label="Delete '+e(x.name)+'">×</button></div></article>';
}
function targetList(d,prefs){
 var s=settings(d);
 if(editor==='icp')return icpEdit(s,prefs);
 if(editor==='persona')return personaEdit(s);
 var current=s.icps.find(function(x){return x.id===s.activeIcpId});
 var summary=profileStats(d,s);
 var content=(section==='icps'?s.icps:s.personas).map(function(x){
  return section==='icps'?targetCard(x,null,s):personaCard(x,s);
 }).join('');
 var label=section==='icps'?'profile':'persona',empty=section==='icps'?'No ideal customer profiles yet. Define your target market to start.':'No buyer personas yet. Describe the people who make buying decisions.';
 return '<section class="tf-growth-page tf-target-v2">'+back('settings')+
 '<header class="tf-target-heading"><div><span class="tf-growth-kicker">TRADEFLOW / GROWTH</span><h1>Target Customers</h1>'+
 '<p>Define who you want to win and the work worth pursuing.</p></div><span class="tf-target-hero">'+ico('target')+'</span></header>'+
 '<div class="tf-target-metrics">'+
 growthMetric('Ideal customer profiles',summary.icps,'Key target markets','people')+
 growthMetric('Buyer personas',summary.personas,'Decision-makers and users','people')+
 growthMetric('Linked opportunities',summary.linked,'Assigned to saved ICPs','target')+
 growthMetric('Profiles to validate',summary.toValidate,'Not marked validated','book')+'</div>'+
 '<section class="tf-target-active"><div class="tf-target-active-top"><strong>Active target</strong>'+
 (current?'<span class="tf-target-active-pill">● Active</span>':'<span class="tf-target-active-pill none">Not configured</span>')+'</div>'+
 (current?'<div class="tf-target-active-main"><span class="tf-target-active-icon">'+ico('library')+'</span><div><h2>'+e(current.name)+'</h2>'+
 '<div class="tf-target-chips"><span>'+e(current.trade)+'</span><span>'+e(current.segment)+'</span>'+
 '<span>'+e(current.area)+'</span>'+(current.radius?'<span>'+e(current.radius)+' mi</span>':'')+'</div>'+
 '<p>'+e([current.jobTypes,current.projectValue].filter(Boolean).join(' · ')||'Add preferred job types and project values to complete this target.')+'</p></div></div>':
 '<p class="tf-target-active-empty">Create an ICP to make it your active target across Research and Marketing.</p>')+
 '<div class="tf-target-active-buttons">'+
 (current?'<button type="button" data-growth-action="edit" data-type="icp" data-id="'+e(current.id)+'">View profile →</button>'+
 '<button type="button" data-tab="research">⌕ Use in research</button>':
 '<button type="button" data-growth-action="new" data-type="icp">＋ Create your first ICP</button>'+
 '<button type="button" data-tab="research">Research Briefs →</button>')+'</div></section>'+
 '<section class="tf-target-collection"><div class="tf-target-section-title"><h2>Customer profiles</h2>'+
 '<button type="button" data-growth-action="new" data-type="'+(section==='icps'?'icp':'persona')+'">＋ New '+label+'</button></div>'+
 '<div class="tf-target-switch" role="group" aria-label="Profile type">'+
 '<button data-growth-action="section" data-section="icps" type="button" aria-pressed="'+(section==='icps')+'" class="'+(section==='icps'?'active':'')+'">Ideal customers ('+s.icps.length+')</button>'+
 '<button data-growth-action="section" data-section="personas" type="button" aria-pressed="'+(section==='personas')+'" class="'+(section==='personas'?'active':'')+'">Buyer personas ('+s.personas.length+')</button></div>'+
 '<div class="tf-target-profile-list">'+(content||'<div class="tf-growth-empty">'+empty+'</div>')+'</div></section>'+
 '<section class="tf-target-workspaces"><h2>Connected workspaces</h2><div>'+
 '<button type="button" data-tab="research"><span>'+ico('book')+'</span><strong>Research Briefs</strong><small>Find targeted opportunities</small><em>→</em></button>'+
 '<button type="button" data-tab="marketing"><span>'+ico('mail')+'</span><strong>Marketing Studio</strong><small>Create campaigns for your ICPs</small><em>→</em></button>'+
 '<button type="button" data-tab="opportunities"><span>'+ico('target')+'</span><strong>Opportunities</strong><small>Track and manage leads</small><em>→</em></button></div></section>'+
 '<p class="tf-target-footer">Metrics reflect saved local records. Profiles are targeting hypotheses; no automatic validation or research is performed.</p></section>';
}
function missionSuggestions(d){
 var profile=settings(d),active=profile.icps.find(function(x){return x.id===profile.activeIcpId});
 var openQuotes=(d.quotes||[]).filter(function(q){return q.status==='Sent'}).length;
 var uncontacted=(d.opportunities||[]).filter(function(x){return x.status==='New'}).length;
 var jobs=(d.jobs||[]).filter(function(x){return x.status!=='Completed'&&x.status!=='Cancelled'}).length;
 var t=[];
 if(!active)t.push({key:'define-icp',title:'Define your ideal customer',desc:'Create an ICP so your opportunities and future research share a clear target.',minutes:15,destination:'growth'});
 else t.push({key:'review-target',title:'Review your target customer profile',desc:'Validate '+active.name+' against your most profitable work.',minutes:15,destination:'growth'});
 if(openQuotes)t.push({key:'quote-followups',title:'Review '+openQuotes+' sent quotation'+(openQuotes===1?'':'s'),desc:'Identify quotes needing follow-up. Review the customer details before contacting anyone.',minutes:20,destination:'quotes'});
 if(uncontacted)t.push({key:'qualify-opportunities',title:'Qualify '+uncontacted+' new opportunity record'+(uncontacted===1?'':'s'),desc:'Inspect source evidence and decide which records deserve outreach.',minutes:20,destination:'opportunities'});
 if(jobs)t.push({key:'review-workload',title:'Review active jobs and capacity',desc:'Check '+jobs+' active job'+(jobs===1?'':'s')+' and identify scheduling or material blockers.',minutes:15,destination:'jobs'});
 t.push({key:'google-business',title:'Audit your Google Business Profile',desc:'Review your services, business information and relevant service areas.',minutes:20,destination:'missions'});
 t.push({key:'sales-process',title:'Review your follow-up process',desc:'Create a repeatable process for responding to genuine inquiries and quotations.',minutes:15,destination:'tasks'});
 return t.slice(0,6);
}
function missions(d){
 var current=(d.tasks||[]).filter(function(x){return x.missionOrigin==='growth'}).slice().sort(function(a,b){return String(b.createdAt||b.due||'').localeCompare(String(a.createdAt||a.due||''))});
 var open=current.filter(function(x){return x.status!=='Done'}),completed=current.filter(function(x){return x.status==='Done'});
 var existing=new Set(current.filter(function(x){return x.status!=='Done'}).map(function(x){return x.missionKey}));
 var suggestions=missionSuggestions(d).filter(function(x){return !existing.has(x.key)});
 return '<div class="tf-growth-page">'+back('settings')+head('Business Missions','Practical growth actions, tracked in the same Tasks system you already use.')+
 '<div class="tf-growth-mission-counter"><div><small>ACTIVE MISSIONS</small><strong>'+open.length+'</strong></div><div><small>COMPLETED</small><strong>'+completed.length+'</strong></div><div><small>LOCAL TASKS</small><strong>'+(d.tasks||[]).length+'</strong></div></div>'+
 '<div class="tf-growth-sectiontop"><div><h2>Your missions</h2><p>Completing a mission marks its linked Task as done.</p></div><button type="button" class="tf-growth-secondary" data-tab="tasks">All Tasks ›</button></div>'+
 (current.length?current.slice(0,20).map(function(m){
  return '<article class="tf-growth-card tf-growth-mission"><label><input type="checkbox" data-growth-action="mission-check" data-id="'+e(m.id)+'" '+(m.status==='Done'?'checked':'')+' aria-label="Complete '+e(m.title)+'"><span><strong class="'+(m.status==='Done'?'tf-growth-done':'')+'">'+e(m.title)+'</strong><small>'+e(m.description||'')+'</small><em>'+e(m.due||'No due date')+' · '+(m.status==='Done'?'Completed':'Open')+'</em></span></label><button data-growth-action="mission-open" data-id="'+e(m.id)+'" type="button">Open in Tasks ›</button></article>';
 }).join(''):'<div class="tf-growth-empty">No missions yet. Choose a suggestion below to create a real Task.</div>')+
 '<div class="tf-growth-sectiontop"><div><h2>Suggested next actions</h2><p>Suggested from your saved local records; no AI research or automatic actions are running.</p></div></div>'+
 suggestions.map(function(x){return '<article class="tf-growth-card tf-growth-suggestion"><div><strong>'+e(x.title)+'</strong><p>'+e(x.desc)+'</p><small>Suggested effort: '+x.minutes+' minutes</small></div><button class="tf-growth-secondary" type="button" data-growth-action="add-mission" data-key="'+e(x.key)+'">Add to Tasks</button></article>'}).join('')+
 '<div class="tf-growth-next">'+ico('spark')+'<div><strong>Ask TradeFlow AI to help plan</strong><p>Open the current AI preview for advice. It does not create or execute missions without your approval.</p><button type="button" class="tf-growth-linkbutton" data-growth-action="ask-ai">Ask AI to plan my week ↗</button></div></div></div>';
}
var sections=[
 {name:'Growth & Acquisition',rows:[
  ['growth','ICP & Buyer Personas','Available','Define and revise your target customer profiles'],
  ['opportunities','Opportunity Records','Available','Import sourced opportunities and review project evidence'],
  ['research','Research Briefs','Available','Create ICP-based research specifications and export instructions'],
  ['','Paid lead research & enrichment','Planned','Verified research runs, contact evidence and quotas'],
  ['dispatch','Review follow-up Tasks','Available','Create local follow-up tasks for completed jobs; no automatic send']]},
 {name:'Marketing',rows:[
  ['marketing','Marketing Studio','Available','Create ICP-based marketing drafts and review requests without sending'],
  ['','Local SEO & Google Business','Planned','Audit visibility and improve business listings'],
  ['','Google and Meta campaigns','Planned','Prepare drafts for approved advertising accounts'],
  ['','Email marketing','Planned','Segment audiences, get approval and track sends']]},
 {name:'Operations & Scheduling',rows:[
  ['jobs','Jobs','Available','Manage scheduled work and progress'],
  ['tasks','Tasks','Available','Track action items and due dates'],
  ['calendar','Calendar & appointments','Available','Day, week, month views and scheduled visits'],
  ['routes','Route Planner','Available','Local geolocated stop ordering; no road ETA'],
  ['dispatch','Crew & Dispatch','Available','Local crew assignments and manually ordered field visits'],
  ['','Drive-time route optimization','Planned','Road distance, traffic and crew constraints'],
  ['','Job forms and files','Planned','Assessment checklists, signatures and attachments']]},
 {name:'Sales & Finance',rows:[
  ['customers','Customers','Available','Maintain customer and contact details'],
  ['quotes','Quotations','Available','Create estimates and advance jobs'],
  ['expenses','Finance','Available','Recorded income, expenses and cash flow'],
  ['invoices','Invoice drafts','Available','Create local drafts and record externally received payments'],
  ['','Online payments','Planned','Authorized provider checkout and hosted payment links'],
  ['profitability','Job cost records','Available','Review linked expenses and manual job cost entries']]},
 {name:'Intelligence & Integrations',rows:[
  ['missions','Business Missions','Available','Turn guidance into trackable Tasks'],
  ['ai','TradeFlow AI','Preview','Current question-and-answer assistant'],
  ['integrations','Integration Status','Available','Review provider readiness and unmet requirements'],
  ['','Automations and QuickBooks','Planned','Authorized workflows, sync and audit logs'],
  ['','Live crew dispatch and client portal','Planned','Secure shared access and permissioned location services']]},
];
function capabilityView(){
 return '<div class="tf-growth-page">'+back('settings')+head('Explore Capabilities','Find existing tools and see which modules are being developed next.')+
 '<label class="tf-growth-search"><span aria-hidden="true">⌕</span><input type="search" id="tfGrowthSearch" placeholder="Search features, e.g. invoices or SEO" aria-label="Search capabilities"></label>'+
 sections.map(function(group){
  return '<section class="tf-growth-capgroup"><h2>'+e(group.name)+'</h2>'+
  group.rows.map(function(x){var hay=e((group.name+' '+x.join(' ')).toLowerCase());
   return '<div class="tf-growth-feature" data-growth-search="'+hay+'">'+
    (x[0]?'<button type="button" data-tab="'+e(x[0])+'">':'<div>')+
    '<span class="tf-growth-feature-text"><strong>'+e(x[1])+'</strong><small>'+e(x[3])+'</small></span>'+
    '<span class="tf-growth-status '+(x[2]==='Available'?'available':'')+'">'+e(x[2])+'</span>'+
    (x[0]?'<span aria-hidden="true">›</span></button>':'</div>')+
   '</div>';
  }).join('')+'</section>';
 }).join('')+
 '<p class="tf-growth-disclosure">Planned modules are not functional yet. Offline data is stored on this device; research and connected workflows require separate services and authorization.</p></div>';
}
function contactPanel(o,d){
 var s=settings(d),profiles=s.icps;
 var email=clean(o.contact_email||'',250),phone=clean(o.contact_phone||'',70);
 var validEmail=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
 var dial=phone.replace(/[^\d+]/g,'');
 var validPhone=/^\+?\d{6,18}$/.test(dial);
 var source=clean(o.contact_source_url||'',450);
 var validSource=/^https:\/\/[^\s<>]+$/i.test(source);
 var linked=profiles.find(function(x){return x.id===o.icp_profile_id});
 return '<section class="tf-growth-opcontact"><header><div><span class="tf-growth-kicker">CONTACT & TARGETING</span><h3>Next contact</h3></div><small>'+e(linked?'ICP: '+linked.name:'No ICP assigned')+'</small></header>'+
 '<div class="tf-growth-contact-actions">'+
 (validPhone?'<a href="tel:'+e(dial)+'">'+ico('phone')+' Call</a><a href="sms:'+e(dial)+'">Message</a>':'<span class="tf-growth-unavailable">No valid phone saved</span>')+
 (validEmail?'<a href="mailto:'+e(email)+'">'+ico('mail')+' Email</a>':'<span class="tf-growth-unavailable">No valid email saved</span>')+
 '</div>'+
 '<button class="tf-growth-secondary" type="button" data-calendar-action="opportunity" data-id="'+e(o.id)+'">Schedule call or site visit on Calendar →</button>'+
 '<form id="tfGrowthOpportunityForm" data-id="'+e(o.id)+'">'+
 field('Contact person / department','contact_person',o.contact_person,{max:120,placeholder:'Optional'})+
 '<div class="tf-growth-two">'+field('Public business phone','contact_phone',phone,{max:70,placeholder:'e.g. +1 512 555 0100'})+
 field('Public business email','contact_email',email,{max:250,placeholder:'name@business.com',type:'email'})+'</div>'+
 field('Original contact source URL','contact_source_url',source,{max:450,placeholder:'https://official-site.example/contact',hint:'Required for a sourced/verified-contact label. Do not enter private or scraped personal contacts.'})+
 (validSource?'<p class="tf-growth-contact-proof">Source on record: <a href="'+e(source)+'" target="_blank" rel="noopener noreferrer">Open ↗</a>. Verify before use.</p>':'<p class="tf-growth-disclosure">Contacts are user-entered until their original public source is documented and checked. Missing contact data stays missing.</p>')+
 sel('Match to ideal customer profile','icp_profile_id',o.icp_profile_id||'',[['','Not assigned']].concat(profiles.map(function(x){return [x.id,x.name]})))+
 '<div class="tf-growth-form-actions"><button class="tf-growth-primary" type="submit">Save contact & ICP</button></div></form></section>';
}
async function persist(s){
 if(!bridge)throw Error('App storage is unavailable');
 s.updatedAt=new Date().toISOString();
 await bridge.put('settings',s);
}
async function click(event){
 if(!bridge)return;
 var b=event.target.closest&&event.target.closest('[data-growth-action]');
 if(!b)return;
 event.preventDefault();
 var action=b.dataset.growthAction,type=b.dataset.type,id=b.dataset.id;
 try{
  if(action==='section'){section=b.dataset.section==='personas'?'personas':'icps';editor='';await bridge.render();return}
  if(action==='new'){editor=type==='persona'?'persona':'icp';editId='';await bridge.render();return}
  if(action==='cancel'){editor='';editId='';await bridge.render();return}
  if(action==='edit'){editor=type==='persona'?'persona':'icp';editId=id;await bridge.render();return}
  if(action==='activate'){
   var active=await bridge.get('settings',PROFILE_KEY)||{id:PROFILE_KEY,icps:[],personas:[]};
   if(!(active.icps||[]).some(function(x){return x.id===id}))return;
   active.activeIcpId=id;await persist(active);bridge.notify('Active target updated');return;
  }
  if(action==='delete'){
   var record=await bridge.get('settings',PROFILE_KEY)||{id:PROFILE_KEY,icps:[],personas:[]};
   if(type==='icp'){
    if((record.personas||[]).some(function(x){return x.icpId===id})|| (await bridge.all('opportunities')).some(function(x){return x.icp_profile_id===id})){
     alert('Reassign linked buyer personas and opportunity records before deleting this ICP.');return;
    }
   }
   if(!confirm('Delete this '+(type==='persona'?'buyer persona':'ideal customer profile')+'?'))return;
   if(type==='persona')record.personas=(record.personas||[]).filter(function(x){return x.id!==id});
   else{record.icps=(record.icps||[]).filter(function(x){return x.id!==id});if(record.activeIcpId===id)record.activeIcpId=''}
   await persist(record);bridge.notify('Profile deleted');return;
  }
  if(action==='add-mission'){
   var data=await Promise.all(['settings','quotes','jobs','tasks','opportunities'].map(function(store){return bridge.all(store)}));
   var d={settings:data[0],quotes:data[1],jobs:data[2],tasks:data[3],opportunities:data[4]};
   var suggestion=missionSuggestions(d).find(function(x){return x.key===b.dataset.key});
   if(!suggestion)return;
   if(d.tasks.some(function(x){return x.missionOrigin==='growth'&&x.missionKey===suggestion.key&&x.status!=='Done'})){
    bridge.notify('This mission is already in Tasks');return;
   }
   await bridge.put('tasks',{id:bridge.uid(),title:suggestion.title,description:suggestion.desc,status:'Open',due:new Date().toISOString().slice(0,10),
    missionOrigin:'growth',missionKey:suggestion.key,createdAt:new Date().toISOString(),estimatedMinutes:suggestion.minutes});
   bridge.notify('Mission added to Tasks');return;
  }
  if(action==='mission-check'){
   var t=await bridge.get('tasks',id);if(!t||t.missionOrigin!=='growth')return;
   t.status=b.checked?'Done':'Open';t.updatedAt=new Date().toISOString();
   await bridge.put('tasks',t);bridge.notify(t.status==='Done'?'Mission completed':'Mission reopened');return;
  }
  if(action==='mission-open'){bridge.navigate('tasks');return}
  if(action==='ask-ai'){
   bridge.openAI('Help me plan three realistic business growth actions this week. Ask me about my company, customers and constraints first. Do not claim to access records or execute app actions.');
   return;
  }
 }catch(error){alert('Action could not be completed: '+error.message)}
}
async function submit(event){
 if(!bridge)return;
 var form=event.target;
 if(!['tfGrowthIcpForm','tfGrowthPersonaForm','tfGrowthOpportunityForm'].includes(form.id))return;
 event.preventDefault();
 var data=new FormData(form),f=function(k,n){return clean(data.get(k),n)};
 try{
  if(form.id==='tfGrowthOpportunityForm'){
   var opportunity=await bridge.get('opportunities',form.dataset.id);
   if(!opportunity)throw Error('Opportunity not found.');
   var mail=f('contact_email',250),phone=f('contact_phone',70),source=f('contact_source_url',450);
   if(mail&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(mail))throw Error('Enter a valid contact email.');
   if(phone&&!/^\+?\d{6,18}$/.test(phone.replace(/[^\d+]/g,'')))throw Error('Enter a valid phone number.');
   if(source&&!/^https:\/\/[^\s<>]+$/i.test(source))throw Error('Use an HTTPS contact source URL.');
   var profiles=await bridge.get('settings',PROFILE_KEY);
   var icp=f('icp_profile_id',120);
   if(icp&&!(profiles?.icps||[]).some(function(x){return x.id===icp}))throw Error('Select a saved ICP.');
   await bridge.put('opportunities',Object.assign({},opportunity,{contact_person:f('contact_person',120),contact_phone:phone,contact_email:mail,contact_source_url:source,icp_profile_id:icp,contact_updated_at:new Date().toISOString()}));
   bridge.notify('Opportunity contact saved');return;
  }
  var row=await bridge.get('settings',PROFILE_KEY)||{id:PROFILE_KEY,icps:[],personas:[],activeIcpId:''};
  if(form.id==='tfGrowthIcpForm'){
   if(!f('name',80)||!f('trade',80)||!f('area',120))throw Error('Name, trade and service area are required.');
   var radius=Number(f('radius',4));if(!Number.isInteger(radius)||radius<1||radius>500)throw Error('Radius must be between 1 and 500 miles.');
   if(!editId&&(row.icps||[]).length>=50)throw Error('Maximum 50 ICP profiles.');
   var profile={id:editId||bridge.uid(),name:f('name',80),trade:f('trade',80),segment:f('segment',10),area:f('area',120),radius:String(radius),
    companySize:f('companySize',80),orgTypes:f('orgTypes',500),jobTypes:f('jobTypes',500),projectValue:f('projectValue',120),signals:f('signals',500),exclusions:f('exclusions',500),validationStatus:f('validationStatus',20)||'draft',
    updatedAt:new Date().toISOString()};
   if(editId&&!(row.icps||[]).some(function(x){return x.id===editId}))throw Error('This ICP no longer exists.');
   row.icps=(row.icps||[]).filter(function(x){return x.id!==profile.id}).concat([profile]);
   if(!row.activeIcpId)row.activeIcpId=profile.id;
  }else{
   if(!f('name',80)||!f('role',120))throw Error('Persona name and decision-maker role are required.');
   var link=f('icpId',120);if(link&&!(row.icps||[]).some(function(x){return x.id===link}))throw Error('Select a saved ICP.');
   if(!editId&&(row.personas||[]).length>=100)throw Error('Maximum 100 buyer personas.');
   var persona={id:editId||bridge.uid(),name:f('name',80),icpId:link,role:f('role',120),motivations:f('motivations',500),painPoints:f('painPoints',500),
    triggers:f('triggers',500),objections:f('objections',500),channels:f('channels',150),validationStatus:f('validationStatus',20)||'draft',updatedAt:new Date().toISOString()};
   if(editId&&!(row.personas||[]).some(function(x){return x.id===editId}))throw Error('This persona no longer exists.');
   row.personas=(row.personas||[]).filter(function(x){return x.id!==persona.id}).concat([persona]);
  }
  await persist(row);
  editor='';editId='';bridge.notify('Targeting profile saved');
 }catch(error){alert('Could not save: '+error.message)}
}
function init(context){
 bridge=context;
 if(typeof document!=='undefined'){
  document.addEventListener('click',click);
  document.addEventListener('submit',submit);
  document.addEventListener('input',function(evt){
   if(evt.target.id!=='tfGrowthSearch')return;
   var q=evt.target.value.toLowerCase().trim();
   document.querySelectorAll('[data-growth-search]').forEach(function(x){x.hidden=!!q&&!x.dataset.growthSearch.includes(q)});
   document.querySelectorAll('.tf-growth-capgroup').forEach(function(x){x.hidden=!x.querySelector('.tf-growth-feature:not([hidden])')});
  });
 }
}
function renderPage(tab,d,prefs){
 if(tab==='growth')return targetList(d,prefs||{});
 if(tab==='missions')return missions(d);
 if(tab==='capabilities')return capabilityView();
 if(['growthAutomation','growthOptimization','growthCommunication','growthIntelligence'].includes(tab))return businessCapabilityPage(tab,d);
 return '';
}
global.TradeFlowGrowth={configure:init,renderPage:renderPage,moreQuickLinks:moreQuickLinks,homePanel:homePanel,contactPanel:contactPanel,
 _test:{settings:settings,missionSuggestions:missionSuggestions,profileStats:profileStats,escape:e}};
})(typeof window!=='undefined'?window:globalThis);
