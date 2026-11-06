'use strict';
const manifest=require('../config/tradeflow-voice-profiles.json');
const ids=Object.freeze(Object.keys(manifest.profiles));

function getVoiceProfile(id){
  if(typeof id!=='string'||!Object.prototype.hasOwnProperty.call(manifest.profiles,id))return null;
  return Object.freeze({...manifest.profiles[id],id});
}

function speechRequest({profileId,text,providerReady=false}={}){
  const profile=getVoiceProfile(profileId);
  if(!profile)return {status:'invalid_profile'};
  // Absence of model files/readiness must never result in a synthetic
  // recorded voice being advertised as live or silently using a paid API.
  if(!providerReady||!profile.model_voice_id)return {status:'unavailable',reason:'licensed_model_voice_not_verified'};
  if(typeof text!=='string'||!text.trim()||text.length>2500)return {status:'invalid_text'};
  return {status:'ready',modelVoiceId:profile.model_voice_id,text,language:profile.locale};
}

module.exports=Object.freeze({manifest,ids,getVoiceProfile,speechRequest});
