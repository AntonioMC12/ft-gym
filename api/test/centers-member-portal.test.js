import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownSubscriptionDto,ownPaymentDto,ownPortalOptions} from '../centers/services/member-portal.js';
test('own financial projections are allowlists including nested refund details',()=>{
  const contract=ownSubscriptionDto({id:'s',name:'Fee',priceMinor:'10',currency:'EUR',discountReason:'staff private',canCancel:true,version:1,actorUid:'private',futureSensitiveField:'private'});
  assert.equal(contract.id,'s');for(const key of ['discountReason','canCancel','version','actorUid','futureSensitiveField'])assert.ok(!(key in contract));
  const payment=ownPaymentDto({id:'p',amountMinor:'10',currency:'EUR',paidOn:'2026-10-14',method:'cash',reference:'private',actorUid:'private',allocations:[{receiptId:'r',amountMinor:'10',refundedMinor:'1',refundableMinor:'9',private:'private'}],refunds:[{id:'f',amountMinor:'1',refundedOn:'2026-10-14',reason:'private',actorUid:'private'}]});assert.ok(!JSON.stringify(payment).includes('private'));assert.ok(!('refundableMinor' in payment.allocations[0]));
});
test('own portal never accepts member/account identifiers or arbitrary query options',()=>{
  ownPortalOptions(new URLSearchParams('centerId=c&limit=1&cursor=page'));for(const key of ['memberId','id','accountUid','platform'])assert.throws(()=>ownPortalOptions(new URLSearchParams('centerId=c&'+key+'=other')),{code:'invalid-input'});
});
