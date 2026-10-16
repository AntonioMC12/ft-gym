import {priceToMinor} from '../../lib/membership-price.js'
export function validCenterDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value}
export function passFormErrors({productId,startsOn},today){return {...(!productId?{productId:'Choose a pass to continue.'}:{}),...(!validCenterDate(startsOn)||today&&startsOn<today?{startsOn:'Choose a valid start date.'}:{})}}
export function subscriptionFormErrors({priceVersionId,effectiveOn,discount,reason},today){
 let amount;try{amount=Number(priceToMinor(discount))}catch{amount=NaN}
 return {...(!priceVersionId?{priceVersionId:'Choose an available fee to renew.'}:{}),...(!validCenterDate(effectiveOn)||today&&effectiveOn<today?{effectiveOn:'Choose a valid start date.'}:{}),...(!Number.isFinite(amount)||amount<0||amount>10000?{discount:'Enter a discount between 0 and 100.'}:{}),...(amount>0&&!reason.trim()?{reason:'Enter a reason for the discount.'}:{})}
}
export function focusCenterError(form,errors){const key=Object.keys(errors)[0];if(!key)return;const node=form?.querySelector('[data-error-field="'+key+'"]');node?.focus();node?.scrollIntoView?.({block:'nearest'})}
