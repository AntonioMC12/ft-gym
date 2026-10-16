vi.mock('./PassHistory.jsx',()=>({default:()=>null}))
// @vitest-environment happy-dom
vi.mock('./MembershipPlans.jsx',()=>({default:()=> <p>Existing plan list</p>}))
vi.mock('./PassProducts.jsx',()=>({default:()=>null}))
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter,Routes,Route,useLocation,useNavigate } from 'react-router-dom'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
vi.mock('../../lib/i18n.js', () => ({ t: value => value }))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
vi.mock('./Retention.jsx',()=>({default:()=>null}))
vi.mock('./BillingAutomation.jsx',()=>({default:()=>null}))
vi.mock('./NotificationSettings.jsx',()=>({default:()=>null}))
vi.mock('./StripePayments.jsx',()=>({default:()=>null}))
vi.mock('./AccessPanel.jsx',()=>({default:({centerId,canManage,canVerify})=><div data-access-panel={centerId} data-can-manage={String(canManage)} data-can-verify={String(canVerify)}>Reception panel</div>}))
vi.mock('./Classes.jsx',()=>({default:({centerId,canManage})=><div data-classes-center={centerId} data-classes-manage={String(canManage)}>Class list</div>}))
vi.mock('./Metrics.jsx',()=>({default:({centerId,global,period,onPeriod})=><div data-metrics={global?'global':centerId}><output data-period>{JSON.stringify(period)}</output><button onClick={()=>onPeriod({from:'2026-09-01',to:'2026-09-30'})}>Choose report period</button></div>}))
vi.mock('../../store/useStore.js', () => {
  const state = { user: { id: 'platform' }, config: { centers: { enabled: true } }, S: {} }
  const useStore = selector => selector ? selector(state) : state
  useStore.getState = () => state
  return { useStore }
})
vi.mock('../../lib/centers-api.js', () => ({ platformCenters: vi.fn(), centerDetail: vi.fn(), centerStaff: vi.fn(), centerCommand: vi.fn(), centersMe: vi.fn(), centerAccounts: vi.fn(), centerMembers: vi.fn().mockResolvedValue({members:[],nextCursor:null}), centerMember:vi.fn(), centerInvitations:vi.fn().mockResolvedValue({invites:[]}), invitationErrorKey:()=> 'error', membersErrorKey:()=> 'error', centersErrorKey: () => 'error' }))
import { useStore } from '../../store/useStore.js'
import { useCenters } from '../../store/useCenters.js'
import { platformCenters, centerDetail, centerStaff, centerCommand, centersMe, centerAccounts } from '../../lib/centers-api.js'
import Centers from './Centers.jsx'
import {confirmSheet} from '../../sheets.jsx'
import {useUI} from '../../store/useUI.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
const center = { id: 'one', name: 'Synthetic center', state: 'active', version: 1, openingHours: { 1: [['08:00', '12:00'], ['16:00', '22:00']] } }
beforeEach(() => {
  vi.clearAllMocks(); useCenters.getState().reset()
  useStore.getState().user = { id: 'platform' }
  useStore.getState().config={centers:{enabled:true}}
  useCenters.setState({ ownerUid: 'platform', status: 'ready', centers: [], platformCapabilities: ['centers.manage'] })
  platformCenters.mockResolvedValue({ centers: [center] }); centerDetail.mockResolvedValue({ center }); centerStaff.mockResolvedValue({ staff: [] })
  centersMe.mockResolvedValue({ centers: [], platformCapabilities: ['centers.manage'] })
  centerAccounts.mockResolvedValue({accounts:[],nextCursor:null})
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

it('adds a contiguous interval and removing the last interval switches the day off without submitting',async()=>{
  await render();await click('New center')
  await act(async()=>host.querySelector('button[aria-label="Monday"]').click())
  const day=host.querySelector('.centers-hour-day')
  await act(async()=>[...day.querySelectorAll('button')].find(b=>b.textContent==='Add time interval').click())
  expect(day.querySelectorAll('.centers-hour-row')).toHaveLength(2)
  expect(day.querySelector('input[aria-label="Monday From 2"]').value).toBe('22:00')
  expect(day.querySelector('input[aria-label="Monday To 2"]').value).toBe('24:00')
  expect(day.textContent).not.toContain('Add time interval')
  await act(async()=>day.querySelector('button[aria-label="Remove: Monday 2"]').click())
  await act(async()=>day.querySelector('button[aria-label="Remove: Monday 1"]').click())
  expect(day.querySelector('button[role="switch"]').getAttribute('aria-checked')).toBe('false')
  expect(day.querySelector('.centers-hour-row')).toBeNull()
  expect(centerCommand).not.toHaveBeenCalled();expect(host.textContent).toContain('Opening hours')
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
it('integrates classes as a readable section without granting management from the selected pane',async()=>{
  useStore.getState().user={id:'trainer'}
  useCenters.setState({ownerUid:'trainer',centers:[{...center,capabilities:['center.read','classes.read']}],platformCapabilities:[]})
  await render();await click('Center details');await click('Classes')
  expect(host.querySelector('[data-classes-center="one"]').getAttribute('data-classes-manage')).toBe('false')
  expect(button('Save')).toBeUndefined();expect(button('Assign manager')).toBeUndefined()
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
it('preserves a direct center/pane URL while configuration is pending and opens it when config arrives',async()=>{
  useStore.getState().config=null;const refreshConfig=vi.fn().mockResolvedValue(null);useStore.getState().refreshConfig=refreshConfig
  function Location(){const here=useLocation();return <output>{here.pathname+here.search}</output>}
  const view=()=> <MemoryRouter initialEntries={['/centers?centerId=one&pane=members']}><Centers/><Location/></MemoryRouter>
  await act(async()=>root.render(view()));expect(host.querySelector('output').textContent).toBe('/centers?centerId=one&pane=members');expect(host.textContent).toContain('Loading centers');expect(centerDetail).not.toHaveBeenCalled();await click('Reload centers');expect(refreshConfig).toHaveBeenCalledOnce()
  useStore.getState().config={centers:{enabled:true}};await act(async()=>{root.render(view());await Promise.resolve()});expect(centerDetail).toHaveBeenCalledWith('one');expect(host.querySelector('output').textContent).toBe('/centers?centerId=one&pane=members')
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
it('a save completed after an external route change cannot refresh the current view or show an old toast',async()=>{
  let release;centerCommand.mockReturnValue(new Promise(resolve=>release=resolve));const toast=vi.spyOn(useUI.getState(),'toast').mockImplementation(()=>{})
  useCenters.setState({platformCapabilities:['centers.manage','members.read','members.manage']})
  function ExternalPane(){const navigate=useNavigate();return <button onClick={()=>navigate('/centers?centerId=one&pane=members')}>External pane change</button>}
  await act(async()=>{root.render(<MemoryRouter><Centers/><ExternalPane/></MemoryRouter>);await Promise.resolve()});await click('Center details');await click('Save');await click('External pane change');const reads=centerDetail.mock.calls.length
  await act(async()=>release({center}));expect(toast).not.toHaveBeenCalled();expect(centerDetail).toHaveBeenCalledTimes(reads);expect(button('New member')).toBeDefined()
})
it('a delayed deactivation confirmation is inert after changing the pane that opened it',async()=>{
  useCenters.setState({platformCapabilities:['centers.manage','members.read','members.manage']})
  await render();await click('Center details');await click('Deactivate center');const confirmation=confirmSheet.mock.calls[0][0];await click('Members');await act(async()=>confirmation.onConfirm());expect(centerCommand).not.toHaveBeenCalled()
})
it('appends server pages without truncating the platform list',async()=>{
  platformCenters.mockResolvedValueOnce({centers:[center],nextCursor:'more'}).mockResolvedValueOnce({centers:[{...center,id:'two',name:'Second center'}],nextCursor:null});await render();await click('Show more');expect(host.textContent).toContain('Second center');expect(platformCenters).toHaveBeenLastCalledWith({query:'',cursor:'more'});expect(button('Show more')).toBeUndefined()
})
it('keeps the search query and loaded list through center navigation and Back',async()=>{
  const previous=history.state;history.replaceState({idx:1},'',location.href)
  function Location(){const here=useLocation();return <output>{here.pathname+here.search}</output>}
  await act(async()=>{root.render(<MemoryRouter initialEntries={['/centers?q=Synthetic']}><Centers/><Location/></MemoryRouter>);await Promise.resolve()});await click('Center details');expect(host.querySelector('output').textContent).toContain('q=Synthetic');await act(async()=>host.querySelector('button[aria-label="Back"]').click());expect(host.querySelector('output').textContent).toBe('/centers?q=Synthetic');expect(host.querySelector('input').value).toBe('Synthetic');expect(platformCenters).toHaveBeenCalledTimes(1);history.replaceState(previous,'',location.href)
})
it('discards a delayed page when the filter changes',async()=>{
  let release;platformCenters.mockResolvedValueOnce({centers:[center],nextCursor:'more'}).mockReturnValueOnce(new Promise(resolve=>release=resolve)).mockResolvedValueOnce({centers:[{...center,id:'two',name:'Second center'}],nextCursor:null})
  function Filter(){const navigate=useNavigate();return <button onClick={()=>navigate('/centers?q=Second')}>Change filter</button>}
  await act(async()=>{root.render(<MemoryRouter><Centers/><Filter/></MemoryRouter>);await Promise.resolve()});await click('Show more');await click('Change filter');await act(async()=>release({centers:[{...center,id:'old',name:'Old filter result'}],nextCursor:null}));expect(host.textContent).toContain('Second center');expect(host.textContent).not.toContain('Old filter result');expect(platformCenters).toHaveBeenLastCalledWith({query:'Second'})
})
it('opens access with current capabilities and Back returns to the previous pane instead of Home',async()=>{
  const previous=history.state;history.replaceState({idx:1},'',location.href)
  useCenters.setState({platformCapabilities:['centers.manage','members.read','members.manage','access.manage','access.verify']})
  function Location(){const here=useLocation();return <output>{here.pathname+here.search}</output>}
  await act(async()=>{root.render(<MemoryRouter initialEntries={['/centers?centerId=one&pane=members']}><Centers/><Location/></MemoryRouter>);await Promise.resolve()})
  await click('Center access');expect(host.querySelector('output').textContent).toContain('pane=access');const panel=host.querySelector('[data-access-panel]');expect(panel.getAttribute('data-access-panel')).toBe('one');expect(panel.getAttribute('data-can-manage')).toBe('true');expect(panel.getAttribute('data-can-verify')).toBe('true')
  await act(async()=>host.querySelector('button[aria-label="Back"]').click());expect(host.querySelector('output').textContent).toContain('pane=members');expect(host.querySelector('[data-access-panel]')).toBeNull();history.replaceState(previous,'',location.href)
})
it('preserves metric periods in router history and returns to the filtered list from global metrics',async()=>{
  const previous=history.state;history.replaceState({idx:1},'',location.href);useCenters.setState({platformCapabilities:['centers.manage','metrics.global.read','billing.read','members.read']})
  function Location(){const here=useLocation();return <output data-location>{here.pathname+here.search}</output>}
  await act(async()=>{root.render(<MemoryRouter initialEntries={['/centers?q=Synthetic']}><Centers/><Location/></MemoryRouter>);await Promise.resolve()});await click('Global center metrics');expect(host.querySelector('[data-metrics]').getAttribute('data-metrics')).toBe('global');await click('Choose report period');await click('Choose report period');expect(host.querySelector('[data-location]').textContent).toContain('from=2026-09-01');await act(async()=>host.querySelector('button[aria-label="Back"]').click());expect(host.querySelector('[data-metrics]')).toBeTruthy();expect(host.querySelector('[data-location]').textContent).not.toContain('from=');await act(async()=>host.querySelector('button[aria-label="Back"]').click());expect(host.querySelector('[data-metrics]')).toBeNull();expect(host.querySelector('[data-location]').textContent).toBe('/centers?q=Synthetic');history.replaceState(previous,'',location.href)
})
it('hides global metrics without the explicit global metrics capability',async()=>{
  await render();expect(button('Global center metrics')).toBeUndefined();expect(host.querySelector('[data-metrics]')).toBeNull()
})

it('offers direct Home navigation while protecting an unsaved new center',async()=>{
  function Location(){return <output data-path>{useLocation().pathname}</output>}
  await act(async()=>{root.render(<MemoryRouter><Centers/><Location/></MemoryRouter>);await Promise.resolve()});await click('New center');input(host.querySelector('input'),'Unsaved center');await click('Home');expect(host.querySelector('[data-path]').textContent).not.toBe('/home');expect(host.querySelector('input').value).toBe('Unsaved center');expect(confirmSheet.mock.calls.at(-1)[0].cancelText).toBe('Keep editing');
  await act(async()=>confirmSheet.mock.calls.at(-1)[0].onConfirm());expect(host.querySelector('[data-path]').textContent).toBe('/home')
})

it('returns directly to Centers preserving its filter only after confirming edited details',async()=>{
  function Location(){return <output data-path>{useLocation().search}</output>}
  await act(async()=>{root.render(<MemoryRouter initialEntries={['/centers?centerId=one&q=Synthetic']}><Centers/><Location/></MemoryRouter>);await Promise.resolve()});input(host.querySelector('input'),'Changed details');await click('Centers');expect(host.querySelector('[data-path]').textContent).toContain('centerId=one');await act(async()=>confirmSheet.mock.calls.at(-1)[0].onConfirm());expect(host.querySelector('[data-path]').textContent).toBe('?q=Synthetic');expect(host.textContent).toContain('Synthetic center')
})

it('discarding edited details clears the hidden draft and browsing plan lists does not ask for a nonexistent save',async()=>{
 useCenters.setState({platformCapabilities:['centers.manage','plans.manage','members.read']});await render();await click('Center details');input(host.querySelector('input'),'Unsaved name');expect(host.querySelector('aside button').textContent).toContain('Save form: Center details');await click('Membership plans');expect(confirmSheet).toHaveBeenCalledOnce();await act(async()=>{confirmSheet.mock.calls[0][0].onConfirm();await Promise.resolve()});expect(host.textContent).toContain('Existing plan list');expect(host.querySelector('aside')).toBeNull();await click('Members');expect(confirmSheet).toHaveBeenCalledOnce();await click('Center details');expect(host.querySelector('input').value).toBe(center.name);expect(host.querySelector('aside')).toBeNull();
})
it('the visible shared save action sends edited center fields through the existing save handler',async()=>{
 centerCommand.mockResolvedValue({center});await render();await click('Center details');input(host.querySelector('input'),'Saved via bar');await act(async()=>{host.querySelector('aside button').click();await Promise.resolve()});expect(centerCommand).toHaveBeenCalledWith('/api/platform/centers/update',expect.objectContaining({centerId:'one',version:1,name:'Saved via bar'}));
})
it('shares center navigation across areas while preserving permissions and the selected destination',async()=>{
 useCenters.setState({platformCapabilities:['centers.manage','plans.manage','members.read','classes.read','access.manage']});await render();await click('Center details');
 const menu=()=>host.querySelector('.centers-center-workspace>.centers-workspace>.centers-workspace-nav');
 expect(menu().textContent).toContain('Membership plans');expect(menu().textContent).toContain('Members');expect(menu().textContent).not.toContain('Debt and calendar');
 expect(host.querySelector('.centers-tabs-scroll')).toBeNull();await click('Membership plans');expect(host.textContent).toContain('Existing plan list');expect(menu().querySelector('[aria-current=page]').textContent).toBe('Membership plans');
 await click('Classes');expect(host.querySelector('[data-classes-center]').dataset.classesCenter).toBe(center.id);await click('Center access');expect(host.querySelector('[data-access-panel]').dataset.accessPanel).toBe(center.id);
})
