/* TradeFlow Master Intelligence integration: a user-invoked, READ-ONLY review of
 * device-local records through the existing validated evidence and Phase A/B
 * detectors. No authenticated cloud data, scheduler, model or command executor.
 *
 * The existing conversation store already has an explicitly labelled
 * device_local_evidence source. Do not add a new pseudo-verified source here.
 */
import {localEvidence} from './intelligence-evidence.js';
import {detectInvoiceDueDateReview} from './intelligence-proactive-cases.js';
import {detectCrewMaterialReadiness,detectQuoteFollowUp} from './intelligence-proactive-operations.js';
import {prioritizeCases} from './intelligence-proactive-priority.js';
import {buildProactiveTurn} from './intelligence-proactive-adapter.js';

const LOCAL_SCOPE=Object.freeze({mode:'local',actor:'local-owner',businessId:'local-business'});

export async function reviewLocalTradeFlowRecords({snapshot,scope=LOCAL_SCOPE,asOfDate,now}={}){
 if(scope?.mode!=='local'||scope?.actor!==LOCAL_SCOPE.actor||scope?.businessId!==LOCAL_SCOPE.businessId||
    scope.identity||scope.role)throw Error('Only the existing device-local owner scope can run this review');
 const context=await localEvidence(snapshot,scope);
 const inputs={context,scope,asOfDate,now};
 const evaluations=await Promise.all([
  detectInvoiceDueDateReview(inputs),
  detectCrewMaterialReadiness(inputs),
  detectQuoteFollowUp(inputs)
 ]);
 for(const result of evaluations)if(result.status!=='evaluated'||result.executionAuthority!==false||
    result.tenantId!==scope.businessId||!Array.isArray(result.cases))
   throw Error('Proactive evidence evaluation unavailable; no partial or unverified summary was saved');
 const cases=evaluations.flatMap(r=>r.cases);
 const priority=prioritizeCases({cases,now,tenantId:scope.businessId});
 const selected=priority.ranked.map(r=>cases.find(c=>c.caseId===r.caseId)).filter(Boolean);
 const adapted=buildProactiveTurn({cases:selected,scope,now,priority,title:'Device-local operational priorities'});
 if(adapted.conversationScope.kind!=='local'||adapted.executionAuthority!==false||
    adapted.turn.source!=='proactive_case_review')throw Error('Unexpected proactive conversation adapter contract');
 const turn=Object.freeze({...adapted.turn,source:'device_local_evidence'});
 return Object.freeze({
  kind:'tradeflow.intelligence.proactive.local-review.v1',
  scope:'device_local_only',
  turn,
  caseIndex:adapted.caseIndex,
  detectedCount:cases.length,
  omitted:adapted.omitted,
  ranked:priority.ranked,
  unknownCount:evaluations.reduce((n,r)=>n+r.unknowns.length,0),
  modelInvoked:false,
  executionAuthority:false,
  actionsExecuted:0
 });
}
