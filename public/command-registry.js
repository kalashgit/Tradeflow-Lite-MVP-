/* TradeFlow Pilot Commands v1 — deterministic command boundary; no model or network.
 * Parsing never authorizes execution. Hosts provide authorized snapshots and UI ports.
 * This local-owner capability boundary is not authentication or tenant isolation.
 */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./record-interpreter.js'):root?.TradeFlowRecordInterpreter);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowCommands=api})(typeof globalThis==='object'?globalThis:null,function(records){
'use strict';
const VERSION=1;
const clone=x=>JSON.parse(JSON.stringify(x));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const normalize=x=>String(x??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const text=x=>typeof x==='string'?x.trim():'';
const canonical=x=>JSON.stringify(sort(x));
function sort(x){if(Array.isArray(x))return x.map(sort);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().filter(k=>x[k]!==undefined).map(k=>[k,sort(x[k])]));return x}
const dateText=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const isDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
const rows=(d,s)=>Array.isArray(d?.[s])?d[s]:[];
const terminal=x=>['done','completed','cancelled','canceled'].includes(normalize(x.status));
const stores=['customers','quotes','jobs','tasks','invoices','opportunities','suppliers','calendarEntries'];
const workspaceAliases={home:'dashboard',overview:'dashboard',headquarters:'dashboard',dashboard:'dashboard',map:'map',calendar:'calendar',finance:'expenses',expenses:'expenses',more:'settings',settings:'preferences',customers:'customers',customer:'customers',quotes:'quotes',quote:'quotes',quotations:'quotes',quotation:'quotes',jobs:'jobs',job:'jobs',tasks:'tasks',task:'tasks',invoices:'invoices',invoice:'invoices',suppliers:'suppliers',supplier:'suppliers',opportunities:'opportunities',opportunity:'opportunities','job costing':'profitability',profitability:'profitability','target customers':'growth','marketing studio':'marketing','research briefs':'research',routes:'routes',integrations:'integrations','crew & dispatch':'dispatch'};
const workspaces=[...new Set(Object.values(workspaceAliases))];
const storeAliases={customer:'customers',customers:'customers',quote:'quotes',quotes:'quotes',quotation:'quotes',quotations:'quotes',job:'jobs',jobs:'jobs',task:'tasks',tasks:'tasks',invoice:'invoices',invoices:'invoices',supplier:'suppliers',suppliers:'suppliers',opportunity:'opportunities',opportunities:'opportunities',event:'calendarEntries',events:'calendarEntries'};
const filters={tasks:['all','overdue','open','done'],quotes:['all','open','accepted','stale'],invoices:['all','overdue','unpaid','draft'],calendar:['conflicts','proposals']};
const definitions=freeze([
 {id:'intelligence.review',intent:'Review actual authorized business records',aliases:['review business','review operations'],required:[],parameters:[],effect:'read',permission:'read',approval:'none'},
 {id:'workspace.open',intent:'Open an existing workspace',aliases:['open','go to','show'],required:['workspace'],parameters:['workspace'],effect:'navigation',permission:'navigate',approval:'none'},
 {id:'record.find',intent:'Find existing local records',aliases:['find','search','look for'],required:['query'],parameters:['query','store'],effect:'read',permission:'read',approval:'none'},
 {id:'record.open',intent:'Open one unambiguous existing record',aliases:['open record'],required:['ref or query or context.record'],parameters:['ref','query','store'],effect:'navigation',permission:'read',approval:'none'},
 {id:'view.filter',intent:'Filter a supported existing view',aliases:['show overdue','show open'],required:['workspace','filter'],parameters:['workspace','filter'],effect:'navigation',permission:'navigate',approval:'none'},
 {id:'draft.prepare',intent:'Prepare an unsaved business record for review',aliases:['draft task','draft quote','draft job','draft calendar'],required:['kind'],parameters:['kind','ref','title','fields'],effect:'draft',permission:'draft',approval:'review_on_save'},
 {id:'customer.create',intent:'Create a customer from reviewed structured fields',aliases:['add customer','create customer'],required:['fields'],parameters:['fields','reviewedDuplicateIds','sourceHash'],effect:'modification',permission:'modify:customer.create',approval:'explicit'},
 {id:'customer.source.delete',intent:'Remove locally retained original wording',aliases:[],required:['ref'],parameters:['ref'],effect:'modification',permission:'modify:customer.create',approval:'explicit'},
 {id:'calendar.conflict.reschedule',intent:'Reschedule a standalone conflicting calendar event after owner review',aliases:[],required:['ref','date','time'],parameters:['ref','date','time'],effect:'modification',permission:'modify:calendar.conflict.reschedule',approval:'explicit'},
 {id:'invoice.followup.schedule',intent:'Schedule an approved internal overdue invoice follow-up',aliases:[],required:['ref','due'],parameters:['ref','due'],effect:'modification',permission:'modify:invoice.followup.schedule',approval:'explicit'},
 {id:'quotation.followup.schedule',intent:'Schedule a reviewed internal follow-up task for a sent quotation',aliases:[],required:['ref','due'],parameters:['ref','due'],effect:'modification',permission:'modify:quotation.followup.schedule',approval:'explicit'},
 {id:'quotation.convert',intent:'Create a linked job from an accepted quotation',aliases:['convert quote to job'],required:['ref or context.record'],parameters:['ref'],effect:'modification',permission:'modify:quotation.convert',approval:'explicit'}
]);
const definition=id=>definitions.find(x=>x.id===id);
function problem(code,message,extra={}){return {status:'invalid',error:{code,message},...extra}}
function parse(input){
 if(typeof input!=='string'){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['commandId','params'].includes(k)))return problem('INVALID_REQUEST','Use a commandId and parameters; authorization is a separate explicit step.');
  if(!definition(input.commandId))return {status:'unsupported',error:{code:'UNSUPPORTED_COMMAND',message:'Command is not registered.'}};
  if(input.params!==undefined&&(!input.params||typeof input.params!=='object'||Array.isArray(input.params)))return problem('INVALID_PARAMETERS','Parameters must be an object.');
  try{return {status:'parsed',commandId:input.commandId,params:clone(input.params||{})}}catch{return problem('INVALID_PARAMETERS','Parameters must be serializable record references and values.')}
 }
 const value=text(input);if(!value||value.length>500)return problem('INVALID_TEXT','Enter a command of 1–500 characters.');
 let m;
 if(/^(?:review business|review operations)$/i.test(value))return {status:'parsed',commandId:'intelligence.review',params:{}};
 if(/^(?:draft|prepare)$/i.test(value))return {status:'ambiguous',choices:['draft task','draft quote'],error:{code:'AMBIGUOUS_INTENT',message:'Choose which draft to prepare.'}};
 if((m=value.match(/^(?:show|view) (overdue|open|done|accepted|stale|unpaid|draft|all) (tasks?|quotes?|quotations?|invoices?)$/i)))return {status:'parsed',commandId:'view.filter',params:{workspace:storeAliases[normalize(m[2])],filter:normalize(m[1])}};
 if((m=value.match(/^(?:show|view) (?:calendar )?(conflicts|proposals)$/i)))return {status:'parsed',commandId:'view.filter',params:{workspace:'calendar',filter:normalize(m[1])}};
 if((m=value.match(/^(?:draft|prepare) (task|quote|quotation)(?: (?:for )?(customer|quote|quotation|job|task) (.+))?$/i)))return {status:'parsed',commandId:'draft.prepare',params:{kind:normalize(m[1])==='task'?'task':'quote',...(m[2]?{ref:{store:storeAliases[normalize(m[2])],id:text(m[3])}}:{})}};
 if((m=value.match(/^convert (?:quote|quotation) (.+) to (?:a )?job$/i)))return {status:'parsed',commandId:'quotation.convert',params:{ref:{store:'quotes',id:text(m[1])}}};
 if((m=value.match(/^(?:find|search|look for) (.+)$/i))){const scoped=m[1].match(/^(customers?|quotes?|quotations?|jobs?|tasks?|invoices?|suppliers?|opportunities|opportunity|events?) (.+)$/i);return {status:'parsed',commandId:'record.find',params:scoped?{store:storeAliases[normalize(scoped[1])],query:text(scoped[2])}:{query:text(m[1])}}}
 if((m=value.match(/^(?:open|go to|show) (.+)$/i))){const destination=workspaceAliases[normalize(m[1])];if(destination)return {status:'parsed',commandId:'workspace.open',params:{workspace:destination}};if(normalize(m[1])==='this record')return {status:'parsed',commandId:'record.open',params:{}};const scoped=m[1].match(/^(customer|quote|quotation|job|task|invoice|supplier|opportunity|event) (.+)$/i);return {status:'parsed',commandId:'record.open',params:scoped?{store:storeAliases[normalize(scoped[1])],query:text(scoped[2])}:{query:text(m[1])}}}
 return {status:'unsupported',error:{code:'UNSUPPORTED_TEXT',message:'Use a registered command. Free-form instructions, sending and approval by text are not supported.'}};
}
function validRef(ref){return !!ref&&typeof ref==='object'&&!Array.isArray(ref)&&Object.keys(ref).every(k=>['store','id'].includes(k))&&stores.includes(ref.store)&&!!text(ref.id)&&ref.id.length<=160}
function lookup(data,ref,context={}){
 if(!validRef(ref))throw Error('Invalid record reference');
 const matches=rows(data,ref.store).filter(r=>r.id===ref.id);
 if(matches.length!==1)throw Error(matches.length?'Duplicate record identifier requires review':'Referenced record no longer exists');
 const record=matches[0];
 if(record.businessId&&record.businessId!==(context.businessId||'local-business'))throw Error('Record is outside the current business scope');
 return record;
}
function validateReferences(data,refs,context={}){
 const checked=new Map();
 function visit(ref){const key=ref.store+':'+ref.id;if(checked.has(key))return;const record=lookup(data,ref,context);checked.set(key,{ref:clone(ref),record});
  const links={customerId:'customers',jobId:'jobs',quoteId:'quotes',opportunityId:'opportunities',supplierId:'suppliers'};
  for(const [field,store] of Object.entries(links))if(record[field])visit({store,id:record[field]});
  if(record.sourceId&&record.sourceKind&&record.sourceKind!=='event'){const store=storeAliases[normalize(record.sourceKind)];if(!store)throw Error('Unsupported linked source type');visit({store,id:record.sourceId})}
  for(const field of ['jobId','quoteId'])if(record[field]){const linked=lookup(data,{store:links[field],id:record[field]},context);if(record.customerId&&linked.customerId&&record.customerId!==linked.customerId)throw Error('Linked records belong to different customers')}
 }
 refs.forEach(visit);return [...checked.values()].sort((a,b)=>(a.ref.store+':'+a.ref.id).localeCompare(b.ref.store+':'+b.ref.id));
}
function findRecords(data,query,store,context={}){
 const q=normalize(query);if(!q)return [];
 const result=[];
 for(const type of store?[store]:stores)for(const r of rows(data,type)){
  if(r.businessId&&r.businessId!==(context.businessId||'local-business'))continue;
  const name=String(r.name||r.title||r.project_name||r.organization_name||r.reference||r.id||'');
  const fields=[r.id,name,r.company,r.organization_name,r.reference].map(normalize);
  if(fields.some(x=>x.includes(q)))result.push({ref:{store:type,id:r.id},label:name,exact:fields.some(x=>x===q)});
 }
 return result.sort((a,b)=>Number(b.exact)-Number(a.exact)||a.label.localeCompare(b.label)||canonical(a.ref).localeCompare(canonical(b.ref)));
}
function staleQuote(record,asOf,days=14){
 if(normalize(record.status)!=='sent'||!isDate(record.sentDate))return false;
 const dates=[record.sentDate,record.lastFollowUpAt,record.lastContactAt].filter(Boolean).map(x=>String(x).slice(0,10));
 if(dates.some(x=>!isDate(x)))return false;
 const latest=dates.sort().at(-1);return latest<=asOf&&(Date.parse(asOf+'T12:00:00Z')-Date.parse(latest+'T12:00:00Z'))/86400000>=days;
}
function filterRecords(workspace,filter,data,options={}){
 const asOf=options.today||dateText(new Date()),threshold=Number.isFinite(options.staleQuoteDays)?Math.max(1,options.staleQuoteDays):14;
 return rows(data,workspace).filter(r=>{
  if(filter==='all')return true;
  if(workspace==='tasks')return filter==='done'?terminal(r):filter==='open'?!terminal(r):filter==='overdue'?!terminal(r)&&isDate(r.due)&&r.due<asOf:false;
  if(workspace==='quotes')return filter==='accepted'?normalize(r.status)==='accepted':filter==='open'?normalize(r.status)==='sent':filter==='stale'?staleQuote(r,asOf,threshold):false;
  return false;
 });
}
function prepareDraft(kind,ref,data,context={},title,overrides){
 if(!['task','quote','job','calendar'].includes(kind))throw Error('Unsupported record draft');
 const sources=ref?validateReferences(data,[ref],context):[];
 const source=ref?lookup(data,ref,context):null;
 if(ref&&!['customers','quotes','jobs','tasks','opportunities'].includes(ref.store))throw Error('This record cannot supply draft defaults');
 const customerId=ref?.store==='customers'?source.id:source?.customerId||'';
 const fields=kind==='task'?{status:'Open',due:context.today||dateText(new Date())}:kind==='job'?{status:'Planned',category:context.primaryTrade||'',date:''}:kind==='calendar'?{date:'',time:'',durationMinutes:'',location:'',notes:''}:{status:'Draft',category:context.primaryTrade||'',amount:''};
 if(overrides!==undefined){
  const allowed=kind==='task'?['title','due']:kind==='job'?['title','category','date']:kind==='calendar'?['title','date','time','durationMinutes','location','notes']:['title','category'];
  if(!overrides||typeof overrides!=='object'||Array.isArray(overrides)||Object.keys(overrides).some(k=>!allowed.includes(k))||Object.values(overrides).some(v=>typeof v!=='string'))throw Error('Unsupported draft fields');
  for(const [key,value] of Object.entries(overrides)){if(value.length>(key==='notes'?1600:key==='location'?220:150))throw Error('Draft field is too long');if(['due','date'].includes(key)&&value&&!isDate(value))throw Error('Enter a valid draft date');if(key==='time'&&value&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))throw Error('Enter a valid draft time');if(key==='durationMinutes'&&value&&(!/^\d+$/.test(value)||Number(value)<15||Number(value)>1440))throw Error('Enter a duration of 15–1440 minutes');fields[key]=value.trim()}
 }
 const defaults={status:'new unsaved draft',...(kind==='task'?{due:'current local date; review before saving'}:{})};
 if(customerId){lookup(data,{store:'customers',id:customerId},context);fields.customerId=customerId;defaults.customerId='linked existing customer'}
 if(kind==='task'&&ref?.store==='jobs'){fields.jobId=source.id;defaults.jobId='source job'}
 if(kind==='task'&&ref?.store==='quotes'){fields.quoteId=source.id;defaults.quoteId='source quotation'}
 if(title)fields.title=text(title);else if(kind==='task'&&!fields.title&&source){fields.title='Review '+String(source.title||source.name||source.project_name||'record');defaults.title='editable review suggestion based on source record'}
 return {kind,fields,sourceRef:ref?clone(ref):null,provenance:defaults,requiresReview:true,recordRefs:sources.map(x=>x.ref)};
}
function validateDraft(draft,data,context={}){
 if(!draft||!['task','quote','job'].includes(draft.kind))throw Error('Unsupported draft');
 const fields=draft.fields||{},refs=[...(draft.sourceRef?[draft.sourceRef]:[]),...(fields.customerId?[{store:'customers',id:fields.customerId}]:[]),...(fields.quoteId?[{store:'quotes',id:fields.quoteId}]:[]),...(fields.jobId?[{store:'jobs',id:fields.jobId}]:[])];
 validateReferences(data,refs,context);
 for(const [field,store] of [['quoteId','quotes'],['jobId','jobs']])if(fields[field]){const source=lookup(data,{store,id:fields[field]},context);if((source.customerId||'')!==(fields.customerId||''))throw Error('Draft and linked record must refer to the same customer')}
 if(draft.kind==='quote'&&!fields.customerId)throw Error('Select an existing customer for this quotation');
 if(draft.kind==='job'&&(!fields.customerId||fields.date&&!isDate(fields.date)))throw Error('Select a customer and review the job date');
 if(draft.kind==='task'&&!isDate(fields.due))throw Error('Task draft needs a valid due date');
 return true;
}
function resolve(input,data={},context={}){
 const parsed=parse(input);if(parsed.status!=='parsed')return parsed;
 const def=definition(parsed.commandId),p=parsed.params;
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!def.parameters.includes(k)))return problem('INVALID_PARAMETERS','Unknown command parameters are not accepted.');
 try{
  const params=clone(p);let refs=[],result=null;
  if(params.ref!==undefined&&!validRef(params.ref))return problem('INVALID_RECORD','Use a typed record reference with a store and identifier.');
  if(params.query!==undefined&&(!text(params.query)||params.query.length>160))return problem('MISSING_QUERY','Enter a record name or identifier.');
  if(params.store!==undefined&&!stores.includes(params.store))return problem('UNSUPPORTED_STORE','Record type is not supported.');
  if(def.id==='record.open'&&params.ref&&(params.query!==undefined||params.store!==undefined))return problem('AMBIGUOUS_PARAMETERS','Use a record reference or a search query, not both.');
  if(def.id==='record.open'&&params.store!==undefined&&params.query===undefined)return problem('MISSING_QUERY','A record type needs a search query or an explicit record reference.');
  if(def.id==='workspace.open'){if(!workspaces.includes(params.workspace))return problem('UNSUPPORTED_WORKSPACE','Choose an existing supported workspace.')}
  if(def.id==='record.find'||(def.id==='record.open'&&params.query)){
   if(params.store&&!stores.includes(params.store))return problem('UNSUPPORTED_STORE','Record type is not supported.');
   if(!text(params.query)||params.query.length>160)return problem('MISSING_QUERY','Enter a record name or identifier.');
   const matches=findRecords(data,params.query,params.store,context);
   if(def.id==='record.find')result={matches};
   else {const exact=matches.filter(x=>x.exact),choices=exact.length?exact:matches;if(choices.length!==1)return {status:choices.length?'ambiguous':'not_found',commandId:def.id,choices,error:{code:choices.length?'AMBIGUOUS_RECORD':'RECORD_NOT_FOUND',message:choices.length?'Choose a specific record.':'No matching local record.'}};params.ref=choices[0].ref;delete params.query;delete params.store}
  }
  if(def.id==='record.open'||def.id==='quotation.convert'||def.id==='quotation.followup.schedule'||def.id==='invoice.followup.schedule'||def.id==='calendar.conflict.reschedule'){
   if(!params.ref)params.ref=context.record?clone(context.record):null;
   if(!params.ref)return problem('MISSING_RECORD','Select or specify an existing record.');refs.push(params.ref);
  }
  if(def.id==='view.filter'&&!(filters[params.workspace]||[]).includes(params.filter))return problem('UNSUPPORTED_FILTER','That workspace does not support this filter.');
  if(def.id==='draft.prepare'){
   if(!['task','quote','job','calendar'].includes(params.kind))return problem('UNSUPPORTED_DRAFT','Choose a supported record draft.');
   if(params.title!==undefined&&(typeof params.title!=='string'||!text(params.title)||params.title.length>150))return problem('INVALID_TITLE','Use a draft title of 1–150 characters.');
   if(!params.ref&&context.record)params.ref=clone(context.record);
   result=prepareDraft(params.kind,params.ref,data,context,params.title,params.fields);refs=result.recordRefs;
  }
  const guard=validateReferences(data,refs,context);
  if(def.id==='customer.create'){
   if(!records?.validateCustomer)return problem('INTERPRETER_UNAVAILABLE','Customer interpretation is unavailable.');
   const review=records.validateCustomer(params.fields);
   if(review.missingRequired.length||review.issues.some(x=>x.blocking))return problem('INVALID_CUSTOMER','Review the customer fields before saving.',{issues:review.issues,missingRequired:review.missingRequired});
   params.fields=review.fields;
   const duplicates=records.findDuplicates(params.fields,rows(data,'customers'),{businessId:context.businessId||'local-business'}).sort((a,b)=>a.ref.id.localeCompare(b.ref.id));
   const reviewed=params.reviewedDuplicateIds===undefined?[]:params.reviewedDuplicateIds;
   if(!Array.isArray(reviewed)||reviewed.some(x=>typeof x!=='string')||new Set(reviewed).size!==reviewed.length||canonical(reviewed.slice().sort())!==canonical(duplicates.map(x=>x.ref.id).sort()))return problem('DUPLICATE_REVIEW_REQUIRED','Review likely existing customers before creating a separate customer.',{duplicates});
   params.reviewedDuplicateIds=reviewed.slice().sort();params.sourceHash=params.sourceHash===undefined?'':params.sourceHash;
   if(typeof params.sourceHash!=='string'||params.sourceHash!==''&&!/^[a-f0-9]{64}$/.test(params.sourceHash))return problem('INVALID_SOURCE_HASH','Original wording retention needs a valid local hash.');
   guard.push(...validateReferences(data,duplicates.map(x=>x.ref),context),{customerDuplicates:duplicates});
   result={draft:{kind:'customer',fields:params.fields},duplicates,retainsOriginal:!!params.sourceHash};
  }
  if(def.id==='customer.source.delete'){
   if(params.ref?.store!=='customers')return problem('INVALID_RECORD_TYPE','Choose an existing customer.');
   guard.push(...validateReferences(data,[params.ref],context));
   const retained=rows(data,'settings').find(x=>x.id==='customer-source:'+params.ref.id);
   guard.push({customerSource:{sourceHash:retained?.sourceHash||''}});result={retained:!!retained};
  }
  if(def.id==='calendar.conflict.reschedule'){
   if(params.ref.store!=='calendarEntries')return problem('INVALID_RECORD_TYPE','Only standalone calendar events may be rescheduled here.');
   if(!isDate(params.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(params.time))
    return problem('INVALID_SLOT','Choose a valid date and 24-hour start time.');
   const entry=lookup(data,params.ref,context);
   if(entry.sourceId&&entry.sourceKind&&entry.sourceKind!=='event'||['done','completed','cancelled','canceled'].includes(normalize(entry.status)))
    return problem('LINKED_EVENT_REVIEW_REQUIRED','Linked or completed sessions must be reviewed in their source record.');
   const minutes=Number(params.time.slice(0,2))*60+Number(params.time.slice(3,5));
   const duration=Number(entry.durationMinutes);
   if(!Number.isInteger(duration)||duration<1||duration>1440||minutes+duration>1440)
    return problem('INVALID_DURATION','The event must fit within one calendar day.');
   if(entry.date===params.date&&entry.time===params.time)
    return problem('UNCHANGED_SLOT','Choose a different event date or time.');
   const schedulerStores=['tasks','jobs','calendarEntries','calendarPreferences'];
   guard.push({calendarState:Object.fromEntries(schedulerStores.map(store=>[store,clone(rows(data,store))]))});
   result={eventId:entry.id,oldDate:entry.date,oldTime:entry.time,newDate:params.date,newTime:params.time,
    owner:entry.assignedTo||entry.ownerId||'local-owner',relatedWorkUnchanged:true};
  }
  if(def.id==='invoice.followup.schedule'){
   if(params.ref.store!=='invoices')return problem('INVALID_RECORD_TYPE','Choose an issued invoice.');
   if(!isDate(params.due))return problem('INVALID_DUE_DATE','Choose a valid task due date.');
   const invoice=lookup(data,params.ref,context);
   if(normalize(invoice.status)!=='issued'||!invoice.customerId||!isDate(invoice.dueDate)||
    invoice.dueDate>=(context.today||dateText(new Date())))
    return problem('PRECONDITION_FAILED','Choose an overdue issued invoice with a customer.');
   const customer=lookup(data,{store:'customers',id:invoice.customerId},context);
   if(!customer)return problem('CUSTOMER_UNAVAILABLE','Invoice customer unavailable.');
   const currency=invoice.currency||'USD';
   if(currency!=='USD'||!Array.isArray(invoice.lines)||!invoice.lines.length||
    invoice.lines.some(line=>!Number.isFinite(Number(line.qty))||Number(line.qty)<=0||
     !Number.isFinite(Number(line.unitPrice))||Number(line.unitPrice)<0)||
    !Number.isFinite(Number(invoice.taxRate||0))||Number(invoice.taxRate||0)<0||Number(invoice.taxRate||0)>100)
    return problem('INVOICE_REVIEW_REQUIRED','Invoice financial terms need review.');
   const payments=rows(data,'payments').filter(p=>p.invoiceId===invoice.id);
   if(payments.some(p=>!Number.isFinite(Number(p.amount))||Number(p.amount)<0||
     p.currency&&p.currency!==currency||p.customerId&&p.customerId!==invoice.customerId))
    return problem('PAYMENT_REVIEW_REQUIRED','Recorded payments need reconciliation.');
   const subtotal=invoice.lines.reduce((sum,l)=>sum+Math.round(Number(l.qty)*Math.round(Number(l.unitPrice)*100)),0);
   const total=subtotal+Math.round(subtotal*Number(invoice.taxRate||0)/100);
   const paid=payments.reduce((sum,p)=>sum+Math.round(Number(p.amount)*100),0);
   if(total-paid<=0)return problem('NO_BALANCE','No recorded outstanding balance exists.');
   guard.push({invoicePayments:payments.map(p=>clone(p))});
   result={invoiceId:invoice.id,customerId:invoice.customerId,due:params.due,recordedOutstanding:(total-paid)/100,providerVerified:false};
  }
  if(def.id==='quotation.followup.schedule'){
   if(params.ref.store!=='quotes')return problem('INVALID_RECORD_TYPE','Choose a sent quotation.');
   if(!isDate(params.due))return problem('INVALID_DUE_DATE','Choose a valid task due date.');
   const q=lookup(data,params.ref,context);
   if(normalize(q.status)!=='sent'||!q.customerId)return problem('PRECONDITION_FAILED','Only sent quotations with a customer can be followed up.');
   const customer=rows(data,'customers').find(x=>x.id===q.customerId);
   if(!customer||customer.businessId&&customer.businessId!==(context.businessId||'local-business'))
    return problem('CUSTOMER_UNAVAILABLE','The quotation customer must be in the current business.');
   result={quoteId:q.id,due:params.due,customerId:q.customerId,taskType:'quotation_follow_up',externalCommunication:false};
  }
  if(def.id==='quotation.convert'){
   if(params.ref.store!=='quotes')return problem('INVALID_RECORD_TYPE','Select an accepted quotation.');
   const q=lookup(data,params.ref,context);
   if(!q.customerId)return problem('MISSING_CUSTOMER','Link an existing customer before creating a job.');
   if(q.status!=='Accepted')return problem('PRECONDITION_FAILED','Only accepted quotations can create jobs.');
   const existing=rows(data,'jobs').filter(j=>j.quoteId===q.id);
   for(const job of existing)validateReferences(data,[{store:'jobs',id:job.id}],context);
   if(existing.length>1)return problem('DUPLICATE_RELATIONSHIP','Multiple jobs already reference this quotation; review them first.');
   result={existingJobId:existing[0]?.id||null};guard.push({linkedJobs:clone(existing)});
  }
  return {status:def.approval==='explicit'?'needs_review':'ready',commandId:def.id,effect:def.effect,permission:def.permission,approval:def.approval,params,recordRefs:guard.filter(x=>x.ref).map(x=>x.ref),sourcePage:context.sourcePage||'unknown',result,guard};
 }catch(error){return problem('INVALID_RECORD',error.message)}
}
async function digest(value){
 if(!globalThis.crypto?.subtle)throw Error('Secure command binding is unavailable in this host.');
 const data=new TextEncoder().encode(canonical(value));const hash=await globalThis.crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
/* Uses the existing v9 commandLog store. Atomic transitions serialize across tabs.
 * Audit failures fail closed. An interrupted executing command is not auto-replayed.
 */
function createLedger(database){
 const transact=(id,change)=>new Promise((resolve,reject)=>{
  let tx,answer;try{const db=typeof database==='function'?database():database;tx=db.transaction(['commandLog'],'readwrite');const store=tx.objectStore('commandLog'),r=store.get(id);
   r.onsuccess=()=>{try{const next=change(r.result?clone(r.result):null);answer=next.answer;if(next.write)store.put(next.write)}catch(error){answer=error;tx.abort()}};
  }catch(error){reject(error);return}
  tx.oncomplete=()=>resolve(clone(answer));tx.onabort=()=>reject(answer instanceof Error?answer:tx.error||Error('Audit transaction aborted'));tx.onerror=()=>reject(tx.error||Error('Audit transaction failed'));
 });
 return Object.freeze({
  async get(id){return transact(id,row=>({answer:row}))},
  async create(plan){return transact(plan.id,row=>{if(row){if(row.kind!=='pilot.command'||row.binding!==plan.binding)throw Error('Request key is already bound to another command or record revision');return {answer:row}}return {write:plan,answer:plan}})},
  async transition(id,expected,event,patch){return transact(id,row=>{if(!row||row.kind!=='pilot.command')throw Error('Unknown command request');if(!expected.includes(row.status))return {answer:{claimed:false,row}};const next={...row,...patch,events:[...row.events,event]};return {write:next,answer:{claimed:true,row:next}}})}
 });
}
function createRuntime(options){
 const {snapshot,context,ports={},ledger,uid,now=()=>new Date().toISOString(),can=()=>false,hash=digest}=options||{};
 const inFlight=new Map();
 const ctx=async()=>({actor:'local-owner',businessId:'local-business',...await context()});
 const publicPlan=row=>{const {binding,kind,events,...view}=row;return clone(view)};
 const bound=async(r,c)=>hash({commandId:r.commandId,params:r.params,effect:r.effect,actor:c.actor,businessId:c.businessId,guard:r.guard,defaults:r.effect==='draft'?r.result:null});
 const event=(type,c,detail)=>({type,at:now(),actor:c.actor,...detail});
 const fail=async(row,status,code,message,c)=>{await ledger.transition(row.id,[row.status],event(status,c,{code}),{status,error:{code,message}});return {id:row.id,status,error:{code,message}}};
 async function prepare(input,{requestKey}={}){
  const c=await ctx(),parsed=parse(input);if(parsed.status!=='parsed')return parsed;
  const def=definition(parsed.commandId);if(!await can(def.permission,c))return {status:'denied',error:{code:'PERMISSION_DENIED',message:'This actor cannot use that command.'}};
  const data=await snapshot(),resolved=resolve(parsed.status==='parsed'?{commandId:parsed.commandId,params:parsed.params}:input,data,c);
  if(!['ready','needs_review'].includes(resolved.status))return resolved;
  const key=requestKey||uid();if(!/^[A-Za-z0-9._:-]{1,160}$/.test(key))return problem('INVALID_REQUEST_KEY','Use a valid unique request key.');
  const {guard,...summary}=resolved,binding=await bound(resolved,c);
  const row={...summary,id:'pilot:command:'+key,kind:'pilot.command',version:VERSION,binding,actor:c.actor,businessId:c.businessId,
   context:{record:c.record||null,calendarDate:c.calendarDate||null,today:c.today||null,primaryTrade:c.primaryTrade||null,filter:c.filter||null},createdAt:now(),events:[event('prepared',c)]};
  try{return publicPlan(await ledger.create(row))}catch(error){return problem('AUDIT_OR_KEY_ERROR',error.message)}
 }
 async function approve(id){
  const c=await ctx(),row=await ledger.get(id);if(!row||row.kind!=='pilot.command')return problem('UNKNOWN_REQUEST','Prepare the command before approval.');
  if(row.actor!==c.actor||row.businessId!==c.businessId||!await can(row.permission,c))return {status:'denied',error:{code:'PERMISSION_DENIED',message:'Approval requires the same authorized actor and business.'}};
  if(row.status!=='needs_review')return publicPlan(row);
  const fresh=resolve({commandId:row.commandId,params:row.params},await snapshot(),c);
  if(!['ready','needs_review'].includes(fresh.status)||await bound(fresh,c)!==row.binding)return fail(row,'stale','STALE_RECORDS','Records changed. Prepare and review a fresh command.',c);
  const result=await ledger.transition(id,['needs_review'],event('approved',c),{status:'approved',approvedBy:c.actor,approvedAt:now()});return publicPlan(result.row);
 }
 async function executeOnce(id){
  const c=await ctx(),row=await ledger.get(id);if(!row||row.kind!=='pilot.command')return problem('UNKNOWN_REQUEST','Only a prepared command request can execute.');
  if(row.actor!==c.actor||row.businessId!==c.businessId||!await can(row.permission,c))return {status:'denied',error:{code:'PERMISSION_DENIED',message:'Command is outside this actor or business capability.'}};
  if(row.status==='succeeded')return {...clone(row.outcome),reused:true};
  if(row.status==='needs_review')return {id,status:'needs_review',error:{code:'APPROVAL_REQUIRED',message:'Explicit review and approval are required.'}};
  if(row.status==='executing')return {id,status:'in_progress',error:{code:'EXECUTION_IN_PROGRESS',message:'Already executing or interrupted; inspect the audit and linked record before recovery.'}};
  if(!['ready','approved'].includes(row.status))return publicPlan(row);
  const fresh=resolve({commandId:row.commandId,params:row.params},await snapshot(),c);
  if(!['ready','needs_review'].includes(fresh.status)||await bound(fresh,c)!==row.binding)return fail(row,'stale','STALE_RECORDS','Records or relationships changed. Prepare a fresh request.',c);
  const claim=await ledger.transition(id,[row.status],event('executing',c),{status:'executing'});
  if(!claim.claimed)return claim.row.status==='succeeded'?{...clone(claim.row.outcome),reused:true}:claim.row.status==='executing'?{id,status:'in_progress',reused:true}:publicPlan(claim.row);
  let result;
  try{
   if(row.commandId==='intelligence.review'){if(typeof ports.review!=='function')throw Error('Operational review is unavailable');result=await ports.review()}
   else if(row.commandId==='record.find')result=fresh.result;
   else if(row.commandId==='workspace.open')result=await ports.navigate(row.params.workspace);
   else if(row.commandId==='record.open')result=await ports.openRecord(clone(row.params.ref));
   else if(row.commandId==='view.filter')result=await ports.filter(row.params.workspace,row.params.filter);
   else if(row.commandId==='draft.prepare')result=await ports.prepareDraft(clone(fresh.result));
   else if(row.commandId==='calendar.conflict.reschedule')result=await ports.operation('calendar.conflict.reschedule',{eventId:row.params.ref.id,date:row.params.date,time:row.params.time},{requestKey:'operation:'+id,recordGuard:clone(fresh.guard),actor:c.actor,businessId:c.businessId,approved:true});
   else if(row.commandId==='invoice.followup.schedule')result=await ports.operation('invoice.followup.schedule',{invoiceId:row.params.ref.id,due:row.params.due},{requestKey:'operation:'+id,recordGuard:clone(fresh.guard),actor:c.actor,businessId:c.businessId,approved:true});
   else if(row.commandId==='quotation.followup.schedule')result=await ports.operation('quotation.followup.schedule',{quoteId:row.params.ref.id,due:row.params.due},{requestKey:'operation:'+id,recordGuard:clone(fresh.guard),actor:c.actor,businessId:c.businessId,approved:true});
   else if(row.commandId==='quotation.convert')result=await ports.operation('quotation.convert',{quoteId:row.params.ref.id},{requestKey:'operation:'+id,recordGuard:clone(fresh.guard)});
   else if(row.commandId==='customer.create')result=await ports.operation('customer.create',clone(row.params),{requestKey:'operation:'+id,requestId:id,actor:c.actor,businessId:c.businessId,recordGuard:clone(fresh.guard)});
   else if(row.commandId==='customer.source.delete')result=await ports.operation('customer.source.delete',{customerId:row.params.ref.id},{requestKey:'operation:'+id,requestId:id,actor:c.actor,businessId:c.businessId,recordGuard:clone(fresh.guard)});
   else throw Error('Command adapter is not available');
  }catch(error){return fail({...row,status:'executing'},'failed','EXECUTION_FAILED',String(error.message||error),c)}
  const outcome={id,status:'succeeded',effect:row.effect,result:result??null};
  try{await ledger.transition(id,['executing'],event('succeeded',c),{status:'succeeded',outcome});return clone(outcome)}
  catch(error){return {id,status:'indeterminate',error:{code:'AUDIT_FINALIZATION_FAILED',message:'The action may have completed. Inspect the record; it will not be executed again automatically.'}}}
 }
 function execute(id){if(typeof id!=='string')return Promise.resolve(problem('INVALID_REQUEST','Execute a prepared request ID, not interpreted text or a payload.'));if(inFlight.has(id))return inFlight.get(id);const promise=executeOnce(id).catch(error=>({id,status:'failed',error:{code:'AUDIT_UNAVAILABLE',message:error.message}})).finally(()=>inFlight.delete(id));inFlight.set(id,promise);return promise}
 // Explicit recovery of an interrupted quotation follow-up. Never replays a side effect.
 // A matching durable core receipt AND linked task are required before success is reported.
 async function reconcile(id){
  const c=await ctx(),row=await ledger.get(id);
  if(!row||row.kind!=='pilot.command')return problem('UNKNOWN_REQUEST','Command request not found.');
  if(row.actor!==c.actor||row.businessId!==c.businessId||!await can(row.permission,c))
   return {id,status:'denied',error:{code:'PERMISSION_DENIED',message:'Recovery requires the original authorized actor and business.'}};
  if(!['quotation.followup.schedule','invoice.followup.schedule'].includes(row.commandId))return {id,status:'unsupported',error:{code:'UNSUPPORTED_RECOVERY',message:'No verified reconciliation contract for this command.'}};
  if(row.status==='succeeded')return {...clone(row.outcome),reused:true};
  if(row.status!=='executing')return {id,status:row.status,error:{code:'RECOVERY_NOT_REQUIRED',message:'Only interrupted execution can be reconciled.'}};
  if(row.approvedBy!==c.actor||!row.events?.some(e=>e.type==='approved'))
   return {id,status:'indeterminate',error:{code:'APPROVAL_UNVERIFIED',message:'Cannot prove this operation was approved.'}};
  const data=await snapshot(),invoiceFollowup=row.commandId==='invoice.followup.schedule';
  const receiptId=(invoiceFollowup?'invoice-followup:':'quote-followup:')+'operation:'+id;
  const receipts=(data.commandLog||[]).filter(x=>x.id===receiptId);
  if(receipts.length!==1)
   return {id,status:'indeterminate',error:{code:'RECEIPT_MISSING',message:'No unique durable operation receipt. Do not replay automatically.'}};
  const receipt=receipts[0],expected=canonical(invoiceFollowup?
   {invoiceId:row.params.ref.id,due:row.params.due}:
   {quoteId:row.params.ref.id,due:row.params.due});
  if(receipt.kind!==row.commandId||receipt.requestPayload!==expected||
   receipt.actor!==row.actor||receipt.businessId!==row.businessId||
   !['task_created','existing_open_task'].includes(receipt.result))
   return {id,status:'indeterminate',error:{code:'RECEIPT_MISMATCH',message:'Operation receipt does not match approval.'}};
  const matches=(data.tasks||[]).filter(t=>t.id===receipt.resultId&&
    (invoiceFollowup?t.invoiceId:t.quoteId)===row.params.ref.id&&
    t.customerId===row.result?.customerId&&(!t.businessId||t.businessId===row.businessId));
  if(matches.length!==1)
   return {id,status:'indeterminate',error:{code:'TASK_UNVERIFIED',message:'The linked task could not be independently verified.'}};
  if(receipt.result==='task_created'){
   const journal=(data.commandLog||[]).filter(e=>e.kind==='domain.event'&&e.correlationId===receiptId&&
    e.type==='task.created'&&e.ref?.store==='tasks'&&e.ref.id===receipt.resultId&&e.businessId===row.businessId);
   if(journal.length!==1)return {id,status:'indeterminate',error:{code:'EVENT_UNVERIFIED',message:'The task creation audit event is missing.'}};
  }
  const outcome={id,status:'succeeded',effect:row.effect,result:{id:receipt.resultId,reused:receipt.result!=='task_created',commandKey:receiptId,reconciled:true}};
  const changed=await ledger.transition(id,['executing'],event('reconciled',c,{receiptId}),{status:'succeeded',outcome});
  if(!changed.claimed)return changed.row.status==='succeeded'?{...clone(changed.row.outcome),reused:true}:
   {id,status:'indeterminate',error:{code:'RECOVERY_RACE',message:'Command state changed during reconciliation.'}};
  return outcome;
 }
 async function reject(id){const c=await ctx(),row=await ledger.get(id);if(!row||row.actor!==c.actor||row.businessId!==c.businessId)return problem('UNKNOWN_REQUEST','Request is not available.');const result=await ledger.transition(id,['ready','needs_review','approved'],event('rejected',c),{status:'rejected'});return publicPlan(result.row)}
 async function history(id){const c=await ctx(),row=await ledger.get(id);return row?.kind==='pilot.command'&&row.actor===c.actor&&row.businessId===c.businessId?clone(row.events):[]}
 const guarded=fn=>async(...args)=>{try{return await fn(...args)}catch(error){return {status:'failed',error:{code:'COMMAND_UNAVAILABLE',message:String(error.message||error)}}}};
 return Object.freeze({prepare:guarded(prepare),approve:guarded(approve),execute,reconcile:guarded(reconcile),reject:guarded(reject),parse,definitions,history,get:async id=>{const c=await ctx(),row=await ledger.get(id);return row?.kind==='pilot.command'&&row.actor===c.actor&&row.businessId===c.businessId?publicPlan(row):null}});
}
return Object.freeze({version:VERSION,definitions,parse,resolve,validateReferences,prepareDraft,validateDraft,filterRecords,staleQuote,findRecords,createRuntime,createLedger,canonical,isDate,dateText,terminal});
});