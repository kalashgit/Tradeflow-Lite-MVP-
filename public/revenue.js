/* TradeFlow Revenue Release 03 — offline invoice drafts and job-cost review.
   No tax-invoice compliance assertion, external send, bank connection or payment processing. */
(function(global){
'use strict';
let api=null,mode='list',invoiceId='',jobId='';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const trim=(v,n=200)=>String(v==null?'':v).trim().slice(0,n);
const cents=n=>Math.round(Number(n)*100);
const money=n=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(Number(n)||0);
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
 '<button type="button" data-tab="profitability" class="'+(type==='profitability'?'active':'')+'">Job costs</button>'+
 '<button type="button" data-tab="expenses">Finance ↗</button></nav>';
}
function relatedName(id,rows,label){
 if(!id)return 'None';return esc(rows.find(r=>r.id===id)?.name||rows.find(r=>r.id===id)?.title||label||'Record no longer present');
}
function statusBadge(status){return '<span class="tf-revenue-status tf-revenue-'+status.toLowerCase().replace(/[^a-z]/g,'')+'">'+esc(status)+'</span>'}
let invoiceFilter='All';
function invoiceDisplayState(inv,payments){
 const s=state(inv,payments);
 if(s==='Issued'&&inv.dueDate&&inv.dueDate<today())return 'Overdue';
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
 (invoiceFilter==='Unpaid'&&invoiceDisplayState(x,payments)==='Part-paid'));
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
 '<p class="tf-inv-disclaimer">Local financial records only. Issuing here is not a certified tax invoice, proof of sending, or payment confirmation. Values are recorded in EUR.</p></section>';
 return result;
}
function defaultLine(inv){return Array.isArray(inv?.lines)&&inv.lines.length?inv.lines:[{description:'',qty:1,unitPrice:0}]}
function lineMarkup(line){
 return '<div class="tf-revenue-line"><label>Item / description<input name="lineDescription" required maxlength="160" placeholder="Electrical service" value="'+esc(line.description||'')+'"></label>'+
 '<div><label>Qty<input name="lineQty" type="number" required min=".01" max="100000" step=".01" value="'+esc(line.qty||1)+'"></label>'+
 '<label>Unit (€)<input name="linePrice" type="number" required min="0" max="100000000" step=".01" value="'+esc(line.unitPrice??0)+'"></label>'+
 '<button type="button" data-revenue-action="remove-line" title="Remove line" aria-label="Remove line">×</button></div></div>';
}
function editor(d){
 const old=d.invoices.find(x=>x.id===invoiceId)||{};
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
 '<p class="tf-revenue-warning">EUR draft only. Tax rules, mandatory invoice fields, registration, jurisdiction and compliant numbering must be verified before using this for actual customers.</p>'+
 '<div class="tf-revenue-actions"><button class="tf-revenue-primary" type="submit">Save draft</button><button class="tf-revenue-secondary" type="button" data-revenue-action="list">Cancel</button></div></form></div>';
}
function dossier(d,inv){
 const paid=collected(inv,d.payments),sum=totals(inv),status=state(inv,d.payments),remaining=Math.max(0,Math.round((sum.total-paid)*100)/100);
 const customer=d.customers.find(x=>x.id===inv.customerId);
 const entries=(d.payments||[]).filter(x=>x.invoiceId===inv.id);
 const canRecord=inv.status==='Issued'&&remaining>.005;
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
 '<label>Amount (€)<input name="amount" type="number" required min=".01" max="'+esc(remaining)+'" step=".01" value="'+esc(remaining)+'"></label>'+
 '<label>Date received<input name="date" type="date" required value="'+today()+'"></label>'+
 '<label>Method<select name="method"><option>Bank transfer</option><option>Cash</option><option>Card paid externally</option><option>Other verified method</option></select></label>'+
 '<p class="tf-revenue-warning">Only record money genuinely received. This form does not initiate or verify transfers.</p>'+
 '<button class="tf-revenue-primary" type="submit">Record received payment</button></form></div>';
}
function profitPage(d){
 const jobs=(d.jobs||[]),selected=jobs.find(x=>x.id===jobId),linked=d.jobCosts||[],expenses=d.expenses||[],payments=d.payments||[],quotes=d.quotes||[],invoices=d.invoices||[];
 if(!selected)return '<div class="tf-revenue-page">'+sectionHeading('Job Costing','Review cash collected and known costs by job.')+topNav('profitability')+
 '<div class="tf-revenue-sectionhead"><h2>Select a job</h2></div>'+
 (jobs.length?jobs.map(x=>'<button type="button" class="tf-revenue-listitem" data-revenue-action="job" data-id="'+esc(x.id)+'"><span><strong>'+esc(x.title||'Job')+'</strong><small>'+esc(x.status||'')+' · '+esc(x.date||'Unscheduled')+'</small></span><span>›</span></button>').join(''):'<div class="tf-revenue-empty">No jobs yet. Create one under More → Jobs.</div>')+'</div>';
 const cost=linked.filter(x=>x.jobId===selected.id);
 const estimated=cost.filter(x=>x.type==='estimate').reduce((n,x)=>n+Number(x.amount||0),0);
 const manualActual=cost.filter(x=>x.type==='actual').reduce((n,x)=>n+Number(x.amount||0),0);
 const financeExpenses=expenses.filter(x=>x.relatedId===selected.id||x.jobId===selected.id).reduce((n,x)=>n+Number(x.amount||0),0);
 const relatedInvoiceIds=new Set(invoices.filter(x=>x.jobId===selected.id).map(x=>x.id));
 const received=payments.filter(x=>x.jobId===selected.id||x.relatedId===selected.id||(x.invoiceId&&relatedInvoiceIds.has(x.invoiceId))).reduce((n,x)=>n+Number(x.amount||0),0);
 const quoted=quotes.find(q=>q.id===selected.quoteId);
 const expected=Number(quoted?.amount)||0;
 const spent=manualActual+financeExpenses;
 return '<div class="tf-revenue-page"><button type="button" class="tf-revenue-back" data-revenue-action="job-back">‹ All jobs</button>'+
 sectionHeading(selected.title||'Job profitability','Recorded amounts; incomplete costs do not represent final profit.')+topNav('profitability')+
 '<div class="tf-revenue-stats tf-revenue-stats-grid"><div><small>LINKED QUOTATION</small><strong>'+money(expected)+'</strong></div><div><small>PLANNED COSTS</small><strong>'+money(estimated)+'</strong></div><div><small>CASH RECEIVED</small><strong>'+money(received)+'</strong></div><div><small>RECORDED COSTS</small><strong>'+money(spent)+'</strong></div></div>'+
 '<section class="tf-revenue-card"><h2>Cash contribution (incomplete)</h2><div class="tf-revenue-highlight">'+money(received-spent)+'</div>'+
 '<p>This is money recorded as received for this job minus linked Finance expenses and manually recorded direct costs. It excludes missing wages, overhead, taxes and unrecorded spending. It is not an audited profit or margin.</p>'+
 '<div class="tf-revenue-smallstats"><span>Finance expenses: '+money(financeExpenses)+'</span><span>Manual actual costs: '+money(manualActual)+'</span></div></section>'+
 '<div class="tf-revenue-sectionhead"><h2>Job cost entries</h2></div>'+
 '<form id="tfRevenueCostForm" data-id="'+esc(selected.id)+'" class="tf-revenue-card tf-revenue-form">'+
 '<label>Cost description<input name="title" maxlength="150" required placeholder="Labor hours / planned materials"></label>'+
 '<div class="tf-revenue-two"><label>Amount (€)<input name="amount" type="number" min=".01" max="100000000" step=".01" required></label>'+
 '<label>Classification<select name="type"><option value="estimate">Planned / estimate</option><option value="actual">Actual direct cost</option></select></label></div>'+
 '<label>Cost category<select name="category"><option>Labor</option><option>Materials</option><option>Subcontractors</option><option>Overhead</option><option>Other</option></select></label>'+
 '<p class="tf-revenue-warning">Do not enter the same actual cost here if it already exists as a job-linked expense in Finance, or it will be counted twice.</p>'+
 '<button class="tf-revenue-primary" type="submit">Add cost</button></form>'+
 (cost.length?cost.map(c=>'<article class="tf-revenue-listitem"><span><strong>'+esc(c.title)+'</strong><small>'+esc(c.type==='estimate'?'Planned':'Actual')+' · '+esc(c.category)+'</small></span><span><strong>'+money(c.amount)+'</strong><button class="tf-revenue-textdanger" type="button" data-revenue-action="remove-cost" data-id="'+esc(c.id)+'">Remove</button></span></article>').join(''):'')+
 '</div>';
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
function newInvoice(){mode='edit';invoiceId='';api?.render()}
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
      lines,notes:trim(fd.get('notes'),1200),status:'Draft',currency:'EUR',updatedAt:new Date().toISOString(),createdAt:prior?.createdAt||new Date().toISOString()};
   if(totals(inv).total<=0||totals(inv).total>1e9)throw Error('Invoice total must be positive and within the supported range.');
   await api.put('invoices',inv);invoiceId=inv.id;mode='detail';api.notify('Invoice draft saved');
  }else if(form.id==='tfRevenuePaymentForm'){
   const inv=await api.get('invoices',form.dataset.id);
   if(!inv||inv.status!=='Issued')throw Error('Only issued invoices can receive recorded payments.');
   const payments=await api.all('payments'),remaining=totals(inv).total-collected(inv,payments),amount=Number(fd.get('amount'));
   if(!Number.isFinite(amount)||amount<.01||amount>remaining+.004||Math.abs(Math.round(amount*100)-amount*100)>1e-6)throw Error('Amount exceeds the unpaid balance or is invalid.');
   const date=trim(fd.get('date'),10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Valid payment date required.');
   const customer=await api.get('customers',inv.customerId);
   await api.put('payments',{id:api.uid(),amount:Math.round(amount*100)/100,date,method:trim(fd.get('method'),80),
      source:customer?.name||'Invoice payment',customerId:inv.customerId,invoiceId:inv.id,jobId:inv.jobId||'',
      title:'Invoice payment',trade:'',currency:'EUR',updatedAt:new Date().toISOString(),manual:true});
   invoiceId=inv.id;mode='detail';api.notify('Manual payment recorded');
  }else if(form.id==='tfRevenueCostForm'){
   const job=await api.get('jobs',form.dataset.id);if(!job)throw Error('Job not found.');
   const amount=Number(fd.get('amount'));if(!Number.isFinite(amount)||amount<=0||amount>100000000||
    Math.abs(Math.round(amount*100)-amount*100)>1e-6)throw Error('Enter a valid amount with two decimals.');
   const type=trim(fd.get('type'),20);if(!['estimate','actual'].includes(type))throw Error('Invalid cost classification.');
   const title=trim(fd.get('title'),150);if(!title)throw Error('Cost description is required.');
   await api.put('jobCosts',{id:api.uid(),jobId:job.id,title,amount:Math.round(amount*100)/100,
      type,category:trim(fd.get('category'),80),createdAt:new Date().toISOString()});
   api.notify('Job cost saved');
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
 if(a==='list'){mode='list';invoiceId='';api.render();return}
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
 if(a==='record'){mode='payment';invoiceId=id;api.render();return}
 if(a==='print'){window.print?.();return}
 if(a==='job'){jobId=id;api.render();return}
 if(a==='job-back'){jobId='';api.render();return}
 if(a==='remove-cost'){
  const cost=await api.get('jobCosts',id);if(!cost||!confirm('Delete this local job cost entry?'))return;
  await api.del('jobCosts',id);api.notify('Job cost removed');return;
 }
 }catch(err){alert('Could not complete action: '+err.message)}
}
function init(bridge){
 api=bridge;document.addEventListener('submit',onSubmit);document.addEventListener('click',onClick);
}
global.TradeFlowRevenue={configure:init,render:view,_test:{totals,collected,state,esc,parseLines}};
})(typeof window!=='undefined'?window:globalThis);
