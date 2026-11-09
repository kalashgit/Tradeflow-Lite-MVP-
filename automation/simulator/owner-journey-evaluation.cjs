'use strict';
// T01 only: observe existing TradeFlow calculator + owner-question route without production storage.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {createPayrollFixture, evaluateAppPayroll} = require('./app-payroll-fixture.cjs');

const FROZEN_CALCULATOR_BLOB = 'c0e60de3a812b066f94f5d7ed82dbe9a963f8866';
const QUESTION = 'Which jobs threaten payroll in the next two weeks and what should I do first?';
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function verifySource(modulePath, expectedBlob = FROZEN_CALCULATOR_BLOB) {
  if (typeof modulePath !== 'string' || !modulePath) throw Error('Explicit TradeFlow application module path required');
  const absolute = path.resolve(modulePath);
  if (path.basename(absolute) !== 'intelligence-payroll-risk.js') throw Error('Unexpected application module');
  const bytes = fs.readFileSync(absolute);
  const actualBlob = crypto.createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
  if (actualBlob !== expectedBlob) throw Error('Application source SHA mismatch; X01 must reapprove changed contract: ' + actualBlob);
  return {absolute, blobSha: actualBlob};
}

function ownerQuestions(evidence) {
  const values = 'cash $' + evidence.openingCash.amount + '; receivables $' + evidence.receivables +
    '; weekly payroll $' + evidence.payroll[0].amount;
  return [
    {id: 'owner-intent-without-record-binding', text: QUESTION, expected: 'conditional_calculation'},
    {id: 'explicit-owner-figures', text: QUESTION + ' ' + values, expected: 'conditional_calculation'},
    {id: 'contradictory-cash', text: QUESTION + ' cash $9000; cash $8000; weekly payroll $7250', expected: 'needs_clarification'},
    {id: 'unverified-supplier-outflow', text: QUESTION + ' cash $9000; weekly payroll $7250; materials $4800', expected: 'needs_clarification'},
    {id: 'missing-payroll-amount', text: QUESTION + ' cash $9000; receivables $10000', expected: 'missing_data'}
  ];
}

async function evaluateOwnerJourney({modulePath, expectedBlob = FROZEN_CALCULATOR_BLOB} = {}) {
  const s = createPayrollFixture(), evidence = s.read(), fixtureHash = digest(evidence);
  const oracle = {
    openingCash: evidence.openingCash.amount,
    payroll: evidence.payroll.reduce((sum, x) => sum + x.amount, 0),
    supplierCommitments: evidence.supplierCommitments.reduce((sum, x) => sum + x.amount, 0),
    confirmedCollections: 0
  };
  oracle.conditionalCashAfterObligations = oracle.openingCash - oracle.payroll - oracle.supplierCommitments;
  const unobserved = {
    status: 'APP_NOT_RUN', applicationMode: null, providerMode: null, appModuleObserved: false,
    syntheticTenant: evidence.tenantId, fixtureHash, oracle, results: [],
    scorecard: {ownerIntentAnswered: null, appPayrollNumericDeviation: null, fullObligationDeviation: null,
      modelAccuracy: null, browserPersistence: null, authenticatedEvidence: null, tenantAuthorization: null},
    failures: [{code: 'APP_MODULE_NOT_EXECUTED', severity: 'BLOCKED'}], trace: []
  };
  if (!modulePath) return unobserved;

  const source = verifySource(modulePath, expectedBlob);
  const {analyzeOwnerPayrollQuestion} = await import(pathToFileURL(source.absolute).href);
  if (typeof analyzeOwnerPayrollQuestion !== 'function') throw Error('Existing owner-question route not exported');
  const trace = [{kind: 'source_pin', applicationBlobSha: source.blobSha, frozenIntegration: 'e74f5655dc5ab36400b353723c5e0f90021ad330'},
    {kind: 'fixture_snapshot', sha256: fixtureHash, tenant: evidence.tenantId, provenance: 'synthetic_fixture'}];

  const results = ownerQuestions(evidence).map(({id, text, expected}) => {
    const response = analyzeOwnerPayrollQuestion(text);
    const actual = response?.status ?? null;
    const sourceLabel = response?.source ?? null;
    if (response && (sourceLabel !== 'user_scenario' || response.executionAuthority !== false))
      throw Error('Scenario input promoted into authenticated evidence or action authority');
    const observation = {
      id, inputProvenance: 'synthetic_owner_statement_not_records', expected, actual,
      pass: actual === expected, source: sourceLabel, afterPayroll: response?.afterPayroll ?? null,
      executionAuthority: response?.executionAuthority ?? null, content: response?.content ?? null
    };
    trace.push({kind: 'existing_owner_question_function', id, status: actual,
      source: sourceLabel, noDatabaseWritesByPureFunction: true});
    return observation;
  });

  const app = await evaluateAppPayroll({modulePath: source.absolute});
  if (!app.appObserved || app.provenanceVerified !== true || app.observed?.executionAuthority !== false)
    throw Error('Existing application calculation failed synthetic evidence or authorization check');
  const afterHash = digest(s.read());
  if (fixtureHash !== afterHash || s.reset() !== fixtureHash) throw Error('Application changed isolated fixture state');
  if (app.observed.afterPayroll !== evidence.openingCash.amount - oracle.payroll)
    throw Error('Payroll-only calculator deviates from payroll oracle');

  const failures = [];
  if (!results[0].pass) failures.push({
    code: 'MISSING_OWNER_QUESTION_EVIDENCE_BINDING', severity: 'P0',
    expected: results[0].expected, observed: results[0].actual,
    detail: 'An unbound owner question returned no financial answer. Do not synthesize verified business values.'
  });
  const fullDeviation = app.observed.afterPayroll - oracle.conditionalCashAfterObligations;
  if (fullDeviation !== 0) failures.push({
    code: 'SUPPLIER_COMMITMENTS_NOT_INCLUDED', severity: 'P1',
    expectedConditionalCash: oracle.conditionalCashAfterObligations,
    observedPayrollOnlyCash: app.observed.afterPayroll, numericDeviation: fullDeviation,
    detail: 'The existing application function is payroll-only; supplier outflow remains an explicit unmet cash-flow requirement.'
  });
  for (const result of results.filter(x => !x.pass && x.id !== results[0].id))
    failures.push({code: 'OWNER_QUESTION_MISMATCH', severity: 'P1', caseId: result.id, expected: result.expected, actual: result.actual});

  trace.push({kind: 'application_payroll_function', source: app.observed.source, status: app.observed.status,
    observedAfterPayroll: app.observed.afterPayroll, conditionalFullCash: oracle.conditionalCashAfterObligations,
    numericDeviation: fullDeviation, authority: app.observed.executionAuthority, noExternalToolsInvoked: true});
  return {
    status: 'APPLICATION_MODULE_OBSERVED_NOT_BROWSER', applicationMode: 'existing_pure_application_functions',
    providerMode: 'none_no_model_invoked', applicationBlobSha: source.blobSha, appModuleObserved: true,
    syntheticTenant: evidence.tenantId, currency: evidence.currency, asOf: evidence.asOf,
    openingCashBankVerified: evidence.openingCash.bankVerified, fixtureHash,
    provenance: {fixture: 'synthetic_fixture', questionParser: 'user_scenario', authenticatedRecords: false},
    oracle, results, observedApplicationPayroll: app.observed,
    scorecard: {ownerIntentAnswered: results[0].pass, guardedQuestionCasesPassed: results.slice(1).filter(x => x.pass).length,
      guardedQuestionCasesTotal: results.length - 1,
      appPayrollNumericDeviation: app.observed.afterPayroll - (oracle.openingCash - oracle.payroll),
      fullObligationDeviation: fullDeviation, modelAccuracy: null, browserPersistence: null,
      authenticatedEvidence: null, tenantAuthorization: null},
    failures, trace
  };
}

if (require.main === module) {
  evaluateOwnerJourney({modulePath: process.env.T01_APP_PAYROLL_MODULE}).then(report => {
    const dir = path.resolve(process.env.T01_APP_EVIDENCE_DIR || 'artifacts/t01-app');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'owner-journey.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('T01 owner journey: ' + report.status + '; owner question answered=' +
      report.scorecard.ownerIntentAnswered + '; guarded=' +
      report.scorecard.guardedQuestionCasesPassed + '/' + report.scorecard.guardedQuestionCasesTotal +
      '; full obligation deviation=' + report.scorecard.fullObligationDeviation +
      '; product failures=' + report.failures.length);
    if (!report.appModuleObserved) process.exitCode = 2;
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = {FROZEN_CALCULATOR_BLOB, QUESTION, verifySource, ownerQuestions, evaluateOwnerJourney};
