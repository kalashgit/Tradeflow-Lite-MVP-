// AION Genesis / TradeFlow: bounded, original, source-linked contractor knowledge.
// A research pilot: practical company operations guidance, not a licensed code
// database, not customer facts, not training data, and not permission to act.
// The original playbook entries are explicitly hypotheses, not verified outcomes.
'use strict';

const VERSION='aion-electrical-ceo-reference/0.1.0';
const REVIEWED='2026-11-12';
const SOURCES=Object.freeze({
 original:{id:'tf-original',title:'TradeFlow original contractor operating playbooks',
  publisher:'TradeFlow research',url:null,kind:'original_playbook',jurisdiction:'US',
  reliability:'suggested_management_method_not_validated_customer_outcome'},
 sba:{id:'sba-finances',title:'Manage your business and finances',publisher:'U.S. Small Business Administration',
  url:'https://www.sba.gov/counseling/manage-your-business/',kind:'official_reference',jurisdiction:'US',
  reliability:'official_general_business_guidance'},
 sba_plan:{id:'sba-plan',title:'Plan your business',publisher:'U.S. Small Business Administration',
  url:'https://www.sba.gov/counseling/plan-your-business/',kind:'official_reference',jurisdiction:'US',
  reliability:'official_general_business_guidance'},
 osha:{id:'osha-1926k',title:'29 CFR 1926 Subpart K — Electrical',
  publisher:'U.S. Occupational Safety and Health Administration',
  url:'https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926SubpartK',
  kind:'official_reference',jurisdiction:'US',
  reliability:'federal_construction_safety_reference_check_applicability'},
 osha_loto:{id:'osha-1926-417',title:'29 CFR 1926.417 — Lockout and tagging of circuits',
  publisher:'U.S. Occupational Safety and Health Administration',
  url:'https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.417',
  kind:'official_reference',jurisdiction:'US',
  reliability:'federal_construction_safety_reference_check_applicability'},
 nec:{id:'nfpa-70',title:'NFPA 70 — National Electrical Code',
  publisher:'National Fire Protection Association',
  url:'https://www.nfpa.org/codes-and-standards/nfpa-70-standard-development/70',
  kind:'official_reference_metadata',jurisdiction:'US',
  reliability:'2026_published_edition_not_proof_of_local_adoption'},
 nfpa70e:{id:'nfpa-70e',title:'NFPA 70E — Electrical Safety in the Workplace',
  publisher:'National Fire Protection Association',
  url:'https://www.nfpa.org/codes-and-standards/nfpa-70-standard-development/70E',
  kind:'official_reference_metadata',jurisdiction:'US',
  reliability:'2027_published_edition_not_a_full_safety_program'},
 doe:{id:'doe-codes',title:'Building Energy Codes — Adoption and Compliance',
  publisher:'U.S. Department of Energy',
  url:'https://www.energycodes.gov/codes-101/develop-adopt-implement-comply',
  kind:'official_reference',jurisdiction:'US',
  reliability:'local_adoption_must_be_checked'},
 irs:{id:'irs-worker',title:'Independent contractor or employee?',
  publisher:'U.S. Internal Revenue Service',
  url:'https://www.irs.gov/businesses/small-businesses-self-employed/independent-contractor-self-employed-or-employee',
  kind:'official_reference',jurisdiction:'US',reliability:'general_classification_not_legal_advice'}
});

// Each item: immutable ID, topic family, heading, matching vocabulary,
// original TradeFlow wording, and a provenance source ID.
const CARDS=Object.freeze([
 ['sales-qualify','sales','Qualify before estimating','lead qualified buyer scope budget decision maker bid customer',
  'Before committing estimating hours, establish site access, work scope, schedule, decision maker, project budget range and whether the opportunity fits available crews. Record why a bid is declined.','original'],
 ['sales-icp','sales','Choose a profitable ideal customer','ideal customer market client segment commercial service maintenance residential acquisition profitability',
  'Compare customer segments using verified contribution margin, repeat demand, payment delays, quote win rate, acquisition effort and dispatch density. A large contract value does not necessarily imply the best customer.','original'],
 ['sales-repeat','sales','Earn repeat maintenance work','maintenance recurring service agreement customer retention annual inspections',
  'Offer well-scoped preventive-maintenance and response arrangements where appropriate. Record asset history, callbacks, response promises and renewal dates; verify that capacity supports commitments before selling them.','original'],
 ['sales-quote-pipeline','sales','Quote pipeline discipline','bid pipeline proposal estimate follow-up conversion win rate sales',
  'Track every lead through qualified, site-visited, estimated, proposed, won, lost or paused. Measure win rates by job type, price band and lead source rather than a single blended win rate.','original'],
 ['sales-disqualification','sales','Know when to decline a bad bid','bid no bid customer low margin risky scope',
  'Decline or renegotiate work when schedule, technical capability, payment security, access conditions or unbounded scope create disproportionate risk. Preserve a reason code for later strategy reviews.','original'],
 ['sales-proposal','sales','Write specific electrical proposals','quote proposal scope exclusions allowances change order estimate',
  'Describe inclusions, exclusions, assumptions, quantities, equipment, access, permits responsibility, schedule dependencies, acceptance terms and how change orders will be approved. Ambiguity is a future margin risk.','original'],
 ['estimating-bom','estimating','Build an auditable bill of materials','materials boq bom conduit wire panel switchgear estimate takeoff',
  'Estimate from drawings, site conditions and a versioned takeoff; capture quantities, supplier quotes, freight, waste allowances, substitutions, taxes and lead times. Reconcile actual orders against the approved estimate.','original'],
 ['estimating-labor','estimating','Estimate labor by production assumptions','labor hours estimate crew productivity installation time',
  'Separate takeoff quantities, assumed production rates, travel and site conditions, foreman coverage, testing and commissioning. Record what labor assumptions were used so future job actuals can calibrate them.','original'],
 ['estimating-risk','estimating','Price uncertainty explicitly','contingency allowance risk bid unknowns unforeseen',
  'Distinguish known direct costs from uncertain scope and risk exposure. Do not hide substantial unknown work inside a generic markup; document allowances, contingency assumptions and the process for additional authorization.','original'],
 ['estimating-service','estimating','Price small service calls','service call dispatch minimum travel diagnostics hourly price',
  'Include travel, dispatch overhead, diagnosis, minimum service charge, parts, return visits and after-hours premiums as applicable. Confirm how diagnostic time and additional work require approval.','original'],
 ['estimating-change','estimating','Version every estimate change','revision estimate scope change signed change order',
  'Maintain an immutable baseline estimate and a clearly dated revision history. Distinguish proposed, approved and executed changes; only approved scope belongs in the updated contract value.','original'],
 ['finance-margin','finance','Contribution margin versus gross margin','margin profitability contribution gross direct cost overhead',
  'Calculate contract revenue minus traceable direct material, labor, subcontract and job-specific cost to understand job contribution. Define whether burden and allocated overhead are included before comparing jobs.','original'],
 ['finance-cash','finance','Cash is not profit','cash cashflow profit invoices accounts receivable liquidity',
  'Cash receipts and accounting profit describe different things. Maintain a rolling short-term cash forecast for payroll, suppliers, taxes and committed obligations; do not treat collecting an old invoice as newly earned profit.','sba'],
 ['finance-ar','finance','Accounts receivable aging','invoice overdue aging receivable collection payment',
  'Review aged invoices by customer and disputed status. Confirm that the invoice was correctly issued with supporting documents; follow up with a documented, professional cadence and distinguish promise-to-pay from verified settlement.','sba'],
 ['finance-ap','finance','Payables and supplier terms','vendor accounts payable supplier due dates cash',
  'Track payment dates, discounts, critical materials and consequences of late settlement. Evaluate supplier relationships and preserve enough cash for payroll and essential obligations before taking discretionary commitments.','sba'],
 ['finance-forecast','finance','Thirteen-week cash forecast','cash forecast thirteen week 13-week payroll purchase collections',
  'A weekly near-term cash plan can track starting cash, expected receipts with confidence levels, payroll, payables, taxes, equipment and ending projected balances. Refresh forecasts using receipts, not unsupported optimism.','original'],
 ['finance-wip','finance','Work in progress and earned value','wip overbilling underbilling work in progress percent complete',
  'Reconcile progress billings, collected money, actual costs and estimated cost-to-complete. Flag overbilling that may mask an underfunded finish and underbilling that ties up working capital. Validate accounting treatment with a qualified accountant.','original'],
 ['finance-unit-economics','finance','Customer and job unit economics','job profitability margin unit economics customer acquisition cost',
  'Measure revenue, variable direct cost, contribution, callbacks, collection time and sales effort per job family. Compare outcomes across small service, commercial installation and maintenance without assuming identical cost structures.','original'],
 ['finance-breakeven','finance','Capacity and break-even','break even utilization overhead billable hours rate',
  'Estimate the monthly contribution required to cover fixed overhead; compare that requirement with realistic billable capacity, actual utilization, seasonality and collected invoices. Validate the cost allocation model first.','original'],
 ['finance-reporting','finance','Finance dashboard controls','balance sheet income cash flow forecast budget CEO',
  'Maintain reconciled income, balance-sheet and cash-flow views with a clear as-of date and definition of each metric. Protect against double counting invoices, payments, committed purchase orders and actual expenses.','sba'],
 ['operations-handoff','operations','Office to field handoff','project mobilization handoff crew job scope drawings',
  'Before mobilization, transfer approved scope, latest drawings, material status, site access, contacts, permits, labor budget, milestones and open risks. Ask the foreman to acknowledge missing prerequisites.','original'],
 ['operations-daily','operations','Daily field reporting','daily report time materials blockers crew weather',
  'Capture job-coded hours, quantities installed, material use, blockers, instructions, safety observations and photographs through a minimal field workflow. Separate reported work from independently verified completion.','original'],
 ['operations-cost-to-complete','operations','Forecast cost to complete','cost to complete actual labor remaining estimate at completion',
  'Combine actual committed and paid costs with remaining quantities and realistic productivity. Reforecast at meaningful milestones; report estimate-at-completion and who verified each underlying input.','original'],
 ['operations-schedule','operations','Constraint-based scheduling','schedule critical path crew materials inspections dependencies',
  'Do not promise a start based on a calendar slot alone. Check crew skills, approvals, site readiness, supplier commitments, access, inspections and predecessor activities; identify the critical blocker.','original'],
 ['operations-supplier','operations','Supplier-delay recovery','supplier late delivery procurement schedule backorder',
  'Verify purchase-order acknowledgment, actual expected ship date, substitution rules, alternate approved materials and which jobs are affected. Simulate resequencing before promising a new completion date.','original'],
 ['operations-procurement','operations','Procurement planning','purchase order supplier material lead time early release',
  'Order long-lead items from an approved bill of materials, with specification checks, delivery windows, committed cost and receiving verification. Never treat a purchase request as a confirmed supplier commitment.','original'],
 ['operations-substitutions','operations','Substitution approval','substitution approved equivalent material supply electrical',
  'Any substitute must satisfy technical specification, contract, compatibility and applicable code/inspection requirements. Obtain authorized review and document the effect on cost, schedule and warranties before purchase or installation.','original'],
 ['operations-change-order','operations','Change-order discipline','change request change order unauthorized work field instruction',
  'Record the initiating instruction, affected scope, labor/material delta, schedule consequences, contract terms and owner approval status. Do not treat a verbal indication as equivalent to a signed authorization when the contract requires more.','original'],
 ['operations-closeout','operations','Inspection and closeout readiness','inspection punch list closeout test as-built warranty',
  'Prepare punch lists, approved inspections, commissioning/testing evidence, as-built drawings, equipment documentation, warranties and final billing prerequisites. Do not claim inspection approval based on an internal checklist.','original'],
 ['operations-callbacks','operations','Callback root-cause review','warranty callback rework quality issue',
  'Log repeat visits and rework by job, cause, crew, material and cost. Distinguish installation fault, scope misunderstanding, device failure and unrelated customer requests before assigning blame or changing training.','original'],
 ['people-crew','people','Skills-based crew assignment','crew electrician apprentice skill supervisor manpower scheduling',
  'Match staffing to verified skills, required supervision, location, availability and job complexity. Do not optimize labor cost by bypassing supervision, licensing or safety requirements.','original'],
 ['people-training','people','Skills and apprenticeship development','training apprentice licensure competencies retention',
  'Track demonstrated competencies, mentoring, required training and license/supervision constraints. Recognize completed, assessed work rather than equating course attendance with proven ability.','original'],
 ['people-capacity','people','Hiring versus subcontracting','hire employee subcontract labor capacity growth',
  'Compare sustained backlog and recurring margin with the full employer burden, supervision capacity, ramp-up time and subcontractor quality. Check classification, licensing and insurance before selecting a labor model.','original'],
 ['people-classification','people','Employee and contractor classification','1099 employee contractor subcontractor payroll compliance irs',
  'Worker classification depends on actual control, financial relationship and overall engagement, not merely the contract label. Verify federal and state requirements with professional advice before treating someone as a contractor.','irs'],
 ['people-incentives','people','Productivity and quality incentives','bonus foreman incentive install productivity retention',
  'Use a balanced scorecard: installed quality, safety, verified labor efficiency, rework, customer experience and documentation completeness. Avoid incentives that reward concealment of defects or unsafe speed.','original'],
 ['ceo-weekly','ceo','Weekly CEO operating review','CEO founder leadership priorities weekly management',
  'Review cash runway, overdue receivables, backlog quality, crew load, troubled jobs, bids requiring decisions, safety and customer commitments. Leave with owners, deadlines and documented evidence for the top decisions.','original'],
 ['ceo-delegation','ceo','Delegate decisions with authority','CEO delegation approval limit roles accountability',
  'Assign clear decision rights, documented approval thresholds and exception paths. Delegate preparation and reversible administration, not authority that has not been granted. Verify ownership of results without micromanaging every action.','original'],
 ['ceo-forecast','ceo','Forecast backlog quality','backlog pipeline revenue project risk forecast',
  'Segment signed backlog, probable awards and unqualified bids. Forecast revenue by credible start dates, permits, crew capacity and collection terms; a large pipeline is not a cash forecast.','original'],
 ['ceo-growth','ceo','Grow without losing control','growth scaling hiring capacity operational maturity',
  'Scale only when quoting accuracy, field reporting, project costing, collections and supervision can support additional work. Track leading constraints before increasing lead generation or hiring aggressively.','original'],
 ['ceo-competitive','ceo','Choose a defensible specialization','strategy niche specialty competitive advantage electrical contractor',
  'Consider niches where documented expertise, response quality, compliance, maintenance history or complex coordination offer differentiated value. Avoid competing exclusively on lowest bid without cost evidence.','original'],
 ['ceo-risk','ceo','Maintain an enterprise risk register','risk insurance bonding concentration customer safety',
  'Track customer concentration, supplier dependency, cash exposure, bonding/insurance gaps, single-point staffing failures, safety events and contractual exposures; assign mitigations and review triggering indicators.','original'],
 ['ceo-customer','ceo','Service recovery and customer trust','complaint callback dispute customer relationship',
  'Acknowledge the reported problem, verify the actual evidence, assign one accountable owner and give an honest next update. Do not promise a remedy or admit liability before the facts and contractual obligations are reviewed.','original'],
 ['ceo-metrics','ceo','A small useful CEO scorecard','kpi dashboards profitability collections schedule quality',
  'Begin with a handful of reconciled measures: cash forecast variance, contribution by job family, labor-hour variance, aged AR, schedule reliability, callback rate, and qualified backlog. Add metrics only when they change decisions.','original'],
 ['ceo-experiments','ceo','Run measurable operational experiments','A B testing process improvement experiments ceo',
  'Choose a measurable hypothesis, a baseline and comparable cohort. Trial one change on suitable jobs, record costs and adverse effects, then inspect whether gains transfer before making it policy.','original'],
 ['compliance-nec','compliance','Published NEC edition versus local adoption','NEC nfpa 70 2026 code permits electrical inspector',
  'NFPA publishes the 2026 NEC, but the legally adopted edition and amendments depend on the state and authority having jurisdiction. Confirm the currently enforced local requirements before design, estimating or inspection decisions.','nec'],
 ['compliance-osha','compliance','Construction electrical safety requirements','OSHA construction electrical safety 1926 shock wiring',
  'OSHA 29 CFR 1926 Subpart K contains U.S. construction electrical requirements. Scope, applicable state-plan provisions, task hazards, qualifications and employer procedures still require site-specific review.','osha'],
 ['compliance-loto','compliance','Energy isolation and tagging','lockout tagout deenergized energized circuit work 1926 417',
  'Construction circuit lockout/tagging requirements include rendering deenergized circuits inoperative and identifying them with tags under OSHA 1926.417. A qualified, site-specific energy-control procedure is essential; this reference is not a how-to authorization.','osha_loto'],
 ['compliance-arcflash','compliance','Arc-flash and electrical work risk','nfpa 70e arc flash ppe shock energized work safety',
  'NFPA 70E addresses workplace electrical safety, including shock and arc-flash risks. The 2027 edition exists, but site policy, applicable regulations, equipment conditions and competent professional assessment govern actual work.','nfpa70e'],
 ['compliance-energy','compliance','Energy-code jurisdiction and scope','IECC ASHRAE energy code lighting controls local adoption',
  'Building energy codes such as IECC or ASHRAE 90.1 can affect lighting controls and electrical project requirements. Adoption is state/local; verify the actual authority, edition, amendments and project type.','doe'],
 ['compliance-permit','compliance','Permits, licensing and inspections','permit electrician license inspection approval jurisdiction AHJ',
  'Determine the correct permit issuer, contractor/worker licensing requirements, inspection stages and adopted code for each job location. Do not assume a federal reference substitutes for local AHJ decisions.','original'],
 ['systems-automation','systems','Automate preparation not authorization','automation office workflow review approvals AI actions',
  'Automate evidence collection, draft preparation, reminders and exception triage first. Keep customer communications, payments, commitments and scope changes behind explicit scopes, review and durable receipt checks.','original'],
 ['systems-voice','systems','Voice-assisted field workflows','voice notes transcript dictation foreman mobile speech',
  'Let workers dictate factual site notes and job-coded time, then show the transcript for correction before saving. Voice transcription is not proof of a fact, approval or command execution.','original'],
 ['systems-learning','systems','Learning from verified outcomes','feedback learning simulator training AION academy',
  'Use verified outcomes to discover which strategies worked in which conditions. Preserve negative transfer, missing evidence, costs and failed candidates; never promote a model only because a familiar test improved.','original'],
 ['systems-integration','systems','Avoid duplicate business truth','integrations CRM accounting time tracking system of record',
  'Define which system owns estimates, jobs, receipts, time, invoices and payments. Sync source revisions and reconcile conflicts before triggering dependent workflows; do not turn synchronized summaries into new authoritative records.','original'],
]);
const index=CARDS.map(([id,family,title,keywords,text,source])=>Object.freeze({
 id:'tf-'+id,family,title,keywords,text,sourceId:SOURCES[source].id,
 source:SOURCES[source],
}));
const stop=new Set(['the','and','for','what','how','why','does','with','this','that','your','from','our','are','can','would','should','could','need','into','about','some','best','have','them','which','their','more','all','business','electrical','contracting']);
const aliases=Object.freeze({profits:'profit',profitability:'margin',pricing:'price',quoting:'estimate',quotes:'estimate',estimating:'estimate',contractors:'contractor',hiring:'hire',owners:'owner',leadership:'ceo',optimizing:'optimization',invoices:'invoice',payments:'payment',safety:'osha',employees:'employee'});
const terms=v=>[...new Set((String(v).toLowerCase().match(/[a-z0-9]+/g)||[])
 .map(w=>aliases[w]||w).filter(w=>w.length>2&&!stop.has(w)))];
function retrieve(question,{limit=5}={}){
 if(typeof question!=='string'||!question.trim()||question.length>6000)throw Error('Invalid contractor question');
 if(!Number.isSafeInteger(limit)||limit<1||limit>8)throw Error('Invalid retrieval bound');
 const words=terms(question),q=question.toLowerCase();
 const ranked=index.map(item=>{
  const headline=new Set(terms(item.title+' '+item.family+' '+item.keywords));
  const body=new Set(terms(item.text));
  const matches=words.filter(w=>headline.has(w)||body.has(w));
  const score=words.reduce((total,w)=>total+(headline.has(w)?4:body.has(w)?1:0),0)
     + (q.includes(item.title.toLowerCase())?10:0);
  return {item,score,matched:matches.length};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.item.id.localeCompare(b.item.id));
 return ranked.slice(0,limit).map(({item,score})=>({
  id:item.id,family:item.family,title:item.title,summary:item.text,
  sourceId:item.sourceId,sourceTitle:item.source.title,
  sourceUrl:item.source.url,sourceType:item.source.kind,
  asOf:REVIEWED,score,provenance:item.source.reliability,
  limitations:item.family==='compliance'?
   'Confirm local jurisdiction, adopted code edition, qualified-person review, site conditions and applicable rules.' :
   'Original suggested practice; not a verified result for a specific company.',
 }));
}
function catalog(){
 const byFamily={};for(const row of index)byFamily[row.family]=(byFamily[row.family]||0)+1;
 return Object.freeze({version:VERSION,reviewedOn:REVIEWED,entries:index.length,
  sources:Object.keys(SOURCES).length,byFamily,
  status:'curated_seed_not_comprehensive_or_self_training'});
}
module.exports={VERSION,REVIEWED,SOURCES,CARDS,retrieve,catalog,terms};
