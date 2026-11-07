/* TF-RM-03-G02 — private device-local crew drafts in the existing commandLog.
 * Not a sync queue, job write, authentication grant or delivery receipt.
 * Reading requires the currently selected signed-in local business identity.
 */
import {projectCrewReportState} from './crew-report-state.js';

const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const canonical=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?
 Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v);
const freeze=x=>{
 if(x&&typeof x==='object'){for(const value of Object.values(x))freeze(value);Object.freeze(x)}
 return x;
};
const normalized=e=>({
 schemaVersion:e.schemaVersion,eventId:e.eventId,idempotencyKey:e.idempotencyKey,
 businessId:e.businessId,actorId:e.actorId,direction:e.direction,kind:e.kind,
 subject:{type:e.subject.type,id:e.subject.id,revision:e.subject.revision},
 note:e.note,eventAt:e.eventAt,deliveryState:'local_draft',
 serverRevision:null,readbackVerified:false,acknowledged:false,actionReceiptRef:null,
 executionAuthority:false
});

export function createCrewReportDraftJournal({db,businessId,session}={}){
 if(!db||typeof db.transaction!=='function'||
    typeof businessId!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(businessId)||
    typeof session!=='function')
  throw Error('Existing commandLog database, business and local session required');

 const current=async()=>{
  const state=await session();
  const i=state?.identity;
  if(state?.status!=='signed_in'||typeof i?.issuer!=='string'||!i.issuer||
     !validId(i.subject)||!state.businesses?.some(b=>
       b.business_id===businessId&&b.role==='member'))
   throw Error('Current signed-in local crew identity and company selection required');
  return freeze({issuer:i.issuer,subject:i.subject});
 };
 const draftId=(actor,eventId)=>'crew.report.draft:'+JSON.stringify([
  businessId,actor.issuer,actor.subject,eventId
 ]);
 const matches=(row,actor)=>row?.kind==='crew.report.draft'&&
  row.businessId===businessId&&row.actor?.issuer===actor.issuer&&
  row.actor?.subject===actor.subject;

 async function save(event){
  const actor=await current();
  if(!event||event.businessId!==businessId||event.deliveryState!=='local_draft'||
    event.readbackVerified===true||event.acknowledged===true||
    event.actionReceiptRef!=null||event.executionAuthority===true)
   throw Error('Only an unsubmitted local crew draft can be saved');
  // Reuse the existing report envelope checks. Local actor matching is not
  // independent server authentication and never authorizes a cloud operation.
  projectCrewReportState({event,queueRows:[],principal:actor});
  const report=normalized(event),key=draftId(actor,report.eventId);
  return new Promise((resolve,reject)=>{
   let tx,failed,stored;
   try{
    tx=db.transaction('commandLog','readwrite');
    const store=tx.objectStore('commandLog'),req=store.getAll();
    req.onsuccess=()=>{
     try{
      const all=req.result;
      if(!Array.isArray(all))throw Error('Local draft snapshot unavailable');
      const existing=all.find(r=>r.id===key);
      if(existing){
       if(!matches(existing,actor)||canonical(existing.report)!==canonical(report))
        throw Error('Local report identity or contents changed; review before saving');
       stored=existing.report;
       return;
      }
      const mine=all.filter(r=>matches(r,actor));
      if(mine.some(r=>r.report?.idempotencyKey===report.idempotencyKey))
       throw Error('Report operation ID already belongs to another local draft');
      if(mine.length>=20)throw Error('Local crew draft limit reached; review existing reports');
      const row={id:key,kind:'crew.report.draft',schemaVersion:1,businessId,
       actor:clone(actor),report:clone(report),state:'device_local_only',
       createdAt:report.eventAt};
      store.put(row);
      stored=report;
     }catch(error){failed=error;tx.abort()}
    };
    tx.oncomplete=()=>resolve(freeze(clone(stored)));
    tx.onerror=tx.onabort=()=>reject(failed||tx.error||Error('Local draft transaction failed'));
   }catch(error){reject(error)}
  });
 }

 async function list(){
  const actor=await current();
  return new Promise((resolve,reject)=>{
   let tx;
   try{
    tx=db.transaction('commandLog','readonly');
    const req=tx.objectStore('commandLog').getAll();
    tx.oncomplete=()=>{
     if(!Array.isArray(req.result)){reject(Error('Local draft snapshot unavailable'));return}
     const drafts=req.result.filter(row=>matches(row,actor)&&
      row.state==='device_local_only'&&row.schemaVersion===1&&
      row.id===draftId(actor,row.report?.eventId)&&
      row.report?.businessId===businessId&&row.report?.actorId===actor.subject&&
      row.report?.deliveryState==='local_draft').map(row=>clone(row.report));
     resolve(freeze(drafts));
    };
    tx.onerror=tx.onabort=()=>reject(tx.error||Error('Local draft read failed'));
   }catch(error){reject(error)}
  });
 }

 async function read(eventId){
  if(!validId(eventId))throw Error('Valid crew report event ID required');
  const drafts=await list();
  return drafts.find(d=>d.eventId===eventId)||null;
 }
 return freeze({save,list,read});
}
