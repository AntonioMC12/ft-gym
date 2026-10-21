// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter,Routes,Route} from 'react-router-dom'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../lib/centers-api.js',()=>({centersMe:vi.fn()}))
vi.mock('./Plan.jsx',()=>({Routines:({management,onAssign,basePath})=><div>Library {String(management)} {basePath}<button onClick={()=>onAssign('p')}>Assign selected plan</button></div>}))
vi.mock('./RoutineEdit.jsx',()=>({default:({basePath})=><div>Routine editor {basePath}</div>}))
vi.mock('../components/TrainingAssignments.jsx',()=>({default:({mode,planName})=><div>Panel {mode} {planName}</div>}))
import TrainingAdmin from './TrainingAdmin.jsx'
import {centersMe} from '../lib/centers-api.js'
import {DEF,useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
let root,host
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();
 useStore.setState({user:{id:'root',admin:true},config:{centers:{enabled:true}},S:{...structuredClone(DEF),trainingPlans:{p:{name:'Strength'}},routines:[{id:'r',name:'Push',planId:'p',ex:[{id:'0025'}]}]}});
 useCenters.setState({ownerUid:'root',status:'ready',platformCapabilities:['centers.manage'],centers:[]});
 centersMe.mockResolvedValue({platformCapabilities:['centers.manage']});host=document.createElement('div');document.body.append(host);root=createRoot(host)
});
afterEach(()=>{act(()=>root.unmount());host.remove()});
const mount=async(path='/training-admin')=>act(async()=>root.render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/home" element={<div>Home screen</div>}/><Route path="/training-admin" element={<TrainingAdmin/>}/><Route path="/training-admin/r/:id" element={<TrainingAdmin edit/>}/></Routes></MemoryRouter>));
const click=async name=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===name).click());
it('verifies server capability before showing the management library and separates each panel',async()=>{
 await mount();expect(centersMe).toHaveBeenCalledOnce();expect(host.textContent).toContain('Library true /training-admin');expect(host.textContent).not.toContain('Panel assign');
 await click('Assign selected plan');expect(host.textContent).toContain('Panel assign Strength');expect(host.textContent).not.toContain('Library true');
 await click('Sent proposals');expect(host.textContent).toContain('Panel proposals');expect(host.textContent).not.toContain('Panel assign');
 await click('Pending activations');expect(host.textContent).toContain('Panel accounts');
});
it.each(['/training-admin','/training-admin/r/r'])('rejects direct access for technical admin without server platform capability: %s',async path=>{
 centersMe.mockResolvedValue({platformCapabilities:[]});await mount(path);expect(host.textContent).toContain('Home screen');expect(host.textContent).not.toContain('Library');expect(host.textContent).not.toContain('Routine editor');
});
it('guards the reused routine editor with the same superadmin gate',async()=>{await mount('/training-admin/r/r');expect(host.textContent).toContain('Routine editor /training-admin')});
it('does not request administration data for anonymous or unknown configuration',async()=>{
 useStore.setState({config:null});await mount();expect(centersMe).not.toHaveBeenCalled();expect(host.textContent).not.toContain('Library');
 await act(async()=>useStore.setState({user:null}));expect(host.textContent).toContain('Home screen');
});
it('does not apply authorization belonging to an account that signed out while the request was pending',async()=>{
 let resolve;centersMe.mockImplementation(()=>new Promise(r=>{resolve=r}));await mount();expect(host.textContent).not.toContain('Library');await act(async()=>{useStore.setState({user:null});resolve({platformCapabilities:['centers.manage']})});expect(host.textContent).toContain('Home screen');expect(host.textContent).not.toContain('Library');
});

it('fails closed on a server authorization error and offers retry',async()=>{
 centersMe.mockRejectedValue({status:503});await mount();expect(host.textContent).toContain('Centers are unavailable. Try again.');expect(host.textContent).not.toContain('Library');expect(host.textContent).toContain('Reload centers');
});
