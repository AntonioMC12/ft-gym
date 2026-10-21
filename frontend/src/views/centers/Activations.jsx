import {useEffect,useRef,useState} from 'react'
import {Section,Row,Button,SearchField} from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import {centerMembers,centerCommand,centersErrorKey} from '../../lib/centers-api.js'
import {api} from '../../lib/api.js'
import {useStore} from '../../store/useStore.js'
import {useUI} from '../../store/useUI.js'
import {useCenters} from '../../store/useCenters.js'
import {confirmSheet} from '../../sheets.jsx'
import {copyText} from '../../lib/clipboard.js'
import {appBase} from '../../lib/app-base.js'
import {useCenterNavigation,useUnsavedCenterForm} from './NavigationGuard.jsx'
import {t} from '../../lib/i18n.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
export default function Activations({centerId,ownerUid}){
 const [rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[query,setQuery]=useState(''),[revision,setRevision]=useState(0),[request,setRequest]=useState(null),[member,setMember]=useState(null),[members,setMembers]=useState([]),[memberBusy,setMemberBusy]=useState(false),[memberQuery,setMemberQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(null)
 const life=useRef(0),memberLife=useRef(0),saving=useRef(false),intent=useRef(null),selection=useRef(null),nav=useCenterNavigation()
 selection.current={request,member}
 const form=useUnsavedCenterForm(request&&member?request.id+':'+member.id:null,busy&&saving.current)
 const current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
 const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
 useEffect(()=>{const epoch=++life.current;setRows([]);setCursor(null);setRequest(null);setMember(null);setError(null);setBusy(true);const timer=setTimeout(()=>api('/api/centers/activations?'+new URLSearchParams({centerId,query})).then(r=>{if(current(epoch)){setRows(r.requests);setCursor(r.nextCursor)}}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch))setBusy(false)}),query?250:0);return()=>{clearTimeout(timer);life.current++}},[centerId,ownerUid,query,revision])
 useEffect(()=>{const epoch=++memberLife.current;setMembers([]);setMemberBusy(!!request);if(!request)return;if(request.matchedMember||['duplicate','linked'].includes(request.documentMatch)){setMembers(request.matchedMember?[request.matchedMember]:[]);setMemberBusy(false);return}const timer=setTimeout(()=>centerMembers(centerId,{query:memberQuery,unlinked:'true',limit:5}).then(r=>{if(memberLife.current===epoch&&useStore.getState().user?.id===ownerUid){setMembers(r.members.filter(m=>m.accountLinked===false).slice(0,5))}}).catch(e=>{if(memberLife.current===epoch)fail(e)}).finally(()=>{if(memberLife.current===epoch)setMemberBusy(false)}),memberQuery?250:0);return()=>{clearTimeout(timer);memberLife.current++}},[request?.id,memberQuery,centerId,ownerUid])
 const more=async()=>{if(busy)return;const epoch=life.current;setBusy(true);try{const r=await api('/api/centers/activations?'+new URLSearchParams({centerId,query,cursor}));if(current(epoch)){setRows(old=>[...old,...r.requests]);setCursor(r.nextCursor)}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch))setBusy(false)}}
 const requestsMore=useAutoMore(()=>{if(cursor&&!request&&!error)more()})
 const decide=reject=>{
  if(!request||busy||saving.current||!reject&&!member)return;const epoch=life.current,chosen=request,chosenMember=member
  confirmSheet({title:t(reject?'Reject activation':'Link and activate'),message:chosen.name+' · '+(chosen.email||chosen.accountUid)+(reject?'':' → '+chosenMember.name+' · '+chosenMember.number),confirmText:t(reject?'Reject activation':'Link and activate'),danger:reject,onConfirm:async()=>{
   if(!current(epoch)||saving.current||selection.current.request!==chosen||selection.current.member!==chosenMember)return;saving.current=true;setBusy(true);setError(null)
   try{if(!current(epoch))return;
    const body={centerId,id:chosen.id,version:chosen.version,...(reject?{reject:true}:{memberId:chosenMember.id,memberVersion:chosenMember.version})},signature=JSON.stringify(body)
    if(intent.current?.signature!==signature)intent.current={signature,id:crypto.randomUUID()}
    await centerCommand('/api/centers/activations/decide',{...body,requestId:intent.current.id});if(current(epoch)){intent.current=null;setMember(null);setRequest(null);setRevision(n=>n+1);useUI.getState().toast(t(reject?'Activation rejected':'Account activated'))}
   }catch(e){if(current(epoch))fail(e)}finally{saving.current=false;if(current(epoch))setBusy(false)}
  }})
 }
 const link=location.origin+appBase()+'#/home?'+new URLSearchParams({join:centerId})
 return <Section className="centers-activations" title={t('Pending activations')}><div className="centers-form">
  <div className="centers-import-notice"><p>{t('Share this registration link. New accounts wait here until you link and activate them.')}</p><Button type="button" onClick={async()=>useUI.getState().toast(t(await copyText(link)?'Copied':'Could not copy'))}>{t('Copy registration link')}</Button></div>
  <SearchField aria-label={t('Search pending accounts')} placeholder={t('Search by name or email')} value={query} readOnly={saving.current||!!member} onChange={e=>setQuery(e.target.value)} onClear={()=>nav(()=>setQuery(''))}/>
  {rows.map(row=><Row key={row.id} className="centers-entity-row" title={row.name} subtitle={row.email||row.accountUid} value={request?.id===row.id?t('Selected'):null} accessory={request?.id===row.id?'check':'chevron'} disabled={busy} onClick={()=>nav(()=>{setRequest(row);setMember(null);setMemberQuery('')})}/>)}
  {!rows.length&&!busy&&!error&&<div className="centers-activation-empty" role="status"><Icon name="info"/><p>{t('No pending activations')}</p></div>}{cursor&&<Button ref={requestsMore} disabled={busy} onClick={more}>{t('Show more')}</Button>}
  {request&&<div ref={form} className="training-link-editor"><h3>{request.name}</h3><p className="small muted">{t('Choose the imported member record. Linking does not renew fees or record payments.')}</p>{!request.matchedMember&&!['duplicate','linked'].includes(request.documentMatch)&&<SearchField aria-label={t('Search members')} placeholder={t('Search members')} readOnly={saving.current} value={memberQuery} onChange={e=>setMemberQuery(e.target.value)} onClear={()=>setMemberQuery('')}/>}
   {request.documentMatch&&<div className="centers-activation-empty" role="status"><Icon name="info"/><p>{t(request.documentMatch==='unique'?'One member matches this DNI or NIE. Confirm their identity before activating.':request.documentMatch==='duplicate'?'This DNI or NIE appears in multiple member records or pending requests. Review duplicates before activating.':request.documentMatch==='linked'?'This DNI or NIE belongs to an already linked member. Review the existing link.':request.documentMatch==='legacy'?'This request has no DNI or NIE. Find and verify the member manually.':'No member matches this DNI or NIE. Search for and verify the member manually.')}</p></div>}
   {members.filter(m=>m.accountLinked===false).map(m=><Row key={m.id} className="centers-entity-row" title={m.name} subtitle={m.number} value={member?.id===m.id?t('Selected'):null} accessory={member?.id===m.id?'check':'none'} disabled={busy} onClick={()=>setMember(m)}/>)}
   {memberBusy&&<p role="status">{t('Loading…')}</p>}{!['duplicate','linked'].includes(request.documentMatch)&&!memberBusy&&!members.some(m=>m.accountLinked===false)&&<p className="small muted">{t('No unlinked members found')}</p>}
   <div className="centers-form-actions" data-center-form-actions><Button disabled={busy} onClick={()=>nav(()=>{setRequest(null);setMember(null)})}>{t('Cancel')}</Button><Button variant="danger" disabled={busy} onClick={()=>decide(true)}>{t('Reject activation')}</Button><Button variant="primary" disabled={busy||!member||request.disabled} onClick={()=>decide(false)}>{t(busy?'Saving…':'Link and activate')}</Button></div>
  </div>}
  {busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(centersErrorKey(error))}</p>}
  <div className="centers-activation-refresh"><Button disabled={busy} onClick={()=>nav(()=>setRevision(n=>n+1))}>{t('Retry')}</Button></div>
 </div></Section>
}
