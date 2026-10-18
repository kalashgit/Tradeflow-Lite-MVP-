/* TradeFlow Command Intelligence v1. Interpretation only: no storage, microphone,
 * network, navigation, authorization or business execution. Confidence is a rule
 * strength indicator, not a calibrated probability. Hosts own all execution. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./record-interpreter.js'):root?.TradeFlowRecordInterpreter);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowCommandIntelligence=api})(typeof globalThis==='object'?globalThis:null,function(recordInterpreter){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const clean=x=>String(x??'').normalize('NFKC').replace(/[’]/g,"'").trim();
const key=x=>clean(x).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
const phonetics=freeze({jib:'job',jibs:'jobs',custmer:'customer',custmr:'customer',costumer:'customer',cliant:'client',qoute:'quote',qoutes:'quotes',quotasion:'quotation',calender:'calendar',tmr:'tomorrow',tommorow:'tomorrow',tomorow:'tomorrow',tmrw:'tomorrow'});
const groups=freeze({customer:['customer','customers','client','clients','contact','contacts'],quote:['quote','quotes','quotation','quotations','estimate','estimates','proposal','proposals'],job:['job','jobs','work','shift','shifts'],calendar:['calendar','schedule','scheduled','booked','booking','bookings','appointment','appointments','meeting','meetings','site visit'],task:['task','tasks','reminder','reminders','todo','to do'],create:['add','create','make','register','save','onboard','set up'],prepare:['prepare','draft','write','write up','create','make','start','build','generate','put together'],query:['what','which','when','how','do','does','is','are','have','list','show','tell','check','see','look','give'],open:['open','go to','take me to','navigate to','switch to','show','view']});
const workspaces=freeze({home:'dashboard',headquarters:'dashboard',map:'map',calendar:'calendar',finance:'expenses',more:'settings',customers:'customers',clients:'customers',quotations:'quotes',quotes:'quotes',jobs:'jobs',tasks:'tasks',invoices:'invoices',suppliers:'suppliers'});
function withoutFiller(input){let value=clean(input);for(let i=0;i<8;i++){const next=value.replace(/^(?:(?:hey|hello|hi|okay|ok)(?:\s+there)?\s+trade\s*flow\b[\s,!:.]*|trade\s*flow\b[\s,!:.]+|(?:hey|hello|hi|okay|ok|um|uh|well|right|please|so)\b[\s,!:.]+|(?:could|would|can|will)\s+you\s+(?:(?:please|just|like)\s+)*|just\s+|i(?:'d|\s+would)\s+like\s+(?:you\s+)?to\s+|i\s+(?:need|want)\s+(?:you\s+)?to\s+)/i,'').trim();if(next===value)break;value=next}return value}
// Normalize grammar at structural boundaries; never repair names or phone digits.
function clauses(text){return text.replace(/\b([A-Z])\.(?=\s+[A-Z][a-z])/g,'$1\uE000').split(/(?<=[.!?])\s+|[;\n]+/).map(x=>x.replace(/\uE000/g,'.').trim()).filter(Boolean)}
const spokenDigits=freeze({zero:'0',oh:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9'});
function normalizePhoneWords(text,normalizations){
 const word=Object.keys(spokenDigits).join('|'),pattern=new RegExp('\\b((?:(?:his|her|their|the)\\s+)?(?:phone|mobile|telephone|cell|number)(?:\\s+number)?\\s*(?:is\\s+|[:=]\\s*)?)((?:'+word+')(?:[\\s,-]+(?:'+word+'))*)(?=[\\s.!?;,]|$)','gi');
 return text.replace(pattern,(all,label,value)=>{const digits=value.toLowerCase().match(new RegExp(word,'g')).map(x=>spokenDigits[x]).join('');if(digits.length!==10&&!(digits.length===11&&digits[0]==='1'))return all;normalizations.push({from:value,to:digits,scope:'phone_field_words'});return label+digits});
}
function normalizeNameCorrection(text,normalizations){
 if((text.match(/\b(?:sorry|i mean)\b/gi)||[]).length!==1)return text;
 // A correction must be attached to an explicitly introduced identity, not notes.
 const prefix='((?:(?:add|create|make|register)\\s+(?:a\\s+)?(?:new\\s+)?(?:customer|client)(?:\\s+(?:called|named))?|(?:(?:his|her|their)\\s+)?name\\s+is)\\s+)';
 const name="[\\p{L}][\\p{L} .’'\\-]*?";
 const pattern=new RegExp(prefix+'('+name+')\\s*(?:—|--|,)\\s*(?:sorry|i mean)\\s*[,—]?\\s*('+name+')(?=\\s+(?:(?:his|her|their)\\s+)?(?:phone|number|email|address)\\b|[.!?;,]|$)','iu');
 return text.replace(pattern,(all,lead,before,after)=>{normalizations.push({from:before.trim(),to:after.trim(),scope:'explicit_name_correction'});return lead+after.trim()});
}
function contextualTokens(raw,normalizations){
 let tokens=raw.map(t=>{const to=phonetics[t];if(to)normalizations.push({from:t,to,scope:'intent_vocabulary'});return to||t});
 const action=groups.prepare.some(v=>(' '+tokens.join(' ')+' ').includes(' '+v+' ')),query=/^(?:what|which|show|check|list|find|search|look|do|have|tell|how)\b/.test(tokens.join(' '));
 const replace=(from,to,condition)=>{if(!condition)return;for(let i=0;i<tokens.length;i++)if(tokens[i]===from){tokens[i]=to;normalizations.push({from,to,scope:'contextual_intent_vocabulary'})}};
 replace('coats','quotes',action&&tokens.includes('for'));replace('coat','quote',action&&tokens.includes('for'));replace('estimit','estimate',action&&tokens.includes('for'));
 replace('sight','site',(action||tokens.some(t=>['schedule','scheduled','scheduling','book'].includes(t)))&&tokens.includes('visit'));
 replace('sail','sale',query&&tokens.some(t=>['total','totals','revenue','business'].includes(t)));replace('sails','sales',query&&tokens.some(t=>['total','totals','revenue','business'].includes(t)));
 if(query)for(let i=0;i<tokens.length-1;i++)if(tokens[i]==='in'&&/^voices?$/.test(tokens[i+1])&&(tokens.some(t=>['overdue','unpaid','paid','outstanding'].includes(t))||/^(?:\d|[a-z]{1,5}\d)/i.test(tokens[i+2]||''))){normalizations.push({from:'in '+tokens[i+1],to:tokens[i+1]==='voices'?'invoices':'invoice',scope:'split_intent_word'});tokens.splice(i,2,tokens[i+1]==='voices'?'invoices':'invoice')}
 replace('followup','follow up',tokens.some(t=>['task','reminder'].includes(t)));
 replace('scheduling','schedule',/^(?:start |please )?scheduling\b/.test(tokens.join(' ')));
 return tokens;
}

function normalizeSpeechText(input){
 let text=withoutFiller(input);const normalizations=[];
 text=normalizePhoneWords(normalizeNameCorrection(text,normalizations),normalizations);
 const change=(from,to,scope)=>{if(from!==to)normalizations.push({from,to,scope});return to};
 text=text.replace(/(^|[,;]\s*|\.\s+)(?:(?:um|uh|erm)\b[\s,]*)+/gi,(all,boundary)=>change(all,boundary,'boundary_filler'));
 const verbs=groups.create.concat(groups.prepare,['show','check','list','open','schedule','book']).sort((a,b)=>b.length-a.length).join('|');
 const actionRepeat=new RegExp('^('+verbs+')(?:\\s+\\1)+(?=\\s+(?:(?:me|a|an|new|my)\\s+)*(?:customer|client|contact|quote|quotation|estimate|task|reminder|job|appointment|event|calendar|schedule|work|jobs)\\b)','i');
 text=text.replace(actionRepeat,(all,verb)=>change(all,verb,'repeated_action'));
 let parts=clauses(text);
 parts=parts.map(part=>{
  part=part.replace(actionRepeat,(all,verb)=>change(all,verb,'repeated_action'));
  const phonePrefix=/^((?:(?:his|her|their|the|customer's|client's)\s+)?(?:phone|number|mobile|telephone|cell)(?:\s+(?:phone|number|mobile|telephone|cell))*(?:\s+(?:is\s+)*is|\s*[:=])?\s*)(?=[+\d(]|(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b)/i;
  const labelPrefix=/^((?:(?:his|her|their|the|customer's|client's)\s+)?(name|email|address|company)(?:\s+\2)*(?:\s+(?:is\s+)*is|\s*[:=])\s*)/i;
  return part.replace(phonePrefix,from=>change(from,from.replace(/\b(phone|number|mobile|telephone|cell|is)(?:\s+\1)+\b/gi,'$1'),'repeated_field_label')).replace(labelPrefix,from=>change(from,from.replace(/\b(name|email|address|company|is)(?:\s+\1)+\b/gi,'$1'),'repeated_field_label'));
 });
 const action=/^(?:make|create|add|register|save|onboard|set up)\s+(?:me\s+)?(?:(?:a|an)\s+)?(?:new\s+)?(?:customer|client|contact)\b/i;
 const field=/^(?:(?:his|her|their|the|customer's|client's)\s+)?(?:name|phone|number|mobile|telephone|cell|email|address|location|company|notes?)\b/i;
 const actions=parts.map((part,i)=>action.test(part)?i:-1).filter(i=>i>=0);
 if(actions.length===1&&actions[0]>0&&parts.slice(0,actions[0]).every(part=>field.test(part))){const index=actions[0];parts=[parts[index],...parts.slice(0,index),...parts.slice(index+1)];normalizations.push({from:'field clauses before customer action',to:'customer action before field clauses',scope:'clause_order'})}
 text=parts.map((part,i)=>i<parts.length-1&&!/[.!?]$/.test(part)?part+'.':part).join(' ').trim();
 text=normalizePhoneWords(normalizeNameCorrection(text,normalizations),normalizations);
 if(/^(?:what|which|show|check|list|do|have|tell)\b/i.test(text)){
  text=text.replace(/^(what|which|show|check|list|do|have|tell)(?:\s+\1)+\b/i,(all,word)=>change(all,word,'repeated_query_word'));
  text=text.replace(/\b(i|we|you)\s+(have|do|can)(?:\s+\2)+\b/gi,(all,subject,word)=>change(all,subject+' '+word,'repeated_auxiliary'));
  text=text.replace(/\b(what|which|my|any)\s+(jobs|work|schedule|appointments|shifts|bookings)(?:\s+\2)+\b/gi,(all,prefix,word)=>change(all,prefix+' '+word,'repeated_query_noun'));
 }
 return {text,normalizations};
}
function protectCustomerIdentity(review,text,records,context){
 if(review.intent!=='customer.create'||!review.draft?.fields)return review;
 const candidates=[],add=(value,source)=>{value=clean(value).replace(/[.!?]+$/,'').replace(/^['"“]|['"”]$/g,'').trim();if(value)candidates.push({value,source})};
 if(review.draft.fields.name)add(review.draft.fields.name,'customer_action');
 for(const original of clauses(text)){
  const part=original.replace(/\b([A-Z])\.(?=\s+[A-Z][a-z])/g,'$1\uE000');
  const labels=/\b(?:(?:(?:his|her|their|customer(?:'s)?|client(?:'s)?|the customer(?:'s)?)\s+)?name\s*(?:(?:is|was)\s+|[:=]\s*)?|(?:he|she|they|the customer)\s+(?:is\s+|are\s+)?(?:called|named)\s+|(?:also known as|goes by|aka)\s+)(.+?)(?=\s+(?:and\s+)?(?:(?:his|her|their)\s+)?(?:phone|number|email|address|name)\b|[;,.!?]|$)/gi;
  let match;while((match=labels.exec(part)))add(match[1].replace(/\uE000/g,'.'),'explicit_identity');
 }
 const distinct=[...new Map(candidates.map(x=>[key(x.value),x])).values()];
 const commaConflict=/\b(?:customer|client)(?:\s+(?:called|named))?\s+[\p{L}'’-]+\s+[\p{L}'’-]+,\s*[\p{L}'’-]+\s+[\p{L}'’-]+(?=[.!?;]|$)/iu.test(text);
 const alias=candidates.some(x=>/\b(?:also known as|aka|or|versus|instead|actually)\b/i.test(x.value));
 const repeated=candidates.some(x=>{const words=key(x.value).split(' ');return words.some((w,i)=>i>0&&w===words[i-1])});
 if(distinct.length>1||alias||repeated||commaConflict){
  const message=repeated?'Repeated name words may be a transcription error. Confirm the exact customer name.':'Contradictory customer names were supplied. Confirm one exact name.';
  review.draft.fields.name='';review.missingRequired=[...new Set([...(review.missingRequired||[]),'name'])];review.issues=[...(review.issues||[]),{field:'name',code:'AMBIGUOUS_NAME',message,blocking:true}];review.status='needs_clarification';review.clarification=message;
  review.duplicates=records.findDuplicates?.(review.draft.fields,customers(context),{businessId:context.businessId||'local-business'})||[];
 }
 return {review,candidates:distinct};
}

function primaryDomain(tokens){const text=tokens.join(' '),m=text.match(/^(?:add|create|make|register|save|onboard|set up|prepare|draft|write(?: up)?|start|build|generate|put together|schedule|book|plan)\s+(?:(?:me|a|an|the|new)\s+)*(customer|client|contact|quote|quotes|quotation|estimate|proposal|task|reminder|job|work order|appointment|event|meeting|site visit)\b/);if(!m)return null;return Object.entries({customer:['customer','client','contact'],quote:['quote','quotes','quotation','estimate','proposal'],task:['task','reminder'],job:['job','work order'],calendar:['appointment','event','meeting','site visit']}).find(([,words])=>words.includes(m[1]))?.[0]||null}
function lexical(input){const speech=normalizeSpeechText(input);let text=speech.text;text=text.replace(/^for\s+([^,]+),\s+((?:prepare|draft|write|create|make|build|start)\b.+)$/i,'$2 for $1').replace(/^(?:for\s+)?(tomorrow|tmrw|tommorow|tomorow|today)[,:]?\s+((?:what|which|when|do|is|are|have|show|list|check|tell)\b.+)$/i,'$2 $1');const raw=key(text).split(' ').filter(Boolean),normalizations=[...speech.normalizations];const tokens=contextualTokens(raw,normalizations);const normalized=tokens.join(' ');const has=values=>values.some(v=>(' '+normalized+' ').includes(' '+v+' '));return {text,normalized,tokens,primaryDomain:primaryDomain(tokens),normalizations,has,group:name=>has(groups[name]||[]),question:/^(?:what|which|when|how|do|does|is|are|have|list|show|tell|check|see|look|give)\b/.test(normalized),action:/^(?:add|create|make|register|save|onboard|set up|prepare|draft|write|start|build|generate|put together|schedule|scheduling|book|plan|open|go to|take me to|navigate to|switch to|show|view)\b/.test(normalized)}}
function result(intent=null,effect=null){return {version:1,intent,status:'unsupported',effect,parameters:{},confidence:{level:'low',score:0,method:'deterministic_rules'},missingInformation:[],warnings:[],clarification:{required:true,questions:[],reasonCodes:[]},explanation:[],normalizations:[],candidates:[],suggestedCommand:null,requiresAuthorization:effect==='proposes_modification'}}
function missing(r,field,reason){r.missingInformation.push({field,reason})}
function warn(r,code,message){r.warnings.push({code,message})}
function clarify(r,code,message){if(!r.clarification.reasonCodes.includes(code))r.clarification.reasonCodes.push(code);if(message&&!r.clarification.questions.includes(message))r.clarification.questions.push(message);r.clarification.required=true}
function customers(context){return (Array.isArray(context.customers)?context.customers:[]).filter(x=>x&&typeof x.id==='string'&&(!x.businessId||x.businessId===(context.businessId||'local-business')))}
function resolveCustomer(text,context,r){
 const supplied=clean(text).replace(/^["“]|["”]$/g,'').replace(/[.!?]+$/,'').trim(),list=customers(context);
 if(/\b(?:or|maybe|possibly)\b/i.test(supplied)){missing(r,'customerRef','More than one identity or an uncertain identity was supplied.');clarify(r,'AMBIGUOUS_CUSTOMER','Which existing customer do you mean?');return null}
 if(!supplied||/^(?:that|this|the|our)\s+(?:customer|client|contact)$/i.test(supplied)||/^(?:him|her|them)$/i.test(supplied)){
  const selected=context.record||context.selectedRecord;
  if(selected?.store==='customers'){const found=list.filter(x=>x.id===selected.id);if(found.length===1)return {store:'customers',id:found[0].id}}
  missing(r,'customerRef','No verified selected customer is available.');clarify(r,'CUSTOMER_REQUIRED','Which existing customer is this for?');return null;
 }
 const search=key(supplied),exact=list.filter(x=>x.id===supplied||key(x.name)===search),matches=exact.length?exact:list.filter(x=>search&&(' '+key(x.name)+' ').includes(' '+search+' '));
 if(matches.length!==1){r.parameters.customerCandidates=matches.map(x=>({store:'customers',id:x.id}));missing(r,'customerRef',matches.length?'Several saved customers match.':'No saved customer matches the supplied name or identifier.');clarify(r,matches.length?'AMBIGUOUS_CUSTOMER':'CUSTOMER_NOT_FOUND',matches.length?'Which matching customer do you mean?':'Choose an existing customer or create the customer first.');return null}
 if(!exact.length)warn(r,'PARTIAL_CUSTOMER_MATCH','A partial name matched one currently available customer; review the reference.');
 return {store:'customers',id:matches[0].id};
}
const weekdays=freeze(['sunday','monday','tuesday','wednesday','thursday','friday','saturday']);
function businessDate(context,r){
 let derived=null;
 if(context.businessTimeZone!==undefined){try{new Intl.DateTimeFormat('en-US',{timeZone:context.businessTimeZone}).format(0)}catch{missing(r,'context.businessTimeZone','Supply a valid IANA business timezone.');return null}}
 if(context.now!==undefined){
  if(!context.businessTimeZone||typeof context.now!=='string'||!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(context.now)||!validDate(context.now.slice(0,10))||!Number.isFinite(Date.parse(context.now))){missing(r,'context.now','Supply an explicit timestamp with UTC offset and the business timezone.');return null}
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:context.businessTimeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(context.now)),get=type=>parts.find(p=>p.type===type)?.value;derived=get('year')+'-'+get('month')+'-'+get('day');
 }
 if(context.today!==undefined&&!validDate(context.today)){missing(r,'context.today','Supply a valid business-local date.');return null}
 if(derived&&context.today&&derived!==context.today){clarify(r,'CONFLICTING_DATE_CONTEXT','The supplied business date disagrees with the timestamp in the business timezone.');return null}
 if(derived||context.today)return derived||context.today;
 missing(r,'context.today','The host must supply the business-local date to resolve relative dates.');return null;
}
function nextWeekday(l,context,r){
 const matches=[...l.normalized.matchAll(/\bnext (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g)],days=[...new Set(matches.map(m=>m[1]))];if(!days.length)return undefined;
 if(days.length!==1){clarify(r,'AMBIGUOUS_DATE','Which weekday should I use?');return null}
 const today=businessDate(context,r);if(!today)return null;
 if(!context.businessTimeZone){missing(r,'context.businessTimeZone','Supply the business timezone before resolving a named weekday.');return null}
 const date=new Date(today+'T12:00:00Z'),target=weekdays.indexOf(days[0]),day=date.getUTCDay(),offset=(target-day+7)%7||7;
 const iso=n=>{const d=new Date(date);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 // Both common meanings are explicit. Weeks start Monday for following_week.
 const nextMonday=day===0?1:8-day,following=nextMonday+(target+6)%7;
 r.parameters.period='next '+days[0];r.parameters.dateCandidates=[...new Set([iso(offset),iso(following)])];
 const policy=context.nextWeekdayPolicy;
 if(policy!==undefined&&!['upcoming','following_week'].includes(policy)){clarify(r,'INVALID_WEEKDAY_POLICY','Choose upcoming or following_week as the explicit next-weekday policy.');return null}
 if(!policy&&r.parameters.dateCandidates.length===1)return r.parameters.dateCandidates[0];
 if(!policy){clarify(r,'AMBIGUOUS_NEXT_WEEKDAY','Does next '+days[0]+' mean '+iso(offset)+' or '+iso(following)+'? Confirm the date.');return null}
 return iso(policy==='upcoming'?offset:following);
}

function dateParameter(l,context,r,required){
 const dates=[...new Set(l.text.match(/\b\d{4}-\d{2}-\d{2}\b/g)||[])],relative=[];
 if(l.has(['tomorrow','next day']))relative.push('tomorrow');if(l.has(['today']))relative.push('today');if(l.has(['yesterday']))relative.push('yesterday');
 const hasWeekday=/\bnext (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(l.normalized);
 if(dates.length+relative.length+Number(hasWeekday)>1){missing(r,'date','Conflicting dates were supplied.');clarify(r,'AMBIGUOUS_DATE','Which single date should I use?');return null}
 if(dates.length){if(validDate(dates[0]))return dates[0];missing(r,'date','The supplied date is invalid.');clarify(r,'INVALID_DATE','Enter a valid date.');return null}
 if(hasWeekday)return nextWeekday(l,context,r);
 if(relative.length){r.parameters.period=relative[0];const today=businessDate(context,r);if(!today)return null;const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+({tomorrow:1,today:0,yesterday:-1}[relative[0]]));return d.toISOString().slice(0,10)}
 if(required){missing(r,'date','No supported date was supplied.');clarify(r,'DATE_REQUIRED','Which date do you mean?')}return null;
}
function customerInstruction(l){
 let text=l.text.replace(/^(?:make|create|add|register|save|onboard|set up)\s+(?:me\s+)?(?:(?:a|an)\s+)?(?:new\s+)?(?:customer|client|contact)\b/i,'Add customer');
 text=text.replace(/^(?:make|create|add|register|save|onboard)\s+(?:me\s+)?(.+?)\s+(?:as\s+)?(?:a\s+)?(?:new\s+)?(?:customer|client|contact)\b/i,'Add $1 as a customer');
 return /[.!?]$/.test(text)?text:text+'.';
}
function customerReview(r,review){
 r.parameters.fields=review.draft?.fields||{};r.recordReview=review;
 for(const field of [...new Set([...(review.missingRequired||[]),...(!r.parameters.fields.phone?['phone']:[])])])missing(r,field,field==='phone'?'A complete US phone number is required by the current voice-create workflow.':'A required customer value is missing.');
 for(const issue of review.issues||[])if(issue.blocking)clarify(r,issue.code,issue.message);else warn(r,issue.code,issue.message);
 if(review.duplicates?.length){r.parameters.duplicateCandidates=review.duplicates.map(x=>x.ref);clarify(r,'POSSIBLE_DUPLICATE','Review likely existing customers before proposing a separate customer.')}
 if(review.intent!=='customer.create')clarify(r,'UNSUPPORTED_CUSTOMER_DETAILS',review.clarification||'Please rephrase the customer details.');
 if(!r.missingInformation.length&&!r.clarification.reasonCodes.length)r.suggestedCommand={commandId:'customer.create',params:{fields:r.parameters.fields}};
 return r;
}
const builtinTools=[
 {id:'customer.contact',description:'Prepare a contact request for a verified customer; never initiate a call',effect:'draft',requiredParameters:['customerRef'],match:l=>/^call\b/.test(l.normalized)?85:0,extract(l,c,r){r.parameters.customerName=clean(l.text.replace(/^call\s+/i,'').replace(/[.!?]+$/,''));const ref=resolveCustomer(r.parameters.customerName,c,r);if(ref)r.parameters.customerRef=ref;clarify(r,'EXTERNAL_ACTION_REVIEW','Review the customer and contact action. This interpreter cannot place calls.');return r}},
 {id:'customer.create',description:'Propose a validated customer draft',effect:'proposes_modification',requiredParameters:['fields.name','fields.phone'],match:l=>l.action&&(!l.primaryDomain||l.primaryDomain==='customer')&&l.group('customer')&&l.group('create')?90:0,extract(l,c,r,adapters){if(!adapters.records){clarify(r,'RECORD_ADAPTER_REQUIRED','Customer extraction adapter is unavailable.');return r}const parsed=adapters.records.interpret(customerInstruction(l),{customers:customers(c),context:c});const protectedIdentity=protectCustomerIdentity(copy(parsed),l.text,adapters.records,c);if(protectedIdentity.candidates?.length)r.entityCandidates={name:protectedIdentity.candidates};return customerReview(r,protectedIdentity.review||protectedIdentity)}},
 {id:'quotation.prepare',description:'Prepare a quotation for a verified existing customer',effect:'draft',requiredParameters:['customerRef'],match:l=>l.action&&(!l.primaryDomain||l.primaryDomain==='quote')&&l.group('quote')&&l.group('prepare')?90:0,extract(l,c,r){const person=l.text.match(/\bfor\s+(.+?)(?:[.!?]|$)/i)?.[1]||(/\b(?:that|this|the)\s+(?:customer|client)\b/i.test(l.text)?l.text.match(/\b(?:that|this|the)\s+(?:customer|client)\b/i)[0]:'');r.parameters.customerName=clean(person);const ref=resolveCustomer(person,c,r);if(ref){r.parameters.customerRef=ref;r.suggestedCommand={commandId:'draft.prepare',params:{kind:'quote',ref}}}return r}},
 {id:'schedule.query',description:'Read booked work on one date through the existing Calendar adapter',effect:'read_only',requiredParameters:['date'],match:l=>l.question&&(l.group('job')||l.group('calendar'))&&(l.has(['tomorrow','next day','today','yesterday'])||/\bnext (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(l.normalized)||/\b\d{4}-\d{2}-\d{2}\b/.test(l.text))?95:0,extract(l,c,r){r.parameters.date=dateParameter(l,c,r,true);r.parameters.scope=l.has(['tasks'])?'tasks':l.has(['appointments','meetings'])?'appointments':'scheduled_work';const trades=['electrical','plumbing','hvac','construction'].filter(x=>l.has([x]));if(trades.length)r.parameters.trades=trades;return r}},
 {id:'workspace.open',description:'Navigate to an existing workspace',effect:'navigation',requiredParameters:['workspace'],match:l=>l.action&&l.group('open')&&Object.keys(workspaces).some(w=>l.has([w]))&&!l.has(['tomorrow','today','yesterday'])?65:0,extract(l,c,r){const found=[...new Set(Object.entries(workspaces).filter(([w])=>l.has([w])).map(([,value])=>value))];if(found.length!==1){clarify(r,'AMBIGUOUS_WORKSPACE','Which one workspace should I open?');return r}r.parameters.workspace=found[0];if(!Object.hasOwn(workspaces,l.normalized.replace(/^(?:open|go to|take me to|navigate to|switch to|show|view)\s+(?:(?:the|my)\s+)?/i,'').replace(/[.!?]+$/,'').trim().toLowerCase())){clarify(r,'UNSUPPORTED_VIEW_CONSTRAINT','Opening a workspace cannot apply these extra time or record constraints. Clarify the intended view.');return r}r.suggestedCommand={commandId:'workspace.open',params:{workspace:found[0]}};return r}},
 {id:'record.find',description:'Find existing records without modifying them',effect:'read_only',requiredParameters:['query'],match:l=>/^(?:find|search|look up|look for)\b/.test(l.normalized)?75:0,extract(l,c,r){const searchText=l.normalizations.some(n=>n.scope==='split_intent_word')?l.text.replace(/^(find|search(?: for)?|look (?:up|for))\s+in voices?\b/i,(_,verb)=>verb+' '+(l.has(['invoices'])?'invoices':'invoice')):l.text;const m=searchText.match(/^(?:find|search(?: for)?|look (?:up|for))\s+(?:(customer|client|quote|quotation|job|task|invoice|supplier)s?\s+)?(.+?)\s*[.!?]?$/i);if(!m){missing(r,'query','A search term is required.');return r}const aliases={customer:'customers',client:'customers',quote:'quotes',quotation:'quotes',job:'jobs',task:'tasks',invoice:'invoices',supplier:'suppliers'};r.parameters={query:m[2],...(m[1]?{store:aliases[m[1].toLowerCase()]}:{})};r.suggestedCommand={commandId:'record.find',params:copy(r.parameters)};return r}},
 {id:'task.prepare',description:'Prepare a task without saving or inventing its due date',effect:'draft',requiredParameters:['title'],match:l=>l.action&&(!l.primaryDomain||l.primaryDomain==='task')&&l.group('task')&&(l.group('create')||l.group('prepare'))?85:0,extract(l,c,r){r.parameters.title=clean(l.text.replace(/^.*?\b(?:task|reminder|todo|to-do)\b\s*(?:to|for|called|named)?\s*/i,'').replace(/\s+(?:on\s+)?(?:tomorrow|today|\d{4}-\d{2}-\d{2})[.!?]*$/i,''));r.parameters.due=dateParameter(l,c,r,false);if(!r.parameters.title){missing(r,'title','Describe the task.')}return r}},
 {id:'job.prepare',description:'Prepare a job draft for a verified customer',effect:'draft',requiredParameters:['customerRef','title'],match:l=>l.action&&(!l.primaryDomain||l.primaryDomain==='job')&&l.has(['job','jobs','work order'])&&(l.group('create')||l.group('prepare'))?85:0,extract(l,c,r){r.parameters.title=clean(l.text.replace(/^.*?\b(?:job|work order)\b\s*(?:to|called|named)?\s*/i,'').replace(/(?:^|\s+)for\s+.+$/i,''));const person=l.text.match(/\bfor\s+(.+?)(?:[.!?]|$)/i)?.[1]||'';const ref=resolveCustomer(person,c,r);if(ref)r.parameters.customerRef=ref;if(!r.parameters.title)missing(r,'title','Describe the job scope.');r.parameters.date=dateParameter(l,c,r,false);return r}},
 {id:'calendar.prepare',description:'Prepare an appointment draft without booking it',effect:'draft',requiredParameters:['date','time','durationMinutes'],match:l=>l.action&&(!l.primaryDomain||l.primaryDomain==='calendar')&&l.has(['schedule','book','plan','create','prepare','add'])&&l.has(['appointment','event','meeting','site visit'])?90:0,extract(l,c,r){r.parameters.date=dateParameter(l,c,r,true);const time=l.text.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/g)||[];r.parameters.time=time.length===1?time[0]:null;if(time.length!==1)missing(r,'time',time.length?'Conflicting times were supplied.':'Use an explicit 24-hour time; no appointment time was inferred.');const duration=l.text.match(/\b(?:for\s+)?(\d+)\s*(?:minutes?|mins?)\b/i);r.parameters.durationMinutes=duration?Number(duration[1]):null;if(!duration)missing(r,'durationMinutes','No duration was supplied.');else if(r.parameters.durationMinutes<15||r.parameters.durationMinutes>1440)missing(r,'durationMinutes','Duration must be 15–1440 minutes.');return r}},
 {id:'business.query',description:'Ask for a read-only local business summary',effect:'read_only',requiredParameters:['topics'],match:l=>l.question&&(l.has(['revenue','expenses','overdue invoices','open quotations','unpaid invoices','overdue tasks','business summary'])||l.has(['sale','sales'])&&l.has(['total','totals','business']))?80:0,extract(l,c,r){const topics=['revenue','expenses','overdue invoices','open quotations','unpaid invoices','overdue tasks','business summary'].filter(x=>l.has([x]));r.parameters.topics=topics;if(l.has(['sale','sales'])&&l.has(['total','totals','revenue','business']))r.parameters.topics.push('sales');if(l.has(['today','tomorrow','yesterday','next day'])||/\b\d{4}-\d{2}-\d{2}\b/.test(l.text))r.parameters.date=dateParameter(l,c,r,false);return r}}
];
function createEngine({tools=builtinTools,records=recordInterpreter}={}){
 if(!Array.isArray(tools)||tools.some(t=>!t||typeof t.id!=='string'||!t.id||typeof t.match!=='function'||typeof t.extract!=='function'||!['read_only','navigation','draft','proposes_modification'].includes(t.effect)||t.execute||t.requiredParameters!==undefined&&(!Array.isArray(t.requiredParameters)||t.requiredParameters.some(p=>typeof p!=='string'||!p)))||new Set(tools.map(t=>t.id)).size!==tools.length)throw Error('Tools need unique IDs, interpretation-only match/extract functions and a supported effect.');
 const registered=tools.map(t=>({...t,requiredParameters:[...(t.requiredParameters||[])]}));
 function describePlan(l,c){
  const action='(?:add|create|make|prepare|draft|write|schedule|book|open|show|find|call|send|delete)',parts=l.text.split(new RegExp('\\s+(?:and(?:\\s+then)?|then)\\s+(?='+action+'\\b)|[.;]\\s+(?='+action+'\\b)','i')).map(x=>x.trim()).filter(Boolean);
  if(parts.length<2)return null;
  if(parts.length>8)return {status:'needs_clarification',executable:false,steps:[],reason:'Split this request into at most eight draft operations.'};
  const steps=[];
  for(const part of parts){
   const dependent=/^(?:schedule|book)\s+(?:it|that|this)\b\s*(.*)$/i.exec(part),previous=steps.at(-1),linked=dependent&&previous?.intent==='job.prepare';
   const interpreted=interpretCommand(linked?'Schedule an appointment '+dependent[1]:part,c);
   const step={id:'step-'+(steps.length+1),intent:interpreted.intent,status:interpreted.status,parameters:interpreted.parameters,missingInformation:interpreted.missingInformation,clarification:interpreted.clarification,dependsOn:[]};
   if(linked){step.dependsOn=[previous.id];step.bindings={jobRef:{fromStep:previous.id,state:'unresolved'}};step.missingInformation.push({field:'jobRef',reason:'No job exists for this unsaved draft; the host must resolve it after authorized creation.'});step.status='needs_clarification';step.clarification={required:true,questions:['Review the job and appointment drafts before any operation.'],reasonCodes:['UNRESOLVED_DRAFT_REFERENCE']}}
   steps.push(step);
  }
  return {status:'needs_review',executable:false,steps,reason:'Proposed draft operations only. No operation has run; the host owns review, permissions and record creation.'};
 }

 function interpretCommand(transcript,context={}){
  const base=result();if(typeof transcript!=='string'||!transcript.trim()||transcript.length>8000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(transcript)){clarify(base,'INVALID_INPUT','Enter a transcript of 1–8000 characters.');return base}
  let c;try{if(!context||typeof context!=='object'||Array.isArray(context))throw Error('Invalid context');c=freeze(copy(context))}catch{clarify(base,'INVALID_CONTEXT','Provide serializable local record context.');return base}
  const l=freeze(lexical(transcript)),candidates=[];
  for(const tool of registered){try{const score=tool.match(l,c);if(Number.isFinite(score)&&score>0)candidates.push({intent:tool.id,score:Math.min(100,score),tool})}catch{warn(base,'TOOL_MATCH_UNAVAILABLE','A registered matcher could not evaluate this transcript.')}}
  candidates.sort((a,b)=>b.score-a.score||a.intent.localeCompare(b.intent));base.candidates=candidates.map(({intent,score})=>({intent,score}));base.normalizations=l.normalizations;
  if(/\b(?:do not|don't|never|not|dont|cancel)\b/i.test(transcript))clarify(base,'NEGATED_OR_UNCERTAIN','The instruction is negated; no positive action has been authorized.');
  if(/\b(?:if|unless|provided that|only when)\b/i.test(transcript))clarify(base,'CONDITIONAL_REQUEST','The condition must be verified by the host before any business action.');
  if(/(?:…|\.\.\.|\b(?:to|for|with|at|on|phone|number))\s*[.!?]*$/.test(transcript))clarify(base,'TRUNCATED_TRANSCRIPT','The instruction appears incomplete. What details were cut off?');
  if(/\[[^\]]*\]|\b(?:background speech|unrelated speech|inaudible|crosstalk)\b/i.test(transcript))clarify(base,'TRANSCRIPT_INTERFERENCE','Repeat the intended request without the marked background speech.');
  if(!candidates.length){clarify(base,'UNKNOWN_INTENT','What would you like to do: add a customer, prepare a draft, or check existing work?');return base}
  if(/^(?:how (?:do|can|would) i|what if|suppose|pretend)\b|\b(?:definition of|meaning of|did .+ say|does .+ mean)\b/i.test(l.text)){clarify(base,'META_OR_HYPOTHETICAL_REQUEST','Are you requesting an action or asking about a phrase?');return base}
  const selected=candidates[0];const r={...base,intent:selected.intent,effect:selected.tool.effect,parameters:{},requiresAuthorization:selected.tool.effect==='proposes_modification',explanation:['Matched '+selected.tool.id+' using action, domain and context constraints.']};
  if(l.normalizations.some(x=>x.scope==='explicit_name_correction'))clarify(r,'CORRECTION_REVIEW','Review the explicitly corrected customer name.');
  if(l.normalizations.some(n=>n.scope==='contextual_intent_vocabulary'||n.scope==='split_intent_word'))warn(r,'CONTEXTUAL_RECOVERY','Business grammar suggested a vocabulary correction; review the interpreted intent.');
  const proposedPlan=describePlan(l,c);if(proposedPlan){r.proposedPlan=proposedPlan;clarify(r,'MULTIPLE_INTENTS','Review the proposed operations and their missing details. No operation has executed.')}
  const modifying=candidates.filter(x=>['draft','proposes_modification'].includes(x.tool.effect));
  if(candidates[1]?.score===selected.score)clarify(r,'MULTIPLE_INTENTS','Multiple registered capabilities match equally. Which one did you intend?');
  const clauseIntents=new Set();for(const clause of l.text.split(/\s+(?:and(?:\s+then)?|then|but)\s+|[;.!?]\s+/i)){const part=freeze(lexical(clause));for(const tool of registered){try{if(tool.match(part,c)>=75)clauseIntents.add(tool.id)}catch{}}}
  if(clauseIntents.size>1)clarify(r,'MULTIPLE_INTENTS','This contains multiple requests. Which one should I handle first?');
  if(modifying.length>1||/\b(?:and then|then also)\b/i.test(l.text)||(/\band\b/i.test(l.text)&&candidates.some(x=>x.intent==='schedule.query')&&modifying.length))clarify(r,'MULTIPLE_INTENTS','This contains multiple possible requests. Which one should I handle first?');
  if(/\b(?:do not|don't|never|not|dont|cancel|forget that|instead|actually|maybe|possibly|not sure|except|excluding)\b/i.test(l.text))clarify(r,'NEGATED_OR_UNCERTAIN','Please confirm the intended action and details. Nothing has been authorized.');
  if(l.has(['next week','last week','next month','last month','this month']))clarify(r,'UNSUPPORTED_PERIOD','Use a supported date or clarify the planning period.');
  if(/\b(?:ignore (?:all|the)|override|bypass|without (?:approval|confirmation)|send|delete|charge)\b/i.test(l.text))clarify(r,'UNSUPPORTED_OR_EXTERNAL_ACTION','This layer cannot authorize external actions or bypass review. Clarify the supported request.');
  try{const extracted=selected.tool.extract(l,c,r,{records});if(extracted&&typeof extracted.then==='function'){extracted.catch?.(()=>{});clarify(r,'ASYNC_ADAPTER_UNSUPPORTED','This interpreter requires synchronous local extraction.')}for(const path of selected.tool.requiredParameters){const value=path.split('.').reduce((object,k)=>object?.[k],r.parameters);if((value===undefined||value===null||value===''||Array.isArray(value)&&!value.length)&&!r.missingInformation.some(x=>x.field===path||x.field===path.split('.').at(-1)))missing(r,path,'Provide '+path+' before using this capability.')}}catch{clarify(r,'EXTRACTION_UNAVAILABLE','The parameters could not be safely interpreted. Please rephrase.')}
  if(r.missingInformation.length)clarify(r,'MISSING_INFORMATION',r.missingInformation.map(x=>x.reason).join(' '));
  r.status=r.clarification.reasonCodes.includes('MULTIPLE_INTENTS')?'ambiguous':r.clarification.required&&r.clarification.reasonCodes.length?'needs_clarification':'recognized';
  r.clarification.required=r.status!=='recognized';
  r.confidence={level:r.status==='ambiguous'?'low':r.status==='recognized'?'high':'medium',score:(r.status==='ambiguous'?Math.min(49,selected.score):r.status==='recognized'?selected.score:Math.min(69,selected.score))/100,method:'deterministic_rules'};
  if(r.clarification.required)r.suggestedCommand=null;
  return copy(r);
 }
 function correctInterpretation(previous,changes,context={}){
  if(previous?.intent!=='customer.create'||!records?.correct||!changes||Object.keys(changes).some(k=>!['fields'].includes(k))){const r=result();clarify(r,'UNSUPPORTED_CORRECTION','Choose a customer field to correct, or re-enter the intended request.');return r}
  let c;try{if(!context||typeof context!=='object'||Array.isArray(context))throw Error('Invalid context');c=freeze(copy(context))}catch{const r=result();clarify(r,'INVALID_CONTEXT','Provide serializable context.');return r}
  const seed=previous.recordReview||{intent:'customer.create',draft:{kind:'customer',fields:previous.parameters?.fields||{}},issues:[],relatedDrafts:[]};
  const r=result('customer.create','proposes_modification');r.explanation=['Customer fields were explicitly corrected; no record was changed.'];
  const review=records.correct(seed,changes.fields,{customers:customers(c),context:c});customerReview(r,review);
  for(const w of previous.warnings||[])if(w.code==='UNSUPPORTED_OR_EXTERNAL_ACTION')clarify(r,w.code,w.message);
  if(previous.clarification?.reasonCodes.some(x=>['MULTIPLE_INTENTS','NEGATED_OR_UNCERTAIN','UNSUPPORTED_OR_EXTERNAL_ACTION','TRANSCRIPT_INTERFERENCE','TRUNCATED_TRANSCRIPT','CONDITIONAL_REQUEST'].includes(x)))clarify(r,'ACTION_CONFIRMATION_REQUIRED','Re-enter the intended action; field correction does not resolve conflicting instructions.');
  if(r.missingInformation.length)clarify(r,'MISSING_INFORMATION',r.missingInformation.map(x=>x.reason).join(' '));
  r.status=r.clarification.reasonCodes.length?'needs_clarification':'recognized';r.clarification.required=r.status!=='recognized';r.confidence={level:r.status==='recognized'?'high':'medium',score:r.status==='recognized'?.9:.6,method:'deterministic_rules'};if(r.clarification.required)r.suggestedCommand=null;return copy(r);
 }
 return Object.freeze({version:1,interpretCommand,correctInterpretation,tools:freeze(registered.map(({id,description,effect,requiredParameters})=>({id,description,effect,requiredParameters:requiredParameters||[]})))});
}
const engine=createEngine();
return Object.freeze({version:1,createEngine,interpretCommand:engine.interpretCommand,correctInterpretation:engine.correctInterpretation,vocabulary:groups,phonetics,builtinTools:freeze(builtinTools),tools:engine.tools});
});
