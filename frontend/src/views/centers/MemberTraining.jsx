import {useEffect,useRef,useState} from 'react'
import {Button} from '../../components/ui.jsx'
import TrainingRoutineEditor from '../../components/TrainingRoutineEditor.jsx'
import {t} from '../../lib/i18n.js'
import {createMemberRoutine,memberTrainingPlanId} from '../../lib/training-plans.js'
import {useStore} from '../../store/useStore.js'
import {useCenterNavigation} from './NavigationGuard.jsx'
import TrainingProposals from './TrainingProposals.jsx'

export default function MemberTraining({centerId,member,ownerUid,active,onLinkAccount}){
 const [routineId,setRoutineId]=useState(null),[creating,setCreating]=useState(false),[error,setError]=useState(false)
 const alive=useRef(true),pending=useRef(false)
 const canCreate=active&&member.state==='active'
 const latest=useRef({canCreate,member})
 latest.current={canCreate,member}
 const navigate=useCenterNavigation()
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const create=async()=>{
  if(pending.current||!latest.current.canCreate)return
  pending.current=true
  setCreating(true)
  setError(false)
  try{
   const planId=await memberTrainingPlanId(centerId,member.id)
   const {user,update}=useStore.getState()
   if(!alive.current||!latest.current.canCreate||user?.id!==ownerUid)return
   let id
   update(state=>{id=createMemberRoutine(state,{planId,memberName:latest.current.member.name,routineName:t('New routine')})})
   setRoutineId(id)
  }catch{
   if(alive.current)setError(true)
  }finally{
   pending.current=false
   if(alive.current)setCreating(false)
  }
 }

 if(routineId&&active) return <TrainingRoutineEditor routineId={routineId} recipient={{centerId,member}}
  onClose={()=>navigate(()=>setRoutineId(null))} onOpenRoutine={setRoutineId}/>
 return <TrainingProposals centerId={centerId} member={member} ownerUid={ownerUid} canAssign
  active={active} onLinkAccount={onLinkAccount}
  createRoutineAction={canCreate&&<>
   <Button type="button" icon="plus" variant="tinted" disabled={creating} onClick={()=>navigate(create)}>{t('Create routine')}</Button>
   {error&&<p role="alert">{t('Could not create the routine. Try again.')}</p>}
  </>}/>
}
