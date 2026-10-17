import {useEffect,useState} from 'react'
import {Button,Row,SearchField} from './ui.jsx'
import {platformCenters,centersErrorKey} from '../lib/centers-api.js'
import {useCenters} from '../store/useCenters.js'
import {useStore} from '../store/useStore.js'
import {useAutoMore} from '../lib/use-auto-more.js'
import {t} from '../lib/i18n.js'

// Shared by the home shortcut and the training assignment sheet. An explicit
// available list limits staff to their authorized centers; platform uses SQL search/cursors.
export default function CenterChoices({selectedId,choose,ownerUid,available}){
 const uid=useStore(s=>s.user?.id)
 const [query,setQuery]=useState(''),[rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState(null),[retry,setRetry]=useState(0),[page,setPage]=useState(null)
 useEffect(()=>{
  let current=true;if(!page){setRows([]);setCursor(null)}setBusy(true);setError(null)
  if(ownerUid&&ownerUid!==uid)return
  const timer=setTimeout(()=>{
   const term=query.trim().toLocaleLowerCase()
   const load=available?Promise.resolve({centers:available.filter(c=>c.name.toLocaleLowerCase().includes(term)),nextCursor:null}):platformCenters({query:query.trim(),...(page?{cursor:page}:{})})
   load.then(r=>{if(current){setRows(old=>page?[...old,...r.centers]:r.centers);setCursor(r.nextCursor||null)}}).catch(e=>{if(current){setError(e);if([401,403].includes(e.status))useCenters.getState().revokeOn(e)}}).finally(()=>{if(current)setBusy(false)})
  },query.trim()&&!page?250:0)
  return()=>{current=false;clearTimeout(timer)}
 },[query,page,retry,uid,ownerUid,available])
 const search=value=>{setQuery(value);setPage(null)}
 const more=()=>{if(!busy&&cursor)setPage(cursor)}
 const moreRef=useAutoMore(more)
 if(ownerUid&&ownerUid!==uid)return null
 return <div className="home-center-choices">
  <SearchField placeholder={t('Search…')} aria-label={t('Search…')} value={query} onChange={e=>search(e.target.value)} onClear={()=>search('')}/>
  <div aria-busy={busy}>{rows.map(center=><Row key={center.id} title={center.name} accessory={selectedId===center.id?'check':'chevron'} onClick={busy?undefined:()=>choose(center)}/>)}</div>
  {busy&&<p role="status">{t('Loading centers')}</p>}
  {!busy&&!error&&!rows.length&&<p role="status">{t('No centers available')}</p>}
  {error&&<><p role="alert">{t(centersErrorKey(error))}</p><Button type="button" onClick={()=>{setPage(null);setRetry(n=>n+1)}}>{t('Retry')}</Button></>}
  {cursor&&<Button ref={moreRef} type="button" disabled={busy} onClick={more}>{t('Show more')}</Button>}
 </div>
}
