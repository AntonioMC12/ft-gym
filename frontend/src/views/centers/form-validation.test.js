import {it,expect} from 'vitest'
import {passFormErrors,subscriptionFormErrors,validCenterDate} from './form-validation.js'
it('validates real dates, percentage bounds and required discount reasons',()=>{
 expect(validCenterDate('2026-02-30')).toBe(false);expect(validCenterDate('2028-02-29')).toBe(true)
 expect(passFormErrors({productId:'',startsOn:'2026-10-01'},'2026-10-16')).toHaveProperty('productId');expect(passFormErrors({productId:'p',startsOn:'2026-10-16'},'2026-10-16')).toEqual({})
 const valid={priceVersionId:'p',effectiveOn:'2026-10-16',discount:'0',reason:''};expect(subscriptionFormErrors(valid,'2026-10-16')).toEqual({});expect(subscriptionFormErrors({...valid,discount:'101'},'2026-10-16')).toHaveProperty('discount');expect(subscriptionFormErrors({...valid,discount:'12,50'},'2026-10-16')).toHaveProperty('reason');expect(subscriptionFormErrors({...valid,discount:'12,50',reason:'Agreement'},'2026-10-16')).toEqual({})
})
