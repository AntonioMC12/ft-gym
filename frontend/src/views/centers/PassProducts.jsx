import {useEffect,useRef,useState} from 'react'
import {Section,Row,Button,TextField,NumberField,SelectRow,Switch} from '../../components/ui.jsx'
import {centerPassProducts,centerCommand,passesErrorKey} from '../../lib/centers-api.js'
import {minorToPrice,priceToMinor} from '../../lib/membership-price.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {confirmSheet} from '../../sheets.jsx'
import {useUnsavedCenterForm} from './NavigationGuard.jsx'
import {t} from '../../lib/i18n.js'
export const passSummary=p=>`${p.credits} ${t('Pass credits')} · ${p.validDays} ${t('Pass validity days')} · ${minorToPrice(p.totalMinor)} EUR`
const initial={name:'',kind:'paid',credits:'',validDays:'',price:'',taxPolicy:'unset',taxRate:''}
export default function PassProducts({centerId,ownerUid}){
  const [rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[archived,setArchived]=useState(false),[editor,setEditor]=useState(false),[fields,setFields]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(null),[revision,setRevision]=useState(0)
  const life=useRef(0),pending=useRef(false),intent=useRef(null),draft=useRef(null);draft.current=JSON.stringify(fields)
  const current=e=>life.current===e&&useStore.getState().user?.id===ownerUid
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  const saveForm=useUnsavedCenterForm(editor&&JSON.stringify(fields)!==JSON.stringify(initial)?JSON.stringify(fields):null,busy)
  useEffect(()=>{const epoch=++life.current;pending.current=true;setBusy(true);setError(null);setRows([]);setCursor(null);setEditor(false);setFields(initial);intent.current=null
    centerPassProducts(centerId,{archived:archived?'all':'active'}).then(page=>{if(current(epoch)){setRows(page.products);setCursor(page.nextCursor)}}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}});return()=>{life.current++;pending.current=false}
  },[centerId,ownerUid,archived,revision])
  const more=async()=>{if(!cursor||pending.current)return;const epoch=life.current;pending.current=true;setBusy(true);try{const page=await centerPassProducts(centerId,{archived:archived?'all':'active',cursor});if(current(epoch)){setRows(old=>[...old,...page.products]);setCursor(page.nextCursor)}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}}
  const moreRef=useAutoMore(more),update=(key,value)=>setFields(old=>({...old,[key]:value}))
  const create=e=>{e.preventDefault();if(busy)return;let body;try{if(fields.taxPolicy==='unset')throw {code:'invalid-pass'};body={name:fields.name,kind:fields.kind,credits:fields.credits,validDays:fields.validDays,priceMinor:fields.kind==='promotion'?'0':priceToMinor(fields.price),priceIncludesTax:fields.taxPolicy==='included',taxBasisPoints:Number(priceToMinor(fields.taxRate))}}catch(error){fail(error);return}
    const epoch=life.current,signature=draft.current;confirmSheet({title:t('Create pass product'),message:`${body.name} · ${body.credits} ${t('Pass credits')} · ${body.validDays} ${t('Pass validity days')} · ${fields.kind==='promotion'?t('Free promotion'):fields.price+' EUR'} · ${t(fields.taxPolicy==='included'?'Tax included':'Tax excluded')} · ${fields.taxRate}%`,confirmText:t('Save'),onConfirm:async()=>{
      if(!current(epoch)||draft.current!==signature||pending.current)return;pending.current=true;setBusy(true);setError(null);const content=JSON.stringify(body);if(intent.current?.content!==content)intent.current={content,id:crypto.randomUUID()}
      try{await centerCommand('/api/centers/passes/products/create',{centerId,fields:body,requestId:intent.current.id});if(current(epoch)){intent.current=null;setRevision(n=>n+1)}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
    }})
  }
  const archive=p=>{const epoch=life.current;confirmSheet({title:t('Archive pass product'),message:p.name+' · '+t('Purchased passes keep their original terms.'),confirmText:t('Archive pass product'),onConfirm:async()=>{if(!current(epoch)||pending.current)return;pending.current=true;setBusy(true);try{await centerCommand('/api/centers/passes/products/archive',{centerId,id:p.id,version:p.version,requestId:crypto.randomUUID()});if(current(epoch))setRevision(n=>n+1)}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}}})}
  return <Section title={t('Pass products')}><div className="centers-form">
    <p className="small muted">{t('Purchased passes keep their original terms.')}</p>
    {!editor&&<div className="centers-actions centers-catalog-toolbar"><Button variant="tinted" disabled={busy} onClick={()=>setEditor(true)}>{t('Create pass product')}</Button><label className="centers-catalog-filter">{t('Archived plans')} <Switch checked={archived} disabled={busy} onChange={setArchived}/></label></div>}
    {editor&&<form ref={saveForm} aria-label={t('Pass products')} onSubmit={create} className="centers-form centers-pass-product-form"><label className="centers-field"><span>{t('Pass product')}</span><TextField required maxLength={120} value={fields.name} disabled={busy} onChange={e=>update('name',e.target.value)}/></label>
      <SelectRow title={t('Pass kind')} value={fields.kind} disabled={busy} options={[{value:'paid',label:t('Paid pass')},{value:'promotion',label:t('Free promotion')}]} onChange={v=>update('kind',v)}/>
      <label className="centers-field"><span>{t('Pass credits')}</span><NumberField className="field" min={1} max={1000} value={fields.credits} disabled={busy} onChange={v=>update('credits',v)}/></label>
      <label className="centers-field"><span>{t('Pass validity days')}</span><NumberField className="field" min={1} max={3650} value={fields.validDays} disabled={busy} onChange={v=>update('validDays',v)}/></label>
      {fields.kind==='paid'&&<label className="centers-field"><span>{t('Price (EUR)')}</span><TextField required inputMode="decimal" disabled={busy} value={fields.price} onChange={e=>update('price',e.target.value)}/></label>}
      <SelectRow title={t('Tax policy')} value={fields.taxPolicy} disabled={busy} options={[{value:'unset',label:t('Not configured')},{value:'included',label:t('Tax included')},{value:'excluded',label:t('Tax excluded')}]} onChange={v=>update('taxPolicy',v)}/>
      <label className="centers-field"><span>{t('Tax rate (%)')}</span><TextField required inputMode="decimal" disabled={busy} value={fields.taxRate} onChange={e=>update('taxRate',e.target.value)}/></label>
      <div className="centers-actions"><Button type="submit" variant="primary" disabled={busy||!fields.name.trim()||!fields.credits||!fields.validDays||fields.taxPolicy==='unset'}>{t('Save')}</Button><Button type="button" disabled={busy} onClick={()=>{setFields(initial);setEditor(false)}}>{t('Cancel')}</Button></div>
    </form>}
    {!editor&&rows.map(p=><div key={p.id} className={'centers-card'+(p.archived?' centers-card-archived':'')}><Row title={p.name} subtitle={passSummary(p)} value={p.archived?t('Archived plans'):t(p.kind==='promotion'?'Free promotion':'Paid pass')}/>{!p.archived&&<Button disabled={busy} onClick={()=>archive(p)}>{t('Archive pass product')}</Button>}</div>)}
    {!editor&&!busy&&!rows.length&&!error&&<p>{t('No passes available.')}</p>}{!editor&&cursor&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}
    {busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(passesErrorKey(error))}</p>}
  </div></Section>
}
