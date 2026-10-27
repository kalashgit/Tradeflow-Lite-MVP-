/* One bounded Library intent parser shared by spoken and typed commands.
   This parser never performs mutations. Import always opens the existing approval preview. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowLibraryCommands=api;
})(typeof globalThis==='object'?globalThis:null,function(){
 'use strict';
 const targets={jobs:'jobs',job:'jobs',customers:'customers',customer:'customers',clients:'customers',quotes:'quotes',quotations:'quotes',tasks:'tasks',expenses:'expenses',payments:'payments'};
 function parse(input){
  const s=String(input||'').trim().replace(/^(?:(?:hey|hello|okay|ok)\s+)?trade\s*flow[,:\s]*/i,'').replace(/[.!?]+$/,'').trim();
  if(/^(?:open|show|view|go to|take me to)\s+(?:(?:my|the)\s+)?(?:document\s+)?library$/i.test(s)||/^(?:library|my library)$/i.test(s))return {action:'open'};
  if(/^(?:open|show|view|go to)\s+(?:my\s+)?(?:import|files?|documents?)\s+(?:in\s+)?library$/i.test(s))return {action:'open'};
  if(/^(?:add|upload|choose|select)\s+(?:a\s+)?(?:file|document|csv|spreadsheet)(?:\s+(?:to|in)\s+(?:my\s+)?library)?$/i.test(s))return {action:'upload'};
  if(/^(?:scan|photograph|take a photo of)\s+(?:a\s+)?(?:document|paper|job sheet)$/i.test(s))return {action:'scan'};
  let m=s.match(/^(?:import|review|prepare import of)\s+(?:(?:the|my)\s+)?(.+?\.(?:csv|tsv|txt))\s+(?:as|into|to)\s+(jobs?|customers?|clients?|quotes?|quotations?|tasks?|expenses|payments)$/i);
  if(m)return {action:'reviewSavedFile',filename:m[1].trim(),target:targets[m[2].toLowerCase()]};
  m=s.match(/^(?:import|review|prepare)\s+(jobs?|customers?|clients?|quotes?|quotations?|tasks?|expenses|payments)\s+from\s+(?:the\s+)?library$/i);
  if(m)return {action:'showFiles',target:targets[m[1].toLowerCase()]};
  return null;
 }
 return Object.freeze({parse});
});
