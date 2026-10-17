import {useEffect,useId,useRef,useState} from 'react'
import {Section,Row,Button,SelectRow,TextField,TextArea,SearchField} from '../../components/ui.jsx'
import {confirmSheet} from '../../sheets.jsx'
import {centerSubscriptions,centerPlans,centerCommand,subscriptionsErrorKey} from '../../lib/centers-api.js'
import {priceToMinor,minorToPrice} from '../../lib/membership-price.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {t} from '../../lib/i18n.js'
import ActionReason from '../../components/ActionReason.jsx'
import {useUI} from '../../store/useUI.js'
import {subscriptionFormErrors,focusCenterError} from './form-validation.js'
import BillingPreview from './BillingPreview.jsx'
import ContractSummary from './ContractSummary.jsx'
import {useCenterNavigation,useUnsavedCenterForm} from './NavigationGuard.jsx'

export default function Subscriptions({centerId,member,ownerUid,changed,receiptCreated,onManagePlans}) {
  const prefix=useId(),navigate=useCenterNavigation(),pending=useRef(false),[errors,setErrors]=useState({})
  const [info,setInfo]=useState(null),[plans,setPlans]=useState([]),[cursor,setCursor]=useState(null),[query,setQuery]=useState(''),[search,setSearch]=useState('')
  const [priceVersionId,setPriceVersionId]=useState(''),[effectiveOn,setEffectiveOn]=useState(''),[discount,setDiscount]=useState('0'),[reason,setReason]=useState('')
  const [baseline,setBaseline]=useState(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(null),[requestId,setRequestId]=useState(()=>crypto.randomUUID())
  const life=useRef(0),planEpoch=useRef(0),pendingPlans=useRef(false),cancelIds=useRef(new Map()),prepared=useRef('')
  const current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  useEffect(()=>{
    const epoch=++life.current;pending.current=false;setErrors({});setInfo(null);setBaseline(null);prepared.current='';setError(null);setBusy(false);setRequestId(crypto.randomUUID())
    centerSubscriptions(centerId,member.id).then(result=>{if(current(epoch)){setInfo(result);setEffectiveOn(value=>value||result.today)}}).catch(e=>{if(current(epoch))fail(e)})
    return()=>{life.current++}
  },[centerId,member.id,member.version,ownerUid])
  useEffect(()=>{const timer=setTimeout(()=>setSearch(query.trim()),250);return()=>clearTimeout(timer)},[query])
  useEffect(()=>{
    const epoch=++planEpoch.current;pendingPlans.current=true;setPlans([]);setCursor(null)
    centerPlans(centerId,{query:search}).then(result=>{if(planEpoch.current===epoch&&useStore.getState().user?.id===ownerUid){setPlans(result.plans);setCursor(result.nextCursor);setPriceVersionId(value=>value||result.plans[0]?.priceVersionId||'')}}).catch(e=>{if(planEpoch.current===epoch&&useStore.getState().user?.id===ownerUid)fail(e)}).finally(()=>{if(planEpoch.current===epoch)pendingPlans.current=false})
    return()=>{planEpoch.current++;pendingPlans.current=false}
  },[centerId,member.id,ownerUid,search])
  const more=async()=>{
    if(!cursor||pendingPlans.current)return;const epoch=planEpoch.current;pendingPlans.current=true
    try{const result=await centerPlans(centerId,{query:search,cursor});if(epoch===planEpoch.current&&useStore.getState().user?.id===ownerUid){setPlans(previous=>[...previous,...result.plans]);setCursor(result.nextCursor)}}catch(e){if(epoch===planEpoch.current)fail(e)}finally{if(epoch===planEpoch.current)pendingPlans.current=false}
  }
  const moreRef=useAutoMore(more)
  const update=(setter,value)=>{if(!busy){setter(value);setErrors({});setError(null);setRequestId(crypto.randomUUID())}}
  const active=info?.subscriptions.find(row=>!row.canceled&&row.startsOn<=info.today&&(!row.effectiveEndsOn||row.effectiveEndsOn>info.today))
  const scheduled=info?.subscriptions.some(row=>!row.canceled&&row.startsOn>info.today)
  let normalizedDiscount=discount;try{normalizedDiscount=minorToPrice(priceToMinor(discount))}catch{}
  const signature=JSON.stringify([priceVersionId,effectiveOn,normalizedDiscount,reason])
  const saveForm=useUnsavedCenterForm(info&&!scheduled&&member.state!=='ended'&&baseline!==null&&signature!==baseline?signature:null,busy)
  useEffect(()=>{
    if(!info||!plans.length)return
    const future=info.subscriptions.find(row=>!row.canceled&&row.startsOn>info.today),key=[centerId,member.id,active?.id||'new',future?.id||''].join('|')
    if(prepared.current===key)return;prepared.current=key
    const price=plans.find(row=>row.id===active?.planId)?.priceVersionId||plans[0].priceVersionId,amount=minorToPrice(String(active?.discountBasisPoints||0)),note=active?.discountReason||''
    setDiscount(amount);setReason(note);setEffectiveOn(info.today);setPriceVersionId(price)
    setBaseline(JSON.stringify([price,info.today,amount,note]));setRequestId(crypto.randomUUID())
  },[info,plans,centerId,member.id])
  const selectedTerms=useRef(null),priceScope=JSON.stringify([centerId,member.id,ownerUid,priceVersionId])
  const selectedPlan=plans.find(row=>row.priceVersionId===priceVersionId)||(selectedTerms.current?.scope===priceScope?selectedTerms.current.plan:null)
  if(selectedPlan)selectedTerms.current={scope:priceScope,plan:selectedPlan}
  const monthly=selectedPlan?.intervalMonths===1
  useEffect(()=>{if(monthly&&info?.today)setEffectiveOn(info.today)},[monthly,info?.today])
  const planIncomplete=selectedPlan?.conditionsReady===false||selectedPlan?.priceIncludesTax===null||selectedPlan?.taxBasisPoints===null||selectedPlan?.proration===null
  const submit=async e=>{
    e.preventDefault();if(pending.current||busy||planIncomplete)return;const next=subscriptionFormErrors({priceVersionId,effectiveOn,discount,reason},info.today);setErrors(next);if(Object.keys(next).length){focusCenterError(saveForm.current,next);return}const epoch=life.current;pending.current=true;setBusy(true);setError(null)
    try{
      const result=await centerCommand('/api/centers/subscriptions/'+(active?'change':'create'),{centerId,memberId:member.id,memberVersion:member.version,priceVersionId,effectiveOn,
        discountBasisPoints:Number(priceToMinor(discount)),discountReason:reason||null,requestId,...(active?{id:active.id}:{})})
      if(current(epoch)){setBaseline(signature);setInfo(result);useUI.getState().toast(t('Saved'));changed(result)}
    }catch(e){if(current(epoch))fail(e)}finally{pending.current=false;if(current(epoch))setBusy(false)}
  }
  const cancel=row=>{
    const epoch=life.current;if(!cancelIds.current.has(row.id))cancelIds.current.set(row.id,crypto.randomUUID())
    confirmSheet({title:t('Cancel scheduled change'),message:row.name,confirmText:t('Cancel scheduled change'),danger:true,onConfirm:async()=>{
      if(!current(epoch))return;setBusy(true);setError(null)
      try{const result=await centerCommand('/api/centers/subscriptions/cancel',{centerId,memberId:member.id,memberVersion:member.version,id:row.id,requestId:cancelIds.current.get(row.id)});if(current(epoch)){setInfo(result);changed(result)}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch))setBusy(false)}
    }})
  }
  const invalid=subscriptionFormErrors({priceVersionId,effectiveOn,discount,reason},info?.today),unavailable=busy?t('Loading…'):planIncomplete?t('Tax and proration must be configured before calculating charges.'):Object.values(invalid)[0]?t(Object.values(invalid)[0]):null
  const reset=()=>{if(!baseline)return;const [p,d,a,n]=JSON.parse(baseline);setPriceVersionId(p);setEffectiveOn(d);setDiscount(a);setReason(n);setErrors({});setError(null);setRequestId(crypto.randomUUID())}
  const fieldError=key=>errors[key]?<small role="alert" id={prefix+key} className="centers-field-error">{t(errors[key])}</small>:null
  const fieldProps=key=>({'data-error-field':key,'aria-invalid':!!errors[key]||undefined,'aria-describedby':errors[key]?prefix+key:undefined,onBlur:()=>{if(invalid[key])setErrors(old=>({...old,[key]:invalid[key]}))}})
  const history=(info?.subscriptions||[]).filter(row=>row.canceled||row.status==='ended'||row.effectiveEndsOn&&row.effectiveEndsOn<=info.today)
  const currentContracts=(info?.subscriptions||[]).filter(row=>!history.includes(row))
  const contract=row=><div key={row.id} className="centers-subscription-card"><ContractSummary contract={row}>{row.canCancel&&<Button disabled={busy} onClick={()=>cancel(row)}>{t('Cancel scheduled change')}</Button>}</ContractSummary>{!row.canceled&&<BillingPreview key={member.version} centerId={centerId} memberId={member.id} contractId={row.id} ownerUid={ownerUid} today={info.today} canGenerate onGenerated={receiptCreated} policyMissing={row.priceIncludesTax===null||row.taxBasisPoints===null||row.proration===null} onConfigure={onManagePlans}/>}</div>
  return <Section title={t('Subscriptions')} className="centers-subscriptions"><div className="centers-form">
    {!info&&!error&&<p role="status">{t('Loading…')}</p>}
    {currentContracts.map(contract)}
    {history.length>0&&<details className="centers-subscription-history"><summary>{t('Subscription history')} ({history.length})</summary>{history.map(contract)}</details>}
    {info&&!scheduled&&member.state!=='ended'&&<form className="centers-subscription-editor" ref={saveForm} noValidate aria-busy={busy} aria-label={t('Subscriptions')} onSubmit={submit}>
      <h3>{active?t('Change membership plan'):t('Assign membership plan')}</h3>{active&&<p className="small muted">{t('Fee changes apply on the effective date below. Earlier periods are preserved.')}</p>}
      <SearchField aria-label={t('Search membership plans')} placeholder={t('Search membership plans')} value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')}/>
      <SelectRow variant="field" disabled={busy} {...fieldProps('priceVersionId')} invalid={!!errors.priceVersionId} title={t('Membership plans')} value={priceVersionId} options={plans.map(plan=>({value:plan.priceVersionId,label:plan.name+' · '+minorToPrice(plan.priceMinor)+' '+plan.currency}))} onChange={value=>update(setPriceVersionId,value)}/>{fieldError('priceVersionId')}
      {selectedPlan?.intervalMonths===1&&<p className="centers-import-notice small">{t('Monthly fees cover the calendar month and remain valid through the 5th of the next month.')}</p>}
      {planIncomplete&&<div className="centers-import-notice" role="status"><p>{t('Tax and proration must be configured before calculating charges.')}</p>{onManagePlans&&<Button type="button" onClick={onManagePlans}>{t('Membership plans')}</Button>}</div>}
      {cursor&&<Button ref={moreRef} type="button" onClick={more}>{t('Show more')}</Button>}
      {!plans.length&&!pendingPlans.current&&<p>{t('No membership plans available')}</p>}
      <div className="centers-fields"><label className="centers-field"><span>{t('Effective date')}</span><TextField type="date" required disabled={busy||monthly} min={info.today} {...fieldProps('effectiveOn')} value={effectiveOn} onChange={e=>update(setEffectiveOn,e.target.value)}/>{fieldError('effectiveOn')}</label>
      <label className="centers-field"><span>{t('Discount (%)')}</span><TextField required disabled={busy} inputMode="decimal" {...fieldProps('discount')} value={discount} onChange={e=>update(setDiscount,e.target.value)}/>{fieldError('discount')}</label></div>
      <label className="centers-field"><span>{t('Discount reason')}</span><TextArea disabled={busy} maxLength={250} {...fieldProps('reason')} value={reason} onChange={e=>update(setReason,e.target.value)}/>{fieldError('reason')}</label>
      <div className="centers-form-actions" data-center-form-actions><ActionReason reason={busy?t('Loading…'):null}><Button type="button" disabled={busy} onClick={()=>navigate(reset,{form:saveForm})}>{t('Cancel')}</Button></ActionReason><ActionReason reason={unavailable}><Button type="submit" variant="primary" disabled={!!unavailable}>{t(busy?'Saving…':'Save')}</Button></ActionReason></div>
    </form>}
    {error&&<p role="alert">{t(subscriptionsErrorKey(error))}</p>}
  </div></Section>
}
