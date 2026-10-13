// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'manager'}};return{useStore:Object.assign(selector=>selector(state),{getState:()=>state})}})
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
vi.mock('../../lib/centers-api.js',()=>({centerInvitations:vi.fn(),centerCommand:vi.fn(),invitationErrorKey:()=> 'error'}))
vi.mock('../../lib/center-invitation-link.js',()=>({centerInvitationLink:vi.fn(token=>Promise.resolve('https://example.test/#/centers/invite?token='+token))}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn(options=>options.onConfirm())}))
import {centerInvitations,centerCommand} from '../../lib/centers-api.js'
import Invitations from './Invitations.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root
beforeEach(()=>{vi.clearAllMocks();centerInvitations.mockResolvedValue({invites:[]});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(centerId='a',memberId)=>act(async()=>{root.render(<Invitations centerId={centerId} ownerUid="manager" memberId={memberId} allowedKinds={[memberId?'member':'trainer']}/>);await Promise.resolve()})
const fill=value=>act(()=>{const input=host.querySelector('input:not([readonly])');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})
const submit=()=>act(async()=>{host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await Promise.resolve()})
const invite={id:'iv1',kind:'trainer',accountUid:'recipient1',status:'pending',version:1}
it('keeps the request id on retry, but creates a new intent for a new recipient',async()=>{
  centerCommand.mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce({invite,token:'secret1'}).mockResolvedValueOnce({invite:{...invite,id:'iv2',accountUid:'recipient2'},token:'secret2'})
  await render();fill('recipient1');await submit();await submit()
  expect(centerCommand.mock.calls[0][1].requestId).toBe(centerCommand.mock.calls[1][1].requestId)
  expect(host.querySelector('input[readonly]').value).toContain('secret1')
  fill('recipient2');await submit()
  expect(centerCommand.mock.calls[2][1].requestId).not.toBe(centerCommand.mock.calls[1][1].requestId)
  expect(host.textContent).toContain('recipient1');expect(host.textContent).toContain('recipient2')
})
it('drops a delayed creation after switching centers and clears a previously shown secret',async()=>{
  let release;centerCommand.mockReturnValueOnce(new Promise(resolve=>{release=resolve}))
  await render();fill('recipient1');await submit();await render('b')
  await act(async()=>{release({invite,token:'privateOldCenter'});await Promise.resolve()})
  expect(host.textContent).not.toContain('recipient1');expect(host.querySelector('input[readonly]')).toBeNull()
})
it('does not mint another member link while one is pending and shows no token from metadata',async()=>{
  centerInvitations.mockResolvedValue({invites:[{...invite,kind:'member'}]});await render('a','member1')
  expect(host.querySelector('form')).toBeNull();expect(host.querySelector('input[readonly]')).toBeNull()
})
it('explains recovery when an idempotent replay returns metadata without the secret',async()=>{
  centerCommand.mockResolvedValue({invite,token:null});await render();fill('recipient1');await submit()
  expect(host.textContent).toContain('The link is shown once. If lost, revoke and create another.')
  expect(host.querySelector('input[readonly]')).toBeNull()
})
