// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:value=>value}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
vi.mock('../../lib/centers-api.js',()=>({centerNotifications:vi.fn(),centerCommand:vi.fn(),notificationErrorKey:()=> 'error'}))
vi.mock('../../store/useStore.js',()=>({useStore:Object.assign(()=>({id:'root'}),{getState:()=>({user:{id:'root'}})})}))
import {centerNotifications,centerCommand} from '../../lib/centers-api.js'
import {confirmSheet} from '../../sheets.jsx'
import NotificationSettings from './NotificationSettings.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root
const data={policy:{enabled:false,receipts:true,dueLeadDays:3,debtRepeatDays:7,priceNoticeDays:30,version:2},counts:{blocked:'1'},transport:'test-capture'}
beforeEach(()=>{vi.clearAllMocks();centerNotifications.mockResolvedValue(data);centerCommand.mockResolvedValue({});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(centerId='a',platform=true)=>act(async()=>{root.render(<NotificationSettings centerId={centerId} ownerUid="root" platform={platform}/>);await Promise.resolve()})
const click=text=>act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent===text).click())
it('confirms explicit policy days and uses the server version',async()=>{
  await render();await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(confirmSheet.mock.calls[0][0].message).toContain('Price notice lead (days): 30');expect(centerCommand).not.toHaveBeenCalled();await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand).toHaveBeenCalledWith('/api/platform/centers/notifications/policy',expect.objectContaining({centerId:'a',version:2,priceNoticeDays:30}))
})
it('removes mutations for a manager and invalidates an old platform confirmation',async()=>{
  await render();await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));const old=confirmSheet.mock.calls[0][0];await render('a',false);await act(async()=>old.onConfirm());expect(centerCommand).not.toHaveBeenCalled();expect(host.querySelector('form')).toBeNull();expect(host.textContent).not.toContain('Retry blocked notices')
})
it('requeues blocked notices only through the bounded platform command',async()=>{
  await render();await click('Retry blocked notices');expect(centerCommand).toHaveBeenCalledWith('/api/platform/centers/notifications/retry',expect.objectContaining({centerId:'a'}));expect(centerCommand.mock.calls[0][1]).not.toHaveProperty('recipient')
})
