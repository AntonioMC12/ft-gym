import {useEffect,useId,useRef,useState} from 'react'
import {Button,TextField} from '../../components/ui.jsx'
import ActionReason from '../../components/ActionReason.jsx'
import {centerCommand,centersErrorKey,receiptsErrorKey} from '../../lib/centers-api.js'
import {minorToPrice} from '../../lib/membership-price.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {useUI} from '../../store/useUI.js'
import {confirmSheet} from '../../sheets.jsx'
import {t} from '../../lib/i18n.js'
import {useCenterNavigation,useUnsavedCenterForm} from './NavigationGuard.jsx'
import {validCenterDate,focusCenterError} from './form-validation.js'
import ChargeBreakdown from './ChargeBreakdown.jsx'

export default function BillingPreview({centerId,memberId,contractId,ownerUid,canGenerate=false,today,onGenerated,policyMissing=false,onConfigure}) {
 const prefix=useId(),navigate=useCenterNavigation()
 const [open,setOpen]=useState(false),[periodStart,setPeriodStart]=useState(''),[quote,setQuote]=useState(null),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(null),[errors,setErrors]=useState({})
 const [outcome,setOutcome]=useState(null)
 const life=useRef(0),intent=useRef(null),pending=useRef(false),draft=useRef('')
 const signature=JSON.stringify([periodStart]);draft.current=signature
 const form=useUnsavedCenterForm(open&&periodStart?signature:null,busy)
 const current=epoch=>epoch===life.current&&useStore.getState().user?.id===ownerUid
 useEffect(()=>{life.current++;setOpen(false);setPeriodStart('');setQuote(null);setOutcome(null);setError(null);setErrors({});setBusy(false);setSaving(false);intent.current=null;pending.current=false;return()=>{life.current++;pending.current=false}},[centerId,memberId,contractId,ownerUid,canGenerate,today])
 const reset=()=>{setOpen(false);setPeriodStart('');setQuote(null);setOutcome(null);setErrors({});setError(null);intent.current=null}
 const update=(setter,value)=>{if(pending.current)return;setter(value);setQuote(null);setOutcome(null);setError(null);setErrors({});intent.current=null}
 const validate=save=>{
  const next={...(periodStart&&!validCenterDate(periodStart)?{periodStart:'Check the billing period.'}:{})}
  setErrors(next);focusCenterError(form.current,next);return !Object.keys(next).length
 }
 const prepare=async(save=false)=>{
  if(pending.current||!validate(save))return
  const epoch=life.current,version=signature;let confirmation;pending.current=true;setBusy(true);setSaving(save);setError(null);setOutcome(null)
  try{
   const review=intent.current?.signature===version?intent.current.review:quote?.signature===version?quote:{...await centerCommand('/api/centers/billing/preview',{centerId,memberId,id:contractId,...(periodStart?{periodStart}:{})}),signature:version}
   if(!current(epoch)||draft.current!==version)return
   setQuote(review)
   if(!save)return
   if(today&&review.quote.periodStart>today){setError({code:'future-period'});return}
   if(!validCenterDate(review.dueOn))throw {code:'invalid-input'}
   const body={centerId,memberId,subscriptionId:contractId,periodStart:review.quote.periodStart,expectedQuoteHash:review.quoteHash}
   confirmation=()=>confirmSheet({title:t('Create receipt'),message:minorToPrice(review.quote.totalMinor)+' '+review.quote.currency+' · '+review.quote.periodStart+' → '+review.quote.periodEnd+' · '+t('Due date')+': '+review.dueOn,confirmText:t('Create receipt'),onConfirm:async()=>{
    if(!current(epoch)||pending.current||draft.current!==version)return
    if(intent.current?.signature!==version)intent.current={signature:version,review,body:{...body,requestId:crypto.randomUUID()}}
    const command=intent.current.body;pending.current=true;setBusy(true);setSaving(true);setError(null)
    try{
     const result=await centerCommand('/api/centers/receipts/generate',command)
     if(current(epoch)){intent.current=null;setOutcome(result);setOpen(false);setPeriodStart('');useUI.getState().toast(t(result.skipped?'No charge for this period.':result.alreadyExists?'Receipt already exists.':'Receipt created.'));onGenerated?.(result)}
    }catch(e){if(current(epoch)){setError(e);if(e.status>=400&&e.status<500||(e.data?.code||e.code)==='quote-changed'){intent.current=null;setQuote(null)}useCenters.getState().revokeOn(e)}}finally{if(current(epoch)){pending.current=false;setBusy(false);setSaving(false)}}
   }})
  }catch(e){if(current(epoch)){setError(e);useCenters.getState().revokeOn(e)}}finally{if(current(epoch)){pending.current=false;setBusy(false);setSaving(false)}}
  if(confirmation&&current(epoch)&&draft.current===version)confirmation()
 }
 const code=error?.data?.code||error?.code
 const errorText=!error?null:code==='future-period'?'Future periods cannot be issued yet.':canGenerate?receiptsErrorKey(error):code==='billing-policy-required'?'Tax and proration must be configured before calculating charges.':code==='invalid-input'?'Check the billing period.':centersErrorKey(error)
 if(policyMissing||code==='billing-policy-required')return <div className="centers-import-notice" role="status"><p>{t('Tax and proration must be configured before calculating charges.')}</p><p className="small muted">{t('Configure the fee, then assign its new version to this member. Existing subscriptions keep their original terms.')}</p>{onConfigure&&<Button type="button" variant="tinted" onClick={onConfigure}>{t('Membership plans')}</Button>}</div>
 const unavailable=busy?t('Loading…'):periodStart&&!validCenterDate(periodStart)?t('Check the billing period.'):today&&(periodStart||quote?.quote.periodStart)>today?t('Future periods cannot be issued yet.'):null
 const field=(key,label,value,setter,required=false)=><label className="centers-field"><span>{t(label)}</span><TextField type="date" data-error-field={key} required={required} disabled={busy} value={value} aria-invalid={!!errors[key]||undefined} aria-describedby={errors[key]?prefix+key:undefined} onChange={e=>update(setter,e.target.value)} onBlur={()=>{if(value&&!validCenterDate(value))setErrors(old=>({...old,[key]:'Check the billing period.'}))}}/>{errors[key]&&<small role="alert" className="centers-field-error" id={prefix+key}>{t(errors[key])}</small>}</label>
 return <div className="centers-selected centers-billing-preview">
  {!open&&<div className="centers-actions"><Button type="button" variant="tinted" aria-expanded={false} onClick={()=>setOpen(true)}>{t('Preview charge')}</Button>{canGenerate&&<Button type="button" variant="primary" onClick={()=>setOpen(true)}>{t('Create receipt')}</Button>}</div>}
  {open&&<form ref={form} noValidate aria-busy={busy} onSubmit={e=>{e.preventDefault();prepare(canGenerate)}}>
   {field('periodStart','Billing period start',periodStart,setPeriodStart)}
   {canGenerate&&<div className="centers-fixed-due-date"><span className="small muted">{t('Due date')}</span><strong>{quote?.dueOn||t('Always the 5th of the month after the billing period.')}</strong>{quote?.dueOn&&<span className="small muted">{t('Always the 5th of the month after the billing period.')}</span>}</div>}
   {error&&<p role="alert">{t(errorText)}</p>}
   {quote&&<ChargeBreakdown quote={quote.quote}/>}
   <p className="small muted">{t(canGenerate?'Creating a receipt does not record a payment.':'Preview only. No receipt or payment is created.')}</p>
   <div className="centers-form-actions" data-center-form-actions>
    <ActionReason reason={busy?t('Loading…'):null}><Button type="button" disabled={busy} onClick={()=>navigate(reset,{form})}>{t('Cancel')}</Button></ActionReason>
    <ActionReason reason={busy?t('Loading…'):null}><Button type={canGenerate?'button':'submit'} variant="tinted" disabled={busy} onClick={canGenerate?()=>prepare(false):undefined}>{t('Preview charge')}</Button></ActionReason>
    {canGenerate&&<ActionReason reason={unavailable}><Button type="submit" variant="primary" disabled={!!unavailable}>{t(saving?'Saving…':'Create receipt')}</Button></ActionReason>}
   </div>
  </form>}
  {outcome?.receipt?.snapshot&&<ChargeBreakdown quote={outcome.receipt.snapshot}/>}
  {outcome&&<p role="status">{t(outcome.skipped?'No charge for this period.':outcome.alreadyExists?'Receipt already exists.':'Receipt created.')}</p>}
 </div>
}
