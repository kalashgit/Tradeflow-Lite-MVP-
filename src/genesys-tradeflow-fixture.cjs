// Maps PR #110's synthetic five-person contractor book into TradeFlow's own
// IndexedDB record shapes, so the Genesys loop runs real TradeFlow operations
// against it. Synthetic only: no real customers, money or contact.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const SOURCE=path.resolve(__dirname,'../automation/simulator/genesis-five-person-business.json');
const BUSINESS_ID='local-business';
const QUOTE_STATUS={accepted:'Accepted',sent:'Sent',draft:'Draft'};
const INVOICE_STATUS={issued:'Issued',paid:'Paid',draft:'Draft'};
function loadBusiness(file=SOURCE){return JSON.parse(fs.readFileSync(file,'utf8'))}
function tradeflowStores(business=loadBusiness()){
 if(business.synthetic!==true)throw Error('Only the synthetic contractor book can seed the Genesys loop');
 const b=BUSINESS_ID;
 const customers=business.customers.map(c=>({id:c.id,name:c.name,businessId:b,status:c.status,sector:c.sector}));
 const quotes=business.quotes.map(q=>({id:q.id,title:q.scope,customerId:q.customerId,status:QUOTE_STATUS[q.status]||q.status,
  amount:q.amount,currency:'USD',...(q.status==='sent'&&q.date?{sentDate:q.date}:{}),...(q.date?{date:q.date}:{}),businessId:b}));
 const jobs=business.jobs.map(j=>({id:j.id,title:j.title,customerId:j.customerId,...(j.quoteId?{quoteId:j.quoteId}:{}),
  status:j.status,businessId:b}));
 const invoices=business.invoices.map(i=>({id:i.id,reference:i.id.toUpperCase(),customerId:i.customerId,jobId:i.jobId,
  status:INVOICE_STATUS[i.status]||i.status,dueDate:i.dueDate,currency:'USD',taxRate:0,
  lines:[{description:'Contract billing',qty:1,unitPrice:i.amount}],businessId:b}));
 const byInvoice=Object.fromEntries(business.invoices.map(i=>[i.id,i]));
 const payments=business.payments.map(p=>({id:p.id,invoiceId:p.invoiceId,customerId:byInvoice[p.invoiceId]?.customerId,
  amount:p.amount,currency:'USD',date:p.settledOn,businessId:b}));
 return {customers,quotes,jobs,invoices,payments,tasks:[],events:[]};
}
module.exports={tradeflowStores,loadBusiness,BUSINESS_ID,AS_OF:'2026-11-12'};
