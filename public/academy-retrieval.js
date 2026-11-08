/* TradeFlow Academy v1: read-only retrieval of curriculum metadata, not book content. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowAcademyRetrieval=api;
})(typeof globalThis==='object'?globalThis:null,function(){
 'use strict';
 const SOURCE=/^tf-academy-\d{3}$/;
 const WORDS=new Set(['the','and','for','with','from','that','this','what','which','how','does','about','into','are','can','our','tradeflow','academy','book','books','source','sources','knowledge','study','learning','list','find','show','me','use','please','according','to','in','of','on','my','a','an']);
 const intent=/(?:\bacademy\b|\bbooks?\b|\breading list\b|\bknowledge library\b|\bstudy sources?\b)/i;
 function isAcademyQuestion(query){return typeof query==='string'&&intent.test(query)}
 function terms(value){return [...new Set((String(value).toLowerCase().match(/[a-z0-9]+/g)||[]).filter(w=>w.length>2&&!WORDS.has(w)))];}
 function create(catalog){
  if(!catalog||catalog.schema!=='tradeflow.academy-catalog.v1'||catalog.sourceCount!==59||!Array.isArray(catalog.sources)||catalog.sources.length!==59)throw Error('Academy catalog is incomplete');
  const ids=new Set();
  const sources=catalog.sources.map(row=>{
   if(!row||!SOURCE.test(row.sourceId)||ids.has(row.sourceId)||!Number.isInteger(row.index)||row.index<1||row.index>59||
      !['A','B','C'].includes(row.cohort)||typeof row.title!=='string'||!row.title||typeof row.author!=='string'||!row.author||
      typeof row.learningObjective!=='string'||!row.learningObjective||typeof row.sourceUrl!=='string'||!/^https:\/\//.test(row.sourceUrl)||
      row.ingestionStatus!=='metadata_only'||row.rightsStatus!=='not_reviewed'||row.passageCount!==0)throw Error('Invalid Academy source metadata');
   ids.add(row.sourceId);
   return Object.freeze({...row,searchTokens:new Set(terms(row.title+' '+row.author+' '+row.learningObjective))});
  });
  function search(query,{limit=3}={}){
   if(typeof query!=='string'||query.length>1200||!Number.isInteger(limit)||limit<1||limit>5)throw Error('Invalid Academy search');
   const words=terms(query);if(!words.length)return [];
   return sources.map(row=>{
    const titleTokens=new Set(terms(row.title));
    const titleHits=words.filter(w=>titleTokens.has(w)).length;
    const allHits=words.filter(w=>row.searchTokens.has(w)).length;
    return {row,score:titleHits*3+allHits};
   }).filter(hit=>hit.score>0).sort((a,b)=>b.score-a.score||a.row.index-b.row.index).slice(0,limit).map(({row})=>Object.freeze({
    sourceId:row.sourceId,index:row.index,title:row.title,author:row.author,sourceUrl:row.sourceUrl,
    learningObjective:row.learningObjective,cohort:row.cohort,ingestionStatus:'metadata_only',
    evidenceRef:'academy:'+row.sourceId+'@1'
   }));
  }
  function answer(query){
   if(!isAcademyQuestion(query))return {handled:false};
   const hits=search(query);
   const prefix='TRADEFLOW ACADEMY · OFFLINE CATALOG ONLY\nThe Academy currently contains source titles and TradeFlow-authored learning objectives, not the books or verified technical passages. No business action was taken.';
   const body=hits.length?'\n\nRelevant curriculum entries:\n'+hits.map(hit=>
    '#'+hit.index+' '+hit.title+' — '+hit.author+'\nTradeFlow learning objective: '+hit.learningObjective+'\nSource: '+hit.sourceUrl
   ).join('\n\n'):'\n\nNo matching source titles or learning objectives were found. Try a specific book, author or topic.';
   return {handled:true,content:(prefix+body).slice(0,2450),refs:hits.map(h=>h.evidenceRef),hits};
  }
  return Object.freeze({sourceCount:sources.length,search,answer});
 }
 return Object.freeze({isAcademyQuestion,create});
});
