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
