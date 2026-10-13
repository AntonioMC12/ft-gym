import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiptListOptions} from '../centers/services/receipts.js';
test('receipt pagination bounds private financial lists and rejects malformed limits/cursors',()=>{
  assert.deepEqual(receiptListOptions(new URLSearchParams()),{limit:30,cursor:null});
  for(const value of ['limit=0','limit=101','limit=Infinity','limit=1.1','cursor='+ 'a'.repeat(1025)])assert.throws(()=>receiptListOptions(new URLSearchParams(value)),{status:400});
});
