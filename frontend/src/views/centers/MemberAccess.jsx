import {useEffect,useRef,useState} from 'react'
import {Section,Row,Button,TextField} from '../../components/ui.jsx'
import {centerAccessMember,centerCommand,accessErrorKey} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {confirmSheet} from '../../sheets.jsx'
import {t} from '../../lib/i18n.js'

export default function MemberAccess({centerId,memberId,ownerUid,canManage=false}){
  const [data,setData]=useState(null),[reason,setReason]=useState(''),[error,setError]=useState(null),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0)
  const life=useRef(0),pending=useRef(false),intent=useRef(null)
  const current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  const failure=e=>{setError(e);useCenters.getState().revokeOn(e)}
  useEffect(()=>{setReason('')},[centerId,memberId,ownerUid])
  useEffect(()=>{
    const epoch=++life.current;pending.current=true;setBusy(true);setData(null);setError(null)
    centerAccessMember(centerId,memberId).then(result=>{if(current(epoch)){if(result.member?.id!==memberId)throw {status:404};setData(result)}}).catch(e=>{if(current(epoch))failure(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{life.current++;pending.current=false}
  },[centerId,memberId,ownerUid,canManage,revision])
  const mutate=()=>{
    if(!data||!canManage||pending.current)return;const epoch=life.current,hold=data.hold,path='/api/centers/access/holds/'+(hold?'release':'create'),body=hold?{centerId,memberId,id:hold.id,version:hold.version}:{centerId,memberId,memberVersion:data.member.version,reason:reason.trim()}
    if(!hold&&!body.reason)return
    confirmSheet({title:t(hold?'Release access hold':'Block access'),message:data.member.name+' · '+(hold?hold.reason:body.reason),confirmText:t(hold?'Release access hold':'Block access'),danger:!hold,onConfirm:async()=>{
      if(!current(epoch)||pending.current||!canManage)return;pending.current=true;setBusy(true);setError(null)
      const signature=JSON.stringify([path,body]);if(intent.current?.signature!==signature)intent.current={signature,id:crypto.randomUUID()};const used=intent.current
      try{await centerCommand(path,{...body,requestId:used.id});if(intent.current===used)intent.current=null;if(current(epoch)){setReason('');setRevision(n=>n+1)}}catch(e){if(current(epoch))failure(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
    }})
  }
  return <Section title={t('Manual access hold')}><div className="centers-form">
    <p className="small muted">{t('Payments do not remove a manual access hold.')}</p>
    {data&&<Row title={t('Center access')} value={t(data.allowed?'Access available':'Access unavailable')}/>}
    {data?.hold?<Row title={t('Manual access hold')} subtitle={data.hold.reason}/>:canManage&&<label className="centers-field"><span>{t('Reason')}</span><TextField value={reason} onChange={e=>setReason(e.target.value)} maxLength={250} disabled={busy}/></label>}
    {canManage&&data&&<Button disabled={busy||!data.hold&&!reason.trim()} onClick={mutate}>{t(data.hold?'Release access hold':'Block access')}</Button>}
    <Button disabled={busy} onClick={()=>setRevision(n=>n+1)}>{t('Reload centers')}</Button>
    {busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(accessErrorKey(error))}</p>}
  </div></Section>
}
