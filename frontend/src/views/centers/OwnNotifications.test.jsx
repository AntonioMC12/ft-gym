// @vitest-environment happy-dom
import React,{act,StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:value=>value}))
vi.mock('../../lib/centers-api.js',()=>({ownCenterNotifications:vi.fn(),centerCommand:vi.fn(),notificationErrorKey:()=> 'error'}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'alice'}};return{useStore:Object.assign(selector=>selector(state),{getState:()=>state})}})
import {ownCenterNotifications,centerCommand} from '../../lib/centers-api.js'
import OwnNotifications from './OwnNotifications.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root
const empty={contact:{email:null,enabled:false,verified:false,version:0},transport:'test-capture'}
beforeEach(()=>{vi.clearAllMocks();ownCenterNotifications.mockResolvedValue(empty);centerCommand.mockResolvedValue({});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(centerId='a',active=true)=>act(async()=>{root.render(<StrictMode><OwnNotifications centerId={centerId} ownerUid="alice" active={active}/></StrictMode>);await Promise.resolve()})
const fill=(label,text)=>act(()=>{const input=[...host.querySelectorAll('label')].find(el=>el.textContent===label).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}))})
const submit=index=>act(async()=>host.querySelectorAll('form')[index].dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
it('submits only an explicit own address and keeps the retry id after a failed request',async()=>{
  await render();fill('Notice email','Alice@example.invalid');centerCommand.mockRejectedValue(new Error('offline'));await submit(0);await submit(0);expect(centerCommand).toHaveBeenCalledTimes(2);expect(centerCommand.mock.calls[0][1]).toMatchObject({centerId:'a',email:'Alice@example.invalid'});expect(centerCommand.mock.calls[0][1]).not.toHaveProperty('accountUid');expect(centerCommand.mock.calls[0][1].requestId).toBe(centerCommand.mock.calls[1][1].requestId)
})
it('verifies a supplied code without receiving a token in the request response',async()=>{
  ownCenterNotifications.mockResolvedValue({...empty,contact:{email:'Alice@example.invalid',verified:false,enabled:false,version:1}});await render();fill('Verification code','a'.repeat(64));await submit(1);expect(centerCommand).toHaveBeenCalledWith('/api/centers/own/notifications/verify',expect.objectContaining({centerId:'a',token:'a'.repeat(64)}))
})
it('keeps opt-out available in an inactive center when the transport is off',async()=>{
  ownCenterNotifications.mockResolvedValue({contact:{email:'Alice@example.invalid',verified:true,enabled:true,version:3},transport:'off'});await render('a',false);expect(host.textContent).toContain('Email notices are not configured.');expect(host.querySelector('input').disabled).toBe(true);await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Disable notices').click());expect(centerCommand).toHaveBeenCalledWith('/api/centers/own/notifications/disable',expect.objectContaining({centerId:'a',version:3}))
})
it('discards a delayed contact from another center',async()=>{
  let release;await render();ownCenterNotifications.mockReturnValueOnce(new Promise(resolve=>{release=resolve}));await render('old');await render('new');await act(async()=>release({...empty,contact:{email:'private@example.invalid',enabled:true,verified:true,version:9}}));expect(host.textContent).not.toContain('private@example.invalid');expect(host.querySelector('input').value).toBe('')
})
it('allows a configured external transport without claiming that delivery is a local capture',async()=>{
  ownCenterNotifications.mockResolvedValue({...empty,transport:'cloudflare'});await render();expect(host.querySelector('input').disabled).toBe(false);expect(host.textContent).not.toContain('Local test: no emails are sent.');expect(host.textContent).not.toContain('Email notices are not configured.')
})
