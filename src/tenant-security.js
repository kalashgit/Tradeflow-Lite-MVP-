import {RECORD_TYPES} from '../public/record-model.js';
/* TradeFlow server-side business authorization boundary.
 * No public endpoint should trust a client-provided userId, role or businessId.
 * An upstream identity verifier must establish the principal cryptographically.
 * D1 membership lookup must be scoped to the verified subject.
 */
export class AuthorizationError extends Error {
  constructor(message='Forbidden', status=403){super(message);this.name='AuthorizationError';this.status=status;}
}
export function requireVerifiedPrincipal(principal){
  if(!principal || principal.verified!==true || typeof principal.subject!=='string' ||
    !/^[A-Za-z0-9:_|.@-]{3,200}$/.test(principal.subject) ||
    typeof principal.issuer!=='string' || !principal.issuer.trim()){
    throw new AuthorizationError('Authentication required',401);
  }
  return Object.freeze({subject:principal.subject,issuer:principal.issuer});
}
const permissions=Object.freeze({
  owner:new Set(['records:read','records:write','members:read','members:manage','billing:manage','records:finance:write']),
  admin:new Set(['records:read','records:write','records:finance:write','members:read']),
  member:new Set(['records:read','records:write']),
  viewer:new Set(['records:read'])
});
export function requireBusinessId(value){
  if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(value))
    throw new AuthorizationError('Invalid business identifier',400);
  return value;
}
export async function authorizeBusiness({db,principal,businessId,permission}){
  const identity=requireVerifiedPrincipal(principal);
  const id=requireBusinessId(businessId);
  if(!Object.values(permissions).some(p=>p.has(permission)))
    throw new AuthorizationError('Unknown permission',400);
  if(!db || typeof db.prepare!=='function')throw new AuthorizationError('Authorization store unavailable',503);
  // Never use a role from the request body, and never return records before this check.
  const row=await db.prepare(
    'SELECT role FROM business_memberships WHERE business_id = ? AND issuer = ? AND subject = ? AND status = ? LIMIT 1'
  ).bind(id,identity.issuer,identity.subject,'active').first();
  if(!row || !permissions[row.role]?.has(permission))throw new AuthorizationError();
  return Object.freeze({businessId:id,subject:identity.subject,issuer:identity.issuer,role:row.role});
}
export function tenantRecordQuery({authorization,table,recordId}){
  if(!authorization?.businessId)throw new AuthorizationError();
  const allowed=new Set(RECORD_TYPES);
  if(!allowed.has(table))throw new AuthorizationError('Unknown record type',400);
  if(typeof recordId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(recordId))
    throw new AuthorizationError('Invalid record identifier',400);
  return {sql:'SELECT payload, revision, updated_at, deleted_at FROM tenant_records WHERE business_id = ? AND record_type = ? AND id = ? LIMIT 1',
    params:[authorization.businessId,table,recordId]};
}
