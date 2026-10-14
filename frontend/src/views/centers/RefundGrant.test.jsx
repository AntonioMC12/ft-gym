// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../store/useStore.js',()=>({useStore:{getState:()=>({user:{id:'root'}})}}))
vi.mock('../../lib/centers-api.js',()=>({centerCommand:vi.fn(),centersErrorKey:()=> 'error'}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
import {centerCommand} from '../../lib/centers-api.js'
import {confirmSheet} from '../../sheets.jsx'
import RefundGrant from './RefundGrant.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root,saved
beforeEach(()=>{vi.clearAllMocks();centerCommand.mockResolvedValue({ok:true});saved=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const role={id:'role1',accountUid:'manager',version:3,extraCapabilities:[]}
const render=(centerId='a')=>act(async()=>{root.render(<RefundGrant centerId={centerId} role={role} ownerUid="root" saved={saved}/>);await Promise.resolve()})
it('confirms the account and permission, then posts assignment version to the platform endpoint',async()=>{
  await render();await act(async()=>host.querySelector('button').click());expect(centerCommand).not.toHaveBeenCalled();expect(confirmSheet.mock.calls[0][0].message).toContain('manager');await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand.mock.calls[0][0]).toBe('/api/platform/centers/role-capabilities');expect(centerCommand.mock.calls[0][1]).toMatchObject({centerId:'a',assignmentId:'role1',version:3,allowRefund:true});expect(saved).toHaveBeenCalledOnce()
})
it('does not grant after switching away from the center that opened confirmation',async()=>{
  await render();await act(async()=>host.querySelector('button').click());const old=confirmSheet.mock.calls[0][0];await render('b');await act(async()=>old.onConfirm());expect(centerCommand).not.toHaveBeenCalled()
})
