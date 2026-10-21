import {useEffect,useRef,useState} from 'react'
import {Button,TextField,TextArea,SelectRow} from '../../components/ui.jsx'
import {centerCommand,paymentsErrorKey} from '../../lib/centers-api.js'
import {priceToMinor,minorToPrice} from '../../lib/membership-price.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {useUI} from '../../store/useUI.js'
import {confirmSheet} from '../../sheets.jsx'
import {t} from '../../lib/i18n.js'

const methods=['cash','bank-transfer','card','other']
export const paymentMethod=method=>method==='cash'?t('Cash'):method==='bank-transfer'?t('Bank transfer'):method==='card'?t('Card'):t('Other')
// The same form is used for recording a received payment and a manual refund.
export default function ManualMovement({centerId,memberId,receiptId,paymentId,availableMinor,today,earliestOn,ownerUid,changed,close}) {
  const refund=!!paymentId,title=refund?'Record refund':'Record payment'
  const [amount,setAmount]=useState(()=>minorToPrice(availableMinor)),[date,setDate]=useState(today||''),[method,setMethod]=useState('cash'),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(null)
  const life=useRef(0),pending=useRef(false),intent=useRef(null)
  const current=epoch=>epoch===life.current&&useStore.getState().user?.id===ownerUid
  useEffect(()=>{life.current++;setAmount(minorToPrice(availableMinor));setDate(today||'');setMethod('cash');setNote('');setBusy(false);setError(null);intent.current=null;pending.current=false;return()=>{life.current++;pending.current=false}},[centerId,memberId,receiptId,paymentId,ownerUid,availableMinor,today])
  const edit=(setter,value)=>{intent.current=null;setter(value)}
  const submit=e=>{
    e.preventDefault();if(pending.current)return;setError(null)
    let amountMinor;try{amountMinor=priceToMinor(amount,{maxMinor:'999999999999999'});if(BigInt(amountMinor)<=0n||BigInt(amountMinor)>BigInt(availableMinor)||!date||date>today||!!earliestOn&&date<earliestOn||refund&&!note.trim())throw new Error('invalid price')}catch(e){setError(e);return}
    const epoch=life.current,body={centerId,memberId,receiptId,amountMinor,...(refund?{paymentId,refundedOn:date,reason:note.trim()}:{currency:'EUR',paidOn:date,method,reference:note.trim()||null})}
    if(!refund){delete body.receiptId;body.allocations=[{receiptId,amountMinor}]}
    const signature=JSON.stringify(body);if(intent.current?.signature!==signature)intent.current={signature,body:{...body,requestId:crypto.randomUUID()}}
    const command=intent.current.body
    confirmSheet({title:t(title),message:minorToPrice(amountMinor)+' EUR · '+date+' · '+(refund?note.trim():paymentMethod(method)),confirmText:t(title),danger:refund,onConfirm:async()=>{
      if(!current(epoch)||pending.current||intent.current?.body!==command)return;pending.current=true;setBusy(true);setError(null)
      try{const result=await centerCommand(refund?'/api/centers/payments/refund':'/api/centers/payments/record',command);if(current(epoch)){useUI.getState().toast(t(refund?'Refund recorded.':'Payment recorded.'));intent.current=null;changed?.(result);close?.()}}
      catch(e){if(current(epoch)){setError(e);useCenters.getState().revokeOn(e)}}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
    }})
  }
  return <form onSubmit={submit} className="centers-form"><h3>{t(title)}</h3><p className="small muted">{t('Manual record only. No money is transferred.')}</p>
    <label className="centers-field"><span>{t('Amount (EUR)')}</span><TextField inputMode="decimal" required disabled={busy} value={amount} onChange={e=>edit(setAmount,e.target.value)}/></label>
    <label className="centers-field"><span>{t('Movement date')}</span><TextField type="date" required min={earliestOn} max={today} disabled={busy} value={date} onChange={e=>edit(setDate,e.target.value)}/></label>
    {!refund&&<SelectRow title={t('Payment method')} value={method} options={methods.map(value=>({value,label:paymentMethod(value)}))} onChange={value=>edit(setMethod,value)}/>}
    <label className="centers-field"><span>{t(refund?'Reason':'Payment reference')}</span>{refund?<TextArea required maxLength={500} disabled={busy} value={note} onChange={e=>edit(setNote,e.target.value)}/>:<TextField maxLength={120} disabled={busy} value={note} onChange={e=>edit(setNote,e.target.value)}/>}</label>
    {error&&<p role="alert">{t(paymentsErrorKey(error))}</p>}<div className="centers-actions"><Button type="button" disabled={busy} onClick={close}>{t('Cancel')}</Button><Button type="submit" disabled={busy||!amount||!date||refund&&!note.trim()}>{t(title)}</Button></div>
  </form>
}
