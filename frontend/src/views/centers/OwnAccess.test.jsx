// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../components/QrCanvas.jsx',()=>({default:({value})=><div data-access-qr={value}/>}))
vi.mock('../../lib/centers-api.js',()=>({centerAccess:vi.fn(),centerAccessVisits:vi.fn(),centerCommand:vi.fn(),accessErrorKey:()=> 'Access error'}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'actor'},S:{routines:[]}};return {useStore:{getState:()=>state}}})
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
import {centerAccess,centerAccessVisits,centerCommand} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import OwnAccess from './OwnAccess.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let root,host,clock,visibility,visibilityDescriptor
const token='gqr1_'+'a'.repeat(43)
beforeEach(()=>{
  vi.clearAllMocks();clock=1000;visibility='visible';visibilityDescriptor=Object.getOwnPropertyDescriptor(document,'visibilityState');Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visibility});vi.spyOn(performance,'now').mockImplementation(()=>clock)
  useStore.getState().user={id:'actor'};centerAccess.mockResolvedValue({enabled:true,allowed:true,tokenLifetimeSeconds:45});centerAccessVisits.mockResolvedValue({visits:[],nextCursor:null});centerCommand.mockResolvedValue({token,remainingMs:45000,issuedAt:'2026-10-15T10:00:00Z',expiresAt:'2026-10-15T10:00:45Z'})
  host=document.createElement('div');document.body.append(host);root=createRoot(host)
})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.useRealTimers();if(visibilityDescriptor)Object.defineProperty(document,'visibilityState',visibilityDescriptor);else delete document.visibilityState})
const render=(props={})=>act(async()=>{root.render(<OwnAccess centerId="center1" ownerUid="actor" {...props}/>);await Promise.resolve()})
const button=label=>[...host.querySelectorAll('button')].find(node=>node.textContent===label)
const click=label=>act(async()=>button(label).click())
it('requests an own opaque QR only on click without persisting it in training',async()=>{
  const before=structuredClone(useStore.getState().S);await render();expect(centerCommand).not.toHaveBeenCalled();await click('Show access QR');expect(centerCommand).toHaveBeenCalledWith('/api/centers/own/access/token',expect.objectContaining({centerId:'center1',requestId:expect.any(String)}));expect(centerCommand.mock.calls[0][1]).not.toHaveProperty('memberId');expect(host.querySelector('[data-access-qr]').getAttribute('data-access-qr')).toBe(token);expect(useStore.getState().S).toEqual(before)
})
it('hides at the monotonic deadline even when the wall clock is wrong, without requesting another token',async()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval']});await render();await click('Show access QR');clock=46001;await act(async()=>vi.advanceTimersByTime(250));expect(host.querySelector('[data-access-qr]')).toBeNull();expect(host.textContent).toContain('Access QR expired. Generate another.');expect(centerCommand).toHaveBeenCalledOnce()
})
it('hides a code when the page is hidden and does not resurrect it on visibility return',async()=>{
  await render();await click('Show access QR');await act(async()=>{visibility='hidden';document.dispatchEvent(new Event('visibilitychange'))});expect(host.querySelector('[data-access-qr]')).toBeNull();await act(async()=>{visibility='visible';document.dispatchEvent(new Event('visibilitychange'))});expect(host.querySelector('[data-access-qr]')).toBeNull();expect(centerCommand).toHaveBeenCalledOnce()
})
it('drops a response arriving in another center or account',async()=>{
  let release;centerCommand.mockReturnValueOnce(new Promise(resolve=>release=resolve));await render();await click('Show access QR');await render({centerId:'center2'});await act(async()=>release({token,remainingMs:45000}));expect(host.querySelector('[data-access-qr]')).toBeNull();useStore.getState().user={id:'other'};await click('Show access QR');expect(centerCommand).toHaveBeenCalledOnce()
})
it('retains the issuance request ID across a network failure and recovers the same current token',async()=>{
  centerCommand.mockRejectedValueOnce(new Error('offline'));await render();await click('Show access QR');const first=centerCommand.mock.calls[0][1].requestId;await click('Show access QR');expect(centerCommand.mock.calls[1][1].requestId).toBe(first);expect(host.querySelector('[data-access-qr]')).toBeTruthy()
})
it('does not offer a token for denied or inactive affiliation and keeps off/no-history quiet',async()=>{
  centerAccess.mockResolvedValue({enabled:true,allowed:false});await render();expect(button('Show access QR')).toBeUndefined();centerAccess.mockResolvedValue({enabled:true,allowed:true});await render({active:false});expect(button('Show access QR')).toBeUndefined();centerAccess.mockResolvedValue({enabled:false,allowed:false});await render({centerId:'other'});expect(host.textContent).toBe('')
})
