/* TradeFlow application bridge. Interpretation is never authorization. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./command-intelligence.js'):root?.TradeFlowCommandIntelligence,typeof module==='object'&&module.exports?require('./command-registry.js'):root?.TradeFlowCommands);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowVoiceIntegration=api})(typeof globalThis==='object'?globalThis:null,function(intelligence,registry){
'use strict';
const registryTools=['view.filter','record.open','quotation.convert'].map(id=>({id,effect:id==='quotation.convert'?'proposes_modification':'navigation',match:(l,c)=>{const p=registry.parse(l.text.replace(/[.!?]+$/,''));if(id==='record.open'&&intelligence.interpretCommand(l.text,c).suggestedCommand?.commandId==='workspace.open')return 0;return p.commandId===id&&(id!=='record.open'||p.params.store||/^open this record$/i.test(l.text))?99:0},extract(l,c,r){const p=registry.parse(l.text.replace(/[.!?]+$/,''));r.parameters=p.params;r.suggestedCommand={commandId:id,params:p.params};return r}}));
function constrain(tool){
 if(!['record.find','schedule.query','task.prepare'].includes(tool.id))return tool;
 return {...tool,extract(l,c,r,adapters){
  tool.extract(l,c,r,adapters);
  const unsupported=tool.id==='record.find'&&(/\b(?:without|where|near|on (?:the|my) map)\b|[’']s\b/i.test(l.text)||/^(?:find|search|look (?:up|for))\s+(?:the|my|our)\b/i.test(l.text)||/\b(?:in|for)\s+/i.test(r.parameters.query||'')||!r.parameters.store&&/\b(?:invoice|supplier|research brief|campaign|route|crew)s?\b/i.test(r.parameters.query||''))||tool.id==='schedule.query'&&/\b(?:for|with|near|where|in)\b/i.test(l.text.replace(/\bfor\s+(?:today|tomorrow|yesterday|next (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)|\d{4}-\d{2}-\d{2})\b|\bin (?:my|the|our) calendar\b/gi,''))||tool.id==='task.prepare'&&/\bfor (?:this|that|the) (?:opportunity|job|quote|customer)\b/i.test(l.text);
  if(unsupported){r.clarification.required=true;r.clarification.reasonCodes.push('UNCONNECTED_RECORD_CONSTRAINT');r.clarification.questions.push('That relationship or field filter is not connected. Specify a record name or ID, or open the workspace to review it.');r.suggestedCommand=null}
  return r;
 }};
}
const engine=intelligence.createEngine({tools:[...intelligence.builtinTools.map(constrain),...registryTools]});
function interpretCommand(text,context){return engine.interpretCommand(text,context)}
async function run(text,host){
 const snapshot=await host.snapshot(),base=host.context?.()||{},now=host.now?.()||new Date();
 const data=Object.fromEntries(Object.entries(snapshot).map(([k,v])=>[k,Array.isArray(v)?v.filter(r=>!r.businessId||r.businessId===(base.businessId||'local-business')):[]]));
 const context={...base,today:base.today||registry.dateText(now),businessId:base.businessId||'local-business',customers:data.customers||[],records:Object.fromEntries(Object.entries(data).filter(([k])=>!['commandLog','settings'].includes(k)).map(([k,v])=>[k,v.map(({photoData,...r})=>r)])),registeredTools:registry.definitions};
 const result=interpretCommand(text,context);
 const blocked=result.clarification.reasonCodes||[];
 // Only extraction problems may enter the customer review form. Action-level
 // conditions, negation and unsupported constraints must be clarified first.
 const reviewable=new Set(['MISSING_INFORMATION','POSSIBLE_DUPLICATE','AMBIGUOUS_NAME','INVALID_PHONE','CORRECTION_REVIEW','INVALID_EMAIL','MISSING_PHONE']);
 if(result.intent==='customer.create'&&result.recordReview&&blocked.every(c=>reviewable.has(c))){
  await host.customer.openReview(text,{source:'transcript',review:result.recordReview});
  return {status:'review',interpretation:result,message:'Review the customer details before saving.'};
 }
 if(result.clarification.required||result.status!=='recognized'){
  const ranked=engine.rankCommandCandidates(text,context);
  return {status:'clarification',interpretation:result,alternatives:ranked.candidates?.slice(0,3).map(x=>x.intent)||[],message:result.clarification.questions.join(' ')||'That action is not connected. Please specify an existing workspace, record or supported draft.'};
 }
 const p=result.parameters;let command=result.suggestedCommand;
 if(result.intent==='schedule.query'){
  return {status:'query',interpretation:result,date:p.date,data};
 }
 if(result.intent==='task.prepare')command={commandId:'draft.prepare',params:{kind:'task',title:p.title,fields:p.due?{due:p.due}:{}}};
 if(result.intent==='job.prepare')command={commandId:'draft.prepare',params:{kind:'job',ref:p.customerRef,title:p.title,fields:p.date?{date:p.date}:{}}};
 if(result.intent==='calendar.prepare')command={commandId:'draft.prepare',params:{kind:'calendar',fields:{date:p.date,time:p.time,durationMinutes:String(p.durationMinutes)}}};
 if(!command)return {status:'unsupported',interpretation:result,message:'This request is understood, but its application action is not connected.'};
 // The runtime alone owns permission checks, record guards, approval and audit.
 const prepared=await host.commands.prepare(command);
 if(prepared.status==='needs_review')return {status:'needs_review',requestId:prepared.id,commandId:command.commandId,interpretation:result,message:'Review: create a job from the selected accepted quotation? This changes business records.'};
 if(prepared.status!=='ready')return {status:prepared.status,interpretation:result,message:prepared.error?.message||'Choose a specific record and review required details.',choices:prepared.choices};
 const outcome=await host.commands.execute(prepared.id);
 if(outcome.status!=='succeeded')return {status:outcome.status,interpretation:result,message:outcome.error?.message||'The action could not be verified.'};
 if(command.commandId==='record.find')return {status:'found',interpretation:result,matches:outcome.result.matches,message:outcome.result.matches.length?outcome.result.matches.map(x=>x.label+' ['+x.ref.store+': '+x.ref.id+']').join('\n'):'No matching local records.'};
 return {status:'succeeded',interpretation:result,outcome,message:command.commandId==='draft.prepare'?'Draft opened for review. Nothing has been saved.':'Opened the requested view.'};
}
return Object.freeze({interpretCommand,rankCommandCandidates:engine.rankCommandCandidates,run});
});
