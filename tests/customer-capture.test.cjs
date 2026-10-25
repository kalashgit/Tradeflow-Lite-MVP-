'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const capture=require('../public/customer-capture.js'),records=require('../public/record-interpreter.js');
function setup(customers=[]){
 const listeners={},plans=[],doc={addEventListener:(type,fn)=>{(listeners[type]??=[]).push(fn)},querySelector:()=>null};
 const host={document:doc,snapshot:async()=>({customers}),context:()=>({businessId:'local-business'}),interpreter:records,
  commands:{prepare:async request=>{plans.push(request);return {id:'pilot:command:test',status:'needs_review'}},approve:async()=>({status:'approved'}),execute:async()=>({status:'succeeded',result:{id:'customer-new'}})},
  hashSource:async()=> 'a'.repeat(64),repaint:async()=>{},show:async()=>{},close:async()=>{},openRecord:async()=>{},notify:()=>{},confirm:()=>true,prepareLinked:async()=>{}};
 return {controller:capture.createController(host),listeners,plans};
}
test('customer input remains unsaved until explicit review',async()=>{
 const {controller,plans}=setup();await controller.start();assert.match(controller.view(),/Describe a customer/);
 const review=await controller.openReview('Add customer Jane Doe, phone 512-555-0198');
 assert.equal(review.status,'needs_review');assert.match(controller.view(),/Confirm &amp; save customer|Confirm & save customer/);
 assert.equal(plans.length,0);
});
test('review edits are revalidated and duplicate acknowledgement is forwarded explicitly',async()=>{
 const {controller,plans}=setup([{id:'existing',name:'Jane Doe',phone:''}]);
 let review=await controller.openReview('Add customer Jane Doe, phone 512-555-0198');
 assert.equal(review.duplicates.length,1);assert.match(controller.view(),/Possible existing customers/);
 review=await controller.correct(review,{email:'INVALID'});assert.equal(review.status,'needs_clarification');
 review=await controller.correct(review,{email:'jane@example.com'});assert.equal(review.status,'needs_review');
 await controller.prepareCustomer(review);assert.deepEqual(plans[0].params.reviewedDuplicateIds,[]);
 await controller.prepareCustomer(review,{reviewedDuplicateIds:['existing']});assert.deepEqual(plans[1].params.reviewedDuplicateIds,['existing']);
});
test('original wording is opt-in',async()=>{
 const {controller,plans}=setup();const review=await controller.openReview('Add customer Jane Doe, phone 512-555-0198');
 await controller.prepareCustomer(review);assert.equal(plans[0].params.sourceHash,'');
 await controller.prepareCustomer(review,{retainOriginal:true,originalText:'Add customer Jane Doe'});
 assert.equal(plans[1].params.sourceHash,'a'.repeat(64));
});
