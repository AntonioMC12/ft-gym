import {test} from 'node:test';
import assert from 'node:assert/strict';
import {memberFields,memberListOptions} from '../centers/domain/member-validation.js';
test('member contact fields are bounded, optional and never imply account ownership',()=>{
  assert.deepEqual(memberFields({name:'  Synthetic  ',email:' a@example.test '}),{name:'Synthetic',email:'a@example.test',phone:null,nationalDocument:null});
  for(const body of [{name:''},{name:'x',email:'broken'},{name:'x',phone:'bad\ncontact'},{name:'x',nationalDocument:'x'.repeat(41)}])assert.throws(()=>memberFields(body),{status:400});
});
test('member list limits and state filters are explicit and bounded',()=>{
  assert.deepEqual(memberListOptions(new URLSearchParams()),{query:'',state:'',limit:50,cursor:''});
  for(const query of ['limit=101','limit=0','limit=1.5','state=deleted','cursor='+'x'.repeat(2001)])assert.throws(()=>memberListOptions(new URLSearchParams(query)),{status:400});
});
