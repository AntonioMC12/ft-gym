import {useEffect,useRef,useState} from 'react'
import {Button,Section,Row,SearchField,SelectRow} from '../../components/ui.jsx'
import {api} from '../../lib/api.js'
import {centersErrorKey} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {t} from '../../lib/i18n.js'
export const passStatusLabel=s=>t(({active:'Available pass',exhausted:'Exhausted',expired:'Expired pass',revoked:'Revoked pass',scheduled:'Scheduled',unavailable:'Unavailable pass'})[s]||'Unavailable pass')
export default function PassHistory({centerId,ownerUid}){
 const [query,setQuery]=useState(''),[status,setStatus]=useState('all'),[selected,setSelected]=useState(null),[rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[retry,setRetry]=useState(0)
 const life=useRef(0),pending=useRef(false)
 const current=e=>e===life.current&&useStore.getState().user?.id===ownerUid
 const path=()=>'/api/centers/passes/history?'+new URLSearchParams({centerId,query:query.trim(),status,...(selected?{passId:selected.id}:{})})
 useEffect(()=>{const e=++life.current;setRows([]);setCursor(null);setError(null);setBusy(true);pending.current=true;const timer=setTimeout(()=>{api(path()).then(r=>{if(current(e)){setRows(selected?r.uses:r.passes);setCursor(r.nextCursor)}}).catch(err=>{if(current(e))setError(err)}).finally(()=>{if(current(e)){pending.current=false;setBusy(false)}})},query.trim()?250:0);return()=>{life.current++;pending.current=false;clearTimeout(timer)}},[centerId,ownerUid,query,status,selected,retry])
 const more=async()=>{if(!cursor||pending.current)return;const e=life.current;pending.current=true;setBusy(true);try{const r=await api(path()+'&'+new URLSearchParams({cursor}));if(current(e)){setRows(old=>[...old,...(selected?r.uses:r.passes)]);setCursor(r.nextCursor)}}catch(err){if(current(e))setError(err)}finally{if(current(e)){pending.current=false;setBusy(false)}}}
 const moreRef=useAutoMore(more)
 return <Section title={t('Pass history')}><div className="centers-form">
  {selected?<><Button icon="chevronLeft" onClick={()=>setSelected(null)}>{t('Back')}</Button><h3>{selected.memberName} · {selected.name}</h3>{rows.map(u=><Row key={u.id} title={u.usedOn} subtitle={u.actorUid||'—'} value={u.source==='manual'?t('Manual'):'QR'}/>)}</>:<>
   <SearchField aria-label={t('Search members')} placeholder={t('Search members')} value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')}/>
   <SelectRow title={t('Status')} value={status} options={['all','active','exhausted','expired'].map(v=>({value:v,label:v==='all'?t('All'):passStatusLabel(v)}))} onChange={setStatus}/>
   <div className="centers-plan-grid">{rows.map(p=><article key={p.id} className={'centers-card centers-pass-history-card centers-pass-state-'+p.status}><Row title={p.memberName} subtitle={p.number}/><strong>{p.name}</strong><span className="centers-member-status">{passStatusLabel(p.status)}</span><p>{t('Pass starts on')}: {p.startsOn}<br/>{t('Expires on')}: {p.endsOn} · {t('Pass expiry is exclusive.')}</p><p>{t('Credits remaining')}: <strong>{p.remaining} / {p.credits}</strong> · {t('Sessions used')}: {p.used}</p><p className="small muted">{t('Created')}: {new Date(p.createdAt).toLocaleDateString()}</p><Button onClick={()=>setSelected(p)}>{t('View uses')}</Button></article>)}</div>
  </>}
  {!busy&&!rows.length&&!error&&<p>{t(selected?'No uses registered.':'No passes available.')}</p>}{busy&&<p role="status">{t('Loading…')}</p>}{error&&<><p role="alert">{t(centersErrorKey(error))}</p><Button onClick={()=>setRetry(n=>n+1)}>{t('Retry')}</Button></>}{cursor&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}
 </div></Section>
}
