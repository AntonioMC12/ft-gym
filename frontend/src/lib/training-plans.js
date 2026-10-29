// Plans are organizational containers over the existing routine IDs, never copies.
import {uid} from './format.js'
export const plansOf=S=>Object.entries(S?.trainingPlans||{}).filter(([id,p])=>id&&p&&typeof p.name==='string').map(([id,p])=>({...p,id}))
export const planOf=(S,r)=>plansOf(S).some(p=>p.id===r?.planId)?r.planId:null
export function createTrainingPlan(S,name,id=uid(),folderId=S.trainingPlans?.[id]?.folderId||null){
 const clean=validateLibraryName(S,name,folderId,id)
 if(folderId&&!foldersOf(S).some(f=>f.id===folderId))throw new Error('Folder unavailable')
 S.trainingPlans={...(S.trainingPlans||{}),[id]:{...S.trainingPlans?.[id],name:clean,folderId}};return id
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
 const routines=routinesForPlan(S,id),ids=new Set(routines.map(r=>r.id)),week={}
 for(const [day,rows] of Object.entries(S.week||{})){const kept=[].concat(rows).filter(r=>ids.has(r));if(kept.length)week[day]=kept}
 return {...S,routines,week}
}

// A routine has exactly one planId. The optional order belongs to the plan, never
// to the shared library array. Legacy plans fall back to the existing array order.
export function routinesForPlan(S,id){
 const rows=(S.routines||[]).filter(r=>planOf(S,r)===id)
 const byId=new Map(rows.map(r=>[r.id,r])),ordered=[]
 for(const rid of S.trainingPlans?.[id]?.routineOrder||[])if(byId.has(rid)){ordered.push(byId.get(rid));byId.delete(rid)}
 return [...ordered,...byId.values()]
}
export function reorderPlanRoutine(S,id,rid,delta){
 if(!S.trainingPlans?.[id])throw new Error('Plan unavailable')
 const ids=routinesForPlan(S,id).map(r=>r.id),at=ids.indexOf(rid),to=at+delta
 if(at<0||to<0||to>=ids.length)return
 ids.splice(to,0,ids.splice(at,1)[0])
 S.trainingPlans[id]={...S.trainingPlans[id],routineOrder:ids}
}

export const PLAN_CATEGORIES=[['category-men','Men'],['category-women','Women'],['category-cardio','Cardio'],['category-mobility','Mobility'],['category-core','Core']]
const categoryIds=new Set(PLAN_CATEGORIES.map(([id])=>id))
export function foldersOf(S){
 const categories=PLAN_CATEGORIES.map(([id,name])=>({id,name,parentId:null,category:true}))
 return [...categories,...Object.entries(S.trainingFolders||{}).filter(([id,f])=>!categoryIds.has(id)&&f&&typeof f.name==='string').map(([id,f])=>({...f,id,category:false}))]
}
export function initializePlanFolders(S){
 S.trainingFolders={...(S.trainingFolders||{})}
 for(const [id,name] of PLAN_CATEGORIES)if(!S.trainingFolders[id])S.trainingFolders[id]={name,parentId:null,category:true}
}
// Invalid references from an old/conflicting device remain visible in Unorganized.
export function folderPath(S,id){
 const folders=foldersOf(S),path=[],seen=new Set()
 while(id){
  const f=folders.find(x=>x.id===id)
  if(!f||seen.has(id))return []
  seen.add(id);path.unshift(f);id=f.parentId
 }
 return path[0]?.category?path:[]
}
export const planFolder=(S,p)=>folderPath(S,p?.folderId).length?p.folderId:null
export function validateLibraryName(S,name,parentId,except){
 const clean=String(name||'').trim()
 if(!clean||clean.length>120)throw new Error('Enter a name of 1 to 120 characters')
 const key=clean.normalize('NFKC').toLocaleLowerCase()
 const entries=[...foldersOf(S).filter(f=>f.parentId===parentId),...plansOf(S).filter(p=>planFolder(S,p)===parentId)]
 if(entries.some(x=>x.id!==except&&x.name.normalize('NFKC').toLocaleLowerCase()===key))throw new Error('This name already exists in this folder')
 return clean
}
export function savePlanFolder(S,name,parentId,id=uid()){
 if(categoryIds.has(id))throw new Error('Initial categories cannot be changed')
 if(!folderPath(S,parentId).length)throw new Error('Choose a category or subfolder')
 if(folderPath(S,parentId).some(f=>f.id===id))throw new Error('A folder cannot contain itself or its descendants')
 const clean=validateLibraryName(S,name,parentId,id)
 S.trainingFolders={...(S.trainingFolders||{}),[id]:{name:clean,parentId}};return id
}
export function removePlanFolder(S,id){
 if(categoryIds.has(id))throw new Error('Initial categories cannot be changed')
 if(foldersOf(S).some(f=>f.parentId===id)||plansOf(S).some(p=>p.folderId===id))throw new Error('Move all subfolders and plans before deleting this folder')
 delete S.trainingFolders?.[id]
}
export function movePlan(S,id,folderId){
 const p=S.trainingPlans?.[id];if(!p)throw new Error('Plan unavailable')
 if(folderId&&!folderPath(S,folderId).length)throw new Error('Folder unavailable')
 validateLibraryName(S,p.name,folderId,id)
 S.trainingPlans[id]={...p,folderId}
}
