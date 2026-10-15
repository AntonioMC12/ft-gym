import {useEffect,useRef,useState} from 'react'
import {Section,Row,Button,Switch,TextField,NumberField} from '../../components/ui.jsx'
import CameraScan from '../../components/CameraScan.jsx'
import {canRenderFmt} from '../../lib/qr.js'
import {scanCode} from '../../lib/scan.js'
import {MOBILE} from '../../lib/mobile.js'
import {centerAccess,centerAccessVisits,centerCommand,consumeCenterAccess,accessErrorKey} from '../../lib/centers-api.js'
import {centerDateTime} from '../../lib/center-time.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {useUI} from '../../store/useUI.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {confirmSheet} from '../../sheets.jsx'
import {t} from '../../lib/i18n.js'

export default function AccessPanel({centerId,ownerUid,active=true,canManage=false,canVerify=false,timezone='UTC'}){
  const [data,setData]=useState(null),[draft,setDraft]=useState(null),[deviceName,setDeviceName]=useState(''),[paired,setPaired]=useState(null),[code,setCode]=useState(''),[result,setResult]=useState(null)
  const [visits,setVisits]=useState([]),[visitCursor,setVisitCursor]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[revision,setRevision]=useState(0)
  const life=useRef(0),pending=useRef(false),intent=useRef(null),scanIntent=useRef(null),camera=useRef(null)
  const current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  const failure=e=>{setError(e);if(['access-device-invalid','access-device-changed'].includes(e?.data?.code||e?.code))setPaired(null);useCenters.getState().revokeOn(e)}
  useEffect(()=>{setPaired(null);setCode('');setResult(null);setDeviceName('');return()=>{camera.current?.close();camera.current=null}},[centerId,ownerUid,active,canManage,canVerify])
  useEffect(()=>{
    const epoch=++life.current;pending.current=true;setBusy(true);setData(null);setDraft(null);setVisits([]);setVisitCursor(null);setError(null);setResult(null);setCode('')
    Promise.all([centerAccess(centerId),centerAccessVisits(centerId)]).then(([info,page])=>{if(current(epoch)){setData(info);setDraft(info.policy);setVisits(page.visits);setVisitCursor(page.nextCursor)}}).catch(e=>{if(current(epoch))failure(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{life.current++;pending.current=false;camera.current?.close();camera.current=null}
  },[centerId,ownerUid,active,canManage,canVerify,revision])
  const command=async(kind,body,epoch)=>{
    if(!current(epoch)||pending.current||!canManage||(!active&&kind!=='devices/revoke'))return;pending.current=true;setBusy(true);setError(null)
    const path='/api/centers/access/'+kind,signature=JSON.stringify([path,body]);if(intent.current?.signature!==signature)intent.current={signature,id:crypto.randomUUID()};const used=intent.current
    try{
      const reply=await centerCommand(path,{...body,requestId:used.id});if(intent.current===used)intent.current=null;if(!current(epoch))return
      if(reply.credential)setPaired({id:reply.device.id,version:reply.device.version,key:reply.credential,centerId,ownerUid})
      if(kind==='devices/revoke'&&paired?.id===body.id)setPaired(null)
      setRevision(n=>n+1)
    }catch(e){if(current(epoch))failure(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const save=()=>{
    const epoch=life.current;if(!draft||!data||!canManage||!active||pending.current)return
    if(!Number.isSafeInteger(draft.graceDays)||draft.graceDays<0||draft.graceDays>365){failure({code:'invalid-access-policy'});return}
    const body={centerId,version:data.version,policy:{...draft}}
    confirmSheet({title:t('Access rules'),message:t('Recheck opening hours, contracts and manual holds before enabling access.'),confirmText:t('Save'),onConfirm:()=>command('policy',body,epoch)})
  }
  const device=(kind,row)=>{
    const epoch=life.current,body=kind==='create'?{centerId,name:deviceName.trim()}:{centerId,id:row.id,version:row.version}
    if(!canManage||pending.current||kind==='create'&&!body.name)return
    confirmSheet({title:t(kind==='create'?'Register reception device':kind==='rotate'?'Activate reception here':'Revoke reception device'),message:kind==='rotate'?t('The previous device key stops working. This page keeps the new key only in memory.'):(row?.name||body.name),confirmText:t('Continue'),danger:kind==='revoke',onConfirm:()=>command('devices/'+kind,body,epoch)})
  }
  const reception=paired?.centerId===centerId&&paired?.ownerUid===ownerUid&&useStore.getState().user?.id===ownerUid&&active&&canVerify?paired:null
  const consume=async(value,receiver=reception,epoch=life.current)=>{
    if(!current(epoch)||pending.current||!receiver||!canVerify||!active)return
    const token=String(value||'').trim();if(!/^gqr1_[A-Za-z0-9_-]{43}$/.test(token)){failure({code:'invalid-input'});return}
    pending.current=true;setBusy(true);setError(null);setResult(null)
    const signature=JSON.stringify([centerId,receiver.id,token]);if(scanIntent.current?.signature!==signature)scanIntent.current={signature,id:crypto.randomUUID()};const used=scanIntent.current
    try{
      const reply=await consumeCenterAccess({centerId,deviceId:receiver.id,token,requestId:used.id},receiver.key);if(scanIntent.current===used)scanIntent.current=null;if(!current(epoch))return
      setCode('');setResult(reply)
      if(reply.admitted===true&&reply.replayed===false){const page=await centerAccessVisits(centerId);if(current(epoch)){setVisits(page.visits);setVisitCursor(page.nextCursor)}}
    }catch(e){if(current(epoch))failure(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const scan=async()=>{
    if(!reception||pending.current)return;const epoch=life.current,receiver=reception
    if(!MOBILE){
      camera.current?.close();let handle
      handle=useUI.getState().openSheet(close=><CameraScan
        onCancel={()=>{close();if(camera.current===handle)camera.current=null}}
        onFound={found=>{close();if(camera.current===handle)camera.current=null;if(current(epoch)&&canRenderFmt(found.fmt))consume(found.value,receiver,epoch);else if(current(epoch))failure({code:'invalid-input'})}}/>)
      camera.current=handle;return
    }
    pending.current=true;setBusy(true)
    try{const found=await scanCode();if(!current(epoch))return;pending.current=false;setBusy(false);if(found){if(!canRenderFmt(found.fmt))failure({code:'invalid-input'});else await consume(found.value,receiver,epoch)}}catch(e){if(current(epoch))failure(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const moreDevices=async()=>{
    if(!data?.nextCursor||pending.current)return;const epoch=life.current;pending.current=true;setBusy(true)
    try{const next=await centerAccess(centerId,{cursor:data.nextCursor});if(current(epoch))setData(old=>({...next,devices:[...old.devices,...next.devices]}))}catch(e){if(current(epoch))failure(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const moreVisits=async()=>{
    if(!visitCursor||pending.current)return;const epoch=life.current;pending.current=true;setBusy(true)
    try{const next=await centerAccessVisits(centerId,{cursor:visitCursor});if(current(epoch)){setVisits(old=>[...old,...next.visits]);setVisitCursor(next.nextCursor)}}catch(e){if(current(epoch))failure(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const deviceMore=useAutoMore(moreDevices),visitMore=useAutoMore(moreVisits)
  return <><Section title={t('Access rules')}><div className="centers-form">
    {draft&&<>
      {['enabled','requireSubscription','denyOverdue'].map((key,index)=><Row key={key} title={t(['Enable center access','Require a current subscription','Deny entry for overdue debt'][index])} value={<Switch checked={draft[key]} aria-label={t(['Enable center access','Require a current subscription','Deny entry for overdue debt'][index])} disabled={busy||!canManage||!active} onChange={value=>{if(canManage&&active&&!busy)setDraft(old=>({...old,[key]:value}))}}/>}/>)}
      <label className="centers-field"><span>{t('Access debt grace (days)')}</span><NumberField className="field" value={draft.graceDays} decimal={false} disabled={busy||!canManage||!active} onChange={value=>setDraft(old=>({...old,graceDays:value}))}/></label>
      {canManage&&<Button disabled={busy||!active} onClick={save}>{t('Save')}</Button>}
    </>}
    {busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(accessErrorKey(error))}</p>}
    <Button disabled={busy} onClick={()=>setRevision(n=>n+1)}>{t('Reload centers')}</Button>
  </div></Section>
  <Section title={t('Reception devices')}><div className="centers-form">
    {canManage&&active&&<><label className="centers-field"><span>{t('Device name')}</span><TextField value={deviceName} onChange={e=>setDeviceName(e.target.value)} maxLength={80} disabled={busy}/></label><Button disabled={busy||!deviceName.trim()} onClick={()=>device('create')}>{t('Register reception device')}</Button></>}
    {data?.devices.map(row=><div key={row.id}><Row title={row.name} subtitle={t('Device key expiry')+': '+centerDateTime(row.expiresAt,timezone)} value={row.revokedAt?t('Reception device revoked'):''}/>{canManage&&!row.revokedAt&&<div className="centers-actions"><Button disabled={busy||!active} onClick={()=>device('rotate',row)}>{t('Activate reception here')}</Button><Button disabled={busy} onClick={()=>device('revoke',row)}>{t('Revoke reception device')}</Button></div>}</div>)}
    {data?.nextCursor&&<Button ref={deviceMore} disabled={busy} onClick={moreDevices}>{t('Show more')}</Button>}
  </div></Section>
  {reception&&<Section title={t('Reception')}><div className="centers-form"><p className="small muted">{t('Reception is active on this page. Reloading requires activation again.')}</p>
    <Button disabled={busy} onClick={scan}>{t('Scan access QR')}</Button>
    <form onSubmit={e=>{e.preventDefault();consume(code)}} className="centers-form"><label className="centers-field"><span>{t('Access QR')}</span><TextField value={code} onChange={e=>setCode(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy}/></label><Button type="submit" disabled={busy||!code.trim()}>{t('Validate entry')}</Button></form>
    {result&&<p role="status">{t(result.replayed?'This entry was already recorded.':result.admitted?'Entry verified':'Entry denied')}{result.admitted===true&&result.replayed===false&&result.member?' · '+result.member.name+' · '+result.member.number:''}</p>}
  </div></Section>}
  <Section title={t('Verified visits')}><div className="centers-form">{visits.map(visit=><Row key={visit.id} title={centerDateTime(visit.visitedAt,timezone)}/>)}{visitCursor&&<Button ref={visitMore} disabled={busy} onClick={moreVisits}>{t('Show more')}</Button>}</div></Section></>
}
