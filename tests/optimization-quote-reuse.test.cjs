'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('public/app.js','utf8');
function reusable(){
 const start=source.indexOf('function tfReusableQuoteFields('),end=source.indexOf('async function tfSyncQuoteFollowUp(',start);
 assert.ok(start>=0&&end>start,'Quote reuse helper should be present');
 return new Function(source.slice(start,end)+';return tfReusableQuoteFields;')();
}
test('copying an accepted quotation creates an unapproved draft without original customer or send dates',()=>{
 const prepare=reusable();
 const original={id:'q1',title:'Service panel upgrade',category:'Electrical',customerId:'c1',amount:'1250.00',status:'Accepted',
  sentDate:'2026-10-01',followup_date:'2026-10-10',acceptedAt:'2026-10-13',signature:'approved'};
 const draft=prepare(original);
 assert.equal(draft.title,'Service panel upgrade');assert.equal(draft.category,'Electrical');
 assert.equal(draft.amount,'1250');assert.equal(draft.status,'Draft');
 for(const field of ['id','signature','acceptedAt'])assert.ok(!(field in draft));
 assert.equal(draft.customerId,'');assert.equal(draft.sentDate,'');assert.equal(draft.followup_date,'');
 assert.equal(original.status,'Accepted','Source quotation remains unchanged');
});
test('unknown or invalid amounts cannot be copied into a draft as money',()=>{
 const fn=reusable();assert.equal(fn({amount:'nonsense'}).amount,'');
 assert.equal(fn({amount:''}).amount,'');
});
test('existing quotation detail offers reuse, retaining the existing editor and save path',()=>{
 assert.ok(source.includes('data-action="tfQuoteReuse"'));
 assert.ok(source.includes('modal={draftDefaults:tfReusableQuoteFields(source)}'));
 assert.ok(source.includes("if(tab==='quotes')await tfSyncQuoteFollowUp(id,f,old)"));
});
