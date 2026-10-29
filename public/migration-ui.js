import {RECORD_TYPES,linksForRecord} from './record-model.js';
import {previewLocalMigration} from './migration-preview.js';
import {previewCloudRetrieval} from './cloud-retrieval.js';
import {createSyncQueue,createTenantTransport} from './sync-queue.js';
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canonical=x=>JSON.stringify(x&&typeof x==='object'?Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):x);
const clone=x=>JSON.parse(JSON.stringify(x));
async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)))),b=>b.toString(16).padStart(2,'0')).join('')}
function owner(session,businessId){return session?.status==='signed_in'&&session.identity?.issuer&&session.identity.subject&&session.businesses?.some(b=>b.business_id===businessId&&b.role==='owner')}
export async function prepareTransfer({db,stores,businessId,session,transport,allowLocalBusinessMapping=false}){
 if(!owner(session,businessId))throw Error('Sign in as a provisioned business owner before reviewing a transfer.');
 const snapshot=await globalThis.TradeFlowLocalRecovery.createBackup(db,stores),expectedStores=Object.fromEntries(RECORD_TYPES.map(type=>[type,snapshot.stores[type]]));
 const entries=RECORD_TYPES.flatMap(type=>(snapshot.stores[type]||[]).map(record=>({type,record})));
 if(entries.length>200)throw Error('This review supports up to 200 business records. No records were sent.');
 const supported=session.capabilities?.recordTypes||[],remoteByKey={},requests=entries.filter(e=>supported.includes(e.type)&&/^[A-Za-z0-9_-]{1,100}$/.test(e.record.id));let index=0;
 await Promise.all(Array.from({length:Math.min(4,requests.length)},async()=>{while(index<requests.length){
  const {type,record}=requests[index++],response=await transport.read(type,record.id),key=businessId+':'+type+':'+record.id;
  if(response.status===404)remoteByKey[key]=null;
  else if(response.status===200)remoteByKey[key]=response.record;
  else throw Error([401,403].includes(response.status)?'Account access expired or changed. Sign in and review again.':'Cloud records could not be checked. Nothing was sent.');
 }}));
 const review=await previewLocalMigration({snapshot,stores,businessId,session,remoteByKey,allowLocalBusinessMapping});
 const result={snapshot,expectedStores,review,businessId,identity:clone(session.identity),changes:[]};
 if(!review.readyForReview)return result;
 const changes=await Promise.all(review.changes.map(async c=>({...c,operationId:await hash({businessId,type:c.type,id:c.id,record:c.record,identity:session.identity}),dependsOn:[]})));
 const byKey=new Map(changes.map(c=>[c.type+':'+c.id,c])),statuses=new Map(review.records.map(r=>[r.type+':'+r.id,r.status]));
 for(const c of changes){if(statuses.get(c.type+':'+c.id)==='already_present')continue;for(const [field,type]of linksForRecord(c.record)){const parent=byKey.get(type+':'+c.record[field]);if(parent)c.dependsOn.push(parent.operationId)}c.dependsOn=[...new Set(c.dependsOn)]}
 const ordered=[],pending=changes.slice(),done=new Set();
 while(pending.length){const at=pending.findIndex(c=>c.dependsOn.every(id=>done.has(id)));if(at<0){review.readyForReview=false;review.dependencyError='Linked records form a cycle that needs manual review.';return result}const c=pending.splice(at,1)[0];ordered.push(c);done.add(c.operationId)}
 result.changes=ordered;return result;
}
export function createMigrationController(host){
 const doc=host.document||document,session=host.session||(()=>globalThis.TradeFlowAccountSession.readSession()),transportFor=host.transport||createTenantTransport;
 let root=null,token=0,busy=false,status='',current=null,businessId='',plan=null,cloudReview=null,backupRequested=false,backupConfirmed=false,mapping=false;
 function view(){
  const owners=current?.businesses?.filter(b=>b.role==='owner')||[],ready=plan?.review.readyForReview;
  const choices=(owners.length>1?'<option value="">Choose destination business</option>':'')+owners.map(b=>'<option value="'+escape(b.business_id)+'"'+(b.business_id===businessId?' selected':'')+'>'+escape(b.business_name)+'</option>').join('');
  const report=plan?.review,rows=report?.records||[];
  const cloud=cloudReview;
  const cloudPanel=cloud?'<section aria-label="Cloud record comparison"><p>'+cloud.counts.newOnDevice+' missing on this device · '+cloud.counts.identical+' identical · '+cloud.counts.conflicts+' conflicts</p><ul class="tf-transfer-records">'+cloud.records.map(r=>'<li><strong>'+escape(r.type+' / '+r.id)+'</strong><span>'+escape(r.status.replaceAll('_',' '))+'</span></li>').join('')+'</ul><p>This is a read-only comparison. Cloud records have not been copied or merged. Revisions must be rechecked before any future approved import.</p></section>':'';
  return '<div class="tf-transfer"><p data-transfer-status role="status">'+escape(status)+'</p>'+
   (!owners.length?'<p><a href="/api/v1/session/login">Sign in</a> with a provisioned business owner account. Signing in never grants ownership.</p>':
   '<label>Destination business<select data-transfer-business'+(busy?' disabled':'')+'>'+choices+'</select></label><label class="tf-transfer-check"><input type="checkbox" data-transfer-map'+(mapping?' checked':'')+(busy?' disabled':'')+'> Assign this device’s local-business records to the selected business. Other business scopes cannot be reassigned.</label><button type="button" data-transfer-action="prepare"'+(busy||!businessId?' disabled':'')+'>Review cloud transfer</button> <button type="button" data-transfer-action="cloud-review"'+(busy||!businessId?' disabled':'')+'>Compare cloud records on this device (read only)</button>')+
   cloudPanel+
   (report?'<p>'+rows.filter(r=>r.status==='ready').length+' new · '+rows.filter(r=>r.status==='already_present').length+' already present · '+rows.filter(r=>!['ready','already_present'].includes(r.status)).length+' needing review</p>'+
   '<p>'+report.unsupported.length+' unsupported record groups · '+report.missingReferences.length+' missing links · '+report.requiresBusinessRelabel.length+' business-scope conflicts · '+report.oversizedRecords.length+' records too large</p>'+
   (report.dependencyError?'<p>'+escape(report.dependencyError)+'</p>':'')+
   '<ul class="tf-transfer-records">'+rows.map(r=>{const record=plan.snapshot.stores[r.type]?.find(x=>x.id===r.id);return '<li><strong>'+escape(record?.name||record?.title||record?.project_name||record?.number||record?.reference||r.id)+'</strong><span>'+escape(r.type+' · '+r.status+(record?.status?' · '+record.status:'')+(record?.amount!=null?' · Recorded amount: '+(record.currency||'')+' '+record.amount:''))+'</span></li>'}).join('')+'</ul>'+
   '<button type="button" data-transfer-action="backup"'+(busy?' disabled':'')+'>Download transfer backup</button><label class="tf-transfer-check"><input type="checkbox" data-transfer-backup'+(backupConfirmed?' checked':'')+(!backupRequested||busy?' disabled':'')+'> I saved this backup securely.</label>'+
   '<button type="button" data-transfer-action="transfer"'+(!ready||!backupConfirmed||busy||!plan.changes.length?' disabled':'')+'>Approve and transfer reviewed records</button>':'')+
   '<p class="tf-transfer-note">Review only reads cloud records. Transfer requires a saved backup and your explicit confirmation. Local records remain unchanged. Settings, command journals, local audit and Library files are excluded. This is a one-time transfer, not automatic synchronization.</p></div>';
 }
 function paint(){if(root?.isConnected!==false&&root)root.innerHTML=view()}
 function reset(){plan=null;cloudReview=null;backupRequested=false;backupConfirmed=false}
 async function open(container){const generation=++token;root=container;reset();busy=true;current=null;businessId='';status='Checking business access…';paint();const result=await session();if(generation!==token)return;current=result;const owned=result.businesses?.filter(b=>b.role==='owner')||[];businessId=owned.length===1?owned[0].business_id:'';busy=false;status=businessId?'Choose the business that should receive your existing records.':'An authorized owner membership is required. Your records remain on this device.';paint()}
 async function prepare(){
  if(busy)return;reset();busy=true;status='Reading local records and checking existing cloud records…';paint();const generation=token;
  try{const identity=await session();if(!owner(identity,businessId))throw Error('Owner access is unavailable. Sign in again.');const result=await prepareTransfer({db:host.db(),stores:host.stores,businessId,session:identity,transport:transportFor(businessId),allowLocalBusinessMapping:mapping});if(generation!==token)return;current=identity;plan=result;status=result.review.readyForReview?'Review the records, save the backup, then confirm the transfer.':'Transfer blocked by the items below. Local records are unchanged.'}catch(error){status=error.message}finally{if(generation===token){busy=false;paint()}}
 }
 async function reviewCloud(){
  if(busy||!businessId)return;
  reset();busy=true;status='Comparing cloud records with this device. Nothing will be imported…';paint();
  const generation=token,selectedBusiness=businessId;
  try{
   const identity=await session();
   if(!owner(identity,selectedBusiness))throw Error('Owner access is unavailable. Sign in again.');
   const local=await globalThis.TradeFlowLocalRecovery.readStores(host.db(),RECORD_TYPES);
   const review=await previewCloudRetrieval({businessId:selectedBusiness,session:identity,localStores:local,transport:transportFor(selectedBusiness)});
   if(generation!==token||businessId!==selectedBusiness)return;
   const verified=await session();
   if(!owner(verified,selectedBusiness)||verified.identity.issuer!==identity.identity.issuer||verified.identity.subject!==identity.identity.subject)
    throw Error('Owner session changed; comparison discarded.');
   current=verified;cloudReview=review;
   status='Read-only cloud comparison complete. No local data was changed.';
  }catch(error){if(generation===token)status=error.message}
  finally{if(generation===token){busy=false;paint()}}
 }
 async function transfer(){
  if(busy||!plan?.review.readyForReview||!backupConfirmed)return;
  busy=true;status='Checking approval and preparing the reviewed transfer…';paint();const active=plan,generation=token;
  try{
   const strictSession=async()=>{const value=await session();return owner(value,active.businessId)&&value.identity.issuer===active.identity.issuer&&value.identity.subject===active.identity.subject?value:{status:'signed_out',businesses:[]}};
   const queue=createSyncQueue({db:host.db(),businessId:active.businessId,session:strictSession,transport:transportFor(active.businessId)});
   const destination=current.businesses.find(b=>b.business_id===active.businessId)?.business_name||active.businessId;
   const staged=await queue.stageMigration({changes:active.changes,expectedStores:active.expectedStores,expectedIdentity:active.identity,backupConfirmed,backupChecksum:active.snapshot.integrity.sha256,approve:()=>host.confirm('Transfer '+active.changes.length+' reviewed record(s) to '+destination+'? Local records stay on this device. No customer messages or financial transactions will be sent.')});
   if(staged.status==='cancelled'){status='Transfer cancelled. Nothing was sent.';return}
   const operationIds=staged.operationIds;
   for(let pass=0;pass<Math.ceil(operationIds.length/10);pass++){const outcome=await queue.drain({limit:10,operationIds});if(outcome.status!=='drained'||outcome.processed===0)break}
   const selected=(await queue.list()).filter(r=>operationIds.includes(r.change.operationId)),applied=selected.filter(r=>r.status==='applied').length;
   status=applied===operationIds.length?applied+' reviewed record(s) are confirmed in the selected cloud business. Automatic sync is off.':applied+' of '+operationIds.length+' reviewed record(s) confirmed. Remaining work is retained for a new review/resume; no automatic overwrite.';
   const now=await globalThis.TradeFlowLocalRecovery.readStores(host.db(),RECORD_TYPES);if(canonical(now)!==canonical(active.expectedStores))status+=' New local edits were not part of this transfer.';
   if(generation!==token)return;
  }catch(error){status=error.message}finally{if(generation===token){busy=false;paint()}}
 }
 doc.addEventListener('click',e=>{const b=e.target.closest?.('[data-transfer-action]');if(!b||!root?.contains(b))return;e.preventDefault();if(b.dataset.transferAction==='prepare')void prepare();if(b.dataset.transferAction==='cloud-review')void reviewCloud();if(b.dataset.transferAction==='transfer')void transfer();if(b.dataset.transferAction==='backup'&&plan&&!busy){host.download(plan.snapshot);backupRequested=true;paint()}});
 doc.addEventListener('change',e=>{if(!root?.contains(e.target)||busy)return;if(e.target.matches('[data-transfer-business]')){businessId=e.target.value;reset();status='Destination changed; prepare a fresh review.'}if(e.target.matches('[data-transfer-map]')){mapping=e.target.checked;reset();status='Business mapping changed; prepare a fresh review.'}if(e.target.matches('[data-transfer-backup]'))backupConfirmed=e.target.checked;paint()});
 return Object.freeze({open,prepare,transfer,reviewCloud,view});
}
