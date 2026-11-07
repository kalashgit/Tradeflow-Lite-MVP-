/* TradeFlow command constellation — alternate read-only perspective of the existing Home.
 * Does not touch business records, AI authority, or navigation ownership.
 */
(function(root){
'use strict';
if(!root.document)return;
const nodes=[
 ['marketing','Marketing Studio',12,6,'marketing'],
 ['integrations','Integrations',5,25,'integrations'],
 ['home','Home',22,31,'dashboard'],
 ['research','Research Briefs',59,12,'research'],
 ['personas','Buyer Personas',86,16,null],
 ['library','Library',52,26,'library'],
 ['opportunities','Opportunities',17,42,'opportunities'],
 ['customers','Customers',9,52,'customers'],
 ['quotes','Quotations',25,59,'quotes'],
 ['jobs','Jobs',51,47,'jobs'],
 ['dispatch','Crew & Dispatch',29,72,'dispatch'],
 ['calendar','Calendar',11,81,'calendar'],
 ['invoices','Invoices',53,78,'invoices'],
 ['profitability','Job Costing',71,67,'profitability'],
 ['finance','Finance',78,85,'expenses']
];
const links=[
 ['integrations','home','#a65eff'],['home','marketing','#aa59ff'],['home','opportunities','#4bfa84'],
 ['home','jobs','#4df78d'],['customers','home','#55f87d'],['customers','opportunities','#4dfa6a'],
 ['opportunities','jobs','#4cff85'],['customers','quotes','#4bec8d'],['quotes','jobs','#efa43c'],
 ['quotes','dispatch','#edb24f'],['dispatch','calendar','#50e87e'],['dispatch','jobs','#ffc053'],
 ['calendar','invoices','#f5b34d'],['dispatch','invoices','#ffb44a'],['invoices','jobs','#fbb04a'],
 ['jobs','profitability','#ff576c'],['profitability','finance','#5ce38e'],['invoices','finance','#ffb54c'],
 ['jobs','library','#ffd06a'],['library','research','#af55ff'],['research','personas','#ab59f4']
];
const byId=Object.fromEntries(nodes.map(n=>[n[0],n]));
let overlay=null,focused='jobs',originFocus=null;
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function randomStars(){
 let seed=91847;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 let o='';for(let i=0;i<330;i++){let x=rand()*900,y=rand()*1240,r=rand()>.94?1.7:.25+rand()*.65;o+='<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+r.toFixed(2)+'" fill="#e3ebff" opacity="'+(.2+rand()*.65).toFixed(2)+'"/>'}return o;
}
const stars=randomStars();
function svg(){
const curves=links.map(([a,b,color],i)=>{const p=byId[a],q=byId[b];const x=p[2]*9,y=p[3]*12.4,x2=q[2]*9,y2=q[3]*12.4;
 const cx=(x+x2)/2+(i%2?38:-35),cy=(y+y2)/2+(i%3?23:-32);
 return '<path d="M'+x+','+y+' Q'+cx+','+cy+' '+x2+','+y2+'" fill="none" stroke="'+color+'" stroke-width="1.8" opacity=".72"/><circle cx="'+cx+'" cy="'+cy+'" r="3" fill="'+color+'"/>';}).join('');
return '<svg class="tf-constellation-canvas" viewBox="0 0 900 1240" preserveAspectRatio="none" aria-hidden="true"><defs><radialGradient id="tf-galaxy"><stop stop-color="#1d3657" stop-opacity=".55"/><stop offset="1" stop-color="#03050e" stop-opacity="0"/></radialGradient><filter id="tf-star-glow"><feGaussianBlur stdDeviation="4"/></filter></defs><rect width="900" height="1240" fill="#030610"/><ellipse cx="350" cy="450" rx="380" ry="520" fill="url(#tf-galaxy)"/><ellipse cx="760" cy="80" rx="330" ry="280" fill="url(#tf-galaxy)"/><g>'+stars+'</g><g>'+curves+'</g>'+nodes.map(n=>{const color=n[0]==='jobs'?'#b2efff':n[0]==='profitability'?'#ff8f6a':['marketing','research','personas','integrations'].includes(n[0])?'#dbb8ff':'#e9efff';const x=n[2]*9,y=n[3]*12.4;return '<circle cx="'+x+'" cy="'+y+'" r="16" fill="'+color+'" opacity=".45" filter="url(#tf-star-glow)"/><circle cx="'+x+'" cy="'+y+'" r="5" fill="#fff"/>'}).join('')+'</svg>';
}
function nodeButtons(){return nodes.map(n=>'<button type="button" class="tf-constellation-node '+(n[0]===focused?'is-selected':'')+'" style="left:'+n[2]+'%;top:'+n[3]+'%" data-cnode="'+n[0]+'" aria-label="'+esc(n[1])+(n[3]===null?'':'')+'" '+(!n[4]?'title="Planned section"':'')+'><span>'+esc(n[1])+'</span></button>').join('')}
function card(){
 const n=byId[focused]||byId.jobs;
 const planned=!n[4];const title=n[1];
 const details=planned?'This area is not available in the current app.':'Open the existing '+title+' section to review your records and available workflows.';
 return '<div class="tf-constellation-card" role="region" aria-label="'+esc(title)+' details"><strong>'+esc(title)+'</strong><div class="tf-constellation-sub">'+(planned?'Planned capability':'Connected app section')+'</div><div class="tf-constellation-divider"></div><div class="tf-constellation-status"><span aria-hidden="true">✧</span><div><small>Operational status</small><b>'+ (planned?'Not available':'Not assessed on this map')+'</b></div></div><div class="tf-constellation-divider"></div><p>'+esc(details)+'</p>'+(planned?'':'<button type="button" class="tf-constellation-open" data-copen="'+esc(n[4])+'">Open '+esc(title)+' ›</button>')+'</div>'
}
function draw(){if(!overlay)return;overlay.querySelector('.tf-constellation-nodes').innerHTML=nodeButtons();overlay.querySelector('.tf-constellation-card-slot').innerHTML=card();}
function close(){if(!overlay)return;overlay.remove();overlay=null;root.document.body.classList.remove('tf-constellation-active');originFocus?.focus?.({preventScroll:true});}
function navigate(route){close();const button=[...root.document.querySelectorAll('[data-tab]')].find(b=>b.dataset.tab===route);if(button)button.click();}
function open(){
 if(overlay){close();return}
 originFocus=root.document.activeElement;
 overlay=root.document.createElement('section');overlay.id='tfConstellation';overlay.className='tf-constellation';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','TradeFlow command constellation');
 overlay.innerHTML='<div class="tf-constellation-world">'+svg()+'<header class="tf-constellation-top"><button type="button" class="tf-constellation-logo" data-cclose aria-label="TradeFlow — return to Home"><span class="tf-constellation-symbol" aria-hidden="true">T</span><span>TRADE<span>FLOW</span></span></button><span class="tf-constellation-caption">Command Center · Constellation</span></header><div class="tf-constellation-nodes"></div><div class="tf-constellation-card-slot"></div><div class="tf-constellation-bottom">Select a star to explore · Tap TradeFlow to return Home</div></div>';
 root.document.body.appendChild(overlay);root.document.body.classList.add('tf-constellation-active');
 draw();overlay.querySelector('[data-cclose]').focus({preventScroll:true});
}
root.document.addEventListener('click',function(event){
 const button=event.target.closest?.('.tf-home-header .tf-unified-brand');if(!button||overlay)return;
 event.preventDefault();event.stopImmediatePropagation();open();
},true);
root.document.addEventListener('click',function(event){
 if(!overlay)return;
 const node=event.target.closest?.('[data-cnode]'),go=event.target.closest?.('[data-copen]'),back=event.target.closest?.('[data-cclose]');
 if(back){event.preventDefault();close();return}
 if(node){event.preventDefault();focused=node.dataset.cnode;draw();return}
 if(go){event.preventDefault();navigate(go.dataset.copen)}
},true);
root.document.addEventListener('keydown',event=>{if(overlay&&event.key==='Escape'){event.preventDefault();close()}});
root.TradeFlowConstellation=Object.freeze({open,close,isOpen:()=>!!overlay});
})(window);
