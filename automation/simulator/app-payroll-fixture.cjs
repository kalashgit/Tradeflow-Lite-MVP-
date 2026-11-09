'use strict';
// Test adapter only. No customer tenant, live browser store, Worker API or model provider.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {session}=require('./evaluate.cjs');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');

function createPayrollFixture(){
 const isolated=session('TF-SIM-12');
 const state=isolated.read();
 const invoice={id:'sim-invoice-201',jobId:'j-201',customerId:'c-201',status:'issued',amount:12000,recordedPayments:2000,
   outstanding:10000,dueDate:'2026-10-30',settlementVerified:false};
 if(!state.jobs.some(j=>j.id===invoice.jobId&&j.customerId===invoice.customerId))throw Error('Synthetic invoice link invalid');
 const data={synthetic:true,tenantId:isolated.namespace,currency:'USD',asOf:'2026-11-09',horizonDays:14,
  openingCash:{amount:9000,bankVerified:false},
  payroll:[{id:'pay-1',date:'2026-11-13',amount:7250},{id:'pay-2',date:'2026-11-20',amount:7250}],
  invoices:[invoice],receivables:10000,
  supplierCommitments:[{id:'po-201',jobId:'j-201',dueDate:'2026-11-17',amount:4800,approved:true}],
  missingFields:['bank availability verification','collection timing','payroll taxes and benefits','other project obligations','cost to complete']};
 return {read:()=>structuredClone(data),reset:()=>{isolated.reset();return hash(data)},namespace:isolated.namespace};
}
async function evaluateAppPayroll({modulePath}={}){
 const fixture=createPayrollFixture(),evidence=fixture.read();
 const oracle={cashAfterPayrollAndSuppliers:9000-14500-4800,knownShortfall:10300,confirmedCollections:0};
 if(!modulePath)return {status:'APP_NOT_RUN',providerMode:null,appObserved:false,oracle,observed:null,numericalDeviation:null,provenanceVerified:null,trace:[]};
 const target=path.resolve(modulePath);
 if(path.basename(target)!=='intelligence-payroll-risk.js'||!fs.existsSync(target))throw Error('Expected existing TradeFlow payroll application module');
 const originalHash=hash(fixture.read());const {analyzePayrollRisk}=await import(pathToFileURL(target).href);
 if(typeof analyzePayrollRisk!=='function')throw Error('TradeFlow payroll implementation unavailable');
 const start=process.hrtime.bigint();
 const result=analyzePayrollRisk({cash:evidence.openingCash.amount,receivables:evidence.receivables,
  weeklyPayroll:evidence.payroll[0].amount,periodDays:14,source:'synthetic_fixture'});
 const durationMs=Number(process.hrtime.bigint()-start)/1e6;
 if(hash(fixture.read())!==originalHash||fixture.reset()!==originalHash)throw Error('Application invocation mutated synthetic fixture');
 const observed={status:result.status,source:result.source,afterPayroll:result.afterPayroll,twoWeekPayroll:result.twoWeekPayroll,
  executionAuthority:result.executionAuthority,content:result.content};
 const deviation=typeof result.afterPayroll==='number'?result.afterPayroll-oracle.cashAfterPayrollAndSuppliers:null;
 return {status:'APP_CALCULATOR_OBSERVED_NOT_BROWSER',providerMode:'none_pure_existing_application_module',appObserved:true,
  sourceModule:target,syntheticTenant:evidence.tenantId,asOf:evidence.asOf,oracle,observed,
  numericalDeviation:deviation,provenanceVerified:result.source==='synthetic_fixture',
  supplierIncludedInObservedCalculation:deviation===0,
  externalActions:0,trace:[{kind:'synthetic_fixture_load',sha256:originalHash,recordRefs:['jobs:j-201','invoices:sim-invoice-201','supplier:po-201']},
   {kind:'application_module_call',module:'analyzePayrollRisk',providerMode:'none',durationMs,readOnly:true},
   {kind:'application_result',status:result.status,afterPayroll:result.afterPayroll,oracleCashAfterAllObligations:oracle.cashAfterPayrollAndSuppliers,deviation}]};
}
if(require.main===module){
 evaluateAppPayroll({modulePath:process.env.T01_APP_PAYROLL_MODULE}).then(result=>{
  const dir=path.resolve(process.env.T01_APP_EVIDENCE_DIR||'artifacts/t01-app');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'payroll-journey.json'),JSON.stringify(result,null,2)+'\n');
  console.log(`T01 app=${result.status}; observed=${result.observed?.afterPayroll??'null'}; oracle=${result.oracle.cashAfterPayrollAndSuppliers}; deviation=${result.numericalDeviation??'null'}; provider=${result.providerMode??'none'}`);
 }).catch(error=>{console.error(error);process.exitCode=1});
}
module.exports={createPayrollFixture,evaluateAppPayroll};
