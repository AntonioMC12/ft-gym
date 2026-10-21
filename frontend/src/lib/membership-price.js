// Text conversion for fields/display only. Financial rounding belongs to the API domain.
export function priceToMinor(value,{maxMinor='1000000000000'}={}) {
  if(typeof value!=='string'||!/^\d{1,13}(?:[.,]\d{1,2})?$/.test(value.trim()))throw new Error('invalid price');
  const [whole,part='']=value.trim().replace(',','.').split('.');
  const minor=BigInt(whole)*100n+BigInt(part.padEnd(2,'0'));
  if(minor>BigInt(maxMinor))throw new Error('invalid price');return minor.toString();
}
export function minorToPrice(value) {
  if(typeof value!=='string'||!/^\d+$/.test(value))return '';
  const text=value.padStart(3,'0');return text.slice(0,-2)+'.'+text.slice(-2);
}
