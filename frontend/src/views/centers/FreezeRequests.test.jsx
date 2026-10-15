// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../lib/centers-api.js',()=>({centerFreezes:vi.fn(),centerCommand:vi.fn(),freezeErrorKey:()=> 'error'}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'alice'}};return {useStore:{getState:()=>state}}})
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
import {centerFreezes,centerCommand} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {confirmSheet} from '../../sheets.jsx'
import FreezeRequests from './FreezeRequests.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const policy={enabled:true,minDays:1,maxDays:20,noticeDays:0,maxDaysPerYear:30,billingEffect:'contract-proration'}
const row={id:'fr_one',memberId:'member1',version:1,state:'pending',effectiveOn:'2026-10-20',resumeOn:'2026-10-22',reason:'Travel',policyVersion:1}
let root,host,changed
beforeEach(()=>{vi.clearAllMocks();useStore.getState().user={id:'alice'};centerFreezes.mockResolvedValue({policy:{config:policy,version:1},requests:[],nextCursor:null});centerCommand.mockResolvedValue({});changed=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(extra={})=>act(async()=>{root.render(<FreezeRequests centerId="a" ownerUid="alice" own today="2026-10-15" changed={changed} {...extra}/>);await Promise.resolve()})
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)
const click=text=>act(async()=>{button(text).click();await Promise.resolve()})
const fill=(element,value)=>act(()=>{Object.getOwnPropertyDescriptor(element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}))})
it('own requests derive identity on the server, explain billing and preserve request id across a failed retry',async()=>{
  centerCommand.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({request:row});await render()
  expect(centerFreezes).toHaveBeenCalledWith('a',{own:true});expect(button('Freeze policy')).toBeUndefined()
  expect(host.textContent).toContain('issued receipts and existing debt stay unchanged')
  const dates=host.querySelectorAll('input[type=date]');fill(dates[0],'2026-10-20');fill(dates[1],'2026-10-22');fill(host.querySelector('textarea'),'Travel')
  await click('Request freeze');await click('Request freeze')
  const [path,body]=centerCommand.mock.calls[0];expect(path).toBe('/api/centers/own/freezes/request');expect(body).not.toHaveProperty('memberId');expect(body).not.toHaveProperty('accountUid');expect(centerCommand.mock.calls[1][1].requestId).toBe(body.requestId)
})
it('no default limits are invented and the policy editor submits an explicit contract-proration configuration',async()=>{
  centerFreezes.mockResolvedValue({policy:{config:{enabled:false},version:0},requests:[],nextCursor:null});await render({own:false,memberId:'member1',memberVersion:3})
  await click('Freeze policy');expect(button('Save').disabled).toBe(true)
  const fields=host.querySelectorAll('input');expect([...fields].every(f=>f.value==='')).toBe(true)
  for(const [index,value] of ['1','20','0','30'].entries())fill(fields[index],value)
  await act(async()=>host.querySelector('button[role=switch]').click());await click('Save')
  expect(centerCommand.mock.calls[0][1]).toMatchObject({centerId:'a',version:0,config:policy})
})
it('approvals require confirmation and old confirmation callbacks cannot mutate another center',async()=>{
  centerFreezes.mockResolvedValue({policy:{config:policy,version:1},requests:[row],nextCursor:null});await render({own:false,memberId:'member1',memberVersion:3})
  await click('Approve request');expect(centerCommand).not.toHaveBeenCalled();const stale=confirmSheet.mock.calls[0][0].onConfirm
  await render({centerId:'b',own:false,memberId:'other',memberVersion:1});await act(async()=>stale());expect(centerCommand).not.toHaveBeenCalled()
  await click('Approve request');await act(async()=>confirmSheet.mock.calls.at(-1)[0].onConfirm())
  expect(centerCommand.mock.calls[0]).toEqual(['/api/centers/freezes/decide',expect.objectContaining({centerId:'b',id:row.id,memberVersion:1,action:'approved'})])
})
it('late list responses do not expose the previous center and inactive members can still withdraw a pending request',async()=>{
  let release;centerFreezes.mockReturnValueOnce(new Promise(resolve=>{release=resolve})).mockResolvedValue({policy:{config:policy,version:1},requests:[row],nextCursor:null})
  await render();await render({centerId:'b',active:false});await act(async()=>release({policy:{config:policy,version:1},requests:[{...row,reason:'Private old center'}],nextCursor:null}))
  expect(host.textContent).not.toContain('Private old center');expect(button('Request freeze')).toBeUndefined();expect(button('Withdraw request').disabled).toBe(false)
  await click('Withdraw request');await act(async()=>confirmSheet.mock.calls[0][0].onConfirm())
  expect(centerCommand.mock.calls[0][0]).toBe('/api/centers/own/freezes/withdraw')
})
it('rejection requires a reason and an edited reason invalidates a pending confirmation',async()=>{
  centerFreezes.mockResolvedValue({policy:{config:policy,version:1},requests:[row],nextCursor:null});await render({own:false,memberId:'member1',memberVersion:3})
  expect(button('Reject request').disabled).toBe(true);fill(host.querySelector('textarea'),'First reason');await click('Reject request')
  fill(host.querySelector('textarea'),'Changed reason');await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand).not.toHaveBeenCalled()
})
