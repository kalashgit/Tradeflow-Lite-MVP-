/* TradeFlow US display defaults. Do not silently convert previously stored amounts. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowUS=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const LOCALE='en-US',CURRENCY='USD',MI_PER_KM=0.621371192237334;
const money=n=>new Intl.NumberFormat(LOCALE,{style:'currency',currency:CURRENCY}).format(Number(n)||0);
const date=(value,options={month:'short',day:'numeric',year:'numeric'})=>new Date(value).toLocaleDateString(LOCALE,options);
const miles=km=>Number(km)*MI_PER_KM;
const feet=meters=>Number(meters)*3.280839895;
const fahrenheit=celsius=>Number(celsius)*9/5+32;
return Object.freeze({LOCALE,CURRENCY,MI_PER_KM,money,date,miles,feet,fahrenheit});
});
