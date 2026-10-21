import {CentersError} from '../errors.js';
import {objectBody,idField,requestField,textField} from './validation.js';
import {minorUnits} from './money.js';
import {membershipDate} from './membership-transitions.js';
const invalid=message=>{throw new CentersError(400,'invalid-input',message)};
export function positiveAmount(value) {if(minorUnits(value)===0n)invalid('positive amount required');return value;}
export function paymentInput(raw) {
  objectBody(raw,['centerId','memberId','amountMinor','currency','paidOn','method','reference','allocations','requestId']);
  if(raw.currency!=='EUR'||!['cash','bank-transfer','card','other'].includes(raw.method))invalid('invalid payment terms');
  if(!Array.isArray(raw.allocations)||!raw.allocations.length||raw.allocations.length>50)invalid('1-50 allocations required');
  const allocations=raw.allocations.map(a=>{objectBody(a,['receiptId','amountMinor']);return {receiptId:idField(a.receiptId),amountMinor:positiveAmount(a.amountMinor)}}).sort((a,b)=>a.receiptId.localeCompare(b.receiptId));
  if(new Set(allocations.map(a=>a.receiptId)).size!==allocations.length)invalid('duplicate receipt allocation');
  const amountMinor=positiveAmount(raw.amountMinor);
  if(allocations.reduce((sum,a)=>sum+minorUnits(a.amountMinor),0n)!==minorUnits(amountMinor))invalid('payment must be fully allocated');
  return {centerId:idField(raw.centerId),memberId:idField(raw.memberId),amountMinor,currency:'EUR',paidOn:membershipDate(raw.paidOn),method:raw.method,reference:textField(raw.reference,120),allocations,requestId:requestField(raw.requestId)};
}
export function refundInput(raw) {
  objectBody(raw,['centerId','memberId','paymentId','receiptId','amountMinor','refundedOn','reason','requestId']);
  return {centerId:idField(raw.centerId),memberId:idField(raw.memberId),paymentId:idField(raw.paymentId),receiptId:idField(raw.receiptId),amountMinor:positiveAmount(raw.amountMinor),refundedOn:membershipDate(raw.refundedOn),reason:textField(raw.reason,500,{required:true}),requestId:requestField(raw.requestId)};
}
