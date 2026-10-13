import {CentersError} from '../errors.js';
const invalid=()=>{throw new CentersError(400,'invalid-input','invalid exact monetary value');};
export function minorUnits(value) {
  if(typeof value!=='string'||!/^(0|[1-9]\d{0,14})$/.test(value))invalid();return BigInt(value);
}
export function roundRatio(value,numerator,denominator) {
  if(typeof value!=='bigint'||value<0n||typeof numerator!=='bigint'||numerator<0n||typeof denominator!=='bigint'||denominator<=0n)invalid();
  const product=value*numerator;return (product+denominator/2n)/denominator;
}
export function splitTax(amount,{priceIncludesTax,taxBasisPoints}) {
  if(typeof priceIncludesTax!=='boolean'||!Number.isSafeInteger(taxBasisPoints)||taxBasisPoints<0||taxBasisPoints>10000)invalid();
  const value=minorUnits(amount),rate=BigInt(taxBasisPoints);
  const net=priceIncludesTax?roundRatio(value,10000n,10000n+rate):value,tax=priceIncludesTax?value-net:roundRatio(net,rate,10000n);
  return {netMinor:net.toString(),taxMinor:tax.toString(),totalMinor:(net+tax).toString()};
}
