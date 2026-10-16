/* TradeFlow Supply — local supplier and delivery connection management, Sprint 01.
 * No shipment tracking, purchase fulfillment, road route, live geocoding or payments.
 */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowSupply=api;
})(typeof globalThis==='object'?globalThis:null,function(){
 'use strict';
 let bridge=null,form='',editId='',draft='';
 const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const opts=(rows,value='')=>rows.map(([id,text])=>'<option value="'+esc(id)+'" '+(String(id)===String(value)?'selected':'')+'>'+esc(text)+'</option>').join('');
 const value=(o,k)=>esc(o&&o[k]!==undefined&&o[k]!==null?o[k]:'');
 function badge(status){return '<span class="tf-supplier-status '+(status==='Delivered'?'is-delivered':'')+'">'+esc(status||'Planned')+'</span>'}
 function heading(title,desc){return '<header class="tf-supplier-heading"><small>TRADEFLOW / SUPPLY NETWORK</small><h1>'+esc(title)+'</h1><p>'+esc(desc)+'</p></header>'}
 function formSupplier(rec){
  return '<section class="tf-supplier-edit"><h2>'+(rec?.id?'Edit supplier':'Add supplier')+'</h2><form id="tfSupplierForm" data-id="'+value(rec,'id')+'">'+
   '<label>Supplier business name *<input required maxlength="140" name="name" value="'+value(rec,'name')+'" placeholder="Supplier name"></label>'+
   '<label>Business / dispatch address<input maxlength="300" name="address" value="'+value(rec,'address')+'" placeholder="Street, city, region, country"></label>'+
   '<div class="tf-supplier-grid"><label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" value="'+value(rec,'latitude')+'" placeholder="Optional"></label>'+
   '<label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" value="'+value(rec,'longitude')+'" placeholder="Optional"></label></div>'+
   '<details><summary>Contact and notes</summary><label>Public business phone<input maxlength="80" name="phone" value="'+value(rec,'phone')+'"></label>'+
   '<label>Public business email<input type="email" maxlength="180" name="email" value="'+value(rec,'email')+'"></label>'+
   '<label>Official website<input type="url" maxlength="400" name="website" value="'+value(rec,'website')+'"></label>'+
   '<label>Notes<textarea name="notes" maxlength="1200" rows="2">'+value(rec,'notes')+'</textarea></label></details>'+
   '<div class="tf-supplier-actions"><button type="submit" class="primary">Save supplier</button><button type="button" data-supply-action="cancel">Cancel</button></div></form>'+
   '<p class="tf-supplier-disclaimer">Map markers require verified coordinates. You can also select a location on the Map and link it to a saved supplier.</p></section>';
 }
 function formOrder(rec,data){
  const suppliers=data.suppliers||[];if(!suppliers.length)return '<p>Add a supplier before creating a supply order.</p>';
  const customerList=(data.customers||[]).map(x=>[x.id,x.name||'Customer']);
  const jobList=(data.jobs||[]).map(x=>[x.id,x.title||'Job']);
  const opportunityList=(data.opportunities||[]).map(x=>[x.id,x.project_name||'Opportunity']);
  const destination=rec?.destinationKind||'business';
  return '<section class="tf-supplier-edit"><h2>'+(rec?.id?'Edit supply order':'New supply order')+'</h2><form id="tfSupplyOrderForm" data-id="'+value(rec,'id')+'">'+
   '<label>Supplier *<select name="supplierId" required>'+opts(suppliers.map(x=>[x.id,x.name]),rec?.supplierId)+'</select></label>'+
   '<label>Materials / equipment *<input name="description" maxlength="240" required value="'+value(rec,'description')+'" placeholder="e.g. Breaker panels"></label>'+
   '<div class="tf-supplier-grid"><label>Status<select name="status">'+opts(['Planned','Ordered','In transit','Delivered','Cancelled'].map(x=>[x,x]),rec?.status||'Planned')+'</select></label>'+
   '<label>Expected date<input name="plannedDate" type="date" value="'+value(rec,'plannedDate')+'"></label></div>'+
   '<label>Destination<select name="destinationKind" id="tfSupplierDestinationKind">'+opts([['business','Business headquarters'],['customer','Customer location'],['job','Job location'],['custom','Custom address']],destination)+'</select></label>'+
   '<label data-supply-destination="customer" '+(destination!=='customer'?'hidden':'')+'>Customer<select name="customerDestination">'+opts(customerList,rec?.destinationKind==='customer'?rec.destinationId:'')+'</select></label>'+
   '<label data-supply-destination="job" '+(destination!=='job'?'hidden':'')+'>Job<select name="jobDestination">'+opts(jobList,rec?.destinationKind==='job'?rec.destinationId:'')+'</select></label>'+
   '<div data-supply-destination="custom" '+(destination!=='custom'?'hidden':'')+'><label>Delivery address<input name="destinationAddress" maxlength="300" value="'+(destination==='custom'?value(rec,'destinationAddress'):'')+'" placeholder="Street, city, region, country"></label>'+
   '<div class="tf-supplier-grid"><label>Latitude<input type="number" name="latitude" step="any" min="-90" max="90" value="'+(destination==='custom'?value(rec,'latitude'):'')+'"></label>'+
   '<label>Longitude<input type="number" name="longitude" step="any" min="-180" max="180" value="'+(destination==='custom'?value(rec,'longitude'):'')+'"></label></div></div>'+
   '<details><summary>Link to an opportunity / optional notes</summary><label>Related opportunity<select name="opportunityId"><option value="">None</option>'+opts(opportunityList,rec?.opportunityId)+'</select></label><textarea name="notes" maxlength="900" rows="2" placeholder="Order notes">'+value(rec,'notes')+'</textarea></details>'+
   '<div class="tf-supplier-actions"><button class="primary" type="submit">Save order</button><button type="button" data-supply-action="cancel">Cancel</button></div></form>'+
   '<p class="tf-supplier-disclaimer">Orders are organizational records, not purchases or tracking requests. Geographical connections are illustrative, not navigable road routes.</p></section>';
 }
 function render(data,prefs){
  const suppliers=data.suppliers||[],orders=data.supplyOrders||[];
  const connections=globalThis.TradeFlowCore?.supplierLinks(data,prefs)||{mappedOrderCount:0,unmappedOrderIds:[]};
  let area='<section class="tf-supplier-page"><button data-tab="settings" class="tf-supplier-back" type="button">‹ More</button>'+
   heading('Suppliers','Organize suppliers, deliveries and geographic connections in one headquarters.')+
   '<div class="tf-supplier-metrics"><div><strong>'+suppliers.length+'</strong><small>Suppliers</small></div><div><strong>'+orders.length+'</strong><small>Orders</small></div><div><strong>'+connections.mappedOrderCount+'</strong><small>Mapped links</small></div></div>'+
   '<div class="tf-supplier-tools"><button type="button" data-supply-action="newSupplier" class="primary">+ Supplier</button><button type="button" data-supply-action="newOrder" '+(!suppliers.length?'disabled':'')+'>+ Supply order</button><button type="button" data-tab="map">View network ↗</button></div>';
  if(form==='supplier')area+=formSupplier(suppliers.find(x=>x.id===editId));
  if(form==='order')area+=formOrder(orders.find(x=>x.id===editId),data);
  area+='<div class="tf-supplier-section-title"><h2>Supplier network</h2><small>'+suppliers.filter(x=>globalThis.TradeFlowCore?.position(x)).length+' map-ready</small></div>';
  area+=suppliers.length?'<div class="tf-supplier-list">'+suppliers.map(s=>'<article><span class="tf-supplier-symbol" aria-hidden="true">▣</span><div><strong>'+esc(s.name)+'</strong><small>'+esc(s.address||'Address not saved')+'</small><small>'+(globalThis.TradeFlowCore?.position(s)?'Location mapped':'Needs coordinates')+'</small></div><button type="button" data-supply-action="editSupplier" data-id="'+esc(s.id)+'" aria-label="Edit '+esc(s.name)+'">Edit</button></article>').join('')+'</div>':'<p class="tf-supplier-empty">No suppliers saved. Add your first supplier to start connecting deliveries to customers or jobs.</p>';
  area+='<div class="tf-supplier-section-title"><h2>Supply orders</h2><small>'+connections.unmappedOrderIds.length+' connections awaiting coordinates</small></div>';
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
  await bridge.render();
 }
 async function submit(e){
  if(!bridge||!['tfSupplierForm','tfSupplyOrderForm'].includes(e.target.id))return;
  e.preventDefault();e.stopPropagation();
  const el=e.target,f=Object.fromEntries(new FormData(el)),id=el.dataset.id;
  if(id)f.id=id;
  const kind=el.id==='tfSupplierForm'?'supplier.save':'supplyOrder.save';
  if(kind==='supplyOrder.save')f.destinationId=f.destinationKind==='customer'?f.customerDestination:f.destinationKind==='job'?f.jobDestination:'';
  try{
   const result=await bridge.execute(kind,f);
   form='';editId='';
   await bridge.render();bridge.notify((kind==='supplier.save'?'Supplier':'Supply order')+' saved');
  }catch(err){window.alert('Could not save: '+err.message)}
 }
 return Object.freeze({configure,render});
});