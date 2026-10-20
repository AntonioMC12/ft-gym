// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../views/centers/Activations.jsx',()=>({default:()=>null}))
vi.mock('../views/centers/Invitations.jsx',()=>({default:()=>null}))
vi.mock('../views/centers/TrainingProposals.jsx',()=>({default:({member})=><div data-proposals-member={member.id}>{member.name}</div>}))
vi.mock('../lib/centers-api.js',()=>({platformCenters:vi.fn(),centerMembers:vi.fn(),centerMember:vi.fn(),centerCommand:vi.fn(),trainingErrorKey:()=> 'Error',centersErrorKey:()=> 'Error'}))
import {DEF,useStore} from '../store/useStore.js'
import {useUI} from '../store/useUI.js'
import {useCenters} from '../store/useCenters.js'
import {platformCenters,centerMembers,centerMember,centerCommand} from '../lib/centers-api.js'
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

it.each(['assign','proposals'])('keeps the member search focused and editable while requests are pending, and ignores stale results: %s',async mode=>{
 await mount(mode);const input=host.querySelector('input[aria-label="Search members"]');input.focus();
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
 expect(labels.includes('Training proposals')).toBe(false);
 expect(!!host.querySelector('.training-recipient-picker')).toBe(mode!=='accounts');
 expect(host.textContent.includes('Send plan')).toBe(mode==='assign');
 expect(host.querySelector('.training-assignment-link')).toBeNull();
});

it('shows five members immediately and expands the full list with server pagination',async()=>{
 const rows=Array.from({length:7},(_,i)=>({id:'m'+i,name:'Member '+i,number:'M'+i,state:'active',accountLinked:true}));
 centerMembers.mockResolvedValueOnce({members:rows,nextCursor:'page2'}).mockResolvedValueOnce({members:[{id:'m7',name:'Member 7',state:'active',accountLinked:true}],nextCursor:null});
 await mount('assign');expect(host.querySelectorAll('.training-recipient')).toHaveLength(5);expect(host.querySelector('.training-recipient-list').textContent).not.toContain('Member 5');
 await click('View all members');expect(host.querySelectorAll('.training-recipient')).toHaveLength(7);
 await click('Show more');expect(centerMembers).toHaveBeenLastCalledWith('c',{query:'',cursor:'page2'});expect(host.querySelectorAll('.training-recipient')).toHaveLength(8);
 await act(async()=>host.querySelector('[data-member-id="m7"] button').click());expect(host.querySelector('[data-member-id="m7"] button').getAttribute('aria-pressed')).toBe('true');
 await click('Show less');expect(host.querySelectorAll('.training-recipient')).toHaveLength(5);expect(host.querySelector('.training-recipient-selection').textContent).toContain('Member 7');
})
it('keeps multiple recipients across searches and submits the current routines to every selected member',async()=>{
 const a={id:'a',name:'Alice',number:'M1',state:'active',accountLinked:true},b={id:'b',name:'Bob',number:'M2',state:'active',accountLinked:true};
 centerMembers.mockImplementation(async(c,{query})=>({members:query?[b]:[a],nextCursor:null}));centerMember.mockResolvedValue({member:{version:3}});centerCommand.mockResolvedValue({});
 await mount('assign');await act(async()=>host.querySelector('[data-member-id="a"] button').click());
 const input=host.querySelector('input[aria-label="Search members"]');input.focus();
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Bob');input.dispatchEvent(new Event('input',{bubbles:true}))});await flush();
 expect(document.activeElement).toBe(input);expect(host.querySelector('.training-recipient-selection').textContent).toContain('Alice');
 await act(async()=>host.querySelector('[data-member-id="b"] button').click());expect(host.querySelector('.training-recipient-selection').textContent).toContain('Bob');
 await click('Send plan');expect(centerCommand.mock.calls.map(call=>call[1].memberId)).toEqual(['a','b']);expect(centerCommand.mock.calls.every(call=>call[1].bundle.routines[0].id==='r')).toBe(true);expect(host.querySelector('.training-recipient-selection')).toBeNull();
})

it('sent proposals shows five members directly, paginates, and opens exactly the selected member history',async()=>{
 const rows=Array.from({length:7},(_,i)=>({id:'m'+i,name:'Member '+i,number:'M'+i,state:i===0?'ended':'active',accountLinked:i!==0}));
 centerMembers.mockResolvedValueOnce({members:rows,nextCursor:'next'}).mockResolvedValueOnce({members:[{id:'m7',name:'Member 7',number:'M7'}],nextCursor:null});
 centerMember.mockImplementation(async(c,id)=>({member:rows.find(m=>m.id===id)||{id,name:'Member 7',number:'M7'}}));
 await mount('proposals');expect(host.querySelectorAll('.training-recipient')).toHaveLength(5);expect(host.querySelector('[data-proposals-member]')).toBeNull();expect(host.querySelector('[data-member-id="m0"] button').disabled).toBe(false);
 await act(async()=>host.querySelector('[data-member-id="m0"] button').click());expect(host.querySelector('[data-proposals-member]').dataset.proposalsMember).toBe('m0');
 await click('View all members');await click('Show more');expect(centerMembers).toHaveBeenLastCalledWith('c',{query:'',cursor:'next'});expect(host.querySelectorAll('.training-recipient')).toHaveLength(8);
 await act(async()=>host.querySelector('[data-member-id="m7"] button').click());expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);expect(host.querySelector('[data-proposals-member]').dataset.proposalsMember).toBe('m7');expect(centerCommand).not.toHaveBeenCalled();
 await act(async()=>host.querySelector('.training-recipient-selection button').click());expect(host.querySelector('[data-proposals-member]')).toBeNull();
})
it('sent proposals filters the visible list while keeping the current member history until another result is selected',async()=>{
 const a={id:'a',name:'Alice',number:'M1'},b={id:'b',name:'Bob',number:'M2'};
 centerMembers.mockImplementation(async(c,{query})=>({members:query?[b]:[a],nextCursor:null}));centerMember.mockImplementation(async(c,id)=>({member:id==='a'?a:b}));
 await mount('proposals');await act(async()=>host.querySelector('[data-member-id="a"] button').click());
 const input=host.querySelector('input[aria-label="Search members"]');input.focus();await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Bob');input.dispatchEvent(new Event('input',{bubbles:true}))});await flush();
 expect(document.activeElement).toBe(input);expect(host.querySelector('[data-member-id="b"]')).not.toBeNull();expect(host.querySelector('[data-proposals-member]').dataset.proposalsMember).toBe('a');
 await act(async()=>host.querySelector('[data-member-id="b"] button').click());expect(host.querySelector('[data-proposals-member]').dataset.proposalsMember).toBe('b');expect(host.querySelectorAll('[data-proposals-member]')).toHaveLength(1);expect(host.querySelector('input[aria-label="Search members"]')).toBe(input);
})
