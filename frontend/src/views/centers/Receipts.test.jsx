// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../store/useStore.js',()=>({useStore:{getState:()=>({user:{id:'manager'}})}}))
vi.mock('../../lib/centers-api.js',()=>({centerReceipts:vi.fn(),ownCenterReceipts:vi.fn(),receiptsErrorKey:()=> 'error'}))
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
import {centerReceipts,ownCenterReceipts} from '../../lib/centers-api.js'
import Receipts from './Receipts.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root
const snapshot={periodStart:'2026-10-01',periodEnd:'2026-11-01',chargeDays:31,activeDays:31,periodDays:31,discountBasisPoints:0,netMinor:'1000',taxMinor:'210',totalMinor:'1210',currency:'EUR',proration:'actual-days',memberName:'Name at issuance',memberNumber:'M-000001'}
const receipt={id:'receipt1',periodStart:snapshot.periodStart,periodEnd:snapshot.periodEnd,dueOn:'2026-10-14',totalMinor:'1210',currency:'EUR',snapshot}
beforeEach(()=>{vi.clearAllMocks();centerReceipts.mockResolvedValue({receipts:[receipt],nextCursor:null});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(centerId='a',revision=0)=>act(async()=>{root.render(<Receipts centerId={centerId} memberId="member1" ownerUid="manager" revision={revision}/>);await Promise.resolve()})
it('opens the immutable snapshot and offers no amount editing or paid switch',async()=>{
  await render();await act(async()=>{host.querySelector('button.lrow').click()});expect(host.textContent).toContain('Name at issuance');expect(host.textContent).toContain('12.10 EUR');expect(host.querySelector('input')).toBeNull();expect(host.querySelector('[role=switch]')).toBeNull()
})
it('own mode uses the session-bound endpoint and cannot expose a payment action even with canRecord',async()=>{
  ownCenterReceipts.mockResolvedValue({receipts:[{...receipt,settlement:{paidMinor:'0',refundedMinor:'0',balanceMinor:'1210'}}],nextCursor:null});await act(async()=>{root.render(<Receipts centerId="a" memberId="untrusted" ownerUid="manager" own canRecord/>);await Promise.resolve()});expect(ownCenterReceipts).toHaveBeenCalledWith('a');expect(centerReceipts).not.toHaveBeenCalled();await act(async()=>host.querySelector('button.lrow').click());expect(host.textContent).not.toContain('Record payment')
})
it('loads another server page without replacing already visible receipts',async()=>{
  centerReceipts.mockResolvedValueOnce({receipts:[receipt],nextCursor:'next'}).mockResolvedValueOnce({receipts:[{...receipt,id:'receipt2',totalMinor:'2400'}],nextCursor:null});await render();await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='Show more').click()});expect(centerReceipts).toHaveBeenLastCalledWith('a','member1',{cursor:'next'});expect(host.textContent).toContain('12.10 EUR');expect(host.textContent).toContain('24.00 EUR')
})
it('drops a delayed receipt page from a previous center',async()=>{
  let release;centerReceipts.mockReturnValueOnce(new Promise(resolve=>{release=resolve})).mockResolvedValueOnce({receipts:[],nextCursor:null});await render();await render('b');await act(async()=>{release({receipts:[receipt],nextCursor:null})});expect(host.textContent).not.toContain('12.10 EUR')
})
it('a new generation refresh clears an opened snapshot and rereads authoritative records',async()=>{
  await render();await act(async()=>{host.querySelector('button.lrow').click()});await render('a',1);expect(centerReceipts).toHaveBeenCalledTimes(2);expect(host.textContent).not.toContain('Name at issuance')
})
