'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const js=fs.readFileSync('public/research-briefs.js','utf8'),html=fs.readFileSync('public/index.html','utf8'),
 app=fs.readFileSync('public/app.js','utf8'),sw=fs.readFileSync('public/sw.js','utf8'),growth=fs.readFileSync('public/growth.js','utf8');
const listeners={},win={},document={addEventListener(n,fn){(listeners[n]||(listeners[n]=[])).push(fn)}};
class FD{constructor(form){this.f=form.fields||{}}get(k){return this.f[k]??''}}
let clipboard='';
vm.runInNewContext(js,{window:win,document,FormData:FD,Date,console,Set,Number,Math,navigator:{clipboard:{writeText:async text=>{clipboard=text}}},
 alert:()=>{throw Error('unexpected alert')},confirm:()=>true},{timeout:5000});
const mod=win.TradeFlowResearch;
assert.ok(mod?.configure&&mod?.render);
assert.ok(!mod._test.escape('<svg onload=x>').includes('<svg'));
const profile={id:'growth-profiles-v1',icps:[{id:'icp1',name:'Austin Contractors',trade:'Electrical',area:'Austin, TX',signals:'Electrical permits',exclusions:'Outside Austin'}],
 personas:[{id:'bp1',name:'Property manager',role:'Property manager',icpId:'icp1'}],activeIcpId:'icp1'};
const data={settings:[profile],tasks:[],opportunities:[]};
let count=1,notices=[];
const get=async(store,id)=>data[store]?.find(x=>x.id===id);
mod.configure({get,all:async s=>data[s]||[],put:async(s,row)=>{
 const rows=data[s],i=rows.findIndex(x=>x.id===row.id);if(i<0)rows.push(row);else rows[i]=row;
},del:async(s,id)=>{data[s]=data[s].filter(x=>x.id!==id)},uid:()=>String(count++),render(){},notify:msg=>notices.push(msg)});
assert.ok(mod.render(data).includes('No research briefs yet'));
const personas=[
 {id:'bp1',name:'Property manager',icpId:'icp1'},
 {id:'bp2',name:'Builder owner',icpId:'icp2'}];
const generated=mod._test.personaChoice(personas,'icp1','bp1');
assert.ok(generated.includes('value="bp1"')&&generated.includes('value="bp2"'));
assert.match(generated,/value="bp2"[^>]*disabled hidden/,'Incompatible persona hidden from dropdown');
const option={value:'bp1',dataset:{icpId:'icp1'},selected:true,disabled:false,hidden:false};
const option2={value:'bp2',dataset:{icpId:'icp2'},selected:false,disabled:true,hidden:true};
const input={value:'icp2'},persona={options:[{value:'',dataset:{}},option,option2],value:'bp1'};
mod._test.filterPersonas(input,persona);
assert.equal(option.disabled,true,'Old ICP persona disabled after switching ICP');
assert.equal(option2.disabled,false,'New ICP persona becomes available');
assert.equal(persona.value,'','Incompatible selected persona cleared');
assert.ok(mod.render(data).includes('New brief'));
const evt=(a,id)=>({preventDefault(){},target:{closest:()=>({dataset:{researchAction:a,id}})}});
const click=listeners.click[0],submit=listeners.submit[0];
(async()=>{
 await click(evt('new'));
 assert.match(mod.render(data),/Ideal customer profile/);
 await submit({preventDefault(){},target:{id:'tfResearchBriefForm',fields:{
 title:'Austin commercial electrical',geography:'Austin, TX',requestedCount:'25',icpId:'icp1',personaId:'bp1',
 focus:'all',signals:'Service upgrades',exclusions:'Other cities',verification:'Source URL and checked date'
 }}});
 let briefs=mod._test.records(data);
 assert.equal(briefs.length,1);
 assert.equal(briefs[0].status,'brief_only');
 assert.equal(briefs[0].snapshot.icp.name,'Austin Contractors');
 profile.icps[0].name='Updated later';
 assert.equal(briefs[0].snapshot.icp.name,'Austin Contractors','Snapshot must not update without explicit edit');
 const spec=mod._test.spec(briefs[0]);
 assert.equal(spec.researchStatus,'not_started');
 assert.equal(spec.requestedRecords,25);
 assert.deepEqual(Array.from(spec.acceptedClassificationValues),['verified_request','potential_opportunity','project_signal','business_prospect']);
 assert.ok(spec.requiredColumns.includes('source_url')&&spec.requiredColumns.includes('contact_source_url'));
 assert.ok(spec.publishedRecordRequirements.some(x=>x.includes('Do not invent')));
 assert.ok(mod.render(data).includes('BRIEF ONLY'));
 await click(evt('copy',briefs[0].id));
 assert.ok(clipboard.includes('verified_request'));
 await click(evt('task',briefs[0].id));
 assert.equal(data.tasks.length,1);
 assert.equal(data.tasks[0].researchBriefId,briefs[0].id);
 await click(evt('task',briefs[0].id));
 assert.equal(data.tasks.length,1,'Duplicate open research tasks must not be created');
 assert.ok(html.includes('research-briefs.js')&&html.includes('research-briefs.css'));
 assert.ok(sw.includes('research-briefs.js'));
 assert.ok(app.includes("tab==='research'")&&app.includes('window.TradeFlowResearch?.configure'));
 assert.ok(growth.includes("['research','Research Briefs'"));
 console.log('PASS: R04 source-first research brief save, frozen ICP/persona snapshot, export spec and linked review Task');
})().catch(err=>{console.error(err);process.exitCode=1});
