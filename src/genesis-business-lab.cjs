// AION / TradeFlow full-business synthetic laboratory: fixed five-person firm.
// This is NOT a tenant data connector; no business data or tool capability is
// accepted from user/model input. All state is ephemeral and synthetic.
'use strict';
const crypto=require('node:crypto');
const fixture=require('../automation/simulator/genesis-five-person-business.json');
const {referenceSelection}=require('./genesis-adviser.cjs');

const SCHEMA='AIONFivePersonBusinessLab/1';
const AS_OF=fixture.asOf;
const TYPES=['employees','customers','leads','quotes','jobs','invoices','payments',
 'suppliers','purchaseOrders','schedule','changeOrders','payrollSchedule','contracts','communications'];
const byId=(array,id)=>array.find(x=>x.id===id);
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const copy=x=>structuredClone(x);
const money=n=>{if(!Number.isSafeInteger(n)||n<0||n>1e8)throw Error('Invalid financial amount');return n};
function date(d){
 if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))throw Error('Invalid ISO date');
 const x=Date.parse(d+'T00:00:00Z');
 if(!Number.isFinite(x)||new Date(x).toISOString().slice(0,10)!==d)throw Error('Invalid Gregorian date');
 return x;
}
const days=(a,b)=>Math.round((date(b)-date(a))/86400000);
const duration=r=>{
 const parse=t=>{if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t))throw Error('Invalid schedule time');
 return Number(t.slice(0,2))*60+Number(t.slice(3))};
 const a=parse(r.start),b=parse(r.end);if(b<=a)throw Error('Invalid nonovernight shift');
 return [a,b];
};
function validate(b){
 if(!b?.synthetic||b.schema!=='TradeFlowGenesisFivePersonFixture/1'||!b.company.includes('SYNTHETIC')
  ||b.employees?.length!==5||b.currency!=='USD'||b.businessId!=='tf_genesis_lab_05'
  ||b.asOf!==AS_OF)throw Error('Isolated five-person synthetic fixture required');
 const ids={};
 for(const type of TYPES){
  if(!Array.isArray(b[type])||b[type].length>60)throw Error('Invalid '+type+' collection');
  ids[type]=new Set();
  for(const r of b[type]){
   if(!r||typeof r.id!=='string'||!/^[a-z][a-z0-9-]{2,80}$/.test(r.id)||ids[type].has(r.id))
    throw Error('Invalid/duplicate '+type+' ID');
   ids[type].add(r.id);
  }
 }
 const link=(type,id)=>{if(!ids[type].has(id))throw Error('Invalid '+type+' relation '+id)};
 for(const r of b.leads)link('customers',r.customerId);
 for(const r of b.quotes){link('customers',r.customerId);link('leads',r.leadId);money(r.amount)}
 for(const r of b.jobs){link('customers',r.customerId);money(r.contractValue);
  if(r.quoteId)link('quotes',r.quoteId);
  for(const field of ['costBudget','actualDirectCost','estimatedCostToComplete','actualLaborHours','estimatedLaborHours','estimatedRemainingLaborHours','callbackCost'])
   if(r[field]!==undefined)money(r[field]);
 }
 for(const r of b.invoices){link('customers',r.customerId);link('jobs',r.jobId);money(r.amount);date(r.dueDate)}
 for(const r of b.payments){link('invoices',r.invoiceId);money(r.amount);date(r.settledOn)}
 for(const r of b.purchaseOrders){link('suppliers',r.supplierId);link('jobs',r.jobId);money(r.amount);
  if(r.paymentDue)date(r.paymentDue);if(r.expectedDelivery)date(r.expectedDelivery);
 }
 for(const r of b.schedule){link('employees',r.employeeId);link('jobs',r.jobId);date(r.date);duration(r)}
 for(const r of b.changeOrders){link('jobs',r.jobId);money(r.amount)}
 for(const r of b.payrollSchedule){money(r.amount);date(r.dueDate)}
 for(const r of b.contracts){link('jobs',r.jobId);money(r.baseAmount)}
 for(const r of b.employees)money(r.weeklyPayroll);
 const weekly=b.employees.reduce((n,r)=>n+r.weeklyPayroll,0);
 if(b.payrollSchedule.some(p=>p.amount!==weekly))throw Error('Payroll fixture contradicts employees');
 for(const i of b.invoices)if(b.payments.filter(p=>p.invoiceId===i.id).reduce((n,p)=>n+p.amount,0)>i.amount)
  throw Error('Invoice overpayment');
 money(b.bank.balance);date(b.bank.verifiedAsOf);
 return true;
}
function session(){
 validate(fixture);
 let state=copy(fixture);let events=[];
 const initial=hash(state);
 return {
  read:()=>copy(state),trace:()=>copy(events),hash:()=>hash(state),initialHash:initial,
  reset(){state=copy(fixture);events=[];return hash(state)},
  apply(event){
   if(!event||typeof event!=='object'||Array.isArray(event)||typeof event.type!=='string')
    throw Error('Invalid synthetic event');
   const next=copy(state),before=hash(state);
   if(event.type==='confirmed_payment'){
    const inv=byId(next.invoices,event.invoiceId);
    if(!inv||inv.status==='paid'||!Number.isSafeInteger(event.amount)||event.amount<=0)
     throw Error('Unknown invoice / invalid payment');
    date(event.settledOn);
    if(event.settledOn<next.asOf)throw Error('Backdated synthetic receipt not accepted');
    const old=next.payments.filter(p=>p.invoiceId===inv.id).reduce((n,p)=>n+p.amount,0);
    if(old+event.amount>inv.amount)throw Error('Invoice overpayment');
    next.payments.push({id:'pay-event-'+(events.length+1),invoiceId:inv.id,
     amount:event.amount,settledOn:event.settledOn,status:'bank_confirmed'});
    next.bank.balance+=event.amount;
    if(old+event.amount===inv.amount)inv.status='paid';
   }else if(event.type==='confirmed_supplier_delay'){
    const po=byId(next.purchaseOrders,event.purchaseOrderId);
    if(!po||po.status!=='confirmed'||!event.expectedDelivery)throw Error('No confirmed supplier PO');
    date(event.expectedDelivery);
    po.expectedDelivery=event.expectedDelivery;po.shipmentVerified=false;
   }else if(event.type==='customer_signed_change'){
    const co=byId(next.changeOrders,event.changeOrderId);
    if(!co||co.status!=='proposed'||event.approvalReceipt!=='SIMULATED_SIGNED_RECEIPT')
     throw Error('Missing synthetic written approval');
    co.status='approved';co.approvalReceived=true;co.customerAuthorized=true;
   }else throw Error('Unsupported sandbox-only event');
   validate(next);state=next;events.push({event:copy(event),before,after:hash(state),
    provenance:'synthetic_scenario_only',productionWrites:0});
   return this.read();
  }
 };
}
function measures(b){
 validate(b);
 const asOf=b.asOf;
 const upcoming=b.payrollSchedule.filter(p=>p.status==='committed'&&days(asOf,p.dueDate)>=0&&days(asOf,p.dueDate)<=14);
 const payroll=upcoming.reduce((n,p)=>n+p.amount,0);
 const committedPO=b.purchaseOrders.filter(po=>po.status==='confirmed'&&po.paymentDue&&days(asOf,po.paymentDue)>=0&&days(asOf,po.paymentDue)<=14);
 const supplierDue=committedPO.reduce((n,p)=>n+p.amount,0);
 const unpaid=b.invoices.map(i=>({...i,outstanding:i.amount-b.payments.filter(p=>p.invoiceId===i.id).reduce((n,p)=>n+p.amount,0)}))
  .filter(i=>i.outstanding>0);
 const overdue=unpaid.filter(i=>days(i.dueDate,asOf)>0);
 const j=byId(b.jobs,'job-100'),openChange=b.changeOrders.filter(x=>x.status!=='approved');
 const confirmedBacklog=b.jobs.filter(x=>['in_progress','scheduled'].includes(x.status))
  .reduce((n,j)=>n+j.contractValue,0);
 const completed=b.jobs.filter(x=>x.status==='completed');
 const completedRevenue=completed.reduce((n,j)=>n+j.contractValue,0);
 const completedCosts=completed.reduce((n,j)=>n+j.actualDirectCost+(j.callbackCost||0),0);
 const conflicts=[];
 for(let i=0;i<b.schedule.length;i++)for(let k=i+1;k<b.schedule.length;k++){
  const a=b.schedule[i],c=b.schedule[k];if(a.employeeId!==c.employeeId||a.date!==c.date)continue;
  const [s1,e1]=duration(a),[s2,e2]=duration(c),overlap=Math.max(0,Math.min(e1,e2)-Math.max(s1,s2));
  if(overlap>0)conflicts.push({first:a.id,second:c.id,employeeId:a.employeeId,minutes:overlap,
   includesTentative:[a,c].some(x=>x.status==='tentative')});
 }
 const panel=byId(b.purchaseOrders,'po-101'),job=byId(b.jobs,panel.jobId);
 const eac=j.actualDirectCost+j.estimatedCostToComplete;
 return {
  people:b.employees.length,weeklyPayroll:b.employees.reduce((n,e)=>n+e.weeklyPayroll,0),
  upcomingPayroll:payroll,upcomingSupplierCommitments:supplierDue,bankBalance:b.bank.balance,
  conditionalCashAfterObligations:b.bank.balance-payroll-supplierDue,
  cashShortfall:Math.max(0,payroll+supplierDue-b.bank.balance),
  outstandingReceivables:unpaid.reduce((n,i)=>n+i.outstanding,0),
  overdueReceivables:overdue.reduce((n,i)=>n+i.outstanding,0),
  overdueInvoiceIds:overdue.map(i=>i.id),unpaidInvoiceIds:unpaid.map(i=>i.id),
  settledLifetimePayments:b.payments.reduce((n,p)=>n+p.amount,0),
  quoteFollowUpDays:days('2026-11-01',asOf),
  signedActiveBacklog:confirmedBacklog,
  openQuotePipeline:b.quotes.filter(q=>['sent','draft'].includes(q.status)).reduce((n,q)=>n+q.amount,0),
  openLeadCount:b.leads.filter(x=>!['won','lost'].includes(x.status)).length,
  supplierDeliveryGapDays:Math.max(0,days(job.startDate,panel.expectedDelivery)),
  supplierExpectedDelivery:panel.expectedDelivery,
  supplierArrivalVerified:panel.shipmentVerified,
  crewConflictMinutes:conflicts.reduce((n,c)=>n+c.minutes,0),conflicts,
  unapprovedChangeTotal:openChange.reduce((n,x)=>n+x.amount,0),
  signedChangeTotal:b.changeOrders.filter(x=>x.status==='approved').reduce((n,x)=>n+x.amount,0),
  dentalCostToComplete:j.estimatedCostToComplete,dentalEAC:eac,
  dentalCostOverrun:eac-j.costBudget,dentalForecastContribution:j.contractValue+(
   b.changeOrders.filter(x=>x.jobId===j.id&&x.status==='approved').reduce((n,x)=>n+x.amount,0))-eac,
  dentalFinalLaborHours:j.actualLaborHours+j.estimatedRemainingLaborHours,
  dentalProjectedLaborOverrun:j.actualLaborHours+j.estimatedRemainingLaborHours-j.estimatedLaborHours,
  completedJobRevenue:completedRevenue,completedJobCosts:completedCosts,
  completedJobContribution:completedRevenue-completedCosts,
  completedJobContributionRate:completedRevenue?(completedRevenue-completedCosts)/completedRevenue:null,
  receivablesAsAvailableCash:false,unapprovedChangesBillable:false,
  messagesSent:b.communications.filter(x=>x.sent===true).length,
 };
}
const TOPICS=[
 ['cash',/\bcash\b|payroll|liquidity|pay both|obligations|bank balance|runway/i,['bank','payrollSchedule','employees','purchaseOrders','invoices','payments']],
 ['ar',/overdue|receivable|unpaid invoice|outstanding invoice|collection|cash received/i,['invoices','payments','customers','jobs']],
 ['quote',/quote|estimate|proposal|follow.?up/i,['quotes','leads','customers','communications']],
 ['supplier',/supplier|materials|panel arrive|delivery|purchase order|procure|substitut/i,['purchaseOrders','suppliers','jobs']],
 ['schedule',/schedule|crew|calendar|overlap|conflict|capacity|lead electrician/i,['schedule','employees','jobs']],
 ['change',/change order|extra scope|unapproved|signed change/i,['changeOrders','contracts','jobs','purchaseOrders']],
 ['jobcost',/job cost|margin|forecast|cost to complete|overrun|labor hours|profitabil/i,['jobs','changeOrders','quotes','payrollSchedule']],
 ['backlog',/backlog|booked work|pipeline|total work|signed contracts/i,['jobs','quotes','contracts','leads']],
 ['leads',/lead|prospect|customer segment|best customer|growth|conversion/i,['leads','customers','quotes','jobs']],
 ['strategy',/priorit|CEO|owner|decision|tomorrow|next week|risk/i,['bank','payrollSchedule','invoices','payments','jobs','schedule','purchaseOrders','quotes','changeOrders','leads']]
];
function topicFor(question){
 for(const [name,pattern] of TOPICS)if(pattern.test(question))return name;
 return 'strategy';
}
function retrieve(b,question,{maxRecords=30}={}){
 if(typeof question!=='string'||question.length<3||question.length>500)throw Error('Invalid lab question');
 if(!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>35)throw Error('Invalid lab evidence bound');
 validate(b);
 const group=topicFor(question),entry=TOPICS.find(x=>x[0]===group);
 const selected=entry?entry[2]:[];
 const items=[];
 // For stable provenance each raw record is numbered @1, the synthetic bank is
 // an explicitly named financial record. No model-provided source is accepted.
 if(selected.includes('bank'))items.push({ref:'bank:bank-001@1',type:'bank',data:copy(b.bank)});
 for(const type of selected.filter(x=>x!=='bank')){
  const arr=b[type];
  for(const record of arr)items.push({ref:type+':'+record.id+'@1',type,data:copy(record)});
 }
 return {schema:'AIONBusinessEvidence/1',synthetic:true,asOf:b.asOf,
  scenarioId:b.scenarioId,company:b.company,companySize:b.employees.length,
  topicalRoute:group,records:items.slice(0,maxRecords),
  truncated:items.length>maxRecords,
  limitations:['All records are fabricated synthetic test data, not verified cloud tenant evidence.',
   'Receivables are not available cash; paid invoices are included in bank balance.',
   'Supplier shipment forecasts are not shipment confirmations.',
   'Proposed changes have no billing authority.',
   'No external communications, payments, scheduling or purchasing actions are authorized.']
 };
}
// Independent oracle baseline. Never supplied to the Qwen inference pathway.
function oracle(b,question){
 const m=measures(b),kind=topicFor(question);
 let answer,refs,flags=[];
 switch(kind){
 case 'cash':
  answer='Synthetic business has $'+m.bankBalance+' in bank, $'+m.upcomingPayroll+
   ' of committed payroll and $'+m.upcomingSupplierCommitments+' of confirmed supplier payments due in the next 14 days. The conditional cash balance is $'+m.conditionalCashAfterObligations+
   ' (shortfall $'+m.cashShortfall+'). Unpaid invoices are not available cash.';
  refs=['bank:bank-001@1','payrollSchedule:payroll-01@1','payrollSchedule:payroll-02@1',
   'purchaseOrders:po-101@1','purchaseOrders:po-102@1'];
  flags=['cash_at_risk','collections_unconfirmed'];break;
 case 'ar':
  answer='Outstanding receivables are $'+m.outstandingReceivables+
   ', including $'+m.overdueReceivables+' overdue on invoice inv-100. Its recorded $1600 payment is already reflected; no unsent collection reminder was sent.';
  refs=['invoices:inv-100@1','invoices:inv-101@1','payments:pay-100@1'];
  flags=['uncollected_not_cash'];break;
 case 'quote':
  answer='Mock Harbor Cafe quote quote-103 for $4850 was sent '+m.quoteFollowUpDays+
   ' days ago and needs a reviewed follow-up. The $9200 Civic Offices quote remains draft. No customer communication has been sent.';
  refs=['quotes:quote-103@1','quotes:quote-104@1','communications:msg-103@1'];
  flags=['draft_only'];break;
 case 'supplier':
  answer='Confirmed PO po-101 for $4700 is expected '+m.supplierExpectedDelivery+
   ', '+m.supplierDeliveryGapDays+' days after the scheduled job start. Shipment is unverified; check supplier and site schedule before suggesting an approved substitute.';
  refs=['purchaseOrders:po-101@1','suppliers:sup-beacon@1','jobs:job-101@1'];
  flags=['supplier_delay','not_delivered','substitution_needs_approval'];break;
 case 'schedule':
  answer='Lead electrician e-lead has '+m.crewConflictMinutes+' minutes of overlapping appointments on November 13, one tentative. Review or reschedule before treating both as committed capacity.';
  refs=['schedule:sch-101@1','schedule:sch-102@1','employees:e-lead@1'];
  flags=['crew_overlap'];break;
 case 'change':
  answer='Change order co-100 is '+(m.unapprovedChangeTotal?'proposed, not authorized':'approved with a simulated written receipt')+
   '. Unapproved value is $'+m.unapprovedChangeTotal+'. No new invoice was issued; only signed approval can change the contractual scope under this fixture.';
  refs=['changeOrders:co-100@1','contracts:contract-100@1'];
  flags=['no_auto_billing'];break;
 case 'jobcost':
  answer='Dental job forecast cost at completion is $'+m.dentalEAC+
   ', $'+m.dentalCostOverrun+' above cost budget. Forecast contribution is $'+m.dentalForecastContribution+
   ', not realized profit. Labor forecast is '+m.dentalFinalLaborHours+' hours, '+m.dentalProjectedLaborOverrun+' above original plan.';
  refs=['jobs:job-100@1','contracts:contract-100@1','changeOrders:co-100@1'];
  flags=['forecast_not_realized'];break;
 case 'backlog':
  answer='Signed active-job backlog is $'+m.signedActiveBacklog+
   '. The separate unaccepted/draft quote pipeline totals $'+m.openQuotePipeline+
   ' and must not be counted as awarded revenue.';
  refs=['jobs:job-100@1','jobs:job-101@1','quotes:quote-103@1','quotes:quote-104@1'];
  flags=['pipeline_not_backlog'];break;
 case 'leads':
  answer='There are '+m.openLeadCount+
   ' open leads: the Harbor Cafe sent proposal needs a reviewed follow-up and Civic Offices needs a site walk. Only two completed jobs exist, so customer segment profitability cannot be established reliably.';
  refs=['leads:lead-103@1','leads:lead-104@1','jobs:job-090@1','jobs:job-091@1'];
  flags=['small_sample','no_auto_contact'];break;
 default:
  answer='The top verified synthetic risks are a conditional $'+m.cashShortfall+
   ' cash shortfall, $'+m.overdueReceivables+' overdue, a '+m.crewConflictMinutes+
   '-minute crew overlap, a '+m.supplierDeliveryGapDays+'-day expected panel delivery gap and a proposed $'+m.unapprovedChangeTotal+
   ' change order. Confirm priorities with owner; no business actions were executed.';
  refs=['bank:bank-001@1','invoices:inv-100@1','schedule:sch-101@1','schedule:sch-102@1','purchaseOrders:po-101@1','changeOrders:co-100@1'];
  flags=['multi_domain_issues','advisory_only'];
 }
 return {schema:'AIONFivePersonOracle/1',topic:kind,answer,refs,flags,
  factSet:m,executionAuthority:false,source:'synthetic_oracle_not_ai',synthetic:true};
}
function modelPacket(b,question){
 const evidence=retrieve(b,question,{maxRecords:28});
 // Reference packet is independent public/curated domain knowledge; not any
 // mutable grader, and never a complete copyrighted handbook.
 const knowledge=referenceSelection(question).slice(0,3).map(r=>({
  id:r.id,title:r.title,summary:String(r.summary).slice(0,420),sourceType:r.sourceType,
  limitations:r.limitations
 }));
 return {question,evidence,knowledge,
  instructionsToModelAreTrusted:false};
}
module.exports={SCHEMA,AS_OF,TYPES,validate,session,measures,retrieve,oracle,modelPacket,topicFor,hash,days};
