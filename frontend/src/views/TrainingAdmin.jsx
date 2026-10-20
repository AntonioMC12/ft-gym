import {useEffect,useState} from 'react'
import {Navigate,useNavigate,useSearchParams} from 'react-router-dom'
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {centersMe} from '../lib/centers-api.js'
import {navBack} from '../lib/nav.js'
import {plansOf,planOf} from '../lib/training-plans.js'
import {t} from '../lib/i18n.js'
import {Button,Section,SelectRow} from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import {Routines} from './Plan.jsx'
import RoutineEdit from './RoutineEdit.jsx'
import TrainingAssignments from '../components/TrainingAssignments.jsx'
import CenterWorkspace from './centers/CenterWorkspace.jsx'
import CenterNavigationGuard,{useCenterNavigation} from './centers/NavigationGuard.jsx'
import ConfigPending from './centers/ConfigPending.jsx'

function Content({edit}){
 const nav=useNavigate(),[params,setParams]=useSearchParams(),requestNavigation=useCenterNavigation()
 const S=useStore(s=>s.S),update=useStore(s=>s.update)
 const options=[{value:'library',label:t('Routines')},{value:'assign',label:t('Send plan')},{value:'tracking',label:t('Members with routines')},{value:'proposals',label:t('Sent proposals')},{value:'accounts',label:t('Pending activations')}]
 const pane=edit?'library':options.some(o=>o.value===params.get('pane'))?params.get('pane'):'library'
 const rawPlan=params.has('plan')?params.get('plan')||null:'*'
 const planId=rawPlan&&rawPlan!=='*'&&!S.trainingPlans?.[rawPlan]?null:rawPlan
 const plan=plansOf(S).find(p=>p.id===planId)
 const routineIds=S.routines.filter(r=>(planId==='*'||planOf(S,r)===planId)&&r.ex?.length).map(r=>r.id)
 const go=p=>requestNavigation(()=>{if(edit){nav('/training-admin?'+new URLSearchParams({pane:p}));return}const next=new URLSearchParams(params);next.set('pane',p);setParams(next)})
 const selectPlan=id=>{const next=new URLSearchParams(params);if(id==='*')next.delete('plan');else next.set('plan',id||'');setParams(next,{replace:true})}
 const assign=id=>requestNavigation(()=>{const next=new URLSearchParams(params);next.set('pane','assign');if(id==='*')next.delete('plan');else next.set('plan',id||'');setParams(next)})
 return <div className="narrow centers-page training-admin-page">
  <div className="hdr"><button className="iconbtn" aria-label={t('Back')} onClick={()=>requestNavigation(()=>navBack('/home',nav))}><Icon name="chevronLeft"/></button><h1>{t('Manage routines')}</h1></div>
  <nav className="centers-navigation"><Button icon="house" onClick={()=>requestNavigation(()=>nav('/home'))}>{t('Home')}</Button><Button icon="list" onClick={()=>requestNavigation(()=>nav('/centers'))}>{t('Centers')}</Button></nav>
  <CenterWorkspace label={t('Manage routines')} options={options} value={pane} onChange={go}>
   {pane==='library'&&(edit?<RoutineEdit basePath="/training-admin"/>:<Routines S={S} update={update} nav={nav} management initialPlanId={planId} onPlanChange={selectPlan} onAssign={assign} basePath="/training-admin"/>)}
   {pane!=='library'&&(pane==='assign'&&!routineIds.length?<Section title={t('Send plan')}><div className="centers-form"><p>{t('No routines yet.')}</p><Button onClick={()=>go('library')}>{t('Routines')}</Button></div></Section>:<TrainingAssignments routineIds={routineIds} planName={plan?.name||''} mode={pane} onManageAccounts={()=>go('accounts')} planPicker={<SelectRow variant="field" title={t('Training plans')} value={planId??''} options={[{value:'*',label:t('All routines')},{value:'',label:t('Unfiled')},...plansOf(S).map(p=>({value:p.id,label:p.name}))]} onChange={id=>selectPlan(id||null)}/>}/>)}
  </CenterWorkspace>
 </div>
}

// Verify the current account with the server before mounting any administration UI.
// user.admin grants technical administration, not this platform capability.
export default function TrainingAdmin({edit=false}){
 const user=useStore(s=>s.user),config=useStore(s=>s.config),state=useCenters(),nav=useNavigate()
 const [verified,setVerified]=useState(null),[retry,setRetry]=useState(0)
 useEffect(()=>{
  if(!user||!config?.centers?.enabled)return
  let current=true;const uid=user.id;setVerified(null)
  centersMe().then(result=>{if(current&&useStore.getState().user?.id===uid)setVerified({uid,allowed:result.platformCapabilities?.includes('centers.manage')===true})}).catch(error=>{if(current&&useStore.getState().user?.id===uid)setVerified({uid,error})})
  return()=>{current=false}
 },[user?.id,config?.centers?.enabled,retry])
 if(!user)return <Navigate to="/home" replace/>
 if(config==null)return <ConfigPending title="Manage routines"/>
 if(!config.centers?.enabled)return <Navigate to="/home" replace/>
 if(verified?.uid===user.id&&!verified.error&&!verified.allowed)return <Navigate to="/home" replace/>
 if(verified?.uid!==user.id||verified.error||state.ownerUid!==user.id||state.status!=='ready')return <div className="narrow centers-page"><h1>{t('Manage routines')}</h1><p role={verified?.error?'alert':'status'}>{t(verified?.error?'Centers are unavailable. Try again.':'Loading centers')}</p><Button onClick={()=>{setRetry(n=>n+1);useCenters.getState().load(user.id)}}>{t('Reload centers')}</Button><Button onClick={()=>navBack('/home',nav)}>{t('Back')}</Button></div>
 if(!state.platformCapabilities.includes('centers.manage'))return <Navigate to="/home" replace/>
 return <CenterNavigationGuard key={user.id} contextKey={user.id}><Content edit={edit}/></CenterNavigationGuard>
}
