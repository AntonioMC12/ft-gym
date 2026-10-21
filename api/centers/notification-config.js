import {notificationAddress} from './domain/notifications.js';
// Invalid mail settings fail closed without preventing personal-training startup.
// Profiles are server-only; neither SQL policy bodies nor browser DTOs hold tokens.
export function notificationProfiles(env=process.env) {
  const raw=env.CENTERS_MAIL_PROFILES_JSON;if(!raw)return Object.freeze([]);
  try{
    if(typeof raw!=='string'||raw.length>65536)throw new Error();
    const profiles=JSON.parse(raw),centers=new Set();if(!Array.isArray(profiles)||profiles.length>8)throw new Error();
    return Object.freeze(profiles.map(profile=>{
      if(!profile||profile.provider!=='cloudflare'||!/^[a-f0-9]{32}$/i.test(profile.accountId)||typeof profile.token!=='string'||profile.token.length<20||profile.token.length>512||/[\s\u0000-\u001f\u007f]/.test(profile.token)||!Array.isArray(profile.centerIds)||!profile.centerIds.length||profile.centerIds.length>64)throw new Error();
      const from=notificationAddress(profile.from),name=profile.name||'Centros';if(typeof name!=='string'||name.length>120||/[\u0000-\u001f\u007f]/.test(name))throw new Error();
      const ids=profile.centerIds.map(id=>{if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(id)||centers.has(id))throw new Error();centers.add(id);return id});
      return Object.freeze({provider:'cloudflare',accountId:profile.accountId,token:profile.token,from,name,centerIds:Object.freeze(ids)});
    }));
  }catch{return Object.freeze([])}
}
export function notificationMode(config,centerId) {
  if(config.notificationTestCapture)return 'test-capture';
  return config.mailProfiles?.some(profile=>profile.centerIds.includes(centerId))?'cloudflare':'off';
}
