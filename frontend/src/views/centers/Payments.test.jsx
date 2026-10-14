// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../store/useStore.js',()=>({useStore:{getState:()=>({user:{id:'manager'}})}}))
vi.mock('../../lib/centers-api.js',()=>({centerPayments:vi.fn(),ownCenterPayments:vi.fn(),paymentsErrorKey:()=> 'error'}))
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
import {centerPayments,ownCenterPayments} from '../../lib/centers-api.js'
import Payments from './Payments.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root
const payment={id:'p',paidOn:'2026-10-14',amountMinor:'600',currency:'EUR',method:'cash',reference:'Synthetic receipt',allocations:[{receiptId:'r',amountMinor:'600',refundedMinor:'200',refundableMinor:'400'}],refunds:[{id:'f',refundedOn:'2026-10-14',amountMinor:'200',reason:'Synthetic correction'}]}
beforeEach(()=>{vi.clearAllMocks();centerPayments.mockResolvedValue({payments:[payment],nextCursor:null});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(props={})=>act(async()=>{root.render(<Payments centerId="a" memberId="m" ownerUid="manager" today="2026-10-14" {...props}/>);await Promise.resolve()})
const open=()=>act(async()=>host.querySelector('button.lrow').click())
it('shows allocation/refund history but no refund action without explicit capability',async()=>{
  await render();await open();expect(host.textContent).toContain('6.00 EUR');expect(host.textContent).toContain('2.00 EUR');expect(host.textContent).toContain('Synthetic correction');expect(host.textContent).not.toContain('Record refund');expect(host.querySelector('input')).toBeNull()
})
it('own mode reads through the own endpoint and never exposes refund actions',async()=>{
  ownCenterPayments.mockResolvedValue({payments:[payment],nextCursor:null});await render({own:true,canRefund:true});expect(ownCenterPayments).toHaveBeenCalledWith('a');expect(centerPayments).not.toHaveBeenCalled();await open();expect(host.textContent).not.toContain('Record refund')
})
it('an explicitly authorized manager can open a refund form limited to the remaining allocation',async()=>{
  await render({canRefund:true});await open();await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Record refund').click());expect(host.querySelector('input').value).toBe('4.00');expect(host.querySelector('input[type=date]').min).toBe('2026-10-14')
})
it('a delayed prior-center payment page cannot populate another center',async()=>{
  let release;centerPayments.mockReturnValueOnce(new Promise(resolve=>release=resolve)).mockResolvedValueOnce({payments:[],nextCursor:null});await render();await render({centerId:'b'});await act(async()=>release({payments:[payment],nextCursor:null}));expect(host.textContent).not.toContain('6.00 EUR')
})
it('uses actual pagination and clears details when ledger revision changes',async()=>{
  centerPayments.mockResolvedValueOnce({payments:[payment],nextCursor:'cursor'}).mockResolvedValueOnce({payments:[{...payment,id:'p2',amountMinor:'1200'}],nextCursor:null});await render();await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Show more').click());expect(centerPayments).toHaveBeenLastCalledWith('a','m',{cursor:'cursor'});expect(host.textContent).toContain('12.00 EUR');await open();await render({revision:1});expect(host.textContent).not.toContain('Synthetic correction')
})
