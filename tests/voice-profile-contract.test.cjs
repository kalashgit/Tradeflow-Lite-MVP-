const {test}=require('node:test');
const assert=require('node:assert/strict');
const {manifest,ids,getVoiceProfile,speechRequest}=require('../src/voice-profile-contract.cjs');

test('founder voice profiles retain the distinct maturity and British character requirements',()=>{
  assert.deepEqual(ids,['gentleman','matriarch']);
  assert.equal(getVoiceProfile('gentleman').register,'resonant baritone');
  assert.equal(getVoiceProfile('matriarch').age_character,'young adult');
  assert.equal(getVoiceProfile('matriarch').presentation,'female');
  for(const id of ids){
    assert.equal(getVoiceProfile(id).locale,'en-GB');
    assert.match(getVoiceProfile(id).wit,/restrained dry British wit/);
  }
  assert.equal(getVoiceProfile('__proto__'),null);
});

test('Chatterbox voice aliases are provisioned only behind a ready private runtime',()=>{
  assert.equal(manifest.engine.paid_api_allowed,false);
  assert.equal(manifest.engine.model_weights_in_git,false);
  assert.equal(manifest.engine.primary,'chatterbox-tts');
  assert.equal(manifest.engine.transport,'private_self_hosted_only');
  for(const id of ids){
    assert.equal(getVoiceProfile(id).model_voice_id,id);
    assert.deepEqual(speechRequest({profileId:id,text:'Good morning.'}),
      {status:'unavailable',reason:'licensed_model_voice_not_verified'});
    assert.deepEqual(speechRequest({profileId:id,text:'Good morning.',providerReady:true}),
      {status:'ready',modelVoiceId:id,text:'Good morning.',language:'en-GB'});
  }
});

test('a voice has no independent authority to synthesize made-up claims',()=>{
  assert.deepEqual(speechRequest({profileId:'unknown',text:'Hello'}),{status:'invalid_profile'});
  const script='Three jobs today. An invoice remains unverified.';
  assert.equal(manifest.rules.some(r=>r.includes('exact final validated assistant text')),true);
  assert.equal(manifest.rules.some(r=>r.includes('no command authority')),true);
  assert.equal(script.length>0,true);
});
