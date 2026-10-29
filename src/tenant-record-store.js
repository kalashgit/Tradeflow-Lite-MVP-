import {AuthorizationError,tenantRecordQuery} from './tenant-security.js';

export function validateRecordWrite(body) {
 if (!body || typeof body!=='object' || Array.isArray(body) ||
     !Number.isSafeInteger(body.revision) || body.revision<0 || body.revision>2147483646 ||
     !body.record || typeof body.record!=='object' || Array.isArray(body.record))
   throw new AuthorizationError('Record and nonnegative expected revision required',400);
 const payload=JSON.stringify(body.record);
 if (!payload || new TextEncoder().encode(payload).byteLength>30000)
   throw new AuthorizationError('Record too large',413);
 return {expectedRevision:body.revision,payload};
}

export async function writeTenantRecord(db,authorization,recordType,recordId,body) {
 const {params}=tenantRecordQuery({authorization,table:recordType,recordId});
 if (!authorization?.subject || !authorization?.issuer)
   throw new AuthorizationError('Authenticated membership required',403);
 const {expectedRevision,payload}=validateRecordWrite(body);
 const sql=`INSERT INTO tenant_records
 (business_id,record_type,id,revision,payload,updated_by_issuer,updated_by_subject)
 SELECT ?,?,?,?,?,?,? WHERE ?=0
 ON CONFLICT(business_id,record_type,id) DO UPDATE SET
 payload=excluded.payload,
 revision=tenant_records.revision+1,
 updated_at=datetime('now'),
 updated_by_issuer=excluded.updated_by_issuer,
 updated_by_subject=excluded.updated_by_subject
 WHERE tenant_records.revision=? AND tenant_records.deleted_at IS NULL
 RETURNING revision,updated_at`;
 const row=await db.prepare(sql).bind(...params,expectedRevision+1,payload,
   authorization.issuer,authorization.subject,expectedRevision,expectedRevision).first();
 if (!row)throw new AuthorizationError('Revision conflict; reload before saving',409);
 return {revision:row.revision,updatedAt:row.updated_at};
}
