// AION Genesis External Knowledge Foundation v1.
//
// All statements are short, original summaries of public, cited source topics,
// NOT copied regulatory/standards text, site-specific technical instructions,
// contractor customer facts, or model training examples. Source pages are
// pointers for an independently reviewed, refreshable US research library.
// Do not scrape/redistribute NFPA, NEC, NEMA, NECA, proprietary estimating
// databases, vendor price sheets or licensed manuals through this module.
'use strict';

const VERSION='AIONExternalKnowledge/1.0';
const REVIEWED_ON='2026-11-12';
const SOURCE_ROWS=[
 // ID, topic family, publisher, title, verified canonical URL, risk, refresh interval, jurisdiction, rights handling
 ['osha-contractors','safety','OSHA','Electrical contractors: applicable standards','https://www.osha.gov/electrical-contractors/standards','critical',30,'US-federal','original_paraphrase_only'],
 ['osha-hazards','safety','OSHA','Electrical contractor hazards and prevention','https://www.osha.gov/electrical-contractors/hazards-solutions','critical',45,'US-federal','original_paraphrase_only'],
 ['osha-programs','safety','OSHA','Electrical contractor safety programs','https://www.osha.gov/electrical-contractors/safety-health-programs','critical',60,'US-federal','original_paraphrase_only'],
 ['osha-1926k','safety','OSHA','Construction electrical: 29 CFR 1926 Subpart K','https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926SubpartK','critical',30,'US-federal','original_paraphrase_only'],
 ['osha-1910s','safety','OSHA','General industry electrical: 29 CFR 1910 Subpart S','https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910SubpartS','critical',30,'US-federal','original_paraphrase_only'],
 ['nfpa-nec','technical','NFPA','NFPA 70 — NEC publication and development','https://www.nfpa.org/codes-and-standards/nfpa-70-development/70','critical',90,'US-state-local','metadata_only'],
 ['nfpa-70e','technical','NFPA','NFPA 70E — workplace electrical safety','https://www.nfpa.org/codes-and-standards/nfpa-70-standard-development/70E','critical',90,'US-state-local','metadata_only'],
 ['doe-adoption','technical','U.S. DOE','Energy code adoption and implementation','https://www.energycodes.gov/codes-101/develop-adopt-implement-comply','high',60,'US-state-local','original_paraphrase_only'],
 ['doe-state-portal','technical','U.S. DOE','State energy code portal','https://www.energycodes.gov/state-portal','high',30,'US-state-local','link_only'],
 ['doe-ev','specialties','DOE Alternative Fuels Data Center','EV charging procurement and installation','https://afdc.energy.gov/fuels/electricity-infrastructure-development','high',45,'US-state-local','original_paraphrase_only'],
 ['doe-ev-readiness','specialties','DOE Alternative Fuels Data Center','EV charging readiness, permits and contractors','https://afdc.energy.gov/fuels/electricity-ev-readiness','high',60,'US-state-local','original_paraphrase_only'],
 ['sba-operate','finance','SBA','Manage your business: finance, employment, compliance and sales','https://www.sba.gov/counseling/manage-your-business/','medium',90,'US-federal','original_paraphrase_only'],
 ['sba-plan','strategy','SBA','Business planning and competitive analysis','https://www.sba.gov/counseling/plan-your-business/','medium',120,'US-federal','original_paraphrase_only'],
 ['irs-classify','people','IRS','Independent contractor versus employee','https://www.irs.gov/businesses/small-businesses-self-employed/independent-contractor-self-employed-or-employee','high',45,'US-federal','original_paraphrase_only'],
 ['irs-taxes','people','IRS','Understanding employment taxes','https://www.irs.gov/businesses/small-businesses-self-employed/understanding-employment-taxes','high',45,'US-federal','original_paraphrase_only'],
 ['dol-dbra','contracts','U.S. DOL','Davis-Bacon and Related Acts questions','https://www.dol.gov/agencies/whd/government-contracts/construction/faq','high',30,'US-project-specific','original_paraphrase_only'],
 ['dol-wage','contracts','U.S. DOL','Selecting a prevailing-wage determination','https://www.dol.gov/agencies/whd/government-contracts/prevailing-wage-resource-book/db-wage-determinations','high',30,'US-project-specific','original_paraphrase_only'],
 ['sam-wages','contracts','SAM.gov','Official wage determinations portal','https://sam.gov/wage-determinations','high',14,'US-project-specific','link_only'],
 ['bls-electricians','people','U.S. BLS','Electrician occupational outlook and wage statistics','https://www.bls.gov/ooh/construction-and-extraction/electricians.htm','medium',120,'US-federal','original_paraphrase_only'],
 ['apprenticeship','people','U.S. DOL Apprenticeship.gov','Construction registered apprenticeships','https://www.apprenticeship.gov/apprenticeship-industries/construction','medium',120,'US-federal','original_paraphrase_only'],
 ['nist-small','technology','NIST','Cybersecurity Framework 2.0 small business quick-start','https://csrc.nist.gov/pubs/sp/1300/final','medium',180,'US-federal','original_paraphrase_only'],
 ['nist-enterprise','strategy','NIST','Cybersecurity and enterprise risk management','https://csrc.nist.gov/pubs/sp/1308/final','medium',180,'US-federal','original_paraphrase_only'],
];

const SOURCES=Object.freeze(Object.fromEntries(SOURCE_ROWS.map(a=>{
 const [id,family,publisher,title,url,risk,refreshDays,jurisdiction,rights]=a;
 return [id,Object.freeze({id,family,publisher,title,url,risk,refreshDays,
  jurisdiction,rights,reviewedOn:REVIEWED_ON,
  attestation:'curated_source_not_cryptographic_snapshot',
  activation:'research_only',licensedFullTextIncluded:false})];
})));

const NOTES=[
 // Source ID, family, title, keywords, original short synthesis, applicability limit
 ['osha-contractors','safety','Identify applicable OSHA safety regimes','OSHA construction maintenance regulations safety 1910 1926',
  'Electrical contracting can involve different OSHA requirements for construction work, general-industry maintenance and particular equipment. Classify the actual activity and employer context before consulting the applicable standards.',
  'Check state-plan OSHA and task scope; not a safety procedure.'],
 ['osha-contractors','safety','Do not neglect non-electrical construction hazards','ladders falls driving ergonomics injury electrical safety',
  'Electrical contractor risk is broader than shock: elevated work, repetitive strain, tool use, driving and worksite conditions require employer safety management.',
  'Refer site hazards to qualified supervisor.'],
 ['osha-1926k','safety','Construction electrical work: Subpart K','construction wiring jobsite power 1926 subpart k electrical',
  'For construction-site electrical work, OSHA 29 CFR 1926 Subpart K organizes installation, work-practice, maintenance and related requirements. Begin with an applicability check.',
  'General federal orientation; never an authorization for energized work.'],
 ['osha-1910s','safety','General-industry electrical work: Subpart S','industrial facility maintenance general industry 1910 electrical',
  'OSHA 1910 Subpart S addresses electrical installations and work practices in general industry. Do not automatically use the construction standard for routine facility maintenance.',
  'State-plan standards and site-specific controls may also apply.'],
 ['osha-hazards','safety','Electrical contractor hazard review','hazard risk assessment toolbox talks jobsite analysis injury',
  'Use an employer-led hazard review that includes electrical, ergonomic, fall, vehicle and changing-site risks before field deployment; the safety plan must match real job conditions.',
  'Not a substitute for qualified job-hazard analysis.'],
 ['osha-programs','safety','Improve safety by tracking corrective actions','safety program training incident near miss supervision leadership',
  'A safety program needs visible management ownership, worker participation, hazard reporting, worksite analysis and verified correction of identified risks, not only signed training sheets.',
  'Qualified safety professionals must assess site procedures.'],
 ['nfpa-nec','technical','NEC publication is not local adoption','nec 2026 edition code inspection licensing AHJ electrical',
  'NFPA maintains the NEC model electrical code. Publication of the 2026 edition does not establish that a specific state, city or permitting authority has adopted it.',
  'Always verify project jurisdiction, adopted edition, amendments, permits and AHJ.'],
 ['nfpa-nec','technical','Code navigation: avoid unlicensed excerpts','nfpa NEC copyrighted text standard articles code book',
  'Use NFPA source metadata and authorized access to the official code. Do not reproduce extended licensed NEC text or invent section-level conclusions.',
  'NFPA code text is not provided by this corpus.'],
 ['nfpa-70e','technical','Arc flash and shock require a qualified safety program','arc flash shock PPE NFPA 70E energy isolation energized',
  'NFPA 70E is a workplace electrical-safety standard. A summary cannot determine incident energy, establish PPE requirements or authorize energized electrical work.',
  'Qualified safety assessment and current applicable rules required.'],
 ['doe-adoption','technical','Energy code requirements depend on state and city','IECC ASHRAE 90.1 lighting controls energy code state adoption',
  'The IECC and ASHRAE 90.1 are model-code pathways; each jurisdiction determines adopted energy requirements and amendments. Electrical lighting-control scope can depend on them.',
  'Resolve exact city, state, project and permit date before asserting requirements.'],
 ['doe-state-portal','technical','Start code research with DOE state portal','state energy codes adoption status commercial residential state',
  'The DOE state energy-code portal provides state-level adoption and related documentation, but it does not replace the actual local ordinance or building official.',
  'Local enforcement remains authoritative.'],
 ['doe-ev','specialties','EV charging project discovery checklist','ev charger electric vehicle charging bids fleet installation procurement',
  'EV charging projects require early utility coordination, equipment and connectivity selection, site capacity review, access and cost assumptions, permits and maintainability planning.',
  'Use licensed engineers/electricians to validate design and capacity.'],
 ['doe-ev-readiness','specialties','EV permits and readiness are location dependent','electric vehicle charging permit inspection local utility readiness',
  'EV charging installation may involve electrical, building, fire or other permits and utility interfaces. Planning should include lead time for review and approved contractor qualifications.',
  'Do not infer local approval or incentive eligibility.'],
 ['sba-operate','finance','Manage receivables, payables and liquidity together','cash flow bank reconciliation receivables payables payroll margin',
  'Keep reconciled receivables, payables, cash, bank records and payroll obligations. Cash available today is not automatically free cash once committed costs and unpaid payroll are considered.',
  'Consult an accountant on applicable bookkeeping methods.'],
 ['sba-operate','finance','Profit and cash are different','profit revenue expense accrual cash receipts accounts receivable',
  'Accounting profit and money actually collected can diverge, especially on construction projects with milestone billing and delayed receivables; evaluate both.',
  'General accounting orientation; not a customer profit figure.'],
 ['sba-operate','operations','Write down operating processes','policies procedures hiring scheduling materials customer service',
  'A small firm benefits from repeatable workflows for quoting, dispatch, collecting documentation, billing, payroll and responding to exceptions, with accountable owners.',
  'Suggested process adaptation, not documented company results.'],
 ['sba-operate','finance','Payroll and workforce setup needs records','employer payroll tax employment wages small business',
  'Employers should plan payroll frequency, employment tax treatment, reporting and recordkeeping before adding staff; obligations differ from contractor payments.',
  'Rates, rules and deadlines depend on tax year and location.'],
 ['sba-plan','strategy','Measure commercial and service customer segments separately','customer segments lead acquisition commercial maintenance residential service strategy',
  'Before growing a service or commercial division, distinguish customers, competitors, delivery constraints and revenue streams for each line. Compare growth decisions with realistic cash and staffing capacity.',
  'A strategy planning note, not evidence of local customer demand.'],
 ['sba-plan','strategy','Choose a contractor niche through market research','CEO market competition growth niche commercial residential service',
  'Study target customer groups, local demand, competitors, delivery capability and cash economics before selecting a specialization or growth channel.',
  'Specific demand and competitor data must be independently obtained.'],
 ['sba-plan','strategy','Business plan connects strategy to finance','business plan revenue channels sales management capital investor',
  'Connect customer segments, key activities, partners, cost structure and revenue streams to a cash forecast and operating capacity plan, rather than writing a purely descriptive strategy document.',
  'Forecasts require verifiable assumptions and own-company data.'],
 ['irs-classify','people','1099 versus employee requires factual review','1099 contractor employee subcontractor classification behavioral control',
  'Employee and independent-contractor status depends on the real working relationship and degree of control, not solely the contract title or whether a worker receives a 1099.',
  'Federal and state labor/tax advice may differ; consult qualified advisers.'],
 ['irs-taxes','people','Account for employer payroll taxes','payroll W-4 W-2 940 941 FICA Medicare taxes withholding',
  'Employers generally have withholding, reporting and employer-side payroll tax duties; form, rate and deposit schedule depend on employment and tax-year facts.',
  'Never generate a current tax computation without verified year-specific rates.'],
 ['dol-dbra','contracts','Prevailing-wage obligations are project specific','Davis Bacon federally assisted prevailing wage electrician bid',
  'For projects covered by Davis-Bacon or related acts, minimum labor classification wages and fringe benefits come from the wage determination incorporated into the covered contract.',
  'Confirm funding coverage, location, construction type, classification and contract WD.'],
 ['dol-wage','contracts','Check the wage determination before pricing','wage determination contractor prevailing fringe county bid construction',
  'Before bidding covered construction, confirm the right geography, construction type and wage determination revision in the actual solicitation and contract.',
  'Do not infer or quote a prevailing hourly rate without the current official determination.'],
 ['sam-wages','contracts','SAM.gov is the lookup for determinations','sam gov dba wage determinations wdr county prevailing wage',
  'Use the official SAM.gov wage-determinations portal to retrieve the project-specific wage schedule. Store the exact determination identifier and revision with bid assumptions.',
  'Not a cached wage rate; location and project ID needed.'],
 ['bls-electricians','people','Use BLS for historical electrician wage benchmarks','electrician pay rate industry salary wage benchmark staffing',
  'BLS provides dated national and industry occupational pay and employment estimates; use the publication year and local labor-market evidence before turning benchmarks into company staffing assumptions.',
  'Historical national statistics are not a local prevailing-wage determination.'],
 ['bls-electricians','strategy','Test growth assumptions against trade labor supply','hiring shortage workforce electrician outlook apprentices demand',
  'National electrician employment projections can inform long-run capacity planning, but local labor supply, licensing, wages and employee retention govern actual hiring feasibility.',
  'Do not interpret forecasts as a guaranteed local opportunity.'],
 ['apprenticeship','people','Registered apprenticeships can support staffing','apprentice electricians hiring registered apprenticeship training',
  'Registered apprenticeship is a pathway to recruit and develop skilled construction workers. Verify approved programs, supervision and applicable state training rules before assigning tasks.',
  'Program and licensing requirements vary by state.'],
 ['nist-small','technology','Protect field and office business systems','cyber security phishing backups MFA contractor invoices payments',
  'Small contractors should establish basic account protection, backup/recovery, permissions, cyber incident response and vendor risk controls; operational billing and payroll data are sensitive.',
  'Information-security planning advice, not an audit certificate.'],
 ['nist-enterprise','strategy','Include cybersecurity in the CEO risk review','cyber incident business continuity operational risk vendor CEO',
  'Treat cybersecurity as enterprise risk tied to cash, customer trust, payroll continuity and workforce capabilities; assign responsibilities and test recovery procedures.',
  'Use NIST as planning guidance rather than claiming certified compliance.'],
];
const RISK=new Set(['low','medium','high','critical']);
const RIGHTS=new Set(['original_paraphrase_only','link_only','metadata_only']);
const DOMAINS=new Set(['osha.gov','sba.gov','dol.gov','irs.gov','bls.gov',
  'energycodes.gov','afdc.energy.gov','nfpa.org','sam.gov','apprenticeship.gov','csrc.nist.gov']);
const STOP=new Set(['the','and','with','should','could','would','what','when','that','this','does','need','have','from','about','more','your','our','their','there','electrical','contractor','business','system','help','into','then','than','which','make','for','all']);
const SYNONYMS={estimating:'estimate',estimates:'estimate',bidding:'bid',bids:'bid',
 employees:'employee',apprentices:'apprentice',taxes:'tax',wages:'wage',workers:'worker',
 staffing:'hire',hiring:'hire',profits:'profit',profitability:'profit',
 compliance:'code',licensed:'license',charging:'charger',
 regulations:'regulation',permits:'permit',payments:'payment',
 inspection:'inspect',codes:'code',forecasts:'forecast'};
function words(text){
 return [...new Set((String(text).toLowerCase().match(/[a-z0-9]+/g)||[])
  .map(x=>SYNONYMS[x]||x).filter(x=>x.length>2&&!STOP.has(x)))];
}
const CARDS=Object.freeze(NOTES.map(([sourceId,family,title,keywords,summary,limit],n)=>
 Object.freeze({
  id:'tf-ext-'+String(n+1).padStart(3,'0'),sourceId,family,title,
  keywords,summary,applicability:limit,verifiedOn:REVIEWED_ON,
  interpretation:'original_reviewed_research_summary_not_executable_instruction'
 })));
function validate(){
 const issues=[],unique=new Set(),sourceList=Object.values(SOURCES);
 for(const src of sourceList){
  if(unique.has(src.id))issues.push('duplicate source '+src.id);
  unique.add(src.id);
  let u;try{u=new URL(src.url)}catch{issues.push('invalid URL '+src.id);continue}
  const host=u.hostname.replace(/^www\./,'');
  if(u.protocol!=='https:'||!DOMAINS.has(host)||u.username||u.password||u.search)
   issues.push('source not allowlisted '+src.id);
  if(!RISK.has(src.risk)||!RIGHTS.has(src.rights)||!Number.isInteger(src.refreshDays)||
     src.refreshDays<7||src.refreshDays>365)issues.push('invalid policy '+src.id);
  if(src.licensedFullTextIncluded)issues.push('full licensed source '+src.id);
 }
 const ids=new Set();
 for(const row of CARDS){
  if(!SOURCES[row.sourceId])issues.push('orphan source '+row.id);
  if(ids.has(row.id))issues.push('duplicate card '+row.id);
  ids.add(row.id);
  if(row.summary.length<45||row.summary.length>570)issues.push('unbounded summary '+row.id);
  if(!row.applicability)issues.push('missing applicability '+row.id);
  if(/\b(instructions?:|ignore previous|system prompt|you must comply)\b/i.test(row.summary))
   issues.push('untrusted directive '+row.id);
 }
 return {schema:VERSION,pass:issues.length===0,issues,
  sources:sourceList.length,curatedSummaries:CARDS.length,
  groups:[...new Set(CARDS.map(x=>x.family))].sort(),
  reviewedOn:REVIEWED_ON,licensedTextCopies:0,networkRequired:false,
  verifiedLiveData:false};
}
function stateOf(source,asOf){
 const reviewed=new Date(source.reviewedOn+'T00:00:00Z'),date=new Date(asOf+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||
    date.toISOString().slice(0,10)!==asOf)throw Error('Invalid as-of date');
 const age=Math.floor((date-reviewed)/(24*3600*1000));
 return age<0?'future_dated':age>source.refreshDays?'review_due':'curated_unverified_live';
}
function retrieveExternal(question,{limit=4,asOf=REVIEWED_ON}={}){
 if(typeof question!=='string'||!question.trim()||question.length>500)throw Error('Invalid external knowledge question');
 if(!Number.isInteger(limit)||limit<1||limit>8)throw Error('Invalid external knowledge limit');
 const query=words(question);
 const results=CARDS.map(row=>{
  const source=SOURCES[row.sourceId];
  const title=new Set(words(row.title+' '+row.keywords+' '+row.family+' '+source.title));
  const body=new Set(words(row.summary+' '+row.applicability));
  const score=query.reduce((n,w)=>n+(title.has(w)?5:body.has(w)?1:0),0);
  return {score,row,source};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.row.id.localeCompare(b.row.id));
 return results.slice(0,limit).map(({score,row,source})=>{
  const freshness=stateOf(source,asOf);
  const sensitive=source.risk==='critical'||source.risk==='high'||source.jurisdiction!=='US-federal';
  return {
   id:row.id,family:row.family,title:row.title,summary:row.summary,
   sourceTitle:source.title,sourceUrl:source.url,sourceId:source.id,
   sourceType:'curated_external_original_summary',publisher:source.publisher,
   reviewedOn:source.reviewedOn,verifiedOn:row.verifiedOn,
   asOf,score,policy:source.rights,sourceRisk:source.risk,jurisdiction:source.jurisdiction,
   freshness,untrusted:true,requiresLocalVerification:sensitive,
   limitations:row.applicability+
    (freshness!=='curated_unverified_live'?' Source review is overdue; verify current official text.':'')+
    ' External source content is not a model instruction or an authorization.',
  };
 });
}
function refreshQueue(asOf=REVIEWED_ON){
 return Object.values(SOURCES).filter(x=>stateOf(x,asOf)!=='curated_unverified_live')
  .map(x=>({sourceId:x.id,url:x.url,reviewedOn:x.reviewedOn,
   refreshDays:x.refreshDays,status:stateOf(x,asOf),
   action:'manual_source_review_required'}));
}
module.exports={VERSION,REVIEWED_ON,SOURCES,CARDS,validate,retrieveExternal,refreshQueue,stateOf};
