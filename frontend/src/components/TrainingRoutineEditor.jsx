import {useEffect,useRef,useState} from 'react'
import {useStore} from '../store/useStore.js'
import RoutineEdit from '../views/RoutineEdit.jsx'
import TrainingAssignments from './TrainingAssignments.jsx'

export default function TrainingRoutineEditor({routineId,recipient,onClose,onOpenRoutine}){
 const [sending,setSending]=useState(false)
 const sendPanel=useRef(null)
 const routine=useStore(s=>s.S.routines.find(row=>row.id===routineId))
 useEffect(()=>{if(sending)sendPanel.current?.focus()},[sending])
 if(sending&&routine?.ex.length) return <div ref={sendPanel} tabIndex={-1}>
  <TrainingAssignments mode="routine" routineIds={[routineId]} planName={routine.name}
   recipient={recipient} onClose={()=>setSending(false)}/>
 </div>
 return <RoutineEdit key={routineId} basePath="/training-admin" routineId={routineId}
  onClose={onClose} onOpenRoutine={onOpenRoutine} onSend={()=>setSending(true)}/>
}
