// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../lib/i18n.js',()=>({t:(key,...args)=>key.replace(/\{(\d+)\}/g,(_,i)=>args[i])}))
vi.mock('../views/centers/TrainingProposals.jsx',()=>({default:()=> <div>Proposal history</div>}))
vi.mock('../lib/centers-api.js',()=>({centerTrainingMembers:vi.fn(),centerAssignedProgress:vi.fn(),trainingErrorKey:()=> 'Error',progressErrorKey:()=> 'Error'}))
import {centerTrainingMembers,centerAssignedProgress} from '../lib/centers-api.js'
import {useStore} from '../store/useStore.js'
import TrainingRoster from './TrainingRoster.jsx'
let host,root
const member={id:'m',name:'Alice',number:'M-1',plans:2}
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();useStore.setState({user:{id:'super'}});centerTrainingMembers.mockResolvedValue({members:[member],nextCursor:null});centerAssignedProgress.mockResolvedValue({shared:true,report:{period:{from:'2026-10-01',to:'2026-10-20'},routines:[{name:'Push',sessions:3,days:2,lastSessionOn:'2026-10-19',weeks:[{from:'2026-10-12',sessions:3}]}]}});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()})
const render=async()=>{await act(async()=>root.render(<TrainingRoster centerId="c" ownerUid="super"/>));await act(async()=>vi.advanceTimersByTimeAsync(1))}
const open=async()=>act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent.includes('Alice')).click()})
it('shows only server-filtered members and opens their assigned-routine evolution',async()=>{
 await render();expect(centerTrainingMembers).toHaveBeenCalledWith('c',{query:''});await open();expect(centerAssignedProgress).toHaveBeenCalledWith('c','m');expect(host.textContent).toContain('Push');expect(host.textContent).toContain('2026-10-19');expect(host.querySelectorAll('.training-trend-column')).toHaveLength(4);expect(host.querySelectorAll('.has-sessions')).toHaveLength(1);expect(host.textContent).not.toContain('Proposal history');await act(async()=>{const details=host.querySelector('.training-roster-proposals');details.open=true;details.dispatchEvent(new Event('toggle'))});expect(host.textContent).toContain('Proposal history')
})
it('does not invent activity when no report is available',async()=>{
 centerAssignedProgress.mockResolvedValue({shared:false});await render();await open();expect(host.textContent).toContain('Training data is unavailable.');expect(host.querySelector('.training-trend-chart')).toBeNull()
})
it('searches on the server and renders an informative empty state',async()=>{
 await render();centerTrainingMembers.mockResolvedValue({members:[],nextCursor:null});const input=host.querySelector('input');await act(async()=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'Nobody');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))});await act(async()=>vi.advanceTimersByTimeAsync(300));expect(host.textContent).toContain('No members match this search.')
})
it('ignores a report arriving after the signed-in account changed',async()=>{
 let resolve;centerAssignedProgress.mockImplementation(()=>new Promise(r=>{resolve=r}));await render();await open();await act(async()=>{useStore.setState({user:{id:'other'}});resolve({shared:true,report:{period:{from:'2026-10-01',to:'2026-10-20'},routines:[{name:'PRIVATE LATE'}]}})});expect(host.textContent).not.toContain('PRIVATE LATE')
})

it('keeps deleted routines and their saved activity in a closed archive section',async()=>{
 centerAssignedProgress.mockResolvedValue({shared:true,report:{period:{from:'2026-10-01',to:'2026-10-20'},routines:[{name:null,sessions:4,days:3,lastSessionOn:'2026-10-18',weeks:[]},{name:'Active plan',sessions:1,days:1,lastSessionOn:'2026-10-19',weeks:[]}]}})
 await render();await open();const archive=host.querySelector('.training-roster-archives');expect(archive).not.toBeNull();expect(archive.open).toBe(false);expect(archive.querySelector('summary').textContent).toContain('Archived routines · 1');expect(archive.textContent).toContain('Saved sessions · 4');expect(archive.textContent).not.toContain('Active plan');expect(host.querySelectorAll('.training-routine-trend')).toHaveLength(2);await act(async()=>{archive.open=true});expect(archive.open).toBe(true)
})
it('does not show an empty archive section',async()=>{await render();await open();expect(host.querySelector('.training-roster-archives')).toBeNull()})
