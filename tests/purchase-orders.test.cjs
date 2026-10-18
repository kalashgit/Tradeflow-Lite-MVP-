'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../public/core-integration.js');
const po=require('../public/purchase-orders.js');
const suppliersUi=fs.readFileSync('public/suppliers.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const data={
 settings:[{id:'business',company:'Sample Electrical LLC',businessAddress:'101 Example St, Austin TX',contactEmail:'buyer@example.com',contactName:'Alex'}],
 suppliers:[{id:'s1',name:'Parts Partner',email:'orders@example.com',address:'Warehouse One'}],
 supplyOrders:[],customers:[{id:'c1',name:'Customer X',address:'Client Street'}],
 jobs:[{id:'j1',title:'Site Alpha',address:'15 Oak Road'}],opportunities:[]
};
let n=0;const uid=()=> 'draft-'+(++n),now=()=>new Date('2026-10-17T08:00:00Z').toISOString();
const order=core.prepare('supplyOrder.save',{
 supplierId:'s1',destinationKind:'job',destinationId:'j1',plannedDate:'2026-10-23',status:'Planned',
 currency:'USD',taxRate:'8.25',shipping:'12.50',paymentTerms:'Net 30',
 lineItems:[
 {description:'Panel upgrade kit',quantity:'2',unit:'set',unitPrice:'125.50'},
 {description:'Conduit',quantity:'3',unit:'m',unitPrice:'10.00'}]
},data,uid,now).writes[0].record;
assert.match(order.poNumber,/^PO-2026-/);
assert.equal(order.documentStatus,'Draft');
assert.equal(order.pricingConfirmed,true);
assert.equal(order.destinationAddress,'15 Oak Road');
assert.equal(order.subtotal,281);
assert.equal(order.tax,23.18);
assert.equal(order.total,316.68);
assert.equal(order.lineItems.length,2);
assert.equal(po.totals(order).total,316.68);
data.supplyOrders=[order];
const text=po.documentText(order,data.suppliers[0],data.settings[0],{jobName:'Site Alpha'});
for(const token of [order.poNumber,'PURCHASE ORDER','Panel upgrade kit','Net 30','316.68','Site Alpha','Sample Electrical LLC']){
 assert.ok(text.includes(token),'PO text must contain '+token);
}
const link=po.mailto(order,data.suppliers[0],data.settings[0]);
assert.ok(link.startsWith('mailto:orders@example.com?'));
assert.ok(link.includes('subject=Purchase%20Order'));
assert.ok(new URL(link).searchParams.get('body').includes(order.poNumber));
assert.throws(()=>po.mailto(order,{...data.suppliers[0],email:''},data.settings[0]),/valid supplier email/);
assert.throws(()=>po.documentText(order,data.suppliers[0],{company:''}),/Complete your business name/);
assert.throws(()=>core.prepare('supplyOrder.save',{supplierId:'s1',destinationKind:'job',destinationId:'j1',
 lineItems:[{description:'Item',quantity:0,unitPrice:100}]},data,uid,now),/valid quantity/);
assert.throws(()=>core.prepare('supplyOrder.save',{supplierId:'s1',destinationKind:'job',destinationId:'j1',
 lineItems:[{description:'Item',quantity:1,unitPrice:-1}]},data,uid,now),/valid unit price/);
const issued=core.prepare('supplyOrder.issue',{id:order.id},data,uid,now).writes[0].record;
assert.equal(issued.documentStatus,'Issued');
assert.ok(issued.issuedAt);
data.supplyOrders=[issued];
assert.throws(()=>core.prepare('supplyOrder.save',{...issued,destinationKind:'job',destinationId:'j1'},data,uid,now),/Issued purchase orders are locked/);
const progressed=core.prepare('supplyOrder.progress',{id:issued.id,status:'Delivered'},data,uid,now).writes[0].record;
assert.equal(progressed.status,'Delivered');
assert.equal(progressed.documentStatus,'Issued');
assert.equal(progressed.total,316.68);
assert.equal(core.prepare('supplyOrder.issue',{id:issued.id},data,uid,now).reused,true);
const legacy=core.prepare('supplyOrder.save',{supplierId:'s1',description:'Old parts',destinationKind:'job',destinationId:'j1'},data,uid,now).writes[0].record;
assert.equal(legacy.pricingConfirmed,false);
assert.throws(()=>core.prepare('supplyOrder.issue',{id:legacy.id},{...data,supplyOrders:[legacy]},uid,now),/verify item prices/);
for(const token of ['data-supply-action="issueCompose"','data-supply-action="composeMail"','data-supply-action="printOrder"','data-supply-action="copyOrder"','tfSupplyOrderForm','tfSupplierSearch','data-supply-action="supplierOpen"','data-supply-action="orderOpen"']){
 assert.ok(suppliersUi.includes(token),'Supplier workflow: '+token);
}
assert.ok(suppliersUi.includes('window.location.href=url'),'Native Mail composer navigation must be explicit');
assert.ok(suppliersUi.includes("documentStatus==='Issued'"),'Issued PO state has unique actions');
assert.ok(!suppliersUi.includes('sentAt:')&&!suppliersUi.includes("status:'Sent'"),'Opening Mail does not pretend the purchase order was sent');
assert.ok(html.indexOf('purchase-orders.js')<html.indexOf('suppliers.js'),'PO document helper must load before suppliers module');
assert.ok(sw.includes('purchase-orders.js'),'Offline cache includes purchase order helper');
console.log('PASS: Supply Network V2 itemized PO, native Mail links, immutable issuance, delivery progress and offline assets');
