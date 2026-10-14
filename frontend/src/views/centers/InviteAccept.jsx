import {useEffect,useRef,useState} from 'react'
import {useNavigate,useSearchParams} from 'react-router-dom'
import {Button,Section,Row} from '../../components/ui.jsx'
import {inspectCenterInvitation,acceptCenterInvitation,invitationErrorKey} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {t} from '../../lib/i18n.js'
import Login from '../Login.jsx'
import ConfigPending from './ConfigPending.jsx'

export default function InviteAccept() {
  const user=useStore(s=>s.user),config=useStore(s=>s.config),enabled=config?.centers?.enabled,[params]=useSearchParams(),navigate=useNavigate()
  const token=params.get('token')||'',[invite,setInvite]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(false),[accepted,setAccepted]=useState(false)
  const generation=useRef(0)
  useEffect(()=>{
    const epoch=++generation.current;let current=true;setInvite(null);setError(null);setAccepted(false);setBusy(false)
    if(!user||!enabled)return
    inspectCenterInvitation(token).then(result=>{if(current)setInvite(result.invite)}).catch(e=>{if(current)setError(e)})
    return()=>{current=false;if(generation.current===epoch)generation.current++}
  },[user?.id,enabled,token])
  if(!user)return <Login/>
  if(config==null)return <ConfigPending title="Accept invitation"/>
  const accept=async()=>{
    const epoch=generation.current;setBusy(true);setError(null)
    try{await acceptCenterInvitation(token);if(generation.current!==epoch||useStore.getState().user?.id!==user.id)return;setAccepted(true);await useCenters.getState().load(user.id)}catch(e){if(generation.current===epoch)setError(e)}finally{if(generation.current===epoch)setBusy(false)}
  }
  return <div className="narrow centers-page"><Section title={t('Accept invitation')}>
    {!enabled&&<p className="centers-form">{t('Invitation unavailable')}</p>}
    {invite&&<Row title={invite.centerName} subtitle={invite.kind==='manager'?t('Center manager'):invite.kind==='trainer'?t('Trainer'):t('Members')} value={user.name}/>}
    {error&&<p className="centers-form" role="alert">{t(invitationErrorKey(error))}</p>}
    {accepted?<div className="centers-form"><p>{t('Invitation accepted')}</p><Button onClick={()=>navigate(invite?.kind==='member'?'/centers/membership?'+new URLSearchParams({centerId:invite.centerId}):'/centers',{replace:true})}>{t(invite?.kind==='member'?'My centers':'Manage centers')}</Button></div>:
      invite&&<div className="centers-form">{invite.status==='accepted'?<p>{t('Invitation already accepted')}</p>:<Button variant="primary" disabled={busy} onClick={accept}>{t('Accept invitation')}</Button>}</div>}
    <Button onClick={()=>navigate('/home',{replace:true})}>{t('Home')}</Button>
  </Section></div>
}
