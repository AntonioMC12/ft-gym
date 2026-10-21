import {useEffect,useRef,useState} from 'react'
import {Section,Row,Button,TextField} from '../../components/ui.jsx'
import {ownCenterNotifications,centerCommand,notificationErrorKey} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {t} from '../../lib/i18n.js'
export default function OwnNotifications({centerId,ownerUid,active=true}) {
  const [data,setData]=useState(null),[email,setEmail]=useState(''),[token,setToken]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(null),[revision,setRevision]=useState(0)
  const life=useRef(0),pending=useRef(false),retry=useRef(null),current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  useEffect(()=>{
    const epoch=++life.current;pending.current=true;retry.current=null;setBusy(true);setData(null);setError(null);setToken('')
    ownCenterNotifications(centerId).then(result=>{if(current(epoch)){setData(result);setEmail(result.contact.email||'')}}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{life.current++;pending.current=false}
  },[centerId,ownerUid,active,revision])
  const command=async(action,body)=>{
    if(pending.current||!data)return;const epoch=life.current;pending.current=true;setBusy(true);setError(null)
    const path='/api/centers/own/notifications/'+action,content={centerId,...body},signature=JSON.stringify([path,content]);if(retry.current?.signature!==signature)retry.current={signature,id:crypto.randomUUID()}
    try{await centerCommand(path,{...content,requestId:retry.current.id});if(current(epoch))setRevision(value=>value+1)}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const ready=!!data&&data.transport!=='off'&&active
  return <Section title={t('Email notices')}><div className="centers-form">
    {data&&<>
      {data.transport==='off'?<p role="status">{t('Email notices are not configured.')}</p>:data.transport==='test-capture'&&<p role="status">{t('Local test: no emails are sent.')}</p>}
      <Row title={t('Verified notice email')} value={t(data.contact.verified?'Yes':'No')}/>
      <Row title={t('Email notices')} value={t(data.contact.enabled?'On':'Off')}/>
      <form onSubmit={e=>{e.preventDefault();command('request',{email:email.trim()})}}><label className="centers-field"><span>{t('Notice email')}</span><TextField type="email" maxLength={254} value={email} disabled={busy||!ready} onChange={e=>setEmail(e.target.value)}/></label><Button type="submit" disabled={busy||!ready||!email.trim()}>{t('Request verification code')}</Button></form>
      {data.contact.email&&!data.contact.verified&&<form onSubmit={e=>{e.preventDefault();command('verify',{token:token.trim()})}}><label className="centers-field"><span>{t('Verification code')}</span><TextField maxLength={64} value={token} disabled={busy||!ready} autoComplete="one-time-code" onChange={e=>setToken(e.target.value)}/></label><Button type="submit" disabled={busy||!ready||!/^[a-f0-9]{64}$/.test(token.trim())}>{t('Verify notice email')}</Button></form>}
      {(data.contact.enabled||data.contact.email&&!data.contact.verified)&&<Button disabled={busy} onClick={()=>command('disable',{version:data.contact.version})}>{t('Disable notices')}</Button>}
    </>}
    {error&&<p role="alert">{t(notificationErrorKey(error))}</p>}
  </div></Section>
}
