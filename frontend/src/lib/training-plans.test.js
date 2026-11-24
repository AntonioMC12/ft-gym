import {it,expect} from 'vitest'
import {createTrainingPlan,removeTrainingPlan,moveRoutineToPlan,planOf,stateForPlan,initializePlanFolders,savePlanFolder,removePlanFolder,foldersOf,folderPath,planFolder,memberTrainingPlanId,createMemberRoutine} from './training-plans.js'
import {stampEdits,mergeStates} from './sync-merge.js'
it('organizes without copying routines, changing schedules or deleting workout history',()=>{
 const s={routines:[{id:'r',name:'Torso',ex:[]}],week:{1:['r']},workouts:[{id:'w',routineId:'r'}]};createTrainingPlan(s,'Fuerza','p');expect(moveRoutineToPlan(s,'r','p')).toBe(true);expect(s.routines).toHaveLength(1);expect(stateForPlan(s,'p').week).toEqual({1:['r']});removeTrainingPlan(s,'p');expect(planOf(s,s.routines[0])).toBeNull();expect(s.week).toEqual({1:['r']});expect(s.workouts[0].routineId).toBe('r')
})
it('converges independent plan edits and does not resurrect a deleted folder from a stale device',()=>{
 const base={_ts:1,routines:[],workouts:[],trainingPlans:{}};const a=structuredClone(base),b=structuredClone(base);createTrainingPlan(a,'A','a');createTrainingPlan(b,'B','b');stampEdits(base,a,10);stampEdits(base,b,20);a._ts=10;b._ts=20;const merged=mergeStates(a,b);expect(Object.keys(merged.trainingPlans).sort()).toEqual(['a','b']);const gone=structuredClone(merged);removeTrainingPlan(gone,'a');stampEdits(merged,gone,30);gone._ts=30;expect(mergeStates(gone,a).trainingPlans.a).toBeUndefined()
})
it('old and dangling plan references are Unfiled and cannot point to an absent plan',()=>{const s={routines:[{id:'r',planId:'gone'}]};expect(planOf(s,s.routines[0])).toBeNull();expect(moveRoutineToPlan(s,'r','missing')).toBe(false)})
it('keeps custom categories, nested folders and their plans after reload and initialization',()=>{
 const s={};initializePlanFolders(s);savePlanFolder(s,'Fuerza',null,'strength');savePlanFolder(s,'Inicio','strength','beginner');createTrainingPlan(s,'Semana 1','p','beginner')
 const reloaded=JSON.parse(JSON.stringify(s));initializePlanFolders(reloaded)
 expect(foldersOf(reloaded).filter(f=>f.category)).toHaveLength(6)
 expect(folderPath(reloaded,'beginner').map(f=>f.id)).toEqual(['strength','beginner'])
 expect(planFolder(reloaded,reloaded.trainingPlans.p)).toBe('beginner')
 expect(foldersOf(reloaded).find(f=>f.id==='strength').initial).toBe(false)
})
it('validates custom category names and protects occupied and initial categories',()=>{
 const s={};initializePlanFolders(s);savePlanFolder(s,'Fuerza',null,'strength')
 expect(()=>savePlanFolder(s,' fuerza ',null,'duplicate')).toThrow('This name already exists')
 expect(()=>savePlanFolder(s,' ',null,'empty')).toThrow('Enter a name')
 savePlanFolder(s,'Rehabilitación',null,'strength');savePlanFolder(s,'Inicio','strength','beginner')
 expect(()=>removePlanFolder(s,'strength')).toThrow('Move all subfolders and plans')
 removePlanFolder(s,'beginner');createTrainingPlan(s,'Semana 1','p','strength')
 expect(()=>removePlanFolder(s,'strength')).toThrow('Move all subfolders and plans')
 removeTrainingPlan(s,'p');removePlanFolder(s,'strength');expect(s.trainingFolders.strength).toBeUndefined()
 expect(()=>savePlanFolder(s,'Renamed',null,'category-men')).toThrow('Initial categories')
 expect(()=>removePlanFolder(s,'category-men')).toThrow('Initial categories')
})
it('moves custom categories and folders between levels while rejecting cycles and missing parents',()=>{
 const s={};initializePlanFolders(s);savePlanFolder(s,'Fuerza',null,'strength');savePlanFolder(s,'Inicio','strength','beginner')
 expect(()=>savePlanFolder(s,'Fuerza','beginner','strength')).toThrow('A folder cannot contain itself')
 expect(()=>savePlanFolder(s,'Fuerza','missing','strength')).toThrow('Choose a category or subfolder')
 savePlanFolder(s,'Fuerza','category-men','strength');expect(folderPath(s,'beginner').map(f=>f.id)).toEqual(['category-men','strength','beginner'])
 expect(foldersOf(s).find(f=>f.id==='strength').category).toBe(false)
 savePlanFolder(s,'Fuerza',null,'strength');expect(folderPath(s,'beginner').map(f=>f.id)).toEqual(['strength','beginner'])
})
it('synchronizes custom categories per ID without resurrecting a deleted category',()=>{
 const base={_ts:1,routines:[],workouts:[],trainingFolders:{}};initializePlanFolders(base)
 const a=structuredClone(base),b=structuredClone(base);savePlanFolder(a,'Fuerza',null,'strength');savePlanFolder(b,'Rehabilitación',null,'rehab')
 stampEdits(base,a,10);stampEdits(base,b,20);a._ts=10;b._ts=20
 const merged=mergeStates(a,b);expect(folderPath(merged,'strength')).toHaveLength(1);expect(folderPath(merged,'rehab')).toHaveLength(1)
 const gone=structuredClone(merged);removePlanFolder(gone,'strength');stampEdits(merged,gone,30);gone._ts=30
 expect(mergeStates(gone,a).trainingFolders.strength).toBeUndefined()
})
it('keeps a member’s drafts in one unorganized plan and separates namesakes',async()=>{
 const s={routines:[]},name='Bruno Pruebas'
 const planId=await memberTrainingPlanId('center','bruno')
 const otherId=await memberTrainingPlanId('other-center','bruno')
 createMemberRoutine(s,{planId,memberName:name,routineName:'Rutina',routineId:'first'})
 createMemberRoutine(s,{planId,memberName:name,routineName:'Rutina',routineId:'second'})
 createMemberRoutine(s,{planId:otherId,memberName:name,routineName:'Rutina',routineId:'other'})
 expect(await memberTrainingPlanId('center','bruno')).toBe(planId)
 expect(s.trainingPlans).toEqual({[planId]:{name,folderId:null},[otherId]:{name:name+' (2)',folderId:null}})
 expect(s.routines.map(row=>[row.id,row.planId])).toEqual([['first',planId],['second',planId],['other',otherId]])
})
