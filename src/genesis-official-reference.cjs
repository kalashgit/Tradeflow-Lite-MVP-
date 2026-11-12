// Trust-preserving bridge from the EXISTING offline OSHA reference pack to
// AION's bounded, general-reference conversation. The pack text and licensing
// are validated by TradeFlow's current offline-knowledge contract. No downloads,
// code enforcement claims, customer records, or instructions to use live wiring.
'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {openPack}=require('../public/offline-knowledge-pack.js');
const SOURCE=path.resolve(__dirname,'../public/osha-electrical-safety-pack.json');
const SAFETY=/\b(?:osha|1926|1910|lockout|tagout|de.?energiz\w*|energiz\w*|gfci|arc.?flash|shock|electrical safety|construction power|ground.?fault|live panel|electrical hazard)\b/i;
let cached;
async function referenceIndex(){
 if(!cached)cached=fs.readFile(SOURCE,'utf8')
   .then(text=>JSON.parse(text)).then(pack=>openPack(pack))
   .then(index=>{
    if(index.manifest.id!=='osha-electrical-safety-us-v1'||index.manifest.audience!=='redistributable_reference')
     throw Error('Unexpected electrical safety pack');
    return index;
   }).catch(error=>{cached=null;throw error});
 return cached;
}
async function safetyReferences(question,{limit=3}={}){
 if(typeof question!=='string'||question.length>6000)throw Error('Invalid reference request');
 if(!Number.isSafeInteger(limit)||limit<1||limit>3)throw Error('Invalid safety reference bound');
 if(!SAFETY.test(question))return [];
 const index=await referenceIndex();
 const hits=index.search(question,{jurisdiction:'US',limit});
 return hits.map(item=>{
  if(item.kind!=='official'||item.status!=='untrusted_reference_excerpt'||
     !item.sourceUrl?.startsWith('https://www.osha.gov/')||
     !item.sha256||!/^https:\/\//.test(item.sourceUrl))
   throw Error('Unsafe or unverified official safety provenance');
  return {
   id:'tf-osha-'+item.passageId.replace(/[^A-Za-z0-9_-]/g,'-'),
   title:item.heading,summary:item.text,
   sourceTitle:item.title,sourceUrl:item.sourceUrl,
   sourceType:'verified_offline_osha_paraphrase',
   reviewedOn:item.reviewedOn,
   limitations:'Federal general reference only; qualified professional and local AHJ/site requirements apply. Not permission to work energized.',
  };
 });
}
module.exports={safetyReferences,referenceIndex};
