/* TradeFlow Core Integration 01.
 * Deterministic provider-independent record commands and mapped supplier connections.
 * No AI, network, provider secrets, verified routing claims, or automatic data migrations.
 */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./record-interpreter.js'):root?.TradeFlowRecordInterpreter);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowCore=api;
})(typeof globalThis==='object'?globalThis:null,function(records){
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
   return {resultId:existing?.id||id,writes:[{store:'supplyOrders',record:{...existing,id:existing?.id||id,supplierId,
    poNumber,documentStatus:'Draft',pricingConfirmed:!!providedLines,createdAt:existing?.createdAt||when,
    lineItems,currency,taxRate,shipping:shippingAmount,subtotal,tax,total,paymentTerms,
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
     for(const write of plan.writes)tx.objectStore(write.store).put(write.record);
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
      for(const write of plan.writes)tx.objectStore(write.store).put(write.record);
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
 function execute(args){
  const {db,kind,payload,data,uid,requestKey,actor='local-owner'}=args||{};
  if(kind==='customer.create'||kind==='customer.source.delete')return executeCustomer(args);
  if(kind==='quotation.convert')return executeQuotation(args);
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
    for(const write of plan.writes)tx.objectStore(write.store).put(write.record);
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