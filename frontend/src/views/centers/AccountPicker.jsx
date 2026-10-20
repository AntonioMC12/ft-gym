import {useEffect,useRef,useState} from 'react'
import {Button,Row,SearchField} from '../../components/ui.jsx'
import {centerAccounts,centersErrorKey} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {t} from '../../lib/i18n.js'

export default function AccountPicker({selected,choose,showSelection=true}){
  const ownerUid=useStore(s=>s.user?.id)
  const [query,setQuery]=useState(''),[rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState(null),[retry,setRetry]=useState(0)
  const epoch=useRef(0),pending=useRef(false),applied=useRef('')
  const current=id=>epoch.current===id&&useStore.getState().user?.id===ownerUid
  useEffect(()=>{
    const id=++epoch.current;setRows([]);setCursor(null);setError(null);setBusy(true);pending.current=true
    const search=query.trim(),timer=setTimeout(()=>{
      applied.current=search
      centerAccounts(search).then(result=>{if(current(id)){setRows(result.accounts);setCursor(result.nextCursor)}}).catch(e=>{if(current(id)){setError(e);useCenters.getState().revokeOn(e)}}).finally(()=>{if(current(id)){pending.current=false;setBusy(false)}})
    },search?250:0)
    return()=>{epoch.current++;clearTimeout(timer);pending.current=false}
  },[query,ownerUid,retry])
  const more=async()=>{
    if(!cursor||pending.current)return;const id=epoch.current;pending.current=true;setBusy(true)
    try{const result=await centerAccounts(applied.current,{cursor});if(current(id)){setRows(old=>[...old,...result.accounts]);setCursor(result.nextCursor)}}
    catch(e){if(current(id)){setError(e);useCenters.getState().revokeOn(e)}}finally{if(current(id)){pending.current=false;setBusy(false)}}
  }
  return <div className="centers-account-picker">
    <label className="centers-field"><span>{t('Search by name or email')}</span><SearchField value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')} onKeyDown={e=>{if(e.key==='Enter')e.preventDefault()}}/></label>
    {showSelection&&selected&&<div className="centers-selected"><div><strong>{selected.name}</strong><div className="small muted">{selected.email||selected.id}</div></div><Button type="button" onClick={()=>choose(null)}>{t('Cancel')}</Button></div>}
    <div className="centers-accounts-list" aria-busy={busy}>
      {rows.map(account=><div key={account.id} className={account.disabled?'centers-account-disabled':''}>
        <Row title={account.name} subtitle={(account.email||account.id)+(account.disabled?' · '+t('Disabled'):'')} value={selected?.id===account.id?t('Selected'):null} accessory={selected?.id===account.id?'check':null}
          onClick={account.disabled?undefined:()=>{if(!pending.current&&useStore.getState().user?.id===ownerUid)choose(account)}}/>
      </div>)}
    </div>
    {busy&&<p role="status">{t('Loading…')}</p>}
    {!busy&&!error&&!rows.length&&<p role="status">{t('No accounts found.')}</p>}
    {error&&<><p role="alert">{t(centersErrorKey(error))}</p><Button type="button" onClick={()=>setRetry(n=>n+1)}>{t('Retry')}</Button></>}
    {cursor&&<Button type="button" disabled={busy} onClick={more}>{t('Show more')}</Button>}
  </div>
}
