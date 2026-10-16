// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',async()=>({t:(await import('../../lib/i18n-core.js')).t}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
vi.mock('../../lib/mobile.js',()=>({MOBILE:false}))
vi.mock('../../lib/scan.js',()=>({scanCode:vi.fn()}))
vi.mock('../../components/CameraScan.jsx',()=>({default:()=>null}))
vi.mock('../../lib/centers-api.js',()=>({centerAccess:vi.fn(),centerAccessVisits:vi.fn(),centerCommand:vi.fn(),consumeCenterAccess:vi.fn(),accessErrorKey:()=> 'Access error'}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'actor'},S:{routines:[]}};return {useStore:{getState:()=>state}}})
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
vi.mock('../../store/useUI.js',()=>{const close=vi.fn(),openSheet=vi.fn(()=>({id:'camera1',close}));return {useUI:{getState:()=>({openSheet})}}})
import {centerAccess,centerAccessVisits,centerCommand,consumeCenterAccess} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useUI} from '../../store/useUI.js'
import {confirmSheet} from '../../sheets.jsx'
import AccessPanel from './AccessPanel.jsx'
import {_setLangState,t} from '../../lib/i18n-core.js'
import es from '../../locales/es.js'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let root,host
const token='gqr1_'+'a'.repeat(43),key='gdev1_'+'b'.repeat(43),device={id:'device1',name:'Door',version:1,expiresAt:'2026-11-15T10:00:00Z',revokedAt:null}
const info={version:1,policy:{enabled:true,requireSubscription:false,denyOverdue:false,allowPasses:false,graceDays:15},devices:[device],nextCursor:null}
beforeEach(()=>{
  _setLangState('en',{},null,null);vi.clearAllMocks();useStore.getState().user={id:'actor'};centerAccess.mockResolvedValue(structuredClone(info));centerAccessVisits.mockResolvedValue({visits:[],nextCursor:null});centerCommand.mockResolvedValue({device:{...device,version:2},credential:key});consumeCenterAccess.mockResolvedValue({admitted:true,replayed:false,visitId:'visit1',member:{name:'Fictional member',number:'M-1'}})
  host=document.createElement('div');document.body.append(host);root=createRoot(host)
})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(props={})=>act(async()=>{root.render(<AccessPanel centerId="center1" ownerUid="actor" canManage canVerify {...props}/>);await Promise.resolve()})
const button=label=>[...host.querySelectorAll('button')].find(node=>node.textContent===label)
const click=label=>act(async()=>button(label).click())
const confirm=()=>confirmSheet.mock.calls.at(-1)[0]
const pair=async()=>{await click('Activate reception here');await act(async()=>confirm().onConfirm())}
const fill=(input,value)=>act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})
it('pairs only after confirmation and sends the device key separately from the scan body',async()=>{
  const before=structuredClone(useStore.getState().S);await render();expect(button('Validate entry')).toBeUndefined();await click('Activate reception here');expect(centerCommand).not.toHaveBeenCalled();await act(async()=>confirm().onConfirm());expect(host.textContent).toContain('Reception is active on this page. Reloading requires activation again.');await fill(host.querySelector('input[autocomplete="off"]'),token);await click('Validate entry');expect(consumeCenterAccess).toHaveBeenCalledWith(expect.objectContaining({centerId:'center1',deviceId:'device1',token}),key);expect(consumeCenterAccess.mock.calls[0][0]).not.toHaveProperty('credential');expect(host.textContent).toContain('Entry verified');expect(host.textContent).toContain('Fictional member');expect(useStore.getState().S).toEqual(before);expect(JSON.stringify(useStore.getState().S)).not.toContain(key)
})
it('retries a lost scan response with the same request ID and shows replay as already recorded, never newly admitted',async()=>{
  consumeCenterAccess.mockRejectedValueOnce(new Error('lost')).mockResolvedValue({admitted:false,replayed:true,visitId:'visit1'});await render();await pair();await fill(host.querySelector('input[autocomplete="off"]'),token);await click('Validate entry');const first=consumeCenterAccess.mock.calls[0][0].requestId;await click('Validate entry');expect(consumeCenterAccess.mock.calls[1][0].requestId).toBe(first);expect(host.textContent).toContain('This entry was already recorded.');expect(host.textContent).not.toContain('Entry verified')
})
it('does not apply an old pairing confirmation after center or capability changes',async()=>{
  await render();await click('Activate reception here');const old=confirm();await render({centerId:'center2'});await act(async()=>old.onConfirm());expect(centerCommand).not.toHaveBeenCalled();await click('Activate reception here');const second=confirm();await render({centerId:'center2',canManage:false,canVerify:false});await act(async()=>second.onConfirm());expect(centerCommand).not.toHaveBeenCalled()
})
it('closes its own camera sheet on context loss and rejects the captured callback',async()=>{
  await render();await pair();await click('Scan access QR');const open=useUI.getState().openSheet,handle=open.mock.results[0].value,element=open.mock.calls[0][0](()=>{});expect(open).toHaveBeenCalledOnce();await render({centerId:'center2'});expect(handle.close).toHaveBeenCalled();await act(async()=>element.props.onFound({value:token,fmt:'qrcode'}));expect(consumeCenterAccess).not.toHaveBeenCalled();expect(button('Validate entry')).toBeUndefined()
})
it('does not display a scan result that arrives after account change',async()=>{
  let release;consumeCenterAccess.mockReturnValueOnce(new Promise(resolve=>release=resolve));await render();await pair();await fill(host.querySelector('input[autocomplete="off"]'),token);await click('Validate entry');useStore.getState().user={id:'other'};await act(async()=>root.render(<div>Other account</div>));await act(async()=>release({admitted:true,replayed:false,member:{name:'Private member'}}));expect(host.textContent).toBe('Other account')
})
it('requires confirmation for explicit policy fields and does not expose device mutations in a read-only view',async()=>{
  await render();await click('Save');expect(centerCommand).not.toHaveBeenCalled();await act(async()=>confirm().onConfirm());expect(centerCommand).toHaveBeenCalledWith('/api/centers/access/policy',expect.objectContaining({centerId:'center1',version:1,policy:info.policy}));await render({canManage:false,canVerify:false});expect(button('Activate reception here')).toBeUndefined();expect(button('Revoke reception device')).toBeUndefined();expect(button('Save')).toBeUndefined()
})

it('renders every access rule in Spanish and saves the visit-pass rule only after confirmation',async()=>{
  _setLangState('es',es,null,null);await render();
  const switches=[...host.querySelectorAll('[role="switch"]')];
  expect(switches).toHaveLength(4);
  expect(switches.every(node=>node.getAttribute('aria-label')?.trim())).toBe(true);
  const passes=switches.find(node=>node.getAttribute('aria-label')===t('Allow explicitly selected visit passes'));
  expect(passes).toBeDefined();expect(passes.getAttribute('aria-checked')).toBe('false');
  await act(async()=>passes.click());await click(t('Save'));expect(centerCommand).not.toHaveBeenCalled();
  await act(async()=>confirm().onConfirm());
  expect(centerCommand).toHaveBeenCalledWith('/api/centers/access/policy',expect.objectContaining({centerId:'center1',version:1,policy:{...info.policy,allowPasses:true}}));
})
