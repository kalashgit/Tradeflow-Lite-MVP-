/* Developer-only local fixture lab. Saving a transcript is explicit; nothing
 * here records audio, retrains speech recognition or calls business execution. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowVoiceCommandLab=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const STORAGE_KEY='tradeflow:voice-command-lab:v1',MAX_FIXTURES=300,MAX_BYTES=2*1024*1024;
const statuses=['recognized','needs_clarification','ambiguous','unsupported'],effects=['read_only','navigation','draft','proposes_modification'];
const clone=x=>JSON.parse(JSON.stringify(x));
function json(value,depth=0,seen=new Set()){
 if(depth>15)throw Error('Fixture nesting is too deep');
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'&&Number.isFinite(value))return;
 if(typeof value!=='object'||seen.has(value))throw Error('Use finite JSON values without cycles');
 const proto=Object.getPrototypeOf(value);if(!Array.isArray(value)&&proto!==Object.prototype&&proto!==null)throw Error('Use plain JSON objects');
 seen.add(value);for(const [key,item]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw Error('Unsafe fixture key');json(item,depth+1,seen)}seen.delete(value);
}
function string(value,label,max,empty=false){if(typeof value!=='string'||(!empty&&!value.trim())||value.length>max)throw Error(label+' must be '+(empty?'0':'1')+'–'+max+' characters');return value}
function validateFixture(input){
 json(input);if(!input||Array.isArray(input))throw Error('Fixture must be an object');
 if(Object.keys(input).some(k=>!['id','name','transcript','context','expected','correction','createdAt','updatedAt'].includes(k)))throw Error('Unknown fixture fields');
 const id=string(input.id,'Fixture ID',100);if(!/^[A-Za-z0-9._:-]+$/.test(id))throw Error('Invalid fixture ID');
 const name=string(input.name,'Fixture name',200),transcript=string(input.transcript,'Transcript',8000),context=input.context===undefined?{}:input.context,expected=input.expected;
 if(!context||Array.isArray(context)||typeof context!=='object'||Object.keys(context).some(k=>!['today','businessId','customers','record','selectedRecord'].includes(k)))throw Error('Use supported local interpretation context fields');
 if(context.today!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(context.today)||!Number.isFinite(Date.parse(context.today+'T12:00:00Z'))||new Date(context.today+'T12:00:00Z').toISOString().slice(0,10)!==context.today))throw Error('Context date must be a valid YYYY-MM-DD date');
 if(context.businessId!==undefined)string(context.businessId,'Business ID',160);
 if(context.customers!==undefined&&(!Array.isArray(context.customers)||context.customers.length>100))throw Error('Use at most 100 context customers');
 for(const c of context.customers||[]){if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['id','name','phone','email','address','company','notes','businessId'].includes(k)))throw Error('Only customer interpretation fields belong in fixtures');string(c.id,'Customer ID',160);if(c.name!==undefined)string(c.name,'Customer name',200,true)}
 for(const ref of [context.record,context.selectedRecord].filter(x=>x!==undefined&&x!==null)){if(typeof ref!=='object'||Array.isArray(ref)||Object.keys(ref).some(k=>!['store','id'].includes(k)))throw Error('Use a typed selected record reference');string(ref.store,'Record store',100);string(ref.id,'Record ID',160)}
 if(!expected||Array.isArray(expected)||typeof expected!=='object'||Object.keys(expected).some(k=>!['intent','status','effect','parameters','clarificationRequired'].includes(k)))throw Error('Expected outcome must contain supported fields');
 if(expected.intent!==null)string(expected.intent,'Expected intent',100);
 if(!statuses.includes(expected.status))throw Error('Unknown expected status');
 if(expected.effect!==undefined&&expected.effect!==null&&!effects.includes(expected.effect))throw Error('Unknown expected effect');
 if(expected.parameters!==undefined&&(!expected.parameters||typeof expected.parameters!=='object'||Array.isArray(expected.parameters)))throw Error('Expected parameters must be an object');
 if(expected.clarificationRequired!==undefined&&typeof expected.clarificationRequired!=='boolean')throw Error('Expected clarification must be boolean');
 if(input.correction!==undefined){const correction=input.correction;if(!correction||typeof correction!=='object'||Array.isArray(correction)||Object.keys(correction).some(k=>k!=='fields')||!correction.fields||typeof correction.fields!=='object'||Array.isArray(correction.fields))throw Error('Use an explicit customer field correction');for(const [field,value]of Object.entries(correction.fields)){if(!['name','phone','email','address','company','notes'].includes(field))throw Error('Unknown correction field');string(value,'Correction value',4000,true)}}
 const out={id,name,transcript,context:clone(context),expected:clone(expected)};if(input.correction!==undefined)out.correction=clone(input.correction);
 for(const k of ['createdAt','updatedAt'])if(input[k]!==undefined)out[k]=string(input[k],k,60);
 if(JSON.stringify(out).length>128*1024)throw Error('Fixture is too large');return out;
}
function validateCollection(fixtures){if(!Array.isArray(fixtures)||fixtures.length>MAX_FIXTURES)throw Error('Use at most '+MAX_FIXTURES+' fixtures');const list=fixtures.map(validateFixture);if(new Set(list.map(x=>x.id)).size!==list.length)throw Error('Duplicate fixture IDs');if(JSON.stringify({version:1,fixtures:list}).length>MAX_BYTES/2)throw Error('Fixture collection exceeds its storage budget');return list}
function createFixtureStore(storage){
 const memory={};const backing=storage||{getItem:k=>memory[k]??null,setItem:(k,v)=>{memory[k]=v},removeItem:k=>{delete memory[k]}};
 function list(){const raw=backing.getItem(STORAGE_KEY);if(raw===null)return [];if(typeof raw!=='string'||raw.length>MAX_BYTES)throw Error('Saved fixture data is invalid or oversized');let parsed;try{parsed=JSON.parse(raw)}catch{throw Error('Saved fixtures are not valid JSON; export or clear them explicitly before saving')}if(parsed.version!==1||!Array.isArray(parsed.fixtures))throw Error('Unsupported fixture collection version');return validateCollection(parsed.fixtures)}
 function write(fixtures){const checked=validateCollection(fixtures);backing.setItem(STORAGE_KEY,JSON.stringify({version:1,fixtures:checked}));return clone(checked)}
 function upsert(fixture){const value=validateFixture(fixture),old=list(),index=old.findIndex(x=>x.id===value.id);if(index>=0)old[index]=value;else old.push(value);write(old);return clone(value)}
 function importJSON(value){if(typeof value!=='string'||value.length>MAX_BYTES)throw Error('Import file is too large');const parsed=JSON.parse(value);json(parsed);if(parsed.version!==1)throw Error('Unsupported fixture collection version');let entries=parsed.fixtures;if(!entries&&Array.isArray(parsed.cases))entries=parsed.cases.map(x=>({id:x.id,name:x.name||x.id,transcript:x.transcript,context:x.context||parsed.context||{},expected:x.expected,...(x.correction?{correction:x.correction}:{})}));const imported=validateCollection(entries),old=list();if(imported.some(x=>old.some(y=>y.id===x.id)))throw Error('Import contains an existing ID; existing fixtures were preserved');return write([...old,...imported])}
 return Object.freeze({mode:storage?'persistent':'memory',list,upsert,importJSON,exportJSON:()=>JSON.stringify({version:1,fixtures:list()},null,2),remove:id=>write(list().filter(x=>x.id!==id)),clear:()=>backing.removeItem(STORAGE_KEY)});
}
function compare(actual,expected,path='$',differences=[]){
 if(expected&&typeof expected==='object'&&!Array.isArray(expected)){for(const [k,v]of Object.entries(expected))compare(actual?.[k],v,path+'.'+k,differences)}else if(JSON.stringify(actual)!==JSON.stringify(expected))differences.push({path,expected:clone(expected),actual:actual===undefined?null:clone(actual)});return differences;
}
function runRegression(fixtures,engine){
 if(typeof engine?.interpretCommand!=='function')throw Error('Interpretation engine is required');
 const cases=validateCollection(fixtures).map(f=>{try{let actual=engine.interpretCommand(f.transcript,f.context);if(f.correction){if(typeof engine.correctInterpretation!=='function')throw Error('Field correction is unsupported');actual=engine.correctInterpretation(actual,f.correction,f.context)}const expected={...f.expected};if(expected.clarificationRequired!==undefined){expected.clarification={required:expected.clarificationRequired};delete expected.clarificationRequired}const differences=compare(actual,expected);return {id:f.id,name:f.name,passed:!differences.length,differences,actual}}catch(error){return {id:f.id,name:f.name,passed:false,differences:[],error:error.message}}});
 return {version:1,total:cases.length,passed:cases.filter(x=>x.passed).length,failed:cases.filter(x=>!x.passed).length,cases};
}
function mount(document,{engine,storage,confirm=()=>false}={}){
 const $=id=>document.getElementById(id),store=createFixtureStore(storage);let current=null,editingId=null,correction={fields:{}};
 const status=(message,error=false)=>{const node=$('lab-status');node.textContent=message;node.dataset.error=String(error)};
 const context=()=>{const value=JSON.parse($('lab-context').value||'{}');json(value);return value};
 const output=value=>{$('lab-output').textContent=JSON.stringify(value,null,2)};
 function expectations(actual){$('lab-expected-intent').value=actual.intent||'';$('lab-expected-status').value=actual.status;$('lab-expected-effect').value=actual.effect||'';$('lab-expected-parameters').value=JSON.stringify(actual.parameters||{},null,2);$('lab-expected-clarification').checked=actual.clarification.required}
 function renderFixtures(){const list=$('lab-fixtures');list.replaceChildren();for(const fixture of store.list()){const row=document.createElement('li'),label=document.createElement('span'),load=document.createElement('button'),remove=document.createElement('button');label.textContent=fixture.name;load.textContent='Load';load.type='button';load.dataset.load=fixture.id;remove.textContent='Delete';remove.type='button';remove.dataset.remove=fixture.id;row.append(label,load,remove);list.append(row)}$('lab-count').textContent=store.list().length+' saved local fixtures'}
 function run(){editingId=null;correction={fields:{}};current=engine.interpretCommand($('lab-transcript').value,context());output(current);expectations(current);status('Interpreted locally. Nothing was saved or executed.');return current}
 document.getElementById('lab-interpret-form').addEventListener('submit',e=>{e.preventDefault();try{run()}catch(error){status(error.message,true)}});
 $('lab-correct-field').addEventListener('click',()=>{try{if(!current)throw Error('Interpret a customer instruction first');correction.fields[$('lab-field').value]=$('lab-field-value').value;current=engine.correctInterpretation(engine.interpretCommand($('lab-transcript').value,context()),correction,context());output(current);expectations(current);status('Field correction applied to the draft interpretation only.')}catch(error){status(error.message,true)}});
 $('lab-save-fixture').addEventListener('click',()=>{try{if(!current)throw Error('Interpret the transcript before saving a fixture');const fixture={id:editingId||'fixture-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),name:$('lab-name').value.trim(),transcript:$('lab-transcript').value,context:context(),expected:{intent:$('lab-expected-intent').value||null,status:$('lab-expected-status').value,effect:$('lab-expected-effect').value||null,parameters:JSON.parse($('lab-expected-parameters').value||'{}'),clarificationRequired:$('lab-expected-clarification').checked},...(Object.keys(correction.fields).length?{correction}:{}),updatedAt:new Date().toISOString()};store.upsert(fixture);editingId=fixture.id;renderFixtures();status('Fixture saved '+(store.mode==='memory'?'in memory for this tab only.':'locally on this device.'))}catch(error){status('Fixture not saved: '+error.message,true)}});
 $('lab-fixtures').addEventListener('click',e=>{try{const load=e.target.dataset.load,remove=e.target.dataset.remove;if(load){const fixture=store.list().find(x=>x.id===load);if(!fixture)return;$('lab-transcript').value=fixture.transcript;$('lab-context').value=JSON.stringify(fixture.context,null,2);$('lab-name').value=fixture.name;correction=fixture.correction||{fields:{}};current=engine.interpretCommand(fixture.transcript,fixture.context);if(fixture.correction)current=engine.correctInterpretation(current,fixture.correction,fixture.context);output(current);expectations({...current,...fixture.expected,parameters:fixture.expected.parameters||{},clarification:{required:fixture.expected.clarificationRequired??current.clarification.required}});editingId=fixture.id;status('Loaded saved fixture. No business command will execute.')}if(remove&&confirm('Delete this local test fixture?')){store.remove(remove);renderFixtures();status('Fixture deleted.')}}catch(error){status(error.message,true)}});
 $('lab-run-regression').addEventListener('click',()=>{try{const report=runRegression(store.list(),engine);$('lab-regression-output').textContent=JSON.stringify(report,null,2);status(report.passed+'/'+report.total+' fixture tests passed; '+report.failed+' failed.')}catch(error){status(error.message,true)}});
 $('lab-export').addEventListener('click',()=>{try{const url=URL.createObjectURL(new Blob([store.exportJSON()],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='tradeflow-command-lab-fixtures.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Local fixtures exported.')}catch(error){status(error.message,true)}});
 $('lab-import').addEventListener('change',async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>MAX_BYTES)throw Error('Import file is too large');if(!confirm('Import these transcript fixtures into local lab storage?'))return;store.importJSON(await file.text());renderFixtures();status('Fixtures imported; existing fixtures preserved.')}catch(error){status('Import rejected: '+error.message,true)}finally{e.target.value=''}});
 $('lab-clear').addEventListener('click',()=>{if(confirm('Delete all saved Command Lab fixtures on this device?')){store.clear();editingId=null;renderFixtures();status('Local lab fixtures cleared. Business records were not touched.')}});
 for(const tool of engine.tools||[]){const option=document.createElement('option');option.value=tool.id;option.textContent=tool.id;$('lab-expected-intent').append(option)}
 const now=new Date();$('lab-context').value=JSON.stringify({today:now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0'),customers:[]},null,2);
 try{renderFixtures();status(store.mode==='memory'?'Storage is unavailable; fixtures stay in memory until this tab closes.':'Ready. Interpretation is offline; transcripts are saved only when you choose Save fixture.')}catch(error){status(error.message,true)}
 return Object.freeze({store,run});
}
return Object.freeze({version:1,STORAGE_KEY,validateFixture,createFixtureStore,runRegression,mount});
});
