import {useEffect,useRef,useState} from 'react'
import {Section,Row,Button} from '../../components/ui.jsx'
import {centerReceipts,ownCenterReceipts,receiptsErrorKey} from '../../lib/centers-api.js'
import {minorToPrice} from '../../lib/membership-price.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {t} from '../../lib/i18n.js'
import ChargeBreakdown from './ChargeBreakdown.jsx'
import ManualMovement from './ManualMovement.jsx'
import StripePayments from './StripePayments.jsx'
import {afterScrollRestore} from '../../components/Modals.jsx'

export default function Receipts({centerId,memberId,ownerUid,revision=0,canRecord=false,canPay=false,today,changed,own=false,revealReceipt,onRevealed}) {
  const [rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null)
  const life=useRef(0),pending=useRef(false)
  const loaded=useRef(0),receiptNodes=useRef(new Map()),revealed=useRef(null)
  const [record,setRecord]=useState(false)
  const [reserved,setReserved]=useState(false)
  const current=epoch=>epoch===life.current&&useStore.getState().user?.id===ownerUid
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  useEffect(()=>{
    const epoch=++life.current;pending.current=true;setBusy(true);setRows([]);setCursor(null);setSelected(null);setRecord(false);setReserved(false);setError(null)
    const request=own?ownCenterReceipts(centerId):centerReceipts(centerId,memberId)
    request.then(result=>{if(current(epoch)){loaded.current=epoch;setRows(result.receipts);setCursor(result.nextCursor)}}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{life.current++;pending.current=false}
  },[centerId,memberId,ownerUid,revision,canRecord,canPay,own])
  const more=async()=>{
    if(!cursor||pending.current)return;const epoch=life.current;pending.current=true;setBusy(true)
    try{const result=await (own?ownCenterReceipts(centerId,{cursor}):centerReceipts(centerId,memberId,{cursor}));if(current(epoch)){setRows(previous=>[...previous,...result.receipts]);setCursor(result.nextCursor)}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const moreRef=useAutoMore(more)
  useEffect(()=>{
    if(!revealReceipt||revealed.current===revealReceipt||own||busy||error||pending.current||loaded.current!==life.current||!current(life.current))return
    const node=receiptNodes.current.get(revealReceipt.id)
    if(node){
      const epoch=life.current
      return afterScrollRestore(()=>{
        if(!current(epoch)||!node.isConnected)return
        revealed.current=revealReceipt
        node.focus({preventScroll:true})
        node.scrollIntoView?.({block:'center',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})
        onRevealed?.()
      })
    }else if(cursor){more()}else{revealed.current=revealReceipt;onRevealed?.()}
  },[revealReceipt,rows,cursor,busy,error,centerId,memberId,ownerUid,own,onRevealed])
  if(selected)return <Section title={t('Receipt details')}><div className="centers-form"><Row title={selected.snapshot.memberName} value={selected.snapshot.memberNumber}/><Row title={t('Due date')} value={selected.dueOn}/><ChargeBreakdown quote={selected.snapshot}/>
    {selected.settlement&&<><Row title={t('Paid amount')} value={minorToPrice(selected.settlement.paidMinor)+' '+selected.currency}/><Row title={t('Refunded amount')} value={minorToPrice(selected.settlement.refundedMinor)+' '+selected.currency}/><Row title={t('Outstanding balance')} value={minorToPrice(selected.settlement.balanceMinor)+' '+selected.currency}/></>}
    {!own&&canRecord&&!reserved&&selected.settlement?.balanceMinor!=='0'&&selected.settlement&&(record?<ManualMovement centerId={centerId} memberId={memberId} receiptId={selected.id} availableMinor={selected.settlement.balanceMinor} today={today} ownerUid={ownerUid} changed={changed} close={()=>setRecord(false)}/>:<Button onClick={()=>setRecord(true)}>{t('Record payment')}</Button>)}
    <StripePayments key={selected.id} centerId={centerId} memberId={memberId} receiptId={selected.id} availableMinor={selected.settlement?.balanceMinor} ownerUid={ownerUid} own={own} canPrepare={own?canPay:canRecord&&!record} canReconcile={!own&&canRecord} changed={changed} reservationChanged={setReserved}/>
    {!own&&<p className="small muted">{t('Creating a receipt does not record a payment.')}</p>}<Button onClick={()=>{setSelected(null);setRecord(false)}}>{t('Back')}</Button></div></Section>
  return <Section title={t('Receipts')}><div className="centers-form">
    {rows.map(row=><div key={row.id} ref={node=>{if(node)receiptNodes.current.set(row.id,node);else receiptNodes.current.delete(row.id)}} tabIndex={-1} className="centers-receipt-summary"><Row className="centers-entity-row" title={(row.concept==='pass'?row.snapshot.name+' · ':'')+row.periodStart+' → '+row.periodEnd} subtitle={t('Due date')+': '+row.dueOn} value={minorToPrice(row.totalMinor)+' '+row.currency} accessory="chevron" onClick={()=>setSelected(row)}/>
      {row.settlement&&<div className="centers-receipt-settlement"><span className={'member-list-status '+(row.settlement.balanceMinor==='0'?'is-good':'is-alert')}>{t(row.settlement.balanceMinor==='0'?'Paid':BigInt(row.settlement.paidMinor)>BigInt(row.settlement.refundedMinor)?'Partially paid':'Pending payment')}{row.settlement.balanceMinor!=='0'&&' · '+minorToPrice(row.settlement.balanceMinor)+' '+row.currency}</span>{!own&&canRecord&&BigInt(row.settlement.balanceMinor)>0n&&<Button variant="tinted" onClick={()=>{setSelected(row);setRecord(true)}}>{t('Record payment')}</Button>}</div>}
    </div>)}
    {!busy&&!rows.length&&!error&&<p className="muted">{t('No receipts available')}</p>}{busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(receiptsErrorKey(error))}</p>}
    {cursor&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}
  </div></Section>
}
