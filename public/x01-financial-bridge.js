/* X01: read-only missing-financial-evidence response. No tenant or model data is read. */
export function missingVerifiedPayrollJobEvidence(text){
 const input=typeof text==='string'?text.trim():'';
 if(!input||input.length>6000||
    !/\b(?:payroll|cash\s*flow|cash\s+position)\b/i.test(input)||
    !/\b(?:jobs?|projects?)\b/i.test(input)||
    !/\b(?:which|what|rank|prioriti[sz]e|threaten|risk)\b/i.test(input))return null;
 return Object.freeze({
  status:'missing_data',source:'financial_missing_data',executionAuthority:false,
  content:'FINANCIAL EVIDENCE MISSING — I cannot identify or rank specific jobs threatening payroll without authorized, dated company evidence. This conversation has no verified bank availability, payroll taxes/benefits, supplier/material commitments, job cost-to-complete, or confirmed collection timing. An authenticated read-only record inventory is not proof of cleared funds or complete obligations. Receivables are not available cash. You can supply explicitly hypothetical amounts for a scenario, but that is not a company forecast. No tenant financial data was read, no action was approved, and no business record was changed.'
 });
}
