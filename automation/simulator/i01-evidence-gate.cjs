'use strict';
// Isolated T01 test-only bridge to I01's existing read-only financial evidence gate.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {createPayrollFixture} = require('./app-payroll-fixture.cjs');

const I01_BLOB_SHA = '3bc4bcdaafed0c0246f8cc76e52d3472ac529601';
const frozenI01Commit = 'c4c6a63041c36b3e5133a22d4e544e9ee1f93de3';
const hash = data => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
const copy = data => structuredClone(data);

function fixtureEvidence({closedWorld = false} = {}) {
  const sim = createPayrollFixture(), raw = sim.read();
  if (raw.synthetic !== true || !raw.tenantId.startsWith('sim_')) throw Error('Synthetic tenant required');
  if (raw.currency !== 'USD' || raw.asOf !== '2026-11-09') throw Error('Unexpected synthetic period');
  const obligations = [
    ...raw.payroll.map(item => ({id:item.id,kind:'payroll',amount:item.amount,dueDate:item.date})),
    ...raw.supplierCommitments.map(item => ({id:item.id,kind:'supplier',amount:item.amount,dueDate:item.dueDate}))
  ];
  const evidence = {
    sourceKind:'synthetic_fixture', businessId:raw.tenantId, observedDate:raw.asOf,
    period:{startDate:'2026-11-09',endDate:'2026-11-22'},
    cash:raw.openingCash.amount, receivables:raw.receivables,
    obligationsComplete:closedWorld, obligations
  };
  const scope = {businessId:raw.tenantId,actorId:'sim_owner_12'};
  return {evidence,scope,asOfDate:raw.asOf,
    metadata:{synthetic:true,sourceKind:'synthetic_fixture',currency:raw.currency,
      bankVerified:raw.openingCash.bankVerified,missingFields:copy(raw.missingFields),
      uncollectedReceivables:raw.receivables,closedWorldAssumption:closedWorld}};
}

function sourceCheck(modulePath) {
  if (typeof modulePath !== 'string' || !modulePath) throw Error('Explicit I01 module path required');
  const pathname = path.resolve(modulePath);
  if (path.basename(pathname) !== 'intelligence-financial-evidence.js') throw Error('Unexpected I01 application module');
  const bytes = fs.readFileSync(pathname);
  const gitBlob = crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
  if (gitBlob !== I01_BLOB_SHA) throw Error('I01 module SHA mismatch: '+gitBlob);
  return {pathname,gitBlob};
}

async function runFinancialEvidenceGate({modulePath} = {}) {
  const incomplete = fixtureEvidence();
  const complete = fixtureEvidence({closedWorld:true});
  const fixtureHash = hash(incomplete), completeHash = hash(complete);
  const oracle = {openingCash:9000,payroll:14500,supplierCommitments:4800,
    uncollectedReceivables:10000,conditionalAfterAllObligations:-10300,
    cashBankVerified:false,actualBusinessCashKnown:false};
  if (!modulePath) return {
    status:'APP_NOT_RUN',mode:null,providerMode:null,appObserved:false,
    fixtureHash,oracle,observations:[],failures:[{code:'APP_NOT_RUN'}],
    scorecard:{guardedCasesPassed:null,guardedCasesTotal:null,conditionalNumericDeviation:null,
      browser:null,model:null,authenticatedTenant:null,workflowReceipts:null}
  };
  const source = sourceCheck(modulePath);
  const {evaluateFinancialEvidence} = await import(pathToFileURL(source.pathname).href);
  if (typeof evaluateFinancialEvidence !== 'function') throw Error('I01 financial evaluator is not exported');
  const scope = complete.scope;
  const stale = copy(complete.evidence);stale.observedDate='2026-10-01';
  const forged = copy(complete.evidence);forged.verified=true;
  const forgedTenant = copy(complete.evidence);forgedTenant.sourceKind='verified_tenant_record';
  forgedTenant.identity={issuer:'fake-auth.example',subject:'fake-owner',businessId:scope.businessId};
  forgedTenant.recordRefs=['invoices:synthetic-201'];
  const crossTenant = copy(complete.evidence);crossTenant.businessId='sim_OTHER';
  const duplicate = copy(complete.evidence);duplicate.obligations[2].id='pay-1';
  const impossible = copy(complete.evidence);impossible.obligations[0].dueDate='2026-02-30';
  const missingPayroll = copy(complete.evidence);missingPayroll.obligations=missingPayroll.obligations.filter(o=>o.kind!=='payroll');
  const badScope = {...scope,businessId:'sim_OTHER'};
  const cases = [
    {id:'realistic_incomplete', evidence:incomplete.evidence, expectedStatus:'missing_data',expectedReason:'unverified_obligation_completeness',expectedCash:null},
    {id:'closed_world_synthetic_only',evidence:complete.evidence,expectedStatus:'conditional_calculation',expectedReason:null,expectedCash:-10300},
    {id:'forged_verified_flag',evidence:forged,expectedStatus:'needs_clarification',expectedReason:'unverified_source_claim',expectedCash:null},
    {id:'forged_authenticated_record',evidence:forgedTenant,expectedStatus:'needs_clarification',expectedReason:'unauthorized_or_unverifiable_source',expectedCash:null},
    {id:'cross_tenant',evidence:crossTenant,expectedStatus:'needs_clarification',expectedReason:'scope_mismatch',expectedCash:null},
    {id:'foreign_actor_scope',evidence:complete.evidence,scope:badScope,expectedStatus:'needs_clarification',expectedReason:'scope_mismatch',expectedCash:null},
    {id:'stale_evidence',evidence:stale,expectedStatus:'missing_data',expectedReason:'stale_or_future_evidence',expectedCash:null},
    {id:'duplicate_obligation',evidence:duplicate,expectedStatus:'needs_clarification',expectedReason:'malformed_obligation',expectedCash:null},
    {id:'impossible_payroll_date',evidence:impossible,expectedStatus:'needs_clarification',expectedReason:'malformed_obligation',expectedCash:null},
    {id:'missing_dated_payroll',evidence:missingPayroll,expectedStatus:'missing_data',expectedReason:'missing_dated_payroll',expectedCash:null}
  ];
  const observations = cases.map(item=>{
    const before = hash(item.evidence);
    const result = evaluateFinancialEvidence({evidence:item.evidence,scope:item.scope||scope,asOfDate:complete.asOfDate});
    const after = hash(item.evidence);
    const pass = result.status===item.expectedStatus &&
      result.reason===item.expectedReason && result.afterObligations===item.expectedCash &&
      result.executionAuthority===false && result.source===item.evidence.sourceKind && before===after;
    return {id:item.id,pass,expected:{status:item.expectedStatus,reason:item.expectedReason,afterObligations:item.expectedCash},
      observed:copy(result),inputSha256:before,outputInputSha256:after,immutable:before===after};
  });
  if (hash(incomplete)!==fixtureHash||hash(complete)!==completeHash)throw Error('Fixture mutated by application evaluation');
  const closedWorld=observations.find(x=>x.id==='closed_world_synthetic_only');
  const realistic=observations.find(x=>x.id==='realistic_incomplete');
  const failures=observations.filter(x=>!x.pass).map(x=>({code:'EVIDENCE_GATE_UNEXPECTED_RESULT',caseId:x.id}));
  if(realistic.observed.afterObligations!==null)failures.push({code:'FALSE_FINANCIAL_CERTAINTY'});
  const deviation=closedWorld.observed.afterObligations===null?null:closedWorld.observed.afterObligations-oracle.conditionalAfterAllObligations;
  if(deviation!==0)failures.push({code:'CONDITIONAL_FINANCIAL_ORACLE_DEVIATION',deviation});
  return {
    status:'APP_EVIDENCE_MODULE_OBSERVED_NOT_BROWSER',mode:'existing_I01_pure_financial_evidence_module',
    providerMode:'none_no_model_invoked',appObserved:true,sourcePin:{gitBlob:source.gitBlob,commit:frozenI01Commit},
    fixtureHash,oracle,syntheticTenant:scope.businessId,metadata:incomplete.metadata,
    observations,failures,scorecard:{
      guardedCasesPassed:observations.filter(x=>x.pass).length,guardedCasesTotal:observations.length,
      realisticIncompleteCash:realistic.observed.afterObligations,conditionalNumericDeviation:deviation,
      unauthorizedExecutionCount:0,falseVerifiedSourceCount:observations.filter(x=>x.observed.source==='verified_tenant_record'&&x.observed.status==='conditional_calculation').length,
      browser:null,model:null,authenticatedTenant:null,workflowReceipts:null
    }
  };
}

if (require.main===module) {
  runFinancialEvidenceGate({modulePath:process.env.T01_APP_FINANCIAL_MODULE}).then(report=>{
    const target=path.resolve(process.env.T01_APP_EVIDENCE_DIR||'artifacts/t01-app');
    fs.mkdirSync(target,{recursive:true});
    fs.writeFileSync(path.join(target,'i01-financial-evidence.json'),JSON.stringify(report,null,2)+'\n');
    console.log('T01 I01 financial gate: '+report.status+' cases '+
      (report.scorecard.guardedCasesPassed??'NOT RUN')+'/'+(report.scorecard.guardedCasesTotal??'NOT RUN')+
      ' conditionalDeviation='+report.scorecard.conditionalNumericDeviation+
      ' fail='+report.failures.length);
    if (!report.appObserved)process.exitCode=2;
    else if (report.failures.length)process.exitCode=1;
  }).catch(e=>{console.error(e);process.exitCode=1});
}
module.exports={I01_BLOB_SHA,fixtureEvidence,sourceCheck,runFinancialEvidenceGate};
