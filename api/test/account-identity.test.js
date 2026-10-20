import {test} from 'node:test';
import assert from 'node:assert/strict';
import {documentKey,documentOwner,importDocumentClaims} from '../account-identity.js';
test('DNI/NIE keys normalize separators and case, validate the letter and use a secret blind index',()=>{
 const key=documentKey('12345678Z','secret-a');assert.equal(key,documentKey(' 12.345.678-z ','secret-a'));assert.equal(key.length,64);
 assert.notEqual(key,documentKey('12345678Z','secret-b'));assert.equal(documentKey('12345678A','secret-a'),null);assert.equal(documentKey('X1234567L','secret-a'),documentKey('x-1234567-l','secret-a'));
 assert.equal(documentOwner([{id:'a',documentKey:key}],key).id,'a');assert.equal(documentOwner([{id:'a',documentKey:key}],key,'a'),null);
});
test('legacy import preserves UIDs and passwords, removes usernames and does not assign ambiguous DNI',()=>{
 const users=[{id:'a',name:'Ana Garcia',username:'ana',pw:{h:'keep'}},{id:'b',name:'Ana Garcia'},{id:'c',name:'Other person'}];
 const result=importDocumentClaims(users,new Map([['a',new Set(['one'])],['b',new Set(['duplicate'])],['c',new Set(['duplicate'])]]));
 assert.equal(result.changed,true);assert.equal(users[0].documentKey,'one');assert.equal(users[0].username,undefined);assert.equal(users[0].pw.h,'keep');assert.equal(users[1].documentKey,undefined);assert.equal(users[2].documentKey,undefined);assert.equal(result.reserved.has('duplicate'),true);
});
