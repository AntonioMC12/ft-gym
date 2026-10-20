import {it,expect} from 'vitest'
import {normalizeNationalDocument,validNationalDocument} from './national-document.js'
import {normalizeNationalDocument as serverNormalize,validNationalDocument as serverValid} from '../../../api/centers/domain/national-document.js'
it('keeps registration and server normalization and control-letter validation identical',()=>{
 const values=['12345678Z','12.345.678-z','X1234567L','Y1234567X','Z1234567R','12345678A','X1234567A',null,42,'', ' '.repeat(50)+'12345678Z']
 for(const value of values){expect(validNationalDocument(value)).toBe(serverValid(value));expect(normalizeNationalDocument(value)).toBe(serverNormalize(value))}
})
