/* TradeFlow formal purchase orders: deterministic, offline and mail-client-only.
 * No order is sent, paid or fulfilled by this module.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowPurchaseOrders=api;
})(typeof globalThis==='object'?globalThis:null,function(){
 'use strict';
 const trim=(x,n=200)=>String(x==null?'':x).trim().slice(0,n);
 const money=(amount,currency='EUR')=>{
  try{return new Intl.NumberFormat('en',{style:'currency',currency:currency||'EUR'}).format(Number(amount)||0)}
  catch{return (Number(amount)||0).toFixed(2)+' '+currency}
 };
 function totals(order){
  const rows=Array.isArray(order?.lineItems)?order.lineItems:[];
  const subtotal=Math.round(rows.reduce((sum,row)=>sum+(Number(row.quantity)||0)*(Number(row.unitPrice)||0),0)*100)/100;
  const taxRate=Number(order?.taxRate)||0;
  const tax=Math.round(subtotal*taxRate)/100;
  const shipping=Math.round((Number(order?.shipping)||0)*100)/100;
  return {subtotal,tax,shipping,total:Math.round((subtotal+tax+shipping)*100)/100};
 }
 function documentText(order,supplier,business,refs={}){
  if(!order?.poNumber||!supplier?.name)throw Error('Purchase order and supplier are required');
  const currency=order.currency||'EUR',t=totals(order);
  const buyer=trim(business?.company||business?.companyName||business?.name||'',150);
  if(!buyer)throw Error('Complete your business name in Settings before issuing a purchase order');
  if(!Array.isArray(order.lineItems)||!order.lineItems.length)throw Error('Add at least one purchase order item');
  const lines=['PURCHASE ORDER','PO No: '+trim(order.poNumber,40),'Date: '+trim((order.issuedAt||order.createdAt||new Date().toISOString()).slice(0,10),20),
   'Currency: '+currency,'','BUYER',buyer,trim(business?.businessAddress||'',300)];
  if(business.contactEmail)lines.push('Email: '+trim(business.contactEmail,180));
  if(business.contactPhone)lines.push('Phone: '+trim(business.contactPhone,80));
  lines.push('','SUPPLIER',trim(supplier.name,150));
  if(supplier.address)lines.push(trim(supplier.address,300));
  if(supplier.email)lines.push('Email: '+trim(supplier.email,180));
  lines.push('','DELIVERY',trim(order.destinationAddress||'Not specified',300));
  if(order.plannedDate)lines.push('Requested by: '+trim(order.plannedDate,10));
  if(refs.jobName)lines.push('Linked job: '+trim(refs.jobName,160));
  if(refs.customerName)lines.push('Linked customer: '+trim(refs.customerName,160));
  if(refs.opportunityName)lines.push('Linked opportunity: '+trim(refs.opportunityName,160));
  lines.push('','ITEMS');
  order.lineItems.forEach((row,index)=>{
   const quantity=Number(row.quantity)||0,price=Number(row.unitPrice)||0;
   lines.push((index+1)+'. '+trim(row.description,240));
   lines.push('   '+quantity+' '+trim(row.unit||'unit',20)+' × '+money(price,currency)+' = '+money(Math.round(quantity*price*100)/100,currency));
  });
  lines.push('','Subtotal: '+money(t.subtotal,currency));
  if(t.tax||order.taxRate)lines.push('Tax ('+(Number(order.taxRate)||0)+'%): '+money(t.tax,currency));
  if(t.shipping)lines.push('Shipping: '+money(t.shipping,currency));
  lines.push('TOTAL: '+money(t.total,currency));
  if(order.paymentTerms)lines.push('','Payment terms: '+trim(order.paymentTerms,350));
  if(order.notes)lines.push('','Instructions: '+trim(order.notes,900));
  lines.push('','Please confirm availability, pricing, and expected delivery.');
  lines.push('This purchase order requires supplier acceptance; it is not proof of payment or delivery.');
  return lines.filter((line,i)=>!(line===''&&lines[i-1]==='')).join('\n').trim();
 }
 function mailto(order,supplier,business,refs){
  const email=trim(supplier?.email,180);
  if(!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email))throw Error('Save a valid supplier email to compose this purchase order');
  const content=documentText(order,supplier,business,refs);
  if(content.length>8500)throw Error('Purchase order is too long for a reliable mobile Mail link. Copy or print the order instead');
  const subject='Purchase Order '+order.poNumber+' — '+trim(business.company||business.name||'TradeFlow',120);
  return 'mailto:'+email+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent('Hello,\n\nPlease find our purchase order below. Kindly confirm receipt and availability.\n\n'+content+'\n\nRegards,\n'+(trim(business.contactName)||trim(business.company)||'Purchasing team'));
 }
 return Object.freeze({totals,documentText,mailto,money});
});
