// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../store/useStore.js',()=>({useStore:{getState:()=>({user:{id:'manager'}})}}))
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
vi.mock('../../store/useUI.js',()=>({useUI:{getState:()=>({toast:vi.fn()})}}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn(options=>options.onConfirm())}))
vi.mock('../../lib/centers-api.js',()=>({centerCommand:vi.fn(),paymentsErrorKey:()=> 'Check the amount, date and payment details.'}))
import {centerCommand} from '../../lib/centers-api.js'
import {confirmSheet} from '../../sheets.jsx'
import ManualMovement from './ManualMovement.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root,changed,close
beforeEach(()=>{vi.clearAllMocks();confirmSheet.mockImplementation(options=>options.onConfirm());centerCommand.mockResolvedValue({payment:{id:'p'}});changed=vi.fn();close=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(props={})=>act(async()=>{root.render(<ManualMovement centerId="a" memberId="m" receiptId="r" availableMinor="1800" today="2026-10-14" ownerUid="manager" changed={changed} close={close} {...props}/>);await Promise.resolve()})
const fill=(input,value)=>act(()=>{Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})
const submit=()=>act(async()=>{host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await Promise.resolve()})
it('confirms a partial exact amount and records one allocation without marking the receipt paid',async()=>{
  await render();fill(host.querySelector('input'),'6,00');await submit();expect(confirmSheet.mock.calls[0][0].message).toContain('6.00 EUR');expect(centerCommand.mock.calls[0][0]).toBe('/api/centers/payments/record');expect(centerCommand.mock.calls[0][1]).toMatchObject({centerId:'a',memberId:'m',amountMinor:'600',paidOn:'2026-10-14',method:'cash',allocations:[{receiptId:'r',amountMinor:'600'}]});expect(centerCommand.mock.calls[0][1]).not.toHaveProperty('paid');expect(changed).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce()
})
it('retries the identical command after network failure and does not announce success',async()=>{
  centerCommand.mockRejectedValue(new Error('network'));await render();await submit();await submit();expect(centerCommand.mock.calls[0][1]).toEqual(centerCommand.mock.calls[1][1]);expect(changed).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled()
})
it('requires a refund reason and sends the payment allocation with a restored-balance callback',async()=>{
  await render({paymentId:'p',earliestOn:'2026-10-10'});await submit();expect(centerCommand).not.toHaveBeenCalled();fill(host.querySelector('textarea'),'Synthetic refund');fill(host.querySelector('input'),'2.00');await submit();expect(centerCommand.mock.calls[0][0]).toBe('/api/centers/payments/refund');expect(centerCommand.mock.calls[0][1]).toMatchObject({paymentId:'p',receiptId:'r',amountMinor:'200',refundedOn:'2026-10-14',reason:'Synthetic refund'});expect(centerCommand.mock.calls[0][1]).not.toHaveProperty('allocations')
})
it('blocks zero, excessive amounts and future movement dates before confirmation',async()=>{
  await render();for(const value of ['0','18.01']){fill(host.querySelector('input'),value);await submit()}fill(host.querySelector('input'),'1');fill(host.querySelector('input[type=date]'),'2026-10-15');await submit();expect(confirmSheet).not.toHaveBeenCalled();expect(centerCommand).not.toHaveBeenCalled()
})
it('a confirmation from the previous center cannot record a movement',async()=>{
  confirmSheet.mockImplementation(()=>{});await render();await submit();const old=confirmSheet.mock.calls[0][0];await render({centerId:'b'});await act(async()=>old.onConfirm());expect(centerCommand).not.toHaveBeenCalled()
})
it('editing an amount after opening confirmation invalidates the captured command',async()=>{
  confirmSheet.mockImplementation(()=>{});await render();await submit();const old=confirmSheet.mock.calls[0][0];fill(host.querySelector('input'),'2');await act(async()=>old.onConfirm());expect(centerCommand).not.toHaveBeenCalled()
})
