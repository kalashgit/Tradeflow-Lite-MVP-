/* TradeFlow contextual speech candidates. Pure local interpretation; no I/O or execution.
 * Scores describe evidence strength, not statistical probabilities. Synthetic fixtures
 * are evaluation inputs and are never imported into this runtime module. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowSpeechMutationEngine=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const key=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[’]/g,"'").replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const concepts=freeze({create:['create','add','make','register','onboard','set up'],prepare:['prepare','draft','write up','put together','create','make','build'],query:['what','which','check','show','list','tell me','do i have','have i got'],open:['open','go to','take me to','show','view'],find:['find','search','look up','look for'],schedule:['schedule','book','plan'],contact:['call','contact']});
const types=new Set(['text','name','phone','money','date','time','identifier','address','record']);
const stop=new Set(['a','an','the','new','my','our','me','please','just']);
function tokenize(text){return [...text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu)].map(m=>({text:m[0],key:key(m[0]),start:m.index,end:m.index+m[0].length}))}
function distance(a,b){if(a===b)return 0;if(Math.abs(a.length-b.length)>2)return 3;let row=Array.from({length:b.length+1},(_,i)=>i),previous=null;for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++){next[j]=Math.min(row[j]+1,next[j-1]+1,row[j-1]+Number(a[i-1]!==b[j-1]));if(previous&&i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])next[j]=Math.min(next[j],previous[j-2]+1)}previous=row;row=next}return row[b.length]}
function phonetic(value){return key(value).replace(/\s+/g,'').replace(/ght/g,'t').replace(/ph/g,'f').replace(/qu/g,'k').replace(/ck/g,'k').replace(/c(?=[eiy])/g,'s').replace(/c/g,'k').replace(/z/g,'s').replace(/v/g,'f').replace(/[aeiouywh]/g,'').replace(/(.)\1+/g,'$1')}
function similarity(from,to){const a=key(from).replace(/ /g,''),b=key(to).replace(/ /g,'');if(a===b)return {score:1,method:key(from)===key(to)?'exact':'segmentation'};if(a.length<3||b.length<3||a.length>40||b.length>40)return null;const edits=distance(a,b);if(edits===1)return {score:.87,method:'edit_distance'};if(edits===2&&Math.min(a.length,b.length)>=7)return {score:.77,method:'edit_distance'};const code=phonetic(a);if(code.length>=2&&code===phonetic(b)&&Math.abs(a.length-b.length)<=3)return {score:.79,method:'phonetic'};return null}
function validateTool(tool){
 if(!tool||typeof tool.id!=='string'||!tool.id||!['read_only','navigation','draft','proposes_modification'].includes(tool.effect)||tool.execute||!tool.language)throw Error('Speech tools require an ID, effect and declarative language; execution is forbidden');
 const l=tool.language;for(const field of ['actions','objects','actionConcepts','contexts'])if(l[field]!==undefined&&(!Array.isArray(l[field])||l[field].length>40||l[field].some(x=>typeof x!=='string'||!x.trim()||x.length>80)))throw Error('Invalid speech vocabulary');
 if(l.allowContextTail!==undefined&&typeof l.allowContextTail!=='boolean')throw Error('Invalid trailing-context policy');
 if(!['instruction','query','either'].includes(l.mode||'instruction'))throw Error('Invalid speech mode');
 if((l.actionConcepts||[]).some(x=>!concepts[x]))throw Error('Unknown action concept');
 if(!((l.actions||[]).length||(l.actionConcepts||[]).length)||!(l.objects||[]).length)throw Error('Speech tools require action and object vocabulary');
 if(l.fields!==undefined&&(!Array.isArray(l.fields)||l.fields.length>16))throw Error('Invalid speech fields');
 for(const f of l.fields||[]){if(!f||typeof f.name!=='string'||!/^\w+(?:\.\w+)*$/.test(f.name)||['__proto__','constructor','prototype'].some(x=>f.name.split('.').includes(x))||!types.has(f.type)||f.position!==undefined&&!['afterObject','remaining'].includes(f.position)||f.markers!==undefined&&(!Array.isArray(f.markers)||f.markers.length>12||f.markers.some(x=>typeof x!=='string'||!x.trim()||x.length>60))||f.type==='record'&&(typeof f.store!=='string'||!f.store))throw Error('Invalid typed speech field')}
 if((l.fields||[]).some((f,i,a)=>a.some((g,j)=>i!==j&&(f.name===g.name||f.name.startsWith(g.name+'.')))))throw Error('Duplicate speech fields');
 return {...tool,language:{...clone(l),mode:l.mode||'instruction',actions:[...new Set([...(l.actions||[]),...(l.actionConcepts||[]).flatMap(c=>concepts[c])])],fields:clone(l.fields||[])}};
}
function criticalSpans(text){
 const spans=[];const collect=(type,regex)=>{for(const m of text.matchAll(regex))spans.push({type,start:m.index,end:m.index+m[0].length,raw:m[0]})};
 collect('quoted',/["“][^"”\n]*["”]/g);collect('quoted',/(?<![\p{L}])'[^'\n]+'(?![\p{L}])/gu);collect('email',/\b[^\s,;]+@[^\s,;]+\b/g);collect('number',/(?<![\p{L}\p{N}])(?:\+?\d[\d\s().,/:#-]*\d|\d)(?![\p{L}\p{N}])/gu);
 collect('money',/(?:[$£€]\s*\d[\d,.]*|\b\d[\d,.]*\s*(?:dollars?|usd|euros?|pounds?)\b)/gi);
 collect('condition',/\b(?:if|unless|only when|provided that)\b[^.!?;]*/gi);collect('negation',/\b(?:don't|dont|do not|never|not|cannot|can't|no longer|cancel)\b/gi);
 return spans.sort((a,b)=>a.start-b.start||b.end-a.end);
}
function safety(text){
 const issues=[];const add=(code,message)=>issues.push({code,message});
 if(/\b(?:don't|dont|do not|never|not|cannot|can't|no longer|cancel)\b/i.test(text))add('NEGATION_PRESERVED','A negated request is not authorization for a positive action.');
 if(/\b(?:if|unless|only when|provided that)\b/i.test(text))add('CONDITION_PRESERVED','The host must verify the condition; it cannot be discarded.');
 if(/^(?:how (?:do|can|would)|can i|could i|what (?:happens|if)|suppose|pretend)\b/i.test(text.trim()))add('QUESTION_ABOUT_ACTION','This asks about an action rather than instructing it.');
 if(/\b(?:said|told me|the phrase|the words|meaning of|definition of)\b/i.test(text))add('REPORTED_SPEECH','Reported or quoted instructions cannot authorize an action.');
 if(/\[[^\]]*\]|\b(?:inaudible|unintelligible|background speech|crosstalk)\b/i.test(text))add('TRANSCRIPT_INTERFERENCE','Do not reconstruct instructions from marked noise.');
 if(/(?:…|\.\.\.|\b(?:to|for|with|at|on|phone|number))\s*[.!?]*$/i.test(text))add('TRUNCATED_TRANSCRIPT','The request appears incomplete.');
 const distinct=(type,regex)=>{const values=[...new Set([...text.matchAll(regex)].map(m=>m[0].replace(/\s+/g,' ').trim()))];if(values.length>1)add('CONFLICTING_'+type,'More than one distinct '+type.toLowerCase()+' was supplied; review the intended values.');};
 distinct('AMOUNTS',/(?:[$£€]\s*\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s*(?:dollars?|usd|euros?|pounds?)\b)/gi);
 distinct('DATES',/\b\d{4}-\d{2}-\d{2}\b/g);distinct('TIMES',/\b(?:[01]\d|2[0-3]):[0-5]\d\b/g);
 return issues;
}
function grammarTokens(text){
 let tokens=tokenize(text),removed=[];const remove=(at,count,scope)=>{removed.push({from:tokens.slice(at,at+count).map(x=>x.text).join(' '),to:'',scope});tokens.splice(at,count)};
 for(let i=0;i<16&&tokens.length;i++){
  if(['hey','hi','hello','okay','ok','um','uh','erm','so','well','please','just'].includes(tokens[0].key)){remove(0,1,'prefix_filler');continue}
  if(tokens[0].key==='trade'&&tokens[1]?.key==='flow'){remove(0,2,'wake_word');continue}
  if(tokens[0].key==='tradeflow'){remove(0,1,'wake_word');continue}
  if(['can','could','would','will'].includes(tokens[0].key)&&tokens[1]?.key==='you'){remove(0,2,'polite_request');continue}break;
 }
 // Only explicit comma-delimited filler is removed internally; names are retained.
 for(let i=1;i<tokens.length-1;i++){if(['um','uh','erm'].includes(tokens[i].key)&&/[,;]/.test(text.slice(tokens[i-1].end,tokens[i].start))){remove(i,1,'boundary_filler');i--}else if(tokens[i].key==='you'&&tokens[i+1]?.key==='know'&&/,\s*$/.test(text.slice(tokens[i-1].end,tokens[i].start))&&/^\s*,/.test(text.slice(tokens[i+1].end,tokens[i+2]?.start||text.length))){remove(i,2,'boundary_filler');i--}}
 return {tokens,normalizations:removed};
}
function matchAt(tokens,index,terms,spans,role){
 const matches=[];for(const term of terms){const target=key(term),size=target.split(' ').length;for(const count of new Set([size,Math.max(1,size-1),size+1])){const group=tokens.slice(index,index+count);if(group.length!==count)continue;const start=group[0].start,end=group.at(-1).end;if(spans.some(s=>start<s.end&&end>s.start))continue;const text=group.map(x=>x.key).join(' '),sim=similarity(text,target);if(sim)matches.push({term,role,start,end,count,from:group.map(x=>x.text).join(' '),...sim})}}
 return matches.sort((a,b)=>b.score-a.score||a.count-b.count||a.term.localeCompare(b.term));
}
function spanEnd(text,start,markers){
 let end=text.length;const remaining=text.slice(start);for(const marker of markers){const re=new RegExp('(?:[,;.!?]\\s*|\\s+(?:and\\s+)?)(?:(?:his|her|their|the)\\s+)?'+escape(marker).replace(/ /g,'\\s+')+'\\b','i'),m=re.exec(remaining);if(m)end=Math.min(end,start+m.index)}return end;
}
function getValues(field,text,object,fields){
 const values=[],markers=fields.flatMap(f=>f.markers||[]),add=(start,end,source)=>{let raw=text.slice(start,end).trim();raw=raw.replace(/^[\s,:=]+/,'').replace(/[.!?;]+$/,'').trim();if(raw)values.push({raw,start,end,source})};
 for(const marker of field.markers||[]){const re=new RegExp('\\b'+escape(marker).replace(/ /g,'\\s+')+'\\b\\s*(?:is\\b|:|=)?\\s*','gi');let m;while((m=re.exec(text))){const start=m.index+m[0].length;add(start,spanEnd(text,start,markers),'marker:'+marker)}}
 if(field.position==='afterObject'&&object){let start=object.end;const rest=text.slice(start),lead=rest.match(/^\s*(?:called|named|name\s+is)\s+/i);if(lead)start+=lead[0].length;let end=spanEnd(text,start,markers);const first=text.slice(start,end).match(/[.!?;](?:\s|$)/);if(first)end=start+first.index;if(!/^\s*(?:his|her|their|phone|number|email|address|name|for|tomorrow|today)\b/i.test(text.slice(start,end)))add(start,end,'after_object')}
 if(field.position==='remaining'&&object)add(object.end,spanEnd(text,object.end,markers),'remaining');
 return [...new Map(values.map(v=>[key(v.raw),v])).values()];
}
function corrected(value){const m=value.match(/^(.*?)\s*(?:—|--|,)\s*(?:sorry|i mean)\b\s*[,—]?\s*(.+)$/i);return m&&m[1].trim()&&m[2].trim()?{original:m[1].trim(),corrected:m[2].trim()}:null}
function parseValue(field,value,context){
 const raw=value.raw,fix=corrected(raw),v=fix?fix.corrected:raw,issues=[];let parsed=v;
 if(fix)issues.push({code:'EXPLICIT_CORRECTION_REVIEW',field:field.name,message:'Review the explicitly corrected value.',original:fix.original,corrected:fix.corrected});
 if(field.type==='name'&&(v.includes(',')||/\b(?:or|also known as|versus|instead|actually)\b/i.test(v)||key(v).split(' ').some((w,i,a)=>i>0&&w===a[i-1])))issues.push({code:'CONFLICTING_CRITICAL_VALUES',field:field.name,message:'Confirm one exact name.'});
 if(field.type==='record'){
  const list=(context.records?.[field.store]||(field.store==='customers'?context.customers:[])||[]).filter(x=>x&&typeof x.id==='string'&&(!x.businessId||x.businessId===(context.businessId||'local-business')));
  const search=key(v),exact=list.filter(x=>x.id===v||key(x.name)===search),matches=exact.length?exact:list.filter(x=>search&&(' '+key(x.name)+' ').includes(' '+search+' '));
  if(matches.length===1)parsed={store:field.store,id:matches[0].id};else{parsed=null;issues.push({code:matches.length?'AMBIGUOUS_RECORD':'RECORD_NOT_FOUND',field:field.name,message:matches.length?'Choose one verified record.':'No supplied record matches this identity.',candidates:matches.map(x=>({store:field.store,id:x.id}))})}
 }
 if(field.type==='phone'){
  const digitWords={zero:'0',oh:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9'},words=key(v).split(' ');let digits=/^[+\d\s().-]+$/.test(v)?v.replace(/\D/g,''):words.every(w=>Object.hasOwn(digitWords,w))?words.map(w=>digitWords[w]).join(''):'';
  if(digits.length===11&&digits[0]==='1')digits=digits.slice(1);if(digits.length===10&&/[2-9]/.test(digits[0])&&/[2-9]/.test(digits[3]))parsed='+1'+digits;else{parsed=v;issues.push({code:'INVALID_PHONE',field:field.name,message:'Supply a complete US phone number; ambiguous words and missing digits cannot be repaired.'})}
 }
 if(field.type==='money'){
  const matches=[...v.matchAll(/(?:[$£€]\s*)?\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:dollars?|usd|euros?|pounds?))?/gi)];
  if(matches.length!==1||!/^(?:[$£€]\s*)?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?(?:\s*(?:dollars?|usd|euros?|pounds?))?$/i.test(v)){parsed=null;issues.push({code:'CONFLICTING_OR_UNSUPPORTED_AMOUNT',field:field.name,message:'Confirm one exact numeric amount.'})}else parsed={raw:matches[0][0],decimal:matches[0][0].replace(/[^\d.]/g,'')};
 }
 if(field.type==='identifier'&&/[,;]|\s+or\s+/i.test(v))issues.push({code:'CONFLICTING_CRITICAL_VALUES',field:field.name,message:'Confirm one exact record identifier.'});
 if(field.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T12:00:00Z'))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v))issues.push({code:'AMBIGUOUS_DATE',field:field.name,message:'Resolve the date with the existing business-timezone adapter.'});
 if(field.type==='time'&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v))issues.push({code:'AMBIGUOUS_TIME',field:field.name,message:'Supply an explicit time for the business-timezone adapter.'});
 return {value:parsed,issues,correction:fix};
}
function assign(object,path,value){const bits=path.split('.');let target=object;for(const bit of bits.slice(0,-1))target=Object.hasOwn(target,bit)&&target[bit]&&typeof target[bit]==='object'?target[bit]:(target[bit]={});target[bits.at(-1)]=value}
function extract(tool,text,object,context){const parameters={},evidence=[],issues=[],missing=[];for(const field of tool.language.fields){const values=getValues(field,text,object,tool.language.fields);if(values.length>1){issues.push({code:'CONFLICTING_CRITICAL_VALUES',field:field.name,message:'More than one value was supplied for this field.',values:values.map(x=>x.raw)});continue}if(!values.length){if(field.required)missing.push({field:field.name,reason:'No '+field.name+' was supplied.'});continue}const parsed=parseValue(field,values[0],context);assign(parameters,field.name,parsed.value);issues.push(...parsed.issues);evidence.push({field:field.name,type:field.type,raw:values[0].raw,start:values[0].start,end:values[0].end,correction:parsed.correction});if(field.required&&(parsed.value===null||parsed.value===''))missing.push({field:field.name,reason:'A verified '+field.name+' is required.'})}return {parameters,evidence,issues,missing}}
function editsText(text,edits){for(const e of [...edits].sort((a,b)=>b.start-a.start))text=text.slice(0,e.start)+e.term+text.slice(e.end);return text}
function createEngine({tools=[]}={}){
 if(!Array.isArray(tools)||tools.length>80||new Set(tools.map(t=>t.id)).size!==tools.length)throw Error('Use at most 80 uniquely identified speech tools');const registered=tools.map(validateTool);
 function rankSingle(text,context={}){
  if(typeof text!=='string'||!text.trim()||text.length>8000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))return {status:'unsupported',candidates:[],safety:[{code:'INVALID_INPUT',message:'Supply 1–8000 transcript characters.'}],criticalSpans:[],normalizations:[]};
  const protectedSpans=criticalSpans(text),globalIssues=safety(text),view=grammarTokens(text),tokens=view.tokens;if(tokens.length>512)return {status:'unsupported',candidates:[],safety:[{code:'INPUT_LIMIT',message:'Split this request into shorter instructions.'}],criticalSpans:protectedSpans,normalizations:view.normalizations};
  const candidates=[];
  for(const tool of registered){
   const l=tool.language,actions=matchAt(tokens,0,l.actions,protectedSpans,'action');if(!actions.length)continue;const action=actions[0];let index=action.count;while(stop.has(tokens[index]?.key))index++;
   // Repetition is safe only inside the structural action/article prefix.
   if(tokens[index]?.key===tokens[0]?.key&&action.count===1){index++;while(stop.has(tokens[index]?.key))index++}
   let objects=matchAt(tokens,index,l.objects,protectedSpans,'object');if(!objects.length&&l.mode!=='instruction')for(let i=index+1;i<Math.min(tokens.length,index+5);i++){if(['for','named','called','name','phone','number','address'].includes(tokens[i-1]?.key))break;objects.push(...matchAt(tokens,i,l.objects,protectedSpans,'object'))}
   if(!objects.length)continue;objects.sort((a,b)=>b.score-a.score||a.start-b.start);const object=objects[0];
   const query=/^(?:what|which|when|how|do|does|have|is|are|check|show|list|tell)\b/i.test(tokens.map(t=>t.key).join(' '));if(l.mode==='query'&&!query||l.mode==='instruction'&&query&&!l.actions.some(a=>/^(?:show|list|check)\b/.test(a)))continue;
   const extracted=extract(tool,text,object,context),edits=[action,object].filter(x=>x.method!=='exact'),fuzzy=edits,actionFuzzy=fuzzy.some(x=>x.role==='action');
   const pageSupport=(l.contexts||[]).includes(context.sourcePage),recordSupport=extracted.evidence.some(e=>e.type==='record')&&!extracted.issues.some(i=>['AMBIGUOUS_RECORD','RECORD_NOT_FOUND'].includes(i.code)),dateSupport=/\b(?:today|tomorrow|\d{4}-\d{2}-\d{2})\b/i.test(text)&&/^\d{4}-\d{2}-\d{2}$/.test(context.today||'');
   const exactAnchor=action.method==='exact'||object.method==='exact',supported=exactAnchor&&(pageSupport||recordSupport||dateSupport),issues=[...globalIssues,...extracted.issues];
   if(fuzzy.length&&(!supported||actionFuzzy||['draft','proposes_modification'].includes(tool.effect)))issues.push({code:'UNCERTAIN_SPEECH_CANDIDATE',message:'A plausible vocabulary match needs review; critical data was not rewritten.'});
   const fieldWords=new Set(l.fields.flatMap(f=>(f.markers||[]).flatMap(m=>key(m).split(' ')))),grammar=new Set(['do','does','i','we','you','have','got','any','anything','my','our','a','an','the','me','about','please','just','is','his','her','their']);
   const leftovers=tokens.filter(t=>!(t.start>=action.start&&t.end<=action.end)&&!(t.start>=object.start&&t.end<=object.end)&&!extracted.evidence.some(e=>t.start>=e.start&&t.end<=e.end)&&!fieldWords.has(t.key)&&!grammar.has(t.key));
   if(leftovers.length&&!l.allowContextTail)issues.push({code:'UNPARSED_DETAILS',message:'Some supplied details are outside the registered parameter schema. Clarify before using this interpretation.',words:leftovers.map(t=>t.text)});
   const score=Math.min(.99,action.score*.44+object.score*.44+(pageSupport?.06:0)+(recordSupport?.06:0)+(dateSupport?.03:0));
   candidates.push({intent:tool.id,effect:tool.effect,score:Number(score.toFixed(4)),accepted:!issues.length&&!extracted.missing.length,parameters:extracted.parameters,missingInformation:extracted.missing,issues,evidence:extracted.evidence,normalizations:edits.map(x=>({from:x.from,to:x.term,scope:'structural_'+x.role,method:x.method,start:x.start,end:x.end})),normalizedTranscript:editsText(text,edits),contextEvidence:{pageSupport,recordSupport,dateSupport,exactAnchor},requiresAuthorization:tool.effect==='proposes_modification'});
  }
  candidates.sort((a,b)=>b.score-a.score||a.intent.localeCompare(b.intent));const selected=candidates[0],runner=candidates[1],tied=!!runner&&selected.score-runner.score<.06;if(tied){selected.accepted=false;selected.issues.push({code:'AMBIGUOUS_TOOL',message:'Several registered tools fit this request; choose the intended action.'})}
  return {version:1,status:!selected?'unsupported':tied?'ambiguous':selected.accepted?'recognized':'needs_clarification',candidates:candidates.slice(0,12),safety:globalIssues,criticalSpans:protectedSpans,normalizations:view.normalizations,confidenceMethod:'contextual_rules_not_probability'};
 }
 function rankCandidates(text,context={}){let c;try{if(!context||typeof context!=='object'||Array.isArray(context))throw Error();c=freeze(clone(context))}catch{return {status:'unsupported',candidates:[],safety:[{code:'INVALID_CONTEXT',message:'Supply serializable local context.'}],criticalSpans:[],normalizations:[]}}return rankSingle(text,c)}
 return Object.freeze({version:1,rankCandidates,tools:freeze(registered.map(({id,effect,language})=>({id,effect,language})))});
}
return Object.freeze({version:1,createEngine,similarity,phonetic,criticalSpans,inspectTranscript:text=>({safety:safety(text),criticalSpans:criticalSpans(text)}),concepts});
});
