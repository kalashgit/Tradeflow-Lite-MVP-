/* TradeFlow Library v1 — local documents, folder organization and a single intake doorway.
   Offline browser storage only. No cloud sync, OCR, permanent AI memory or automatic job mutation. */
(function(root){
'use strict';
const DB='tradeflow-library-v1', LIMIT=12*1024*1024;
const initial=['Jobs & Projects','Customers','Opportunities','Quotations & Invoices','Other Documents'];
const glyphs={
 folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3z"/><path d="M3 11h18"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 sparkle:'<path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>',
 upload:'<path d="M12 16V3m0 0L7 8m5-5 5 5M4 16v4h16v-4"/>',
 camera:'<path d="M4 7h4l2-3h5l2 3h3v13H4z"/><circle cx="12" cy="13" r="3.5"/>',
 jobs:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
 customers:'<circle cx="9" cy="8" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 6a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5"/>',
 opportunity:'<circle cx="12" cy="10" r="7"/><circle cx="12" cy="10" r="2.5"/><path d="M12 22s-7-7-7-12"/>',
 doc:'<path d="M6 2h8l5 5v15H6zM14 2v6h5M9 13h7M9 17h6"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',
 back:'<path d="m15 5-7 7 7 7"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',
 download:'<path d="M12 3v13m0 0-5-5m5 5 5-5M4 18v3h16v-3"/>',
 trash:'<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6m4-6v6"/>'
};
const svg=(id,n=23)=>'<svg aria-hidden="true" width="'+n+'" height="'+n+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(glyphs[id]||glyphs.folder)+'</svg>';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let records=[],selected='',search='',loading=false,opened=false,dbPromise;
let extraction=null,extractBusy=false,extractStatus='';
function connect(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{const d=request.result;if(!d.objectStoreNames.contains('files'))d.createObjectStore('files',{keyPath:'id'})};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 }).catch(error=>{dbPromise=null;throw error});
 return dbPromise;
}
async function transaction(mode,operation){
 const db=await connect();
 return new Promise((resolve,reject)=>{let result;const tx=db.transaction('files',mode),store=tx.objectStore('files');try{result=operation(store)}catch(e){tx.abort();reject(e);return}
 tx.oncomplete=()=>resolve(result?.result);tx.onabort=()=>reject(tx.error||Error('Storage operation failed'));tx.onerror=()=>reject(tx.error)});
}
async function load(){
 loading=true;
 try{records=await transaction('readonly',store=>store.getAll())||[];records.sort((a,b)=>String(b.addedAt).localeCompare(String(a.addedAt)))}
 finally{loading=false}
 return records;
}
async function refresh(){await load();root.dispatchEvent(new CustomEvent('tf-library-changed'))}
const groups=[
 ['Jobs & Projects','jobs'],['Customers','customers'],['Opportunities','opportunity'],
 ['Quotations & Invoices','doc'],['Other Documents','folder']
];
function itemRow(r){
 return '<div class="tf-lib-file"><span class="tf-lib-fileicon">'+svg('doc',21)+'</span><div class="tf-lib-filetext"><strong>'+escape(r.name)+'</strong><small>'+escape(r.folder)+' · '+Math.ceil(r.size/1024)+' KB · '+new Date(r.addedAt).toLocaleDateString()+'</small></div><button type="button" data-library="download" data-id="'+escape(r.id)+'" aria-label="Download '+escape(r.name)+'">'+svg('download',20)+'</button>'+( /\.(csv|tsv|txt)$/i.test(r.name)?'<button type="button" class="tf-lib-process" data-library="process" data-id="'+escape(r.id)+'" aria-label="Import records from '+escape(r.name)+'">Import records</button>':'')+( /\.(png|jpg|jpeg|webp|bmp|txt)$/i.test(r.name)?'<button type="button" class="tf-lib-process" data-library="extract" data-id="'+escape(r.id)+'" aria-label="Extract information from '+escape(r.name)+'">Read</button>':'')+'<button type="button" data-library="delete" data-id="'+escape(r.id)+'" aria-label="Delete '+escape(r.name)+'">'+svg('trash',19)+'</button></div>';
}
function render(){
 const filtered=records.filter(r=>!r.folderMarker&&(!selected||r.folder===selected)&&(!search||[r.name,r.folder].join(' ').toLowerCase().includes(search.toLowerCase())));
 const groupRows=groups.map(([name,icon])=>'<button type="button" data-library="folder" data-folder="'+escape(name)+'" class="tf-lib-folder"><span class="tf-lib-foldericon">'+svg(icon)+'</span><span>'+escape(name)+'</span><small>'+records.filter(r=>r.folder===name&&!r.folderMarker).length+'</small>'+svg('chevron',20)+'</button>').join('');
 const additional=[...new Set(records.map(r=>r.folder))].filter(x=>!groups.some(y=>y[0]===x)).sort().map(name=>'<button type="button" data-library="folder" data-folder="'+escape(name)+'" class="tf-lib-folder"><span class="tf-lib-foldericon">'+svg('folder')+'</span><span>'+escape(name)+'</span><small>'+records.filter(r=>r.folder===name&&!r.folderMarker).length+'</small>'+svg('chevron',20)+'</button>').join('');
 return '<section class="tf-lib" aria-label="Library">'+
 '<header class="tf-lib-head"><div><span class="tf-lib-mark">'+svg('folder',27)+'</span><h1>Library</h1></div><button type="button" data-library="search" aria-label="Search Library">'+svg('search',25)+'</button></header>'+
 '<div class="tf-lib-search" id="tfLibrarySearchWrap" '+(search?'':'hidden')+'><input id="tfLibrarySearch" type="search" placeholder="Search your documents" value="'+escape(search)+'" aria-label="Search library files"></div>'+
 '<section class="tf-lib-intake"><h2>'+svg('sparkle',25)+'<span>Add information to TradeFlow</span></h2><p>Upload once. Organize across your business.</p><div class="tf-lib-actions"><button type="button" data-library="import">'+svg('upload')+'<span>Import files</span></button><button type="button" data-library="scan">'+svg('camera')+'<span>Scan document</span></button></div></section>'+
 (selected?'<div class="tf-lib-subhead"><button type="button" data-library="back">'+svg('back',22)+'</button><h2>'+escape(selected)+'</h2><button type="button" data-library="add">'+svg('plus',20)+'<span>Add</span></button></div>':'<div class="tf-lib-sectionhead"><h2>Your folders</h2><button type="button" data-library="newfolder">'+svg('plus',19)+'<span>New</span></button></div>')+
 (selected?'<section class="tf-lib-files">'+(filtered.length?filtered.map(itemRow).join(''):'<p class="tf-lib-empty">No files in this folder yet. Tap Add to save one.</p>')+'</section>':'<nav class="tf-lib-folders" aria-label="Library folders">'+groupRows+additional+'</nav>'+(records.some(r=>!r.folderMarker)?'<section class="tf-lib-recent"><h2>Recent files</h2>'+filtered.slice(0,5).map(itemRow).join('')+'</section>':''))+
 (extraction?renderReview():'')+'<p class="tf-lib-disclaimer">Files are stored on this device only. Export important documents for backup. Uploading does not automatically create business records or AI memory.</p>'+
 '<input type="file" id="tfLibraryFile" hidden multiple accept=".csv,.tsv,.txt,.pdf,.doc,.docx,.xls,.xlsx,image/*,text/plain,application/pdf">'+
 '<input type="file" id="tfLibraryCamera" hidden accept="image/*" capture="environment"></section>';
}
function renderReview(){
 const d=extraction,engine=window.TradeFlowDocumentIntake;
 if(!d||!engine)return '';
 const preview=engine.extract(d.text,d.target);
 const schema=engine.fieldsByType[d.target]||[];
 const fields={...preview.fields,...(d.edits||{})};
 const options=[['jobs','Job'],['customers','Customer'],['quotes','Quotation']].map(([k,v])=>'<option value="'+k+'"'+(k===d.target?' selected':'')+'>'+v+'</option>').join('');
 const controls=schema.map(key=>'<label class="tf-doc-field"><span>'+escape(({'customerId':'Customer name or ID','scheduleTime':'Start time','durationMinutes':'Duration in minutes','sentDate':'Date sent'})[key]||key)+'</span><input data-doc-field="'+escape(key)+'" value="'+escape(fields[key]||'')+'" autocomplete="off" maxlength="1000"></label>').join('');
 return '<section class="tf-doc-review" aria-label="Document extraction review"><div class="tf-doc-top"><h2>Review document</h2><button type="button" data-library="closeReview" aria-label="Close document review">×</button></div><small>Source: '+escape(d.name)+'</small><p class="tf-doc-caution">Only labeled fields are extracted automatically. Check every value against the original; no records are saved until you confirm the existing TradeFlow import preview.</p>'+
 '<label class="tf-doc-target">Send to<select id="tfDocTarget">'+options+'</select></label>'+
 '<label class="tf-doc-original">Document text<textarea id="tfDocText" rows="7" spellcheck="false">'+escape(d.text)+'</textarea></label>'+
 (preview.uncertain.length?'<p class="tf-doc-warning">'+escape(preview.uncertain.join('; '))+'</p>':'')+
 '<div class="tf-doc-fields">'+controls+'</div>'+
 '<p class="tf-doc-status" role="status">'+escape(extractStatus||'Edit any fields, then continue to the existing import review.')+'</p>'+
 '<button class="tf-doc-continue" type="button" data-library="continueReview"'+(extractBusy?' disabled':'')+'>Review and import →</button>'+
 '<p class="tf-doc-footnote">Customer-linked jobs and quotes require an existing customer. For an unknown customer, import the customer first.</p></section>';
}
async function openExtraction(id){
 const record=await fileById(id);if(!record||record.folderMarker)throw Error('Document not found');
 const engine=root.TradeFlowDocumentIntake;if(!engine)throw Error('Document reader unavailable');
 const isImage=/^image\//i.test(record.type)||/\.(png|jpe?g|webp|bmp)$/i.test(record.name);
 const isText=/\.(txt)$/i.test(record.name);
 if(!isImage&&!isText)throw Error('This first extraction version supports photos and TXT files. PDF and handwriting recognition are not yet validated.');
 let result={text:'',confidence:0};
 extraction={id,name:record.name,target:({'Jobs & Projects':'jobs','Customers':'customers','Quotations & Invoices':'quotes'})[record.folder]||'jobs',text:'',edits:{}};
 extractStatus='Preparing source…';extractBusy=true;root.dispatchEvent(new CustomEvent('tf-library-changed'));
 try{
  if(isText)result={text:(await record.blob.text()).slice(0,80000),confidence:null};
  else{
   if(!confirm('Load the free OCR engine to read this photo on your device? Initial download requires internet and uses third-party code. No TradeFlow file is intentionally uploaded to an OCR API.')){extractStatus='OCR cancelled. You can enter text manually.';return}
   result=await engine.recognizeImage(record.blob,{onProgress:p=>{extractStatus='Reading photo '+p+'%…';const el=document.querySelector('.tf-doc-status');if(el)el.textContent=extractStatus}});
  }
  extraction.text=result.text||'';extractStatus='Text extracted'+(result.confidence!==null?' (OCR estimate '+Math.round(result.confidence)+'%). Verify every field.':'.');
 }catch(error){extractStatus='Automatic reading unavailable: '+String(error?.message||error)+'. Type or paste the document text instead.'}
 finally{extractBusy=false;root.dispatchEvent(new CustomEvent('tf-library-changed'))}
}
async function continueReview(){
 const engine=root.TradeFlowDocumentIntake;if(!engine||!extraction)return;
 const doc=document.getElementById('tfDocText');if(doc)extraction.text=doc.value.slice(0,80000);
 const inferred=engine.extract(extraction.text,extraction.target);
 const formValues={...inferred.fields,...extraction.edits};
 const csv=engine.asCsv(extraction.target,formValues);
 const name=extraction.name.replace(/\.[^.]*$/,'')+'-extracted.csv';
 // Reuse EXACT same import-validation overlay as tap/voice CSV. No direct mutation.
 root.dispatchEvent(new CustomEvent('tf-library-import',{detail:{file:new File([csv],name,{type:'text/csv'}),target:extraction.target,sourceDocumentId:extraction.id}}));
 extractStatus='Import preview opened. Confirm there to save records.';
}

function choose(kind){
 const input=document.getElementById(kind==='camera'?'tfLibraryCamera':'tfLibraryFile');
 if(input)input.click();
}
function selectedFolder(){return selected||'Other Documents'}
async function saveFiles(files){
 const folder=selectedFolder(),valid=[...files];
 if(!valid.length)return;
 if(valid.some(file=>file.size>LIMIT)){alert('Individual files must be 12 MB or smaller for local storage.');return}
 const now=new Date().toISOString();
 for(const file of valid){
  const blob=file.slice(0,file.size,file.type);
  await transaction('readwrite',store=>store.put({id:crypto.randomUUID(),folder,name:file.name||'Camera photo.jpg',type:file.type||'application/octet-stream',size:file.size,addedAt:now,blob}));
 }
 await refresh();
}
async function fileById(id){return transaction('readonly',s=>s.get(id))}
async function download(id){
 const rec=await fileById(id);if(!rec)return;
 const href=URL.createObjectURL(rec.blob),anchor=document.createElement('a');
 anchor.href=href;anchor.download=rec.name;anchor.click();setTimeout(()=>URL.revokeObjectURL(href),3000);
}
async function remove(id){
 const rec=await fileById(id);if(!rec||!confirm('Remove '+rec.name+' from this device?'))return;
 await transaction('readwrite',s=>s.delete(id));await refresh();
}
async function startImport(id,target){
 const record=await fileById(id);if(!record||record.folderMarker)throw Error('Document not found');
 if(!/\.(csv|tsv|txt)$/i.test(record.name))throw Error('This file cannot be imported as CSV');
 if(!['jobs','customers','quotes','tasks','expenses','payments'].includes(target))throw Error('Unsupported import type');
 root.dispatchEvent(new CustomEvent('tf-library-import',{detail:{file:new File([record.blob],record.name,{type:record.type}),target}}));
 return {status:'review',message:'Review the import fields and confirm before saving.'};
}
async function runCommand(request){
 if(!request||!request.action)return {status:'unsupported'};
 if(request.action==='open')return {status:'navigate'};
 if(request.action==='upload')return {status:'pick-file'};
 if(request.action==='scan')return {status:'pick-camera'};
 if(request.action==='showFiles')return {status:'navigate',folder:({'jobs':'Jobs & Projects','customers':'Customers','quotes':'Quotations & Invoices'})[request.target]||''};
 if(request.action!=='reviewSavedFile')return {status:'unsupported'};
 const matches=(await load()).filter(r=>!r.folderMarker&&r.name.toLowerCase()===String(request.filename||'').toLowerCase());
 if(!matches.length)return {status:'not_found',message:'No saved file with that exact name. Open Library to select a file.'};
 if(matches.length!==1)return {status:'ambiguous',message:'Multiple files have this name. Open Library and choose the right one.'};
 return startImport(matches[0].id,request.target);
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-library]');
 if(!button)return;
 const action=button.dataset.library;
 try{
  if(action==='search'){const wrap=document.getElementById('tfLibrarySearchWrap');wrap.hidden=!wrap.hidden;if(!wrap.hidden)wrap.querySelector('input')?.focus();return}
  if(action==='folder'){selected=button.dataset.folder;root.dispatchEvent(new CustomEvent('tf-library-changed'));return}
  if(action==='back'){selected='';root.dispatchEvent(new CustomEvent('tf-library-changed'));return}
  if(action==='import'||action==='add'){choose('file');return}
  if(action==='scan'){choose('camera');return}
  if(action==='download'){await download(button.dataset.id);return}
  if(action==='extract'){await openExtraction(button.dataset.id);return}
  if(action==='closeReview'){extraction=null;extractStatus='';root.dispatchEvent(new CustomEvent('tf-library-changed'));return}
  if(action==='continueReview'){try{await continueReview()}catch(error){extractStatus=String(error.message||error);const el=document.querySelector('.tf-doc-status');if(el)el.textContent=extractStatus}return}
  if(action==='process'){
   const record=await fileById(button.dataset.id);if(!record)return;
   const defaultTarget={'Jobs & Projects':'jobs','Customers':'customers','Quotations & Invoices':'quotes'}[record.folder]||'';
   const value=defaultTarget||prompt('Import into: jobs, customers, quotes, tasks, expenses or payments','jobs');
   const target=String(value||'').trim().toLowerCase();
   if(!['jobs','customers','quotes','tasks','expenses','payments'].includes(target)){if(value)alert('Choose a supported record type.');return}
   await startImport(record.id,target);return;
  }
  if(action==='delete'){await remove(button.dataset.id);return}
  if(action==='newfolder'){
   const name=prompt('New folder name');
   if(!name?.trim())return;
   const clean=name.trim().slice(0,70);
   if(groups.some(x=>x[0].toLowerCase()===clean.toLowerCase())||records.some(x=>x.folder.toLowerCase()===clean.toLowerCase())){selected=clean;root.dispatchEvent(new CustomEvent('tf-library-changed'));return}
   // Folder index itself stored as small metadata row so empty folders remain visible.
   await transaction('readwrite',store=>store.put({id:crypto.randomUUID(),folder:clean,name:'.folder',type:'application/x-tradeflow-folder',size:0,addedAt:new Date().toISOString(),blob:new Blob([]),folderMarker:true}));
   await refresh();selected=clean;root.dispatchEvent(new CustomEvent('tf-library-changed'));return;
  }
 }catch(error){alert('Library: '+error.message)}
});
document.addEventListener('change',async event=>{
 const id=event.target?.id;
 if(id==='tfDocTarget'&&extraction){extraction.target=event.target.value;extraction.edits={};root.dispatchEvent(new CustomEvent('tf-library-changed'));return}
 if(id==='tfLibraryFile'||id==='tfLibraryCamera'){
  try{await saveFiles(event.target.files||[])}catch(error){alert('Could not save file: '+error.message)}
  event.target.value='';
 }
});
document.addEventListener('input',event=>{
 if(extraction&&event.target?.matches?.('[data-doc-field]')){extraction.edits[event.target.dataset.docField]=event.target.value;return}
 if(extraction&&event.target?.id==='tfDocText'){extraction.text=event.target.value.slice(0,80000);return}
 if(event.target?.id==='tfLibrarySearch'){
  search=event.target.value.toLowerCase();
  // Only filter the file list; avoid full app rerender while keyboard is open.
  const panel=document.querySelector('.tf-lib-recent,.tf-lib-files');
  if(panel){const rows=records.filter(r=>!r.folderMarker&&(!selected||r.folder===selected)&&(!search||[r.name,r.folder].join(' ').toLowerCase().includes(search)));panel.innerHTML=(selected?'': '<h2>Recent files</h2>')+(rows.length?rows.slice(0,selected?999:5).map(itemRow).join(''):'<p class="tf-lib-empty">No matching documents</p>')}
 }
});
load().then(()=>root.dispatchEvent(new CustomEvent('tf-library-changed'))).catch(error=>console.warn('Library storage unavailable:',error));
root.TradeFlowLibrary=Object.freeze({render,refresh,load,runCommand,chooseFolder(name){selected=name||'';root.dispatchEvent(new CustomEvent('tf-library-changed'))},pickFile:()=>choose('file'),pickCamera:()=>choose('camera')});
})(typeof window!=='undefined'?window:globalThis);
