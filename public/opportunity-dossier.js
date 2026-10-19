/* TradeFlow Opportunity Dossier v1 — local-first two-screen drilldown.
   No external photo search or fabricated place imagery. Only supplied HTTPS source photos. */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
 const secure=u=>{try{const x=new URL(String(u||''));return x.protocol==='https:'&&!x.username&&!x.password&&x.hostname.length>3?x.href:''}catch{return ''}};
 const stages=['New','Saved','Contacted','Interested','Quoted','Won','Lost'];
 const safeTel=p=>{const original=String(p||'').trim();if(!/^[+()\d\s.\-]{6,35}$/.test(original))return '';const d=original.replace(/[^\d+]/g,'');return /^\+?\d{6,18}$/.test(d)?d:''};
 const safeMail=p=>{const s=String(p||'').trim();return /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(s)?s:''};
 const normalizedPlace=r=>{
  const p=root.TradeFlowEngine?.normalizeAddress(r);
  if(p?.parsed)return [p.street,p.city,[p.region,p.postalCode].filter(Boolean).join(' '),p.country].filter(Boolean).join(', ');
  return String(r.address||r.site_address||r.project_address||r.city||'Location not supplied').trim();
 };
 const classification=r=>({verified_request:'Verified request',potential_opportunity:'Potential opportunity',project_signal:'Project signal',business_prospect:'Business prospect'})[r.opportunity_type]||'Project signal';
 const evidence=r=>({verified:'Verified',source_supported:'Source supported',unresolved:'Needs review'})[r.evidence_status]||'Needs review';
 function frame(title,body,record){
  const isDossier=title==='Opportunity dossier',id=esc(record?.id||''),source=secure(record?.source_url);
  const menu=(isDossier?
   '<button type="button" data-action="opportunityWorkflow" data-id="'+id+'">Contact &amp; workflow →</button>':
   '<button type="button" data-action="opportunityBack">Opportunity dossier ←</button>')+
   (source?'<a href="'+esc(source)+'" target="_blank" rel="noopener noreferrer">Open original source ↗</a>':'');
  return '<section class="tf-od-screen"><header class="tf-od-nav">'+
   '<button type="button" data-action="opportunityBack" aria-label="Back">'+glyph('back')+'</button>'+
   '<h1>'+esc(title)+'</h1>'+
   '<details class="tf-od-more"><summary aria-label="More opportunity actions">'+glyph('more')+'</summary>'+
   '<nav class="tf-od-more-menu" aria-label="Opportunity actions">'+menu+'</nav></details></header>'+
   body+'</section>';
 }
 function dossier(r){
  const photo=secure(r.photo_url||r.place_photo_url||r.official_photo_url||r.project_photo_url);
  const src=secure(r.source_url),name=esc(r.project_name||r.organization_name||'Opportunity');
  const image=photo?'<img src="'+esc(photo)+'" alt="Photo supplied for '+name+'" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="tf-od-photo-fallback" hidden aria-label="No image available">⌖</span>':'<span class="tf-od-photo-fallback" aria-label="No verified project image available">⌖</span>';
  const summary=r.demand_evidence?.kind==='explicit_request'?'Published service request. Verify current response availability and terms in the original source.':r.demand_evidence?.kind==='buyer_relationship'?'Potential buyer relationship. No current job or purchasing intent is confirmed.':r.opportunity_type==='verified_request'?'Review the original sourcing evidence and request terms before making an offer.':
   r.opportunity_type==='project_signal'||r.opportunity_type==='potential_opportunity'?'Documented project activity. Not an open subcontract or verified purchasing request.':'Business prospect only. No verified current purchasing request.';
  const timing=r.project_timing||r.timing||r.estimated_timing||'Not specified',kind=r.project_type||r.trade||'Not specified';
  const details='<section class="tf-od-card"><h2>Key details</h2>'+
   [['calendar-days','Timing',timing],['building-2','Project type',kind],['file-text','Record ID',r.source_record_id||r.record_id||r.id],['calendar','Source date',r.source_date||'Not supplied']].map(([icon,label,value])=>'<div class="tf-od-data-row"><span class="tf-od-detail-icon" aria-hidden="true">'+({ 'calendar-days':'▦','building-2':'▤','file-text':'▧','calendar':'▦'})[icon]+'</span><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('')+'</section>';
  const demand=Array.isArray(r.demand_evidence?.evidence)?r.demand_evidence:null;
  const leadInfo=demand?'<section class="tf-od-card"><h2>Service need &amp; deadline</h2><p>'+esc(demand.why)+'</p><p>'+esc(root.TradeFlowLeadDemandPolicy?.describe(demand)||demand.status)+'</p><p>Response deadline: '+esc(demand.deadline||'Not supplied — check original source')+'</p>'+demand.evidence.map(e=>'<blockquote>'+esc(e.quote)+'</blockquote>').join('')+'</section>':'';
  const original='<section class="tf-od-card tf-od-evidence"><h2>Evidence &amp; source</h2><p>'+esc(r.evidence_notes||r.project_description||summary)+'</p><p class="tf-od-muted">'+esc(summary)+'</p>'+
    (src?'<a class="tf-od-outline" href="'+esc(src)+'" target="_blank" rel="noopener noreferrer">Open original source ↗</a>':'<p class="tf-od-muted">No verified source link is saved.</p>')+'</section>';
  return frame('Opportunity dossier','<div class="tf-od-stack"><section class="tf-od-card tf-od-hero"><h2>'+name+'</h2><div class="tf-od-hero-layout"><p class="tf-od-address"><span aria-hidden="true">⌖</span>'+esc(normalizedPlace(r))+'</p><div class="tf-od-photo">'+image+'</div></div><div class="tf-od-tags"><span>'+esc(classification(r))+'</span><span class="tf-od-proof">'+esc(evidence(r))+'</span></div><p class="tf-od-notice">ⓘ '+esc(summary)+'</p></section>'+details+leadInfo+original+
   '<div class="tf-od-cta-group"><button class="tf-od-primary" type="button" data-action="'+(Number.isFinite(Number(r.latitude))&&r.latitude!==null&&Number.isFinite(Number(r.longitude))&&r.longitude!==null?'opportunityMap':'opportunityLocate')+'" data-id="'+esc(r.id)+'">View location on map →</button><button class="tf-od-outline" type="button" data-action="opportunityWorkflow" data-id="'+esc(r.id)+'">Contact &amp; workflow →</button></div></div>',r);
 }
 const glyph=(kind)=>{const paths={
 back:'<path d="m15 18-6-6 6-6"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.6 19.6 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.7L7.5 9.9a16 16 0 0 0 6.6 6.6l1.5-1.5a2 2 0 0 1 1.7-.6l3 .5A2 2 0 0 1 22 16.9z"/>',
 email:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M5 22v-3a7 7 0 0 1 14 0v3"/>',
 people:'<circle cx="9" cy="9" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-13a3 3 0 0 1 0 6m2 2a5 5 0 0 1 3 5"/>',
 chart:'<path d="M3 21V11m5 10V6m5 15V3m5 18v-9m4 9v-6"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
 pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>'
 };return '<svg class="tf-od-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(paths[kind]||'')+'</svg>'};
 function contactHref(kind,r){
  const value=kind==='call'?safeTel(r.contact_phone):safeMail(r.contact_email);
  return value?(kind==='call'?'tel:':'mailto:')+value:'';
 }
 const quickLink=(kind,label,icon,record)=>{
  const href=contactHref(kind,record);
  return '<a class="tf-od-quick-link'+(href?'':' tf-od-disabled')+'" data-tf-od-link="'+kind+'"'+(href?' href="'+esc(href)+'"':' aria-disabled="true" tabindex="-1"')+'>'+glyph(icon)+esc(label)+'</a>';
 };
 function syncQuickLinks(form){
  if(!form)return;
  const value={contact_phone:form.elements?.contact_phone?.value||'',contact_email:form.elements?.contact_email?.value||''};
  for(const kind of ['call','email']){
   const href=contactHref(kind,value);
   form.querySelectorAll('[data-tf-od-link="'+kind+'"]').forEach(link=>{
    if(href){link.setAttribute('href',href);link.removeAttribute('aria-disabled');link.removeAttribute('tabindex');link.classList.remove('tf-od-disabled')}
    else{link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.setAttribute('tabindex','-1');link.classList.add('tf-od-disabled')}
   });
  }
 }
 function workflow(r,data){
  const preferences=(data.settings||[]).find(x=>x.id==='growth-profiles-v1')||{};
  const icps=Array.isArray(preferences.icps)?preferences.icps:[];
  const source=secure(r.contact_source_url);
  const body='<div class="tf-od-stack"><form id="tfOdContactWorkflowForm" data-id="'+esc(r.id)+'">'+
   '<section class="tf-od-card tf-od-workflow"><h2>'+glyph('chart')+'Sales workflow</h2>'+
   '<label>Pipeline stage<select name="status">'+stages.map(x=>'<option value="'+esc(x)+'"'+(r.status===x?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label>'+
   '<label>Next follow-up<span class="tf-od-date-field">'+glyph('calendar')+'<input type="date" name="followup_date" value="'+esc(r.followup_date||'')+'"></span></label>'+
   '<label>Notes / next steps<textarea name="sales_notes" maxlength="4000" rows="2" placeholder="Call, email, site visit, who to contact...">'+esc(r.sales_notes||'')+'</textarea></label>'+
   '<button class="tf-od-primary tf-od-workflow-save" type="submit">Save workflow</button></section>'+
   '<section class="tf-od-card tf-od-contact"><h2>'+glyph('user')+'Contact</h2>'+
   '<label>Contact person / department<span class="tf-od-input-icon"><input name="contact_person" maxlength="120" placeholder="e.g. Facilities, Procurement" value="'+esc(r.contact_person||'')+'">'+glyph('people')+'</span></label>'+
   '<label>Phone<span class="tf-od-input-icon"><input name="contact_phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="70" placeholder="+1 512 555 0100" value="'+esc(r.contact_phone||'')+'">'+glyph('phone')+'</span></label>'+
   '<label>Email<span class="tf-od-input-icon"><input name="contact_email" type="email" autocomplete="email" inputmode="email" maxlength="250" placeholder="name@company.com" value="'+esc(r.contact_email||'')+'">'+glyph('email')+'</span></label>'+
   '<div class="tf-od-quick">'+quickLink('call','Call','phone',r)+quickLink('email','Email','email',r)+
   '<button type="button" data-calendar-action="opportunity" data-id="'+esc(r.id)+'">'+glyph('calendar')+'Schedule</button></div>'+
   '<details class="tf-od-source-details"><summary>Public contact source (optional)</summary><label>Original source URL<input name="contact_source_url" type="url" inputmode="url" maxlength="450" placeholder="https://..." value="'+esc(r.contact_source_url||'')+'"></label></details>'+
   (source?'<p class="tf-od-muted">Public contact source recorded; verify the details before outreach.</p>':'')+
   '</section>'+
   '<section class="tf-od-card tf-od-icp"><h2>'+glyph('target')+'Ideal customer profile</h2><label>Assigned profile<select name="icp_profile_id"><option value="">Not assigned</option>'+
   icps.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===r.icp_profile_id?' selected':'')+'>'+esc(x.name)+'</option>').join('')+
   '</select></label><button class="tf-od-outline tf-od-secondary-save" type="submit">Save contact &amp; profile</button></section>'+
   '</form></div>';
  return frame('Contact & workflow',body,r);
 }

 root.TradeFlowDossier=Object.freeze({dossier,workflow,normalizedPlace,secure,syncQuickLinks,safeTel,safeMail});
})(window);
