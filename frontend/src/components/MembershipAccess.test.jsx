// @vitest-environment happy-dom
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../lib/api.js',()=>({api:vi.fn()}));vi.mock('../lib/i18n.js',()=>({t:key=>key}));vi.mock('../sheets.jsx',()=>({confirmSheet:vi.fn()}))
import {api} from '../lib/api.js';import {useStore} from '../store/useStore.js';import {useMembershipAccess,MembershipAccessScreen,MembershipGraceNotice,MembershipConnectionNotice} from './MembershipAccess.jsx'
let host,root
function Harness(){const {user,config}=useStore();const access=useMembershipAccess(user,config);return access.allowed?<><p>Private training</p><input aria-label="Draft"/><MembershipGraceNotice warnings={access.warnings}/><MembershipConnectionNotice access={access}/></>:<MembershipAccessScreen access={access}/>}
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();vi.useFakeTimers();useStore.setState({user:{id:'member'},config:{centers:{enabled:true}}});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()})
const render=()=>act(async()=>root.render(<Harness/>))
it.each([new TypeError('network'),Object.assign(new Error('timeout'),{code:'timeout'}),Object.assign(new Error('unavailable'),{status:503}),Object.assign(new Error('rate limit'),{status:429})])('preserves the mounted draft and automatically recovers after %s',async error=>{
 api.mockResolvedValueOnce({blocked:false,warnings:[]}).mockRejectedValueOnce(error).mockResolvedValue({blocked:false,warnings:[]})
 await render();const draft=host.querySelector('input');draft.value='Unsaved training'
 await act(async()=>vi.advanceTimersByTimeAsync(30000))
 expect(host.querySelector('input')).toBe(draft);expect(draft.value).toBe('Unsaved training');expect(host.querySelector('[role="status"]')).not.toBeNull();expect(host.textContent).not.toContain('Sign out')
 await act(async()=>vi.advanceTimersByTimeAsync(2500))
 expect(host.querySelector('input')).toBe(draft);expect(host.querySelector('[role="status"]')).toBeNull()
})
it('requires an initial decision and recovers on online',async()=>{
 api.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue({blocked:false,warnings:[]});await render();expect(host.querySelector('input')).toBeNull()
 await act(async()=>window.dispatchEvent(new Event('online')));expect(host.querySelector('input')).not.toBeNull()
})
it('keeps the draft during repeated failures and manual retry',async()=>{
 api.mockResolvedValueOnce({blocked:false,warnings:[]}).mockRejectedValue(new TypeError('offline'));await render()
 const draft=host.querySelector('input');draft.value='Keep me'
 await act(async()=>vi.advanceTimersByTimeAsync(90000));expect(api.mock.calls.length).toBeGreaterThan(3);expect(host.querySelector('input')).toBe(draft)
 api.mockResolvedValue({blocked:false,warnings:[]})
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Reload centers').click())
 expect(host.querySelector('input')).toBe(draft);expect(draft.value).toBe('Keep me');expect(host.querySelector('[role="status"]')).toBeNull()
})
it('does not reuse a successful decision after switching accounts into a failed check',async()=>{
 api.mockResolvedValueOnce({blocked:false,warnings:[]}).mockRejectedValue(new TypeError('offline'));await render()
 expect(host.querySelector('input')).not.toBeNull()
 await act(async()=>useStore.setState({user:{id:'another'}}));expect(host.querySelector('input')).toBeNull()
})
it('rejects malformed access responses rather than treating them as authorization',async()=>{
 api.mockResolvedValue({warnings:[]});await render();expect(host.querySelector('input')).toBeNull();expect(host.textContent).toContain('Centers are unavailable')
})
it.each([401,403,404])('does not retain authorization after HTTP %s',async status=>{
 api.mockResolvedValueOnce({blocked:false,warnings:[]}).mockRejectedValue(Object.assign(new Error('refused'),{status}));await render()
 await act(async()=>window.dispatchEvent(new Event('focus')));expect(host.querySelector('input')).toBeNull()
})
it('retains a known denial when its refresh fails',async()=>{
 api.mockResolvedValueOnce({blocked:true,warnings:[]}).mockRejectedValue(new TypeError('offline'));await render()
 await act(async()=>vi.advanceTimersByTimeAsync(30000));expect(host.textContent).toContain('RENEW YOUR FEE');expect(host.querySelector('input')).toBeNull()
})
it('invalidates an in-flight success on a refusal and queues another check',async()=>{
 let resolve;api.mockResolvedValueOnce({blocked:false,warnings:[]}).mockImplementationOnce(()=>new Promise(r=>{resolve=r})).mockRejectedValue(new TypeError('offline'));await render()
 await act(async()=>window.dispatchEvent(new Event('focus')))
 await act(async()=>window.dispatchEvent(new CustomEvent('membership-renewal-required',{detail:{access:{blocked:true,reason:'activation-pending'}}})))
 await act(async()=>resolve({blocked:false,warnings:[]}))
 expect(host.querySelector('input')).toBeNull();expect(host.textContent).toContain('Pending activation');expect(api.mock.calls.filter(([path])=>path==='/api/centers/app-access')).toHaveLength(3)
})
it('does not reuse authorization for another server or accept its late response',async()=>{
 let resolve;api.mockResolvedValueOnce({blocked:false,warnings:[]}).mockImplementationOnce(()=>new Promise(r=>{resolve=r})).mockRejectedValue(new TypeError('offline'));await render()
 await act(async()=>window.dispatchEvent(new Event('focus')))
 await act(async()=>useStore.setState({sync:{...useStore.getState().sync,server:'https://other.invalid'}}))
 await act(async()=>resolve({blocked:false,warnings:[]}));expect(host.querySelector('input')).toBeNull()
})
it('coalesces simultaneous refresh events',async()=>{
 let resolve;api.mockImplementation(()=>new Promise(r=>{resolve=r}));await render()
 await act(async()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'))})
 expect(api).toHaveBeenCalledTimes(1);await act(async()=>resolve({blocked:false,warnings:[]}))
})
it('hides cached private screens until the server decides and shows the deadline',async()=>{let resolve;api.mockImplementation(()=>new Promise(r=>{resolve=r}));await render();expect(host.textContent).not.toContain('Private training');await act(async()=>resolve({blocked:false,warnings:[{centerId:'c',centerName:'Gym',deadline:'2026-11-10'}]}));expect(host.textContent).toContain('Private training');expect(host.textContent).toContain('2026-11-10')})
it('checks live sessions and restores access after renewal',async()=>{api.mockResolvedValueOnce({blocked:true,warnings:[]}).mockResolvedValue({blocked:false,warnings:[]});await render();expect(host.textContent).toContain('RENEW YOUR FEE');expect(host.textContent).toContain('Sign out');await act(async()=>vi.advanceTimersByTimeAsync(30000));expect(host.textContent).toContain('Private training')})
it('a backend refusal triggers a fresh access check',async()=>{api.mockResolvedValueOnce({blocked:false,warnings:[]}).mockResolvedValue({blocked:true,warnings:[]});await render();await act(async()=>window.dispatchEvent(new CustomEvent('membership-renewal-required')));expect(host.textContent).toContain('RENEW YOUR FEE')})
it('ignores a previous account response',async()=>{let resolve;api.mockImplementationOnce(()=>new Promise(r=>{resolve=r})).mockResolvedValue({blocked:false,warnings:[]});await render();await act(async()=>useStore.setState({user:{id:'other'}}));await act(async()=>resolve({blocked:true,warnings:[]}));expect(host.textContent).toContain('Private training')})
it('keeps installations without a centers config usable without querying SQL',async()=>{useStore.setState({config:{allow_guest:false}});await render();expect(host.textContent).toContain('Private training');expect(api).not.toHaveBeenCalled()})
it('waits for unknown initial config rather than treating centers as disabled',async()=>{useStore.setState({config:null});await render();expect(host.textContent).not.toContain('Private training');expect(api).not.toHaveBeenCalled();api.mockResolvedValue({blocked:false,warnings:[]});await act(async()=>useStore.setState({config:{centers:{enabled:true}}}));expect(host.textContent).toContain('Private training')})
it('shows the activation waiting screen and unlocks the existing session when the manager approves',async()=>{
 let approved=false;api.mockImplementation(url=>Promise.resolve(url.endsWith('/status')?{requests:[{id:'r',status:'pending'}]}:{blocked:!approved,reason:approved?undefined:'activation-pending',warnings:[]}));await render();expect(host.textContent).toContain('Pending activation by the center manager');expect(host.textContent).not.toContain('Private training');expect(host.textContent).not.toContain('RENEW YOUR FEE');approved=true;await act(async()=>vi.advanceTimersByTimeAsync(30000));expect(host.textContent).toContain('Private training')
})
it('recovers a missing admission request using the registration center without granting access',async()=>{
 let requested=false;api.mockImplementation(url=>Promise.resolve(url.endsWith('/status')?{requests:requested?[{id:'r',status:'pending'}]:[]}:url.endsWith('/request')?(requested=true,{status:'pending'}):{blocked:true,reason:'activation-pending',registrationCenterId:'center1',warnings:[]}));await render();await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Request activation').click());expect(api).toHaveBeenCalledWith('/api/centers/activation/request',expect.objectContaining({body:JSON.stringify({centerId:'center1'})}));expect(host.textContent).not.toContain('Private training');expect(host.textContent).not.toContain('Request activation')
})
