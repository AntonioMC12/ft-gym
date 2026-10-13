// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'manager'}};return{useStore:Object.assign(selector=>selector(state),{getState:()=>state})}})
vi.mock('../../lib/centers-api.js',()=>({centerSubscriptions:vi.fn(),centerPlans:vi.fn(),centerCommand:vi.fn(),subscriptionsErrorKey:()=> 'error'}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn(options=>options.onConfirm())}))
import {centerSubscriptions,centerPlans,centerCommand} from '../../lib/centers-api.js'
import Subscriptions from './Subscriptions.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root,changed
const member={id:'member1',version:1,state:'preactive'},today='2026-10-13',plan={priceVersionId:'price1',name:'Synthetic fee',priceMinor:'2999',currency:'EUR'}
beforeEach(()=>{vi.clearAllMocks();centerSubscriptions.mockResolvedValue({member,today,changes:[],subscriptions:[]});centerPlans.mockResolvedValue({plans:[plan],nextCursor:null});changed=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(centerId='a',value=member)=>act(async()=>{root.render(<Subscriptions centerId={centerId} member={value} ownerUid="manager" changed={changed}/>);await Promise.resolve()})
const click=text=>act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent===text).click();await Promise.resolve()})
const fill=(label,value)=>act(()=>{const field=[...host.querySelectorAll('label')].find(el=>el.textContent===label).querySelector('input,textarea'),prototype=field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}))})
it('sends the selected immutable price, current member version and exact discount, retaining the retry id',async()=>{
  centerCommand.mockRejectedValue(new Error('temporary'));await render();fill('Discount (%)','12,50');fill('Discount reason','Synthetic reason');await click('Save');await click('Save')
  expect(centerCommand.mock.calls[0]).toEqual(['/api/centers/subscriptions/create',expect.objectContaining({memberVersion:1,priceVersionId:'price1',effectiveOn:today,discountBasisPoints:1250,discountReason:'Synthetic reason'})]);expect(centerCommand.mock.calls[0][1].requestId).toBe(centerCommand.mock.calls[1][1].requestId)
})
it('successful activation passes the authoritative member and history to its parent',async()=>{
  const result={member:{...member,state:'active',version:2},today,changes:[],subscriptions:[]};centerCommand.mockResolvedValue(result);await render();await click('Save');expect(changed).toHaveBeenCalledWith(result)
})
it('scheduled contracts offer cancellation, keep the retry id and hide another assignment',async()=>{
  const row={id:'future',name:'Future fee',priceMinor:'2999',currency:'EUR',discountBasisPoints:0,startsOn:'2026-10-20',status:'scheduled',canCancel:true};centerSubscriptions.mockResolvedValue({member,today,changes:[],subscriptions:[row]});centerCommand.mockRejectedValue(new Error('temporary'));await render()
  expect(host.querySelector('form')).toBeNull();await click('Cancel scheduled change');await click('Cancel scheduled change');expect(centerCommand.mock.calls[0][1].requestId).toBe(centerCommand.mock.calls[1][1].requestId)
})
it('discards old-center subscription results and late successful writes',async()=>{
  let release;centerCommand.mockReturnValueOnce(new Promise(resolve=>{release=resolve}));await render();await click('Save');await render('b');await act(async()=>{release({member:{...member,name:'Private old center'},today,subscriptions:[]})});expect(changed).not.toHaveBeenCalled()
})
