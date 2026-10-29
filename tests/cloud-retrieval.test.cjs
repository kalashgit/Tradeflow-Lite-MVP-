'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {previewCloudRetrieval}=require('../public/cloud-retrieval.js');
const businessId='business_001',identity={issuer:'https://identity.example.test',subject:'owner_001'};
const session={status:'signed_in',identity,businesses:[{business_id:businessId,role:'owner'}],
 capabilities:{recordTypes:['customers','jobs']}};
function fixture(pages){
 const calls=[];
 const transport={async list(type,after){calls.push({type,after});
  return pages[type]?.[after]??{status:200,items:[],nextCursor:null};
 }};
 return {transport,calls};
}
const record=(id,name,revision=1)=>({id,revision,record:{id,name,businessId}});
test('cloud retrieval preview classifies fresh, identical and conflicting records without mutating inputs',async()=>{
 const localStores={customers:[{id:'c1',name:'Local old',businessId},{id:'c2',name:'Same',businessId}],jobs:[]};
 const before=structuredClone(localStores);
 const f=fixture({customers:{'':{status:200,items:[
  record('c1','Remote newer',3),record('c2','Same',1),record('c3','Fresh',1)
 ],nextCursor:null}}});
 const preview=await previewCloudRetrieval({businessId,session,localStores,transport:f.transport});
 assert.deepEqual(preview.records.map(r=>r.status),['conflict','identical','new_on_device']);
 assert.deepEqual(preview.counts,{newOnDevice:1,identical:1,conflicts:1});
 assert.equal(preview.readOnly,true);assert.equal(preview.localWritesPerformed,false);
 assert.deepEqual(localStores,before);
 assert.deepEqual(f.calls,[{type:'customers',after:''},{type:'jobs',after:''}]);
});
test('owner membership and explicit identity are mandatory even for read-only preview',async()=>{
 const f=fixture({});
 for(const bad of [{...session,status:'unprovisioned'},
  {...session,businesses:[{business_id:businessId,role:'viewer'}]},
  {...session,identity:{issuer:identity.issuer}}]){
  await assert.rejects(previewCloudRetrieval({businessId,session:bad,localStores:{},transport:f.transport}),/owner/);
 }
 assert.equal(f.calls.length,0);
});
test('paged retrieval requires completeness, bounded counts and unique IDs',async()=>{
 const one={status:200,items:[record('c1','One')],nextCursor:'c1'};
 const final={status:200,items:[record('c2','Two')],nextCursor:null};
 const good=fixture({customers:{'':one,c1:final}});
 const ok=await previewCloudRetrieval({businessId,session,localStores:{},transport:good.transport});
 assert.equal(ok.records.length,2);
 const repeated=fixture({customers:{'':one,c1:{status:200,items:[record('c1','Again')],nextCursor:null}}});
 await assert.rejects(previewCloudRetrieval({businessId,session,localStores:{},transport:repeated.transport}),/Duplicate or unordered/);
 const truncated=fixture({customers:{'':one,c1:{status:503}}});
 await assert.rejects(previewCloudRetrieval({businessId,session,localStores:{},transport:truncated.transport}),/unavailable or incomplete/);
 const over=fixture({customers:{'':{status:200,items:[record('c1','One'),record('c2','Two')],nextCursor:null}}});
 await assert.rejects(previewCloudRetrieval({businessId,session,localStores:{},transport:over.transport,maxRecords:1}),/exceeds bounded/);
});
test('cross-business and malformed records fail closed',async()=>{
 const cross=fixture({customers:{'':{status:200,items:[{...record('c1','Private'),record:{id:'c1',businessId:'business_999'}}],nextCursor:null}}});
 await assert.rejects(previewCloudRetrieval({businessId,session,localStores:{},transport:cross.transport}),/Invalid cloud record/);
});
