/* Read-only knowledge citation boundary for the existing Master Intelligence.
   A catalog entry is never evidence for a passage or a business claim. */
(function(root,factory){
 const offline=typeof module==='object'&&module.exports?require('./offline-knowledge-pack.js'):root?.TradeFlowOfflineKnowledge;
 const api=factory(offline);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowKnowledgeEvidence=api;
})(typeof globalThis==='object'?globalThis:null,function(offline){
 'use strict';
 const ACADEMY=/^academy:(tf-academy-\d{3})@1$/;
 const PASSAGE=/^knowledge:([A-Za-z0-9][A-Za-z0-9._:-]{0,119})@1$/;
 const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
 function resolve(ref,{academy,pack,scope}={}){
  if(typeof ref!=='string'||ref.length>160)throw Error('Unsupported knowledge citation');
  let match=ACADEMY.exec(ref);
  if(match){
   if(!academy||academy.schema!=='tradeflow.academy-catalog.v1'||academy.sourceCount!==59||
      !Array.isArray(academy.sources)||academy.sources.length!==59)throw Error('Academy registry unavailable');
   const entries=academy.sources.filter(s=>s.sourceId===match[1]);
   if(entries.length!==1||entries[0].ingestionStatus!=='metadata_only'||entries[0].passageCount!==0)
    throw Error('Academy citation is unsupported');
   const source=entries[0];
   return Object.freeze({ref,classification:'source_metadata_only',sourceId:source.sourceId,
    title:source.title,claimSupported:false,passage:null});
  }
  match=PASSAGE.exec(ref);
  if(!match||!pack||typeof pack.citation!=='function')throw Error('Unsupported knowledge citation');
  // A manifest and caller-provided citation() method are forgeable. Require the
  // identity registered after openPack() completed its integrity checks.
  if(!offline||typeof offline.isVerifiedPack!=='function'||!offline.isVerifiedPack(pack))
   throw Error('Knowledge index is not integrity-verified');
  if(pack.manifest?.schema!=='tradeflow.offline-knowledge.v1'||!['redistributable_reference','synthetic_demo','private_device'].includes(pack.manifest.audience))
   throw Error('Knowledge index is not approved for shared retrieval');
  const citation=pack.citation(match[1],{scope});
  if(!citation)throw Error('Knowledge passage not found');
  const {passage,source}=citation;
  if(!source||source.contentStatus!=='available_excerpt'||!own(passage,'sha256'))throw Error('Knowledge source unavailable');
  if(scope?.businessId&&pack.manifest.audience==='synthetic_demo'&&scope.allowSynthetic!==true)
   throw Error('Synthetic knowledge cannot be used as company evidence');
  return Object.freeze({ref,classification:pack.manifest.audience==='synthetic_demo'?'synthetic_example':pack.manifest.audience==='private_device'?'private_unreviewed_passage':'retrieved_source_passage',
   sourceId:source.id,title:source.title,passageId:passage.id,sha256:passage.sha256,
   claimSupported:pack.manifest.audience==='redistributable_reference',passage:passage.text,
   reviewedOn:source.reviewedOn,jurisdictions:source.jurisdictions.slice()});
 }
 function packet(refs,dependencies){
  if(!Array.isArray(refs)||refs.length>12||new Set(refs).size!==refs.length)throw Error('Invalid knowledge reference set');
  const evidence=refs.map(ref=>resolve(ref,dependencies));
  return Object.freeze({kind:'tradeflow.knowledge.evidence.v1',readOnly:true,executionAuthority:false,
   evidence:Object.freeze(evidence),unsupportedClaims:evidence.filter(item=>!item.claimSupported).map(item=>item.ref)});
 }
 return Object.freeze({resolve,packet});
});
