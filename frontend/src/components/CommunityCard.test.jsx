// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('react-router-dom',()=>({useNavigate:()=>navigate}))
vi.mock('../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../lib/community-api.js',()=>({communitySummary:vi.fn(),communityError:()=> 'Unavailable'}))
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {communitySummary} from '../lib/community-api.js'
import CommunityCard from './CommunityCard.jsx'
const navigate=vi.fn();let host,root
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.clearAllMocks();useStore.setState({user:{id:'alice'},config:{centers:{enabled:true}}});useCenters.setState({ownerUid:'alice',status:'ready',centers:[]});communitySummary.mockResolvedValue({available:true,total:3,target:{id:'c',name:'Gym'}});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()})
const mount=()=>act(async()=>{root.render(<CommunityCard/>);await vi.advanceTimersByTimeAsync(1)})
it('opens the center directly, highlights unread and never persists community in personal storage',async()=>{const before=localStorage.getItem('gym_state_v1');await mount();expect(host.textContent).toContain('Unread updates · 3');expect(host.querySelector('.has-updates')).not.toBeNull();await act(async()=>host.querySelector('button.lrow').click());expect(navigate).toHaveBeenCalledWith('/community?centerId=c');expect(localStorage.getItem('gym_state_v1')).toBe(before)})
it('waits for known configuration and ignores responses from a former account',async()=>{useStore.setState({config:null});await mount();expect(communitySummary).not.toHaveBeenCalled();let finish;communitySummary.mockReturnValue(new Promise(resolve=>finish=resolve));await act(async()=>useStore.setState({config:{centers:{enabled:true}}}));await act(async()=>{useStore.setState({user:{id:'bob'}});finish({available:true,total:99,target:{id:'private'}})});expect(host.textContent).toBe('')})
it('polls once per minute while visible and cleans up after unmount',async()=>{await mount();await act(async()=>vi.advanceTimersByTimeAsync(60000));expect(communitySummary).toHaveBeenCalledTimes(2);act(()=>root.unmount());root=createRoot(host);await act(async()=>vi.advanceTimersByTimeAsync(60000));expect(communitySummary).toHaveBeenCalledTimes(2)})
