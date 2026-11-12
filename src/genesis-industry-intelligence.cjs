// AION Genesis industry intelligence v1 — public, reviewable market signals.
// The provenance ledger distinguishes economic *observations*, vendor marketing
// *claims*, public product specifications, licensing rules, and licensed links.
// NO competitor confidential documents, scraped ratings, hidden prices,
// historical fabrication, or proprietary labor-unit database material.
//
// Curated on 2026-11-12. Archived data is an as-of snapshot only.
// These source excerpts are original short paraphrases, not copied source text.
'use strict';
const VERSION='AIONIndustryIntelligence/1';
const AS_OF='2026-11-12';
const SOURCE_ROWS=[
 // id, dimension, provider, official original URL, evidence class, rights, update cadence days
 ['census-cbp','market_history','US Census','https://www.census.gov/data/developers/data-sets/cbp-zbp/cbp-api.2001.html','government_dataset','metadata_and_licensed_api',365],
 ['census-bds','market_history','US Census','https://www.census.gov/programs-surveys/bds/data.API.html','government_dataset','metadata_and_licensed_api',365],
 ['bls-oews','labor_history','US BLS','https://www.bls.gov/oes/tables.htm','government_dataset','public_aggregates',365],
 ['bls-api','labor_history','US BLS','https://www.bls.gov/developers/api_FAQs.htm','government_api','public_aggregates',365],
 ['fred-wire','material_history','FRED / US BLS','https://fred.stlouisfed.org/series/WPU102603','government_index_via_fred','public_aggregate',35],
 ['usaspending','market_history','USAspending','https://api.usaspending.gov/docs/endpoints','government_api','public_award_data',45],
 ['nec-adoption','jurisdiction','NFPA','https://www.nfpa.org/for-professionals/codes-and-standards/standards-development/nfpa-codes-and-standards-with-jurisdictional-changes','licensed_reference_metadata','link_only',90],
 ['texas-rule','jurisdiction','Texas TDLR','https://www.tdlr.texas.gov/news/rulemaking/2026/09/01/commission-adopts-rules-12/','official_rule_notice','original_paraphrase',30],
 ['texas-guide','jurisdiction','Texas TDLR','https://www.tdlr.texas.gov/electricians/compliance-guide.htm','official_guidance_potentially_stale','original_paraphrase',30],
 ['minnesota-code','jurisdiction','Minnesota DLI','https://www.dli.mn.gov/business/electrical-contractors/electrical-codes-and-standards','official_code_notice','original_paraphrase',30],
 ['washington-rule','jurisdiction','Washington Legislature','https://apps.leg.wa.gov/WAC/default.aspx?cite=296-46B-010','official_regulatory_text','original_paraphrase',30],
 ['california-license','jurisdiction','California CSLB','https://www2.cslb.ca.gov/About_Us/Library/Licensing_Classifications/Default.aspx','official_license_reference','original_paraphrase',45],
 ['florida-license','jurisdiction','Florida DBPR','https://www2.myfloridalicense.com/electrical-contractors/faqs/','official_license_reference','original_paraphrase',45],
 ['neca-labor','estimating','NECA','https://www.necanet.org/news-media/detail/news/2026/09/18/the-2025-2027-neca-manual-of-labor-units-is-now-available','association_licensed_method','metadata_only',180],
 ['aia-contracts','contracts','AIA Contract Documents','https://help.aiacontracts.com/hc/en-us/articles/1500010259162-Summary-A201-2017-General-Conditions-of-the-Contract-for-Construction','publisher_contract_summary','metadata_only',180],
 ['procore-change','contracts','Procore','https://support.procore.com/faq/what-is-a-change-order','vendor_public_workflow','short_original_summary',120],
 ['eaton-protection','manufacturer','Eaton','https://www.eaton.com/us/en-us/products/electrical-circuit-protection/circuit-breakers.html','manufacturer_self_published_catalog','link_only',90],
 ['schneider-breakers','manufacturer','Schneider Electric','https://www.se.com/us/en/product-category/4200-circuit-breakers/','manufacturer_self_published_catalog','link_only',90],
 ['leviton-products','manufacturer','Leviton','https://leviton.com/products','manufacturer_self_published_catalog','link_only',90],
 ['hubbell-spec','manufacturer','Hubbell','https://www.hubbell.com/wiringdevice-kellems/en/specification-design-center','manufacturer_self_published_spec_reference','link_only',90],
 ['servicetitan','software_competitor','ServiceTitan','https://www.servicetitan.com/features','vendor_feature_claim','short_original_summary',90],
 ['simpro','software_competitor','Simpro','https://www.simprogroup.com/industries/electrical-software','vendor_feature_claim','short_original_summary',90],
 ['fieldpulse','software_competitor','FieldPulse','https://www.fieldpulse.com/solutions/electrical','vendor_feature_claim','short_original_summary',90],
 ['buildops','software_competitor','BuildOps','https://buildops.com/industries/electrical','vendor_feature_claim','short_original_summary',90],
 ['procore','software_competitor','Procore','https://support.procore.com/faq/what-is-a-change-order','vendor_feature_claim','short_original_summary',120],
 ['housecallpro','software_competitor','Housecall Pro','https://www.housecallpro.com/industries/electrical-contractor-software/','vendor_feature_claim','short_original_summary',90],
 ['knowify','software_competitor','Knowify','https://knowify.com/job-costing-software/','vendor_feature_claim','short_original_summary',90],
 ['southwire-catalog','manufacturer','Southwire','https://www.southwire.com/products','manufacturer_self_published_catalog','link_only',90],
 ['southwire-market','supplier_catalog','Southwire','https://www.southwire.com/pricing','manufacturer_index_reference','link_only',30],
 ['wesco-distribution','supplier_catalog','Wesco','https://www.wesco.com/us/en/solutions/electrical-and-lighting.html','distributor_catalog','link_only',90],
];
const SOURCES=Object.freeze(Object.fromEntries(SOURCE_ROWS.map(([id,dimension,provider,url,evidenceClass,rights,refreshDays])=>[
 id,Object.freeze({id,dimension,provider,url,evidenceClass,rights,refreshDays,reviewedOn:AS_OF,
  status:'research_reference_not_verified_current_live',fullLicensedText:false})
])));
const LINES=[
 // id, source ID, family, topic title, retrieval keywords, user-visible original evidence summary, applicability/limitation
 ['cbp-market','census-cbp','market_history','Track electrical contracting establishment and payroll history','census cbp NAICS 238210 establishments firms geographic county payroll competition density growth',
  'County Business Patterns publishes annual establishment, employment and payroll totals by NAICS and geography. NAICS 238210 identifies electrical and other wiring installation contractors. Use year, geography, confidentiality flags and industry classification when comparing markets.',
  'The Census API now requires a key; no fresh counts have been fetched by this seed. Counts are establishments, not a list of competitor identities.'],
 ['bds-dynamics','census-bds','market_history','Measure long-term business entry, exits and job creation','firm age closures births entrepreneurship dynamics survival job creation BDS time series',
  'Business Dynamics Statistics can measure firm formation, employment and job flow through historical cohorts. Apply appropriate NAICS availability and geography rather than treating general construction as electrical-only.',
  'Historical aggregate series are not a forecast for one electrical company.'],
 ['oews-wages','bls-oews','labor_history','Compare electrician wages over historical publications','BLS electricians wage salary pay rate 47-2111 median labor historical local',
  'BLS Occupational Employment and Wage Statistics publishes dated electrician wage estimates for national, state, metropolitan and industry groupings. Keep occupation code, location and survey year attached to every comparison.',
  'BLS occupational wages are not a legally required project prevailing wage and do not include all employer costs.'],
 ['bls-api-usage','bls-api','labor_history','Source time series from the BLS API','API historical wages employment series ID rate limit decade',
  'BLS publishes a public time-series API with per-request year/series limits and differing registered/unregistered tiers. Record source series IDs, observation periods, revisions and API usage constraints.',
  'Never invent a series ID or confuse an industry employment series with an occupational wage series.'],
 ['fred-copper','fred-wire','material_history','Measure cable and nonferrous wire input-cost trends','copper wire cable material escalation pricing cost trend inflation 2026 ppi',
  'FRED displays BLS PPI series WPU102603 for nonferrous wire and cable. This is a broad aggregate price index, not a job-site quotation or supplier SKU price. Compare the correct observation months and base index.',
  'Use index trends for sensitivity analysis only; validate real distributor quotes before estimating materials.'],
 ['federal-awards','usaspending','market_history','Analyze federal electrical contracting awards','competitor federal contract tenders bids USAspending awarded NAICS 238210 public historical',
  'USAspending has public award and spending-by-category endpoints. Historical federal procurement can show awarded amounts, named public recipients, agencies and patterns within the actual NAICS/PSC filters.',
  'Awarded value is not contractor revenue or profit; data corrections, scope classifications and subawards require review.'],
 ['texas-2026','texas-rule','jurisdiction','Texas 2026 NEC adoption notice','texas electrical code 2026 licensed adopted rules September effective',
  'Texas TDLR announced the 2026 NEC adoption effective September 1, 2026, with a stated limited outdoor-outlet ground-fault exception. This later rulemaking notice conflicts with the older 2023 edition shown on the compliance-guide page.',
  'Use effective date and rule text; verify city and job date, amendments, local AHJ and later updates. Never trust the older guide without a conflict warning.'],
 ['texas-guide-stale','texas-guide','jurisdiction','Older Texas compliance guide conflicts with 2026 notice','texas NEC 2023 compliance guide conflict stale municipality code',
  'The TDLR compliance guide seen in November 2026 still names NEC 2023, while its September 2026 rulemaking notice names NEC 2026. Mark the guide as possibly stale and escalate to the effective rule and AHJ.',
  'Conflicting authorities cannot be silently merged into a definitive installation instruction.'],
 ['minnesota-2026','minnesota-code','jurisdiction','Minnesota NEC effective by permit date','Minnesota permits NEC 2026 2023 August 17 code',
  'Minnesota DLI says applications filed before August 17, 2026 use 2023 NEC, while permits filed on or after that date use 2026 NEC. The permit application date affects applicability.',
  'Check amendments, project location, later rule changes and current permitting authority.'],
 ['washington-future','washington-rule','jurisdiction','Washington NEC transition scheduled for December 2026','Washington WAC electrical NEC 2026 effective December 31 2023',
  'Washington WAC 296-46B-010 lists the 2023 NEC and a scheduled switch to the 2026 edition on December 31, 2026. As of November 12, 2026 the future effective date must not be treated as already passed.',
  'Always resolve the actual installation/permit date and verify whether the future transition took effect.'],
 ['california-c10','california-license','jurisdiction','California C-10 classification','California electrical contractor C10 license CSLB verify trade',
  'California CSLB lists C-10 for electrical contractors and separates it from C-7 low-voltage systems and other license classes. Verify classification and active license status for a particular job.',
  'License classification is not proof that a named business holds an active license.'],
 ['florida-cert','florida-license','jurisdiction','Florida electrical licensing distinctions','Florida certified registered electrical contractor license DBPR',
  'Florida DBPR explains the distinction between certified and registered electrical contractor license categories. Match the proposed work and location to the actual credential.',
  'Confirm local municipality and current state license status before assigning work.'],
 ['neca-units','neca-labor','estimating','NECA labor units require authorized access','estimating productivity labor hours units manhour installation NECA 2025 2027 manual',
  'NECA announced the 2025–2027 Manual of Labor Units in September 2026 as an experience-based labor-estimating reference; its database and copies are offered through subscription/member access.',
  'Metadata only. No labor-hour tables or proprietary units are included or inferred.'],
 ['takeoff-method','neca-labor','estimating','Use historical job actuals to calibrate estimates','electrical estimate takeoff quantity labor unit production productivity baseline',
  'For each verified item, track material quantity, estimated man-hours, installed quantity, actual hours and major site conditions. Build a company-specific labor baseline with confidence bounds rather than claim NECA values without a license.',
  'A derived operating method, not published NECA labor-unit figures.'],
 ['aia-rights','aia-contracts','contracts','AIA A201 standard contract documents are licensed','construction contract general conditions AIA A201 owner architect subcontractor clauses',
  'AIA publishes a summary of the A201 general-conditions family explaining responsibilities of construction participants. AIA agreement documents require purchase or subscription for authorized full use.',
  'Do not redistribute licensed agreements or provide site-specific legal interpretations.'],
 ['change-orders','procore-change','contracts','Unapproved change requests are not executed scope','construction change order approval contract modification scope schedule Procore',
  'Procore explains change orders as formal modifications to defined construction scope, commonly triggered by design revisions, omissions, unforeseen site conditions or material substitutions.',
  'Confirm project contract procedures and approval authority; vendor documentation is not legal advice.'],
 ['eaton-specs','eaton-protection','manufacturer','Use manufacturer-specific breaker specifications','Eaton breaker molded case circuit protection compatibility panel UL catalog',
  'Eaton publishes breaker product categories and product literature covering circuit protection classes and applications. Compare exact part numbers, listings, ratings and panel compatibility via current manufacturer documents.',
  'Catalog family listings alone never authorize substituting devices or modifying a panel.'],
 ['schneider-specs','schneider-breakers','manufacturer','Check current Schneider Electric product ratings','Schneider Square D QO Homeline panel breaker datasheet specification voltage',
  'Schneider Electric lists circuit-breaker families and ratings for residential and commercial use. Any product selection must reference the actual model data sheet and applicable listing.',
  'A product family overview is not a tested compatibility claim for a specific installation.'],
 ['leviton-specs','leviton-products','manufacturer','Leviton wiring devices, controls and load centers','Leviton outlets GFCI AFCI EV charger receptacle switch load center',
  'Leviton publishes official categories covering protective devices, receptacles, switches, lighting controls, load centers and EV charging.',
  'Verify exact SKU revisions and approved installation instructions before technical selection.'],
 ['hubbell-specs','hubbell-spec','manufacturer','Hubbell specification and submittal reference','Hubbell wiring device floor box raceway specs submittal sheets',
  'Hubbell publishes a specification design center for wiring devices, floor boxes, raceway, cable tray and technical submittal preparation.',
  'Use current approved submittals; do not assume equivalent devices without engineering review.'],
 ['servicetitan-capabilities','servicetitan','software_competitor','ServiceTitan advertised feature coverage','ServiceTitan competitor pricebook dispatch estimates scheduling timesheets financing',
  'ServiceTitan advertises pricebooks, estimates, dispatch/scheduling, field mobile tools, inventory-related capabilities, customer communications and management features.',
  'Vendor first-party feature claims only; availability, price, tier and customer effectiveness not independently measured.'],
 ['simpro-capabilities','simpro','software_competitor','Simpro advertises quoting and job costing for electrical','Simpro competitor electrician quoting field scheduling job costing voice ai jobscribe',
  'Simpro describes electrical quoting, supplier-price workflow, job scheduling, costing, invoicing and AI-assisted site notes (JobScribe) in its current product marketing.',
  'Treat promises and savings claims as self-reported; verify implementation and current contractual plan.'],
 ['fieldpulse-capabilities','fieldpulse','software_competitor','FieldPulse advertises electrical crew scheduling and margins','FieldPulse competitor dispatch crew job cost pricebook invoice profitability',
  'FieldPulse advertises electrical scheduling, crew assignment, job costs, field pricebook estimates, invoicing and dashboards.',
  'Its performance testimonials and marketing numbers are not independent comparisons.'],
 ['buildops-capabilities','buildops','software_competitor','BuildOps focuses on commercial electrical','BuildOps competitor commercial construction service projects finance electrical',
  'BuildOps markets an integrated service, project and financial platform for commercial electrical work including switchgear and tenant buildouts.',
  'Do not assume claimed customer ROI or exact feature parity without product verification.'],
 ['housecallpro-capabilities','housecallpro','software_competitor','Housecall Pro advertises electrician job management features','Housecall Pro electrical service schedules estimates pricebook invoices crm plans',
  'Housecall Pro markets electrical scheduling, quotes, pricebooks, invoices, CRM, job costs and tier-dependent workflow features. A support page documents which packages include particular features.',
  'Vendor first-party product information and savings claims only; plans/prices may change.'],
 ['knowify-capabilities','knowify','software_competitor','Knowify emphasizes project job costing and WIP','Knowify electrical competitor job costing budget WIP profitability change orders QuickBooks',
  'Knowify describes construction job costing, WIP visibility, cost-coded labor/material records, purchase orders and change orders linked to project profitability.',
  'Vendor first-party features and results are not independent assessments.'],
 ['southwire-catalog-notes','southwire-catalog','manufacturer','Southwire building wire and cable categories','Southwire copper wire cable gauge building wire armoured MC THHN product specifications',
  'Southwire publishes product families for building wire, armored cable, industrial, communications, power management and related categories. Use the exact product data sheet for technical and dimensional properties.',
  'Manufacturer family listing is not an approved SKU or substituted material.'],
 ['southwire-pricing','southwire-market','supplier_catalog','Wire price lists and copper benchmarks have different meanings','Southwire copper COMEX product pricing list wire distributor quote historical',
  'Southwire publishes dated pricing documents and commodity indicators. Its list-price revision codes and COMEX market values are not a verified dealer quote for an installed product.',
  'Quotation, discounts, freight, availability, contract terms and quote-valid-through date must be requested from the supplier.'],
 ['wesco-distributor','wesco-distribution','supplier_catalog','Wesco distributor product categories','Wesco electrical supplier distributor wire cable lighting procurement catalog',
  'Wesco describes electrical, lighting and wire/cable product groups for commercial and industrial buyers. Catalog category presence does not certify stock or delivered pricing.',
  'Do not invent inventory, exact SKU pricing, discount tiers or availability.'],
 ['procore-workflow','procore','software_competitor','Procore contract change management workflow','Procore competitor approvals change events owner contracts subcontractor',
  'Procore documentation distinguishes change events, change orders and permissioned configuration of approvals in its construction project platform.',
  'A workflow example is not proof that a particular customer has configured the same controls.'],
];
const STOP=new Set(['what','which','why','with','these','that','this','from','your','their','are','can','will','would','should','could','does','the','for','and','about','every','some','more','much','many','electrician','electrical','contractor','contracting','business','where','tell','show','need','find','into','data']);
const norm=w=>({companies:'company',competitors:'competitor',licensing:'license',licenses:'license',quotes:'quote',estimating:'estimate',wages:'wage',materials:'material',costs:'cost',pricing:'price',suppliers:'supplier',catalogs:'catalog',contracts:'contract',permit:'permit',permits:'permit',history:'historical',historically:'historical',productivity:'labor',profits:'profit',invoices:'invoice',estimations:'estimate'}[w]||w);
const tokenize=t=>new Set((String(t).toLowerCase().match(/[a-z0-9]+/g)||[]).map(norm).filter(w=>w.length>2&&!STOP.has(w)));
const RECORDS=Object.freeze(LINES.map(([id,sourceId,family,title,keywords,summary,limitations])=>{
 if(!SOURCES[sourceId])throw Error('Missing industry provenance '+sourceId);
 return Object.freeze({id:'tf-industry-'+id,sourceId,family,title,keywords,summary,limitations,
  citedOn:AS_OF,sourceClass:SOURCES[sourceId].evidenceClass});
}));
const SERIES=Object.freeze({
 // Accurate as-of 2026-11-12, source: FRED page WPU102603
 'WPU102603':Object.freeze({
  seriesId:'WPU102603',title:'PPI nonferrous wire and cable',provider:'BLS via FRED',
  frequency:'monthly',unit:'Index Dec 1982 = 100',adjustment:'not seasonally adjusted',
  sourceId:'fred-wire',lastVerifiedOn:AS_OF,
  observations:Object.freeze([
   ['2026-05',471.913],['2026-06',480.082],['2026-07',482.453],
   ['2026-08',496.418],['2026-09',497.992],
  ].map(([period,value])=>Object.freeze({period,value,sourceId:'fred-wire'}))),
  limitations:'Aggregate PPI only, not a SKU/contractor material price, not a future quote or profit margin.'
 })
});
function retrieveIndustry(question,{limit=5}={}){
 if(typeof question!=='string'||!question.trim()||question.length>500||
    !Number.isSafeInteger(limit)||limit<1||limit>8)throw Error('Invalid bounded industry query');
 const tokens=tokenize(question);
 return RECORDS.map(row=>{
  const h=tokenize([row.title,row.keywords,row.family].join(' ')),b=tokenize(row.summary);
  const score=[...tokens].reduce((sum,t)=>sum+(h.has(t)?5:b.has(t)?1:0),0);
  return {score,row};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.row.id.localeCompare(b.row.id))
 .slice(0,limit).map(({score,row})=>{
  const src=SOURCES[row.sourceId];
  return {id:row.id,title:row.title,summary:row.summary,family:row.family,
   sourceTitle:src.provider+' — '+src.dimension,sourceUrl:src.url,
   sourceType:src.evidenceClass,sourceId:src.id,reviewedOn:AS_OF,asOf:AS_OF,
   jurisdiction:row.family==='jurisdiction'?'STATE_OR_LOCAL_SPECIFIC':'US_GENERAL',
   freshness:'curated_not_live',
   requiresLocalVerification:row.family==='jurisdiction'||row.family==='manufacturer',
   limitations:row.limitations+' Source not independently confirmed live on this turn.',
   score,untrusted:true,actionAuthority:false,
   sourceAssertion:src.evidenceClass==='vendor_feature_claim'?'VENDOR_SELF_REPORT':'REFERENCE_ONLY'
  };
 });
}
function historicalSeries(id,{from,to}={}){
 const s=SERIES[id];if(!s)throw Error('Unknown approved historical series');
 const valid=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
 if((from!==undefined&&!valid(from))||(to!==undefined&&!valid(to))||(from&&to&&from>to))
  throw Error('Invalid historical date window');
 return {...s,observations:s.observations.filter(o=>(!from||o.period>=from)&&(!to||o.period<=to))};
}
function audit(){
 const errors=[],ids=new Set();
 for(const s of Object.values(SOURCES)){
  if(ids.has(s.id))errors.push('duplicate '+s.id);ids.add(s.id);
  const u=new URL(s.url);
  if(u.protocol!=='https:'||u.username||u.password||s.fullLicensedText)
   errors.push('unsafe source '+s.id);
 }
 for(const item of RECORDS){
  if(!SOURCES[item.sourceId])errors.push('missing source '+item.id);
  if(item.summary.length<35||item.summary.length>680)errors.push('invalid summary '+item.id);
 }
 for(const s of Object.values(SERIES)){
  if(s.observations.some(x=>!Number.isFinite(x.value)||x.value<=0))
   errors.push('invalid number '+s.seriesId);
  for(let i=1;i<s.observations.length;i++)if(s.observations[i].period<=s.observations[i-1].period)
   errors.push('out of order historical data '+s.seriesId);
 }
 const counts={};for(const r of RECORDS)counts[r.family]=(counts[r.family]||0)+1;
 return {schema:VERSION,sources:Object.keys(SOURCES).length,notes:RECORDS.length,
  categories:counts,historicalSeries:Object.keys(SERIES).length,
  historicalObservations:Object.values(SERIES).reduce((n,v)=>n+v.observations.length,0),
  pass:errors.length===0,errors,rights:'public_sources_short_original_summaries_or_metadata',
  competitorData:'first_party_marketing_not_verified_performance',disclosedPrivateData:0,
  automaticLiveData:false,trainingWeightsUpdated:false,sourceDate:AS_OF};
}
module.exports={VERSION,AS_OF,SOURCES,RECORDS,SERIES,retrieveIndustry,historicalSeries,audit};
