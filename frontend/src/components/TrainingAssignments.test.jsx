// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../views/centers/TrainingProposals.jsx',()=>({default:()=>null}))
vi.mock('../lib/centers-api.js',()=>({platformCenters:vi.fn(),centerMembers:vi.fn(),centerMember:vi.fn(),centerCommand:vi.fn(),trainingErrorKey:()=> 'Error'}))
vi.mock('./ui.jsx',()=>({
 Section:({children})=><section>{children}</section>,
 Row:({title,value,onClick,disabled})=><button disabled={disabled} onClick={onClick}>{title} {value}</button>,
 Button:({children,onClick,disabled})=><button disabled={disabled} onClick={onClick}>{children}</button>,
 SelectRow:({title,value,options,onChange})=><select aria-label={title} value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>,
 MultiSelectRow:({title,options,values,onToggle})=><fieldset aria-label={title}>{options.map(o=><button key={o.value} aria-pressed={values.includes(o.value)} onClick={()=>onToggle(o.value)}>{o.label}</button>)}</fieldset>,
 SearchField:()=>null
}))
import {DEF,useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {platformCenters,centerMembers,centerMember,centerCommand} from '../lib/centers-api.js'
import TrainingAssignments from './TrainingAssignments.jsx'
let host,root
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.resetAllMocks();
 useStore.setState({user:{id:'super'},S:{...structuredClone(DEF),routines:[{id:'r',name:'Push',ex:[{id:'0025',sets:3,reps:12,repsMin:8}]}]}});
 useCenters.setState({ownerUid:'super',platformCapabilities:['centers.manage'],centers:[]});
 platformCenters.mockResolvedValue({centers:[{id:'c',name:'Gym'}]});centerMembers.mockResolvedValue({members:[{id:'a',name:'Alice',memberNumber:'M1',state:'active',accountLinked:true},{id:'b',name:'Bob',memberNumber:'M2',state:'active',accountLinked:true},{id:'inactive',name:'Inactive',state:'pending'}]});
 centerMember.mockImplementation(async(c,id)=>({member:{id,version:id==='a'?3:7}}));centerCommand.mockResolvedValue({});
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()});
const render=async()=>{await act(async()=>root.render(<TrainingAssignments routineIds={['r']} planName="Strength"/>));await act(async()=>vi.advanceTimersByTimeAsync(1))};
const click=async text=>act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent.startsWith(text)).click();await vi.advanceTimersByTimeAsync(1)});
it('assigns selected routines to multiple eligible members using each current version, and retries only failures',async()=>{
 await render();expect(host.querySelector('fieldset[aria-label="Members"]').textContent).not.toContain('Inactive');await click('Alice');await click('Bob');
 centerCommand.mockImplementationOnce(async()=>({})).mockRejectedValueOnce({status:409});await click('Propose routines');
 expect(centerCommand).toHaveBeenCalledTimes(2);expect(centerCommand.mock.calls[0][1]).toMatchObject({memberId:'a',memberVersion:3,bundle:{name:'Strength',routines:[{id:'r',ex:[{id:'0025',sets:3,reps:12,repsMin:8}]}]}});
 expect(centerCommand.mock.calls[1][1]).toMatchObject({memberId:'b',memberVersion:7});const retryID=centerCommand.mock.calls[1][1].requestId;
 await click('Propose routines');expect(centerCommand).toHaveBeenCalledTimes(3);expect(centerCommand.mock.calls[2][1]).toMatchObject({memberId:'b',requestId:retryID});
 expect(host.textContent).toContain('Each recipient must accept');
});
it('does not send a proposal if the account changes while loading the member version',async()=>{
 await render();await click('Alice');let resolve;centerMember.mockImplementation(()=>new Promise(r=>{resolve=r}));
 await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent==='Propose routines').click()});
 await act(async()=>{useStore.setState({user:{id:'other'}});resolve({member:{id:'a',version:3}})});expect(centerCommand).not.toHaveBeenCalled();
});
