import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planFields} from '../centers/domain/membership-plan.js';
import {planListOptions} from '../centers/services/membership-plans.js';
const base={name:'Monthly',priceMinor:'2999',currency:'EUR',intervalMonths:1};
test('membership plans keep exact minor-unit text and permit incomplete explicit policies',()=>{
  assert.deepEqual(planFields(base),{...base,priceIncludesTax:null,taxBasisPoints:null,proration:null});
  assert.equal(planFields({...base,priceMinor:'1000000000000',priceIncludesTax:false,taxBasisPoints:2100,proration:'actual-days'}).priceMinor,'1000000000000');
});
test('membership plans refuse floats, mixed or unknown policies and unsupported periods',()=>{
  for(const patch of [{priceMinor:2999},{priceMinor:'29.99'},{priceMinor:'02999'},{priceMinor:'-1'},{priceMinor:'1000000000001'},{currency:'USD'},{intervalMonths:2},{priceIncludesTax:true},{taxBasisPoints:0},{priceIncludesTax:true,taxBasisPoints:2100.1},{proration:'guess'},{name:''}])assert.throws(()=>planFields({...base,...patch}),{status:400});
});
test('plan pagination validates filters and bounded limits',()=>{
  assert.equal(planListOptions(new URLSearchParams()).limit,30);
  for(const query of ['limit=0','limit=101','limit=1.1','archived=unknown','cursor='+ 'a'.repeat(1025)])assert.throws(()=>planListOptions(new URLSearchParams(query)),{status:400});
});
