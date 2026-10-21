// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('react-router-dom',()=>({useNavigate:()=>navigate}))
vi.mock('../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../lib/api.js',()=>({api:vi.fn()}))
vi.mock('../lib/centers-api.js',()=>({centersMe:vi.fn(),centersErrorKey:()=> 'Unavailable'}))
import {api} from '../lib/api.js'
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import HomeActivationCard from './HomeActivationCard.jsx'
let host,root
const navigate=vi.fn(),summary={total:3,center:{id:'another-center',name:'Pabellón'}}
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();vi.useFakeTimers()
 useStore.setState({user:{id:'super',admin:false},config:{centers:{enabled:true}}})
 useCenters.setState({ownerUid:'super',status:'ready',platformCapabilities:['centers.manage'],centers:[]})
 api.mockResolvedValue(summary);host=document.createElement('div');document.body.append(host);root=createRoot(host)
})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()})
const render=()=>act(async()=>root.render(<HomeActivationCard/>))
it('highlights real global pending activations and opens the corresponding center directly',async()=>{
 await render();expect(api).toHaveBeenCalledWith('/api/platform/centers/activations/summary')
 expect(host.textContent).toContain('3 · Pabellón');expect(host.querySelector('.has-updates')).not.toBeNull()
 await act(async()=>host.querySelector('button').click());expect(navigate).toHaveBeenCalledWith('/centers?centerId=another-center&pane=activations')
})
it('disappears when pending requests reach zero on focus and refreshes periodically',async()=>{
 await render();api.mockResolvedValue({total:0,center:null})
 await act(async()=>window.dispatchEvent(new Event('focus')));expect(host.textContent).toBe('')
 api.mockResolvedValue(summary);await act(async()=>vi.advanceTimersByTimeAsync(60000));expect(host.textContent).toContain('Pending activations')
})
it.each(['manager','trainer','member','technical-admin'])('never queries or renders for a %s',async role=>{
 useStore.setState({user:{id:'super',admin:role==='technical-admin'}})
 useCenters.setState({platformCapabilities:[],centers:[{id:'c',capabilities:['members.manage','center.read']}]})
 await render();expect(api).not.toHaveBeenCalled();expect(host.textContent).toBe('')
})
it('waits for owned current permissions and known config',async()=>{
 useCenters.setState({ownerUid:'other'});await render();expect(api).not.toHaveBeenCalled()
 await act(async()=>useCenters.setState({ownerUid:'super',status:'loading'}));expect(api).not.toHaveBeenCalled()
 await act(async()=>useStore.setState({config:null}));await act(async()=>useCenters.setState({status:'ready'}));expect(api).not.toHaveBeenCalled()
})
it('discards late responses after switching accounts',async()=>{
 let finish;api.mockImplementation(()=>new Promise(resolve=>finish=resolve));await render()
 await act(async()=>{useStore.setState({user:{id:'other'}});finish(summary)});expect(host.textContent).toBe('')
})
it('revokes stale platform controls on a forbidden refresh',async()=>{
 await render();api.mockRejectedValue({status:403});await act(async()=>window.dispatchEvent(new Event('focus')))
 expect(host.textContent).toBe('');expect(useCenters.getState().status).toBe('idle')
})
it('does not replace a transient failure with a false zero and can retry',async()=>{
 await render();api.mockRejectedValueOnce(new Error('offline'));await act(async()=>window.dispatchEvent(new Event('focus')))
 expect(host.textContent).toContain('Unavailable');expect(host.textContent).toContain('Pending activations')
 api.mockResolvedValue({total:0,center:null});await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Retry').click());expect(host.textContent).toBe('')
})
