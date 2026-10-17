// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../views/centers/Invitations.jsx',()=>({default:()=>null}))
vi.mock('../views/centers/TrainingProposals.jsx',()=>({default:()=>null}))
vi.mock('../lib/centers-api.js',()=>({platformCenters:vi.fn(),centerMembers:vi.fn(),centerMember:vi.fn(),centerCommand:vi.fn(),trainingErrorKey:()=> 'Error',centersErrorKey:()=> 'Error'}))
import {DEF,useStore} from '../store/useStore.js'
import {useUI} from '../store/useUI.js'
import {useCenters} from '../store/useCenters.js'
import {platformCenters,centerMembers} from '../lib/centers-api.js'
import TrainingAssignments from './TrainingAssignments.jsx'
let host,root
function Sheet(){const sheet=useUI(s=>s.sheets.at(-1));return sheet?sheet.render(()=>useUI.getState().closeSheet(sheet.id)):null}
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.resetAllMocks();useUI.setState({sheets:[]});
 useStore.setState({user:{id:'super'},S:{...structuredClone(DEF),routines:[{id:'r',name:'Push',ex:[{id:'0025',sets:3,reps:8}]}]}});
 useCenters.setState({ownerUid:'super',platformCapabilities:['centers.manage'],centers:[]});
 platformCenters.mockImplementation(async o=>({centers:o?.query?[{id:'remote',name:'Remote Gym'}]:[{id:'c',name:'First Gym'}],nextCursor:null}));centerMembers.mockResolvedValue({members:[]});
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()});
const flush=()=>act(async()=>vi.advanceTimersByTimeAsync(300));
const mount=async(mode='all')=>{await act(async()=>root.render(<><TrainingAssignments routineIds={['r']} mode={mode}/><Sheet/></>));await flush()};
const click=async label=>{await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent.startsWith(label)).click());await flush()};
const search=async value=>{await act(async()=>{const input=host.querySelector('input[aria-label="Search…"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))});await flush()};
it('searches the full server directory inside the sheet and selects a result not in the initial page',async()=>{
 await mount();await click('Centers');expect(host.querySelector('input[aria-label="Search…"]')).toBeTruthy();
 await search('Remote');expect(platformCenters).toHaveBeenLastCalledWith({query:'Remote'});await click('Remote Gym');expect(useUI.getState().sheets).toHaveLength(0);expect(centerMembers).toHaveBeenLastCalledWith('remote',{query:''});expect(host.textContent).toContain('Remote Gym');
});
it('staff search stays within authorized centers and never queries the platform directory',async()=>{
 useCenters.setState({platformCapabilities:[],centers:[{id:'allowed',name:'My Gym',capabilities:['training.assign']},{id:'denied',name:'Other Gym',capabilities:[]}]});
 await mount();await click('Centers');expect(host.textContent).toContain('My Gym');expect(host.textContent).not.toContain('Other Gym');await search('Other');expect(host.textContent).toContain('No centers available');expect(platformCenters).not.toHaveBeenCalled();
});
it('does not display a delayed search result after changing account',async()=>{
 await mount();await click('Centers');let resolve;platformCenters.mockImplementation(()=>new Promise(r=>{resolve=r}));await search('Delayed');
 await act(async()=>{useStore.setState({user:{id:'other'}});resolve({centers:[{id:'secret',name:'Delayed private result'}],nextCursor:null})});expect(host.textContent).not.toContain('Delayed private result');expect(host.querySelector('input[aria-label="Search…"]')).toBeNull();
});

it('keeps the member search focused and editable while requests are pending, and ignores stale results',async()=>{
 await mount();const input=host.querySelector('input[aria-label="Search members"]');input.focus();
 let resolveA,resolveAn;centerMembers.mockImplementation((center,{query})=>new Promise(resolve=>{if(query==='a')resolveA=resolve;else if(query==='an')resolveAn=resolve}));
 const type=async text=>{await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));input.setSelectionRange(text.length,text.length)})};
 await type('a');expect(input.disabled).toBe(false);expect(document.activeElement).toBe(input);await flush();
 expect(centerMembers).toHaveBeenLastCalledWith('c',{query:'a'});expect(input.disabled).toBe(false);expect(document.activeElement).toBe(input);
 await type('an');expect(input.disabled).toBe(false);expect(input.selectionStart).toBe(2);await flush();expect(centerMembers).toHaveBeenLastCalledWith('c',{query:'an'});
 await act(async()=>resolveAn({members:[{id:'an',name:'Antonio',number:'M-1',state:'active',accountLinked:false}]}));
 await act(async()=>resolveA({members:[{id:'a',name:'Alberto',number:'M-2',state:'active',accountLinked:false}]}));
 expect(host.textContent).toContain('Antonio');expect(host.textContent).not.toContain('Alberto');expect(input.value).toBe('an');expect(document.activeElement).toBe(input);expect(host.querySelector('input[aria-label="Search members"]')).toBe(input);
});

it.each(['assign','proposals','accounts'])('shows only the requested administration panel: %s',async mode=>{
 await mount(mode);const labels=[...host.querySelectorAll('.lrow-t')].map(el=>el.textContent);
 expect(labels.includes('Routines')).toBe(mode==='assign');
 expect(labels.includes('Training proposals')).toBe(mode==='proposals');
 expect(host.textContent.includes('Propose routines')).toBe(mode==='assign');
 expect(host.querySelector('.training-assignment-link')).toBeNull();
});
