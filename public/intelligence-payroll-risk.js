/* Pure, read-only scenario calculation. User statements are never saved business evidence. */
import {strictFinancialDate} from './intelligence-financial-evidence.js';
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
 return Object.freeze({status:afterPayroll === null ? 'missing_data' : 'conditional_calculation',source,periodDays,cash:knownCash,receivables:knownReceivables,weeklyPayroll:knownPayroll,twoWeekPayroll,afterPayroll,executionAuthority:false,content:lines.join('\n')});
}

function extractAmounts(text, label) {
 const amount = '(?:\\$\\s*)?((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?)';
 const suffix = new RegExp(amount + '\\s+(?:in\\s+)?' + label + '\\b', 'gi');
 const prefix = new RegExp('\\b' + label + '(?:\\s+balance)?\\s*(?:of|is|was|:|=)?\\s*' + amount, 'gi');
 const occurrences=[];
 for(const pattern of [suffix,prefix]){
  for(const match of text.matchAll(pattern)){
   // Do not silently round or reinterpret cents, partial amounts, or unsafe integers.
   const raw=match[1] || match[2];
   const value=Number(raw.replaceAll(',',''));
   occurrences.push({start:match.index,amount:match[0].trim(),value:Number.isSafeInteger(value) && value>=0 ? value : null});
  }
 }
 return occurrences.sort((a,b)=>a.start-b.start);
}

export function analyzeOwnerPayrollQuestion(text) {
 if (typeof text !== 'string' || text.length > 6000 || !/\b(?:payroll|paychecks?)\b/i.test(text) ||
     !/\b(?:next\s+(?:two|2)\s+weeks|14\s+days|cash\s+position|cash.flow|threaten\s+payroll)\b/i.test(text)) return null;
 const dated=text.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)||[];
 if(dated.length){
  const invalid=dated.some(date=>strictFinancialDate(date)===null);
  return Object.freeze({status:'needs_clarification',reason:invalid?'invalid_or_ambiguous_date':'unverified_dated_obligation',
   source:'user_scenario',cash:null,receivables:null,weeklyPayroll:null,twoWeekPayroll:null,afterPayroll:null,executionAuthority:false,
   content:'HYPOTHETICAL OWNER-SUPPLIED SCENARIO — not verified company records. '+(invalid?'An impossible or ambiguous date was supplied. ':'Dated obligations require source and completeness verification. ')+
    'Please confirm the exact ISO payment dates, reporting period, source status and whether all expenses are included. No cash or payroll forecast was calculated; no business action was taken.'});
 }
 const fields={cash:extractAmounts(text,'cash'),receivables:extractAmounts(text,'(?:accounts\\s+)?receivables?'),weeklyPayroll:extractAmounts(text,'weekly\\s+payroll')};
 const materialCosts=extractAmounts(text,'(?:materials?(?:\\s+costs?)?|supplier\\s+payments?|job\\s+costs?|expenses?|outflows?)');
 if(Object.values(fields).every(rows=>rows.length===0) && !materialCosts.length) return null;
 const ambiguous=Object.entries(fields).filter(([,rows])=>rows.length>1 || rows.some(row=>row.value===null));
 // A time-qualified revision without its field label is also unsafe to associate automatically.
 const unlabeledRevision=/\b(?:but\s+)?(?:now|currently)\s+(?:(?:it|that|balance)\s+)?(?:is|at|of)?\s*\$\s*\d[\d,]*(?:\.\d{1,2})?/i.test(text);
 // A second amount after 'or' / 'but actually' inherits the earlier field within the clause.
 // Never let the first labelled amount mask an unlabelled correction or alternative.
 const financialField='(?:cash|weekly\\s+payroll|(?:accounts\\s+)?receivables?|materials?(?:\\s+costs?)?|expenses?)';
 const unlabelledChoice=new RegExp('\\b'+financialField+'\\b[^.!?;]{0,120}?\\b(?:or|but\\s+(?:actually|rather|instead)|actually|rather|instead)\\s+(?:(?:it|that)\\s+(?:is|was)\\s+)?(?:\\$\\s*)?\\d[\\d,]*(?:\\.\\d{1,2})?(?![\\d,])','i').test(text);
 const negative=/(?:\b(?:cash|receivables?|weekly\s+payroll|materials?|expenses?)\b\s*(?:of|is|was|:|=)?\s*-\s*\$?\s*\d| -\s*\$?\s*\d[\d,]*\s+(?:cash|receivables?|weekly\s+payroll|materials?|expenses?))/i.test(text);
 const repeated=ambiguous.length>0 || unlabeledRevision || unlabelledChoice || materialCosts.length>1;
 if(repeated || negative || materialCosts.length){
  const alternatives=/\b(?:either|option\s+[ab]|scenario\s+[ab]|versus|vs\.?|alternative\s+[ab])\b|\$[\d,]+\s+or\s+\$[\d,]+/i.test(text);
  const revision=/\b(?:yesterday|last\s+(?:week|month|year)|previously|formerly|historical|prior|earlier|now|currently|current|as\s+of)\b/i.test(text);
  const reason=negative?'unsupported_negative':repeated?(alternatives?'alternatives':revision?'historical_revision':'contradiction'):'unverified_outflows';
  const explanations={
   contradiction:'Contradictory or repeated financial values were detected.',
   historical_revision:'Historical and current figures were both supplied; this is a possible revision, not a verified contradiction.',
   alternatives:'Alternative financial scenarios were supplied; they are not one confirmed balance.',
   unsupported_negative:'Negative or unsupported financial input needs verification before calculation.',
   unverified_outflows:'Material costs or other outgoing commitments were supplied without verified payment timing.'
  };
  const details=[...ambiguous.map(([field,rows])=>field+': '+rows.map(row=>row.amount).join(' / ')),...(unlabeledRevision?['unlabelled current-value revision']:[]),...(unlabelledChoice?['unlabelled same-clause alternative or correction']:[]),...(negative?['negative amount']:[]),...(materialCosts.length?['other cash outflows: '+materialCosts.map(row=>row.amount).join(' / ')]:[])].join('; ');
  return Object.freeze({status:'needs_clarification',reason,source:'user_scenario',cash:null,receivables:null,weeklyPayroll:null,twoWeekPayroll:null,afterPayroll:null,executionAuthority:false,
   content:'HYPOTHETICAL OWNER-SUPPLIED SCENARIO — not saved TradeFlow business records.\n'+explanations[reason]+' ('+details+'). Please clarify the single current value, its effective date, and when outgoing payments fall due. Previous, stale, and current figures cannot be safely selected automatically.\nUnknowns include payroll dates, taxes, benefits, material costs, supplier due dates and collectible receivables.\nNo payroll coverage or cash balance was calculated; no business action was taken.'});
 }
 return analyzePayrollRisk({cash:fields.cash[0]?.value??null,receivables:fields.receivables[0]?.value??null,weeklyPayroll:fields.weeklyPayroll[0]?.value??null,source:'user_scenario'});
}
