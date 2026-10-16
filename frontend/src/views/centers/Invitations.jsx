import AccountPicker from './AccountPicker.jsx'
import {useUnsavedCenterForm} from './NavigationGuard.jsx'
import {useEffect,useRef,useState} from 'react'
import {Section,Row,Button,TextField,SelectRow} from '../../components/ui.jsx'
import {confirmSheet} from '../../sheets.jsx'
import {centerInvitations,centerCommand,invitationErrorKey} from '../../lib/centers-api.js'
import {centerInvitationLink} from '../../lib/center-invitation-link.js'
import {t} from '../../lib/i18n.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'

const kindText=kind=>kind==='manager'?t('Center manager'):kind==='trainer'?t('Trainer'):t('Members')
const statusText=invite=>invite.status==='accepted'?t('Invitation accepted'):invite.status==='revoked'?t('Invitation revoked'):invite.expired?t('Invitation expired'):t('Invitation pending')
export default function Invitations({centerId,ownerUid,memberId,linked=false,allowedKinds=['member'],canSearchAccounts=false}) {
  const [kind,setKind]=useState(allowedKinds[0]),[uid,setUid]=useState(''),[invites,setInvites]=useState([]),[revision,setRevision]=useState(0)
  const [link,setLink]=useState(''),[missingLink,setMissingLink]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(null),[requestId,setRequestId]=useState(()=>crypto.randomUUID())
  const saveForm=useUnsavedCenterForm(!linked&&uid?uid:null,busy)
  const [picking,setPicking]=useState(false),[selected,setSelected]=useState(null)
  const selectedNow=useRef(null);selectedNow.current=selected
  const generation=useRef(0),creating=useRef(false)
  useEffect(()=>{
    const epoch=++generation.current;let current=true;setInvites([]);setLink('');setMissingLink(false);setError(null);setBusy(false)
    centerInvitations(centerId,kind,memberId).then(r=>{if(current)setInvites(r.invites)}).catch(e=>{if(current){setError(e);useCenters.getState().revokeOn(e)}})
    return()=>{current=false;if(generation.current===epoch)generation.current++}
  },[centerId,ownerUid,kind,memberId,revision,linked])
  useEffect(()=>{setUid('');setSelected(null);setPicking(false);creating.current=false},[centerId,ownerUid,memberId,kind,linked,canSearchAccounts])
  const fail=e=>{setError(e);if(useStore.getState().user?.id===ownerUid)useCenters.getState().revokeOn(e)}
  const create=async e=>{
    e?.preventDefault();if(busy||creating.current)return;creating.current=true;const epoch=generation.current;setBusy(true);setError(null);setLink('');setMissingLink(false)
    try{
      const result=await centerCommand('/api/centers/invitations/create',{centerId,kind,accountUid:uid.trim(),...(memberId?{memberId}:{}),requestId})
      const url=result.token?await centerInvitationLink(result.token):''
      if(generation.current!==epoch||useStore.getState().user?.id!==ownerUid)return
      setInvites(previous=>[result.invite,...previous.filter(row=>row.id!==result.invite.id)]);setLink(url);setMissingLink(!result.token)
      setRequestId(crypto.randomUUID());setUid('');setSelected(null);setPicking(false)
    }catch(e){if(generation.current===epoch)fail(e)}finally{if(generation.current===epoch){creating.current=false;setBusy(false)}}
  }
  const confirmLink=e=>{
    e.preventDefault();if(!canSearchAccounts||!selected||selected.disabled||busy)return
    const account=selected,epoch=generation.current
    confirmSheet({title:t('Link account'),message:account.name+(account.email?' · '+account.email:''),confirmText:t('Invite account'),onConfirm:()=>{
      if(generation.current!==epoch||useStore.getState().user?.id!==ownerUid||selectedNow.current!==account)return
      return create()
    }})
  }
  const revoke=invite=>{const epoch=generation.current;confirmSheet({title:t('Revoke invitation'),message:invite.accountUid,confirmText:t('Revoke invitation'),danger:true,onConfirm:async()=>{
    if(generation.current!==epoch||useStore.getState().user?.id!==ownerUid)return;setBusy(true);setError(null)
    try{await centerCommand('/api/centers/invitations/revoke',{centerId,id:invite.id,version:invite.version});if(generation.current!==epoch||useStore.getState().user?.id!==ownerUid)return;setRequestId(crypto.randomUUID());setRevision(r=>r+1)}catch(e){if(generation.current===epoch)fail(e)}finally{if(generation.current===epoch)setBusy(false)}
  }})}
  const pending=!!memberId&&invites.some(invite=>invite.status==='pending'&&!invite.expired)
  return <Section title={t('Center invitations')}><div className="centers-form">
    {allowedKinds.length>1&&<SelectRow title={t('Center staff')} value={kind} options={allowedKinds.map(value=>({value,label:kindText(value)}))} onChange={value=>{setKind(value);setRequestId(crypto.randomUUID())}}/>}
    {linked&&<p className="muted">{t('Account linked')}</p>}
    {!linked&&!pending&&<form ref={saveForm} aria-label={t('Center invitations')} onSubmit={canSearchAccounts?confirmLink:create}>
      {canSearchAccounts?<><Button type="button" disabled={busy} onClick={()=>setPicking(value=>!value)}>{t('Link account')}</Button>{selected&&<Row title={selected.name} subtitle={selected.email||selected.id}/>}{picking&&<AccountPicker selected={selected} choose={account=>{if(!busy){setSelected(account);setUid(account?.id||'');setRequestId(crypto.randomUUID())}}}/>}</>:<label className="centers-field"><span>{t('Account ID')}</span><TextField required disabled={busy} maxLength={64} pattern="[a-zA-Z0-9_-]{1,64}" value={uid} onChange={e=>{setUid(e.target.value);setRequestId(crypto.randomUUID())}}/></label>}
      <p className="small muted">{t(canSearchAccounts?'The account holder must accept the invitation to complete the link.':'Create the personal account first, then use its account ID.')}</p>
      <Button type="submit" disabled={busy||!uid.trim()}>{t('Invite account')}</Button>
    </form>}
    {link&&<div className="centers-selected"><label className="centers-field"><span>{t('Invitation link')}</span><TextField readOnly value={link}/></label><Button onClick={()=>navigator.clipboard.writeText(link).catch(fail)}>{t('Copy link')}</Button></div>}
    {(link||missingLink)&&<p className="small muted">{t('The link is shown once. If lost, revoke and create another.')}</p>}
    {invites.map(invite=><Row className="centers-change-row" key={invite.id} title={invite.accountUid} subtitle={kindText(invite.kind)} value={statusText(invite)}>
      {invite.status==='pending'&&<Button disabled={busy} onClick={()=>revoke(invite)}>{t('Revoke invitation')}</Button>}
    </Row>)}
    {error&&<p role="alert">{t(invitationErrorKey(error))}</p>}
  </div></Section>
}
