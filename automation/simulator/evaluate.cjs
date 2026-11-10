'use strict';
// T01: deterministic, memory-only contractor scenario laboratory. No network, IDB, D1 or commands.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const fixture=require('./businesses.v1.json');
const clone=x=>structuredClone(x);
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const must=(v,msg)=>{if(!v)throw Error(msg)};
const money=n=>{must(Number.isSafeInteger(n)&&n>=0,'Invalid financial amount');return n};
function day(s){
 must(typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s),'Invalid Gregorian date');
 const [year,month,date]=s.split('-').map(Number);
 const leap=year%4===0&&(year%100!==0||year%400===0);
 const lengths=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 must(year>=1&&date<=lengths[month-1],'Invalid Gregorian date');
 const utc=new Date(0);utc.setUTCFullYear(year,month-1,date);utc.setUTCHours(0,0,0,0);return utc.getTime();
}
const diff=(a,b)=>Math.round((day(b)-day(a))/86400000);
function validate(b){
 must(b?.name?.includes('SYNTHETIC'),'Synthetic business required');
 const groups=['customers','quotes','jobs','invoices','payments','calendarEntries','opportunities'];
 const ids=new Map();for(const g of groups){const list=b[g]||[];must(new Set(list.map(x=>x.id)).size===list.length,'Duplicate '+g);ids.set(g,new Set(list.map(x=>x.id)))}
 for(const r of b.jobs)must(ids.get('customers').has(r.customerId),'Invalid job customer');
 for(const r of b.quotes)must(ids.get('customers').has(r.customerId),'Invalid quote customer');
 for(const r of b.invoices){must(ids.get('customers').has(r.customerId)&&(!r.jobId||ids.get('jobs').has(r.jobId)),'Invalid invoice link');money(r.amount)}
 for(const r of b.payments){must(ids.get('invoices').has(r.invoiceId),'Invalid payment link');money(r.amount)}
 return true;
}
function session(id){
 const original=fixture.businesses.find(b=>b.id===id);validate(original);
 let state=clone(original),events=[];
 return {id,namespace:'sim_'+id.replaceAll('-','_'),read:()=>clone(state),trace:()=>clone(events),reset(){state=clone(original);events=[];return digest(state)},
  apply(event){const before=digest(state),next=clone(state);
   if(event.type==='payment'){
    const i=next.invoices.find(x=>x.id===event.invoiceId);must(i,'Invoice unavailable');money(event.amount);
    const paid=next.payments.filter(x=>x.invoiceId===i.id).reduce((n,x)=>n+x.amount,0);
    must(paid+event.amount<=i.amount,'Overpayment');
    next.payments.push({id:'sim_payment_'+(next.payments.length+1),invoiceId:i.id,amount:event.amount,confirmed:true});
   }else if(event.type==='delay'){
    must(typeof event.date==='string','Expected date');day(event.date);next.simulatedDeliveryDate=event.date;
   }else throw Error('Unsupported event');
   state=next;events.push({index:events.length+1,event:clone(event),before,after:digest(state)});return this.read();
  }};
}
const cases=[
 {id:'S01-overdue',business:'TF-SIM-05',kind:'receivable',expected:{balance:2600,overdue:true}},
 {id:'S01-cost-overrun',business:'TF-SIM-05',kind:'margin',expected:{costOverrun:1150,laborHoursOver:8}},
 {id:'S01-quote-followup',business:'TF-SIM-05',kind:'quote',expected:{daysSinceSent:19,sendAuthorized:false}},
 {id:'S01-unprofitable-risk',business:'TF-SIM-05',kind:'profit',expected:{costAboveBudget:1150,realizedProfitKnown:false}},
 {id:'S02-cash-crisis',business:'TF-SIM-12',kind:'cash',expected:{knownGap:10300,collectibleCash:0}},
 {id:'S02-unsigned-change',business:'TF-SIM-12',kind:'change',expected:{unapproved:1500,billingAuthorized:false}},
 {id:'S02-supplier-delay',business:'TF-SIM-12',kind:'supplier',expected:{exposureDays:4}},
 {id:'S02-recovery',business:'TF-SIM-12',kind:'recovery',expected:{knownGap:10300,priority:'verify-cash'}},
 {id:'S03-crew-conflict',business:'TF-SIM-20',kind:'crew',expected:{overlapMinutes:60}},
 {id:'S03-overload',business:'TF-SIM-20',kind:'overload',expected:{conflicts:1,bidReady:false}},
 {id:'S01-payment-progress',business:'TF-SIM-05',kind:'payment',events:[{type:'payment',invoiceId:'i-101',amount:1000}],expected:{balance:1600}},
 {id:'S02-material-extension',business:'TF-SIM-12',kind:'extension',events:[{type:'delay',date:'2026-11-21'}],expected:{exposureDays:7}}
];
function runCase(spec){
 const s=session(spec.business),before=digest(s.read());for(const e of spec.events||[])s.apply(e);
 const b=s.read(),refs=[],result={};const at=id=>b.jobs.find(x=>x.id===id);
 switch(spec.kind){
 case 'receivable':case 'payment':{
  const i=b.invoices.find(x=>x.id==='i-101');const paid=b.payments.filter(p=>p.invoiceId===i.id).reduce((n,p)=>n+money(p.amount),0);
  result.balance=money(i.amount)-paid;result.overdue=day(i.dueDate)<day('2026-11-09');refs.push('invoices:'+i.id,'jobs:'+i.jobId);break;
 }
 case 'margin':case 'profit':{
  const j=at('j-101');result.costOverrun=j.actualCost-j.budget;result.laborHoursOver=j.actualLaborHours-j.estimatedLaborHours;
  result.costAboveBudget=result.costOverrun;result.realizedProfitKnown=false;refs.push('jobs:'+j.id);break;
 }
 case 'quote':{
  const q=b.quotes[0];result.daysSinceSent=diff(q.sentDate,'2026-11-09');result.sendAuthorized=false;refs.push('quotes:'+q.id);break;
 }
 case 'cash':case 'recovery':{
  // Explicit scenario overlay: unavailable in app schema; no settlement inferred from receivables.
  const opening=9000,payroll=14500,suppliers=4800;
  result.knownGap=Math.max(0,payroll+suppliers-opening);result.collectibleCash=0;result.priority='verify-cash';refs.push('jobs:j-201');break;
 }
 case 'change':{
  const c=at('j-201').changeOrders[0];result.unapproved=c.status==='approved'?0:c.amount;result.billingAuthorized=c.status==='approved';refs.push('jobs:j-201');break;
 }
 case 'supplier':case 'extension':{
  result.exposureDays=Math.max(0,diff('2026-11-14',b.simulatedDeliveryDate||'2026-11-18'));refs.push('jobs:j-201');break;
 }
 case 'crew':case 'overload':{
  let conflicts=0,overlap=0;const rows=b.calendarEntries||[];
  const mins=x=>Number(x.time.slice(0,2))*60+Number(x.time.slice(3));
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
   const a=rows[i],c=rows[j];if(a.date!==c.date||a.assignedTo!==c.assignedTo)continue;
   const n=Math.max(0,Math.min(mins(a)+a.durationMinutes,mins(c)+c.durationMinutes)-Math.max(mins(a),mins(c)));
   if(n){conflicts++;overlap+=n}
  }
  result.overlapMinutes=overlap;result.conflicts=conflicts;
  result.bidReady=(b.opportunities||[]).every(o=>o.bidInvitationVerified==='Yes'&&o.bidCapacityChecked==='Yes');
  refs.push(...rows.map(x=>'calendarEntries:'+x.id));break;
 }
 default:throw Error('Unsupported case');
 }
 const checks=Object.entries(spec.expected).map(([key,expected])=>({key,expected,actual:result[key],pass:result[key]===expected}));
 const trace=s.trace();s.reset();must(digest(s.read())===before,'Reset mismatch');
 return {id:spec.id,company:spec.business,synthetic:true,mode:'oracle_only',before,trace,after:digest(b),refs,checks,
  pass:checks.every(c=>c.pass),appObserved:false,externalActions:0};
}
function run(){
 must(fixture.synthetic,'Synthetic manifest required');fixture.businesses.forEach(validate);
 const results=cases.map(spec=>{try{return runCase(spec)}catch(error){return {id:spec.id,pass:false,error:error.message,checks:[],appObserved:false}}});
 const checks=results.flatMap(x=>x.checks);
 return {schemaVersion:1,scope:'synthetic_oracles_not_app_evaluation',runId:digest({fixtures:fixture,cases}).slice(0,16),
  companyCount:fixture.businesses.length,scenarioCount:results.length,scenarioPasses:results.filter(x=>x.pass).length,
  assertions:checks.length,assertionsPassed:checks.filter(c=>c.pass).length,
  scorecard:{numericalAccuracyAgainstApp:null,provenanceAgainstApp:null,routingAgainstApp:null,workflowSafetyAgainstApp:null,applicationCoverage:0},
  failures:results.filter(x=>!x.pass),results};
}
if(require.main===module){const r=run(),dir=path.resolve(process.env.T01_EVIDENCE_DIR||'artifacts/t01');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'scorecard.json'),JSON.stringify(r,null,2)+'\n');
 fs.writeFileSync(path.join(dir,'report.md'),`# T01 — deterministic scenario result\n\nOracle: ${r.scenarioPasses}/${r.scenarioCount}; assertions ${r.assertionsPassed}/${r.assertions}.\n\nApplication/AI: NOT RUN. Scores null.\n\n${r.failures.length?r.failures.map(x=>'- '+x.id+': '+x.error).join('\n'):'No oracle failures.'}\n\nNo real customer data, model calls, database writes or external actions.\n`);
 console.log(`T01 ${r.scenarioPasses}/${r.scenarioCount} oracle scenarios, ${r.assertionsPassed}/${r.assertions} assertions; application NOT RUN`);if(r.failures.length)process.exitCode=1;
}
module.exports={validate,session,cases,runCase,run};
