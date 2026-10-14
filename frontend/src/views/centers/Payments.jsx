import {useEffect,useRef,useState} from 'react'
import {Section,Row,Button} from '../../components/ui.jsx'
import {centerPayments,ownCenterPayments,paymentsErrorKey} from '../../lib/centers-api.js'
import {minorToPrice} from '../../lib/membership-price.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {t} from '../../lib/i18n.js'
import ManualMovement,{paymentMethod} from './ManualMovement.jsx'

export default function Payments({centerId,memberId,ownerUid,revision=0,canRefund=false,today,changed,own=false}) {
  const [rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[selected,setSelected]=useState(null),[refund,setRefund]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null)
  const life=useRef(0),pending=useRef(false)
  const current=epoch=>epoch===life.current&&useStore.getState().user?.id===ownerUid
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  useEffect(()=>{
    const epoch=++life.current;pending.current=true;setBusy(true);setRows([]);setCursor(null);setSelected(null);setRefund(null);setError(null)
    const request=own?ownCenterPayments(centerId):centerPayments(centerId,memberId)
    request.then(result=>{if(current(epoch)){setRows(result.payments);setCursor(result.nextCursor)}}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{life.current++;pending.current=false}
  },[centerId,memberId,ownerUid,revision,canRefund,own])
  const more=async()=>{
    if(!cursor||pending.current)return;const epoch=life.current;pending.current=true;setBusy(true)
    try{const result=await (own?ownCenterPayments(centerId,{cursor}):centerPayments(centerId,memberId,{cursor}));if(current(epoch)){setRows(previous=>[...previous,...result.payments]);setCursor(result.nextCursor)}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const moreRef=useAutoMore(more)
  if(selected)return <Section title={t('Payment details')}><div className="centers-form">
    <Row title={selected.paidOn} subtitle={paymentMethod(selected.method)} value={minorToPrice(selected.amountMinor)+' '+selected.currency}/>{selected.reference&&<p>{selected.reference}</p>}
    <h3>{t('Applied to receipts')}</h3>{selected.allocations.map(a=><div key={a.receiptId}><Row title={a.periodStart?a.periodStart+' → '+a.periodEnd:a.receiptId} value={minorToPrice(a.amountMinor)+' '+selected.currency}/><Row title={t('Refunded amount')} value={minorToPrice(a.refundedMinor)+' '+selected.currency}/>{!own&&canRefund&&a.refundableMinor!=='0'&&<Button onClick={()=>setRefund(a)}>{t('Record refund')}</Button>}</div>)}
    {refund&&!own&&canRefund&&<ManualMovement centerId={centerId} memberId={memberId} receiptId={refund.receiptId} paymentId={selected.id} availableMinor={refund.refundableMinor} earliestOn={selected.paidOn} today={today} ownerUid={ownerUid} changed={changed} close={()=>setRefund(null)}/>}
    {!!selected.refunds.length&&<h3>{t('Refunds')}</h3>}{selected.refunds.map(row=><Row key={row.id} title={row.refundedOn} subtitle={row.reason} value={minorToPrice(row.amountMinor)+' '+selected.currency}/>)}{selected.refundsTruncated&&<p className="small muted">{t('Showing the latest 100 refunds.')}</p>}
    {!own&&<p className="small muted">{t('Manual record only. No money is transferred.')}</p>}<Button onClick={()=>{setSelected(null);setRefund(null)}}>{t('Back')}</Button>
  </div></Section>
  return <Section title={t('Payments')}><div className="centers-form">{rows.map(row=><Row key={row.id} title={row.paidOn} subtitle={paymentMethod(row.method)} value={minorToPrice(row.amountMinor)+' '+row.currency} accessory="chevron" onClick={()=>setSelected(row)}/>)}
    {!busy&&!rows.length&&!error&&<p className="muted">{t('No payments available')}</p>}{busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(paymentsErrorKey(error))}</p>}{cursor&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}
  </div></Section>
}
