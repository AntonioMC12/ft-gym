import {lastEntryFor,modeOf} from './history.js'
import {isWarmupRow} from './workout-model.js'
const valid=v=>Number.isSafeInteger(v)&&v>0
// Only fresh input rows are cleared; saved workout editors never run through here.
export function blankRepRows(sets,cfg){
 if(modeOf(cfg)!=='reps')return sets
 const blank=row=>({...row,r:null,...(row.sides?{sides:Object.fromEntries(Object.entries(row.sides).map(([side,s])=>[side,blank(s)]))}:{}),...(row.drops?{drops:row.drops.map(blank)}:{}),...(row.clusters?{clusters:row.clusters.map(blank)}:{})})
 return sets.map(blank)
}
export function plannedRepReference(entry,index,side){
 const cfg=entry.target||{},planned=entry.planned||cfg,stride=side?2:1
 if(valid(planned.repsMin)&&valid(planned.reps)&&planned.repsMin<=planned.reps)return planned.repsMin/stride+'–'+planned.reps/stride
 const ordinal=(entry.sets||[]).slice(0,index).filter(s=>!isWarmupRow(s)).length
 const n=cfg.pyramid?.[ordinal]??cfg.rowReps?.[ordinal]??cfg.reps??planned.reps
 return valid(n)?String(n/stride):''
}
export function repReference(S,entry,index,side,path=[]){
 const last=lastEntryFor(S,entry.id,entry.rid),warm=isWarmupRow(entry.sets[index]),ordinal=entry.sets.slice(0,index).filter(s=>isWarmupRow(s)===warm).length
 const previous=last?.sets?.filter(s=>isWarmupRow(s)===warm)[ordinal],row=side?previous?.sides?.[side]:previous
 const actual=path.reduce((value,key)=>value?.[key],row)
 if(row?.done&&valid(actual?.r))return String(actual.r)
 return plannedRepReference(entry,index,side)
}
export const repsEntered=(row,side)=>{const s=side?row?.sides?.[side]:row;return typeof s?.r==='number'&&Number.isFinite(s.r)&&s.r>=0}

// Checking accepts the visible suggestion; a range uses its lower bound.
export function acceptRepReference(S,entry,index,side){
 const row=entry.sets[index],actual=side?row?.sides?.[side]:row
 if(!actual||repsEntered(row,side)||actual.done)return row
 const value=Number(repReference(S,entry,index,side).split('–')[0])
 if(!Number.isSafeInteger(value)||value<=0)return row
 return side?{...row,sides:{...row.sides,[side]:{...actual,r:value}}}:{...row,r:value}
}
