/* TradeFlow Opportunity Dossier v1 — local-first two-screen drilldown.
   No external photo search or fabricated place imagery. Only supplied HTTPS source photos. */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
 const secure=u=>{try{const x=new URL(String(u||''));return x.protocol==='https:'&&!x.username&&!x.password&&x.hostname.length>3?x.href:''}catch{return ''}};
 const stages=['New','Saved','Contacted','Interested','Quoted','Won','Lost'];
 const safeTel=p=>{const d=String(p||'').replace(/[^\d+]/g,'');return /^\+?\d{6,18}$/.test(d)?d:''};
 const safeMail=p=>{const s=String(p||'').trim();return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s)?s:''};
 const normalizedPlace=r=>{
  const p=root.TradeFlowEngine?.normalizeAddress(r);
  if(p?.parsed)return [p.street,p.city,[p.region,p.postalCode].filter(Boolean).join(' '),p.country].filter(Boolean).join(', ');
  return String(r.address||r.site_address||r.project_address||r.city||'Location not supplied').trim();
 };
 const classification=r=>({verified_request:'Verified request',potential_opportunity:'Potential opportunity',project_signal:'Project signal',business_prospect:'Business prospect'})[r.opportunity_type]||'Project signal';
 const evidence=r=>({verified:'Verified',source_supported:'Source supported',unresolved:'Needs review'})[r.evidence_status]||'Needs review';
 function frame(title,body){
  return '<section class="tf-od-screen"><header class="tf-od-nav"><button type="button" data-action="opportunityBack" aria-label="Back">‹</button><h1>'+esc(title)+'</h1><span class="tf-od-nav-spacer" aria-hidden="true"></span></header>'+body+'</section>';
 }
 function dossier(r){
  const photo=secure(r.photo_url||r.place_photo_url||r.official_photo_url||r.project_photo_url);
  const src=secure(r.source_url),name=esc(r.project_name||r.organization_name||'Opportunity');
  const image=photo?'<img src="'+esc(photo)+'" alt="Photo supplied for '+name+'" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="tf-od-photo-fallback" hidden aria-label="No image available">⌖</span>':'<span class="tf-od-photo-fallback" aria-label="No verified project image available">⌖</span>';
  const summary=r.opportunity_type==='verified_request'?'Review the original sourcing evidence and request terms before making an offer.':
   r.opportunity_type==='project_signal'||r.opportunity_type==='potential_opportunity'?'Documented project activity. Not an open subcontract or verified purchasing request.':'Business prospect only. No verified current purchasing request.';
  const timing=r.project_timing||r.timing||r.estimated_timing||'Not specified',kind=r.project_type||r.trade||'Not specified';
  const details='<section class="tf-od-card"><h2>Key details</h2>'+
   [['calendar-days','Timing',timing],['building-2','Project type',kind],['file-text','Record ID',r.source_record_id||r.record_id||r.id],['calendar','Source date',r.source_date||'Not supplied']].map(([icon,label,value])=>'<div class="tf-od-data-row"><span class="tf-od-detail-icon" aria-hidden="true">'+({ 'calendar-days':'▦','building-2':'▤','file-text':'▧','calendar':'▦'})[icon]+'</span><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('')+'</section>';
  const original='<section class="tf-od-card tf-od-evidence"><h2>Evidence &amp; source</h2><p>'+esc(r.evidence_notes||r.project_description||summary)+'</p><p class="tf-od-muted">'+esc(summary)+'</p>'+
    (src?'<a class="tf-od-outline" href="'+esc(src)+'" target="_blank" rel="noopener noreferrer">Open original source ↗</a>':'<p class="tf-od-muted">No verified source link is saved.</p>')+'</section>';
  return frame('Opportunity dossier','<div class="tf-od-stack"><section class="tf-od-card tf-od-hero"><h2>'+name+'</h2><div class="tf-od-hero-layout"><p class="tf-od-address"><span aria-hidden="true">⌖</span>'+esc(normalizedPlace(r))+'</p><div class="tf-od-photo">'+image+'</div></div><div class="tf-od-tags"><span>'+esc(classification(r))+'</span><span class="tf-od-proof">'+esc(evidence(r))+'</span></div><p class="tf-od-notice">ⓘ '+esc(summary)+'</p></section>'+details+original+
   '<div class="tf-od-cta-group"><button class="tf-od-primary" type="button" data-action="'+(Number.isFinite(Number(r.latitude))&&r.latitude!==null&&Number.isFinite(Number(r.longitude))&&r.longitude!==null?'opportunityMap':'opportunityLocate')+'" data-id="'+esc(r.id)+'">View location on map →</button><button class="tf-od-outline" type="button" data-action="opportunityWorkflow" data-id="'+esc(r.id)+'">Contact &amp; workflow →</button></div></div>');
 }
 function workflow(r,data){
  const preferences=(data.settings||[]).find(x=>x.id==='growth-profiles-v1')||{};
  const icps=Array.isArray(preferences.icps)?preferences.icps:[];
  const phone=safeTel(r.contact_phone),email=safeMail(r.contact_email);
  const action=(kind,label,href)=>href?'<a href="'+esc(href)+'">'+label+'</a>':'<span class="tf-od-disabled" aria-disabled="true">'+label+'</span>';
  const source=secure(r.contact_source_url);
  const body='<div class="tf-od-stack"><form id="tfOdContactWorkflowForm" data-id="'+esc(r.id)+'">'+
   '<section class="tf-od-card"><h2>▥ &nbsp; Sales workflow</h2><label>Pipeline stage<select name="status">'+stages.map(x=>'<option value="'+esc(x)+'"'+(r.status===x?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label>'+
   '<label>Next follow-up<input type="date" name="followup_date" value="'+esc(r.followup_date||'')+'"></label>'+
   '<label>Notes / next steps<textarea name="sales_notes" maxlength="4000" rows="3" placeholder="Call, email, site visit, who to contact...">'+esc(r.sales_notes||'')+'</textarea></label></section>'+
   '<section class="tf-od-card"><h2>♙ &nbsp; Contact</h2><label>Contact person / department<input name="contact_person" maxlength="120" placeholder="e.g. Facilities, Procurement" value="'+esc(r.contact_person||'')+'"></label>'+
   '<label>Phone<input name="contact_phone" type="tel" maxlength="70" placeholder="+1 512 555 0100" value="'+esc(r.contact_phone||'')+'"></label>'+
   '<label>Email<input name="contact_email" type="email" maxlength="250" placeholder="name@company.com" value="'+esc(r.contact_email||'')+'"></label>'+
   '<label>Original public contact source (optional)<input name="contact_source_url" type="url" maxlength="450" placeholder="https://..." value="'+esc(r.contact_source_url||'')+'"></label>'+
   '<div class="tf-od-quick">'+action('call','☎ Call',phone?'tel:'+phone:'')+action('mail','✉ Email',email?'mailto:'+email:'')+
   '<button type="button" data-calendar-action="opportunity" data-id="'+esc(r.id)+'">▦ Schedule</button></div>'+
   '<p class="tf-od-muted">'+(source?'Contact source URL saved; independently verify public contact details.':'Contact information is user-entered until the original public source is documented.')+'</p></section>'+
   '<section class="tf-od-card"><h2>◎ &nbsp; Ideal customer profile</h2><label>Assigned profile<select name="icp_profile_id"><option value="">Not assigned</option>'+icps.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===r.icp_profile_id?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label></section>'+
   '<button class="tf-od-primary tf-od-save" type="submit">Save contact &amp; workflow</button></form></div>';
  return frame('Contact & workflow',body);
 }
 root.TradeFlowDossier=Object.freeze({dossier,workflow,normalizedPlace,secure});
})(window);
