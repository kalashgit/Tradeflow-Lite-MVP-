const test=require('node:test'),assert=require('node:assert/strict');const load=()=>import('../public/intelligence-briefing.js');
const sample=()=>({data:{jobs:[{id:'j1',title:'Shop fitout',status:'Completed',customerId:'c1',quoteId:'q1'},{id:'j2',status:'Active'},{id:'private',businessId:'other',status:'Completed'}],quotes:[{id:'q1',status:'Accepted'}],invoices:[],tasks:[{id:'t1',status:'Open'}],commandLog:[]},evaluation:{findings:[{recordRefs:[{store:'tasks',id:'t1'}],explanation:'Task overdue'},{recordRefs:[{store:'jobs',id:'private'}],explanation:'FOREIGN'}]}});
test('business briefing routes independently of job question',async()=>{const {isBusinessBriefingRequest:f}=await load();assert.equal(f('Give me an update on my business'),true);assert.equal(f('Review my job'),false)});
test('existing detector findings, blocked billing, tenant filtering and no execution',async()=>{const {createOperationalBriefing:f}=await load(),r=f(sample());assert.equal(r.activeCount,1);assert.equal(r.completedCount,1);assert.equal(r.blockedInvoiceCount,1);assert.match(r.content,/Task overdue/);assert.match(r.content,/Invoice blocked/);assert.doesNotMatch(r.content,/FOREIGN/);assert.equal(r.executionAuthority,false)});
test('missing engine fails closed',async()=>{const {createOperationalBriefing:f}=await load();assert.throws(()=>f({data:{}}),/detector evaluation/)});

test('followups are bounded and never interpreted as permission',async()=>{
 const {classifyBriefingFollowUp:f}=await load();
 assert.equal(f('Why is that job blocked?'),'why_blocked');
 assert.equal(f('Who needs to approve it?'),'who_approves');
 assert.equal(f('Prepare the review'),'open_review');
 assert.equal(f('Show me the evidence'),'show_evidence');
 assert.equal(f('Go to that job'),'open_job');
 assert.equal(f('Send the invoice'),null);
});
