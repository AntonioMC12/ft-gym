import {test} from 'node:test';
import assert from 'node:assert/strict';
import {platformCenterListOptions} from '../centers/services/centers.js';
test('platform center pagination has bounded inputs and rejects unrelated selectors',()=>{
  assert.deepEqual(platformCenterListOptions(new URLSearchParams()),{query:'',limit:30,cursor:null});
  assert.deepEqual(platformCenterListOptions(new URLSearchParams({query:' example ',limit:'100'})),{query:'example',limit:100,cursor:null});
  for(const params of [{limit:'0'},{limit:'101'},{limit:'1.5'},{query:'a'.repeat(121)},{query:'x\u0000'},{cursor:'x'.repeat(1025)},{memberId:'other'}])assert.throws(()=>platformCenterListOptions(new URLSearchParams(params)),{code:'invalid-input'});
});
