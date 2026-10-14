import {minorUnits} from './domain/money.js';
export const STRIPE_API_VERSION='2026-09-30.endive';
// C27 is sandbox-only. A live key is never accepted, even if the caller supplies
// a false livemode field. Profiles are private deployment configuration.
export function stripeProfiles(env=process.env) {
  const raw=env.CENTERS_STRIPE_PROFILES_JSON;if(!raw)return Object.freeze([]);
  try{
    if(typeof raw!=='string'||raw.length>65536)throw new Error();
    const list=JSON.parse(raw),ids=new Set(),centers=new Set();if(!Array.isArray(list)||list.length>8)throw new Error();
    return Object.freeze(list.map(value=>{
      if(!value||value.mode!=='test'||typeof value.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(value.id)||ids.has(value.id)||!/^acct_[a-zA-Z0-9]{8,64}$/.test(value.accountId)||typeof value.apiKey!=='string'||!/^(?:sk|rk)_test_[a-zA-Z0-9_]{16,480}$/.test(value.apiKey))throw new Error();ids.add(value.id);
      if(!Array.isArray(value.webhookSecrets)||!value.webhookSecrets.length||value.webhookSecrets.length>2||value.webhookSecrets.some(secret=>typeof secret!=='string'||!/^whsec_[a-zA-Z0-9_]{16,480}$/.test(secret)))throw new Error();
      if(!Array.isArray(value.centerIds)||!value.centerIds.length||value.centerIds.length>64)throw new Error();
      const centerIds=value.centerIds.map(id=>{if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(id)||centers.has(id))throw new Error();centers.add(id);return id});
      const maximum=minorUnits(value.maxAmountMinor),daily=minorUnits(value.dailyLimitMinor);if(maximum<50n||maximum>99999999n||daily<maximum)throw new Error();
      const origin=new URL(value.returnOrigin||env.ORIGIN||'http://localhost:8080');if(origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))throw new Error();
      return Object.freeze({id:value.id,mode:'test',accountId:value.accountId,apiKey:value.apiKey,webhookSecrets:Object.freeze([...value.webhookSecrets]),centerIds:Object.freeze(centerIds),maxAmountMinor:maximum.toString(),dailyLimitMinor:daily.toString(),returnOrigin:origin.origin});
    }));
  }catch{return Object.freeze([])}
}
export const stripeProfileFor=(config,centerId)=>config.stripeProfiles?.find(profile=>profile.centerIds.includes(centerId))||null;
