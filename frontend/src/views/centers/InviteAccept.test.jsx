// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({token:'one',user:{id:'recipient',name:'Recipient'},enabled:true,load:vi.fn().mockResolvedValue(undefined),navigate:vi.fn()}))
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('react-router-dom',()=>({useNavigate:()=>state.navigate,useSearchParams:()=>[new URLSearchParams({token:state.token})]}))
vi.mock('../../store/useStore.js',()=>({useStore:Object.assign(selector=>selector({user:state.user,config:{centers:{enabled:state.enabled}}}),{getState:()=>({user:state.user})})}))
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({load:state.load})}}))
vi.mock('../../lib/centers-api.js',()=>({inspectCenterInvitation:vi.fn(),acceptCenterInvitation:vi.fn(),invitationErrorKey:()=> 'Invitation unavailable'}))
vi.mock('../Login.jsx',()=>({default:()=> <div>Existing login</div>}))
import {inspectCenterInvitation,acceptCenterInvitation} from '../../lib/centers-api.js'
import InviteAccept from './InviteAccept.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root
const render=()=>act(async()=>{root.render(<InviteAccept/>);await Promise.resolve()})
beforeEach(()=>{vi.clearAllMocks();state.token='one';state.user={id:'recipient',name:'Recipient'};state.enabled=true;inspectCenterInvitation.mockResolvedValue({invite:{centerId:'center1',centerName:'Synthetic center',kind:'member',status:'pending'}});acceptCenterInvitation.mockResolvedValue({accepted:true});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
it('requires explicit acceptance and reloads affiliations only after success',async()=>{
  await render();expect(acceptCenterInvitation).not.toHaveBeenCalled()
  await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent==='Accept invitation').click();await Promise.resolve()})
  expect(acceptCenterInvitation).toHaveBeenCalledWith('one');expect(state.load).toHaveBeenCalledWith('recipient');expect(host.textContent).toContain('My centers')
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='My centers').click());expect(state.navigate).toHaveBeenCalledWith('/centers/membership?centerId=center1',{replace:true})
})
it('an unavailable or wrong-account link offers no acceptance',async()=>{
  inspectCenterInvitation.mockRejectedValue({status:404});await render();expect(host.textContent).toContain('Invitation unavailable');expect(acceptCenterInvitation).not.toHaveBeenCalled()
})
it('does not display the success of an old token after navigation to another link',async()=>{
  let release;acceptCenterInvitation.mockReturnValueOnce(new Promise(resolve=>{release=resolve}));await render()
  await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent==='Accept invitation').click()})
  state.token='two';await render();await act(async()=>{release({accepted:true});await Promise.resolve()})
  expect(host.textContent).not.toContain('My centers');expect(state.load).not.toHaveBeenCalled()
})
it('uses the existing login and does not inspect an invitation anonymously',async()=>{
  state.user=null;await render();expect(host.textContent).toContain('Existing login');expect(inspectCenterInvitation).not.toHaveBeenCalled()
})
