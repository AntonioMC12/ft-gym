import {useEffect,useRef,useState} from 'react'
import {Button,TextField} from '../../components/ui.jsx'
import {centerCommand,centersErrorKey,receiptsErrorKey} from '../../lib/centers-api.js'
import {minorToPrice} from '../../lib/membership-price.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {useUI} from '../../store/useUI.js'
import {confirmSheet} from '../../sheets.jsx'
import {t} from '../../lib/i18n.js'
import ChargeBreakdown from './ChargeBreakdown.jsx'

export default function BillingPreview({centerId,memberId,contractId,ownerUid,canGenerate=false,today,onGenerated,policyMissing=false,onConfigure}) {
  const [open,setOpen]=useState(false),[periodStart,setPeriodStart]=useState(''),[quote,setQuote]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null)
  const life=useRef(0)
  const [quoteHash,setQuoteHash]=useState(null),[dueOn,setDueOn]=useState(''),[outcome,setOutcome]=useState(null)
  const intent=useRef(null),pending=useRef(false)
  const current=epoch=>epoch===life.current&&useStore.getState().user?.id===ownerUid
  useEffect(()=>{life.current++;setOpen(false);setPeriodStart('');setQuote(null);setQuoteHash(null);setDueOn('');setOutcome(null);setError(null);setBusy(false);intent.current=null;pending.current=false;return()=>{life.current++;pending.current=false}},[centerId,memberId,contractId,ownerUid,canGenerate])
  const preview=async e=>{
    e.preventDefault();if(pending.current)return;const epoch=life.current;pending.current=true;setBusy(true);setError(null);setQuote(null);setQuoteHash(null);setOutcome(null)
    try{
      const result=await centerCommand('/api/centers/billing/preview',{centerId,memberId,id:contractId,...(periodStart?{periodStart}:{})})
      if(current(epoch)){setQuote(result.quote);setQuoteHash(result.quoteHash);setPeriodStart(result.quote.periodStart);setDueOn(value=>value||((today||result.quote.periodStart)>result.quote.periodStart?today:result.quote.periodStart))}
    }catch(e){if(current(epoch)){setError(e);useCenters.getState().revokeOn(e)}}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const generate=()=>{
    if(!canGenerate||!quote||!quoteHash||!dueOn||pending.current)return
    const epoch=life.current,body={centerId,memberId,subscriptionId:contractId,periodStart:quote.periodStart,dueOn,expectedQuoteHash:quoteHash},signature=JSON.stringify(body)
    if(intent.current?.signature!==signature)intent.current={signature,body:{...body,requestId:crypto.randomUUID()}}
    const command=intent.current.body
    confirmSheet({title:t('Create receipt'),message:minorToPrice(quote.totalMinor)+' '+quote.currency+' · '+quote.periodStart+' → '+quote.periodEnd+' · '+t('Due date')+': '+dueOn,confirmText:t('Create receipt'),onConfirm:async()=>{
      if(!current(epoch)||pending.current||intent.current?.body!==command)return;pending.current=true;setBusy(true);setError(null)
      try{
        const result=await centerCommand('/api/centers/receipts/generate',command)
        if(current(epoch)){setOutcome(result);if(result.receipt)setQuote(result.receipt.snapshot);useUI.getState().toast(t(result.skipped?'No charge for this period.':result.alreadyExists?'Receipt already exists.':'Receipt created.'));onGenerated?.(result)}
      }catch(e){if(current(epoch)){setError(e);if((e?.data?.code||e?.code)==='quote-changed'){setQuote(null);setQuoteHash(null)}useCenters.getState().revokeOn(e)}}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
    }})
  }
  const code=error?.data?.code||error?.code
  const errorText=!error?null:canGenerate?receiptsErrorKey(error):code==='billing-policy-required'?'Tax and proration must be configured before calculating charges.':code==='invalid-input'?'Check the billing period.':centersErrorKey(error)
  if(policyMissing||code==='billing-policy-required')return <div className="centers-import-notice" role="status"><p>{t('Tax and proration must be configured before calculating charges.')}</p><p className="small muted">{t('Configure the fee, then assign its new version to this member. Existing subscriptions keep their original terms.')}</p>{onConfigure&&<Button type="button" variant="tinted" onClick={onConfigure}>{t('Membership plans')}</Button>}</div>
  return <div className="centers-selected centers-billing-preview"><Button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{t(open?'Close':'Preview charge')}</Button>{open&&<form onSubmit={preview}>
    <label className="centers-field"><span>{t('Billing period start')}</span><TextField type="date" disabled={busy} value={periodStart} onChange={e=>{setPeriodStart(e.target.value);setQuote(null);setQuoteHash(null);setOutcome(null);intent.current=null}}/></label>
    <Button type="submit" disabled={busy}>{t('Preview charge')}</Button>
    {error&&<p role="alert">{t(errorText)}</p>}
    {quote&&<ChargeBreakdown quote={quote}/>}
    {!outcome?.receipt&&<p className="small muted">{t('Preview only. No receipt or payment is created.')}</p>}
    {canGenerate&&quote&&<><label className="centers-field"><span>{t('Due date')}</span><TextField type="date" min={quote.periodStart} disabled={busy||!!outcome} value={dueOn} onChange={e=>{setDueOn(e.target.value);intent.current=null}}/></label>
      <p className="small muted">{t('Creating a receipt does not record a payment.')}</p>
      {today&&quote.periodStart>today&&<p className="small muted">{t('Future periods cannot be issued yet.')}</p>}
      {outcome?<p role="status">{t(outcome.skipped?'No charge for this period.':outcome.alreadyExists?'Receipt already exists.':'Receipt created.')}</p>:<Button type="button" disabled={busy||!quoteHash||!dueOn||dueOn<quote.periodStart||!!today&&quote.periodStart>today} onClick={generate}>{t('Create receipt')}</Button>}
    </>}
  </form>}</div>
}
