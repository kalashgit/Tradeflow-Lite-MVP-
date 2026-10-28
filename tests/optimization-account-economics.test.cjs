'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('public/app.js','utf8');
function render(){
 const start=source.indexOf('function tfCustomerRecordedEconomics('),end=source.indexOf('function tfCustomerRelationshipHistory(',start);
 assert.ok(start>=0&&end>start);
 return new Function('esc',source.slice(start,end)+';return tfCustomerRecordedEconomics;')(
  value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
}
test('customer account economics sums local receipts and linked costs without conflating sales and cash',()=>{
 const r=render(),d={jobs:[{id:'j1',customerId:'c1'},{id:'j2',customerId:'c2'}],
 invoices:[{id:'i1',customerId:'c1'},{id:'i2',customerId:'c2'}],
 payments:[{id:'p1',invoiceId:'i1',amount:750},{id:'p2',invoiceId:'i2',amount:9999}],
 jobCosts:[{id:'k1',jobId:'j1',type:'actual',amount:250},{id:'k2',jobId:'j1',type:'estimate',amount:1000}],
 expenses:[{id:'e1',jobId:'j1',amount:150},{id:'e2',jobId:'j2',amount:9000}]};
 const html=r(d,'c1');
 assert.ok(html.includes('$750.00'));
 assert.ok(html.includes('$400.00'));
 assert.ok(html.includes('$350.00'));
 assert.ok(!html.includes('9999'));assert.ok(html.includes('not verified bank receipts'));
});
test('customer with jobs and no entered costs is flagged as incomplete',()=>{
 const r=render(),d={jobs:[{id:'j1',customerId:'c1'}],invoices:[],payments:[],expenses:[],jobCosts:[]};
 assert.ok(r(d,'c1').includes('Records may be incomplete'));
});
test('economics is integrated into existing customer dossier',()=>{
 assert.ok(source.includes('sections+=tfCustomerRecordedEconomics(d,record.id);'));
});
