import CenterTabBar from './CenterTabBar.jsx'
import Activations from './Activations.jsx'
import PassManagement from './PassManagement.jsx'
import CenterWorkspace from './CenterWorkspace.jsx'
import Retention from './Retention.jsx'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {navBack,onSheetEntry} from '../../lib/nav.js'
import { useStore } from '../../store/useStore.js'
import { useCenters } from '../../store/useCenters.js'
import { t } from '../../lib/i18n.js'
import { platformCenters, centerCommand, centerDetail, centerStaff, centersErrorKey } from '../../lib/centers-api.js'
import { Button, TextField, NumberField, Section, Row, SearchField, Switch, SelectRow } from '../../components/ui.jsx'
import { confirmSheet } from '../../sheets.jsx'
import { useUI } from '../../store/useUI.js'
import Icon from '../../components/Icon.jsx'
import './centers.css'
import Members from './Members.jsx'
import Classes from './Classes.jsx'
import Invitations from './Invitations.jsx'
import MembershipPlans from './MembershipPlans.jsx'
import RefundGrant from './RoleCapabilityGrant.jsx'
import DebtCalendar from './DebtCalendar.jsx'
import BillingAutomation from './BillingAutomation.jsx'
import NotificationSettings from './NotificationSettings.jsx'
import ConfigPending from './ConfigPending.jsx'
import StripePayments from './StripePayments.jsx'
import AccessPanel from './AccessPanel.jsx'
import Metrics from './Metrics.jsx'
import {useAutoMore} from '../../lib/use-auto-more.js'
import TimeField from '../../components/TimeField.jsx'
import AccountPicker from './AccountPicker.jsx'
import CenterNavigationGuard,{useCenterNavigation,useUnsavedCenterForm} from './NavigationGuard.jsx'

const stateLabel = state => state === 'active' ? t('Active center') : state === 'inactive' ? t('Inactive center') : t('Draft center')
const fieldsOf = center => ({ name: center?.name || '', taxId: center?.taxId || '', address: center?.address || '',
  contactEmail: center?.contactEmail || '', phone: center?.phone || '', timezone: center?.timezone || 'Europe/Madrid',
  capacity: center?.capacity ?? null, billingDay: center?.billingDay || 1, openingHours: center?.openingHours || {} })

function Fields({ value, change, disabled=false, mode='all' }) {
  const field = (key, label, type = 'text') => <label className="centers-field"><span>{label}</span>
    <TextField type={type} value={value[key]} onChange={e => change({ ...value, [key]: e.target.value })} required={key === 'name'} />
  </label>
  return <fieldset disabled={disabled} className="centers-fields">
    {mode!=='hours'&&<>{field('name', t('Center name'))}{field('taxId', t('Tax ID'))}{field('address', t('Center address'))}
    {field('contactEmail', t('Contact email'), 'email')}{field('phone', t('Phone'))}{field('timezone', t('Time zone'))}
    <label className="centers-field"><span>{t('Center capacity')}</span><NumberField className="field" nullable decimal={false} value={value.capacity} onChange={capacity => change({ ...value, capacity })} /></label>
    <label className="centers-field"><span>{t('Billing day')}</span><NumberField className="field" decimal={false} value={value.billingDay} onChange={billingDay => change({ ...value, billingDay })} /></label></>}
    {mode!=='details'&&<div className="centers-hours"><h3>{t('Opening hours')}</h3>{[1, 2, 3, 4, 5, 6, 0].map(day => {
      const interval = value.openingHours[day]?.[0]
      const names = [t('Sunday'), t('Monday'), t('Tuesday'), t('Wednesday'), t('Thursday'), t('Friday'), t('Saturday')]
      const set = next => change({ ...value, openingHours: { ...value.openingHours, [day]: next } })
      return <div key={day} className="centers-hour-day"><div className="centers-actions"><span>{names[day]}</span>
        <Switch type="button" aria-label={names[day]} checked={!!interval} onChange={enabled => set(enabled ? [['08:00', '22:00']] : [])} />
        </div>{(value.openingHours[day] || []).map((pair,index) => <div key={index} className="centers-hour-row">
          <label className="centers-field"><span>{t('From')}</span><TimeField required aria-label={names[day] + ' ' + t('From') + (index?' '+(index+1):'')} value={pair[0]} onChange={next => set(value.openingHours[day].map((p,i) => i === index ? [next,p[1]] : p))}/></label>
          <label className="centers-field"><span>{t('To')}</span><TimeField required allowEnd aria-label={names[day] + ' ' + t('To') + (index?' '+(index+1):'')} value={pair[1]} onChange={next => set(value.openingHours[day].map((p,i) => i === index ? [p[0],next] : p))}/></label>
          <Button variant="ghost" className="centers-hour-remove" type="button" title={t('Remove')+': '+names[day]+' '+(index+1)} aria-label={t('Remove')+': '+names[day]+' '+(index+1)} onClick={() => set(value.openingHours[day].filter((_,i) => i !== index))}><Icon name="trash"/></Button>
        </div>)}{interval && value.openingHours[day].length < 4 && value.openingHours[day].at(-1)[1] !== "24:00" && <div className="centers-hour-footer"><Button variant="tinted" type="button" onClick={() => set([...value.openingHours[day], [value.openingHours[day].at(-1)[1], '24:00']])}><Icon name="plus"/>{t('Add time interval')}</Button></div>}
      </div>
    })}</div>}
  </fieldset>
}

function NewCenter({ close, created, ownerUid }) {
  const [step, setStep] = useState(1), [fields, setFields] = useState(() => fieldsOf()), [manager, setManager] = useState(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(null)
  const [requestId] = useState(() => crypto.randomUUID())
  useUnsavedCenterForm(JSON.stringify(fields)!==JSON.stringify(fieldsOf())||manager?JSON.stringify([fields,manager?.id]):null,busy)
  const life=useRef(0),pending=useRef(false)
  const current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  useEffect(()=>{life.current++;return()=>{life.current++;pending.current=false}},[ownerUid])
  const submit = async e => {
    e.preventDefault()
    if(pending.current)return
    if (step < 3) { setStep(step + 1); return }
    const epoch=life.current;pending.current=true
    setBusy(true); setError(null)
    try { const result = await centerCommand('/api/platform/centers/create', { ...fields, managerUid: manager?.id, requestId }); if(current(epoch))created(result.center) }
    catch (e) { if(current(epoch)){setError(e);useCenters.getState().revokeOn(e)} }
    finally { if(current(epoch)){pending.current=false;setBusy(false)} }
  }
  return <Section title={t('New center')}><form onSubmit={submit} className="centers-form">
    <div className="small muted">{step} / 3</div>
    {step === 1 && <Fields value={fields} change={setFields} disabled={busy}/>}
    {step === 2 && <><h3>{t('Center manager')}</h3><AccountPicker selected={manager} choose={setManager} /><p className="small muted">{t('A draft stays inactive until a manager is assigned.')}</p></>}
    {step === 3 && <div><h3>{t('Review')}</h3><p><strong>{fields.name}</strong></p><p>{fields.address}</p><p>{manager?.name || t('Draft center')}</p><p className="small muted">{fields.timezone} · EUR · {t('Billing day')}: {fields.billingDay}</p></div>}
    {error && <p role="alert">{t(centersErrorKey(error))}</p>}
    <div className="centers-actions"><Button type="button" onClick={step > 1 ? () => setStep(step - 1) : close} disabled={busy}>{step > 1 ? t('Back') : t('Cancel')}</Button>
      <Button type="submit" variant="primary" disabled={busy || !fields.name.trim()}>{step < 3 ? t('Next') : manager ? t('Create center') : t('Create draft')}</Button></div>
  </form></Section>
}

function CenterPanel({ center, platform, capabilities, close, refresh, ownerUid, pane='details',setPane,metricPeriod,setMetricPeriod,importId,onImport }) {
  const canMembers=capabilities.some(c=>['members.read','members.operational.read'].includes(c))
  const activationPane=(platform||capabilities.includes('members.manage'))&&pane==='activations'
  const memberPane=canMembers&&pane==='members'
  const canPlans=capabilities.includes('plans.manage'),planPane=canPlans&&pane==='plans'
  const canPasses=canPlans||capabilities.includes('billing.read'),passesPane=canPasses&&pane==='passes'
  const canBilling=capabilities.includes('billing.read'),billingPane=canBilling&&pane==='billing'
  const canAccess=capabilities.includes('access.manage'),accessPane=canAccess&&pane==='access'
  const metricsPane=canBilling&&pane==='metrics'
  const canClasses=capabilities.includes('classes.read'),classesPane=canClasses&&pane==='classes'
  const [editing,setEditing]=useState(null)
  const requestNavigation=useCenterNavigation()
  const canEdit=platform||capabilities.includes('center.update')
  const [fields, setFields] = useState(() => fieldsOf(center)), [staff, setStaff] = useState([]), [manager, setManager] = useState(null)
  const [trainerUid, setTrainerUid] = useState(''), [replaceId, setReplaceId] = useState(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(null)
  const detailsPane=!activationPane&&!memberPane&&!planPane&&!passesPane&&!billingPane&&!accessPane&&!metricsPane&&!classesPane
  const fieldsDirty=JSON.stringify(fields)!==JSON.stringify(fieldsOf(center))
  const saveForm=useUnsavedCenterForm(detailsPane&&editing&&fieldsDirty?JSON.stringify(fields):null,busy&&!!editing)
  useUnsavedCenterForm(detailsPane&&(manager||trainerUid||replaceId)?JSON.stringify([manager?.id,trainerUid,replaceId]):null,busy&&!editing,{saveable:false})
  useEffect(()=>{if(editing)saveForm.current?.querySelector('input')?.focus()},[editing])
  const cancelEdit=()=>requestNavigation(()=>{setFields(fieldsOf(center));setEditing(null);setError(null)},{form:saveForm})
  const life=useRef(0),pending=useRef(false),permissionKey=capabilities.join('|')
  const current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  useEffect(()=>{life.current++;pending.current=false;setBusy(false);setError(null);return()=>{life.current++;pending.current=false}},[center.id,center.version,ownerUid,pane,permissionKey])
  useEffect(() => { setEditing(null);setFields(fieldsOf(center));setManager(null);setTrainerUid('');setReplaceId(null) }, [center,pane,permissionKey])
  useEffect(() => { let current = true; setStaff([]); if (platform || capabilities.includes('staff.manage')) centerStaff(center.id).then(r => { if (current) setStaff(r.staff) }).catch(e => { if (current) setError(e) }); return () => { current = false } }, [center, platform, capabilities])
  const perform = async (path, body, epoch=life.current) => {
    if(!current(epoch)||pending.current)return;pending.current=true
    setBusy(true); setError(null)
    try { await centerCommand(path, body); if (!current(epoch)) return; useUI.getState().toast(t('Saved')); setEditing(null); refresh(); setManager(null); setTrainerUid(''); setReplaceId(null) }
    catch (e) { if(current(epoch)){setError(e);useCenters.getState().revokeOn(e)} }
    finally { if(current(epoch)){pending.current=false;setBusy(false)} }
  }
  const deactivate=()=>{
    const epoch=life.current
    confirmSheet({title:t('Confirm deactivation'),message:center.name,confirmText:t('Deactivate center'),danger:true,onConfirm:()=>perform(updatePath,{...fields,centerId:center.id,version:center.version,state:'inactive'},epoch)})
  }
  const updatePath = platform ? '/api/platform/centers/update' : '/api/centers/update'
  const sections=[{value:'details',label:t('Center details')},...((platform||capabilities.includes('members.manage'))?[{value:'activations',label:t('Pending activations')}]:[]),...(canMembers?[{value:'members',label:t('Members')}]:[]),...(canPlans?[{value:'plans',label:t('Membership plans')}]:[]),...(canPasses?[{value:'passes',label:t('Visit passes')}]:[]),...(canClasses?[{value:'classes',label:t('Classes')}]:[]),...(canBilling?[{value:'billing',label:t('Debt and calendar')},{value:'metrics',label:t('Center metrics')}]:[]),...(canAccess?[{value:'access',label:t('Center access')}]:[])]
  const selectedPane=activationPane?'activations':classesPane?'classes':memberPane?'members':planPane?'plans':passesPane?'passes':billingPane?'billing':accessPane?'access':metricsPane?'metrics':'details'
  return <article className="centers-center-workspace">
    <header className="centers-center-header"><div><h2>{center.name}</h2><span className="centers-member-status">{stateLabel(center.state)}</span></div><Button type="button" icon="chevronLeft" onClick={close}>{t('Back')}</Button></header>
    <CenterWorkspace label={center.name} options={sections} value={selectedPane} onChange={setPane}>
    {detailsPane&&!activationPane&&<Section className="centers-profile" title={t('Center details')}><div className="centers-form">
    {canEdit&&editing?<form ref={saveForm} className="centers-profile-editor" aria-label={t('Center details')} onSubmit={e => { e.preventDefault(); perform(updatePath, { ...fields, centerId: center.id, version: center.version }) }}>
      <h3>{t(editing==='hours'?'Edit opening hours':'Edit center')}</h3><Fields value={fields} change={setFields} disabled={busy} mode={editing}/>
      <div className="centers-form-actions" data-center-form-actions><Button type="submit" variant="primary" disabled={busy||!fieldsDirty}>{t(busy?'Saving…':'Save')}</Button><Button type="button" disabled={busy} onClick={cancelEdit}>{t('Cancel')}</Button></div>
    </form>:<>
      <details className="centers-profile-info"><summary>{t('Center details')}</summary><div className="centers-profile-info-body">
      <div className="centers-profile-heading">{canEdit&&<Button type="button" variant="tinted" icon="pencil" onClick={()=>setEditing('details')}>{t('Edit center')}</Button>}</div>
      <dl className="centers-profile-data">{[['name','Center name'],['taxId','Tax ID'],['address','Center address'],['contactEmail','Contact email'],['phone','Phone'],['timezone','Time zone'],['capacity','Center capacity'],['billingDay','Billing day']].map(([key,label])=><div key={key}><dt>{t(label)}</dt><dd>{fields[key]===null||fields[key]===''?'—':fields[key]}</dd></div>)}</dl>
      </div></details>
      <div className="centers-profile-heading centers-profile-hours-heading"><h3><Icon name="clock"/>{t('Opening hours')}</h3>{canEdit&&<Button type="button" icon="pencil" onClick={()=>setEditing('hours')}>{t('Edit opening hours')}</Button>}</div>
      <div className="centers-profile-week">{[1,2,3,4,5,6,0].map(day=><div className={'centers-profile-day'+(fields.openingHours[day]?.length?'':' is-closed')} key={day}><strong>{t(['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day])}</strong><div>{fields.openingHours[day]?.length?fields.openingHours[day].map((pair,i)=><span key={i}>{pair[0]} <span className="muted">–</span> {pair[1]}</span>):<span className="muted">{t('Closed')}</span>}</div></div>)}</div>
    </>}
    {!editing&&(staff.length>0||platform||capabilities.includes('staff.manage'))&&<details className="centers-profile-management"><summary><Icon name="chevronRight"/><span>{t('Center staff')}</span><Icon name="gear"/></summary><div className="centers-profile-management-body">
    {staff.length > 0 && <div><h3>{t('Center staff')}</h3>{staff.map(role => <div key={role.id} className="centers-staff-row"><div><strong>{role.role === 'manager' ? t('Center manager') : t('Trainer')}</strong><div className="small muted">{role.accountUid}</div></div>
      {role.revoked ? <span className="muted small">{t('Revoked role')}</span> : (platform || role.role === 'trainer') && <div className="centers-actions">{platform && role.role==='manager' && <Button onClick={() => setReplaceId(role.id)}>{t('Replace')}</Button>}<Button disabled={busy} onClick={() => perform(platform ? '/api/platform/centers/revoke-role' : '/api/centers/staff/revoke', { centerId: center.id, version: center.version, assignmentId: role.id })}>{t('Revoke role')}</Button></div>}
      {platform&&!role.revoked&&role.role==='manager'&&<><RefundGrant centerId={center.id} role={role} ownerUid={ownerUid} saved={refresh}/><RefundGrant centerId={center.id} role={role} ownerUid={ownerUid} saved={refresh} capability="data.export"/></>}
    </div>)}</div>}
    {capabilities.includes('staff.manage') && <div><h3>{t('Trainer')}</h3><label className="centers-field"><span>{t('Account ID')}</span><TextField value={trainerUid} onChange={e => setTrainerUid(e.target.value)} /></label><Button disabled={busy || !trainerUid.trim()} onClick={() => perform('/api/centers/staff/assign', { centerId: center.id, version: center.version, accountUid: trainerUid.trim() })}>{t('Save')}</Button></div>}
    {platform && <div><h3>{replaceId ? t('Replace') : t('Assign manager')}</h3>{replaceId && <Button onClick={() => setReplaceId(null)}>{t('Cancel')}</Button>}<AccountPicker selected={manager} choose={setManager} /><Button disabled={busy || !manager} onClick={() => perform('/api/platform/centers/assign-manager', { centerId: center.id, version: center.version, accountUid: manager.id, ...(replaceId ? { replaceAssignmentId: replaceId } : {}) })}>{t('Assign manager')}</Button>
      {center.state !== 'inactive' && <div className="centers-actions"><Button variant="danger" disabled={busy} onClick={deactivate}>{t('Deactivate center')}</Button></div>}
      {center.state === 'inactive' && <Button disabled={busy} onClick={() => perform(updatePath, { ...fields, centerId: center.id, version: center.version, state: 'active' })}>{t('Activate center')}</Button>}
    </div>}
    </div></details>}
    {error && <p role="alert">{t(centersErrorKey(error))}</p>}
    </div></Section>}
    {activationPane?<Activations centerId={center.id} ownerUid={ownerUid}/>:passesPane?<PassManagement centerId={center.id} ownerUid={ownerUid} capabilities={capabilities} active={center.state==='active'}/>:classesPane?<Classes centerId={center.id} ownerUid={ownerUid} canManage={capabilities.includes('classes.manage')}/>:metricsPane?<><Metrics key={'metrics:'+center.id} centerId={center.id} ownerUid={ownerUid} timezone={center.timezone} canViewMembers={canMembers} onNavigate={value=>{if(value==='billing'||value==='members'&&canMembers)setPane(value)}} period={metricPeriod} onPeriod={setMetricPeriod}/>{capabilities.includes('members.manage')&&<Retention centerId={center.id} ownerUid={ownerUid}/>}</>:accessPane?<AccessPanel key={'access:'+center.id} centerId={center.id} ownerUid={ownerUid} active={center.state==='active'} canManage={capabilities.includes('access.manage')} canVerify={capabilities.includes('access.verify')} timezone={center.timezone}/>:billingPane?<><DebtCalendar key={center.id} centerId={center.id} ownerUid={ownerUid} canRecord={capabilities.includes('payments.record')} canExport={capabilities.includes('data.export')}/><StripePayments key={'stripe:'+center.id} centerId={center.id} ownerUid={ownerUid} canReconcile={capabilities.includes('payments.record')}/><BillingAutomation key={'automation:'+center.id} centerId={center.id} ownerUid={ownerUid} platform={platform} active={center.state==='active'}/><NotificationSettings key={'notifications:'+center.id} centerId={center.id} ownerUid={ownerUid} platform={platform} active={center.state==='active'}/></>:planPane?<><MembershipPlans key={center.id} centerId={center.id} ownerUid={ownerUid}/></>:memberPane?<Members platform={platform} key={center.id} centerId={center.id} ownerUid={ownerUid} capabilities={capabilities} active={center.state==='active'} centerState={center.state} onDetails={()=>setPane('details')} onPlans={()=>setPane('plans')} importId={importId} onImport={onImport}/>:
    (platform||capabilities.includes('staff.manage'))&&<Invitations key={center.id} centerId={center.id} ownerUid={ownerUid} allowedKinds={platform?['manager','trainer']:['trainer']}/>}
    </CenterWorkspace>
  </article>
}

function Content({ user }) {
  const nav = useNavigate(), state = useCenters(),[params,setParams]=useSearchParams()
  const requestNavigation=useCenterNavigation()
  const centerId=params.get('centerId'),pane=params.get('pane')||'details'
  const platform = state.platformCapabilities.includes('centers.manage')
  const canGlobalMetrics=platform&&state.platformCapabilities.includes('metrics.global.read'),globalMetrics=canGlobalMetrics&&!centerId&&pane==='metrics'
  const [listed, setListed] = useState([]), [creating, setCreating] = useState(false), [detail, setDetail] = useState(null), [error, setError] = useState(null), [refreshKey, setRefreshKey] = useState(0)
  const query=params.get('q')||'',[draft,setDraft]=useState(query),[cursor,setCursor]=useState(null),[listLoading,setListLoading]=useState(false),listLife=useRef(0),listPending=useRef(false)
  const listRoute='/centers'+(query?'?'+new URLSearchParams({q:query}):'')
  const back=parent=>requestNavigation(()=>navBack(parent,nav))
  const importId=params.get('importId')||null
  const onImport=id=>{const next=new URLSearchParams(params);if(id)next.set('importId',id);else next.delete('importId');setParams(next,{replace:true})}
  const metricPeriod=params.has('from')||params.has('to')?{from:params.get('from')||'',to:params.get('to')||''}:null
  const setMetricPeriod=values=>{
    if(values.from?params.get('from')===values.from&&params.get('to')===values.to:!params.has('from')&&!params.has('to'))return
    const next=new URLSearchParams(params);next.delete('from');next.delete('to');if(values.from){next.set('from',values.from);next.set('to',values.to)}setParams(next)
  }
  useEffect(()=>setDraft(query),[query])
  useEffect(()=>{if(centerId||creating||globalMetrics||draft===query)return;const timer=setTimeout(()=>setParams(draft.trim()?{q:draft.trim()}:{},{replace:true}),250);return()=>clearTimeout(timer)},[draft,query,centerId,creating,globalMetrics,setParams])
  const refresh = () => { if (useStore.getState().user?.id !== user.id) return; setDetail(null); setRefreshKey(k => k + 1); useCenters.getState().load(user.id) }
  const selectCenterNow=id=>{state.select(id||null);setCreating(false);setParams({...(id?{centerId:id}:{}),...(query?{q:query}:{})},{replace:onSheetEntry()})}
  const selectCenter=id=>requestNavigation(()=>selectCenterNow(id))
  useEffect(()=>{if(state.ownerUid===user.id&&state.status==='ready'&&state.selectedId!==centerId)state.select(centerId)},[centerId,state.ownerUid,state.status,state.selectedId,user.id])
  useEffect(() => {
    const epoch=++listLife.current;let current = true
    setListed([]);setCursor(null);setListLoading(false);listPending.current=false;setError(null)
    if (state.status !== 'ready' || state.ownerUid !== user.id) return
    if (platform) {listPending.current=true;setListLoading(true);platformCenters({query}).then(r => { if (current&&useStore.getState().user?.id===user.id){setListed(r.centers);setCursor(r.nextCursor||null)} }).catch(e => { if (current&&useStore.getState().user?.id===user.id) { setError(e); useCenters.getState().revokeOn(e) } }).finally(()=>{if(current&&listLife.current===epoch){listPending.current=false;setListLoading(false)}})}
    else setListed(state.centers)
    return () => { current = false;listLife.current++;listPending.current=false }
  }, [platform, state.centers, state.status, state.ownerUid, user.id, refreshKey,query])
  const more=async()=>{
    if(!platform||!cursor||listPending.current)return;const epoch=listLife.current;listPending.current=true;setListLoading(true)
    try{const result=await platformCenters({query,cursor});if(epoch===listLife.current&&useStore.getState().user?.id===user.id){setListed(rows=>[...rows,...result.centers]);setCursor(result.nextCursor||null)}}catch(e){if(epoch===listLife.current&&useStore.getState().user?.id===user.id){setError(e);useCenters.getState().revokeOn(e)}}finally{if(epoch===listLife.current){listPending.current=false;setListLoading(false)}}
  }
  const moreRef=useAutoMore(more)
  useEffect(() => {
    let current = true
    setDetail(null);setError(null)
    if (!centerId || state.ownerUid !== user.id||state.status!=='ready') return
    centerDetail(centerId).then(r => { if (current) setDetail(r.center) }).catch(e => { if (current) { setError(e); useCenters.getState().revokeOn(e) } })
    return () => { current = false }
  }, [centerId, state.ownerUid,state.status, state.centers, user.id, refreshKey])
  const selected = state.centers.find(c => c.id === centerId)
  const choices=listed.filter(c=>platform||c.capabilities?.includes('center.read'))
  if(detail?.id===centerId&&!choices.some(c=>c.id===centerId))choices.push(detail)
  return <div className="narrow centers-page"><div className="hdr"><button className="iconbtn" onClick={() => back(centerId||globalMetrics?listRoute:'/home')} aria-label={t('Back')}><Icon name="chevronLeft" /></button><h1>{t('Manage centers')}</h1></div>
    {!centerId&&<div className="centers-actions"><Button variant="tinted" onClick={()=>requestNavigation(refresh)}>{t('Reload centers')}</Button>{canGlobalMetrics&&!globalMetrics&&<Button variant="tinted" onClick={()=>requestNavigation(()=>{state.select(null);setCreating(false);setParams({pane:'metrics',...(query?{q:query}:{})},{replace:onSheetEntry()})})}>{t('Global center metrics')}</Button>}{platform && <Button variant="primary" onClick={() => requestNavigation(()=>{ state.select(null); setCreating(true) })}>{t('New center')}</Button>}</div>}
    {platform&&!centerId&&!creating&&!globalMetrics&&<SearchField value={draft} onChange={e=>setDraft(e.target.value)} placeholder={t('Search…')} aria-label={t('Search…')}/>}
    {(state.status === 'loading' || state.ownerUid !== user.id||listLoading) && <p className="muted" role="status">{t('Loading centers')}</p>}
    {(error || state.error) && <p role="alert">{t(centersErrorKey(error || state.error))}</p>}
    {state.status==='ready'&&state.ownerUid===user.id&&choices.length>0&&!creating&&<SelectRow title={t('Center details')} value={centerId||''} options={[{value:'',label:t('Manage centers')},...choices.map(c=>({value:c.id,label:c.name}))]} onChange={selectCenter}/>}
    {state.status === 'ready' && state.ownerUid === user.id && (creating && platform ? <NewCenter ownerUid={user.id} close={() => requestNavigation(()=>setCreating(false))} created={center => { if (useStore.getState().user?.id !== user.id) return; selectCenterNow(center.id); refresh() }} /> : globalMetrics ? <Metrics key={'global:'+user.id} ownerUid={user.id} global period={metricPeriod} onPeriod={setMetricPeriod}/> : detail?.id===centerId&&detail ? <CenterPanel key={user.id+':'+centerId} ownerUid={user.id} center={detail} platform={platform} capabilities={platform ? state.platformCapabilities : selected?.capabilities || []} close={() => back(listRoute)} refresh={refresh} metricPeriod={metricPeriod} setMetricPeriod={setMetricPeriod} importId={importId} onImport={onImport} pane={pane} setPane={value=>{if(value!==pane)requestNavigation(()=>setParams({centerId,pane:value,...(query?{q:query}:{})},{replace:onSheetEntry()}))}}/> : centerId ? <p role="status">{t('Loading centers')}</p> : <div className="centers-list">{!listed.length&&!listLoading && <p className="muted">{t('No centers available')}</p>}{listed.map(center => {
      const canOpen = platform || center.capabilities?.includes('center.read')
      return <Section key={center.id}><Row title={center.name} subtitle={stateLabel(center.state)} value={canOpen ? t('Center details') : null} accessory={canOpen ? 'chevron' : 'none'} onClick={canOpen ? () => selectCenter(center.id) : undefined} /></Section>
    })}{cursor&&<div ref={moreRef}><Button disabled={listLoading} onClick={more}>{t('Show more')}</Button></div>}</div>)}
  </div>
}

export default function Centers() {
  const user = useStore(s => s.user), config = useStore(s => s.config),[params]=useSearchParams()
  const location=useLocation()
  if (!user) return <Navigate to="/home" replace />
  if(config==null)return <ConfigPending fallback={params.get('centerId')||params.get('pane')==='metrics'?'/centers':'/home'}/>
  if(!config.centers?.enabled)return <Navigate to="/home" replace />
  return <CenterNavigationGuard key={user.id} contextKey={location.pathname+location.search}><Content user={user}/><CenterTabBar/></CenterNavigationGuard>
}
