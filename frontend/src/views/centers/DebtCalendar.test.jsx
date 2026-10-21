// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../store/useStore.js',()=>({useStore:{getState:()=>({user:{id:'manager'}})}}))
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
vi.mock('../../lib/centers-api.js',()=>({centerDebt:vi.fn(),centerDebtExport:vi.fn(),debtErrorKey:()=> 'error'}))
vi.mock('./ManualMovement.jsx',()=>({default:props=><form data-payment-member={props.memberId} data-payment-receipt={props.receiptId} data-payment-balance={props.availableMinor}><button type="button" onClick={props.changed}>Simulate recorded payment</button></form>}))
import {centerDebt,centerDebtExport} from '../../lib/centers-api.js'
import DebtCalendar from './DebtCalendar.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root
const receipt={id:'r',memberId:'m1',memberName:'Synthetic debtor',memberNumber:'M-1',periodStart:'2026-10-01',periodEnd:'2026-11-01',dueOn:'2026-10-14',currency:'EUR',totalMinor:'1800',paidMinor:'1600',refundedMinor:'200',balanceMinor:'200',debt:{status:'due',lateDays:0}}
const data={today:'2026-10-14',policy:{version:1,graceDays:15,automaticSuspension:false},summary:{receiptCount:1,outstandingMinor:'200',overdueMinor:'0'},receipts:[receipt],nextCursor:null,dueFrom:'2026-10-01',dueTo:'2026-10-31'}
beforeEach(()=>{vi.clearAllMocks();centerDebt.mockResolvedValue(data);centerDebtExport.mockResolvedValue({content:'safe csv',fileName:'debt.csv'});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks()})
const render=(props={})=>act(async()=>{root.render(<DebtCalendar centerId="a" ownerUid="manager" {...props}/>);await Promise.resolve()})
const click=text=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text).click())
const fill=(element,value)=>act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}))})
it('uses server balances/grace and shows read-only details without an editable delinquent state',async()=>{
  await render();expect(host.textContent).toContain('2.00 EUR');expect(host.textContent).toContain('Grace period (days): 15');expect(host.textContent).not.toContain('Export debts (CSV)');await act(async()=>host.querySelector('button.lrow').click());expect(host.textContent).toContain('16.00 EUR');expect(host.querySelector('input')).toBeNull();expect(host.querySelector('[role=switch]')).toBeNull()
})
it('opens the payment form directly for the chosen receipt and refreshes totals after recording',async()=>{
 centerDebt.mockResolvedValueOnce({...data,renewals:{month:'2026-10-01',previousMonth:'2026-09-01',memberCount:3}}).mockResolvedValue({...data,receipts:[],renewals:{month:'2026-10-01',previousMonth:'2026-09-01',memberCount:2}});await render({canRecord:true});expect(host.querySelector('.centers-renewals-pending strong').textContent).toBe('3');await act(async()=>host.querySelector('button.lrow').click());const form=host.querySelector('[data-payment-receipt]');expect(form.dataset.paymentReceipt).toBe('r');expect(form.dataset.paymentMember).toBe('m1');expect(form.dataset.paymentBalance).toBe('200');await click('Simulate recorded payment');expect(centerDebt).toHaveBeenCalledTimes(2);expect(host.querySelector('.centers-renewals-pending strong').textContent).toBe('2');
})
it('never opens collection for read-only users or a settled calendar receipt',async()=>{
 await render();await act(async()=>host.querySelector('button.lrow').click());expect(host.querySelector('[data-payment-receipt]')).toBeNull();await click('Back');centerDebt.mockResolvedValue({...data,receipts:[{...receipt,balanceMinor:'0',debt:{status:'settled'}}]});await render({canRecord:true});await click('Billing calendar');await act(async()=>host.querySelector('button.lrow').click());expect(host.querySelector('[data-payment-receipt]')).toBeNull();
})
it('applies paired due-date filters and uses the calendar endpoint for issued receipts',async()=>{
  await render();fill(host.querySelectorAll('input')[0],'2026-10-01');fill(host.querySelectorAll('input')[1],'2026-10-31');await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(centerDebt).toHaveBeenLastCalledWith('a',{calendar:false,dueFrom:'2026-10-01',dueTo:'2026-10-31'});await click('Billing calendar');expect(centerDebt).toHaveBeenLastCalledWith('a',{calendar:true});expect(host.textContent).toContain('Only issued receipts are shown.')
})
it('quick date ranges use the center business date and reset both inputs together',async()=>{
 await render();await click('This month');expect(centerDebt).toHaveBeenLastCalledWith('a',{calendar:false,dueFrom:'2026-10-01',dueTo:'2026-10-31'});expect([...host.querySelectorAll('input[type=date]')].map(el=>el.value)).toEqual(['2026-10-01','2026-10-31']);await click('Previous month');expect(centerDebt).toHaveBeenLastCalledWith('a',{calendar:false,dueFrom:'2026-09-01',dueTo:'2026-09-30'});await click('All dates');expect(centerDebt).toHaveBeenLastCalledWith('a',{calendar:false});expect([...host.querySelectorAll('input[type=date]')].every(el=>el.value==='')).toBe(true);
})
it('previous month shortcuts handle leap years and December across a year boundary',async()=>{
 centerDebt.mockResolvedValue({...data,today:'2024-03-02'});await render();await click('Previous month');expect(centerDebt).toHaveBeenLastCalledWith('a',{calendar:false,dueFrom:'2024-02-01',dueTo:'2024-02-29'});centerDebt.mockResolvedValue({...data,today:'2027-01-02'});await render({centerId:'b'});await click('Previous month');expect(centerDebt).toHaveBeenLastCalledWith('b',{calendar:false,dueFrom:'2026-12-01',dueTo:'2026-12-31'});
})
it('loads subsequent pages with server cursor and keeps the original summary',async()=>{
  centerDebt.mockResolvedValueOnce({...data,nextCursor:'page2'}).mockResolvedValueOnce({...data,receipts:[{...receipt,id:'r2',memberName:'Second debtor'}]});await render();await click('Show more');expect(centerDebt).toHaveBeenLastCalledWith('a',{calendar:false,cursor:'page2'});expect(host.textContent).toContain('Synthetic debtor');expect(host.textContent).toContain('Second debtor')
})
it('drops a delayed previous-center debt page',async()=>{
  let release;centerDebt.mockReturnValueOnce(new Promise(resolve=>release=resolve)).mockResolvedValue({...data,receipts:[]});await render();await render({centerId:'b'});await act(async()=>release(data));expect(host.textContent).not.toContain('Synthetic debtor')
})
it('downloads only the server-exported CSV when capability is present',async()=>{
  const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:debt'),clicked=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});await render({canExport:true});await click('Export debts (CSV)');expect(centerDebtExport).toHaveBeenCalledWith('a',{});expect(create.mock.calls[0][0].type).toBe('text/csv;charset=utf-8');expect(clicked).toHaveBeenCalledOnce()
})
it('does not download an export that arrives after switching center',async()=>{
  let release;centerDebtExport.mockReturnValue(new Promise(resolve=>release=resolve));const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:debt');await render({canExport:true});await click('Export debts (CSV)');await render({centerId:'b',canExport:true});await act(async()=>release({content:'old center',fileName:'old.csv'}));expect(create).not.toHaveBeenCalled()
})

it('explains financial totals without changing filters or creating payments',async()=>{
  await render()
  const help=host.querySelector('button[aria-label="Overdue balance"]')
  await act(async()=>help.focus())
  expect(document.querySelector('[role=tooltip]').textContent).toContain('grace period')
  await act(async()=>help.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
  expect(document.querySelector('[role=tooltip]')).toBeNull()
  expect(centerDebt).toHaveBeenCalledTimes(1)
})
it('groups calendar receipts by due date while preserving distinct receipts for the same member',async()=>{
  centerDebt.mockResolvedValue({...data,summary:{...data.summary,receiptCount:3},receipts:[receipt,{...receipt,id:'second'},{...receipt,id:'third',dueOn:'2026-10-15'}]})
  await render();await click('Billing calendar')
  const days=host.querySelectorAll('.centers-debt-day')
  expect(days).toHaveLength(2)
  expect(days[0].querySelector('time').dateTime).toBe('2026-10-14')
  expect(days[0].querySelectorAll('button.lrow')).toHaveLength(2)
  expect(host.textContent).toContain('#second')
  await act(async()=>days[0].querySelectorAll('button.lrow')[1].click())
  expect(host.textContent).toContain('second')
  expect(host.textContent).toContain('Receipt details')
})
