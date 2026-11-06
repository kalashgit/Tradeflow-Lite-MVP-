const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {manifest,getVoiceProfile,speechRequest}=require('../src/voice-profile-contract.cjs');

test('Chatterbox is selected without a paid provider or checked-in weights',()=>{
 assert.equal(manifest.engine.primary,'chatterbox-tts');
 assert.equal(manifest.engine.model_license,'MIT');
 assert.equal(manifest.engine.transport,'private_self_hosted_only');
 assert.equal(manifest.engine.paid_api_allowed,false);
 assert.equal(manifest.engine.model_weights_in_git,false);
});
test('both British persona identities remain distinct and reference audio is gated',()=>{
 assert.equal(getVoiceProfile('gentleman').locale,'en-GB');
 assert.equal(getVoiceProfile('gentleman').age_character,'mature adult');
 assert.equal(getVoiceProfile('matriarch').locale,'en-GB');
 assert.equal(getVoiceProfile('matriarch').age_character,'young adult');
 assert.equal(getVoiceProfile('gentleman').reference_audio_id,null);
 assert.equal(getVoiceProfile('matriarch').reference_audio_id,null);
 for(const profileId of ['gentleman','matriarch']){
  assert.equal(speechRequest({profileId,text:'A validated answer.',providerReady:true}).status,'unavailable');
 }
});
test('private server is loopback-only and does not accept unapproved reference paths from clients',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../scripts/chatterbox_private_tts.py'),'utf8');
 assert.match(src,/HOST = "127\.0\.0\.1"/);
 assert.match(src,/TF_GENTLEMAN_REFERENCE/);
 assert.match(src,/TF_MATRIARCH_REFERENCE/);
 assert.doesNotMatch(src,/payload\.get\("audio_prompt_path"\)/);
 assert.match(src,/Cache-Control/);
});
