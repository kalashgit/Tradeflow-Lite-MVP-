/* Presentation only. Host supplies the existing detector report and command runtime. */
(function(root){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const terminal=new Set(['completed','cancelled','canceled','done']);
const local=(r,scope)=>r&&(!r.businessId||r.businessId===scope.businessId);
function model(data,report,scope){
 if(scope?.actor!=='local-owner'||scope.businessId!=='local-business')return {unavailable:true,jobs:[],findings:[]};
 const jobs=(data.jobs||[]).filter(r=>local(r,scope)&&!terminal.has(String(r.status||'').trim().toLowerCase()));
 const findings=Array.isArray(report?.findings)?report.findings.filter(f=>f.recordRefs?.length&&f.recordRefs.every(ref=>Array.isArray(data[ref.store])&&data[ref.store].some(r=>r.id===ref.id&&local(r,scope)))):null;
 return {unavailable:false,jobs:jobs.slice(0,3),jobCount:jobs.length,findings:findings?.slice(0,3)||[],findingCount:findings?.length??null};
}
function render(data,report,scope){
 const m=model(data,report,scope);
 if(m.unavailable)return '<section class="tf-command-center" aria-label="Business command center"><p>Business overview unavailable in this context.</p></section>';
 return '<section class="tf-command-center" aria-labelledby="tfCommandCenterTitle"><header><div><h2 id="tfCommandCenterTitle">Your operating picture</h2><p>Saved on this device · Review source records before acting</p></div><button type="button" data-tab="ai">Open Intelligence</button></header><div class="tf-command-center-grid"><section aria-labelledby="tfActiveWorkTitle"><h3 id="tfActiveWorkTitle">Active work <span>'+m.jobCount+'</span></h3>'+(m.jobs.length?'<ul>'+m.jobs.map(j=>'<li><button type="button" data-center-store="jobs" data-center-id="'+esc(j.id)+'"><strong>'+esc(j.title||'Untitled job')+'</strong><small>'+esc(j.status||'Status not recorded')+'</small></button></li>').join('')+'</ul>':'<p>No active jobs recorded. Create or review work in Jobs.</p>')+'<button type="button" data-tab="jobs">View all jobs</button></section><section aria-labelledby="tfAttentionTitle"><h3 id="tfAttentionTitle">Needs attention <span>'+(m.findingCount??'—')+'</span></h3>'+(m.findingCount===null?'<p role="status">Operational review unavailable. Open source records to check your work.</p>':m.findings.length?'<ul>'+m.findings.map(f=>'<li><button type="button" data-center-store="'+esc(f.recordRefs[0].store)+'" data-center-id="'+esc(f.recordRefs[0].id)+'"><strong>'+esc(f.explanation||'Review saved evidence')+'</strong><small>Inspect supporting record · '+esc(f.confidence||'Evidence needs review')+'</small></button></li>').join('')+'</ul>':'<p>No exceptions found in the available records. This is not a complete business audit.</p>')+'<button type="button" data-center-alerts>Review notifications</button></section></div></section>';
}
function configure({document,commands,notify,showNotifications}){
 document.addEventListener('click',async event=>{
  const button=event.target.closest?.('.tf-command-center [data-center-store],.tf-command-center [data-center-alerts]');if(!button)return;
  event.preventDefault();if(button.disabled)return;button.disabled=true;
  try{if(button.hasAttribute('data-center-alerts')){await showNotifications();return}
   const plan=await commands.prepare({commandId:'record.open',params:{ref:{store:button.dataset.centerStore,id:button.dataset.centerId}}});
   const result=plan.status==='ready'?await commands.execute(plan.id):plan;
   if(result.status!=='succeeded')notify(result.error?.message||'Record unavailable. Refresh the overview.');
  }catch{notify('Could not open this record. Refresh the overview.')}finally{button.disabled=false}
 });
}
const api=Object.freeze({model,render,configure});if(typeof module==='object'&&module.exports)module.exports=api;else root.TradeFlowCommandCenter=api;
})(typeof window==='object'?window:globalThis);
