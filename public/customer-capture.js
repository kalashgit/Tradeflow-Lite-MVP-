/* Local record entry UI. Receives text/transcripts; never records audio or calls a model. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowCustomerCapture=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=['name','phone','address','notes','email','company'];
const labels={name:'Customer name *',phone:'Phone',address:'Location / address',notes:'Work requested / notes',email:'Email',company:'Company'};
function createController(host){
 const sources=new Map();let state=null,recognition=null;
 const repaint=()=>host.repaint();
 const context=()=>host.context();
 async function interpret(text,{source='typed'}={}){
  if(!['typed','transcript'].includes(source))throw Error('Use typed text or a transcript');
  const data=await host.snapshot();return {...host.interpreter.interpret(text,{customers:data.customers,context:context()}),inputSource:source};
 }
 async function correct(review,changes){const data=await host.snapshot();return {...host.interpreter.correct(review,changes,{customers:data.customers,context:context()}),inputSource:review.inputSource||'typed'}}
 async function prepareCustomer(review,{retainOriginal=false,originalText='',reviewedDuplicateIds=[]}={}){
  if(!review||review.intent!=='customer.create'||review.draft?.kind!=='customer')return {status:'invalid',error:{code:'CUSTOMER_REVIEW_REQUIRED',message:'Review a supported customer draft first.'}};
  const fresh=await correct(review,{});
  if(fresh.missingRequired.length||fresh.issues.some(x=>x.blocking))return {status:'invalid',error:{code:'CUSTOMER_REVIEW_REQUIRED',message:fresh.clarification||'Correct the highlighted customer fields.'},review:fresh};
  const sourceHash=retainOriginal?await host.hashSource(originalText):'';
  const plan=await host.commands.prepare({commandId:'customer.create',params:{fields:fresh.draft.fields,reviewedDuplicateIds,sourceHash}});
  if(plan.status==='needs_review'&&retainOriginal)sources.set(plan.id,originalText);
  return plan;
 }
 function discard(){if(recognition){const current=recognition;recognition=null;try{current.abort()}catch{}}sources.clear();state=null}
 async function start(){discard();state={step:'input',input:'',source:'typed',review:null,retainOriginal:false,duplicateAcknowledged:false,busy:false,error:'',savedId:null};await host.show();focus('textarea[name="instruction"]')}
 async function openReview(text,options={}){await start();state.input=text;state.source=options.source||'typed';await extract(text,options);return state?.review}
 function focus(selector){const document=host.document;if(document?.querySelector)document.querySelector(selector)?.focus()}
 function listen(){
  if(!state||state.busy||state.step!=='input')return;
  if(recognition){
   const current=recognition;
   current.tfStopping=true;
   const button=document?.querySelector?.('[data-customer-action="listen"]');
   if(button){button.textContent='Finishing speech…';button.disabled=true}
   try{current.stop()}catch{finishSpeech(current)}
   // Some WebKit implementations never fire onend after stop.
   setTimeout(()=>{if(recognition===current)finishSpeech(current)},1200);
   return;
  }
  const Engine=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
  if(!Engine){state.error='Voice recognition is not supported by this browser. Use the phone keyboard microphone.';void repaint();return}
  let current;
  try{
   current=new Engine();recognition=current;
   current.tfTranscript='';current.tfStopping=false;current.tfFinished=false;current.tfTimer=null;
   current.lang='en-US';current.continuous=false;current.interimResults=true;current.maxAlternatives=1;
   current.onresult=event=>{
    if(recognition!==current||current.tfFinished)return;
    const parts=[];for(let i=0;i<event.results.length;i++)parts.push(String(event.results[i]?.[0]?.transcript||''));
    current.tfTranscript=parts.join(' ').trim();
    const textarea=document?.querySelector?.('#tfCustomerTextForm textarea[name="instruction"]');
    if(textarea&&current.tfTranscript)textarea.value=current.tfTranscript;
    if(current.tfStopping)finishSpeech(current);
   };
   current.onerror=event=>{
    if(recognition!==current||current.tfFinished)return;
    const error=event?.error||'';
    if(error==='aborted'&&current.tfStopping){finishSpeech(current);return}
    current.tfError=error==='not-allowed'?'Microphone permission was denied. Check your browser settings.':error==='no-speech'?'No speech was detected. Try speaking closer to the microphone.':'Speech recognition failed. You can type the customer details instead.';
    finishSpeech(current);
   };
   current.onend=()=>finishSpeech(current);
   current.start();
   const button=document?.querySelector?.('[data-customer-action="listen"]');
   if(button){button.textContent='■ Stop & review speech';button.setAttribute('aria-pressed','true')}
  }catch(error){recognition=null;state.error='Could not start microphone recognition. Check permissions or use keyboard dictation.';void repaint()}
 }
 function finishSpeech(current){
  if(!current||recognition!==current||current.tfFinished)return;
  current.tfFinished=true;recognition=null;
  if(current.tfTimer)clearTimeout(current.tfTimer);
  const textarea=document?.querySelector?.('#tfCustomerTextForm textarea[name="instruction"]');
  const spoken=String(current.tfTranscript||textarea?.value||'').trim();
  if(spoken){void openReview(spoken,{source:'transcript'});return}
  if(state){state.error=current.tfError||'No speech was captured. Tap Speak and try again.';void repaint()}
 }

 async function extract(text,options={}){
  const current=state;if(!current||current.busy)return;current.busy=true;current.error='';
  try{const review=await interpret(text,options);if(state!==current)return;current.input=text;current.review=review;current.step=review.intent==='customer.create'?'review':'input';current.error=review.intent==='customer.create'?'':review.clarification;current.duplicateAcknowledged=false;current.requestId=null}
  catch(error){current.error=error.message}finally{current.busy=false;if(state===current){await repaint();focus(current.step==='review'?'#tfCustomerReviewForm [name="name"]':'textarea[name="instruction"]')}}
 }
 async function changeField(name,value){
  const current=state;if(!current?.review||current.busy)return;
  current.review=await correct(current.review,{[name]:value});current.duplicateAcknowledged=false;current.requestId=null;current.error='';syncReview();
 }
 async function save(form){
  const current=state;if(!current?.review||current.busy||current.savedId)return;current.busy=true;current.error='';
  const values=Object.fromEntries(new FormData(form)),changes={};
  for(const field of fields)if(values[field]!==current.review.draft.fields[field])changes[field]=values[field]||'';
  try{
   current.review=await correct(current.review,changes);
   current.retainOriginal=!!form.querySelector('[name="retainOriginal"]')?.checked;
   current.duplicateAcknowledged=!!form.querySelector('[name="duplicateAcknowledged"]')?.checked;
   if(current.review.issues.some(x=>x.blocking))throw Error(current.review.clarification||'Correct the highlighted values before saving.');
   const ids=current.duplicateAcknowledged?current.review.duplicates.map(x=>x.ref.id):[];
   const plan=await prepareCustomer(current.review,{retainOriginal:current.retainOriginal,originalText:current.input,reviewedDuplicateIds:ids});
   if(plan.status!=='needs_review'){if(plan.duplicates)current.review=await correct(current.review,{});throw Error(plan.error?.message||'Review the customer again before saving.')}
   current.requestId=plan.id;await repaint();
   const approval=await host.commands.approve(plan.id);if(approval.status!=='approved')throw Error(approval.error?.message||'Customer details changed. Review again.');
   const outcome=await host.commands.execute(plan.id);if(outcome.status!=='succeeded')throw Error(outcome.error?.message||'Customer could not be saved. Check the existing records before retrying.');
   current.savedId=outcome.result.id;current.sourceSaved=outcome.result.sourceSaved;current.step='success';current.input='';sources.delete(plan.id);
  }catch(error){current.error=error.message;current.duplicateAcknowledged=false;if(current.review)current.review=await correct(current.review,{})}
  finally{current.busy=false;if(state===current){await repaint();focus(current.savedId?'[data-customer-action="open-saved"]':'#tfCustomerReviewStatus')}}
 }
 async function close(){if(state?.busy)return;discard();await host.close();focus('[data-action="tfCustomerCapture"]')}
 async function openSaved(id){discard();await host.openRecord({store:'customers',id})}
 async function linked(index){const selected=state?.review?.relatedDrafts?.[index],id=state?.savedId;if(!selected||!id||state.busy)return;const draft=JSON.parse(JSON.stringify(selected));await host.prepareLinked(draft,id)}
 async function removeSource(id){
  if(!host.confirm('Remove the original wording retained for this customer?'))return;
  const plan=await host.commands.prepare({commandId:'customer.source.delete',params:{ref:{store:'customers',id}}});
  if(plan.status!=='needs_review')return host.notify(plan.error?.message||'Customer source needs review');
  const approved=await host.commands.approve(plan.id);if(approved.status!=='approved')return host.notify(approved.error?.message||'Record changed. Try again.');
  const result=await host.commands.execute(plan.id);if(result.status!=='succeeded')return host.notify(result.error?.message||'Original wording could not be removed');
  await repaint();host.notify('Original wording removed');
 }
 function view(){
  if(!state)return '';const s=state,disabled=s.busy?'disabled':'';
  const close='<button type="button" class="tf-record-close" data-customer-action="close" aria-label="Close customer entry" '+disabled+'>×</button>';
  const head=title=>'<div class="modalhead tf-record-modalhead"><h2>'+title+'</h2>'+close+'</div>';
  const error=s.error?'<p class="tf-customer-error" role="alert">'+escape(s.error)+'</p>':'';
  let body='';
  if(s.step==='input')body=head('Describe a customer')+'<p class="tf-customer-hint">Type or paste what the customer told you. Tap Speak to dictate, or use your keyboard microphone. Speech recognition may require network access; customer extraction and saving work locally.</p>'+error+
   '<form id="tfCustomerTextForm"><button type="button" class="tf-customer-speak" data-customer-action="listen" aria-pressed="false">🎙 Speak a customer command</button><label class="field">Customer information<textarea name="instruction" rows="5" maxlength="4000" required placeholder="Add a new customer called John Smith. His number is 512-555-0198, and he needs electrical work in Austin." '+disabled+'>'+escape(s.input)+'</textarea></label><div class="actions tf-record-actions"><button type="button" class="tf-record-cancel" data-customer-action="close" '+disabled+'>Cancel</button><button class="tf-record-save" type="submit" '+disabled+'>'+(s.busy?'Reading…':'Review customer')+'</button></div></form><p class="tf-customer-hint">No customer is saved until you review and confirm.</p>';
  else if(s.step==='success')body=head('Customer saved')+'<div role="status" class="tf-customer-success"><strong>'+escape(s.review.draft.fields.name)+'</strong><p>Your customer record is ready.'+(s.sourceSaved?' Original wording was kept locally.':'')+'</p></div><button type="button" class="tf-record-save tf-customer-wide" data-customer-action="open-saved" data-id="'+escape(s.savedId)+'">Open customer record →</button>'+
   (s.review.relatedDrafts.length?'<div class="tf-customer-linked"><h3>Continue with a draft</h3>'+s.review.relatedDrafts.map((d,i)=>'<button class="btn secondary" type="button" data-customer-action="linked" data-index="'+i+'">Review linked '+escape(d.kind)+' draft →</button>').join('')+'<small>Nothing is scheduled or saved automatically.</small></div>':'');
  else{
   const blocked=s.review.issues.some(x=>x.blocking)||s.review.missingRequired.length>0;
   const notices=s.review.issues.filter(x=>x.code!=='POSSIBLE_DUPLICATE');
   const controls=fields.map(field=>{const value=s.review.draft.fields[field]||'',type=field==='phone'?'tel':field==='email'?'email':'text';return '<label class="field"><span>'+labels[field]+'</span>'+(field==='notes'?'<textarea name="notes" rows="2" maxlength="4000" '+disabled+'>'+escape(value)+'</textarea>':'<input name="'+field+'" type="'+type+'" value="'+escape(value)+'" '+(field==='name'?'required':'')+' '+disabled+'>')+'</label>'}).join('');
   const matches=s.review.duplicates.length?'<section class="tf-customer-duplicates"><h3>Possible existing customers</h3>'+s.review.duplicates.map(x=>'<button type="button" data-customer-action="open-duplicate" data-id="'+escape(x.ref.id)+'" '+disabled+'>'+escape(x.name||'Customer')+' <small>'+escape(x.reasons.map(r=>r.replace(/_/g,' ')).join(', '))+'</small> →</button>').join('')+'<label class="tf-customer-check"><input type="checkbox" name="duplicateAcknowledged" '+(s.duplicateAcknowledged?'checked':'')+' '+disabled+'> I reviewed these matches; create a separate customer.</label></section>':'';
   body=head('Review customer')+'<p class="tf-customer-hint">Correct any field below. Optional details that were not provided stay blank.</p>'+error+'<div id="tfCustomerReviewStatus" class="tf-customer-notices" role="status" aria-live="polite" tabindex="-1">'+(notices.length?'<ul>'+notices.map(x=>'<li>'+escape(x.message)+'</li>').join('')+'</ul>':'<p>Review these values before saving.</p>')+'</div><form id="tfCustomerReviewForm"><div class="tf-customer-fields">'+controls+'</div>'+matches+'<label class="tf-customer-check"><input type="checkbox" name="retainOriginal" '+(s.retainOriginal?'checked':'')+' '+disabled+'> Keep original wording locally with this customer.</label><small class="tf-customer-hint">Off by default. If kept, it is included in your local backup and can be removed from the customer record.</small>'+ (s.review.relatedDrafts.length?'<p class="tf-customer-hint">'+s.review.relatedDrafts.length+' linked draft'+(s.review.relatedDrafts.length===1?'':'s')+' available after the customer is saved.</p>':'')+'<div class="actions tf-record-actions"><button type="button" class="tf-record-cancel" data-customer-action="restart" '+disabled+'>Edit wording</button><button class="tf-record-save" type="submit" '+(s.busy||blocked||s.review.duplicates.length&&!s.duplicateAcknowledged?'disabled':'')+'>'+(s.busy?'Saving…':'Confirm & save customer')+'</button></div></form>';
  }
  return '<div class="dialog tf-record-dialog tf-customer-dialog" role="dialog" aria-modal="true" aria-label="Customer smart entry"><section class="modal tf-record-modal tf-customer-modal">'+body+'</section></div>';
 }
 // Keep form controls mounted during blur/checkbox events so iPhone taps are not swallowed.
 function syncSubmit(){
  const form=document?.getElementById?.('tfCustomerReviewForm');
  if(!form||!state?.review)return;
  const blocked=state.review.missingRequired.length||state.review.issues.some(x=>x.blocking)||
   (state.review.duplicates.length&&!state.duplicateAcknowledged);
  const button=form.querySelector('button[type=submit]');if(button)button.disabled=!!blocked||!!state.busy;
 }
 function syncReview(){
  const form=document?.getElementById?.('tfCustomerReviewForm');
  if(!form||!document.createElement)return;
  const fresh=document.createElement('div');fresh.innerHTML=view();
  const notices=document.getElementById('tfCustomerReviewStatus'),nextNotices=fresh.querySelector('#tfCustomerReviewStatus');
  if(notices&&nextNotices)notices.innerHTML=nextNotices.innerHTML;
  const oldMatches=form.querySelector('.tf-customer-duplicates'),nextMatches=fresh.querySelector('.tf-customer-duplicates');
  if(oldMatches&&nextMatches)oldMatches.replaceWith(nextMatches);
  else if(oldMatches)oldMatches.remove();
  else if(nextMatches){const before=form.querySelector('[name=retainOriginal]')?.closest('label');if(before)form.insertBefore(nextMatches,before)}
  syncSubmit();
 }
 const document=host.document;
 document?.addEventListener('submit',async e=>{if(!['tfCustomerTextForm','tfCustomerReviewForm'].includes(e.target.id))return;e.preventDefault();e.stopImmediatePropagation();if(e.target.id==='tfCustomerTextForm'){const text=new FormData(e.target).get('instruction');await extract(String(text||''),{source:state?.source||'typed'})}else await save(e.target)});
 document?.addEventListener('change',async e=>{if(!e.target.closest?.('#tfCustomerReviewForm')||!state||state.busy)return;if(fields.includes(e.target.name))await changeField(e.target.name,e.target.value);else if(['retainOriginal','duplicateAcknowledged'].includes(e.target.name)){state[e.target.name]=e.target.checked;syncSubmit()}});
 document?.addEventListener('click',async e=>{
  const el=e.target.closest?.('[data-customer-action],[data-action="tfCustomerCapture"],[data-action="tfCustomerSourceDelete"]');if(!el)return;e.preventDefault();
  if(el.dataset.action==='tfCustomerCapture'){await start();return}if(el.dataset.action==='tfCustomerSourceDelete'){await removeSource(el.dataset.id);return}
  const action=el.dataset.customerAction;if(state?.busy)return;
  if(action==='listen'){listen();return}if(action==='close')await close();if(action==='restart'){state.step='input';await repaint();focus('textarea[name="instruction"]')}
  if(action==='open-saved'||action==='open-duplicate')await openSaved(el.dataset.id);if(action==='linked')await linked(Number(el.dataset.index));
 });
 document?.addEventListener('keydown',e=>{if(e.key==='Escape'&&state){e.preventDefault();void close()}});
 return Object.freeze({view,start,openReview,interpret,correct,prepareCustomer,discard,sourceForRequest:id=>sources.get(id),releaseSource:id=>sources.delete(id)});
}
return Object.freeze({createController});
});