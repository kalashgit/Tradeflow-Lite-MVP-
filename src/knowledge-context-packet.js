import {readIntelligenceContext} from './intelligence-context.js';
import {validateEvidence,copy,freeze} from '../public/intelligence-evidence.js';
import knowledgeEvidence from '../public/knowledge-evidence-contract.js';

/* I02 read-only evidence handoff to the one Master Intelligence.
   Authentication and record scope remain owned by the existing server context.
   This packet is neither a model response nor an authorization to execute. */
export async function assembleKnowledgeContext({db,principal,businessId,jobId,academy,knowledgePack,knowledgeRefs=[],purpose='general',now}={}){
 if(!db||!principal||typeof businessId!=='string')throw Error('Authenticated business context required');
 if(!['general','labor_estimation'].includes(purpose))throw Error('Unsupported knowledge context purpose');
 const business=await readIntelligenceContext({db,principal,businessId,...(jobId===undefined?{}:{jobId}),...(now?{now}:{})});
 const scope={mode:'cloud',businessId:business.businessId,identity:business.identity,role:business.permission.role,
  ...(jobId===undefined?{}:{jobId})};
 await validateEvidence(business,scope);
 const knowledge=knowledgeEvidence.packet(knowledgeRefs,{academy,pack:knowledgePack,
  scope:{businessId:business.businessId,actorId:business.identity.subject}});
 // Device-private knowledge is not a substitute for authenticated server-side ACLs.
 if(knowledge.evidence.some(item=>item.classification==='private_unreviewed_passage'))
  throw Error('Private-device knowledge cannot enter authenticated company context');
 const unknowns=[];
 if(!knowledge.evidence.some(item=>item.claimSupported))unknowns.push('No approved source passage is available for this question');
 if(business.missingReferences.length)unknowns.push('Some linked business records are withheld or unavailable');
 if(purpose==='labor_estimation'){
  // Neither an estimate nor an actual labor-hours classification is included in
  // the approved projection. Nor does the existing pack certify estimating guidance.
  unknowns.push('Estimated versus actual labor hours are not both verified in this context');
  unknowns.push('Approved labor estimating guidance has not been verified for this request');
 }
 return freeze({kind:'tradeflow.intelligence.knowledge-context.v1',business:copy(business),knowledge,
  purpose,unknowns,readOnly:true,executionAuthority:false,businessEvidenceStatus:'membership_scoped_snapshot',
  limitations:['Knowledge citations do not independently verify business facts.',
   'This packet is only as current as its source revisions and membership check.',
   'Revalidate authorization and record revisions before use or action.']});
}
