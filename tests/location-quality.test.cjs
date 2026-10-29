const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const q=require('../public/location-quality.js');
const address={address:'6801 River Place Blvd, Austin, TX 78726'};
const hit={lat:'30.45',lon:'-97.8',display_name:'6801 River Place Boulevard, Austin, Travis County, Texas, 78726',address:{house_number:'6801',road:'River Place Boulevard',city:'Austin',state:'Texas',postcode:'78726'}};
test('normalize complete street address without guessing a coordinate',()=>{
 assert.equal(q.parts(address).number,'6801');
 assert.equal(q.parts(address).state,'tx');
 assert.ok(q.variants(address)[0].includes('78726'));
 assert.deepEqual(q.variants({address:'Austin, TX'}),[]);
});
test('match exact numbered road, city, state and ZIP as review-needed',()=>{
 const result=q.choose(address,[hit]);
 assert.equal(result.status,'matched_needs_review');
 assert.equal(result.lat,30.45);
});
test('reject different house number, road, ZIP or state',()=>{
 for(const field of ['house_number','road','postcode','state']){
  const bad={...hit,address:{...hit.address,[field]:({house_number:'6803',road:'Another Street',postcode:'78701',state:'California'})[field]}};
  assert.equal(q.assess(address,bad).status,'unresolved',field);
 }
});
test('coarse hits stay approximate; never accept as property location',()=>{
 const result=q.choose(address,[{...hit,address:{city:'Austin',postcode:'78726',state:'Texas'}}]);
 assert.equal(result.status,'approximate');
 assert.equal(q.status({address:address.address}),'unresolved');
});
test('red/attention state is distinct from confirmed map coordinates',()=>{
 assert.equal(q.status({latitude:30.2,longitude:-97.8,map_location_status:'needs_review'}),'needs_review');
 assert.equal(q.status({latitude:30.2,longitude:-97.8,map_location_status:'verified'}),'verified');
 assert.equal(q.hasPin({latitude:30.2,longitude:-97.8,map_enabled:false}),false);
});
test('integration preserves manual lookup and disables automatic bulk mapping on import',()=>{
 const app=fs.readFileSync('public/app.js','utf8');
 assert.match(app,/TradeFlowLocationQuality\?\.assess/);
 assert.match(app,/No automatic third-party bulk geocoding on import/);
 assert.match(app,/Never block map load with external customer-address geocoding/);
 assert.match(app,/map_location_source='address-lookup'/);
 assert.match(app,/map_location_source='owner-provided-google-point'/);
});
