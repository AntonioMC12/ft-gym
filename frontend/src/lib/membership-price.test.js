import {it,expect} from 'vitest'
import {priceToMinor,minorToPrice} from './membership-price.js'
it('converts decimal field text exactly without floating point arithmetic',()=>{
  for(const [input,output] of [['0','0'],['0.01','1'],['29,99','2999'],['0029.9','2990'],['10000000000.00','1000000000000']])expect(priceToMinor(input)).toBe(output)
  expect(minorToPrice('1')).toBe('0.01');expect(minorToPrice('2999')).toBe('29.99')
  for(const value of ['-1','1e2','1.001','1,000.00','10000000000.01','Infinity',''])expect(()=>priceToMinor(value)).toThrow()
})
it('permits an explicit larger ledger limit while preserving the plan limit',()=>{
  expect(priceToMinor('9999999999999.99',{maxMinor:'999999999999999'})).toBe('999999999999999')
  expect(()=>priceToMinor('10000000000.01')).toThrow();expect(()=>priceToMinor('10000000000000',{maxMinor:'999999999999999'})).toThrow()
})
