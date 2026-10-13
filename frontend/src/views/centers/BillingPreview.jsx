import {useEffect,useRef,useState} from 'react'
import {Button,Row,TextField} from '../../components/ui.jsx'
import {centerCommand,centersErrorKey} from '../../lib/centers-api.js'
import {minorToPrice} from '../../lib/membership-price.js'
import {useStore} from '../../store/useStore.js'
import {t} from '../../lib/i18n.js'

export default function BillingPreview({centerId,memberId,contractId,ownerUid}) {
  const [open,setOpen]=useState(false),[periodStart,setPeriodStart]=useState(''),[quote,setQuote]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null)
  const life=useRef(0)
  useEffect(()=>{life.current++;setOpen(false);setPeriodStart('');setQuote(null);setError(null);setBusy(false);return()=>{life.current++}},[centerId,memberId,contractId,ownerUid])
  const preview=async e=>{
    e.preventDefault();if(busy)return;const epoch=life.current;setBusy(true);setError(null);setQuote(null)
    try{
      const result=await centerCommand('/api/centers/billing/preview',{centerId,memberId,id:contractId,...(periodStart?{periodStart}:{})})
      if(epoch===life.current&&useStore.getState().user?.id===ownerUid){setQuote(result.quote);setPeriodStart(result.quote.periodStart)}
    }catch(e){if(epoch===life.current&&useStore.getState().user?.id===ownerUid)setError(e)}finally{if(epoch===life.current)setBusy(false)}
  }
  const code=error?.data?.code||error?.code
  const errorText=!error?null:code==='billing-policy-required'?'Tax and proration must be configured before calculating charges.':code==='invalid-input'?'Check the billing period.':centersErrorKey(error)
  return <div className="centers-selected"><Button onClick={()=>setOpen(value=>!value)}>{t('Preview charge')}</Button>{open&&<form onSubmit={preview}>
    <label className="centers-field"><span>{t('Billing period start')}</span><TextField type="date" disabled={busy} value={periodStart} onChange={e=>{setPeriodStart(e.target.value);setQuote(null)}}/></label>
    <Button type="submit" disabled={busy}>{t('Preview charge')}</Button>
    {error&&<p role="alert">{t(errorText)}</p>}
    {quote&&<div><p className="small muted">{quote.periodStart} → {quote.periodEnd} · {quote.proration==='none'?t('No proration'):t('Actual days')}</p>
      <Row title={t('Billable days')} value={quote.chargeDays+' / '+quote.periodDays}/>
      {quote.activeDays!==quote.chargeDays&&<Row title={t('Active days')} value={quote.activeDays}/>}
      <Row title={t('Discount (%)')} value={minorToPrice(String(quote.discountBasisPoints))}/>
      <Row title={t('Net amount')} value={minorToPrice(quote.netMinor)+' '+quote.currency}/>
      <Row title={t('Tax amount')} value={minorToPrice(quote.taxMinor)+' '+quote.currency}/>
      <Row title={t('Total amount')} value={minorToPrice(quote.totalMinor)+' '+quote.currency}/>
    </div>}
    <p className="small muted">{t('Preview only. No receipt or payment is created.')}</p>
  </form>}</div>
}
