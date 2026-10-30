'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('public/app.js','utf8');
const begin=source.indexOf("document.addEventListener('submit',async function(e){"),
 end=source.indexOf('async function exportData(){',begin);
function harness(){
 assert.ok(begin>=0&&end>begin,'The existing customer contact handler must exist');
 let submit;const document={addEventListener:(kind,fn)=>{if(kind==='submit')submit=fn}};
 const stores={customers:[{id:'c1',name:'Client 1'},{id:'c2',name:'Client 2'}],
  quotes:[{id:'q1',title:'Panel',customerId:'c1',status:'Sent'}],events:[]};
 const get=async(store,id)=>stores[store].find(x=>x.id===id);
 const calls=[];let notifications=0;
 const alert=message=>{throw Error(message)};
 class FormData{constructor(form){this.values=form.values}get(key){return this.values[key]||''}}
 const commands={
  prepare:async input=>{calls.push(['prepare',input]);return {id:'contact-review-1',status:'needs_review'}},
  approve:async id=>{calls.push(['approve',id]);return {status:'approved'}},
  execute:async id=>{calls.push(['execute',id]);return {status:'succeeded',
   result:{id:'contact-1',outcome:'reached',resolvedTasks:1}}},
  reject:async id=>{calls.push(['reject',id]);return {status:'rejected'}},
  reconcile:async id=>{calls.push(['reconcile',id]);return {status:'indeterminate'}}
 };
 const window={TradeFlowPilot:{commands}};
 const confirm=message=>{calls.push(['confirm',message]);return true};
 const tfPilotSnapshot=async()=>({commandLog:[]});
 new Function('document','get','FormData','notify','alert','window','tfPilotSnapshot','confirm',
  'let tfContactQuotePrefill="";'+source.slice(begin,end))(
  document,get,FormData,async()=>{notifications++},alert,window,tfPilotSnapshot,confirm);
 return {stores,calls,get notifications(){return notifications},
  submitWith(customerId,values){return submit({target:{id:'tfContactLogForm',
   dataset:{customerId},values},preventDefault(){},stopImmediatePropagation(){}})}};
}
test('actual customer contact uses approved typed command and never writes directly from form',async()=>{
 const h=harness();
 await h.submitWith('c1',{method:'Phone',quoteId:'q1',
  notes:'Customer confirmed they are reviewing the quotation.',outcome:'reached'});
 const actions=h.calls.map(x=>x[0]);
 assert.deepEqual(actions,['prepare','confirm','approve','execute']);
 const planned=h.calls[0][1];
 assert.equal(planned.commandId,'customer.contact.record');
 assert.equal(planned.params.ref.id,'c1');
 assert.equal(planned.params.quoteId,'q1');
 assert.equal(planned.params.outcome,'reached');
 assert.match(h.calls[1][1],/NOT verified provider delivery/);
 assert.equal(h.stores.events.length,0,'Only the authorized core, not the form, may write events');
 assert.equal(h.notifications,1);
});
test('cross-customer quote links are rejected before approval and no false contact is stored',async()=>{
 const h=harness();
 await assert.rejects(()=>h.submitWith('c2',{method:'Email',quoteId:'q1',
  notes:'Spoke to someone',outcome:'reached'}),/no longer matches this customer/);
 assert.equal(h.calls.length,0);
 assert.equal(h.stores.events.length,0);
});
test('customer history includes recorded contact and existing customer page hosts the form',()=>{
 assert.ok(source.includes('function tfCustomerContactForm('));
 assert.ok(source.includes('sections+=tfCustomerContactForm(d,record.id)'));
 assert.ok(source.includes("e.kind!=='customer_contact'"));
 assert.ok(source.includes('Manual record only.'));
});
