import {readIntelligenceContext} from './intelligence-context.js';
import {AuthorizationError} from './tenant-security.js';

// A server-only, read-only inventory of authenticated CURRENT records.
// Record content is not proof of settled bank funds or complete obligations.
const financialTypes=new Set(['invoices','payments','expenses','jobCosts']);
export function financialPeriod(asOfDate){
 if(typeof asOfDate!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(asOfDate))
  throw new AuthorizationError('Gregorian as-of date required',400);
 const date=new Date(asOfDate+'T00:00:00.000Z');
 if(asOfDate.startsWith('0000-')||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==asOfDate)
  throw new AuthorizationError('Invalid Gregorian as-of date',400);
 const end=new Date(date.getTime()+13*86400000).toISOString().slice(0,10);
 if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(end))throw new AuthorizationError('Fourteen-day period is outside supported dates',400);
 return {startDate:asOfDate,endDate:end};
}
const evidenceVersion=records=>JSON.stringify(records.map(r=>[r.type,r.id,r.revision,r.updatedAt,r.record]));

export async function readFinancialEvidence({db,principal,businessId,asOfDate,now=()=>new Date().toISOString()}){
 const period=financialPeriod(asOfDate);
 // Reuse the existing identity-verifying, role-scoped, bounded SQL reader.
 // Its role comes from active DB membership, not a request or model field.
 const first=await readIntelligenceContext({db,principal,businessId,now});
 if(!['owner','admin'].includes(first.permission.role))
  throw new AuthorizationError('Financial evidence requires owner or admin membership',403);
 const second=await readIntelligenceContext({db,principal,businessId,now});
 if(second.permission.role!==first.permission.role||evidenceVersion(second.records)!==evidenceVersion(first.records))
  throw new AuthorizationError('Financial evidence changed during read; retry',409);
 const recordRefs=second.records.filter(r=>financialTypes.has(r.type)).map(({type,id,revision,updatedAt})=>({type,id,revision,updatedAt}));
 return {
  kind:'tradeflow.financial.evidence.v1',status:'missing_data',sourceKind:'verified_tenant_record',
  scope:{businessId:second.businessId,actor:{...second.identity,role:second.permission.role},threadId:null,jobId:null},
  asOfDate, businessTimeZone:null,period,observedAt:now(),currency:'USD',amountUnit:'minor_cents',
  cash:{availableMinor:null,bankVerified:false,refs:[]},
  receivables:{openMinor:null,settlementVerified:false,refs:[]},
  obligations:[],obligationsComplete:false,
  coverage:{payroll:'unknown',suppliers:'unknown',materials:'unknown',otherExpenses:'partial_current_records',
   invoices:'partial_current_records',payments:'unverified_settlement',bank:'unverified'},
  recordRefs,
  missingData:['verified_bank_availability','business_time_zone','payroll_schedule_and_taxes_benefits',
   'supplier_commitment_completeness','materials_commitment_completeness','other_obligations',
   'collection_timing_and_settlement','verified_record_content_and_historical_coverage'],
  afterObligationsMinor:null,contentTrust:'untrusted_record_content',providerSettlementVerified:false,
  limitations:['Authenticated record identity is not independently verified financial settlement.',
   'This bounded current-record snapshot excludes supplier-order completeness and historical obligations.'],
  readOnly:true,executionAuthority:false
 };
}
