import {mergePlanDeliveries} from './plan-delivery-state.js'
// Informational provenance only; this never grants permissions or the official exercise seal.
export function routineOrigin(state,routine){
 const id=typeof routine==='string'?routine:routine?.id
 return mergePlanDeliveries(state?.planDeliveries,[]).some(delivery=>delivery.routineIds.includes(id))?'trainer':'personal'
}
