'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8'),dossierSource=fs.readFileSync('public/opportunity-dossier.js','utf8');
function history(){
 const a=app.indexOf('function tfCustomerRelationshipHistory('),b=app.indexOf('function tfRecordDetailView(',a);
 assert.ok(a>=0&&b>a,'Customer timeline must be implemented on the existing dossier');
 return new Function('esc','euro',app.slice(a,b)+';return tfCustomerRelationshipHistory;')(
  v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  n=>'$'+Number(n).toFixed(2));
}
test('customer history joins local linked records only and escapes names',()=>{
 const display=history();
 const d={quotes:[{id:'q',customerId:'c1',title:'Panel <upgrade>',status:'Sent',sentDate:'2026-10-20'}],
 jobs:[{id:'j',customerId:'c1',title:'Job',status:'Completed',date:'2026-10-19'}],
 invoices:[{id:'i',customerId:'c1',reference:'INV-22',status:'Issued',issuedDate:'2026-10-22'}],
 payments:[{id:'p',invoiceId:'i',date:'2026-10-23',amount:25}],
 tasks:[{id:'t',customerId:'c1',title:'Call office',status:'Done',due:'2026-10-21'},
 {id:'other',customerId:'c2',title:'Secret customer',due:'2026-10-24'}]};
 const html=display(d,'c1');
 for(const x of ['INV-22','Panel &lt;upgrade&gt;','Recorded receipt','Call office','Recorded relationship history'])assert.ok(html.includes(x),x);
 assert.ok(!html.includes('Secret customer'));assert.ok(!html.includes('Panel <upgrade>'));
 assert.ok(html.indexOf('2026-10-23')<html.indexOf('2026-10-22'));
 assert.ok(html.includes('not synchronized'));
});
test('opportunity dossier reuses current workflow for evidence-led manual bid decisions',()=>{
 const window={};vm.runInNewContext(dossierSource,{window,URL,Number,Array,Object,Set}, {timeout:3000});
 const model=window.TradeFlowDossier;assert.ok(model);
 const r={id:'o1',project_name:'Office renovation',bid_decision:'Hold',bid_rationale:'Invitation is pending and site plans are incomplete.',source_url:'https://example.com'};
 const form=model.workflow(r,{settings:[]}),detail=model.dossier(r);
 assert.ok(form.includes('name="bid_decision"'));
 assert.ok(form.includes('name="bid_rationale"'));
 assert.ok(form.includes('Do not bid'));
 assert.ok(form.includes('Invitation verified?'));
 assert.ok(detail.includes('Bid decision'));assert.ok(detail.includes('Hold'));
 assert.ok(detail.includes('site plans are incomplete'));
});
test('bid decision handler validates selections and requires an explanation',()=>{
 assert.ok(app.includes("bidDecision!=='Unreviewed'&&bidRationale.length<12"));
 assert.ok(app.includes('bid_decision:bidDecision,bid_rationale:bidRationale'));
});
