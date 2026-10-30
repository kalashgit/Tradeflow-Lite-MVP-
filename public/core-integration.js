/* TradeFlow Core Integration 01.
 * Deterministic provider-independent record commands and mapped supplier connections.
 * No AI, network, provider secrets, verified routing claims, or automatic data migrations.
 */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./record-interpreter.js'):root?.TradeFlowRecordInterpreter,typeof module==='object'&&module.exports?require('./business-events.js'):root?.TradeFlowBusinessEvents);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowCore=api;
})(typeof globalThis==='object'?globalThis:null,function(records,domainEvents){
 'use strict';
 const nonempty=v=>String(v==null?'':v).trim();
 const brief=(v,max=240)=>nonempty(v).slice(0,max);
 const validDate=v=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v);
 const dataArray=(data,key)=>Array.isArray(data?.[key])?data[key]:[];
 const stable=v=>JSON.stringify(stableOrder(v));
 function stableOrder(v){if(Array.isArray(v))return v.map(stableOrder);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stableOrder(v[k])]));return v}
 async function hashSource(value){
  if(typeof value!=='string'||!value.trim()||value.length>4000)throw Error('Original wording must contain 1–4000 characters');
  if(!globalThis.crypto?.subtle)throw Error('Secure local hashing is unavailable');
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 }
 function customerFields(input){
  if(!records?.validateCustomer)throw Error('Customer interpreter is unavailable');
  const review=records.validateCustomer(input);
  if(review.missingRequired.length||review.issues.some(x=>x.blocking))throw Error(review.issues.find(x=>x.blocking)?.message||'Customer name is required');
  return review.fields;
 }
 function customerDuplicates(fields,customers,businessId='local-business'){return records.findDuplicates(fields,customers,{businessId}).slice().sort((a,b)=>a.ref.id.localeCompare(b.ref.id))}
 function validateDuplicateReview(duplicates,reviewed=[]){
  if(!Array.isArray(reviewed)||reviewed.some(x=>typeof x!=='string')||new Set(reviewed).size!==reviewed.length||stable(reviewed.slice().sort())!==stable(duplicates.map(x=>x.ref.id).sort()))throw Error('Review likely existing customers before creating a separate customer');
 }
 function position(obj){
  if(!obj)return null;
  let latitude=obj.latitude??obj.lat,longitude=obj.longitude??obj.lon??obj.lng;
  if((latitude==null||latitude==='')&&obj.coordinates){
   let p=obj.coordinates;
   if(typeof p==='string'){try{p=JSON.parse(p)}catch{p=null}}
   if(p&&typeof p==='object'){latitude=p.latitude??p.lat;longitude=p.longitude??p.lng??p.lon}
  }
  if(latitude==null||latitude===''||longitude==null||longitude==='')return null;
  const lat=Number(latitude),lon=Number(longitude);
  return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null;
 }
 function prepare(kind,input,data,uid,now,context={}){
  const id=typeof uid==='function'?uid():String(uid||'');
  if(!id)throw Error('Unique ID generator unavailable');
  const when=typeof now==='function'?now():now||new Date().toISOString();
  const body=input||{},get=(name,key)=>dataArray(data,name).find(x=>x.id===key);
  if(kind==='customer.create'){
   if(Object.keys(body).some(k=>!['fields','reviewedDuplicateIds','sourceHash'].includes(k)))throw Error('Unsupported customer command parameters');
   const fields=customerFields(body.fields),duplicates=customerDuplicates(fields,dataArray(data,'customers'),context.businessId);
   validateDuplicateReview(duplicates,body.reviewedDuplicateIds===undefined?[]:body.reviewedDuplicateIds);
   if(body.sourceHash!==undefined&&body.sourceHash!==''&&!/^[a-f0-9]{64}$/.test(body.sourceHash))throw Error('Invalid original wording hash');
   if(get('customers',id))throw Error('Customer identifier already exists');
   return {resultId:id,writes:[{store:'customers',record:{...fields,id,updatedAt:when}}]};
  }
  if(kind==='supplier.save'){
   const name=brief(body.name,140),existing=body.id?get('suppliers',body.id):null;
   if(!name)throw Error('Supplier name is required');
   if(body.id&&!existing)throw Error('Supplier record no longer exists');
   const address=brief(body.address,300),enteredPoint=position(body),priorPoint=position(existing);
   if((nonempty(body.latitude)||nonempty(body.longitude))&&!enteredPoint)throw Error('Enter both valid latitude and longitude coordinates');
   // Coordinates are pre-filled on edit. Never reuse stale ones after an address change.
   const changedAddress=!!existing&&brief(existing.address,300)!==address;
   const unchangedPoint=priorPoint&&enteredPoint&&priorPoint.lat===enteredPoint.lat&&priorPoint.lon===enteredPoint.lon;
   const point=changedAddress&&unchangedPoint?null:enteredPoint;
   const moved=changedAddress||!!(priorPoint&&point&&(priorPoint.lat!==point.lat||priorPoint.lon!==point.lon));
   const pic=String(body.photoUrl||'').trim();
   if(pic&&!(pic.startsWith('https://')&&pic.length<2500)&&!(/^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(pic)&&pic.length<350000))
    throw Error('Business photo must be an HTTPS image URL or a small uploaded image');
   return {resultId:existing?.id||id,writes:[{store:'suppliers',record:{...existing,id:existing?.id||id,name,address,website:brief(body.website,400),phone:brief(body.phone,80),email:brief(body.email,180).toLowerCase(),
    category:brief(body.category,70),preferred:body.preferred===true||body.preferred==='on',
    businessHours:brief(body.businessHours,160),photoUrl:pic,notes:brief(body.notes,1200),...point?{latitude:point.lat,longitude:point.lon}:{latitude:null,longitude:null},
     mapLocationStatus:point?(moved?'needs_review':existing?.mapLocationStatus||'needs_review'):(address?'unmapped':'no_address'),
     mapAddressResult:moved?'':existing?.mapAddressResult||'',updatedAt:when}}]};
  }
  if(kind==='supplyOrder.save'){
   const supplierId=brief(body.supplierId,100),supplier=get('suppliers',supplierId);
   if(!supplier)throw Error('Select an existing supplier');
   const existing=body.id?get('supplyOrders',body.id):null;
   if(body.id&&!existing)throw Error('Supply order no longer exists');
   const destinationKind=brief(body.destinationKind,20)||'business';
   if(!['business','customer','job','custom'].includes(destinationKind))throw Error('Invalid delivery destination type');
   const destinationId=['customer','job'].includes(destinationKind)?brief(body.destinationId,100):'';
   const destinationRef=destinationKind==='customer'?get('customers',destinationId):destinationKind==='job'?get('jobs',destinationId):null;
   if(['customer','job'].includes(destinationKind)&&!destinationRef)throw Error('Select an existing delivery record');
   const opportunityId=brief(body.opportunityId,100);
   if(opportunityId&&!get('opportunities',opportunityId))throw Error('Linked opportunity no longer exists');
   const destinationAddress=destinationKind==='business'?brief((data.settings||[]).find(x=>x.id==='business')?.businessAddress,300):
    destinationKind==='custom'?brief(body.destinationAddress,300):
    brief(destinationRef?.address||'',300);
   if(!destinationAddress)throw Error('A delivery address is required before saving an order');
   const enteredPoint=destinationKind==='custom'?position(body):null;
   if(destinationKind==='custom'&&(nonempty(body.latitude)||nonempty(body.longitude))&&!enteredPoint)throw Error('Delivery coordinates must be a valid pair');
   const priorPoint=position(existing);
   const changedDelivery=!!existing&&(existing.destinationKind!==destinationKind||brief(existing.destinationAddress,300)!==destinationAddress);
   const samePoint=priorPoint&&enteredPoint&&priorPoint.lat===enteredPoint.lat&&priorPoint.lon===enteredPoint.lon;
   const point=changedDelivery&&samePoint?null:enteredPoint;
   const status=brief(body.status,24)||'Planned';
   if(!['Planned','Ordered','In transit','Delivered','Cancelled'].includes(status))throw Error('Invalid supply order status');
   const plannedDate=brief(body.plannedDate,10);
   if(!validDate(plannedDate))throw Error('Invalid supply delivery date');
   const description=brief(body.description,240)||(Array.isArray(body.lineItems)?brief(body.lineItems.map(x=>brief(x.description,240)).filter(Boolean).join(', '),240):'');
   if(!description)throw Error('Describe the materials or equipment');
   if(existing?.documentStatus==='Issued')throw Error('Issued purchase orders are locked; create a new purchase order to revise commercial terms');
   const providedLines=Array.isArray(body.lineItems)?body.lineItems:null;
   const inputLines=providedLines||[{description,quantity:1,unit:'unit',unitPrice:0}];
   if(inputLines.length<1||inputLines.length>35)throw Error('Add between 1 and 35 purchase order items');
   const lineItems=inputLines.map((row,i)=>{
    const title=brief(row.description,240),quantity=Number(row.quantity),unitPrice=Number(row.unitPrice);
    if(!title)throw Error('Item '+(i+1)+' needs a description');
    if(!Number.isFinite(quantity)||quantity<=0||quantity>1000000||Math.round(quantity*1000)/1000!==quantity)
     throw Error('Item '+(i+1)+' needs a valid quantity (up to 3 decimal places)');
    if(!Number.isFinite(unitPrice)||unitPrice<0||unitPrice>100000000||Math.round(unitPrice*100)/100!==unitPrice)
     throw Error('Item '+(i+1)+' needs a valid unit price');
    return {description:title,quantity,unit:brief(row.unit,20)||'unit',unitPrice};
   });
   const currency=brief(body.currency||existing?.currency,3)||'EUR';
   if(!['EUR','USD','GBP','AUD','CAD'].includes(currency))throw Error('Choose a supported currency');
   const taxRate=Number(body.taxRate||0),shipping=Number(body.shipping||0);
   if(!Number.isFinite(taxRate)||taxRate<0||taxRate>100||!Number.isFinite(shipping)||shipping<0||shipping>10000000)
    throw Error('Invalid tax or shipping value');
   const subtotal=Math.round(lineItems.reduce((sum,row)=>sum+row.quantity*row.unitPrice,0)*100)/100;
   const tax=Math.round(subtotal*taxRate)/100,shippingAmount=Math.round(shipping*100)/100;
   const total=Math.round((subtotal+tax+shippingAmount)*100)/100;
   const poNumber=existing?.poNumber||'PO-'+String(when).slice(0,4)+'-'+String(existing?.id||id).replace(/[^A-Za-z0-9]/g,'').slice(-8).toUpperCase();
   const paymentTerms=brief(body.paymentTerms,350);
   const supplierQuoteExpires=brief(body.supplierQuoteExpires,10);
   const supplierQuoteEvidence=brief(body.supplierQuoteEvidence,400);
   if(supplierQuoteExpires&&(!validDate(supplierQuoteExpires)||supplierQuoteEvidence.length<12))
    throw Error('Supplier price expiration needs a valid date and verifiable quote reference.');
   if(!supplierQuoteExpires&&supplierQuoteEvidence)throw Error('Add the supplier price expiry date or clear its evidence reference.');
   return {resultId:existing?.id||id,writes:[{store:'supplyOrders',record:{...existing,id:existing?.id||id,supplierId,
    poNumber,documentStatus:'Draft',pricingConfirmed:!!providedLines,createdAt:existing?.createdAt||when,
    lineItems,currency,taxRate,shipping:shippingAmount,subtotal,tax,total,paymentTerms,supplierQuoteExpires,supplierQuoteEvidence,
    opportunityId,description:lineItems.map(x=>x.description).join(', ').slice(0,240),status,destinationKind,destinationId,destinationAddress,
    latitude:point?.lat??null,longitude:point?.lon??null,plannedDate,
    mapLocationStatus:point?'needs_review':destinationKind==='custom'?'unmapped':'linked_destination',notes:brief(body.notes,900),updatedAt:when}}]};
  }
  if(kind==='supplyOrder.issue'){
   const order=get('supplyOrders',brief(body.id,100));
   if(!order)throw Error('Purchase order not found');
   if(order.documentStatus==='Issued')return {resultId:order.id,writes:[],reused:true};
   if(!get('suppliers',order.supplierId))throw Error('Supplier no longer exists');
   if(!order.pricingConfirmed||!Array.isArray(order.lineItems)||!order.lineItems.length)throw Error('Add and verify item prices before issuing the purchase order');
   if(order.supplierQuoteExpires&&(!validDate(order.supplierQuoteExpires)||order.supplierQuoteExpires<String(when).slice(0,10)))
    throw Error('Supplier price quote has expired. Verify new pricing and update the quote expiry reference before issuing.');
   const business=(data.settings||[]).find(x=>x.id==='business')||{};
   if(!brief(business.company,150)||!brief(business.businessAddress,300))
    throw Error('Complete the business name and address in Settings before issuing');
   if(!order.poNumber||!order.destinationAddress)throw Error('Purchase order is incomplete');
   return {resultId:order.id,writes:[{store:'supplyOrders',record:{...order,documentStatus:'Issued',issuedAt:when,updatedAt:when}}]};
  }
  if(kind==='supplyOrder.progress'){
   const order=get('supplyOrders',brief(body.id,100));
   if(!order)throw Error('Purchase order not found');
   const status=brief(body.status,24);
   if(!['Planned','Ordered','In transit','Delivered','Cancelled'].includes(status))throw Error('Invalid supply order status');
   return {resultId:order.id,writes:[{store:'supplyOrders',record:{...order,status,updatedAt:when}}]};

  }
  if(kind==='quotation.convert'){
   const quote=get('quotes',body.quoteId);
   if(!quote)throw Error('Quotation not found');
   if(quote.status!=='Accepted')throw Error('Only accepted quotations can create jobs');
   const existing=dataArray(data,'jobs').find(x=>x.quoteId===quote.id);
   if(existing)return {resultId:existing.id,writes:[],reused:true};
   if(quote.customerId&&!get('customers',quote.customerId))throw Error('Quotation customer is missing');
   return {resultId:id,writes:[{store:'jobs',record:{id,quoteId:quote.id,customerId:quote.customerId||'',title:quote.title||'New job',category:quote.category||'Other',status:'Planned',date:'',updatedAt:when}}]};
  }
  if(kind==='task.schedule'){
   const title=brief(body.title,160),due=brief(body.due,10);
   if(!title||!due||!validDate(due))throw Error('A title and valid due date are required');
   if(body.customerId&&!get('customers',body.customerId))throw Error('Task customer not found');
   const old=body.id?get('tasks',body.id):null;
   if(body.id&&!old)throw Error('Task not found');
   return {resultId:old?.id||id,writes:[{store:'tasks',record:{...old,id:old?.id||id,title,due,customerId:brief(body.customerId||old?.customerId,100),status:old?.status||'Open',updatedAt:when}}]};
  }
  throw Error('Unsupported command');
 }
 // Accepted-quote handoff is revalidated inside the same transaction as its job
 // and idempotency log. This also serializes different requests across tabs.
 function executeQuotation(args){
  const {db,payload={},uid,requestKey,actor='local-owner',recordGuard=[]}=args;
  const stable=v=>JSON.stringify(order(v));
  function order(v){if(Array.isArray(v))return v.map(order);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,order(v[k])]));return v}
  const key=nonempty(requestKey)||'command:'+String(uid());
  const allowed=['quotes','customers','jobs','tasks','invoices','opportunities','suppliers','calendarEntries'];
  const extra=recordGuard.filter(x=>x.ref).map(x=>x.ref.store);
  if(extra.some(x=>!allowed.includes(x)))return Promise.reject(Error('Unsupported command guard store'));
  const names=[...new Set(['commandLog','quotes','customers','jobs',...extra])];
  return new Promise((resolve,reject)=>{
   let tx,outcome,error,prior=null,pending=names.length,data={};
   const abort=err=>{error=err;try{tx.abort()}catch{reject(err)}};
   try{tx=db.transaction(names,'readwrite')}catch(err){reject(err);return}
   tx.oncomplete=()=>resolve(outcome);tx.onabort=()=>reject(error||tx.error||Error('Quotation command aborted'));tx.onerror=()=>reject(error||tx.error||Error('Quotation command failed'));
   function ready(){
    if(--pending)return;
    try{
     if(prior){
      if(prior.kind!=='quotation.convert'||(prior.requestPayload&&prior.requestPayload!==stable(payload)))throw Error('Request key is already bound to a different operation');
      const job=data.jobs.find(x=>x.id===prior.resultId);
      if(!job||job.quoteId!==payload.quoteId)throw Error('The previously executed job link requires review');
      outcome={id:prior.resultId,reused:true,commandKey:key};return;
     }
     for(const expected of recordGuard){
      if(expected.ref){const current=(data[expected.ref.store]||[]).filter(x=>x.id===expected.ref.id);if(current.length!==1||stable(current[0])!==stable(expected.record))throw Error('Approved records changed before commit; prepare and review again')}
      if(expected.linkedJobs&&stable(data.jobs.filter(x=>x.quoteId===payload.quoteId))!==stable(expected.linkedJobs))throw Error('Quotation job links changed before commit; review the existing job');
     }
     const when=new Date().toISOString(),plan=prepare('quotation.convert',payload,data,uid,when);
     for(const write of plan.writes){tx.objectStore(write.store).put(write.record);domainEvents?.recordCommitted(tx,write.store,write.record,key,{actor,businessId:args.businessId||'local-business'},undefined,args.kind==='customer.create'||write.store==='jobs'&&args.kind==='quotation.convert')}
     tx.objectStore('commandLog').put({id:key,kind:'quotation.convert',requestPayload:stable(payload),resultId:plan.resultId,recordIds:plan.writes.map(x=>x.record.id),actor:brief(actor,40),createdAt:when,reused:!!plan.reused});
     outcome={id:plan.resultId,reused:!!plan.reused,commandKey:key};
    }catch(err){abort(err)}
   }
   const log=tx.objectStore('commandLog').get(key);log.onsuccess=()=>{prior=log.result;ready()};
   for(const store of names.filter(x=>x!=='commandLog')){const req=tx.objectStore(store).getAll();req.onsuccess=()=>{data[store]=req.result;ready()}}
  });
 }
 async function executeCustomer(args){
  const {db,kind,payload={},uid,requestKey,actor='local-owner',businessId='local-business',recordGuard=[],sourceText}=args;
  const removing=kind==='customer.source.delete',key=nonempty(requestKey)||'command:'+String(uid());
  let sourceValid=false;
  if(!removing&&payload.sourceHash&&typeof sourceText==='string')sourceValid=await hashSource(sourceText)===payload.sourceHash;
  return new Promise((resolve,reject)=>{
   let tx,outcome,error,prior=null,data={},pending=3;
   try{tx=db.transaction(['commandLog','customers','settings'],'readwrite')}catch(err){reject(err);return}
   tx.oncomplete=()=>resolve(outcome);tx.onabort=()=>reject(error||tx.error||Error('Customer command aborted'));tx.onerror=()=>reject(error||tx.error||Error('Customer command failed'));
   const abort=err=>{error=err;tx.abort()};
   function ready(){
    if(--pending)return;
    try{
     if(prior){
      if(prior.kind!==kind||prior.requestPayload!==stable(payload))throw Error('Request key is already bound to a different operation');
      if(!removing&&!data.customers.some(x=>x.id===prior.resultId))throw Error('Previously created customer no longer exists');
      outcome={id:prior.resultId,reused:true,commandKey:key,sourceSaved:!!prior.sourceSaved};return;
     }
     for(const expected of recordGuard){
      if(expected.ref){if(expected.ref.store!=='customers')throw Error('Unsupported customer guard');const found=data.customers.filter(x=>x.id===expected.ref.id);if(found.length!==1||stable(found[0])!==stable(expected.record))throw Error('Reviewed customer changed before commit')}
      if(expected.customerDuplicates&&stable(customerDuplicates(customerFields(payload.fields),data.customers,businessId))!==stable(expected.customerDuplicates))throw Error('Likely existing customers changed; review before saving');
      if(expected.customerSource){const source=data.settings.find(x=>x.id==='customer-source:'+payload.customerId);if((source?.sourceHash||'')!==expected.customerSource.sourceHash)throw Error('Original wording changed; review again')}
     }
     const when=new Date().toISOString();let customerId,sourceSaved=false;
     if(removing){
      if(Object.keys(payload).some(k=>k!=='customerId')||typeof payload.customerId!=='string')throw Error('Invalid customer source reference');
      const customer=data.customers.find(x=>x.id===payload.customerId);if(!customer||customer.businessId&&customer.businessId!==businessId)throw Error('Customer is not available in this business');
      customerId=customer.id;tx.objectStore('settings').delete('customer-source:'+customerId);
     }else{
      const duplicates=customerDuplicates(customerFields(payload.fields),data.customers,businessId);validateDuplicateReview(duplicates,payload.reviewedDuplicateIds||[]);
      if(payload.sourceHash&&!sourceValid)throw Error('Re-enter the original wording to retain it, or turn retention off');
      const plan=prepare(kind,payload,data,uid,when,{businessId});customerId=plan.resultId;
      if(data.customers.some(x=>x.id===customerId))throw Error('Customer identifier already exists');
      for(const write of plan.writes){tx.objectStore(write.store).put(write.record);domainEvents?.recordCommitted(tx,write.store,write.record,key,{actor,businessId:args.businessId||'local-business'},undefined,args.kind==='customer.create'||write.store==='jobs'&&args.kind==='quotation.convert')}
      if(payload.sourceHash){
       const sourceId='customer-source:'+customerId;if(data.settings.some(x=>x.id===sourceId))throw Error('Original wording storage already exists');
       tx.objectStore('settings').put({id:sourceId,customerId,text:sourceText,sourceHash:payload.sourceHash,createdAt:when});sourceSaved=true;
      }
     }
     tx.objectStore('commandLog').put({id:key,kind,requestPayload:stable(payload),resultId:customerId,actor:brief(actor,40),createdAt:when,sourceSaved});
     outcome={id:customerId,reused:false,commandKey:key,sourceSaved};
    }catch(err){abort(err)}
   }
   const log=tx.objectStore('commandLog').get(key);log.onsuccess=()=>{prior=log.result;ready()};
   for(const store of ['customers','settings']){const req=tx.objectStore(store).getAll();req.onsuccess=()=>{data[store]=req.result;ready()}}
  });
 }
 // Owner-approved internal quotation follow-up. Never represents an external contact.
 // All checks and writes share one IndexedDB transaction, including the audit receipt.
 function executeQuotationFollowup(args){
  const {db,payload={},uid,requestKey,actor='local-owner',businessId='local-business',
   approved=false,recordGuard=[]}=args||{};
  if(!db||typeof db.transaction!=='function'||approved!==true||typeof requestKey!=='string'||!requestKey.trim()||
   typeof uid!=='function'||typeof actor!=='string'||!actor.trim()||
   !payload||typeof payload.quoteId!=='string'||!payload.quoteId||
   !Array.isArray(recordGuard)||!recordGuard.some(g=>g?.ref?.store==='quotes'&&g.ref.id===payload.quoteId&&g.record)||
   recordGuard.some(g=>!g?.ref||!['quotes','customers'].includes(g.ref.store)||!g.record))
   return Promise.reject(Error('Explicit approved quote, guard and operation key required'));
  if(Object.keys(payload).some(k=>!['quoteId','due'].includes(k))||!validDate(payload.due)||!payload.due)
   return Promise.reject(Error('Valid follow-up due date required'));
  const stable=v=>JSON.stringify(v,(k,value)=>value&&typeof value==='object'&&!Array.isArray(value)?
   Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,value[key]])):value);
  const key='quote-followup:'+requestKey.trim();
  return new Promise((resolve,reject)=>{
   let tx,error,result,remaining=4,prior=null;const data={};
   try{tx=db.transaction(['commandLog','quotes','customers','tasks'],'readwrite')}catch(e){reject(e);return}
   const abort=e=>{error=e;tx.abort()};
   tx.oncomplete=()=>resolve(result);
   tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Follow-up transaction failed'));
   function ready(){
    if(--remaining)return;
    try{
     const quote=data.quotes.find(q=>q.id===payload.quoteId);
     if(prior){
      if(prior.kind!=='quotation.followup.schedule'||prior.requestPayload!==stable(payload)||
       prior.actor!==actor||prior.businessId!==businessId)
       throw Error('Operation key has a different owner or payload');
      if(!data.tasks.some(t=>t.id===prior.resultId&&t.quoteId===payload.quoteId))
       throw Error('Previous follow-up task needs recovery review');
      result={id:prior.resultId,reused:true,commandKey:key};return;
     }
     for(const guard of recordGuard){
      const source=data[guard.ref.store]||[];
      if(source.filter(x=>x.id===guard.ref.id).length!==1||
       stable(source.find(x=>x.id===guard.ref.id))!==stable(guard.record))
       throw Error('Quotation or linked customer changed since approval; review again');
     }
     if(!quote)throw Error('Quotation changed since approval; review again');
     if(quote.businessId&&quote.businessId!==businessId)
      throw Error('Quotation belongs to another business');
     if(String(quote.status||'').toLowerCase()!=='sent'||!quote.customerId||
      quote.followupResolution?.status==='owner_attested_reached')
      throw Error('Only sent quotations with customers can be followed up');
     if(recordGuard.some(g=>g.ref.store==='customers'&&g.ref.id!==quote.customerId))
      throw Error('Approved customer guard does not match the quotation customer');
     const customer=data.customers.find(c=>c.id===quote.customerId);
     if(!customer||customer.businessId&&customer.businessId!==businessId)
      throw Error('Quotation customer unavailable in this business');
     const existing=data.tasks.filter(t=>t.quoteId===quote.id&&(t.taskKind==='quotation_follow_up'||t.followupAuto===true||String(t.title||'').startsWith('Follow up quote: '))&&
      !['done','completed','cancelled','canceled'].includes(String(t.status||'').toLowerCase()));
     if(existing.length>1||existing.some(t=>t.customerId!==quote.customerId||
      t.businessId&&t.businessId!==businessId))
      throw Error('Ambiguous or cross-business quotation follow-up requires owner review');
     if(existing.length){
      result={id:existing[0].id,reused:true,commandKey:key};
      tx.objectStore('commandLog').put({id:key,kind:'quotation.followup.schedule',
       requestPayload:stable(payload),resultId:existing[0].id,actor,businessId,
       createdAt:new Date().toISOString(),result:'existing_open_task'});
      return;
     }
     const id=String(uid()),when=new Date().toISOString();
     if(!id||data.tasks.some(t=>t.id===id))throw Error('Follow-up task identifier collision');
     const title='Follow up quotation: '+String(quote.title||quote.id).slice(0,120);
     const task={id,title,due:payload.due,quoteId:quote.id,customerId:quote.customerId,
      taskKind:'quotation_follow_up',status:'Open',businessId,createdAt:when,updatedAt:when};
     tx.objectStore('tasks').put(task);
     domainEvents?.recordCommitted(tx,'tasks',task,key,{actor,businessId},null,true);
     tx.objectStore('commandLog').put({id:key,kind:'quotation.followup.schedule',
      requestPayload:stable(payload),resultId:id,actor,businessId,quoteId:quote.id,
      createdAt:when,result:'task_created'});
     result={id,reused:false,commandKey:key};
    }catch(e){abort(e)}
   }
   for(const name of ['commandLog','quotes','customers','tasks']){
    const store=tx.objectStore(name),req=name==='commandLog'?store.get(key):store.getAll();
    req.onsuccess=()=>{if(name==='commandLog')prior=req.result;else data[name]=req.result;ready()};
   }
  });
 }
 // Manual contact evidence: a local operator report, never provider-confirmed delivery.
 // Customer contact and quotation's lastContactAt are atomic with the command receipt.
 function executeContactRecord(args){
  const {db,payload={},uid,requestKey,actor='local-owner',businessId='local-business',approved=false,recordGuard=[]}=args||{};
  const {customerId,quoteId='',method,notes,outcome='attempted'}=payload||{};
  if(!db||typeof db.transaction!=='function'||typeof uid!=='function'||approved!==true||
   !Array.isArray(recordGuard)||!recordGuard.some(g=>g.ref?.store==='customers'&&g.ref.id===customerId&&g.record)||
   recordGuard.some(g=>g.quoteOpenFollowups!==undefined?!Array.isArray(g.quoteOpenFollowups):
    !g.ref||!['customers','quotes'].includes(g.ref.store)||!g.record)||
   (quoteId&&!recordGuard.some(g=>g.ref.store==='quotes'&&g.ref.id===quoteId))||
   typeof requestKey!=='string'||!requestKey.trim()||typeof actor!=='string'||!actor.trim()||
   typeof customerId!=='string'||!customerId||typeof quoteId!=='string'||
   !['Phone','Email','Meeting','Site visit','Other'].includes(method)||
   !['attempted','reached'].includes(outcome)||
   typeof notes!=='string'||notes.trim().length<3||notes.length>1000||
   Object.keys(payload).some(k=>!['customerId','quoteId','method','notes','outcome'].includes(k)))
   return Promise.reject(Error('Valid manually recorded customer contact required'));
  const key='contact:'+requestKey.trim();
  const normalized={customerId,quoteId,method,notes:notes.trim(),outcome};
  const stable=v=>JSON.stringify(v,(k,value)=>value&&typeof value==='object'&&!Array.isArray(value)?
   Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,value[key]])):value);
  return new Promise((resolve,reject)=>{
   let tx,error,result,remaining=5,prior=null;const data={};
   try{tx=db.transaction(['commandLog','events','customers','quotes','tasks'],'readwrite')}catch(e){reject(e);return}
   const abort=e=>{error=e;tx.abort()};
   tx.oncomplete=()=>resolve(result);
   tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Contact transaction failed'));
   function ready(){
    if(--remaining)return;
    try{
     if(prior){
      if(prior.kind!=='customer.contact.record'||prior.requestPayload!==stable(normalized)||
       prior.actor!==actor||prior.businessId!==businessId)
       throw Error('Contact operation key is bound to different details or actor');
      const previous=data.events.find(e=>e.id===prior.resultId&&e.kind==='customer_contact'&&
       e.customerId===customerId&&e.quoteId===quoteId&&e.outcome===outcome);
      if(!previous)throw Error('Previous contact record requires recovery review');
      if(!Array.isArray(prior.resolvedTaskIds)||prior.resolvedTasks!==prior.resolvedTaskIds.length||
       prior.outcome!==outcome||prior.providerVerified!==false)
       throw Error('Previous contact receipt requires recovery review');
      if(quoteId){
       const quote=data.quotes.find(q=>q.id===quoteId&&q.customerId===customerId);
       if(!quote||outcome==='reached'&&quote.followupResolution?.contactEventId!==prior.resultId)
        throw Error('Previous quotation resolution requires recovery review');
      }
      if(prior.resolvedTaskIds.some(taskId=>!data.tasks.some(t=>t.id===taskId&&
       t.quoteId===quoteId&&t.customerId===customerId&&
       t.contactEventId===prior.resultId&&t.completedReason==='owner_attested_customer_reached'&&
       ['done','completed'].includes(String(t.status||'').toLowerCase()))))
       throw Error('Previous follow-up task resolution requires recovery review');
      result={id:prior.resultId,reused:true,commandKey:key,outcome,resolvedTasks:prior.resolvedTasks};return;
     }
     for(const guard of recordGuard){
      if(guard.quoteOpenFollowups!==undefined)continue;
      const collection=data[guard.ref.store]||[];
      if(collection.filter(x=>x.id===guard.ref.id).length!==1||
       stable(collection.find(x=>x.id===guard.ref.id))!==stable(guard.record))
       throw Error('Customer contact approval is stale; review changed records');
     }
     const customer=data.customers.find(c=>c.id===customerId);
     if(!customer||customer.businessId&&customer.businessId!==businessId)
      throw Error('Contact customer unavailable in this business');
     if(recordGuard.some(g=>g.ref?.store==='quotes'&&g.ref.id!==quoteId))
      throw Error('Approval references a different quotation');
     const quote=quoteId?data.quotes.find(q=>q.id===quoteId):null;
     if(quoteId&&(!quote||quote.customerId!==customerId||
       quote.businessId&&quote.businessId!==businessId))
      throw Error('Related quotation no longer belongs to customer and business');
     const id=String(uid()),when=new Date().toISOString();
     if(!id||data.events.some(e=>e.id===id))throw Error('Contact record identifier collision');
     const event={id,kind:'customer_contact',text:'Manually recorded customer contact',
      customerId,quoteId,method,notes:normalized.notes,outcome,date:when,
      actor,businessId,evidence:'operator_reported',providerVerified:false,customerReached:outcome==='reached'};
     tx.objectStore('events').put(event);
     let resolvedTasks=0;const resolvedTaskIds=[];
     if(quote){
      const lastField=outcome==='reached'?'lastContactAt':'lastFollowUpAt';
      const last=String(quote[lastField]||'');
      const updated={...quote,[lastField]:last>when?last:when,updatedAt:when,
       ...(outcome==='reached'?{followupResolution:{status:'owner_attested_reached',
        contactEventId:id,recordedAt:when,actor,providerVerified:false}}:{})};
      tx.objectStore('quotes').put(updated);
      domainEvents?.recordCommitted(tx,'quotes',updated,key,{actor,businessId},quote);
      if(outcome==='reached'){
       const open=(data.tasks||[]).filter(t=>t.quoteId===quote.id&&t.customerId===customerId&&
        (t.taskKind==='quotation_follow_up'||t.followupAuto===true||
         String(t.title||'').startsWith('Follow up quote: '))&&
        (!t.businessId||t.businessId===businessId)&&
        !['done','completed','cancelled','canceled'].includes(String(t.status||'').toLowerCase()));
       const reviewed=recordGuard.find(g=>g.quoteOpenFollowups!==undefined);
       if(reviewed&&stable(reviewed.quoteOpenFollowups)!==stable(open))
        throw Error('Linked follow-up tasks changed since owner approval; review again');
       for(const task of open){
        const completed={...task,status:'Done',completedAt:when,
         completedReason:'owner_attested_customer_reached',contactEventId:id,updatedAt:when};
        tx.objectStore('tasks').put(completed);
        domainEvents?.recordCommitted(tx,'tasks',completed,key,{actor,businessId},task);
        resolvedTasks++;resolvedTaskIds.push(task.id);
       }
      }
     }
     tx.objectStore('commandLog').put({id:key,kind:'customer.contact.record',
      requestPayload:stable(normalized),resultId:id,actor,businessId,quoteId,
      createdAt:when,result:outcome==='reached'?'owner_attested_reached':'manual_attempt_recorded',
      outcome,resolvedTasks,resolvedTaskIds,providerVerified:false});
     result={id,reused:false,commandKey:key,providerVerified:false,outcome,resolvedTasks};
    }catch(e){abort(e)}
   }
   const receipt=tx.objectStore('commandLog').get(key);
   receipt.onsuccess=()=>{prior=receipt.result;ready()};
   for(const name of ['events','customers','quotes','tasks']){
    const req=tx.objectStore(name).getAll();
    req.onsuccess=()=>{data[name]=req.result;ready()};
   }
  });
 }
 // Approved, internal invoice follow-up. Does not send a payment demand or verify a bank receipt.
 // Invoice, customer, payment snapshot, task, domain event and command receipt are checked/written atomically.
 function executeInvoiceFollowup(args){
  const {db,payload={},uid,requestKey,actor='local-owner',businessId='local-business',approved=false,recordGuard=[]}=args||{};
  if(!db||typeof db.transaction!=='function'||typeof uid!=='function'||approved!==true||
   typeof requestKey!=='string'||!requestKey.trim()||typeof actor!=='string'||!actor.trim()||
   typeof payload.invoiceId!=='string'||!payload.invoiceId||!validDate(payload.due)||!payload.due||
   Object.keys(payload).some(k=>!['invoiceId','due'].includes(k))||
   !Array.isArray(recordGuard)||!recordGuard.some(x=>x.ref?.store==='invoices'&&x.ref.id===payload.invoiceId&&x.record)||
   !recordGuard.some(x=>Array.isArray(x.invoicePayments)))
   return Promise.reject(Error('Approved invoice, payment snapshot and operation key required'));
  const stable=v=>JSON.stringify(v,(k,value)=>value&&typeof value==='object'&&!Array.isArray(value)?
   Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,value[key]])):value);
  const key='invoice-followup:'+requestKey.trim();
  return new Promise((resolve,reject)=>{
   let tx,error,result,remaining=6,prior;const data={};
   try{tx=db.transaction(['commandLog','invoices','customers','payments','tasks','jobs'],'readwrite')}catch(e){reject(e);return}
   const abort=e=>{error=e;tx.abort()};
   tx.oncomplete=()=>resolve(result);
   tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Invoice follow-up transaction failed'));
   function ready(){
    if(--remaining)return;
    try{
     const invoice=data.invoices.find(x=>x.id===payload.invoiceId);
     if(prior){
      if(prior.kind!=='invoice.followup.schedule'||prior.requestPayload!==stable(payload)||
       prior.actor!==actor||prior.businessId!==businessId)throw Error('Invoice operation key belongs to a different request');
      if(!data.tasks.some(t=>t.id===prior.resultId&&t.invoiceId===payload.invoiceId))
       throw Error('Previous invoice task needs recovery review');
      result={id:prior.resultId,reused:true,commandKey:key};return;
     }
     if(!invoice||invoice.businessId&&invoice.businessId!==businessId)
      throw Error('Invoice unavailable in this business');
     for(const expected of recordGuard){
      if(expected.ref){
       const records=data[expected.ref.store];
       if(!records||records.filter(x=>x.id===expected.ref.id).length!==1||
        stable(records.find(x=>x.id===expected.ref.id))!==stable(expected.record))
        throw Error('Invoice or related record changed since approval');
      }
      if(expected.invoicePayments&&stable(data.payments.filter(p=>p.invoiceId===payload.invoiceId))!==stable(expected.invoicePayments))
       throw Error('Invoice payments changed since approval');
     }
     if(String(invoice.status||'').toLowerCase()!=='issued'||!invoice.customerId||
      !validDate(invoice.dueDate)||invoice.dueDate>=new Date().toISOString().slice(0,10))
      throw Error('Invoice is not an overdue issued invoice');
     const customer=data.customers.find(x=>x.id===invoice.customerId);
     if(!customer||customer.businessId&&customer.businessId!==businessId)
      throw Error('Invoice customer unavailable in business');
     if(invoice.currency&&invoice.currency!=='USD'||!Array.isArray(invoice.lines)||!invoice.lines.length||
      invoice.lines.some(l=>!Number.isFinite(Number(l.qty))||Number(l.qty)<=0||
       !Number.isFinite(Number(l.unitPrice))||Number(l.unitPrice)<0)||
      !Number.isFinite(Number(invoice.taxRate||0))||Number(invoice.taxRate||0)<0||Number(invoice.taxRate||0)>100)
      throw Error('Invoice amount cannot be verified');
     const payments=data.payments.filter(p=>p.invoiceId===invoice.id);
     if(payments.some(p=>!Number.isFinite(Number(p.amount))||Number(p.amount)<0||
      p.currency&&p.currency!==(invoice.currency||'USD')||p.customerId&&p.customerId!==invoice.customerId))
      throw Error('Invoice payment integrity needs review');
     const subtotal=invoice.lines.reduce((n,l)=>n+Math.round(Number(l.qty)*Math.round(Number(l.unitPrice)*100)),0);
     const amount=subtotal+Math.round(subtotal*Number(invoice.taxRate||0)/100);
     const paid=payments.reduce((n,p)=>n+Math.round(Number(p.amount)*100),0);
     if(amount-paid<=0)throw Error('No recorded outstanding invoice balance remains');
     const existing=data.tasks.find(t=>t.invoiceId===invoice.id&&
      !['done','completed','cancelled','canceled'].includes(String(t.status||'').toLowerCase()));
     const when=new Date().toISOString();
     let id;
     if(existing)id=existing.id;
     else {
      id=String(uid());
      if(!id||data.tasks.some(t=>t.id===id))throw Error('Invoice task identifier collision');
      const task={id,invoiceId:invoice.id,customerId:invoice.customerId,jobId:invoice.jobId||'',
       title:'Review unpaid invoice: '+String(invoice.reference||invoice.id).slice(0,90),
       description:'Review actual bank/provider records before contacting this customer. No outbound message was sent.',
       due:payload.due,status:'Open',taskKind:'invoice_follow_up',businessId,createdAt:when,updatedAt:when};
      tx.objectStore('tasks').put(task);
      domainEvents?.recordCommitted(tx,'tasks',task,key,{actor,businessId},null,true);
     }
     tx.objectStore('commandLog').put({id:key,kind:'invoice.followup.schedule',requestPayload:stable(payload),
      resultId:id,actor,businessId,invoiceId:invoice.id,createdAt:when,
      result:existing?'existing_open_task':'task_created',providerVerified:false});
     result={id,reused:!!existing,commandKey:key,providerVerified:false};
    }catch(e){abort(e)}
   }
   const read=tx.objectStore('commandLog').get(key);
   read.onsuccess=()=>{prior=read.result;ready()};
   for(const name of ['invoices','customers','payments','tasks','jobs']){
    const req=tx.objectStore(name).getAll();req.onsuccess=()=>{data[name]=req.result;ready()};
   }
  });
 }
 // Shared approved command for a standalone calendar event conflicting with another booking.
 // The existing calendar conflict evaluator runs on records read inside a single transaction.
 // Linked job/task work sessions cannot be moved through this action.
 function executeConflictReschedule(args){
  const {db,payload={},uid,requestKey,actor='local-owner',businessId='local-business',
   approved=false,recordGuard=[],calendar}=args||{};
  const timeOK=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if(!db||typeof db.transaction!=='function'||typeof uid!=='function'||approved!==true||
   typeof actor!=='string'||!actor.trim()||typeof requestKey!=='string'||!requestKey.trim()||
   !payload||typeof payload.eventId!=='string'||!payload.eventId||!payload.date||
   !validDate(payload.date)||!timeOK(payload.time)||
   Object.keys(payload).some(k=>!['eventId','date','time'].includes(k))||
   !calendar||typeof calendar.conflicts!=='function'||
   !Array.isArray(recordGuard)||!recordGuard.some(g=>g.ref?.store==='calendarEntries'&&g.ref.id===payload.eventId&&g.record)||
   !recordGuard.some(g=>g.calendarState&&typeof g.calendarState==='object'))
   return Promise.reject(Error('Approved standalone event, calendar evaluator and complete schedule snapshot required'));
  const stable=v=>JSON.stringify(v,(k,value)=>value&&typeof value==='object'&&!Array.isArray(value)?
   Object.fromEntries(Object.keys(value).sort().filter(x=>value[x]!==undefined).map(x=>[x,value[x]])):value);
  const key='calendar-reschedule:'+requestKey.trim();
  return new Promise((resolve,reject)=>{
   let tx,error,result,remaining=5,prior=null;const data={};
   const names=['commandLog','calendarEntries','tasks','jobs','calendarPreferences','calendarAudit'];
   try{tx=db.transaction(names,'readwrite')}catch(e){reject(e);return}
   const abort=e=>{error=e;try{tx.abort()}catch{reject(e)}};
   tx.oncomplete=()=>resolve(result);
   tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Calendar conflict transaction failed'));
   function ready(){
    if(--remaining)return;
    try{
     if(prior){
      if(prior.kind!=='calendar.conflict.reschedule'||prior.requestPayload!==stable(payload)||
       prior.actor!==actor||prior.businessId!==businessId)
       throw Error('Reschedule operation key belongs to a different request');
      const changed=data.calendarEntries.find(x=>x.id===prior.resultId);
      if(!changed||changed.date!==payload.date||changed.time!==payload.time)
       throw Error('Prior rescheduled event requires recovery review');
      result={id:changed.id,reused:true,commandKey:key};return;
     }
     for(const expected of recordGuard){
      if(expected.ref){
       const rows=data[expected.ref.store]||[];
       if(rows.filter(x=>x.id===expected.ref.id).length!==1||
        stable(rows.find(x=>x.id===expected.ref.id))!==stable(expected.record))
        throw Error('Calendar record changed since approval');
      }
      if(expected.calendarState){
       for(const name of ['tasks','jobs','calendarEntries','calendarPreferences']){
        if(stable(data[name])!==stable(expected.calendarState[name]))
         throw Error('Calendar commitments changed since approval');
       }
      }
     }
     const event=data.calendarEntries.find(x=>x.id===payload.eventId);
     if(!event||event.businessId&&event.businessId!==businessId)
      throw Error('Event unavailable in this business');
     if(event.sourceId&&event.sourceKind&&event.sourceKind!=='event'||
      ['done','completed','cancelled','canceled'].includes(String(event.status||'').toLowerCase()))
      throw Error('Linked or completed sessions require source-record review');
     const duration=Number(event.durationMinutes),start=Number(payload.time.slice(0,2))*60+Number(payload.time.slice(3,5));
     if(!Number.isInteger(duration)||duration<1||duration>1440||start+duration>1440||
      event.date===payload.date&&event.time===payload.time)
      throw Error('Invalid or unchanged calendar slot');
     const normalized=clone=>({
      ...clone,
      tasks:(clone.tasks||[]).map(x=>({...x,assignedTo:x.assignedTo||x.assigneeId||x.ownerId||'local-owner'})),
      jobs:(clone.jobs||[]).map(x=>({...x,assignedTo:x.assignedTo||x.assigneeId||x.ownerId||'local-owner'})),
      calendarEntries:(clone.calendarEntries||[]).map(x=>({...x,assignedTo:x.assignedTo||x.assigneeId||x.ownerId||'local-owner'}))
     });
     const scope={tasks:data.tasks,jobs:data.jobs,calendarEntries:data.calendarEntries,calendarPreferences:data.calendarPreferences};
     const involved=issue=>issue.a?.key==='event:'+event.id||issue.b?.key==='event:'+event.id;
     const earlier=calendar.conflicts(normalized(scope),{from:event.date,until:event.date}).filter(involved);
     if(!earlier.length)throw Error('This standalone event no longer has a recorded conflict');
     const next={...event,date:payload.date,time:payload.time,updatedAt:new Date().toISOString()};
     const proposed={...scope,calendarEntries:scope.calendarEntries.map(x=>x.id===event.id?next:x)};
     const after=calendar.conflicts(normalized(proposed),{from:payload.date,until:payload.date}).filter(involved);
     if(after.length)throw Error('Replacement slot still conflicts with another recorded commitment');
     tx.objectStore('calendarEntries').put(next);
     domainEvents?.recordCommitted(tx,'calendarEntries',next,key,{actor,businessId},event);
     tx.objectStore('calendarAudit').put({id:String(uid()),kind:'calendar.conflict.rescheduled',
      sourceKind:'event',sourceId:event.id,oldDate:event.date,oldTime:event.time,
      newDate:payload.date,newTime:payload.time,actor,businessId,correlationId:key,
      createdAt:next.updatedAt});
     tx.objectStore('commandLog').put({id:key,kind:'calendar.conflict.reschedule',
      requestPayload:stable(payload),resultId:event.id,actor,businessId,
      oldDate:event.date,oldTime:event.time,createdAt:next.updatedAt,result:'event_moved'});
     result={id:event.id,reused:false,commandKey:key,oldDate:event.date,oldTime:event.time,
      date:payload.date,time:payload.time,verifiedNoConflict:true};
    }catch(e){abort(e)}
   }
   const r=tx.objectStore('commandLog').get(key);r.onsuccess=()=>{prior=r.result;ready()};
   for(const name of ['calendarEntries','tasks','jobs','calendarPreferences']){
    const req=tx.objectStore(name).getAll();req.onsuccess=()=>{data[name]=req.result;ready()};
   }
  });
 }
 // TF-P04: internal review only. Never marks a change order customer-approved.
 function executeChangeOrderReview(args){
  const {db,payload={},uid,requestKey,actor='local-owner',businessId='local-business',approved=false,recordGuard=[]}=args||{};
  if(!db?.transaction||!approved||typeof uid!=='function'||typeof requestKey!=='string'||!requestKey.trim()||
   !payload.jobId||typeof payload.changeOrderId!=='string'||!payload.changeOrderId.trim()||
   !validDate(payload.due)||Object.keys(payload).some(k=>!['jobId','changeOrderId','due'].includes(k))||
   !Array.isArray(recordGuard)||!recordGuard.some(g=>g?.ref?.store==='jobs'&&g.ref.id===payload.jobId&&g.record)||
   recordGuard.some(g=>g?.ref&&!['jobs','customers','quotes','opportunities'].includes(g.ref.store)))
   return Promise.reject(Error('Approved, revision-bound internal change-order review required'));
  const stable=v=>JSON.stringify(stableOrder(v)),key='change-review:'+requestKey.trim();
  return new Promise((resolve,reject)=>{
   const names=['jobs','tasks','commandLog','customers','quotes','opportunities'];
   let tx,error,outcome,remaining=names.length,prior;const data={};
   try{tx=db.transaction(names,'readwrite')}catch(e){reject(e);return}
   const abort=e=>{error=e;tx.abort()};
   tx.oncomplete=()=>resolve(outcome);
   tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Change-order review transaction failed'));
   const ready=()=>{
    if(--remaining)return;
    try{
     if(prior){
      if(prior.kind!=='job.change_order.review.schedule'||prior.requestPayload!==stable(payload)||prior.actor!==actor||prior.businessId!==businessId)
       throw Error('Operation receipt belongs to another approval');
      const task=data.tasks.find(t=>t.id===prior.resultId&&t.jobId===payload.jobId&&t.changeOrderId===payload.changeOrderId&&t.businessId===businessId);
      if(!task)throw Error('Previous task receipt requires manual reconciliation');
      outcome={id:task.id,reused:true,commandKey:key};return;
     }
     const job=data.jobs.find(x=>x.id===payload.jobId);
     if(!job||job.businessId&&job.businessId!==businessId)throw Error('Job is missing or outside this business');
     for(const guard of recordGuard){
      if(!guard.ref)continue;
      const matches=data[guard.ref.store].filter(x=>x.id===guard.ref.id);
      if(matches.length!==1||stable(matches[0])!==stable(guard.record))throw Error('Job or change order changed after approval');
     }
     const taskGuard=recordGuard.find(g=>Array.isArray(g.changeOrderOpenReviews));
     if(!taskGuard)throw Error('Open review task snapshot is missing');
     const currentOpen=data.tasks.filter(t=>t.jobId===job.id&&t.changeOrderId===payload.changeOrderId&&t.taskKind==='change_order_review'&&
      !['done','completed','cancelled','canceled'].includes(String(t.status||'').toLowerCase()));
     if(stable(currentOpen)!==stable(taskGuard.changeOrderOpenReviews))throw Error('Linked change-order reviews changed after approval');
     const changes=Array.isArray(job.changeOrders)?job.changeOrders:[];
     const matches=changes.filter(x=>x&&x.id===payload.changeOrderId);
     if(matches.length!==1||matches[0].status!=='proposed'||!Number.isFinite(matches[0].amount)||matches[0].amount<0)
      throw Error('Proposed change order needs fresh review');
     const existing=data.tasks.filter(t=>t.jobId===job.id&&t.changeOrderId===payload.changeOrderId&&t.taskKind==='change_order_review'&&
      !['done','completed','cancelled','canceled'].includes(String(t.status||'').toLowerCase()));
     if(existing.length>1||existing.some(t=>t.businessId!==businessId))throw Error('Ambiguous linked review tasks require owner inspection');
     const when=new Date().toISOString();let id,kind;
     if(existing.length){id=existing[0].id;kind='existing_open_task'}
     else{
      id=String(uid());if(!id||data.tasks.some(t=>t.id===id))throw Error('Review task ID collision');
      const task={id,jobId:job.id,changeOrderId:payload.changeOrderId,customerId:job.customerId||'',businessId,
       taskKind:'change_order_review',title:'Verify customer authorization for change: '+String(matches[0].description||payload.changeOrderId).slice(0,100),
       status:'Open',due:payload.due,customerAuthorizationStatus:'unverified',createdAt:when,updatedAt:when};
      tx.objectStore('tasks').put(task);
      domainEvents?.recordCommitted(tx,'tasks',task,key,{actor,businessId},null,true);
      kind='task_created';
     }
     tx.objectStore('commandLog').put({id:key,kind:'job.change_order.review.schedule',requestPayload:stable(payload),
      resultId:id,actor,businessId,jobId:job.id,changeOrderId:payload.changeOrderId,createdAt:when,result:kind});
     outcome={id,reused:kind!=='task_created',commandKey:key};
    }catch(e){abort(e)}
   };
   for(const name of names){
    const req=name==='commandLog'?tx.objectStore(name).get(key):tx.objectStore(name).getAll();
    req.onsuccess=()=>{if(name==='commandLog')prior=req.result;else data[name]=req.result;ready()};
   }
  });
 }
 // Owner-attested consent reference, not a signature or independently verified customer response.
 // The job update, task closure, domain audits and receipt commit in one transaction.
 function executeChangeOrderAuthorization(args){
  const {db,payload={},requestKey,actor='local-owner',businessId='local-business',approved=false,recordGuard=[]}=args||{};
  if(!db?.transaction||approved!==true||typeof requestKey!=='string'||!requestKey.trim()||
   typeof payload.jobId!=='string'||!payload.jobId||typeof payload.changeOrderId!=='string'||!payload.changeOrderId||
   typeof payload.evidence!=='string'||payload.evidence.trim().length<10||payload.evidence.length>300||
   Object.keys(payload).some(k=>!['jobId','changeOrderId','evidence'].includes(k))||
   !Array.isArray(recordGuard)||!recordGuard.some(g=>g?.ref?.store==='jobs'&&g.ref.id===payload.jobId&&g.record)||
   !recordGuard.some(g=>Array.isArray(g.changeOrderOpenReviews))||
   recordGuard.some(g=>g?.ref&&!['jobs','customers','quotes','opportunities'].includes(g.ref.store)))
   return Promise.reject(Error('Verified owner approval, job revision, review task and evidence reference required'));
  const key='change-authorization:'+requestKey.trim(),stable=v=>JSON.stringify(stableOrder(v));
  return new Promise((resolve,reject)=>{
   const names=['jobs','tasks','commandLog','customers','quotes','opportunities'];
   let tx,error,outcome,remaining=names.length,prior;const data={};
   try{tx=db.transaction(names,'readwrite')}catch(e){reject(e);return}
   const abort=e=>{error=e;tx.abort()};
   tx.oncomplete=()=>resolve(outcome);
   tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Authorization transaction failed'));
   const ready=()=>{
    if(--remaining)return;
    try{
     if(prior){
      if(prior.kind!=='job.change_order.authorization.record'||prior.requestPayload!==stable(payload)||
       prior.actor!==actor||prior.businessId!==businessId)throw Error('Authorization receipt belongs to another operation');
      const job=data.jobs.find(j=>j.id===payload.jobId),change=job?.changeOrders?.find(x=>x?.id===payload.changeOrderId);
      const task=data.tasks.find(t=>t.id===prior.reviewTaskId&&t.jobId===payload.jobId&&t.status==='Done'&&t.authorizationReceiptId===key);
      if(!task||change?.authorizationReceiptId!==key)throw Error('Previous authorization outcome requires manual recovery review');
      outcome={id:job.id,reviewTaskId:task.id,reused:true,commandKey:key,providerVerified:false};return;
     }
     const job=data.jobs.find(x=>x.id===payload.jobId);
     if(!job||job.businessId&&job.businessId!==businessId)throw Error('Job missing or outside this business');
     for(const guard of recordGuard){
      if(!guard.ref)continue;
      const matches=data[guard.ref.store].filter(x=>x.id===guard.ref.id);
      if(matches.length!==1||stable(matches[0])!==stable(guard.record))throw Error('Linked record changed after owner approval');
     }
     const guard=recordGuard.find(g=>Array.isArray(g.changeOrderOpenReviews));
     const reviews=data.tasks.filter(t=>t.jobId===job.id&&t.changeOrderId===payload.changeOrderId&&
      t.taskKind==='change_order_review'&&!['done','completed','cancelled','canceled'].includes(String(t.status||'').toLowerCase()));
     if(reviews.length!==1||reviews[0].businessId!==businessId||stable(reviews)!==stable(guard.changeOrderOpenReviews))
      throw Error('Review task changed since approval');
     const changeOrders=Array.isArray(job.changeOrders)?job.changeOrders:[];
     const matches=changeOrders.filter(x=>x?.id===payload.changeOrderId);
     if(matches.length!==1||matches[0].status!=='proposed'||!Number.isFinite(matches[0].amount)||matches[0].amount<=0)
      throw Error('Proposed change changed or requires review');
     const when=new Date().toISOString(),updated={...job,changeOrders:changeOrders.map(x=>({...x}))};
     const current=updated.changeOrders.find(x=>x.id===payload.changeOrderId);
     current.status='approved_recorded';current.approvalEvidence=payload.evidence;current.approvedAt=when;
     current.customerAuthorization={kind:'owner_attested_documented',reference:payload.evidence,recordedBy:actor,recordedAt:when,providerVerified:false};
     current.authorizationReceiptId=key;updated.changeOrdersUpdatedAt=when;
     const task={...reviews[0],status:'Done',completedAt:when,updatedAt:when,
      completedReason:'owner_attested_documented_customer_authorization',authorizationReceiptId:key,
      customerAuthorizationStatus:'owner_attested_documented'};
     tx.objectStore('jobs').put(updated);tx.objectStore('tasks').put(task);
     domainEvents?.recordCommitted(tx,'jobs',updated,key,{actor,businessId},job);
     domainEvents?.recordCommitted(tx,'tasks',task,key,{actor,businessId},reviews[0]);
     tx.objectStore('commandLog').put({id:key,kind:'job.change_order.authorization.record',requestPayload:stable(payload),
      resultId:job.id,reviewTaskId:task.id,actor,businessId,changeOrderId:payload.changeOrderId,
      createdAt:when,result:'owner_attested_documented',providerVerified:false});
     outcome={id:job.id,reviewTaskId:task.id,reused:false,commandKey:key,providerVerified:false};
    }catch(e){abort(e)}
   };
   for(const name of names){const req=name==='commandLog'?tx.objectStore(name).get(key):tx.objectStore(name).getAll();
    req.onsuccess=()=>{if(name==='commandLog')prior=req.result;else data[name]=req.result;ready()}}
  });
 }
 // TF-P05: reviewed reconciliation task using local costs; never claims final job profit.
 function executeJobCostReview(args){
  const {db,payload={},uid,requestKey,actor='local-owner',businessId='local-business',approved=false,recordGuard=[]}=args||{};
  if(!db?.transaction||approved!==true||typeof uid!=='function'||typeof requestKey!=='string'||!requestKey.trim()||
   typeof payload.jobId!=='string'||!payload.jobId||!validDate(payload.due)||
   !Number.isFinite(payload.budget)||!Number.isFinite(payload.recordedCosts)||payload.recordedCosts<=payload.budget||
   Object.keys(payload).some(k=>!['jobId','due','budget','recordedCosts'].includes(k))||
   !Array.isArray(recordGuard)||!recordGuard.some(g=>g?.ref?.store==='jobs'&&g.ref.id===payload.jobId&&g.record)||
   !recordGuard.some(g=>Array.isArray(g.jobCostsSnapshot)&&Array.isArray(g.jobExpensesSnapshot)&&Array.isArray(g.costReviewTasks)))
   return Promise.reject(Error('Explicit approved cost-review snapshot is required'));
  const key='job-cost-review:'+requestKey.trim(),stable=v=>JSON.stringify(stableOrder(v));
  return new Promise((resolve,reject)=>{
   const names=['jobs','jobCosts','expenses','tasks','commandLog','customers','quotes','opportunities'];
   let tx,error,outcome,remaining=names.length,prior;const data={};
   try{tx=db.transaction(names,'readwrite')}catch(e){reject(e);return}
   const abort=e=>{error=e;tx.abort()};
   tx.oncomplete=()=>resolve(outcome);
   tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Job cost review transaction failed'));
   const ready=()=>{
    if(--remaining)return;
    try{
     if(prior){
      if(prior.kind!=='job.cost_review.schedule'||prior.requestPayload!==stable(payload)||prior.actor!==actor||prior.businessId!==businessId)
       throw Error('Cost review receipt belongs to another approval');
      const task=data.tasks.find(t=>t.id===prior.resultId&&t.jobId===payload.jobId&&t.taskKind==='job_cost_reconciliation'&&t.businessId===businessId);
      if(!task)throw Error('Previous review task needs reconciliation');
      outcome={id:task.id,reused:true,commandKey:key};return;
     }
     const job=data.jobs.find(j=>j.id===payload.jobId);
     if(!job||job.businessId&&job.businessId!==businessId)throw Error('Job outside authorized business');
     for(const guard of recordGuard){if(!guard.ref)continue;
      const matches=data[guard.ref.store]?.filter(x=>x.id===guard.ref.id)||[];
      if(matches.length!==1||stable(matches[0])!==stable(guard.record))throw Error('Job or customer changed after approval');
     }
     const financial=recordGuard.find(g=>Array.isArray(g.jobCostsSnapshot)&&Array.isArray(g.jobExpensesSnapshot)&&Array.isArray(g.costReviewTasks));
     const costs=data.jobCosts.filter(x=>x.jobId===job.id),expenses=data.expenses.filter(x=>x.jobId===job.id||x.relatedId===job.id),
      tasks=data.tasks.filter(t=>t.jobId===job.id&&t.taskKind==='job_cost_reconciliation'&&
       !['done','completed','cancelled','canceled'].includes(String(t.status||'').toLowerCase()));
     if(stable(costs)!==stable(financial.jobCostsSnapshot)||stable(expenses)!==stable(financial.jobExpensesSnapshot)||
      stable(tasks)!==stable(financial.costReviewTasks))throw Error('Job cost evidence or reviews changed after approval');
     const valid=x=>typeof x.amount==='number'&&Number.isFinite(x.amount)&&x.amount>=0&&(!x.businessId||x.businessId===businessId);
     if(!costs.some(x=>x.type==='estimate')||[...costs,...expenses].some(x=>!valid(x)))throw Error('Recorded cost evidence incomplete');
     const budget=costs.filter(x=>x.type==='estimate').reduce((n,x)=>n+Math.round(x.amount*100),0),
      spent=[...costs.filter(x=>x.type==='actual'),...expenses].reduce((n,x)=>n+Math.round(x.amount*100),0);
     if(budget<=0||spent<=budget||budget/100!==payload.budget||spent/100!==payload.recordedCosts)
      throw Error('Current cost totals differ from approved summary');
     if(tasks.length>1||tasks.some(t=>t.businessId!==businessId))throw Error('Ambiguous cost-review task');
     const when=new Date().toISOString();let id,result;
     if(tasks.length){id=tasks[0].id;result='existing_open_task'}
     else{
      id=String(uid());if(!id||data.tasks.some(t=>t.id===id))throw Error('Cost review task ID collision');
      const task={id,jobId:job.id,customerId:job.customerId||'',businessId,taskKind:'job_cost_reconciliation',status:'Open',
       title:'Reconcile job cost overrun: '+String(job.title||job.id).slice(0,100),due:payload.due,
       financialEvidence:{budget:budget/100,recordedCosts:spent/100,currency:'USD',costIds:costs.map(x=>x.id),expenseIds:expenses.map(x=>x.id),
        possibleOverlap:true,externalAccountingVerified:false,settlementVerified:false,profitVerified:false},
       createdAt:when,updatedAt:when};
      tx.objectStore('tasks').put(task);
      domainEvents?.recordCommitted(tx,'tasks',task,key,{actor,businessId},null,true);
      result='task_created';
     }
     tx.objectStore('commandLog').put({id:key,kind:'job.cost_review.schedule',resultId:id,requestPayload:stable(payload),
      actor,businessId,jobId:job.id,createdAt:when,result});
     outcome={id,reused:result!=='task_created',commandKey:key};
    }catch(e){abort(e)}
   };
   for(const name of names){const req=name==='commandLog'?tx.objectStore(name).get(key):tx.objectStore(name).getAll();
    req.onsuccess=()=>{if(name==='commandLog')prior=req.result;else data[name]=req.result;ready()}}
  });
 }
 function execute(args){
  const {db,kind,payload,data,uid,requestKey,actor='local-owner'}=args||{};
  if(kind==='customer.create'||kind==='customer.source.delete')return executeCustomer(args);
  if(kind==='quotation.convert')return executeQuotation(args);
  if(kind==='quotation.followup.schedule')return executeQuotationFollowup(args);
  if(kind==='job.change_order.review.schedule')return executeChangeOrderReview(args);
  if(kind==='job.change_order.authorization.record')return executeChangeOrderAuthorization(args);
  if(kind==='job.cost_review.schedule')return executeJobCostReview(args);
  if(kind==='invoice.followup.schedule')return executeInvoiceFollowup(args);
  if(kind==='calendar.conflict.reschedule')return executeConflictReschedule(args);
  if(kind==='customer.contact.record')return executeContactRecord(args);
  if(!db||typeof db.transaction!=='function')return Promise.reject(Error('Local database unavailable'));
  const plan=prepare(kind,payload,data,uid,()=>new Date().toISOString());
  const key=nonempty(requestKey)||'command:'+String(uid());
  const names=['commandLog',...new Set(plan.writes.map(x=>x.store))];
  return new Promise((resolve,reject)=>{
   let tx;try{tx=db.transaction(names,'readwrite')}catch(error){reject(error);return}
   let outcome=null,failed=false;
   tx.onerror=()=>{if(!failed){failed=true;reject(tx.error||Error('Command write failed'))}};
   tx.onabort=()=>{if(!failed){failed=true;reject(tx.error||Error('Command aborted'))}};
   tx.oncomplete=()=>resolve(outcome);
   const req=tx.objectStore('commandLog').get(key);
   req.onsuccess=()=>{
    const old=req.result;
    if(old){
     if(old.kind!==kind){tx.abort();return}
     outcome={id:old.resultId,reused:true,commandKey:key};
     return;
    }
    const time=new Date().toISOString();
    for(const write of plan.writes){tx.objectStore(write.store).put(write.record);domainEvents?.recordCommitted(tx,write.store,write.record,key,{actor,businessId:args.businessId||'local-business'},undefined,args.kind==='customer.create'||write.store==='jobs'&&args.kind==='quotation.convert')}
    tx.objectStore('commandLog').put({id:key,kind,resultId:plan.resultId,recordIds:plan.writes.map(x=>x.record.id),
      actor:brief(actor,40),createdAt:time,reused:!!plan.reused});
    outcome={id:plan.resultId,reused:!!plan.reused,commandKey:key};
   };
  });
 }
 function destination(order,data,prefs){
  if(order.destinationKind==='business'){
   const lat=prefs?.homeLat,lon=prefs?.homeLon;return position({latitude:lat,longitude:lon});
  }
  if(order.destinationKind==='custom')return position(order);
  const records=dataArray(data,order.destinationKind==='customer'?'customers':'jobs');
  return position(records.find(x=>x.id===order.destinationId));
 }
 // Great-circle interpolation; advisory geographic connection, never a road route.
 function greatCircle(from,to,steps=40){
  const rad=Math.PI/180;
  const xyz=p=>[Math.cos(p.lat*rad)*Math.cos(p.lon*rad),Math.cos(p.lat*rad)*Math.sin(p.lon*rad),Math.sin(p.lat*rad)];
  const a=xyz(from),b=xyz(to);
  const d=Math.acos(Math.max(-1,Math.min(1,a.reduce((s,x,i)=>s+x*b[i],0))));
  const points=[];
  for(let i=0;i<=steps;i++){
   const t=i/steps,w=d<1e-7?1:Math.sin(d),u=d<1e-7?1-t:Math.sin((1-t)*d)/w,v=d<1e-7?t:Math.sin(t*d)/w;
   const x=a.map((q,k)=>q*u+b[k]*v),lon=Math.atan2(x[1],x[0])/rad,lat=Math.atan2(x[2],Math.hypot(x[0],x[1]))/rad;
   points.push([lon,lat]);
  }
  // Break crossing lines into segments on opposite world edges, avoiding a line across the whole map.
  const segments=[],piece=[points[0]];
  for(let i=1;i<points.length;i++){
   const p=points[i-1],q=points[i],dx=q[0]-p[0];
   if(Math.abs(dx)>180){
    const edge=dx<0?180:-180,wrapped=dx<0?q[0]+360:q[0]-360;
    const t=(edge-p[0])/(wrapped-p[0]),lat=p[1]+t*(q[1]-p[1]);
    piece.push([edge,lat]);if(piece.length>1)segments.push(piece.slice());
    piece.length=0;piece.push([-edge,lat]);
   }
   piece.push(q);
  }
  if(piece.length>1)segments.push(piece);
  return segments;
 }
 function supplierLinks(data,prefs){
  const suppliers=new Map(dataArray(data,'suppliers').map(s=>[s.id,s])),features=[],missing=[],linkedSuppliers=new Set();
  const headquarters=position({latitude:prefs?.homeLat,longitude:prefs?.homeLon});
  for(const order of dataArray(data,'supplyOrders')){
   if(order.status==='Cancelled')continue;
   const supplier=suppliers.get(order.supplierId);
   const a=position(supplier),b=destination(order,data,prefs);
   if(!a||!b){missing.push(order.id);continue}
   const segments=greatCircle(a,b);
   if(order.destinationKind==='business')linkedSuppliers.add(String(order.supplierId));
   for(const coords of segments)features.push({type:'Feature',geometry:{type:'LineString',coordinates:coords},
    properties:{orderId:String(order.id),supplierId:String(order.supplierId),opportunityId:String(order.opportunityId||''),status:String(order.status),
     type:'supplier_connection_not_road_route',label:String(order.description||'Supply order')}});
  }
  // Model known supplier-to-headquarters relationships even without an order.
  // These are geographic connections, not shipments or road routes.
  const connectedSupplierIds=[];
  if(headquarters)for(const supplier of suppliers.values()){
   const from=position(supplier);
   if(!from)continue;
   connectedSupplierIds.push(String(supplier.id));
   if(linkedSuppliers.has(String(supplier.id)))continue;
   for(const coords of greatCircle(from,headquarters)){
    features.push({type:'Feature',geometry:{type:'LineString',coordinates:coords},
      properties:{orderId:'',supplierId:String(supplier.id),supplierName:String(supplier.name||'Supplier'),
        status:'Network',type:'supplier_network_connection',label:'Supplier → headquarters · geographic link'}});
   }
  }
  return {geojson:{type:'FeatureCollection',features},unmappedOrderIds:missing,
    mappedOrderCount:new Set(features.filter(x=>x.properties.orderId).map(x=>x.properties.orderId)).size,
    connectedSupplierCount:connectedSupplierIds.length};
 }
 function relationshipAudit(d){
  const refs=['customers','quotes','jobs','tasks','invoices','suppliers','supplyOrders','opportunities'],seen={},issues=[];
  for(const type of refs)seen[type]=new Set(dataArray(d,type).map(x=>x.id));
  for(const type of ['quotes','jobs','tasks','invoices']){
   for(const item of dataArray(d,type))if(item.customerId&&!seen.customers.has(item.customerId))issues.push({type,id:item.id,missing:'customer'});
  }
  for(const job of dataArray(d,'jobs'))if(job.quoteId&&!seen.quotes.has(job.quoteId))issues.push({type:'jobs',id:job.id,missing:'quote'});
  for(const o of dataArray(d,'supplyOrders')){
   if(!seen.suppliers.has(o.supplierId))issues.push({type:'supplyOrders',id:o.id,missing:'supplier'});
   if(o.opportunityId&&!seen.opportunities.has(o.opportunityId))issues.push({type:'supplyOrders',id:o.id,missing:'opportunity'});
   if(o.destinationKind==='customer'&&!seen.customers.has(o.destinationId))issues.push({type:'supplyOrders',id:o.id,missing:'customer'});
   if(o.destinationKind==='job'&&!seen.jobs.has(o.destinationId))issues.push({type:'supplyOrders',id:o.id,missing:'job'});
  }
  return issues;
 }
 return Object.freeze({position,prepare,execute,hashSource,greatCircle,supplierLinks,relationshipAudit});
});
