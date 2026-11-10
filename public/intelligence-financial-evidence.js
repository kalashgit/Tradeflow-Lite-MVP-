/* Read-only financial evidence gate; never grants access or executes business commands.
 * Verified tenant records must first come from the existing authorized server read path. */
const SOURCES=new Set(['user_scenario','synthetic_fixture','verified_tenant_record']);
const roles=new Set(['owner','admin','member','viewer']);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9:_.@|-]{1,180}$/.test(v);
const identity=v=>typeof v==='string'&&v.length>0&&v.length<=300&&!/\s/.test(v);
const money=v=>Number.isSafeInteger(v)&&v>=0;
const deny=(status,reason,source='unknown')=>Object.freeze({status,reason,source,cash:null,receivables:null,obligationsTotal:null,afterObligations:null,executionAuthority:false});

export function strictFinancialDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const [y,m,d]=value.split('-').map(Number);
 if(y<1||y>9999||m<1||m>12||d<1||d>31)return null;
 const calendar=new Date(0);
 calendar.setUTCHours(0,0,0,0);
 calendar.setUTCFullYear(y,m-1,d);
 const time=calendar.getTime();
 if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)return null;
 return time;
}

export function evaluateFinancialEvidence({evidence,scope,asOfDate,maxAgeDays=7}={}){
 if(!evidence||typeof evidence!=='object'||Array.isArray(evidence)||!SOURCES.has(evidence.sourceKind))return deny('needs_clarification','unknown_provenance');
 const source=evidence.sourceKind;
 if(!scope||!id(scope.businessId)||!id(scope.actorId)||!id(evidence.businessId)||scope.businessId!==evidence.businessId)
  return deny('needs_clarification','scope_mismatch',source);
 if(source==='verified_tenant_record'){
  const a=scope.authorization, e=evidence.identity;
  if(a?.verified!==true||!identity(a.issuer)||!identity(a.subject)||!roles.has(a.role)||a.businessId!==scope.businessId||
     e?.issuer!==a.issuer||e?.subject!==a.subject||e?.businessId!==scope.businessId||
     !Array.isArray(evidence.recordRefs)||!evidence.recordRefs.length||!evidence.recordRefs.every(id))
   return deny('needs_clarification','unauthorized_or_unverifiable_source',source);
 }else if(evidence.verified===true || evidence.sourceKind==='synthetic_fixture'&&evidence.identity?.verified===true){
  return deny('needs_clarification','unverified_source_claim',source);
 }
 const asOf=strictFinancialDate(asOfDate);
 const observed=strictFinancialDate(evidence.observedDate);
 const start=strictFinancialDate(evidence.period?.startDate);
 const end=strictFinancialDate(evidence.period?.endDate);
 if(asOf===null||observed===null||start===null||end===null)return deny('needs_clarification','invalid_or_ambiguous_date',source);
 if(!Number.isSafeInteger(maxAgeDays)||maxAgeDays<0||maxAgeDays>30)return deny('needs_clarification','invalid_staleness_policy',source);
 const day=86400000;
 if(observed>asOf||asOf-observed>maxAgeDays*day)return deny('missing_data','stale_or_future_evidence',source);
 if(start<asOf||end-start!==13*day)return deny('needs_clarification','invalid_reporting_period',source);
 if(!money(evidence.cash)||!money(evidence.receivables))return deny('missing_data','missing_or_invalid_balance',source);
 if(evidence.obligationsComplete!==true||!Array.isArray(evidence.obligations)||!evidence.obligations.length)
  return deny('missing_data','unverified_obligation_completeness',source);
 const seen=new Set();let total=0;
 for(const obligation of evidence.obligations){
  if(!obligation||!id(obligation.id)||seen.has(obligation.id)||!['payroll','materials','supplier','other'].includes(obligation.kind)||
     !money(obligation.amount)||strictFinancialDate(obligation.dueDate)===null)
   return deny('needs_clarification','malformed_obligation',source);
  seen.add(obligation.id);
  const due=strictFinancialDate(obligation.dueDate);
  if(due<start||due>end)return deny('needs_clarification','obligation_outside_period',source);
  total+=obligation.amount;
  if(!Number.isSafeInteger(total))return deny('needs_clarification','unsafe_amount_arithmetic',source);
 }
 if(!evidence.obligations.some(o=>o.kind==='payroll'))return deny('missing_data','missing_dated_payroll',source);
 const remaining=evidence.cash-total;
 if(!Number.isSafeInteger(remaining))return deny('needs_clarification','unsafe_amount_arithmetic',source);
 return Object.freeze({status:'conditional_calculation',reason:null,source,cash:evidence.cash,receivables:evidence.receivables,
  obligationsTotal:total,afterObligations:remaining,period:Object.freeze({...evidence.period}),
  explanation:source==='verified_tenant_record'?'Authorized record projection; recompute if revision changes.':
   source==='synthetic_fixture'?'SYNTHETIC SIMULATION — not verified company cash.':'OWNER-SUPPLIED HYPOTHETICAL — not saved business records.',
  receivablesExcluded:true,executionAuthority:false});
}
