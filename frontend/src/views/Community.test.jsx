// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../lib/i18n.js',()=>({t:key=>key,dateLocale:()=> 'en',exerciseNameFor:ex=>ex?.name||ex?.id||'',exerciseNameClass:()=>''}))
vi.mock('../sheets.jsx',()=>({confirmSheet:vi.fn()}))
vi.mock('../lib/community-api.js',()=>({communityRead:vi.fn(),communityCommand:vi.fn(),communityError:()=> 'Unavailable',badgeLabel:key=>key}))
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {communityRead,communityCommand} from '../lib/community-api.js'
import Community from './Community.jsx'
let host,root
const center={id:'c',name:'Fictional center'},meta={center,capabilities:['community.own'],today:'2026-10-19',unread:0,trainerName:null}
const threads=Array.from({length:5},(_,i)=>({id:'q'+i,title:'Question '+i,state:'pending',unread:0,version:1}))
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.clearAllMocks();useStore.setState({user:{id:'alice'},config:{centers:{enabled:true}},S:{workouts:[]}});useCenters.setState({ownerUid:'alice',status:'ready',centers:[center],platformCapabilities:[]});communityRead.mockImplementation(async(id,kind)=>kind==='meta'?meta:kind==='thread'?{thread:{id:'q',title:'Private thread',state:'closed',lastSeq:2,version:3,context:{}},items:[],nextCursor:null}:{items:threads,nextCursor:'next'});communityCommand.mockResolvedValue({id:'q'});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()})
const mount=async(url='/community?centerId=c')=>{await act(async()=>root.render(<MemoryRouter initialEntries={[url]}><Community/></MemoryRouter>));for(let i=0;i<3;i++)await act(async()=>vi.advanceTimersByTimeAsync(2))}
const click=async(text)=>{await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent===text)?.click()});await act(async()=>vi.advanceTimersByTimeAsync(260))}
it('member panels show five rows; search keeps focus and pagination uses the server cursor',async()=>{
 await mount();expect(host.textContent).toContain('My questions');expect(host.textContent).not.toContain('Member questions');expect(host.textContent).not.toContain('Community permissions');expect(host.querySelectorAll('.community-list-row')).toHaveLength(5);
 const field=host.querySelector('input[aria-label="Search…"]');field.focus();await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'bench');field.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>vi.advanceTimersByTimeAsync(260));expect(document.activeElement).toBe(field);expect(host.querySelector('input[aria-label="Search…"]')).toBe(field);expect(communityRead).toHaveBeenLastCalledWith('c','threads',expect.objectContaining({query:'bench',limit:5}));
 await click('View all');expect(communityRead).toHaveBeenLastCalledWith('c','threads',expect.objectContaining({limit:20}));await click('Show more');expect(communityRead).toHaveBeenLastCalledWith('c','threads',expect.objectContaining({limit:20,cursor:'next'}));
})
it('direct closed thread has no reply composer and reads require an explicit action',async()=>{await mount('/community?centerId=c&pane=own&id=q');expect(host.textContent).toContain('This conversation is closed. Reopen it to reply.');expect(host.querySelector('textarea')).toBeNull();expect(communityCommand).not.toHaveBeenCalled();await click('Mark as read');expect(communityCommand).toHaveBeenCalledWith('c','read',{id:'q',lastSeq:2},expect.any(String))})
it('delegated staff get only team panels; platform can administer explicit delegation',async()=>{communityRead.mockImplementation(async(id,kind)=>kind==='meta'?{...meta,capabilities:['community.respond','community.manage']}:{items:[],nextCursor:null});await mount('/community?centerId=c&pane=team');expect(host.textContent).toContain('Member questions');expect(host.textContent).not.toContain('My achievements');expect(host.textContent).not.toContain('Community permissions');await act(async()=>useCenters.setState({platformCapabilities:['centers.manage']}));expect(host.textContent).toContain('Community permissions')})
it('ignores delayed private results after account changes',async()=>{let resolve;communityRead.mockImplementation((id,kind)=>kind==='meta'?Promise.resolve(meta):new Promise(done=>resolve=done));await mount();await act(async()=>{useStore.setState({user:{id:'bob'}});useCenters.setState({ownerUid:'bob',centers:[]});resolve({items:[{...threads[0],title:'ALICE PRIVATE'}],nextCursor:null});await vi.advanceTimersByTimeAsync(2)});expect(host.textContent).not.toContain('ALICE PRIVATE')})
it('waits for pending configuration while preserving the direct context',async()=>{useStore.setState({config:null});await mount('/community?centerId=c&id=q');expect(communityRead).not.toHaveBeenCalled();expect(host.textContent).toContain('Community')})

it('requires synchronization and explicit workout context consent before creating a private question',async()=>{
 const syncNow=vi.fn().mockResolvedValue({status:'offline'});useStore.setState({syncNow,S:{unit:'kg',workouts:[{id:'saved',name:'Saved session',d:'2026-10-19',entries:[]}]}});
 await mount('/community?centerId=c&pane=own&new=1&workoutId=saved');
 await act(async()=>{const title=host.querySelector('input[maxlength="120"]'),body=host.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,'Context question');title.dispatchEvent(new Event('input',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(body,'Message');body.dispatchEvent(new Event('input',{bubbles:true}));host.querySelector('input[type=checkbox][required]').click()});
 const submit=()=>act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 await submit();expect(syncNow).toHaveBeenCalledTimes(1);expect(communityCommand).not.toHaveBeenCalled();
 syncNow.mockResolvedValue({status:'ok'});await submit();expect(communityCommand).toHaveBeenCalledWith('c','create',{title:'Context question',body:'Message',workoutId:'saved',includeLoads:false,contextConsent:true},expect.any(String));
})

it('recovers an old forbidden center URL to the sole authorized affiliation without carrying a foreign thread or clearing the center store',async()=>{
 communityRead.mockImplementation(async(id,kind)=>{if(id==='old')throw Object.assign(new Error('forbidden'),{status:403});return kind==='meta'?meta:{items:threads,nextCursor:null}});
 await mount('/community?centerId=old&pane=team&id=foreign-thread');for(let i=0;i<4;i++)await act(async()=>vi.advanceTimersByTimeAsync(2));
 expect(useCenters.getState().ownerUid).toBe('alice');expect(useCenters.getState().status).toBe('ready');expect(useCenters.getState().centers).toEqual([center]);expect(host.textContent).toContain('Fictional center');expect(host.textContent).toContain('My questions');expect(host.textContent).not.toContain('Unavailable');expect(communityRead.mock.calls.some(([id,kind])=>id==='c'&&kind==='thread')).toBe(false);
})
it('retains the error for a genuinely denied own center instead of redirecting or granting capabilities',async()=>{
 communityRead.mockRejectedValue(Object.assign(new Error('forbidden'),{status:403}));await mount();expect(host.textContent).toContain('Unavailable');expect(host.textContent).not.toContain('My questions');expect(useCenters.getState().centers).toEqual([center]);expect(communityRead).toHaveBeenCalledTimes(1);
})
it('offers a center picker after a denied old link when several authorized affiliations exist',async()=>{
 useCenters.setState({centers:[center,{id:'other',name:'Second center'}]});communityRead.mockRejectedValue(Object.assign(new Error('forbidden'),{status:403}));await mount('/community?centerId=old');expect(host.textContent).toContain('Unavailable');expect([...host.querySelectorAll('button')].some(b=>b.textContent.includes('Center'))).toBe(true);expect(useCenters.getState().centers).toHaveLength(2);expect(communityRead).toHaveBeenCalledTimes(1);
})
