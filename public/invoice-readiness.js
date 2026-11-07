/* TF-JIR-02A: deterministic read-only evidence contract; never authorizes billing. */
const str=x=>typeof x==='string'?x.trim():'';
const money=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&Math.abs(x*100-Math.round(x*100))<1e-7;
const source=x=>x&&str(x.sourceId)&&Number.isInteger(x.revision)&&x.revision>0&&str(x.reviewedAt)&&Number.isFinite(Date.parse(x.reviewedAt));
const same=(x,id)=>x&&(!x.businessId||x.businessId===id);
export function evaluateInvoiceCandidate({job,customer,quote,invoices=[],evidence,businessId='local-business',now=new Date().toISOString()}={}){
 const blockers=[],add=c=>{if(!blockers.includes(c))blockers.push(c)};
 if(!str(businessId)||!str(job?.id)||!same(job,businessId))add('job_unavailable');
 if(job?.status!=='Completed')add('job_not_recorded_completed');
 if(!str(job?.customerId)||!customer||customer.id!==job.customerId||!same(customer,businessId))add('customer_unverified');
 if(!str(job?.quoteId)||!quote||quote.id!==job.quoteId||quote.customerId!==job.customerId||quote.status!=='Accepted'||!same(quote,businessId))add('accepted_scope_unverified');
 if(!Array.isArray(invoices))add('invoice_ledger_unavailable');
 else if(invoices.some(i=>same(i,businessId)&&i.jobId===job?.id&&String(i.status||'').toLowerCase()!=='void'))add('existing_invoice_requires_review');
 if(!evidence||evidence.jobId!==job?.id||evidence.businessId!==businessId)add('billing_evidence_unavailable');
 const signoff=evidence?.completionSignoff,terms=evidence?.billingTerms,scope=evidence?.scope;
 if(!source(signoff)||signoff.status!=='confirmed')add('completion_signoff_unverified');
 if(!source(terms)||terms.status!=='confirmed'||!str(terms.currency)||!str(terms.paymentTerms)||!str(terms.milestoneId))add('billing_terms_unverified');
 if(!source(scope)||scope.status!=='confirmed'||scope.quoteId!==quote?.id)add('scope_unverified');
 const changes=job?.changeOrders;
 if(changes!==undefined&&!Array.isArray(changes))add('change_order_approval_unverified');
 else if(Array.isArray(changes)&&changes.some(c=>!c||c.status!=='approved_recorded'||!source(c.customerAuthorization)))add('change_order_approval_unverified');
 if(!Array.isArray(evidence?.lines)||!evidence.lines.length||evidence.lines.some(l=>!str(l?.description)||!money(l?.unitPrice)||typeof l.qty!=='number'||!Number.isFinite(l.qty)||l.qty<=0))add('invoice_lines_unverified');
 const timestamp=Date.parse(now);
 if(!Number.isFinite(timestamp)||[signoff,terms,scope,...(Array.isArray(changes)?changes.map(c=>c?.customerAuthorization):[])].some(r=>source(r)&&Date.parse(r.reviewedAt)>timestamp))add('evidence_timestamp_invalid');
 // These source IDs have NOT been resolved to independently authenticated revisions.
 return Object.freeze({jobId:job?.id||null,status:blockers.length?'blocked':'evidence_review_candidate',blockers:Object.freeze(blockers),sourceVerificationPending:true,mayPrepareInvoice:false,maySendInvoice:false});
}
