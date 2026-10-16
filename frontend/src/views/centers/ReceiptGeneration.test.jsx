// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../store/useStore.js',()=>({useStore:{getState:()=>({user:{id:'manager'}})}}))
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
vi.mock('../../store/useUI.js',()=>({useUI:{getState:()=>({toast:vi.fn()})}}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn(options=>options.onConfirm())}))
vi.mock('../../lib/centers-api.js',()=>({centerCommand:vi.fn(),centersErrorKey:()=> 'error',receiptsErrorKey:e=>e.code==='quote-changed'?'The amount changed. Preview it again before creating the receipt.':'error'}))
import {centerCommand} from '../../lib/centers-api.js'
import {confirmSheet} from '../../sheets.jsx'
import Guard from './NavigationGuard.jsx'
import BillingPreview from './BillingPreview.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root,generated
const quote={periodStart:'2026-10-01',periodEnd:'2026-11-01',chargeDays:19,activeDays:19,periodDays:31,discountBasisPoints:1000,netMinor:'1595',taxMinor:'335',totalMinor:'1930',currency:'EUR',proration:'actual-days'},hash='a'.repeat(64)
beforeEach(()=>{vi.clearAllMocks();confirmSheet.mockImplementation(options=>options.onConfirm());centerCommand.mockResolvedValue({quote,quoteHash:hash});generated=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(centerId='a')=>act(async()=>{root.render(<BillingPreview centerId={centerId} memberId="member1" contractId="contract1" ownerUid="manager" today="2026-10-14" canGenerate onGenerated={generated}/>);await Promise.resolve()})
const click=text=>act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent===text).click();await Promise.resolve()})
const preview=async()=>{await render();await click('Preview charge');await click('Preview charge')}
it('confirms the visible amount/due date, sends only IDs and the server digest, then announces the committed receipt',async()=>{
  centerCommand.mockResolvedValueOnce({quote,quoteHash:hash}).mockResolvedValueOnce({receipt:{id:'receipt1',snapshot:quote}});await preview();await click('Create receipt')
  expect(confirmSheet.mock.calls[0][0].message).toContain('19.30 EUR');expect(confirmSheet.mock.calls[0][0].message).toContain('2026-10-14')
  const [path,body]=centerCommand.mock.calls[1];expect(path).toBe('/api/centers/receipts/generate');expect(body).toMatchObject({subscriptionId:'contract1',periodStart:'2026-10-01',dueOn:'2026-10-14',expectedQuoteHash:hash});expect(body).not.toHaveProperty('totalMinor')
  expect(generated).toHaveBeenCalledOnce();expect(host.textContent).toContain('Receipt created.');expect(host.textContent).not.toContain('Preview only. No receipt or payment is created.')
})
it('preserves the identical command/request ID across failed retries without announcing success',async()=>{
  centerCommand.mockResolvedValueOnce({quote,quoteHash:hash}).mockRejectedValue(new Error('temporary'));await preview();await click('Create receipt');await click('Create receipt')
  expect(centerCommand.mock.calls[1][1]).toEqual(centerCommand.mock.calls[2][1]);expect(generated).not.toHaveBeenCalled();expect(host.textContent).not.toContain('Receipt created.')
})
it('a stale preview forces another preview instead of sending the old amount again',async()=>{
  centerCommand.mockResolvedValueOnce({quote,quoteHash:hash}).mockRejectedValueOnce({code:'quote-changed'});await preview();await click('Create receipt')
  expect(host.textContent).toContain('The amount changed. Preview it again before creating the receipt.');expect(host.textContent).not.toContain('Total amount');expect([...host.querySelectorAll('button')].some(button=>button.textContent==='Create receipt')).toBe(true)
})
it('a confirmation from the old center cannot create a receipt after changing context',async()=>{
  let confirm;confirmSheet.mockImplementation(options=>{confirm=options.onConfirm});await preview();await click('Create receipt');await render('b');await act(async()=>{await confirm()})
  expect(centerCommand).toHaveBeenCalledTimes(1);expect(generated).not.toHaveBeenCalled()
})
it('replayed existing receipts display their issued snapshot and zero-charge replies do not invent a receipt',async()=>{
  const original={...quote,totalMinor:'1210',netMinor:'1000',taxMinor:'210'};centerCommand.mockResolvedValueOnce({quote,quoteHash:hash}).mockResolvedValueOnce({receipt:{id:'existing',snapshot:original},alreadyExists:true});await preview();await click('Create receipt');expect(host.textContent).toContain('12.10 EUR');expect(host.textContent).toContain('Receipt already exists.')
  await render('b');centerCommand.mockResolvedValueOnce({quote:{...quote,totalMinor:'0'},quoteHash:hash}).mockResolvedValueOnce({skipped:true,reason:'no-charge'});await click('Preview charge');await click('Preview charge');await click('Create receipt');expect(host.textContent).toContain('No charge for this period.')
})
it('future period previews remain readable but cannot issue a receipt',async()=>{
  centerCommand.mockResolvedValue({quote:{...quote,periodStart:'2026-11-01'},quoteHash:hash});await preview();const button=[...host.querySelectorAll('button')].find(button=>button.textContent==='Create receipt');expect(button.disabled).toBe(true);await act(async()=>host.querySelector('[aria-label="Why is this unavailable?"]').click());expect(document.querySelector('[role=tooltip]').textContent).toBe('Future periods cannot be issued yet.')
})
it('direct receipt creation calculates internally and prevents duplicate submissions while calculating',async()=>{
 let release;centerCommand.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}));await render();await click('Create receipt');expect(centerCommand).not.toHaveBeenCalled();await click('Create receipt');await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(centerCommand).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('Saving…');centerCommand.mockResolvedValueOnce({receipt:{id:'direct',snapshot:quote}});await act(async()=>release({quote,quoteHash:hash}));expect(centerCommand).toHaveBeenCalledTimes(2);expect(generated).toHaveBeenCalledOnce();
})
it('preview edits are recalculated using the current fields rather than a stale digest',async()=>{
 confirmSheet.mockImplementation(()=>{});centerCommand.mockResolvedValueOnce({quote,quoteHash:hash});await preview();const input=host.querySelector('input[type=date]');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2026-09-01');input.dispatchEvent(new Event('input',{bubbles:true}))});centerCommand.mockResolvedValueOnce({quote:{...quote,periodStart:'2026-09-01'},quoteHash:'new'});await click('Create receipt');expect(centerCommand.mock.calls[1]).toEqual(['/api/centers/billing/preview',expect.objectContaining({periodStart:'2026-09-01'})]);expect(confirmSheet.mock.calls.at(-1)[0].message).toContain('2026-09-01');centerCommand.mockResolvedValueOnce({receipt:{id:'updated'}});await act(async()=>confirmSheet.mock.calls.at(-1)[0].onConfirm());expect(centerCommand.mock.calls[2][1]).toMatchObject({expectedQuoteHash:'new',periodStart:'2026-09-01'});
})

it('previewing an unchanged receipt form stays clean and cancels without a discard dialog',async()=>{
 confirmSheet.mockImplementation(()=>{});await act(async()=>root.render(<Guard><BillingPreview centerId="a" memberId="member1" contractId="contract1" ownerUid="manager" today="2026-10-14" canGenerate/></Guard>));await click('Preview charge');await click('Preview charge');expect(host.querySelector('.centers-unsaved-indicator')).toBeNull();await click('Cancel');expect(confirmSheet).not.toHaveBeenCalled();expect(host.querySelector('form')).toBeNull();
})
