import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paymentInput,refundInput} from '../centers/domain/payments.js';
const input={centerId:'c',memberId:'m',amountMinor:'900719925474099',currency:'EUR',paidOn:'2026-10-14',method:'cash',allocations:[{receiptId:'b',amountMinor:'900719925474098'},{receiptId:'a',amountMinor:'1'}],requestId:'payment_test_01'};
test('payment allocations use exact integers, canonical order and full allocation',()=>{
  const result=paymentInput(input);assert.equal(result.amountMinor,'900719925474099');assert.equal(result.allocations[0].receiptId,'a');
  for(const change of [{amountMinor:1},{amountMinor:'0'},{amountMinor:'01'},{amountMinor:'1.2'},{currency:'USD'},{paidOn:'2026-02-30'},{allocations:[]},{allocations:[{receiptId:'a',amountMinor:'1'},{receiptId:'a',amountMinor:'1'}]},{allocations:[{receiptId:'a',amountMinor:'1'}]},{paid:true}])assert.throws(()=>paymentInput({...input,...change}),{code:'invalid-input'});
});
test('refunds require exact positive amounts, a reason and valid civil date',()=>{
  const raw={centerId:'c',memberId:'m',paymentId:'p',receiptId:'r',amountMinor:'10',refundedOn:'2026-10-14',reason:'  Synthetic correction  ',requestId:'refund_test_01'};
  assert.equal(refundInput(raw).reason,'Synthetic correction');for(const change of [{amountMinor:'0'},{reason:' '},{reason:'x'.repeat(501)},{refundedOn:'2026-13-01'},{currency:'EUR'}])assert.throws(()=>refundInput({...raw,...change}),{code:'invalid-input'});
});
