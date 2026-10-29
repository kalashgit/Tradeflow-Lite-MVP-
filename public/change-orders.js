/* TradeFlow Change Control — manually verified local job variations.
 * A record of approval is not an electronic signature, customer communication,
 * invoice, or authorized change to the original contract.
 */
(function(root){
'use strict';
let bridge=null;
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows=job=>Array.isArray(job?.changeOrders)?job.changeOrders.filter(x=>x&&typeof x.id==='string'&&typeof x.description==='string').slice(0,50):[];
const money=v=>Number(v).toLocaleString('en-US',{style:'currency',currency:'USD'});
function amount(v){
 if(v==null||String(v).trim()==='')throw Error('Enter an amount');
 const n=Number(v);
 if(!Number.isFinite(n)||n<=0||n>1000000||Math.abs(Math.round(n*100)-n*100)>1e-6)throw Error('Amount must be positive, at most $1 million, with two decimal places');
 return Math.round(n*100)/100;
}
function panel(job){
 const orders=rows(job),approved=orders.filter(x=>x.status==='approved_recorded');
 const value=approved.reduce((v,x)=>v+x.amount,0);
 return '<section class="tf-job-form tf-record-dossier-box tf-change-control" aria-label="Job change orders">'+
  '<div class="tf-job-form-top"><div><span>JOB / SCOPE CONTROL</span><h3>Extra work &amp; change orders</h3><p>Track proposed changes separately from customer-approved changes.</p></div><span class="tf-job-form-count">'+orders.length+'</span></div>'+
  (orders.length?'<div class="tf-job-checklist">'+orders.map(x=>'<div class="tf-job-checkline tf-co-row"><span><strong>'+escape(x.description)+'</strong><small>'+escape(money(x.amount))+' · '+(x.status==='approved_recorded'?'Customer approval recorded':'Proposed, not approved')+'</small>'+(x.approvalEvidence?'<small>Evidence reference: '+escape(x.approvalEvidence)+'</small>':'')+'</span>'+
   (x.status==='proposed'?'<button type="button" data-tf-change-action="approve" data-job="'+escape(job.id)+'" data-id="'+escape(x.id)+'">Record approval</button>':'')+'</div>').join('')+'</div>':'<p class="tf-job-form-empty">No extra work is recorded yet.</p>')+
  '<p class="tf-job-form-privacy">Recorded approvals: '+approved.length+' · '+escape(money(value))+'. These records do not change contract amounts or issue invoices.</p>'+
  '<form id="tfChangeOrderForm" data-job="'+escape(job.id)+'"><label>Additional scope<input name="description" maxlength="220" required placeholder="Additional circuit requested after quote"></label>'+
  '<label>Proposed additional value (USD)<input name="amount" type="number" min=".01" max="1000000" step=".01" required></label>'+
  '<button type="submit">Record proposed change</button></form>'+
  '<p class="tf-job-form-privacy">Only record approval after separately verifying the customer’s consent. This is not an e-signature or legally compliant change-order form.</p></section>';
}
async function update(jobId,mutate){
 if(!bridge||!jobId)throw Error('Job unavailable');
 const previous=await bridge.get('jobs',jobId);
 if(!previous)throw Error('Job no longer exists');
 const copy={...previous,changeOrders:rows(previous).map(x=>({...x}))};
 const changed=mutate(copy);
 if(!changed)return false;
 copy.changeOrdersUpdatedAt=new Date().toISOString();
 await bridge.put('jobs',copy);
 await bridge.render();
 return true;
}
async function submit(event){
 if(event.target?.id!=='tfChangeOrderForm')return;
 event.preventDefault();
 try{
  const fd=new FormData(event.target),description=String(fd.get('description')||'').trim();
  if(!description||description.length>220)throw Error('Describe the requested extra work');
  const value=amount(fd.get('amount')),jobId=event.target.dataset.job;
  await update(jobId,job=>{
   if(job.changeOrders.length>=50)throw Error('Maximum 50 changes per job');
   job.changeOrders.push({id:bridge.uid(),description,amount:value,status:'proposed',createdAt:new Date().toISOString()});
   return true;
  });
 }catch(err){alert('Change order not saved: '+err.message)}
}
async function click(event){
 const b=event.target.closest?.('[data-tf-change-action]');
 if(!b||b.dataset.tfChangeAction!=='approve')return;
 event.preventDefault();
 try{
  const jobId=b.dataset.job,id=b.dataset.id;
  const job=await bridge.get('jobs',jobId);
  const order=rows(job).find(x=>x.id===id&&x.status==='proposed');
  if(!order)return;
  const evidence=String(root.prompt?.('Enter a verifiable customer approval reference (signed document, email and date, etc.):')||'').trim();
  if(evidence.length<6||evidence.length>300)return;
  if(!root.confirm?.('Confirm you personally verified the customer approval and evidence reference?'))return;
  await update(jobId,next=>{
   const current=next.changeOrders.find(x=>x.id===id);
   if(!current||current.status!=='proposed')return false;
   current.status='approved_recorded';
   current.approvalEvidence=evidence;
   current.approvedAt=new Date().toISOString();
   return true;
  });
 }catch(err){alert('Approval not recorded: '+err.message)}
}
function configure(api){
 if(bridge)return;
 bridge=api;
 document.addEventListener('submit',submit);
 document.addEventListener('click',click);
}
root.TradeFlowChangeOrders=Object.freeze({panel,configure,_test:{rows,amount}});
})(typeof window!=='undefined'?window:globalThis);
