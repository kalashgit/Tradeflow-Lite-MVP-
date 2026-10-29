'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('public/app.js','utf8');
const first=source.indexOf('async function tfSyncQuoteFollowUp(id,quote,previous={}){');
const last=source.indexOf('async function saveForm(form)',first);
if(first<0||last<=first)throw Error('Existing quote follow-up maintenance function missing');
const functionSource=source.slice(first,last);
// Extract the existing function into a deterministic test host; never create another application implementation.
function host(initial=[]){
 const rows=structuredClone(initial),written=[];
 const all=async name=>name==='tasks'?structuredClone(rows):[];
 const put=async (name,record)=>{assert.equal(name,'tasks');written.push(structuredClone(record));
  const i=rows.findIndex(x=>x.id===record.id);assert.ok(i>=0,'Maintenance may not create tasks');
  rows[i]=structuredClone(record)};
 const tfSyncQuoteFollowUp=new Function('all','put','window',functionSource+';return tfSyncQuoteFollowUp')(all,put,{});
 return {rows,written,run:tfSyncQuoteFollowUp};
}
test('saving sent quotation does not silently create an internal follow-up task',async()=>{
 const f=host();
 await f.run('q1',{status:'Sent',title:'Panel upgrade',customerId:'c1',followup_date:'2026-11-04'});
 assert.equal(f.rows.length,0);assert.equal(f.written.length,0);
});
test('legacy open automatic task is maintained without creating another',async()=>{
 const legacy={id:'legacy1',quoteId:'q1',title:'Follow up quote: Old description',followupAuto:true,status:'Open',
  due:'2026-11-01',customerId:'c1',ownerNotes:'Keep my notes'};
 const f=host([legacy]);
 await f.run('q1',{status:'Sent',title:'Revised panel',customerId:'c1',followup_date:'2026-11-05'});
 assert.equal(f.rows.length,1);assert.equal(f.rows[0].due,'2026-11-05');
 assert.equal(f.rows[0].ownerNotes,'Keep my notes');
 assert.equal(f.rows[0].title,'Follow up quote: Revised panel');
});
test('approved follow-up task is not silently changed on quote edit',async()=>{
 const approved={id:'approved1',quoteId:'q1',taskKind:'quotation_follow_up',
  title:'Follow up quotation: Panel',customerId:'c1',due:'2026-11-05',status:'Open'};
 const f=host([approved]);
 await f.run('q1',{status:'Sent',title:'Changed title',customerId:'c1',followup_date:'2026-11-20'});
 assert.deepEqual(f.rows[0],approved);assert.equal(f.written.length,0);
});
test('closing quote closes existing approved and legacy open follow-ups without contact claim',async()=>{
 const f=host([{id:'approved',quoteId:'q1',taskKind:'quotation_follow_up',status:'Open'},
  {id:'legacy',quoteId:'q1',followupAuto:true,status:'Open'},
  {id:'unrelated',quoteId:'q1',title:'Check materials',status:'Open'},
  {id:'otherquote',quoteId:'q2',followupAuto:true,status:'Open'}]);
 await f.run('q1',{status:'Accepted'});
 assert.equal(f.rows.find(x=>x.id==='approved').status,'Done');
 assert.equal(f.rows.find(x=>x.id==='legacy').status,'Done');
 assert.equal(f.rows.find(x=>x.id==='unrelated').status,'Open');
 assert.equal(f.rows.find(x=>x.id==='otherquote').status,'Open');
 assert.equal(f.rows.find(x=>x.id==='approved').completedReason,'quotation_closed');
 assert.ok(f.rows.every(x=>!x.lastContactAt&&!x.customerContacted));
});
