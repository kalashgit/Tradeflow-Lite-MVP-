/* TradeFlow Supply — local supplier and delivery connection management, Sprint 01.
 * No shipment tracking, purchase fulfillment, road route, live geocoding or payments.
 */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowSupply=api;
})(typeof globalThis==='object'?globalThis:null,function(){
 'use strict';
 let bridge=null,form='',editId='',repairStatus='',repairBusy=false,detailSupplierId='',detailOrderId='',supplierQuery='',supplierFilter='all',supplierSort='az',orderSupplierId='';
 const po=typeof globalThis==='object'?globalThis.TradeFlowPurchaseOrders:null;
 const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const opts=(rows,value='')=>rows.map(([id,text])=>'<option value="'+esc(id)+'" '+(String(id)===String(value)?'selected':'')+'>'+esc(text)+'</option>').join('');
 const value=(o,k)=>esc(o&&o[k]!==undefined&&o[k]!==null?o[k]:'');
 function badge(status){return '<span class="tf-supplier-status '+(status==='Delivered'?'is-delivered':'')+'">'+esc(status||'Planned')+'</span>'}
 function heading(title,desc){return '<header class="tf-supplier-heading"><small>TRADEFLOW / SUPPLY NETWORK</small><h1>'+esc(title)+'</h1><p>'+esc(desc)+'</p></header>'}
 function formSupplier(rec){
  return '<section class="tf-supplier-edit"><h2>'+(rec?.id?'Edit supplier':'Add supplier')+'</h2><form id="tfSupplierForm" data-id="'+value(rec,'id')+'">'+
   '<label>Supplier business name *<input required maxlength="140" name="name" value="'+value(rec,'name')+'" placeholder="Supplier name"></label>'+
   '<label>Business / dispatch address<input maxlength="300" name="address" value="'+value(rec,'address')+'" placeholder="Street address or full Google Maps link"></label>'+
   '<div class="tf-supplier-grid"><label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" value="'+value(rec,'latitude')+'" placeholder="Optional"></label>'+
   '<label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" value="'+value(rec,'longitude')+'" placeholder="Optional"></label></div>'+
   '<details><summary>Contact and notes</summary><label>Public business phone<input maxlength="80" name="phone" value="'+value(rec,'phone')+'"></label>'+
   '<label>Public business email<input type="email" maxlength="180" name="email" value="'+value(rec,'email')+'"></label>'+
   '<label>Official website<input type="url" maxlength="400" name="website" value="'+value(rec,'website')+'"></label>'+
   '<label>Business category<input name="category" maxlength="70" value="'+value(rec,'category')+'" placeholder="e.g. Electrical materials"></label>'+
   '<label>Business hours<input name="businessHours" maxlength="160" value="'+value(rec,'businessHours')+'" placeholder="e.g. Mon–Fri, 7 AM–5 PM"></label>'+
   '<label><input type="checkbox" name="preferred" '+(rec?.preferred?'checked':'')+'> Preferred supplier</label>'+
   '<label>Official business photo URL (HTTPS)<input type="url" name="photoUrl" value="'+(String(rec?.photoUrl||'').startsWith('data:')?'':value(rec,'photoUrl'))+'" placeholder="https://..."></label>'+
   '<label>Or upload a photo you own<input type="file" name="photoUpload" accept="image/jpeg,image/png,image/webp"></label>'+
   (String(rec?.photoUrl||'').startsWith('data:')?'<input type="hidden" name="savedPhotoData" value="'+value(rec,'photoUrl')+'">':'')+
   '<small>Google Maps/Earth photos require a licensed integration. Uploaded photos stay on this device.</small>'+
   '<label>Notes<textarea name="notes" maxlength="1200" rows="2">'+value(rec,'notes')+'</textarea></label></details>'+
   '<div class="tf-supplier-actions"><button type="submit" class="primary">Save supplier</button><button type="button" data-supply-action="cancel">Cancel</button></div></form>'+
   '<p class="tf-supplier-disclaimer">TradeFlow locates saved addresses when possible. For exact locations, use a full Google Maps place link or select a point on Map. Shortened Google Maps links may not contain coordinates.</p></section>';
 }
 function lineRow(row={},i=0){
  return '<div class="tf-po-line" data-po-line><label class="tf-po-line-description">Item '+(i+1)+'<input name="lineDescription" maxlength="240" required placeholder="Material or equipment" value="'+value(row,'description')+'"></label>'+
   '<div class="tf-po-line-fields"><label>Qty<input name="lineQty" required type="number" min=".001" step=".001" value="'+esc(row.quantity??1)+'"></label>'+
   '<label>Unit<select name="lineUnit">'+opts([['unit','Unit'],['box','Box'],['m','Metre'],['kg','kg'],['hour','Hour'],['set','Set'],['roll','Roll']],row.unit||'unit')+'</select></label>'+
   '<label>Unit price<input name="linePrice" required type="number" min="0" step=".01" value="'+esc(row.unitPrice??0)+'"></label>'+
   '<button class="tf-po-remove" type="button" data-supply-action="removeLine" aria-label="Remove item">×</button></div></div>';
 }
 function formOrder(rec,data){
  const suppliers=data.suppliers||[];if(!suppliers.length)return '<p>Add a supplier before creating a purchase order.</p>';
  if(rec?.documentStatus==='Issued')return '<section class="tf-supplier-edit"><p class="tf-po-warning">Issued purchase orders cannot be edited. Create a new order to change commercial terms.</p><button data-supply-action="orderOpen" data-id="'+value(rec,'id')+'">View issued purchase order</button></section>';
  const customerList=(data.customers||[]).map(x=>[x.id,x.name||'Customer']);
  const jobList=(data.jobs||[]).map(x=>[x.id,x.title||'Job']);
  const opportunityList=(data.opportunities||[]).map(x=>[x.id,x.project_name||'Opportunity']);
  const destination=rec?.destinationKind||'business';
  const items=(Array.isArray(rec?.lineItems)&&rec.lineItems.length)?rec.lineItems:[{description:rec?.description||'',quantity:1,unit:'unit',unitPrice:0}];
  return '<section class="tf-supplier-edit tf-po-form"><header class="tf-po-form-header"><span class="tf-po-overline">PURCHASING / DRAFT</span><h2>'+(rec?.id?'Edit purchase order':'New purchase order')+'</h2><p>'+esc(rec?.poNumber||'A unique PO number is assigned on save')+'</p></header>'+
   '<form id="tfSupplyOrderForm" data-id="'+value(rec,'id')+'">'+
   '<label>Supplier *<select name="supplierId" required>'+opts(suppliers.map(x=>[x.id,x.name]),rec?.supplierId||orderSupplierId)+'</select></label>'+
   '<div class="tf-po-section-label"><strong>Items & prices</strong><span>Editable order lines</span></div>'+
   '<div id="tfPoLines">'+items.map(lineRow).join('')+'</div>'+
   '<button type="button" class="tf-po-addline" data-supply-action="addLine">+ Add item</button>'+
   '<div class="tf-supplier-grid"><label>Currency<select name="currency">'+opts(['EUR','USD','GBP','AUD','CAD'].map(x=>[x,x]),rec?.currency||'EUR')+'</select></label><label>Tax rate (%)<input name="taxRate" type="number" min="0" max="100" step=".01" value="'+esc(rec?.taxRate??0)+'"></label></div>'+
   '<label>Shipping charges<input name="shipping" type="number" min="0" step=".01" value="'+esc(rec?.shipping??0)+'"></label>'+
   '<div class="tf-po-totals" aria-live="polite"><div>Subtotal <strong data-po-subtotal>—</strong></div><div>Tax <strong data-po-tax>—</strong></div><div>Shipping <strong data-po-shipping>—</strong></div><div class="tf-po-total">Total <strong data-po-total>—</strong></div></div>'+
   '<div class="tf-po-section-label"><strong>Delivery & connections</strong></div>'+
   '<div class="tf-supplier-grid"><label>Requested delivery date<input name="plannedDate" type="date" value="'+value(rec,'plannedDate')+'"></label><label>Destination<select name="destinationKind" id="tfSupplierDestinationKind">'+opts([['business','Business HQ'],['customer','Customer site'],['job','Job site'],['custom','Custom']],destination)+'</select></label></div>'+
   '<label data-supply-destination="customer" '+(destination!=='customer'?'hidden':'')+'>Customer<select name="customerDestination">'+opts(customerList,rec?.destinationKind==='customer'?rec.destinationId:'')+'</select></label>'+
   '<label data-supply-destination="job" '+(destination!=='job'?'hidden':'')+'>Job<select name="jobDestination">'+opts(jobList,rec?.destinationKind==='job'?rec.destinationId:'')+'</select></label>'+
   '<div data-supply-destination="custom" '+(destination!=='custom'?'hidden':'')+'><label>Delivery address<input name="destinationAddress" maxlength="300" value="'+(destination==='custom'?value(rec,'destinationAddress'):'')+'" placeholder="Street, city, region, country"></label>'+
   '<div class="tf-supplier-grid"><label>Latitude<input type="number" name="latitude" step="any" min="-90" max="90" value="'+(destination==='custom'?value(rec,'latitude'):'')+'"></label>'+
   '<label>Longitude<input type="number" name="longitude" step="any" min="-180" max="180" value="'+(destination==='custom'?value(rec,'longitude'):'')+'"></label></div></div>'+
   '<label>Payment terms<input name="paymentTerms" maxlength="350" placeholder="e.g. Net 30 after invoice" value="'+value(rec,'paymentTerms')+'"></label>'+
   '<details class="tf-po-more"><summary>Opportunity and delivery instructions</summary><label>Related opportunity<select name="opportunityId"><option value="">None</option>'+opts(opportunityList,rec?.opportunityId)+'</select></label>'+
   '<label>Delivery instructions<textarea name="notes" maxlength="900" rows="2">'+value(rec,'notes')+'</textarea></label></details>'+
   '<div class="tf-supplier-actions"><button class="primary" type="submit">Save PO draft</button><button type="button" data-supply-action="cancel">Cancel</button></div></form>'+
   '<p class="tf-supplier-disclaimer">The purchase order is stored locally as a draft. Review and explicitly issue it before opening your email composer. No payment or email is sent automatically.</p></section>';
 }
 function render(data,prefs){
  const suppliers=data.suppliers||[],orders=data.supplyOrders||[];
  const connections=globalThis.TradeFlowCore?.supplierLinks(data,prefs)||{mappedOrderCount:0,unmappedOrderIds:[],connectedSupplierCount:0};
  let area='<section class="tf-supplier-page"><button data-tab="settings" class="tf-supplier-back" type="button">‹ More</button>'+
   heading('Suppliers','Organize suppliers, deliveries and geographic connections in one headquarters.')+
   '<div class="tf-supplier-metrics"><div><strong>'+suppliers.length+'</strong><small>Suppliers</small></div><div><strong>'+orders.length+'</strong><small>Orders</small></div><div><strong>'+connections.connectedSupplierCount+'</strong><small>HQ links</small></div></div>'+
   '<div class="tf-supplier-tools"><button type="button" data-supply-action="newSupplier" class="primary">+ Supplier</button><button type="button" data-supply-action="newOrder" '+(!suppliers.length?'disabled':'')+'>+ Supply order</button><button type="button" data-supply-action="resolve" '+(repairBusy?'disabled':'')+'>⌖ Locate addresses</button><button type="button" data-supply-action="viewNetwork">View network ↗</button></div>'+
'<div class="tf-supplier-location-status" role="status">'+(prefs?.businessAddress?(globalThis.TradeFlowCore?.position({latitude:prefs.homeLat,longitude:prefs.homeLon})?'Headquarters located':'Headquarters address saved · not mapped'):'Set your headquarters address in Business profile')+(repairStatus?' · '+esc(repairStatus):'')+'</div>';
  if(form==='supplier')area+=formSupplier(suppliers.find(x=>x.id===editId));
  if(form==='order')area+=formOrder(orders.find(x=>x.id===editId),data);
  area+='<div class="tf-supplier-section-title"><h2>Supplier network</h2><small>'+suppliers.filter(x=>globalThis.TradeFlowCore?.position(x)).length+' map-ready</small></div>';
  area+=suppliers.length?'<div class="tf-supplier-list">'+suppliers.map(s=>'<article><span class="tf-supplier-symbol" aria-hidden="true">▣</span><div><strong>'+esc(s.name)+'</strong><small>'+esc(s.address||'Address not saved')+'</small><small>'+(globalThis.TradeFlowCore?.position(s)?'Location mapped · review pin':'Needs location match')+'</small></div><button type="button" data-supply-action="editSupplier" data-id="'+esc(s.id)+'" aria-label="Edit '+esc(s.name)+'">Edit</button></article>').join('')+'</div>':'<p class="tf-supplier-empty">No suppliers saved. Add your first supplier to start connecting deliveries to customers or jobs.</p>';
  area+='<div class="tf-supplier-section-title"><h2>Supply orders</h2><small>'+connections.unmappedOrderIds.length+' orders awaiting coordinates</small></div>';
  area+=orders.length?'<div class="tf-supplier-list">'+orders.map(o=>{const supplier=suppliers.find(s=>s.id===o.supplierId);return '<article><span class="tf-supplier-symbol" aria-hidden="true">⇢</span><div><strong>'+esc(o.description)+'</strong><small>'+esc(supplier?.name||'Missing supplier')+' → '+esc(o.destinationAddress||'Destination not set')+'</small><small>'+badge(o.status)+' '+esc(o.plannedDate||'No date')+(o.opportunityId?' · Linked to opportunity':'')+'</small></div><button data-supply-action="editOrder" data-id="'+esc(o.id)+'">Edit</button></article>'}).join('')+'</div>':'<p class="tf-supplier-empty">No supply orders recorded. Creating one does not contact the supplier.</p>';
  return area+'<p class="tf-supplier-disclaimer">Neon lines on the Map represent geographic connections between saved coordinates. They are not verified road, shipping or flight routes. No live delivery tracking is active.</p></section>';
 }
 function configure(b){
  bridge=b;
  if(typeof document!=='undefined'){
   document.addEventListener('click',click);
   document.addEventListener('submit',submit);
   document.addEventListener('change',change);
  }
 }
 function change(e){
  if(e.target?.id!=='tfSupplierDestinationKind')return;
  const formEl=e.target.closest('form');if(!formEl)return;
  formEl.querySelectorAll('[data-supply-destination]').forEach(el=>el.hidden=el.dataset.supplyDestination!==e.target.value);
 }
 async function click(e){
  const button=e.target.closest?.('[data-supply-action]');if(!button||!bridge)return;
  e.preventDefault();e.stopPropagation();
  const action=button.dataset.supplyAction;
  if(action==='cancel'){form='';editId=''}
  else if(action==='newSupplier'){form='supplier';editId=''}
  else if(action==='newOrder'){form='order';editId=''}
  else if(action==='editSupplier'){form='supplier';editId=button.dataset.id}
  else if(action==='editOrder'){form='order';editId=button.dataset.id}
  else if(action==='resolve'||action==='viewNetwork'){
   if(repairBusy)return;
   repairBusy=true;repairStatus='Checking saved addresses…';await bridge.render();
   try{const result=await bridge.resolveLocations({max:3,interactive:action==='resolve'});
    repairStatus=result.checked?result.located+' located · '+result.unresolved+' need review'+(result.offline?' · '+result.offline+' lookup unavailable':'')+(result.remaining?' · '+result.remaining+' waiting':''):'No new addresses to locate';
    if(result.lastError&&result.located===0)repairStatus=result.lastError;
   }catch(err){repairStatus='Lookup unavailable: '+String(err.message||err).slice(0,110)}
   finally{repairBusy=false}
   if(action==='viewNetwork'){await bridge.navigate('map',{network:true});return}
   await bridge.render();return;
  }
  await bridge.render();
 }
 async function tfSupplierPhoto(file){
  if(!/^image\/(?:jpeg|png|webp)$/.test(file.type)||file.size>8000000)throw Error('Choose a JPG, PNG or WebP photo smaller than 8 MB');
  return await new Promise((resolve,reject)=>{
   const url=URL.createObjectURL(file),img=new Image();
   img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Cannot open photo'))};
   img.onload=()=>{
    URL.revokeObjectURL(url);
    try{
     const scale=Math.min(1,760/Math.max(img.naturalWidth,img.naturalHeight));
     const canvas=document.createElement('canvas');
     canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
     canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
     const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image conversion unavailable');
     ctx.drawImage(img,0,0,canvas.width,canvas.height);
     const result=canvas.toDataURL('image/jpeg',.7);
     if(result.length>=340000)throw Error('Photo is too large after compression. Try a smaller picture');
     resolve(result)
    }catch(e){reject(e)}
   };
   img.src=url;
  });
 }
 async function submit(e){
  if(!bridge||!['tfSupplierForm','tfSupplyOrderForm'].includes(e.target.id))return;
  e.preventDefault();e.stopPropagation();
  const el=e.target,f=Object.fromEntries(new FormData(el)),id=el.dataset.id;
  if(id)f.id=id;
  const kind=el.id==='tfSupplierForm'?'supplier.save':'supplyOrder.save';
  if(kind==='supplyOrder.save')f.destinationId=f.destinationKind==='customer'?f.customerDestination:f.destinationKind==='job'?f.jobDestination:'';
  try{
   if(kind==='supplier.save'){
    const upload=f.photoUpload;
    if(upload?.size){f.photoUrl=await tfSupplierPhoto(upload)}
    else if(!String(f.photoUrl||'').trim()&&f.savedPhotoData)f.photoUrl=f.savedPhotoData;
    delete f.photoUpload;delete f.savedPhotoData;
   }
   const result=await bridge.execute(kind,f);
   form='';editId='';repairStatus='';
   const opts=kind==='supplier.save'?{supplierIds:[result.id],skipBusiness:true,max:1}:{orderIds:[result.id],includeBusiness:true,max:2};
   const locate=await bridge.resolveLocations(opts);
   if(locate.located)repairStatus='Location plotted · review on map';
   else if(locate.checked)repairStatus='Saved · address needs mapping review';
   await bridge.render();bridge.notify((kind==='supplier.save'?'Supplier':'Supply order')+' saved');
  }catch(err){window.alert('Could not save: '+err.message)}
 }
 return Object.freeze({configure,render});
});