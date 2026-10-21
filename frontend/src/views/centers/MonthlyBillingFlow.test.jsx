// @vitest-environment happy-dom
import React,{act,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../store/useStore.js',()=>({useStore:{getState:()=>({user:{id:'manager'}})}}))
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
vi.mock('../../store/useUI.js',()=>({useUI:{getState:()=>({toast:vi.fn()})}}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
vi.mock('./StripePayments.jsx',()=>({default:()=>null}))
vi.mock('../../lib/centers-api.js',()=>({centerCommand:vi.fn(),centerReceipts:vi.fn(),receiptsErrorKey:()=> 'error',centersErrorKey:()=> 'error',paymentsErrorKey:()=> 'error'}))
import {centerCommand,centerReceipts} from '../../lib/centers-api.js'
import {confirmSheet} from '../../sheets.jsx'
import BillingPreview from './BillingPreview.jsx'
import Receipts from './Receipts.jsx'

it('monthly issuance remains unpaid until a separate confirmed payment, then refreshes the visible balance',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 const snapshot={memberName:'Fictional member',memberNumber:'M-1',periodStart:'2026-10-01',periodEnd:'2026-11-01',chargeDays:31,activeDays:31,periodDays:31,discountBasisPoints:0,netMinor:'2500',taxMinor:'0',totalMinor:'2500',currency:'EUR',proration:'none'}
 let receipt=null
 centerReceipts.mockImplementation(async()=>({receipts:receipt?[receipt]:[],nextCursor:null}))
 centerCommand.mockImplementation(async(path,body)=>{
  if(path==='/api/centers/billing/preview')return {quote:snapshot,quoteHash:'a'.repeat(64),dueOn:'2026-11-05'}
  if(path==='/api/centers/receipts/generate'){receipt={id:'receipt',snapshot,...snapshot,dueOn:'2026-11-05',settlement:{paidMinor:'0',refundedMinor:'0',balanceMinor:'2500'}};return{receipt}}
  if(path==='/api/centers/payments/record'){expect(body.allocations).toEqual([{receiptId:'receipt',amountMinor:'2500'}]);receipt={...receipt,settlement:{paidMinor:'2500',refundedMinor:'0',balanceMinor:'0'}};return{payment:{id:'payment'}}}
  throw Error('Unexpected command')
 })
 function Flow(){const [revision,setRevision]=useState(0);return <><BillingPreview centerId="c" memberId="m" contractId="s" ownerUid="manager" today="2026-10-20" intervalMonths={1} canGenerate onGenerated={()=>setRevision(v=>v+1)}/><Receipts centerId="c" memberId="m" ownerUid="manager" today="2026-10-20" revision={revision} canRecord changed={()=>setRevision(v=>v+1)}/></>}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 const click=label=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===label).click())
 try{
  await act(async()=>root.render(<Flow/>));await click('Create receipt');await click('Create receipt');expect(centerCommand).toHaveBeenCalledTimes(1);expect(confirmSheet.mock.calls.at(-1)[0].title).toBe('Create receipt')
  await act(async()=>confirmSheet.mock.calls.at(-1)[0].onConfirm());expect(host.textContent).toContain('Pending payment · 25.00 EUR');expect(host.textContent).toContain('Receipt created. No payment has been recorded.');expect(centerCommand.mock.calls.map(c=>c[0])).not.toContain('/api/centers/payments/record')
  await click('Record payment');expect(host.querySelector('input[inputmode=decimal]').value).toBe('25.00');await click('Record payment');expect(centerCommand).toHaveBeenCalledTimes(2);expect(confirmSheet.mock.calls.at(-1)[0].title).toBe('Record payment')
  await act(async()=>confirmSheet.mock.calls.at(-1)[0].onConfirm());expect(centerCommand).toHaveBeenCalledTimes(3);expect(host.querySelector('.centers-receipt-settlement').textContent).toBe('Paid');expect([...host.querySelectorAll('button')].some(b=>b.textContent==='Record payment')).toBe(false)
 }finally{act(()=>root.unmount());host.remove()}
})
