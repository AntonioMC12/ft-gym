import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNationalDocument,validNationalDocument} from '../centers/domain/national-document.js';
test('DNI/NIE normalization and control letter',()=>{
 for(const value of ['12345678Z',' 12.345.678-z ','X1234567L','Y1234567X','Z1234567R','00000000T'])assert.equal(validNationalDocument(value),true,value);
 for(const value of ['',null,32,'12345678A','X1234567A','123','123456789Z','12345678Z!'])assert.equal(validNationalDocument(value),false,String(value));
 assert.equal(normalizeNationalDocument(' 12.345.678-z '),'12345678Z');
});
