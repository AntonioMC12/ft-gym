// Plans are organizational containers over the existing routine IDs, never copies.
import {uid} from './format.js'
export const plansOf=S=>Object.entries(S?.trainingPlans||{}).filter(([id,p])=>id&&p&&typeof p.name==='string').map(([id,p])=>({id,name:p.name}))
export const planOf=(S,r)=>plansOf(S).some(p=>p.id===r?.planId)?r.planId:null
export function createTrainingPlan(S,name,id=uid()){
 const clean=String(name||'').trim();if(!clean||clean.length>120)throw new Error('invalid plan name')
 S.trainingPlans={...(S.trainingPlans||{}),[id]:{name:clean}};return id
}
export function removeTrainingPlan(S,id){
 if(!S.trainingPlans?.[id])return false
 delete S.trainingPlans[id]
 for(const r of S.routines||[])if(r.planId===id)delete r.planId
 return true
}
export function moveRoutineToPlan(S,rid,id){
 const r=S.routines?.find(r=>r.id===rid);if(!r||id&&!S.trainingPlans?.[id])return false
 if(id)r.planId=id;else delete r.planId
 return true
}
export function stateForPlan(S,id){
 const routines=(S.routines||[]).filter(r=>planOf(S,r)===id),ids=new Set(routines.map(r=>r.id)),week={}
 for(const [day,rows] of Object.entries(S.week||{})){const kept=[].concat(rows).filter(r=>ids.has(r));if(kept.length)week[day]=kept}
 return {...S,routines,week}
}
