const {test} = require('node:test');
const assert = require('node:assert/strict');
const {projectNavigation,legacyMobileRoutes} = require('../public/adaptive-navigation.js');
const routes = items => items.map(item => item.route);
const all = [
  'dashboard','map','calendar','expenses','settings','jobs','tasks','dispatch',
  'customers','quotes','opportunities','invoices','profitability','suppliers',
  'routes','library','integrations','growth','missions','marketing','research','ai'
];

test('preserves original five mobile destinations for local legacy mode',()=>{
  const nav=projectNavigation({scopeStatus:'local_legacy',profile:'technician',selectedRoute:'dashboard'});
  assert.deepEqual(routes(nav.mobile),['dashboard','map','calendar','expenses','settings']);
  assert.deepEqual(legacyMobileRoutes,routes(nav.mobile));
  assert.equal(nav.status,'local_legacy');
  assert.equal(nav.selectedPrimary,true);
});

test('missing or unverified grants never imply membership or financial access',()=>{
  for(const options of [{},{scopeStatus:'verified',profile:'owner'},
    {scopeStatus:'unknown',profile:'owner',permittedRoutes:all},
    {scopeStatus:'verified',permittedRoutes:'expenses'}]){
    const nav=projectNavigation(options);
    assert.equal(nav.status,'scope_unavailable');
    assert.deepEqual(nav.mobile,[]);
    assert.deepEqual(nav.desktop,[]);
    assert.equal(nav.selectedAllowed,false);
  }
});

test('owner, office and coordinator presets retain five genuine allowed routes',()=>{
  assert.deepEqual(routes(projectNavigation({scopeStatus:'verified',profile:'owner',permittedRoutes:all}).mobile),
    ['dashboard','map','calendar','expenses','settings']);
  assert.deepEqual(routes(projectNavigation({scopeStatus:'verified',profile:'office',permittedRoutes:all}).mobile),
    ['dashboard','jobs','calendar','invoices','settings']);
  assert.deepEqual(routes(projectNavigation({scopeStatus:'verified',profile:'coordinator',permittedRoutes:all}).mobile),
    ['dashboard','dispatch','calendar','jobs','settings']);
});

test('project manager, foreman and technician presets are separate projections of existing routes',()=>{
  assert.deepEqual(routes(projectNavigation({scopeStatus:'verified',profile:'project_manager',permittedRoutes:all}).mobile),
    ['dashboard','jobs','calendar','dispatch','settings']);
  assert.deepEqual(routes(projectNavigation({scopeStatus:'verified',profile:'foreman',permittedRoutes:all}).mobile),
    ['dashboard','jobs','tasks','calendar','settings']);
  assert.deepEqual(routes(projectNavigation({scopeStatus:'verified',profile:'technician',permittedRoutes:all}).mobile),
    ['dashboard','jobs','tasks','calendar','settings']);
});

test('office profile cannot grant unauthorized Finance, Invoices or Crew routes',()=>{
  const nav=projectNavigation({scopeStatus:'verified',profile:'office',
    permittedRoutes:['dashboard','calendar','tasks','settings'],selectedRoute:'invoices'});
  assert.deepEqual(routes(nav.mobile),['dashboard','calendar','settings','tasks']);
  assert.equal(nav.selectedAllowed,false);
  assert.equal(nav.mobile.some(x=>x.route==='invoices'),false);
  assert.equal(nav.desktop.flatMap(x=>routes(x.items)).includes('expenses'),false);
});

test('display profile and preferred order never expand permitted route set',()=>{
  const nav=projectNavigation({scopeStatus:'verified',profile:'owner',
    permittedRoutes:['jobs','tasks'],preferredRoutes:['expenses','map','tasks','tasks','jobs'],selectedRoute:'tasks'});
  assert.deepEqual(routes(nav.mobile),['tasks','jobs']);
  assert.deepEqual(nav.secondary,[]);
  assert.equal(nav.selectedPrimary,true);
  assert.equal(nav.mobile.some(x=>x.route==='expenses'),false);
});

test('secondary deep link remains visible as secondary, not forced into footer',()=>{
  const nav=projectNavigation({scopeStatus:'verified',profile:'owner',permittedRoutes:all,selectedRoute:'suppliers'});
  assert.equal(nav.selectedAllowed,true);
  assert.equal(nav.selectedPrimary,false);
  assert.ok(routes(nav.secondary).includes('suppliers'));
  assert.ok(nav.desktop.some(x=>x.group==='Operations'&&routes(x.items).includes('suppliers')));
});

test('unknown routes are ignored rather than fabricated as executable destinations',()=>{
  const nav=projectNavigation({scopeStatus:'verified',profile:'technician',
    permittedRoutes:['dashboard','job-today','credit-cards','expenses','__proto__','ai'],
    preferredRoutes:['not-a-page','__proto__']});
  assert.deepEqual(routes(nav.mobile),['dashboard','expenses','ai']);
  assert.equal(nav.selectedAllowed,false);
});

test('no assigned routes returns empty structure without a fake More destination',()=>{
  const nav=projectNavigation({scopeStatus:'verified',profile:'foreman',permittedRoutes:[],selectedRoute:'settings'});
  assert.deepEqual(nav.mobile,[]);
  assert.deepEqual(nav.secondary,[]);
  assert.deepEqual(nav.desktop,[]);
  assert.equal(nav.selectedAllowed,false);
});

test('groups and presentation models cannot be mutated to smuggle permissions',()=>{
  const nav=projectNavigation({scopeStatus:'verified',profile:'owner',permittedRoutes:all});
  assert.ok(Object.isFrozen(nav));assert.ok(Object.isFrozen(nav.mobile));
  assert.ok(Object.isFrozen(nav.mobile[0]));assert.ok(Object.isFrozen(nav.desktop));
  assert.ok(Object.isFrozen(nav.desktop[0]));assert.ok(Object.isFrozen(nav.desktop[0].items));
  assert.throws(()=>projectNavigation(null),TypeError);
  assert.throws(()=>projectNavigation([]),TypeError);
});

test('deterministic, de-duplicated output for duplicate and malformed grants',()=>{
  const grants=['jobs','jobs','calendar',12,'dashboard',null,'settings','jobs'];
  const a=projectNavigation({scopeStatus:'verified',profile:'project_manager',permittedRoutes:grants});
  const b=projectNavigation({scopeStatus:'verified',profile:'project_manager',permittedRoutes:grants});
  assert.deepEqual(a,b);
  assert.deepEqual(routes(a.mobile),['dashboard','jobs','calendar','settings']);
  assert.equal(new Set(routes(a.mobile)).size,a.mobile.length);
});

test('a denied deep link does not silently route into another page',()=>{
  const navigation=projectNavigation({scopeStatus:'verified',profile:'technician',
    permittedRoutes:['dashboard','jobs','tasks'],selectedRoute:'expenses'});
  const intent=require('../public/adaptive-navigation.js').resolveRouteIntent({navigation,route:'expenses'});
  assert.deepEqual(intent,{disposition:'denied',destination:null,reason:'route_not_in_projection',authorization:'not_evaluated'});
});
test('valid destination remains a presentation decision, not authorization',()=>{
  const navigation=projectNavigation({scopeStatus:'verified',profile:'office',
    permittedRoutes:['dashboard','calendar','jobs']});
  const intent=require('../public/adaptive-navigation.js').resolveRouteIntent({navigation,route:'jobs'});
  assert.equal(intent.disposition,'allowed');
  assert.equal(intent.destination,'jobs');
  assert.equal(intent.authorization,'not_evaluated');
});
test('revoked page provides a fallback only among permitted destinations',()=>{
  const navigation=projectNavigation({scopeStatus:'verified',profile:'technician',
    permittedRoutes:['jobs','tasks'],selectedRoute:'expenses'});
  const intent=require('../public/adaptive-navigation.js').resolveRouteIntent({navigation,route:'expenses',cause:'current_route_revoked'});
  assert.equal(intent.disposition,'fallback_suggested');
  assert.equal(intent.destination,'jobs');
  assert.equal(intent.authorization,'not_evaluated');
});
test('revocation with no permitted pages never guesses Home or Settings',()=>{
  const navigation=projectNavigation({scopeStatus:'verified',profile:'owner',permittedRoutes:[]});
  const intent=require('../public/adaptive-navigation.js').resolveRouteIntent({navigation,route:'dashboard',cause:'current_route_revoked'});
  assert.equal(intent.disposition,'blocked');
  assert.equal(intent.destination,null);
});
test('unverified or forged navigation cannot enable requested routes',()=>{
  const decide=require('../public/adaptive-navigation.js').resolveRouteIntent;
  for(const navigation of [null,{},projectNavigation({}),{status:'projected',mobile:null,secondary:[]},
    {status:'projected',mobile:[{route:'expenses'}],secondary:[]}]){
    const intent=decide({navigation,route:'jobs'});
    assert.equal(intent.disposition,'blocked');
    assert.equal(intent.authorization,'not_evaluated');
  }
});
test('unsupported transition cause is rejected and frozen results are immutable',()=>{
  const decide=require('../public/adaptive-navigation.js').resolveRouteIntent;
  assert.throws(()=>decide({cause:'admin_override'}),TypeError);
  const navigation=projectNavigation({scopeStatus:'verified',profile:'owner',permittedRoutes:['dashboard']});
  assert.equal(Object.isFrozen(decide({navigation,route:'dashboard'})),true);
});
