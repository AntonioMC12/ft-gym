import {useEffect,useRef,useState} from 'react'
import {Section,Row,Button} from '../../components/ui.jsx'
import {centerStripe,ownCenterStripe,centerCommand,stripeErrorKey} from '../../lib/centers-api.js'
import {testCheckoutUrl} from '../../lib/stripe-checkout.js'
import {minorToPrice} from '../../lib/membership-price.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {confirmSheet} from '../../sheets.jsx'
import {t} from '../../lib/i18n.js'

const labels={creating:'Preparing checkout',open:'Checkout open',paid:'Payment recorded.',expired:'Checkout expired',failed:'Checkout failed',review:'Payment needs review'}
export default function StripePayments({centerId,memberId,receiptId,availableMinor,ownerUid,own=false,canPrepare=false,canReconcile=false,changed,reservationChanged}) {
  const [data,setData]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0)
  const life=useRef(0),pending=useRef(false),intent=useRef(null),identity=useRef(null),callbacks=useRef({changed,reservationChanged}),paid=useRef(null)
  callbacks.current={changed,reservationChanged}
  const current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  const read=options=>own?ownCenterStripe(centerId,{...(receiptId?{receiptId}:{}),...options}):centerStripe(centerId,{...(memberId?{memberId}:{}),...(receiptId?{receiptId}:{}),...options})
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  const accept=(result,{append=false}={})=>{
    setData(previous=>append?{...result,attempts:[...(previous?.attempts||[]),...result.attempts]}:result)
    callbacks.current.reservationChanged?.(result.hasReservation)
    const confirmed=new Set(result.attempts.filter(row=>row.state==='paid').map(row=>row.id))
    const newlyPaid=!append&&paid.current&&[...confirmed].some(id=>!paid.current.has(id));paid.current=new Set([...(paid.current||[]),...confirmed])
    if(newlyPaid)callbacks.current.changed?.()
  }
  useEffect(()=>{
    const epoch=++life.current,key=JSON.stringify([centerId,memberId,receiptId,ownerUid,own,canPrepare,canReconcile,availableMinor]);pending.current=true
    if(identity.current!==key){identity.current=key;intent.current=null;paid.current=null}
    setData(null);setError(null);setBusy(true)
    read().then(result=>{if(current(epoch))accept(result)}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{life.current++;pending.current=false}
  },[centerId,memberId,receiptId,ownerUid,own,canPrepare,canReconcile,availableMinor,revision])
  useEffect(()=>{
    if(data?.mode!=='test'||!data.attempts.some(row=>['creating','open','review'].includes(row.state)))return
    const refresh=()=>{if(!pending.current&&useStore.getState().user?.id===ownerUid&&document.visibilityState!=='hidden')setRevision(value=>value+1)}
    const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh)
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[data,ownerUid])
  const more=async()=>{
    if(!data?.nextCursor||pending.current)return;const epoch=life.current;pending.current=true;setBusy(true)
    try{const result=await read({cursor:data.nextCursor});if(current(epoch))accept(result,{append:true})}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const moreRef=useAutoMore(more)
  const execute=async(kind,id,epoch)=>{
    if(!current(epoch)||pending.current||data?.mode!=='test'||kind==='checkout'&&(!canPrepare||data.hasReservation)||kind==='reconcile'&&(!canReconcile||own))return
    pending.current=true;setBusy(true);setError(null)
    const path='/api/centers/'+(own?'own/':'')+'stripe/'+kind,body=kind==='checkout'?{centerId,...(own?{}:{memberId}),receiptId,expectedBalanceMinor:availableMinor}:{centerId,id},signature=JSON.stringify([path,body])
    if(intent.current?.signature!==signature)intent.current={signature,id:crypto.randomUUID()}
    try{const result=await centerCommand(path,{...body,requestId:intent.current.id});if(current(epoch)){intent.current=null;if(receiptId)accept(result);else setRevision(value=>value+1)}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const prepare=()=>{const epoch=life.current;confirmSheet({title:t('Prepare test checkout'),message:t('Test mode only. No real money is collected.')+' '+minorToPrice(availableMinor)+' EUR',confirmText:t('Prepare test checkout'),onConfirm:()=>execute('checkout',null,epoch)})}
  if(data?.mode==='off'&&!data.attempts.length&&!error)return null
  const content=<div className="centers-form">
    {receiptId&&<h3>{t('Test payments')}</h3>}
    {data?.mode==='test'?<p className="small muted">{t('Test mode only. No real money is collected.')}</p>:data&&<p role="status">{t('Test payments are unavailable.')}</p>}
    {data?.mode==='test'&&!data.workerEnabled&&<p className="small muted">{t('Automatic confirmation is paused. Ask your center to check the payment.')}</p>}
    {data?.hasReservation&&receiptId&&<p role="status">{t('An active checkout reserves this receipt.')}</p>}
    {data?.attempts.map(row=>{const url=testCheckoutUrl(row.checkoutUrl);return <div key={row.id}>
      <Row title={t(labels[row.state]||'Payment needs review')} subtitle={String(row.createdAt).slice(0,10)} value={minorToPrice(row.amountMinor)+' '+row.currency}/>
      <div className="centers-actions">
        {canPrepare&&row.state==='open'&&url&&<a className="btn plain" href={url} target="_blank" rel="noopener noreferrer" onClick={event=>{if(!current(life.current)||pending.current||Date.parse(row.expiresAt)<=Date.now())event.preventDefault()}}><span>{t('Open test checkout')}</span></a>}
        {canReconcile&&!own&&data.mode==='test'&&row.state!=='paid'&&<Button disabled={busy} onClick={()=>execute('reconcile',row.id,life.current)}>{t('Check payment')}</Button>}
      </div>
    </div>})}
    {receiptId&&canPrepare&&data?.mode==='test'&&!data.hasReservation&&availableMinor&&availableMinor!=='0'&&<Button disabled={busy} onClick={prepare}>{t('Prepare test checkout')}</Button>}
    <Button disabled={busy} onClick={()=>setRevision(value=>value+1)}>{t('Reload payment status')}</Button>
    {data?.nextCursor&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}
    {busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(stripeErrorKey(error))}</p>}
  </div>
  return receiptId?content:<Section title={t('Test payments')}>{content}</Section>
}
