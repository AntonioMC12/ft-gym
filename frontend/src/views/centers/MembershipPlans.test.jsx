// @vitest-environment happy-dom
import React,{act,StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'manager'}};return{useStore:Object.assign(selector=>selector(state),{getState:()=>state})}})
vi.mock('../../lib/centers-api.js',()=>({centerPlans:vi.fn(),centerPlan:vi.fn(),centerCommand:vi.fn(),plansErrorKey:()=> 'error'}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn(options=>options.onConfirm())}))
import {centerPlans,centerPlan,centerCommand} from '../../lib/centers-api.js'
import MembershipPlans from './MembershipPlans.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root
const plan={id:'plan1',priceVersionId:'price1',name:'Synthetic monthly',priceMinor:'2999',currency:'EUR',intervalMonths:1,revision:1,version:1,archived:false,priceIncludesTax:true,taxBasisPoints:2100,proration:'actual-days'}
beforeEach(()=>{vi.clearAllMocks();centerPlans.mockResolvedValue({plans:[plan],nextCursor:null});centerPlan.mockResolvedValue({plan,versions:[plan]});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(centerId='a',strict=false)=>act(async()=>{const view=<MembershipPlans centerId={centerId} ownerUid="manager"/>;root.render(strict?<StrictMode>{view}</StrictMode>:view);await Promise.resolve()})
const click=text=>act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent===text).click();await Promise.resolve()})
const fill=(label,value)=>act(()=>{const input=[...host.querySelectorAll('label')].find(el=>el.textContent===label).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})
it('creates exact minor-unit prices and survives StrictMode setup/cleanup',async()=>{
  centerCommand.mockResolvedValue({plan});await render('a',true);await click('New membership plan');fill('Membership plan name','Synthetic new');fill('Price (EUR)','29,99');await click('Save')
  expect(centerCommand).toHaveBeenCalledWith('/api/centers/plans/create',expect.objectContaining({priceMinor:'2999',priceIncludesTax:null,taxBasisPoints:null,proration:null}))
  expect(host.textContent).toContain('New membership plan');expect(host.querySelector('form')).toBeNull()
})
it('keeps a failed retry id and archives only with the server version',async()=>{
  centerCommand.mockRejectedValue(new Error('temporary'));await render();await act(async()=>{host.querySelector('button.lrow').click()});await click('Save');await click('Save')
  expect(centerCommand.mock.calls[0][1].requestId).toBe(centerCommand.mock.calls[1][1].requestId);expect(centerCommand.mock.calls[0][1]).toMatchObject({id:'plan1',version:1,priceMinor:'2999'})
  await click('Archive membership plan');expect(centerCommand).toHaveBeenLastCalledWith('/api/centers/plans/archive',{centerId:'a',id:'plan1',version:1})
})
it('duplicates an explicit historical price version without changing its conditions',async()=>{
  centerCommand.mockResolvedValue({plan});await render();await click('Duplicate');fill('Membership plan name','Synthetic copy');await click('Save')
  expect(centerCommand).toHaveBeenCalledWith('/api/centers/plans/duplicate',expect.objectContaining({id:'plan1',priceVersionId:'price1',name:'Synthetic copy'}))
  expect(centerCommand.mock.calls[0][1]).not.toHaveProperty('priceMinor')
})
it('paginates with server cursor and clears a delayed result from another center',async()=>{
  centerPlans.mockResolvedValueOnce({plans:[plan],nextCursor:'next'}).mockResolvedValueOnce({plans:[{...plan,id:'two',name:'Second'}],nextCursor:null});await render();await click('Show more')
  expect(host.textContent).toContain('Second');expect(centerPlans).toHaveBeenLastCalledWith('a',{query:'',archived:'active',cursor:'next'})
  let release;centerPlans.mockReturnValueOnce(new Promise(resolve=>{release=resolve})).mockResolvedValueOnce({plans:[],nextCursor:null});await render('old');await render('new');await act(async()=>{release({plans:[plan],nextCursor:null})})
  expect(host.textContent).not.toContain('Synthetic monthly')
})
it('the archive filter uses the shared Switch boolean callback',async()=>{
  await render();await act(async()=>{host.querySelector('[role=switch]').click()})
  expect(centerPlans).toHaveBeenLastCalledWith('a',{query:'',archived:'all'})
})
