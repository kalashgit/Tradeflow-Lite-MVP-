/* TradeFlow Intelligence: read-only electrical reference answers from a checksum-verified
   offline pack. These are reference summaries, never site instructions or business commands. */
(function(root,factory){
 const offline=typeof module==='object'&&module.exports?require('./offline-knowledge-pack.js'):root?.TradeFlowOfflineKnowledge;
 const api=factory(offline);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowElectricalReferenceChat=api;
})(typeof globalThis==='object'?globalThis:null,function(offline){
 'use strict';
 const INTENT=/\b(?:osha|29\s*cfr|lockout|tagout|deenergiz\w*|energiz\w*|gfci|ground[ -]?fault|electrical safety|electrical hazard\w*|electric shock|absence of voltage|live panel|jobsite (?:power|electrical)|construction (?:power|receptacle|electric\w*))\b/i;
 const POLICY='OFFLINE ELECTRICAL REFERENCE · OSHA SUMMARY\nThis is a limited, source-linked safety reference, not a wiring plan, a diagnosis, proof of code compliance or permission to work energized. A qualified person must check current rules, local requirements, equipment and site conditions. No command or business record was changed.';
 function isElectricalReferenceQuestion(query){return typeof query==='string'&&INTENT.test(query)}
 function create(index){
  // This function is part of the existing saved chat path. A caller-supplied
  // search() function or manifest is not enough to establish source integrity.
  if(!offline||typeof offline.isVerifiedPack!=='function'||!offline.isVerifiedPack(index))
   throw Error('Integrity-verified electrical reference index required');
  if(!index||index.manifest?.audience!=='redistributable_reference'||index.manifest.id!=='osha-electrical-safety-us-v1'||typeof index.search!=='function')throw Error('Approved electrical reference pack required');
  function answer(query){
   if(!isElectricalReferenceQuestion(query))return {handled:false};
   if(typeof query!=='string'||query.length>1200)throw Error('Invalid reference question');
   const clean=query.replace(/\b(?:osha|29|cfr|rules?|standard|regulation|requirements?|about|explain|tell|me|what|does|say)\b/gi,' ');
   const matches=index.search(clean.trim()||query,{jurisdiction:'US',limit:3});
   const parts=matches.map(hit=>{
    if(hit.audience!=='redistributable_reference'||hit.status!=='untrusted_reference_excerpt'||hit.kind!=='official'||!/^https:\/\/www\.osha\.gov\//.test(hit.sourceUrl||''))throw Error('Untrusted reference provenance');
    return hit.heading+'\n'+hit.text+'\nSource: '+hit.title+' ('+hit.documentVersion+')\n'+hit.sourceUrl;
   });
   const content=POLICY+(parts.length?'\n\nRelevant references:\n\n'+parts.join('\n\n'):'\n\nNo matching passage exists in the small offline OSHA pack. Do not infer the answer; consult the applicable official standard and a qualified professional.');
   return {handled:true,content:content.slice(0,3100),refs:matches.map(hit=>'knowledge:'+hit.passageId+'@1'),hits:matches};
  }
  return Object.freeze({answer});
 }
 return Object.freeze({isElectricalReferenceQuestion,create});
});
