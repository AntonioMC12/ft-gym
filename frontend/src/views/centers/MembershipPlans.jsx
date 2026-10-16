import {useEffect,useRef,useState} from 'react'
import {Button,Section,Row,SearchField,TextField,SelectRow,Switch} from '../../components/ui.jsx'
import {confirmSheet} from '../../sheets.jsx'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {centerPlans,centerPlan,centerCommand,plansErrorKey} from '../../lib/centers-api.js'
import {priceToMinor,minorToPrice} from '../../lib/membership-price.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {useUI} from '../../store/useUI.js'
import ActionReason from '../../components/ActionReason.jsx'
import {t} from '../../lib/i18n.js'
import {useCenterNavigation,useUnsavedCenterForm} from './NavigationGuard.jsx'

const fieldsOf=plan=>({name:plan?.name||'',price:minorToPrice(plan?.priceMinor)||'0.00',intervalMonths:plan?.intervalMonths||1,
  taxPolicy:plan?.priceIncludesTax==null?'unset':plan.priceIncludesTax?'included':'excluded',taxRate:plan?.taxBasisPoints==null?'0.00':minorToPrice(String(plan.taxBasisPoints)),proration:plan?.proration||'unset'})
const conditions=plan=>minorToPrice(plan.priceMinor)+' '+plan.currency+' · '+t('Billing period (months)')+': '+plan.intervalMonths
function PlanEditor({centerId,ownerUid,detail,close,saved,duplicate=false}) {
  const plan=detail?.plan,[fields,setFields]=useState(()=>fieldsOf(plan)),[busy,setBusy]=useState(false),[error,setError]=useState(null),[requestId]=useState(()=>crypto.randomUUID())
  const live=useRef(true),pending=useRef(false)
  const requestNavigation=useCenterNavigation()
  const saveForm=useUnsavedCenterForm(JSON.stringify(fields)!==JSON.stringify(fieldsOf(plan))?JSON.stringify(fields):null,busy)
  useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
  const current=()=>live.current&&useStore.getState().user?.id===ownerUid
  const failure=e=>{if(current()){setError(e);useCenters.getState().revokeOn(e)}}
  const update=(key,value)=>setFields(previous=>({...previous,[key]:value}))
  const input=(key,label)=><label className="centers-field"><span>{label}</span><TextField required disabled={busy} maxLength={key==='name'?120:14} inputMode={key==='name'?'text':'decimal'} value={fields[key]} onChange={e=>update(key,e.target.value)}/></label>
  const submit=async e=>{
    e.preventDefault();if(pending.current||busy)return;pending.current=true;setBusy(true);setError(null)
    try{
      const body=duplicate?{centerId,id:plan.id,priceVersionId:plan.priceVersionId,name:fields.name,requestId}:
        {centerId,name:fields.name,priceMinor:priceToMinor(fields.price),currency:'EUR',intervalMonths:fields.intervalMonths,
          priceIncludesTax:fields.taxPolicy==='unset'?null:fields.taxPolicy==='included',taxBasisPoints:fields.taxPolicy==='unset'?null:Number(priceToMinor(fields.taxRate)),
          proration:fields.proration==='unset'?null:fields.proration,requestId,...(plan?{id:plan.id,version:plan.version}:{})}
      const result=await centerCommand('/api/centers/plans/'+(duplicate?'duplicate':plan?'revise':'create'),body)
      if(current()){useUI.getState().toast(t('Saved'));saved(result.plan)}
    }catch(e){failure(e)}finally{pending.current=false;if(current())setBusy(false)}
  }
  const archive=()=>confirmSheet({title:t('Archive membership plan'),message:plan.name,confirmText:t('Archive membership plan'),danger:true,onConfirm:async()=>{
    if(!current())return;setBusy(true)
    try{const result=await centerCommand('/api/centers/plans/archive',{centerId,id:plan.id,version:plan.version});if(current())saved(result.plan)}catch(e){failure(e)}finally{pending.current=false;if(current())setBusy(false)}
  }})
  return <><Section title={duplicate?t('Duplicate'):plan?t('New price version'):t('New membership plan')}><form ref={saveForm} aria-label={t('Membership plans')} className="centers-form" onSubmit={submit}>
    {plan&&<p className="small muted">{t('Version')}: {plan.revision} · {plan.archived?t('Archived plans'):conditions(plan)}</p>}
    {input('name',t('Membership plan name'))}
    {!duplicate&&<>{input('price',t('Price (EUR)'))}
      <SelectRow variant="field" disabled={busy} title={t('Billing period (months)')} value={fields.intervalMonths} options={[1,3,6,12].map(value=>({value,label:String(value)}))} onChange={value=>update('intervalMonths',value)}/>
      <SelectRow variant="field" disabled={busy} title={t('Tax policy')} value={fields.taxPolicy} options={[{value:'unset',label:t('Not configured')},{value:'included',label:t('Tax included')},{value:'excluded',label:t('Tax excluded')}]} onChange={value=>update('taxPolicy',value)}/>
      {fields.taxPolicy!=='unset'&&input('taxRate',t('Tax rate (%)'))}
      <SelectRow variant="field" disabled={busy} title={t('Proration')} value={fields.proration} options={[{value:'unset',label:t('Not configured')},{value:'none',label:t('No proration')},{value:'actual-days',label:t('Actual days')}]} onChange={value=>update('proration',value)}/>
      <p className="small muted">{t('Tax and proration must be configured before calculating charges.')}</p>
    </>}
    {error&&<p role="alert">{t(plansErrorKey(error))}</p>}
    <div className="centers-form-actions" data-center-form-actions><Button type="button" disabled={busy} onClick={()=>requestNavigation(close,{form:saveForm})}>{t('Back')}</Button>{(!plan?.archived||duplicate)&&<ActionReason reason={busy?t('Loading…'):!fields.name.trim()?t('Complete the required fields before saving.'):null}><Button type="submit" variant="primary" disabled={busy||!fields.name.trim()}>{t(busy?'Saving…':'Save')}</Button></ActionReason>}{plan&&!plan.archived&&!duplicate&&<Button type="button" disabled={busy} onClick={archive}>{t('Archive membership plan')}</Button>}</div>
  </form></Section>{detail?.versions&&!duplicate&&<Section title={t('Version')}><div className="centers-form">{detail.versions.map(row=><Row key={row.priceVersionId} title={row.name} subtitle={conditions(row)} value={row.revision}/>)}</div></Section>}</>
}
export default function MembershipPlans({centerId,ownerUid}) {
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[archived,setArchived]=useState(false),[rows,setRows]=useState([]),[cursor,setCursor]=useState(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(null),[editor,setEditor]=useState(null),[revision,setRevision]=useState(0)
  const epoch=useRef(0),detailEpoch=useRef(0),pending=useRef(false)
  const current=id=>id===epoch.current&&useStore.getState().user?.id===ownerUid
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  useEffect(()=>{const timer=setTimeout(()=>setSearch(query.trim()),250);return()=>clearTimeout(timer)},[query])
  useEffect(()=>{
    const id=++epoch.current;detailEpoch.current++;setRows([]);setCursor(null);setEditor(null);setError(null);setBusy(true);pending.current=true
    centerPlans(centerId,{query:search,archived:archived?'all':'active'}).then(result=>{if(current(id)){setRows(result.plans);setCursor(result.nextCursor)}}).catch(e=>{if(current(id))fail(e)}).finally(()=>{if(current(id)){setBusy(false);pending.current=false}})
    return()=>{epoch.current++;pending.current=false}
  },[centerId,ownerUid,search,archived,revision])
  const more=async()=>{
    if(!cursor||pending.current)return;const id=epoch.current;pending.current=true;setBusy(true)
    try{const result=await centerPlans(centerId,{query:search,archived:archived?'all':'active',cursor});if(current(id)){setRows(previous=>[...previous,...result.plans]);setCursor(result.nextCursor)}}catch(e){if(current(id))fail(e)}finally{if(current(id)){setBusy(false);pending.current=false}}
  }
  const moreRef=useAutoMore(more)
  const open=async(plan,duplicate=false)=>{
    const id=epoch.current,detail=++detailEpoch.current
    try{const result=await centerPlan(centerId,plan.id);if(current(id)&&detail===detailEpoch.current)setEditor({detail:result,duplicate})}catch(e){if(current(id)&&detail===detailEpoch.current)fail(e)}
  }
  if(editor)return <PlanEditor key={editor.detail?.plan.id||'new'} centerId={centerId} ownerUid={ownerUid} {...editor} close={()=>{setEditor(null);setRevision(r=>r+1)}} saved={()=>{setEditor(null);setRevision(r=>r+1)}}/>
  return <Section title={t('Membership plans')} className="centers-plan-catalog"><div className="centers-form">
    <div className="centers-actions centers-catalog-toolbar"><SearchField placeholder={t('Search membership plans')} aria-label={t('Search membership plans')} value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')}/><Button onClick={()=>{detailEpoch.current++;setEditor({})}}>{t('New membership plan')}</Button><label className="centers-catalog-filter">{t('Archived plans')} <Switch aria-label={t('Archived plans')} checked={archived} onChange={setArchived}/></label></div>
    <div className="centers-catalog-grid">{rows.map(plan=><article key={plan.id} className={'centers-card centers-plan-card'+(plan.archived?' centers-card-archived':'')}><Row title={plan.name} subtitle={t('Billing period (months)')+': '+plan.intervalMonths} value={minorToPrice(plan.priceMinor)+' '+plan.currency} accessory="chevron" onClick={()=>open(plan)}/>{plan.conditionsReady===false&&<p className="centers-import-notice small muted">{t('Tax and proration must be configured before calculating charges.')}</p>}<div className="centers-card-actions"><span className="centers-card-badge">{plan.archived?t('Archived plans'):t('Version')+' '+plan.revision}</span><Button type="button" variant="tinted" onClick={()=>open(plan,true)}>{t('Duplicate')}</Button></div></article>)}</div>
    {!busy&&!rows.length&&!error&&<p className="muted">{t('No membership plans available')}</p>}{busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(plansErrorKey(error))}</p>}
    {cursor&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}
  </div></Section>
}
