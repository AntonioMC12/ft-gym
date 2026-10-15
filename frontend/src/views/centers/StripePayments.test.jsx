// @vitest-environment happy-dom
import React,{act,StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
vi.mock('../../lib/centers-api.js',()=>({centerStripe:vi.fn(),ownCenterStripe:vi.fn(),centerCommand:vi.fn(),stripeErrorKey:()=> 'error'}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'actor'}};return {useStore:{getState:()=>state}}})
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
import {centerStripe,ownCenterStripe,centerCommand} from '../../lib/centers-api.js'
import {confirmSheet} from '../../sheets.jsx'
import {useStore} from '../../store/useStore.js'
import StripePayments from './StripePayments.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT=true
let root,host
const initial={mode:'test',workerEnabled:true,hasReservation:false,attempts:[],nextCursor:null}
const attempt={id:'attempt_1',receiptId:'receipt_1',state:'open',amountMinor:'1000',currency:'EUR',createdAt:'2026-10-15T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',checkoutUrl:'https://checkout.stripe.com/c/pay/cs_test_1'}
beforeEach(()=>{vi.clearAllMocks();useStore.getState().user={id:'actor'};centerStripe.mockResolvedValue(initial);ownCenterStripe.mockResolvedValue(initial);centerCommand.mockResolvedValue({...initial,hasReservation:true,attempts:[attempt]});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()})
const render=props=>act(async()=>{root.render(<StrictMode><StripePayments centerId="center_1" memberId="member_1" receiptId="receipt_1" availableMinor="1000" ownerUid="actor" canPrepare canReconcile {...props}/></StrictMode>);await Promise.resolve()})
const button=label=>[...host.querySelectorAll('button')].find(node=>node.textContent===label)
const click=label=>act(async()=>button(label).click())
const confirm=()=>confirmSheet.mock.calls.at(-1)[0]
it('stays quiet when payments are not configured and does not show a payment form',async()=>{
  centerStripe.mockResolvedValue({...initial,mode:'off'});await render();expect(host.textContent).toBe('');expect(host.querySelector('input')).toBeNull();expect(centerCommand).not.toHaveBeenCalled()
})
it('confirms the displayed balance and prepares an own checkout without a client member or price selector',async()=>{
  await render({own:true});expect(ownCenterStripe).toHaveBeenCalledWith('center_1',{receiptId:'receipt_1'});expect(centerStripe).not.toHaveBeenCalled();await click('Prepare test checkout');expect(confirm().message).toContain('10.00 EUR');expect(centerCommand).not.toHaveBeenCalled();await act(async()=>confirm().onConfirm());expect(centerCommand).toHaveBeenCalledWith('/api/centers/own/stripe/checkout',expect.objectContaining({centerId:'center_1',receiptId:'receipt_1',expectedBalanceMinor:'1000'}));expect(centerCommand.mock.calls[0][1]).not.toHaveProperty('memberId');expect(centerCommand.mock.calls[0][1]).not.toHaveProperty('amountMinor');expect(host.querySelector('a').getAttribute('rel')).toBe('noopener noreferrer');expect(host.querySelector('a').getAttribute('target')).toBe('_blank')
})
it('retains the same request ID after an unknown response and suppresses duplicate confirmations',async()=>{
  await render();centerCommand.mockRejectedValueOnce(new Error('offline'));await click('Prepare test checkout');await act(async()=>confirm().onConfirm());const requestId=centerCommand.mock.calls[0][1].requestId;
  await click('Reload payment status');let release;centerCommand.mockReturnValueOnce(new Promise(resolve=>release=resolve));await click('Prepare test checkout');const pending=confirm();await act(async()=>{pending.onConfirm();pending.onConfirm();await Promise.resolve()});expect(centerCommand).toHaveBeenCalledTimes(2);expect(centerCommand.mock.calls[1][1].requestId).toBe(requestId);await act(async()=>release({...initial,hasReservation:true,attempts:[attempt]}));expect(button('Prepare test checkout')).toBeUndefined()
})
it('drops a confirmation when the center, balance, permission or account changes',async()=>{
  for(const props of [{centerId:'center_2'},{availableMinor:'500'},{canPrepare:false}]){await render();await click('Prepare test checkout');const old=confirm();await render(props);await act(async()=>old.onConfirm());expect(centerCommand).not.toHaveBeenCalled()}
  await render();await click('Prepare test checkout');useStore.getState().user={id:'other'};await act(async()=>confirm().onConfirm());expect(centerCommand).not.toHaveBeenCalled()
})
it('ignores late responses after leaving the receipt or switching accounts',async()=>{
  let release;centerStripe.mockReturnValueOnce(new Promise(resolve=>release=resolve));await render();await render({centerId:'new'});await act(async()=>release({...initial,attempts:[{...attempt,amountMinor:'99999'}]}));expect(host.textContent).not.toContain('999.99');
  centerCommand.mockReturnValueOnce(new Promise(resolve=>release=resolve));await click('Prepare test checkout');await act(async()=>{confirm().onConfirm();await Promise.resolve()});useStore.getState().user={id:'other'};await act(async()=>release({...initial,attempts:[attempt]}));expect(host.querySelector('a')).toBeNull()
})
it('does not render unsafe provider URLs or offer checkout/reconciliation with read-only permissions',async()=>{
  centerStripe.mockResolvedValue({...initial,hasReservation:true,attempts:[{...attempt,checkoutUrl:'https://evil.example/c/pay/cs_test_1'}]});await render();expect(host.querySelector('a')).toBeNull();expect(button('Prepare test checkout')).toBeUndefined();await render({canPrepare:false,canReconcile:false});expect(button('Check payment')).toBeUndefined();expect(host.querySelector('a')).toBeNull()
})
it('appends a cursor page and never reclassifies old historical paid rows as a new payment',async()=>{
  const changed=vi.fn();centerStripe.mockResolvedValueOnce({...initial,attempts:[attempt],nextCursor:'next'}).mockResolvedValueOnce({...initial,attempts:[{...attempt,id:'older',state:'paid'}]});await act(async()=>{root.render(<StripePayments centerId="center_1" ownerUid="actor" changed={changed}/>);await Promise.resolve()});await click('Show more');expect(centerStripe).toHaveBeenLastCalledWith('center_1',{cursor:'next'});expect(host.textContent).toContain('Checkout open');expect(host.textContent).toContain('Payment recorded.');expect(changed).not.toHaveBeenCalled()
})
it('uses an audited staff reconciliation command and refreshes the full center page afterwards',async()=>{
  centerStripe.mockResolvedValue({...initial,hasReservation:true,attempts:[attempt]});await act(async()=>{root.render(<StripePayments centerId="center_1" ownerUid="actor" canReconcile/>);await Promise.resolve()});await click('Check payment');expect(centerCommand).toHaveBeenCalledWith('/api/centers/stripe/reconcile',expect.objectContaining({centerId:'center_1',id:'attempt_1'}));expect(centerStripe.mock.calls.length).toBeGreaterThan(1)
})
it('notifies the receipt owner when a subsequent status read confirms payment',async()=>{
  const changed=vi.fn(),reservationChanged=vi.fn();centerStripe.mockResolvedValue({...initial,hasReservation:true,attempts:[attempt]});await render({changed,reservationChanged});expect(changed).not.toHaveBeenCalled();centerStripe.mockResolvedValue({...initial,attempts:[{...attempt,state:'paid',checkoutUrl:null}]});await click('Reload payment status');expect(changed).toHaveBeenCalledTimes(1);expect(reservationChanged).toHaveBeenLastCalledWith(false)
})
