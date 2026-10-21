// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../store/useStore.js',()=>({useStore:{getState:()=>({user:{id:'manager'}})}}))
vi.mock('../../lib/centers-api.js',()=>({centerCommand:vi.fn(),centersErrorKey:()=> 'error'}))
import {centerCommand} from '../../lib/centers-api.js'
import BillingPreview from './BillingPreview.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root
const quote={periodStart:'2026-10-01',periodEnd:'2026-11-01',chargeDays:19,activeDays:19,periodDays:31,discountBasisPoints:1000,netMinor:'1595',taxMinor:'335',totalMinor:'1930',currency:'EUR',proration:'actual-days'}
beforeEach(()=>{vi.clearAllMocks();centerCommand.mockResolvedValue({quote});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(centerId='a')=>act(async()=>{root.render(<BillingPreview centerId={centerId} memberId="member1" contractId="contract1" ownerUid="manager"/>);await Promise.resolve()})
const open=()=>act(async()=>{host.querySelector('button').click()})
const submit=()=>act(async()=>{host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await Promise.resolve()})
it('requests SQL-derived preview without client prices and displays balanced cents',async()=>{
  await render();await open();expect(centerCommand).not.toHaveBeenCalled();await submit()
  expect(centerCommand).toHaveBeenCalledWith('/api/centers/billing/preview',{centerId:'a',memberId:'member1',id:'contract1'})
  expect(host.textContent).toContain('19 / 31');expect(host.textContent).toContain('19.30 EUR');expect(host.textContent).toContain('Preview only. No receipt or payment is created.')
})
it('refuses to invent a quote when tax and proration conditions are missing',async()=>{
  centerCommand.mockRejectedValue({code:'billing-policy-required'});await render();await open();await submit();expect(host.textContent).toContain('Tax and proration must be configured before calculating charges.');expect(host.textContent).not.toContain('Total amount')
})
it('drops delayed old-center amounts and clears the previous period after a scope change',async()=>{
  let release;centerCommand.mockReturnValueOnce(new Promise(resolve=>{release=resolve}));await render();await open();await submit();await render('b');await act(async()=>{release({quote})})
  expect(host.textContent).not.toContain('19.30 EUR');expect(host.querySelector('form')).toBeNull()
})
it('explains incomplete immutable conditions before requesting a quote and offers configuration',async()=>{
  const configure=vi.fn();await act(async()=>root.render(<BillingPreview centerId="a" memberId="member1" contractId="contract1" ownerUid="manager" policyMissing onConfigure={configure}/>));
  expect(host.querySelector('form')).toBeNull();expect(centerCommand).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Existing subscriptions keep their original terms.');
  await act(async()=>host.querySelector('button').click());expect(configure).toHaveBeenCalledOnce();expect(centerCommand).not.toHaveBeenCalled();
})
