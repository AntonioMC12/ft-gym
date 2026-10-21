// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
vi.mock('../../lib/centers-api.js',()=>({centerAccessMember:vi.fn(),centerCommand:vi.fn(),accessErrorKey:()=> 'Access error'}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'actor'},S:{routines:[]}};return {useStore:{getState:()=>state}}})
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
import {centerAccessMember,centerCommand} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {confirmSheet} from '../../sheets.jsx'
import MemberAccess from './MemberAccess.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let root,host
const member={id:'member1',name:'Fictional member',version:3},hold={id:'hold1',version:2,reason:'Manual hold'}
beforeEach(()=>{vi.clearAllMocks();useStore.getState().user={id:'actor'};centerAccessMember.mockResolvedValue({member,allowed:true,hold:null});centerCommand.mockResolvedValue({hold});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(props={})=>act(async()=>{root.render(<MemberAccess centerId="center1" memberId="member1" ownerUid="actor" canManage {...props}/>);await Promise.resolve()})
const click=label=>act(async()=>[...host.querySelectorAll('button')].find(node=>node.textContent===label).click())
const fill=value=>act(()=>{const input=host.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})
it('creates a separate manual hold with reason and current member version only after confirmation',async()=>{
  const before=structuredClone(useStore.getState().S);await render();await fill('Fictional reason');await click('Block access');expect(centerCommand).not.toHaveBeenCalled();await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand).toHaveBeenCalledWith('/api/centers/access/holds/create',expect.objectContaining({centerId:'center1',memberId:'member1',memberVersion:3,reason:'Fictional reason'}));expect(useStore.getState().S).toEqual(before);expect(host.textContent).toContain('Payments do not remove a manual access hold.')
})
it('releases precisely the selected hold version and invalidates old confirmation on member change',async()=>{
  centerAccessMember.mockResolvedValue({member,allowed:false,hold});await render();await click('Release access hold');const old=confirmSheet.mock.calls[0][0];centerAccessMember.mockResolvedValue({member:{...member,id:'member2'},allowed:false,hold:{...hold,id:'hold2'}});await render({memberId:'member2'});await act(async()=>old.onConfirm());expect(centerCommand).not.toHaveBeenCalled();await click('Release access hold');await act(async()=>confirmSheet.mock.calls[1][0].onConfirm());expect(centerCommand).toHaveBeenCalledWith('/api/centers/access/holds/release',expect.objectContaining({centerId:'center1',memberId:'member2',id:'hold2',version:2}))
})
it('does not execute after capability or account change and clears reason in a different member context',async()=>{
  await render();await fill('Private reason');await click('Block access');const old=confirmSheet.mock.calls[0][0];await render({canManage:false});await act(async()=>old.onConfirm());expect(centerCommand).not.toHaveBeenCalled();centerAccessMember.mockResolvedValue({member:{...member,id:'member2'},allowed:true,hold:null});await render({memberId:'member2'});expect(host.querySelector('input').value).toBe('');await fill('New reason');await click('Block access');useStore.getState().user={id:'other'};await act(async()=>confirmSheet.mock.calls[1][0].onConfirm());expect(centerCommand).not.toHaveBeenCalled()
})
