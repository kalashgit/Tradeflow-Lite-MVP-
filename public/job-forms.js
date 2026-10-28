/* TradeFlow Field Forms R02 — offline job assessment checklist.
   Attach notes and checklist items directly to existing Job records.
   This is documentation assistance, not a safety inspection certification. */
(function(global){
'use strict';
var bridge=null;
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]})}
var template=[
 'Confirm scope and customer instructions',
 'Record access, site conditions and hazards',
 'Check required materials and documentation',
 'Document work performed and observations',
 'Complete appropriate trade-specific quality checks',
 'Review outcome and next steps with customer'
];
function items(job){return Array.isArray(job.fieldChecklist)?job.fieldChecklist.filter(function(x){return x&&typeof x.id==='string'&&typeof x.text==='string'}).slice(0,60):[]}
function changeOrders(job){
 return Array.isArray(job.changeOrders)?job.changeOrders.filter(x=>x&&typeof x.id==='string'&&typeof x.description==='string').slice(0,50):[];
}
function orderAmount(value){
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>1000000||Math.abs(Math.round(n*100)-n*100)>0.000001)throw Error('Enter an amount from $0 to $1,000,000 with at most two decimals.');
 return Math.round(n*100)/100;
}
function changeOrderPanel(job){
 const orders=changeOrders(job),confirmed=orders.filter(o=>o.status==='Customer approval recorded'),value=confirmed.reduce((n,o)=>n+Number(o.amount||0),0);
 return '<section class="tf-job-form tf-record-dossier-box" aria-label="Job change orders"><div class="tf-job-form-top"><div><span>JOB / CHANGE CONTROL</span><h3>Scope changes</h3><p>Record extra work separately from the original scope.</p></div><span class="tf-job-form-count">'+orders.length+'</span></div>'+
 (orders.length?'<div class="tf-job-checklist">'+orders.map(o=>'<div class="tf-job-checkline tf-job-order"><div><strong>'+esc(o.description)+'</strong><small>
 var ls=items(job),done=ls.filter(function(x){return x.done}).length;
 return '<section class="tf-job-form tf-record-dossier-box" aria-label="Job assessment checklist" data-job-id="'+esc(job.id)+'">'+
 '<div class="tf-job-form-top"><div><span>FIELD DOCUMENTATION / JOB</span><h3>Assessment checklist</h3><p>Save observations and check off completed work.</p></div><span class="tf-job-form-count">'+done+' / '+ls.length+'</span></div>'+
 '<div class="tf-job-form-progress"><span style="width:'+(ls.length?Math.round(done/ls.length*100):0)+'%"></span></div>'+
 (ls.length?'<div class="tf-job-checklist">'+ls.map(function(x){
  return '<div class="tf-job-checkline"><label><input type="checkbox" data-job-form-action="toggle" data-id="'+esc(x.id)+'" data-job="'+esc(job.id)+'" '+(x.done?'checked':'')+' aria-label="Mark '+esc(x.text)+'"><span class="'+(x.done?'checked':'')+'">'+esc(x.text)+'</span></label><button type="button" data-job-form-action="remove" data-id="'+esc(x.id)+'" data-job="'+esc(job.id)+'" aria-label="Remove '+esc(x.text)+'">×</button></div>';
 }).join('')+'</div>':'<p class="tf-job-form-empty">No checklist items yet. Add your own, or start with a general-purpose template.</p>')+
 '<div class="tf-job-form-actions">'+(ls.length?'':'<button type="button" data-job-form-action="template" data-job="'+esc(job.id)+'">+ Add starter checklist</button>')+
 '<button type="button" data-job-form-action="print" data-job="'+esc(job.id)+'">Print / Save as PDF</button></div>'+
 '<form id="tfJobChecklistAdd" data-job="'+esc(job.id)+'"><label for="tfJobItemText">New checklist item</label><div><input name="item" id="tfJobItemText" maxlength="220" required placeholder="Add a job-specific assessment item"><button type="submit">Add</button></div></form>'+
 '<form id="tfJobAssessmentForm" data-job="'+esc(job.id)+'"><label for="tfJobAssessmentNotes">Work assessment & observations</label>'+
 '<textarea id="tfJobAssessmentNotes" name="notes" rows="4" maxlength="5000" placeholder="Record findings, required follow-ups, customer notes and scope changes.">'+esc(job.assessmentNotes||'')+'</textarea>'+
 '<button type="submit">Save assessment</button></form>'+
 '<p class="tf-job-form-privacy">Saved locally with this job and included in JSON backups. Use approved trade-specific inspections, permits and safety processes where required. Customer signatures and certified forms are not active yet.</p>'+
 '</section>'+changeOrderPanel(job);
}
function configure(c){
 bridge=c;
 if(typeof document!=='undefined'){document.addEventListener('click',click);document.addEventListener('submit',submit)}
}
async function change(jobId,fn){
 if(!bridge)return;
 var row=await bridge.get('jobs',jobId);
 if(!row)throw Error('Job not found');
 var copy=Object.assign({},row,{fieldChecklist:items(row),changeOrders:changeOrders(row)});
 var updated=fn(copy);
 if(!updated)return;
 copy.checklistUpdatedAt=new Date().toISOString();
 await bridge.put('jobs',copy);
 await bridge.render();
}
async function click(ev){
 var b=ev.target.closest&&ev.target.closest('[data-job-form-action]');
 if(!b||!bridge)return;
 ev.preventDefault();var action=b.dataset.jobFormAction,id=b.dataset.id,jobId=b.dataset.job;
 try{
  if(action==='approve-order'){
   const reference=typeof prompt==='function'?String(prompt('Enter a reference for the actual customer approval (signed document, email date or other verifiable evidence):')||'').trim():'';
   if(reference.length<6||reference.length>300)return;
   if(!confirm('Confirm customer approval was received outside TradeFlow and evidence is recorded?'))return;
   await change(jobId,function(job){
    const order=job.changeOrders.find(o=>o.id===id);if(!order||order.status!=='Proposed')return false;
    order.status='Customer approval recorded';order.approvalReference=reference;order.approvedAt=new Date().toISOString();return true;
   });
   return;
  }
  if(action==='print'){if(typeof window!=='undefined'&&typeof window.print==='function')window.print();return}
  if(action==='template'){
   await change(jobId,function(job){if(items(job).length)return false;job.fieldChecklist=template.map(function(text){return {id:bridge.uid(),text:text,done:false}});return true});
  }else if(action==='toggle'){
   await change(jobId,function(job){var line=job.fieldChecklist.find(function(x){return x.id===id});if(!line)return false;line.done=!!b.checked;return true});
  }else if(action==='remove'){
   if(!confirm('Remove this checklist item?'))return;
   await change(jobId,function(job){job.fieldChecklist=job.fieldChecklist.filter(function(x){return x.id!==id});return true});
  }
 }catch(error){alert('Could not update checklist: '+error.message)}
}
async function submit(ev){
 if(!bridge||!['tfJobChecklistAdd','tfJobAssessmentForm','tfJobChangeOrderForm'].includes(ev.target.id))return;
 ev.preventDefault();var form=ev.target,jobId=form.dataset.job;
 try{
  if(form.id==='tfJobChangeOrderForm'){
   var fd=new FormData(form),description=String(fd.get('description')||'').trim(),amount=orderAmount(fd.get('amount'));
   if(!description||description.length>220)throw Error('Describe the added scope.');
   await change(jobId,function(job){
    if(job.changeOrders.length>=50)throw Error('Maximum 50 change orders per job.');
    job.changeOrders.push({id:bridge.uid(),description,amount,status:'Proposed',createdAt:new Date().toISOString()});
    return true;
   });
  }else if(form.id==='tfJobChecklistAdd'){
   var text=String(new FormData(form).get('item')||'').trim().slice(0,220);
   if(!text)return;
   await change(jobId,function(job){if(job.fieldChecklist.length>=60)throw Error('Maximum 60 checklist items');job.fieldChecklist.push({id:bridge.uid(),text:text,done:false});return true});
  }else{
   var notes=String(new FormData(form).get('notes')||'').slice(0,5000);
   await change(jobId,function(job){job.assessmentNotes=notes;return true});
  }
 }catch(error){alert('Could not save assessment: '+error.message)}
}
global.TradeFlowJobForms={configure:configure,panel:panel,_test:{items:items,template:template,changeOrders:changeOrders,orderAmount:orderAmount}};
})(typeof window!=='undefined'?window:globalThis);
+Number(o.amount).toFixed(2)+' · '+esc(o.status||'Proposed')+'</small>'+(o.approvalReference?'<small>Evidence: '+esc(o.approvalReference)+'</small>':'')+'</div>'+
 (o.status==='Proposed'?'<button type="button" data-job-form-action="approve-order" data-job="'+esc(job.id)+'" data-id="'+esc(o.id)+'">Record approval</button>':'')+'</div>').join('')+'</div>':'<p class="tf-job-form-empty">No extra work recorded.</p>')+
 '<p class="tf-job-form-privacy">Customer approvals recorded: '+confirmed.length+' · Value: 
 var ls=items(job),done=ls.filter(function(x){return x.done}).length;
 return '<section class="tf-job-form tf-record-dossier-box" aria-label="Job assessment checklist" data-job-id="'+esc(job.id)+'">'+
 '<div class="tf-job-form-top"><div><span>FIELD DOCUMENTATION / JOB</span><h3>Assessment checklist</h3><p>Save observations and check off completed work.</p></div><span class="tf-job-form-count">'+done+' / '+ls.length+'</span></div>'+
 '<div class="tf-job-form-progress"><span style="width:'+(ls.length?Math.round(done/ls.length*100):0)+'%"></span></div>'+
 (ls.length?'<div class="tf-job-checklist">'+ls.map(function(x){
  return '<div class="tf-job-checkline"><label><input type="checkbox" data-job-form-action="toggle" data-id="'+esc(x.id)+'" data-job="'+esc(job.id)+'" '+(x.done?'checked':'')+' aria-label="Mark '+esc(x.text)+'"><span class="'+(x.done?'checked':'')+'">'+esc(x.text)+'</span></label><button type="button" data-job-form-action="remove" data-id="'+esc(x.id)+'" data-job="'+esc(job.id)+'" aria-label="Remove '+esc(x.text)+'">×</button></div>';
 }).join('')+'</div>':'<p class="tf-job-form-empty">No checklist items yet. Add your own, or start with a general-purpose template.</p>')+
 '<div class="tf-job-form-actions">'+(ls.length?'':'<button type="button" data-job-form-action="template" data-job="'+esc(job.id)+'">+ Add starter checklist</button>')+
 '<button type="button" data-job-form-action="print" data-job="'+esc(job.id)+'">Print / Save as PDF</button></div>'+
 '<form id="tfJobChecklistAdd" data-job="'+esc(job.id)+'"><label for="tfJobItemText">New checklist item</label><div><input name="item" id="tfJobItemText" maxlength="220" required placeholder="Add a job-specific assessment item"><button type="submit">Add</button></div></form>'+
 '<form id="tfJobAssessmentForm" data-job="'+esc(job.id)+'"><label for="tfJobAssessmentNotes">Work assessment & observations</label>'+
 '<textarea id="tfJobAssessmentNotes" name="notes" rows="4" maxlength="5000" placeholder="Record findings, required follow-ups, customer notes and scope changes.">'+esc(job.assessmentNotes||'')+'</textarea>'+
 '<button type="submit">Save assessment</button></form>'+
 '<p class="tf-job-form-privacy">Saved locally with this job and included in JSON backups. Use approved trade-specific inspections, permits and safety processes where required. Customer signatures and certified forms are not active yet.</p>'+
 '</section>';
}
function configure(c){
 bridge=c;
 if(typeof document!=='undefined'){document.addEventListener('click',click);document.addEventListener('submit',submit)}
}
async function change(jobId,fn){
 if(!bridge)return;
 var row=await bridge.get('jobs',jobId);
 if(!row)throw Error('Job not found');
 var copy=Object.assign({},row,{fieldChecklist:items(row)});
 var updated=fn(copy);
 if(!updated)return;
 copy.checklistUpdatedAt=new Date().toISOString();
 await bridge.put('jobs',copy);
 await bridge.render();
}
async function click(ev){
 var b=ev.target.closest&&ev.target.closest('[data-job-form-action]');
 if(!b||!bridge)return;
 ev.preventDefault();var action=b.dataset.jobFormAction,id=b.dataset.id,jobId=b.dataset.job;
 try{
  if(action==='print'){if(typeof window!=='undefined'&&typeof window.print==='function')window.print();return}
  if(action==='template'){
   await change(jobId,function(job){if(items(job).length)return false;job.fieldChecklist=template.map(function(text){return {id:bridge.uid(),text:text,done:false}});return true});
  }else if(action==='toggle'){
   await change(jobId,function(job){var line=job.fieldChecklist.find(function(x){return x.id===id});if(!line)return false;line.done=!!b.checked;return true});
  }else if(action==='remove'){
   if(!confirm('Remove this checklist item?'))return;
   await change(jobId,function(job){job.fieldChecklist=job.fieldChecklist.filter(function(x){return x.id!==id});return true});
  }
 }catch(error){alert('Could not update checklist: '+error.message)}
}
async function submit(ev){
 if(!bridge||!['tfJobChecklistAdd','tfJobAssessmentForm'].includes(ev.target.id))return;
 ev.preventDefault();var form=ev.target,jobId=form.dataset.job;
 try{
  if(form.id==='tfJobChecklistAdd'){
   var text=String(new FormData(form).get('item')||'').trim().slice(0,220);
   if(!text)return;
   await change(jobId,function(job){if(job.fieldChecklist.length>=60)throw Error('Maximum 60 checklist items');job.fieldChecklist.push({id:bridge.uid(),text:text,done:false});return true});
  }else{
   var notes=String(new FormData(form).get('notes')||'').slice(0,5000);
   await change(jobId,function(job){job.assessmentNotes=notes;return true});
  }
 }catch(error){alert('Could not save assessment: '+error.message)}
}
global.TradeFlowJobForms={configure:configure,panel:panel,_test:{items:items,template:template}};
})(typeof window!=='undefined'?window:globalThis);
+value.toFixed(2)+'. These amounts are not automatically added to invoices or contract totals.</p>'+
 '<form id="tfJobChangeOrderForm" data-job="'+esc(job.id)+'"><label>Scope change description<input name="description" maxlength="220" required placeholder="Extra circuit requested after original quote"></label>'+
 '<label>Proposed additional amount (USD)<input name="amount" type="number" min="0" max="1000000" step="0.01" required></label>'+
 '<button type="submit">Record proposed change</button></form>'+
 '<p class="tf-job-form-privacy">Recording approval requires confirmation of external customer evidence. This is not an electronic signature or a certified change-order document.</p></section>';
}
function panel(job){
 var ls=items(job),done=ls.filter(function(x){return x.done}).length;
 return '<section class="tf-job-form tf-record-dossier-box" aria-label="Job assessment checklist" data-job-id="'+esc(job.id)+'">'+
 '<div class="tf-job-form-top"><div><span>FIELD DOCUMENTATION / JOB</span><h3>Assessment checklist</h3><p>Save observations and check off completed work.</p></div><span class="tf-job-form-count">'+done+' / '+ls.length+'</span></div>'+
 '<div class="tf-job-form-progress"><span style="width:'+(ls.length?Math.round(done/ls.length*100):0)+'%"></span></div>'+
 (ls.length?'<div class="tf-job-checklist">'+ls.map(function(x){
  return '<div class="tf-job-checkline"><label><input type="checkbox" data-job-form-action="toggle" data-id="'+esc(x.id)+'" data-job="'+esc(job.id)+'" '+(x.done?'checked':'')+' aria-label="Mark '+esc(x.text)+'"><span class="'+(x.done?'checked':'')+'">'+esc(x.text)+'</span></label><button type="button" data-job-form-action="remove" data-id="'+esc(x.id)+'" data-job="'+esc(job.id)+'" aria-label="Remove '+esc(x.text)+'">×</button></div>';
 }).join('')+'</div>':'<p class="tf-job-form-empty">No checklist items yet. Add your own, or start with a general-purpose template.</p>')+
 '<div class="tf-job-form-actions">'+(ls.length?'':'<button type="button" data-job-form-action="template" data-job="'+esc(job.id)+'">+ Add starter checklist</button>')+
 '<button type="button" data-job-form-action="print" data-job="'+esc(job.id)+'">Print / Save as PDF</button></div>'+
 '<form id="tfJobChecklistAdd" data-job="'+esc(job.id)+'"><label for="tfJobItemText">New checklist item</label><div><input name="item" id="tfJobItemText" maxlength="220" required placeholder="Add a job-specific assessment item"><button type="submit">Add</button></div></form>'+
 '<form id="tfJobAssessmentForm" data-job="'+esc(job.id)+'"><label for="tfJobAssessmentNotes">Work assessment & observations</label>'+
 '<textarea id="tfJobAssessmentNotes" name="notes" rows="4" maxlength="5000" placeholder="Record findings, required follow-ups, customer notes and scope changes.">'+esc(job.assessmentNotes||'')+'</textarea>'+
 '<button type="submit">Save assessment</button></form>'+
 '<p class="tf-job-form-privacy">Saved locally with this job and included in JSON backups. Use approved trade-specific inspections, permits and safety processes where required. Customer signatures and certified forms are not active yet.</p>'+
 '</section>';
}
function configure(c){
 bridge=c;
 if(typeof document!=='undefined'){document.addEventListener('click',click);document.addEventListener('submit',submit)}
}
async function change(jobId,fn){
 if(!bridge)return;
 var row=await bridge.get('jobs',jobId);
 if(!row)throw Error('Job not found');
 var copy=Object.assign({},row,{fieldChecklist:items(row)});
 var updated=fn(copy);
 if(!updated)return;
 copy.checklistUpdatedAt=new Date().toISOString();
 await bridge.put('jobs',copy);
 await bridge.render();
}
async function click(ev){
 var b=ev.target.closest&&ev.target.closest('[data-job-form-action]');
 if(!b||!bridge)return;
 ev.preventDefault();var action=b.dataset.jobFormAction,id=b.dataset.id,jobId=b.dataset.job;
 try{
  if(action==='print'){if(typeof window!=='undefined'&&typeof window.print==='function')window.print();return}
  if(action==='template'){
   await change(jobId,function(job){if(items(job).length)return false;job.fieldChecklist=template.map(function(text){return {id:bridge.uid(),text:text,done:false}});return true});
  }else if(action==='toggle'){
   await change(jobId,function(job){var line=job.fieldChecklist.find(function(x){return x.id===id});if(!line)return false;line.done=!!b.checked;return true});
  }else if(action==='remove'){
   if(!confirm('Remove this checklist item?'))return;
   await change(jobId,function(job){job.fieldChecklist=job.fieldChecklist.filter(function(x){return x.id!==id});return true});
  }
 }catch(error){alert('Could not update checklist: '+error.message)}
}
async function submit(ev){
 if(!bridge||!['tfJobChecklistAdd','tfJobAssessmentForm'].includes(ev.target.id))return;
 ev.preventDefault();var form=ev.target,jobId=form.dataset.job;
 try{
  if(form.id==='tfJobChecklistAdd'){
   var text=String(new FormData(form).get('item')||'').trim().slice(0,220);
   if(!text)return;
   await change(jobId,function(job){if(job.fieldChecklist.length>=60)throw Error('Maximum 60 checklist items');job.fieldChecklist.push({id:bridge.uid(),text:text,done:false});return true});
  }else{
   var notes=String(new FormData(form).get('notes')||'').slice(0,5000);
   await change(jobId,function(job){job.assessmentNotes=notes;return true});
  }
 }catch(error){alert('Could not save assessment: '+error.message)}
}
global.TradeFlowJobForms={configure:configure,panel:panel,_test:{items:items,template:template}};
})(typeof window!=='undefined'?window:globalThis);
