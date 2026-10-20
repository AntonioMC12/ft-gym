// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect,vi} from 'vitest'
import MemberRecovery from './MemberRecovery.jsx'
const mock=vi.hoisted(()=>({uid:'manager',confirm:null,api:vi.fn()}))
vi.mock('../../store/useStore.js',()=>{const useStore=selector=>selector({user:{id:mock.uid}});useStore.getState=()=>({user:{id:mock.uid}});return {useStore}})
vi.mock('../../lib/api.js',()=>({api:(...args)=>mock.api(...args)}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:options=>{mock.confirm=options}}))
globalThis.IS_REACT_ACT_ENVIRONMENT=true
it('requires identity confirmation, shows a one-time code without exposing the username, and hides it after account switch',async()=>{
 mock.api.mockResolvedValue({code:'TEST-CODE-1234',expires:Date.now()+1800000});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  act(()=>root.render(<MemberRecovery centerId="center" memberId="member" ownerUid="manager"/>));
  act(()=>host.querySelector('button').click());expect(mock.api).not.toHaveBeenCalled();expect(mock.confirm.message).toContain('Verify');
  await act(async()=>{await mock.confirm.onConfirm()});
  expect(mock.api).toHaveBeenCalledWith('/api/centers/members/recovery',expect.objectContaining({body:JSON.stringify({centerId:'center',memberId:'member',confirmed:true})}));
  expect(host.querySelector('[role=status]').textContent).toContain('TEST-CODE-1234');
  mock.uid='other';act(()=>root.render(<MemberRecovery centerId="center" memberId="member" ownerUid="manager"/>));expect(host.textContent).toBe('');
 }finally{act(()=>root.unmount());host.remove();mock.uid='manager'}
})
