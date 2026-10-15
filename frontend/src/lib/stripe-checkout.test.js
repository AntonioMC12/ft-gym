import {it,expect} from 'vitest'
import {testCheckoutUrl} from './stripe-checkout.js'
it('allows only a hosted test Checkout session URL and retains the provider fragment',()=>{
  expect(testCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_123#fragment')).toBe('https://checkout.stripe.com/c/pay/cs_test_123#fragment')
  for(const value of [null,'https://evil.example/c/pay/cs_test_a','https://checkout.stripe.com.evil.example/c/pay/cs_test_a','http://checkout.stripe.com/c/pay/cs_test_a','https://user@checkout.stripe.com/c/pay/cs_test_a','https://checkout.stripe.com:444/c/pay/cs_test_a','https://checkout.stripe.com/c/pay/cs_live_a','javascript:alert(1)','https://checkout.stripe.com/redirect?session=cs_test_a'])expect(testCheckoutUrl(value)).toBeNull()
})
