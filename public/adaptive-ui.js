/* Constrained presentation registry. JSON never supplies HTML, callbacks or authority. */
(function(root){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(v,n)=>typeof v==='string'&&v.length>0&&v.length<=n;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(v);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const refs=v=>typeof v==='string'&&/^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+@[0-9]{1,10}$/.test(v);
const feedbackEvents=Object.freeze(['selection','light_impact','confirmation','warning','error','boundary','gesture_snapped','voice_state']);
function createFeedback({enabled=false,nativeImpact}={}){
 return Object.freeze({emit(event,{receipt}={}){if(!enabled||!feedbackEvents.includes(event)||typeof nativeImpact!=='function')return false;if(event==='confirmation'&&receipt?.status!=='recorded_task_verified')return false;try{const result=nativeImpact(event);if(result&&typeof result.then==='function')void Promise.resolve(result).catch(()=>{});return true}catch{return false}}});
}
function validate(component,owner){
 if(!exact(component,['version','type','id','threadId','messageId','jobId','explanation','evidence'])||component.version!==1||component.type!=='job-review'||!['id','threadId','messageId','jobId'].every(k=>id(component[k]))||!text(component.explanation,2500)||!Array.isArray(component.evidence)||component.evidence.length>8||!component.evidence.every(refs))throw Error('Unsupported or unsafe adaptive component');
 if(!owner||component.threadId!==owner.threadId||component.messageId!==owner.messageId||!id(owner.actor)||!id(owner.businessId))throw Error('Conversation component ownership changed');
 return component;
}
function createRegistry(){
 const states=new Map();
 const key=(c,o)=>JSON.stringify([o.actor,o.businessId,c.threadId,c.messageId,c.id]);
 function render(component,{owner,job,message,renderReview}){
  const c=validate(component,owner);
  // Host-owned saved records/turns are independent from untrusted component JSON.
  if(!job||job.id!==c.jobId||job.businessId&&job.businessId!==owner.businessId||!message||message.id!==c.messageId||message.role!=='assistant'||message.source!=='device_local_evidence'||message.content!==c.explanation||JSON.stringify(message.refs||[])!==JSON.stringify(c.evidence)||!c.evidence.some(r=>r.startsWith('jobs:'+job.id+'@')))throw Error('Saved job evidence unavailable');
  if(typeof renderReview!=='function')throw Error('Trusted review renderer unavailable');
  const k=key(c,owner),s=states.get(k)||{},label='tfAdaptive_'+c.id;
  return '<section class="tf-adaptive-card" aria-labelledby="'+esc(label)+'" data-adaptive-owner="'+esc(k)+'"><header><small>JOB INVESTIGATION · DEVICE-LOCAL EVIDENCE</small><h3 id="'+esc(label)+'">'+esc(job.title||'Saved job')+'</h3><p>'+esc(job.status||'Status not recorded')+' · Current record; evidence may have changed</p></header><p>'+esc(c.explanation.split('\n').find(l=>l.startsWith('Finding:'))||'Inspect the saved evidence and uncertainties before acting.')+'</p><details data-adaptive-section="evidence" '+(s.evidence?'open':'')+'><summary>Evidence and context</summary><div class="tf-adaptive-content"><ul>'+c.evidence.map(r=>'<li><button type="button" data-adaptive-source="'+esc(r)+'">'+esc(r)+'</button></li>').join('')+'</ul><p>Local @0 references have no verified server revision. Sources are record references, not proof of payment or completion.</p><button type="button" data-adaptive-source="'+esc(c.evidence.find(r=>r.startsWith('jobs:'+job.id+'@')))+'">Open source job</button></div></details><details data-adaptive-section="review" '+(s.review===false?'':'open')+'><summary>Structured review and authorized actions</summary><div class="tf-adaptive-content"><p>Actions below use the existing approval engine. Expanding this card grants no permission.</p><div data-decision-job="'+esc(job.id)+'">'+renderReview(job.id)+'</div></div></details></section>';
 }
 function connect(document,{feedback=createFeedback(),reduced=()=>root.matchMedia?.('(prefers-reduced-motion: reduce)').matches}={}){
  const animations=new WeakMap();
  document.addEventListener('click',e=>{if(e.isTrusted&&e.target.closest?.('.tf-adaptive-card summary'))feedback.emit('selection')});
  document.addEventListener('toggle',event=>{const details=event.target,card=details.closest?.('[data-adaptive-owner]');if(!card||!details.dataset.adaptiveSection)return;const k=card.dataset.adaptiveOwner,section=details.dataset.adaptiveSection;if(!['review','evidence'].includes(section))return;
   const state=states.get(k)||{};state[section]=details.open;states.delete(k);states.set(k,state);while(states.size>100)states.delete(states.keys().next().value);
   const content=details.querySelector('.tf-adaptive-content');animations.get(content)?.cancel();if(details.open){if(!reduced()&&content?.animate)animations.set(content,content.animate([{opacity:.4,transform:'translateY(-4px)'},{opacity:1,transform:'translateY(0)'}],{duration:Math.min(300,Math.max(0,parseFloat(root.getComputedStyle?.(content).getPropertyValue('--tf-motion-reveal'))||180)),easing:'cubic-bezier(.2,.8,.2,1)'}))}
  },true);
 }
 return Object.freeze({validate,render,connect});
}
const registry=createRegistry();
function conversation({jobId,reviewThreadId,activeThreadId,messages,data,owner,renderReview}){
 if(!jobId||reviewThreadId!==activeThreadId)return '';
 const message=[...messages].reverse().find(m=>m.role==='assistant'&&m.source==='device_local_evidence'&&m.refs?.some(r=>r.startsWith('jobs:'+jobId+'@'))),job=(data.jobs||[]).find(j=>j.id===jobId);
 if(!message||!job)return '';
 try{return registry.render({version:1,type:'job-review',id:message.id,threadId:activeThreadId,messageId:message.id,jobId,explanation:message.content,evidence:message.refs||[]},{owner:{...owner,threadId:activeThreadId,messageId:message.id},job,message,renderReview})}catch{return ''}
}
function configure({document,readState,commands,notify}){
 registry.connect(document);
 document.addEventListener('click',async e=>{const b=e.target.closest?.('[data-adaptive-source]'),card=b?.closest('[data-adaptive-owner]');if(!card||b.disabled)return;e.preventDefault();b.disabled=true;
 try{const current=readState(),key=JSON.parse(card.dataset.adaptiveOwner),ref=b.dataset.adaptiveSource;if(key[0]!==current.actor||key[1]!==current.businessId||key[2]!==current.threadId||!current.messages.some(m=>m.id===key[3]&&m.source==='device_local_evidence'&&m.refs?.includes(ref)))throw Error('Evidence context changed. Reopen this investigation.');
 const [store,id]=ref.split('@')[0].split(':'),plan=await commands.prepare({commandId:'record.open',params:{ref:{store,id}}});
 const latest=readState();if(current.threadId!==latest.threadId||current.actor!==latest.actor||current.businessId!==latest.businessId)throw Error('Conversation changed during navigation.');
 const result=plan.status==='ready'?await commands.execute(plan.id):plan;if(result.status!=='succeeded')throw Error('Saved source is unavailable; no navigation was completed.');
 }catch(error){notify(error.message)}finally{b.disabled=false}
 });
}
const api=Object.freeze({createRegistry,createFeedback,feedbackEvents,validate,conversation,configure});if(typeof module==='object'&&module.exports)module.exports=api;else root.TradeFlowAdaptiveUI=api;
})(typeof window==='object'?window:globalThis);
