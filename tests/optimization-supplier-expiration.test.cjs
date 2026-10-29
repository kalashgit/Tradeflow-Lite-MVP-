'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Intelligence=require('../public/operational-intelligence.js'),Commands=require('../public/command-registry.js');
const engine=Intelligence.createEngine({commands:Commands,detectors:Intelligence.optimizationDetectors});
const opts={today:'2026-10-28',now:'2026-10-28T12:00:00Z'};
function fixture(){
 return {suppliers:[{id:'s1',name:'Electrical wholesale'}],supplyOrders:[
  {id:'po1',supplierId:'s1',documentStatus:'Draft',status:'Planned',supplierQuoteExpires:'2026-10-30',supplierQuoteEvidence:'Written wholesale quote 2026-10-20'},
  {id:'po2',supplierId:'s1',documentStatus:'Draft',status:'Planned',supplierQuoteExpires:'2026-10-31',supplierQuoteEvidence:'Supplier price email received 2026-10-21'}],
 customers:[],quotes:[],jobs:[],invoices:[],payments:[],tasks:[],events:[],crew:[]};
}
const detect=d=>engine.evaluate(d,opts).findings.filter(f=>f.detectorId==='supplier.quote_expiration_review');
test('groups price expiration warnings by supplier instead of duplicating notifications',()=>{
 const d=fixture(),findings=detect(d);
 assert.equal(findings.length,1);
 assert.equal(findings[0].recordRefs[0].store,'suppliers');
 assert.equal(findings[0].recordRefs[0].id,'s1');
 assert.equal(findings[0].evidence.count,2);
 assert.equal(findings[0].evidence.soonestExpiry,'2026-10-30');
 d.supplyOrders[0].documentStatus='Issued';d.supplyOrders[1].documentStatus='Issued';
 assert.equal(detect(d).length,0);
});
test('no warning without supplier quote evidence or for cancelled orders',()=>{
 const d=fixture();
 d.supplyOrders[0].supplierQuoteEvidence='';
 d.supplyOrders[1].status='Cancelled';
 assert.equal(detect(d).length,0);
});
test('visible notification opens existing supplier record',()=>{
 const src=fs.readFileSync('public/notifications.js','utf8'),window={};
 vm.runInNewContext(src,{window,document:{addEventListener(){}},Date,Math,console},{timeout:3000});
 const d=fixture(),notices=window.TradeFlowNotifications._test.generate(d,Date.parse(opts.now),engine.evaluate(d,opts));
 const alert=notices.find(x=>x.title==='Supplier price quotes need reconfirmation');
 assert.ok(alert);
 assert.equal(alert.recordRef?.store,'suppliers');
 assert.equal(alert.recordRef?.id,'s1');
});
test('purchasing form and authorized command retain evidence-backed dates',()=>{
 const ui=fs.readFileSync('public/suppliers.js','utf8'),engine=fs.readFileSync('public/core-integration.js','utf8');
 for(const key of ['supplierQuoteExpires','supplierQuoteEvidence']){assert.ok(ui.includes('name="'+key+'"'));assert.ok(engine.includes(key))}
 assert.ok(engine.includes('Supplier price expiration needs a valid date and verifiable quote reference.'));
 assert.ok(engine.includes('Supplier price quote has expired. Verify new pricing'));
 assert.ok(ui.includes('Recorded supplier quote validity:'));
 assert.ok(ui.includes('reconfirm before issuing'));
});
