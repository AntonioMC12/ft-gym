import {applyAssignmentRetirements} from './assignment-lifecycle.js'
import {t} from './i18n-core.js'
import {parsePlan,mergePlan} from './plan-share.js'
import {mergePlanDeliveries} from './plan-delivery-state.js'

export function applyPlanDelivery(state,delivery,{schedule=false}={}){
  const acceptedAt=typeof delivery?.acceptedAt==='string'?Date.parse(delivery.acceptedAt):delivery?.acceptedAt,ids=delivery?.routineIds,key=delivery?.deliveryKey
  if(!ids||typeof ids!=='object'||Array.isArray(ids))throw new Error('invalid delivery routine map')
  const marker=mergePlanDeliveries([{id:key,acceptedAt,routineIds:ids&&Object.values(ids)}],[])[0]
  if(!marker||marker.id!==key||typeof schedule!=='boolean')throw new Error('invalid accepted plan delivery')
  applyAssignmentRetirements(state,(delivery.retirements||[]).filter(r=>r.reason==='platform'))
  const previous=mergePlanDeliveries(state.planDeliveries,[])
  const applied=previous.find(row=>row.id===key)
  if(applied){
    if(JSON.stringify(applied)!==JSON.stringify(marker))throw new Error('delivery identity conflict')
    return {routines:0,alreadyApplied:true}
  }
  const bundle=parsePlan(delivery.bundle,state.unit||'kg')
  if(bundle.dropped||bundle.customEx.length||!bundle.routines.length||bundle.routines.some(row=>!Object.hasOwn(ids,row.id)||typeof ids[row.id]!=='string'||!/^cr_[a-f0-9]{32}$/.test(ids[row.id]))||Object.keys(ids).length!==bundle.routines.length||new Set(Object.values(ids)).size!==bundle.routines.length)throw new Error('invalid delivery routine map')
  for(const row of previous)if(row.routineIds.some(id=>marker.routineIds.includes(id)))throw new Error('delivery destination conflict')
  const removed=new Set([...(Array.isArray(state.resetIds?.routines)?state.resetIds.routines:[]),...Object.keys(state.deleted?.routines||{}).filter(id=>Number(state.deleted.routines[id])>0)])
  const eligible={...bundle,routines:bundle.routines.filter(row=>!removed.has(ids[row.id]))}
  const result=mergePlan(state,eligible,{schedule,routineIds:ids})
  const planId='delivery_'+key
  // Repeated names are valid: identity belongs to the accepted delivery, not its title.
  state.trainingPlans={...state.trainingPlans,[planId]:{name:bundle.name||t('Plan'),acceptedAt}}
  for(const r of state.routines)if(marker.routineIds.includes(r.id))r.planId=planId
  state.planDeliveries=mergePlanDeliveries(previous,[marker])
  return {...result,removed:eligible.routines.length!==bundle.routines.length,alreadyApplied:false}
}
