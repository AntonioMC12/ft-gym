// @vitest-environment happy-dom
import React,{act,StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:value=>value}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
vi.mock('../../lib/centers-api.js',()=>({centerAutomation:vi.fn(),centerCommand:vi.fn(),centersErrorKey:()=> 'error'}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'root'}};const useStore=fn=>fn(state);useStore.getState=()=>state;return {useStore}})
import {centerAutomation,centerCommand} from '../../lib/centers-api.js'
import {confirmSheet} from '../../sheets.jsx'
import {useStore} from '../../store/useStore.js'
import BillingAutomation from './BillingAutomation.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let root,host
const data={settings:{enabled:false,fromOn:null,version:0},today:'2026-10-14',workerEnabled:false,counts:{done:'2'},pendingEvents:'2',jobs:[]}
beforeEach(()=>{vi.clearAllMocks();useStore.getState().user={id:'root'};centerAutomation.mockResolvedValue(data);centerCommand.mockResolvedValue({});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(centerId='a',platform=true)=>act(async()=>{root.render(<StrictMode><BillingAutomation centerId={centerId} ownerUid="root" platform={platform}/></StrictMode>);await Promise.resolve()})
const toggle=()=>act(async()=>host.querySelector('[role=switch]').click())
it('requires an explicit confirmation with the center civil date and immutable server version',async()=>{
  await render();expect(host.textContent).toContain('The executor is disabled on this server.');await toggle();expect(centerCommand).not.toHaveBeenCalled();expect(confirmSheet.mock.calls[0][0].message).toContain('2026-10-14');await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand).toHaveBeenCalledWith('/api/platform/centers/billing/automation',expect.objectContaining({centerId:'a',fromOn:'2026-10-14',enabled:true,version:0}));
})
it('shows manager outcomes without any platform switch or retry action',async()=>{
  centerAutomation.mockResolvedValue({...data,jobs:[{id:'job',periodStart:'2026-10-01',state:'blocked',attempts:8}]});await render('a',false);expect(host.textContent).toContain('Blocked job');expect(host.querySelector('[role=switch]')).toBeNull();expect(host.textContent).not.toContain('Retry blocked job');
})
it('discards both a delayed read and confirmation from the previous center',async()=>{
  await render();await toggle();const old=confirmSheet.mock.calls[0][0];await render('b');await act(async()=>old.onConfirm());expect(centerCommand).not.toHaveBeenCalled();
  let release;centerAutomation.mockReturnValueOnce(new Promise(resolve=>{release=resolve}));await render('old');await render('new');await act(async()=>release({...data,settings:{enabled:true,fromOn:'2001-01-01',version:99}}));expect(host.querySelector('input').value).toBe('2026-10-14');
})
it('keeps a failed command id and prevents duplicate submissions while awaiting a response',async()=>{
  await render();centerCommand.mockRejectedValueOnce(new Error('offline'));await toggle();await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());const id=centerCommand.mock.calls[0][1].requestId;
  let release;centerCommand.mockReturnValueOnce(new Promise(resolve=>{release=resolve}));await toggle();const confirm=confirmSheet.mock.calls.at(-1)[0];await act(async()=>{confirm.onConfirm();confirm.onConfirm();await Promise.resolve()});expect(centerCommand).toHaveBeenCalledTimes(2);expect(centerCommand.mock.calls[1][1].requestId).toBe(id);await render('b');await act(async()=>release({}));expect(host.querySelector('input').value).toBe('2026-10-14');
})
it('retries a blocked job only through the platform endpoint',async()=>{
  centerAutomation.mockResolvedValue({...data,settings:{enabled:true,fromOn:'2026-10-01',version:2},jobs:[{id:'job',periodStart:'2026-10-01',state:'blocked',attempts:8}]});await render();expect(host.querySelector('input').disabled).toBe(true);await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Retry blocked job').click());expect(centerCommand).toHaveBeenCalledWith('/api/platform/centers/billing/jobs/retry',expect.objectContaining({centerId:'a',id:'job'}));
})
