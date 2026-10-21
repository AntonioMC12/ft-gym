// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'manager'}};return{useStore:Object.assign(selector=>selector(state),{getState:()=>state})}})
vi.mock('../../lib/centers-api.js',()=>({centerSubscriptions:vi.fn(),centerPlans:vi.fn(),centerCommand:vi.fn(),subscriptionsErrorKey:()=> 'error',receiptsErrorKey:()=> 'error'}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn(options=>options.onConfirm())}))
import {centerSubscriptions,centerPlans,centerCommand} from '../../lib/centers-api.js'
import Subscriptions from './Subscriptions.jsx'
import Guard from './NavigationGuard.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root,changed
const member={id:'member1',version:1,state:'preactive'},today='2026-10-13',plan={priceVersionId:'price1',name:'Synthetic fee',priceMinor:'2999',currency:'EUR'}
beforeEach(()=>{vi.clearAllMocks();centerSubscriptions.mockResolvedValue({member,today,changes:[],subscriptions:[]});centerPlans.mockResolvedValue({plans:[plan],nextCursor:null});changed=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(centerId='a',value=member)=>act(async()=>{root.render(<Subscriptions centerId={centerId} member={value} ownerUid="manager" changed={changed}/>);await Promise.resolve()})
const click=text=>act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent===text).click();await Promise.resolve()})
const fill=(label,value)=>act(()=>{const field=[...host.querySelectorAll('label')].find(el=>el.textContent===label).querySelector('input,textarea'),prototype=field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}))})
it('uses the pinned monthly interval to open a month selector for receipt issuance',async()=>{
 const row={id:'active',planId:'p',name:'Monthly',intervalMonths:1,priceMinor:'2999',currency:'EUR',startsOn:today,status:'active',discountBasisPoints:0};centerSubscriptions.mockResolvedValue({member,today,changes:[],subscriptions:[row]});await render();await click('Create receipt');expect(host.querySelector('input[type=month]').value).toBe('2026-10');
})
it('sends the selected immutable price, current member version and exact discount, retaining the retry id',async()=>{
  centerCommand.mockRejectedValue(new Error('temporary'));await render();fill('Discount (%)','12,50');fill('Discount reason','Synthetic reason');await click('Save');await click('Save')
  expect(centerCommand.mock.calls[0]).toEqual(['/api/centers/subscriptions/create',expect.objectContaining({memberVersion:1,priceVersionId:'price1',effectiveOn:today,discountBasisPoints:1250,discountReason:'Synthetic reason'})]);expect(centerCommand.mock.calls[0][1].requestId).toBe(centerCommand.mock.calls[1][1].requestId)
})
it('successful activation passes the authoritative member and history to its parent',async()=>{
  const result={member:{...member,state:'active',version:2},today,changes:[],subscriptions:[]};centerCommand.mockResolvedValue(result);await render();await click('Save');expect(changed).toHaveBeenCalledWith(result)
})
it('prefills the existing plan and discount when changing a contract instead of silently removing them',async()=>{
  const row={id:'active',planId:'existingPlan',priceMinor:'2999',currency:'EUR',startsOn:today,status:'active',discountBasisPoints:1250,discountReason:'Existing reason'}
  centerSubscriptions.mockResolvedValue({member:{...member,state:'active'},today,changes:[],subscriptions:[row]});centerPlans.mockResolvedValue({plans:[{...plan,id:'different',priceVersionId:'otherPrice'},{...plan,id:'existingPlan'}],nextCursor:null});centerCommand.mockRejectedValue(new Error('temporary'));await render('a',{...member,state:'active'});await click('Save')
  expect(centerCommand).toHaveBeenCalledWith('/api/centers/subscriptions/change',expect.objectContaining({id:'active',priceVersionId:'price1',discountBasisPoints:1250,discountReason:'Existing reason'}))
})
it('scheduled contracts offer cancellation, keep the retry id and hide another assignment',async()=>{
  const row={id:'future',name:'Future fee',priceMinor:'2999',currency:'EUR',discountBasisPoints:0,startsOn:'2026-10-20',status:'scheduled',canCancel:true};centerSubscriptions.mockResolvedValue({member,today,changes:[],subscriptions:[row]});centerCommand.mockRejectedValue(new Error('temporary'));await render()
  expect(host.querySelector('form')).toBeNull();await click('Cancel scheduled change');await click('Cancel scheduled change');expect(centerCommand.mock.calls[0][1].requestId).toBe(centerCommand.mock.calls[1][1].requestId)
})
it('discards old-center subscription results and late successful writes',async()=>{
  let release;centerCommand.mockReturnValueOnce(new Promise(resolve=>{release=resolve}));await render();await click('Save');await render('b');await act(async()=>{release({member:{...member,name:'Private old center'},today,subscriptions:[]})});expect(changed).not.toHaveBeenCalled()
})

it('prefilled fee defaults are clean; real edits expose a save action and reverting them removes it',async()=>{
 await act(async()=>{root.render(<Guard><Subscriptions centerId="a" member={member} ownerUid="manager" changed={changed}/></Guard>);await Promise.resolve()});expect(host.querySelector('.centers-unsaved-indicator')).toBeNull();const clean=new Event('beforeunload',{cancelable:true});window.dispatchEvent(clean);expect(clean.defaultPrevented).toBe(false);fill('Discount (%)','10');expect(host.querySelector('.centers-unsaved-indicator').textContent).toBe('Unsaved changes');fill('Discount (%)','0.00');expect(host.querySelector('.centers-unsaved-indicator')).toBeNull();
})
it('the shared fee save clears dirty state after the existing command succeeds',async()=>{
 centerCommand.mockResolvedValue({member,today,changes:[],subscriptions:[]});await act(async()=>{root.render(<Guard><Subscriptions centerId="a" member={member} ownerUid="manager" changed={changed}/></Guard>);await Promise.resolve()});fill('Discount reason','A real edit');await act(async()=>{host.querySelector('form button[type=submit]').click();await Promise.resolve()});expect(centerCommand).toHaveBeenCalledWith('/api/centers/subscriptions/create',expect.objectContaining({discountReason:'A real edit'}));expect(host.querySelector('.centers-unsaved-indicator')).toBeNull();
})

it('searching the fee catalogue does not silently select another price or create unsaved changes',async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});try{
 await act(async()=>{root.render(<Guard><Subscriptions centerId="a" member={member} ownerUid="manager" changed={changed}/></Guard>);await Promise.resolve()});centerPlans.mockResolvedValue({plans:[{...plan,priceVersionId:'another_price'}],nextCursor:null});const search=host.querySelector('input[aria-label="Search membership plans"]');act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'Other');search.dispatchEvent(new Event('input',{bubbles:true}))});await act(async()=>{await vi.advanceTimersByTimeAsync(300)});expect(host.querySelector('.centers-unsaved-indicator')).toBeNull();centerCommand.mockRejectedValue(new Error('temporary'));await click('Save');expect(centerCommand.mock.calls[0][1].priceVersionId).toBe('price1');
 }finally{vi.useRealTimers()}
})
it('detects missing conditions in the assigned version even when the catalogue already has a configured price',async()=>{
  const configure=vi.fn(),row={id:'active',planId:'plan1',name:'Legacy fee',priceMinor:'2999',currency:'EUR',startsOn:today,status:'active',priceIncludesTax:null,taxBasisPoints:null,proration:null,discountBasisPoints:0};
  centerSubscriptions.mockResolvedValue({member,today,changes:[],subscriptions:[row]});centerPlans.mockResolvedValue({plans:[{...plan,id:'plan1',conditionsReady:true,priceIncludesTax:true,taxBasisPoints:2100,proration:'none'}],nextCursor:null});
  await act(async()=>root.render(<Subscriptions centerId="a" member={member} ownerUid="manager" changed={changed} onManagePlans={configure}/>));
  expect(host.textContent).toContain('Existing subscriptions keep their original terms.');expect(host.textContent).not.toContain('Preview charge');
  await click('Membership plans');expect(configure).toHaveBeenCalledOnce();expect(centerCommand).not.toHaveBeenCalled();
})
it('does not assign a known incomplete catalogue price, including through direct form submission',async()=>{
  centerPlans.mockResolvedValue({plans:[{...plan,conditionsReady:false}],nextCursor:null});await render();
  expect([...host.querySelectorAll('button')].find(button=>button.textContent==='Save').disabled).toBe(true);
  expect(host.textContent).toContain('Tax and proration must be configured before calculating charges.');
  await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(centerCommand).not.toHaveBeenCalled();
})

it('does not forget incomplete selected terms when a catalogue search hides that price',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});try{
    centerPlans.mockResolvedValue({plans:[{...plan,conditionsReady:false}],nextCursor:null});await render();centerPlans.mockResolvedValue({plans:[],nextCursor:null});
    const search=host.querySelector('input[aria-label="Search membership plans"]');act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'Other');search.dispatchEvent(new Event('input',{bubbles:true}))});await act(async()=>vi.advanceTimersByTimeAsync(300));
    expect([...host.querySelectorAll('button')].find(button=>button.textContent==='Save').disabled).toBe(true);
    await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(centerCommand).not.toHaveBeenCalled();
  }finally{vi.useRealTimers()}
})
it('keeps current and scheduled contracts visible and folds history without losing its period previews',async()=>{
  const contract=(id,startsOn,status,end=null)=>({id,name:id,priceMinor:'2500',currency:'EUR',discountBasisPoints:0,startsOn,status,effectiveEndsOn:end,priceIncludesTax:true,taxBasisPoints:0,proration:'none'});
  centerSubscriptions.mockResolvedValue({member,today,changes:[],subscriptions:[contract('Current',today,'active'),contract('Old','2026-09-01','ended',today),contract('Future','2026-11-01','scheduled'),{...contract('Cancelled','2026-11-01','canceled'),canceled:true}]});await render();
  const history=host.querySelector('.centers-subscription-history');expect(history.open).toBe(false);expect(history.querySelector('summary').textContent).toBe('Subscription history (2)');
  expect(history.textContent).toContain('Old');expect(history.textContent).toContain('Ended subscription');expect(history.textContent).not.toContain('Ended member');
  expect(host.querySelectorAll('.centers-subscriptions .centers-form>.centers-subscription-card')).toHaveLength(2);
  expect([...history.querySelectorAll('button')].filter(button=>button.textContent==='Preview charge')).toHaveLength(1);
  await act(async()=>history.open=true);expect(history.open).toBe(true);expect(centerCommand).not.toHaveBeenCalled();
  centerCommand.mockRejectedValueOnce({code:'billing-policy-required'});await act(async()=>[...history.querySelectorAll('button')].find(button=>button.textContent==='Preview charge').click());
  await act(async()=>history.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(centerCommand).toHaveBeenCalledWith('/api/centers/billing/preview',{centerId:'a',memberId:member.id,id:'Old'});
})

it('monthly assignment fixes the effective date to today and explains the fifth-day validity',async()=>{
 centerPlans.mockResolvedValue({plans:[{...plan,intervalMonths:1}],nextCursor:null});centerCommand.mockRejectedValue(new Error('temporary'));await render()
 const date=host.querySelector('input[type="date"]');expect(date.value).toBe(today);expect(date.disabled).toBe(true)
 expect(host.textContent).toContain('Monthly fees cover the calendar month and remain valid through the 5th of the next month.')
 await click('Save');expect(centerCommand).toHaveBeenCalledWith('/api/centers/subscriptions/create',expect.objectContaining({effectiveOn:today}))
})
