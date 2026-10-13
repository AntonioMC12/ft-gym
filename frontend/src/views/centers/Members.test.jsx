// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'manager'}};return{useStore:Object.assign(selector=>selector(state),{getState:()=>state})}})
vi.mock('../../lib/centers-api.js',()=>({centerMembers:vi.fn(),centerMember:vi.fn(),centerCommand:vi.fn(),membersErrorKey:()=> 'error',centersMe:vi.fn()}))
import {centerMembers,centerMember,centerCommand} from '../../lib/centers-api.js'
import Members from './Members.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root
const sample={id:'one',name:'Synthetic member',number:'M-000001',version:1,state:'preactive',email:'synthetic@example.test'}
beforeEach(()=>{vi.clearAllMocks();centerMembers.mockResolvedValue({members:[sample],nextCursor:null});centerMember.mockResolvedValue({member:sample});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(centerId='a',capabilities=['members.read','members.manage'])=>act(async()=>{root.render(<Members key={centerId} centerId={centerId} ownerUid="manager" capabilities={capabilities}/>);await Promise.resolve()})
const click=text=>act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent===text).click();await Promise.resolve()})
const fill=(input,value)=>act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})
it('loads the next server page without replacing the first page',async()=>{
  centerMembers.mockResolvedValueOnce({members:[sample],nextCursor:'next'}).mockResolvedValueOnce({members:[{...sample,id:'two',name:'Second member'}],nextCursor:null})
  await render();await click('Show more')
  expect(centerMembers).toHaveBeenLastCalledWith('a',{query:'',cursor:'next'})
  expect(host.textContent).toContain('Synthetic member');expect(host.textContent).toContain('Second member')
})
it('drops a delayed member list from the previously selected center',async()=>{
  let release;centerMembers.mockReturnValueOnce(new Promise(resolve=>{release=resolve})).mockResolvedValueOnce({members:[{...sample,name:'Center B member'}],nextCursor:null})
  await render('a');await render('b');await act(async()=>{release({members:[{...sample,name:'Private center A member'}],nextCursor:null})})
  expect(host.textContent).toContain('Center B member');expect(host.textContent).not.toContain('Private center A member')
})
it('creates a member using a stable request id across failed retries',async()=>{
  centerCommand.mockRejectedValue(new Error('temporary'));await render();await click('New member')
  fill(host.querySelector('input'),'New synthetic member');await click('Save');await click('Save')
  expect(centerCommand).toHaveBeenCalledTimes(2)
  expect(centerCommand.mock.calls[0][0]).toBe('/api/centers/members/create')
  expect(centerCommand.mock.calls[0][1].requestId).toBe(centerCommand.mock.calls[1][1].requestId)
  expect(centerCommand.mock.calls[0][1].name).toBe('New synthetic member')
})
it('trainers can open operational profiles without editing or contact fields',async()=>{
  await render('a',['members.operational.read']);await act(async()=>{host.querySelector('button.lrow').click();await Promise.resolve()})
  expect(host.textContent).toContain('Member details');expect(host.textContent).not.toContain(sample.email)
  expect(host.querySelector('input')).toBeNull();expect(host.textContent).not.toContain('New member')
})
it('the last selected profile wins when detail responses arrive out of order',async()=>{
  const second={...sample,id:'two',name:'Second member'}
  centerMembers.mockResolvedValue({members:[sample,second],nextCursor:null})
  let firstReply,secondReply
  centerMember.mockReturnValueOnce(new Promise(resolve=>{firstReply=resolve})).mockReturnValueOnce(new Promise(resolve=>{secondReply=resolve}))
  await render();await act(async()=>{const buttons=host.querySelectorAll('button.lrow');buttons[0].click();buttons[1].click()})
  await act(async()=>{secondReply({member:second});await Promise.resolve()})
  await act(async()=>{firstReply({member:sample});await Promise.resolve()})
  expect(host.querySelector('input').value).toBe('Second member')
})
