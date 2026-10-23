import {deleteRoutine} from './routines.js'
// Only opaque routine IDs/tombstones enter personal state; active workout and history stay intact.
export function applyAssignmentRetirements(state, rows, now=Date.now()){
 let changed=false
 for(const row of rows||[]){const id=row.id||row.routineId;if(!/^cr_[a-f0-9]{32}$/.test(id||''))continue
  const present=(state.routines||[]).some(r=>r.id===id)
  if(!present&&state.deleted?.routines?.[id]>0)continue
  deleteRoutine(state,id)
  for(const [day,rows] of Object.entries(state.dayPlan||{}))if(Array.isArray(rows)&&rows.includes(id)){const kept=rows.filter(value=>value!==id);if(kept.length)state.dayPlan[day]=kept;else delete state.dayPlan[day]}
  if(Array.isArray(state.rotation?.sequence))state.rotation.sequence=state.rotation.sequence.filter(value=>value!==id)
  if(Array.isArray(state.queue?.ids))state.queue.ids=state.queue.ids.filter(value=>value!==id)
  state.deleted||={};state.deleted.routines||={};state.deleted.routines[id]=Math.max(now,Number(row.at)||0)
  changed=true
 }
 return changed
}
