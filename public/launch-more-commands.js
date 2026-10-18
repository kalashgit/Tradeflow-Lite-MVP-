/* TradeFlow launch: bounded navigation, lookup, filtering and unsaved drafts.
 * The registered command runtime handles authorization and actual operations.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowLaunchMoreCommands=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const clean=v=>String(v||'').toLowerCase().trim().replace(/^(?:hey|ok|okay|hello)\s+trade\s*flow[, ]*/,'').replace(/[.!?]+$/,'').replace(/\s+/g,' ');
const workspaces={'opportunities':'opportunities','opportunity':'opportunities','customers':'customers','customer':'customers','quotations':'quotes','quotation':'quotes','quotes':'quotes','quote':'quotes','jobs':'jobs','job':'jobs','tasks':'tasks','task':'tasks','invoices':'invoices','invoice':'invoices','target customers':'growth','target customers and buyer personas':'growth','buyer personas':'growth'};
const stores={'opportunity':'opportunities','opportunities':'opportunities','customer':'customers','customers':'customers','quote':'quotes','quotes':'quotes','quotation':'quotes','quotations':'quotes','job':'jobs','jobs':'jobs','task':'tasks','tasks':'tasks','invoice':'invoices','invoices':'invoices'};
function parse(value){
 const s=clean(value);
 let m=s.match(/^(?:open|show|go to|view)\s+(?:the\s+)?(.+?)(?:\s+(?:page|workspace|screen))?$/);
 if(m&&workspaces[m[1]])return {action:'open',workspace:workspaces[m[1]]};
 m=s.match(/^(?:show|view|filter)\s+(?:my\s+|the\s+)?(overdue|open|done|completed|unfinished|accepted|stale)\s+(tasks?|quotes?|quotations?)$/);
 if(m){
  const workspace=/^tasks?$/.test(m[2])?'tasks':'quotes';
  const filter=({'completed':'done','unfinished':'open'})[m[1]]||m[1];
  if((workspace==='tasks'&&['overdue','open','done'].includes(filter))||(workspace==='quotes'&&['open','accepted','stale'].includes(filter)))return {action:'filter',workspace,filter};
 }
 m=s.match(/^(?:find|search for|look up)\s+(?:a\s+|the\s+)?(opportunities|opportunity|customers|customer|quotations|quotation|quotes|quote|jobs|job|tasks|task|invoices|invoice)\s+(?:named\s+|called\s+|for\s+)?(.+)$/);
 if(m&&m[2].trim().length>=2&&m[2].length<=160)return {action:'find',store:stores[m[1]],query:m[2].trim()};
 m=s.match(/^(?:open|show)\s+(?:the\s+)?(opportunities|opportunity|customers|customer|quotations|quotation|quotes|quote|jobs|job|tasks|task|invoices|invoice)\s+(.+)$/);
 if(m&&m[2].trim().length>=2&&m[2].length<=160)return {action:'openRecord',store:stores[m[1]],query:m[2].trim()};
 if(/^(?:draft|prepare|start)\s+(?:a\s+|new\s+|a\s+new\s+)?(?:task|to do)$/.test(s))return {action:'draft',kind:'task'};
 if(/^(?:draft|prepare|start)\s+(?:a\s+|new\s+|a\s+new\s+)?(?:quote|quotation)$/.test(s))return {action:'draft',kind:'quote'};
 return null;
}
return Object.freeze({parse});
});