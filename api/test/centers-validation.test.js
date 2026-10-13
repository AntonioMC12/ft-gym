import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centerFields,objectBody,requestField,versionField } from '../centers/domain/validation.js';

test('center configuration validates calendar intervals and bounded metadata',()=>{
  const value=centerFields({name:'  Fictional  ',capacity:120,billingDay:31,openingHours:{1:[['00:00','08:00'],['09:00','24:00']]}});
  assert.equal(value.name,'Fictional');assert.equal(value.billingDay,31);
  for(const patch of [{capacity:-1},{billingDay:32},{timezone:'wrong/zone'},{openingHours:{7:[]}},{openingHours:{1:[['10:00','09:00']]}},{openingHours:{1:[['08:00','12:00'],['11:00','15:00']]}}]){
    assert.throws(()=>centerFields({name:'Fictional',...patch}),{status:400});
  }
});
test('commands reject unexpected privilege fields, stale version types and missing request ids',()=>{
  assert.throws(()=>objectBody({name:'one',admin:true},['name']),{status:400});
  assert.throws(()=>versionField('1'),{status:400});assert.throws(()=>requestField('short'),{status:400});
});
