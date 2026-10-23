// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
const mock=vi.hoisted(()=>({state:null,centers:null,api:vi.fn()}))
vi.mock('../lib/api.js',()=>({api:mock.api}))
vi.mock('../store/useStore.js',()=>({useStore:Object.assign(selector=>selector(mock.state),{getState:()=>mock.state})}))
vi.mock('../store/useCenters.js',()=>({useCenters:()=>mock.centers}))
import AssignmentLifecycle from './AssignmentLifecycle.jsx'
const id='cr_'+'a'.repeat(32)
let root,host
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();vi.useFakeTimers();
 mock.state={user:{id:'alice'},ready:true,sync:{server:''},S:{routines:[{id,ex:[]}],workouts:[{id:'past'}],active:{id:'current'},week:{1:[id]}},pushState:vi.fn().mockResolvedValue(),update:vi.fn(fn=>fn(mock.state.S))}
 mock.centers={ownerUid:'alice',status:'ready',centers:[{id:'center',capabilities:['membership.own.read']}]}
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()})
const mount=()=>act(async()=>{root.render(<AssignmentLifecycle/>);await Promise.resolve()})
it('applies only server retirements after syncing and preserves history and active session',async()=>{
 mock.api.mockResolvedValue({retirements:[{id,at:1}]});await mount();expect(mock.state.pushState).toHaveBeenCalled();expect(mock.api).toHaveBeenCalledWith('/api/centers/own/training/lifecycle',{method:'POST',body:JSON.stringify({centerId:'center'})});expect(mock.state.S.routines).toEqual([]);expect(mock.state.S.workouts).toEqual([{id:'past'}]);expect(mock.state.S.active).toEqual({id:'current'});
})
it('connection failure keeps local routines and retries later',async()=>{
 mock.api.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({retirements:[{id,at:1}]});await mount();expect(mock.state.S.routines).toHaveLength(1);await act(async()=>vi.advanceTimersByTimeAsync(15000));expect(mock.state.S.routines).toEqual([])
})
it('late response after switching account cannot modify the new personal state',async()=>{
 let finish;mock.api.mockImplementation(()=>new Promise(resolve=>finish=resolve));await mount();
 mock.state.user={id:'bob'};mock.state.S={routines:[{id,ex:[]}],week:{},workouts:[]};await act(async()=>finish({retirements:[{id,at:1}]}));expect(mock.state.S.routines).toHaveLength(1);expect(mock.state.update).not.toHaveBeenCalled()
})
