/* TradeFlow evidence-backed starter opportunity selection. Never invent leads. */
(function(root){
'use strict';
const clean=x=>String(x==null?'':x).trim();
const key=x=>clean(x).toLowerCase().replace(/[^a-z0-9]+/g,' ');
const evidence=r=>clean(r.source_url||r.sourceUrl||r.original_source_url||r.url);
const location=r=>[r.address,r.location,r.city,r.county,r.state].map(clean).filter(Boolean).join(' ');
function eligible(r,profile){
 if(!r||typeof r!=='object'||!evidence(r))return false;
 if(!clean(r.organization||r.organization_name||r.project_name||r.name||r.title))return false;
 const verification=key(r.verification_status||r.evidence_status||r.verificationStatus);
 if(!['verified','approved','source verified','verified source'].includes(verification))return false;
 const trade=key(profile.primaryTrade),description=key([r.trade,r.category,r.scope,r.description,r.title,r.project_name].join(' '));
 if(!trade||!description.includes(trade))return false;
 const region=key(profile.serviceArea||profile.businessAddress);
 const city=key(profile.serviceArea).split(',')[0].trim()||region.split(' ').slice(-3).join(' ');
 if(!city||!key(location(r)).includes(city))return false;
 if(['expired','closed','cancelled','rejected','duplicate'].includes(key(r.status)))return false;
 return true;
}
function select(records,profile,limit=25){
 const seen=new Set();return (records||[]).filter(r=>eligible(r,profile)).sort((a,b)=>clean(b.source_date||b.sourceDate).localeCompare(clean(a.source_date||a.sourceDate))).filter(r=>{const id=key(r.source_id||r.sourceId||evidence(r));if(seen.has(id))return false;seen.add(id);return true}).slice(0,Math.min(25,Math.max(0,limit)));
}
root.TradeFlowStarterOpportunities=Object.freeze({select,eligible,version:1});
})(typeof window!=='undefined'?window:globalThis);
