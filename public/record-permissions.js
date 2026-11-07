import {RECORD_TYPES,FINANCIAL_RECORD_TYPES} from './record-model.js';
// Company membership roles are server-owned. A crew record's display role/name
// never grants an authenticated account authority or company membership.
export const MANAGED_RECORD_TYPES=Object.freeze(['crew']);
export function recordWritePermission(type){
 if(!RECORD_TYPES.includes(type))throw Error('Unknown business record type');
 return FINANCIAL_RECORD_TYPES.includes(type)?'records:finance:write':MANAGED_RECORD_TYPES.includes(type)?'records:crew:write':'records:write';
}
export function mayWriteRecord(role,type){
 if(!RECORD_TYPES.includes(type))return false;
 return ['owner','admin'].includes(role)||role==='member'&&!FINANCIAL_RECORD_TYPES.includes(type)&&!MANAGED_RECORD_TYPES.includes(type);
}
export function mayAssignCrew(role){return ['owner','admin'].includes(role)}
