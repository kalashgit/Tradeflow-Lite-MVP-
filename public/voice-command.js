/* TradeFlow in-app voice command surface: local commands, no unattended writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowVoiceCommand=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalized=v=>String(v||'').trim().replace(/^(?:hey|hello|hi|okay|ok)\s+trade\s*flow\b[,!:. ]*/i,'').trim();
const wakePhrase=v=>/\b(?:hey|hi|hello|okay|ok)[,\s]+trade\s*flow\b/i.test(String(v||''));
function intent(input){
 const original=normalized(input),s=original.toLowerCase().replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim();
 const tokens=s.split(' '),has=words=>words.some(w=>tokens.includes(w));
 const work=has(['job','jobs','jib','jibs','appointment','appointments','calendar','schedule','shift','shifts','booking','bookings','work']);
 const time=has(['tomorrow','tmrw'])||/\bnext day\b/.test(s);
 const query=has(['what','which','when','list','show','tell','open','display','check','see','have','got','scheduled','booked']);
 const customer=has(['customer','customers','client','clients','contact','contacts','custmer','custmr']);
 const add=has(['add','create','make','register','save','new','set','put']);
 const quote=has(['quote','quotes','quotation','estimate','estimates','pricing','proposal']);
 const prepare=has(['prepare','create','draft','write','make','start','build','generate','new','need','want','price','priceup']);
 const scores=[{kind:'tomorrow',score:(work?3:0)+(time?4:0)+(query?2:0)},
  {kind:'customer',score:(customer?4:0)+(add?3:0)},
  {kind:'quote',score:(quote?4:0)+(prepare?3:0)}].sort((a,b)=>b.score-a.score);
 if(scores[0].score<7||scores[0].score===scores[1].score)return {kind:'unknown'};
 if(scores[0].kind==='tomorrow')return {kind:'tomorrow',navigate:has(['show','open','display'])};
 if(scores[0].kind==='customer')return {kind:'customer',text:original};
 const person=original.match(/\bfor\s+(.+?)(?:[.!?]|$)/i)?.[1]?.trim()||'';
 return person?{kind:'quote',person}:{kind:'unknown'};
}

function tomorrowDate(now=new Date()){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function tomorrowWork(data,date,calendarRecords){
 const entries=typeof calendarRecords==='function'?calendarRecords(data):[
  ...(data.jobs||[]).map(j=>({...j,kind:'job',sourceKind:'job',sourceId:j.id})),
  ...(data.calendarEntries||[]).map(e=>({...e,kind:'event'}))];
 const linked=new Set((data.calendarEntries||[]).filter(e=>
  (e.sourceKind==='job'&&e.sourceId||e.jobId)&&!['cancelled','canceled'].includes(String(e.status||'').toLowerCase())
 ).map(e=>String(e.sourceKind==='job'?e.sourceId:e.jobId)));
 const seen=new Set(),items=[];
 for(const e of entries){
  if(e.date!==date||e.done||['cancelled','canceled','completed','done'].includes(String(e.status||'').toLowerCase()))continue;
  const jobId=e.kind==='job'?String(e.id):e.sourceKind==='job'?String(e.sourceId):e.jobId?String(e.jobId):'';
  if(e.kind==='job'&&linked.has(jobId))continue;
  if(e.kind!=='job'&&e.kind!=='event')continue;
  const key=e.kind==='event'?'event:'+e.id:'job:'+jobId;
  if(seen.has(key))continue;seen.add(key);
  items.push({...e,jobId});
 }
 return items.sort((a,b)=>String(a.time||'99:99').localeCompare(String(b.time||'99:99'))||String(a.title||'').localeCompare(String(b.title||'')));
}
function createController(host){
 let open=false,busy=false,listening=false,recognition=null,draft='',draftModality='text',message='',showCalendarDate='';
 let wakeRecognition=null,wakeActive=false,wakeStatus='off';
 const doc=host.document,repaint=()=>host.repaint();
 const waveAudio=globalThis.TradeFlowFlowWaveAudio?.createMeter({document:doc});
 function stopWake(){wakeActive=false;wakeStatus='off';if(wakeRecognition){const active=wakeRecognition;wakeRecognition=null;try{active.abort()}catch{}}}
 function stopMicrophoneNow(){stopWake();globalThis.speechSynthesis?.cancel?.();waveAudio?.stop();if(recognition){const active=recognition;recognition=null;try{active.abort()}catch{}}listening=false}
 function close(){stopMicrophoneNow();showCalendarDate='';open=false;draft='';draftModality='text';message='';void Promise.resolve(repaint()).then(()=>doc.querySelector?.('.tf-ai-orb')?.focus?.())}
 function greet(){(host.greet||globalThis.TradeFlowVoiceGreeting)?.('Hello, what do you need?')}
 function start(){stopWake();open=true;draft='';draftModality='text';message='Hello, what do you need?';showCalendarDate='';void repaint();greet()}
 function startListening(){if(open){close();return}start();if(!recognition&&!busy)toggle()}
 function enableWake(){
  if(wakeActive){stopWake();void repaint();return false}
  const Engine=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
  if(!Engine){wakeStatus='unsupported';void repaint();return false}
  if(recognition)stopMicrophoneNow();
  const active=new Engine();wakeRecognition=active;wakeActive=true;wakeStatus='listening';
  active.lang='en-US';active.continuous=true;active.interimResults=false;
  active.onresult=event=>{
   if(wakeRecognition!==active||!wakeActive)return;
   const results=Array.from(event.results||[]).filter(result=>result.isFinal!==false);
   const transcript=results.map(result=>result?.[0]?.transcript||'').join(' ').trim();
   if(!wakePhrase(transcript))return;
   stopWake();open=true;draft=normalized(transcript);message='Hello, what do you need?';
   void repaint();greet();
  };
  active.onerror=event=>{if(wakeRecognition!==active)return;stopWake();wakeStatus=event.error==='not-allowed'?'permission_denied':'unavailable';void repaint()};
  active.onend=()=>{if(wakeRecognition!==active)return;stopWake();wakeStatus='ended';void repaint()};
  try{active.start();void repaint();return true}catch{stopWake();wakeStatus='unavailable';void repaint();return false}
 }
 async function sendConversation(text){
  if(busy||!String(text||'').trim())return;
  if(!host.sendConversation){message='Conversation is not available. You can still run a local command.';void repaint();return}
  const content=String(text).trim();
  if(content.length>6000){message='This message exceeds 6,000 characters; nothing was saved or sent.';void repaint();return}
  busy=true;message='';stopMicrophoneNow();
  try{const outcome=await host.sendConversation(content,{modality:draftModality});if(outcome===false)throw Error('Message was not sent. Check Intelligence access and connectivity.');draft='';draftModality='text';message='Sent to Master Intelligence.'}
  catch(error){message=String(error.message||error)}
  finally{busy=false;await repaint()}
 }
 async function submit(text){
  if(busy)return;const instruction=String(text||'').trim();draft=instruction;
  if(!instruction){message='Speak or enter a command first.';await repaint();return}
  busy=true;message='';
  let mapExecuted=false;
  try{
   const libraryIntent=globalThis.TradeFlowLibraryCommands?.parse(instruction);
   if(libraryIntent&&host.libraryCommand){
    const outcome=await host.libraryCommand(libraryIntent);
    if(outcome?.status==='not_found'||outcome?.status==='ambiguous'||outcome?.status==='unsupported'){message=outcome.message||'That Library action is unavailable.';return}
    close();mapExecuted=true;return;
   }
   const mapIntent=globalThis.TradeFlowLaunchMapCommands?.parse(instruction);
   if(mapIntent&&host.mapCommand){
    // Close first so the map action runs after the voice overlay is dismissed.
    // Do not repaint after invoking the host: map controls and search are UI stateful.
    close();
    mapExecuted=true;
    await host.mapCommand(mapIntent);
    return;
   }
   const workspaceIntent=globalThis.TradeFlowLaunchWorkspaceCommands?.parse(instruction);
   if(workspaceIntent&&host.workspaceCommand){
    close();
    mapExecuted=true;
    await host.workspaceCommand(workspaceIntent);
    return;
   }
   const moreIntent=globalThis.TradeFlowLaunchMoreCommands?.parse(instruction);
   if(moreIntent&&host.moreCommand){
    if(['find','activeJobs','completeTask','jobLocation','businessRisks','optimizationReview'].includes(moreIntent.action)){
     const outcome=await host.moreCommand(moreIntent);
     message=outcome?.message||'Command completed without additional details.';
     return;
    }
    close();
    mapExecuted=true;
    await host.moreCommand(moreIntent);
    return;
   }
   const parsed=intent(instruction);
   if(parsed.kind==='customer'){
    // A complete voice instruction is the user's explicit authorization to add one customer.
    // Ambiguous names, incomplete phones, duplicates and other unrecognized details always require review.
    const raw=parsed.text,firstAction=raw.search(/\b(?:make|set up|add|create|register|save)\b/i);
    const instruction=(firstAction>=0?raw.slice(firstAction):raw).replace(/^(?:please\s+)?(?:make|set up|add|create|register|save)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?(?:customer|client)\b/i,'Add customer');
    const review=await host.customer.interpret(instruction,{source:'transcript'});
    const fields=review.draft?.fields||{};
    const clean=review.intent==='customer.create'&&review.status==='needs_review'&&
      !!fields.name?.trim()&&/^\+1\d{10}$/.test(fields.phone||'')&&
      !review.issues?.length&&!review.duplicates?.length&&!review.relatedDrafts?.length;
    if(!clean){
      close();await host.customer.openReview(instruction,{source:'transcript'});return;
    }
    const plan=await host.customer.prepareCustomer(review);
    if(plan.status!=='needs_review'){close();await host.customer.openReview(instruction,{source:'transcript'});return}
    const approval=await host.commands.approve(plan.id);
    if(approval.status!=='approved')throw Error(approval.error?.message||'Customer creation could not be approved.');
    const outcome=await host.commands.execute(plan.id);
    if(outcome.status!=='succeeded')throw Error(outcome.error?.message||'Customer was not saved; check the Customers screen before retrying.');
    message='Customer added: '+fields.name+' ('+fields.phone+'). The Customers total has been updated.';
    draft='';showCalendarDate='';
    return;
   }
   if(parsed.kind==='tomorrow'){
    const data=await host.snapshot(),date=tomorrowDate(host.now());
    const jobs=tomorrowWork(data,date,host.calendarRecords);
    const names=new Map((data.customers||[]).map(c=>[c.id,c.name]));
    message=jobs.length?jobs.length+' scheduled commitment(s) tomorrow ('+date+'):\n'+jobs.map(j=>'• '+(j.title||'Untitled event')+(j.time?' at '+j.time:'')+(names.get(j.customerId)?' — '+names.get(j.customerId):'')).join('\n'):'No scheduled jobs or appointments tomorrow ('+date+') in this device’s local records.';
    showCalendarDate=date;
    if(parsed.navigate&&host.openCalendar){await host.openCalendar(date);close();return}
   }else if(parsed.kind==='quote'){
    const data=await host.snapshot(),match=(data.customers||[]).filter(c=>String(c.name||'').toLowerCase()===parsed.person.toLowerCase());
    if(match.length!==1)message=match.length?'Multiple matching customers. Choose a specific customer in Customers.':'No exact customer match. Use the full saved customer name.';
    else{
     const plan=await host.commands.prepare({commandId:'draft.prepare',params:{kind:'quote',ref:{store:'customers',id:match[0].id}}});
     if(plan.status!=='ready')message=plan.error?.message||'Could not prepare quotation draft.';
     else{const result=await host.commands.execute(plan.id);if(result.status==='succeeded'){close();return}message=result.error?.message||'Could not open quotation draft.'}
    }
   }else if(host.chatCommand){
    // Ordinary conversation is not a business command. Route the finalized transcript
    // into the same Master Intelligence thread as typed text, without granting writes.
    close();mapExecuted=true;
    await host.chatCommand(instruction);
    return;
   }else message='This request needs Master Intelligence chat, which is not available in this session.';
  }catch(error){message=String(error.message||error);if(mapExecuted)host.mapError?.(message)}finally{busy=false;if(!mapExecuted)await repaint()}
 }
 function finish(active){
  if(!active||recognition!==active||active.finished)return;
  active.finished=true;recognition=null;listening=false;waveAudio?.stop();
  if(active.timeout)clearTimeout(active.timeout);
  const text=String(active.transcript||draft||'').trim();
  if(text){draft=text;draftModality='voice';message='Review your transcript, then send or run a command.';void repaint()}else{message=active.error||'No speech captured. Try again or type your message.';void repaint()}
 }
 function toggle(){
  if(!open||busy)return;
  globalThis.TradeFlowSpeech?.stop?.();
  globalThis.speechSynthesis?.cancel?.();
  if(recognition){const active=recognition;active.stopping=true;listening=false;waveAudio?.stop();void repaint();try{active.stop()}catch{finish(active)}active.timeout=setTimeout(()=>finish(active),1200);return}
  const Engine=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
  if(!Engine){message='Speech recognition is unavailable in this browser. Try keyboard dictation.';void repaint();return}
  try{
   const active=new Engine();recognition=active;active.transcript='';active.finished=false;
   active.lang='en-US';active.continuous=false;active.interimResults=true;
   active.onresult=e=>{if(recognition!==active)return;active.transcript=Array.from(e.results||[]).map(r=>r?.[0]?.transcript||'').join(' ').trim();draft=active.transcript;if(active.stopping)finish(active);else void repaint()};
   active.onend=()=>finish(active);
   active.onerror=e=>{if(recognition!==active)return;active.error=e.error==='not-allowed'?'Microphone permission denied.':e.error==='no-speech'?'No speech detected.':'Speech recognition failed.';finish(active)};
   active.start();listening=true;waveAudio?.start();void repaint();
  }catch{waveAudio?.stop();recognition=null;listening=false;message='Could not start microphone.';void repaint()}
 }
 function wave(){return '<div class="tf-voice-wave '+(listening?'is-listening':busy?'is-processing':'is-idle')+'" aria-hidden="true">'+(globalThis.TradeFlowFlowWave?.render?.()||'')+'</div>'}
 function view(){if(!open)return '';
  const state=listening?'Listening…':recognition?'Stopping microphone…':busy?'Processing…':draft?'Review message':'Ready · text or microphone';
  return '<section class="tf-orb-bubble" id="tfOrbBubble" role="region" aria-label="TradeFlow conversation" data-voice-state="'+(listening?'listening':busy?'thinking':message?'error':'active')+'"><header class="tf-orb-bubble-head"><span id="tfOrbStatus" role="status" aria-live="polite">'+state+'</span><button type="button" data-voice="close" aria-label="Close conversation and stop microphone">×</button></header><form id="tfVoiceForm" class="tf-orb-compose"><label for="tfVoiceText" class="tf-voice-sr">Message TradeFlow</label><textarea id="tfVoiceText" rows="2" maxlength="6000" placeholder="Message TradeFlow…" '+(busy?'disabled':'')+'>'+esc(draft)+'</textarea><div class="tf-orb-actions"><button type="button" data-voice="mic" aria-pressed="'+listening+'" aria-label="'+(listening?'Stop microphone':'Start microphone')+'">'+(listening?'■ Stop':'◉ Mic')+'</button><button type="button" data-voice="command" '+(busy?'disabled':'')+' title="Use the existing approval-gated command registry">Run command</button><button type="submit" '+(busy?'disabled':'')+'>Send ↑</button></div></form>'+(message?'<p class="tf-orb-feedback" role="status">'+esc(message)+'</p>':'')+'<small class="tf-orb-capability">'+(typeof(globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition)==='function'?'Speech may require network.':'Speech unavailable here; type or use keyboard dictation.')+'</small></section>';
 }
 doc.addEventListener('click',e=>{const quick=e.target.closest?.('[data-voice-workspace]');if(quick){e.preventDefault();const workspace=quick.dataset.voiceWorkspace;close();if(host.navigate)void host.navigate(workspace);return}const button=e.target.closest?.('[data-voice],[data-voice-example],[data-action="tfVoiceOpen"]');if(!button)return;e.preventDefault();if(button.dataset.action==='tfVoiceOpen'){start();return}if(button.dataset.voice==='close'){close();return}if(button.dataset.voice==='command'){void submit(draft);return}if(button.dataset.voice==='calendar'){if(showCalendarDate&&host.openCalendar)void host.openCalendar(showCalendarDate).then(()=>close()).catch(error=>{message=String(error.message||error);void repaint()});return}if(button.dataset.voice==='mic'){toggle();return}if(button.dataset.voiceExample){draft=button.dataset.voiceExample;void submit(draft)}});
 doc.addEventListener('submit',e=>{if(e.target.id!=='tfVoiceForm')return;e.preventDefault();void sendConversation(e.target.querySelector('#tfVoiceText')?.value||'')});
 doc.addEventListener('input',e=>{if(e.target.id==='tfVoiceText')draft=e.target.value});
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)stopMicrophoneNow()});
 globalThis.addEventListener?.('pagehide',stopMicrophoneNow);
 return Object.freeze({start,startListening,enableWake,stopWake,wakeStatus:()=>wakeStatus,isWakeActive:()=>wakeActive,close,stopMicrophoneNow,view,submit,state:()=>({open,listening,busy,draft,draftModality,message})});
}
return Object.freeze({createController,intent,wakePhrase,tomorrowDate,tomorrowWork});
});
