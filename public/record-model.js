// Shared schema catalogue. Browser preferences, command journals and local audit stay local.
export const LEGACY_RECORD_TYPES=Object.freeze(['customers','jobs','quotes','invoices']);
export const RECORD_TYPES=Object.freeze([...LEGACY_RECORD_TYPES,'tasks','payments','expenses','jobCosts','opportunities','suppliers','supplyOrders','crew','calendars','calendarEntries','calendarProposals','calendarPreferences','routePlans','marketingCampaigns','pins','events']);
export const FINANCIAL_RECORD_TYPES=Object.freeze(['payments','expenses','jobCosts','supplyOrders']);
export const LOCAL_ONLY_STORES=Object.freeze(['settings','commandLog','calendarAudit']);
export const RECORD_LINKS=Object.freeze({customerId:'customers',jobId:'jobs',quoteId:'quotes',invoiceId:'invoices',supplierId:'suppliers',opportunityId:'opportunities',crewId:'crew',calendarId:'calendars',supplyOrderId:'supplyOrders',campaignId:'marketingCampaigns'});
export function serverRecordTypes(env){return env?.TF_EXTENDED_RECORDS_ENABLED==='true'?RECORD_TYPES:LEGACY_RECORD_TYPES}

export function linksForRecord(record){
 const links=Object.entries(RECORD_LINKS).filter(([field])=>record[field]);
 const source={job:'jobs',quote:'quotes',quotation:'quotes',customer:'customers',task:'tasks',invoice:'invoices',supplier:'suppliers',opportunity:'opportunities'}[record.sourceKind];
 if(record.sourceId&&source)links.push(['sourceId',source]);
 return links;
}


// Shared, pure record-envelope identity. Compatible with legacy local records that
// have no embedded businessId; a conflicting embedded scope is never acceptable.
export function recordIdentity(input){
 const {businessId,type,id,record}=input||{};
 const component=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
 if(!component(businessId)||!component(id)||!RECORD_TYPES.includes(type))
  throw Error('Invalid business record identity');
 if(record!==undefined){
  if(!record||typeof record!=='object'||Array.isArray(record))throw Error('Invalid record identity payload');
  if(record.id!=null&&record.id!==id||record.businessId!=null&&record.businessId!==businessId)
   throw Error('Record identity conflicts with requested business or identifier');
 }
 return Object.freeze({businessId,type,id,key:[businessId,type,id].join(':')});
}
export function validRecordRevision(value){return Number.isSafeInteger(value)&&value>=0}

export const EXTENDED_SCHEMA=Object.freeze({id:'0003_extended_business_records',sha256:'e19a6c3d3016403357488db2159d5ff3643672f6b6b2c4908a37a036cc69add0',version:3});
