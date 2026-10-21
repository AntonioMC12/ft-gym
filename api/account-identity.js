import {createHmac} from 'node:crypto';
import {normalizeNationalDocument,validNationalDocument} from './centers/domain/national-document.js';
// A keyed blind index, not plaintext DNI or a publicly brute-forceable digest.
export function documentKey(value,secret){return validNationalDocument(value)?createHmac('sha256',secret).update('ft-gym-login-document-v1\0'+normalizeNationalDocument(value)).digest('hex'):null}
export function documentOwner(users,key,exceptId){return key?users.find(user=>user.id!==exceptId&&user.documentKey===key)||null:null}
export function importDocumentClaims(users,candidates){
 const groups=new Map();
 for(const user of users){const keys=new Set([...(candidates.get(user.id)||[]),...(user.documentKey?[user.documentKey]:[])]);for(const key of keys){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(user)}}
 let changed=false;
 for(const user of users){
  if(Object.hasOwn(user,'username')){delete user.username;changed=true}
  if(user.documentKey)continue;
  const keys=[...(candidates.get(user.id)||[])];
  if(keys.length===1&&groups.get(keys[0]).length===1){user.documentKey=keys[0];changed=true}
 }
 // Ambiguous legacy documents are never assigned automatically to either account.
 return {changed,reserved:new Set(groups.keys())};
}
