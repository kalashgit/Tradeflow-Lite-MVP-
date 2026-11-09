'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createPayrollFixture} = require('../automation/simulator/app-payroll-fixture.cjs');
const {verifySource, ownerQuestions, evaluateOwnerJourney} = require('../automation/simulator/owner-journey-evaluation.cjs');

test('no application invocation must never claim execution or numeric application coverage', async () => {
  const output = await evaluateOwnerJourney();
  assert.equal(output.status, 'APP_NOT_RUN');
  assert.equal(output.appModuleObserved, false);
  assert.equal(output.scorecard.ownerIntentAnswered, null);
  assert.equal(output.scorecard.appPayrollNumericDeviation, null);
  assert.equal(output.scorecard.modelAccuracy, null);
  assert.equal(output.results.length, 0);
  assert.equal(output.failures[0].code, 'APP_MODULE_NOT_EXECUTED');
});

test('pinned application module denies arbitrary, missing and changed source', () => {
  assert.throws(() => verifySource(''), /Explicit TradeFlow/);
  assert.throws(() => verifySource('/tmp/evil-app.js'), /Unexpected application module/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tradeflow-t01-'));
  try {
    const target = path.join(dir, 'intelligence-payroll-risk.js');
    fs.writeFileSync(target, 'export function analyzePayrollRisk() { return {executionAuthority: true} }\n');
    assert.throws(() => verifySource(target), /Application source SHA mismatch/);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('owner questions use explicitly labeled synthetic inputs without real tenant identity', () => {
  const evidence = createPayrollFixture().read();
  const questions = ownerQuestions(evidence);
  assert.equal(questions.length, 5);
  assert.ok(questions[0].text.includes('Which jobs threaten payroll'));
  assert.ok(!questions.some(item => /@|555-\d{4}|https?:\/\//.test(item.text)));
  assert.equal(evidence.tenantId, 'sim_TF_SIM_12');
  assert.equal(evidence.openingCash.bankVerified, false);
});

test('real pinned app parser distinguishes missing binding, explicit scenario, and unsafe ambiguity', async t => {
  if (!process.env.T01_APP_PAYROLL_MODULE) {
    t.skip('No frozen TradeFlow app module supplied: real app execution NOT RUN');
    return;
  }
  const report = await evaluateOwnerJourney({modulePath: process.env.T01_APP_PAYROLL_MODULE});
  assert.equal(report.status, 'APPLICATION_MODULE_OBSERVED_NOT_BROWSER');
  assert.equal(report.appModuleObserved, true);
  assert.equal(report.providerMode, 'none_no_model_invoked');
  assert.equal(report.results[0].actual, null);
  assert.equal(report.results[0].pass, false);
  assert.equal(report.results[1].actual, 'conditional_calculation');
  assert.equal(report.results[1].source, 'user_scenario');
  assert.equal(report.results[1].afterPayroll, -5500);
  assert.equal(report.results[2].actual, 'needs_clarification');
  assert.equal(report.results[3].actual, 'needs_clarification');
  assert.equal(report.results[4].actual, 'missing_data');
  assert.equal(report.scorecard.guardedQuestionCasesPassed, 4);
  assert.equal(report.scorecard.guardedQuestionCasesTotal, 4);
  assert.equal(report.scorecard.appPayrollNumericDeviation, 0);
  assert.equal(report.scorecard.fullObligationDeviation, 4800);
  assert.equal(report.provenance.authenticatedRecords, false);
  assert.equal(report.observedApplicationPayroll.source, 'synthetic_fixture');
  assert.equal(report.observedApplicationPayroll.executionAuthority, false);
  assert.deepEqual(report.failures.map(x => x.code), [
    'MISSING_OWNER_QUESTION_EVIDENCE_BINDING', 'SUPPLIER_COMMITMENTS_NOT_INCLUDED'
  ]);
  assert.equal(report.scorecard.modelAccuracy, null);
  assert.equal(report.scorecard.browserPersistence, null);
  assert.equal(report.scorecard.tenantAuthorization, null);
  assert.ok(report.trace.some(x => x.kind === 'application_payroll_function'));
});
