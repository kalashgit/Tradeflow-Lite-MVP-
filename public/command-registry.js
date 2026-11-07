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
 {id:'customer.contact.record',intent:'Record owner-attested or attempted customer contact with review',aliases:[],required:['ref','method','notes','outcome'],parameters:['ref','quoteId','method','notes','outcome'],effect:'modification',permission:'modify:customer.contact.record',approval:'explicit'},
 {id:'quotation.followup.schedule',intent:'Schedule a reviewed internal follow-up task for a sent quotation',aliases:[],required:['ref','due'],parameters:['ref','due'],effect:'modification',permission:'modify:quotation.followup.schedule',approval:'explicit'},
 {id:'job.change_order.review.schedule',intent:'Schedule internal review of a proposed job change; customer authorization remains separate',aliases:[],required:['ref','changeOrderId','due'],parameters:['ref','changeOrderId','due'],effect:'modification',permission:'modify:job.change_order.review.schedule',approval:'explicit'},
 {id:'job.change_order.authorization.record',intent:'Record owner-attested customer change-order consent evidence and resolve reviewed task',aliases:[],required:['ref','changeOrderId','evidence'],parameters:['ref','changeOrderId','evidence'],effect:'modification',permission:'modify:job.change_order.authorization.record',approval:'explicit'},
 {id:'job.cost_review.schedule',intent:'Create an approved internal task to reconcile job budget and recorded costs',aliases:[],required:['ref','due'],parameters:['ref','due'],effect:'modification',permission:'modify:job.cost_review.schedule',approval:'explicit'},
 {id:'job.labor_review.schedule',intent:'Schedule an internal review of manually recorded job labor-hour overrun',aliases:[],required:['ref','due'],parameters:['ref','due'],effect:'modification',permission:'modify:job.labor_review.schedule',approval:'explicit'},
 {id:'invoice.payment_review.schedule',intent:'Schedule owner-approved review of local invoice overpayments; no settlement claim',aliases:[],required:['ref','due'],parameters:['ref','due'],effect:'modification',permission:'modify:invoice.payment_review.schedule',approval:'explicit'},
 {id:'opportunity.bid_review.schedule',intent:'Schedule an internal bid qualification check before committing estimating effort',aliases:[],required:['ref','due'],parameters:['ref','due'],effect:'modification',permission:'modify:opportunity.bid_review.schedule',approval:'explicit'},
 {id:'quotation.reuse.create',intent:'Create a reviewed unsent quotation draft using safe fields from a saved estimate',aliases:[],required:['ref'],parameters:['ref'],effect:'modification',permission:'modify:quotation.reuse.create',approval:'explicit'},
 {id:'customer.economics_review.schedule',intent:'Schedule owner-approved review of locally recorded customer cash contribution',aliases:[],required:['ref','due'],parameters:['ref','due'],effect:'modification',permission:'modify:customer.economics_review.schedule',approval:'explicit'},
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
  if(def.id==='record.open'||def.id==='quotation.convert'||def.id==='quotation.reuse.create'||def.id==='quotation.followup.schedule'||def.id==='job.change_order.review.schedule'||def.id==='job.change_order.authorization.record'||def.id==='job.cost_review.schedule'||def.id==='job.labor_review.schedule'||def.id==='invoice.payment_review.schedule'||def.id==='opportunity.bid_review.schedule'||def.id==='customer.economics_review.schedule'||def.id==='invoice.followup.schedule'||def.id==='calendar.conflict.reschedule'||def.id==='customer.contact.record'){
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
  if(def.id==='invoice.payment_review.schedule'){
   if(params.ref.store!=='invoices'||!isDate(params.due))return problem('INVALID_PAYMENT_REVIEW','Choose an invoice and valid review date.');
   const invoice=lookup(data,params.ref,context);
   if(normalize(invoice.status)!=='issued'||!invoice.customerId||!Array.isArray(invoice.lines)||!invoice.lines.length||
    (invoice.currency&&invoice.currency!=='USD')||invoice.lines.some(x=>!Number.isFinite(Number(x.qty))||Number(x.qty)<=0||
     !Number.isFinite(Number(x.unitPrice))||Number(x.unitPrice)<0)||
    !Number.isFinite(Number(invoice.taxRate||0))||Number(invoice.taxRate||0)<0||Number(invoice.taxRate||0)>100)
    return problem('INVOICE_EVIDENCE_INCOMPLETE','Issued invoice terms require manual verification.');
   const customer=lookup(data,{store:'customers',id:invoice.customerId},context);
   if(!customer)return problem('CUSTOMER_UNAVAILABLE','Linked customer unavailable.');
   const payments=rows(data,'payments').filter(x=>x.invoiceId===invoice.id);
   if(!payments.length||payments.some(x=>typeof x.amount!=='number'||!Number.isFinite(x.amount)||x.amount<0||
    x.customerId&&x.customerId!==invoice.customerId||x.currency&&x.currency!=='USD'||
    x.businessId&&x.businessId!==(context.businessId||'local-business')))
    return problem('PAYMENT_EVIDENCE_INCOMPLETE','Payment records need manual correction before calculated overpayment review.');
   const subtotal=invoice.lines.reduce((n,x)=>n+Math.round(Number(x.qty)*Math.round(Number(x.unitPrice)*100)),0);
   const total=subtotal+Math.round(subtotal*Number(invoice.taxRate||0)/100);
   const paid=payments.reduce((n,x)=>n+Math.round(x.amount*100),0);
   if(paid<=total)return problem('NO_RECORDED_OVERPAYMENT','Recorded payments do not exceed invoice total.');
   const tasks=rows(data,'tasks').filter(x=>x.invoiceId===invoice.id&&x.taskKind==='invoice_payment_reconciliation'&&!terminal(x));
   if(tasks.some(x=>x.businessId!==(context.businessId||'local-business')))
    return problem('CROSS_BUSINESS_TASK','Existing payment review needs inspection.');
   guard.push({paymentReviewPayments:clone(payments),paymentReviewTasks:clone(tasks)});
   result={invoiceId:invoice.id,customerId:customer.id,invoiceTotal:total/100,recordedPayments:paid/100,
    discrepancy:(paid-total)/100,paymentIds:payments.map(x=>x.id),currency:'USD',settlementVerified:false,
    externalAccountingVerified:false};
  }
  if(def.id==='opportunity.bid_review.schedule'){
   if(params.ref.store!=='opportunities'||!isDate(params.due))return problem('INVALID_BID_REVIEW','Choose an opportunity and valid review date.');
   const opportunity=lookup(data,params.ref,context);
   const closed=['won','lost','closed','declined'].includes(normalize(opportunity.status));
   const checks=['bidInvitationVerified','bidScopeReviewed','bidCapacityChecked'];
   if(closed||normalize(opportunity.bid_decision)!=='pursue')return problem('NOT_ACTIVE_BID','Only active pursued opportunities are eligible.');
   if(checks.every(key=>normalize(opportunity[key])==='yes'))return problem('CHECKS_COMPLETE','No recorded bid qualification gap remains.');
   if(checks.some(key=>!['yes','no','unknown',''].includes(normalize(opportunity[key]))))
    return problem('INVALID_BID_CHECK','Opportunity readiness entries require manual correction.');
   const tasks=rows(data,'tasks').filter(t=>t.opportunityId===opportunity.id&&t.taskKind==='bid_qualification_review'&&!terminal(t));
   if(tasks.some(t=>t.businessId!==(context.businessId||'local-business')))
    return problem('CROSS_BUSINESS_TASK','Existing bid-review task needs inspection.');
   guard.push({bidReviewTasks:clone(tasks)});
   result={opportunityId:opportunity.id,bidDecision:opportunity.bid_decision,
    invitation:opportunity.bidInvitationVerified||'Unknown',scope:opportunity.bidScopeReviewed||'Unknown',
    capacity:opportunity.bidCapacityChecked||'Unknown',independentlyVerified:false,
    customerCommitmentCreated:false};
  }
  if(def.id==='quotation.reuse.create'){
   if(params.ref.store!=='quotes')return problem('INVALID_SOURCE','Choose a saved quotation to reuse.');
   const source=lookup(data,params.ref,context);
   if(!['accepted','sent','draft'].includes(normalize(source.status))||typeof source.title!=='string'||!source.title.trim()||
    typeof source.amount!=='number'&&typeof source.amount!=='string')
    return problem('UNSAFE_SOURCE','Choose a saved estimate with a supported status, title and amount.');
   const amount=Number(source.amount);
   if(source.amount===''||!Number.isFinite(amount)||amount<0||amount>100000000)
    return problem('UNSAFE_AMOUNT','Review source quotation amount before reuse.');
   const drafts=rows(data,'quotes').filter(q=>q.sourceQuoteId===source.id&&normalize(q.status)==='draft'&&q.id!==source.id);
   if(drafts.some(q=>q.businessId&&q.businessId!==(context.businessId||'local-business')))
    return problem('CROSS_BUSINESS_DRAFT','Previously created draft requires manual inspection.');
   guard.push({quoteReuseDrafts:clone(drafts)});
   result={sourceQuoteId:source.id,title:source.title.slice(0,160),category:String(source.category||'').slice(0,90),
    amount,customerId:'',status:'Draft',reusedFields:['title','category','amount'],
    excludes:['customer','acceptance','signature','sent date','contact history','authorization'],pricingReverified:false};
  }
  if(def.id==='customer.economics_review.schedule'){
   if(params.ref.store!=='customers'||!isDate(params.due))return problem('INVALID_CUSTOMER_REVIEW','Choose a customer and valid review date.');
   const customer=lookup(data,params.ref,context),jobs=rows(data,'jobs').filter(x=>x.customerId===customer.id);
   const ids=new Set(jobs.map(x=>x.id)),invoices=rows(data,'invoices').filter(x=>x.customerId===customer.id&&normalize(x.status)!=='void');
   const invoiceIds=new Set(invoices.map(x=>x.id));
   const payments=rows(data,'payments').filter(x=>x.invoiceId?invoiceIds.has(x.invoiceId):x.customerId===customer.id||ids.has(x.jobId||x.relatedId));
   const costs=rows(data,'jobCosts').filter(x=>ids.has(x.jobId)&&x.type==='actual');
   const expenses=rows(data,'expenses').filter(x=>ids.has(x.jobId||x.relatedId));
   const valid=x=>typeof x.amount==='number'&&Number.isFinite(x.amount)&&x.amount>=0&&(!x.currency||x.currency==='USD')&&
    (!x.businessId||x.businessId===(context.businessId||'local-business'));
   if(!jobs.length||!payments.length||!costs.length&&!expenses.length||[...payments,...costs,...expenses].some(x=>!valid(x))||
    payments.some(x=>x.customerId&&x.customerId!==customer.id||x.invoiceId&&invoices.filter(i=>i.id===x.invoiceId).length!==1)||
    rows(data,'payments').some(x=>x.customerId===customer.id&&x.invoiceId&&!invoiceIds.has(x.invoiceId))||
    jobs.some(j=>!costs.some(x=>x.jobId===j.id)&&!expenses.some(x=>x.jobId===j.id||x.relatedId===j.id)))
    return problem('ECONOMICS_EVIDENCE_INCOMPLETE','Review missing, inconsistent or foreign accounting entries before recording contribution.');
   const cents=list=>list.reduce((n,x)=>n+Math.round(x.amount*100),0);
   const received=cents(payments),spent=cents(costs)+cents(expenses);
   const tasks=rows(data,'tasks').filter(t=>t.customerId===customer.id&&t.taskKind==='customer_economics_review'&&!terminal(t));
   if(tasks.some(t=>t.businessId!==(context.businessId||'local-business')))
    return problem('CROSS_BUSINESS_TASK','Existing customer review needs inspection.');
   guard.push({economicsJobs:clone(jobs),economicsInvoices:clone(invoices),economicsPayments:clone(payments),
    economicsCosts:clone(costs),economicsExpenses:clone(expenses),economicsTasks:clone(tasks)});
   result={customerId:customer.id,received:received/100,recordedCosts:spent/100,recordedContribution:(received-spent)/100,
    jobIds:jobs.map(x=>x.id),invoiceIds:invoices.map(x=>x.id),paymentIds:payments.map(x=>x.id),costIds:costs.map(x=>x.id),
    expenseIds:expenses.map(x=>x.id),currency:'USD',profitVerified:false,settlementVerified:false,
    overlapPossible:true};
  }
  if(def.id==='customer.contact.record'){
   if(params.ref.store!=='customers')return problem('INVALID_RECORD_TYPE','Choose the customer whose contact was recorded.');
   if(!['Phone','Email','Meeting','Site visit','Other'].includes(params.method)||
    !['attempted','reached'].includes(params.outcome)||
    typeof params.notes!=='string'||params.notes.trim().length<3||params.notes.length>1000)
    return problem('INVALID_CONTACT','Provide contact method, outcome and concise factual notes.');
   if(params.quoteId!==undefined&&(typeof params.quoteId!=='string'||params.quoteId.length>160))
    return problem('INVALID_QUOTE','Choose a valid optional linked quotation.');
   const customer=lookup(data,params.ref,context);
   params.notes=params.notes.trim();
   params.quoteId=params.quoteId||'';
   if(params.quoteId){
    const quote=lookup(data,{store:'quotes',id:params.quoteId},context);
    if(quote.customerId!==customer.id)return problem('CUSTOMER_MISMATCH','The quote belongs to another customer.');
    for(const checked of validateReferences(data,[{store:'quotes',id:quote.id}],context))
     if(!guard.some(g=>g.ref?.store===checked.ref.store&&g.ref.id===checked.ref.id))guard.push(checked);
   }
   if(params.quoteId&&params.outcome==='reached'){
    const open=rows(data,'tasks').filter(t=>t.quoteId===params.quoteId&&
     t.customerId===customer.id&&(t.taskKind==='quotation_follow_up'||t.followupAuto===true||
      String(t.title||'').startsWith('Follow up quote: '))&&
     (!t.businessId||t.businessId===(context.businessId||'local-business'))&&
     !['done','completed','cancelled','canceled'].includes(normalize(t.status)));
    guard.push({quoteOpenFollowups:clone(open)});
   }
   result={customerId:customer.id,quoteId:params.quoteId,method:params.method,
    outcome:params.outcome,operatorReported:true,providerVerified:false};
  }
  if(def.id==='quotation.followup.schedule'){
   if(params.ref.store!=='quotes')return problem('INVALID_RECORD_TYPE','Choose a sent quotation.');
   if(!isDate(params.due))return problem('INVALID_DUE_DATE','Choose a valid task due date.');
   const q=lookup(data,params.ref,context);
   if(normalize(q.status)!=='sent'||!q.customerId||q.followupResolution?.status==='owner_attested_reached')return problem('PRECONDITION_FAILED','Only unresolved sent quotations with a customer can be followed up.');
   const customer=rows(data,'customers').find(x=>x.id===q.customerId);
   if(!customer||customer.businessId&&customer.businessId!==(context.businessId||'local-business'))
    return problem('CUSTOMER_UNAVAILABLE','The quotation customer must be in the current business.');
   result={quoteId:q.id,due:params.due,customerId:q.customerId,taskType:'quotation_follow_up',externalCommunication:false};
  }
  if(def.id==='job.change_order.review.schedule'){
   if(params.ref.store!=='jobs')return problem('INVALID_RECORD_TYPE','Choose a job containing proposed extra work.');
   if(!isDate(params.due))return problem('INVALID_DUE_DATE','Choose a valid internal review due date.');
   if(typeof params.changeOrderId!=='string'||!params.changeOrderId.trim()||params.changeOrderId.length>160)
    return problem('INVALID_CHANGE_ORDER','Choose a specific saved change order.');
   const job=lookup(data,params.ref,context);
   const changes=Array.isArray(job.changeOrders)?job.changeOrders:[];
   const matches=changes.filter(x=>x&&x.id===params.changeOrderId);
   if(matches.length!==1||matches[0].status!=='proposed')
    return problem('CHANGE_ORDER_REVIEW_REQUIRED','A unique proposed change order is required; customer authorization cannot be inferred.');
   if(!Number.isFinite(matches[0].amount)||matches[0].amount<0)
    return problem('INVALID_CHANGE_AMOUNT','Review the proposed change amount before creating an internal task.');
   const existing=rows(data,'tasks').filter(t=>t.jobId===job.id&&t.changeOrderId===params.changeOrderId&&t.taskKind==='change_order_review'&&!terminal(t));
   if(existing.some(t=>t.businessId&&t.businessId!==(context.businessId||'local-business')))
    return problem('CROSS_BUSINESS_TASK','Linked change-order task needs review.');
   guard.push({changeOrderOpenReviews:clone(existing)});
   result={jobId:job.id,changeOrderId:params.changeOrderId,due:params.due,customerAuthorized:false,externalCommunication:false,existingTaskId:existing.length===1?existing[0].id:null};
  }
  if(def.id==='job.change_order.authorization.record'){
   if(params.ref.store!=='jobs'||typeof params.changeOrderId!=='string'||!params.changeOrderId.trim()||params.changeOrderId.length>160)
    return problem('INVALID_CHANGE_ORDER','Select a specific proposed change on an existing job.');
   if(typeof params.evidence!=='string'||params.evidence.trim().length<10||params.evidence.length>300)
    return problem('EVIDENCE_REQUIRED','Supply a bounded reference to separately obtained customer consent (10–300 characters).');
   params.evidence=params.evidence.trim();
   const job=lookup(data,params.ref,context);
   const changes=Array.isArray(job.changeOrders)?job.changeOrders:[];
   const matches=changes.filter(x=>x?.id===params.changeOrderId);
   if(matches.length!==1||matches[0].status!=='proposed')return problem('PRECONDITION_FAILED','Only a unique proposed change can receive documented consent.');
   if(!Number.isFinite(matches[0].amount)||matches[0].amount<=0)
    return problem('INVALID_AMOUNT','Review the additional work amount before recording consent.');
   const tasks=rows(data,'tasks').filter(t=>t.jobId===job.id&&t.changeOrderId===params.changeOrderId&&t.taskKind==='change_order_review'&&!terminal(t));
   if(tasks.length!==1||tasks[0].businessId!==(context.businessId||'local-business'))
    return problem('REVIEW_TASK_REQUIRED','Exactly one open review task in this business is required before recording customer consent.');
   guard.push({changeOrderOpenReviews:clone(tasks)});
   result={jobId:job.id,changeOrderId:params.changeOrderId,reviewTaskId:tasks[0].id,
    evidenceReference:params.evidence,ownerAttested:true,providerVerified:false,externalCommunication:false};
  }
  if(def.id==='job.cost_review.schedule'){
   if(params.ref.store!=='jobs'||!isDate(params.due))return problem('INVALID_JOB_REVIEW','Choose an existing job and valid review date.');
   const job=lookup(data,params.ref,context);
   if(['cancelled','canceled'].includes(normalize(job.status)))return problem('JOB_CANCELLED','Cancelled jobs require manual historical review.');
   const costs=rows(data,'jobCosts').filter(x=>x.jobId===job.id),expenses=rows(data,'expenses').filter(x=>x.jobId===job.id||x.relatedId===job.id);
   const valid=x=>typeof x.amount==='number'&&Number.isFinite(x.amount)&&x.amount>=0&&(!x.businessId||x.businessId===(context.businessId||'local-business'));
   if(!costs.some(x=>x.type==='estimate')||[...costs,...expenses].some(x=>!valid(x)))
    return problem('COST_EVIDENCE_INCOMPLETE','Job costs need valid, same-business budget and recorded cost entries.');
   const budget=costs.filter(x=>x.type==='estimate').reduce((n,x)=>n+Math.round(x.amount*100),0),
    recorded=[...costs.filter(x=>x.type==='actual'),...expenses].reduce((n,x)=>n+Math.round(x.amount*100),0);
   if(budget<=0||recorded<=budget)return problem('NO_RECORDED_OVERRUN','No recorded cost overrun exists under the saved estimates.');
   const tasks=rows(data,'tasks').filter(t=>t.jobId===job.id&&t.taskKind==='job_cost_reconciliation'&&!terminal(t));
   if(tasks.some(t=>t.businessId&&t.businessId!==(context.businessId||'local-business')))
    return problem('CROSS_BUSINESS_TASK','Existing cost-review task requires inspection.');
   guard.push({jobCostsSnapshot:clone(costs),jobExpensesSnapshot:clone(expenses),costReviewTasks:clone(tasks)});
   result={jobId:job.id,budget:budget/100,recordedCosts:recorded/100,overrun:(recorded-budget)/100,
    sourceCostIds:costs.map(x=>x.id),sourceExpenseIds:expenses.map(x=>x.id),currency:'USD',
    accountingVerified:false,settlementVerified:false,possibleDuplicateExpenses:true,profitVerified:false};
  }
  if(def.id==='job.labor_review.schedule'){
   if(params.ref.store!=='jobs'||!isDate(params.due))return problem('INVALID_LABOR_REVIEW','Choose an existing job and valid review date.');
   const job=lookup(data,params.ref,context);
   if(['cancelled','canceled'].includes(normalize(job.status)))return problem('JOB_CANCELLED','Cancelled jobs require historical review.');
   const costs=rows(data,'jobCosts').filter(x=>x.jobId===job.id&&x.category==='Labor'&&['estimate','actual'].includes(x.type));
   const valid=x=>typeof x.laborHours==='number'&&Number.isFinite(x.laborHours)&&x.laborHours>0&&(!x.businessId||x.businessId===(context.businessId||'local-business'));
   if(costs.length<2||costs.some(x=>!valid(x)))return problem('LABOR_EVIDENCE_INCOMPLETE','Review all manual labor hours and business ownership.');
   const estimated=costs.filter(x=>x.type==='estimate').reduce((n,x)=>n+x.laborHours,0);
   const actual=costs.filter(x=>x.type==='actual').reduce((n,x)=>n+x.laborHours,0);
   if(!estimated||actual<=estimated)return problem('NO_LABOR_OVERRUN','Recorded labor hours do not exceed the estimate.');
   const tasks=rows(data,'tasks').filter(t=>t.jobId===job.id&&t.taskKind==='job_labor_variance_review'&&!terminal(t));
   if(tasks.some(t=>t.businessId!==(context.businessId||'local-business')))return problem('CROSS_BUSINESS_TASK','An existing labor review needs inspection.');
   guard.push({laborCostsSnapshot:clone(costs),laborReviewTasks:clone(tasks)});
   result={jobId:job.id,estimatedLaborHours:estimated,recordedLaborHours:actual,varianceHours:actual-estimated,
    sourceCostIds:costs.map(x=>x.id),timesheetVerified:false,payrollVerified:false};
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
 const pendingRows=(data,c,commandId,ref)=>rows(data,'commandLog').filter(r=>r.kind==='pilot.command'&&r.status==='executing'&&r.commandId===commandId&&r.actor===c.actor&&r.businessId===c.businessId&&r.params?.ref?.store===ref?.store&&r.params?.ref?.id===ref?.id);
 const ctx=async()=>({actor:'local-owner',businessId:'local-business',...await context()});
 const publicPlan=row=>{const {binding,kind,events,...view}=row;return clone(view)};
 const bound=async(r,c)=>hash({commandId:r.commandId,params:r.params,effect:r.effect,actor:c.actor,businessId:c.businessId,guard:r.guard,defaults:r.effect==='draft'?r.result:null});
 const event=(type,c,detail)=>({type,at:now(),actor:c.actor,...detail});
 const fail=async(row,status,code,message,c)=>{await ledger.transition(row.id,[row.status],event(status,c,{code}),{status,error:{code,message}});return {id:row.id,status,error:{code,message}}};
 async function prepare(input,{requestKey}={}){
  const c=await ctx(),parsed=parse(input);if(parsed.status!=='parsed')return parsed;
  const def=definition(parsed.commandId);if(!await can(def.permission,c))return {status:'denied',error:{code:'PERMISSION_DENIED',message:'This actor cannot use that command.'}};
  const data=await snapshot(),latest=await ctx();
  if(c.actor!==latest.actor||c.businessId!==latest.businessId||!await can(def.permission,latest))return {status:'denied',error:{code:'PERMISSION_DENIED',message:'Context changed during preparation.'}};
  const prior=def.effect==='modification'&&parsed.params?.ref?pendingRows(data,c,def.id,parsed.params.ref).filter(r=>typeof requestKey!=='string'||r.id!=='pilot:command:'+requestKey):[];
  if(prior.length)return {status:'indeterminate',pendingIds:prior.map(r=>r.id),error:{code:'PRIOR_COMMAND_UNVERIFIED',message:'Inspect the earlier command receipt before preparing another action.'}};
  const resolved=resolve(parsed.status==='parsed'?{commandId:parsed.commandId,params:parsed.params}:input,data,c);
  if(!['ready','needs_review'].includes(resolved.status))return resolved;
  const key=requestKey||uid();if(!/^[A-Za-z0-9._:-]{1,160}$/.test(key))return problem('INVALID_REQUEST_KEY','Use a valid unique request key.');
  const {guard,...summary}=resolved,binding=await bound(resolved,c);
  const row={...summary,id:'pilot:command:'+key,kind:'pilot.command',version:VERSION,binding,actor:c.actor,businessId:c.businessId,
   context:{record:c.record||null,calendarDate:c.calendarDate||null,today:c.today||null,primaryTrade:c.primaryTrade||null,filter:c.filter||null},createdAt:now(),events:[event('prepared',c)]};
  try{return publicPlan(await ledger.create(row))}catch(error){return problem('AUDIT_OR_KEY_ERROR',error.message)}
 }
 async function approve(id){
  const c=await ctx(),row=await ledger.get(id);if(!row||row.kind!=='pilot.command')return problem('UNKNOWN_REQUEST','Prepare the command before approval.');
  if(!definition(row.commandId)||row.permission!==definition(row.commandId).permission||row.effect!==definition(row.commandId).effect||row.approval!==definition(row.commandId).approval)
   return {id,status:'denied',error:{code:'COMMAND_CONTRACT_MISMATCH',message:'Saved command cannot be approved under a different capability.'}};
  if(row.actor!==c.actor||row.businessId!==c.businessId||!await can(row.permission,c))return {status:'denied',error:{code:'PERMISSION_DENIED',message:'Approval requires the same authorized actor and business.'}};
  if(row.status!=='needs_review')return publicPlan(row);
  const fresh=resolve({commandId:row.commandId,params:row.params},await snapshot(),c);
  if(!['ready','needs_review'].includes(fresh.status)||await bound(fresh,c)!==row.binding)return fail(row,'stale','STALE_RECORDS','Records changed. Prepare and review a fresh command.',c);
  const result=await ledger.transition(id,['needs_review'],event('approved',c),{status:'approved',approvedBy:c.actor,approvedAt:now()});return publicPlan(result.row);
 }
 async function executeOnce(id){
  const c=await ctx(),row=await ledger.get(id);if(!row||row.kind!=='pilot.command')return problem('UNKNOWN_REQUEST','Only a prepared command request can execute.');
  if(row.actor!==c.actor||row.businessId!==c.businessId||!await can(row.permission,c))return {status:'denied',error:{code:'PERMISSION_DENIED',message:'Command is outside this actor or business capability.'}};
  // A persisted status label is not proof of owner authorization.
  const contract=definition(row.commandId);
  if(!contract||row.effect!==contract.effect||row.permission!==contract.permission||row.approval!==contract.approval)
   return {id,status:'denied',error:{code:'COMMAND_CONTRACT_MISMATCH',message:'Saved command does not match the registered capability.'}};
  if(contract.approval==='explicit'&&(row.status==='ready'||['approved','succeeded'].includes(row.status)&&
    (row.approvedBy!==c.actor||typeof row.approvedAt!=='string'||!row.approvedAt||
     !Array.isArray(row.events)||!row.events.some(e=>e.type==='approved'&&e.actor===c.actor))))
   return {id,status:'denied',error:{code:'APPROVAL_EVIDENCE_REQUIRED',message:'Explicit owner approval evidence is missing.'}};
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
   else if(row.commandId==='customer.contact.record')result=await ports.operation('customer.contact.record',
    {customerId:row.params.ref.id,quoteId:row.params.quoteId||'',method:row.params.method,
     notes:row.params.notes,outcome:row.params.outcome},
    {requestKey:'operation:'+id,recordGuard:clone(fresh.guard),actor:c.actor,businessId:c.businessId,approved:true});
   else if(row.commandId==='quotation.followup.schedule')result=await ports.operation('quotation.followup.schedule',{quoteId:row.params.ref.id,due:row.params.due},{requestKey:'operation:'+id,recordGuard:clone(fresh.guard),actor:c.actor,businessId:c.businessId,approved:true});
   else if(row.commandId==='job.change_order.review.schedule')result=await ports.operation('job.change_order.review.schedule',{jobId:row.params.ref.id,changeOrderId:row.params.changeOrderId,due:row.params.due},{requestKey:'operation:'+id,recordGuard:clone(fresh.guard),actor:c.actor,businessId:c.businessId,approved:true});
   else if(row.commandId==='job.change_order.authorization.record')result=await ports.operation('job.change_order.authorization.record',{jobId:row.params.ref.id,changeOrderId:row.params.changeOrderId,evidence:row.params.evidence},{requestKey:'operation:'+id,recordGuard:clone(fresh.guard),actor:c.actor,businessId:c.businessId,approved:true});
   else if(row.commandId==='job.cost_review.schedule')result=await ports.operation('job.cost_review.schedule',{jobId:row.params.ref.id,due:row.params.due,budget:fresh.result.budget,recordedCosts:fresh.result.recordedCosts},{requestKey:'operation:'+id,recordGuard:clone(fresh.guard),actor:c.actor,businessId:c.businessId,approved:true});
   else if(row.commandId==='job.labor_review.schedule')result=await ports.operation('job.labor_review.schedule',{jobId:row.params.ref.id,due:row.params.due,estimatedLaborHours:fresh.result.estimatedLaborHours,recordedLaborHours:fresh.result.recordedLaborHours},{requestKey:'operation:'+id,recordGuard:clone(fresh.guard),actor:c.actor,businessId:c.businessId,approved:true});
   else if(row.commandId==='invoice.payment_review.schedule')result=await ports.operation('invoice.payment_review.schedule',{invoiceId:row.params.ref.id,due:row.params.due,invoiceTotal:fresh.result.invoiceTotal,recordedPayments:fresh.result.recordedPayments},{requestKey:'operation:'+id,recordGuard:clone(fresh.guard),actor:c.actor,businessId:c.businessId,approved:true});
   else if(row.commandId==='opportunity.bid_review.schedule')result=await ports.operation('opportunity.bid_review.schedule',{opportunityId:row.params.ref.id,due:row.params.due,invitation:fresh.result.invitation,scope:fresh.result.scope,capacity:fresh.result.capacity},{requestKey:'operation:'+id,recordGuard:clone(fresh.guard),actor:c.actor,businessId:c.businessId,approved:true});
   else if(row.commandId==='quotation.reuse.create')result=await ports.operation('quotation.reuse.create',{sourceQuoteId:row.params.ref.id,title:fresh.result.title,category:fresh.result.category,amount:fresh.result.amount},{requestKey:'operation:'+id,recordGuard:clone(fresh.guard),actor:c.actor,businessId:c.businessId,approved:true});
   else if(row.commandId==='customer.economics_review.schedule')result=await ports.operation('customer.economics_review.schedule',{customerId:row.params.ref.id,due:row.params.due,received:fresh.result.received,recordedCosts:fresh.result.recordedCosts},{requestKey:'operation:'+id,recordGuard:clone(fresh.guard),actor:c.actor,businessId:c.businessId,approved:true});
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
  if(!definition(row.commandId)||row.permission!==definition(row.commandId).permission||row.effect!==definition(row.commandId).effect||row.approval!==definition(row.commandId).approval)
   return {id,status:'denied',error:{code:'COMMAND_CONTRACT_MISMATCH',message:'Recovery requires a registered unmodified command capability.'}};
  if(row.actor!==c.actor||row.businessId!==c.businessId||!await can(row.permission,c))
   return {id,status:'denied',error:{code:'PERMISSION_DENIED',message:'Recovery requires the original authorized actor and business.'}};
  if(row.commandId==='customer.economics_review.schedule'){
   if(row.status==='succeeded')return {...clone(row.outcome),reused:true};
   if(row.status!=='executing')return {id,status:row.status,error:{code:'RECOVERY_NOT_REQUIRED',message:'No interrupted customer economics review.'}};
   if(row.approvedBy!==c.actor||!row.events?.some(e=>e.type==='approved'))
    return {id,status:'indeterminate',error:{code:'APPROVAL_UNVERIFIED',message:'Original customer review approval missing.'}};
   const data=await snapshot(),p=row.params,receiptId='customer-economics-review:operation:'+id;
   const receipts=(data.commandLog||[]).filter(x=>x.id===receiptId);
   if(receipts.length!==1)return {id,status:'indeterminate',error:{code:'RECEIPT_MISSING',message:'Customer review receipt missing; no replay.'}};
   const receipt=receipts[0],expected=canonical({customerId:p.ref.id,due:p.due,
    received:row.result.received,recordedCosts:row.result.recordedCosts});
   if(receipt.kind!==row.commandId||receipt.requestPayload!==expected||receipt.actor!==row.actor||receipt.businessId!==row.businessId||
    !['task_created','existing_open_task'].includes(receipt.result)||receipt.profitVerified!==false||receipt.externalAccountingVerified!==false)
    return {id,status:'indeterminate',error:{code:'RECEIPT_MISMATCH',message:'Customer review receipt mismatch.'}};
   const tasks=(data.tasks||[]).filter(t=>t.id===receipt.resultId&&t.customerId===p.ref.id&&t.taskKind==='customer_economics_review'&&
    t.businessId===row.businessId&&t.economicsEvidence?.profitVerified===false&&t.economicsEvidence?.bankSettlementVerified===false);
   if(tasks.length!==1)return {id,status:'indeterminate',error:{code:'TASK_UNVERIFIED',message:'Customer review task evidence missing.'}};
   if(receipt.result==='task_created'&&!(data.commandLog||[]).some(e=>e.kind==='domain.event'&&
    e.correlationId===receiptId&&e.type==='task.created'&&e.ref?.id===receipt.resultId&&e.businessId===row.businessId))
    return {id,status:'indeterminate',error:{code:'AUDIT_UNVERIFIED',message:'Customer review audit missing.'}};
   const outcome={id,status:'succeeded',effect:row.effect,result:{id:receipt.resultId,reused:receipt.result!=='task_created',reconciled:true,commandKey:receiptId}};
   const changed=await ledger.transition(id,['executing'],event('reconciled',c,{receiptId}),{status:'succeeded',outcome});
   return changed.claimed?outcome:changed.row.status==='succeeded'?{...clone(changed.row.outcome),reused:true}:
    {id,status:'indeterminate',error:{code:'RECOVERY_RACE',message:'Customer review changed during recovery.'}};
  }
  if(row.commandId==='quotation.reuse.create'){
   if(row.status==='succeeded')return {...clone(row.outcome),reused:true};
   if(row.status!=='executing')return {id,status:row.status,error:{code:'RECOVERY_NOT_REQUIRED',message:'No interrupted quote reuse.'}};
   if(row.approvedBy!==c.actor||!row.events?.some(e=>e.type==='approved'))
    return {id,status:'indeterminate',error:{code:'APPROVAL_UNVERIFIED',message:'Original reuse approval missing.'}};
   const data=await snapshot(),p=row.params,receiptId='quote-reuse:operation:'+id;
   const receipts=(data.commandLog||[]).filter(x=>x.id===receiptId);
   if(receipts.length!==1)return {id,status:'indeterminate',error:{code:'RECEIPT_MISSING',message:'Reuse receipt missing; no replay.'}};
   const receipt=receipts[0],expected=canonical({sourceQuoteId:p.ref.id,title:row.result.title,
    category:row.result.category,amount:row.result.amount});
   if(receipt.kind!==row.commandId||receipt.requestPayload!==expected||receipt.actor!==row.actor||receipt.businessId!==row.businessId||
    !['draft_created','existing_open_draft'].includes(receipt.result)||receipt.customerAuthorizationCopied!==false)
    return {id,status:'indeterminate',error:{code:'RECEIPT_MISMATCH',message:'Reuse receipt mismatch.'}};
   const draft=(data.quotes||[]).filter(q=>q.id===receipt.resultId&&q.sourceQuoteId===p.ref.id&&q.businessId===row.businessId&&
    (receipt.result!=='draft_created'||q.reuseReceiptId===receiptId)&&q.reuseEvidence?.customerAuthorizationCopied===false);
   if(draft.length!==1)return {id,status:'indeterminate',error:{code:'DRAFT_UNVERIFIED',message:'Reused draft evidence missing.'}};
   if(receipt.result==='draft_created'&&!(data.commandLog||[]).some(e=>e.kind==='domain.event'&&
    e.correlationId===receiptId&&e.type==='quotation.created'&&e.ref?.id===receipt.resultId&&e.businessId===row.businessId))
    return {id,status:'indeterminate',error:{code:'AUDIT_UNVERIFIED',message:'Quotation creation audit missing.'}};
   const outcome={id,status:'succeeded',effect:row.effect,result:{id:receipt.resultId,reused:receipt.result!=='draft_created',reconciled:true,commandKey:receiptId}};
   const changed=await ledger.transition(id,['executing'],event('reconciled',c,{receiptId}),{status:'succeeded',outcome});
   return changed.claimed?outcome:changed.row.status==='succeeded'?{...clone(changed.row.outcome),reused:true}:
    {id,status:'indeterminate',error:{code:'RECOVERY_RACE',message:'Quote reuse changed during recovery.'}};
  }
  if(row.commandId==='opportunity.bid_review.schedule'){
   if(row.status==='succeeded')return {...clone(row.outcome),reused:true};
   if(row.status!=='executing')return {id,status:row.status,error:{code:'RECOVERY_NOT_REQUIRED',message:'No interrupted bid review.'}};
   if(row.approvedBy!==c.actor||!row.events?.some(e=>e.type==='approved'))
    return {id,status:'indeterminate',error:{code:'APPROVAL_UNVERIFIED',message:'Original approval missing.'}};
   const data=await snapshot(),p=row.params,receiptId='bid-qualification-review:operation:'+id;
   const receipts=(data.commandLog||[]).filter(x=>x.id===receiptId);
   if(receipts.length!==1)return {id,status:'indeterminate',error:{code:'RECEIPT_MISSING',message:'Bid review receipt missing; no replay.'}};
   const receipt=receipts[0],expected=canonical({opportunityId:p.ref.id,due:p.due,
    invitation:row.result.invitation,scope:row.result.scope,capacity:row.result.capacity});
   if(receipt.kind!==row.commandId||receipt.requestPayload!==expected||receipt.actor!==row.actor||receipt.businessId!==row.businessId||
    !['task_created','existing_open_task'].includes(receipt.result)||receipt.bidSubmitted!==false)
    return {id,status:'indeterminate',error:{code:'RECEIPT_MISMATCH',message:'Bid review receipt mismatch.'}};
   const tasks=(data.tasks||[]).filter(t=>t.id===receipt.resultId&&t.opportunityId===p.ref.id&&
    t.taskKind==='bid_qualification_review'&&t.businessId===row.businessId&&
    t.qualificationEvidence?.bidSubmitted===false&&t.qualificationEvidence?.independentlyVerified===false);
   if(tasks.length!==1)return {id,status:'indeterminate',error:{code:'TASK_UNVERIFIED',message:'Bid review task evidence missing.'}};
   if(receipt.result==='task_created'&&!(data.commandLog||[]).some(e=>e.kind==='domain.event'&&
    e.correlationId===receiptId&&e.type==='task.created'&&e.ref?.id===receipt.resultId&&e.businessId===row.businessId))
    return {id,status:'indeterminate',error:{code:'AUDIT_UNVERIFIED',message:'Bid review audit missing.'}};
   const outcome={id,status:'succeeded',effect:row.effect,result:{id:receipt.resultId,reused:receipt.result!=='task_created',reconciled:true,commandKey:receiptId}};
   const changed=await ledger.transition(id,['executing'],event('reconciled',c,{receiptId}),{status:'succeeded',outcome});
   return changed.claimed?outcome:changed.row.status==='succeeded'?{...clone(changed.row.outcome),reused:true}:
    {id,status:'indeterminate',error:{code:'RECOVERY_RACE',message:'Bid review changed during recovery.'}};
  }
  if(row.commandId==='invoice.payment_review.schedule'){
   if(row.status==='succeeded')return {...clone(row.outcome),reused:true};
   if(row.status!=='executing')return {id,status:row.status,error:{code:'RECOVERY_NOT_REQUIRED',message:'No interrupted payment review.'}};
   if(row.approvedBy!==c.actor||!row.events?.some(e=>e.type==='approved'))
    return {id,status:'indeterminate',error:{code:'APPROVAL_UNVERIFIED',message:'Original payment review approval missing.'}};
   const data=await snapshot(),p=row.params,receiptId='invoice-payment-review:operation:'+id;
   const receipts=(data.commandLog||[]).filter(x=>x.id===receiptId);
   if(receipts.length!==1)return {id,status:'indeterminate',error:{code:'RECEIPT_MISSING',message:'Payment review receipt missing; no replay.'}};
   const receipt=receipts[0],expected=canonical({invoiceId:p.ref.id,due:p.due,
    invoiceTotal:row.result.invoiceTotal,recordedPayments:row.result.recordedPayments});
   if(receipt.kind!==row.commandId||receipt.requestPayload!==expected||receipt.actor!==row.actor||receipt.businessId!==row.businessId||
    !['task_created','existing_open_task'].includes(receipt.result)||receipt.externalAccountingVerified!==false||receipt.settlementVerified!==false)
    return {id,status:'indeterminate',error:{code:'RECEIPT_MISMATCH',message:'Payment review receipt differs from approval.'}};
   const tasks=(data.tasks||[]).filter(t=>t.id===receipt.resultId&&t.invoiceId===p.ref.id&&
    t.taskKind==='invoice_payment_reconciliation'&&t.businessId===row.businessId&&
    t.paymentEvidence?.settlementVerified===false&&t.paymentEvidence?.externalAccountingVerified===false);
   if(tasks.length!==1)return {id,status:'indeterminate',error:{code:'TASK_UNVERIFIED',message:'Payment review evidence missing.'}};
   if(receipt.result==='task_created'&&!(data.commandLog||[]).some(e=>e.kind==='domain.event'&&
    e.correlationId===receiptId&&e.type==='task.created'&&e.ref?.id===receipt.resultId&&e.businessId===row.businessId))
    return {id,status:'indeterminate',error:{code:'AUDIT_UNVERIFIED',message:'Payment task audit missing.'}};
   const outcome={id,status:'succeeded',effect:row.effect,result:{id:receipt.resultId,reused:receipt.result!=='task_created',reconciled:true,commandKey:receiptId}};
   const changed=await ledger.transition(id,['executing'],event('reconciled',c,{receiptId}),{status:'succeeded',outcome});
   return changed.claimed?outcome:changed.row.status==='succeeded'?{...clone(changed.row.outcome),reused:true}:
    {id,status:'indeterminate',error:{code:'RECOVERY_RACE',message:'Payment review changed during recovery.'}};
  }
  if(row.commandId==='job.labor_review.schedule'){
   if(row.status==='succeeded')return {...clone(row.outcome),reused:true};
   if(row.status!=='executing')return {id,status:row.status,error:{code:'RECOVERY_NOT_REQUIRED',message:'No interrupted labor review.'}};
   if(row.approvedBy!==c.actor||!row.events?.some(e=>e.type==='approved'))
    return {id,status:'indeterminate',error:{code:'APPROVAL_UNVERIFIED',message:'Original approval missing.'}};
   const data=await snapshot(),p=row.params,receiptId='job-labor-review:operation:'+id;
   const receipts=(data.commandLog||[]).filter(x=>x.id===receiptId);
   if(receipts.length!==1)return {id,status:'indeterminate',error:{code:'RECEIPT_MISSING',message:'Labor review receipt missing; no replay.'}};
   const receipt=receipts[0],expected=canonical({jobId:p.ref.id,due:p.due,
    estimatedLaborHours:row.result.estimatedLaborHours,recordedLaborHours:row.result.recordedLaborHours});
   if(receipt.kind!==row.commandId||receipt.requestPayload!==expected||receipt.actor!==row.actor||receipt.businessId!==row.businessId||
    !['task_created','existing_open_task'].includes(receipt.result))
    return {id,status:'indeterminate',error:{code:'RECEIPT_MISMATCH',message:'Labor review receipt differs from approval.'}};
   const tasks=(data.tasks||[]).filter(t=>t.id===receipt.resultId&&t.jobId===p.ref.id&&
    t.taskKind==='job_labor_variance_review'&&t.businessId===row.businessId&&
    t.laborEvidence?.timesheetVerified===false&&t.laborEvidence?.payrollVerified===false);
   if(tasks.length!==1)return {id,status:'indeterminate',error:{code:'TASK_UNVERIFIED',message:'Labor review task or evidence missing.'}};
   if(receipt.result==='task_created'&&!(data.commandLog||[]).some(e=>e.kind==='domain.event'&&
    e.correlationId===receiptId&&e.type==='task.created'&&e.ref?.id===receipt.resultId&&e.businessId===row.businessId))
    return {id,status:'indeterminate',error:{code:'AUDIT_UNVERIFIED',message:'Task audit missing.'}};
   const outcome={id,status:'succeeded',effect:row.effect,result:{id:receipt.resultId,reused:receipt.result!=='task_created',reconciled:true,commandKey:receiptId}};
   const changed=await ledger.transition(id,['executing'],event('reconciled',c,{receiptId}),{status:'succeeded',outcome});
   return changed.claimed?outcome:changed.row.status==='succeeded'?{...clone(changed.row.outcome),reused:true}:
    {id,status:'indeterminate',error:{code:'RECOVERY_RACE',message:'Review changed during recovery.'}};
  }
  if(row.commandId==='job.cost_review.schedule'){
   if(row.status==='succeeded')return {...clone(row.outcome),reused:true};
   if(row.status!=='executing')return {id,status:row.status,error:{code:'RECOVERY_NOT_REQUIRED',message:'No interrupted job cost review.'}};
   if(row.approvedBy!==c.actor||!row.events?.some(e=>e.type==='approved'))
    return {id,status:'indeterminate',error:{code:'APPROVAL_UNVERIFIED',message:'Original approval cannot be verified.'}};
   const data=await snapshot(),p=row.params,receiptId='job-cost-review:operation:'+id;
   const receipts=(data.commandLog||[]).filter(x=>x.id===receiptId);
   if(receipts.length!==1)return {id,status:'indeterminate',error:{code:'RECEIPT_MISSING',message:'Review receipt missing; no replay.'}};
   const receipt=receipts[0],expected=canonical({jobId:p.ref.id,due:p.due,budget:row.result.budget,recordedCosts:row.result.recordedCosts});
   if(receipt.kind!==row.commandId||receipt.requestPayload!==expected||receipt.actor!==row.actor||receipt.businessId!==row.businessId||
    !['task_created','existing_open_task'].includes(receipt.result))
    return {id,status:'indeterminate',error:{code:'RECEIPT_MISMATCH',message:'Cost review receipt differs from the approval.'}};
   const tasks=(data.tasks||[]).filter(t=>t.id===receipt.resultId&&t.jobId===p.ref.id&&t.taskKind==='job_cost_reconciliation'&&
    t.businessId===row.businessId&&t.financialEvidence?.profitVerified===false&&t.financialEvidence?.externalAccountingVerified===false);
   if(tasks.length!==1)return {id,status:'indeterminate',error:{code:'TASK_UNVERIFIED',message:'Reviewed task or evidence is missing.'}};
   if(receipt.result==='task_created'&&!(data.commandLog||[]).some(e=>e.kind==='domain.event'&&e.correlationId===receiptId&&
    e.type==='task.created'&&e.ref?.id===receipt.resultId&&e.businessId===row.businessId))
    return {id,status:'indeterminate',error:{code:'AUDIT_UNVERIFIED',message:'Task audit missing.'}};
   const outcome={id,status:'succeeded',effect:row.effect,result:{id:receipt.resultId,reused:receipt.result!=='task_created',reconciled:true,commandKey:receiptId}};
   const changed=await ledger.transition(id,['executing'],event('reconciled',c,{receiptId}),{status:'succeeded',outcome});
   return changed.claimed?outcome:changed.row.status==='succeeded'?{...clone(changed.row.outcome),reused:true}:
    {id,status:'indeterminate',error:{code:'RECOVERY_RACE',message:'Review changed during reconciliation.'}};
  }
  if(row.commandId==='job.change_order.authorization.record'){
   if(row.status==='succeeded')return {...clone(row.outcome),reused:true};
   if(row.status!=='executing')return {id,status:row.status,error:{code:'RECOVERY_NOT_REQUIRED',message:'No interrupted authorization to reconcile.'}};
   if(row.approvedBy!==c.actor||!row.events?.some(e=>e.type==='approved'))
    return {id,status:'indeterminate',error:{code:'APPROVAL_UNVERIFIED',message:'Owner approval missing.'}};
   const data=await snapshot(),p=row.params,receiptId='change-authorization:operation:'+id;
   const receipts=(data.commandLog||[]).filter(x=>x.id===receiptId);
   if(receipts.length!==1)return {id,status:'indeterminate',error:{code:'RECEIPT_MISSING',message:'Authorization receipt missing; no automatic replay.'}};
   const receipt=receipts[0],expected=canonical({jobId:p.ref.id,changeOrderId:p.changeOrderId,evidence:p.evidence});
   if(receipt.kind!==row.commandId||receipt.actor!==row.actor||receipt.businessId!==row.businessId||
    receipt.requestPayload!==expected||receipt.result!=='owner_attested_documented'||receipt.providerVerified!==false)
    return {id,status:'indeterminate',error:{code:'RECEIPT_MISMATCH',message:'Authorization receipt mismatch.'}};
   const jobs=(data.jobs||[]).filter(j=>j.id===p.ref.id&&(!j.businessId||j.businessId===row.businessId));
   const changes=jobs[0]?.changeOrders?.filter(x=>x?.id===p.changeOrderId&&x.status==='approved_recorded'&&
    x.authorizationReceiptId===receiptId&&x.approvalEvidence===p.evidence&&
    x.customerAuthorization?.kind==='owner_attested_documented'&&x.customerAuthorization.providerVerified===false)||[];
   const tasks=(data.tasks||[]).filter(t=>t.id===receipt.reviewTaskId&&t.jobId===p.ref.id&&t.changeOrderId===p.changeOrderId&&
    t.status==='Done'&&t.authorizationReceiptId===receiptId&&t.businessId===row.businessId);
   if(jobs.length!==1||changes.length!==1||tasks.length!==1)
    return {id,status:'indeterminate',error:{code:'LINKED_STATE_UNVERIFIED',message:'Job or task attestation is incomplete.'}};
   for(const [type,store,recordId] of [['job.updated','jobs',p.ref.id],['task.completed','tasks',receipt.reviewTaskId]]){
    const event=(data.commandLog||[]).filter(e=>e.kind==='domain.event'&&e.correlationId===receiptId&&
     e.type===type&&e.ref?.store===store&&e.ref.id===recordId&&e.businessId===row.businessId);
    if(event.length!==1)return {id,status:'indeterminate',error:{code:'AUDIT_UNVERIFIED',message:'Linked authorization audit missing.'}};
   }
   const outcome={id,status:'succeeded',effect:row.effect,result:{id:p.ref.id,reviewTaskId:receipt.reviewTaskId,
    reused:true,reconciled:true,commandKey:receiptId,providerVerified:false}};
   const changed=await ledger.transition(id,['executing'],event('reconciled',c,{receiptId}),{status:'succeeded',outcome});
   return changed.claimed?outcome:changed.row.status==='succeeded'?{...clone(changed.row.outcome),reused:true}:
    {id,status:'indeterminate',error:{code:'RECOVERY_RACE',message:'Command changed during recovery.'}};
  }
  if(row.commandId==='job.change_order.review.schedule'){
   if(row.status==='succeeded')return {...clone(row.outcome),reused:true};
   if(row.status!=='executing')return {id,status:row.status,error:{code:'RECOVERY_NOT_REQUIRED',message:'No interrupted change-order action to reconcile.'}};
   if(row.approvedBy!==c.actor||!row.events?.some(e=>e.type==='approved'))
    return {id,status:'indeterminate',error:{code:'APPROVAL_UNVERIFIED',message:'Owner approval cannot be verified.'}};
   const data=await snapshot(),p=row.params,receiptId='change-review:operation:'+id;
   const receipts=(data.commandLog||[]).filter(x=>x.id===receiptId);
   if(receipts.length!==1)return {id,status:'indeterminate',error:{code:'RECEIPT_MISSING',message:'Change-order receipt missing; do not replay.'}};
   const receipt=receipts[0],expected=canonical({jobId:p.ref.id,changeOrderId:p.changeOrderId,due:p.due});
   if(receipt.kind!==row.commandId||receipt.requestPayload!==expected||receipt.actor!==row.actor||receipt.businessId!==row.businessId||
    !['task_created','existing_open_task'].includes(receipt.result))
    return {id,status:'indeterminate',error:{code:'RECEIPT_MISMATCH',message:'Receipt differs from the reviewed operation.'}};
   const matching=(data.tasks||[]).filter(t=>t.id===receipt.resultId&&t.jobId===p.ref.id&&t.changeOrderId===p.changeOrderId&&
    t.taskKind==='change_order_review'&&t.businessId===row.businessId&&t.customerAuthorizationStatus==='unverified');
   if(matching.length!==1)return {id,status:'indeterminate',error:{code:'TASK_UNVERIFIED',message:'Linked internal review task cannot be verified.'}};
   if(receipt.result==='task_created'&&!(data.commandLog||[]).some(e=>e.kind==='domain.event'&&e.correlationId===receiptId&&
    e.type==='task.created'&&e.ref?.id===receipt.resultId&&e.businessId===row.businessId))
    return {id,status:'indeterminate',error:{code:'EVENT_UNVERIFIED',message:'Task audit event missing.'}};
   const outcome={id,status:'succeeded',effect:row.effect,result:{id:receipt.resultId,reused:receipt.result!=='task_created',reconciled:true,commandKey:receiptId}};
   const changed=await ledger.transition(id,['executing'],event('reconciled',c,{receiptId}),{status:'succeeded',outcome});
   return changed.claimed?outcome:changed.row.status==='succeeded'?{...clone(changed.row.outcome),reused:true}:
    {id,status:'indeterminate',error:{code:'RECOVERY_RACE',message:'Approval state changed during recovery.'}};
  }
  if(row.commandId==='customer.contact.record'){
   if(row.status==='succeeded')return {...clone(row.outcome),reused:true};
   if(row.status!=='executing')return {id,status:row.status,error:{code:'RECOVERY_NOT_REQUIRED',message:'Only interrupted execution can be reconciled.'}};
   if(row.approvedBy!==c.actor||!row.events?.some(e=>e.type==='approved'))
    return {id,status:'indeterminate',error:{code:'APPROVAL_UNVERIFIED',message:'Cannot prove owner approval.'}};
   const data=await snapshot(),receiptId='contact:operation:'+id;
   const matches=(data.commandLog||[]).filter(x=>x.id===receiptId);
   if(matches.length!==1)return {id,status:'indeterminate',error:{code:'RECEIPT_MISSING',message:'Contact operation receipt is missing; do not repeat automatically.'}};
   const receipt=matches[0],p=row.params;
   const payload={customerId:p.ref.id,quoteId:p.quoteId||'',method:p.method,notes:p.notes,outcome:p.outcome};
   if(receipt.kind!=='customer.contact.record'||receipt.requestPayload!==canonical(payload)||
    receipt.actor!==row.actor||receipt.businessId!==row.businessId||
    receipt.outcome!==p.outcome||!Array.isArray(receipt.resolvedTaskIds))
    return {id,status:'indeterminate',error:{code:'RECEIPT_MISMATCH',message:'Contact receipt does not match approval.'}};
   const contacts=(data.events||[]).filter(e=>e.id===receipt.resultId&&e.kind==='customer_contact'&&
    e.customerId===p.ref.id&&e.quoteId===(p.quoteId||'')&&e.outcome===p.outcome&&
    e.actor===row.actor&&e.businessId===row.businessId&&e.providerVerified===false);
   if(contacts.length!==1)
    return {id,status:'indeterminate',error:{code:'CONTACT_UNVERIFIED',message:'Matching contact record could not be verified.'}};
   if(p.quoteId){
    const quote=(data.quotes||[]).find(q=>q.id===p.quoteId&&q.customerId===p.ref.id&&
     (!q.businessId||q.businessId===row.businessId));
    if(!quote)return {id,status:'indeterminate',error:{code:'QUOTE_UNVERIFIED',message:'Related quotation could not be verified.'}};
    const quotationAudit=(data.commandLog||[]).filter(e=>e.kind==='domain.event'&&
     e.correlationId===receiptId&&e.type==='quotation.updated'&&e.ref?.id===p.quoteId&&
     e.businessId===row.businessId);
    if(quotationAudit.length!==1)
     return {id,status:'indeterminate',error:{code:'AUDIT_UNVERIFIED',message:'Related quotation audit missing.'}};
    if(p.outcome==='reached'&&quote.followupResolution?.contactEventId!==receipt.resultId)
     return {id,status:'indeterminate',error:{code:'RESOLUTION_UNVERIFIED',message:'Owner-attested quotation resolution is not linked to contact.'}};
    if(p.outcome==='attempted'&&receipt.resolvedTaskIds.length)
     return {id,status:'indeterminate',error:{code:'RESOLUTION_MISMATCH',message:'Attempted contact cannot resolve tasks.'}};
   }else if(receipt.resolvedTaskIds.length)
    return {id,status:'indeterminate',error:{code:'RESOLUTION_MISMATCH',message:'Customer-only contact cannot resolve quote tasks.'}};
   if(receipt.resolvedTasks!==receipt.resolvedTaskIds.length)
    return {id,status:'indeterminate',error:{code:'RESOLUTION_MISMATCH',message:'Task closure count differs from saved evidence.'}};
   for(const taskId of receipt.resolvedTaskIds){
    const task=(data.tasks||[]).find(t=>t.id===taskId&&t.quoteId===p.quoteId&&
     t.customerId===p.ref.id&&t.contactEventId===receipt.resultId&&
     t.completedReason==='owner_attested_customer_reached'&&
     (!t.businessId||t.businessId===row.businessId));
    const audit=(data.commandLog||[]).filter(e=>e.kind==='domain.event'&&
     e.correlationId===receiptId&&e.type==='task.completed'&&e.ref?.store==='tasks'&&
     e.ref.id===taskId&&e.businessId===row.businessId);
    if(!task||audit.length!==1)
     return {id,status:'indeterminate',error:{code:'TASK_UNVERIFIED',message:'Completed follow-up task or matching audit is missing.'}};
   }
   const outcome={id,status:'succeeded',effect:row.effect,result:{
    id:receipt.resultId,reused:true,commandKey:receiptId,reconciled:true,
    outcome:p.outcome,resolvedTasks:receipt.resolvedTasks,providerVerified:false}};
   const changed=await ledger.transition(id,['executing'],event('reconciled',c,{receiptId}),{status:'succeeded',outcome});
   if(!changed.claimed)return changed.row.status==='succeeded'?{...clone(changed.row.outcome),reused:true}:
    {id,status:'indeterminate',error:{code:'RECOVERY_RACE',message:'Contact command changed during reconciliation.'}};
   return outcome;
  }
  if(row.commandId==='calendar.conflict.reschedule'){
   if(row.status==='succeeded')return {...clone(row.outcome),reused:true};
   if(row.status!=='executing')return {id,status:row.status,error:{code:'RECOVERY_NOT_REQUIRED',message:'Only interrupted execution can be reconciled.'}};
   if(row.approvedBy!==c.actor||!row.events?.some(e=>e.type==='approved'))
    return {id,status:'indeterminate',error:{code:'APPROVAL_UNVERIFIED',message:'The original approval cannot be verified.'}};
   const data=await snapshot(),receiptId='calendar-reschedule:operation:'+id;
   const receipts=(data.commandLog||[]).filter(x=>x.id===receiptId);
   if(receipts.length!==1)return {id,status:'indeterminate',error:{code:'RECEIPT_MISSING',message:'Calendar operation receipt missing; do not replay.'}};
   const receipt=receipts[0],expected=canonical({eventId:row.params.ref.id,date:row.params.date,time:row.params.time});
   if(receipt.kind!==row.commandId||receipt.requestPayload!==expected||
    receipt.actor!==row.actor||receipt.businessId!==row.businessId||
    receipt.resultId!==row.params.ref.id||receipt.result!=='event_moved')
    return {id,status:'indeterminate',error:{code:'RECEIPT_MISMATCH',message:'Calendar receipt differs from the approved change.'}};
   const found=(data.calendarEntries||[]).filter(x=>x.id===receipt.resultId&&
    x.date===row.params.date&&x.time===row.params.time&&(!x.businessId||x.businessId===row.businessId));
   if(found.length!==1)return {id,status:'indeterminate',error:{code:'EVENT_UNVERIFIED',message:'Rescheduled event is missing or was changed again.'}};
   const domain=(data.commandLog||[]).filter(x=>x.kind==='domain.event'&&
    x.correlationId===receiptId&&x.type==='calendar.updated'&&
    x.ref?.store==='calendarEntries'&&x.ref.id===receipt.resultId&&x.businessId===row.businessId);
   const audits=(data.calendarAudit||[]).filter(x=>x.kind==='calendar.conflict.rescheduled'&&
    x.correlationId===receiptId&&x.sourceId===receipt.resultId&&x.actor===row.actor&&
    x.businessId===row.businessId&&x.oldDate===receipt.oldDate&&x.oldTime===receipt.oldTime&&
    x.newDate===row.params.date&&x.newTime===row.params.time);
   if(domain.length!==1||audits.length!==1)
    return {id,status:'indeterminate',error:{code:'AUDIT_UNVERIFIED',message:'Matching calendar change evidence is incomplete.'}};
   const outcome={id,status:'succeeded',effect:row.effect,
    result:{id:receipt.resultId,reused:true,commandKey:receiptId,reconciled:true}};
   const changed=await ledger.transition(id,['executing'],event('reconciled',c,{receiptId}),{status:'succeeded',outcome});
   if(!changed.claimed)return changed.row.status==='succeeded'?{...clone(changed.row.outcome),reused:true}:
    {id,status:'indeterminate',error:{code:'RECOVERY_RACE',message:'Calendar command changed while reconciling.'}};
   return outcome;
  }
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
 async function pending({commandId,ref}={}){
  const c=await ctx(),def=definition(commandId);
  if(!def||def.effect!=='modification'||!ref||typeof ref.store!=='string'||typeof ref.id!=='string')throw Error('Known modification and record reference required');
  if(!await can(def.permission,c))return problem('PERMISSION_DENIED','Cannot inspect this command.');
  const data=await snapshot(),latest=await ctx();
  if(c.actor!==latest.actor||c.businessId!==latest.businessId||!await can(def.permission,latest))return problem('PERMISSION_DENIED','Context changed during command inspection.');
  return pendingRows(data,c,commandId,ref).map(r=>({id:r.id,status:r.status,commandId:r.commandId}));
 }
 async function reject(id){const c=await ctx(),row=await ledger.get(id);if(!row||row.actor!==c.actor||row.businessId!==c.businessId)return problem('UNKNOWN_REQUEST','Request is not available.');const result=await ledger.transition(id,['ready','needs_review','approved'],event('rejected',c),{status:'rejected'});return publicPlan(result.row)}
 async function history(id){const c=await ctx(),row=await ledger.get(id);return row?.kind==='pilot.command'&&row.actor===c.actor&&row.businessId===c.businessId?clone(row.events):[]}
 const guarded=fn=>async(...args)=>{try{return await fn(...args)}catch(error){return {status:'failed',error:{code:'COMMAND_UNAVAILABLE',message:String(error.message||error)}}}};
 return Object.freeze({prepare:guarded(prepare),pending:guarded(pending),approve:guarded(approve),execute,reconcile:guarded(reconcile),reject:guarded(reject),parse,definitions,history,get:async id=>{const c=await ctx(),row=await ledger.get(id);return row?.kind==='pilot.command'&&row.actor===c.actor&&row.businessId===c.businessId?publicPlan(row):null}});
}
return Object.freeze({version:VERSION,definitions,parse,resolve,validateReferences,prepareDraft,validateDraft,filterRecords,staleQuote,findRecords,createRuntime,createLedger,canonical,isDate,dateText,terminal});
});
