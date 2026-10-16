// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:k=>k}))
vi.mock('../../store/useStore.js',()=>({useStore:{getState:()=>({user:{id:'manager'}})}}))
vi.mock('../../lib/centers-api.js',()=>({centerSubscriptions:vi.fn(),centerPasses:vi.fn(),centerPassProducts:vi.fn(),centerCommand:vi.fn(),passesErrorKey:()=> 'Error',subscriptionsErrorKey:()=> 'Error'}))
import {centerSubscriptions,centerPasses,centerCommand} from '../../lib/centers-api.js'
import MemberBillingHistory from './MemberBillingHistory.jsx'
let root,host
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();host=document.createElement('div');document.body.append(host);root=createRoot(host);centerSubscriptions.mockResolvedValue({today:'2026-10-16',subscriptions:[{id:'s',name:'Past fee',status:'ended',priceMinor:'2500',currency:'EUR',startsOn:'2026-09-01'}]});centerPasses.mockResolvedValue({passes:[{id:'p',name:'Past pass',credits:10,remaining:0,status:'exhausted',startsOn:'2026-09-01',endsOn:'2026-10-01'}],nextCursor:null})})
afterEach(()=>{act(()=>root.unmount());host.remove()})
it('loads the chosen member histories with no acquisition, revocation or payment actions',async()=>{
 await act(async()=>{root.render(<MemberBillingHistory centerId="c" memberId="m" ownerUid="manager"/>);await Promise.resolve()});expect(centerSubscriptions).toHaveBeenCalledWith('c','m');expect(centerPasses).toHaveBeenCalledWith('c',{memberId:'m'},false);expect(host.textContent).toContain('Past fee');expect(host.textContent).toContain('Past pass');expect(host.textContent).not.toContain('Revoke pass');expect(host.textContent).not.toContain('Assign pass');expect(centerCommand).not.toHaveBeenCalled();
})
it('does not display a delayed previous member contract',async()=>{
 let release;centerSubscriptions.mockReturnValueOnce(new Promise(resolve=>{release=resolve}));await act(async()=>{root.render(<MemberBillingHistory centerId="c" memberId="old" ownerUid="manager"/>)});await act(async()=>{root.render(<MemberBillingHistory centerId="c" memberId="new" ownerUid="manager"/>);await Promise.resolve()});await act(async()=>release({subscriptions:[{id:'secret',name:'Wrong member'}]}));expect(host.textContent).not.toContain('Wrong member');expect(centerPasses).toHaveBeenLastCalledWith('c',{memberId:'new'},false);
})
