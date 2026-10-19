/* Buyer-side service-demand policy. Pure: no network, storage or execution. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowLeadDemandPolicy=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
function date(value){
 const text=clean(value).replace(/(\d)(?:st|nd|rd|th)\b/gi,'$1');let m,iso='';
 if((m=text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)))iso=m[0];
 else if((m=text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)))iso=`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
 else if((m=text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/))){const month=months.findIndex(x=>x.startsWith(m[1].toLowerCase()));if(month>=0)iso=`${m[3]}-${String(month+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`}
 if(!iso||isNaN(Date.parse(iso+'T12:00:00Z')))return '';
 return new Date(iso+'T12:00:00Z').toISOString().slice(0,10)===iso?iso:'';
}
function timing(text,now){
 const found=[];const labels=/\b(?:bids? due|proposals? due|responses? due|due date|closing date|close date|deadline|bid opening|submission deadline|closing time)\s*(?:is|on|:)?[\s*|:-]*/gi;
 for(const match of text.matchAll(labels)){const value=date(text.slice(match.index+match[0].length,match.index+match[0].length+65));if(value)found.push({date:value,quote:clean(text.slice(match.index,match.index+match[0].length+90))})}
 const unique=[...new Set(found.map(x=>x.date))];const deadline=unique.length===1?unique[0]:'';
 return {deadline,dates:found,conflicting:unique.length>1,expired:!!deadline&&deadline<now.slice(0,10),sameDay:deadline===now.slice(0,10)};
}
const patterns={
 subcontractor_request:/\b(?:seeking|inviting|requesting|looking for|in need of)\s+(?:qualified\s+|licensed\s+)?subcontractors?\b|\bsubcontractor (?:bids|proposals)\b/gi,
 service_request:/\b(?:I need|we need|we are seeking|seeking|looking for|in need of|requesting|requires|needs)\s+(?:(?:a|an|licensed|qualified|experienced|emergency|local)\s+){0,3}(?:[\w-]+\s+){0,4}(?:plumber|electrician|roofer|contractor|repairs?|replacement|maintenance|services?)\b/gi,
 procurement_notice:/\b(?:invitation (?:to|for) bid|request for (?:proposals?|bids?|quotations?|qualifications)|RFP|RFQ|ITB|invitation to tender|sealed bids|solicitation)\b/gi,
 project_signal:/\b(?:building permit|construction permit|permit issued|site plan|renovation project|roof replacement project|planned construction|building expansion|capital improvement project)\b/gi,
 buyer_relationship:/\b(?:vendor registration|supplier registration|contractor registration|maintenance vendors|approved vendors)\b/gi
};
function analyze(candidate,sources,trades,vocabulary,now=new Date().toISOString()){
 const primary=sources.find(s=>s.url===candidate.url)||sources[0];const text=String(primary?.content||'');
 const terms=trades.flatMap(t=>vocabulary[t.toLowerCase()]||[t]).map(t=>t.toLowerCase());
 const evidence=[];let kind='none',category='unclassified';
 // A demand statement must be supported on the discovered page, close to the trade.
 // A linked contact/about page cannot manufacture service demand.
 for(const [type,expression]of Object.entries(patterns)){
  expression.lastIndex=0;
  for(const match of text.matchAll(expression)){
   const start=Math.max(0,match.index-350),quote=text.slice(start,Math.min(text.length,match.index+match[0].length+450));
   const normalized=' '+quote.toLowerCase().replace(/[^a-z0-9]+/g,' ')+' ';
   if(!terms.some(t=>normalized.includes(' '+t.replace(/[^a-z0-9]+/g,' ').trim()+' ')))continue;
   if(type==='service_request'&&(/(?:are you|if you|when you)\s*$/i.test(text.slice(Math.max(0,match.index-25),match.index))||/^\s*\?/.test(text.slice(match.index+match[0].length,match.index+match[0].length+8))))continue;
   if(type==='buyer_relationship'&&!/\b(?:property management|property manager|facilities|facility|housing authority|school district|purchasing|procurement)\b/i.test(quote))continue;
   evidence.push({sourceUrl:primary.url,quote:clean(quote),retrievedAt:primary.retrievedAt||now});
   category=type;kind=['service_request','procurement_notice','subcontractor_request'].includes(type)?'explicit_request':type;break;
  }
  if(evidence.length)break;
 }
 const temporal=timing(text,now),reasons=[],limitations=[];
 const closed=/\b(?:status\s*[:|*-]+\s*(?:closed|awarded|cancelled|canceled)|(?:bid|tender|solicitation|project)\s+(?:is\s+)?(?:closed|awarded|cancelled|canceled)|no longer (?:accepting|seeking)|not accepting (?:bids|proposals|applications))\b/i.test(text);
 const recruiting=/\b(?:careers|job openings?|employment|hiring (?:a |an )?(?:plumber|electrician|roofer)|salary|apply for this job)\b/i.test(candidate.title||'');
 if(kind==='none')reasons.push('no_buyer_side_service_need');
 if(closed)reasons.push('request_closed_or_withdrawn');if(temporal.expired)reasons.push('expired_deadline');if(temporal.conflicting)reasons.push('conflicting_deadlines_require_clarification');if(recruiting)reasons.push('employment_not_customer_work');
 if(/\b(?:join our team|full[- ]time employment|hourly wage)\b/i.test(evidence[0]?.quote||''))reasons.push('employment_not_customer_work');
 const title=candidate.title||'';if(/\b(?:portfolio|case stud(?:y|ies)|our completed projects|our work)\b/i.test(title))reasons.push('completed_portfolio_not_customer_work');if(/\b(?:how to|guide to|templates?|fundamentals|tutorial|training|webinar)\b/i.test(title))reasons.push('educational_content_not_customer_work');
 let status=kind==='explicit_request'?(temporal.deadline&&!temporal.sameDay?'published_deadline_ahead':'availability_unverified'):kind==='project_signal'?'possible_need':kind==='buyer_relationship'?'relationship_only':'not_a_lead';
 if(closed||temporal.expired)status='closed_or_expired';if(temporal.conflicting)status='date_clarification_required';
 if(kind==='explicit_request'&&!temporal.deadline)limitations.push('No unambiguous closing date was found. Confirm that this request is still accepting responses.');
 if(temporal.sameDay)limitations.push('The closing date is today. Local closing time and business timezone need confirmation.');
 if(kind==='project_signal')limitations.push('A project or permit is a possible service need, not proof that a contractor is being sought.');
 if(kind==='buyer_relationship')limitations.push('This organization describes a vendor relationship. No open job or current buying intent is established.');
 const posted=date(candidate.publishedDate);if(posted&&Date.parse(now)-Date.parse(posted+'T12:00:00Z')>90*86400000&&!temporal.deadline)limitations.push('The source is over 90 days old; recheck current relevance before contacting.');
 const why=kind==='explicit_request'?'The source explicitly requests trade-related work or bids.':kind==='project_signal'?'A documented project may create relevant trade work.':kind==='buyer_relationship'?'The buyer publishes a relevant maintenance/vendor route.':'No supported customer need was found.';
 const requester=/\b(?:I need|my home|my house)\b/i.test(evidence[0]?.quote||'')?'public_requester':'organization_or_unknown';
 const locationText=[title,...evidence.map(e=>e.quote),...Array.from(text.matchAll(/\b(?:project location|place of performance|work location|service location)\s*[:|]\s*[^\n]{5,250}/gi),m=>m[0])].join('\n');
 return {version:1,kind,category,status,why,requester,deadline:temporal.deadline,deadlineEvidence:temporal.dates,evidence,locationText,reasons,limitations,baseScore:kind==='explicit_request'?(temporal.deadline?75:60):kind==='project_signal'?45:kind==='buyer_relationship'?35:0};
}
function describe(demand,now=new Date().toISOString()){
 if(demand.deadline&&demand.deadline<now.slice(0,10))return 'Response deadline passed — not a current open request';
 return ({published_deadline_ahead:'Published deadline ahead — verify that responses are still accepted',availability_unverified:'Service request found — current availability unverified',possible_need:'Project signal — possible work, no request confirmed',relationship_only:'Potential buyer relationship — no current job confirmed',closed_or_expired:'Closed or expired — do not treat as an active lead',date_clarification_required:'Conflicting deadlines — clarification required',not_a_lead:'No supported customer need found'})[demand.status]||'Current availability unverified';
}
return Object.freeze({date,timing,analyze,describe});
});
