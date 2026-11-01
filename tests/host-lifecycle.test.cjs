const test=require('node:test'),assert=require('node:assert/strict');
const {createHostLifecycle}=require('../public/host-lifecycle.js');
function fixture(){
 let state={actorId:'owner',businessId:'biz',screen:'jobs',selected:{store:'jobs',id:'j1'},threadId:'t1',contextRecordId:'j1'};
 let draft='unsent',mic=0,visual=0,focus=0;const records=new Set(['jobs:j1']);
 const host=createHostLifecycle({read:()=>({...state}),readDraft:()=>draft,writeDraft:v=>{draft=v},recordExists:async r=>records.has(r.store+':'+r.id),
 stopMicrophone:()=>{mic++},navigate:async({screen,selected})=>{state={...state,screen,selected}},closeVisual:()=>{visual++},restoreFocus:()=>{focus++}});
 return {host,records,get:()=>({state,draft,mic,visual,focus}),set:s=>{state={...state,...s}}};
}
test('origin captures contextual screen, selection, thread and unsent draft',()=>{const f=fixture(),o=f.host.captureOrigin();assert.equal(o.version,1);assert.equal(o.screen,'jobs');assert.deepEqual(o.selected,{store:'jobs',id:'j1'});assert.equal(o.threadId,'t1');assert.equal(o.draft,'unsent')});
test('open and exact return with focus and preserved draft',async()=>{const f=fixture(),o=f.host.captureOrigin();assert.equal((await f.host.openFromOrigin({from:o})).status,'opened');f.host.setDraft('still unsent');assert.equal((await f.host.returnToOrigin()).status,'returned');assert.equal(f.get().state.screen,'jobs');assert.equal(f.get().draft,'still unsent');assert.equal(f.get().focus,1);assert.ok(f.get().mic>0)});
test('actor/business changes deny return',async()=>{for(const key of ['actorId','businessId']){const f=fixture();await f.host.openFromOrigin();f.set({[key]:'foreign'});assert.equal((await f.host.returnToOrigin()).status,'scope_changed')}} );
test('thread switching prevents restoring obsolete conversation origin',async()=>{const f=fixture();await f.host.openFromOrigin();f.set({threadId:'t2'});assert.equal((await f.host.returnToOrigin()).status,'thread_changed')});
test('unavailable originating record fails without navigation',async()=>{const f=fixture();await f.host.openFromOrigin();f.records.clear();assert.equal((await f.host.returnToOrigin()).status,'record_unavailable');assert.equal(f.get().state.screen,'ai')});
test('interrupted async navigation never reports success',async()=>{let s={actorId:'a',businessId:'b',screen:'jobs',selected:null,threadId:null},resolve;const h=createHostLifecycle({read:()=>s,readDraft:()=>'',writeDraft:()=>{},recordExists:async()=>true,stopMicrophone:()=>{},navigate:()=>new Promise(r=>{resolve=()=>{s={...s,screen:'ai'};r()}})});const pending=h.openFromOrigin();await Promise.resolve();h.invalidate();resolve();assert.equal((await pending).status,'interrupted')});
test('close cancellation still stops microphone immediately',()=>{const f=fixture();f.host.onBeforeClose(()=>false);assert.equal(f.host.requestClose().status,'cancelled');assert.equal(f.get().mic,1);assert.equal(f.get().visual,0)});
test('repeated close is idempotent under reentrancy',()=>{const f=fixture();let nested;f.host.onBeforeClose(()=>{nested=f.host.requestClose();return true});assert.equal(f.host.requestClose().status,'closed');assert.equal(nested.status,'already_closing');assert.equal(f.get().visual,1);assert.equal(f.get().mic,2)});
test('offline reload can reconstruct origin from provided snapshot without storage authority',async()=>{const f=fixture(),snap=f.host.captureOrigin();await f.host.openFromOrigin();const fresh=fixture();fresh.set({screen:'ai',selected:null});assert.equal((await fresh.host.returnToOrigin({from:snap})).status,'returned')});

test('sequential repeated close does not dismiss twice, but still stops microphone',()=>{
 const f=fixture();assert.equal(f.host.requestClose().status,'closed');assert.equal(f.host.requestClose().status,'already_closed');assert.equal(f.get().visual,1);assert.equal(f.get().mic,2);
});
test('opening from a mini prompt carries exact unsent text into the conversation editor',async()=>{
 const f=fixture(),snap=f.host.captureOrigin();
 f.host.setDraft('changed after capture');
 assert.equal((await f.host.openFromOrigin({from:snap})).status,'opened');
 assert.equal(f.get().draft,'unsent');
});
