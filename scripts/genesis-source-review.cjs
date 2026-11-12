#!/usr/bin/env node
// Read-only, zero-network AION external source change-review queue.
// Firecrawl or an independent research worker may use these canonical URLs,
// but must submit any proposed summary changes through a reviewed PR.
// No source page text is ever injected directly into production inference.
'use strict';
const {validate,refreshQueue,SOURCES,VERSION}=require('../src/genesis-external-knowledge.cjs');

function report(asOf){
 const quality=validate();
 if(!quality.pass)throw Error('External knowledge corpus integrity violation: '+quality.issues.join('; '));
 const due=refreshQueue(asOf);
 const scope=Object.values(SOURCES);
 return {schema:'AIONExternalSourceReview/1',
  asOf,knowledgeVersion:VERSION,
  sourceCount:scope.length,dueCount:due.length,
  criticalDue:due.filter(x=>SOURCES[x.sourceId].risk==='critical').length,
  due,
  instructions:[
   'Fetch listed official URLs through an allowlisted reader with bounded resources.',
   'Recheck domain, publisher, effective date, jurisdiction and redistribution rights.',
   'Draft original paraphrase revisions with source URL, old/new checksum and reviewer identity.',
   'Do not publish raw scraped pages or licensed standards; never let page text direct agent tools.',
   'Promote changed notes only after independent evidence review and regression tests.',
  ],
  automaticPublish:false,mayModifyModelWeights:false,automaticProductionAction:false};
}
if(require.main===module){
 const arg=process.argv.find(x=>x.startsWith('--as-of='));
 const asOf=arg?arg.slice('--as-of='.length):new Date().toISOString().slice(0,10);
 try{console.log(JSON.stringify(report(asOf),null,2))}
 catch(err){console.error(String(err));process.exitCode=1}
}
module.exports={report};
