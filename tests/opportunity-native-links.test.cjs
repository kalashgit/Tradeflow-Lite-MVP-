'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('public/opportunity-dossier.js','utf8');
const css=fs.readFileSync('public/opportunity-dossier.css','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const root={TradeFlowEngine:require('../public/tradeflow-engine.js')};
vm.runInNewContext(src,{window:root,URL,console},{timeout:3000});
const ui=root.TradeFlowDossier;
const rec={id:'case-1',project_name:'Electrical campus project',address:'6801 River Place Blvd, Austin, TX 78726',contact_phone:'+1 (512) 555-0100',contact_email:'office@example.com'};
const view=ui.workflow(rec,{settings:[]});
assert.ok(view.includes('Save workflow'),'Workflow card has its own primary save');
assert.ok(view.includes('Save contact &amp; profile'),'Contact/ICP can be saved without scrolling back');
assert.ok(view.includes('href="tel:+15125550100"'),'Phone link routes to native dialer');
assert.ok(view.includes('href="mailto:office@example.com"'),'Email link routes to configured email handler');
assert.ok(view.includes('data-tf-od-link="call"')&&view.includes('data-tf-od-link="email"'),'Native handlers are identifiable');
assert.ok(view.includes('data-calendar-action="opportunity"'),'Existing calendar action remains');
assert.ok(!view.includes('<label>Original public contact source (optional)'), 'Source is collapsed rather than taking over the screen');
assert.ok(view.includes('<details class="tf-od-source-details">'),'Optional contact source is retained');
assert.ok(!ui.workflow({...rec,contact_phone:'',contact_email:''},{settings:[]}).includes('href="tel:'),'No dummy telephone links when missing');
assert.ok(!ui.workflow({...rec,contact_phone:'',contact_email:''},{settings:[]}).includes('href="mailto:'),'No dummy email links when missing');
assert.equal(ui.safeTel('javascript:alert(1)'), '','Do not turn malicious input into phone URI');
assert.equal(ui.safeMail('a@example.com?subject=hidden'), '','Reject query injection in mailto targets');
const formLinks={call:[makeLink()],email:[makeLink()]};
function makeLink(){return {attributes:{},classList:{items:new Set(),add(x){this.items.add(x)},remove(x){this.items.delete(x)}},setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]}}}
const form={
 elements:{contact_phone:{value:'+1 512 555 0100'},contact_email:{value:'sales@example.org'}},
 querySelectorAll(selector){return formLinks[selector.includes('"call"')?'call':'email']}
};
ui.syncQuickLinks(form);
assert.equal(formLinks.call[0].attributes.href,'tel:+15125550100','Typing a phone number updates dialer link');
assert.equal(formLinks.email[0].attributes.href,'mailto:sales@example.org','Typing email updates mail handler link');
form.elements.contact_phone.value='';form.elements.contact_email.value='bad email';
ui.syncQuickLinks(form);
assert.equal(formLinks.call[0].attributes.href,undefined,'Removing phone disables call action');
assert.equal(formLinks.email[0].attributes.href,undefined,'Invalid email disables mail action');
assert.equal(formLinks.email[0].attributes['aria-disabled'],'true');
assert.ok(app.includes("window.TradeFlowDossier?.syncQuickLinks(form)"),'App dynamically refreshes native links as contact fields are edited');
assert.ok(app.includes("if(detail&&window.TradeFlowDossier)return"),'Changes limited to tapped opportunity screens');
assert.ok(app.includes("await put('opportunities',record)"),'Local storage persistence maintained');
assert.ok(css.includes('.tf-od-date-field input[type=date]')&&css.includes('max-width:100%!important'),'Date field constrained to mobile viewport');
assert.ok(css.includes('.tf-od-source-details'),'Optional contact source can collapse');
assert.ok(css.includes('.tf-od-screen .tf-od-card'),'Styles scoped to opportunity detail only');
assert.ok(app.includes('data-action="opportunityMapAll"')&&app.includes('data-op-ux="import"')&&app.includes('data-op-ux="export"'),'Main opportunity page untouched');
console.log('PASS: Reference-style compact cards, native phone and email from typed or saved data, local saves, and dashboard isolation');
