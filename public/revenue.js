/* TradeFlow Revenue Release 03 — offline invoice drafts and job-cost review.
   No tax-invoice compliance assertion, external send, bank connection or payment processing. */
(function(global){
'use strict';
let api=null,mode='list',invoiceId='',jobId='',draftFromJobId='';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const trim=(v,n=200)=>String(v==null?'':v).trim().slice(0,n);
const cents=n=>Math.round(Number(n)*100);
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);
const today=()=>{let d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
function totals(inv){
 const lines=Array.isArray(inv?.lines)?inv.lines:[];
 const subtotal=lines.reduce((sum,l)=>{
  const qty=Number(l.qty),price=Number(l.unitPrice);
  return sum+(Number.isFinite(qty)&&Number.isFinite(price)&&qty>=0&&price>=0?Math.round(cents(price)*qty):0);
 },0);
 const rate=Number(inv?.taxRate)||0;
 const tax=Math.round(subtotal*rate/100);
 return {subtotal:subtotal/100,tax:tax/100,total:(subtotal+tax)/100};
}
function collected(inv,payments){
 return Math.round((payments||[]).filter(p=>p.invoiceId===inv.id).reduce((s,p)=>s+(Number(p.amount)||0),0)*100)/100;
}
function state(inv,payments){
 if(inv.status==='Void')return 'Void';
 const paid=collected(inv,payments),sum=totals(inv).total;
 if(sum>0&&paid>=sum-.005)return 'Paid';
 if(paid>0)return 'Part-paid';
 return inv.status==='Issued'?'Issued':'Draft';
}
function sectionHeading(title,subtitle){
 return '<header class="tf-revenue-heading"><div><span class="tf-revenue-kicker">TRADEFLOW / OPERATIONS</span><h1>'+esc(title)+'</h1><p>'+esc(subtitle)+'</p></div></header>';
}
function topNav(type){
 return '<nav class="tf-revenue-top" aria-label="Revenue tools">'+
 '<button type="button" data-tab="invoices" class="'+(type==='invoices'?'active':'')+'">Invoices</button>'+
 '<button type="button" data-tab="profitability" class="'+(type==='profitability'?'active':'')+'">Job costs</button></nav>';
}
function relatedName(id,rows,label){
 if(!id)return 'None';return esc(rows.find(r=>r.id===id)?.name||rows.find(r=>r.id===id)?.title||label||'Record no longer present');
}
function statusBadge(status){return '<span class="tf-revenue-status tf-revenue-'+status.toLowerCase().replace(/[^a-z]/g,'')+'">'+esc(status)+'</span>'}
let invoiceFilter='All';
function invoiceDisplayState(inv,payments,asOf=today()){
 const s=state(inv,payments);
 if(inv.status==='Issued'&&['Issued','Part-paid'].includes(s)&&inv.dueDate&&inv.dueDate<asOf)return 'Overdue';
 return s==='Issued'?'Unpaid':s;
}
function invoicesPage(d){
 const existing=d.invoices||[],payments=d.payments||[];
 if(mode==='edit')return editor(d);
 if(mode==='detail'){const current=existing.find(x=>x.id===invoiceId);if(current)return dossier(d,current);mode='list'}
 const outstanding=existing.filter(x=>x.status==='Issued').reduce((v,x)=>v+Math.max(0,totals(x).total-collected(x,payments)),0);
 const overdue=existing.filter(x=>invoiceDisplayState(x,payments)==='Overdue');
 const overdueValue=overdue.reduce((v,x)=>v+Math.max(0,totals(x).total-collected(x,payments)),0);
 const thisMonth=today().slice(0,7);
 const paidThisMonth=(payments||[]).filter(x=>(x.date||'').slice(0,7)===thisMonth&&x.invoiceId&&existing.some(i=>i.id===x.invoiceId)).reduce((v,x)=>v+Math.max(0,Number(x.amount)||0),0);
 const drafts=existing.filter(x=>state(x,payments)==='Draft');
 const draftValue=drafts.reduce((v,x)=>v+totals(x).total,0);
 const filtered=existing.filter(x=>invoiceFilter==='All'||invoiceDisplayState(x,payments)===invoiceFilter||
 (invoiceFilter==='Unpaid'&&['Part-paid','Overdue'].includes(invoiceDisplayState(x,payments))));
 const ordered=filtered.slice().sort((a,b)=>String(b.issuedDate||b.createdAt||'').localeCompare(String(a.issuedDate||a.createdAt||'')));
 const metric=(title,value,icon,color)=>'<div class="tf-inv-metric"><div class="tf-inv-metric-label"><span>'+title+'</span><span class="tf-inv-icon tf-inv-'+color+'">'+icon+'</span></div><strong>'+value+'</strong></div>';
 const invoiceIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>';
 const alertIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/></svg>';
 const paidIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16 9"/></svg>';
 const walletIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9V6a2 2 0 0 1 2-2h12m-1 10h5m-4 0h.01"/></svg>';
 let result='<section class="tf-revenue-page tf-invoices-v2">'+
  '<header class="tf-inv-heading"><div><span class="tf-inv-kicker">TRADEFLOW / FINANCE</span><h1>Invoices</h1><p>Track billing, payments and outstanding balances.</p></div><span class="tf-inv-heading-icon">'+invoiceIcon+'</span></header>'+
  '<div class="tf-inv-metrics">'+
  metric('Outstanding',money(outstanding),walletIcon,'cyan')+
  metric('Overdue',money(overdueValue),alertIcon,'amber')+
  metric('Paid this month',money(paidThisMonth),paidIcon,'green')+
  metric('Draft invoices',String(drafts.length),invoiceIcon,'muted')+'</div>';
 if(overdue.length||drafts.length)result+='<section class="tf-inv-attention"><div class="tf-inv-panel-head"><h2>Needs attention</h2><button type="button" data-revenue-action="attention">View all →</button></div>'+
  '<div class="tf-inv-attention-row"><span class="tf-inv-alert">⚠</span><div><strong>'+overdue.length+' invoice'+(overdue.length===1?'':'s')+' overdue</strong><small>Follow up on '+money(overdueValue)+' outstanding'+(drafts.length?' · '+drafts.length+' draft'+(drafts.length===1?'':'s')+' awaiting review':'')+'</small></div></div></section>';
 result+='<section class="tf-inv-records"><div class="tf-inv-panel-head"><h2>Invoices</h2><button type="button" data-revenue-action="filter" data-filter="All">See all</button></div>'+
 '<div class="tf-inv-filters" aria-label="Invoice status filters">'+['All','Draft','Unpaid','Overdue','Paid'].map(x=>
 '<button type="button" data-revenue-action="filter" data-filter="'+x+'" aria-pressed="'+(invoiceFilter===x)+'" class="'+(invoiceFilter===x?'active':'')+'">'+x+'</button>').join('')+'</div>';
 result+=ordered.length?'<div class="tf-inv-list">'+ordered.map(inv=>{
  const c=(d.customers||[]).find(x=>x.id===inv.customerId),status=invoiceDisplayState(inv,payments);
  const statusClass=status.toLowerCase().replace(/[^a-z]/g,'');
  const job=(d.jobs||[]).find(x=>x.id===inv.jobId);
  return '<button type="button" class="tf-inv-row" data-revenue-action="open" data-id="'+esc(inv.id)+'">'+
   '<span class="tf-inv-row-icon">'+invoiceIcon+'</span><span class="tf-inv-row-detail"><strong>'+esc(c?.name||'Customer unavailable')+'</strong>'+
   '<small>'+esc(inv.reference||inv.id)+(job?' · '+esc(job.title||'Job'):'')+' · <em class="tf-inv-status-'+statusClass+'">'+esc(status)+'</em></small></span>'+
   '<span class="tf-inv-row-amount">'+money(totals(inv).total)+'</span><span class="tf-inv-chevron">›</span></button>';
 }).join('')+'</div>':'<div class="tf-inv-empty"><strong>'+(existing.length?'No '+invoiceFilter.toLowerCase()+' invoices':'No invoices yet')+'</strong><p>'+(existing.length?'Choose another filter to see your records.':'Create a draft linked to a customer or job. Nothing is sent or charged automatically.')+'</p></div>';
 result+='</section><button class="tf-inv-create" type="button" data-revenue-action="new"><span>＋</span> Create new invoice</button>'+
 '<p class="tf-inv-disclaimer">Local financial records only. Issuing here is not a certified tax invoice, proof of sending, or payment confirmation. Values are recorded in USD.</p></section>';
 return result;
}
function defaultLine(inv){return Array.isArray(inv?.lines)&&inv.lines.length?inv.lines:[{description:'',qty:1,unitPrice:0}]}
function lineMarkup(line){
 return '<div class="tf-revenue-line"><label>Item / description<input name="lineDescription" required maxlength="160" placeholder="Electrical service" value="'+esc(line.description||'')+'"></label>'+
 '<div><label>Qty<input name="lineQty" type="number" required min=".01" max="100000" step=".01" value="'+esc(line.qty||1)+'"></label>'+
 '<label>Unit ($)<input name="linePrice" type="number" required min="0" max="100000000" step=".01" value="'+esc(line.unitPrice??0)+'"></label>'+
 '<button type="button" data-revenue-action="remove-line" title="Remove line" aria-label="Remove line">×</button></div></div>';
}
function editor(d){
 const linked=(d.jobs||[]).find(x=>x.id===draftFromJobId);
 const old=d.invoices.find(x=>x.id===invoiceId)|| (linked?{customerId:linked.customerId||'',jobId:linked.id,quoteId:linked.quoteId||'',lines:[{description:String(linked.title||'Completed work').slice(0,160),qty:1,unitPrice:0}],notes:'Review completed work, approved variations and applicable taxes before issuing.'}:{});
 if(old.id&&(old.status!=='Draft'||collected(old,d.payments)>0)){mode='detail';return dossier(d,old)}
 const clients=(d.customers||[]).map(x=>'<option value="'+esc(x.id)+'" '+(old.customerId===x.id?'selected':'')+'>'+esc(x.name||'Customer')+'</option>').join('');
 const jobs=(d.jobs||[]).map(x=>'<option value="'+esc(x.id)+'" '+(old.jobId===x.id?'selected':'')+'>'+esc(x.title||'Job')+'</option>').join('');
 const quote=(d.quotes||[]).map(x=>'<option value="'+esc(x.id)+'" '+(old.quoteId===x.id?'selected':'')+'>'+esc(x.title||'Quotation')+'</option>').join('');
 return '<div class="tf-revenue-page"><button type="button" class="tf-revenue-back" data-revenue-action="list">‹ All invoices</button>'+
 sectionHeading(old.id?'Edit invoice draft':'Create invoice draft','For your records. Issue, send and payment processing are distinct steps.')+
 '<form id="tfRevenueInvoiceForm" class="tf-revenue-card tf-revenue-form">'+
 '<label>Internal reference<input required maxlength="60" name="reference" value="'+esc(old.reference||('TF-'+today().replaceAll('-','')+'-'+Math.random().toString(36).slice(2,6).toUpperCase()))+'"></label>'+
 '<label>Customer<select required name="customerId"><option value="">Choose customer</option>'+clients+'</select></label>'+
 '<label>Related job (optional)<select name="jobId"><option value="">Not linked</option>'+jobs+'</select></label>'+
 '<label>Related quotation (optional)<select name="quoteId"><option value="">Not linked</option>'+quote+'</select></label>'+
 '<div class="tf-revenue-two"><label>Issue date<input type="date" required name="issuedDate" value="'+esc(old.issuedDate||today())+'"></label>'+
 '<label>Due date<input type="date" required name="dueDate" value="'+esc(old.dueDate||today())+'"></label></div>'+
 '<div class="tf-revenue-sectionhead"><h2>Line items</h2><button type="button" class="tf-revenue-secondary" data-revenue-action="add-line">+ Add line</button></div>'+
 '<div id="tfRevenueLines">'+defaultLine(old).map(lineMarkup).join('')+'</div>'+
 '<label>Tax rate (%)<input type="number" name="taxRate" min="0" max="100" step=".01" value="'+esc(old.taxRate??0)+'"></label>'+
 '<label>Notes<textarea name="notes" maxlength="1200" rows="3" placeholder="Payment terms or work summary">'+esc(old.notes||'')+'</textarea></label>'+
 '<p class="tf-revenue-warning">USD draft only. Tax rules, mandatory invoice fields, registration, jurisdiction and compliant numbering must be verified before using this for actual customers.</p>'+
 '<div class="tf-revenue-actions"><button class="tf-revenue-primary" type="submit">Save draft</button><button class="tf-revenue-secondary" type="button" data-revenue-action="list">Cancel</button></div></form></div>';
}
function dossier(d,inv){
 const paid=collected(inv,d.payments),sum=totals(inv),status=state(inv,d.payments),remaining=Math.max(0,Math.round((sum.total-paid)*100)/100);
 const customer=d.customers.find(x=>x.id===inv.customerId);
 const entries=(d.payments||[]).filter(x=>x.invoiceId===inv.id);
 const canRecord=inv.status==='Issued'&&remaining>.005;
 const pendingFollowUp=(d.tasks||[]).some(t=>t.invoiceId===inv.id&&!['done','completed','cancelled','canceled'].includes(String(t.status||'').toLowerCase()));
 const email=String(customer?.email||'').trim();
 const safeEmail=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
 const body='Invoice '+(inv.reference||inv.id)+'\nAmount: '+money(sum.total)+'\nDue: '+(inv.dueDate||'Not specified')+'\nBalance: '+money(remaining)+'\nPlease contact us for payment instructions.';
 const subject='Invoice '+(inv.reference||inv.id);
 return '<div class="tf-revenue-page"><button class="tf-revenue-back" type="button" data-revenue-action="list">‹ All invoices</button>'+
 sectionHeading('Invoice '+(inv.reference||''),'Status and recorded transactions — local records only.')+
 topNav('invoices')+
 '<section class="tf-revenue-card"><div class="tf-revenue-dossier-head"><div><span class="tf-revenue-kicker">INVOICE SUMMARY</span><h2>'+money(sum.total)+'</h2></div>'+statusBadge(status)+'</div>'+
 '<div class="tf-revenue-facts"><span>Customer</span><strong>'+esc(customer?.name||'Customer missing')+'</strong><span>Issue date</span><strong>'+esc(inv.issuedDate)+'</strong><span>Due date</span><strong>'+esc(inv.dueDate)+'</strong>'+
 '<span>Related job</span><strong>'+relatedName(inv.jobId,d.jobs,'No job')+'</strong></div>'+
 '<div class="tf-revenue-invoice-lines">'+(inv.lines||[]).map(x=>'<div><span>'+esc(x.description)+' · '+esc(x.qty)+' × '+money(x.unitPrice)+'</span><strong>'+money(Math.round(cents(x.unitPrice)*Number(x.qty))/100)+'</strong></div>').join('')+
 '<div><span>Subtotal</span><strong>'+money(sum.subtotal)+'</strong></div><div><span>Tax ('+esc(inv.taxRate)+'%)</span><strong>'+money(sum.tax)+'</strong></div><div class="total"><span>Total</span><strong>'+money(sum.total)+'</strong></div></div>'+
 (inv.notes?'<p class="tf-revenue-notes">'+esc(inv.notes)+'</p>':'')+
 '<div class="tf-revenue-summary"><span>Manually recorded payments</span><strong>'+money(paid)+'</strong><span>Outstanding</span><strong>'+money(remaining)+'</strong></div>'+
 '<div class="tf-revenue-actions">'+
 (inv.status==='Draft'?'<button type="button" class="tf-revenue-secondary" data-revenue-action="edit" data-id="'+esc(inv.id)+'">Edit draft</button><button type="button" class="tf-revenue-primary" data-revenue-action="issue" data-id="'+esc(inv.id)+'">Mark as issued</button>':'')+
 (canRecord?'<button type="button" class="tf-revenue-primary" data-revenue-action="record" data-id="'+esc(inv.id)+'">Record received payment</button>':'')+
 (canRecord&&!pendingFollowUp?'<button type="button" class="tf-revenue-secondary" data-revenue-action="followup" data-id="'+esc(inv.id)+'">Schedule payment follow-up</button>':canRecord?'<span class="tf-revenue-warning">An open follow-up task already exists for this invoice.</span>':'')+
 (safeEmail?'<a class="tf-revenue-secondary" href="mailto:'+encodeURIComponent(email)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body)+'">Prepare email ↗</a>':'')+
 '<button type="button" class="tf-revenue-secondary" data-revenue-action="print">Print / Save PDF</button>'+
 (inv.status==='Draft'||inv.status==='Issued'&&paid===0?'<button type="button" class="tf-revenue-danger" data-revenue-action="void" data-id="'+esc(inv.id)+'">Void invoice</button>':'')+
 '</div></section>'+
 (mode==='payment'?'': '')+
 (entries.length?'<section class="tf-revenue-card"><h3>Recorded payments</h3>'+entries.map(x=>'<div class="tf-revenue-payment"><span>'+esc(x.date)+' · '+esc(x.method||'Manual')+'</span><strong>'+money(x.amount)+'</strong></div>').join('')+'</section>':'')+
 '<p class="tf-revenue-warning">“Issued” means marked in TradeFlow, not delivered or accepted by an external invoicing service. “Paid” is based only on manually recorded payments, not bank or card verification. Local invoices are not certified tax documents.</p></div>';
}
function paymentForm(d,inv){
 const remaining=Math.max(0,Math.round((totals(inv).total-collected(inv,d.payments))*100)/100);
 return '<div class="tf-revenue-page"><button type="button" class="tf-revenue-back" data-revenue-action="open" data-id="'+esc(inv.id)+'">‹ Invoice</button>'+
 sectionHeading('Record payment','Enter a payment you have actually received and verified outside TradeFlow.')+
 '<form id="tfRevenuePaymentForm" data-id="'+esc(inv.id)+'" class="tf-revenue-card tf-revenue-form">'+
 '<p>Outstanding: <strong>'+money(remaining)+'</strong></p>'+
 '<label>Amount ($)<input name="amount" type="number" required min=".01" max="'+esc(remaining)+'" step=".01" value="'+esc(remaining)+'"></label>'+
 '<label>Date received<input name="date" type="date" required value="'+today()+'"></label>'+
 '<label>Method<select name="method"><option>Bank transfer</option><option>Cash</option><option>Card paid externally</option><option>Other verified method</option></select></label>'+
 '<p class="tf-revenue-warning">Only record money genuinely received. This form does not initiate or verify transfers.</p>'+
 '<button class="tf-revenue-primary" type="submit">Record received payment</button></form></div>';
}

let jobCostFilter='Active',jobCostQuery='',costFormOpen=false;
const value=n=>Number.isFinite(Number(n))?Number(n):0;
const costKinds=['Labor','Materials','Subcontractors','Equipment','Permits','Transport','Overhead','Other'];
function jobSummary(job,d){
 const cost=(d.jobCosts||[]).filter(x=>x.jobId===job.id),expense=(d.expenses||[]).filter(x=>x.jobId===job.id||x.relatedId===job.id);
 const budget=cost.filter(x=>x.type==='estimate').reduce((v,x)=>v+Math.max(0,value(x.amount)),0);
 const actualManual=cost.filter(x=>x.type==='actual').reduce((v,x)=>v+Math.max(0,value(x.amount)),0);
 const actualFinance=expense.reduce((v,x)=>v+Math.max(0,value(x.amount)),0);
 const actual=actualManual+actualFinance;
 const jobOrders=(d.supplyOrders||[]).filter(x=>x.jobId===job.id&&x.documentStatus==='Issued'&&x.deliveryStatus!=='Cancelled'&&x.status!=='Cancelled');
 const committed=jobOrders.reduce((v,x)=>v+Math.max(0,value(x.total)),0);
 const quote=(d.quotes||[]).find(x=>x.id===job.quoteId),contract=value(job.contractValue)||value(quote?.amount);
 const invoices=(d.invoices||[]).filter(x=>x.jobId===job.id&&x.status!=='Void');
 const invoiceIds=new Set(invoices.map(x=>x.id));
 const billed=invoices.filter(x=>x.status==='Issued').reduce((v,x)=>v+totals(x).total,0);
 const receipts=(d.payments||[]).filter(p=>p.invoiceId?invoiceIds.has(p.invoiceId):p.jobId===job.id||p.relatedId===job.id).reduce((v,x)=>v+value(x.amount),0);
 const risk=budget>0&&actual>budget;
 const categories={};
 for(const x of cost.filter(x=>x.type==='actual'))categories[x.category||'Other']=(categories[x.category||'Other']||0)+value(x.amount);
 for(const x of expense)categories[x.category||'Other']=(categories[x.category||'Other']||0)+value(x.amount);
 return {job,cost,expense,budget,actual,actualManual,actualFinance,committed,jobOrders,contract,billed,receipts,risk,categories,
   cashContribution:receipts-actual,remainingBudget:budget>0?budget-actual:null,
   provisionalMargin:contract>0?(contract-actual)/contract*100:null,
   forecast:null};
}
function costIcon(path){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>'}
function jobCostOverview(d){
 const jobs=d.jobs||[],summaries=jobs.map(j=>jobSummary(j,d));
 const active=summaries.filter(x=>!['Completed','Cancelled','Canceled'].includes(x.job.status||''));
 const budgeted=active.filter(x=>x.budget>0),budgetTotal=budgeted.reduce((s,x)=>s+x.budget,0),spentBudgeted=budgeted.reduce((s,x)=>s+x.actual,0);
 const riskCount=active.filter(x=>x.risk).length;
 const contractTotal=active.reduce((s,x)=>s+x.contract,0),actualTotal=active.reduce((s,x)=>s+x.actual,0);
 const selected=summaries.filter(x=>(jobCostFilter==='All'||jobCostFilter==='Active'&&!['Completed','Cancelled','Canceled'].includes(x.job.status||'')||
 jobCostFilter==='At risk'&&x.risk||jobCostFilter==='Completed'&&x.job.status==='Completed')&&
 (x.job.title||'').toLowerCase().includes(jobCostQuery.toLowerCase()));
 const iconChart=costIcon('<path d="M3 3v18h18M7 17v-5m5 5V7m5 10V5"/>');
 const iconWallet=costIcon('<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M16 14h5"/>');
 const iconAlert=costIcon('<path d="m12 3 10 18H2L12 3Z"/><path d="M12 10v4m0 3h.01"/>');
 const iconJobs=costIcon('<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 13h18"/>');
 const tile=(label,num,icon,style,sub)=>'<div class="tf-jc-tile"><div class="tf-jc-tile-label"><span>'+label+'</span><span class="tf-jc-icon tf-jc-'+style+'">'+icon+'</span></div><strong>'+num+'</strong><small>'+sub+'</small></div>';
 const percent=budgetTotal>0?Math.min(100,spentBudgeted/budgetTotal*100):0;
 let out='<section class="tf-revenue-page tf-jc-v2"><header class="tf-jc-heading"><div><span class="tf-jc-kicker">TRADEFLOW / FINANCE</span><h1>Job Costing</h1><p>Budgets, recorded spending and job-level cash performance.</p></div><span class="tf-jc-heading-icon">'+iconChart+'</span></header>'+topNav('profitability')+
 '<div class="tf-jc-metrics">'+tile('Active job value',money(contractTotal),iconJobs,'cyan','Linked contract / quote values')+
 tile('Recorded costs',money(actualTotal),iconWallet,'teal','Active jobs · known costs only')+
 tile('Budget coverage',budgeted.length+' / '+active.length,iconChart,'green','Active jobs with estimates')+
 tile('Jobs over budget',String(riskCount),iconAlert,riskCount?'amber':'green','Recorded costs exceed budget')+'</div>'+
 '<section class="tf-jc-panel"><div class="tf-jc-panel-head"><h2>Budget vs. actual</h2><span>Recorded</span></div>'+
 '<div class="tf-jc-chart-numbers"><div><small>ESTIMATED BUDGET</small><strong>'+money(budgetTotal)+'</strong></div><div><small>ACTUAL COSTS</small><strong>'+money(spentBudgeted)+'</strong></div></div>'+
 '<div class="tf-jc-track" role="progressbar" aria-label="Budget consumed" aria-valuenow="'+Math.round(percent)+'" aria-valuemin="0" aria-valuemax="100"><div style="width:'+percent+'%"></div></div>'+
 '<p>'+ (budgeted.length?Math.round(spentBudgeted/budgetTotal*100)+'% of the budgets with estimates has been spent.':'Add planned costs to see meaningful budget comparisons.')+
 ' Figures exclude jobs without budgets and do not estimate unfinished work.</p></section>'+
 '<section class="tf-jc-panel"><div class="tf-jc-panel-head"><h2>Active jobs</h2><span>'+selected.length+' shown</span></div>'+
 '<div class="tf-jc-filters">'+['Active','All','At risk','Completed'].map(x=>'<button type="button" data-revenue-action="cost-filter" data-filter="'+x+'" class="'+(jobCostFilter===x?'active':'')+'" aria-pressed="'+(jobCostFilter===x)+'">'+x+'</button>').join('')+'</div>'+
 '<label class="tf-jc-search-label">Find a job<input type="search" id="tfJobCostSearch" placeholder="Search job name" value="'+esc(jobCostQuery)+'" autocomplete="off"></label>'+
 (selected.length?'<div class="tf-jc-job-list">'+selected.sort((a,b)=>Number(b.risk)-Number(a.risk)).slice(0,80).map(x=>{
 const covered=x.budget>0,ratio=covered?Math.min(100,x.actual/x.budget*100):0;
 return '<button class="tf-jc-job-row" data-revenue-action="job" data-id="'+esc(x.job.id)+'" type="button"><div class="tf-jc-job-top"><span><strong>'+esc(x.job.title||'Untitled job')+'</strong><small>'+esc((d.customers||[]).find(c=>c.id===x.job.customerId)?.name||'Customer not linked')+' · '+esc(x.job.status||'Unscheduled')+'</small></span><span class="tf-jc-risk '+(x.risk?'over':'')+'">'+(x.risk?'Over budget':covered?'Budget tracked':'Incomplete')+'</span></div>'+
 '<div class="tf-jc-job-values"><span><small>Budget</small><strong>'+(covered?money(x.budget):'Not set')+'</strong></span><span><small>Spent</small><strong>'+money(x.actual)+'</strong></span><span><small>Remaining</small><strong>'+(covered?money(x.remainingBudget):'—')+'</strong></span></div>'+
 '<div class="tf-jc-track slim"><div class="'+(x.risk?'over':'')+'" style="width:'+ratio+'%"></div></div>'+
 '<div class="tf-jc-job-footer"><span>'+x.jobOrders.length+' linked issued PO'+(x.jobOrders.length===1?'':'s')+'</span><span>Review job →</span></div></button>';
 }).join('')+'</div>':'<div class="tf-jc-empty">'+(jobs.length?'No jobs match this filter.':'No jobs yet. Create your first job to begin tracking its costs.')+'</div>')+
 '</section><button class="tf-jc-primary" type="button" data-revenue-action="cost-quick">＋ Select job to add cost</button>'+
 '<p class="tf-jc-footnote">All figures reflect local records. Commitments from issued purchase orders are displayed separately in job detail; they are not treated as paid costs. No profit forecast is asserted without remaining-cost estimates.</p></section>';
 return out;
}
function jobCostDetail(d,selected){
 const x=jobSummary(selected,d),entries=x.cost,actualEntries=entries.filter(c=>c.type==='actual');
 const breakdown=Object.entries(x.categories).sort((a,b)=>b[1]-a[1]);
 const covered=x.budget>0,ratio=covered?Math.min(100,x.actual/x.budget*100):0;
 return '<section class="tf-revenue-page tf-jc-v2"><button type="button" class="tf-revenue-back" data-revenue-action="job-back">‹ Job costing</button>'+
 '<header class="tf-jc-heading"><div><span class="tf-jc-kicker">JOB FINANCIAL DOSSIER</span><h1>'+esc(selected.title||'Job')+'</h1><p>'+esc(selected.status||'Unscheduled')+' · '+esc((d.customers||[]).find(c=>c.id===selected.customerId)?.name||'No customer')+'</p></div></header>'+
 '<div class="tf-jc-metrics">'+
 '<div class="tf-jc-tile"><div class="tf-jc-tile-label">Contract / quote</div><strong>'+money(x.contract)+'</strong><small>'+(x.contract?'Linked value':'Not specified')+'</small></div>'+
 '<div class="tf-jc-tile"><div class="tf-jc-tile-label">Cost budget</div><strong>'+(covered?money(x.budget):'Not set')+'</strong><small>Planned cost entries</small></div>'+
 '<div class="tf-jc-tile"><div class="tf-jc-tile-label">Actual cost</div><strong>'+money(x.actual)+'</strong><small>Manual costs + Finance expenses</small></div>'+
 '<div class="tf-jc-tile"><div class="tf-jc-tile-label">Committed POs</div><strong>'+money(x.committed)+'</strong><small>May overlap recorded costs</small></div></div>'+
 '<section class="tf-jc-panel"><div class="tf-jc-panel-head"><h2>Cost control</h2><span>'+(covered?(x.risk?'Over budget':'Within recorded budget'):'Budget missing')+'</span></div>'+
 '<div class="tf-jc-chart-numbers"><div><small>REMAINING BUDGET</small><strong>'+(covered?money(x.remainingBudget):'—')+'</strong></div><div><small>BUDGET USED</small><strong>'+(covered?Math.round(x.actual/x.budget*100)+'%':'—')+'</strong></div></div>'+
 '<div class="tf-jc-track"><div class="'+(x.risk?'over':'')+'" style="width:'+ratio+'%"></div></div>'+
 '<p>Cost-to-complete is not recorded yet. Remaining budget is not a profit forecast. Committed POs are shown separately to avoid counting unreceived purchases as expenses.</p></section>'+
 '<section class="tf-jc-panel"><div class="tf-jc-panel-head"><h2>Billing & cash</h2><span>Linked records</span></div>'+
 '<div class="tf-jc-chart-numbers"><div><small>INVOICED</small><strong>'+money(x.billed)+'</strong></div><div><small>CASH RECEIVED</small><strong>'+money(x.receipts)+'</strong></div></div>'+
 '<div class="tf-jc-chart-numbers"><div><small>RECORDED COSTS</small><strong>'+money(x.actual)+'</strong></div><div><small>CASH CONTRIBUTION</small><strong>'+money(x.cashContribution)+'</strong></div></div>'+
 '<p>Cash contribution excludes unrecorded payroll, overhead, taxes and pending costs. It is not final profit.</p></section>'+
 '<section class="tf-jc-panel"><div class="tf-jc-panel-head"><h2>Cost categories</h2><span>'+breakdown.length+' tracked</span></div>'+
 (breakdown.length?breakdown.map(([name,amount])=>'<div class="tf-jc-category"><span>'+esc(name)+'</span><strong>'+money(amount)+'</strong></div>').join(''):'<p>No actual costs recorded in this job yet.</p>')+'</section>'+
 '<section class="tf-jc-panel"><div class="tf-jc-panel-head"><h2>Cost entries</h2><button data-revenue-action="cost-toggle" type="button">'+(costFormOpen?'Close form':'+ Add cost')+'</button></div>'+
 (costFormOpen?'<form id="tfRevenueCostForm" data-id="'+esc(selected.id)+'" class="tf-revenue-form tf-jc-form">'+
 '<label>Cost description<input name="title" maxlength="150" required placeholder="4 hours field labor, cable, permit"></label>'+
 '<div class="tf-revenue-two"><label>Amount ($)<input name="amount" type="number" min=".01" max="100000000" step=".01" required></label>'+
 '<label>Record type<select name="type"><option value="actual">Actual cost</option><option value="estimate">Planned budget</option></select></label></div>'+
 '<label>Cost category<select name="category">'+costKinds.map(k=>'<option>'+k+'</option>').join('')+'</select></label>'+
 '<label>Labor hours (optional; Labor category only)<input name="laborHours" type="number" min="0.25" max="10000" step="0.25" placeholder="e.g. 8.5"></label>'+
 '<p class="tf-jc-footnote">Do not duplicate Finance expenses or supplier bills already recorded for this job.</p>'+
 '<button class="tf-jc-primary" type="submit">Save cost entry</button></form>':'')+
 (entries.length?entries.slice().reverse().map(c=>'<div class="tf-jc-entry"><span><strong>'+esc(c.title)+'</strong><small>'+esc(c.type==='estimate'?'Budget':'Actual')+' · '+esc(c.category||'Other')+'</small></span><span><strong>'+money(c.amount)+'</strong><button type="button" data-revenue-action="remove-cost" data-id="'+esc(c.id)+'" class="tf-revenue-textdanger">Remove</button></span></div>').join(''):'<p>No manual cost entries yet.</p>')+'</section>'+
 (x.expense.length?'<section class="tf-jc-panel"><div class="tf-jc-panel-head"><h2>Linked Finance expenses</h2><span>'+x.expense.length+'</span></div>'+x.expense.map(e=>'<div class="tf-jc-category"><span>'+esc(e.title||e.vendor||e.category||'Expense')+'</span><strong>'+money(e.amount)+'</strong></div>').join('')+'</section>':'')+
 (x.jobOrders.length?'<section class="tf-jc-panel"><div class="tf-jc-panel-head"><h2>Issued purchase orders</h2><span>'+x.jobOrders.length+'</span></div>'+x.jobOrders.map(o=>'<div class="tf-jc-category"><span>'+esc(o.poNumber||'Purchase order')+'</span><strong>'+money(o.total)+'</strong></div>').join('')+'<p>Orders are commitments, not evidence of payment or expense recognition.</p></section>':'')+
 '<button class="tf-jc-secondary" type="button" data-revenue-action="cost-csv" data-id="'+esc(selected.id)+'">Export job costs CSV</button></section>';
}
function profitPage(d){
 const selected=(d.jobs||[]).find(x=>x.id===jobId);
 return selected?jobCostDetail(d,selected):jobCostOverview(d);
}
function view(tab,d){
 if(tab==='invoices'){
  if(mode==='payment'){let inv=d.invoices.find(x=>x.id===invoiceId);if(inv)return paymentForm(d,inv);mode='list'}
  return invoicesPage(d);
 }
 if(tab==='profitability')return profitPage(d);
 return '';
}
function nav(t){if(api?.navigate)api.navigate(t)}
function newInvoice(){mode='edit';invoiceId='';draftFromJobId='';api?.render()}
function newForJob(id){if(typeof id!=='string'||!id.trim())throw Error('A saved job is required');mode='edit';invoiceId='';draftFromJobId=id;api?.render()}
function parseLines(form){
 const descriptions=[...form.querySelectorAll('[name=lineDescription]')],qtys=[...form.querySelectorAll('[name=lineQty]')],prices=[...form.querySelectorAll('[name=linePrice]')];
 if(!descriptions.length||descriptions.length>12||qtys.length!==descriptions.length||prices.length!==descriptions.length)throw Error('Use 1–12 invoice line items.');
 return descriptions.map((control,i)=>{
  const description=trim(control.value,160),qty=Number(qtys[i].value),unitPrice=Number(prices[i].value);
  if(!description||!Number.isFinite(qty)||qty<=0||qty>100000||!Number.isFinite(unitPrice)||unitPrice<0||unitPrice>100000000||
     Math.abs(Math.round(qty*100)-qty*100)>1e-6||Math.abs(Math.round(unitPrice*100)-unitPrice*100)>1e-6)
   throw Error('Check line '+(i+1)+': description, quantity and price (up to two decimals).');
  return {description,qty,unitPrice};
 });
}
async function onSubmit(event){
 if(!api)return;
 const form=event.target;
 if(!['tfRevenueInvoiceForm','tfRevenuePaymentForm','tfRevenueCostForm'].includes(form.id))return;
 event.preventDefault();
 try{
  const fd=new FormData(form);
  if(form.id==='tfRevenueInvoiceForm'){
   const customers=await api.all('customers'),jobs=await api.all('jobs'),quotes=await api.all('quotes'),prior=invoiceId?await api.get('invoices',invoiceId):null;
   if(prior&&(prior.status!=='Draft'||(await api.all('payments')).some(x=>x.invoiceId===prior.id)))throw Error('Only unpaid drafts can be edited.');
   const customerId=trim(fd.get('customerId'),120),jobId=trim(fd.get('jobId'),120),quoteId=trim(fd.get('quoteId'),120);
   if(!customers.some(x=>x.id===customerId))throw Error('Choose a saved customer.');
   if(jobId&&!jobs.some(x=>x.id===jobId&&x.customerId===customerId))throw Error('Linked job must belong to this customer.');
   if(quoteId&&!quotes.some(x=>x.id===quoteId&&x.customerId===customerId))throw Error('Linked quotation must belong to this customer.');
   const issuedDate=trim(fd.get('issuedDate'),10),dueDate=trim(fd.get('dueDate'),10);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(issuedDate)||!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||dueDate<issuedDate)throw Error('Check issue and due dates.');
   const taxRate=Number(fd.get('taxRate'));if(!Number.isFinite(taxRate)||taxRate<0||taxRate>100)throw Error('Tax rate must be between 0 and 100%.');
   const reference=trim(fd.get('reference'),60);
   if(!reference)throw Error('Invoice reference is required.');
   const existing=await api.all('invoices');
   if(existing.some(x=>x.id!==prior?.id&&x.reference?.toLowerCase()===reference.toLowerCase()))throw Error('Invoice reference must be unique.');
   const lines=parseLines(form);
   const inv={...prior,id:prior?.id||api.uid(),reference,customerId,jobId,quoteId,issuedDate,dueDate,taxRate,
      lines,notes:trim(fd.get('notes'),1200),status:'Draft',currency:'USD',updatedAt:new Date().toISOString(),createdAt:prior?.createdAt||new Date().toISOString()};
   if(totals(inv).total<=0||totals(inv).total>1e9)throw Error('Invoice total must be positive and within the supported range.');
   await api.put('invoices',inv);invoiceId=inv.id;draftFromJobId='';mode='detail';api.notify('Invoice draft saved');
  }else if(form.id==='tfRevenuePaymentForm'){
   const inv=await api.get('invoices',form.dataset.id);
   if(!inv||inv.status!=='Issued')throw Error('Only issued invoices can receive recorded payments.');
   const payments=await api.all('payments'),remaining=totals(inv).total-collected(inv,payments),amount=Number(fd.get('amount'));
   if(!Number.isFinite(amount)||amount<.01||amount>remaining+.004||Math.abs(Math.round(amount*100)-amount*100)>1e-6)throw Error('Amount exceeds the unpaid balance or is invalid.');
   const date=trim(fd.get('date'),10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Valid payment date required.');
   const customer=await api.get('customers',inv.customerId);
   await api.put('payments',{id:api.uid(),amount:Math.round(amount*100)/100,date,method:trim(fd.get('method'),80),
      source:customer?.name||'Invoice payment',customerId:inv.customerId,invoiceId:inv.id,jobId:inv.jobId||'',
      title:'Invoice payment',trade:'',currency:'USD',updatedAt:new Date().toISOString(),manual:true});
   invoiceId=inv.id;mode='detail';api.notify('Manual payment recorded');
  }else if(form.id==='tfRevenueCostForm'){
   const job=await api.get('jobs',form.dataset.id);if(!job)throw Error('Job not found.');
   const amount=Number(fd.get('amount'));if(!Number.isFinite(amount)||amount<=0||amount>100000000||
    Math.abs(Math.round(amount*100)-amount*100)>1e-6)throw Error('Enter a valid amount with two decimals.');
   const type=trim(fd.get('type'),20);if(!['estimate','actual'].includes(type))throw Error('Invalid cost classification.');
   const title=trim(fd.get('title'),150);if(!title)throw Error('Cost description is required.');
   const category=trim(fd.get('category'),80),rawHours=String(fd.get('laborHours')||'').trim();
   const laborHours=rawHours===''?null:Number(rawHours);
   if(rawHours!==''&&(category!=='Labor'||!Number.isFinite(laborHours)||laborHours<0.25||laborHours>10000||Math.abs(laborHours*4-Math.round(laborHours*4))>1e-6))throw Error('Labor hours require Labor category and quarter-hour increments.');
   await api.put('jobCosts',{id:api.uid(),jobId:job.id,title,amount:Math.round(amount*100)/100,
      type,category,...(laborHours!==null?{laborHours}:{}),createdAt:new Date().toISOString()});
   costFormOpen=false;api.notify('Job cost saved');
  }
 }catch(err){alert('Could not save: '+err.message)}
}
async function onClick(event){
 if(!api)return;
 const b=event.target.closest?.('[data-revenue-action]');if(!b)return;
 event.preventDefault();
 const a=b.dataset.revenueAction,id=b.dataset.id;
 try{
 if(a==='filter'){invoiceFilter=b.dataset.filter||'All';api.render();return}
 if(a==='attention'){invoiceFilter='Overdue';mode='list';api.render();return}
 if(a==='new'){newInvoice();return}
 if(a==='list'){mode='list';invoiceId='';draftFromJobId='';api.render();return}
 if(a==='open'){mode='detail';invoiceId=id;api.render();return}
 if(a==='edit'){mode='edit';invoiceId=id;api.render();return}
 if(a==='add-line'){
  const host=document.getElementById('tfRevenueLines');
  if(host&&host.children.length<12)host.insertAdjacentHTML('beforeend',lineMarkup({qty:1,unitPrice:0}));
  return;
 }
 if(a==='remove-line'){
  const host=document.getElementById('tfRevenueLines');if(host&&host.children.length>1)b.closest('.tf-revenue-line')?.remove();return;
 }
 if(a==='issue'){
  const inv=await api.get('invoices',id);if(!inv||inv.status!=='Draft')return;
  if(!confirm('Mark this draft as issued? This does not send it to the customer or establish legal tax-invoice compliance.'))return;
  inv.status='Issued';inv.issuedAt=new Date().toISOString();await api.put('invoices',inv);api.notify('Marked as issued locally');return;
 }
 if(a==='void'){
  const inv=await api.get('invoices',id);if(!inv||collected(inv,await api.all('payments'))>0)return;
  if(!confirm('Void this invoice? The record will remain for your audit trail.'))return;
  inv.status='Void';inv.voidedAt=new Date().toISOString();await api.put('invoices',inv);api.notify('Invoice voided');return;
 }
 if(a==='followup'){
  const inv=await api.get('invoices',id);
  if(!inv||inv.status!=='Issued')throw Error('Only issued invoices can be reviewed for collection follow-up.');
  const date=new Date();date.setDate(date.getDate()+3);
  const due=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  if(typeof api.scheduleInvoiceFollowup!=='function')throw Error('Approved invoice workflow is unavailable.');
  const result=await api.scheduleInvoiceFollowup(inv,due);
  if(result?.status==='succeeded')api.notify(result.result?.reused?'Existing invoice follow-up task verified':'Internal invoice follow-up task recorded. No message was sent.');
  else if(result?.status==='indeterminate'||result?.status==='in_progress')
   api.notify('Invoice follow-up outcome uncertain. Review the audit before retrying.');
  return;
 }
 if(a==='record'){mode='payment';invoiceId=id;api.render();return}
 if(a==='print'){window.print?.();return}
 if(a==='cost-filter'){jobCostFilter=b.dataset.filter||'Active';api.render();return}
 if(a==='cost-toggle'){costFormOpen=!costFormOpen;api.render();return}
 if(a==='cost-quick'){jobCostFilter='All';api.render();return}
 if(a==='cost-csv'){const job=await api.get('jobs',id);if(!job)return;const costs=(await api.all('jobCosts')).filter(x=>x.jobId===id);const expenses=(await api.all('expenses')).filter(x=>x.jobId===id||x.relatedId===id);const cell=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';const rows=[['Source','Title','Type','Category','Amount USD'],...costs.map(x=>['Job Cost',x.title,x.type,x.category,x.amount]),...expenses.map(x=>['Finance',x.title||x.vendor||'Expense','actual',x.category,x.amount])];const blob=new Blob([rows.map(x=>x.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const link=URL.createObjectURL(blob),el=document.createElement('a');el.href=link;el.download='tradeflow-job-costs-'+id+'.csv';document.body.appendChild(el);el.click();el.remove();setTimeout(()=>URL.revokeObjectURL(link),1000);return}
 if(a==='job'){jobId=id;api.render();return}
 if(a==='job-back'){jobId='';costFormOpen=false;api.render();return}
 if(a==='remove-cost'){
  const cost=await api.get('jobCosts',id);if(!cost||!confirm('Delete this local job cost entry?'))return;
  await api.del('jobCosts',id);api.notify('Job cost removed');return;
 }
 }catch(err){alert('Could not complete action: '+err.message)}
}
function init(bridge){
 api=bridge;document.addEventListener('submit',onSubmit);document.addEventListener('click',onClick);
}
document.addEventListener('change',event=>{if(event.target?.id==='tfJobCostSearch'){jobCostQuery=trim(event.target.value,100);api?.render()}});
global.TradeFlowRevenue={configure:init,render:view,financials:Object.freeze({totals,collected,state,displayState:invoiceDisplayState}),
 focusRecord:id=>{mode='detail';invoiceId=id;draftFromJobId=''},newForJob,currentRecord:()=>invoiceId&&mode==='detail'?{store:'invoices',id:invoiceId}:null,
 filterView:value=>{if(!['All','Overdue','Unpaid','Draft'].includes(value))throw Error('Unsupported invoice filter');invoiceFilter=value;mode='list';invoiceId=''},_test:{totals,collected,state,esc,parseLines,jobSummary}};
})(typeof window!=='undefined'?window:globalThis);
