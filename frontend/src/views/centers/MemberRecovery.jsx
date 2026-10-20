import {useState,useEffect} from 'react'
import {useStore} from '../../store/useStore.js'
import {api} from '../../lib/api.js'
import {t,dateLocale} from '../../lib/i18n.js'
import {Button,Section} from '../../components/ui.jsx'
import {confirmSheet} from '../../sheets.jsx'

export default function MemberRecovery({centerId,memberId,ownerUid}){
 const [busy,setBusy]=useState(false),[result,setResult]=useState(null),[error,setError]=useState(false)
 useEffect(()=>{setResult(null);setError(false)},[centerId,memberId,ownerUid])
 const scope=ownerUid+':'+centerId+':'+memberId,visibleResult=result?.scope===scope?result:null
 const issue=()=>confirmSheet({title:t('Recover member account'),message:t('Verify the member’s identity in person before continuing. This ends their current sessions and replaces any previous recovery code.'),confirmText:t('Identity verified · generate code'),onConfirm:async()=>{
  if(useStore.getState().user?.id!==ownerUid)return
  setBusy(true);setResult(null);setError(false)
  try{const value=await api('/api/centers/members/recovery',{method:'POST',body:JSON.stringify({centerId,memberId,confirmed:true})});if(useStore.getState().user?.id===ownerUid)setResult({...value,scope})}catch{if(useStore.getState().user?.id===ownerUid)setError(true)}finally{setBusy(false)}
 }})
 if(useStore(s=>s.user?.id)!==ownerUid)return null
 return <Section title={t('Recover member account')}><div className="centers-form">
  <p className="dim small">{t('The member enters their DNI/NIE and this code to choose a new password. The manager never sees their password.')}</p>
  {visibleResult&&<div role="status" className="account-recovery-code"><strong>{visibleResult.code}</strong><p>{t('Expires at {0}',new Date(visibleResult.expires).toLocaleTimeString(dateLocale(),{hour:'2-digit',minute:'2-digit'}))}</p><p>{t('Give this code privately to the member. It can only be used once.')}</p></div>}
  {error&&<p role="alert">{t('Account recovery is unavailable. Staff accounts require platform support.')}</p>}
  <Button icon="key" disabled={busy} onClick={issue}>{t(visibleResult?'Generate another recovery code':'Generate recovery code')}</Button>
 </div></Section>
}
