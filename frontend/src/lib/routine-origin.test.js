import {it,expect} from 'vitest'
import {routineOrigin} from './routine-origin.js'
import {copyRoutine} from './routines.js'
const id='cr_'+'a'.repeat(32),delivery={id:'td_'+'b'.repeat(32),acceptedAt:100,routineIds:[id]}
it('distinguishes an accepted routine from a personal routine independent of name',()=>{
 const S={planDeliveries:[delivery]};expect(routineOrigin(S,{id,name:'Custom name'})).toBe('trainer');expect(routineOrigin(S,{id:'personal',name:'FT Trainer'})).toBe('personal');expect(routineOrigin({},id)).toBe('personal')
})
it('a copy has independent personal provenance and malformed markers do not grant a label',()=>{
 const S={planDeliveries:[delivery]};expect(routineOrigin(S,copyRoutine({id,name:'Assigned',ex:[]}))).toBe('personal');expect(routineOrigin({planDeliveries:[{...delivery,id:'forged'}]},id)).toBe('personal')
})
