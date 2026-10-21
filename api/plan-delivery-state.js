// Personal training provenance only: opaque delivery/routine IDs and acceptance
// time. No center, staff, member identity, permission or financial payload here.
export function mergePlanDeliveries(a,b){
  const byId=new Map()
  for(const value of [...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])]){
    if(!value||typeof value.id!=='string'||!/^td_[a-f0-9]{32}$/.test(value.id)||!Number.isSafeInteger(value.acceptedAt)||value.acceptedAt<=0||!Array.isArray(value.routineIds)||!value.routineIds.length||value.routineIds.length>20||value.routineIds.some(id=>typeof id!=='string'||!/^cr_[a-f0-9]{32}$/.test(id)))continue
    const clean={id:value.id,acceptedAt:value.acceptedAt,routineIds:[...new Set(value.routineIds)].sort()},previous=byId.get(value.id)
    if(!previous||JSON.stringify(clean)<JSON.stringify(previous))byId.set(value.id,clean)
  }
  return [...byId.values()].sort((x,y)=>x.id<y.id?-1:x.id>y.id?1:0).slice(-2000)
}
export function protectPlanDeliveryDeletions(state){
  const ids=new Set(mergePlanDeliveries(state.planDeliveries,[]).flatMap(value=>value.routineIds))
  if(Array.isArray(state.routines)&&ids.size)state.routines=state.routines.filter(row=>!ids.has(row?.id)||!(Number(state.deleted?.routines?.[row.id])>0))
  return state
}
