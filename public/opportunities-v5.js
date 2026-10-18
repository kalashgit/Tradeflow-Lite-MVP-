/* TradeFlow Opportunities 05 — compact native-feeling import/export sheets.
 * Existing research CSV QC is preserved; image capture requires manual transcription.
 * Sheet actions are offline-first. Only requested map lookups use network.
 */
(function(global){
'use strict';
let api=null,active='',sheet=null,shade=null,origin=null,photo=null,photoUrl='';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon={file:'<path d="M5 2h9l5 5v15H5zM14 2v6h6M8 12h8M8 16h8"/>',camera:'<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 18 6-6 4 4 3-3 5 5"/>',download:'<path d="M12 3v13m-4-4 4 4 4-4M4 18v3h16v-3"/>',crm:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v8c0 2 4 3 9 3s9-1 9-3V5M3 13v5c0 2 4 3 9 3s9-1 9-3v-5"/>',map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5zM9 3v16m6-14v16"/>',close:'<path d="M5 5l14 14M19 5 5 19"/>'};
const svg=kind=>'<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icon[kind]+'</svg>';
function button(kind,title,description,action){
 return '<button type="button" class="tf-op5-sheet-option" data-op-ux="'+action+'"><span class="tf-op5-sheet-icon">'+svg(kind)+'</span><span class="tf-op5-option-copy"><strong>'+esc(title)+'</strong><small>'+esc(description)+'</small></span><span class="tf-op5-option-arrow" aria-hidden="true">›</span></button>';
}
function shell(kind,body){
 const title=({import:'Import Opportunities',export:'Export Opportunities',photo:'Review photo entry'})[kind];
 return '<div class="tf-op5-handle" data-op-drag role="presentation"><span></span></div>'+
 '<header class="tf-op5-sheet-title"><h2 id="tfOpportunitySheetTitle">'+esc(title)+'</h2><button data-op-ux="dismiss" type="button" aria-label="Close">'+svg('close')+'</button></header>'+
 '<div class="tf-op5-sheet-body">'+body+'</div>';
}
function resetPhoto(){
 if(photoUrl)URL.revokeObjectURL(photoUrl);
 photoUrl='';photo=null;
}
function remove(){
 if(shade)shade.remove();if(sheet)sheet.remove();
 shade=null;sheet=null;active='';
 resetPhoto();
 if(origin?.isConnected)origin.focus({preventScroll:true});
 origin=null;
}
function present(kind,body){
 if(!shade){
  origin=document.activeElement;
  shade=document.createElement('div');shade.className='tf-op5-sheet-shade';
  shade.addEventListener('click',e=>{if(e.target===shade)remove()});
  sheet=document.createElement('section');sheet.className='tf-op5-sheet';sheet.setAttribute('role','dialog');
  sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-labelledby','tfOpportunitySheetTitle');
  document.body.append(shade,sheet);
  installDrag(sheet);
 }
 active=kind;sheet.classList.remove('tf-op5-expanded');sheet.style.removeProperty('transform');
 sheet.innerHTML=shell(kind,body);
 sheet.querySelector('[data-op-ux="dismiss"]')?.focus({preventScroll:true});
}
function open(kind){
 if(kind==='import')present('import',
   button('file','Import file','CSV / TSV research records','file')+
   button('camera','Take photo','Capture a document or opportunity','camera')+
   button('image','Choose from library','Select an existing photo','library')+
   '<button class="tf-op5-sheet-cancel" type="button" data-op-ux="dismiss">Cancel</button>');
 if(kind==='export')present('export',
   button('download','Export CSV','Full opportunity records with evidence','csv')+
   button('crm','Export for CRM','Simplified contact and pipeline columns','crm')+
   '<button class="tf-op5-sheet-cancel" type="button" data-op-ux="dismiss">Cancel</button>');
}
function installDrag(element){
 let start=null;
 const finish=e=>{
  if(!start)return;
  const delta=e.clientY-start.y,elapsed=Math.max(1,Date.now()-start.time),velocity=delta/elapsed;
  if(delta>95||velocity>0.85&&delta>35)remove();
  else if(delta< -60)element.classList.add('tf-op5-expanded');
  element.style.removeProperty('transform');start=null;
 };
 element.addEventListener('pointerdown',e=>{
  if(!e.target.closest('[data-op-drag]'))return;
  start={y:e.clientY,time:Date.now()};
  try{element.setPointerCapture(e.pointerId)}catch{}
 });
 element.addEventListener('pointermove',e=>{
  if(!start)return;
  const delta=e.clientY-start.y;
  element.style.transform='translate(-50%, '+Math.max(-60,Math.min(180,delta))+'px)';
 });
 element.addEventListener('pointerup',finish);
 element.addEventListener('pointercancel',()=>{start=null;element.style.removeProperty('transform')});
}
function showPhoto(file){
 if(!file||!/^image\//.test(file.type)||file.size>15*1024*1024)throw Error('Choose an image below 15 MB.');
 resetPhoto();photo=file;photoUrl=URL.createObjectURL(file);
 const body='<div class="tf-op5-photo-preview"><img src="'+esc(photoUrl)+'" alt="Chosen document or project photo"></div>'+
 '<p class="tf-op5-explain">Add the details visible in the image. Automatic image text extraction is not active; this stays a project signal until independently verified.</p>'+
 '<form id="tfOpPhotoForm" class="tf-op5-photo-form">'+
 '<label>Project / company name<input name="name" maxlength="150" required placeholder="Project or company"></label>'+
 '<label>Address or city<input name="address" maxlength="240" placeholder="Street, city and state"></label>'+
 '<label>Original public source URL (optional)<input name="source" type="url" maxlength="500" placeholder="https://..."></label>'+
 '<label>Source date (optional)<input name="sourceDate" type="date"></label>'+
 '<button class="tf-op5-photo-submit" type="submit">Save for review</button>'+
 '</form>';
 present('photo',body);
}
async function compress(file){
 if(!file)return '';
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();img.src=url;
  if(img.decode)await img.decode();else await new Promise((res,rej)=>{img.onload=res;img.onerror=rej});
  const w=img.naturalWidth,h=img.naturalHeight;
  if(!w||!h)throw Error('Image could not be decoded');
  const scale=Math.min(1,850/Math.max(w,h));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const encoded=canvas.toDataURL('image/jpeg',.52);
  return encoded.length<400000?encoded:'';
 }finally{URL.revokeObjectURL(url)}
}
async function submitPhoto(form){
 if(!api||!photo)return;
 const f=new FormData(form),name=String(f.get('name')||'').trim().slice(0,150),location=String(f.get('address')||'').trim().slice(0,240);
 const source=String(f.get('source')||'').trim().slice(0,500),date=String(f.get('sourceDate')||'').trim();
 if(!name)throw Error('Enter the project or organization name');
 if(source){const u=new URL(source);if(u.protocol!=='https:'||u.username||u.password)throw Error('Use a public HTTPS source URL')}
 const now=new Date().toISOString(),id='photo-'+api.uid();
 const record={id,record_id:id,source_record_id:'',project_name:name,organization_name:name,project_description:'Photo-captured opportunity; manually entered and pending source verification.',
  city:location,region:'',trade:api.trade?.()||'Electrical',status:'New',opportunity_type:'project_signal',evidence_status:'unresolved',
  source_url:source,source_date:date,verified_at:'',discovered_at:now,imported_at:now,
  evidence_notes:'Saved from selected photo; all typed details are user-provided and require verification.',
  evidence_photo_data:await compress(photo),latitude:null,longitude:null,map_location_status:'pending'};
 await api.put('opportunities',record);
 remove();
 await api.render();
 api.onImported?.([record]);
 api.notify?.('Photo record saved for review');
}
function mapPreview(records){
 const coords=(records||[]).filter(x=>Number.isFinite(x.latitude)&&Number.isFinite(x.longitude)&&x.map_enabled!==false);
 if(!coords.length)return '<div class="tf-op5-map-preview tf-op5-map-empty"><span>⌖</span><small>Locations appear here once mapped</small></div>';
 const arr=coords.slice(0,45),minX=Math.min(...arr.map(x=>x.longitude)),maxX=Math.max(...arr.map(x=>x.longitude)),minY=Math.min(...arr.map(x=>x.latitude)),maxY=Math.max(...arr.map(x=>x.latitude));
 const spanX=Math.max(.006,maxX-minX),spanY=Math.max(.006,maxY-minY);
 const circles=arr.map(x=>{const px=10+80*(x.longitude-minX)/spanX,py=90-80*(x.latitude-minY)/spanY;
  return '<circle cx="'+px.toFixed(2)+'" cy="'+py.toFixed(2)+'" r="1.6" fill="currentColor"/>'}).join('');
 return '<div class="tf-op5-map-preview" aria-label="Relative positions of '+coords.length+' mapped opportunities">'+
  '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">'+
  '<path d="M0 25H100M0 54H100M0 78H100M22 0V100M48 0V100M77 0V100" fill="none" stroke="#26566d" stroke-width=".7"/>'+
  '<path d="M-5 68Q28 50 51 19T106 -7M-3 30Q31 45 44 70T110 112" fill="none" stroke="#396579" stroke-width="1.4"/>'+
  '<g color="var(--tf-accent,#10cfe1)">'+circles+'</g></svg><span class="tf-op5-map-caption">LOCATION OVERVIEW</span></div>';
}
function init(bridge){
 api=bridge;
 document.addEventListener('click',async e=>{
  const b=e.target.closest?.('[data-op-ux]');if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();
  const action=b.dataset.opUx;
  try{
   if(action==='import'||action==='export'){open(action);return}
   if(action==='dismiss'){remove();return}
   if(action==='file'){remove();document.getElementById('opportunityFile')?.click();return}
   if(action==='camera'||action==='library'){
    let element=document.getElementById(action==='camera'?'tfOpCameraFile':'tfOpLibraryFile');
    if(!element){element=document.createElement('input');element.type='file';element.accept='image/*';element.id=action==='camera'?'tfOpCameraFile':'tfOpLibraryFile';element.hidden=true;
     if(action==='camera')element.setAttribute('capture','environment');
     document.body.appendChild(element);
     element.addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';if(file){try{showPhoto(file)}catch(err){alert(err.message)}}});
    }
    element.click();return;
   }
   if(action==='csv'||action==='crm'){
    remove();
    await (action==='csv'?api.exportCSV():api.exportCRM());
    return;
   }
  }catch(err){alert('Opportunity action failed: '+(err.message||err))}
 },true);
 document.addEventListener('submit',async e=>{
  if(e.target.id!=='tfOpPhotoForm')return;
  e.preventDefault();
  const submit=e.target.querySelector('button[type=submit]');if(submit?.disabled)return;
  if(submit)submit.disabled=true;
  try{await submitPhoto(e.target)}
  catch(err){if(submit)submit.disabled=false;alert('Photo not saved: '+err.message)}
 },true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.preventDefault();remove()}});
}
global.TradeFlowOpportunityUX={configure:init,mapPreview,close:remove,_test:{mapPreview,esc}};
})(typeof window!=='undefined'?window:globalThis);
