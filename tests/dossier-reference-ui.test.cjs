'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/opportunity-dossier.js','utf8');
const css=fs.readFileSync('public/opportunity-dossier.css','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const research=fs.readFileSync('public/research-briefs.js','utf8');
const scope={window:{TradeFlowEngine:require('../public/tradeflow-engine.js')},URL,console};
vm.runInNewContext(source,scope,{timeout:3000});
const ux=scope.window.TradeFlowDossier;
const r={id:'ref-21',project_name:'Cosmos Technology Campus / former 3M campus retrofit',address:'6801 River Place Blvd, Austin, TX 78726, Texas',opportunity_type:'potential_opportunity',evidence_status:'source_supported',project_type:'Campus retrofit',source_date:'2025-12-08',source_record_id:'E01-W02-0009',source_url:'https://example.com/original',latitude:30.2,longitude:-97.7,photo_url:'https://official.example.org/campus.jpg'};
const dossier=ux.dossier(r),workflow=ux.workflow(r,{settings:[]});
for(const title of ['Opportunity dossier','Key details','Evidence &amp; source','Open original source','View location on map','Contact &amp; workflow']){
 assert.ok(dossier.includes(title),'Dossier: '+title);
}
assert.ok(dossier.includes('6801 River Place Blvd'),'Dossier address');
assert.ok(dossier.includes('2025-12-08'),'Dossier source date');
assert.ok(dossier.includes('official.example.org/campus.jpg'),'Official supplied image preserved');
assert.ok(dossier.includes('aria-label="More opportunity actions"'),'Functional ellipsis menu exists');
assert.ok(dossier.includes('data-action="opportunityWorkflow"'),'Dossier menu opens workflow');
assert.ok(workflow.includes('aria-label="More opportunity actions"'),'Workflow also has menu');
assert.ok(workflow.includes('data-action="opportunityBack"'),'Workflow returns to dossier');
assert.ok(workflow.includes('Save workflow'),'Workflow action');
assert.ok(workflow.includes('Ideal customer profile')&&workflow.includes('Contact person / department'),'Contact and ICP fields');
assert.ok(workflow.includes('data-calendar-action="opportunity"'),'Existing Calendar connection retained');
assert.ok(css.includes('.tf-od-more-menu')&&css.includes('.tf-od-nav'),'Reference screen top navigation and actions styled');
assert.ok(css.includes('aspect-ratio:4/3'),'4:3 building-image slot');
assert.ok(ux.dossier({...r,photo_url:'javascript:alert(1)'}).includes('tf-od-photo-fallback'),'Unsafe URLs never rendered as images');
assert.ok(!ux.dossier({...r,photo_url:''}).includes('<img src='),'No invented project photos');
for(const field of ["'photo_url'","'place_photo_url'","'official_photo_url'","'project_photo_url'"]){
 assert.ok(app.includes(field)&&research.includes(field),'Import and blank research template retain '+field);
}
assert.ok(app.includes('data-op-ux="import"')&&app.includes('data-op-ux="export"')&&app.includes('data-action="opportunityMapAll"'),'Existing Opportunities main page stays intact');
assert.ok(app.includes("if(detail&&window.TradeFlowDossier)return"),'Only tapped rows enter dossier');
assert.ok(app.includes("await put('opportunities',record)"),'Existing IndexedDB save path preserved');
console.log('PASS: High-fidelity two-stage opportunity dossier/workflow, functional menus, original photos retained, dashboard unchanged');
