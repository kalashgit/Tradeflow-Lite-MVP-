/* TradeFlow Supply — local supplier and delivery connection management, Sprint 01.
 * No shipment tracking, purchase fulfillment, road route, live geocoding or payments.
 */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowSupply=api;
})(typeof globalThis==='object'?globalThis:null,function(){
 'use strict';
 let bridge=null,form='',editId='',repairStatus='',repairBusy=false,detailSupplierId='',detailOrderId='',supplierQuery='',supplierFilter='all',supplierSort='az',orderSupplierId='',showAllOrders=false;
 const po=typeof globalThis==='object'?globalThis.TradeFlowPurchaseOrders:null;
 const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const opts=(rows,value='')=>rows.map(([id,text])=>'<option value="'+esc(id)+'" '+(String(id)===String(value)?'selected':'')+'>'+esc(text)+'</option>').join('');
 const value=(o,k)=>esc(o&&o[k]!==undefined&&o[k]!==null?o[k]:'');
 function badge(status){return '<span class="tf-supplier-status '+(status==='Delivered'?'is-delivered':'')+'">'+esc(status||'Planned')+'</span>'}
 function heading(title,desc){return '<header class="tf-supplier-heading"><small>TRADEFLOW / SUPPLY NETWORK</small><h1>'+esc(title)+'</h1><p>'+esc(desc)+'</p></header>'}
 function formSupplier(rec){
  return '<section class="tf-supplier-edit"><h2>'+(rec?.id?'Edit supplier':'Add supplier')+'</h2><form id="tfSupplierForm" data-id="'+value(rec,'id')+'">'+
   '<label>Supplier business name *<input required maxlength="140" name="name" value="'+value(rec,'name')+'" placeholder="Supplier name"></label>'+
   '<label>Email for purchase orders<input type="email" maxlength="180" name="email" value="'+value(rec,'email')+'" placeholder="purchasing@supplier.com"></label>'+
   '<label>Public business phone<input maxlength="80" name="phone" value="'+value(rec,'phone')+'"></label>'+
   '<label>Business / dispatch address<input maxlength="300" name="address" value="'+value(rec,'address')+'" placeholder="Street, city, region"></label>'+
   '<details><summary>Advanced supplier details</summary><div class="tf-supplier-grid"><label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" value="'+value(rec,'latitude')+'" placeholder="Optional"></label>'+
   '<label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" value="'+value(rec,'longitude')+'" placeholder="Optional"></label></div>'+
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
  const business=(data.settings||[]).find(x=>x.id==='business')||{};
  const items=(Array.isArray(rec?.lineItems)&&rec.lineItems.length)?rec.lineItems:[{description:rec?.description||'',quantity:1,unit:'unit',unitPrice:0}];
  return '<section class="tf-supplier-edit tf-po-form"><header class="tf-po-form-header"><span class="tf-po-overline">PURCHASING / DRAFT</span><h2>'+(rec?.id?'Edit purchase order':'New purchase order')+'</h2><p>'+esc(rec?.poNumber||'A unique PO number is assigned on save')+'</p></header>'+
   '<form id="tfSupplyOrderForm" data-id="'+value(rec,'id')+'">'+
   (!business.company||!business.businessAddress?'<p class="tf-po-warning">Add your business name and address in Settings before issuing a formal purchase order.</p>':'')+
   '<label>Supplier *<select name="supplierId" required>'+opts(suppliers.map(x=>[x.id,x.name]),rec?.supplierId||orderSupplierId)+'</select></label>'+
   '<div class="tf-po-section-label"><strong>Items & prices</strong><span>Editable order lines</span></div>'+
   '<div id="tfPoLines">'+items.map(lineRow).join('')+'</div>'+
   '<button type="button" class="tf-po-addline" data-supply-action="addLine">+ Add item</button>'+
   '<div class="tf-supplier-grid"><label>Currency<select name="currency">'+opts(['USD','USD','GBP','AUD','CAD'].map(x=>[x,x]),rec?.currency||'USD')+'</select></label><label>Tax rate (%)<input name="taxRate" type="number" min="0" max="100" step=".01" value="'+esc(rec?.taxRate??0)+'"></label></div>'+
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
 function purchaseRefs(order,data){
  return {jobName:(data.jobs||[]).find(x=>x.id===order.destinationId&&order.destinationKind==='job')?.title||'',
   customerName:(data.customers||[]).find(x=>x.id===order.destinationId&&order.destinationKind==='customer')?.name||'',
   opportunityName:(data.opportunities||[]).find(x=>x.id===order.opportunityId)?.project_name||''};
 }
 function orderDetail(order,data,prefs){
  const supplier=(data.suppliers||[]).find(s=>s.id===order.supplierId);
  if(!supplier)return '<p class="tf-supplier-empty">The linked supplier is missing. Restore the supplier before issuing.</p>';
  let documentText='',error='';
  try{documentText=po.documentText(order,supplier,prefs,purchaseRefs(order,data))}
  catch(ex){error=ex.message}
  const issued=order.documentStatus==='Issued';
  const status=order.status||'Planned';
  const total=(order.total!=null?po.money(order.total,order.currency):'Unpriced legacy order');
  return '<section class="tf-po-detail"><div class="tf-po-detail-title"><span class="tf-po-overline">PURCHASE ORDER / '+(issued?'ISSUED':'DRAFT')+'</span>'+
    '<h2>'+esc(order.poNumber||'Unnumbered legacy order')+'</h2><p>'+esc(supplier.name)+' · '+esc(total)+'</p></div>'+
    '<div class="tf-po-detail-actions">'+(issued?
    '<button type="button" data-supply-action="composeMail" data-id="'+esc(order.id)+'" class="primary">✉ Compose in Mail</button>':
    '<button type="button" data-supply-action="issueCompose" data-id="'+esc(order.id)+'" class="primary">✓ Issue & compose in Mail</button>'+
    '<button type="button" data-supply-action="editOrder" data-id="'+esc(order.id)+'">Edit draft</button>')+
    '<button type="button" data-supply-action="printOrder" data-id="'+esc(order.id)+'">Print / Save PDF</button>'+
    '<button type="button" data-supply-action="copyOrder" data-id="'+esc(order.id)+'">Copy PO text</button></div>'+
    '<p class="tf-po-mail-notice">Opening Mail prepares a message. You review and press Send there. TradeFlow cannot verify delivery or mark email as sent.</p>'+
    (error?'<p role="alert" class="tf-po-warning">'+esc(error)+'</p>':'')+
    '<div class="tf-po-status-edit"><label>Delivery progress <select data-supply-progress="'+esc(order.id)+'">'+opts(['Planned','Ordered','In transit','Delivered','Cancelled'].map(x=>[x,x]),status)+'</select></label></div>'+
    '<article class="tf-po-document" aria-label="Purchase order preview"><div class="tf-po-document-head"><span>TRADEFLOW / PROCUREMENT</span><strong>'+esc(issued?'PURCHASE ORDER':'DRAFT — NOT ISSUED')+'</strong></div>'+
    (documentText?'<pre>'+esc(documentText)+'</pre>':'<p>Complete the missing details to generate the document.</p>')+'</article>'+
    '<section id="tfSupplyPrintSheet" class="tf-supply-print-sheet" aria-hidden="true"><pre>'+esc(documentText||'Purchase order details incomplete')+'</pre></section>'+
    '<p class="tf-supplier-disclaimer">This is the buyer’s purchase order, not a tax invoice or proof of supplier acceptance, payment, dispatch, or delivery. Issued commercial terms are locked; use a new PO for amendments.</p></section>';
 }
 function supplierDetail(s,data,prefs){
  const orders=(data.supplyOrders||[]).filter(o=>o.supplierId===s.id).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  const phone=String(s.phone||'').replace(/[^+0-9]/g,'');
  const email=String(s.email||'').trim();
  const website=String(s.website||'');
  const safeEmail=/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email);
  const safeWebsite=/^https:\/\/[^"'<>\s]+$/i.test(website);
  return '<section class="tf-supplier-dossier"><div class="tf-supplier-dossier-head"><div class="tf-supplier-avatar">'+esc((s.name||'S').slice(0,1).toUpperCase())+'</div>'+
    '<div><span class="tf-po-overline">SUPPLIER RECORD</span><h2>'+esc(s.name)+'</h2><p>'+esc(s.category||'Business supplier')+'</p></div></div>'+
    (s.preferred?'<span class="tf-supplier-preferred">● Preferred supplier</span>':'')+
    '<div class="tf-supplier-dossier-actions"><button data-supply-action="newOrder" data-supplier-id="'+esc(s.id)+'" class="primary">+ Purchase order</button><button data-supply-action="editSupplier" data-id="'+esc(s.id)+'">Edit supplier</button>'+
    '<button data-supply-action="viewNetwork">View on map ↗</button></div>'+
    '<div class="tf-supplier-contact">'+
    (s.address?'<p><strong>Address</strong><span>'+esc(s.address)+'</span></p>':'<p><strong>Address</strong><span>Not saved</span></p>')+
    (safeEmail?'<p><strong>Email</strong><a href="mailto:'+esc(email)+'">'+esc(email)+'</a></p>':'<p><strong>Email</strong><span>Add email to send purchase orders</span></p>')+
    (phone?'<p><strong>Phone</strong><a href="tel:'+esc(phone)+'">'+esc(s.phone)+'</a></p>':'')+
    (safeWebsite?'<p><strong>Website</strong><a href="'+esc(website)+'" target="_blank" rel="noopener noreferrer">Open website ↗</a></p>':'')+'</div>'+
    '<div class="tf-supplier-section-title"><h2>Purchase orders</h2><small>'+orders.length+' linked</small></div>'+
    (orders.length?'<div class="tf-supplier-rows">'+orders.map(o=>orderCard(o,s)).join('')+'</div>':'<p class="tf-supplier-empty">No purchase orders yet. Create one to connect procurement with your jobs and finances.</p>')+
    '</section>';
 }
 function supplierCard(s,orders){
  const count=orders.filter(o=>o.supplierId===s.id&&o.status!=='Cancelled'&&o.status!=='Delivered').length;
  const mapped=!!globalThis.TradeFlowCore?.position(s);
  return '<button type="button" class="tf-supplier-row" data-supply-action="supplierOpen" data-id="'+esc(s.id)+'" aria-label="Open supplier '+esc(s.name)+'">'+
   '<span class="tf-supplier-avatar" aria-hidden="true">'+esc((s.name||'S').slice(0,1).toUpperCase())+'</span>'+
   '<span class="tf-supplier-row-main"><strong>'+esc(s.name)+'</strong><small>'+esc(s.category||'Supplier')+'</small><small>'+esc(s.address||'Address not saved')+'</small></span>'+
   '<span class="tf-supplier-row-state">'+(s.preferred?'<span class="tf-supplier-preferred">Preferred</span>':count?'<span class="tf-supplier-count">'+count+' open</span>':mapped?'<span class="tf-supplier-count">Mapped</span>':'')+'</span>'+
   '<span class="tf-supplier-arrow" aria-hidden="true">›</span></button>';
 }
 function orderCard(order,supplier){
  const label=order.poNumber||'Legacy order';
  const total=order.total!=null?po.money(order.total,order.currency):'No price data';
  return '<button type="button" class="tf-supplier-order-row" data-supply-action="orderOpen" data-id="'+esc(order.id)+'">'+
   '<span class="tf-supplier-order-icon" aria-hidden="true">▤</span><span class="tf-supplier-row-main"><strong>'+esc(label)+'</strong>'+
   '<small>'+esc(supplier?.name||'Supplier missing')+' · '+esc(order.plannedDate||'No delivery date')+'</small></span>'+
   '<span class="tf-supplier-order-meta"><strong>'+esc(total)+'</strong><small>'+esc(order.documentStatus||'Draft')+'</small></span><span class="tf-supplier-arrow">›</span></button>';
 }
 function render(data,prefs){
  const suppliers=data.suppliers||[],orders=data.supplyOrders||[];
  const connections=globalThis.TradeFlowCore?.supplierLinks(data,prefs)||{mappedOrderCount:0,unmappedOrderIds:[],connectedSupplierCount:0};
  const mapped=suppliers.filter(s=>globalThis.TradeFlowCore?.position(s)).length;
  const open=orders.filter(o=>!['Delivered','Cancelled'].includes(o.status)).length;
  const menu='<button data-supply-action="home" class="tf-supplier-back" type="button">‹ '+(form||detailSupplierId||detailOrderId?'Suppliers':'More')+'</button>';
  let area='<section class="tf-supplier-page">'+menu;
  if(form==='supplier')return area+formSupplier(suppliers.find(x=>x.id===editId))+'</section>';
  if(form==='order')return area+formOrder(orders.find(x=>x.id===editId),data)+'</section>';
  if(detailOrderId)return area+orderDetail(orders.find(o=>o.id===detailOrderId)||{},data,prefs)+'</section>';
  if(detailSupplierId){const supplier=suppliers.find(s=>s.id===detailSupplierId);if(supplier)return area+supplierDetail(supplier,data,prefs)+'</section>';}
  area+=heading('Suppliers','Manage purchasing, deliveries and suppliers in one network.')+
    '<div class="tf-supplier-metrics"><div><span class="tf-supplier-metric-icon">♧</span><strong>'+suppliers.length+'</strong><small>Suppliers</small></div>'+
    '<div><span class="tf-supplier-metric-icon tf-metric-orders">⬡</span><strong>'+open+'</strong><small>Open orders</small></div>'+
    '<div><span class="tf-supplier-metric-icon tf-metric-mapped">⌖</span><strong>'+mapped+'</strong><small>Map locations</small></div></div>'+
    '<div class="tf-supplier-tools tf-supplier-primary-tools"><button type="button" data-supply-action="newSupplier" class="primary">+ Add supplier</button>'+
    '<button type="button" data-supply-action="newOrder" '+(!suppliers.length?'disabled':'')+'>+ Purchase order</button></div>'+
    '<div class="tf-supplier-toolbar"><label class="tf-supplier-search"><span aria-hidden="true">⌕</span><input id="tfSupplierSearch" value="'+esc(supplierQuery)+'" placeholder="Search suppliers" autocomplete="off" aria-label="Search suppliers"></label>'+
    '<button type="button" data-supply-action="viewNetwork" aria-label="View supplier map" title="View supplier map"><span aria-hidden="true">▱</span><span class="tf-supplier-map-label"> Map</span></button><button type="button" data-supply-action="filter" data-filter="'+(supplierFilter==='all'?'preferred':supplierFilter==='preferred'?'mapped':'all')+'">'+esc(supplierFilter==='all'?'All ▾':supplierFilter==='preferred'?'Preferred ▾':'Mapped ▾')+'</button></div>'+
    '<div class="tf-supplier-section-title"><h2>Suppliers</h2><label class="tf-supplier-sort">Sort <select id="tfSupplierSort">'+opts([['az','A–Z'],['za','Z–A'],['recent','Recent']],supplierSort)+'</select></label></div>';
  let view=suppliers.slice();
  if(supplierFilter==='preferred')view=view.filter(x=>x.preferred);
  if(supplierFilter==='mapped')view=view.filter(x=>globalThis.TradeFlowCore?.position(x));

  view.sort(supplierSort==='recent'?(a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')):supplierSort==='za'?(a,b)=>String(b.name).localeCompare(String(a.name)):(a,b)=>String(a.name).localeCompare(String(b.name)));
  const matchingSuppliers=view.filter(s=>!supplierQuery||(s.name+' '+(s.category||'')+' '+(s.address||'')).toLowerCase().includes(supplierQuery.toLowerCase())).length;
  area+=view.length?'<div class="tf-supplier-rows">'+view.map(s=>{const card=supplierCard(s,orders);return supplierQuery&&!(s.name+' '+(s.category||'')+' '+(s.address||'')).toLowerCase().includes(supplierQuery.toLowerCase())?card.replace('class="tf-supplier-row"','class="tf-supplier-row" hidden'):card}).join('')+'</div><p id="tfSupplierLiveEmpty" class="tf-supplier-empty" '+(matchingSuppliers?'hidden':'')+'>No matching suppliers. Change the search or filter.</p>':
    '<div class="tf-supplier-empty"><strong>'+(suppliers.length?'No matching suppliers':'No suppliers yet')+'</strong><p>'+(suppliers.length?'Adjust your search or filter.':'Add a supplier to start managing purchase orders and deliveries.')+'</p></div>';
  area+='<div class="tf-supplier-section-title"><h2>Purchase orders</h2><small>'+orders.length+' total</small></div>';
  area+=orders.length?'<div class="tf-supplier-rows">'+orders.slice().sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''))).slice(0,showAllOrders?orders.length:8).map(o=>orderCard(o,suppliers.find(s=>s.id===o.supplierId))).join('')+'</div>'+(orders.length>8?'<button type="button" class="tf-supplier-viewall" data-supply-action="toggleOrders">'+(showAllOrders?'Show recent only':'View all '+orders.length+' purchase orders')+'</button>':''):
   '<div class="tf-supplier-empty"><strong>No purchase orders</strong><p>Build an itemized PO, review it, and compose it in your native Mail app.</p></div>';
  area+='<div class="tf-supplier-secondary-actions"><button type="button" data-supply-action="resolve" '+(repairBusy?'disabled':'')+'>⌖ Locate addresses</button><span>'+mapped+' map-ready'+(repairStatus?' · '+esc(repairStatus):'')+'</span></div>'+
    '<p class="tf-supplier-disclaimer">Supplier locations require verification. Network lines are geographic connections, not transport routes or shipment tracking.</p>';
  return area+'</section>';
 }
 function configure(b){
  bridge=b;
  if(typeof document!=='undefined'){
   document.addEventListener('click',click);
   document.addEventListener('submit',submit);
   document.addEventListener('change',change);
   document.addEventListener('input',input);
  }
 }
 function recalcPurchaseForm(formEl){
  if(!formEl||!po)return;
  const lines=[...formEl.querySelectorAll?.('[data-po-line]')||[]].map(el=>({
   description:el.querySelector('[name="lineDescription"]')?.value||'',
   quantity:Number(el.querySelector('[name="lineQty"]')?.value)||0,
   unitPrice:Number(el.querySelector('[name="linePrice"]')?.value)||0
  }));
  const currency=formEl.querySelector('[name="currency"]')?.value||'USD';
  const {subtotal,tax,shipping,total}=po.totals({lineItems:lines,currency,taxRate:Number(formEl.querySelector('[name="taxRate"]')?.value)||0,shipping:Number(formEl.querySelector('[name="shipping"]')?.value)||0});
  for(const [name,number] of Object.entries({subtotal,tax,shipping,total})){
   const out=formEl.querySelector('[data-po-'+name+']');
   if(out)out.textContent=po.money(number,currency);
  }
 }
 function input(e){
  if(e.target?.id==='tfSupplierSearch'){
   supplierQuery=e.target.value.trim().slice(0,140);
   const query=supplierQuery.toLowerCase();
   let shown=0;
   document.querySelectorAll?.('.tf-supplier-row').forEach(row=>{
    const match=!query||row.textContent.toLowerCase().includes(query);
    row.hidden=!match;if(match)shown++;
   });
   const empty=document.querySelector?.('#tfSupplierLiveEmpty');
   if(empty)empty.hidden=shown>0;
  }
  const formEl=e.target.closest?.('#tfSupplyOrderForm');
  if(formEl)recalcPurchaseForm(formEl);
 }
 async function change(e){
  if(e.target?.id==='tfSupplierSort'){supplierSort=e.target.value;await bridge?.render?.();return}
  if(e.target?.dataset?.supplyProgress){
   const id=e.target.dataset.supplyProgress,record=await bridge.get('supplyOrders',id);
   if(!record)return;
   try{await bridge.execute('supplyOrder.progress',{id,status:e.target.value});await bridge.render();bridge.notify('Delivery progress updated')}
   catch(error){window.alert(String(error.message||error))}
   return;
  }
  if(e.target?.id==='tfSupplierDestinationKind'){
   const formEl=e.target.closest('form');if(!formEl)return;
   formEl.querySelectorAll('[data-supply-destination]').forEach(el=>el.hidden=el.dataset.supplyDestination!==e.target.value);
  }
  const formEl=e.target.closest?.('#tfSupplyOrderForm');if(formEl)recalcPurchaseForm(formEl);
 }
 async function prepareNativeMail(id,issue){
  const order=await bridge.get('supplyOrders',id);
  if(!order)throw Error('Purchase order not found');
  const supplier=await bridge.get('suppliers',order.supplierId);
  if(!supplier)throw Error('Supplier record is missing');
  const prefs=await bridge.get('settings','business')||{};
  const data={customers:await bridge.all('customers'),jobs:await bridge.all('jobs'),opportunities:await bridge.all('opportunities')};
  // Check buyer details, supplier email and Mail link length before issuing.
  const url=po.mailto({...order,issuedAt:order.issuedAt||new Date().toISOString()},supplier,prefs,purchaseRefs(order,data));
  if(issue&&order.documentStatus!=='Issued'){
   if(typeof window!=='undefined'&&!window.confirm('Issue purchase order '+order.poNumber+'? This locks its commercial terms. Mail will open with a draft; you must press Send yourself.'))return;
   await bridge.execute('supplyOrder.issue',{id});
  }
  await bridge.render();
  // This navigation happens only following an explicit tap. TradeFlow cannot detect Send.
  if(typeof window!=='undefined')window.location.href=url;
 }
 async function click(e){
  const button=e.target.closest?.('[data-supply-action]');if(!button||!bridge)return;
  e.preventDefault();e.stopPropagation();
  const action=button.dataset.supplyAction,id=button.dataset.id;
  if(action==='home'){
   if(form){form='';editId='';orderSupplierId=''}
   else if(detailOrderId)detailOrderId='';
   else if(detailSupplierId)detailSupplierId='';
   else{await bridge.navigate('settings');return}
  }else if(action==='cancel'){form='';editId=''}
  else if(action==='newSupplier'){form='supplier';editId='';detailSupplierId='';detailOrderId=''}
  else if(action==='newOrder'){form='order';editId='';orderSupplierId=button.dataset.supplierId||'';detailOrderId=''}
  else if(action==='editSupplier'){form='supplier';editId=id}
  else if(action==='editOrder'){form='order';editId=id}
  else if(action==='supplierOpen'){detailSupplierId=id;detailOrderId='';form=''}
  else if(action==='orderOpen'){detailOrderId=id;form=''}
  else if(action==='filter'){supplierFilter=button.dataset.filter||'all'}
  else if(action==='toggleOrders'){showAllOrders=!showAllOrders}
  else if(action==='addLine'){
   const container=document.getElementById('tfPoLines'),count=container?.querySelectorAll('[data-po-line]').length||0;
   if(!container||count>=35){bridge.notify('Maximum 35 items per purchase order');return}
   container.insertAdjacentHTML('beforeend',lineRow({},count));
   recalcPurchaseForm(container.closest('form'));
   return;
  }else if(action==='removeLine'){
   const container=button.closest('#tfPoLines'),line=button.closest('[data-po-line]');
   if(!container||!line)return;
   if(container.querySelectorAll('[data-po-line]').length<=1){bridge.notify('A purchase order needs at least one item');return}
   line.remove();container.querySelectorAll('[data-po-line]').forEach((row,i)=>{const label=row.querySelector('.tf-po-line-description');if(label)label.firstChild.textContent='Item '+(i+1)});
   recalcPurchaseForm(container.closest('form'));return;
  }else if(action==='composeMail'||action==='issueCompose'){
   try{await prepareNativeMail(id,action==='issueCompose')}catch(error){window.alert('Cannot open Mail: '+String(error.message||error))}
   return;
  }else if(action==='copyOrder'||action==='printOrder'){
   const order=await bridge.get('supplyOrders',id),supplier=order&&await bridge.get('suppliers',order.supplierId),prefs=await bridge.get('settings','business')||{};
   const data={customers:await bridge.all('customers'),jobs:await bridge.all('jobs'),opportunities:await bridge.all('opportunities')};
   try{
    const text=po.documentText(order,supplier,prefs,purchaseRefs(order,data));
    if(action==='printOrder'){if(typeof window!=='undefined')window.print();return}
    if(typeof navigator==='undefined'||!navigator.clipboard?.writeText)throw Error('Clipboard unavailable on this device. Use Print / Save PDF instead');
    await navigator.clipboard.writeText(text);bridge.notify('Purchase order copied');
   }catch(error){window.alert(String(error.message||error))}
   return;
  }else if(action==='resolve'||action==='viewNetwork'){
   if(repairBusy)return;
   repairBusy=true;repairStatus='Checking saved addresses…';await bridge.render();
   try{
    const result=await bridge.resolveLocations({max:3,interactive:action==='resolve'});
    repairStatus=result.checked?result.located+' located · '+result.unresolved+' need review'+(result.offline?' · '+result.offline+' lookup unavailable':'')+(result.remaining?' · '+result.remaining+' waiting':''):'No new addresses to locate';
    if(result.lastError&&result.located===0)repairStatus=result.lastError;
   }catch(err){repairStatus='Lookup unavailable: '+String(err.message||err).slice(0,110)}
   finally{repairBusy=false}
   if(action==='viewNetwork'){await bridge.navigate('map',{network:true});return}
  }
  await bridge.render();
  if(form==='order')recalcPurchaseForm(document.getElementById('tfSupplyOrderForm'));
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
  const el=e.target,fd=new FormData(el),f=Object.fromEntries(fd),id=el.dataset.id;
  if(id)f.id=id;
  const kind=el.id==='tfSupplierForm'?'supplier.save':'supplyOrder.save';
  if(kind==='supplyOrder.save'){
   f.destinationId=f.destinationKind==='customer'?f.customerDestination:f.destinationKind==='job'?f.jobDestination:'';
   const names=fd.getAll('lineDescription'),quantities=fd.getAll('lineQty'),units=fd.getAll('lineUnit'),prices=fd.getAll('linePrice');
   f.lineItems=names.map((description,i)=>({description:String(description).trim(),quantity:quantities[i],unit:units[i],unitPrice:prices[i]}));
   if(!f.lineItems.length||f.lineItems.some(x=>!x.description)){window.alert('Enter a description for every item');return}
  }
  try{
   if(kind==='supplier.save'){
    const upload=f.photoUpload;
    if(upload?.size)f.photoUrl=await tfSupplierPhoto(upload);
    else if(!String(f.photoUrl||'').trim()&&f.savedPhotoData)f.photoUrl=f.savedPhotoData;
    delete f.photoUpload;delete f.savedPhotoData;
   }
   const result=await bridge.execute(kind,f);
   form='';editId='';repairStatus='';
   if(kind==='supplier.save'){detailSupplierId=result.id;detailOrderId=''}
   else{detailOrderId=result.id;orderSupplierId=''}
   // Address enrichment is a convenience, not a prerequisite for saving locally.
   try{
    const locate=await bridge.resolveLocations(kind==='supplier.save'?{supplierIds:[result.id],skipBusiness:true,max:1}:{orderIds:[result.id],includeBusiness:true,max:2});
    if(locate.located)repairStatus='Location plotted · review on map';
    else if(locate.checked)repairStatus='Location still needs mapping review';
   }catch(error){repairStatus='Saved locally · address lookup unavailable'}
   await bridge.render();
   bridge.notify(kind==='supplier.save'?'Supplier saved':'Purchase order draft saved');
  }catch(err){window.alert('Could not save: '+String(err.message||err))}
 }
 return Object.freeze({configure,render,focusRecord:id=>{detailSupplierId=id;detailOrderId='';form=null},currentRecord:()=>detailSupplierId?{store:'suppliers',id:detailSupplierId}:null});
});