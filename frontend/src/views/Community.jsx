import {useEffect,useRef,useState} from 'react'
import {Navigate,useNavigate,useSearchParams} from 'react-router-dom'
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {useUI} from '../store/useUI.js'
import {Button,Row,Section,TextField,TextArea,SearchField,SelectRow,Switch} from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import CenterChoices from '../components/CenterChoices.jsx'
import CenterWorkspace from './centers/CenterWorkspace.jsx'
import CenterNavigationGuard,{useCenterNavigation,useUnsavedCenterForm} from './centers/NavigationGuard.jsx'
import ConfigPending from './centers/ConfigPending.jsx'
import {communityRead,communityCommand,communityError,badgeLabel} from '../lib/community-api.js'
import {confirmSheet} from '../sheets.jsx'
import {navBack} from '../lib/nav.js'
import {t,dateLocale} from '../lib/i18n.js'
import './centers/centers.css'
import {phaseForSet,hasCompletedWork,isSideSet} from '../lib/workout-model.js'
import {exOr} from '../lib/exercises.js'
import {exerciseNameText} from '../lib/format.js'
import './community.css'
const statusLabel=state=>t({pending:'Unanswered',answered:'Answered',closed:'Closed',draft:'Draft',published:'Published',archived:'Archived'}[state]||state)
function useResource(centerId,kind,options={},revision=0){
 const uid=useStore(s=>s.user?.id),key=JSON.stringify([uid,centerId,kind,options]),[result,setResult]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(false),life=useRef(0)
 const [paging,setPaging]=useState(null),[retry,setRetry]=useState(0)
 const page=paging?.key===key?paging.cursor:null
 useEffect(()=>{if(!centerId||!kind)return;const refresh=()=>{if(document.visibilityState!=='hidden'){setPaging(null);setRetry(n=>n+1)}};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);const timer=setInterval(refresh,60000);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}},[key])
 useEffect(()=>{const epoch=++life.current;setBusy(true);setError(null);if(!centerId||!kind){setBusy(false);return}
  const timer=setTimeout(()=>communityRead(centerId,kind,{...options,...(page?{cursor:page}:{})}).then(data=>{if(life.current===epoch&&useStore.getState().user?.id===uid)setResult(old=>({key,...data,items:page&&old?.key===key?[...old.items,...data.items]:data.items}))}).catch(e=>{if(life.current===epoch){setError({key,value:e});if([401,403].includes(e.status))setResult(null);if(e.status===401)useCenters.getState().revokeOn(e)}}).finally(()=>{if(life.current===epoch)setBusy(false)}),options.query?250:0)
  return()=>{clearTimeout(timer);life.current++}
 },[key,page,revision,retry])
 return {data:result?.key===key?result:null,error:error?.key===key?error.value:null,busy,more:()=>{if(!busy&&result?.nextCursor)setPaging({key,cursor:result.nextCursor})},refresh:()=>{setPaging(null);setRetry(n=>n+1)}}
}
function useAction(centerId,refresh=()=>{}){
 const uid=useStore(s=>s.user?.id),[busy,setBusy]=useState(false),[error,setError]=useState(null),lock=useRef(false),intent=useRef(null),life=useRef(0)
 useEffect(()=>{life.current++;setError(null);return()=>{life.current++}},[centerId,uid])
 const run=async(action,fields)=>{
  if(lock.current)return false;const epoch=life.current,signature=JSON.stringify([centerId,action,fields]);if(intent.current?.signature!==signature)intent.current={signature,id:crypto.randomUUID()}
  lock.current=true;setBusy(true);setError(null)
  try{const result=await communityCommand(centerId,action,fields,intent.current.id);if(epoch!==life.current||useStore.getState().user?.id!==uid)return false;intent.current=null;refresh();return result}
  catch(e){if(epoch===life.current){setError(e);if([401,403].includes(e.status))useCenters.getState().revokeOn(e)}return false}
  finally{lock.current=false;if(epoch===life.current)setBusy(false)}
 };return {run,busy,error}
}
function Feedback({resource,action}){const error=resource?.error||action?.error;return <>{(resource?.busy||action?.busy)&&<p className="muted small" role="status">{t('Loading…')}</p>}{error&&<div className="community-alert" role="alert">{t(communityError(error))}{resource&&<Button onClick={resource.refresh}>{t('Retry')}</Button>}</div>}</>}
function More({resource}){return resource.data?.nextCursor?<Button disabled={resource.busy} onClick={resource.more}>{t('Show more')}</Button>:null}
function confirm(title,onConfirm,danger=false){confirmSheet({title:t(title),message:t('Confirm this action.'),confirmText:t('Confirm'),danger,onConfirm})}
function TextBox({label,value,set,max=1000,disabled=false}){return <label className="centers-field"><span>{t(label)}</span><TextArea value={value} disabled={disabled} maxLength={max} onChange={e=>set(e.target.value)} required/><small className="muted community-counter">{value.length} / {max}</small></label>}
function NewQuestion({centerId,meta,workoutId,done}){
 const [title,setTitle]=useState(''),[body,setBody]=useState(''),[includeLoads,setLoads]=useState(false),[consent,setConsent]=useState(false),[preparing,setPreparing]=useState(false),action=useAction(centerId),uid=useStore(s=>s.user?.id),alive=useRef(true),preparingRef=useRef(false)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const form=useUnsavedCenterForm(title||body?JSON.stringify([title,body,includeLoads,consent]):null,action.busy||preparing)
 const S=useStore(s=>s.S),w=workoutId?S.workouts?.find(w=>String(w.id)===workoutId):null
 return <Section title={t(workoutId?'Comment on this workout':'Ask the team')}><form className="community-form" ref={form} onSubmit={async e=>{e.preventDefault();if(preparingRef.current||action.busy)return;if(workoutId){preparingRef.current=true;setPreparing(true);try{const sync=await useStore.getState().syncNow();if(sync?.status!=='ok')throw new Error('sync unavailable')}catch{if(alive.current)useUI.getState().toast(t('Could not load community. Try again.'));return}finally{preparingRef.current=false;if(alive.current)setPreparing(false)}if(!alive.current||useStore.getState().user?.id!==uid)return}const result=await action.run('create',{title,body,...(workoutId?{workoutId,includeLoads,contextConsent:consent}:{})});if(result){setTitle('');setBody('');done(result.id)}}}>
  <p className="community-alert">{meta.trainerName?t('Your assigned trainer')+' · '+meta.trainerName:t('The authorized center team will answer your question.')}</p>
  <label className="centers-field"><span>{t('Title')}</span><TextField value={title} maxLength={120} required disabled={action.busy||preparing} onChange={e=>setTitle(e.target.value)}/></label><TextBox label="Your question" value={body} set={setBody} disabled={action.busy||preparing}/>
  {workoutId&&<div className="community-context"><h3>{t('Workout context')}</h3><p>{w?.name||workoutId} · {w?.d}</p><p className="small muted">{t('Only the selected workout context will be sent.')}</p><label className="community-check"><input type="checkbox" checked={includeLoads} onChange={e=>setLoads(e.target.checked)} disabled={action.busy}/>{t('Include loads and repetitions')}</label>{includeLoads&&<div className="small">{(w?.entries||[]).slice(0,30).map((entry,i)=><p key={i}>{exerciseNameText(exOr(entry.id))}: {(entry.sets||[]).filter(s=>phaseForSet(s)==='work'&&hasCompletedWork(s)).flatMap(s=>isSideSet(s)?[s.sides.L,s.sides.R]:[s]).filter(s=>s.done).slice(0,30).map(s=>(s.r||0)+' × '+(s.w||0)+' '+(S.unit||'kg')).join(', ')}</p>)}</div>}<label className="community-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required disabled={action.busy}/>{t('I agree to share this workout context with the team.')}</label></div>}
  <Feedback action={action}/><div className="community-actions" data-center-form-actions><Button type="submit" variant="primary" disabled={action.busy||preparing||!title.trim()||!body.trim()||!!workoutId&&!consent}>{t('Send')}</Button></div>
 </form></Section>
}
function Inbox({centerId,view,open}){
 const [query,setQuery]=useState(''),[status,setStatus]=useState('all'),[expanded,setExpanded]=useState(false),resource=useResource(centerId,'threads',{view,query,status,limit:expanded?20:5})
 return <Section title={t(view==='team'?'Member questions':'My questions')}><div className="community-form"><SearchField value={query} placeholder={t('Search…')} aria-label={t('Search…')} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')}/><SelectRow title={t('Status')} value={status} options={['all','pending','answered','closed'].map(value=>({value,label:value==='all'?t('All'):statusLabel(value)}))} onChange={setStatus}/>
  <Feedback resource={resource}/>{resource.data?.items?.map(row=><Row className={'community-list-row'+(row.unread?' unread':'')} key={row.id} title={row.title} subtitle={(view==='team'?row.name+' · ':'')+statusLabel(row.state)+(row.updatedAt?' · '+new Date(row.updatedAt).toLocaleDateString(dateLocale()):'')+(row.preview?' · '+row.preview:'')} value={row.unread?String(row.unread):null} accessory="chevron" onClick={()=>open(row.id)}/>)}
  {resource.data&&!resource.busy&&!resource.data.items.length&&<div className="community-alert" role="status">{t('No conversations yet')}</div>}{!expanded&&resource.data?.nextCursor?<Button onClick={()=>setExpanded(true)}>{t('View all')}</Button>:<More resource={resource}/>}
 </div></Section>
}
function Thread({centerId,id,revision}){
 const resource=useResource(centerId,'thread',{id,limit:20},revision),action=useAction(centerId,resource.refresh),row=resource.data?.thread,[body,setBody]=useState(''),[editing,setEditing]=useState(null),[editText,setEditText]=useState('')
 const form=useUnsavedCenterForm(body||editing?JSON.stringify([body,editing?.id,editText]):null,action.busy)
 useEffect(()=>{setBody('');setEditing(null)},[id])
 return <Section title={row?.title||t('My questions')}><div className="community-form" ref={form}><Feedback resource={resource} action={action}/>{row&&<>
  <div className="community-actions"><span className={'community-badge state-'+row.state}>{statusLabel(row.state)}</span><Button disabled={action.busy} onClick={()=>action.run('read',{id,lastSeq:row.lastSeq})}>{t('Mark as read')}</Button><Button disabled={action.busy} onClick={()=>confirm(row.state==='closed'?'Reopen':'Close conversation',()=>action.run('state',{id,version:row.version,state:row.state==='closed'?'pending':'closed'}))}>{t(row.state==='closed'?'Reopen':'Close conversation')}</Button></div>
  {row.context?.workoutId&&<details className="community-context"><summary>{t('Workout context')} · {row.context.date}</summary><p>{row.context.title}</p>{row.context.exercises?.map((e,i)=><p key={i}>{exerciseNameText(exOr(e.id))}: {e.sets.map(s=>s.reps+' × '+s.load+' '+row.context.unit).join(', ')}</p>)}</details>}
  <More resource={resource}/><ol className="community-messages">{[...(resource.data.items||[])].reverse().map(m=><li className={'community-message'+(m.own?' own':'')} key={m.id}><div className="small muted">{m.name} · {new Date(m.createdAt).toLocaleString(dateLocale())}{m.version>1?' · '+t('Version')+' '+m.version:''}</div><p>{m.deleted?t('Message removed'):m.body}</p>{m.own&&!m.deleted&&<div className="community-actions"><Button size="sm" disabled={action.busy} onClick={()=>{setEditing(m);setEditText(m.body)}}>{t('Edit')}</Button><Button size="sm" disabled={action.busy} onClick={()=>confirm('Delete message',()=>action.run('delete-message',{id,messageId:m.id,version:m.version,reason:'Author request'}),true)}>{t('Delete')}</Button></div>}</li>)}</ol>
  {editing&&<form className="community-context" onSubmit={async e=>{e.preventDefault();if(await action.run('edit-message',{id,messageId:editing.id,version:editing.version,body:editText}))setEditing(null)}}><TextBox label="Edit message" value={editText} set={setEditText} disabled={action.busy}/><div className="community-actions"><Button type="submit" disabled={action.busy||!editText.trim()}>{t('Save')}</Button><Button disabled={action.busy} onClick={()=>setEditing(null)}>{t('Cancel')}</Button></div></form>}
  {row.state==='closed'?<p className="community-alert" role="status">{t('This conversation is closed. Reopen it to reply.')}</p>:<form onSubmit={async e=>{e.preventDefault();if(await action.run('reply',{id,version:row.version,body}))setBody('')}}><TextBox label="Write your message" value={body} set={setBody} disabled={action.busy}/><Button type="submit" variant="primary" disabled={action.busy||!body.trim()}>{t('Send')}</Button></form>}
 </>}</div></Section>
}

function Notices({centerId,meta}){
 const resource=useResource(centerId,'notices'),action=useAction(centerId,resource.refresh),[edit,setEdit]=useState(null),can=meta.capabilities.includes('community.manage'),navigate=useCenterNavigation()
 return <Section title={t('Center news')}><div className="community-form"><Feedback resource={resource} action={action}/>{can&&<Button variant="tinted" icon="plus" onClick={()=>navigate(()=>setEdit({title:'',body:'',state:'draft',pinned:false,startsOn:meta.today,endsOn:''}))}>{t('New notice')}</Button>}
  {edit&&<NoticeForm centerId={centerId} initial={edit} close={()=>{setEdit(null);resource.refresh()}}/>}
  {[...(resource.data?.items||[])].sort((a,b)=>Number(b.pinned)-Number(a.pinned)).map(n=><details className="community-context" key={n.id}><summary><strong>{n.title}</strong>{n.pinned?' · '+t('Pinned'):''}<span className="small muted"> · {statusLabel(n.state)}{n.read?'':' · '+t('Unread')}</span></summary><p className="community-copy">{n.body}</p><p className="small muted">{n.author} · {n.startsOn}{n.endsOn?' → '+n.endsOn:''}</p><div className="community-actions"><Button disabled={action.busy} onClick={()=>action.run('notice-read',{id:n.id,version:n.version})}>{t('Mark as read')}</Button>{can&&<Button onClick={()=>navigate(()=>setEdit(n))}>{t('Edit')}</Button>}</div></details>)}
  {resource.data&&!resource.data.items.length&&<p className="community-alert">{t('No notices right now')}</p>}<More resource={resource}/>
 </div></Section>
}
function NoticeForm({centerId,initial,close}){
 const [draft,setDraft]=useState(initial),action=useAction(centerId),form=useUnsavedCenterForm(JSON.stringify(draft)!==JSON.stringify(initial)?JSON.stringify(draft):null,action.busy),navigate=useCenterNavigation()
 useEffect(()=>setDraft(initial),[initial]);const set=(key,value)=>setDraft(d=>({...d,[key]:value}))
 return <form ref={form} className="community-context community-form" onSubmit={async e=>{e.preventDefault();if(await action.run('notice',{...(draft.id?{id:draft.id,version:draft.version}:{}),title:draft.title,body:draft.body,state:draft.state,pinned:draft.pinned,startsOn:draft.startsOn,endsOn:draft.endsOn||null})){setDraft(initial);close()}}}>
  <label className="centers-field"><span>{t('Title')}</span><TextField value={draft.title} maxLength={120} required disabled={action.busy} onChange={e=>set('title',e.target.value)}/></label><TextBox label="Message" max={3000} value={draft.body} set={value=>set('body',value)} disabled={action.busy}/>
  <SelectRow title={t('Status')} value={draft.state} options={['draft','published','archived'].map(value=>({value,label:statusLabel(value)}))} onChange={value=>set('state',value)}/><label className="community-check"><input type="checkbox" checked={draft.pinned} onChange={e=>set('pinned',e.target.checked)}/>{t('Pinned')}</label><div className="centers-fields"><label className="centers-field"><span>{t('From')}</span><TextField type="date" value={draft.startsOn} required onChange={e=>set('startsOn',e.target.value)}/></label><label className="centers-field"><span>{t('Until')}</span><TextField type="date" value={draft.endsOn||''} min={draft.startsOn} onChange={e=>set('endsOn',e.target.value)}/></label></div>
  <Feedback action={action}/><div className="community-actions" data-center-form-actions><Button variant="primary" type="submit" disabled={action.busy}>{t('Save')}</Button><Button disabled={action.busy} onClick={()=>navigate(close)}>{t('Cancel')}</Button></div>
 </form>
}
function Achievements({centerId}){
 const resource=useResource(centerId,'achievements'),action=useAction(centerId,resource.refresh),name=useStore(s=>s.user?.name||''),uid=useStore(s=>s.user?.id),[nickname,setNickname]=useState(name)
 const update=async()=>{try{const sync=await useStore.getState().syncNow();if(sync?.status!=='ok')throw new Error('sync unavailable');if(useStore.getState().user?.id===uid)await action.run('reconcile',{})}catch{useUI.getState().toast(t('Could not load community. Try again.'))}}
 return <Section title={t('My achievements')}><div className="community-form"><p className="small muted">{t('Declared training records')}</p><Button disabled={action.busy} onClick={update}>{t('Refresh achievements')}</Button><Feedback resource={resource} action={action}/>{resource.data&&<>
  <label className="community-check"><Switch checked={resource.data.preference.enabled} disabled={action.busy} onChange={enabled=>confirm(enabled?'Enable achievement sharing':'Stop sharing achievements',()=>action.run('preference',{version:resource.data.preference.version,enabled}),!enabled)}/>{t('Enable achievement sharing')}</label><p className="small muted">{t('Achievements are private until you choose to publish each one.')}</p>
  <label className="centers-field"><span>{t('Visible name')}</span><TextField value={nickname} maxLength={40} onChange={e=>setNickname(e.target.value)}/></label>
  {resource.data.items.filter(a=>a.active).map(a=><div className="community-context" key={a.id}><div className="community-achievement"><Icon name="trophy"/><div><h3>{t(badgeLabel(a.badge))}</h3><span className="muted small">{a.date}</span></div></div><Button disabled={action.busy||!resource.data.preference.enabled||!nickname.trim()} onClick={()=>confirm('Publish achievement',()=>action.run('publish',{id:a.id,version:a.version,nickname,consent:true}))}>{t('Publish achievement')}</Button></div>)}
 </>}</div></Section>
}
function Feed({centerId,meta}){
 const resource=useResource(centerId,'feed'),action=useAction(centerId,resource.refresh),[congrats,setCongrats]=useState(null),[body,setBody]=useState('')
 const form=useUnsavedCenterForm(body?body:null,action.busy),symbols={clap:'👏',strength:'💪',fire:'🔥',party:'🎉',heart:'❤️'},navigate=useCenterNavigation()
 return <Section title={t('Center achievements')}><div className="community-form" ref={form}><Feedback resource={resource} action={action}/>{resource.data?.items.map(p=><article className="community-context" key={p.id}><div className="community-achievement"><Icon name="trophy"/><div><h3>{t(badgeLabel(p.badge))}</h3><p>{p.nickname} · {p.date}</p></div></div><div className="community-reactions">{p.reactions.map(r=><Button key={r.kind} disabled={action.busy} aria-pressed={r.mine} aria-label={t('Reaction')+' '+symbols[r.kind]} onClick={()=>action.run('reaction',{id:p.id,kind:r.kind,active:!r.mine})}>{symbols[r.kind]} {r.count||''}</Button>)}</div><details><summary>{t('Who reacted')}</summary>{p.reactions.map(r=>r.count?<p key={r.kind}>{symbols[r.kind]} {r.names.join(', ')}</p>:null)}</details>
  {p.comments.map(m=><div key={m.id}><p>{m.name}: {m.body}</p>{(m.own||meta.capabilities.includes('community.manage'))&&<Button size="sm" disabled={action.busy} onClick={()=>confirm('Delete message',()=>action.run('delete-congratulation',{id:p.id,commentId:m.id,version:m.version}),true)}>{t('Delete')}</Button>}</div>)}
  <div className="community-actions"><Button disabled={action.busy} onClick={()=>navigate(()=>{setCongrats(p.id);setBody('')})}>{t('Congratulate')}</Button><Button disabled={action.busy} onClick={()=>action.run('hide',{id:p.id,hidden:true})}>{t('Hide for me')}</Button>{p.own&&<Button disabled={action.busy} onClick={()=>confirm('Withdraw publication',()=>action.run('withdraw',{id:p.id,version:p.version}),true)}>{t('Withdraw publication')}</Button>}{meta.capabilities.includes('community.manage')&&<Button disabled={action.busy} onClick={()=>confirm('Remove publication',()=>action.run('remove',{id:p.id,version:p.version}),true)}>{t('Remove publication')}</Button>}</div>
  {congrats===p.id&&<form onSubmit={async e=>{e.preventDefault();if(await action.run('congratulate',{id:p.id,body})){setCongrats(null);setBody('')}}}><TextBox label="Your message" value={body} set={setBody} max={280} disabled={action.busy}/><div className="community-actions"><Button variant="primary" type="submit" disabled={action.busy||!body.trim()}>{t('Send')}</Button><Button disabled={action.busy} onClick={()=>navigate(()=>{setCongrats(null);setBody('')})}>{t('Cancel')}</Button></div></form>}
 </article>)}{resource.data&&!resource.data.items.length&&<p className="community-alert">{t('No shared achievements yet')}</p>}<More resource={resource}/></div></Section>
}

function Delegation({centerId}){
 const resource=useResource(centerId,'staff'),action=useAction(centerId,resource.refresh),[account,setAccount]=useState(''),[respond,setRespond]=useState(true),[management,setManagement]=useState(false),[until,setUntil]=useState('')
 const choose=id=>{const row=resource.data?.items.find(g=>g.id===id);setAccount(id);setRespond(row?.version?row.respond:true);setManagement(row?.manage||false);setUntil(row?.validUntil?new Date(row.validUntil).toISOString().slice(0,16):'')}
 return <Section title={t('Community permissions')}><div className="community-form"><p className="community-alert">{t('Only explicitly authorized staff can read member conversations.')}</p><Feedback resource={resource} action={action}/>
 <SelectRow title={t('Staff')} value={account} options={(resource.data?.items||[]).map(g=>({value:g.id,label:g.name+(g.revoked?' · '+t('Disabled'):'' )}))} onChange={choose}/>
 <label className="community-check"><input type="checkbox" checked={respond} onChange={e=>setRespond(e.target.checked)}/>{t('Reply')}</label><label className="community-check"><input type="checkbox" checked={management} onChange={e=>setManagement(e.target.checked)}/>{t('Manage')}</label><label className="centers-field"><span>{t('Until')} · UTC</span><TextField type="datetime-local" value={until} onChange={e=>setUntil(e.target.value)}/></label>
 <div className="community-actions"><Button disabled={action.busy||!account} onClick={()=>confirm('Save community permissions',()=>action.run('grant',{accountUid:account,version:resource.data?.items.find(g=>g.id===account)?.version||0,respond,manage:management,revoked:false,validUntil:until?new Date(until+'Z').toISOString():null}))}>{t('Save')}</Button><Button disabled={action.busy||!resource.data?.items.some(g=>g.id===account&&g.version)} onClick={()=>confirm('Revoke community permissions',()=>action.run('grant',{accountUid:account,version:resource.data.items.find(g=>g.id===account).version,respond:false,manage:false,revoked:true,validUntil:null}),true)}>{t('Revoke')}</Button></div>
 </div></Section>
}
function Assignments({centerId}){
 const [query,setQuery]=useState(''),resource=useResource(centerId,'members',{query}),staff=useResource(centerId,'staff'),action=useAction(centerId,resource.refresh),[member,setMember]=useState(null),[trainer,setTrainer]=useState('')
 return <Section title={t('Assigned trainer')}><div className="community-form"><SearchField value={query} aria-label={t('Search members')} placeholder={t('Search members')} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')}/><Feedback resource={resource} action={action}/>{resource.data?.items.map(m=><Row key={m.id} title={m.name} subtitle={m.number} value={member?.id===m.id?t('Selected'):null} accessory="chevron" onClick={()=>{setMember(m);setTrainer(m.trainerUid||'')}}/>)}<More resource={resource}/>{member&&<><SelectRow title={t('Assigned trainer')} value={trainer} options={[{value:'',label:t('Center team')},...(staff.data?.items||[]).filter(g=>!g.revoked&&(g.respond||g.manage)).map(g=>({value:g.id,label:g.name}))]} onChange={setTrainer}/><Button disabled={action.busy} onClick={()=>confirm('Assign trainer',async()=>{if(await action.run('assign',{memberId:member.id,trainerUid:trainer||null,version:member.version}))setMember(null)})}>{t('Save')}</Button></>}</div></Section>
}
function Content(){
 const uid=useStore(s=>s.user?.id),state=useCenters(),[params,setParams]=useSearchParams(),nav=useNavigate(),navigate=useCenterNavigation(),[choosing,setChoosing]=useState(false),[revision,setRevision]=useState(0)
 const platform=state.ownerUid===uid&&state.platformCapabilities.includes('centers.manage'),known=state.ownerUid===uid?state.centers:[],centerId=params.get('centerId')||'',pane=params.get('pane')||'own',id=params.get('id'),newQuestion=params.get('new')==='1',workoutId=params.get('workoutId')
 useEffect(()=>{if(!centerId&&known.length===1)setParams(previous=>{const next=new URLSearchParams(previous);next.set('centerId',known[0].id);return next},{replace:true})},[centerId,known.length,uid])
 const resource=useResource(centerId,centerId?'meta':null,{},revision),meta=resource.data
 const denied=resource.error?.status===403,ownedReady=state.ownerUid===uid&&state.status==='ready',singleCenter=known.length===1?known[0].id:null
 // An old center link never grants access. Recover only after the server denies it,
 // and discard that center's thread/form identifiers before opening the sole affiliation.
 useEffect(()=>{if(denied&&ownedReady&&!platform&&singleCenter&&singleCenter!==centerId)navigate(()=>setParams({centerId:singleCenter},{replace:true}))},[denied,ownedReady,platform,singleCenter,centerId,uid])
 const change=(values)=>navigate(()=>setParams({...(centerId?{centerId}:{}),...values}))
 const options=meta?[...(meta.capabilities.includes('community.own')?[{value:'own',label:t('My questions')},{value:'achievements',label:t('My achievements')}]:[]),...(meta.capabilities.includes('community.respond')?[{value:'team',label:t('Member questions')}]:[]),{value:'news',label:t('Center news')},{value:'feed',label:t('Center achievements')},...(meta.capabilities.includes('community.manage')?[{value:'assign',label:t('Assigned trainer')}]:[]),...(platform?[{value:'permissions',label:t('Community permissions')}]:[])]:[]
 const current=options.some(o=>o.value===pane)?pane:options[0]?.value||'news'
 const open=threadId=>change({pane:current,id:threadId})
 return <div className="community-page narrow centers-page"><div className="hdr"><button className="iconbtn" aria-label={t('Back')} onClick={()=>navigate(()=>navBack('/home',nav))}><Icon name="chevronLeft"/></button><h1>{t('Community')}</h1></div>
 <div className="community-center-bar"><h2>{meta?.center.name||t('Choose center')}</h2>{(platform||known.length>1)&&<Button size="sm" onClick={()=>navigate(()=>setChoosing(v=>!v))}>{t(choosing?'Cancel':'Change center')}</Button>}</div>
 {(!centerId||choosing||denied&&ownedReady&&known.length>1)&&(platform?<CenterChoices ownerUid={uid} selectedId={centerId} choose={c=>navigate(()=>{setParams({centerId:c.id});setChoosing(false)})}/>:<SelectRow title={t('Center')} value={centerId} options={known.map(c=>({value:c.id,label:c.name}))} onChange={value=>navigate(()=>setParams({centerId:value}))}/>)}
 <Feedback resource={resource}/>{meta&&<CenterWorkspace label={t('Community')} options={options} value={current} onChange={value=>change({pane:value})}>
 {(current==='own'||current==='team')&&(id?<><Button onClick={()=>change({pane:current})}>{t('Back')}</Button><Thread key={centerId+id} centerId={centerId} id={id} revision={revision}/></>:newQuestion&&meta.capabilities.includes('community.own')?<><Button onClick={()=>change({pane:'own'})}>{t('Cancel')}</Button><NewQuestion key={centerId} centerId={centerId} meta={meta} workoutId={workoutId} done={id=>{setRevision(n=>n+1);setParams({centerId,pane:'own',id})}}/></>:<>{current==='own'&&<Button variant="primary" icon="plus" onClick={()=>change({pane:'own',new:'1',...(workoutId?{workoutId}:{})})}>{t('Ask the team')}</Button>}<Inbox key={centerId+current} centerId={centerId} view={current} open={open}/></>)}
 {current==='news'&&<Notices key={centerId} centerId={centerId} meta={meta}/>}{current==='feed'&&<Feed key={centerId} centerId={centerId} meta={meta}/>}{current==='achievements'&&<Achievements key={centerId} centerId={centerId}/>}{current==='permissions'&&platform&&<Delegation key={centerId} centerId={centerId}/>}{current==='assign'&&<Assignments key={centerId} centerId={centerId}/>}
 </CenterWorkspace>}</div>
}
export default function Community(){
 const user=useStore(s=>s.user),config=useStore(s=>s.config)
 if(!user)return <Navigate to="/home" replace/>
 if(config==null)return <ConfigPending title="Community"/>
 if(!config.centers?.enabled)return <Navigate to="/home" replace/>
 return <CenterNavigationGuard key={user.id} contextKey={user.id}><Content/></CenterNavigationGuard>
}
