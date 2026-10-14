// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter,Routes,Route,useLocation,useNavigate } from 'react-router-dom'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
vi.mock('../../lib/i18n.js', () => ({ t: value => value }))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
vi.mock('../../store/useStore.js', () => {
  const state = { user: { id: 'platform' }, config: { centers: { enabled: true } }, S: {} }
  const useStore = selector => selector ? selector(state) : state
  useStore.getState = () => state
  return { useStore }
})
vi.mock('../../lib/centers-api.js', () => ({ platformCenters: vi.fn(), centerDetail: vi.fn(), centerStaff: vi.fn(), centerCommand: vi.fn(), centersMe: vi.fn(), centerAccounts: vi.fn(), centerMembers: vi.fn().mockResolvedValue({members:[],nextCursor:null}), centerMember:vi.fn(), centerInvitations:vi.fn().mockResolvedValue({invites:[]}), invitationErrorKey:()=> 'error', membersErrorKey:()=> 'error', centersErrorKey: () => 'error' }))
import { useStore } from '../../store/useStore.js'
import { useCenters } from '../../store/useCenters.js'
import { platformCenters, centerDetail, centerStaff, centerCommand, centersMe } from '../../lib/centers-api.js'
import Centers from './Centers.jsx'
import {confirmSheet} from '../../sheets.jsx'
import {useUI} from '../../store/useUI.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
const center = { id: 'one', name: 'Synthetic center', state: 'active', version: 1, openingHours: { 1: [['08:00', '12:00'], ['16:00', '22:00']] } }
beforeEach(() => {
  vi.clearAllMocks(); useCenters.getState().reset()
  useStore.getState().user = { id: 'platform' }
  useCenters.setState({ ownerUid: 'platform', status: 'ready', centers: [], platformCapabilities: ['centers.manage'] })
  platformCenters.mockResolvedValue({ centers: [center] }); centerDetail.mockResolvedValue({ center }); centerStaff.mockResolvedValue({ staff: [] })
  centersMe.mockResolvedValue({ centers: [], platformCapabilities: ['centers.manage'] })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); useCenters.getState().reset();vi.restoreAllMocks() })
const render = () => act(async () => { root.render(<MemoryRouter><Centers /></MemoryRouter>); await Promise.resolve() })
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent === text || b.textContent.endsWith(text))
const click = text => act(async () => { button(text).click(); await Promise.resolve() })
const input = (element, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
})

it('creates a draft through all wizard steps using one stable request id', async () => {
  centerCommand.mockRejectedValue(new Error('temporary'))
  await render(); await click('New center')
  input(host.querySelector('input'), 'New synthetic center')
  await click('Next'); expect(host.textContent).toContain('Center manager')
  await click('Next'); expect(host.textContent).toContain('Review')
  await click('Create draft'); await click('Create draft')
  expect(centerCommand).toHaveBeenCalledTimes(2)
  const [path, body] = centerCommand.mock.calls[0]
  expect(path).toBe('/api/platform/centers/create'); expect(body.name).toBe('New synthetic center')
  expect(body.managerUid).toBeUndefined(); expect(body.requestId).toBe(centerCommand.mock.calls[1][1].requestId)
})

it('editing the first opening interval preserves the remaining intervals', async () => {
  centerCommand.mockResolvedValue({ center })
  await render(); await click('Center details')
  input(host.querySelector('input[aria-label="Monday From"]'), '09:00')
  await click('Save')
  expect(centerCommand.mock.calls[0][1].openingHours[1]).toEqual([['09:00', '12:00'], ['16:00', '22:00']])
})

it('schedule switches and clearing account search do not submit wizard steps', async () => {
  await render(); await click('New center'); input(host.querySelector('input'),'Synthetic')
  await act(async()=>{host.querySelector('button[role="switch"]').click()})
  expect(host.textContent).toContain('Opening hours')
  await click('Next'); input(host.querySelector('input'),'temporary')
  await act(async()=>{host.querySelector('button[aria-label="Clear"]').click()}); expect(host.textContent).toContain('Center manager')
  expect(host.textContent).not.toContain('Review')
})

it('a trainer sees operational details without platform controls or account lookup', async () => {
  useStore.getState().user = { id: 'trainer' }
  useCenters.setState({ ownerUid: 'trainer', centers: [{ ...center, capabilities: ['center.read'] }], platformCapabilities: [] })
  await render(); await click('Center details')
  expect(button('New center')).toBeUndefined(); expect(button('Save')).toBeUndefined()
  expect(button('Assign manager')).toBeUndefined(); expect(platformCenters).not.toHaveBeenCalled()
  expect(centerStaff).not.toHaveBeenCalled()
})
it('an explicit platform administrator manages members without local assignments',async()=>{
  useCenters.setState({platformCapabilities:['centers.manage','members.read','members.manage'],centers:[]})
  await render();await click('Center details');await click('Members')
  expect(button('New member')).toBeDefined()
  await click('New member');expect(host.textContent).toContain('Member name')
})
it('the header Back returns to the previous route with its query and state',async()=>{
  const prior=history.state
  history.replaceState({idx:1},'',location.href)
  function Previous(){const location=useLocation();return <div>{'Previous account screen '+location.search+' '+location.state.marker}</div>}
  await act(async()=>{root.render(<MemoryRouter initialEntries={[{pathname:'/settings/account',search:'?from=account',state:{marker:'preserved'}},'/centers']} initialIndex={1}><Routes><Route path="/centers" element={<Centers/>}/><Route path="/settings/account" element={<Previous/>}/></Routes></MemoryRouter>);await Promise.resolve()})
  await act(async()=>{host.querySelector('button[aria-label="Back"]').click()})
  expect(host.textContent).toContain('Previous account screen ?from=account preserved')
  history.replaceState(prior,'',location.href)
})
it('a direct Centers entry uses Home as a fallback without leaving the app',async()=>{
  const prior=history.state;history.replaceState({idx:0},'',location.href)
  await act(async()=>{root.render(<MemoryRouter initialEntries={['/centers']}><Routes><Route path="/centers" element={<Centers/>}/><Route path="/home" element={<div>Home fallback</div>}/></Routes></MemoryRouter>);await Promise.resolve()})
  await act(async()=>{host.querySelector('button[aria-label="Back"]').click()});expect(host.textContent).toContain('Home fallback')
  history.replaceState(prior,'',location.href)
})
it('center selection and panes enter router history, so Back restores the previously visited pane',async()=>{
  const previous=history.state;history.replaceState({idx:2},'',location.href)
  useCenters.setState({platformCapabilities:['centers.manage','members.read','members.manage']})
  function Location(){const here=useLocation();return <output>{here.pathname+here.search}</output>}
  await act(async()=>{root.render(<MemoryRouter initialEntries={['/centers']}><Centers/><Location/></MemoryRouter>);await Promise.resolve()})
  await click('Center details');expect(host.querySelector('output').textContent).toBe('/centers?centerId=one')
  await click('Members');expect(host.querySelector('output').textContent).toBe('/centers?centerId=one&pane=members')
  await act(async()=>host.querySelector('button[aria-label="Back"]').click());expect(host.querySelector('output').textContent).toBe('/centers?centerId=one');expect(host.querySelector('input').value).toBe(center.name)
  expect(useStore.getState().S).toEqual({});history.replaceState(previous,'',location.href)
})
it('switching the URL center discards the previous center response and clears private form state',async()=>{
  let release;centerDetail.mockImplementation(id=>id==='one'?new Promise(resolve=>release=resolve):Promise.resolve({center:{...center,id:'two',name:'Second synthetic center'}}))
  function SwitchCenter(){const navigate=useNavigate();return <button onClick={()=>navigate('/centers?centerId=two')}>Select second</button>}
  await act(async()=>{root.render(<MemoryRouter initialEntries={['/centers?centerId=one']}><Centers/><SwitchCenter/></MemoryRouter>);await Promise.resolve()})
  await click('Select second');expect(host.querySelector('input').value).toBe('Second synthetic center')
  await act(async()=>release({center:{...center,name:'Old private center'}}));expect(host.textContent).not.toContain('Old private center');expect(host.querySelector('input').value).toBe('Second synthetic center')
})
it('a creation completed after leaving the wizard cannot navigate back into the old workflow',async()=>{
  let release;centerCommand.mockReturnValue(new Promise(resolve=>release=resolve))
  function Leave(){const nav=useNavigate();return <button onClick={()=>nav('/home')}>Leave workflow</button>}
  function Location(){return <output>{useLocation().pathname}</output>}
  await act(async()=>{root.render(<MemoryRouter initialEntries={['/centers']}><Leave/><Location/><Routes><Route path="/centers" element={<Centers/>}/><Route path="/home" element={<div>Personal Home</div>}/></Routes></MemoryRouter>);await Promise.resolve()})
  await click('New center');input(host.querySelector('input'),'Synthetic pending');await click('Next');await click('Next');await click('Create draft');await click('Leave workflow')
  await act(async()=>release({center:{...center,id:'new'}}));expect(host.querySelector('output').textContent).toBe('/home');expect(host.textContent).toContain('Personal Home');expect(centerDetail).not.toHaveBeenCalled()
})
it('a save completed after switching panes cannot refresh the current view or show an old toast',async()=>{
  let release;centerCommand.mockReturnValue(new Promise(resolve=>release=resolve));const toast=vi.spyOn(useUI.getState(),'toast').mockImplementation(()=>{})
  useCenters.setState({platformCapabilities:['centers.manage','members.read','members.manage']})
  await render();await click('Center details');await click('Save');await click('Members');const reads=centerDetail.mock.calls.length
  await act(async()=>release({center}));expect(toast).not.toHaveBeenCalled();expect(centerDetail).toHaveBeenCalledTimes(reads);expect(button('New member')).toBeDefined()
})
it('a delayed deactivation confirmation is inert after changing the pane that opened it',async()=>{
  useCenters.setState({platformCapabilities:['centers.manage','members.read','members.manage']})
  await render();await click('Center details');await click('Deactivate center');const confirmation=confirmSheet.mock.calls[0][0];await click('Members');await act(async()=>confirmation.onConfirm());expect(centerCommand).not.toHaveBeenCalled()
})
