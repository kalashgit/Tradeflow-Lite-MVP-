/* TradeFlow launch sprint: bounded, read-only map voice vocabulary.
 * No geocoding performed here, no writes, and no claim of successful map actions.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowLaunchMapCommands=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const clean=v=>String(v||'').toLowerCase().trim().replace(/^(?:hey|ok|okay|hello)\s+trade\s*flow[, ]*/,'').replace(/[.!?]+$/,'').replace(/\s+/g,' ');
function parse(input){
 const s=clean(input);
 if(/^(?:open|show|go to|view|bring up)\s+(?:the\s+)?map(?:\s+(?:page|workspace|screen))?$/.test(s))return {kind:'open'};
 if(/^(?:show|find|locate|center on)\s+(?:me|my location|current location)(?:\s+on\s+(?:the\s+)?map)?$/.test(s)||/^(?:show|find)\s+my\s+(?:current\s+)?location\s+on\s+(?:the\s+)?map$/.test(s))return {kind:'location'};
 if(/^(?:show|open|display)\s+(?:the\s+)?map\s+(?:layers|filters|settings|controls)$/.test(s))return {kind:'layers'};
 if(/^(?:clear|remove|reset)\s+(?:the\s+)?(?:map\s+)?route$/.test(s))return {kind:'clearRoute'};
 if(/^(?:show|find|go to|center on|open)\s+(?:my\s+|the\s+)?(?:business\s+)?(?:headquarters|hq)(?:\s+on\s+(?:the\s+)?map)?$/.test(s))return {kind:'headquarters'};
 let m=s.match(/^(?:(?:set|switch|change)\s+(?:the\s+)?map\s+(?:to\s+)?|(?:show|use)\s+)(standard|terrain|intelligence)(?:\s+(?:view|mode|map))?$/);
 if(m)return {kind:'mode',mode:m[1]};
 m=String(input||'').trim().match(/^(?:(?:hey|ok|okay)\s+trade\s*flow[, ]*)?(?:(?:search|find|look up|locate)\s+(?:on\s+)?(?:the\s+)?map\s+(?:for\s+)?|(?:show|find|locate)\s+(.+?)\s+on\s+(?:the\s+)?map\s*$)(.+)?$/i);
 if(m){const query=String(m[1]||m[2]||'').trim().replace(/[.!?]+$/,'');if(query.length>=3&&query.length<=180&&!/^(?:my location|current location|headquarters|hq|map|overdue tasks)$/i.test(query))return {kind:'search',query};}
 return null;
}
return Object.freeze({parse});
});