import {passStatusLabel} from './PassHistory.jsx'
import {useEffect,useId,useRef,useState} from 'react'
import {Section,Row,Button,SelectRow,TextField} from '../../components/ui.jsx'
import ActionReason from '../../components/ActionReason.jsx'
import {centerPasses,centerPassProducts,centerCommand,passesErrorKey} from '../../lib/centers-api.js'
import {minorToPrice} from '../../lib/membership-price.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {useUI} from '../../store/useUI.js'
import {confirmSheet} from '../../sheets.jsx'
import {useCenterNavigation,useUnsavedCenterForm} from './NavigationGuard.jsx'
import {passFormErrors,focusCenterError} from './form-validation.js'
import {passSummary} from './PassProducts.jsx'
import {t} from '../../lib/i18n.js'
export default function Passes({centerId,ownerUid,memberId,own=false,today,active=true,revision=0,changed=()=>{},onSelect,selectedId=''}){
 const prefix=useId(),[rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[products,setProducts]=useState([]),[productCursor,setProductCursor]=useState(null),[productId,setProductId]=useState(''),[startsOn,setStartsOn]=useState(''),[editor,setEditor]=useState(false),[quote,setQuote]=useState(null),[revoke,setRevoke]=useState(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(null),[errors,setErrors]=useState({}),[reload,setReload]=useState(0)
 const life=useRef(0),pending=useRef(false),intent=useRef(null),draft=useRef(''),selectRef=useRef(onSelect);selectRef.current=onSelect
 const signature=JSON.stringify({productId,startsOn});draft.current=signature
 const current=e=>life.current===e&&useStore.getState().user?.id===ownerUid
 const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
 const navigate=useCenterNavigation(),saveForm=useUnsavedCenterForm(editor&&(productId||startsOn!==(today||''))?signature:null,busy),revokeForm=useUnsavedCenterForm(revoke&&reason?JSON.stringify([revoke.id,reason]):null,busy)
 useEffect(()=>{const epoch=++life.current;pending.current=true;setBusy(true);setSaving(false);setError(null);setErrors({});setRows([]);setCursor(null);setEditor(false);setQuote(null);setRevoke(null);setReason('');intent.current=null;selectRef.current?.(null)
  centerPasses(centerId,own?{}:{memberId},own).then(page=>{if(current(epoch)){setRows(page.passes);setCursor(page.nextCursor)}}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}});return()=>{life.current++;pending.current=false}
 },[centerId,ownerUid,memberId,own,revision,reload])
 const more=async()=>{if(!cursor||pending.current)return;const epoch=life.current;pending.current=true;setBusy(true);try{const page=await centerPasses(centerId,{...(!own?{memberId}:{}),cursor},own);if(current(epoch)){setRows(old=>[...old,...page.passes]);setCursor(page.nextCursor)}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}}
 const moreRef=useAutoMore(more)
 const catalog=async(more=false)=>{if(pending.current)return;const epoch=life.current;pending.current=true;setBusy(true);setError(null);try{const page=await centerPassProducts(centerId,more?{cursor:productCursor}:{});if(current(epoch)){setProducts(old=>more?[...old,...page.products]:page.products);setProductCursor(page.nextCursor);if(!more){setEditor(true);setProductId('');setStartsOn(today||'');setQuote(null);setErrors({})}}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}}
 const update=(set,value)=>{if(pending.current)return;set(value);setQuote(null);setErrors({});setError(null);intent.current=null}
 const reset=()=>{setEditor(false);setProductId('');setStartsOn(today||'');setQuote(null);setErrors({});setError(null);intent.current=null}
 const validate=()=>{const next=passFormErrors({productId,startsOn},today);setErrors(next);focusCenterError(saveForm.current,next);return !Object.keys(next).length}
 const prepare=async(save=false)=>{
  if(pending.current||!validate())return
  const epoch=life.current,version=signature,body={centerId,memberId,productId,startsOn};let confirmation;pending.current=true;setBusy(true);setSaving(save);setError(null)
  try{
   // An uncertain purchase is retried with its original command/key. A preview
   // or an edit must not turn a lost successful purchase into another purchase.
   const cached=intent.current?.signature===version?intent.current.review:quote?.signature===version?quote:null
   const result=cached||{...await centerCommand('/api/centers/passes/preview',body),signature:version}
   if(current(epoch)&&draft.current===version){setQuote(result);if(save)confirmation=result}
  }catch(e){if(current(epoch)){fail(e);const code=e?.data?.code||e?.code;if(['pass-unavailable','not-found'].includes(code)){setErrors({productId:passesErrorKey(e)});focusCenterError(saveForm.current,{productId:true})}}}finally{if(current(epoch)){pending.current=false;setBusy(false);setSaving(false)}}
  if(confirmation&&current(epoch)&&draft.current===version)confirmPurchase(confirmation,body,epoch,version)
 }
 const confirmPurchase=(review,fields,epoch,version)=>{
  const q=review.quote
  confirmSheet({title:t('Assign pass'),message:`${q.memberName} · ${q.product.name} · ${q.product.credits} ${t('Pass credits')} · ${q.startsOn} → ${q.endsOn} (${t('Pass expiry is exclusive.')}) · ${minorToPrice(q.product.totalMinor)} EUR · ${t('Paid passes require a fully settled receipt. Refunds suspend unused credits.')} · ${t('This does not change the main subscription.')}`,confirmText:t('Assign pass'),onConfirm:async()=>{
   if(!current(epoch)||draft.current!==version||pending.current)return
   const body={...fields,quoteHash:review.quoteHash}
   if(intent.current?.signature!==version)intent.current={signature:version,review,id:crypto.randomUUID(),body}
   const command=intent.current;pending.current=true;setBusy(true);setSaving(true);setError(null)
   try{await centerCommand('/api/centers/passes/purchase',{...command.body,requestId:command.id});if(current(epoch)){intent.current=null;reset();setReload(n=>n+1);useUI.getState().toast(t('Saved'));changed()}}
   catch(e){if(current(epoch)){fail(e);if(e.status>=400&&e.status<500){intent.current=null;if((e.data?.code||e.code)==='quote-changed')setQuote(null)}}}finally{if(current(epoch)){pending.current=false;setBusy(false);setSaving(false)}}
  }})
 }
 const revokeNow=()=>{const epoch=life.current,id=revoke.id,note=reason;confirmSheet({title:t('Revoke pass'),message:revoke.name+' · '+note+' · '+t('Revoking a pass does not issue a refund.'),confirmText:t('Revoke pass'),danger:true,onConfirm:async()=>{if(!current(epoch)||pending.current||revokeForm.current?.elements.namedItem('reason')?.value!==note)return;pending.current=true;setBusy(true);const content=JSON.stringify({id,reason:note});if(intent.current?.content!==content)intent.current={content,id:crypto.randomUUID()};try{await centerCommand('/api/centers/passes/revoke',{centerId,id,reason:note,requestId:intent.current.id});if(current(epoch)){intent.current=null;setRevoke(null);setReason('');setReload(n=>n+1);useUI.getState().toast(t('Saved'));changed()}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}}})}
 const invalid=passFormErrors({productId,startsOn},today),unavailable=busy?t('Loading…'):!active?t('Activate the center before assigning passes.'):Object.values(invalid)[0]?t(Object.values(invalid)[0]):null
 return <Section title={t('Visit passes')}><div className="centers-form"><p className="small muted">{t('This does not change the main subscription.')} {t('Pass expiry is exclusive.')}</p>
  {!own&&!editor&&active&&<Button variant="tinted" disabled={busy} onClick={()=>catalog()}>{t('Assign pass')}</Button>}
  {editor&&<form ref={saveForm} noValidate aria-label={t('Assign pass')} aria-busy={busy} className="centers-pass-editor" onSubmit={e=>{e.preventDefault();prepare(true)}}>
   <div><SelectRow variant="field" title={t('Pass product')} value={productId} disabled={busy} id={prefix+'product'} data-error-field="productId" invalid={!!errors.productId} describedBy={errors.productId?prefix+'product-error':undefined} options={[{value:'',label:t('Choose a pass')},...products.map(p=>({value:p.id,label:p.name+' · '+passSummary(p)}))]} onChange={v=>update(setProductId,v)}/>{errors.productId&&<p role="alert" id={prefix+'product-error'} className="centers-field-error">{t(errors.productId)}</p>}</div>
   {productCursor&&<Button type="button" disabled={busy} onClick={()=>catalog(true)}>{t('More pass products')}</Button>}
   <label className="centers-field"><span>{t('Pass starts on')}</span><TextField type="date" required min={today} data-error-field="startsOn" aria-invalid={!!errors.startsOn||undefined} aria-describedby={errors.startsOn?prefix+'date-error':undefined} value={startsOn} disabled={busy} onChange={e=>update(setStartsOn,e.target.value)} onBlur={()=>{if(invalid.startsOn)setErrors(old=>({...old,startsOn:invalid.startsOn}))}}/>{errors.startsOn&&<small role="alert" id={prefix+'date-error'} className="centers-field-error">{t(errors.startsOn)}</small>}</label>
   {quote&&<div className="centers-pass-preview" role="status"><Row title={quote.quote.product.name} subtitle={quote.quote.startsOn+' → '+quote.quote.endsOn} value={minorToPrice(quote.quote.product.totalMinor)+' EUR'}/></div>}
   <div className="centers-form-actions" data-center-form-actions>
    <ActionReason reason={busy?t('Loading…'):null}><Button type="button" disabled={busy} onClick={()=>navigate(reset,{form:saveForm})}>{t('Cancel')}</Button></ActionReason>
    <ActionReason reason={unavailable}><Button type="button" variant="tinted" disabled={!!unavailable} onClick={()=>prepare(false)}>{t('Preview pass purchase')}</Button></ActionReason>
    <ActionReason reason={unavailable}><Button type="submit" variant="primary" disabled={!!unavailable}>{t(saving?'Saving…':'Save')}</Button></ActionReason>
   </div>
  </form>}
  {own&&onSelect&&<SelectRow variant="field" title={t('Access entitlement')} value={selectedId} disabled={busy} options={[{value:'',label:t('Main subscription')},...rows.filter(p=>p.canUse).map(p=>({value:p.id,label:p.name+' · '+p.remaining+' '+t('Credits remaining')}))]} onChange={id=>onSelect(rows.find(p=>p.id===id)||null)}/>}
  {rows.map(p=><div key={p.id}><Row title={p.name} subtitle={`${p.startsOn} → ${p.endsOn} · ${passStatusLabel(p.status||(p.revoked?'revoked':p.remaining<=0?'exhausted':p.endsOn<=today?'expired':p.available?'active':'unavailable'))}`} value={p.remaining+' / '+p.credits}/>{p.receiptId&&<p className="small muted">{t('Paid passes require a fully settled receipt. Refunds suspend unused credits.')}</p>}{!own&&!p.revoked&&<Button disabled={busy||editor||!!revoke} onClick={()=>{setRevoke(p);setReason('');intent.current=null}}>{t('Revoke pass')}</Button>}</div>)}
  {revoke&&<form ref={revokeForm} onSubmit={e=>{e.preventDefault();revokeNow()}}><Row title={revoke.name}/><label className="centers-field"><span>{t('Reason')}</span><TextField name="reason" required maxLength={250} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><div className="centers-form-actions" data-center-form-actions><Button type="button" disabled={busy} onClick={()=>navigate(()=>{setRevoke(null);setReason('');intent.current=null},{form:revokeForm})}>{t('Cancel')}</Button><ActionReason reason={busy?t('Loading…'):!reason.trim()?t('Complete the required fields before saving.'):null}><Button type="submit" variant="danger" disabled={busy||!reason.trim()}>{t('Revoke pass')}</Button></ActionReason></div></form>}
  {!rows.length&&!busy&&!error&&<p>{t('No passes available.')}</p>}{cursor&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}
  {!editor&&!revoke&&<Button variant="tinted" disabled={busy} onClick={()=>setReload(n=>n+1)}>{t('Reload passes')}</Button>}
  {busy&&<p role="status">{t(saving?'Saving…':'Loading…')}</p>}{error&&<p role="alert">{t(passesErrorKey(error))}</p>}
 </div></Section>
}
