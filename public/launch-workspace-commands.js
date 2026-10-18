/* Read-only launch commands for the existing Calendar, Finance and Invoice UI.
 * Parsing does not authorize changes or claim data was found.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowLaunchWorkspaceCommands=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const clean=v=>String(v||'').toLowerCase().trim().replace(/^(?:hey|ok|okay|hello)\s+trade\s*flow[, ]*/,'').replace(/[.!?]+$/,'').replace(/\s+/g,' ');
function parse(text){
 const s=clean(text);
 if(/^(?:(?:open|go to|show|view)\s+(?:the\s+)?)calendar(?:\s+(?:page|workspace|screen))?$/.test(s))return {area:'calendar',action:'open'};
 if(/^(?:show|open|go to|view|check)\s+(?:(?:my|the)\s+)?(?:today'?s|today|tomorrow'?s|tomorrow)\s+(?:calendar|schedule|appointments)(?:\s+on\s+(?:the\s+)?calendar)?$/.test(s)){
  return {area:'calendar',action:'date',offset:/tomorrow/.test(s)?1:0};
 }
 if(/^(?:show|open|check|view)\s+(?:the\s+)?(?:calendar\s+)?(conflicts|proposals)(?:\s+(?:on|in)\s+(?:the\s+)?calendar)?$/.test(s))return {area:'calendar',action:'filter',filter:s.includes('conflicts')?'conflicts':'proposals'};
 if(/^(?:(?:open|go to|show|view)\s+(?:the\s+)?)finance(?:\s+(?:page|workspace|screen))?$/.test(s))return {area:'finance',action:'screen',screen:'overview'};
 if(/^(?:show|view|check)\s+(?:(?:(?:this|current)\s+month'?s\s+(?:income|revenue))|(?:(?:income|revenue)\s+(?:(?:for|this)\s+month)))$/.test(s))return {area:'finance',action:'incomeMonth'};
 if(/^(?:show|view|find|list)\s+(?:(?:my|all|the)\s+)?(?:outstanding|unpaid)\s+invoices?$/.test(s))return {area:'invoices',action:'filter',filter:'unpaid'};
 let m=s.match(/^(?:(?:open|show|view|go to)\s+(?:the\s+)?)?(?:finance\s+)?(overview|income|expenses|reports)(?:\s+(?:in\s+)?finance)?$/);
 if(m)return {area:'finance',action:'screen',screen:m[1]};
 m=s.match(/^(?:show|view|set|switch to)\s+(?:finance\s+)?(this month|last 7 days|this year|all time)(?:\s+(?:in\s+)?finance)?$/);
 if(m)return {area:'finance',action:'period',period:({'this month':'month','last 7 days':'week','this year':'year','all time':'all'})[m[1]]};
 m=s.match(/^(?:show|view|filter)\s+(?:my\s+|the\s+)?(unpaid|overdue|draft)\s+invoices?$/);
 if(m)return {area:'invoices',action:'filter',filter:m[1]};
 return null;
}
return Object.freeze({parse});
});