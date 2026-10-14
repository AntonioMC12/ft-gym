import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notificationAddress,notificationMessage,notificationHtml,notificationRetry,notificationPolicy} from '../centers/domain/notifications.js';
import {notificationTick} from '../centers/services/notification-worker.js';
test('notification contacts reject header injection and preserve the local part while normalizing the domain',()=>{
  assert.equal(notificationAddress('Socio+avisos@EXAMPLE.INVALID'),'Socio+avisos@example.invalid');
  for(const address of ['x@example.invalid\r\nBcc:y@example.invalid','a,b@example.invalid',' a@example.invalid','x@localhost',null,'a'.repeat(255)+'@example.invalid'])assert.throws(()=>notificationAddress(address),{code:'invalid-input'});
});
test('notification templates escape arbitrary center text and reveal no receipt amounts',()=>{
  const notice=notificationMessage('receipt',{centerName:'<img src=x onerror=alert(1)>\r\nCentro'}),html=notificationHtml(notice.text);
  assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));assert.ok(!notice.subject.includes('\n'));assert.ok(!notice.text.includes('EUR'));
  assert.ok(notificationMessage('verify',{token:'a'.repeat(64)}).text.includes('a'.repeat(64)));assert.throws(()=>notificationMessage('verify',{token:'bad'}));assert.throws(()=>notificationMessage('marketing',{}));
});
test('notification retries and notice policy have explicit finite limits',()=>{
  assert.deepEqual([1,2,3,8].map(notificationRetry),[30,60,120,null]);assert.throws(()=>notificationRetry(9));
  assert.deepEqual(notificationPolicy({enabled:false,receipts:true,dueLeadDays:3,debtRepeatDays:7,priceNoticeDays:30}),{enabled:false,receipts:true,dueLeadDays:3,debtRepeatDays:7,priceNoticeDays:30});
  assert.throws(()=>notificationPolicy({enabled:true,receipts:true,dueLeadDays:3,debtRepeatDays:0,priceNoticeDays:30}),{code:'invalid-input'});
});
test('an unconfigured mail transport never opens SQL or attempts a network send',async()=>{
  let resolved=false;assert.deepEqual(await notificationTick({platformTransaction(){resolved=true;throw new Error()}}),{processed:0});assert.equal(resolved,false);
  await assert.rejects(notificationTick({},{transport:{kind:'smtp',send:async()=>{}}}),/explicit supported notification transport/);
  const production={platformTransaction:async(uid,work)=>work({query:async()=>({rows:[{kind:'production'}]})})};
  await assert.rejects(notificationTick(production,{transport:{kind:'test-capture',idempotent:true,send:async()=>{throw new Error('must not send')}}}),/isolated notification test database required/);
});
