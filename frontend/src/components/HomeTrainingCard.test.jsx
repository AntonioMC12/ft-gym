// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('react-router-dom',()=>({useNavigate:()=>navigate}))
vi.mock('../lib/sha256.js',async load=>{const actual=await load();return {...actual,sha256Hex:async bytes=>actual.sha256HexJs(bytes)}})
vi.mock('../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../lib/centers-api.js',()=>({centerTraining:vi.fn(),trainingErrorKey:()=> 'Unavailable'}))
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {centerTraining} from '../lib/centers-api.js'
import HomeTrainingCard from './HomeTrainingCard.jsx'
const navigate=vi.fn(),center={id:'c',name:'Gym',capabilities:['membership.own.read']}
const offer={id:'p',versionId:'v',state:'offered',proposalState:'offered',acceptedAt:null,deliveryResult:null}
let host,root
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.clearAllMocks();localStorage.clear();
 useStore.setState({user:{id:'alice'},config:{centers:{enabled:true}}});useCenters.setState({ownerUid:'alice',status:'ready',centers:[center],platformCapabilities:[]});
 centerTraining.mockResolvedValue({proposals:[offer],nextCursor:null});host=document.createElement('div');document.body.append(host);root=createRoot(host)
})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()})
const mount=()=>act(async()=>{root.render(<HomeTrainingCard/>);await vi.advanceTimersByTimeAsync(1)})
const open=()=>act(async()=>host.querySelector('button.lrow').click())
const remount=async()=>{act(()=>root.unmount());root=createRoot(host);await mount()}
it('highlights pending proposals and opens the own training pane without accepting anything',async()=>{
 await mount();expect(centerTraining).toHaveBeenCalledWith('c',{limit:50},true);expect(host.textContent).toContain('Pending acceptance');expect(host.querySelector('.has-updates')).not.toBeNull();await open();expect(navigate).toHaveBeenCalledWith('/centers/membership?pane=training&centerId=c&proposalId=p&versionId=v');expect(localStorage.getItem('gym_training_review_alice')).toMatch(/^[a-f0-9]{64}$/);
})
it('marks changed states and clears the update after review, but pending remains highlighted',async()=>{
 await mount();await open();await remount();expect(host.querySelector('.has-updates')).not.toBeNull();
 centerTraining.mockResolvedValue({proposals:[{...offer,acceptedAt:'2026-10-19T12:00:00Z',deliveryResult:'applied'}],nextCursor:null});
 await act(async()=>{window.dispatchEvent(new Event('focus'));await vi.advanceTimersByTimeAsync(1)});expect(host.textContent).toContain('Status changed');await open();expect(host.querySelector('.has-updates')).toBeNull();await remount();expect(host.querySelector('.has-updates')).toBeNull();
})
it('includes every page and linked center, and opens a pending proposal directly even across centers',async()=>{
 useCenters.setState({centers:[center,{...center,id:'d'}]});centerTraining.mockResolvedValueOnce({proposals:[],nextCursor:'next'}).mockResolvedValueOnce({proposals:[offer],nextCursor:null}).mockResolvedValueOnce({proposals:[{...offer,id:'other'}],nextCursor:null});await mount();expect(centerTraining).toHaveBeenCalledWith('c',{limit:50,cursor:'next'},true);expect(centerTraining).toHaveBeenCalledWith('d',{limit:50},true);expect(host.textContent).toContain('Pending acceptance · 2');await open();expect(navigate).toHaveBeenCalledWith('/centers/membership?pane=training&centerId=c&proposalId=p&versionId=v');
})
it('hides private results after account changes and ignores delayed responses',async()=>{
 let finish;centerTraining.mockReturnValue(new Promise(resolve=>finish=resolve));await mount();await act(async()=>{useStore.setState({user:{id:'bob'}});finish({proposals:[offer],nextCursor:null})});expect(host.textContent).toBe('');
})
it('does not query without owned membership permissions or known enabled config',async()=>{
 useStore.setState({config:null});await mount();expect(centerTraining).not.toHaveBeenCalled();useStore.setState({config:{centers:{enabled:true}}});useCenters.setState({centers:[{...center,capabilities:['training.assign']}]});await mount();expect(centerTraining).not.toHaveBeenCalled();expect(host.textContent).toBe('');
})
it('shows failures instead of claiming there are no proposals and allows a retry',async()=>{
 centerTraining.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({proposals:[],nextCursor:null});await mount();expect(host.textContent).toContain('Unavailable');expect(host.textContent).not.toContain('No training proposals');await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent==='Retry').click();await vi.advanceTimersByTimeAsync(1)});expect(host.textContent).toContain('No training proposals');
})

it('keeps accepted but undelivered proposals highlighted so delivery can be retried',async()=>{
 centerTraining.mockResolvedValue({proposals:[{...offer,acceptedAt:'2026-10-19T12:00:00Z'}],nextCursor:null});await mount();await open();await remount();expect(host.textContent).toContain('Retry delivery');expect(host.querySelector('.has-updates')).not.toBeNull();
})

it('does not advertise retry delivery for a fully retired assignment',async()=>{
 centerTraining.mockResolvedValue({proposals:[{...offer,acceptedAt:'2026-10-19T12:00:00Z',routineCount:1,retirements:[{routineId:'cr_retired',reason:'platform'}]}],nextCursor:null});await mount();expect(host.textContent).not.toContain('Retry delivery');expect(host.textContent).not.toContain('Pending acceptance')
})
