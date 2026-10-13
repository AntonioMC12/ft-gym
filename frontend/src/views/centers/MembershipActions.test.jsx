// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'manager'}};return{useStore:Object.assign(selector=>selector(state),{getState:()=>state})}})
vi.mock('../../lib/centers-api.js',()=>({centerCommand:vi.fn(),membersErrorKey:()=> 'error',centersMe:vi.fn()}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn(options=>options.onConfirm())}))
import {centerCommand} from '../../lib/centers-api.js'
import {confirmSheet} from '../../sheets.jsx'
import MembershipActions from './MembershipActions.jsx'
import {bindUI} from '../../components/ui.jsx'
import {useUI} from '../../store/useUI.js'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root,changed
const member={id:'member',name:'Synthetic member',version:3,state:'preactive'}
const info={today:'2026-10-13',changes:[]}
beforeEach(()=>{vi.clearAllMocks();bindUI(useUI);changed=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove();useUI.getState().closeSheet()})
const render=(current=member,history=info)=>act(async()=>{root.render(<MembershipActions centerId="center" member={current} info={history} ownerUid="manager" changed={changed}/>);await Promise.resolve()})
const fill=(el,value)=>act(()=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))})
const click=text=>act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent===text).click();await Promise.resolve()})
it('confirms and retries a dated termination using the same request id',async()=>{
  centerCommand.mockRejectedValue(new Error('temporary'));await render();fill(host.querySelector('textarea'),'Synthetic reason')
  await click('End membership');await click('End membership')
  expect(confirmSheet).toHaveBeenCalledTimes(2);expect(centerCommand).toHaveBeenCalledTimes(2)
  expect(centerCommand.mock.calls[0][0]).toBe('/api/centers/members/transition')
  expect(centerCommand.mock.calls[0][1]).toMatchObject({centerId:'center',id:'member',version:3,action:'end',effectiveOn:info.today})
  expect(centerCommand.mock.calls[0][1].requestId).toBe(centerCommand.mock.calls[1][1].requestId)
})
it('only pending cancellable records expose a cancel action',async()=>{
  const history={...info,changes:[{id:'pending',action:'end',effectiveOn:'2026-11-01',canCancel:true},{id:'past',action:'freeze',effectiveOn:'2026-10-01',canCancel:false}]}
  centerCommand.mockResolvedValue({member:{...member,version:4},...history});await render({...member,state:'ended'},history)
  await click('Cancel scheduled change');expect(centerCommand.mock.calls[0][0]).toBe('/api/centers/members/transition/cancel')
  expect(centerCommand.mock.calls[0][1].changeId).toBe('pending');expect(changed).toHaveBeenCalledTimes(1)
})
it('opening the action selector after entering a reason never submits the form',async()=>{
  await render({...member,state:'active'});fill(host.querySelector('textarea'),'Synthetic pause')
  await act(async()=>{host.querySelector('button.lrow').click()})
  expect(confirmSheet).not.toHaveBeenCalled();expect(centerCommand).not.toHaveBeenCalled()
})
