'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('public/app.js','utf8');
const begin=source.indexOf("document.addEventListener('submit',async function(e){"),end=source.indexOf('async function exportData(){',begin);
function harness(){
 assert.ok(begin>=0&&end>begin,'The live customer contact handler must exist');
 let submit;const document={addEventListener:(kind,fn)=>{if(kind==='submit')submit=fn}};
 const stores={customers:[{id:'c1',name:'Client 1'},{id:'c2',name:'Client 2'}],quotes:[{id:'q1',title:'Panel',customerId:'c1',status:'Sent'}],events:[]};
 const get=async(store,id)=>stores[store].find(x=>x.id===id);
 const put=async(store,x)=>{const index=stores[store].findIndex(r=>r.id===x.id);if(index<0)stores[store].push(x);else stores[store][index]=x};
 let notifications=0;const alert=message=>{throw Error(message)};
 class FormData{constructor(form){this.values=form.values}get(key){return this.values[key]||''}}
 new Function('document','get','put','FormData','notify','uid','alert',source.slice(begin,end))(document,get,put,FormData,async()=>{notifications++},()=>'interaction1',alert);
 function submitWith(customerId,values){
  const e={target:{id:'tfContactLogForm',dataset:{customerId},values},preventDefault(){},stopImmediatePropagation(){}};
  return submit(e);
 }
 return {stores,submitWith,get notifications(){return notifications}};
}
test('logged actual customer contact retains a linked event and updates only its quotation',async()=>{
 const h=harness();
 await h.submitWith('c1',{method:'Phone',quoteId:'q1',notes:'Customer confirmed they are reviewing the quotation.'});
 assert.equal(h.stores.events.length,1);
 assert.equal(h.stores.events[0].kind,'customer_contact');
 assert.equal(h.stores.events[0].quoteId,'q1');
 assert.equal(h.stores.events[0].method,'Phone');
 assert.ok(h.stores.quotes[0].lastContactAt);
 assert.equal(h.notifications,1);
});
test('cross-customer quote links are rejected and no false contact is stored',async()=>{
 const h=harness();
 await assert.rejects(()=>h.submitWith('c2',{method:'Email',quoteId:'q1',notes:'Spoke to someone'}),/no longer matches this customer/);
 assert.equal(h.stores.events.length,0);
 assert.ok(!h.stores.quotes[0].lastContactAt);
});
test('customer history includes recorded contact and existing customer page hosts the form',()=>{
 assert.ok(source.includes('function tfCustomerContactForm('));
 assert.ok(source.includes('sections+=tfCustomerContactForm(d,record.id)'));
 assert.ok(source.includes("e.kind!=='customer_contact'"));
 assert.ok(source.includes('Manual record only.'));
});
