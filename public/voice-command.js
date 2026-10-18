/* TradeFlow in-app voice command surface: local commands, no unattended writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowVoiceCommand=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalized=v=>String(v||'').trim().replace(/^(?:hey|hello|hi|okay|ok)\s+trade\s*flow\b[,!:. ]*/i,'').trim();
function intent(input){
 const s=normalized(input);
 if(/^(?:please\s+)?(?:add|create|make|register|save|set up)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?(?:customer|client)\b/i.test(s))return {kind:'customer',text:s};
 const m=s.match(/^(?:please\s+)?(?:prepare|create|draft|make)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?(?:quotation|quote)\s+for\s+(.+?)[.!?]?$/i);
 if(m)return {kind:'quote',person:m[1].trim()};
 if(/\btomorrow\b/i.test(s)&&/\b(?:jobs?|schedule|calendar|appointments?)\b/i.test(s)&&/^(?:what|which|show|list|tell|do|are|have|what's|open)/i.test(s))return {kind:'tomorrow',navigate:/^(?:show|open)\b/i.test(s)};
 return {kind:'unknown'};
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
 let open=false,busy=false,listening=false,recognition=null,draft='',message='',showCalendarDate='';
 const doc=host.document,repaint=()=>host.repaint();
 function close(){showCalendarDate='';if(recognition){const active=recognition;recognition=null;try{active.abort()}catch{}}listening=false;open=false;draft='';message='';void repaint()}
 function start(){open=true;draft='';message='';showCalendarDate='';void repaint()}
 function startListening(){if(!open){open=true;draft='';message=''};toggle();void repaint()}
 async function submit(text){
  if(busy)return;const instruction=String(text||'').trim();draft=instruction;
  if(!instruction){message='Speak or enter a command first.';await repaint();return}
  busy=true;message='';
  try{
   const parsed=intent(instruction);
   if(parsed.kind==='customer'){close();await host.customer.openReview(parsed.text,{source:'transcript'});return}
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
   }else message='Currently supported: create a customer, prepare a quotation for an existing customer, or check tomorrow’s jobs.';
  }catch(error){message=String(error.message||error)}finally{busy=false;await repaint()}
 }
 function finish(active){
  if(!active||recognition!==active||active.finished)return;
  active.finished=true;recognition=null;listening=false;
  if(active.timeout)clearTimeout(active.timeout);
  const text=String(active.transcript||draft||'').trim();
  if(text){draft=text;void submit(text)}else{message=active.error||'No speech captured. Try again or type your command.';void repaint()}
 }
 function toggle(){
  if(!open||busy)return;
  if(recognition){const active=recognition;active.stopping=true;listening=false;void repaint();try{active.stop()}catch{finish(active)}active.timeout=setTimeout(()=>finish(active),1200);return}
  const Engine=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
  if(!Engine){message='Speech recognition is unavailable in this browser. Try keyboard dictation.';void repaint();return}
  try{
   const active=new Engine();recognition=active;active.transcript='';active.finished=false;
   active.lang='en-US';active.continuous=false;active.interimResults=true;
   active.onresult=e=>{if(recognition!==active)return;active.transcript=Array.from(e.results||[]).map(r=>r?.[0]?.transcript||'').join(' ').trim();draft=active.transcript;if(active.stopping)finish(active);else void repaint()};
   active.onend=()=>finish(active);
   active.onerror=e=>{if(recognition!==active)return;active.error=e.error==='not-allowed'?'Microphone permission denied.':e.error==='no-speech'?'No speech detected.':'Speech recognition failed.';finish(active)};
   active.start();listening=true;void repaint();
  }catch{recognition=null;listening=false;message='Could not start microphone.';void repaint()}
 }
 function view(){if(!open)return '';
  return '<div class="tf-voice-overlay" role="dialog" aria-modal="true" aria-label="TradeFlow voice assistant"><section class="tf-voice-sheet"><div class="tf-voice-top"><div><small>TRADEFLOW / COMMAND</small><h2>Talk to TradeFlow</h2></div><button type="button" data-voice="close" aria-label="Close assistant">×</button></div><p>Ask about work or prepare a change. Records are never saved without approval.</p><button class="tf-voice-mic" type="button" data-voice="mic" aria-pressed="'+listening+'">'+(listening?'■ Stop & process':'🎙 Speak to TradeFlow')+'</button><form id="tfVoiceForm"><label for="tfVoiceText">Command</label><textarea id="tfVoiceText" rows="3" placeholder="Hey TradeFlow, what jobs do I have tomorrow?">'+esc(draft)+'</textarea><button type="submit" '+(busy?'disabled':'')+'>'+(busy?'Working…':'Run command')+'</button></form>'+(message?'<div class="tf-voice-result" role="status">'+esc(message)+'</div>':'')+(showCalendarDate?'<button type="button" class="tf-voice-calendar-link" data-voice="calendar">View tomorrow in Calendar →</button>':'')+'<div class="tf-voice-suggestions"><button type="button" data-voice-example="Hey TradeFlow, make a new customer John Smith, phone 512-555-0198">Add customer</button><button type="button" data-voice-example="Hey TradeFlow, what jobs do I have tomorrow?">Tomorrow’s jobs</button><button type="button" data-voice-example="Hey TradeFlow, prepare a quotation for John Smith">Prepare quote</button></div></section></div>';
 }
 doc.addEventListener('click',e=>{const button=e.target.closest?.('[data-voice],[data-voice-example],[data-action="tfVoiceOpen"]');if(!button)return;e.preventDefault();if(button.dataset.action==='tfVoiceOpen'){start();return}if(button.dataset.voice==='close'){close();return}if(button.dataset.voice==='calendar'){if(showCalendarDate&&host.openCalendar)void host.openCalendar(showCalendarDate).then(()=>close()).catch(error=>{message=String(error.message||error);void repaint()});return}if(button.dataset.voice==='mic'){toggle();return}if(button.dataset.voiceExample){draft=button.dataset.voiceExample;void submit(draft)}});
 doc.addEventListener('submit',e=>{if(e.target.id!=='tfVoiceForm')return;e.preventDefault();void submit(e.target.querySelector('#tfVoiceText')?.value||'')});
 doc.addEventListener('input',e=>{if(e.target.id==='tfVoiceText')draft=e.target.value});
 return Object.freeze({start,startListening,close,view,submit});
}
return Object.freeze({createController,intent,tomorrowDate,tomorrowWork});
});