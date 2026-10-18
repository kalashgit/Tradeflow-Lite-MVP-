/* TradeFlow offline backup: pure schema guard, no side effects. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowBackupSchema=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const requiredByVersion={payments:5,invoices:6,jobCosts:6,marketingCampaigns:7,crew:7,routePlans:7,suppliers:8,supplyOrders:8,commandLog:8,calendars:9,calendarEntries:9,calendarProposals:9,calendarPreferences:9,calendarAudit:9};
function validate(value,stores,{maxRecords=100000}={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.format!=='tradeflow-lite'||!Number.isInteger(value.version)||value.version<1||value.version>9||!value.stores||typeof value.stores!=='object'||Array.isArray(value.stores))throw Error('Unsupported TradeFlow backup format');
 if(!Array.isArray(stores)||!stores.length||new Set(stores).size!==stores.length)throw Error('Invalid application store configuration');
 const checked={};let total=0;
 for(const store of stores){
  const minimum=requiredByVersion[store]||1;
  const optional=store==='pins'||(value.version<4&&minimum===1)||value.version<minimum;
  const raw=value.stores[store];
  if(raw===undefined&&optional){checked[store]=[];continue}
  if(!Array.isArray(raw))throw Error('Missing or invalid '+store+' backup records');
  total+=raw.length;if(total>maxRecords)throw Error('Backup contains too many records');
  const ids=new Set();
  for(const item of raw){
   if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||!item.id.trim()||ids.has(item.id))throw Error('Invalid or duplicate '+store+' record');
   ids.add(item.id);
  }
  checked[store]=raw;
 }
 return Object.freeze({stores:checked,recordCount:total,version:value.version});
}
return Object.freeze({validate});
});
