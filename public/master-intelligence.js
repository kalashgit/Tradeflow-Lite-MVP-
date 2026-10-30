import {canonical,digest,copy,freeze,validateEvidence} from './intelligence-evidence.js';
const goals={cost_control:['cost','costs','budget','budgets','profit'],labor_control:['labor','labour','hours','overtime'],cash_review:['cash','invoice','invoices','payment','payments','collection'],overview:['overview','business','attention','operations','status','job','review']};
const focus={cost_control:['job.budget_overrun_review'],labor_control:['job.labor_hours_variance_review'],cash_review:['invoice.overdue','invoice.payment_integrity_review']};
const actions={
 'job.budget_overrun_review':{commandId:'job.cost_review.schedule',taskKind:'job_cost_reconciliation',label:'Prepare internal cost review',alternatives:['Scope may have changed.','Estimates may be incomplete or entries duplicated.']},
 'job.labor_hours_variance_review':{commandId:'job.labor_review.schedule',taskKind:'job_labor_variance_review',label:'Prepare internal labor review',alternatives:['Scope or the original estimate may differ.','Time entries may be incomplete or duplicated.']}
};
export function interpretObjective(input){
 if(typeof input!=='string'||!input.trim()||input.length>240)return {status:'clarification',message:'Choose a short business objective.'};
 const tokens=input.toLowerCase().match(/[a-z]+/g)||[],matches=Object.keys(focus).filter(k=>goals[k].some(w=>tokens.includes(w)));
 if(matches.length>1)return {status:'clarification',message:'Review costs, labor hours, cash, or the overall business?'};
 const kind=matches[0]||tokens.includes('overrun')&&'cost_control'||goals.overview.some(w=>tokens.includes(w))&&'overview';
 return kind?{status:'ready',kind,text:input.trim(),effect:'read'}:{status:'clarification',message:'Choose costs, labor hours, cash or a business overview. No action was executed.'};
}
export function createDecisionProtocol({engine,definitions}){
 if(typeof engine?.evaluate!=='function'||!Array.isArray(definitions))throw Error('Existing detectors and command definitions required');
 async function review({objective,context,scope,today}){
  const goal=interpretObjective(objective);if(goal.status!=='ready')return freeze({kind:'tradeflow.decision.v1',status:'clarification',objective:goal,executionAuthority:false});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||new Date(today+'T12:00:00Z').toISOString().slice(0,10)!==today||scope.today&&scope.today!==today)throw Error('Verified current local date required');
  const data=copy(context),host=copy(scope);if(Array.isArray(data.records))data.records.sort((a,b)=>(a.type+':'+a.id).localeCompare(b.type+':'+b.id));
  const checked=await validateEvidence(data,host),snapshot={};
  for(const r of data.records)(snapshot[r.type]||=[]).push({id:r.id,businessId:host.businessId,...copy(r.record)});
  const evaluated=engine.evaluate(snapshot,{businessId:host.businessId,today,now:today+'T12:00:00.000Z'}),findings=evaluated.findings.filter(f=>!focus[goal.kind]||focus[goal.kind].includes(f.detectorId));
  const references=new Map(data.records.map(r=>[r.type+':'+r.id,{type:r.type,id:r.id,revision:r.revision,contentHash:r.contentHash||null,provenance:r.provenance}]));
  const problems=[...checked.links.missing.map(x=>({code:'missing_reference',...x})),...checked.links.warnings,...(data.relationshipWarnings||[])];
  const observations=findings.map(f=>({id:f.id,detectorId:f.detectorId,text:f.explanation,refs:f.recordRefs.map(r=>references.get(r.store+':'+r.id)).filter(Boolean),priority:f.priority,evidence:copy(f.evidence),limitations:copy(f.limitations)}));
  // Existing USD calculations must never be presented as meaningful cross-currency economics.
  const money=data.records.filter(r=>['jobCosts','expenses','payments','invoices','quotes'].includes(r.type));
  const moneyUncertain=money.some(r=>r.record.currency!=='USD'||r.record.amount!==undefined&&(typeof r.record.amount!=='number'||!Number.isFinite(r.record.amount)||r.record.amount<0));
  if(moneyUncertain){problems.push({code:'financial_units_or_amounts_unverified'});for(const o of observations)if(o.detectorId!=='job.labor_hours_variance_review'){o.evidence={};o.text='Recorded financial information needs validation before interpreting amounts.'}}
  const proposals=[],inferences=[];
  for(const f of findings){const action=actions[f.detectorId];if(!action)continue;
   inferences.push({findingId:f.id,status:'hypotheses_only',alternatives:action.alternatives,causalityVerified:false});
   const ref=f.recordRefs.find(r=>r.store==='jobs'),contract=definitions.find(d=>d.id===action.commandId);
   if(ref&&f.status!=='blocked'&&!problems.length&&contract?.effect==='modification'&&contract.approval==='explicit')proposals.push({id:f.id+':review',label:action.label,commandId:action.commandId,params:{ref:copy(ref),due:today},taskKind:action.taskKind,requiresApproval:true,externalEffects:false});
  }
  const recordSet=data.records.slice().sort((a,b)=>(a.type+':'+a.id).localeCompare(b.type+':'+b.id));
  const binding=await digest({scope:host,objective:goal,today,records:recordSet,problems});
  return freeze({kind:'tradeflow.decision.v1',status:problems.length?'evidence_needs_review':'ready_for_review',binding,objective:goal,scope:host,today,evidenceMode:checked.local?'device_local_unverified_identity':'authenticated_cloud_read',
   workflow:{records:data.records.map(r=>references.get(r.type+':'+r.id)),edges:checked.links.edges},observations,inferences,
   options:[{id:'no_action',label:'Take no action',consequence:'Records and workflow remain unchanged; the exception may remain.'},{id:'inspect',label:'Inspect source records',consequence:'Validate scope, entries and missing evidence before deciding.'},...proposals.map(p=>({id:p.id,label:p.label,consequence:'Creates only an internal review task after explicit approval; does not resolve the financial or labor issue.'}))],
   recommendations:proposals.map(p=>({proposalId:p.id,status:'proposed_not_authorized'})),proposals,unknowns:[...problems,{code:'external_settlement_and_payroll_unverified'},{code:'cause_and_contractor_outcome_unverified'}],
   consequences:{externalSettlementVerified:false,profitVerified:false,payrollVerified:false,taskCreationResolvesIssue:false},diagnostics:evaluated.diagnostics,executionAuthority:false});
 }
 async function prepare({decision,proposalId,readCurrent,readScope,runtime,attemptId}){
  if(decision?.kind!=='tradeflow.decision.v1'||typeof readCurrent!=='function'||typeof readScope!=='function')throw Error('Reviewed decision and fresh evidence providers required');
  if(attemptId!==undefined&&(typeof attemptId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(attemptId)))throw Error('Explicit review attempt identifier invalid');
  const scope=await readScope(),current=await readCurrent(scope),fresh=await review({objective:decision.objective.text,context:current,scope,today:decision.today});
  const proposal=fresh.proposals.find(p=>p.id===proposalId),original=decision.proposals.find(p=>p.id===proposalId);
  if(fresh.binding!==decision.binding||!proposal||canonical(original)!==canonical(proposal))throw Error('Decision evidence or proposed action changed; review again');
  if(scope.mode!=='local')throw Error('Cloud command mutation adapter is not connected; this context remains read-only');
  if(canonical(await readScope())!==canonical(scope))throw Error('Decision scope changed during refresh');
  const plan=await runtime.prepare({commandId:proposal.commandId,params:copy(proposal.params)},{requestKey:'decision:'+await digest({binding:decision.binding,proposalId,attemptId:attemptId||null})});
  if(plan.businessId!==scope.businessId||plan.actor!==scope.actor)throw Error('Command scope does not match reviewed evidence');
  return plan; // Approval/execution stays exclusively in the existing host runtime.
 }
 async function receipt({decision,proposalId,planId,readCurrent,readScope,runtime}){
  const scope=await readScope();if(canonical(scope)!==canonical(decision.scope))throw Error('Receipt scope changed');
  const context=await readCurrent(scope);await validateEvidence(context,scope);
  const proposal=decision.proposals.find(p=>p.id===proposalId),plan=await runtime.get(planId),history=await runtime.history(planId);
  if(!proposal||!plan||plan.commandId!==proposal.commandId||canonical(plan.params)!==canonical(proposal.params)||plan.actor!==scope.actor||plan.businessId!==scope.businessId)throw Error('Receipt does not match reviewed command');
  const id=plan.outcome?.result?.id,task=context.records.find(r=>r.type==='tasks'&&r.id===id);
  const verified=plan.status==='succeeded'&&history.some(e=>e.type==='approved'&&e.actor===scope.actor)&&history.some(e=>e.type==='succeeded')&&task?.record.jobId===proposal.params.ref.id&&task.record.taskKind===proposal.taskKind&&task.record.due===proposal.params.due;
  return freeze({status:verified?'recorded_task_verified':'unverified',planId,recordRef:verified?{type:'tasks',id}:null,executionReplayed:false,financialIssueResolved:false,contractorOutcomeVerified:false,externalSettlementVerified:false});
 }
 return Object.freeze({review,prepare,receipt});
}
