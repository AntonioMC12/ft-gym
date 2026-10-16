import {useEffect,useRef,useState} from 'react'
import ActionReason from '../../components/ActionReason.jsx'
import {Button,Row,SearchField} from '../../components/ui.jsx'
import {centerCommand,centerPlans,centersErrorKey} from '../../lib/centers-api.js'
import {minorToPrice} from '../../lib/membership-price.js'
import {confirmSheet} from '../../sheets.jsx'
import {useStore} from '../../store/useStore.js'
import {useUI} from '../../store/useUI.js'
import {t} from '../../lib/i18n.js'
const errorKey=e=>({'receipt-review-required':'Review the receipt and its refunds before renewing.','renewal-plan-required':'Choose an available fee to renew.','pass-unavailable':'No usable pass with credits.','pass-only-required':'Daily use is only available for pass-only members.','renewal-member-inactive':'Activate the member before renewing.','quote-changed':'The amount changed. Preview it again before creating the receipt.'}[e?.data?.code]||centersErrorKey(e))
export default function MemberQuickActions({centerId,member,ownerUid,changed,onChangeFee,onHistory,canCollect,active}){
 const fee=member.fee,[busy,setBusy]=useState(false),[error,setError]=useState(null),[picker,setPicker]=useState(false),[plans,setPlans]=useState([]),[cursor,setCursor]=useState(null),[query,setQuery]=useState(''),[notice,setNotice]=useState('')
 const live=useRef(true),pending=useRef(false),intent=useRef(null),dayIntent=useRef(null),searchLife=useRef(0)
 useEffect(()=>{live.current=true;return()=>{live.current=false;searchLife.current++}},[])
 const current=()=>live.current&&useStore.getState().user?.id===ownerUid
 useEffect(()=>{
  if(!picker)return;const epoch=++searchLife.current;setPlans([]);setCursor(null);setBusy(true);setError(null)
  const timer=setTimeout(()=>{centerPlans(centerId,{query:query.trim()}).then(r=>{if(current()&&searchLife.current===epoch){setPlans(r.plans);setCursor(r.nextCursor)}}).catch(e=>{if(current()&&searchLife.current===epoch)setError(e)}).finally(()=>{if(current()&&searchLife.current===epoch)setBusy(false)})},query.trim()?250:0)
  return()=>{searchLife.current++;clearTimeout(timer)}
 },[picker,query,centerId,ownerUid])
 if(!fee)return null
 if(!canCollect)return onHistory?<div className="centers-member-collection"><Button variant="tinted" onClick={onHistory}>{t('History')}</Button></div>:null
 const renew=async(priceVersionId)=>{
  if(pending.current)return;pending.current=true;setBusy(true);setError(null);setNotice('')
  const body={centerId,memberId:member.id,...(priceVersionId?{priceVersionId}:{})}
  try{
   const review=await centerCommand('/api/centers/renewals/preview',body);if(!current())return
   if(review.alreadyCovered){const message=t('This period is already covered.')+' '+review.periodStart+' → '+review.periodEnd;setNotice(message);useUI.getState().toast(message);changed();return}
   confirmSheet({title:t('Confirm cash renewal'),message:member.name+' · '+review.name+' · '+review.periodStart+' → '+review.periodEnd+' · '+minorToPrice(review.amountMinor)+' EUR · '+t('Confirm that you received this amount in cash.'),confirmText:t('Renew and record cash'),onConfirm:async()=>{
    if(!current()||pending.current)return;pending.current=true;setBusy(true);setError(null)
    const command={...body,quoteHash:review.quoteHash},signature=JSON.stringify(command);if(intent.current?.signature!==signature)intent.current={signature,requestId:crypto.randomUUID()}
    try{const result=await centerCommand('/api/centers/renewals/cash',{...command,requestId:intent.current.requestId});if(current()){intent.current=null;setPicker(false);useUI.getState().toast(t(result.alreadyCovered?'This period is already covered.':'Cash renewal recorded.')+' '+(result.name||review.name)+' · '+result.periodStart+' → '+result.periodEnd);changed()}}
    catch(e){if(current())setError(e)}finally{if(current()){pending.current=false;setBusy(false)}}
   }})
  }catch(e){if(current()){setError(e);if(e?.data?.code==='renewal-plan-required'&&!fee.subscriptionId)setPicker(true)}}finally{if(current()){pending.current=false;setBusy(false)}}
 }
 const useDay=async()=>{
  if(pending.current)return;pending.current=true;setBusy(true);setError(null)
  if(!dayIntent.current)dayIntent.current={requestId:crypto.randomUUID()}
  try{const r=await centerCommand('/api/centers/passes/day',{centerId,memberId:member.id,requestId:dayIntent.current.requestId});if(current()){dayIntent.current=null;useUI.getState().toast(t(r.alreadyUsed?'This day is already registered.':'Day of use registered.')+' '+r.usedOn+(r.remaining!=null?' · '+r.remaining+' '+t('Credits remaining'):''));changed()}}catch(e){if(current())setError(e)}finally{if(current()){pending.current=false;setBusy(false)}}
 }
 const more=async()=>{if(busy||!cursor)return;const epoch=searchLife.current;setBusy(true);try{const r=await centerPlans(centerId,{query:query.trim(),cursor});if(current()&&epoch===searchLife.current){setPlans(old=>[...old,...r.plans]);setCursor(r.nextCursor)}}catch(e){if(current()&&epoch===searchLife.current)setError(e)}finally{if(current()&&epoch===searchLife.current)setBusy(false)}}
 const blocked=busy?t('Loading…'):!active?t('Inactive center'):null
 const passBlocked=blocked||({'used-today':t('This day is already registered.'),'member-inactive':t('Activate the member before renewing.'),'no-pass':t('Choose a pass to continue.'),'revoked':t('Revoked pass'),'exhausted':t('This pass has no sessions left. Assign another pass.'),'expired':t('This pass has expired. Assign another pass.'),'not-started':t('Wait until the pass start date.'),'payment-required':t('Settle the pass receipt before registering a use.')}[fee.passDayReason]|| (fee.passRemaining<=0?t('No usable pass with credits.'):null))
 return <div className="centers-member-collection">
  {!fee.passOnly&&<div className="centers-member-entitlement"><strong>{fee.name||t('No fee assigned')}</strong><div className="small muted">{fee.expiresOn&&t('Expires on')+': '+fee.expiresOn}{fee.status&&fee.status!=='none'&&' · '+t(fee.status==='active'?'Current subscription':fee.status==='grace'?'Renewal grace period':fee.status==='scheduled'?'Scheduled':'Expired fee')}</div>
   <div className="centers-actions"><ActionReason reason={blocked}><Button variant="primary" disabled={!!blocked} onClick={()=>fee.hasContract?renew():setPicker(v=>!v)}>{t(fee.hasContract?'Renew':'Select fee')}</Button></ActionReason>{fee.hasContract&&<Button disabled={busy||!active} onClick={onChangeFee}>{t('Change membership plan')}</Button>}</div>
  </div>}
  {(fee.hasPass||fee.passOnly)&&<div className="centers-member-entitlement"><strong>{t('Visit passes')}</strong><span className="small muted">{fee.passRemaining} {t('Credits remaining')}</span><div className="centers-actions"><ActionReason reason={passBlocked}><Button variant={fee.hasContract?'tinted':'primary'} disabled={!!passBlocked} onClick={useDay}>{t('Register day of use')}</Button></ActionReason></div></div>}
  {onHistory&&<Button variant="tinted" className="centers-member-history-link" disabled={busy} onClick={onHistory}>{t('History')}</Button>}
  {picker&&<div className="centers-quick-plan-picker"><SearchField aria-label={t('Search membership plans')} placeholder={t('Search membership plans')} value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')}/>{plans.map(p=><Row key={p.id} title={p.name} subtitle={minorToPrice(p.priceMinor)+' EUR'+(!p.conditionsReady?' · '+t('Tax and proration must be configured before calculating charges.'):'')} onClick={busy||!p.conditionsReady?undefined:()=>renew(p.priceVersionId)} accessory="chevron"/>)}{cursor&&<Button disabled={busy} onClick={more}>{t('Show more')}</Button>}{!plans.length&&!busy&&<p>{t('No membership plans available')}</p>}<Button disabled={busy} onClick={()=>setPicker(false)}>{t('Cancel')}</Button></div>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{t(errorKey(error))}{error?.data?.code==='renewal-plan-required'&&fee.subscriptionId&&<Button onClick={onChangeFee}>{t('Change membership plan')}</Button>}</p>}
 </div>
}
