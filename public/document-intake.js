/* TradeFlow local document intake: explicit label extraction, never silent record writes.
   Image OCR loads pinned open-source Tesseract only after user's explicit consent.
   No server OCR endpoint is called; requires network on first use and provider access. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowDocumentIntake=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const limit=80000;
const trim=v=>String(v??'').trim().slice(0,1000);
const lines=v=>String(v||'').slice(0,limit).replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean);
const fieldsByType={
 jobs:['title','customerId','status','date','scheduleTime','durationMinutes','address'],
 customers:['name','phone','email','address','company','notes'],
 quotes:['title','customerId','amount','status','sentDate']
};
const labels={
 title:/^(?:job(?: title| description)?|work order|project|scope(?: of work)?|description|quotation|quote(?: title)?)\s*[:\-]\s*(.+)$/i,
 customerId:/^(?:customer|client|customer name|client name|customer id)\s*[:\-]\s*(.+)$/i,
 name:/^(?:customer|client|name|contact name)\s*[:\-]\s*(.+)$/i,
 phone:/^(?:phone|telephone|mobile|cell)\s*[:\-]\s*(.+)$/i,
 email:/^(?:email|e-mail)\s*[:\-]\s*(.+)$/i,
 address:/^(?:site address|job address|work address|service address|address|location)\s*[:\-]\s*(.+)$/i,
 date:/^(?:scheduled date|appointment date|job date|work date|date)\s*[:\-]\s*(.+)$/i,
 scheduleTime:/^(?:scheduled time|appointment time|start time|time)\s*[:\-]\s*(.+)$/i,
 durationMinutes:/^(?:duration|duration minutes|estimated duration)\s*[:\-]\s*(.+)$/i,
 amount:/^(?:quote amount|total|amount|price|estimated value)\s*[:\-]\s*(.+)$/i,
 sentDate:/^(?:date sent|quote date|quotation date)\s*[:\-]\s*(.+)$/i,
 status:/^(?:job status|quote status|status)\s*[:\-]\s*(.+)$/i,
 company:/^(?:company|business name|organization)\s*[:\-]\s*(.+)$/i,
 notes:/^(?:notes|comments)\s*[:\-]\s*(.+)$/i
};
function extract(text,target){
 const allowed=fieldsByType[target];if(!allowed)throw Error('Unsupported destination');
 const result={},evidence={},uncertain=[],other=[];
 for(const line of lines(text)){
  let matched=false;
  for(const key of allowed){
   const m=line.match(labels[key]);if(!m)continue;
   matched=true;
   const value=trim(m[1]);
   if(result[key]&&result[key]!==value){uncertain.push(key+': conflicting values');continue}
   if(value){result[key]=value;evidence[key]=line}
   break;
  }
  if(!matched)other.push(line);
 }
 if(!Object.keys(result).length)uncertain.push('No supported field labels recognized. Enter the fields manually.');
 // Never infer names, schedules, addresses or monetary amounts from unlabelled document text.
 return {target,fields:result,evidence,uncertain,unmatched:other.slice(0,30),sourceLength:String(text||'').length};
}
function csvCell(value){let s=String(value??'');if(/^[\t\r\n ]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
function asCsv(target,fields){
 const allowed=fieldsByType[target];if(!allowed)throw Error('Unsupported destination');
 const keys=allowed.filter(k=>trim(fields[k]));
 if(!keys.length)throw Error('No values to review');
 return keys.map(csvCell).join(',')+'\r\n'+keys.map(k=>csvCell(trim(fields[k]))).join(',')+'\r\n';
}
let scriptPromise;
function loadTesseract(){
 if(typeof window==='undefined')return Promise.reject(Error('OCR requires a browser'));
 if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
 if(scriptPromise)return scriptPromise;
 scriptPromise=new Promise((resolve,reject)=>{
  const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  s.crossOrigin='anonymous';s.referrerPolicy='no-referrer';
  s.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(Error('OCR engine unavailable'));
  s.onerror=()=>reject(Error('OCR engine could not be loaded. Check internet access.'));
  document.head.appendChild(s);
 }).catch(error=>{scriptPromise=null;throw error});
 return scriptPromise;
}
async function recognizeImage(blob,{onProgress}={}){
 if(!blob||!/^image\//.test(blob.type||''))throw Error('Choose an image file');
 if(blob.size>12*1024*1024)throw Error('Image exceeds local intake limit');
 const engine=await loadTesseract();
 let worker;
 try{
  worker=await engine.createWorker('eng',1,{logger:event=>{if(event?.status==='recognizing text')onProgress?.(Math.round((event.progress||0)*100))}});
  const result=await worker.recognize(blob);
  const text=String(result?.data?.text||'').slice(0,limit);
  return {text,confidence:Number(result?.data?.confidence)||0,engine:'tesseract.js 5.1.1',networkNeededForInitialEngine:true};
 }finally{await worker?.terminate?.().catch(()=>{})}
}
return Object.freeze({extract,asCsv,recognizeImage,fieldsByType,loadTesseract});
});
