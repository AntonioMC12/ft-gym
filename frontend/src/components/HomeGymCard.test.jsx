// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('react-router-dom',()=>({useNavigate:()=>navigate}))
vi.mock('../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../lib/centers-api.js',()=>({centerDetail:vi.fn(),platformCenters:vi.fn(),centersMe:vi.fn(),centersErrorKey:()=> 'Error'}))
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {centerDetail,platformCenters} from '../lib/centers-api.js'
import HomeGymCard from './HomeGymCard.jsx'
const navigate=vi.fn()
let root,host
const key=uid=>'gym_home_center_'+uid
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.clearAllMocks();localStorage.clear()
 useStore.setState(s=>({user:{id:'super',admin:true},config:{centers:{enabled:true}},S:{...s.S,checkIn:true}}))
 useCenters.setState({ownerUid:'super',status:'ready',platformCapabilities:['centers.manage'],centers:[]})
 centerDetail.mockResolvedValue({center:{id:'c1',name:'Pabellón'}});platformCenters.mockResolvedValue({centers:[{id:'c1',name:'Pabellón'}],nextCursor:null})
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()})
const render=()=>act(async()=>root.render(<HomeGymCard/>))
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes(text))
const click=async text=>act(async()=>{button(text).click();await vi.advanceTimersByTimeAsync(300)})
it('replaces gym check-in only for a platform superadmin, even if check-in is hidden',async()=>{
 useStore.setState(s=>({S:{...s.S,checkIn:false}}));await render();expect(host.textContent).toContain('Choose center');expect(host.textContent).not.toContain('Check in');expect(platformCenters).not.toHaveBeenCalled()
})
it('technical admin alone retains check-in and does not query the directory',async()=>{
 useCenters.setState({platformCapabilities:[]});await render();expect(host.textContent).toContain('Check in');expect(host.textContent).not.toContain('Choose center');expect(centerDetail).not.toHaveBeenCalled()
})
it('ignores permissions belonging to another user',async()=>{
 useCenters.setState({ownerUid:'other'});await render();expect(host.textContent).toContain('Check in')
})
it('chooses a center, remembers only its ID, and opens its direct URL',async()=>{
 await render();await click('Choose center');await click('Pabellón');expect(localStorage.getItem(key('super'))).toBe('c1');expect(centerDetail).toHaveBeenCalledWith('c1');await click('Open center');expect(navigate).toHaveBeenCalledWith('/centers?centerId=c1');expect(localStorage.getItem(key('super'))).not.toContain('Pabellón')
})
it('revalidates the saved favorite on mount without exposing another account preference',async()=>{
 localStorage.setItem(key('other'),'secret');await render();expect(centerDetail).not.toHaveBeenCalled();await act(async()=>{root.unmount();root=createRoot(host)});localStorage.setItem(key('super'),'c1');await render();expect(centerDetail).toHaveBeenCalledWith('c1');expect(host.textContent).toContain('Pabellón')
})
it('clears an unavailable center and offers selection again',async()=>{
 localStorage.setItem(key('super'),'gone');centerDetail.mockRejectedValue({status:404});await render();await act(async()=>vi.advanceTimersByTimeAsync(300));expect(localStorage.getItem(key('super'))).toBeNull();expect(button('Open center')).toBeUndefined();expect(host.querySelector('input')).toBeTruthy()
})
it('paginates the server directory and resets pagination on search',async()=>{
 platformCenters.mockResolvedValueOnce({centers:[{id:'c1',name:'Pabellón'}],nextCursor:'next'}).mockResolvedValueOnce({centers:[{id:'c2',name:'Segundo'}],nextCursor:null})
 await render();await click('Choose center');await click('Show more');expect(platformCenters).toHaveBeenLastCalledWith({query:'',cursor:'next'});expect(host.textContent).toContain('Segundo')
 const input=host.querySelector('input');await act(async()=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'otro');input.dispatchEvent(new Event('input',{bubbles:true}));await vi.advanceTimersByTimeAsync(300)})
 expect(platformCenters).toHaveBeenLastCalledWith({query:'otro'})
})
it('does not render an old response after an account switch',async()=>{
 let resolve;localStorage.setItem(key('super'),'c1');centerDetail.mockImplementation(()=>new Promise(r=>{resolve=r}));await render();await act(async()=>useStore.setState({user:{id:'other'}}));await act(async()=>resolve({center:{id:'c1',name:'Private center'}}));expect(host.textContent).not.toContain('Private center');expect(host.textContent).toContain('Check in')
})

it('opens the existing routines view for the superadmin and hides it for technical admin alone',async()=>{
 await render();expect(host.textContent).toContain('Routines');await click('Routines');expect(navigate).toHaveBeenCalledWith('/training-admin');
 await act(async()=>useCenters.setState({platformCapabilities:[]}));expect(button('Routines')).toBeUndefined();
});
