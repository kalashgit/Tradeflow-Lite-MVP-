(function(root,factory){
 'use strict';
 var api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowRecordInterpreter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 var FIELDS=Object.freeze(['name','phone','email','address','company','notes']);
 var LIMITS=Object.freeze({name:200,phone:80,email:254,address:500,company:200,notes:4000});
 var own=function(o,k){return Object.prototype.hasOwnProperty.call(o,k)};
 function issue(field,code,message,blocking){return {field:field,code:code,message:message,blocking:!!blocking}}
 function emptyFields(){return {name:'',phone:'',email:'',address:'',company:'',notes:''}}
 function text(value){return typeof value==='string'?value.trim():''}
 function copy(value){return JSON.parse(JSON.stringify(value))}
 function unique(values){return Array.from(new Set(values.filter(Boolean)))}
 function key(value){return text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
 function normalizePhone(value){
  if(typeof value!=='string')return {value:'',valid:false,empty:false,error:'Enter the phone number as text.'};
  var raw=value.trim();
  if(!raw)return {value:'',valid:true,empty:true};
  if(!/^[+\d\s().-]+$/.test(raw)||/\+.+\+/.test(raw)||(/\+/.test(raw)&&raw[0]!=='+'))return {value:raw,valid:false,empty:false,error:'Use a U.S. phone number with 10 digits, optionally prefixed by +1. Extensions and number words need review.'};
  var digits=raw.replace(/\D/g,'');
  if(digits.length===11&&digits[0]==='1')digits=digits.slice(1);
  if(digits.length!==10||!/[2-9]/.test(digits[0]||'')||!/[2-9]/.test(digits[3]||'')||(raw[0]==='+'&&!/^\+1(?:\D|\d)/.test(raw)))return {value:raw,valid:false,empty:false,error:'Enter a valid U.S. phone number including its area code; missing digits cannot be inferred.'};
  return {value:'+1'+digits,valid:true,empty:false};
 }
 function validateCustomer(input){
  var fields=emptyFields(),issues=[];
  if(!input||typeof input!=='object'||Array.isArray(input))return {fields:fields,issues:[issue(null,'INVALID_FIELDS','Customer fields must be an object.',true),issue('name','REQUIRED','Enter the customer name.',true)],missingRequired:['name']};
  Object.keys(input).forEach(function(field){
   if(!FIELDS.includes(field)){issues.push(issue(field,'UNSUPPORTED_FIELD','This customer field is not supported.',true));return}
   if(typeof input[field]!=='string'){issues.push(issue(field,'INVALID_TYPE','Enter '+field+' as text.',true));return}
   fields[field]=input[field].trim();
   if(fields[field].length>LIMITS[field])issues.push(issue(field,'TOO_LONG','The '+field+' field exceeds '+LIMITS[field]+' characters. Shorten it before saving.',true));
   if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(fields[field])||(field!=='notes'&&/[\r\n]/.test(fields[field])))issues.push(issue(field,'INVALID_CHARACTERS','Remove unsupported control characters from '+field+'.',true));
  });
  var missingRequired=fields.name?[]:['name'];
  if(!fields.name)issues.push(issue('name','REQUIRED','Enter the customer name.',true));
  var phone=normalizePhone(fields.phone);if(phone.valid)fields.phone=phone.value;else issues.push(issue('phone','INVALID_PHONE',phone.error,true));
  if(fields.email){fields.email=fields.email.toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))issues.push(issue('email','INVALID_EMAIL','Enter a complete email address or leave it blank.',true))}
  return {fields:fields,issues:issues,missingRequired:missingRequired};
 }
 function findDuplicates(fields,customers,options){
  options=options||{};var name=key(fields&&fields.name),email=text(fields&&fields.email).toLowerCase(),phone=normalizePhone(text(fields&&fields.phone)),byId=new Map();
  (Array.isArray(customers)?customers:[]).forEach(function(customer){
   if(!customer||typeof customer!=='object'||!customer.id)return;
   if(options.businessId&&customer.businessId&&customer.businessId!==options.businessId)return;
   var legacyPhone=typeof customer.phone==='number'&&Number.isSafeInteger(customer.phone)?String(customer.phone):text(customer.phone),reasons=[],oldPhone=normalizePhone(legacyPhone);
   if(phone.valid&&!phone.empty&&oldPhone.valid&&phone.value===oldPhone.value)reasons.push('same_phone');
   if(email&&email===text(customer.email).toLowerCase())reasons.push('same_email');
   if(name&&name===key(customer.name))reasons.push('same_name');
   if(!reasons.length)return;
   var id=String(customer.id),existing=byId.get(id);
   if(existing)existing.reasons=unique(existing.reasons.concat(reasons));
   else byId.set(id,{ref:{store:'customers',id:id},name:text(customer.name),reasons:reasons});
  });
  return Array.from(byId.values()).sort(function(a,b){return a.ref.id<b.ref.id?-1:a.ref.id>b.ref.id?1:0});
 }
 function unsupported(message,code){return {version:1,intent:null,status:'unsupported',draft:null,issues:[issue(null,code||'UNSUPPORTED',message||'Try “Add customer John Smith, phone 512-555-0198.”',true)],missingRequired:[],duplicates:[],relatedDrafts:[],clarification:message||'Try “Add customer John Smith, phone 512-555-0198.”'}}
 function review(fields,extractionIssues,relatedDrafts,options){
  options=options||{};var validated=validateCustomer(fields),issues=(extractionIssues||[]).concat(validated.issues),duplicates=findDuplicates(validated.fields,options.customers,{businessId:options.context&&options.context.businessId});
  if(duplicates.length)issues.push(issue(null,'POSSIBLE_DUPLICATE','A customer with a matching name, phone or email already exists. Review the matches before creating another record.',false));
  var blocking=issues.find(function(x){return x.blocking});
  return {version:1,intent:'customer.create',status:blocking?'needs_clarification':'needs_review',draft:{kind:'customer',fields:validated.fields},issues:issues,missingRequired:validated.missingRequired,duplicates:duplicates,relatedDrafts:relatedDrafts||[],clarification:blocking?blocking.message:null};
 }
 // Supported patterns are deliberately explicit. No model, network, dates or contact facts are inferred.
 var STOP=/\s*(?:[;\n]|[.!?](?:\s|$)|,\s*(?=(?:and\s+)?(?:(?:his|her|their|the|he|she|they)\s+)?(?:[+\d]|phone\b|mobile\b|telephone\b|cell(?:phone)?\b|number\b|email\b|e-mail\b|address\b|location\b|company\b|name\b|needs?\b|wants?\b|create\b|prepare\b|schedule\b|add\b|make\b))|\s+(?:and\s+|with\s+)?(?:(?:his|her|their|the)\s+)?(?:phone|mobile|telephone|cell(?:phone)?|number|email|e-mail|address|location|company|name)\s*(?:number\b|name\b|is\b|:|=|(?=[+\d]))|\s+(?=\+?\d[\d\s().-]{6,}\d(?:\s|$))|\s+(?:and\s+)?(?:he|she|they)\s+(?:needs?|wants?|lives?|works?|is\s+based)\b|\s+(?:located|based|lives?)\s+(?:in|at)\b|\s+(?:needs?|wants?)\b|\s+(?:and\s+)?(?:create|prepare|schedule|add|make)\s+(?:an?\s+)?(?:task|job|event|appointment)\b)/i;
 function cleanFragment(value){
  var result=text(value).replace(/^(?:and\s+|but\s+)/i,'').replace(/[\s,;.!?]+$/,'').trim();
  if((result[0]==='"'&&result.endsWith('"'))||(result[0]==="'"&&result.endsWith("'"))||(result[0]==='“'&&result.endsWith('”')))result=result.slice(1,-1).trim();
  return result;
 }
 function fragment(value){
  var raw=text(value),first=raw[0],closing=first==='“'?'”':first;
  if(['"',"'",'“'].includes(first)){
   var close=-1;
   for(var n=1;n<raw.length;n++)if(raw[n]===closing&&(n===raw.length-1||/[\s,;.!?]/.test(raw[n+1]))){close=n;break}
   if(close>0)return cleanFragment(raw.slice(1,close));
  }
  var protectedInitials=raw.replace(/\b([A-Z])\.(?=\s+[A-Z][a-z])/g,'$1\uE000');
  var stop=protectedInitials.search(STOP);return cleanFragment((stop<0?protectedInitials:protectedInitials.slice(0,stop)).replace(/\uE000/g,'.'));
 }
 function labelValues(input,regex){var values=[],match;while((match=regex.exec(input)))values.push(fragment(input.slice(match.index+match[0].length)));return values.filter(Boolean)}
 function choose(field,values,issues){
  var distinct=unique(values.map(cleanFragment));
  if(distinct.some(function(value){return /\b(?:or|versus|maybe|possibly|actually|correction|instead)\b/i.test(value)})){
   issues.push(issue(field,'AMBIGUOUS_'+field.toUpperCase(),'Confirm one '+field+' value before saving.',true));return '';
  }
  if(distinct.length>1){issues.push(issue(field,'AMBIGUOUS_'+field.toUpperCase(),'More than one '+field+' was supplied. Confirm which one to use.',true));return ''}
  return distinct[0]||'';
 }
 function explicitRelated(input,fields,issues){
  var drafts=[],pattern=/\b(?:create|prepare|add|make|schedule)\s+(?:an?\s+)?(task|job|event|appointment)\b\s*(?:(?:to|for|called|named|titled)\s+)?/gi,match;
  while((match=pattern.exec(input))){
   var kind=match[1].toLowerCase(),rest=input.slice(pattern.lastIndex),next=rest.search(/\s+(?:and\s+)?(?:create|prepare|add|make|schedule)\s+(?:an?\s+)?(?:task|job|event|appointment)\b/i);if(next>=0)rest=rest.slice(0,next);
   var end=rest.search(/[.!?](?:\s|$)|[;\n]/);if(end>=0)rest=rest.slice(0,end);
   var title=cleanFragment(rest.replace(/\s+(?:on\s+)?\d{4}-\d{2}-\d{2}(?:\s+(?:at\s+)?\d{1,2}:\d{2})?\s*$/,'')),dateMatch=rest.match(/\b(\d{4}-\d{2}-\d{2})\b/),timeMatch=rest.match(/\b(?:at\s+)?([01]\d|2[0-3]):([0-5]\d)\b/),date='';
   if(dateMatch){var d=new Date(dateMatch[1]+'T12:00:00Z');if(Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===dateMatch[1])date=dateMatch[1];else issues.push(issue(null,'INVALID_RELATED_DATE','The related draft date is invalid. Review it separately.',false))}
   var fieldsOut,missing;
   if(kind==='task'){fieldsOut={title:title,customerId:'',due:date,status:'Open'};missing=['customerId'].concat(title?[]:['title']).concat(date?[]:['due'])}
   else if(kind==='job'){fieldsOut={title:title,customerId:'',category:'',status:'Planned',date:date};missing=['customerId','category'].concat(title?[]:['title'])}
   else {kind='calendar';fieldsOut={title:title,customerId:'',date:date,time:timeMatch?timeMatch[1]+':'+timeMatch[2]:'',durationMinutes:'',location:fields.address,notes:''};missing=['customerId','durationMinutes'].concat(title?[]:['title']).concat(date?[]:['date']).concat(timeMatch?[]:['time'])}
   drafts.push({kind:kind,fields:fieldsOut,missingRequired:missing,requiresReview:true});
  }
  return drafts;
 }
 function interpretCustomer(input,options){
  if(typeof input!=='string')return unsupported('Enter or paste the customer information as text.','INVALID_INPUT');
  var source=input.trim();if(!source)return unsupported('Enter the customer information first.','EMPTY_INPUT');
  if(source.length>8000)return unsupported('This instruction is too long. Use 8,000 characters or fewer.','INPUT_TOO_LONG');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source))return unsupported('Remove unsupported control characters from the instruction.','INVALID_INPUT');
  var start=/^(?:please\s+)?(?:add|create|save|register)\s+(?:an?\s+)?(?:new\s+)?(?:customer|client)\b\s*(?:(?:called|named|for)\s+)?/i.exec(source),reverse=/^(?:please\s+)?(?:add|create|save|register)\s+(.+?)\s+as\s+(?:an?\s+)?(?:new\s+)?(?:customer|client)\b/i.exec(source);
  if(!start&&!reverse)return unsupported();
  var fields=emptyFields(),issues=[],nameValues=[];
  if(start){var remaining=source.slice(start[0].length),explicitNameLead=/^(?:(?:his|her|their|the\s+customer(?:'s)?)\s+)?name\s*(?:is\b|:|=)/i.test(remaining.trim()),initial=explicitNameLead?'':fragment(remaining);if(initial&&!/^(?:his|her|their|the)\s+(?:name|number|phone|email|address)\b|^(?:name|number|phone|email|address|location|company)\b|^(?:he|she|they)\b|^with\b/i.test(initial)){
   if(!/^["'“]/.test(remaining.trim())&&initial.includes(',')){initial=initial.split(',')[0].trim();issues.push(issue(null,'UNRECOGNIZED_DETAILS','Some wording was not recognized. Rephrase those details or enter them in Notes.',true))}
   nameValues.push(initial);
  }}
  else nameValues.push(cleanFragment(reverse[1]));
  nameValues=nameValues.concat(labelValues(source,/\b(?:(?:his|her|their|customer'?s|client'?s)\s+)?name\s*(?:is\b|:|=)\s*/gi));
  fields.name=choose('name',nameValues,issues);
  if((source.match(/\b(?:add|create|save|register)\s+(?:an?\s+)?(?:new\s+)?(?:customer|client)\b/gi)||[]).length>1){fields.name='';issues.push(issue('name','AMBIGUOUS_NAME','More than one customer was requested. Prepare one customer at a time.',true))}
  var numeric=source.match(/(?<![\p{L}\p{N}@])\+?\d[\d\s().-]{4,}\d(?![\p{L}\p{N}@])/gu)||[],phones=numeric.filter(function(value){return value.replace(/\D/g,'').length>=7&&!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())&&!/^\d{1,2}[./]\d{1,2}[./]\d{4}$/.test(value.trim())});
  var phoneLabels=labelValues(source,/\b(?:(?:his|her|their|the|customer'?s)\s+)?(?:phone|mobile|cell(?:phone)?|telephone|number)(?:\s+number)?\s*(?:is\b|:|=)?\s*/gi);
  phoneLabels.forEach(function(value){var candidate=value.split(/\s+(?:and|or|but)\s+/i)[0].trim();if(candidate&&(!/^[+\d\s().-]+$/.test(candidate)||candidate.replace(/\D/g,'').length<7)){phones=phones.filter(function(phone){return !candidate.includes(phone.trim())});phones.push(candidate)}});
  var normalized=phones.map(function(value){var result=normalizePhone(value);return result.valid?result.value:cleanFragment(value)});
  fields.phone=choose('phone',normalized,issues);
  var emails=source.match(/[^\s,;:"<>]+@[^\s,;:"<>]+/g)||[];
  emails=emails.map(function(value){return value.replace(/[.!?]+$/,'').toLowerCase()});
  var emailLabels=labelValues(source,/\b(?:e-?mail)(?:\s+address)?\s*(?:is\b|:|=)?\s*/gi);
  emailLabels.forEach(function(value){if(!value.includes('@'))emails.push(value)});
  fields.email=choose('email',emails,issues);
  var addresses=labelValues(source,/\b(?:address|location)(?:(?:\s+is\b|:|=)\s*|\s+)/gi).concat(labelValues(source,/\b(?:lives?|located|based)\s+(?:in|at)\s+/gi));
  if(!addresses.length){var location=/\b(?:needs?|wants?)\b[^.!?;\n]*?\s+(?:in|at)\s+([^.!?;\n]+)/i.exec(source);if(location)addresses.push(fragment(location[1]))}
  fields.address=choose('address',addresses,issues);
  if(fields.address&&!/^\d+\s+\S/.test(fields.address))issues.push(issue('address','LOCALITY_ONLY','Location was provided without a verified street address. Keep it as supplied or add the address.',false));
  fields.company=choose('company',labelValues(source,/\bcompany(?:\s+name)?\s*(?:is\b|:|=)\s*/gi).concat(labelValues(source,/\bworks?\s+for\s+/gi)),issues);
  var noteValues=labelValues(source,/\bnotes?\s*(?:is\b|:|=)\s*/gi),work=/\b(?:(?:he|she|they|the\s+customer)\s+)?(?:needs?|wants?)\s+[^.!?;\n]+/gi,workMatch;
  while((workMatch=work.exec(source))){var actual=workMatch[0].split(/\s+(?:and\s+)?(?:create|prepare|add|make|schedule)\s+(?:an?\s+)?(?:task|job|event|appointment)\b/i)[0];if(actual)noteValues.push(cleanFragment(actual))}
  fields.notes=unique(noteValues).join('\n');
  var uncertainty=/\b(?:maybe|possibly|not\s+sure|unsure|might\s+be|i\s+think)\b/i.exec(source);
  if(uncertainty){var preceding=source.slice(Math.max(0,uncertainty.index-45),uncertainty.index),uncertainField=/\b(?:phone|mobile|number)\b/i.test(preceding)?'phone':/\be-?mail\b/i.test(preceding)?'email':/\b(?:address|location)\b/i.test(preceding)?'address':/\bcompany\b/i.test(preceding)?'company':/\b(?:notes?|needs?|wants?)\b/i.test(preceding)?'notes':'name';issues.push(issue(uncertainField,'UNCERTAIN_INFORMATION','Some information was described as uncertain. Confirm the '+uncertainField+' before saving.',true))}
  if(/\b(?:ignore|disregard|override|delete|remove|send|email\s+(?:him|her|them)|charge|invoice|book|confirm)\b/i.test(source))issues.push(issue(null,'UNSUPPORTED_ACTION','Only a customer draft and explicitly requested related drafts can be prepared here. Remove or clarify the other action.',true));
  var relatedDrafts=explicitRelated(source,fields,issues);
  // Unmatched sentences cannot become invisible facts. The user can rephrase or enter them as notes.
  var sentences=source.replace(/\b([A-Z])\.(?=\s+[A-Z][a-z])/g,'$1\uE000').split(/(?<=[.!?])\s+|[;\n]+/).map(function(sentence){return sentence.replace(/\uE000/g,'.').trim()}).filter(Boolean);
  var unknown=sentences.slice(1).some(function(sentence){return !/^(?:and\s+)?(?:(?:his|her|their|the\s+customer|he|she|they|the)\s+)?(?:phone|mobile|number|cell|telephone|e-?mail|address|location|company|name|notes?|needs?|wants?|lives?|located|based|works?|create|prepare|add|make|schedule)\b/i.test(sentence)});
  var suppliedValues=Object.values(fields).concat(relatedDrafts.map(function(draft){return draft.fields.title})).filter(Boolean).map(function(value){return value.toLowerCase()});
  unknown=unknown||sentences.flatMap(function(sentence){return sentence.split(/,\s+|\s+and\s+|\s+then\s+/i).slice(1)}).some(function(clause){
   var part=cleanFragment(clause).replace(/^["'“”]+|["'“”]+$/g,'').toLowerCase();if(!part)return false;
   if(suppliedValues.some(function(value){return value.includes(part)}))return false;
   if(normalizePhone(part).valid&&!normalizePhone(part).empty)return false;
   return !/^(?:and\s+)?(?:(?:his|her|their|the\s+customer|he|she|they|the)\s+)?(?:phone|mobile|number|cell|telephone|e-?mail|address|location|company|name|notes?|needs?|wants?|lives?|located|based|works?|create|prepare|add|make|schedule)\b/i.test(part);
  });
  if(unknown)issues.push(issue(null,'UNRECOGNIZED_DETAILS','Some wording was not recognized. Rephrase those details or enter them in Notes.',true));
  return review(fields,issues,relatedDrafts,options);
 }
 function correctCustomer(previous,changes,options){
  if(!previous||previous.intent!=='customer.create'||!previous.draft||previous.draft.kind!=='customer')return unsupported('Start a customer draft before correcting a field.','INVALID_REVIEW');
  if(!changes||typeof changes!=='object'||Array.isArray(changes))return review(previous.draft.fields,[issue(null,'INVALID_CORRECTION','Choose a customer field and enter its corrected value.',true)],previous.relatedDrafts||[],options);
  var fields=Object.assign({},previous.draft.fields),changed=Object.keys(changes),extra=[];
  changed.forEach(function(field){if(FIELDS.includes(field))fields[field]=changes[field];else extra.push(issue(field,'UNSUPPORTED_FIELD','This customer field is not supported.',true))});
  var validationCodes=['REQUIRED','INVALID_TYPE','INVALID_CHARACTERS','TOO_LONG','INVALID_PHONE','INVALID_EMAIL','POSSIBLE_DUPLICATE','UNSUPPORTED_FIELD'];
  var retained=(previous.issues||[]).filter(function(item){return item&&(!item.field||!changed.includes(item.field))&&!validationCodes.includes(item.code)});
  if(changed.includes('notes'))retained=retained.filter(function(item){return item.code!=='UNRECOGNIZED_DETAILS'});
  // Explicit field corrections resolve general uncertainty only after every affected value is reviewed.
  if(changed.length===FIELDS.length&&FIELDS.every(function(field){return changed.includes(field)}))retained=retained.filter(function(item){return item.code!=='UNCERTAIN_INFORMATION'});
  return review(fields,retained.concat(extra),copy(previous.relatedDrafts||[]),options);
 }
 function createInterpreter(config){
  config=config||{};var adapters=config.adapters||[],ids=new Set();
  if(!Array.isArray(adapters))throw new TypeError('Interpreter adapters must be an array.');
  adapters.forEach(function(adapter){if(!adapter||typeof adapter.id!=='string'||!adapter.id||typeof adapter.interpret!=='function'||ids.has(adapter.id))throw new TypeError('Each interpreter adapter needs a unique id and interpret function.');ids.add(adapter.id)});
  return Object.freeze({interpret:function(input,options){
   var builtIn=interpretCustomer(input,options);if(builtIn.intent||builtIn.issues.some(function(x){return ['INVALID_INPUT','INPUT_TOO_LONG','EMPTY_INPUT'].includes(x.code)}))return builtIn;
   for(var n=0;n<adapters.length;n++){
    try{var result=adapters[n].interpret(input,options||{});if(result&&result.intent){
     if(result.version!==1||!['needs_review','needs_clarification','unsupported'].includes(result.status)||!result.draft||!result.draft.kind||!result.draft.fields||!Array.isArray(result.issues)||!Array.isArray(result.missingRequired)||!Array.isArray(result.duplicates)||!Array.isArray(result.relatedDrafts))return unsupported('The record interpreter adapter returned an invalid draft.','INVALID_ADAPTER_RESULT');
     return copy({version:1,intent:result.intent,status:result.status,draft:result.draft,issues:result.issues,missingRequired:result.missingRequired,duplicates:result.duplicates,relatedDrafts:result.relatedDrafts,clarification:result.clarification||null});
    }}catch(error){return unsupported('The record interpreter adapter could not prepare a draft.','ADAPTER_ERROR')}
   }
   return builtIn;
  },correct:correctCustomer});
 }
 var interpreter=createInterpreter();
 return Object.freeze({version:1,fields:FIELDS,limits:LIMITS,interpret:interpreter.interpret,correct:correctCustomer,validateCustomer:validateCustomer,findDuplicates:findDuplicates,normalizePhone:normalizePhone,createInterpreter:createInterpreter});
});