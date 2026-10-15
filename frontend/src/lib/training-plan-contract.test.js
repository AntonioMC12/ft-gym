import {it,expect} from 'vitest'
import {trainingPlan as validateTrainingPlan} from '../../../api/centers/domain/training-plan.js'
import {libraryHas} from '../../../api/coach/core/library.js'
const trainingPlan=value=>validateTrainingPlan(value,libraryHas)
import {buildPlanBundle,parsePlan} from './plan-share.js'
import {applyPlanDelivery} from './plan-delivery.js'

it('a server-normalized proposal preserves the existing exported prescriptions and conversion',()=>{
  const original={unit:'kg',customEx:[],week:{1:['r']},routines:[{id:'r',name:'Push',prog:'double',excludeFromProgression:true,ex:[{id:'0025',sets:3,reps:8,weight:60,pyramid:[8,6,'max'],pyramidRest:[90,60,0],pyramidWeight:[60,65,0],restSec:90,warmupRestSec:45,warmupSets:2,intensifier:{type:'restpause',totalReps:12,restSec:15},dbLoad:'each',inc:2.5,deloadFactor:0.8,note:'Keep form'}]}]}
  const exported=JSON.parse(JSON.stringify(buildPlanBundle(original,'Strength'))),normalized=trainingPlan(exported)
  for(const unit of ['kg','lb']){
    expect(parsePlan(normalized,unit).routines).toEqual(parsePlan(exported,unit).routines)
    const state={unit,customEx:[],routines:[],week:{},dayPlan:{},active:{id:'live'}},rid='cr_'+'b'.repeat(32)
    applyPlanDelivery(state,{deliveryKey:'td_'+'a'.repeat(32),acceptedAt:1800000000000,routineIds:{r:rid},bundle:normalized})
    expect(state.routines[0].ex).toEqual(parsePlan(exported,unit).routines[0].ex)
    expect(state.active).toEqual({id:'live'})
  }
})
