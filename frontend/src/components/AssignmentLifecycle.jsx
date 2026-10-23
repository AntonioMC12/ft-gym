import {useEffect} from 'react'
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {api} from '../lib/api.js'
import {applyAssignmentRetirements} from '../lib/assignment-lifecycle.js'

export default function AssignmentLifecycle(){
 const uid=useStore(s=>s.user?.id),server=useStore(s=>s.sync?.server||''),ready=useStore(s=>s.ready),centers=useCenters()
 const ids=centers.ownerUid===uid&&centers.status==='ready'?centers.centers.filter(c=>c.capabilities?.includes('membership.own.read')).map(c=>c.id):[]
 const scope=JSON.stringify(ids.sort())
 useEffect(()=>{if(!uid||!ready||!ids.length)return;let alive=true,pending=false
  const current=()=>alive&&useStore.getState().user?.id===uid&&(useStore.getState().sync?.server||'')===server
  const refresh=async()=>{if(pending||document.visibilityState==='hidden')return;pending=true
   try{
    await useStore.getState().pushState();if(!current())return
    for(const centerId of ids){const result=await api('/api/centers/own/training/lifecycle',{method:'POST',body:JSON.stringify({centerId})});if(!current())return
     if(result.retirements?.some(r=>(useStore.getState().S.routines||[]).some(x=>x.id===r.id)||!(useStore.getState().S.deleted?.routines?.[r.id]>0)))useStore.getState().update(s=>{applyAssignmentRetirements(s,result.retirements)})
    }
   }catch{/* Offline/access errors never remove local routines; retry on online/focus. */}finally{pending=false}
  }
  refresh();window.addEventListener('online',refresh);window.addEventListener('focus',refresh);const timer=setInterval(refresh,15000)
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('online',refresh);window.removeEventListener('focus',refresh)}
 },[uid,server,ready,scope])
 return null
}
