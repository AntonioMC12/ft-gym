// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:k=>k}))
vi.mock('../../store/useStore.js',()=>({useStore:{getState:()=>({user:{id:'manager'}})}}))
vi.mock('../../lib/centers-api.js',()=>({centerMembers:vi.fn(),centerMember:vi.fn(),centersErrorKey:()=> 'Error'}))
vi.mock('./Passes.jsx',()=>({default:p=><div data-passes={p.memberId} data-readonly={String(p.readOnly)} data-consume={String(p.canConsume)}/>}))
vi.mock('./PassProducts.jsx',()=>({default:()=> <div data-catalog/>}))
vi.mock('./PassHistory.jsx',()=>({default:()=> <div data-history/>}))
import {centerMembers,centerMember} from '../../lib/centers-api.js'
import PassManagement from './PassManagement.jsx'
let host,root
const capabilities=['billing.read','billing.manage','plans.manage','members.read']
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();vi.useFakeTimers();host=document.createElement('div');document.body.append(host);root=createRoot(host);centerMembers.mockResolvedValue({members:[{id:'m',name:'Fictional person',number:'M-1',fee:{hasPass:true,passRemaining:3}}],nextCursor:null});centerMember.mockResolvedValue({member:{id:'m',name:'Fictional person',state:'active',number:'M-1'},today:'2026-10-16'})})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()})
const render=(caps=capabilities,c='a')=>act(async()=>{root.render(<PassManagement centerId={c} ownerUid="manager" capabilities={caps} active/>);await Promise.resolve()})
const click=text=>act(async()=>[...host.querySelectorAll('button')].find(n=>n.textContent.includes(text)).click())
it('selects a member and opens only their passes, with separate catalogue and history tabs',async()=>{
 await render();expect(centerMembers).toHaveBeenCalledWith('a',{query:''});await click('Fictional person');expect(centerMember).toHaveBeenCalledWith('a','m');expect(host.querySelector('[data-passes]').getAttribute('data-passes')).toBe('m');expect(host.querySelector('[data-passes]').getAttribute('data-consume')).toBe('true');await click('Pass products');expect(host.querySelector('[data-catalog]')).not.toBeNull();expect(host.querySelector('[data-passes]')).toBeNull();await click('Pass history');expect(host.querySelector('[data-history]')).not.toBeNull();
})
it('filters the member directory by server query and preserves read-only permissions',async()=>{
 await render(['billing.read','members.read']);const input=host.querySelector('input');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'M-1');input.dispatchEvent(new Event('input',{bubbles:true}));await vi.advanceTimersByTimeAsync(300)});expect(centerMembers).toHaveBeenLastCalledWith('a',{query:'M-1'});await click('Fictional person');expect(host.querySelector('[data-passes]').getAttribute('data-readonly')).toBe('true');expect(host.querySelector('[data-passes]').getAttribute('data-consume')).toBe('false');expect(host.textContent).not.toContain('Pass products');
})
it('does not expose member information to catalogue-only permissions',async()=>{
 await render(['plans.manage']);expect(centerMembers).not.toHaveBeenCalled();expect(host.querySelector('[data-catalog]')).not.toBeNull();expect(host.textContent).not.toContain('Fictional person');
})
