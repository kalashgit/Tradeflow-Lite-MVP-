/* Pure, read-only scenario calculation. User statements are never saved business evidence. */
const money = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const fmt = value => '$' + value.toLocaleString('en-US', {maximumFractionDigits: 2});

export function analyzePayrollRisk({cash, receivables, weeklyPayroll, periodDays = 14, source = 'user_scenario'} = {}) {
 if (!['user_scenario', 'synthetic_fixture'].includes(source)) throw Error('Untrusted scenario provenance');
 if (periodDays !== 14) throw Error('Only the explicit 14-day scenario is supported');
 const knownCash = money(cash), knownReceivables = money(receivables), knownPayroll = money(weeklyPayroll);
 const twoWeekPayroll = knownPayroll === null ? null : knownPayroll * 2;
 if (twoWeekPayroll !== null && !Number.isSafeInteger(twoWeekPayroll)) throw Error('Unsafe payroll arithmetic');
 const afterPayroll = knownCash === null || twoWeekPayroll === null ? null : knownCash - twoWeekPayroll;
 const lines = [
  source === 'user_scenario' ? 'HYPOTHETICAL OWNER-SUPPLIED SCENARIO — not saved TradeFlow business records.' : 'SYNTHETIC SIMULATION — not real business records.',
  '14-day payroll exposure (conditional calculation, not a cash-flow forecast):',
  'Opening cash: ' + (knownCash === null ? 'unknown' : fmt(knownCash)) + '.',
  'Receivables: ' + (knownReceivables === null ? 'unknown' : fmt(knownReceivables)) + '. Receivables are not available cash until collected.',
  'Weekly payroll: ' + (knownPayroll === null ? 'unknown — cannot calculate payroll coverage' : fmt(knownPayroll)) + '.',
  twoWeekPayroll === null ? 'Two-week payroll requirement: unknown.' : 'Two weekly payroll amounts: 2 × ' + fmt(knownPayroll) + ' = ' + fmt(twoWeekPayroll) + '.',
  afterPayroll === null ? 'Cash remaining after payroll: cannot calculate from the supplied figures.' : 'Cash less two weekly payroll amounts: ' + fmt(knownCash) + ' − ' + fmt(twoWeekPayroll) + ' = ' + fmt(afterPayroll) + (afterPayroll < 0 ? ' shortfall.' : ' before other expenses.'),
  'Unknowns: exact payroll dates and amounts, payroll taxes/benefits, restricted cash, committed supplier and subcontractor payments, invoice collection dates and probabilities, and job-level cash outflows.',
  'Project ranking: insufficient job-level payment and cost timing to identify which individual projects threaten cash first.',
  'Priority: verify dated payroll obligations and bank availability; then reconcile collectible invoices and near-term project commitments. Propose an internal cash review only after record verification and explicit approval.',
  'No record was changed, invoice sent, payment made, or workflow executed.'
 ];
 return Object.freeze({source,periodDays,cash:knownCash,receivables:knownReceivables,weeklyPayroll:knownPayroll,twoWeekPayroll,afterPayroll,executionAuthority:false,content:lines.join('\n')});
}

function extractAmount(text, label) {
 const amount = '(?:\\$\\s*)?(\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
 const expression = new RegExp('(?:' + amount + '\\s+(?:in\\s+)?' + label + '|' + label + '\\s*(?:of|is|:|=)\\s*' + amount + ')', 'i');
 const match = expression.exec(text);
 if (!match) return null;
 const value = Number((match[1] || match[2]).replaceAll(',', ''));
 return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function analyzeOwnerPayrollQuestion(text) {
 if (typeof text !== 'string' || text.length > 6000 || !/\b(?:payroll|paychecks?)\b/i.test(text) ||
     !/\b(?:next\s+(?:two|2)\s+weeks|14\s+days|cash\s+position|cash.flow|threaten\s+payroll)\b/i.test(text)) return null;
 const cash = extractAmount(text, 'cash');
 const receivables = extractAmount(text, '(?:accounts\\s+)?receivables?');
 const weeklyPayroll = extractAmount(text, 'weekly\\s+payroll');
 if (cash === null && receivables === null && weeklyPayroll === null) return null;
 return analyzePayrollRisk({cash,receivables,weeklyPayroll,source:'user_scenario'});
}
