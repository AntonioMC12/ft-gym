import {useEffect,useRef,useState} from 'react'
import {Switch} from '../../components/ui.jsx'
import {centerCommand,centersErrorKey} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {confirmSheet} from '../../sheets.jsx'
import {t} from '../../lib/i18n.js'
export default function RoleCapabilityGrant({centerId,role,ownerUid,saved,capability='payments.refund'}) {
  const label=capability==='data.export'?'Allow debt exports':'Allow manual refunds',grantField=capability==='data.export'?'allowExport':'allowRefund'
  const active=!!role.extraCapabilities?.includes(capability),life=useRef(0),pending=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState(null)
  const current=epoch=>epoch===life.current&&useStore.getState().user?.id===ownerUid
  useEffect(()=>{life.current++;pending.current=false;setBusy(false);setError(null);return()=>{life.current++;pending.current=false}},[centerId,role.id,role.version,ownerUid,capability])
  const change=allowRefund=>{
    const epoch=life.current,body={centerId,assignmentId:role.id,version:role.version,[grantField]:allowRefund,requestId:crypto.randomUUID()}
    confirmSheet({title:t(allowRefund?'Grant permission':'Remove permission'),message:role.accountUid+' · '+t(label),confirmText:t(allowRefund?'Grant permission':'Remove permission'),onConfirm:async()=>{
      if(!current(epoch)||pending.current)return;pending.current=true;setBusy(true);setError(null)
      try{await centerCommand('/api/platform/centers/role-capabilities',body);if(current(epoch))saved?.()}
      catch(e){if(current(epoch)){setError(e);useCenters.getState().revokeOn(e)}}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
    }})
  }
  return <div><label className="centers-actions"><span>{t(label)}</span><Switch type="button" aria-label={t(label)} checked={active} disabled={busy} onChange={change}/></label>{error&&<p role="alert">{t(centersErrorKey(error))}</p>}</div>
}
