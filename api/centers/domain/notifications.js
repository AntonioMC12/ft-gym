import {createHash} from 'node:crypto';
import {CentersError} from '../errors.js';
export const notificationDigest=value=>createHash('sha256').update(value).digest('hex');
export function notificationAddress(value) {
  if(typeof value!=='string'||value.length>254||/[\s\u0000-\u001f\u007f]/u.test(value)||!/^[-a-zA-Z0-9.!#$%&'*+/=?^_`{|}~]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,63}$/.test(value))throw new CentersError(400,'invalid-input','invalid notification address');
  return value.slice(0,value.lastIndexOf('@'))+'@'+value.slice(value.lastIndexOf('@')+1).toLowerCase();
}
export function notificationPolicy(raw) {
  if(!raw||typeof raw.enabled!=='boolean'||typeof raw.receipts!=='boolean'||!Number.isSafeInteger(raw.dueLeadDays)||raw.dueLeadDays<0||raw.dueLeadDays>30||!Number.isSafeInteger(raw.debtRepeatDays)||raw.debtRepeatDays<1||raw.debtRepeatDays>90||!Number.isSafeInteger(raw.priceNoticeDays)||raw.priceNoticeDays<1||raw.priceNoticeDays>90)throw new CentersError(400,'invalid-input','explicit notification policy required');
  return {enabled:raw.enabled,receipts:raw.receipts,dueLeadDays:raw.dueLeadDays,debtRepeatDays:raw.debtRepeatDays,priceNoticeDays:raw.priceNoticeDays};
}
export function notificationMessage(kind,{centerName,token}={}) {
  // No HTML interpretation of center/member input and no amounts, reasons, identity
  // documents or login credentials in business notices. The portal remains authoritative.
  const safe=String(centerName||'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,120);
  if(kind==='verify'){
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new Error('invalid notification verification token');
    return {subject:'Verifica tu correo de avisos',text:`${safe}\nCódigo de verificación: ${token}\nCaduca en 15 minutos. Introdúcelo en Mis centros. Si no lo has solicitado, ignora este mensaje.`};
  }
  const lines={receipt:'Tienes un nuevo recibo disponible.',due:'Tienes un recibo próximo a vencer.',debt:'Tienes un saldo pendiente de revisión.',price:'Tienes nuevas condiciones de cuota para revisar.'};
  if(!lines[kind])throw new Error('unsupported notification kind');
  return {subject:'Aviso de tu centro',text:`${safe}\n${lines[kind]}\nConsulta los detalles en Mis centros. Puedes desactivar estos avisos en tu afiliación.`};
}
export function notificationHtml(text) {
  return '<p>'+String(text).replace(/[&<>"']/g,value=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value])).replace(/\n/g,'<br>')+'</p>';
}
export function notificationRetry(attempts) {
  if(!Number.isSafeInteger(attempts)||attempts<1||attempts>8)throw new Error('invalid notification attempt');
  return attempts>=8?null:Math.min(3600,30*2**(attempts-1));
}
