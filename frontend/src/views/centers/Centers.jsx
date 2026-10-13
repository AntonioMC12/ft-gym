import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { useCenters } from '../../store/useCenters.js'
import { t } from '../../lib/i18n.js'
import { platformCenters, centerAccounts, centerCommand, centerDetail, centerStaff, centersErrorKey } from '../../lib/centers-api.js'
import { Button, TextField, NumberField, Section } from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import './centers.css'

const stateLabel = state => state === 'active' ? t('Active center') : state === 'inactive' ? t('Inactive center') : t('Draft center')
const fieldsOf = center => ({ name: center?.name || '', taxId: center?.taxId || '', address: center?.address || '',
  contactEmail: center?.contactEmail || '', phone: center?.phone || '', timezone: center?.timezone || 'Europe/Madrid',
  capacity: center?.capacity ?? null, billingDay: center?.billingDay || 1, openingHours: center?.openingHours || {} })

function Fields({ value, change }) {
  const field = (key, label, type = 'text') => <label className="centers-field"><span>{label}</span>
    <TextField type={type} value={value[key]} onChange={e => change({ ...value, [key]: e.target.value })} required={key === 'name'} />
  </label>
  return <div className="centers-fields">
    {field('name', t('Center name'))}{field('taxId', t('Tax ID'))}{field('address', t('Center address'))}
    {field('contactEmail', t('Contact email'), 'email')}{field('phone', t('Phone'))}{field('timezone', t('Time zone'))}
    <label className="centers-field"><span>{t('Center capacity')}</span><NumberField className="field" nullable decimal={false} value={value.capacity} onChange={capacity => change({ ...value, capacity })} /></label>
    <label className="centers-field"><span>{t('Billing day')}</span><NumberField className="field" decimal={false} value={value.billingDay} onChange={billingDay => change({ ...value, billingDay })} /></label>
    <div className="centers-hours"><h3>{t('Opening hours')}</h3>{[1, 2, 3, 4, 5, 6, 0].map(day => {
      const interval = value.openingHours[day]?.[0]
      const names = [t('Sunday'), t('Monday'), t('Tuesday'), t('Wednesday'), t('Thursday'), t('Friday'), t('Saturday')]
      const set = next => change({ ...value, openingHours: { ...value.openingHours, [day]: next } })
      return <div key={day} className="centers-hour-day"><div className="centers-actions"><span>{names[day]}</span>
        <Button type="button" onClick={() => set(interval ? [] : [['08:00', '22:00']])}>{interval ? t('On') : t('Off')}</Button>
        </div>{(value.openingHours[day] || []).map((pair,index) => <div key={index} className="centers-hour-row">
          <TextField type="time" aria-label={names[day] + ' ' + t('From') + (index ? ' ' + (index + 1) : '')} value={pair[0]} onChange={e => set(value.openingHours[day].map((p,i) => i === index ? [e.target.value,p[1]] : p))} />
          <TextField placeholder="HH:mm" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00" aria-label={names[day] + ' ' + t('To') + (index ? ' ' + (index + 1) : '')} value={pair[1]} onChange={e => set(value.openingHours[day].map((p,i) => i === index ? [p[0],e.target.value] : p))} />
          <Button type="button" onClick={() => set(value.openingHours[day].filter((_,i) => i !== index))}>{t('Remove')}</Button>
        </div>)}{interval && value.openingHours[day].length < 4 && value.openingHours[day].at(-1)[1] !== "24:00" && <Button type="button" onClick={() => set([...value.openingHours[day], [value.openingHours[day].at(-1)[1], '24:00']])}>{t('Add')}</Button>}
      </div>
    })}</div>
  </div>
}

function AccountPicker({ selected, choose }) {
  const [query, setQuery] = useState(''), [accounts, setAccounts] = useState([]), [error, setError] = useState(null)
  useEffect(() => {
    let current = true
    setAccounts([]); setError(null)
    if (query.trim().length < 2) return
    const timer = setTimeout(() => centerAccounts(query).then(result => { if (current) setAccounts(result.accounts) }).catch(e => { if (current) setError(e) }), 250)
    return () => { current = false; clearTimeout(timer) }
  }, [query])
  return <div>
    <label className="centers-field"><span>{t('Search by name or account ID')}</span><TextField value={query} onChange={e => setQuery(e.target.value)} /></label>
    {selected && <div className="centers-selected"><strong>{selected.name}</strong><span className="small muted">{selected.id}</span><Button type="button" onClick={() => choose(null)}>{t('Cancel')}</Button></div>}
    {accounts.map(account => <Button className="centers-account" key={account.id} type="button" disabled={account.disabled} onClick={() => choose(account)}>{account.name}<span className="small muted">{account.id}</span></Button>)}
    {error && <p role="alert">{t(centersErrorKey(error))}</p>}
  </div>
}

function NewCenter({ close, created, ownerUid }) {
  const [step, setStep] = useState(1), [fields, setFields] = useState(() => fieldsOf()), [manager, setManager] = useState(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(null)
  const [requestId] = useState(() => crypto.randomUUID())
  const submit = async e => {
    e.preventDefault()
    if (step < 3) { setStep(step + 1); return }
    setBusy(true); setError(null)
    try { const result = await centerCommand('/api/platform/centers/create', { ...fields, managerUid: manager?.id, requestId }); created(result.center) }
    catch (e) { setError(e); if (useStore.getState().user?.id === ownerUid) useCenters.getState().revokeOn(e) }
    finally { setBusy(false) }
  }
  return <Section title={t('New center')}><form onSubmit={submit} className="centers-form">
    <div className="small muted">{step} / 3</div>
    {step === 1 && <Fields value={fields} change={setFields} />}
    {step === 2 && <><h3>{t('Center manager')}</h3><AccountPicker selected={manager} choose={setManager} /><p className="small muted">{t('A draft stays inactive until a manager is assigned.')}</p></>}
    {step === 3 && <div><h3>{t('Review')}</h3><p><strong>{fields.name}</strong></p><p>{fields.address}</p><p>{manager?.name || t('Draft center')}</p><p className="small muted">{fields.timezone} · EUR · {t('Billing day')}: {fields.billingDay}</p></div>}
    {error && <p role="alert">{t(centersErrorKey(error))}</p>}
    <div className="centers-actions"><Button type="button" onClick={step > 1 ? () => setStep(step - 1) : close} disabled={busy}>{step > 1 ? t('Back') : t('Cancel')}</Button>
      <Button type="submit" variant="primary" disabled={busy || !fields.name.trim()}>{step < 3 ? t('Next') : manager ? t('Create center') : t('Create draft')}</Button></div>
  </form></Section>
}

function CenterPanel({ center, platform, capabilities, close, refresh, ownerUid }) {
  const [fields, setFields] = useState(() => fieldsOf(center)), [staff, setStaff] = useState([]), [manager, setManager] = useState(null)
  const [trainerUid, setTrainerUid] = useState(''), [replaceId, setReplaceId] = useState(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [confirmed, setConfirmed] = useState(false)
  useEffect(() => { setFields(fieldsOf(center)); setConfirmed(false) }, [center])
  useEffect(() => { let current = true; setStaff([]); if (platform || capabilities.includes('staff.manage')) centerStaff(center.id).then(r => { if (current) setStaff(r.staff) }).catch(e => { if (current) setError(e) }); return () => { current = false } }, [center, platform, capabilities])
  const perform = async (path, body) => {
    setBusy(true); setError(null)
    try { await centerCommand(path, body); refresh(); setManager(null); setReplaceId(null) }
    catch (e) { setError(e); if (useStore.getState().user?.id === ownerUid) useCenters.getState().revokeOn(e) }
    finally { setBusy(false) }
  }
  const updatePath = platform ? '/api/platform/centers/update' : '/api/centers/update'
  return <Section title={center.name}><div className="centers-form">
    <div className="centers-actions"><span className="muted small">{stateLabel(center.state)}</span><Button onClick={close}>{t('Back')}</Button></div>
    {(platform || capabilities.includes('center.update')) && <form onSubmit={e => { e.preventDefault(); perform(updatePath, { ...fields, centerId: center.id, version: center.version }) }}><Fields value={fields} change={setFields} /><Button type="submit" variant="primary" disabled={busy}>{t('Save')}</Button></form>}
    {staff.length > 0 && <div><h3>{t('Center staff')}</h3>{staff.map(role => <div key={role.id} className="centers-staff-row"><div><strong>{role.role === 'manager' ? t('Center manager') : t('Trainer')}</strong><div className="small muted">{role.accountUid}</div></div>
      {role.revoked ? <span className="muted small">{t('Revoked role')}</span> : ((platform && role.role === 'manager') || (!platform && role.role === 'trainer')) && <div className="centers-actions">{platform && <Button onClick={() => setReplaceId(role.id)}>{t('Replace')}</Button>}<Button disabled={busy} onClick={() => perform(platform ? '/api/platform/centers/revoke-role' : '/api/centers/staff/revoke', { centerId: center.id, version: center.version, assignmentId: role.id })}>{t('Revoke role')}</Button></div>}
    </div>)}</div>}
    {!platform && capabilities.includes('staff.manage') && <div><h3>{t('Trainer')}</h3><label className="centers-field"><span>{t('Account ID')}</span><TextField value={trainerUid} onChange={e => setTrainerUid(e.target.value)} /></label><Button disabled={busy || !trainerUid.trim()} onClick={() => perform('/api/centers/staff/assign', { centerId: center.id, version: center.version, accountUid: trainerUid.trim() })}>{t('Save')}</Button></div>}
    {platform && <div><h3>{replaceId ? t('Replace') : t('Assign manager')}</h3>{replaceId && <Button onClick={() => setReplaceId(null)}>{t('Cancel')}</Button>}<AccountPicker selected={manager} choose={setManager} /><Button disabled={busy || !manager} onClick={() => perform('/api/platform/centers/assign-manager', { centerId: center.id, version: center.version, accountUid: manager.id, ...(replaceId ? { replaceAssignmentId: replaceId } : {}) })}>{t('Assign manager')}</Button>
      {center.state !== 'inactive' && <div className="centers-actions"><Button variant="danger" disabled={busy} onClick={() => confirmed ? perform(updatePath, { ...fields, centerId: center.id, version: center.version, state: 'inactive' }) : setConfirmed(true)}>{confirmed ? t('Confirm deactivation') : t('Deactivate center')}</Button></div>}
      {center.state === 'inactive' && <Button disabled={busy} onClick={() => perform(updatePath, { ...fields, centerId: center.id, version: center.version, state: 'active' })}>{t('Activate center')}</Button>}
    </div>}
    {error && <p role="alert">{t(centersErrorKey(error))}</p>}
  </div></Section>
}

function Content({ user }) {
  const nav = useNavigate(), state = useCenters()
  const platform = state.platformCapabilities.includes('centers.manage')
  const [listed, setListed] = useState([]), [creating, setCreating] = useState(false), [detail, setDetail] = useState(null), [error, setError] = useState(null), [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => { if (useStore.getState().user?.id !== user.id) return; setDetail(null); setRefreshKey(k => k + 1); useCenters.getState().load(user.id) }
  useEffect(() => {
    let current = true
    setListed([]); setDetail(null); setError(null)
    if (state.status !== 'ready' || state.ownerUid !== user.id) return
    if (platform) platformCenters().then(r => { if (current) setListed(r.centers) }).catch(e => { if (current) { setError(e); useCenters.getState().revokeOn(e) } })
    else setListed(state.centers)
    return () => { current = false }
  }, [platform, state.centers, state.status, state.ownerUid, user.id, refreshKey])
  useEffect(() => {
    let current = true
    setDetail(null)
    if (!state.selectedId || state.ownerUid !== user.id) return
    centerDetail(state.selectedId).then(r => { if (current) setDetail(r.center) }).catch(e => { if (current) { setError(e); useCenters.getState().revokeOn(e) } })
    return () => { current = false }
  }, [state.selectedId, state.ownerUid, user.id, refreshKey])
  const selected = state.centers.find(c => c.id === state.selectedId)
  return <div className="narrow centers-page"><div className="hdr"><button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button><h1>{t('Manage centers')}</h1></div>
    <div className="centers-actions"><Button onClick={refresh}>{t('Reload centers')}</Button>{platform && <Button variant="primary" onClick={() => { state.select(null); setCreating(true) }}>{t('New center')}</Button>}</div>
    {(state.status === 'loading' || state.ownerUid !== user.id) && <p className="muted" role="status">{t('Loading centers')}</p>}
    {(error || state.error) && <p role="alert">{t(centersErrorKey(error || state.error))}</p>}
    {state.status === 'ready' && state.ownerUid === user.id && (creating && platform ? <NewCenter ownerUid={user.id} close={() => setCreating(false)} created={center => { if (useStore.getState().user?.id !== user.id) return; setCreating(false); state.select(center.id); refresh() }} /> : detail ? <CenterPanel ownerUid={user.id} center={detail} platform={platform} capabilities={selected?.capabilities || []} close={() => state.select(null)} refresh={refresh} /> : <div className="centers-list">{!listed.length && <p className="muted">{t('No centers available')}</p>}{listed.map(center => {
      const canOpen = platform || center.capabilities?.includes('center.read')
      return <div className="centers-card" key={center.id}><h2>{center.name}</h2><p className="muted small">{stateLabel(center.state)}</p>{canOpen && <Button onClick={() => state.select(center.id)}>{t('Center details')}</Button>}</div>
    })}</div>)}
  </div>
}

export default function Centers() {
  const user = useStore(s => s.user), enabled = useStore(s => s.config?.centers?.enabled)
  if (!user || !enabled) return <Navigate to="/home" replace />
  return <Content key={user.id} user={user} />
}
