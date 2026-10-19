/* Offline request interpretation. Configuration only: no search, writes or invented geography. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./lead-discovery-core.js'):root.TradeFlowLeadDiscoveryCore);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowLeadIntelligenceConfig=api})(globalThis,function(core){
'use strict';
function interpretResearchRequest(input,context={}){
 const raw=core.clean(input,1000),text=core.key(raw),missing=[];
 if(/\b(?:show|explain|enrich)\b/.test(text)){
  if(/explain.*reject/.test(text))return {intent:'discovery.explain_rejections',parameters:{},missing:[],requiresReview:false};
  if(/enrich.*(?:missing|incomplete)/.test(text))return {intent:'discovery.retry_incomplete',parameters:{},missing:[],requiresReview:true};
  if(/show.*(?:lead|result)/.test(text))return {intent:'discovery.show_results',parameters:{sort:/highest|best|quality/.test(text)?'score':'recent',period:/yesterday/.test(text)?'yesterday':'all'},missing:[],requiresReview:false};
 }
 if(!/\b(?:find|research|discover|search)\b/.test(text)||/\b(?:don t|do not|cancel|not now|if we)\b/.test(text))return {intent:'unknown',missing:['research_instruction'],clarification:'Describe the trade and US location to research.',requiresReview:true};
 const base=core.defaults(context.profile||{}),terms={...core.vocabulary};for(const t of context.trades||[])terms[core.key(t)]=[t];
 const trades=Object.entries(terms).filter(([trade,aliases])=>[trade,...aliases].some(t=>new RegExp('(?:^| )'+core.key(t)+'s?(?: |$)').test(text))).map(([trade])=>trade);
 if(!trades.length)missing.push('trade');
 const states=Object.entries(core.states).filter(([code,name])=>new RegExp('(?:^| )'+core.key(name)+'(?: |$)').test(text)||new RegExp('\\b'+code+'\\b').test(raw)).map(([code])=>code).filter(code=>!(code==='WA'&&/washington[, ]+DC\b|district of columbia/i.test(raw)&&!/washington state|,\s*WA\b/i.test(raw)));
 const opportunity=/\b(?:opportunities|opportunity|projects|permits|bids|seeking subcontractors|maintenance contracts)\b/.test(text),mode=opportunity?'opportunities':'prospects';
 const count=raw.match(/\b(?:find|research|discover|search(?: for)?)\s+(\d{1,3})\b/i),employees=raw.match(/\b(\d{1,5})\s*(?:[-–]|to)\s*(\d{1,5})\s+employees\b/i),radius=raw.match(/\b(?:within|radius(?: of)?)\s+(\d+(?:\.\d+)?)\s+miles?\b/i);
 let level=states.length>1?'multi_state':states.length?'state':'national',name='',headquarters=base.headquarters;
 const place=raw.match(/\b(?:near|of|in)\s+([A-Z][A-Za-z .'-]+?)(?=,|\s+(?:with|within|in|across)\b|$)/);
 if(place&&!Object.values(core.states).some(s=>core.key(s)===core.key(place[1]))){const known=(context.places||[]).find(p=>core.key(p.name)===core.key(place[1])&&(!states.length||states.includes(p.state)));name=place[1].trim().replace(/[.]+$/,'');level='city';if(!states.length&&known)states.push(known.state);if(!states.length)missing.push('state_for_city')}
 if(!states.length&&!/\b(?:nationwide|national|united states|all states)\b/.test(text))missing.push('US_location');
 const zip=raw.match(/\b(?:ZIP(?: code)?\s*)(\d{5})\b/i);if(zip){level='zip';name=''}
 if(radius&&!headquarters)missing.push('complete_radius_center_address');
 const criteria={...base,mode,leadFocus:/permits|projects/.test(text)?'projects':'requests',trades,geography:{level,states,name,postalCode:zip?.[1]||''},batchSize:count?Number(count[1]):30,minEmployees:employees?Number(employees[1]):null,maxEmployees:employees?Number(employees[2]):null,radiusMiles:radius?Number(radius[1]):null,headquarters};
 if(!missing.length){try{return {intent:'discovery.configure',criteria:core.validateCriteria(criteria),missing:[],requiresReview:true,confidence:'deterministic_configuration'}}catch(e){missing.push(e.message)}}
 return {intent:'discovery.configure',criteria,missing:[...new Set(missing)],requiresReview:true,clarification:'Please specify: '+[...new Set(missing)].join(', ').replaceAll('_',' ')+'.'};
}
function plan(criteria){const c=core.validateCriteria(criteria),scopes=c.geography.level==='multi_state'?c.geography.states.map(state=>({...c,geography:{level:'state',states:[state]}})):[c],queries=[];for(const scope of scopes)for(const query of core.buildQueries(scope))queries.push(query);
 const variants=['licensed residential commercial','local business contact','specialty contractor services','company about contact'];
 const desired=Math.max(queries.length,Math.ceil(c.batchSize/10));const originals=queries.slice();let i=0;while(queries.length<desired){queries.push(core.clean(originals[i%originals.length]+' '+variants[Math.floor(i/originals.length)%variants.length],400));i++}
 return {queries:[...new Set(queries)].slice(0,100),maxProviderRequests:Math.min(100,queries.length)+c.batchSize*2,limitations:queries.length>100?['Search plan limited to 100 queries; configured territory is not exhaustive.']:[]};
}
return Object.freeze({interpretResearchRequest,plan});
});
